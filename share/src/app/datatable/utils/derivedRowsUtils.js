/**
 * Derived rows utility - add rows to data after pipeline merge, before auth filter.
 * compute(ctx) returns rows to append; ctx has { data, query, selectedQueryKey, currentQueryDoc }.
 */

import { isArray } from 'lodash';

/**
 * Apply derived rows synchronously. Merges base data with rows from compute(ctx).
 * When compute returns a Promise, returns base data (async handled by useDerivedRowsData).
 * @param {Array} data - Base data (rawTableData)
 * @param {Object|null} derivedRows - { compute: (ctx) => Row[] | Promise<Row[]> }
 * @param {Object} context - { query, selectedQueryKey, currentQueryDoc }
 * @returns {Array} data with derived rows appended (sync only; async returns data unchanged)
 */
export function applyDerivedRows(data, derivedRows, context = {}) {
  if (!isArray(data)) return data ?? [];
  if (!derivedRows || typeof derivedRows.compute !== 'function') return data;

  const ctx = {
    data: data,
    query: context.query ?? null,
    selectedQueryKey: context.selectedQueryKey ?? null,
    currentQueryDoc: context.currentQueryDoc ?? null,
  };

  try {
    const extra = derivedRows.compute(ctx);
    if (extra instanceof Promise) {
      return data;
    }
    if (isArray(extra) && extra.length > 0) {
      return [...data, ...extra];
    }
  } catch (err) {
    console.warn('[derivedRows] compute error:', err);
  }
  return data;
}

/**
 * Apply derived rows asynchronously. Returns Promise<Array> with merged data.
 * @param {Array} data - Base data (rawTableData)
 * @param {Object|null} derivedRows - { compute: (ctx) => Row[] | Promise<Row[]> }
 * @param {Object} context - { query, selectedQueryKey, currentQueryDoc }
 * @returns {Promise<Array>} Merged data
 */
export async function applyDerivedRowsAsync(data, derivedRows, context = {}) {
  if (!isArray(data)) return data ?? [];
  if (!derivedRows || typeof derivedRows.compute !== 'function') return data;

  const ctx = {
    data: data,
    query: context.query ?? null,
    selectedQueryKey: context.selectedQueryKey ?? null,
    currentQueryDoc: context.currentQueryDoc ?? null,
  };

  try {
    const extra = await Promise.resolve(derivedRows.compute(ctx));
    if (isArray(extra) && extra.length > 0) {
      return [...data, ...extra];
    }
  } catch (err) {
    console.warn('[derivedRows] compute error:', err);
  }
  return data;
}
