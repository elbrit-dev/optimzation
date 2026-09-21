'use client';

import { useMemo } from 'react';
import { ListRow, Sheet, StatusPill } from '@/design-system';
import { doctorPlan } from '../data/selectors';
import { formatClock, formatCurrency } from '../data/format';

/* One tree node's plan, doctor by doctor.
 *
 * This is the bottom of the drill: the report aggregates upward from these
 * rows, and this sheet is the only place on the screen that shows one.
 * Opened from a node's "Dr plan" button, so an RBM sees their whole region's
 * calls and a BE sees their own — the same selector, scoped by subtree.
 *
 * CAPPED AT 60 ROWS. A region's month is several thousand visits, and a
 * scroll container with a thousand list rows in it janks on the hardware
 * this runs on. The cap is stated in the subtitle rather than hidden behind
 * a fade: a list that silently stops is a list you cannot trust. Sorted
 * completed-first, so the sixty shown are the sixty that happened.
 *
 * The status is the screen's own green/red vocabulary — geo-verified, force
 * visit, pending — not a generic done/not-done. A force visit IS done; it is
 * the fact that it was logged away from the planned location that the
 * footer's "red = force visit" is teaching the reader to look for. */

const PLAN_LIMIT = 60;

export function DoctorPlanSheet({ member, team, rows, pob, periodLabel, onClose }) {
  const plan = useMemo(
    () => (member ? doctorPlan(member, team, rows, pob) : []),
    [member, team, rows, pob],
  );

  const done = plan.filter((v) => v.visitTime).length;
  const shown = plan.slice(0, PLAN_LIMIT);
  /* Whose name is already in the title. Repeating it on all sixty rows of a
     rep's own plan is noise; on a manager's it is the only way to tell one
     rep's calls from another's. */
  const showRep = member?.short !== 'BE';

  const subtitle = [
    periodLabel,
    `${plan.length} visits planned`,
    `${done} done`,
    plan.length > PLAN_LIMIT ? `showing first ${PLAN_LIMIT}` : null,
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
          <ListRow
            key={v.id}
            dense
            title={v.doctorName}
            /* `|| null` and not just the join: a pending call on a rep's own
               plan has no time, no rep name and no money, and an empty
               string still renders a 20px line of nothing under the name. */
            subtitle={
              [
                formatClock(v.visitTime),
                showRep ? v.employeeName : null,
                v.pob ? `${formatCurrency(v.pob)} POB` : null,
              ]
                .filter(Boolean)
                .join(' · ') || null
            }
            trailing={
              <StatusPill
                status={v.visitTime ? (v.forceVisit ? 'danger' : 'success') : 'neutral'}
                showDot={false}
              >
                {v.visitTime ? (v.forceVisit ? 'Force visit' : 'Visited') : 'Pending'}
              </StatusPill>
            }
          />
        ))
      )}
    </Sheet>
  );
}
