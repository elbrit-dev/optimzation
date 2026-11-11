/* Leave Application rows → the requests the Leave Approval screen draws.
 *
 * ONE ROW SHAPE IN, whatever it came from: the ERP's GraphQL node (links as
 * `x__name`, never nested — an approver is shared leaves of people whose
 * Employee they may not read, and one refused nested read fails the whole
 * query; see the calendar's leave.query.js) or the mock's plain rows.
 *
 * Everything the screen shows is worked out here, for ONE viewer on ONE day:
 *   mine        the viewer is the leave's approver, or its escalation
 *               approver (the next level up, who may decide too) once it
 *               has waited ESCALATE_AFTER_DAYS or has started
 *   urgency     started (first day today or already gone) / soon (within
 *               UPCOMING_DAYS) / later
 *   waitingDays since it was applied
 * Pure: no React, no network. */

export const UPCOMING_DAYS = 3;
/* The escalation approver (the level above) is shown a leave only once it
   has waited this many days on its approver, or has already started —
   otherwise every RBM's list would repeat every ABM's. */
export const ESCALATE_AFTER_DAYS = 2;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const clean = (v) => (v == null ? null : String(v).trim() || null);
const lower = (v) => clean(v)?.toLowerCase() ?? null;

/* "2026-11-11" ↔ a day number, UTC, so no time zone moves a date. */
export function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null;
}
export function isoOf(day) {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}
function parts(iso) {
  const d = new Date(dayNumber(iso) * 86400000);
  return { wd: WEEKDAYS[d.getUTCDay()], d: d.getUTCDate(), m: MONTHS[d.getUTCMonth()] };
}

/* "Wed 11 Nov" · "11 – 12 Nov" · "30 Nov – 2 Dec". */
export function rangeLabel(from, to) {
  const a = parts(from);
  if (!to || to === from) return `${a.wd} ${a.d} ${a.m}`;
  const b = parts(to);
  return a.m === b.m ? `${a.d} – ${b.d} ${b.m}` : `${a.d} ${a.m} – ${b.d} ${b.m}`;
}
export function shortDay(iso) {
  const p = parts(iso);
  return `${p.d} ${p.m}`;
}

/* The ERP's description is rich text ("<p>Family function </p>"). */
export function plainText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/* "Kerala - ELPL" → "Kerala"; a sales department reads as its HQ area. */
export function teamLabel(department) {
  return String(department ?? '').replace(/\s*-\s*ELPL$/i, '').trim() || null;
}

const STATUS = { open: 'Open', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };

/* One raw row (GraphQL node or mock) → the fields the screen reads. */
export function normalizeLeave(row) {
  if (!row) return null;
  const from = clean(row.from_date);
  if (!row.name || !from) return null;
  const to = clean(row.to_date) ?? from;
  return {
    name: row.name,
    employee: clean(row.employee__name ?? row.employee),
    employeeName: clean(row.employee_name) ?? clean(row.employee__name ?? row.employee),
    team: teamLabel(row.department__name ?? row.department),
    leaveType: clean(row.leave_type__name ?? row.leave_type) ?? 'Leave',
    from,
    to,
    halfDay: Boolean(Number(row.half_day ?? 0)),
    halfDayDate: clean(row.half_day_date),
    days: Number(row.total_leave_days ?? 0) || 0,
    reason: plainText(row.description),
    appliedOn: clean(row.posting_date) ?? clean(String(row.creation ?? '').slice(0, 10)),
    status: STATUS[lower(row.status)] ?? clean(row.status) ?? 'Open',
    approver: lower(row.leave_approver__name ?? row.leave_approver),
    approverName: clean(row.leave_approver_name),
    escalationApprover: lower(row.custom_escalation_approver__name ?? row.custom_escalation_approver),
    attachment: clean(row.custom_attachement),
    decidedOn: clean(String(row.modified ?? '').slice(0, 10)),
    decidedBy: lower(row.modified_by__name ?? row.modified_by),
    /* The ERP's live answer (elbrit_leave_approvals): who decides, and may
       the viewer — "approver" | "escalation" | "override" | null. */
    decide: row.decide
      ? {
          can: row.decide.can ?? null,
          approverNames: clean(row.decide.approver_names),
          escalationNames: clean(row.decide.escalation_names),
        }
      : null,
  };
}

/* Every row → { waiting, others, decided } for `viewer` on `today`.
 * The rows are already the ones the viewer may see (the ERP's
 * elbrit_leave_approvals decides: HR, IT, the CEO everyone's; anyone else
 * their team's), so:
 *   waiting  Open leaves the viewer may decide, most urgent first
 *   others   the other Open leaves — waiting on someone else, shown with who
 *            the decision waits on, no buttons — most urgent first
 *   decided  every Approved / Rejected leave, newest first */
export function shapeLeaves(rows, { viewer, today }) {
  const me = lower(viewer);
  const t = dayNumber(today);
  const all = (rows ?? []).map(normalizeLeave).filter(Boolean);

  const waitedOf = (l) => (l.appliedOn ? Math.max(0, t - dayNumber(l.appliedOn)) : 0);
  /* The ERP's live rule when the row carries it; else (mock, older ERP) the
     stored approver fields. */
  const reachesMe = (l) =>
    l.decide
      ? Boolean(l.decide.can)
      : l.approver === me || (l.escalationApprover === me && (waitedOf(l) >= ESCALATE_AFTER_DAYS || dayNumber(l.from) <= t));
  const roleOf = (l) => (l.decide ? l.decide.can : l.approver === me ? 'approver' : 'escalation');
  const withTiming = (l, role) => {
    if (l.decide?.approverNames) l = { ...l, approverName: l.decide.approverNames };
    const start = dayNumber(l.from);
    const urgency = start <= t ? 'started' : start - t <= UPCOMING_DAYS ? 'soon' : 'later';
    return { ...l, role, urgency, startsIn: start - t, waitingDays: waitedOf(l) };
  };
  const bySoonest = (a, b) => dayNumber(a.from) - dayNumber(b.from) || b.waitingDays - a.waitingDays;
  const open = all.filter((l) => l.status === 'Open');
  const waiting = open
    .filter((l) => !!me && reachesMe(l))
    .map((l) => withTiming(l, roleOf(l)))
    .sort(bySoonest);
  const others = open
    .filter((l) => !(me && reachesMe(l)))
    .map((l) => withTiming(l, 'watcher'))
    .sort(bySoonest);

  const decided = all
    .filter((l) => l.status === 'Approved' || l.status === 'Rejected')
    .sort((a, b) => String(b.decidedOn).localeCompare(String(a.decidedOn)));

  return { waiting, others, decided };
}

/* Groups for the list, in order, empty ones dropped. */
export const GROUPS = [
  { id: 'started', title: 'Starts today or already started', tone: 'danger' },
  { id: 'soon', title: `In the next ${UPCOMING_DAYS} days`, tone: 'warning' },
  { id: 'later', title: 'Later', tone: 'neutral' },
];
export function groupWaiting(waiting) {
  return GROUPS.map((g) => ({ ...g, items: waiting.filter((l) => l.urgency === g.id) })).filter((g) => g.items.length);
}
