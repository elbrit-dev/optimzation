'use client';

/**
 * CommonDataTable — simple standalone data table, no provider required.
 *
 * The default export is the table. The pipeline hook and utils are exported too, for
 * cases where you want the same grouping semantics behind your own markup.
 */

export { default } from './CommonDataTable';
export { default as CommonDataTable } from './CommonDataTable';
export { default as GroupTable } from './GroupTable';
export { default as useCommonTablePipeline } from './hooks/useCommonTablePipeline';

export {
  getDataValue,
  getDataKeys,
  formatHeaderName,
  formatNumber,
  sumColumn,
  toFiniteNumber,
} from './utils/valueUtils';
export {
  detectColumnTypes,
  formatDateValue,
  isDateLike,
  isNumericValue,
  isTruthyBoolean,
  parseToDate,
} from './utils/typeUtils';
export { compareTyped, sortRows, toggleSort } from './utils/sortUtils';
export {
  applyNumericFilter,
  filterRows,
  hasActiveFilters,
  matchesColumnFilter,
  parseNumericFilter,
} from './utils/filterUtils';
export { buildNestedTree, flattenLeaves, groupRows, sumOver } from './utils/groupUtils';
export { buildExportMatrix, exportRows } from './utils/exportUtils';
