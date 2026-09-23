'use client';

import { useMemo, useState } from 'react';
import { useVisitKpi } from '../data/useVisitKpi';
import {
  activeReps,
  attendance,
  byHq,
  callAverage,
  geoSplit,
  happened,
  planned,
  pobTotal,
  resolveSelection,
  subtreeOf,
  visitsByHour,
} from '../data/selectors';
import {
  countWorkingDays,
  formatMonthName,
  hqLabel,
  periodSuffix,
  toMonthKey,
  workingDaysBetween,
} from '../data/format';
import { isHqTerritory, shortDesignation } from '../data/shape';
import { ReportHeader } from './ReportHeader';
import { ScopeSelect } from './ScopeSelect';
import { PeriodTabs } from './PeriodTabs';
import { AttendanceCard } from './AttendanceCard';
import { AttendanceSheet } from './AttendanceSheet';
import { DoctorPlanSheet } from './DoctorPlanSheet';
import { VisitsByHourSheet } from './VisitsByHourSheet';
import { KpiGrid } from './KpiGrid';
import { ALL_HQS, HqSection } from './HqSection';
import { TeamTree } from './TeamTree';

/* The report itself. Everything the page shows lives here; the route around it
   only supplies a width.
 *
 * CONTAINER QUERIES, NOT MEDIA QUERIES — `@2xl/report:` and `@5xl/report:`
 * rather than `sm:` and `lg:`. This is the change that lets the width control
 * on /visit work at all: a media query reads the VIEWPORT, so a 390px wrapper
 * in a 1440px window would still match `lg:grid-cols-3` and the resizer would
 * change nothing but the crop. A container query reads the nearest named
 * container, which is the wrapper.
 *
 * It is also the more honest description of the layout. Nothing here cares how
 * big the window is; it cares how much room it has been given. That makes the
 * report droppable into a narrow column or a drawer without a rewrite.
 *
 * The thresholds are the stock container scale — @2xl is 672px and @5xl is
 * 1024px — chosen over arbitrary values so they stay tokens. They sit close to
 * the `sm` (640) and `lg` (1024) they replaced.
 *
 * The page owns exactly five pieces of state — the scope picks, period,
 * month, selected HQ, and which drill-down sheet is open — and derives
 * everything else, so the cards, the chart and the tree cannot disagree:
 * there is one set of rows, filtered once.
 *
 * THE SCOPE PICKER CARRIES THE WHOLE QUESTION: which people, at what
 * depth, however many branches. `picks` is an array of
 * `{ id, includeSubtree }` and everything the report shows is the UNION of
 * those branches — ids into a Set, so picking a manager and one of their
 * own reports counts that report once rather than twice.
 *
 * THE HOOK IS NEVER TOLD ABOUT THE PICKS, and this reads from its
 * UNSCOPED output (`allTeam`/`allRows`) rather than its scoped one. Two
 * reasons: a union of four branches is not a subtree, so there is no
 * single id the hook could have been given — and narrowing from a
 * pre-scoped pool silently drops any pick that falls outside it. That
 * second one is not hypothetical: with a non-manager viewer the picker
 * offers company roots while the hook scopes to that one person, so every
 * pick was being discarded and the control looked dead.
 *
 * The permission boundary lives in ScopeSelect, which decides what may be
 * offered at all. It is not this narrowing's job, and making it both was
 * what coupled them.
 *
 * This replaced a Team Report / My Report dropdown, which could only ever
 * mean "the scoped person, or the scoped person alone" and had to be kept
 * in step with the picker beside it by hand.
 *
 * Reporting on one person rather than a team hides the two pieces that are
 * ABOUT a team and say nothing about an individual: who is in the field
 * today, and the "reps active" clause on the HQ detail. A roster card
 * reading "1 of 1 in field" is not an answer anyone needed.
 *
 * `monthRange` is the odd one out: every other piece of state re-slices
 * data already in hand, but the dataset only covers the months asked for,
 * so changing it refetches (see useVisitKpi). It is held here rather than
 * inside PeriodTabs because the header, the KPI labels and the doctor-plan
 * sheet all have to say WHICH months, and a picker owning the value
 * privately would leave three places guessing.
 *
 * It is kept as the picker's own [Date, Date] and converted to 'YYYY-MM'
 * on the way down, rather than stored as strings and rebuilt as Dates on
 * the way back up. Round-tripping a Date through a month string and back
 * is where a timezone bug gets in, and the picker is the only thing here
 * that wants Dates at all.
 *
 * THE SHEETS LIVE HERE, not in the components that open them. One `sheet`
 * value means two cannot be open at once, and a sheet opened from the
 * attendance card reads the same `todayRows` the card counted — a card that
 * owned its own sheet would be free to fetch or filter its own copy, which
 * is the one way a drill-down can contradict the number it came from.
 *
 * `data-surface="app"` puts the column on the field-app density scale (22px
 * controls, 12px body) rather than the console's. Everything inside reads that
 * from the tokens; no component takes a `size` prop for it. */

export function VisitReport({ gqlEnvironment, gqlToken } = {}) {
  /* null until the reader picks, because the default -- the viewer and
     their whole branch -- cannot be named before the hook has resolved who
     the viewer IS. Derived below rather than seeded, so it can never go
     stale against a roster that arrived afterwards. */
  const [picks, setPicks] = useState(null);
  const [period, setPeriod] = useState('today');
  /* null means "whichever month the dataset's today falls in" -- resolved
     below from `today`, not eagerly from `new Date()`. The browser's date
     and the data source's can differ, and pinning one here would make the
     default month a client-clock fact rather than a dataset fact. */
  const [monthRange, setMonthRange] = useState(null);
  /* ALL_HQS, not the first HQ: the section opens on the totals, and the way
     back to them is the same card as the way in. */
  const [hq, setHq] = useState(ALL_HQS);
  /* null, { kind: 'attendance', state }, { kind: 'plan', memberId } or
     { kind: 'hour', selection }. One slot, so opening a doctor plan from
     inside the tree closes an attendance sheet rather than stacking a
     second scrim on the first. */
  const [sheet, setSheet] = useState(null);

  /* undefined, not null, for both: `useVisitKpi` and `periodWindow` read
     absence as "the month today falls in", and a null would have to be
     special-cased in each of them instead. */
  const monthFrom = monthRange?.[0] ? toMonthKey(monthRange[0]) : undefined;
  const monthTo = monthRange?.[1] ? toMonthKey(monthRange[1]) : monthFrom;

  const {
    allTeam: team,
    allRows: rows,
    allTodayRows: todayRows,
    allPob: pob,
    root,
    viewerId,
    today,
    window: win,
    asOf,
    truncated,
    ready,
    loading,
    error,
  } = useVisitKpi({
    /* No scopeId: the hook resolves the viewer for `root`, which is only
       used here as the DEFAULT pick. Everything else reads the unscoped
       roster, so what the picker may offer is ScopeSelect's decision
       alone rather than a second boundary that has to agree with it. */
    period,
    month: monthFrom,
    monthTo,
    gqlEnvironment,
    gqlToken,
  });

  /* The viewer and their whole branch, until something is ticked. Memoised
     on the id alone so the picker is not handed a new array every render --
     TreeSelect keys an effect off it. */
  const defaultPicks = useMemo(
    () => (root ? [{ id: root.id, includeSubtree: true }] : []),
    [root?.id],
  );
  /* A pick can name somebody the roster no longer contains. Dropping those
     and falling back keeps the report on SOMETHING rather than reporting on
     nobody and not saying why.

     Memoised because this array is the picker's `value`, and TreeSelect runs
     an effect off it — a fresh identity every render would re-run that
     effect on every keystroke elsewhere on the page. */
  /* null vs [] is the whole reason the top can be unticked -- see
     resolveSelection. Conflating them is what made clearing the last node
     snap straight back to the default. */
  const selection = useMemo(
    () => resolveSelection(picks, team, defaultPicks),
    [picks, team, defaultPicks],
  );

  /* Distinct from "the scope resolved to one person". Nothing is selected at
     all, which is a state the reader asked for rather than a dead end. */
  const nothingSelected = selection.length === 0;

  /* The one narrowing, and the only place ids from several branches meet.
     A Set, so a branch and a member of it overlap into one count rather
     than two. */
  const scoped = useMemo(() => {
    const ids = new Set();
    for (const pick of selection) {
      if (pick.includeSubtree) for (const m of subtreeOf(team, pick.id)) ids.add(m.id);
      else ids.add(pick.id);
    }
    return {
      team: team.filter((m) => ids.has(m.id)),
      rows: rows.filter((r) => ids.has(r.employeeId)),
      todayRows: todayRows.filter((r) => ids.has(r.employeeId)),
    };
  }, [selection, team, rows, todayRows]);

  /* One person, one report about a person. Two or more and the cards are
     about a group again, whatever shape the picks were. */
  const isMine = scoped.team.length <= 1;
  const focus = selection.length === 1 ? team.find((m) => m.id === selection[0].id) : null;

  /* ATTENDANCE FOLLOWS THE PERIOD. It used to be a right-now fact in both
     views — today's rows, even under month figures — which meant a card
     reading "2 reported / 219 not reported" sat on top of a month in which
     220 people had been out working. The two numbers were each true and read
     as a contradiction, because one of them answered a question nobody on
     this screen had asked.
   *
   * `attendanceRows` is therefore the period's rows in month view and
   * today's in today view, and `overRange` travels with them so the states
   * are classified the same way the card counted them — see attendanceOf. */
  const overRange = period === 'month';
  const attendanceRows = overRange ? scoped.rows : scoped.todayRows;
  /* THE DAYS THE ATTENDANCE STATES ARE MEASURED OVER: every working day in
     the window, Monday to Saturday. It is the calendar rather than the plan
     because a day nobody scheduled is still a day nobody reported — see
     daysOf. Memoised on the window's ends, since it is rebuilt into a day
     record for every person in scope. */
  const calendar = useMemo(
    () => (overRange ? workingDaysBetween(win.from, win.to) : [today]),
    [overRange, win.from, win.to, today],
  );

  const view = useMemo(() => {
    const att = attendance(attendanceRows, scoped.team, overRange, calendar);
    const hqRows = byHq(scoped.rows, scoped.team);
    /* A selected HQ can vanish when the scope changes. Falling back to the
       totals is safe; falling back to hqRows[0] would silently show a
       different territory under the same heading. */
    const activeHq = hqRows.some((h) => h.hq === hq) ? hq : ALL_HQS;
    /* "All HQs" means all the REAL HQs, not everything. byHq only counts a
       territory whose name starts with "HQ-" (see isHqTerritory), so the
       chart and the geo split beside those cards have to draw from the same
       pool -- otherwise the bars would include visits filed against a state
       or an unset territory that no card above them is counting. */
    const hqScoped = activeHq === ALL_HQS
      ? scoped.rows.filter((r) => isHqTerritory(r.hq))
      : scoped.rows.filter((r) => r.hq === activeHq);

    /* Summed from the cards rather than recomputed, so the "All HQs" card can
       never disagree with the ones beside it. */
    const totals = hqRows.reduce(
      (acc, h) => ({
        planned: acc.planned + h.planned,
        happened: acc.happened + h.happened,
        verified: acc.verified + h.verified,
        force: acc.force + h.force,
        activeReps: acc.activeReps + h.activeReps,
        totalReps: acc.totalReps + h.totalReps,
      }),
      { planned: 0, happened: 0, verified: 0, force: 0, activeReps: 0, totalReps: 0 },
    );

    const happenedCount = happened(scoped.rows);
    /* NULL, NOT ZERO, until the quotations land. They are the last wave (see
       liveSource) and the money cards are the only thing on this screen that
       waits for them; showing the total as ₹0 for that second would be a
       figure rather than a gap, and formatCurrency already draws a null as an
       em dash. */
    const pobAmount = ready.pob ? pobTotal(pob) : null;

    return {
      att,
      hqRows,
      activeHq,
      totals,
      hourly: visitsByHour(hqScoped),
      /* The exact rows the chart and the geo bar were built from, handed on
         so the sheet behind them re-filters the SAME list rather than
         re-deriving the HQ scope from scratch. A drill-down that recomputes
         its own pool is the one way it can disagree with the bar it came
         from -- see the `sheet` note at the top. */
      chartRows: hqScoped,
      geo: geoSplit(hqScoped),
      planned: planned(scoped.rows),
      happened: happenedCount,
      pobAmount,
      /* Same "don't divide when there's nothing to divide by" rule as
         callAverage below -- a rupee figure over zero completed visits is
         not "infinite per call", it is not a figure at all yet. */
      pobPerCall: pobAmount != null && happenedCount > 0 ? pobAmount / happenedCount : null,
      /* Per rep PER DAY, so the month view is comparable to the daily standard
         of 12 rather than reporting five days' work as one rep's score.

         The divisor in My Report is the one person, counted directly.
         `activeReps` cannot supply it: it counts BEs only, so a manager
         reading their own calls would divide by zero and get an em dash
         where their own average belongs. */
      callAverage: callAverage(
        scoped.rows,
        isMine ? (happenedCount > 0 ? 1 : 0) : activeReps(scoped.rows, scoped.team),
        countWorkingDays(win.from, win.to),
      ),
      repCount: scoped.team.filter((m) => m.short === 'BE' && !m.vacant).length,
    };
  }, [scoped, attendanceRows, overRange, calendar, pob, ready.pob, hq, isMine, win.from, win.to]);


  /* The two ways the page has to name its period in words. Derived HERE, not
     in the components that print them: telling "MTD" from "Aug" needs both
     the picked month and the DATASET's today, and neither a metric card nor
     a sheet has any business knowing the second. */
  const suffix = periodSuffix(period, monthFrom, today ?? '', monthTo);
  /* A phrase rather than the suffix: the sheet's subtitle starts with it, and
     "today · 199 visits planned" does not read as a sentence the way "Today ·
     199 visits planned" does. A past month gets its name in full — "Aug" is
     fine tacked onto a label, thin as the opening word of a subtitle. */
  const planLabel =
    period !== 'month'
      ? 'Today'
      : monthFrom && monthFrom !== monthTo
        ? `${formatMonthName(monthFrom)} – ${formatMonthName(monthTo)}`
        : !monthFrom || monthFrom === today?.slice(0, 7)
          ? 'This month'
          : formatMonthName(monthFrom);

  /* The picker's value when nothing has been chosen: the month the
     DATASET's today falls in, as a one-month range. Memoised on the date
     string because RangePicker re-reads `value` in an effect, and a fresh
     array on every render would have it resetting mid-interaction. Built
     from local Date parts for the timezone reason toMonthKey documents. */
  const defaultRange = useMemo(() => {
    if (!today) return null;
    const [y, m] = today.slice(0, 7).split('-').map(Number);
    return [new Date(y, m - 1, 1), new Date(y, m, 0)];
  }, [today]);

  /* The picker's ceiling: the DATASET's today, so a month with nothing in
     it yet cannot be chosen. Not `new Date()` -- the browser's clock and
     the source's can disagree, and the one that decides what is 'future'
     here has to be the one the data came from. */
  const maxMonth = useMemo(() => {
    if (!today) return null;
    const [y, m, d] = today.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [today]);

  /* The team caption counts a roster. In My Report there is no roster to
     count, so it says who you are looking at instead of reporting "0 BE in
     scope · 0 vacant" about a single person. */
  /* Three shapes, because three things are being described: one person, one
     team, or a union that has no single name. The union's caption drops the
     name entirely and reports the size of what was added up -- claiming any
     one of the picked managers as the subject would be wrong about the
     other two. */
  const scopeCaption =
    selection.length > 1
      ? `${view.repCount} BE across ${selection.length} selections · ${view.att.counts.vacant} vacant`
      : !focus
        ? null
        : isMine
          ? [focus.name, shortDesignation(focus.designation), hqLabel(focus.hq)].filter(Boolean).join(' · ')
          : `${focus.name} · ${shortDesignation(focus.designation)} · ${view.repCount} BE in scope · ${view.att.counts.vacant} vacant`;

  const scopePicker = (
    <ScopeSelect
      team={team}
      value={selection}
      rootId={root?.id}
      viewerId={viewerId}
      onChange={(next) => {
        setPicks(next);
        /* The selected HQ belongs to the OLD picks. Keeping it would show a
           chart for a territory the new selection may not own. */
        setHq(ALL_HQS);
        /* Same reason as the HQ reset: an open sheet belongs to the OLD
           rows. It would keep rendering them under a heading that now names
           a different team. */
        setSheet(null);
      }}
    />
  );

  return (
    <div
      data-surface="app"
      className="@container/report min-h-full bg-sunken"
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-3 @2xl/report:max-w-3xl @2xl/report:gap-5 @2xl/report:p-5 @5xl/report:max-w-6xl @5xl/report:gap-6 @5xl/report:p-6">
        {/* Controls. Narrow, they stack — 390px cannot hold a title, a picker
            and two tabs without one of them becoming a hit-target hazard.
            From @2xl they collapse into a single bar: same components, same
            state, no duplicate markup. */}
        <div className="flex flex-col gap-4 @2xl/report:flex-row @2xl/report:items-start @2xl/report:justify-between @2xl/report:gap-6">
          <div className="flex flex-col gap-4 @2xl/report:gap-1">
            <ReportHeader
              root={focus}
              period={period}
              window={win}
              asOf={asOf}
              /* Two titles, not three. "3 selected" described the PICKER
                 rather than the report — the reader does not need the page
                 counting their own clicks back at them, and the caption
                 below already says how many branches were summed. One person
                 is My Report; anything wider is a team, however many
                 branches it was assembled from. */
              title={isMine ? 'My report' : 'Team report'}
              caption={scopeCaption}
            />
            {/* Below the header when narrow, where full width is worth more
                than adjacency; beside it from @2xl. */}
            <div className="@2xl/report:hidden">{scopePicker}</div>
          </div>

          <div className="flex flex-col gap-3 @2xl/report:w-72 @2xl/report:shrink-0">
            <div className="hidden @2xl/report:block">{scopePicker}</div>
            <PeriodTabs
              value={period}
              range={monthRange ?? defaultRange}
              maxDate={maxMonth}
              onChange={setPeriod}
              onRangeChange={setMonthRange}
            />
          </div>
        </div>

        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-12 text-danger">
            Could not load live visit data: {error.message ?? String(error)}
          </p>
        ) : null}

        {/* Not an error: every number below is real, there are just more
            rows behind them than the source will return in one page. Above
            the cards because it changes how you read them, and present at
            all because the alternative is a total that looks ordinary and
            is short. */}
        {/* `truncated` is an OBJECT now, so this must test its fields: the
            object itself is always truthy and the banner would never go
            away. The window is split by date until each page fits (see
            fetchWindowed), so this only fires when a SINGLE DAY exceeds the
            page size — at which point there is nothing left to narrow and
            the old "pick fewer months" advice was unusable anyway. */}
        {(truncated.visits || truncated.pob) && !error ? (
          <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-12 text-warning">
            One day in this range holds more{' '}
            {truncated.visits && truncated.pob ? 'visits and orders' : truncated.visits ? 'visits' : 'orders'}
            {' '}than can be loaded at once, so the figures below are short. Pick a narrower range.
          </p>
        ) : null}

        {loading && !error ? (
          <p className="text-12 text-ds-secondary">Loading…</p>
        ) : nothingSelected ? (
          /* An asked-for empty, not a failure — so it reads as an instruction
             rather than an error, and the picker above it stays the way out.
             Rendering the cards over an empty scope would be worse than this:
             a grid of zeros and em dashes looks like a team that did nothing,
             which is a different claim entirely. */
          <p className="rounded-lg border border-line-subtle p-4 text-12 text-ds-secondary">
            No team selected. Pick one or more managers above to see their visits.
          </p>
        ) : (
          <>
            {/* Summary band. Full width at every size: these five numbers are the
                answer to "how is today going", and burying them in a column would
                make a wide screen worse than a phone.

                The five cards STRETCH to one height. `items-start` used to sit
                here, on the grounds that matching the taller attendance card left
                the KPI cards half empty — true at the time, and fixed the wrong
                way round. The attendance card has since lost the 8px that made it
                the odd one out, so the height they share is the KPI cards' own
                and nothing is padded out to reach it. */}
            <div className="grid gap-4 @5xl/report:grid-cols-3 @5xl/report:gap-6">
              {isMine ? null : (
                <div className="@5xl/report:col-span-1">
                  <AttendanceCard
                    period={period}
                    counts={view.att.counts}
                    working={view.att.working}
                    inScope={view.att.inScope}
                    /* Day-based over a range, so the four counts can double
                       up on the same person -- see attendanceStatesOf. */
                    overlapping={view.att.overlapping}
                    onDrill={(state) => setSheet({ kind: 'attendance', state })}
                  />
                </div>
              )}
              {/* The KPIs take the attendance card's columns too when there is
                  no attendance card — four numbers across a third of the grid
                  would wrap to two lines to leave a gap where a card is not. */}
              <div className={isMine ? 'min-w-0 @5xl/report:col-span-3' : 'min-w-0 @5xl/report:col-span-2'}>
                <KpiGrid
                  periodSuffix={suffix}
                  planned={view.planned}
                  happened={view.happened}
                  pobAmount={view.pobAmount}
                  pobPerCall={view.pobPerCall}
                  callAverage={view.callAverage}
                  repCount={view.repCount}
                />
              </div>
            </div>

            {/* Detail. One column until @5xl — the hourly chart needs the width
                more than the tree does, so they only sit side by side where both
                fit without either being squeezed. */}
            <div className="grid gap-4 @5xl/report:grid-cols-3 @5xl/report:items-start @5xl/report:gap-6">
              <div className="min-w-0 @5xl/report:col-span-2">
                <HqSection
                  showReps={!isMine}
                  hqRows={view.hqRows}
                  activeHq={view.activeHq}
                  onSelectHq={setHq}
                  hourly={view.hourly}
                  geo={view.geo}
                  totals={view.totals}
                  onDrillVisits={(selection) => setSheet({ kind: 'hour', selection })}
                />
              </div>

              {/* The scoped branch in full, even when the cards are reporting
                  on one person -- it is the breakdown of what the picker
                  could widen to, and hiding it would leave no way to see
                  what "own" is being measured against. */}
              <TeamTree
                key={selection.map((pick) => pick.id).join(',')}
                team={team}
                rows={rows}
                pob={pob}
                rootIds={selection.map((pick) => pick.id)}
                onDoctorPlan={(member) => setSheet({ kind: 'plan', memberId: member.id })}
                /* The tree classifies attendance the same way the card above
                   it does, or the two disagree about the same person. */
                overRange={overRange}
              />
            </div>

            {/* All three sheets are always mounted and closed by their own open
                prop rather than conditionally rendered, so Sheet's effect —
                focus capture, scroll lock, the restore on the way out — runs
                as a clean open/close pair instead of a mount/unmount race
                when one sheet replaces the other. */}
            <AttendanceSheet
              state={sheet?.kind === 'attendance' ? sheet.state : null}
              team={scoped.team}
              /* THE ROWS THE CARD COUNTED, and the flag it counted them
                 under. A sheet that re-derived either would be free to
                 disagree with the chip that opened it. */
              rows={attendanceRows}
              overRange={overRange}
              /* The same calendar the card counted with, so the list a chip
                 opens is measured over the same days. */
              calendar={calendar}
              onClose={() => setSheet(null)}
            />
            <DoctorPlanSheet
              /* Resolved out of the CURRENT team rather than stored whole.
                 A member object captured at open time would keep rendering
                 after the roster under it changed. */
              member={sheet?.kind === 'plan' ? (team.find((m) => m.id === sheet.memberId) ?? null) : null}
              team={team}
              rows={rows}
              pob={pob}
              periodLabel={planLabel}
              /* A month window is thirty days, so a clock time alone cannot
                 say WHEN a call happened — the card leads with the date. On
                 Today it would repeat the heading on every row. */
              showDate={period === 'month'}
              onClose={() => setSheet(null)}
            />
            <VisitsByHourSheet
              selection={sheet?.kind === 'hour' ? sheet.selection : null}
              rows={view.chartRows}
              /* Only to resolve each attendee's rung for the card's role
                 pill; the rows themselves are already scoped. */
              team={team}
              periodLabel={planLabel}
              /* Which HQ the bar was drawn for. The sheet is opened from a
                 card that is already filtered, and without this its title
                 reads the same whether you tapped 2pm on Hubballi or on all
                 three HQs. */
              scopeLabel={view.activeHq === ALL_HQS ? 'All HQs' : hqLabel(view.activeHq)}
              /* Only worth a column on each row when the rows can differ.
                 Filtered to one HQ they cannot, and the subtitle says it. */
              showHq={view.activeHq === ALL_HQS}
              /* Same reason as the doctor plan sheet: a 2pm bar over a month
                 is thirty different afternoons. */
              showDate={period === 'month'}
              onClose={() => setSheet(null)}
            />
          </>
        )}
      </div>
    </div>
  );
}
