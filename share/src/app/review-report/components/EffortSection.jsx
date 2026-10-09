'use client';

import { useState } from 'react';
import { SectionLabel, SegmentedControl } from '@/design-system';
import { effortGrid, hqDayTable } from '../data/selectors';
import { Empty, Notice } from './bits';
import { MonthGrid } from './MonthGrid';

/* The EFFORT ANALYSIS sheets, from ERP visits (Doctor Visit plan Events —
 * the same counting as the Visit report) and approved Leave Applications.
 *
 * "Own" is the paper sheet: the SM's / RBM's own effort. "Team" adds up
 * everyone in scope — days and leave become person-days, coverage a sum of
 * each person's distinct doctors (a doctor two people visit counts twice). */

const VIEWS = [
  { id: 'own', label: 'Own' },
  { id: 'team', label: 'Team' },
];

const n0 = (v) => (v == null ? '—' : Math.round(v).toLocaleString('en-IN'));
const n1 = (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('en-IN'));

export function EffortSection({ ix, scope, mi, open, onMonth, loading }) {
  // A department, or several picks, has no seat of its own: only the team's effort.
  const isDept = scope.sel?.kind !== 'seat';
  const [view, setView] = useState('own');
  const own = !isDept && view === 'own';

  if (!ix.raw?.effort) {
    return <Empty>{loading ? 'Loading visits and leave…' : 'No visit data for this scope.'}</Empty>;
  }
  const grid = effortGrid(ix, scope, own);
  const months = ix.months.slice(ix.fyStart).map((m, k) => ({ i: ix.fyStart + k, month: m }));
  const at = (i) => grid.rows.find((r) => r.i === i);
  const rows = [
    { key: 'working', label: 'Working days', sub: own ? 'Mon–Sat' : 'Mon–Sat × people', value: (i) => at(i)?.working, fmt: n0 },
    { key: 'days', label: 'Reporting days', sub: own ? 'days with visits' : 'person-days with visits', value: (i) => at(i)?.days, fmt: n0, strong: true },
    { key: 'leave', label: 'Leave', sub: 'approved, days', value: (i) => at(i)?.leave || null, fmt: n1 },
    { key: 'callAvg', label: 'Call average', sub: 'visits per reporting day', value: (i) => at(i)?.callAvg, fmt: n1, strong: true },
    { key: 'coverage', label: 'Doctor coverage', sub: 'distinct doctors visited', value: (i) => at(i)?.coverage, fmt: n0 },
    { key: 'visits', label: 'Visits', sub: 'done', value: (i) => at(i)?.visits, fmt: n0 },
    { key: 'planned', label: 'Planned', value: (i) => at(i)?.planned, fmt: n0 },
    { key: 'newDocs', label: 'New doctors engaged', sub: 'first visit in 12+ months', value: (i) => at(i)?.newDocs, fmt: n0 },
    { key: 'joint', label: 'Joint working days', value: (i) => at(i)?.joint, fmt: n0 },
  ];
  if (!own) rows.unshift({ key: 'people', label: 'People', sub: 'with a plan that month', value: (i) => at(i)?.people, fmt: n0 });

  const hq = hqDayTable(ix, scope, own, 'hqDays') ?? [];
  const jw = hqDayTable(ix, scope, own, 'jwDays') ?? [];
  const hqRowsOf = (list) => list.map((r) => ({
    key: r.hq,
    label: r.hq.replace(/^HQ-/, ''),
    value: (i) => r.by.get(i) ?? null,
    fmt: n0,
    total: r.total,
  }));

  return (
    <div className="flex flex-col gap-4">
      {!isDept ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-12 text-ds-secondary">
            {own ? 'This seat’s own visits — the paper sheet.' : `All ${grid.people} people in scope, added up.`}
          </p>
          <SegmentedControl items={VIEWS} value={view} onChange={setView} ariaLabel="Whose effort" />
        </div>
      ) : null}
      {own && !grid.people ? (
        <Notice>No one holds this seat, so it has no effort of its own — switch to Team.</Notice>
      ) : null}

      <div>
        <SectionLabel>Effort, month by month</SectionLabel>
        <MonthGrid months={months} rows={rows} mi={mi} open={open} onMonth={onMonth} />
      </div>

      <div>
        <SectionLabel>{own ? 'Days in each HQ' : 'Person-days in each HQ'} · regions covered</SectionLabel>
        {hq.length ? (
          <MonthGrid months={months} rows={hqRowsOf(hq)} mi={mi} first="HQ" total={(r) => n0(r.total)} dense />
        ) : (
          <Empty>No visits.</Empty>
        )}
      </div>

      <div>
        <SectionLabel>Joint working days by HQ · JW details</SectionLabel>
        {jw.length ? (
          <MonthGrid months={months} rows={hqRowsOf(jw)} mi={mi} first="HQ" total={(r) => n0(r.total)} dense />
        ) : (
          <Empty>No joint visits.</Empty>
        )}
      </div>

      <p className="text-11 text-ds-muted">
        From ERP Doctor Visit plans (counted as the Visit report counts them) and approved Leave Applications.
        Leave is only what was applied for in ERP. Joint = a visit with a colleague on the same plan.
      </p>
    </div>
  );
}
