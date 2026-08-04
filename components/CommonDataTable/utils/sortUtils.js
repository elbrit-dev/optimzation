/**
 * Type-aware multi-column sorting.
 *
 * The table sorts its own rows rather than handing `multiSortMeta` to PrimeReact —
 * PrimeReact's built-in comparator is lexicographic, which reorders `dd/mm/yyyy`
 * dates and `1,234`-style numbers incorrectly.
 */

import { isArray, isEmpty } from 'lodash';
import { isTruthyBoolean, parseToDate } from './typeUtils';
import { getDataValue, isBlankValue, toFiniteNumber } from './valueUtils';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Compare two non-blank cells as `type`. Returns <0, 0, >0. */
export function compareTyped(a, b, type) {
  if (type === 'number') {
    const numA = toFiniteNumber(a);
    const numB = toFiniteNumber(b);
    if (numA == null && numB == null) return 0;
    if (numA == null) return 1;
    if (numB == null) return -1;
    return numA === numB ? 0 : numA < numB ? -1 : 1;
  }
  if (type === 'date') {
    const dateA = parseToDate(a);
    const dateB = parseToDate(b);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.getTime() - dateB.getTime();
  }
  if (type === 'boolean') {
    const boolA = isTruthyBoolean(a);
    const boolB = isTruthyBoolean(b);
    return boolA === boolB ? 0 : boolA ? 1 : -1;
  }
  return collator.compare(String(a), String(b));
}

/**
 * Stable multi-column sort. Blank cells always sink to the bottom, in both
 * directions — flipping them with the sort direction makes a descending sort
 * look empty at the top.
 *
 * @param {Array<Object>} rows
 * @param {Array<{field: string, order: number}>} sortMeta order: 1 asc, -1 desc
 * @param {Object} options
 * @param {Object} options.columnTypes column → `'number'|'date'|'boolean'|'string'`
 * @param {Function} [options.getCell]
 */
export function sortRows(rows, sortMeta, { columnTypes = {}, getCell = getDataValue } = {}) {
  if (!isArray(rows) || rows.length < 2) return isArray(rows) ? rows : [];
  if (!isArray(sortMeta) || isEmpty(sortMeta)) return rows;

  // Decorate with the original index so equal rows keep input order on every engine.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      for (const meta of sortMeta) {
        const field = meta?.field;
        if (!field) continue;
        const a = getCell(left.row, field);
        const b = getCell(right.row, field);
        const aBlank = isBlankValue(a);
        const bBlank = isBlankValue(b);
        if (aBlank || bBlank) {
          if (aBlank && bBlank) continue;
          return aBlank ? 1 : -1;
        }
        const result = compareTyped(a, b, columnTypes[field] || 'string');
        if (result !== 0) return meta.order === -1 ? -result : result;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.row);
}

/**
 * Cycle one column through asc → desc → off within an existing multi-sort list.
 * `additive` (shift-click) keeps the other columns; otherwise the column becomes
 * the only sort.
 */
export function toggleSort(sortMeta, field, { additive = false } = {}) {
  const current = isArray(sortMeta) ? sortMeta : [];
  const existing = current.find((meta) => meta.field === field);

  if (!additive) {
    if (!existing) return [{ field, order: 1 }];
    if (existing.order === 1) return [{ field, order: -1 }];
    return [];
  }

  if (!existing) return [...current, { field, order: 1 }];
  if (existing.order === 1) {
    return current.map((meta) => (meta.field === field ? { field, order: -1 } : meta));
  }
  return current.filter((meta) => meta.field !== field);
}

/** Position of `field` in the sort list (1-based), or 0 when unsorted. */
export function getSortIndex(sortMeta, field) {
  if (!isArray(sortMeta)) return 0;
  return sortMeta.findIndex((meta) => meta.field === field) + 1;
}

/** Sort direction for `field`: 1, -1, or 0 when unsorted. */
export function getSortOrder(sortMeta, field) {
  if (!isArray(sortMeta)) return 0;
  return sortMeta.find((meta) => meta.field === field)?.order ?? 0;
}
