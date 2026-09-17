'use client';

import { useMemo, useState } from 'react';
import { useVisitKpi } from './lib/useVisitKpi';
import {
  activeReps,
  attendance,
  byHq,
  callAverage,
  geoSplit,
  happened,
  planned,
  pobTotal,
  visitsByHour,
} from './lib/selectors';
import { countWorkingDays } from './lib/format';
import { shortDesignation } from './lib/shape';
import { ReportHeader } from './ui/ReportHeader';
import { ScopeSelect } from './ui/ScopeSelect';
import { PeriodTabs } from './ui/PeriodTabs';
import { AttendanceCard } from './ui/AttendanceCard';
import { KpiGrid } from './ui/KpiGrid';
import { ALL_HQS, HqSection } from './ui/HqSection';
import { TeamTree } from './ui/TeamTree';

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
 * The page owns exactly three pieces of state — scope, period, selected HQ —
 * and derives everything else, so the cards, the chart and the tree cannot
 * disagree: there is one set of rows, filtered once.
 *
 * `data-surface="app"` puts the column on the field-app density scale (22px
 * controls, 12px body) rather than the console's. Everything inside reads that
 * from the tokens; no component takes a `size` prop for it. */

export function VisitReport({ gqlEnvironment, gqlTokenOverride } = {}) {
  const [scopeId, setScopeId] = useState(null);
  const [period, setPeriod] = useState('today');
  /* ALL_HQS, not the first HQ: the section opens on the totals, and the way
     back to them is the same card as the way in. */
  const [hq, setHq] = useState(ALL_HQS);

  const { team, allTeam, rows, todayRows, pob, root, window: win, asOf, source, loading, error } = useVisitKpi({
    scopeId,
    period,
    gqlEnvironment,
    gqlTokenOverride,
  });

  const view = useMemo(() => {
    const att = attendance(todayRows, team);
    const hqRows = byHq(rows, team);
    /* A selected HQ can vanish when the scope changes. Falling back to the
       totals is safe; falling back to hqRows[0] would silently show a
       different territory under the same heading. */
    const activeHq = hqRows.some((h) => h.hq === hq) ? hq : ALL_HQS;
    const hqScoped = activeHq === ALL_HQS ? rows : rows.filter((r) => r.hq === activeHq);

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

    const happenedCount = happened(rows);
    const pobAmount = pobTotal(pob);

    return {
      att,
      hqRows,
      activeHq,
      totals,
      hourly: visitsByHour(hqScoped),
      geo: geoSplit(hqScoped),
      planned: planned(rows),
      happened: happenedCount,
      pobAmount,
      /* Same "don't divide when there's nothing to divide by" rule as
         callAverage below -- a rupee figure over zero completed visits is
         not "infinite per call", it is not a figure at all yet. */
      pobPerCall: happenedCount > 0 ? pobAmount / happenedCount : null,
      /* Per rep PER DAY, so the month view is comparable to the daily standard
         of 12 rather than reporting five days' work as one rep's score. */
      callAverage: callAverage(rows, activeReps(rows, team), countWorkingDays(win.from, win.to)),
      repCount: team.filter((m) => m.short === 'BE' && !m.vacant).length,
    };
  }, [rows, todayRows, pob, team, hq, win.from, win.to]);

  const scopeCaption = root
    ? `${shortDesignation(root.designation)} · Sales · ${view.repCount} BE in scope · ${view.att.counts.vacant} vacant`
    : null;

  const scopePicker = (
    <ScopeSelect
      team={allTeam}
      value={root?.id ?? ''}
      rootId={root?.id}
      onChange={(id) => {
        setScopeId(id);
        /* The selected HQ belongs to the OLD scope. Keeping it would show a
           chart for a territory the new manager may not own. */
        setHq(ALL_HQS);
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
            <ReportHeader root={root} period={period} window={win} asOf={asOf} />
            {/* Below the header when narrow, where full width is worth more
                than adjacency; beside it from @2xl. */}
            <div className="@2xl/report:hidden">{scopePicker}</div>
            {scopeCaption ? <p className="text-10 text-ds-secondary">{scopeCaption}</p> : null}
          </div>

          <div className="flex flex-col gap-3 @2xl/report:w-72 @2xl/report:shrink-0">
            <div className="hidden @2xl/report:block">{scopePicker}</div>
            <PeriodTabs value={period} onChange={setPeriod} />
          </div>
        </div>

        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-12 text-danger">
            Could not load live visit data: {error.message ?? String(error)}
          </p>
        ) : null}

        {loading && !error ? (
          <p className="text-12 text-ds-secondary">Loading…</p>
        ) : (
          <>
            {/* Summary band. Full width at every size: these five numbers are the
                answer to "how is today going", and burying them in a column would
                make a wide screen worse than a phone.

                `items-start` so the KPI cards keep their natural height instead of
                stretching to match the taller attendance card, which left each of
                them half empty. */}
            <div className="grid gap-4 @5xl/report:grid-cols-3 @5xl/report:items-start @5xl/report:gap-6">
              <div className="@5xl/report:col-span-1">
                <AttendanceCard
                  period={period}
                  counts={view.att.counts}
                  working={view.att.working}
                  inScope={view.att.inScope}
                />
              </div>
              <div className="min-w-0 @5xl/report:col-span-2">
                <KpiGrid
                  period={period}
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
                  hqRows={view.hqRows}
                  activeHq={view.activeHq}
                  onSelectHq={setHq}
                  hourly={view.hourly}
                  geo={view.geo}
                  totals={view.totals}
                />
              </div>

              <TeamTree team={team} rows={rows} rootId={root?.id} />
            </div>
          </>
        )}

        <p className="pb-6 text-10 text-ds-muted">
          {source === 'mock'
            ? 'Showing generated sample data. Hierarchy, HQs and volumes mirror the live ERPNext instance; no visit is real. Green = geo-verified, red = force visit.'
            : 'Live data from ERPNext. Green = geo-verified, red = force visit.'}
        </p>
      </div>
    </div>
  );
}
