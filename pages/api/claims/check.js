// pages/api/claims/check.js
//
// POST { endpoint: <ERP GraphQL URL>, claim: "HR-EXP-2026-00016" }
//      Authorization: Bearer <the user's Firebase ID token>
//      x-erp-token:   <the user's ERP token>
//
// Checks every bill on an Expense Claim with verify-doc and saves the result
// on the claim: each row's amount / date / vendor read off its bill, its AI
// score and reason; the claim's score (money-weighted over its rows) and
// summary. The ERP turns the score into Low / Medium / High risk ("Expense
// Claim AI Guard"), and "Expense Claim Route" uses it after the reporting
// officer approves: 90+ is verified without a person.
//
// Who does what:
//   - the claim is READ with the user's own token, so only someone who may
//     see the claim can have it checked;
//   - verify-doc is called AS THE USER (their Firebase + ERP tokens) and
//     fetches each bill from the ERP with the user's token;
//   - the result is WRITTEN with the AI checker login (ERP_AI_CHECKER_TOKEN),
//     the only login the AI Guard lets write scores -- so nobody can score
//     their own claim by writing the fields directly.
//
// Not switched on (no checker login or no Gemini key yet) -> { skipped }.

import { allowedErpHosts } from "../../../lib/erpServer";

const VERIFY_URL = (process.env.VERIFY_DOC_URL || "https://verify-doc--elbrit-sso-d01d9.asia-southeast1.hosted.app").replace(/\/+$/, "");
const NO_SCORE_TYPES = ["Advance"];
const tokenHeader = (t) => (/^(token|bearer)\s/i.test(t) ? t : `token ${t}`);
const flt = (v) => Number(v) || 0;
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

async function erp(origin, token, path, init = {}) {
  const res = await fetch(origin + path, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: tokenHeader(token), ...(init.headers || {}) },
    redirect: "manual",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = json.exception || json.exc_type || `HTTP ${res.status}`;
    try {
      msg = JSON.parse(JSON.parse(json._server_messages)[0]).message || msg;
    } catch {
      /* keep msg */
    }
    const err = new Error(String(msg).replace(/<[^>]*>/g, ""));
    err.status = res.status;
    throw err;
  }
  return json;
}

function rowRequest(row, origin, userErpToken) {
  const kind = [row.expense_type, row.custom_sub_type].filter(Boolean).join(" / ");
  return {
    documents: [{ url: origin + row.custom_bill, headers: { Authorization: tokenHeader(userErpToken) } }],
    context: `Employee expense claim in India, amounts in INR. Expense: ${kind}.${row.description ? " Employee's note: " + String(row.description).replace(/<[^>]*>/g, " ").slice(0, 200) : ""}`,
    fields: {
      amount: { type: "number", expected: flt(row.amount), weight: 70, tolerance: "2%", description: "the final total paid on the bill" },
      date: { type: "date", expected: row.expense_date, weight: 15, toleranceDays: 3, description: "the bill or transaction date" },
      category: { type: "text", expected: kind, match: "meaning", weight: 15, description: "what the bill is for (fuel, toll, food, cab, rent…)" },
      vendor: { type: "text", description: "the shop, company or person who issued the bill" },
    },
    rules: ["It must be a bill, receipt, ticket or invoice -- not a selfie, a blank page or an unrelated photo"],
    bands: { low: 90, medium: 70 },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const idToken = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "")?.[1];
  const userErp = String(req.headers["x-erp-token"] || "").trim();
  const claimName = String(req.body?.claim || "").trim();
  let origin;
  try {
    const url = new URL(String(req.body?.endpoint || ""));
    if (!allowedErpHosts().has(url.host.toLowerCase())) throw new Error("host");
    origin = url.origin;
  } catch {
    return res.status(400).json({ error: "That ERP is not one this app talks to." });
  }
  if (!idToken || !userErp) return res.status(401).json({ error: "Sign in again to check bills." });
  if (!/^[\w.\-]+$/.test(claimName)) return res.status(400).json({ error: "Which claim?" });

  const checker = process.env.ERP_AI_CHECKER_TOKEN;
  if (!checker) return res.status(200).json({ skipped: true, reason: "The AI bill check is not switched on yet." });

  const path = `/api/resource/Expense%20Claim/${encodeURIComponent(claimName)}`;
  let claim;
  try {
    claim = (await erp(origin, userErp, path)).data; // the user must be able to see it
  } catch (e) {
    return res.status(e.status === 403 || e.status === 404 ? 403 : 502).json({ error: e.status === 403 || e.status === 404 ? "You cannot see that claim." : `The ERP could not be read: ${e.message}` });
  }

  // One verify-doc call per bill, in parallel.
  const rows = claim.expenses || [];
  const scored = await Promise.all(
    rows.map(async (row) => {
      if (NO_SCORE_TYPES.includes(row.expense_type)) return { row, skip: true };
      if (!row.custom_bill) return { row, score: 0, reason: "No bill attached to this row." };
      try {
        const r = await fetch(`${VERIFY_URL}/v1/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}`, "X-ERP-Token": tokenHeader(userErp) },
          body: JSON.stringify(rowRequest(row, origin, userErp)),
          signal: AbortSignal.timeout(100000),
        });
        const out = await r.json().catch(() => ({}));
        if (r.status === 503) return { row, unavailable: out.error || "verify-doc is not ready" };
        if (!r.ok) return { row, failed: out.error || `verify-doc answered HTTP ${r.status}` };
        const f = out.fields || {};
        const reasons = ["amount", "date", "category"].filter((k) => f[k] && f[k].ok === false).map((k) => f[k].reason);
        const failedRule = (out.rules || []).find((x) => x.pass === false);
        if (failedRule) reasons.push(failedRule.reason);
        return {
          row,
          score: out.score ?? 0,
          reason: reasons.length ? reasons.join("; ") : "Bill matches the claim.",
          amount: f.amount?.found ?? null,
          date: typeof f.date?.found === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.date.found) ? f.date.found : null,
          vendor: f.vendor?.found ? String(f.vendor.found).slice(0, 140) : null,
        };
      } catch (e) {
        return { row, failed: e.name === "TimeoutError" ? "the check took too long" : e.message };
      }
    }),
  );

  const down = scored.find((s) => s.unavailable);
  if (down) return res.status(200).json({ skipped: true, reason: `The AI bill check is not available: ${down.unavailable}` });
  const failed = scored.filter((s) => s.failed);
  if (failed.length) return res.status(502).json({ error: `Bills could not be checked: ${failed[0].failed}` });

  const counted = scored.filter((s) => !s.skip);
  if (!counted.length) return res.status(200).json({ skipped: true, reason: "Advance requests have no bills to check." });
  const money = counted.reduce((s, x) => s + flt(x.row.amount), 0) || 1;
  const claimScore = Math.round(counted.reduce((s, x) => s + x.score * flt(x.row.amount), 0) / money);
  const issues = counted.filter((x) => x.score < 90).map((x) => `Row ${x.row.idx} (${x.row.expense_type}, ${inr(flt(x.row.amount))}): ${x.reason}`);
  const summary = (issues.length ? `${counted.length - issues.length} of ${counted.length} bills match. ${issues.join(" | ")}` : `All ${counted.length} bills match the claim.`).slice(0, 1000);

  // Write with the checker login: re-read the claim as the checker and merge,
  // so the save carries every row in full (a partial child list would drop
  // the rows' other fields).
  try {
    const doc = (await erp(origin, checker, path)).data;
    if (doc.modified !== claim.modified) return res.status(409).json({ error: "The claim changed while its bills were being checked. Try again." });
    const byName = new Map(counted.map((x) => [x.row.name, x]));
    doc.expenses = (doc.expenses || []).map((r) => {
      const x = byName.get(r.name);
      if (!x) return r;
      return {
        ...r,
        custom_bill_amount: x.amount,
        custom_bill_date: x.date,
        custom_bill_vendor: x.vendor,
        custom_ai_score: x.score,
        custom_ai_reason: x.reason.slice(0, 500),
      };
    });
    doc.custom_ai_score = claimScore;
    doc.custom_ai_summary = summary;
    const saved = (await erp(origin, checker, path, { method: "PUT", body: JSON.stringify(doc) })).data;
    return res.status(200).json({
      score: saved.custom_ai_score,
      risk: saved.custom_ai_risk || null,
      summary: saved.custom_ai_summary,
      rows: counted.map((x) => ({ name: x.row.name, idx: x.row.idx, score: x.score, reason: x.reason, amount: x.amount, date: x.date, vendor: x.vendor })),
      modified: saved.modified,
    });
  } catch (e) {
    console.error("Claim check: could not save the score", claimName, e.message);
    return res.status(502).json({ error: `The check ran but its result could not be saved: ${e.message}` });
  }
}
