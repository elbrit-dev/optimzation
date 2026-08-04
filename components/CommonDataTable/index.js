'use client';

/**
 * CommonDataTable — simple standalone data table, no provider required.
 *
 * The default export is the table. The pipeline hook and utils are exported too, for
 * cases where you want the same sort/group semantics behind your own markup.
 */

export { default } from './CommonDataTable';
export { default as CommonDataTable } from './CommonDataTable';
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
export { expandNestedRows, flattenGroupsForDisplay, groupRows } from './utils/groupUtils';
export { buildExportMatrix, exportRows } from './utils/exportUtils';
