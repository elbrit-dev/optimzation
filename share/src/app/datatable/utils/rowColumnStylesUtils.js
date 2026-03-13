/**
 * Row/column style utilities - apply user-defined compute functions to style entire rows or columns.
 * Runs at render time; mirrors derivedColumns scope and context for parity.
 *
 * The compute function may return any valid React inline style object. All CSS properties are supported
 * (use camelCase: backgroundColor, fontWeight, padding, borderWidth, textAlign, etc.).
 */

import { isArray, isEmpty } from 'lodash';
import { buildReportComputeRow } from './derivedColumnsUtils';

/**
 * Check if a rowColumnStyles rule matches the current context (mode + fieldName for nested).
 * @param {Object} rule - Style rule config
 * @param {string} mode - 'main' | 'report' | 'nested'
 * @param {string} [fieldName] - For mode 'nested', the nested table's field name
 * @returns {boolean}
 */
function matchesScope(rule, mode, fieldName) {
  const s = rule.scope;
  if (!s) return true;
  if (mode === 'main') return s.main !== false;
  if (mode === 'report') {
    if (s.report && typeof s.report === 'object') return s.report.enabled !== false;
    return s.report !== false;
  }
  if (mode === 'nested') {
    if (s.nested === false || s.nested === undefined) return false;
    if (s.nested === true) return true;
    const fields = isArray(s.nested) ? s.nested : [s.nested];
    return fields.includes(fieldName);
  }
  return false;
}

/**
 * Get effective rules for row mode, filtered by scope.
 * @param {Array} rules - rowColumnStyles array
 * @param {string} mode - 'main' | 'report' | 'nested'
 * @param {string} [fieldName] - For mode 'nested'
 * @returns {Array} Filtered rules with mode === 'row'
 */
export function getEffectiveRowRules(rules, mode, fieldName) {
  if (!isArray(rules) || isEmpty(rules)) return [];
  return rules.filter(
    (r) => r.mode === 'row' && matchesScope(r, mode, fieldName)
  );
}

/**
 * Get effective rules for column mode, filtered by scope.
 * @param {Array} rules - rowColumnStyles array
 * @param {string} mode - 'main' | 'report' | 'nested'
 * @param {string} [fieldName] - For mode 'nested'
 * @returns {Array} Filtered rules with mode === 'column'
 */
export function getEffectiveColumnRules(rules, mode, fieldName) {
  if (!isArray(rules) || isEmpty(rules)) return [];
  return rules.filter(
    (r) => r.mode === 'column' && matchesScope(r, mode, fieldName)
  );
}

/**
 * Merge style objects by order. Lower order applied first; higher order overrides same property.
 * @param {Array<{ style: Object, order: number }>} styleEntries - Sorted by order ascending
 * @returns {Object} Merged style object
 */
function mergeStylesByOrder(styleEntries) {
  const sorted = [...styleEntries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return sorted.reduce((acc, { style }) => {
    if (style && typeof style === 'object') {
      return { ...acc, ...style };
    }
    return acc;
  }, {});
}

/**
 * Normalize compute return value to style entries array.
 * Style object may contain any valid React inline style properties (camelCase).
 * @param {*} result - Result from compute (null, object, or array of { style, order })
 * @param {number} ruleOrder - Default order from rule
 * @returns {Array<{ style: Object, order: number }>}
 */
function normalizeComputeResult(result, ruleOrder = 0) {
  if (result == null) return [];
  if (Array.isArray(result)) {
    return result
      .filter((item) => item && item.style && typeof item.style === 'object')
      .map((item) => ({ style: item.style, order: item.order ?? ruleOrder }));
  }
  if (typeof result === 'object') {
    return [{ style: result, order: ruleOrder }];
  }
  return [];
}

/**
 * Compute row style by running row-mode rules. Merges results by order.
 * @param {Object} row - Row data
 * @param {Array} rules - rowColumnStyles array (or pre-filtered row rules)
 * @param {Object} context - { mode, fieldName?, getDataValue?, parentRow?, reportMeta?, rowIndex?, ... }
 * @returns {Object} Merged style object
 */
export function computeRowStyle(row, rules, context = {}) {
  if (!row || typeof row !== 'object') return {};
  if (!isArray(rules) || isEmpty(rules)) return {};

  const { mode, fieldName, getDataValue, parentRow, reportMeta } = context;
  const isReport = mode === 'report';
  const hasReportMeta = isReport && reportMeta &&
    isArray(reportMeta.metrics) && isArray(reportMeta.timePeriods);

  const ctx = {
    getDataValue: getDataValue ?? ((r, k) => (r && typeof r === 'object' ? r[k] : undefined)),
    parentRow: parentRow ?? null,
    fieldName: fieldName ?? null,
    mode: mode ?? 'main',
    rowIndex: context.rowIndex ?? 0,
    position: context.position ?? context.rowIndex ?? 0,
    isGroupRow: !!row.__isGroupRow__,
  };

  if (isReport && reportMeta) {
    ctx.isReportRow = true;
    ctx.reportMeta = reportMeta;
    ctx.columnGroupBy = reportMeta.columnGroupBy ?? null;
    ctx.breakdownType = reportMeta.breakdownType ?? null;
    ctx.monthRange = reportMeta.dateRange ?? null;
  }

  const styleEntries = [];

  rules.forEach((rule) => {
    const ruleOrder = rule.order ?? 0;
    let computeRow = row;

    if (hasReportMeta && rule.scope?.report?.getRowAsBreakdown === true) {
      computeRow = buildReportComputeRow(
        row,
        reportMeta.metrics,
        reportMeta.timePeriods,
        true
      );
    }

    try {
      const compute = rule.compute;
      const result = typeof compute === 'function' && compute.length >= 2
        ? compute(computeRow, ctx)
        : typeof compute === 'function'
          ? compute(computeRow)
          : null;

      const entries = normalizeComputeResult(result, ruleOrder);
      styleEntries.push(...entries);
    } catch (e) {
      // Ignore errors
    }
  });

  return mergeStylesByOrder(styleEntries);
}

/**
 * Compute column style by running column-mode rules. Merges results by order.
 * @param {string} columnName - Column name
 * @param {Object} columnData - { columnName, values, columnIndex, rowCount }
 * @param {Array} rules - rowColumnStyles array (or pre-filtered column rules)
 * @param {Object} context - { mode, tableData?, getDataValue?, fieldName?, reportMeta? }
 * @returns {Object} Merged style object
 */
export function computeColumnStyle(columnName, columnData, rules, context = {}) {
  if (!isArray(rules) || isEmpty(rules)) return {};

  const fullColumnData = {
    columnName: columnData?.columnName ?? columnName,
    values: columnData?.values ?? [],
    columnIndex: columnData?.columnIndex ?? 0,
    rowCount: columnData?.rowCount ?? (columnData?.values?.length ?? 0),
  };

  const ctx = {
    mode: context.mode ?? 'main',
    tableData: context.tableData ?? [],
    getDataValue: context.getDataValue ?? ((r, k) => (r && typeof r === 'object' ? r[k] : undefined)),
    fieldName: context.fieldName ?? null,
    reportMeta: context.reportMeta ?? null,
  };

  const styleEntries = [];

  rules.forEach((rule) => {
    const ruleOrder = rule.order ?? 0;
    try {
      const compute = rule.compute;
      const result = typeof compute === 'function' && compute.length >= 2
        ? compute(fullColumnData, ctx)
        : typeof compute === 'function'
          ? compute(fullColumnData)
          : null;

      const entries = normalizeComputeResult(result, ruleOrder);
      styleEntries.push(...entries);
    } catch (e) {
      // Ignore errors
    }
  });

  return mergeStylesByOrder(styleEntries);
}
