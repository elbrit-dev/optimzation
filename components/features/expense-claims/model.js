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

/* The ERP's status, in the words the page shows. The app never approves or
   rejects: Draft is a claim HR has not yet acted on. */
export const STATUS = {
  Draft: { label: "With HR", bg: "#fffaeb", fg: "#b54708", dot: "#d97706" },
  Submitted: { label: "Approved", bg: "#eef3fe", fg: "#1d4ed8", dot: "#2563eb" },
  Unpaid: { label: "Approved · unpaid", bg: "#eef3fe", fg: "#1d4ed8", dot: "#2563eb" },
  Paid: { label: "Paid", bg: "#ecfdf3", fg: "#067647", dot: "#12b76a" },
  Rejected: { label: "Rejected", bg: "#fef3f2", fg: "#b42318", dot: "#dc2626" },
  Cancelled: { label: "Cancelled", bg: "#f2f4f7", fg: "#667085", dot: "#98a2b3" },
};
export const statusOf = (s) => STATUS[s] || { label: s, bg: "#f2f4f7", fg: "#475467", dot: "#98a2b3" };

/* Known claim types get the design's colours; anything new the ERP adds gets
   a neutral one rather than breaking. */
const TYPE_COLORS = {
  Travel: ["#2563eb", "#eef3fe", "#1d4ed8"],
  Food: ["#d97706", "#fffaeb", "#b54708"],
  Calls: ["#067647", "#ecfdf3", "#067647"],
  Medical: ["#dc2626", "#fef3f2", "#b42318"],
  Others: ["#8a93a3", "#f2f4f7", "#475467"],
};
export const typeColor = (t) => {
  const [c, bg, fg] = TYPE_COLORS[t] || ["#7c3aed", "#f4f0ff", "#5b21b6"];
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
