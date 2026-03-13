/**
 * Derived columns utility - apply user-defined compute functions to row data.
 * Runs on main thread; runs before sort/filter so values flow through the pipeline.
 */

import { isArray, isEmpty } from 'lodash';

/**
 * Check if a derived column config matches the current context (mode + fieldName for nested).
 * @param {Object} dc - Derived column config
 * @param {string} mode - 'main' | 'report' | 'nested'
 * @param {string} [fieldName] - For mode 'nested', the nested table's field name
 * @returns {boolean}
 */
function matchesScope(dc, mode, fieldName) {
  const s = dc.scope;
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
 * Build a virtual row for the compute function in report mode.
 * Converts flat period_metric columns into grouped metric keys.
 * @param {Object} row - Raw report row with `${period}_${metric}` keys
 * @param {string[]} metrics - Metric column names
 * @param {string[]} timePeriods - Period keys (e.g. ['2025-01', '2025-02'])
 * @param {boolean} getRowAsBreakdown - If true, metric becomes { period: value }; otherwise sum
 * @returns {Object} Virtual row for compute
 */
export function buildReportComputeRow(row, metrics, timePeriods, getRowAsBreakdown) {
  const periodMetricKeys = new Set();
  for (const m of metrics) {
    for (const p of timePeriods) {
      periodMetricKeys.add(`${p}_${m}`);
    }
  }

  const virtualRow = {};
  for (const key of Object.keys(row)) {
    if (!periodMetricKeys.has(key)) {
      virtualRow[key] = row[key];
    }
  }

  for (const metric of metrics) {
    if (getRowAsBreakdown) {
      const breakdown = {};
      for (const period of timePeriods) {
        breakdown[period] = row[`${period}_${metric}`] ?? 0;
      }
      virtualRow[metric] = breakdown;
    } else {
      let sum = 0;
      for (const period of timePeriods) {
        const v = row[`${period}_${metric}`];
        if (typeof v === 'number' && isFinite(v)) sum += v;
      }
      virtualRow[metric] = sum;
    }
  }
  return virtualRow;
}

/**
 * Apply derived columns to data. Mutates row objects by adding or overwriting values.
 * @param {Array} data - Array of row objects
 * @param {Array} derivedColumns - Array of { columnName, compute, scope?, columnType?, beforeColumn?, aggregate? }
 * @param {Object} context - { mode, fieldName?, getDataValue?, parentRow?, reportMeta? }
 *   reportMeta (report mode only): { metrics, timePeriods, dateRange, breakdownType, columnGroupBy }
 * @returns {Array} Data with derived values added to each row (same reference, enriched)
 */
export function applyDerivedColumns(data, derivedColumns, context = {}) {
  if (!isArray(data) || isEmpty(data)) return data;
  if (!isArray(derivedColumns) || isEmpty(derivedColumns)) return data;

  const { mode, fieldName, getDataValue, parentRow, reportMeta } = context;
  const configs = derivedColumns.filter((dc) => matchesScope(dc, mode, fieldName));
  if (isEmpty(configs)) return data;

  const isReport = mode === 'report';
  const hasReportMeta = isReport && reportMeta &&
    isArray(reportMeta.metrics) && isArray(reportMeta.timePeriods);

  const ctx = {
    getDataValue: getDataValue ?? ((r, k) => (r && typeof r === 'object' ? r[k] : undefined)),
    parentRow: parentRow ?? null,
    fieldName: fieldName ?? null,
  };

  if (isReport && reportMeta) {
    ctx.isReportRow = true;
    ctx.columnGroupBy = reportMeta.columnGroupBy ?? null;
    ctx.breakdownType = reportMeta.breakdownType ?? null;
    ctx.monthRange = reportMeta.dateRange ?? null;
  }

  return data.map((row, rowIndex) => {
    if (!row || typeof row !== 'object') return row;

    const enriched = { ...row };
    const isGroupRow = !!row.__isGroupRow__;
    const fullCtx = { ...ctx, rowIndex, position: rowIndex, isGroupRow };

    configs.forEach((dc) => {
      const { columnName, compute, aggregate } = dc;

      if (aggregate === true && isGroupRow) return;

      let computeRow = row;
      if (hasReportMeta) {
        const getRowAsBreakdown = dc.scope?.report?.getRowAsBreakdown === true;
        computeRow = buildReportComputeRow(row, reportMeta.metrics, reportMeta.timePeriods, getRowAsBreakdown);
      }

      try {
        const value = typeof compute === 'function' && compute.length >= 2
          ? compute(computeRow, fullCtx)
          : typeof compute === 'function'
            ? compute(computeRow)
            : null;
        enriched[columnName] = value;
      } catch (e) {
        enriched[columnName] = null;
      }
    });

    return enriched;
  });
}

/**
 * Apply derived columns to a single row. Returns the enriched row.
 * @param {Object} row - Single row object
 * @param {Array} derivedColumns - Array of { columnName, compute, scope?, columnType?, beforeColumn? }
 * @param {Object} context - { mode, fieldName?, getDataValue?, parentRow? }
 * @returns {Object} Row with derived values added (or original row if no derived columns apply)
 */
export function applyDerivedColumnsForRow(row, derivedColumns, context = {}) {
  if (!row || typeof row !== 'object') return row;
  if (!isArray(derivedColumns) || isEmpty(derivedColumns)) return row;
  const result = applyDerivedColumns([row], derivedColumns, context);
  return result && result[0] != null ? result[0] : row;
}

/**
 * Get column names from derivedColumns that have scope.report.exemptFromBreakdown: true.
 * Used for report mode to exclude these from time-period breakdown.
 * @param {Array} derivedColumns
 * @returns {string[]}
 */
export function getExemptFromBreakdownColumnNames(derivedColumns) {
  if (!isArray(derivedColumns) || isEmpty(derivedColumns)) return [];
  return derivedColumns
    .filter((dc) => {
      const r = dc.scope?.report;
      return r && typeof r === 'object' && r.exemptFromBreakdown === true && dc.columnName;
    })
    .map((dc) => dc.columnName)
    .filter(Boolean);
}

/**
 * Get derived column names for a given mode and optional fieldName.
 * Used by pipeline/worker to know which columns to include and aggregate.
 * @param {Array} derivedColumns
 * @param {string} mode
 * @param {string} [fieldName]
 * @returns {string[]}
 */
export function getDerivedColumnNames(derivedColumns, mode, fieldName) {
  if (!isArray(derivedColumns) || isEmpty(derivedColumns)) return [];
  return derivedColumns
    .filter((dc) => matchesScope(dc, mode, fieldName))
    .map((dc) => dc.columnName)
    .filter(Boolean);
}

/**
 * Merge data column names with derived columns inserted at their position.
 * position is 0-based (0 = 1st column, 2 = 3rd column). Omit position to append at end.
 * @param {string[]} dataColumnNames - Column names from data (no derived)
 * @param {Array} derivedColumns - Array of { columnName, position?, scope?, ... }
 * @param {string} mode - 'main' | 'report' | 'nested'
 * @param {string} [fieldName] - For mode 'nested'
 * @returns {string[]} Ordered column names with derived at specified positions
 */
export function getOrderedColumnsWithDerived(dataColumnNames, derivedColumns, mode, fieldName) {
  if (!isArray(dataColumnNames)) return [];
  const result = [...dataColumnNames];
  if (!isArray(derivedColumns) || isEmpty(derivedColumns)) return result;

  const configs = derivedColumns
    .filter((dc) => dc.columnName && matchesScope(dc, mode, fieldName))
    .map((dc, index) => ({ ...dc, _index: index }));

  // Remove derived columns that have a position from result so we can re-insert at the correct index
  // (when tableData already has the key from applyDerivedColumns, it appears in columns and stays at end otherwise)
  configs.forEach((dc) => {
    if (dc.position != null && Number.isFinite(dc.position)) {
      const idx = result.indexOf(dc.columnName);
      if (idx !== -1) result.splice(idx, 1);
    }
  });

  // Only insert configs that are not already in result (either we just removed them, or they are new)
  const toInsert = configs.filter((dc) => !result.includes(dc.columnName));

  const sorted = toInsert.sort((a, b) => {
    const posA = a.position != null && Number.isFinite(a.position) ? a.position : Infinity;
    const posB = b.position != null && Number.isFinite(b.position) ? b.position : Infinity;
    if (posA !== posB) return posA - posB;
    return a._index - b._index;
  });

  let insertedCount = 0;
  sorted.forEach((dc) => {
    if (result.includes(dc.columnName)) return;
    const position = dc.position != null && Number.isFinite(dc.position) ? dc.position : result.length;
    const insertAt = Math.min(position + insertedCount, result.length);
    result.splice(insertAt, 0, dc.columnName);
    insertedCount += 1;
  });

  return result;
}

/**
 * Get column names from derivedColumns where aggregate is explicitly false.
 * These columns should be excluded from numeric summation during grouping.
 * @param {Array} derivedColumns
 * @returns {string[]}
 */
export function getNonAggregatableColumnNames(derivedColumns) {
  if (!isArray(derivedColumns) || isEmpty(derivedColumns)) return [];
  return derivedColumns
    .filter((dc) => dc.aggregate === false && dc.columnName)
    .map((dc) => dc.columnName)
    .filter(Boolean);
}
