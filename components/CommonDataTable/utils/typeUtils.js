/**
 * Column type detection + date display for CommonDataTable.
 *
 * Thresholds match the provider-backed table (70% boolean / 70% date / 80% numeric over
 * non-null cells in the first 100 rows) so a column reads the same in both tables.
 */

import { isBoolean, isDate, isNil, isNumber, isString, take, toNumber, trim } from 'lodash';

const MIN_TIMESTAMP = 315532800000; // 1980-01-01
const MAX_TIMESTAMP = 4102444800000; // 2100-01-01
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

export const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
  /^\d{4}\/\d{2}\/\d{2}$/,
  /^\d{1,2}\/\d{1,2}\/\d{4}$/,
  /^\d{1,2}-\d{1,2}-\d{4}$/,
  /^\d{1,2}\.\d{1,2}\.\d{4}$/,
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}$/i,
  /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i,
];

export function isBooleanValue(value) {
  if (isBoolean(value)) return true;
  if (isString(value)) {
    const lower = trim(value).toLowerCase();
    return (
      lower === 'true' || lower === 'false' ||
      lower === 'yes' || lower === 'no' ||
      lower === 'y' || lower === 'n' ||
      lower === '1' || lower === '0'
    );
  }
  if (isNumber(value)) return value === 0 || value === 1;
  return false;
}

export function isTruthyBoolean(value) {
  if (isBoolean(value)) return value;
  if (isNumber(value)) return value === 1;
  if (isString(value)) {
    const lower = trim(value).toLowerCase();
    return lower === 'true' || lower === 'yes' || lower === 'y' || lower === '1';
  }
  return false;
}

export function isNumericValue(value) {
  if (isNumber(value)) return true;
  if (isString(value)) {
    const trimmed = trim(value);
    if (trimmed === '') return false;
    const withoutCommas = trimmed.replace(/,/g, '');
    if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(withoutCommas)) {
      return !Number.isNaN(toNumber(withoutCommas));
    }
  }
  return false;
}

export function parseToDate(value) {
  if (isNil(value)) return null;
  if (value === '' || value === 0 || value === '0') return null;
  if (isDate(value)) return Number.isNaN(value.getTime()) ? null : value;
  if (isNumber(value)) {
    if (value <= 0) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (isString(value)) {
    const trimmed = trim(value);
    if (trimmed === '') return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/** Conservative "is this a date?" — plain integers and bare numerics are rejected. */
export function isDateLike(value) {
  if (isNil(value)) return false;
  if (value === 0 || value === '0' || value === '') return false;
  if (isDate(value)) return !Number.isNaN(value.getTime());
  if (isNumber(value)) {
    if (value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP) {
      return !Number.isNaN(new Date(value).getTime());
    }
    return false;
  }
  if (!isString(value)) return false;

  const trimmed = trim(value);
  if (trimmed === '') return false;
  if (/^-?\d+$/.test(trimmed)) return false;

  const hasLetters = /[a-zA-Z]/.test(trimmed);
  const matchesPattern = DATE_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (hasLetters && !matchesPattern) return false;

  if (matchesPattern) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      if (year >= MIN_YEAR && year <= MAX_YEAR) return true;
    }
  }

  if (!hasLetters) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const hasSeparators = /[/\-.]/.test(trimmed);
      if (hasSeparators) {
        const year = parsed.getFullYear();
        if (year >= MIN_YEAR && year <= MAX_YEAR) return !/^-?\d+\.?\d*$/.test(trimmed);
      }
    }
  }
  return false;
}

function getDateDisplayPrecision(value, date) {
  if (isString(value)) {
    const trimmed = trim(value);
    return {
      hasTime: /T\d{2}:\d{2}/.test(trimmed) || /\d{1,2}:\d{2}/.test(trimmed),
      hasSeconds: /:\d{2}(\.|Z|[+-]|$)/.test(trimmed) || /:\d{2}:\d{2}/.test(trimmed),
      hasMilliseconds: /\.\d{1,3}Z?$/.test(trimmed) || /\.\d{1,3}[+-]/.test(trimmed),
    };
  }
  const [h, m, s, ms] = [date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()];
  return {
    hasTime: h !== 0 || m !== 0 || s !== 0 || ms !== 0,
    hasSeconds: s !== 0 || ms !== 0,
    hasMilliseconds: ms !== 0,
  };
}

/** Render a date only as precisely as the source value actually was. */
export function formatDateValue(value) {
  if (isNil(value) || value === '' || value === 0 || value === '0') return '';
  const date = parseToDate(value);
  if (!date) return String(value ?? '');

  const { hasTime, hasSeconds, hasMilliseconds } = getDateDisplayPrecision(value, date);
  if (!hasTime) {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  if (hasSeconds) options.second = '2-digit';

  let formatted = date.toLocaleString('en-US', options);
  if (hasMilliseconds) {
    const padded = String(date.getMilliseconds()).padStart(3, '0');
    formatted = hasSeconds
      ? formatted.replace(/(:\d{2})/, `$1.${padded}`)
      : `${formatted}.${padded}`;
  }
  return formatted;
}

const SAMPLE_ROWS = 100;
const BOOLEAN_THRESHOLD = 0.7;
const DATE_THRESHOLD = 0.7;
const NUMERIC_THRESHOLD = 0.8;

/**
 * Infer `'number' | 'date' | 'boolean' | 'string'` per column from a data sample.
 * 0/1-only columns are read as booleans; everything ambiguous falls back to string.
 *
 * @param {Array<Object>} data rows to sample
 * @param {Array<string>} columns column names
 * @param {Function} getCell (row, col) => value
 * @returns {Object<string,string>} column → type
 */
export function detectColumnTypes(data, columns, getCell) {
  const result = {};
  if (!Array.isArray(data) || data.length === 0 || !Array.isArray(columns)) return result;

  const sample = take(data, SAMPLE_ROWS);

  columns.forEach((col) => {
    let numericCount = 0;
    let dateCount = 0;
    let booleanCount = 0;
    let binaryCount = 0;
    let nonNullCount = 0;

    sample.forEach((row) => {
      const value = getCell(row, col);
      if (isNil(value)) return;
      nonNullCount++;
      // 0 and 1 are counted as *ambiguous* rather than boolean: a money column with
      // plenty of zeros is still a number, and a column of nothing but 0/1 is a flag.
      if (value === 0 || value === 1 || value === '0' || value === '1') binaryCount++;
      else if (isBooleanValue(value)) booleanCount++;
      else if (isDateLike(value)) dateCount++;
      else if (isNumericValue(value)) numericCount++;
    });

    if (nonNullCount === 0) {
      result[col] = 'string';
      return;
    }

    const isBooleanColumn =
      numericCount === 0 && dateCount === 0 &&
      booleanCount + binaryCount > nonNullCount * BOOLEAN_THRESHOLD;
    const isDateColumn = !isBooleanColumn && dateCount > nonNullCount * DATE_THRESHOLD;
    const isNumericColumn =
      !isBooleanColumn && !isDateColumn &&
      numericCount + binaryCount > nonNullCount * NUMERIC_THRESHOLD;

    if (isBooleanColumn) result[col] = 'boolean';
    else if (isDateColumn) result[col] = 'date';
    else if (isNumericColumn) result[col] = 'number';
    else result[col] = 'string';
  });

  return result;
}
