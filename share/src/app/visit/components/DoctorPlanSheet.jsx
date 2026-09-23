'use client';

import { useMemo, useState } from 'react';
import { Sheet } from '@/design-system';
import { doctorPlan, filterPlan, groupByDoctor, groupByEvent } from '../data/selectors';
import { PlanControls } from './PlanControls';
import { useIncrementalList } from './useIncrementalList';
import { VisitEventGroup } from './VisitEventGroup';

/* Everything off. Held as a constant so "reset" is one reference rather than
   an object literal that has to be kept in step with the controls. */
const BLANK_FILTERS = { values: {}, sorts: {}, query: '' };

/* One person's own doctor plan, call by call.
 *
 * Opened from a node's "Dr plan" button. It lists the calls that person was
 * ON -- see doctorPlan -- so a rep sees their own day and a manager sees the
 * joint calls they actually attended, not a scroll of their reports' work
 * filed under their own name.
 *
 * EACH CALL EXPANDS TO ITS PARTICIPANTS, with each attendee's own arrival time
 * and their own geo-verified/force status. On the single-participant events
 * the live data actually holds that is one line; on a joint call it is the
 * only place the two people's outcomes can differ visibly.
 *
 * Capped, sorted completed-first, so the sixty shown are the sixty that
 * happened. The cap counts CALLS, not attendees: sixty rows is a scroll
 * budget, and a joint call is one row.
 *
 * ONE OPEN AT A TIME. The sheet is a phone-height scroll container; letting
 * every group stay open turns it into the flat list this replaced, and the
 * reader loses the doctor-per-line shape that makes it skimmable. */

export function DoctorPlanSheet({ member, team, rows, pob, periodLabel, showDate = false, onClose }) {
  /* Keyed by event id rather than an index, so it survives the list
     re-sorting or the period changing under it. */
  const [openId, setOpenId] = useState(null);

  /* WHAT THE CONTROLS ARE SET TO. Reset with the member below rather than
     kept: a search that survives opening somebody else's plan makes their
     plan look empty rather than filtered. */
  const [filters, setFilters] = useState(BLANK_FILTERS);

  /* CLEARED WHEN THE PERSON CHANGES. The sheet stays mounted between opens —
     `open` only decides whether it renders — so without this a search typed
     on one rep's plan is still applied when the next rep's opens, and their
     plan reads as empty rather than as filtered. Adjusted during render
     rather than in an effect: an effect would paint the new person's plan
     through the old person's filter first. */
  const [filteredFor, setFilteredFor] = useState(member?.id ?? null);
  if ((member?.id ?? null) !== filteredFor) {
    setFilteredFor(member?.id ?? null);
    setFilters(BLANK_FILTERS);
  }

  /* ONE CARD PER CALL, and over a month ONE CARD PER DOCTOR.

     A month of a rep's plan lists the same doctor once per visit — same name,
     same code, same specialty, three times over — and that repetition IS the
     fact worth reading, so groupByDoctor turns it into a count with the
     visits kept inside it. The day view keeps one card per call: every row
     there is the same date, and merging would hide a doctor seen twice in one
     morning behind the number two. */
  const events = useMemo(
    () => (member ? groupByEvent(doctorPlan(member, team, rows, pob)) : []),
    [member, team, rows, pob],
  );
  const calls = useMemo(
    () => (showDate ? groupByDoctor(events) : events),
    [events, showDate],
  );

  /* THE CONTROLS RUN OVER THE WHOLE PLAN, not over the page on screen. Every
     call is already in memory — one fetch covers the window — and the paging
     below is a rendering budget, not a data one. Filtering the rendered slice
     would answer "no results" about rows the reader has simply not scrolled
     past yet, which is what makes a half-wired search worse than none. */
  const shownCalls = useMemo(() => filterPlan(calls, filters), [calls, filters]);

  /* COUNTED IN VISITS, not in cards. The subtitle reports the plan, and a
     month in which one doctor was seen three times is three visits however
     many cards the list below draws them as. */
  const done = events.filter((c) => c.visitTime).length;
  /* Paged, not capped -- see useIncrementalList. Reset on the member AND on
     the controls: a reader who searches after scrolling to row 120 should
     land at the top of the answer, not 120 rows into it. */
  const { shown, hasMore, sentinelRef } = useIncrementalList(shownCalls.length, {
    resetKey: [member?.id, JSON.stringify(filters)].join('|'),
  });
  const visible = shownCalls.slice(0, shown);

  const subtitle = [
    periodLabel,
    `${events.length} ${events.length === 1 ? 'visit' : 'visits'} planned`,
    `${done} done`,
    /* Against what the FILTERS left, not against the whole plan: with a
       search applied, "showing 30 of 237" counts a list that is not on
       screen. The controls carry their own "N of M" for the other half. */
    hasMore ? `showing ${shown} of ${shownCalls.length}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Sheet
      open={member != null}
      onClose={onClose}
      surface="app"
      title={member ? `${member.name} · Dr plan` : ''}
      subtitle={subtitle}
      /* PINNED UNDER THE HEADING rather than scrolled with the rows. A search
         box that scrolls away is one the reader has to scroll back up to
         change, losing their place in the answer on the way. Only once there
         is something to sift: a toolbar over an empty plan is a row of ways
         to keep it empty. */
      toolbar={
        calls.length > 0 ? (
          <PlanControls
            calls={calls}
            value={filters}
            onChange={setFilters}
            resultCount={shownCalls.length}
            totalCount={calls.length}
          />
        ) : null
      }
    >
      {calls.length === 0 ? (
        /* Says whose plan is empty and why it can be. A manager who joined no
           calls this period is the normal case now, not a broken screen, and
           the old "No visits planned in this period." read as the latter. */
        <p className="py-4 text-12 text-ds-secondary">
          No visits {member?.short === 'BE' ? 'planned' : 'attended'} in this period.
        </p>
      ) : shownCalls.length === 0 ? (
        /* A DIFFERENT EMPTY. The plan is not empty — the controls emptied it,
           and saying "no visits planned" here would be a lie about the data
           rather than a report on the filter. */
        <p className="py-4 text-12 text-ds-secondary">No calls match these filters.</p>
      ) : (
        visible.map((call) => (
          <VisitEventGroup
            key={call.id}
            group={call}
            showDate={showDate}
            expanded={openId === call.id}
            onToggle={() => setOpenId(openId === call.id ? null : call.id)}
          />
        ))
      )}

      {/* The tripwire for the next page. Rendered only while there IS one, so
          a finished list has nothing at the bottom still watching. */}
      {hasMore ? <div ref={sentinelRef} aria-hidden="true" className="h-1" /> : null}
    </Sheet>
  );
}
