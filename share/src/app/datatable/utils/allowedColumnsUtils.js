/**
 * Utilities for resolving allowedColumns in array or object form.
 * Array form: applies to main, report, nested; group has no per-field override.
 * Object form: { main?, report?, nested?, group?: { [fieldName]: string[] }, reportGroup?: { [fieldName]: string[] } }
 *
 * @typedef {string[]|{ main?: string[], report?: string[], nested?: string[], group?: Record<string, string[]>, reportGroup?: Record<string, string[]> }} AllowedColumnsInput
 */

/**
 * Get allowed columns for a scope (main, report, nested).
 * @param {AllowedColumnsInput} allowedColumns
 * @param {'main'|'report'|'nested'} scope
 * @returns {string[]|null} - null = no filter (show all)
 */
export function getAllowedForScope(allowedColumns, scope) {
  if (!allowedColumns) return null;

  if (Array.isArray(allowedColumns)) {
    return allowedColumns.length > 0 ? allowedColumns : null;
  }

  if (typeof allowedColumns !== 'object') return null;

  const scopeVal = allowedColumns[scope];
  if (Array.isArray(scopeVal) && scopeVal.length > 0) {
    return scopeVal;
  }
  // Fallback to main when scope omitted
  const mainVal = allowedColumns.main;
  if (Array.isArray(mainVal) && mainVal.length > 0) {
    return mainVal;
  }
  return null;
}

/**
 * Get allowed columns for a specific group field.
 * @param {AllowedColumnsInput} allowedColumns
 * @param {string} groupFieldName - e.g. 'brand', 'item_name'
 * @returns {string[]|null} - null = no per-field filter
 */
export function getAllowedForGroupField(allowedColumns, groupFieldName) {
  if (!allowedColumns || !groupFieldName) return null;

  if (Array.isArray(allowedColumns)) {
    return null; // No per-field override when array
  }

  const group = allowedColumns.group;
  if (!group || typeof group !== 'object') return null;

  const fieldCols = group[groupFieldName];
  if (Array.isArray(fieldCols) && fieldCols.length > 0) {
    return fieldCols;
  }
  return null;
}

/**
 * Get allowed columns for a specific group field in report mode.
 * Uses reportGroup when defined (separate from group for report breakdown tables); otherwise null so callers fall back to report scope.
 * @param {AllowedColumnsInput} allowedColumns
 * @param {string} groupFieldName - e.g. 'warehouse', 'batch_id'
 * @returns {string[]|null} - null = use report scope (show all report columns)
 */
export function getAllowedForReportGroupField(allowedColumns, groupFieldName) {
  if (!allowedColumns || !groupFieldName) return null;

  if (Array.isArray(allowedColumns)) return null;

  const reportGroup = allowedColumns.reportGroup;
  if (!reportGroup || typeof reportGroup !== 'object') return null;

  const fieldCols = reportGroup[groupFieldName];
  if (Array.isArray(fieldCols) && fieldCols.length > 0) {
    return fieldCols;
  }
  return null;
}
