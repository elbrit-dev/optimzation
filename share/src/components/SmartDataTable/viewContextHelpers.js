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
    },
    state: {
      loading: view.loading,
      error:   view.error,
      filters: view.filters,
      sort:    view.sortBy,
      page:    view.pagination,
    },
  };
}
