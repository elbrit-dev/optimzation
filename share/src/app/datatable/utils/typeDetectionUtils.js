import { isArray, isBoolean, isEmpty, isNil, isNumber, isString, take, toNumber, trim } from 'lodash';
import { getNestedValue } from './dataAccessUtils';
import { isDateLike, parseToDate } from './dateParsingUtils';

const isNaNNumber = Number.isNaN;

export function isBooleanValue(value) {
  if (isBoolean(value)) return true;
  if (isString(value)) {
    const lower = trim(value).toLowerCase();
    return lower === 'true' || lower === 'false' ||
      lower === 'yes' || lower === 'no' ||
      lower === 'y' || lower === 'n' ||
      lower === '1' || lower === '0';
  }
  if (isNumber(value)) return value === 0 || value === 1;
  return false;
}

export function isNumericValue(value) {
  if (isNumber(value)) return true;
  if (isString(value)) {
    const trimmedValue = trim(value);
    if (trimmedValue === '') return false;
    const withoutCommas = trimmedValue.replace(/,/g, '');
    const numericPattern = /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/;
    if (numericPattern.test(withoutCommas)) {
      const parsed = toNumber(withoutCommas);
      return !isNaNNumber(parsed);
    }
  }
  return false;
}

export { parseToDate, isDateLike } from './dateParsingUtils';

const THIRDS_DIVISOR = 3;
const SAMPLE_SIZE_DIVISOR = 2;

export function getDistributedSamples(data, topLevelKey, nestedPath) {
  if (!data || data.length === 0) return [];
  const targetSampleSize = Math.floor(data.length / SAMPLE_SIZE_DIVISOR);
  if (targetSampleSize === 0) return [];

  const samples = [];
  const dataLength = data.length;
  const thirdSize = Math.floor(dataLength / THIRDS_DIVISOR);
  const topEnd = thirdSize;
  const middleStart = thirdSize;
  const middleEnd = thirdSize * 2;
  const bottomStart = thirdSize * 2;
  const samplesPerThird = Math.ceil(targetSampleSize / THIRDS_DIVISOR);

  const topStep = Math.max(1, Math.floor(topEnd / samplesPerThird));
  for (let i = 0; i < topEnd && samples.length < targetSampleSize; i += topStep) {
    const value = getNestedValue(data[i], topLevelKey, nestedPath);
    if (value != null) {
      samples.push(value);
      if (samples.length >= targetSampleSize) break;
    }
  }

  const middleStep = Math.max(1, Math.floor((middleEnd - middleStart) / samplesPerThird));
  for (let i = middleStart; i < middleEnd && samples.length < targetSampleSize; i += middleStep) {
    const value = getNestedValue(data[i], topLevelKey, nestedPath);
    if (value != null) {
      samples.push(value);
      if (samples.length >= targetSampleSize) break;
    }
  }

  const bottomStep = Math.max(1, Math.floor((dataLength - bottomStart) / samplesPerThird));
  for (let i = bottomStart; i < dataLength && samples.length < targetSampleSize; i += bottomStep) {
    const value = getNestedValue(data[i], topLevelKey, nestedPath);
    if (value != null) {
      samples.push(value);
      if (samples.length >= targetSampleSize) break;
    }
  }

  if (samples.length < targetSampleSize) {
    const seen = new Set();
    for (let i = 0; i < dataLength && samples.length < targetSampleSize; i++) {
      const value = getNestedValue(data[i], topLevelKey, nestedPath);
      if (value != null) {
        const key = typeof value === 'object' ? String(value) : value;
        if (!seen.has(key)) {
          seen.add(key);
          samples.push(value);
        }
      }
    }
  }

  return samples;
}

export function countSampleTypes(samples) {
  let booleanCount = 0;
  let numberCount = 0;
  let dateCount = 0;
  for (const value of samples) {
    if (isBooleanValue(value)) booleanCount++;
    else if (isNumericValue(value)) numberCount++;
    else if (isDateLike(value)) dateCount++;
  }
  return { booleanCount, numberCount, dateCount };
}

const DATE_MAJORITY_THRESHOLD = 0.5;

/** Treat as empty for type inference: null, undefined, '', whitespace-only */
function isEmptyForInference(value) {
  if (value == null) return true;
  if (typeof value === 'string' && trim(value) === '') return true;
  return false;
}

export function inferColumnType(data, field, topLevelKey, nestedPath) {
  if (!data || data.length === 0) return 'string';
  const samples = getDistributedSamples(data, topLevelKey, nestedPath);
  if (samples.length === 0) return 'string';

  const meaningfulSamples = samples.filter((s) => !isEmptyForInference(s));
  if (meaningfulSamples.length === 0) return 'string';

  const { booleanCount, numberCount, dateCount } = countSampleTypes(meaningfulSamples);
  if (booleanCount === meaningfulSamples.length) return 'boolean';
  if (numberCount === meaningfulSamples.length) return 'number';
  if (dateCount > meaningfulSamples.length * DATE_MAJORITY_THRESHOLD) return 'date';
  return 'string';
}

/**
 * Detect column types using the same logic as DataProviderOld/DataProviderNew.
 * Uses 80% threshold for numeric (nonNullCount denominator) so group aggregation matches.
 * @param {Array} data - Sample rows
 * @param {Array} columns - Column names to detect
 * @param {Function} getDataValue - (row, col) => value
 * @returns {Object} { colName: 'number'|'boolean'|'date'|'string' }
 */
export function detectColumnTypesLikeProvider(data, columns, getDataValue) {
  const result = {};
  if (!isArray(data) || isEmpty(data) || !isArray(columns)) return result;

  const sampleData = take(data, 100);
  columns.forEach((col) => {
    let numericCount = 0;
    let dateCount = 0;
    let booleanCount = 0;
    let binaryCount = 0;
    let nonNullCount = 0;

    sampleData.forEach((row) => {
      const value = getDataValue(row, col);
      if (!isNil(value)) {
        nonNullCount++;
        if (isBooleanValue(value)) {
          booleanCount++;
        } else if (value === 0 || value === 1 || value === '0' || value === '1') {
          binaryCount++;
        } else if (isDateLike(value)) {
          dateCount++;
        } else if (isNumericValue(value)) {
          numericCount++;
        }
      }
    });

    const isTrueBooleanColumn = nonNullCount > 0 && booleanCount > nonNullCount * 0.7;
    const isBinaryBooleanColumn = nonNullCount > 0 && binaryCount === nonNullCount && binaryCount >= 1;
    const isBooleanColumn = isTrueBooleanColumn || isBinaryBooleanColumn;

    let dateCountWithBinary = dateCount;
    if (!isBooleanColumn && binaryCount > 0) {
      sampleData.forEach((row) => {
        const value = getDataValue(row, col);
        if (!isNil(value) && (value === 0 || value === 1 || value === '0' || value === '1')) {
          if (isDateLike(value)) dateCountWithBinary++;
        }
      });
    }
    const isDateColumn = !isBooleanColumn && nonNullCount > 0 && dateCountWithBinary > nonNullCount * 0.7;

    let numericCountWithBinary = numericCount;
    if (!isBooleanColumn && !isDateColumn && binaryCount > 0) {
      numericCountWithBinary += binaryCount;
    }
    const isNumericColumn = !isBooleanColumn && !isDateColumn && nonNullCount > 0 && numericCountWithBinary > nonNullCount * 0.8;

    let type = 'string';
    if (isBooleanColumn) type = 'boolean';
    else if (isDateColumn) type = 'date';
    else if (isNumericColumn) type = 'number';
    result[col] = type;
  });
  return result;
}
