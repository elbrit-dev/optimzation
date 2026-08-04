'use client';

/**
 * CommonDataTable — standalone data table, no provider required.
 *
 * The default export is the table. The pipeline hook and utils are exported too, for
 * cases where you want the same filter/sort/group semantics behind your own markup.
 */

export { default } from './CommonDataTable';
export { default as CommonDataTable } from './CommonDataTable';
export { default as CommonTableToolbar } from './CommonTableToolbar';
export { default as useCommonTablePipeline } from './hooks/useCommonTablePipeline';

export {
  getDataValue,
  getDataKeys,
  formatHeaderName,
  formatNumber,
  sumColumn,
  toFiniteNumber,
  ONE_LAKH,
} from './utils/valueUtils';
export {
  detectColumnTypes,
  formatDateValue,
  isDateLike,
  isNumericValue,
  isTruthyBoolean,
  parseToDate,
} from './utils/typeUtils';
export {
  applyDateFilter,
  applyNumericFilter,
  buildFilterOptions,
  filterRows,
  hasActiveFilters,
  parseNumericFilter,
} from './utils/filterUtils';
export { compareTyped, getSortIndex, getSortOrder, sortRows, toggleSort } from './utils/sortUtils';
export { aggregateNonNumeric, flattenGroupRows, groupRows } from './utils/groupUtils';
export { buildExportMatrix, exportRows } from './utils/exportUtils';
export {
  computeCellStyle,
  computeColumnStyle,
  computeRowStyle,
  getFieldColorClass,
  getRulesForMode,
} from './utils/styleUtils';
