'use client';

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

  // Loading
  loadingMessage: undefined,
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
