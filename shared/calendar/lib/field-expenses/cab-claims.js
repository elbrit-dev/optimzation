/* A manager's cab bills (20 Nov 2026, the user). SM and ZSM scan the month's
   cab bills on a card of their own in the Field strip: any number of them,
   no day asked -- the bill's own date must fall inside the month -- and they
   are NEVER part of TA/DA. The bills live in their own ERP Expense Claim
   (remark "Field Cab · YYYY-MM"; rows Travel / Cab), sent to the reporting
   officer like the TA/DA claim. The officer's approval is final and it is a
   record only: Accounts pays it outside payroll ("Expense Claim Route" leaves
   a "Field Cab · " claim at Approved -- no Additional Salary).

   A bill goes into the ERP claim (a Draft) the moment it is read, so it is
   never kept only on the phone. While the claim waits with the officer a new
   bill (or a removed one) takes it back, changes it and sends it again -- one
   claim for the month. Once approved it is closed; bills added later start a
   new claim for the same month.

   The bill itself: read by /api/claims/read-bill (slot "cabs": a cab bill,
   dated inside the month, not claimed before -- registered as kind "Bill", so
   a cab bill used here can't come back on a trip or in Settlement), then the
   row scored by /api/claims/check from the bill's signed read. */
import { useEffect, useSyncExternalStore } from "react";
import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";
import { dayLabel } from "@calendar/lib/field-expenses/field-days";
import { readTripBill, releaseTripBill } from "@calendar/lib/field-expenses/bill-reader";

const api = () => import("../../../../components/features/expense-claims/data/claimsApi");
const connOf = (m) => m.makeConn({ url: AUTH_CONFIG.erpUrl, token: AUTH_CONFIG.authToken });

export const cabRemark = (month) => `Field Cab · ${month}`;
export const CAB_TYPE = "Travel";
export const CAB_SUB = "Cab";
const WAITING = "Waiting for Approval";
const OPEN = ["Draft", "Rejected"];

export const monthEnd = (ym) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0);
  return `${ym}-${String(d.getDate()).padStart(2, "0")}`;
};
/* the month as the bill reader's "trip": a cab bill must be dated inside it */
export const cabTrip = (month) => ({ id: `cab-${month}`, from: `${month}-01`, to: monthEnd(month) });

/* a claim the rep can still change: not sent, sent back, or waiting (taken back first) */
const changeable = (c) => c && c.docstatus === 0 && (OPEN.includes(c.status) || c.status === WAITING);

/* ---------- the bill's fingerprint, so a removed bill can be scanned again ---------- */
const FP_KEY = "elbrit.cabBillFp";
const fpMap = () => {
  try {
    return JSON.parse(localStorage.getItem(FP_KEY) || "{}");
  } catch {
    return {};
  }
};
const keepFp = (url, fp) => {
  if (!url || !fp) return;
  try {
    localStorage.setItem(FP_KEY, JSON.stringify({ ...fpMap(), [url]: fp }));
  } catch {
    /* storage blocked: the bill just can't be scanned again after removal */
  }
};
const takeFp = (url) => {
  const m = fpMap();
  const fp = m[url] || null;
  if (fp) {
    delete m[url];
    try {
      localStorage.setItem(FP_KEY, JSON.stringify(m));
    } catch {
      /* ignore */
    }
  }
  return fp;
};

/* ---------- a tiny store: the month's cab claims, shared by the card and the sheet ---------- */

const state = new Map(); // `${employee}|${month}` -> { status, claims, error, at }
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const EMPTY = { status: "idle", claims: [], error: null };
const keyOf = (employee, month) => `${employee}|${month}`;

/* one claim as the card shows it */
function shape(c, reason) {
  return {
    id: c.id,
    status: c.status,
    open: c.docstatus === 0 && OPEN.includes(c.status),
    waiting: c.docstatus === 0 && c.status === WAITING,
    done: ["Approved", "Verified", "Paid"].includes(c.status),
    reason: reason || null,
    lines: c.lines
      .filter((l) => l.type === CAB_TYPE)
      .map((l) => ({
        id: l.id,
        date: l.date,
        amount: l.amount,
        bill: l.bill,
        note: l.note,
        vendor: l.ai?.vendor || String(l.note || "").split(" · ")[1] || "Cab",
        checked: !!l.ai,
        check: l.ai?.reason || null,
        score: l.ai?.score ?? null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function loadCabs(employee, month, force = false) {
  if (!employee || !month) return;
  const k = keyOf(employee, month);
  const cur = state.get(k);
  if (!force && cur && cur.status === "loading") return;
  if (!force && cur && cur.status === "ready" && Date.now() - (cur.at || 0) < 60 * 1000) return;
  state.set(k, { status: "loading", claims: cur?.claims || [], error: null });
  emit();
  (async () => {
    const m = await api();
    const conn = connOf(m);
    const list = await m.fetchClaimsByRemark(conn, employee, cabRemark(month));
    // a sent-back claim: the officer's latest comment says why
    const out = await Promise.all(
      list.map(async (c) => {
        let reason = null;
        if (c.status === "Rejected") {
          const cs = await m.fetchClaimComments(conn, c.id).catch(() => []);
          reason = String(cs?.[0]?.text || "").trim() || null;
        }
        return shape(c, reason);
      }),
    );
    return out;
  })()
    .then((claims) => state.set(k, { status: "ready", claims, error: null, at: Date.now() }))
    .catch((error) => state.set(k, { status: "error", claims: cur?.claims || [], error }))
    .finally(emit);
}

/* -> { status, claims, error } for the month, loading it the first time */
export function useCabs(employee, month, enabled = true) {
  useEffect(() => {
    if (enabled && employee && month) loadCabs(employee, month);
  }, [employee, month, enabled]);
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => (employee && month ? state.get(keyOf(employee, month)) || EMPTY : EMPTY),
    () => EMPTY,
  );
}

/* the month's totals: every bill, what is approved, what still has to be sent */
export function cabTotals(claims) {
  const all = (claims || []).flatMap((c) => c.lines.map((l) => ({ ...l, claim: c })));
  const sum = (xs) => xs.reduce((s, l) => s + (l.amount || 0), 0);
  const draft = all.filter((l) => l.claim.open);
  const waiting = all.filter((l) => l.claim.waiting);
  const approved = all.filter((l) => l.claim.done);
  return {
    count: all.length,
    total: sum(all),
    draft: { count: draft.length, total: sum(draft) },
    waiting: { count: waiting.length, total: sum(waiting) },
    approved: { count: approved.length, total: sum(approved) },
    sentBack: (claims || []).some((c) => c.status === "Rejected" && c.lines.length),
  };
}

/* ---------- ERP writes ---------- */

const keep = (l) => ({ id: l.id, type: l.type, sub: l.sub || "", date: l.date, note: l.note, amount: l.amount, bill: l.bill || "" });

/* The claim to change: the open one, else the one waiting with the officer
   (taken back first -- it goes again after the change). -> { current, wasSent } */
async function openForChange(m, conn, employee, month) {
  const list = await m.fetchClaimsByRemark(conn, employee, cabRemark(month));
  let current = list.find(changeable) || null;
  let wasSent = false;
  if (current && current.status === WAITING) {
    await m.applyAction(conn, current.id, "Withdraw");
    current = await m.fetchClaim(conn, current.id);
    wasSent = true;
  }
  return { current, wasSent };
}

/* the claim's rows saved (none left: the claim is deleted) -> name | null */
async function writeCabs(m, conn, employee, month, current, lines) {
  if (!lines.length) {
    if (current) await m.deleteClaim(conn, current.id);
    return null;
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));
  return m.saveClaim(conn, {
    claim: current || undefined,
    employee,
    postingDate: current?.posting || monthEnd(month),
    remark: cabRemark(month),
    lines,
  });
}

/* Read a cab bill for the month. -> { ok, bill } | { ok: false, reason, manual?, prefill? } */
export function readCabBill(file, month) {
  return readTripBill(file, "cabs", cabTrip(month));
}

/* A read (or hand-entered) bill into the month's cab claim, its file onto the
   claim and its row scored; a claim that was with the officer goes again.
   -> { name, resent, warning } */
export async function addCabBill({ employee, month, bill }) {
  const m = await api();
  const conn = connOf(m);
  const row = {
    date: bill.date,
    type: CAB_TYPE,
    sub: CAB_SUB,
    // "· ref BF-…": the bill's fingerprint, so removing it (from any device) frees it to be scanned again
    note: `Cab · ${bill.vendor || "cab ride"} · ${dayLabel(bill.date)}${bill.manual ? ` · handwritten: ${bill.why || ""}` : ""}${bill.fp ? ` · ref ${bill.fp}` : ""}`,
    amount: bill.billed ?? bill.amount,
    bill: bill.url || "",
  };
  let resend = false;
  const name = await m.retryOnConflict(async () => {
    const { current, wasSent } = await openForChange(m, conn, employee, month);
    resend = resend || wasSent;
    return writeCabs(m, conn, employee, month, current, [...(current?.lines || []).map(keep), row]);
  });
  if (!name) throw new Error("The cab bill could not be saved.");
  keepFp(bill.url, bill.fp);

  let warning = null;
  try {
    const files = [bill.fileName, bill.proofName].filter(Boolean);
    await Promise.all(files.map((f) => m.attachFileTo(conn, f, name)));
    const saved = await m.fetchClaim(conn, name);
    const line = saved.lines.find((l) => l.bill && l.bill === bill.url);
    if (line && bill.signed?.sig) {
      const r = await m.checkClaim(conn, name, [line.id], { [line.id]: bill.signed });
      if (r?.skipped) warning = `Bill check not run: ${r.reason}`;
    } else {
      await m.checkClaim(conn, name, [], {});
    }
  } catch (e) {
    warning = `The bill is saved, but its check did not finish (${e?.message || e}).`;
  }
  if (resend) {
    try {
      await m.applyAction(conn, name, "Send for Approval");
    } catch (e) {
      warning = `The bill is saved, but the claim could not go back to your officer (${e?.message || e}) — press Send.`;
      resend = false;
    }
  }
  loadCabs(employee, month, true);
  return { name, resent: resend, warning };
}

/* Take a bill off the month's claim (not once it is approved). -> name | null */
export async function removeCabBill({ employee, month, lineId }) {
  const m = await api();
  const conn = connOf(m);
  let resend = false;
  let url = null;
  let note = "";
  const name = await m.retryOnConflict(async () => {
    const { current, wasSent } = await openForChange(m, conn, employee, month);
    resend = resend || wasSent;
    if (!current || !current.lines.some((l) => l.id === lineId)) throw new Error("That bill is already approved, or gone — refresh and try again.");
    url = current.lines.find((l) => l.id === lineId)?.bill || null;
    note = current.lines.find((l) => l.id === lineId)?.note || "";
    return writeCabs(m, conn, employee, month, current, current.lines.filter((l) => l.id !== lineId).map(keep));
  });
  // the bill can be scanned again (best effort: known only on the device that scanned it)
  const fp = (/ · ref (BF-\d+)/.exec(note) || [])[1] || takeFp(url);
  if (fp) await releaseTripBill({ fp });
  if (name) {
    await m.checkClaim(conn, name, [], {}).catch(() => null);
    if (resend) await m.applyAction(conn, name, "Send for Approval");
  }
  loadCabs(employee, month, true);
  return name;
}

/* Send the month's cab bills to the reporting officer. -> name */
export async function sendCabs({ employee, month }) {
  const m = await api();
  const conn = connOf(m);
  const list = await m.fetchClaimsByRemark(conn, employee, cabRemark(month));
  const current = list.find((c) => c.docstatus === 0 && OPEN.includes(c.status) && c.lines.length);
  if (!current) throw new Error("No cab bill to send.");
  await m.checkClaim(conn, current.id, [], {}).catch(() => null);
  await m.applyAction(conn, current.id, "Send for Approval");
  loadCabs(employee, month, true);
  return current.id;
}

/* Take the sent bills back (Waiting for Approval -> Draft). */
export async function recallCabs({ employee, month }) {
  const m = await api();
  const conn = connOf(m);
  const list = await m.fetchClaimsByRemark(conn, employee, cabRemark(month));
  const current = list.find((c) => c.docstatus === 0 && c.status === WAITING);
  if (!current) throw new Error("Nothing is waiting with your officer.");
  await m.applyAction(conn, current.id, "Withdraw");
  loadCabs(employee, month, true);
  return current.id;
}
