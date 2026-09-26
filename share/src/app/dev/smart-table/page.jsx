'use client';

/* SmartDataTable dev harness — route: /dev/smart-table
 *
 * The Playwright specs in e2e/smart-table/ and the page object in
 * e2e/pages/SmartTablePage.js both target this route, but the page itself was
 * never committed (it is in no branch and no commit), so all 8 specs used to
 * 404. This is it, driving all six mock views from
 * src/test/scenarios/table-views.scenarios.js — the same registry the Vitest
 * layer reads — against the local mock at /api/report-mock.
 *
 * Deliberately NOT wrapped in ProtectedRoute: the page object has no login
 * step, and every other route redirects to /login without a Firebase session.
 * That also makes this the only route where the table chrome can be
 * screenshotted for visual review.
 *
 * Parsing goes through reportSource's own parseFrappeResponse rather than a
 * local converter, so the identity / month / totals column groups and the
 * indent-based tree come from the code the product actually runs. A stand-in
 * would drift, and the drift would look like a passing test.
 */

import { useMemo, useState } from 'react';
/* SmartDataProviderImpl, not SmartDataProvider. The latter is the Plasmic
   wrapper: it resolves `config` (a report NAME) from Firestore and bails with
   `if (loading || !mergedConfig) return null`, so with no config it renders
   nothing — children included. src/app/report-table/dev/page.jsx uses the
   wrapper with no config and therefore renders an empty page too; that is a
   pre-existing bug, invisible because the route is behind ProtectedRoute. */
import { SmartDataProviderImpl } from '@/components/SmartDataTable/SmartDataProvider';
import { SmartDataTable } from '@/components/SmartDataTable/SmartDataTable';
import FilterSortSidebar from '@/components/SmartDataTable/FilterSortSidebar';
import { DEFAULT_CONFIG } from '@/components/SmartDataTable/smartDataTableConfig';
import {
  buildPipeline,
  formatStep,
  filterStep,
  nestStep,
  sortStep,
  paginateStep,
  parseFrappeResponse,
} from '@/components/SmartDataTable/reportSource.jsx';
import { tableViewScenarios } from '@/test/scenarios/table-views.scenarios';

function fetchStep(view) {
  let cache = null;
  const step = async (state) => {
    if (!cache) {
      const res = await fetch(`/api/report-mock?view=${encodeURIComponent(view)}`);
      if (!res.ok) throw new Error(`mock fetch failed for "${view}": HTTP ${res.status}`);
      const payload = await res.json();
      const report = payload?.data?.customReportV2;
      const cols = report?.report_meta?.[0]?.columns ?? [];
      const nodes = (report?.edges ?? []).map((e) => e.node);
      cache = parseFrappeResponse(cols, nodes, undefined);
    }
    return {
      ...state,
      rows: cache.rows,
      columns: cache.columns,
      columnGroups: cache.columnGroups,
      labelColDefs: cache.labelColDefs,
    };
  };
  step.refresh = () => {
    cache = null;
  };
  return step;
}

/* Tree views nest client-side: the mock ships every row flat with `indent` and
   `is_group`, and nestStep folds them. nestStep has to run AFTER filterStep so
   a filter matches against flat rows, and BEFORE sortStep so siblings sort
   within their parent. */
function buildSource(scenario) {
  const steps = scenario.hasTreeRows
    ? [fetchStep(scenario.view), formatStep(), filterStep, nestStep, sortStep, paginateStep]
    : [fetchStep(scenario.view), formatStep(), filterStep, sortStep, paginateStep];
  return buildPipeline(steps, scenario.hasTreeRows ? { expandable: true } : {});
}

/* Two filter dimensions with fixed values. `fetchFilterValues` is the async
   shape the real sidebar expects, so the loading path runs, but it resolves
   from a constant rather than the network.

   Returns `{ items, hasMore }`, NOT a bare array — that is the contract
   FilterSortSidebar destructures. Returning an array threw "items is not
   iterable" and took the whole sidebar down, which presented as the sidebar
   vanishing on the first tab click. */
const SIDEBAR_FILTER_DEFS = [
  { key: 'brand', label: 'Brand', fieldtype: 'Link' },
  { key: 'hq', label: 'HQ', fieldtype: 'Link' },
];

const SIDEBAR_VALUES = {
  brand: ['Cipla', 'Abbott', 'Sun Pharma', 'Micro Labs', 'Lupin'],
  hq: ['Bangalore', 'Hyderabad', 'Mumbai', 'Delhi'],
};

async function fetchStaticFilterValues(key, { search = '' } = {}) {
  const all = SIDEBAR_VALUES[key] ?? [];
  const term = String(search).toLowerCase();
  const items = all
    .filter((v) => !term || v.toLowerCase().includes(term))
    .map((v) => ({ value: v, label: v }));
  return { items, hasMore: false };
}

export default function SmartTableDevHarness() {
  const [viewId, setViewId] = useState(tableViewScenarios[0].id);
  /* Flips the DataTable between `unstyled` + the design-system PassThrough
     preset (the default) and the lara theme + CSS override sheet. Kept so a
     regression can be bisected against the theme without a rebuild.

     STARTS AT THE CONFIG DEFAULT, which is `true`. It used to start at `false`
     while claiming the preset was "the default", and because the harness passes
     this value down explicitly it OVERRODE the default — so the whole e2e
     suite, screenshot baselines included, ran against the lara theme and
     reported the unstyled render as verified. The baselines had never rendered
     the preset even once. Anything that asserts on the default must be read
     off DEFAULT_CONFIG, not hardcoded here. */
  const [unstyled, setUnstyled] = useState(DEFAULT_CONFIG.unstyled);

  /* FilterSortSidebar, mounted here so e2e/smart-table/sidebar-filter.spec.js
     has something to drive.
     It is normally mounted by ReportControls, which only /report-table uses —
     so that spec had always pointed at a page without the component under test
     and skipped all of its cases. Repointing it at /report-table instead would
     have made every assertion depend on backend filter values. */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({});
  const scenario = tableViewScenarios.find((s) => s.id === viewId) ?? tableViewScenarios[0];

  // Keyed per view so switching rebuilds the pipeline (and drops its cache)
  // instead of showing the previous view's rows under the new columns.
  const dataSource = useMemo(() => buildSource(scenario), [scenario]);

  return (
    <div data-surface="console" className="min-h-screen bg-page">
      <main className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="type-doc-head text-heading">SmartDataTable harness</h1>
            <p className="type-app-body text-ds-secondary">
              <code className="font-mono text-12">/api/report-mock</code> ·{' '}
              {scenario.hasTreeRows ? 'tree' : 'flat'} ·{' '}
              {scenario.hasColumnGroups ? 'pivot' : 'non-pivot'}
            </p>
          </div>

          <label className="flex items-center gap-2" data-testid="unstyled-toggle-label">
            <input
              type="checkbox"
              data-testid="unstyled-toggle"
              checked={unstyled}
              onChange={(e) => setUnstyled(e.target.checked)}
            />
            <span className="type-app-label text-ds-secondary">
              unstyled + DS preset {unstyled ? '(on — default)' : '(off — lara theme)'}
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="type-app-label text-ds-secondary">View</span>
            <select
              data-testid="view-select"
              value={viewId}
              onChange={(e) => setViewId(e.target.value)}
              className="h-control rounded-md border border-line-subtle bg-surface px-field text-12 text-body"
            >
              {tableViewScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </header>

        <section className="rounded-lg border border-line-subtle bg-surface p-4">
          {/* dataSource goes on the PROVIDER, not on SmartDataTable.
              SmartDataTable's own `dataSource` prop is silently ignored:
              SmartDataProvider.registerView() computes `let ds = viewDataSource`
              but never assigns it to viewDataSources.current[viewId], and
              runDataFetch() reads `viewDataSources.current[viewId] ??
              providerDataSource` — so a standalone table's dataSource resolves
              to undefined and the fetch returns early. Pre-existing bug, not
              introduced here. Passing it to the provider uses the fallback
              path, which works. */}
          <SmartDataProviderImpl dataSource={dataSource}>
            <SmartDataTable
              key={unstyled ? 'unstyled' : 'styled'}
              viewId={`dev-${viewId}`}
              loadingMessage="Loading…"
              config={{ unstyled }}
            />
          </SmartDataProviderImpl>
        </section>
        {/* `title="Filters"` is what SmartTablePage.sidebarButton() looks for. */}
        <button
          type="button"
          title="Filters"
          onClick={() => setSidebarOpen(true)}
          className="w-fit rounded-md border border-line-subtle bg-surface px-3 py-1.5 type-app-body text-body hover:border-brand-hover"
        >
          Filters
          {Object.values(appliedFilters).some((v) => v?.length) ? ' (active)' : ''}
        </button>

        <FilterSortSidebar
          visible={sidebarOpen}
          onHide={() => setSidebarOpen(false)}
          filterDefs={SIDEBAR_FILTER_DEFS}
          fetchFilterValues={fetchStaticFilterValues}
          currentFilterValues={appliedFilters}
          onApply={(_sort, filters) => {
            setAppliedFilters(filters ?? {});
            setSidebarOpen(false);
          }}
          onClear={() => {
            setAppliedFilters({});
            setSidebarOpen(false);
          }}
        />
      </main>
    </div>
  );
}
