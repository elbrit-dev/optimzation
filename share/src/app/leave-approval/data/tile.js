import { GROUPS, shortDay } from './shape';

/* The Ring Nav tile for leave approvals, from the screen's own `waiting`
 * (shape.js) — so the strip and the screen never disagree.
 *
 *   count     leaves waiting on the viewer
 *   caption   "Today" when one starts today or has already started, else the
 *             first day of the soonest one ("12 Nov")
 *   segments  started (red) · in the next few days (amber) · later (grey)
 *
 * Nothing waiting → null: no tile. An approver with an empty queue does not
 * need a green ring on the strip every day; the tile comes back with work.
 *
 * The ERP's elbrit_ring_nav script is to build the same tile server-side (a
 * frappe.get_list of Open leaves where leave_approver or
 * custom_escalation_approver is the caller); this is its reference. */
export function leaveApprovalTile(waiting, { href = '/leave/approval' } = {}) {
  if (!waiting?.length) return null;
  const by = (id) => waiting.filter((l) => l.urgency === id).length;
  const started = by('started');
  const tone = { started: 'danger', soon: 'warning', later: 'neutral' };
  return {
    id: 'leave-approval',
    label: 'Leave',
    href,
    icon: 'calendar-minus',
    statusIcon: 'check-square',
    statusTone: 'neutral',
    count: waiting.length,
    caption: started ? 'Today' : shortDay(waiting[0].from),
    captionTone: started ? 'danger' : 'warning',
    segments: GROUPS.map((g) => ({ key: g.id, value: by(g.id), tone: tone[g.id], label: g.title })).filter((s) => s.value),
  };
}
