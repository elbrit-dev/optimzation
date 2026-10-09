'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, ChipRow, Field, Icon, Metric, SegmentedControl, cx } from '@/design-system';
import { productList } from '../data/selectors';
import { monthShort, pct, ratio, rupees } from '../data/format';
import { Empty, Notice, Spark } from './bits';

/* Every product the scope moved this FY, ranked — the New Prod. / Incent.
 * Prod. sheets widened to the whole range, from ERP: secondary (sold by
 * stockists, from Secondary Data Entry lines) and primary (invoiced, Sales
 * Invoice by department + HQ).
 *
 * One row per product: this month's secondary in ₹ with a bar for its share
 * of the scope (single hue — the bar is a magnitude, not a category), strips
 * sold, the change on last month, YTD, primary and primary ÷ secondary, and
 * the trend FY-to-date. Sort by what the review is asking; filter by brand. */

const SORTS = [
  { id: 'sec', label: 'Secondary' },
  { id: 'pri', label: 'Primary' },
  { id: 'up', label: 'Rising' },
  { id: 'down', label: 'Falling' },
];
const PAGE = 30;
const n0 = (v) => Math.round(v ?? 0).toLocaleString('en-IN');

function changeTone(v) {
  if (v == null) return 'text-ds-muted';
  return v < 0 ? 'text-danger-text' : 'text-[var(--status-approved-text)]';
}

export function ProductsSection({ ix, scope, mi, open, loading }) {
  const list = useMemo(() => productList(ix, scope, mi), [ix, scope, mi]);
  const [sort, setSort] = useState('sec');
  const [brand, setBrand] = useState('all');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [sort, brand, q, list]);

  const rows = useMemo(() => {
    if (!list) return [];
    const s = q.trim().toLowerCase();
    const r = list.items.filter((x) => (brand === 'all' || x.brand === brand)
      && (!s || `${x.name} ${x.brand ?? ''} ${x.code}`.toLowerCase().includes(s)));
    const key = {
      sec: (x) => -x.sec,
      pri: (x) => -x.pri,
      up: (x) => -(x.sec - x.prev),
      down: (x) => x.sec - x.prev,
    }[sort];
    return [...r].sort((a, b) => key(a) - key(b) || b.secYtd - a.secYtd);
  }, [list, sort, brand, q]);

  if (!list) return <Empty>{loading ? 'Loading products…' : 'No product data.'}</Empty>;
  const top = Math.max(1, ...list.items.map((x) => x.sec));
  const m = monthShort(ix.months[mi]);
  const sold = list.items.filter((x) => x.sec > 0).length;
  const leader = [...list.items].sort((a, b) => b.sec - a.sec)[0];

  return (
    <div className="flex flex-col gap-4">
      {open && ix.months[mi] >= open ? <Notice>{m} is still being entered — secondary counts only what has been sent.</Notice> : null}
      <div className="grid grid-cols-2 gap-3 @2xl/report:grid-cols-4">
        <Card padding="app"><Metric label={`Secondary · ${m}`} value={rupees(list.total)} caption={`${sold} products sold`} tone="neutral" /></Card>
        <Card padding="app"><Metric label={`Primary · ${m}`} value={rupees(list.totalPri)} caption={list.total ? `${ratio(list.totalPri / list.total)} of secondary` : ''} tone="neutral" /></Card>
        <Card padding="app"><Metric label="Biggest product" value={leader?.sec ? pct(leader.share) : '—'} caption={leader?.sec ? leader.name : ''} tone="neutral" /></Card>
        <Card padding="app"><Metric label="Products this FY" value={String(list.items.length)} caption={`${list.brands.length} brands`} tone="neutral" /></Card>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 @2xl/report:flex-row @2xl/report:items-center @2xl/report:justify-between">
          <SegmentedControl items={SORTS} value={sort} onChange={setSort} ariaLabel="Sort products" />
          <Field placeholder="Product or brand" value={q} onChange={setQ} prefix={<Icon name="search" size="sm" />} className="@2xl/report:w-64" />
        </div>
        <ChipRow
          items={[{ key: 'all', label: 'All brands', count: list.items.length }, ...list.brands.map((b) => ({ key: b, label: b }))]}
          value={brand}
          onChange={setBrand}
          ariaLabel="Brand"
        />
      </div>

      {rows.length ? (
        <Card padding="none">
          <ul className="divide-y divide-[var(--border-subtle)]">
            {rows.slice(0, shown).map((x) => (
              <li key={x.code} className="flex flex-col gap-1.5 px-4 py-3">
                {/* name · (trend, wide only) · this month */}
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-13 font-semibold text-heading">{x.name}</div>
                    <div className="truncate text-11 text-ds-muted">
                      {[x.brand, `${n0(x.secQty)} strips`, `YTD ${rupees(x.secYtd)}`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="hidden pt-1 @2xl/report:block">
                    <Spark values={x.series} width={88} height={24} />
                  </div>
                  <div className="w-36 shrink-0 text-right">
                    <div className="text-14 font-semibold tabular-nums text-heading">{x.sec ? rupees(x.sec) : '—'}</div>
                    <div className={cx('text-11 tabular-nums', changeTone(x.change))}>
                      {x.change == null ? (x.sec ? 'new this month' : `last ${rupees(x.prev)}`) : `${pct(x.change, { sign: true })} on last month`}
                    </div>
                  </div>
                </div>
                {/* share of the scope's secondary this month */}
                <div className="h-1.5 rounded-sm bg-sunken" aria-hidden="true">
                  <div className="h-full rounded-sm bg-brand" style={{ width: `${(x.sec / top) * 100}%` }} />
                </div>
                <div className="flex justify-between text-11 tabular-nums text-ds-secondary">
                  <span>Primary {x.pri ? rupees(x.pri) : '—'}{x.priSec == null ? '' : ` · ${ratio(x.priSec)} of secondary`}</span>
                  <span className="text-ds-muted">share {pct(x.share)}</span>
                </div>
              </li>
            ))}
          </ul>
          {rows.length > shown ? (
            <div className="border-t border-[var(--border-subtle)] p-3 text-center">
              <Button onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more of {rows.length - shown}</Button>
            </div>
          ) : null}
        </Card>
      ) : (
        <Empty>No products match.</Empty>
      )}
      <p className="text-11 text-ds-muted">
        Secondary = sold by stockists (Secondary Data Entry); primary = invoiced (Sales Invoice, by department and HQ). Bar = share of the scope&apos;s secondary in {m}.
      </p>
    </div>
  );
}
