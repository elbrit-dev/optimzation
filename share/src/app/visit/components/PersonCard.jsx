'use client';

import { Avatar, cx } from '@/design-system';
import { formatDayHeading, formatDecimal, hqLabel } from '../data/format';
import { ATTENDANCE_LABEL } from '../data/shape';
import { GeoBar } from './GeoBar';
import { Chevron, PinIcon } from './icons';

/* A rep, as a card — the attendance sheet's answer to "who, specifically".
 *
 * THE SAME CARD AS A TREE ROW, and deliberately: avatar, name, territory;
 * role chip; the plan taken apart underneath. The sheet opens from a chip on
 * the same screen as the tree, and a reader should not have to re-learn where
 * to look between them.
 *
 * THE NUMBER IS IN THE TOP RIGHT and the bar takes it apart underneath —
 * `504/504` answers "how much", the bar answers "how much of it counts". It
 * replaced "504/504 visits done · 504 calls", which was one number three
 * times over: a figure, its denominator, and a pill repeating it, none of
 * which said how many of those 504 were logged where they were meant to be.
 *
 * NO MANAGER LINE. It read "reports to X" under every name, which is a fact
 * about the ORG on a card about a DAY — and in this sheet the reader has
 * usually arrived from that manager's own row. */

/* The days themselves, once the card is opened.
 *
 * A TABLE, not a sentence of commas. Nine dates run together are unreadable,
 * and the eye is scanning for a pattern — three Mondays, the second week —
 * which needs them in a column. Same compact 11px table VisitEventGroup uses
 * for attendees, for the same reason.
 *
 * The right-hand cell is what was lost. Never a bare "0", which reads as a
 * day with no work rather than a day of work not done. The half-done wording
 * exists for the day a rep logged something and stopped — rare on the list
 * this opens from (see AttendanceSheet's canOpen: it is the Not reported one)
 * but real, since a plan can be edited after the fact. */
export function PersonDays({ days }) {
  /* THE SILENT DAYS ONLY. A person on this list can have reported on other
     days — the buckets are day based now, so the same name appears under
     Reported too — and listing the days they DID work under a "Not reported"
     heading answers a question nobody asked. The card's own bar already says
     how much of the plan they did. */
  const silent = days.filter((d) => d.happened === 0);
  if (silent.length === 0) return null;

  return (
    <table className="w-full table-fixed border-collapse text-11">
      <tbody>
        {silent.map((d) => (
          <tr key={d.date} className="align-baseline">
            <td className="py-0.5 pr-2 text-ds-secondary">{formatDayHeading(d.date)}</td>
            {/* TWO KINDS OF SILENT DAY, and the difference is whose problem
                it is. "3 planned, none done" is a rep who was given work and
                did not do it; "no plan" is a day nobody scheduled them for,
                which is a planning gap and reads as one. Collapsing both into
                "none done" would hide the second entirely. */}
            <td className="py-0.5 text-right tabular-nums text-ds-muted">
              {d.planned > 0 ? `${d.planned} planned, none done` : 'No plan'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


/* The leave itself, once an Absent card is opened: which days, and what kind
 * of leave each was.
 *
 * THE TYPE IS THE POINT. "Away six days" is a fact a manager can do nothing
 * with; "four days casual, two days sick" is the difference between a rep who
 * took a holiday and one who is unwell, and it decides whether the right next
 * move is to reassign the territory or to leave them alone.
 *
 * Same compact table PersonDays uses, so the two drill-downs read as one
 * thing seen from two lists. */
export function PersonLeave({ days }) {
  if (!days?.length) return null;

  return (
    <table className="w-full table-fixed border-collapse text-11">
      <tbody>
        {days.map((d) => (
          <tr key={d.date} className="align-baseline">
            <td className="py-0.5 pr-2 text-ds-secondary">{formatDayHeading(d.date)}</td>
            {/* Falls back to the bare word rather than an empty cell: the
                leave type is mandatory in ERPNext, so a blank one means the
                link is broken, and a row that says nothing at all reads as a
                rendering fault rather than as missing data. */}
            <td className="py-0.5 text-right text-ds-muted">{d.type || 'Leave'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* WHICH DAYS THE FIGURE COUNTS, keyed by the attendance state the list is
   showing — so the word over the number is the same word on the chip that
   opened the sheet and on the sheet's own title. An invented second
   vocabulary ("reported" / "missed" / "absent") was one rename away from
   disagreeing with all three. */
const DAY_COUNT = {
  working: (p) => p.reportedDays ?? 0,
  notReporting: (p) => (p.days?.length ?? 0) - (p.reportedDays ?? 0),
  onLeave: (p) => p.leaveDays?.length ?? 0,
};

export function PersonCard({ person, dayState = null, expandable = false, expanded = false }) {
  /* The window's working days, Monday to Saturday — `days` is seeded from
     the calendar now, so it holds every one of them whether or not the rep
     was given a plan that day. */
  const dayCount = person.days?.length ?? 0;
  /* THE FIGURE ANSWERS THE LIST'S OWN QUESTION. Under Reported the reader
     wants the days that went well; under Not reported they want the ones
     that did not, and making them subtract 17 from 20 to get there is work
     the card can do. Same denominator either way, so the two lists are
     reading one calendar — and a rep on both lists has two figures that add
     up to it. */
  const dayValue = dayState ? DAY_COUNT[dayState]?.(person) ?? 0 : 0;
  /* Null rather than 0 when there are no days to divide by — an em dash is
     honest about a figure that does not exist, and "0.0 calls/day" is a
     claim about a rep nobody gave a window to. */
  const callAverage = dayCount > 0 ? (person.happened ?? 0) / dayCount : null;
  return (
    <span className={cx('flex w-full flex-col gap-2')}>
      <span className="flex w-full items-start gap-2.5">
        {/* Decorative: the name is immediately beside it, so announcing it
            again is noise. Same reasoning as DoctorCard and the tree. */}
        <Avatar name={person.name} size="sm" aria-hidden="true" />

        <span className="block min-w-0 flex-1 truncate text-13 font-semibold text-heading">
          {person.name}
        </span>

        {/* DAYS REPORTED OVER WORKING DAYS, set exactly as HqCard sets its
            figure: the number at the heading weight, its denominator small
            and muted beside it.

            IT WAS VISITS DONE OVER PLANNED, which the bar underneath already
            decomposes — the same fact twice, and the less useful of the two
            once the attendance states went day based. Days is what the chip
            counts, and it separates a rep who logged forty visits on two days
            from one who logged twenty across ten.

            THE TWO NUMBERS AGREE WITH THE LISTS, which they did not when the
            denominator and the bucket rule counted different days: "17/20"
            appeared under Reported while the rep was absent from Not
            reported, and the three missing days had nowhere to be found. Both
            now run off the same calendar of working days, so x < y on this
            card if and only if the same person is also under Not reported,
            and the days making up the difference are the ones that list
            opens onto.

            IT SAYS WHICH DAYS IT IS COUNTING. "17/20" alone left the reader
            to infer that from the sheet they had opened — and the inference
            flips between lists, so the same shape of figure meant days made
            on one and days lost on the next. The word is ATTENDANCE_LABEL's,
            the same one on the chip that opened the sheet.

            NOTHING ON A SINGLE DAY. "1/1" is a ratio with nothing to vary —
            the sheet's own title already says which day it is. */}
        {dayState && dayCount > 0 ? (
          <span className="flex shrink-0 items-baseline gap-1">
            <span className="text-10 text-ds-muted">{ATTENDANCE_LABEL[dayState]}</span>
            {/* "days" IS THE UNIT, and it earns its width. Everything else on
                this card counts visits — the bar, the legend, the whole
                screen — so a bare "17/20" beside them reads as visits until
                the reader works out that it cannot be. */}
            <span className="tabular-nums">
              <span className="text-13 font-semibold text-heading">{dayValue}</span>
              <span className="text-11 text-ds-muted">/{dayCount} days</span>
            </span>
          </span>
        ) : null}
      </span>

      {/* LINE TWO IS ITS OWN ROW, not a second line inside the name's column.
          Nested there it ended at the ratio's left edge, so the territory
          stopped short of the card and the right-hand margin read as ragged.
          Out here it spans the full width: role at the left, territory hard
          against the right edge, one margin down the whole card.

          Indented past the avatar so it starts under the name rather than
          under the initials — the bar below is full-bleed on purpose, being
          a measure of the card rather than a fact about the person. */}
      <span className="flex w-full items-center justify-between gap-2 pl-[calc(var(--ds-avatar-sm)+var(--space-10))]">
        {/* The chip wears the specialty badge's colours, the same as the
            tree's — see TeamTree's RoleLine for why brand tint and not
            green. */}
        <span className="flex min-w-0 items-center gap-2">
          {person.short ? (
            <span className="shrink-0 whitespace-nowrap rounded-chip bg-brand-tint-weak px-2 py-0.5 text-10 font-semibold uppercase tracking-wide text-brand-text">
              {person.short}
            </span>
          ) : null}

          {/* CALL AVERAGE, beside the role because it is the other thing that
              describes the rep rather than the period — "a BE doing 5.8 a
              day" is one phrase.
           *
              DIVIDED BY THE WINDOW'S WORKING DAYS, not by the days they
              turned up. That is what the Call average KPI above the sheet
              divides by, and two figures on one screen called the same thing
              have to be the same thing: on the other denominator a rep who
              worked twice and did twelve calls each time would read "12 a
              day" beside a team figure of four, and be the best rep on the
              screen for having worked twice.

              No tone. The company standard is a per-day target for the TEAM
              figure; applying it to one rep here would colour a judgement
              this card has no business making.

              GATED ON `dayState`, which is not a coincidence: it is null in
              exactly the two cases where a rate has nobody or nothing to be a
              rate OF — a vacant seat, where there is no rep to have an
              average, and a single day, where "calls per day" is the visit
              count the bar underneath already draws. */}
          {dayState && callAverage != null ? (
            <span className="shrink-0 whitespace-nowrap text-10 text-ds-secondary">
              {formatDecimal(callAverage)} calls/day
            </span>
          ) : null}
        </span>

        {/* The pin is what says "this is a place" without spending a word on
            it — the same one DoctorCard puts beside a doctor's territory, now
            shared. It never shrinks; the name beside it truncates. */}
        <span className="flex min-w-0 items-center gap-2">
          {person.hq ? (
            <span className="flex min-w-0 items-center gap-1 text-10 text-ds-secondary">
              <PinIcon />
              <span className="min-w-0 truncate">{hqLabel(person.hq)}</span>
            </span>
          ) : null}
          {/* The promise that there is something behind this card, on the
              line the reader's eye already ends on. Aria-hidden: the row's
              own button already announces its expanded state. */}
          {expandable ? <Chevron open={expanded} /> : null}
        </span>
      </span>

      {/* Nothing at all when there was no plan — see GeoBar. On the Vacant
          and Absent lists that is every row, and three zeroes under each name
          would be a page of furniture. */}
      <GeoBar
        planned={person.planned}
        happened={person.happened}
        verified={person.verified}
        force={person.force}
        jointVerified={person.jointVerified}
        jointForce={person.jointForce}
        jointPending={person.jointPending}
      />
    </span>
  );
}
