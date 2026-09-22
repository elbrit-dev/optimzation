'use client';

import { useMemo } from 'react';
import { Sheet } from '@/design-system';
import { doctorPlan } from '../data/selectors';
import { formatClock, formatCurrency } from '../data/format';
import { SHEET_ROW_LIMIT, VisitListRow, limitNote } from './VisitListRow';

/* One tree node's plan, doctor by doctor.
 *
 * This is the bottom of the drill: the report aggregates upward from these
 * rows, and this sheet is the only place on the screen that shows a whole
 * plan — the calls that happened AND the ones still open. Its counterpart,
 * VisitsByHourSheet, can only ever show the former.
 *
 * Opened from a node's "Dr plan" button, so an RBM sees their whole region's
 * calls and a BE sees their own — the same selector, scoped by subtree.
 *
 * Capped, sorted completed-first, so the sixty shown are the sixty that
 * happened. The row itself — the pill, the force-visit line, the way the
 * facts are joined — is VisitListRow's, shared with the hourly sheet. */

export function DoctorPlanSheet({ member, team, rows, pob, periodLabel, onClose }) {
  const plan = useMemo(
    () => (member ? doctorPlan(member, team, rows, pob) : []),
    [member, team, rows, pob],
  );

  const done = plan.filter((v) => v.visitTime).length;
  const shown = plan.slice(0, SHEET_ROW_LIMIT);
  /* Whose name is already in the title. Repeating it on all sixty rows of a
     rep's own plan is noise; on a manager's it is the only way to tell one
     rep's calls from another's. */
  const showRep = member?.short !== 'BE';

  const subtitle = [
    periodLabel,
    `${plan.length} visits planned`,
    `${done} done`,
    limitNote(plan.length),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Sheet
      open={member != null}
      onClose={onClose}
      surface="app"
      title={member ? `${member.name} · doctor plan` : ''}
      subtitle={subtitle}
    >
      {plan.length === 0 ? (
        <p className="py-4 text-12 text-ds-secondary">No visits planned in this period.</p>
      ) : (
        shown.map((v) => (
          <VisitListRow
            key={v.id}
            visit={v}
            /* "Visited", not the screen's usual "Geo verified": this is the
               one list that also holds calls which have NOT happened, so the
               contrast the reader needs from the green pill is against
               "Pending" beside it, not against the red. */
            verifiedLabel="Visited"
            facts={[
              formatClock(v.visitTime),
              showRep ? v.employeeName : null,
              v.pob ? `${formatCurrency(v.pob)} POB` : null,
            ]}
          />
        ))
      )}
    </Sheet>
  );
}
