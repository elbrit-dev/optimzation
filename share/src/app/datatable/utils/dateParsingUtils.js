import { isDate, isNil, isNumber, isString, trim } from 'lodash';

const MIN_TIMESTAMP = 315532800000;
const MAX_TIMESTAMP = 4102444800000;
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

export function parseToDate(value) {
  if (isNil(value)) return null;
  if (value === '' || value === 0 || value === '0') return null;
  if (isDate(value)) return value;
  if (isNumber(value)) {
    if (value <= 0) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  if (isString(value)) {
    const trimmedValue = trim(value);
    if (trimmedValue === '') return null;
    const parsed = new Date(trimmedValue);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function isDateLike(value) {
  if (isNil(value)) return false;
  if (value === 0 || value === '0' || value === '') return false;
  if (isDate(value)) return true;
  if (isNumber(value)) {
    if (value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP) {
      const date = new Date(value);
      return !isNaN(date.getTime());
    }
    return false;
  }
  if (isString(value)) {
    const trimmedValue = trim(value);
    if (trimmedValue === '') return false;
    if (/^-?\d+$/.test(trimmedValue)) return false;
    const hasLetters = /[a-zA-Z]/.test(trimmedValue);
    if (hasLetters) {
      if (!DATE_PATTERNS.some((pattern) => pattern.test(trimmedValue))) return false;
    }
    if (DATE_PATTERNS.some((pattern) => pattern.test(trimmedValue))) {
      const parsed = new Date(trimmedValue);
      if (!isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        if (year >= MIN_YEAR && year <= MAX_YEAR) return true;
      }
    }
    if (!hasLetters) {
      const parsed = new Date(trimmedValue);
      if (!isNaN(parsed.getTime())) {
        const hasSeparators = /[\/\-\.]/.test(trimmedValue) || /^\d{4}-\d{2}-\d{2}/.test(trimmedValue);
        if (hasSeparators) {
          const year = parsed.getFullYear();
          if (year >= MIN_YEAR && year <= MAX_YEAR) {
            return !/^-?\d+\.?\d*$/.test(trimmedValue);
          }
        }
      }
    }
  }
  return false;
}
