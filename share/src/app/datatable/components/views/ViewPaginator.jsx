'use client';

import { useMemo } from 'react';
import { useTableOperations } from '../../contexts/TableOperationsContext';
import { useDataViews } from '../../contexts/ViewContext';

/**
 * Fetch-size controls for the Views variant.
 *
 * Two pieces, both driven by DataProviderViews' `paging` state (published on
 * $ctx.view.paging): a compact "25 / page" pill for the header row, and a
 * "Load more" bar for the bottom of the slot.
 *
 * What they actually change: the provider merges the chosen size into
 * `overrides.variables` as the query's page-size variable (`first` by default),
 * which lands in the GraphQL request — so this genuinely limits how many rows
 * the SERVER returns, it is not a client-side slice. The same choice is also
 * pushed into the engine's own pagination (updatePagination) so a view bound to
 * $ctx.data.paginatedData shows the same window as one bound to sortedData.
 *
 * Requires the query body to declare the variable, e.g.
 *   query Doctors($first: Int = 10) { Leads(first: $first, ...) }
 * A query that doesn't declare it ignores the variable and keeps its own limit.
 */

const PILL_BASE =
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-slate-800 sm:gap-1.5 sm:text-xs';
const PILL_HEIGHT = { height: '1.75rem' };

/** The chosen size always appears in the list, even if it isn't one of the presets. */
function useSizeOptions(options, current) {
  return useMemo(() => {
    const list = (Array.isArray(options) ? options : [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (Number.isFinite(current) && current > 0) list.push(current);
    return [...new Set(list)].sort((a, b) => a - b);
  }, [options, current]);
}

/** True while any fetch (including a stale-window background refresh) is in flight. */
function useBusy() {
  const { executingQuery, isLoading, isRevalidating } = useTableOperations();
  return executingQuery === true || isLoading === true || isRevalidating === true;
}

/**
 * Compact page-size pill: "▤ 25 / page". A native <select> on purpose — the
 * engine's header row is overflow-x-auto, which clips a popup menu on the cross
 * axis too (the reason SyncPill has to position its menu fixed).
 */
export function PageSizePill({ className }) {
  const paging = useDataViews()?.paging;
  const { updatePagination } = useTableOperations();
  const busy = useBusy();
  const options = useSizeOptions(paging?.pageSizeOptions, paging?.fetchSize);

  if (!paging?.enabled || options.length === 0) return null;

  const onChange = (event) => {
    const next = Number(event.target.value);
    if (!Number.isFinite(next) || next <= 0) return;
    paging.setFetchSize(next);
    // Keep the engine's client-side window in step with the fetch size, so both
    // sortedData- and paginatedData-bound views show the same rows.
    if (typeof updatePagination === 'function') updatePagination(0, next);
  };

  return (
    <div
      className={`${PILL_BASE} px-1.5 sm:px-2 ${busy ? 'opacity-60' : ''} ${className ?? ''}`}
      style={PILL_HEIGHT}
    >
      <i className="pi pi-list text-[10px] text-gray-500" aria-hidden="true" />
      <select
        value={paging.fetchSize}
        onChange={onChange}
        disabled={busy}
        aria-label="Rows to load"
        className="cursor-pointer appearance-none border-0 bg-transparent pr-3 text-[11px] font-semibold text-slate-800 outline-none sm:text-xs"
        style={{ backgroundImage: 'none' }}
      >
        {options.map((n) => (
          <option key={n} value={n}>{`${n} / page`}</option>
        ))}
      </select>
      <i className="pi pi-chevron-down -ml-2 text-[9px] text-gray-500" aria-hidden="true" />
    </div>
  );
}

/**
 * Bottom bar: how many rows are in hand, plus "Load more" — which raises the
 * fetch size by one step and re-queries.
 *
 * Deliberately NOT cursor paging. This query carries a `filter`, and `after` +
 * `filter` together throws "Filter must be a tuple or list" on our ERP, so
 * growing `first` is the only paging that works here. It also means no page can
 * be skipped: row 1..N always come down together.
 *
 * "More may exist" is a heuristic — nothing in the pipeline reads pageInfo, so
 * a full page coming back is the only signal available. With a search or filter
 * active the loaded count is already narrowed, so the button stays enabled
 * rather than claiming the end of the list.
 */
export function LoadMoreBar({ className }) {
  const paging = useDataViews()?.paging;
  const { rawData, sortedData, searchTerm, filters } = useTableOperations();
  const busy = useBusy();

  if (!paging?.enabled || !paging.showLoadMore) return null;

  const inHand = Array.isArray(rawData) ? rawData.length : 0;
  const visible = Array.isArray(sortedData) ? sortedData.length : inHand;
  const narrowed =
    (typeof searchTerm === 'string' && searchTerm.trim() !== '') ||
    (filters && typeof filters === 'object' && Object.keys(filters).length > 0);
  const mayHaveMore = narrowed || inHand >= paging.fetchSize;

  const label = visible === inHand
    ? `${inHand.toLocaleString('en-US')} loaded`
    : `${visible.toLocaleString('en-US')} of ${inHand.toLocaleString('en-US')} loaded`;

  return (
    <div className={`flex items-center justify-center gap-3 py-3 ${className ?? ''}`}>
      <span className="text-[11px] font-medium text-gray-500 sm:text-xs">{label}</span>
      {mayHaveMore ? (
        <button
          type="button"
          onClick={() => paging.loadMore()}
          disabled={busy}
          className={`${PILL_BASE} gap-1.5 px-3 hover:bg-gray-50 disabled:opacity-60`}
          style={PILL_HEIGHT}
        >
          <i
            className={`${busy ? 'pi pi-spin pi-spinner' : 'pi pi-plus'} text-[10px] text-gray-500`}
            aria-hidden="true"
          />
          {busy ? 'Loading…' : `Load ${paging.loadMoreStep} more`}
        </button>
      ) : (
        <span className="text-[11px] text-gray-400 sm:text-xs">All loaded</span>
      )}
    </div>
  );
}

export default PageSizePill;
