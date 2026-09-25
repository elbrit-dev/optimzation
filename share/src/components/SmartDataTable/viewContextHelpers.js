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

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const obj = (v) => (isObj(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);

// The `_meta` keys a binding reads as objects (`meta.meta_today_totals.x`). Before the
// first fetch — or when the API leaves one out — they must still be objects, or the
// binding throws "Cannot read properties of null" and takes the whole provider down.
const META_OBJECT_KEYS = ['meta_totals', 'meta_today_totals', 'meta_filter_values', 'meta_pagination'];

function buildMeta(metaCol) {
  const meta = { ...obj(metaCol) };
  for (const key of META_OBJECT_KEYS) meta[key] = obj(meta[key]);
  return meta;
}

/**
 * Returns the `data`, `state`, and `meta` slices that are identical across all consumers.
 *
 * Plasmic bindings dot straight into this shape with no optional chaining, so every
 * container here is an object or array, never null/undefined — whatever state the view
 * is in. Only leaves (numbers, strings, `error`) may be null.
 */
export function buildViewDataState(view) {
  return {
    meta: buildMeta(view.metaCol),
    data: {
      rows:       arr(view.rows).map(flattenRow),
      columns:    arr(view.columns),
      groups:     arr(view.columnGroups),
      count:      view.totalRecords ?? 0,
      totals:     obj(view.metaTotals),
      todayTotals: obj(view.metaTodayTotals),
      dimensions: arr(view.filterDefs),
      // So a binding on `data` alone can tell what the rows mean: `loading` for the
      // spinner, `status` for what happened once it stops, `error` for the message
      // when that outcome was a failure (null in every other status).
      loading: !!view.loading,
      status:  resolveStatus(view),
      error:   view.error ?? null,
    },
    state: {
      loading: !!view.loading,
      status:  resolveStatus(view),
      error:   view.error ?? null,
      filters: obj(view.filters),
      sort:    obj(view.sortBy),
      page:    obj(view.pagination),
      // Raw control outputs, keyed by the control's `key` in the report config
      // (e.g. controls.dateRange = { start, end }, controls.lakhs = { value }).
      // `filters` above is the table's column filter row — a different thing.
      controls: obj(view.viewParams?._controls),
    },
  };
}
