/* Derived figures for the approval screen. Pure. */

import { groupSubmissions } from './shape';

/* The submissions for ONE period — every tracker the ERP sent. What this
 * user may see is the ERP's permission rules' answer (the "Operational
 * Tracker Restriction" query); nothing here narrows it further.
 *
 * THE PERIOD is the latest month with something still waiting, else the
 * latest month shown — an approver opens this to clear a month, and last
 * month's decided cards would only be in the way. Months after `today`'s
 * are never picked on their own: live data carries future-dated test
 * entries, and one of those hid an approver's whole real month. `month`
 * pins the period (the screen's month switcher); `workMonths` lists every
 * month with something waiting, for that switcher. */
export function scopeSubmissions(slices, viewer, { today, month, allowed } = {}) {
  const all = groupSubmissions(slices, { viewer, allowed });
  const visible = all;
  const months = (list) => [...new Set(list.map((g) => g.month).filter(Boolean))].sort();
  const thisMonth = today ? String(today).slice(0, 7) : null;
  const notFuture = (m) => !thisMonth || m <= thisMonth;
  const withWork = months(visible.filter((g) => g.counts.pending));
  const shown = months(visible);
  const period =
    (month && shown.includes(month) ? month : null) ??
    withWork.filter(notFuture).at(-1) ??
    shown.filter(notFuture).at(-1) ??
    withWork.at(-1) ??
    shown.at(-1) ??
    null;
  const inPeriod = visible.filter((g) => g.month === period);
  const workMonths = withWork.map((m) => ({
    month: m,
    waiting: visible.filter((g) => g.month === m).reduce((n, g) => n + g.counts.pending, 0),
  }));

  /* Order: still waiting first (largest first — the one that matters most),
     then everything already decided, then my own. */
  const rank = (g) => (g.isSelf ? 2 : g.counts.pending ? 0 : 1);
  inPeriod.sort((a, b) => rank(a) - rank(b) || b.value - a.value || a.raiserName.localeCompare(b.raiserName));

  return { period, submissions: inPeriod, all, workMonths };
}

/* "N of M done": a submission is done once nothing in it is still waiting
   — approved, rejected or split, it has been decided. */
export function doneCount(submissions) {
  const done = submissions.filter((g) => g.status !== 'pending').length;
  const total = submissions.length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

