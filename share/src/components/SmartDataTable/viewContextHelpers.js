/**
 * Shared helpers for building the Plasmic/context data shape from a store view.
 * Used by both SmartDataProvider (real actions) and ReportsConfigSidebar (stub actions).
 */

export function flattenRow(row) {
  const out = {};
  for (const [field, cell] of Object.entries(row)) {
    if (field === '_children' && Array.isArray(cell)) {
      out[field] = cell.map(flattenRow);
    } else {
      out[field] = (cell !== null && typeof cell === 'object' && 'value' in cell)
        ? cell.value
        : cell;
    }
  }
  return out;
}

/**
 * Collapses a view's fetch lifecycle into one string:
 *   'idle'    — nothing fetched yet; rows is empty but means nothing
 *   'loading' — a fetch is in flight
 *   'error'   — the last fetch failed; read state.error for the message
 *   'success' — the last fetch landed; rows is the real answer, empty or not
 * `view.loaded` is internal store bookkeeping and is deliberately not exposed.
 */
function resolveStatus(view) {
  if (view.loading) return 'loading';
  if (view.error)   return 'error';
  return view.loaded ? 'success' : 'idle';
}

/** Returns the `data`, `state`, and `meta` slices that are identical across all consumers. */
export function buildViewDataState(view) {
  return {
    meta: view.metaCol ?? null,
    data: {
      rows:       (view.rows ?? []).map(flattenRow),
      columns:    view.columns ?? null,
      groups:     view.columnGroups ?? null,
      count:      view.totalRecords,
      totals:     view.metaTotals      ?? {},
      todayTotals: view.metaTodayTotals ?? {},
      dimensions: view.filterDefs,
      // Two extras so a binding on `data` alone can tell what the rows mean:
      // `loading` for the spinner, `status` for what happened once it stops.
      loading: !!view.loading,
      status:  resolveStatus(view),
    },
    state: {
      loading: !!view.loading,
      status:  resolveStatus(view),
      error:   view.error,
      filters: view.filters,
      sort:    view.sortBy,
      page:    view.pagination,
      // Raw control outputs, keyed by the control's `key` in the report config
      // (e.g. controls.dateRange = { start, end }, controls.lakhs = { value }).
      // `filters` above is the table's column filter row — a different thing.
      controls: view.viewParams?._controls ?? {},
    },
  };
}
