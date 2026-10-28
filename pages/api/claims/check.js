// pages/api/claims/check.js
//
// POST { endpoint: <ERP GraphQL URL>, claim: "HR-EXP-2026-00016" }
//      Authorization: Bearer <the user's Firebase ID token>
//      x-erp-token:   <the user's ERP token>
//
// Checks every bill on an Expense Claim with verify-doc and saves the result
// on the claim: each row's AI score (the AMOUNT check -- bill vs claim within
// 2%) and reason, the amount / date / vendor read off its bill, and every
// detail read off the bill as JSON (custom_bill_meta); the claim's score
// (money-weighted over its rows) and summary. Runs when the employee sends
// the claim for approval -- before the reporting officer sees it. The ERP turns the score into Low / Medium / High risk ("Expense
// Claim AI Guard"), and "Expense Claim Route" uses it after the reporting
// officer approves: 90+ is verified without a person.
//
// Who does what:
//   - the claim is READ with the user's own token, so only someone who may
//     see the claim can have it checked;
//   - verify-doc is called AS THE USER (their Firebase + ERP tokens) and
//     fetches each bill from the ERP with the user's token;
//   - the result is WRITTEN with the AI checker login (ERP_AI_CHECKER_TOKEN,
//     or ERP_AI_CHECKER_TOKEN_UAT when the page points at UAT ERP),
//     the only login the AI Guard lets write scores -- so nobody can score
//     their own claim by writing the fields directly.
//
// The running Miscellaneous claim (custom_running, 27 Oct 2026) is checked
// bill by bill as each is added: only rows still "Checking" are scored, and
// the score decides the bill at once in the ERP ("Expense Running Guard":
// 90+ Verified, else In Review + an Accounts Task) -- no reporting officer.
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

/* The check is a VALUE check: the employee enters only type, date and amount,
   so the score is the amount alone (bill vs claim, within 2%). Everything
   else is READ off the bill, not scored, and kept on the row as JSON
   (custom_bill_meta) -- vendor, GSTIN, bill no., bill date, what it is for. */
const META_FIELDS = {
  document_type: { type: "text", description: "what kind of document this is (tax invoice, fuel receipt, cab receipt, toll ticket, restaurant bill, hand-written bill...)" },
  vendor: { type: "text", description: "the shop, company or person who issued the bill" },
  vendor_gstin: { type: "text", description: "the seller's GSTIN, if printed" },
  invoice_no: { type: "text", description: "the bill / invoice / receipt / ride number" },
  bill_date: { type: "date", description: "the bill or transaction date" },
  customer: { type: "text", description: "the customer / passenger / bill-to name, if printed" },
  payment_mode: { type: "text", description: "how it was paid (cash, UPI, card, FASTag...), if shown" },
  what_for: { type: "text", description: "what was bought or paid for, in a few words" },
};

function rowRequest(row, origin, userErpToken, employeeName) {
  // The running Miscellaneous claim has no sub types: its row title says what it was for.
  const kind = [row.expense_type, row.custom_sub_type || row.description].filter(Boolean).join(" / ");
  return {
    documents: [{ url: origin + row.custom_bill, headers: { Authorization: tokenHeader(userErpToken) } }],
    context: `Employee expense claim in India, amounts in INR. Expense: ${kind}.`,
    fields: {
      amount: {
        type: "number", expected: flt(row.amount), weight: 100, tolerance: "2%",
        description: "the FINAL amount actually paid: the grand / total amount, INCLUDING any handwritten additions or corrections (e.g. '950 +20 = 970' means 970) and any handling or delivery fee -- never a sub-total, a tax line or a single item",
      },
      ...META_FIELDS,
    },
    rules: [
      "It must be a bill, receipt, ticket or invoice -- not a selfie, a blank page or an unrelated photo",
      // Only printed bills are accepted (27 Oct 2026); the form refuses others on attach, this catches the rest.
      "It must be PRINTED -- a machine-printed bill, receipt, invoice or ticket (thermal till slip, computer print-out, e-ticket, ride receipt); a printed slip with a small handwritten note or addition still passes. A handwritten bill -- including a bill-book page with only the shop's name printed and the items and amounts written by hand -- fails",
      // Recorded in the bill details (Sathishkumar sees it), not scored: many bills carry no name.
      `If the bill names a customer, it should be the employee "${employeeName || "the employee"}" or the company Elbrit (a bill with no customer name passes)`,
    ],
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

  // One verify-doc call per bill, in parallel. On the running claim only the
  // bills still being checked: the rest were decided already (a score once
  // written decides the bill -- "Expense Running Guard").
  const rows = claim.expenses || [];
  const running = !!Number(claim.custom_running);
  const scored = await Promise.all(
    rows.map(async (row) => {
      if (NO_SCORE_TYPES.includes(row.expense_type)) return { row, skip: true };
      if (running && (row.custom_bill_status || "Checking") !== "Checking") return { row, skip: true };
      if (!row.custom_bill) return { row, score: 0, reason: "No bill attached to this row." };
      try {
        const r = await fetch(`${VERIFY_URL}/v1/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}`, "X-ERP-Token": tokenHeader(userErp) },
          body: JSON.stringify(rowRequest(row, origin, userErp, claim.employee_name)),
          signal: AbortSignal.timeout(100000),
        });
        const out = await r.json().catch(() => ({}));
        if (r.status === 503) return { row, unavailable: out.error || "verify-doc is not ready" };
        if (!r.ok) return { row, failed: out.error || `verify-doc answered HTTP ${r.status}` };
        const f = out.fields || {};
        const reasons = [];
        if (f.amount && f.amount.ok === false) reasons.push(f.amount.reason);
        const [notABill, notPrinted] = out.rules || [];
        if (notABill && notABill.pass === false) reasons.push(notABill.reason);
        if (notPrinted && notPrinted.pass === false) reasons.push(`Not a printed bill: ${notPrinted.reason}`);
        if (out.document && out.document.readable === false) reasons.push("The bill could not be read.");
        const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
        const val = (k) => (f[k] && f[k].found != null && f[k].found !== "" ? f[k].found : null);
        // The row's custom_bill_meta (JSON): what is on the attachment, and how
        // it compared with the claim -- nothing about the model that read it.
        // The score is the amount check; a photo that is not a printed bill
        // (or unreadable) is capped below the bar however well the amount
        // matches, so a person always looks at it.
        const wrong = notABill?.pass === false || notPrinted?.pass === false || out.document?.readable === false;
        const score = wrong ? Math.min(out.score ?? 0, 40) : out.score ?? 0;
        const claimed = flt(row.amount);
        const onBill = typeof val("amount") === "number" ? val("amount") : null;
        const meta = {
          bill: {
            document_type: val("document_type") || out.document?.kind || null,
            vendor: val("vendor"),
            vendor_gstin: val("vendor_gstin"),
            invoice_no: val("invoice_no"),
            bill_date: iso(val("bill_date")) || val("bill_date"),
            bill_date_printed: f.bill_date?.raw || null,
            customer: val("customer"),
            payment_mode: val("payment_mode"),
            what_for: val("what_for"),
            total_on_bill: onBill,
            language: out.document?.language || null,
            // The bill's full text as Docling (IT's OCR) extracted it.
            text: out.ocr?.text ? String(out.ocr.text).slice(0, 4000) : null,
          },
          verification: {
            status: out.document?.readable === false ? "Unreadable" : reasons.length ? "Mismatch" : "Matched",
            checked_at: new Date().toISOString(),
            score,
            risk: score >= 90 ? "Low" : score >= 70 ? "Medium" : "High", // same bands as the ERP's AI Guard
            amount: {
              claimed,
              on_bill: onBill,
              difference: onBill == null ? null : Math.round((claimed - onBill) * 100) / 100,
              tolerance: "2%",
              match: f.amount ? f.amount.ok === true : false,
              reason: f.amount?.reason || null,
            },
            checks: (out.rules || []).map((r) => ({ rule: r.rule, pass: r.pass, reason: r.reason })),
            issues: reasons,
            summary: out.summary || null,
          },
        };
        return {
          row,
          score,
          reason: reasons.length ? reasons.join("; ") : "Bill amount matches the claim.",
          amount: val("amount"),
          date: iso(val("bill_date")),
          vendor: val("vendor") ? String(val("vendor")).slice(0, 140) : null,
          meta,
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
  if (!counted.length) return res.status(200).json({ skipped: true, reason: running ? "Every bill on this claim is checked already." : "Advance requests have no bills to check." });
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
        custom_bill_meta: JSON.stringify(x.meta || {}),
      };
    });
    doc.custom_ai_score = claimScore;
    doc.custom_ai_summary = summary;
    const saved = (await erp(origin, checker, path, { method: "PUT", body: JSON.stringify(doc) })).data;
    return res.status(200).json({
      score: saved.custom_ai_score,
      risk: saved.custom_ai_risk || null,
      summary: saved.custom_ai_summary,
      rows: counted.map((x) => ({
        name: x.row.name, idx: x.row.idx, score: x.score, reason: x.reason, amount: x.amount, date: x.date, vendor: x.vendor,
        status: (saved.expenses || []).find((r) => r.name === x.row.name)?.custom_bill_status || null,
      })),
      modified: saved.modified,
    });
  } catch (e) {
    console.error("Claim check: could not save the score", claimName, e.message);
    return res.status(502).json({ error: `The check ran but its result could not be saved: ${e.message}` });
  }
}
