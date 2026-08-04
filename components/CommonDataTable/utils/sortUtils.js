/**
 * Type-aware single-column sorting.
 *
 * The table sorts its own rows rather than letting PrimeReact do it: PrimeReact's
 * comparator is lexicographic, which misorders `dd/mm/yyyy` dates and `1,234`-style
 * numbers.
 */

import { isArray } from 'lodash';
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
 * Stable sort by one column. Blank cells always sink to the bottom, in both
 * directions — flipping them with the sort would make a descending sort open on
 * a screen of empties.
 *
 * @param {Array<Object>} rows
 * @param {{field: string, order: number}|null} sort order: 1 asc, -1 desc
 * @param {Object} options
 * @param {Object} options.columnTypes column → `'number'|'date'|'boolean'|'string'`
 * @param {Function} [options.getCell]
 */
export function sortRows(rows, sort, { columnTypes = {}, getCell = getDataValue } = {}) {
  if (!isArray(rows) || rows.length < 2) return isArray(rows) ? rows : [];
  if (!sort?.field) return rows;

  const { field, order } = sort;
  const type = columnTypes[field] || 'string';

  // Decorate with the original index so equal rows keep input order on every engine.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const a = getCell(left.row, field);
      const b = getCell(right.row, field);
      const aBlank = isBlankValue(a);
      const bBlank = isBlankValue(b);
      if (aBlank || bBlank) {
        if (aBlank && bBlank) return left.index - right.index;
        return aBlank ? 1 : -1;
      }
      const result = compareTyped(a, b, type);
      return result !== 0 ? (order === -1 ? -result : result) : left.index - right.index;
    })
    .map((entry) => entry.row);
}

/** Cycle a column through ascending → descending → unsorted. */
export function toggleSort(sort, field) {
  if (sort?.field !== field) return { field, order: 1 };
  if (sort.order === 1) return { field, order: -1 };
  return null;
}
