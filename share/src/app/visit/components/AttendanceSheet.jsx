'use client';

import { useMemo } from 'react';
import { ListRow, Sheet, StatusPill } from '@/design-system';
import { repsInAttendanceState } from '../data/selectors';
import { ATTENDANCE_SHEET_TITLE } from '../data/shape';
import { attainmentTone, formatRatio, hqLabel } from '../data/format';

/* The rows behind an attendance chip: who, specifically, is in this state.
 *
 * "46 not reporting" is a number a manager can do nothing with. The forty-six
 * NAMES are the actual work of the morning, and this is the shortest path
 * from the one to the other — the chip that reports the count is the control
 * that opens the list.
 *
 * Ordered by calls done rather than by name (see repsInAttendanceState): on
 * the Working list that puts the day's shape at the top, and on the other
 * three every row is zero anyway, so alphabetical would only be a second
 * ordering to learn.
 *
 * Every row shows the rep's manager. The person reading this is often two
 * levels up and the useful next action is "call whoever owns them", not
 * "call the rep".
 */

export function AttendanceSheet({ state, team, todayRows, onClose }) {
  const people = useMemo(
    () => (state ? repsInAttendanceState(team, todayRows, state) : []),
    [state, team, todayRows],
  );

  /* A vacant seat is not a person, and the count under the title is the one
     place that distinction is cheap to make and confusing to skip. */
  const noun = state === 'vacant' ? 'seat' : 'person';
  const plural = state === 'vacant' ? 'seats' : 'people';

  return (
    <Sheet
      open={state != null}
      onClose={onClose}
      surface="app"
      title={state ? ATTENDANCE_SHEET_TITLE[state] : ''}
      subtitle={`${people.length} ${people.length === 1 ? noun : plural} in this scope`}
    >
      {people.length === 0 ? (
        <p className="py-4 text-12 text-ds-secondary">Nobody in this scope is in this state.</p>
      ) : (
        people.map((p) => (
          <ListRow
            key={p.id}
            dense
            title={p.name}
            subtitle={[
              hqLabel(p.hq),
              p.managerName ? `reports to ${p.managerName}` : null,
              /* A vacant seat has no plan at all — nobody made one — so it
                 gets "no plan today" rather than "0/0 visits done", which
                 would read as a rep who was given work and did none. */
              p.planned > 0 ? `${formatRatio(p.happened, p.planned)} visits done` : 'no plan today',
            ]
              .filter(Boolean)
              .join(' · ')}
            trailing={
              p.planned > 0 ? (
                /* Toned by attainment, the same bands the tree and the HQ
                   cards colour their bars with, so a green pill here means
                   what green means everywhere else on the screen. */
                <StatusPill status={attainmentTone(p.happened / p.planned)} showDot={false}>
                  {p.happened} calls
                </StatusPill>
              ) : null
            }
          />
        ))
      )}
    </Sheet>
  );
}
