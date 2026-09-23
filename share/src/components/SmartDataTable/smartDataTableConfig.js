export const INDEX_LOADING_MESSAGE = 'Checking for updates…';

// ─── Internal config ──────────────────────────────────────────────────────────
//
// PrimeReact implementation details and performance tuning knobs.
// Not part of the public API — component developers only.
// Import and spread overrides before calling resolveConfig in tests or special builds.

export const __INTERNAL_CONFIG = {
  size: 'normal',
  enableMultiSort: true,
  enableRemovableSort: true,
  filterDebounceText: 300,
  filterDebounceNumeric: 400,
  columnResizeMode: 'expand',   // 'fit' | 'expand'
  skeletonRows: 10,
  skeletonColumns: 6,
};

// ─── User config (public API) ─────────────────────────────────────────────────
//
// Keys consumers of SmartDataTable are expected to configure.
// Pass via SmartDataProvider config prop (provider-level) or per-table config prop (per-view).

export const DEFAULT_CONFIG = {
  // Display
  enableStripedRows: true,
  enableGridlines: true,
  emptyMessage: 'No records found.',

  /* Render the PrimeReact DataTable in `unstyled` mode with the design
     system's PassThrough preset instead of the lara-light-cyan theme plus the
     CSS override sheet. See design-system/primereact/dataTablePreset.js.

     ON by default. The preset is verified across all six view shapes (flat,
     tree, pivot, tree-pivot) by computed style — header / filter / body cell
     padding and borders, filter input height, column resizer, row height,
     zebra, frozen columns and the sticky resizer — and by the eight
     screenshot baselines in e2e/smart-table/visual.spec.js.

     This was blocked for a while, and not on styling: `unstyled` stops
     PrimeReact emitting its `p-*` classes, and the whole e2e selector layer
     was built on them, so turning it on took the suite from 73 passing to 2.
     The unblock was to emit stable `data-table-part` attributes from a
     hooks-only PassThrough (design-system/primereact/dataTableHooks.js) that
     applies in BOTH modes, and to move every selector onto those. `pt` is
     independent of `unstyled`, which is what made that possible.

     Setting this to `false` is a styling-only escape hatch — the hooks still
     apply, so the suite keeps passing either way and a visual regression can
     be bisected to one table. Note it also opts the row-expansion child tables
     out, so a tree does not end up half-themed. */
  unstyled: true,

  // Scrolling
  scrollHeight: '600px',

  // Sorting
  enableSort: true,

  // Filtering
  enableFilterRow: true,

  // Footer
  enableTotalRow: true,

  // Pagination
  enablePaginator: true,
  defaultPageSize: 50,
  pageSizeOptions: [50, 100, 200, 500],

  // Columns
  enableResizableColumns: true,
  enableReorderableColumns: true,

  // Toolbar
  enableColumnVisibility: true,
  enableColumnFreeze: true,
  enableFreezeFirstColumn: false,
  enableExport: true,
  exportFilename: undefined,    // undefined = auto date-stamped; string or (date) => string
  enableFullscreen: true,

  // Row click / drawer
  // How many top tree levels fire the rowClick signal (the signal that opens a drawer).
  // Grouped data nests one level per group_by field, e.g. group_by
  // ['department', 'HQ', 'Item', 'customer'] → depth 0 = department, 1 = HQ, 2 = Item, …
  // 2  → only department and HQ rows are clickable; Item/customer rows are inert,
  //      regardless of how many group_by fields there are.
  // Accepts: number (top N levels) | true (every level) | false (none) | (depth) => boolean
  rowClickLevels: 2,

  // Loading
  loadingMessage: undefined,

  // Logging
  // When true, the SmartData provider buffers structured debug events (fetches,
  // drawer opens, signals, cache hits, ...) and ships them to the Firestore
  // `logs` collection. See smartDataLogger.js. Off by default — zero overhead.
  loggingEnabled: false,
};

/**
 * Merge all config tiers. Priority (lowest → highest):
 * __INTERNAL_CONFIG → DEFAULT_CONFIG → common (provider-level) → perView (per-table)
 *
 * @param {Partial<typeof DEFAULT_CONFIG>} common
 * @param {Partial<typeof DEFAULT_CONFIG>} perView
 * @returns {typeof __INTERNAL_CONFIG & typeof DEFAULT_CONFIG}
 */
export function resolveConfig(common = {}, perView = {}) {
  return { ...__INTERNAL_CONFIG, ...DEFAULT_CONFIG, ...common, ...perView };
}

/**
 * Resolve `rowClickLevels` for a given tree depth (0 = top-level rows).
 * See DEFAULT_CONFIG.rowClickLevels for the accepted shapes.
 *
 * @param {number|boolean|((depth: number) => boolean)|null|undefined} rowClickLevels
 * @param {number} depth
 * @returns {boolean} whether rows at this depth should fire the rowClick signal
 */
export function isRowClickEnabledAtDepth(rowClickLevels, depth) {
  if (typeof rowClickLevels === 'function') return !!rowClickLevels(depth);
  if (rowClickLevels === true || rowClickLevels === null || rowClickLevels === undefined) return true;
  if (rowClickLevels === false) return false;
  const levels = Number(rowClickLevels);
  return Number.isFinite(levels) && depth < levels;
}
