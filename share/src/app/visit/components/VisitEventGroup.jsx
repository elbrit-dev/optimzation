'use client';

import { DisclosureRow, StatusPill } from '@/design-system';
import { formatClock, formatCurrency, formatPlanDay } from '../data/format';
import { DoctorCard } from './DoctorCard';
import { forceNote, visitStatus } from './VisitListRow';

/* One CALL, with the people who made it underneath.
 *
 * The header is the doctor — one line per call, not per attendee, so a joint
 * visit stops reading as the same doctor listed twice for no stated reason.
 * Expanding it names each participant with their OWN arrival time and their
 * own geo-verified/force status, because that is the half of a joint call
 * that genuinely differs between the two people standing in it.
 *
 * ALWAYS EXPANDABLE, even at one participant. Every Doctor Visit plan event
 * in the live data carries exactly one, so a caret that appeared only on the
 * rare joint call would be a control most readers never meet and would not
 * recognise when they did. A uniform row is worth more than a saved tap.
 *
 * The group tone is optimistic — red only when EVERY attendee forced it (see
 * groupByEvent). A mixed call says so in words instead, because "1 of 2
 * forced" is the fact, and flattening it to a colour would either accuse the
 * rep of the manager's shortcut or hide the manager's entirely. */

/* `showHq` defaults ON. It started off defaulting to false, copied from the
   hourly sheet where the strip has already filtered to one territory and the
   column would repeat the subtitle — but this component is only used by the
   doctor plan sheet, which is scoped to a PERSON and whose rows really do
   span HQs. The wrong default meant the card rendered with no territory at
   all and nobody passed the prop to say otherwise. */
export function VisitEventGroup({
  group,
  expanded,
  onToggle,
  showHq = true,
  /* A clock time alone answers "when" only inside a single day. Over a month
     "12:31 PM" is thirty possible days, so the date leads when the window is
     wider than one -- see the `period` wiring in VisitReport. */
  showDate = false,
}) {
  const { participants } = group;

  /* The group carries the same three fields visitStatus reads -- visitTime
     and forceVisit, resolved across its attendees by groupByEvent -- so the
     header and the rows inside it speak one vocabulary off one function. */
  const headerStatus = visitStatus(group);

  /* The facts that belong to the CALL rather than to a person.
     The HQ is not here -- it moved to the card's right rail, where it
     identifies the doctor rather than the call. Neither are the attendee
     counts: the role pill below says who came AND how each of them fared,
     which is what "2 attended · 1 forced" was gesturing at without ever
     naming the person responsible. */
  const facts = [
    /* HOW MANY DAYS, when the card is a whole month's visits to one doctor
       (see groupByDoctor). It leads the fact line because it is the reason
       this card differs from its neighbours — the times below it are details
       of it. A doctor seen once says nothing here: "1 day visit" on every
       other card is a label, not a fact. */
    group.dayCount > 1 ? `${group.dayCount} day visits` : null,
    /* A PENDING CALL HAS NO TIME, so it falls back to the day it is planned
       for. Without this the whole fact line was empty on a pending card --
       no time, no money -- and a row that says nothing but the doctor's name
       reads as a rendering fault rather than as work still to do. The plan is
       all-day (see shape.js), so a date is the most precise thing there is. */
    /* AND NOT A SINGLE TIME once the card covers several days: the earliest
       arrival of three visits is a fact about one of them, printed where a
       reader would take it for the card's. The dates and times are all in the
       table, one per row, which is where three of them belong. */
    group.dayCount > 1
      ? null
      : group.visitTime
        ? [showDate && group.plannedDate ? formatPlanDay(group.plannedDate) : null, formatClock(group.visitTime)]
          .filter(Boolean)
          .join(' · ')
        : (group.plannedDate ? `Planned ${formatPlanDay(group.plannedDate)}` : null),
    group.pob ? `${formatCurrency(group.pob)} POB` : null,
  ].filter(Boolean);

  /* One segment per attendee, in the order they arrived (groupByEvent keeps
     the caller's sort). Tone is that PERSON's outcome, never the group's --
     the whole point is that a joint call's two halves can differ.

     A rung the roster could not resolve is dropped rather than shown as a
     blank segment, which would read as a fourth status. */
  /* ONE SEGMENT PER RUNG, not per attendance. On a single call those are the
     same thing; on a doctor seen three times by the same rep they are not,
     and "BE BE BE" said nothing the day count beside it does not say better.
     The outcome shown for a rung is the optimistic one, matching the group's
     own rule: forced only when every one of that rung's attendances was
     forced, pending only when none of them happened. */
  const roles = [...participants
    .filter((p) => p.participantShort)
    .reduce((acc, p) => {
      const seen = acc.get(p.participantShort) ?? [];
      seen.push(p);
      acc.set(p.participantShort, seen);
      return acc;
    }, new Map())]
    .map(([label, visits]) => {
      const done = visits.filter((v) => v.visitTime);
      const status = visitStatus({
        visitTime: done.length ? done[0].visitTime : null,
        forceVisit: done.length > 0 && done.every((v) => v.forceVisit),
      });
      return { label, tone: status.tone, status: status.label };
    });

  return (
    <DisclosureRow
      expandable
      expanded={expanded}
      onToggle={onToggle}
      className="ds-card-row"
      header={
        <DoctorCard
          name={group.doctorName}
          code={group.doctorId}
          hq={showHq ? group.hq : null}
          city={group.doctorCity}
          specialty={group.doctorSpecialty}
          categories={group.doctorCategories}
          /* The call's own facts go under the name, where the reference card
             put the doctor's town -- this screen is a visit report, so what
             belongs in that slot is when it happened and who was there. */
          note={facts.join(' · ') || null}
          roles={roles}
          /* The card draws its own chevron on the attendee line; DisclosureRow's
             marker column is hidden for .ds-card-row. */
          expandable
          expanded={expanded}
          trailing={
            <StatusPill status={headerStatus.tone} showDot={false}>
              {headerStatus.label}
            </StatusPill>
          }
        />
      }
    >
      {/* A REAL TABLE, because this is tabular: the same three facts about
          each attendee, and the whole point of opening a joint call is
          comparing them down a column. Stacked name-over-time blocks put
          every arrival time at a different x, so "who got there first" had to
          be read rather than seen.

          `table-fixed` is what makes the name cell truncate — an auto table
          sizes columns to content and would push the card wide again, the
          same trap the right rail and the header both fell into.

          NO HEADER ROW. A joint call is two or three people; a header would
          be a third of the table's height to label columns that a name, a
          clock time and a status pill already announce. */}
      <table className="w-full table-fixed border-collapse text-11">
        <tbody>
          {/* IN THE ORDER THEY HAPPENED. Within one call the attendees arrive
              in whatever order the plan listed them, which groupByEvent
              preserves; across a merged card the rows are separate days and
              want to read down the calendar. Pending rows, having no moment,
              settle at the end rather than heading the list. */}
          {[...participants].sort((a, b) => {
            if (!a.visitTime || !b.visitTime) return (a.visitTime ? -1 : 0) + (b.visitTime ? 1 : 0);
            return a.visitTime.localeCompare(b.visitTime);
          }).map((p) => {
            const status = visitStatus(p);
            const note = forceNote(p);

            return (
              <tr key={p.id} className="align-baseline">
                <td className="py-1 pr-2">
                  <span className="block truncate">{p.participantName}</span>
                  {/* Under the name rather than in a column of its own: it is
                      free text of no fixed width, and giving it a column
                      would size that column to the longest reason anyone has
                      ever typed. */}
                  {note ? <span className="block text-10 text-danger">{note}</span> : null}
                </td>
                {/* Fixed and tabular so the times stack into a readable
                    column. 'Pending' is the widest thing that lands here.

                    THE DATE JOINS THE TIME over a window wider than a day —
                    on a card merged by doctor these rows are different days,
                    and a column of bare clock times would read as one
                    afternoon's worth of visits. Stacked rather than widened:
                    the name beside it has the width to lose. */}
                <td className="w-20 py-1 tabular-nums text-ds-secondary">
                  {showDate && p.plannedDate ? (
                    <span className="block text-10">{formatPlanDay(p.plannedDate)}</span>
                  ) : null}
                  <span className="block">{formatClock(p.visitTime) || '—'}</span>
                </td>
                <td className="w-24 py-1 text-right">
                  <StatusPill status={status.tone} showDot={false}>
                    {status.label}
                  </StatusPill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DisclosureRow>
  );
}
