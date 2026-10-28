/* Pure helpers shared by the Claims page, the profile tab and the home strip. */

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WDL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n) => String(n).padStart(2, "0");
/* LOCAL date -- toISOString() is still yesterday before 05:30 IST. */
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const dateOf = (iso) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const shortDate = (iso) => (iso ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}` : "");
export const monthLabel = (key) => `${MONTH[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;
export const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
/* Full amount, never "1.2L" / "4.5k". */
export const kInr = (n) => Math.round(n).toLocaleString("en-IN");

/* Indian financial year of a yyyy-mm key: Apr-Mar. */
export const fyOf = (key) => (+key.slice(5, 7) >= 4 ? +key.slice(0, 4) : +key.slice(0, 4) - 1);
export const fyLabel = (y) => `FY ${y}–${String(y + 1).slice(2)}`;

/* The claim's state, in the words the page shows. Claims in the approval
   flow (since 21 Oct 2026) go Draft -> Waiting for Approval (reporting
   officer) -> In Review (verifier) or straight to Verified (AI score 90+) ->
   paid once verified (instant payment, built later); older HR-submitted ones keep the ERP's own
   Unpaid / Paid / Cancelled. */
export const STATUS = {
  Draft: { label: "Not sent", bg: "#f2f4f7", fg: "#475467", dot: "#98a2b3" },
  "Waiting for Approval": { label: "With reporting officer", bg: "#fffaeb", fg: "#b54708", dot: "#d97706" },
  Approved: { label: "Approved", bg: "#eef3fe", fg: "#1d4ed8", dot: "#2563eb" },
  "In Review": { label: "Being verified", bg: "#eef3fe", fg: "#1d4ed8", dot: "#2563eb" },
  Verified: { label: "Verified", bg: "#ecfdf3", fg: "#067647", dot: "#12b76a" },
  Submitted: { label: "Approved", bg: "#eef3fe", fg: "#1d4ed8", dot: "#2563eb" },
  Unpaid: { label: "Approved · unpaid", bg: "#eef3fe", fg: "#1d4ed8", dot: "#2563eb" },
  Paid: { label: "Paid", bg: "#ecfdf3", fg: "#067647", dot: "#12b76a" },
  Rejected: { label: "Rejected", bg: "#fef3f2", fg: "#b42318", dot: "#dc2626" },
  Cancelled: { label: "Cancelled", bg: "#f2f4f7", fg: "#667085", dot: "#98a2b3" },
};
export const statusOf = (s) => STATUS[s] || { label: s, bg: "#f2f4f7", fg: "#475467", dot: "#98a2b3" };
/* An advance is released, not paid through payroll. */
export const claimStatusLabel = (c) => (c.isAdvance && c.status === "Verified" ? "Released" : statusOf(c.status).label);

/* AI risk from the bill check: 90+ Low, 70-89 Medium, below 70 High. */
export const RISK = {
  Low: { label: "Low risk", bg: "#ecfdf3", fg: "#067647", dot: "#12b76a" },
  Medium: { label: "Medium risk", bg: "#fffaeb", fg: "#b54708", dot: "#d97706" },
  High: { label: "High risk", bg: "#fef3f2", fg: "#b42318", dot: "#dc2626" },
};

/* Known claim types get the design's colours; anything new the ERP adds gets
   a neutral one rather than breaking. */
const TYPE_COLORS = {
  Travel: ["#2563eb", "#eef3fe", "#1d4ed8"],
  Food: ["#d97706", "#fffaeb", "#b54708"],
  Calls: ["#067647", "#ecfdf3", "#067647"],
  Medical: ["#dc2626", "#fef3f2", "#b42318"],
  Others: ["#8a93a3", "#f2f4f7", "#475467"],
  Miscellaneous: ["#0e7490", "#ecfeff", "#155e75"],
  Advance: ["#7c3aed", "#f4f0ff", "#5b21b6"],
  Stay: ["#4f46e5", "#eef2ff", "#3730a3"],
};
export const typeColor = (t) => {
  const [c, bg, fg] = TYPE_COLORS[t] || ["#64748b", "#f1f5f9", "#334155"];
  return { c, bg, fg };
};

const live = (c) => c.status !== "Cancelled" && c.status !== "Rejected";

/* A "day" is one claim's rows on one expense date: a claim covering a week
   shows as several days, and two claims on one date stay apart because each
   has its own status. Newest first. */
export function groupDays(claims, keep = () => true) {
  const out = new Map();
  for (const c of claims) {
    for (const l of c.lines) {
      if (!l.date || !keep(l, c)) continue;
      const key = `${l.date}|${c.id}`;
      if (!out.has(key)) out.set(key, { key, date: l.date, claim: c, rows: [] });
      out.get(key).rows.push(l);
    }
  }
  return [...out.values()].sort((a, b) => b.date.localeCompare(a.date) || b.claim.id.localeCompare(a.claim.id));
}

export const dayTotal = (d) => d.rows.reduce((s, r) => s + r.amount, 0);
export const daySanctioned = (d) => (d.claim.sanctioned == null ? null : d.rows.reduce((s, r) => s + r.sanctioned, 0));

/* Totals over a set of claims, counting only the rows inside `keep`. */
export function totals(claims, keep = () => true) {
  let claimed = 0, sanctioned = 0, reimbursed = 0, rows = 0;
  const byStatus = {};
  const byType = {};
  for (const c of claims) {
    const ls = c.lines.filter((l) => keep(l, c));
    if (!ls.length) continue;
    const amt = ls.reduce((s, l) => s + l.amount, 0);
    const b = (byStatus[c.status] ||= { n: 0, amount: 0 });
    b.n += 1;
    b.amount += c.sanctioned != null ? ls.reduce((s, l) => s + l.sanctioned, 0) : amt;
    if (!live(c)) continue;
    claimed += amt;
    rows += ls.length;
    if (c.sanctioned != null) sanctioned += ls.reduce((s, l) => s + l.sanctioned, 0);
    if (c.status === "Paid") reimbursed += ls.reduce((s, l) => s + l.sanctioned, 0);
    for (const l of ls) byType[l.type] = (byType[l.type] || 0) + l.amount;
  }
  return { claimed, sanctioned, reimbursed, rows, byStatus, byType };
}

/* Money that has cleared: verified (paid with next month's salary) or paid. */
export const CLEARED = new Set(["Verified", "Paid"]);

/* The settlement ledger (Settlements screen, home Settle bar), Miscellaneous
 * only: cash paid to the employee (Employee Advance) and the bills on their
 * running claims, in date order --
 *   topup    an advance paid to them                                     +
 *   request  an advance asked for, not paid yet (not counted)
 *   bill     one bill; only a Verified one is counted                    −
 *   payout   Accounts paid what a closed claim owed them                 +
 * each with the balance after it (below zero = owed to them).
 *
 * The numbers come from the ERP's own books, not the walk: in hand = what
 * is left of every advance (paid - claimed - returned) less the verified
 * bills on the open claim; owed = that shortfall plus what closed claims
 * still owe. Claims of the old flow (one claim per trip, reporting officer)
 * are not part of it -- they stay under "All past claims". */
export function ledger(claims, advances = []) {
  const running = claims.filter((c) => c.running && live(c));
  const open = running.find((c) => c.docstatus === 0) || null;
  const ev = [];
  for (const a of advances) {
    if (a.docstatus === 2) continue;
    if (a.waiting) ev.push({ kind: "request", date: a.date, amount: a.amount, adv: a, note: a.purpose });
    else ev.push({ kind: "topup", date: a.date, amount: a.paid, adv: a, note: a.purpose });
  }
  for (const c of running) {
    for (const l of c.lines) if (l.date) ev.push({ kind: "bill", date: l.date, amount: l.amount, claim: c, line: l, state: l.state || "Checking", open: c.docstatus === 0 });
    if (c.reimbursed > 0) ev.push({ kind: "payout", date: String(c.modified || c.posting).slice(0, 10), amount: c.reimbursed, claim: c, note: `what ${c.id} owed you` });
  }
  const order = { topup: 0, payout: 1, request: 2, bill: 3 };
  ev.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]);
  let bal = 0, added = 0, spent = 0;
  for (const e of ev) {
    if (e.kind === "topup" || e.kind === "payout") bal += e.amount;
    if (e.kind === "topup") added += e.amount;
    if (e.kind === "bill" && e.state === "Verified") { bal -= e.amount; spent += e.amount; }
    e.bal = bal;
  }
  const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
  const openLines = open ? open.lines : [];
  const unused = sum(advances.filter((a) => !a.waiting && a.docstatus === 1), (a) => a.left);
  const inHand = unused - sum(openLines.filter((l) => l.state === "Verified"), (l) => l.amount);
  const owedClosed = sum(running, (c) => c.owed || 0);
  return {
    entries: ev,
    open,
    added,
    spent,
    requested: sum(advances.filter((a) => a.waiting && a.docstatus !== 2), (a) => a.amount),
    checking: sum(openLines.filter((l) => l.state === "Checking" || l.state === "In Review"), (l) => l.amount),
    balance: Math.max(0, inHand),
    over: Math.max(0, -inHand) + owedClosed,
    owedClosed,
    any: ev.length > 0,
  };
}

/* In-hand cash in short (the home Settle bar). */
export function cashOf(claims, advances) {
  const L = ledger(claims, advances);
  return { added: L.added, spent: L.spent, balance: L.balance, over: L.over, requested: L.requested, checking: L.checking, any: L.any };
}

/* A running-claim bill's status, in the page's words. */
export const BILL_STATE = {
  Checking: { tone: "#2563eb", icon: "hist", text: "AI check", sub: "in progress" },
  Verified: { tone: "#067647", icon: "shield", text: "Verified", sub: "counted" },
  "In Review": { tone: "#b54708", icon: "eye", text: "In review", sub: "with Accounts" },
  Rejected: { tone: "#b42318", icon: "x", text: "Rejected", sub: "not counted" },
};

/* One bill row's state in a line: the AI check and where the claim is. */
export function billState(claim, line) {
  if (claim?.running) {
    const st = BILL_STATE[line?.state] || BILL_STATE.Checking;
    return { tone: st.tone, icon: st.icon, text: st.text, where: line?.state === "Rejected" && line.review ? line.review : st.sub };
  }
  const s = line?.ai?.score;
  const ai = s == null ? { tone: "#8a93a3", icon: "file", text: claim.status === "Draft" ? "Not sent" : "Not checked yet" }
    : s >= 90 ? { tone: "#067647", icon: "shield", text: "AI verified" }
    : { tone: "#b54708", icon: "eye", text: "In review" };
  const where = { "Waiting for Approval": "with reporting officer", "In Review": "reviewer checking", Verified: "verified", Paid: "paid" }[claim.status];
  return { ...ai, where: where || "" };
}

/* Monday-first weeks of a yyyy-mm month: [{ from, to }] as day numbers. */
export function weeksOf(key) {
  const y = +key.slice(0, 4), m = +key.slice(5, 7);
  const last = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // days before the 1st since Monday
  const out = [];
  for (let s = 1 - lead; s <= last; s += 7) out.push({ from: Math.max(1, s), to: Math.min(last, s + 6) });
  return out;
}

/* Which month a claim belongs to: the month of most of its expense rows,
   falling back to its posting date -- HR often posts September's travel in
   the first week of October. */
export function claimMonth(c) {
  const count = {};
  for (const l of c.lines) if (l.date) count[l.date.slice(0, 7)] = (count[l.date.slice(0, 7)] || 0) + l.amount + 1;
  const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : (c.posting || "").slice(0, 7);
}

export function spanOf(lines) {
  const ds = lines.map((l) => l.date).filter(Boolean).sort();
  if (!ds.length) return "";
  const a = ds[0], b = ds[ds.length - 1];
  if (a === b) return shortDate(a);
  return a.slice(0, 7) === b.slice(0, 7) ? `${+a.slice(8, 10)} – ${shortDate(b)}` : `${shortDate(a)} – ${shortDate(b)}`;
}

export const sizeLabel = (b) => (!b ? "" : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1048576).toFixed(1) + " MB");
