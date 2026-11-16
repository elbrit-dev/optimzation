// Probationary Leave -- the paid leave of an employee still on probation.
//
// WHO. Employee.employment_type === "Probation", and nothing else: the
// confirmation date is not read. Once HR changes the type, the normal leave
// types come back (asked 2026-11-11). On probation the form offers only this
// and Leave Without Pay.
//
// HOW MUCH. One day per month from the joining month. A day not used carries
// into the next month, but the balance never goes above 2:
//
//   joins Nov   Nov: 1   (takes 0)
//               Dec: 2   (takes 2)
//               Jan: 1   (takes 0)
//               Feb: 2   (takes 1)
//               Mar: 2   (1 left + 1 new; takes 3 -> 2 paid + 1 LOP)
//
// Approved Probationary Leave counts as taken. A PENDING one counts only for its
// days in the current month or later: it holds them so a second request that
// month goes to LOP instead of stacking on the same limit, but once its month
// is over and it is still waiting it no longer counts. A rejected or cancelled
// one never counts (asked 2026-11-11; the form trims pending leave before
// passing it in as `approvedLeaves`). A day counts in its own month, so a leave across
// a month end uses each month's limit for its own days. ERP's own allocation
// (HR gives 6 for the probation period) is a second cap on top.
//
// MORE THAN THE LIMIT. The request is split, earliest days first: the days the
// limit covers stay Probationary Leave, the rest become Leave Without Pay, each
// run of days its own Leave Application.

export const PROBATION_LEAVE_TYPE = "Probationary Leave Policy";
export const PROBATION_LEAVE_LABEL = "Probationary Leave";
export const LOP_LEAVE_TYPE = "Leave Without Pay";
export const PROBATION_EMPLOYMENT_TYPE = "Probation";
export const PROBATION_MONTHLY_CAP = 2;

export const isOnProbation = (employmentType) =>
  String(employmentType ?? "").trim().toLowerCase() === PROBATION_EMPLOYMENT_TYPE.toLowerCase();

const pad = (n) => String(n).padStart(2, "0");
/** Date -> "yyyy-MM-dd", local. */
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** "yyyy-MM-dd" | Date -> "yyyy-MM". */
export const monthKey = (d) => (typeof d === "string" ? d.slice(0, 7) : ymd(d).slice(0, 7));
const nextMonth = (key) => {
  const [y, m] = key.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
};
const parseYmd = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};

/**
 * The working days of a leave, each with its weight: 1, or 0.5 on the half day.
 * Sundays and the employee's holidays are not leave days (as ERP counts them).
 * -> [{ date: "yyyy-MM-dd", weight }]
 */
export function leaveDaysOf({ from, to, halfDay = false, halfDayDate = null }, holidays = new Set()) {
  const out = [];
  if (!from || !to) return out;
  const end = parseYmd(to);
  for (let d = parseYmd(from); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const key = ymd(d);
    if (d.getDay() === 0 || holidays?.has?.(key)) continue;
    out.push({ date: key, weight: halfDay && halfDayDate && String(halfDayDate).slice(0, 10) === key ? 0.5 : 1 });
  }
  // A half day on a date that is not a working day (or none named): ERP takes
  // the half off the total, so take it off the first day.
  if (halfDay && out.length && !out.some((x) => x.weight === 0.5)) out[0].weight = 0.5;
  return out;
}

/** Approved Probationary Leave days per month. -> Map("yyyy-MM" -> days) */
export function takenByMonth(approvedLeaves = [], holidays) {
  const taken = new Map();
  for (const leave of approvedLeaves) {
    for (const { date, weight } of leaveDaysOf(leave, holidays)) {
      const k = monthKey(date);
      taken.set(k, (taken.get(k) ?? 0) + weight);
    }
  }
  return taken;
}

/**
 * Probationary Leave still open in `month`, given what was taken: 1 a month
 * from the joining month, unused carrying over, never above 2.
 */
export function availableInMonth(joiningDate, month, taken = new Map()) {
  if (!joiningDate || !month) return 0;
  let key = monthKey(joiningDate);
  if (month < key) return 0;
  let balance = 0;
  for (let guard = 0; guard < 240; guard++) {
    balance = Math.min(PROBATION_MONTHLY_CAP, balance + 1);
    const used = taken.get(key) ?? 0;
    if (key === month) return Math.max(0, balance - used);
    balance = Math.max(0, balance - used);
    key = nextMonth(key);
  }
  return 0;
}

/**
 * Split a requested leave into Probationary Leave and Leave Without Pay.
 *
 *   request   { from, to, halfDay, halfDayDate }  ("yyyy-MM-dd")
 *   joiningDate, approvedLeaves (approved Probationary Leave, same shape)
 *   erpAvailable  what ERP's own allocation still has (null = no second cap)
 *
 * -> { parts: [{ leaveType, from, to, days, halfDay, halfDayDate }], paidDays, lopDays }
 * Parts are runs of consecutive working days of one type, in date order.
 */
export function splitProbationLeave(request, { joiningDate, approvedLeaves = [], holidays, erpAvailable = null }) {
  const days = leaveDaysOf(request, holidays);
  const taken = takenByMonth(approvedLeaves, holidays);
  let erpLeft = erpAvailable == null ? Infinity : Math.max(0, Number(erpAvailable) || 0);

  const typed = days.map(({ date, weight }) => {
    const m = monthKey(date);
    const paid = weight <= erpLeft && availableInMonth(joiningDate, m, taken) >= weight;
    if (paid) {
      taken.set(m, (taken.get(m) ?? 0) + weight);
      erpLeft -= weight;
    }
    return { date, weight, leaveType: paid ? PROBATION_LEAVE_TYPE : LOP_LEAVE_TYPE };
  });

  const parts = [];
  for (const d of typed) {
    const last = parts[parts.length - 1];
    if (last && last.leaveType === d.leaveType) {
      last.to = d.date;
      last.days += d.weight;
      if (d.weight === 0.5) { last.halfDay = true; last.halfDayDate = d.date; }
    } else {
      parts.push({ leaveType: d.leaveType, from: d.date, to: d.date, days: d.weight, halfDay: d.weight === 0.5, halfDayDate: d.weight === 0.5 ? d.date : null });
    }
  }
  const sum = (t) => typed.filter((d) => d.leaveType === t).reduce((s, d) => s + d.weight, 0);
  return { parts, paidDays: sum(PROBATION_LEAVE_TYPE), lopDays: sum(LOP_LEAVE_TYPE) };
}
