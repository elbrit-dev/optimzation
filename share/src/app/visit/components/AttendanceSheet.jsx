'use client';

import { useMemo, useState } from 'react';
import { DisclosureRow, Sheet } from '@/design-system';
import { repsInAttendanceState } from '../data/selectors';
import { attendanceSheetTitle } from '../data/shape';
import { PersonCard, PersonDays, PersonLeave } from './PersonCard';
import { PersonTrend } from './PersonTrend';
import { useIncrementalList } from './useIncrementalList';

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
 * THE ROWS OPEN ONTO THEIR DAYS over a range — the silent ones listed on the
 * Not reported sheet, the whole run charted on the Reported one. Since the
 * states went day based the same person is on both lists, and "when" is the
 * question neither the chip nor the card can answer. See canOpen.
 */

export function AttendanceSheet({ state, team, rows, overRange = false, calendar = [], onClose }) {
  /* One open row at a time, owned here rather than by the card: two open
     day-tables push the third off the screen, and the reader is comparing
     people, not reading two at once. Same move VisitsByHourSheet makes. */
  const [openId, setOpenId] = useState(null);
  const people = useMemo(
    () => (state ? repsInAttendanceState(team, rows, state, overRange, calendar) : []),
    [state, team, rows, overRange, calendar],
  );

  /* "Not reported" is two hundred-odd people on a live morning, so the list
     pages in as the reader scrolls rather than rendering all of them at once
     -- the same hook the doctor plan and hourly sheets use. Reset keyed on
     the state so switching chips starts at the top rather than scrolled deep
     into a list that no longer exists. */
  const { shown, hasMore, sentinelRef } = useIncrementalList(people.length, { resetKey: state });
  const visible = people.slice(0, shown);

  /* WHICH ROWS OPEN, and onto what.
   *
   * Both lists open now, because the states are day based and the same person
   * is legitimately on both: twelve days out, six days silent. The card can
   * only say how much; the day behind it says when.
   *
   *   Not reported → the silent days, listed. "Which days did I lose."
   *   Reported     → the run of days, as a chart. "Was that twelve days of
   *                  work or one good Tuesday?" — the question a chip
   *                  reading "Reported" cannot answer on its own.
   *
   *   Absent       → the leave itself: which days, and what kind. "Away six
   *                  days" is a fact nobody can act on; "four casual, two
   *                  sick" decides whether to reassign the territory or to
   *                  leave the rep alone.
   *
   * None of them opens over a single day: "which days" is the sheet's own
   * title. Vacant never opens — an empty seat has no days to show. */
  const canOpen = (person) => {
    if (!overRange) return false;
    if (state === 'onLeave') return (person.leaveDays?.length ?? 0) > 0;
    if (state === 'working' || state === 'notReporting') return person.days.length > 0;
    return false;
  };

  /* A vacant seat is not a person, and the count under the title is the one
     place that distinction is cheap to make and confusing to skip. */
  const noun = state === 'vacant' ? 'seat' : 'person';
  const plural = state === 'vacant' ? 'seats' : 'people';

  return (
    <Sheet
      open={state != null}
      onClose={onClose}
      surface="app"
      title={state ? attendanceSheetTitle(state, overRange) : ''}
      subtitle={[
        `${people.length} ${people.length === 1 ? noun : plural} in this scope`,
        /* Counts what is on screen against the whole list rather than
           announcing a cap: the rest is a scroll away, not withheld. */
        hasMore ? `showing ${shown}` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {people.length === 0 ? (
        <p className="py-4 text-12 text-ds-secondary">No one in this scope.</p>
      ) : (
        visible.map((p) => (
          /* A card rather than a list row, matching the doctor plan and
             hourly sheets — see PersonCard. The chrome is the shared
             .ds-card-row so the three read as one screen. */
          <DisclosureRow
            key={p.id}
            className="ds-card-row"
            expandable={canOpen(p)}
            expanded={openId === p.id}
            onToggle={() => setOpenId(openId === p.id ? null : p.id)}
            header={
              <PersonCard
                person={p}
                /* THE FIGURE ANSWERS THE LIST IT IS ON, and says so: the
                   card prints the state's own label beside it. Same
                   denominator throughout — the window's working days — so a
                   rep on two lists shows two numerators against one total,
                   and they add up.

                   VACANT SHOWS NOTHING. A seat has nobody to have reported or
                   missed anything, and "0/22" against an empty chair is a
                   figure about a person who does not exist. */
                dayState={overRange && state !== 'vacant' ? state : null}
                expandable={canOpen(p)}
                expanded={openId === p.id}
              />
            }
          >
            <div className="pt-1">
              {state === 'working' ? <PersonTrend days={p.days} /> : null}
              {state === 'notReporting' ? <PersonDays days={p.days} /> : null}
              {state === 'onLeave' ? <PersonLeave days={p.leaveDays} /> : null}
            </div>
          </DisclosureRow>
        ))
      )}

      {/* The tripwire for the next page; gone once there is nothing left. */}
      {hasMore ? <div ref={sentinelRef} aria-hidden="true" className="h-1" /> : null}
    </Sheet>
  );
}

