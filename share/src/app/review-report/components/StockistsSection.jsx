'use client';

import { useMemo, useState } from 'react';
import { Card, Metric, SectionLabel, SegmentedControl, Sheet, StatusPill, ListRow } from '@/design-system';
import { THRESHOLDS } from '../data/selectors';
import { count, monthShort, ratio, rupees } from '../data/format';
import { Empty, Notice } from './bits';

/* Stockists holding at least twice what they sold this month — summed over
 * every seat in scope, because one distributor carries lines for several
 * divisions' seats. "Chronic" is ≥ 2× three months running; "dead" is stock
 * with no sales at all. An entry with no stock and no sales is not dead — it
 * is an entry nobody filled in, and is left out. */

const VIEWS = [
  { id: 'over', label: 'Overstocked' },
  { id: 'chronic', label: 'Chronic' },
  { id: 'all', label: 'All' },
];

function Bars({ series }) {
  const max = Math.max(1, ...series.flatMap((p) => [p.sold ?? 0, p.closing ?? 0]));
  return (
    <div className="flex h-6 items-end gap-0.5" aria-hidden="true">
      {series.map((p, k) => (
        <div key={k} className="flex h-full items-end gap-px">
          <span className="w-1 rounded-t-sm" style={{ height: `${((p.sold ?? 0) / max) * 100}%`, background: 'var(--brand-primary)' }} />
          <span className="w-1 rounded-t-sm" style={{ height: `${((p.closing ?? 0) / max) * 100}%`, background: 'var(--status-draft)' }} />
        </div>
      ))}
    </div>
  );
}

export function StockistsSection({ stock, months, mi, open }) {
  const [view, setView] = useState('over');
  const [pick, setPick] = useState(null);
  const rows = useMemo(() => {
    if (!stock || stock.missing) return [];
    if (view === 'over') return stock.rows.filter((r) => r.over || r.dead);
    if (view === 'chronic') return stock.rows.filter((r) => r.chronic);
    return stock.rows;
  }, [stock, view]);

  if (!stock || stock.missing) return <Empty>No secondary entered for {monthShort(months[mi])} in this scope.</Empty>;
  const s = stock.summary;
  const from = Math.max(0, mi - 5);   // as selectors.stockists builds `series`

  return (
    <div className="flex flex-col gap-4">
      {open && months[mi] >= open ? (
        <Notice>{monthShort(months[mi])} is still being entered — only what has been sent is counted.</Notice>
      ) : null}
      <div className="grid grid-cols-2 gap-3 @2xl/report:grid-cols-4">
        <Card padding="app"><Metric label={`At ${THRESHOLDS.overstock}× or more`} value={`${s.over} of ${s.stockists}`} caption="closing ≥ 2 × sold" tone="neutral" /></Card>
        <Card padding="app"><Metric label="Stock above 2×" value={rupees(s.excess)} caption="closing beyond two months of sales" tone="neutral" /></Card>
        <Card padding="app"><Metric label="Chronic" value={String(s.chronic)} caption={`≥ 2× for ${THRESHOLDS.chronic}+ months`} tone="neutral" /></Card>
        <Card padding="app"><Metric label="Stock cover" value={ratio(s.cover)} caption={`${s.dead} with stock and no sales`} tone="neutral" /></Card>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <SectionLabel className="mb-0">{count(rows.length, 'stockist')}</SectionLabel>
          <SegmentedControl items={VIEWS} value={view} onChange={setView} ariaLabel="Which stockists" />
        </div>
        <Card padding="none">
          {rows.length ? (
            rows.map((r) => (
              <ListRow
                key={r.name}
                onClick={() => setPick(r)}
                title={r.name}
                subtitle={[r.seats.join(', '), r.streak > 1 ? `${r.streak} months ≥ 2×` : null].filter(Boolean).join(' · ')}
                trailing={(
                  <div className="flex items-center gap-3">
                    <span className="hidden @2xl/report:inline"><Bars series={r.series} /></span>
                    <div className="text-right tabular-nums">
                      <div className="text-13 font-semibold text-heading">{r.dead ? 'No sales' : ratio(r.ratio)}</div>
                      <div className="text-11 text-ds-muted">{rupees(r.closing)} / {rupees(r.sold)}</div>
                    </div>
                  </div>
                )}
              />
            ))
          ) : (
            <Empty>None this month.</Empty>
          )}
        </Card>
        <p className="mt-1.5 text-11 text-ds-muted">Closing / sold for {monthShort(months[mi])}. Bars: sold (blue) and closing (grey), last 6 months.</p>
      </div>

      <Sheet open={Boolean(pick)} onClose={() => setPick(null)} title={pick?.name} subtitle={pick?.seats.join(', ')}>
        {pick ? (
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap gap-2">
              {pick.over ? <StatusPill status="pending">{ratio(pick.ratio)} of a month&apos;s sales in stock</StatusPill> : null}
              {pick.chronic ? <StatusPill status="rejected">Chronic</StatusPill> : null}
              {pick.dead ? <StatusPill status="rejected">Stock, no sales</StatusPill> : null}
            </div>
            <table className="w-full text-13 tabular-nums">
              <thead>
                <tr className="text-11 text-ds-muted">
                  <th className="py-1 text-left font-medium">Month</th>
                  <th className="py-1 text-right font-medium">Sold</th>
                  <th className="py-1 text-right font-medium">Closing</th>
                  <th className="py-1 text-right font-medium">Cover</th>
                </tr>
              </thead>
              <tbody>
                {pick.series.map((p, k) => (
                  <tr key={k} className="border-t border-[var(--border-subtle)]">
                    <td className="py-1.5 text-ds-secondary">{monthShort(months[from + k])}</td>
                    <td className="py-1.5 text-right">{p.sold == null ? '—' : rupees(p.sold)}</td>
                    <td className="py-1.5 text-right">{p.closing == null ? '—' : rupees(p.closing)}</td>
                    <td className="py-1.5 text-right font-medium text-heading">{p.sold ? ratio(p.closing / p.sold) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
