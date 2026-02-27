import { every, get, includes, isArray, isNil, isEmpty, filter, toLower } from 'lodash';
import { isNumber, toNumber } from 'lodash';
import { parseToDate } from './dateParsingUtils';

const isNaNNumber = Number.isNaN;

export function parseNumericFilter(filterValue) {
  if (isNil(filterValue) || filterValue === '') return null;
  const str = String(filterValue).trim();
  const numPattern = '([+-]?\\s*\\d+\\.?\\d*)';
  const parseNum = (numStr) => toNumber(numStr.replace(/\s+/g, ''));
  const rangeRegex = new RegExp(`^${numPattern}\\s*<>\\s*${numPattern}$`);
  const rangeMatch = str.match(rangeRegex);
  if (rangeMatch) {
    const min = parseNum(rangeMatch[1]);
    const max = parseNum(rangeMatch[2]);
    if (!isNaNNumber(min) && !isNaNNumber(max)) {
      return { type: 'range', min: Math.min(min, max), max: Math.max(min, max) };
    }
  }
  const lteRegex = new RegExp(`^<=\\s*${numPattern}$`);
  const lteMatch = str.match(lteRegex);
  if (lteMatch) {
    const num = parseNum(lteMatch[1]);
    if (!isNaNNumber(num)) return { type: 'lte', value: num };
  }
  const gteRegex = new RegExp(`^>=\\s*${numPattern}$`);
  const gteMatch = str.match(gteRegex);
  if (gteMatch) {
    const num = parseNum(gteMatch[1]);
    if (!isNaNNumber(num)) return { type: 'gte', value: num };
  }
  const ltRegex = new RegExp(`^<\\s*${numPattern}$`);
  const ltMatch = str.match(ltRegex);
  if (ltMatch) {
    const num = parseNum(ltMatch[1]);
    if (!isNaNNumber(num)) return { type: 'lt', value: num };
  }
  const gtRegex = new RegExp(`^>\\s*${numPattern}$`);
  const gtMatch = str.match(gtRegex);
  if (gtMatch) {
    const num = parseNum(gtMatch[1]);
    if (!isNaNNumber(num)) return { type: 'gt', value: num };
  }
  const eqRegex = new RegExp(`^=\\s*${numPattern}$`);
  const eqMatch = str.match(eqRegex);
  if (eqMatch) {
    const num = parseNum(eqMatch[1]);
    if (!isNaNNumber(num)) return { type: 'eq', value: num };
  }
  const plainNumRegex = new RegExp(`^${numPattern}$`);
  const plainMatch = str.match(plainNumRegex);
  if (plainMatch) {
    const num = parseNum(plainMatch[1]);
    if (!isNaNNumber(num)) return { type: 'contains', value: str.replace(/\s+/g, '') };
  }
  return { type: 'text', value: str };
}

export function applyNumericFilter(cellValue, parsedFilter) {
  if (!parsedFilter) return true;
  const numCell = isNumber(cellValue) ? cellValue : toNumber(cellValue);
  switch (parsedFilter.type) {
    case 'lt':
      return !isNaNNumber(numCell) && numCell < parsedFilter.value;
    case 'gt':
      return !isNaNNumber(numCell) && numCell > parsedFilter.value;
    case 'lte':
      return !isNaNNumber(numCell) && numCell <= parsedFilter.value;
    case 'gte':
      return !isNaNNumber(numCell) && numCell >= parsedFilter.value;
    case 'eq':
      return !isNaNNumber(numCell) && numCell === parsedFilter.value;
    case 'range':
      return !isNaNNumber(numCell) && numCell >= parsedFilter.min && numCell <= parsedFilter.max;
    case 'contains':
      return includes(String(cellValue ?? ''), parsedFilter.value);
    case 'text':
    default:
      return includes(toLower(String(cellValue ?? '')), toLower(parsedFilter.value));
  }
}

const START_OF_DAY_HOURS = 0;
const START_OF_DAY_MINUTES = 0;
const START_OF_DAY_SECONDS = 0;
const START_OF_DAY_MS = 0;
const END_OF_DAY_HOURS = 23;
const END_OF_DAY_MINUTES = 59;
const END_OF_DAY_SECONDS = 59;
const END_OF_DAY_MS = 999;

export function applyDateFilter(cellValue, dateRange) {
  if (!dateRange || (!dateRange[0] && !dateRange[1])) return true;
  const cellDate = parseToDate(cellValue);
  if (!cellDate) return false;
  const [startDate, endDate] = dateRange;
  const cellTime = cellDate.getTime();
  if (startDate && endDate) {
    const startTime = new Date(startDate).setHours(START_OF_DAY_HOURS, START_OF_DAY_MINUTES, START_OF_DAY_SECONDS, START_OF_DAY_MS);
    const endTime = new Date(endDate).setHours(END_OF_DAY_HOURS, END_OF_DAY_MINUTES, END_OF_DAY_SECONDS, END_OF_DAY_MS);
    return cellTime >= startTime && cellTime <= endTime;
  }
  if (startDate) {
    const startTime = new Date(startDate).setHours(START_OF_DAY_HOURS, START_OF_DAY_MINUTES, START_OF_DAY_SECONDS, START_OF_DAY_MS);
    return cellTime >= startTime;
  }
  if (endDate) {
    const endTime = new Date(endDate).setHours(END_OF_DAY_HOURS, END_OF_DAY_MINUTES, END_OF_DAY_SECONDS, END_OF_DAY_MS);
    return cellTime <= endTime;
  }
  return true;
}

function matchesColumnFilter(cellValue, filterValue, columnType, isMultiselectColumn) {
  if (isMultiselectColumn && isArray(filterValue)) {
    return filterValue.some((v) => {
      if (isNil(v) && isNil(cellValue)) return true;
      if (isNil(v) || isNil(cellValue)) return false;
      return v === cellValue || String(v) === String(cellValue);
    });
  }
  if (columnType === 'boolean') {
    const cellIsTruthy = cellValue === true || cellValue === 1 || cellValue === '1';
    const cellIsFalsy = cellValue === false || cellValue === 0 || cellValue === '0';
    if (filterValue === true) return cellIsTruthy;
    if (filterValue === false) return cellIsFalsy;
    return true;
  }
  if (columnType === 'date') return applyDateFilter(cellValue, filterValue);
  if (columnType === 'number') {
    const parsed = parseNumericFilter(filterValue);
    return applyNumericFilter(cellValue, parsed);
  }
  const strCell = toLower(String(cellValue ?? ''));
  const strFilter = toLower(String(filterValue));
  return includes(strCell, strFilter);
}

export function applyRowFilters(row, options) {
  if (!row || typeof row !== 'object') return false;
  const { filters, columnMeta } = options;
  if (!filters || isEmpty(filters)) return true;

  const { columns, columnTypes, multiselectColumns, hasPercentageColumns, percentageColumnNames, getCellValue } = columnMeta;

  const regularColumnsPass = every(columns, (col) => {
    const filterObj = get(filters, col);
    if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;
    if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;
    const cellValue = getCellValue(row, col);
    const columnType = columnTypes[col] || 'string';
    const isMultiselectColumn = includes(multiselectColumns, col);
    return matchesColumnFilter(cellValue, filterObj.value, columnType, isMultiselectColumn);
  });
  if (!regularColumnsPass) return false;

  if (hasPercentageColumns && percentageColumnNames.length > 0) {
    const percentageColumnsPass = every(percentageColumnNames, (col) => {
      const filterObj = get(filters, col);
      if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;
      if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;
      const cellValue = getCellValue(row, col);
      const parsed = parseNumericFilter(filterObj.value);
      return applyNumericFilter(cellValue, parsed);
    });
    if (!percentageColumnsPass) return false;
  }

  return true;
}

export function filterRows(data, options) {
  if (!isArray(data) || isEmpty(data)) return [];
  if (!options.filters || isEmpty(options.filters)) return data;
  return filter(data, (row) => applyRowFilters(row, options));
}
