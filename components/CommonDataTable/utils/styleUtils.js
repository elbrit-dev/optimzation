/**
 * Conditional row / column / cell styling.
 *
 * Two independent mechanisms:
 *  - `redFields` / `greenFields`: shorthand for "colour this numeric column's text".
 *  - `rowColumnStyles`: rules with a `compute` callback returning a React style object.
 *      { mode: 'row',    compute: (row, ctx) => ({ backgroundColor: '#fef2f2' }) }
 *      { mode: 'column', compute: (columnData, ctx) => ({ textAlign: 'right' }) }
 *      { mode: 'cell',   columns: ['amount'], compute: (value, row, ctx) => ({ color: 'red' }) }
 *    Higher `order` wins when two rules set the same property.
 */

import { isArray, isEmpty } from 'lodash';

function mergeByOrder(entries) {
  return [...entries]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .reduce((acc, { style }) => (style && typeof style === 'object' ? { ...acc, ...style } : acc), {});
}

/** A rule may return one style object, or `[{ style, order }, …]` to layer several. */
function normalizeResult(result, ruleOrder = 0) {
  if (result == null) return [];
  if (isArray(result)) {
    return result
      .filter((item) => item && item.style && typeof item.style === 'object')
      .map((item) => ({ style: item.style, order: item.order ?? ruleOrder }));
  }
  if (typeof result === 'object') return [{ style: result, order: ruleOrder }];
  return [];
}

/** Rules of one mode, optionally narrowed to a column. */
export function getRulesForMode(rules, mode, col) {
  if (!isArray(rules) || isEmpty(rules)) return [];
  return rules.filter((rule) => {
    if (rule?.mode !== mode) return false;
    if (mode !== 'cell') return true;
    if (!rule.columns) return true;
    const columns = isArray(rule.columns) ? rule.columns : [rule.columns];
    return columns.includes(col);
  });
}

/** Run rules and merge their styles; a throwing rule is skipped, never fatal. */
function runRules(rules, invoke) {
  const entries = [];
  rules.forEach((rule) => {
    try {
      const result = invoke(rule);
      entries.push(...normalizeResult(result, rule.order ?? 0));
    } catch {
      /* a broken style rule must not take the table down */
    }
  });
  return mergeByOrder(entries);
}

/**
 * @param {Object} row
 * @param {Array} rules row-mode rules
 * @param {Object} context `{ rowIndex, isGroupRow, groupLevel, getDataValue }`
 */
export function computeRowStyle(row, rules, context = {}) {
  if (!row || typeof row !== 'object' || isEmpty(rules)) return {};
  const ctx = {
    rowIndex: context.rowIndex ?? 0,
    isGroupRow: !!row.__isGroupRow__,
    groupLevel: row.__groupLevel__ ?? null,
    getDataValue: context.getDataValue,
  };
  return runRules(rules, (rule) => rule.compute?.(row, ctx));
}

/**
 * @param {string} columnName
 * @param {Object} columnData `{ columnName, values, columnIndex, rowCount }`
 * @param {Array} rules column-mode rules
 */
export function computeColumnStyle(columnName, columnData, rules, context = {}) {
  if (isEmpty(rules)) return {};
  const data = {
    columnName: columnData?.columnName ?? columnName,
    values: columnData?.values ?? [],
    columnIndex: columnData?.columnIndex ?? 0,
    rowCount: columnData?.rowCount ?? columnData?.values?.length ?? 0,
  };
  return runRules(rules, (rule) => rule.compute?.(data, context));
}

/**
 * @param {*} value cell value
 * @param {Object} row
 * @param {Array} rules cell-mode rules already narrowed to this column
 * @param {Object} context `{ column, rowIndex, columnType }`
 */
export function computeCellStyle(value, row, rules, context = {}) {
  if (isEmpty(rules)) return {};
  return runRules(rules, (rule) => rule.compute?.(value, row, context));
}

/** Tailwind text colour for the `redFields` / `greenFields` shorthand. */
export function getFieldColorClass(col, { redFields = [], greenFields = [] } = {}) {
  if (isArray(redFields) && redFields.includes(col)) return 'text-red-600';
  if (isArray(greenFields) && greenFields.includes(col)) return 'text-green-600';
  return '';
}
