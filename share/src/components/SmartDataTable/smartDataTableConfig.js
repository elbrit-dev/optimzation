'use client';

export const DEFAULT_CONFIG = {
  // Display
  stripedRows: true,
  showGridlines: true,
  emptyMessage: 'No records found.',
  size: 'normal',

  // Scrolling
  scrollHeight: '600px',
  virtualScroll: true,
  virtualScrollItemSize: 50,
  virtualScrollNumToleratedItems: 10,

  // Sorting
  sortable: true,
  multiSort: true,
  removableSort: true,

  // Filtering
  filterDisplay: 'row',        // 'row' | 'menu' | 'none'
  filterDebounceText: 300,
  filterDebounceNumeric: 400,

  // Pagination
  paginator: true,
  defaultPageSize: 25,
  pageSizeOptions: [25, 50, 100, 200],

  // Columns
  resizableColumns: true,
  columnResizeMode: 'expand',  // 'fit' | 'expand'
  reorderableColumns: true,

  // Toolbar buttons
  showColumnVisibility: true,
  showColumnFreeze: true,
  freezeFirstColumn: false,
  showExport: true,
  exportFilename: undefined,   // undefined = auto date-stamped; string or (date) => string
  showFullscreen: true,

  // Loading / Skeleton
  skeletonRows: 10,
  skeletonColumns: 6,
  loadingMessage: undefined,
};

/**
 * Merge common (provider-level) config and per-view config on top of defaults.
 * Per-view wins over common; common wins over defaults.
 *
 * @param {Partial<typeof DEFAULT_CONFIG>} common
 * @param {Partial<typeof DEFAULT_CONFIG>} perView
 * @returns {typeof DEFAULT_CONFIG}
 */
export function resolveConfig(common = {}, perView = {}) {
  return { ...DEFAULT_CONFIG, ...common, ...perView };
}
