/**
 * Filtering for CommonDataTable — per-column filters plus a global search.
 *
 * Numeric filters accept operator syntax typed straight into the header input:
 *   `>100`  `>=100`  `<100`  `<=100`  `=100`  `10<>50` (inclusive range)
 * A bare number is a substring match (so `21` finds 210 and 1210), and anything
 * unparseable degrades to a case-insensitive text match.
 */

import { every, includes, isArray, isEmpty, isNil, toLower } from 'lodash';
import { parseToDate } from './typeUtils';
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
  if (plain) {
    const value = parseNum(plain[1]);
    if (Number.isFinite(value)) return { type: 'contains', value: str.replace(/\s+/g, '') };
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

const START_OF_DAY = [0, 0, 0, 0];
const END_OF_DAY = [23, 59, 59, 999];

/** `dateRange` is PrimeReact Calendar range shape: `[from, to]`, either side optional. */
export function applyDateFilter(cellValue, dateRange) {
  if (!isArray(dateRange) || (!dateRange[0] && !dateRange[1])) return true;
  const cellDate = parseToDate(cellValue);
  if (!cellDate) return false;

  const cellTime = cellDate.getTime();
  const [from, to] = dateRange;
  if (from) {
    const fromTime = new Date(from).setHours(...START_OF_DAY);
    if (cellTime < fromTime) return false;
  }
  if (to) {
    const toTime = new Date(to).setHours(...END_OF_DAY);
    if (cellTime > toTime) return false;
  }
  return true;
}

/** True when a filter value carries no constraint (null, '', or empty array). */
export function isEmptyFilterValue(value) {
  if (isNil(value) || value === '') return true;
  return isArray(value) && isEmpty(value);
}

export function matchesColumnFilter(cellValue, filterValue, columnType, isMultiselect) {
  if (columnType === 'boolean') {
    const truthy = cellValue === true || cellValue === 1 || cellValue === '1' ||
      toLower(String(cellValue)) === 'true' || toLower(String(cellValue)) === 'yes';
    const falsy = cellValue === false || cellValue === 0 || cellValue === '0' ||
      toLower(String(cellValue)) === 'false' || toLower(String(cellValue)) === 'no';
    if (filterValue === true) return truthy;
    if (filterValue === false) return falsy;
    return true;
  }
  if (columnType === 'date') return applyDateFilter(cellValue, filterValue);
  if (columnType === 'number') return applyNumericFilter(cellValue, parseNumericFilter(filterValue));

  if (isMultiselect && isArray(filterValue)) {
    return filterValue.some((v) => {
      if (isNil(v) && isNil(cellValue)) return true;
      if (isNil(v) || isNil(cellValue)) return false;
      return v === cellValue || String(v) === String(cellValue);
    });
  }
  return includes(toLower(String(cellValue ?? '')), toLower(String(filterValue)));
}

/** True when at least one column filter is actually constraining the data. */
export function hasActiveFilters(filters) {
  if (!filters || isEmpty(filters)) return false;
  return Object.keys(filters).some((key) => !isEmptyFilterValue(filters[key]?.value));
}

/** Case-insensitive "any visible column contains" search. */
export function matchesGlobalSearch(row, term, columns, getCell = getDataValue) {
  if (!term) return true;
  const needle = toLower(String(term).trim());
  if (needle === '') return true;
  return columns.some((col) => includes(toLower(String(getCell(row, col) ?? '')), needle));
}

/**
 * Apply column filters + global search to a flat row list.
 *
 * @param {Array<Object>} data leaf rows
 * @param {Object} options
 * @param {Object} options.filters PrimeReact shape — `{ [col]: { value, matchMode } }`
 * @param {string} [options.globalSearch]
 * @param {Array<string>} options.columns columns eligible for global search
 * @param {Object} options.columnTypes column → detected type
 * @param {Array<string>} [options.multiselectColumns]
 * @param {Function} [options.getCell]
 */
export function filterRows(data, options) {
  if (!isArray(data) || isEmpty(data)) return [];
  const {
    filters,
    globalSearch = '',
    columns = [],
    columnTypes = {},
    multiselectColumns = [],
    getCell = getDataValue,
  } = options || {};

  const activeKeys = filters
    ? Object.keys(filters).filter((key) => !isEmptyFilterValue(filters[key]?.value))
    : [];
  const searchTerm = String(globalSearch ?? '').trim();
  if (activeKeys.length === 0 && searchTerm === '') return data;

  const multiselectSet = new Set(multiselectColumns);

  return data.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    const columnsPass = every(activeKeys, (col) =>
      matchesColumnFilter(
        getCell(row, col),
        filters[col].value,
        columnTypes[col] || 'string',
        multiselectSet.has(col),
      ));
    if (!columnsPass) return false;
    return matchesGlobalSearch(row, searchTerm, columns, getCell);
  });
}

/**
 * Distinct values per column, for multiselect filter dropdowns.
 * Capped so a high-cardinality column can't build a 50k-item dropdown.
 */
export function buildFilterOptions(data, columns, getCell = getDataValue, limit = 500) {
  const options = {};
  if (!isArray(data) || isEmpty(data)) return options;

  columns.forEach((col) => {
    const seen = new Set();
    for (const row of data) {
      const value = getCell(row, col);
      if (isNil(value) || value === '') continue;
      seen.add(String(value));
      if (seen.size >= limit) break;
    }
    options[col] = Array.from(seen)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map((value) => ({ label: value, value }));
  });

  return options;
}
