'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Icon, SegmentedControl, Tabs, cx } from '@/design-system';
import FyMonthPicker from '@/components/FyMonthPicker';
import { useReview } from '../data/useReview';
import {
  attention,
  chainOf,
  defaultMonth,
  deptShort,
  doctorBuckets,
  hqRows,
  indexAnswer,
  isOpen,
  resolvePicks,
  salesGrid,
  scopeOf,
  scopeOfPicks,
  scorecard,
  sharedAt,
  stockists,
  trend,
} from '../data/selectors';
import { monthLong, monthShort } from '../data/format';
import { OverviewSection } from './OverviewSection';
import { EffortSection } from './EffortSection';
import { InvestmentSection } from './InvestmentSection';
import { ProductsSection } from './ProductsSection';
import { MoreSection } from './MoreSection';
import { SalesSection } from './SalesSection';
import { DoctorsSection } from './DoctorsSection';
import { StockistsSection } from './StockistsSection';
import { ScopeTree } from './ScopeTree';
import { Notice } from './bits';

/* The monthly review — the SM REVIEW FORMAT workbook as one page.
 *
 * ONE CALL, EVERY SCOPE. useReview fetches the root's whole tree for the FY
 * once (server/elbrit_sm_review.py sums it); moving to a child seat, to a
 * department or to another month only re-derives from that answer.
 *
 * WHOSE NUMBERS, as the Visit report: the token decides (the server answers
 * with the caller's seat and everything under it; IT gets every SM). The
 * scope is a list of picks and starts on the caller's own branch, or for a
 * caller with no seat of their own (IT) on every SM's: never on whichever SM
 * comes first. A row of the tree narrows it to that seat's branch; the
 * breadcrumb's "All teams" goes back to every branch.
 *
 * THE PAGE OWNS FIVE THINGS: the lens (team tree or department), the picks,
 * the department, the month and the tab. Everything else is computed from
 * them by data/selectors.js, so no two cards can disagree.
 *
 * CONTAINER QUERIES (`@2xl/report`, `@5xl/report`), as the Visit report —
 * the page answers to the room it is given, so the harness width control
 * and a phone behave the same. Narrow: one column, the team list after the
 * section. From @5xl: the team list sits beside it. */

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'sales', label: 'Sales' },
  { id: 'effort', label: 'Effort' },
  { id: 'doctors', label: 'Doctors' },
  { id: 'stockists', label: 'Stockists' },
  { id: 'investment', label: 'Investment' },
  { id: 'products', label: 'Products' },
];
/* Institutions, Trip doctors, Default stockists: no ERP source yet. The tab
   exists on MOCK data (data/mocks.js) and shows only with showMockSheets. */
const MOCK_TAB = { id: 'more', label: 'Other sheets · mock' };

/* Two calls. The core (≈2 s on production) draws the page; the rest —
   visits, leave and products (≈8 s) — follows in the background and
   replaces it with a superset, so nothing on screen changes but the gaps
   filling in. */
const CORE = 'tree,sales,secondary,doctors,service';
const ALL = `${CORE},effort,products`;

const LENSES = [
  { id: 'team', label: 'Team' },
  { id: 'dept', label: 'Department' },
];

/* The last FULL month: a review is of a month that has ended. This month,
   a few days old, would read as 10 % of target and −90 % growth. On
   1-5 April that is March, so the review stays on the FY just closed. */
function lastFullMonth(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function ReviewReport({ gqlEnvironment = 'ERP', gqlToken, root, fy, upto, includeDrafts = false, title = 'Monthly review', showMockSheets = false }) {
  const [until] = useState(() => upto || lastFullMonth());
  const ask = { gqlEnvironment, gqlToken, root, fy, upto: upto || until, drafts: includeDrafts };
  const core = useReview({ ...ask, parts: CORE });
  const full = useReview({ ...ask, parts: ALL, enabled: Boolean(core.data) });
  const data = full.data ?? core.data;
  const { error, loading, reload } = core;
  const restLoading = Boolean(core.data) && !full.data && !full.error;
  const ix = useMemo(() => (data ? indexAnswer(data) : null), [data]);

  const [lens, setLens] = useState('team');
  const [picks, setPicks] = useState(null); // null: the default (resolvePicks)
  const [dept, setDept] = useState(null);
  const [mi, setMi] = useState(null);
  const [tab, setTab] = useState('overview');
  /* The tree panel on a phone: closed shows only the current pick, so the
     numbers are not pushed below the fold. From @5xl it is always open. */
  const [treeOpen, setTreeOpen] = useState(false);

  /* Another root, FY or month range starts over at its top. The background
     answer (same root, more blocks) must NOT: it would throw away a pick
     the user made while it loaded. */
  const answerKey = ix ? `${ix.raw.root}|${ix.raw.fy}|${ix.raw.upto}` : null;
  useEffect(() => {
    if (!ix) return;
    setPicks(null);
    setDept(ix.depts[0] ?? null);
    setMi(defaultMonth(ix));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerKey]);

  const selection = useMemo(() => (ix ? resolvePicks(ix, picks) : []), [ix, picks]);
  const pickKey = selection.map((p) => `${p.id}${p.includeSubtree ? '' : '·'}`).join('|');
  const deptLens = lens === 'dept' && dept;
  const ready = ix && ix.tree.length && mi != null;

  const view = useMemo(() => {
    if (!ready) return null;
    const scope = deptLens ? scopeOf(ix, { kind: 'dept', id: dept }) : scopeOfPicks(ix, selection);
    return {
      scope,
      sc: scorecard(ix, scope, mi),
      shared: sharedAt(ix, scope),
      trend: trend(ix, scope),
      grid: salesGrid(ix, scope),
      doctors: doctorBuckets(ix, scope, mi),
      stock: stockists(ix, scope, mi),
      hqs: hqRows(ix, scope, mi),
      attention: attention(ix, scope, mi),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ix, ready, deptLens, dept, pickKey, mi]);

  const seatOnly = (id) => setPicks([{ id, includeSubtree: true }]);
  const pick = (s) => {
    setLens('team');
    setPicks([{ id: s.id, includeSubtree: !s.alone }]);
  };

  const shell = (children) => (
    <div data-surface="app" className="@container/report min-h-full bg-sunken">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-3 @2xl/report:max-w-3xl @2xl/report:gap-5 @2xl/report:p-5 @5xl/report:max-w-6xl @5xl/report:p-6">
        {children}
      </div>
    </div>
  );

  if (error && !data) {
    return shell(
      <>
        <h1 className="text-20 font-semibold text-heading">{title}</h1>
        <Notice tone="danger">Could not load the review: {error.message ?? String(error)}</Notice>
        <div><Button onClick={reload}>Try again</Button></div>
      </>,
    );
  }
  if (!ready) {
    return shell(
      <>
        <h1 className="text-20 font-semibold text-heading">{title}</h1>
        {ix && !ix.tree.length ? (
          <Notice>This login holds no seat in the Sales tree, so there is no team to review.</Notice>
        ) : (
          <p className="text-13 text-ds-muted">{loading ? 'Loading the review…' : 'Waiting for the ERP…'}</p>
        )}
      </>,
    );
  }

  const month = ix.months[mi];
  const one = selection.length === 1 ? selection[0] : null;
  /* "All teams" heads the breadcrumb when the default is every branch (IT). */
  const everyone = ix.me == null && ix.roots.length > 1;
  const chain = lens === 'team' && one
    ? [...(everyone ? [{ id: null, name: 'All teams' }] : []), ...chainOf(ix, one.id)]
    : [];
  /* The month: the Visit report's picker (FyMonthPicker), one month at a
     time, locked to this answer's FY up to its last month. */
  const monthDate = (m, end) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - (end ? 0 : 1), end ? 0 : 1);
  const lastMonth = ix.months[ix.months.length - 1];
  const onMonthRange = (r) => {
    const d = r?.[1];
    if (!d) return;
    const k = ix.months.indexOf(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    if (k >= ix.fyStart) setMi(k);
  };
  const node = view.scope.node;
  const subtitle = lens === 'dept'
    ? `${deptShort(dept)} · every seat and HQ of the department`
    : node
      ? [node.tier, node.hq?.replace(/^HQ-/, ''), node.vacant ? 'vacant' : null, view.scope.sel.alone ? 'own lines only' : null].filter(Boolean).join(' · ')
      : `${selection.length} teams · ${view.scope.seats.size} seats`;

  const picked = lens === 'dept' ? deptShort(dept) : view.scope.label;
  const choose = (fn) => (v) => {
    fn(v);
    setTreeOpen(false);
  };

  return shell(
    <>
      {/* Header + controls: stacked on a phone, one bar from @2xl. */}
      <div className="flex flex-col gap-3 @2xl/report:flex-row @2xl/report:items-start @2xl/report:justify-between">
        <div className="min-w-0">
          <div className="text-11 font-medium uppercase tracking-wide text-ds-muted">{title} · {monthLong(month)}</div>
          <h1 className="truncate text-20 font-semibold text-heading">{picked}</h1>
          <div className="text-12 text-ds-secondary">{subtitle}</div>
        </div>
        <div className="flex flex-col gap-2 @2xl/report:w-72 @2xl/report:shrink-0">
          <SegmentedControl items={LENSES} value={lens} onChange={setLens} block ariaLabel="Group by" />
          <FyMonthPicker
            single
            min={monthDate(ix.months[ix.fyStart])}
            max={monthDate(lastMonth, true)}
            value={[monthDate(month), monthDate(month, true)]}
            onChange={onMonthRange}
            className="h-9 w-full"
          />
        </div>
      </div>

      {/* The tree decides every number below it, so it comes first: on the
          left from @5xl, on top (collapsible) on a phone. */}
      <div className="grid gap-4 @5xl/report:grid-cols-[20rem_minmax(0,1fr)] @5xl/report:gap-6">
        <aside className="min-w-0 @5xl/report:sticky @5xl/report:top-4 @5xl/report:self-start">
          <Card padding="none" className="overflow-hidden">
            <button
              type="button"
              onClick={() => setTreeOpen((o) => !o)}
              aria-expanded={treeOpen}
              className="flex w-full items-center gap-2 px-4 py-3 text-left @5xl/report:hidden"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-13 font-semibold text-heading">{picked}</span>
              </span>
              <Icon name={treeOpen ? 'chevron-up' : 'chevron-down'} size="sm" className="text-ds-muted" />
            </button>
            <div className="hidden border-b border-[var(--border-subtle)] px-4 py-2.5 text-11 font-medium uppercase tracking-wide text-ds-muted @5xl/report:block">
              {lens === 'dept' ? 'Departments' : 'Team'}
            </div>
            <div
              className={cx(
                'max-h-[60vh] overflow-y-auto border-t border-[var(--border-subtle)] @5xl/report:block @5xl/report:max-h-[calc(100vh-7rem)] @5xl/report:border-t-0',
                treeOpen ? 'block' : 'hidden',
              )}
            >
              <ScopeTree
                ix={ix}
                mi={mi}
                tab={tab}
                lens={lens}
                picked={selection.map((p) => p.id)}
                dept={dept}
                onSeat={choose(seatOnly)}
                onDept={choose(setDept)}
              />
            </div>
          </Card>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {lens === 'team' && chain.length > 1 ? (
            <nav aria-label="Where in the team" className="-mt-1 flex flex-wrap items-center gap-1 text-12">
              {chain.map((c, k) => (
                <span key={c.id ?? 'all'} className="inline-flex items-center gap-1">
                  {k ? <span className="text-ds-muted">›</span> : null}
                  <button
                    type="button"
                    disabled={k === chain.length - 1}
                    onClick={() => (c.id == null ? setPicks(null) : seatOnly(c.id))}
                    className={cx(
                      'rounded px-1 py-0.5',
                      k === chain.length - 1 ? 'font-medium text-heading' : 'text-brand-text [@media(hover:hover)]:hover:bg-brand-tint-weak',
                    )}
                  >
                    {c.vacant ? c.id : c.name.split(' / ')[0]}
                  </button>
                </span>
              ))}
            </nav>
          ) : null}

          {isOpen(ix, mi) ? (
            <p className="-mt-1 text-11 text-ds-muted">
              {monthShort(month)} is still being entered (due on the 10th): secondary and doctor support count only what has been sent.
            </p>
          ) : null}

          {/* Eight tabs do not fit a phone: the row scrolls sideways. */}
          <div className="-mx-1 overflow-x-auto px-1">
            <Tabs items={showMockSheets ? [...TABS, MOCK_TAB] : TABS} value={tab} onChange={setTab} ariaLabel="Section" className="w-max min-w-full" />
          </div>
          {full.error ? (
            <Notice>Visits, leave and products could not be loaded: {full.error.message ?? String(full.error)}</Notice>
          ) : null}
          <div>
            {tab === 'overview' ? (
              <OverviewSection
                sc={view.sc}
                shared={view.shared}
                doctors={view.doctors}
                stock={view.stock}
                trendData={view.trend}
                month={month}
                mi={mi}
                open={ix.open}
                onMonth={setMi}
                attention={view.attention}
                onPick={pick}
              />
            ) : null}
            {tab === 'sales' ? (
              <SalesSection grid={view.grid} mi={mi} open={ix.open} shared={view.shared} hqs={view.hqs} onMonth={setMi} />
            ) : null}
            {tab === 'doctors' ? (
              <DoctorsSection
                ix={ix}
                scope={view.scope}
                buckets={view.doctors}
                months={ix.months}
                mi={mi}
                open={ix.open}
                onMonth={setMi}
                visitsLoading={restLoading}
              />
            ) : null}
            {tab === 'stockists' ? <StockistsSection stock={view.stock} months={ix.months} mi={mi} open={ix.open} /> : null}
            {tab === 'effort' ? (
              <EffortSection ix={ix} scope={view.scope} mi={mi} open={ix.open} onMonth={setMi} loading={restLoading} />
            ) : null}
            {tab === 'investment' ? (
              <InvestmentSection ix={ix} scope={view.scope} mi={mi} open={ix.open} onMonth={setMi} visitsLoading={restLoading} />
            ) : null}
            {tab === 'products' ? (
              <ProductsSection ix={ix} scope={view.scope} mi={mi} open={ix.open} onMonth={setMi} loading={restLoading} />
            ) : null}
            {tab === 'more' && showMockSheets ? <MoreSection ix={ix} scope={view.scope} mi={mi} /> : null}
          </div>
        </div>
      </div>

      <p className="text-11 text-ds-muted">
        From ERP via elbrit_sm_review{data?.meta?.ms != null ? ` in ${(data.meta.ms / 1000).toFixed(1)} s` : ''} · target and primary are kept by
        department and HQ; where several BEs share an HQ, each gets an equal share of its target and a share of its primary by their secondary that month (marked alloc.).
      </p>
    </>,
  );
}
