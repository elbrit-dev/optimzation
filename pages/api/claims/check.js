// pages/api/claims/check.js
//
// POST { endpoint: <ERP GraphQL URL>, claim: "HR-EXP-2026-00016", rows: [...],
//        reads: { <row name>: { read, sig } } }
//      x-erp-token: <the user's ERP token>
//
// The bill check, in plain code (5 Nov 2026) -- no AI runs here. The AI ran
// once, when the bill was attached (/api/claims/read-bill: toMarkdown, then
// Clairic and Clef Flash), and its read came back signed by this server. Here
// each bill's signed read is compared with what the person submitted on the
// row (lib/billReader.js compareBill): total, date and bill type must match,
// each read with confidence 0.9 or more. All three -> score 100, else 40 with
// the reasons. The ERP decides from the score ("Expense Running Guard": 90+
// Verified, anything above Rs 50,000 still to Accounts; else In Review + a
// Task). The read itself is kept on the row (custom_bill_meta).
//
// Who does what:
//   - the claim is READ with the user's own token, so only someone who may
//     see the claim can have it checked;
//   - a read is trusted only with this server's signature, so nobody can
//     hand in made-up AI values;
//   - the result is WRITTEN with the AI checker login (ERP_AI_CHECKER_TOKEN,
//     or ERP_AI_CHECKER_TOKEN_UAT when the page points at UAT ERP), the only
//     login the AI Guard lets write scores.
//
// A bill with no signed read (the reader was off, or the old claim form) is
// scored 0 -- a person in Accounts checks it.

import { allowedErpHosts } from "../../../lib/erpServer";
import { compareBill, readIsSigned } from "../../../lib/billReader";

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

// Keep in step with REVIEW_ABOVE in the Expense Running Guard.
const REVIEW_ABOVE = 50000;

/* One row against its signed read -> what is written on the row. */
function scoreRow(row, signed) {
  const claimed = flt(row.amount);
  const above = claimed > REVIEW_ABOVE ? " Above ₹50,000 -- always checked by Accounts." : "";
  if (!signed || !readIsSigned(signed.read, signed.sig)) {
    return { row, score: 0, reason: "No bill read was kept for this bill -- checked by Accounts." + above, meta: { verification: { status: "Not read", checked_at: new Date().toISOString() } } };
  }
  const read = signed.read;
  const { ok, checks } = compareBill(read, { amount: claimed, date: row.expense_date, food: row.expense_type === "Food" });
  const score = ok ? 100 : 40;
  const v = read.values || {};
  return {
    row,
    score,
    reason: (ok ? "Total, date and bill type match the bill." : checks.filter((c) => !c.ok).map((c) => c.why).join("; ") + ".") + above,
    amount: typeof v.total === "number" ? v.total : null,
    date: v.date || null,
    vendor: v.vendor ? String(v.vendor).slice(0, 140) : null,
    // The row's custom_bill_meta: the read as the models gave it (once, on
    // attach) and how it compared with what was submitted.
    meta: {
      bill: { ...v, title: read.title, title_confidence: read.titleConfidence, confidence: read.confidence, read_at: read.at, markdown: String(read.md || "").slice(0, 4000) },
      verification: { status: ok ? "Matched" : "Mismatch", checked_at: new Date().toISOString(), score, min_confidence: 0.9, checks },
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const reads = req.body?.reads && typeof req.body.reads === "object" ? req.body.reads : {};
  const userErp = String(req.headers["x-erp-token"] || "").trim();
  const claimName = String(req.body?.claim || "").trim();
  // Only these rows (the bill just added), so checks of different bills run
  // side by side without doing each other's work. None = every bill due.
  const only = Array.isArray(req.body?.rows) ? new Set(req.body.rows.map(String)) : null;
  let origin;
  try {
    const url = new URL(String(req.body?.endpoint || ""));
    if (!allowedErpHosts().has(url.host.toLowerCase())) throw new Error("host");
    origin = url.origin;
  } catch {
    return res.status(400).json({ error: "That ERP is not one this app talks to." });
  }
  if (!userErp) return res.status(401).json({ error: "Sign in again to check bills." });
  if (!/^[\w.\-]+$/.test(claimName)) return res.status(400).json({ error: "Which claim?" });

  // The checker login's key differs per ERP: UAT has its own.
  const uat = /(^|\.)(erp-)?uat\.elbrit\.org$/i.test(new URL(origin).host);
  const checker = uat ? process.env.ERP_AI_CHECKER_TOKEN_UAT : process.env.ERP_AI_CHECKER_TOKEN;
  if (!checker) return res.status(200).json({ skipped: true, reason: "The AI bill check is not switched on yet." });

  const path = `/api/resource/Expense%20Claim/${encodeURIComponent(claimName)}`;
  let claim;
  try {
    claim = (await erp(origin, userErp, path)).data; // the user must be able to see it
  } catch (e) {
    return res.status(e.status === 403 || e.status === 404 ? 403 : 502).json({ error: e.status === 403 || e.status === 404 ? "You cannot see that claim." : `The ERP could not be read: ${e.message}` });
  }

  // Each bill still being checked, against its signed read (plain code).
  const rows = claim.expenses || [];
  const running = !!Number(claim.custom_running);
  const scored = rows.map((row) => {
    if (NO_SCORE_TYPES.includes(row.expense_type)) return { row, skip: true };
    if (only && !only.has(row.name)) return { row, skip: true };
    if (running && (row.custom_bill_status || "Checking") !== "Checking") return { row, skip: true };
    if (!row.custom_bill) return { row, score: 0, reason: "No bill attached to this row." };
    return scoreRow(row, reads[row.name]);
  });

  const counted = scored.filter((s) => !s.skip);
  if (!counted.length) return res.status(200).json({ skipped: true, reason: running ? "Every bill on this claim is checked already." : "Advance requests have no bills to check." });
  // Write with the checker login onto the LATEST claim, only this check's rows:
  // other checks (other bills) may be writing too, so re-read, merge, save, and
  // on "modified after you opened it" wait a moment and do it again.
  const byName = new Map(counted.map((x) => [x.row.name, x]));
  // A bill verified meanwhile books (submits) the claim and moves bills still
  // being checked to a new open claim, as new rows: find ours there by photo.
  const byBill = new Map(counted.filter((x) => x.row.custom_bill).map((x) => [x.row.custom_bill, x]));
  let saved;
  let target = path;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        let doc = (await erp(origin, checker, target)).data;
        if (running && Number(doc.docstatus) !== 0) {
          const q = new URLSearchParams({
            filters: JSON.stringify([["employee", "=", claim.employee], ["custom_running", "=", 1], ["docstatus", "=", 0]]),
            fields: JSON.stringify(["name"]),
            limit_page_length: "1",
          });
          const open = ((await erp(origin, checker, `/api/resource/Expense%20Claim?${q}`)).data || [])[0]?.name;
          if (!open) break; // nothing left to write: every bill was decided meanwhile
          target = `/api/resource/Expense%20Claim/${encodeURIComponent(open)}`;
          doc = (await erp(origin, checker, target)).data;
        }
        doc.expenses = (doc.expenses || []).map((r) => {
          const x = byName.get(r.name) || byBill.get(r.custom_bill);
          // Decided (or edited) meanwhile: leave it to whoever did that.
          if (!x || (running && (r.custom_bill_status || "Checking") !== "Checking") || flt(r.amount) !== flt(x.row.amount) || r.custom_bill !== x.row.custom_bill) return r;
          return {
            ...r,
            custom_bill_amount: x.amount,
            custom_bill_date: x.date,
            custom_bill_vendor: x.vendor,
            custom_ai_score: x.score,
            custom_ai_reason: x.reason.slice(0, 500),
            custom_bill_meta: JSON.stringify(x.meta || {}),
          };
        });
        // The claim's score: every checked bill on it, weighted by amount.
        const done = doc.expenses.filter((r) => r.custom_ai_reason && !NO_SCORE_TYPES.includes(r.expense_type));
        const money = done.reduce((s, r) => s + flt(r.amount), 0) || 1;
        const issues = done.filter((r) => flt(r.custom_ai_score) < 90).map((r) => `Row ${r.idx} (${r.expense_type}, ${inr(flt(r.amount))}): ${r.custom_ai_reason}`);
        doc.custom_ai_score = Math.round(done.reduce((s, r) => s + flt(r.custom_ai_score) * flt(r.amount), 0) / money);
        doc.custom_ai_summary = (issues.length ? `${done.length - issues.length} of ${done.length} bills match. ${issues.join(" | ")}` : `All ${done.length} bills match the claim.`).slice(0, 1000);
        saved = (await erp(origin, checker, target, { method: "PUT", body: JSON.stringify(doc) })).data;
        break;
      } catch (e) {
        if (attempt < 5 && /modified after|TimestampMismatch/i.test(e.message)) {
          await new Promise((r) => setTimeout(r, 300 + Math.random() * 700 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    if (!saved) return res.status(200).json({ skipped: true, reason: "Every bill was decided while this check ran." });
    return res.status(200).json({
      score: saved.custom_ai_score,
      risk: saved.custom_ai_risk || null,
      summary: saved.custom_ai_summary,
      rows: counted.map((x) => ({
        name: x.row.name, idx: x.row.idx, score: x.score, reason: x.reason, amount: x.amount, date: x.date, vendor: x.vendor,
        status: (saved.expenses || []).find((r) => r.name === x.row.name || (x.row.custom_bill && r.custom_bill === x.row.custom_bill))?.custom_bill_status || null,
      })),
      modified: saved.modified,
    });
  } catch (e) {
    console.error("Claim check: could not save the score", claimName, e.message);
    return res.status(502).json({ error: `The check ran but its result could not be saved: ${e.message}` });
  }
}
