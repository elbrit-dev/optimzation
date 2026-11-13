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
// row (lib/billReader.js compareBill): total and date must match and the photo
// must be a bill, each read with confidence 0.9 or more. All three -> score 100, else 40 with
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

/* The planner's monthly field TA/DA claim (13 Nov 2026): its RISK SCORE, over
   every line -- the verifiers sort and check by it on the field-expenses
   dashboard. The ERP's AI Guard turns the score into the risk: 90+ Low,
   70-89 Medium, below 70 High.
     a line with no bill (TA / DA as the ERP worked it out, a DA top-up made
       from checked bills)                                         100
     a bill line: its own check -- checked on scanning 100, possible
       repeat 85, entered by hand 70, not matching 40, never checked 0
   The claim: those weighted by amount, and held down so one small risky bill
   can't hide behind a big TA/DA total -- a bill not matching or never checked
   makes the claim High (at most 69), a handwritten bill or a possible repeat
   at most Medium (89). */
const FIELD = "Field TA/DA · ";
export function fieldClaimScore(rows) {
  const lines = (rows || []).filter((r) => !NO_SCORE_TYPES.includes(r.expense_type));
  let money = 0;
  let weighted = 0;
  let erpAmt = 0;
  // each kind of bill once (a hotel bill is one line per night)
  const bills = { checked: new Map(), hand: new Map(), repeat: new Map(), bad: new Map(), unchecked: new Map() };
  const add = (k, r) => {
    const x = bills[k].get(r.custom_bill) || { type: r.expense_type, amount: 0, dates: [] };
    x.amount += flt(r.amount);
    x.dates.push(String(r.expense_date || "").slice(0, 10));
    bills[k].set(r.custom_bill, x);
  };
  for (const r of lines) {
    const amt = flt(r.amount);
    let s;
    if (!r.custom_bill) {
      s = 100;
      erpAmt += amt;
    } else if (!r.custom_ai_reason) {
      s = 0;
      add("unchecked", r);
    } else {
      s = flt(r.custom_ai_score);
      add(/entered by hand/i.test(r.custom_ai_reason) ? "hand" : s >= 90 ? "checked" : s >= 70 ? "repeat" : "bad", r);
    }
    money += amt;
    weighted += s * amt;
  }
  let score = money ? Math.round(weighted / money) : 100;
  if (bills.bad.size || bills.unchecked.size) score = Math.min(score, 69);
  else if (bills.hand.size || bills.repeat.size) score = Math.min(score, 89);
  const n = Object.values(bills).reduce((s, m) => s + m.size, 0);
  const list = (m) => [...m.values()].map((x) => `${x.type} ${inr(x.amount)}${x.dates[0] ? ` ${x.dates.sort()[0].slice(8, 10)}/${x.dates[0].slice(5, 7)}` : ""}`).join(", ");
  const parts = [
    erpAmt ? `TA/DA ${inr(erpAmt)} worked out by the ERP` : null,
    n ? `${n} bill${n > 1 ? "s" : ""}${bills.checked.size ? `: ${bills.checked.size} checked` : ""}` : null,
    bills.bad.size ? `${bills.bad.size} not matching (${list(bills.bad)})` : null,
    bills.unchecked.size ? `${bills.unchecked.size} not checked (${list(bills.unchecked)})` : null,
    bills.hand.size ? `${bills.hand.size} handwritten (${list(bills.hand)})` : null,
    bills.repeat.size ? `${bills.repeat.size} possible repeat (${list(bills.repeat)})` : null,
  ].filter(Boolean);
  const summary = (n ? parts.join(" · ") : `TA/DA only, ${inr(erpAmt)} worked out by the ERP — no bills`).slice(0, 1000);
  return { score, summary };
}

/* One row against its signed read -> what is written on the row. */
function scoreRow(row, signed) {
  const claimed = flt(row.amount);
  const above = claimed > REVIEW_ABOVE ? " Above ₹50,000 -- always checked by Accounts." : "";
  if (!signed || !readIsSigned(signed.read, signed.sig)) {
    return { row, score: 0, reason: "No bill read was kept for this bill -- checked by Accounts." + above, meta: { verification: { status: "Not read", checked_at: new Date().toISOString() } } };
  }
  const read = signed.read;
  if (read.trip) return scoreTripRow(row, read);
  const { ok, checks } = compareBill(read, { amount: claimed, date: row.expense_date });
  const score = ok ? 100 : 40;
  const v = read.values || {};
  return {
    row,
    score,
    reason: (ok ? "Total and date match the bill." : checks.filter((c) => !c.ok).map((c) => c.why).join("; ") + ".") + above,
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

/* A planner trip bill (12 Nov 2026): its type, date, readability and
   fingerprint were checked when it was scanned (read-bill), and that verdict
   is inside the signed read. Here only that the row is that bill: same file,
   same kind, dated inside the trip, and claiming no more than the bill (the
   trip pays a share or caps it, never more). Passed -> 100: the officer's
   approval is then final ("Expense Claim Route"). */
function scoreTripRow(row, read) {
  const tb = read.trip || {};
  const vd = tb.verdict || {};
  const claimed = flt(row.amount);
  const why = [];
  if (!vd.ok) why.push("the bill did not pass its checks when scanned");
  if (row.custom_bill !== tb.file_url) why.push("the row's bill is not the one that was checked");
  if (row.expense_type !== vd.kind) why.push(`a ${String(vd.kind || "?").toLowerCase()} bill on a ${row.expense_type} row`);
  if (!(row.expense_date >= tb.trip?.from && row.expense_date <= tb.trip?.to)) why.push("the row is dated outside the trip");
  if (claimed > flt(vd.billed) + 1) why.push(`₹${Math.round(claimed)} claimed on a ₹${Math.round(flt(vd.billed))} bill`);
  const ok = !why.length;
  const v = read.values || {};
  // a possible repeat (near-identical photo, or same vendor/date/total with
  // no bill no) passes but scores 85: Medium risk, so after the officer it
  // still gets a person's look in Accounts
  // entered BY HAND (the bill could not be read): nothing on it was checked by
  // the AI -- 70, so after the officer a person compares the photo with it
  const score = !ok ? 40 : vd.manual ? 70 : tb.flag ? 85 : 100;
  return {
    row,
    score,
    reason: ok
      ? vd.manual
        ? `${vd.kind} bill entered by hand — it could not be read; check the photo (and the payment proof, if added) against ₹${Math.round(flt(vd.billed))}${vd.kind === "Stay" && vd.checkIn ? `, ${vd.checkIn} to ${vd.checkOut}` : vd.date ? `, ${vd.date}` : ""}.${vd.why ? ` Rep's reason: "${String(vd.why).slice(0, 200)}".` : ""}${tb.flag ? ` ${tb.flag}` : ""}`
        : `${vd.kind} bill checked on scanning (type, date, read).${tb.flag ? ` ${tb.flag}` : ""}`
      : `${why.join("; ")}.`,
    amount: typeof v.total === "number" ? v.total : null,
    date: vd.date || v.date || null,
    vendor: v.vendor ? String(v.vendor).slice(0, 140) : null,
    meta: {
      bill: { ...v, title: read.title, title_confidence: read.titleConfidence, confidence: read.confidence, read_at: read.at, markdown: String(read.md || "").slice(0, 4000) },
      trip: { slot: tb.slot, trip: tb.trip, nights: vd.nights, billed: vd.billed, counted: vd.amount, fingerprint: tb.fingerprint, flag: tb.flag, hashes: tb.hashes },
      verification: { status: ok ? (vd.manual ? "Entered by hand" : tb.flag ? "Trip bill checked, possible repeat" : "Trip bill checked") : "Mismatch", checked_at: new Date().toISOString(), score, min_confidence: 0.6, why },
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
  // the planner's month claim is scored over every line, every time it changes
  const field = String(claim.remark || "").startsWith(FIELD);
  if (!counted.length && !field) return res.status(200).json({ skipped: true, reason: running ? "Every bill on this claim is checked already." : "Advance requests have no bills to check." });
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
        if (field) {
          // the month claim: every line, its risk (see fieldClaimScore)
          const f = fieldClaimScore(doc.expenses);
          doc.custom_ai_score = f.score;
          doc.custom_ai_summary = f.summary;
        } else {
          // The claim's score: every checked bill on it, weighted by amount.
          const done = doc.expenses.filter((r) => r.custom_ai_reason && !NO_SCORE_TYPES.includes(r.expense_type));
          const money = done.reduce((s, r) => s + flt(r.amount), 0) || 1;
          const issues = done.filter((r) => flt(r.custom_ai_score) < 90).map((r) => `Row ${r.idx} (${r.expense_type}, ${inr(flt(r.amount))}): ${r.custom_ai_reason}`);
          doc.custom_ai_score = Math.round(done.reduce((s, r) => s + flt(r.custom_ai_score) * flt(r.amount), 0) / money);
          doc.custom_ai_summary = (issues.length ? `${done.length - issues.length} of ${done.length} bills match. ${issues.join(" | ")}` : `All ${done.length} bills match the claim.`).slice(0, 1000);
        }
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
