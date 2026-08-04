/**
 * Per-column filtering. Two kinds only, matching the two inputs in the header row:
 *
 *  - number columns take operator syntax: `>100` `>=100` `<100` `<=100` `=100` `10<>50`
 *    A bare number is a substring match (`21` finds 210 and 1,210); anything unparseable
 *    degrades to a case-insensitive text match.
 *  - everything else is a case-insensitive "contains".
 */

import { every, includes, isArray, isEmpty, isNil, toLower } from 'lodash';
import { getDataValue, toFiniteNumber } from './valueUtils';

const NUM = '([+-]?\\s*\\d+\\.?\\d*)';
const OPERATORS = [
  { type: 'range', regex: new RegExp(`^${NUM}\\s*<>\\s*${NUM}$`) },
  { type: 'lte', regex: new RegExp(`^<=\\s*${NUM}$`) },
  { type: 'gte', regex: new RegExp(`^>=\\s*${NUM}$`) },
  { type: 'lt', regex: new RegExp(`^<\\s*${NUM}$`) },
  { type: 'gt', regex: new RegExp(`^>\\s*${NUM}$`) },
  { type: 'eq', regex: new RegExp(`^=\\s*${NUM}$`) },
];
const PLAIN_NUMBER = new RegExp(`^${NUM}$`);

const parseNum = (raw) => Number(String(raw).replace(/\s+/g, ''));

export function parseNumericFilter(filterValue) {
  if (isNil(filterValue) || filterValue === '') return null;
  const str = String(filterValue).trim();

  for (const { type, regex } of OPERATORS) {
    const match = str.match(regex);
    if (!match) continue;
    if (type === 'range') {
      const min = parseNum(match[1]);
      const max = parseNum(match[2]);
      if (Number.isFinite(min) && Number.isFinite(max)) {
        return { type: 'range', min: Math.min(min, max), max: Math.max(min, max) };
      }
      continue;
    }
    const value = parseNum(match[1]);
    if (Number.isFinite(value)) return { type, value };
  }

  const plain = str.match(PLAIN_NUMBER);
  if (plain && Number.isFinite(parseNum(plain[1]))) {
    return { type: 'contains', value: str.replace(/\s+/g, '') };
  }
  return { type: 'text', value: str };
}

export function applyNumericFilter(cellValue, parsed) {
  if (!parsed) return true;
  const num = toFiniteNumber(cellValue);
  switch (parsed.type) {
    case 'lt': return num != null && num < parsed.value;
    case 'gt': return num != null && num > parsed.value;
    case 'lte': return num != null && num <= parsed.value;
    case 'gte': return num != null && num >= parsed.value;
    case 'eq': return num != null && num === parsed.value;
    case 'range': return num != null && num >= parsed.min && num <= parsed.max;
    case 'contains': return includes(String(cellValue ?? ''), parsed.value);
    case 'text':
    default:
      return includes(toLower(String(cellValue ?? '')), toLower(parsed.value));
  }
}

/** True when a filter box holds no constraint. */
export function isEmptyFilterValue(value) {
  return isNil(value) || String(value).trim() === '';
}

export function matchesColumnFilter(cellValue, filterValue, columnType) {
  if (columnType === 'number') return applyNumericFilter(cellValue, parseNumericFilter(filterValue));
  return includes(toLower(String(cellValue ?? '')), toLower(String(filterValue).trim()));
}

/** True when at least one filter box is actually narrowing the rows. */
export function hasActiveFilters(filters) {
  if (!filters || isEmpty(filters)) return false;
  return Object.keys(filters).some((key) => !isEmptyFilterValue(filters[key]));
}

/**
 * Narrow one table's rows by its own filter boxes.
 *
 * Group header rows are matched on the aggregate they display, so filtering a level keeps
 * the groups that match and leaves their children untouched — each nested table filters
 * only itself.
 *
 * @param {Array<Object>} rows
 * @param {Object} filters `{ [column]: 'raw input' }`
 * @param {Object} columnTypes column → type
 * @param {Function} [getCell]
 */
export function filterRows(rows, filters, columnTypes = {}, getCell = getDataValue) {
  if (!isArray(rows) || isEmpty(rows)) return isArray(rows) ? rows : [];
  const active = filters
    ? Object.keys(filters).filter((key) => !isEmptyFilterValue(filters[key]))
    : [];
  if (active.length === 0) return rows;

  return rows.filter((row) => every(active, (col) =>
    matchesColumnFilter(getCell(row, col), filters[col], columnTypes[col] || 'string')));
}
