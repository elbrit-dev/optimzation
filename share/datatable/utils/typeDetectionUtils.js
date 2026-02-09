import { isArray, isBoolean, isNumber, isString, toNumber, trim } from 'lodash';
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

export function inferColumnType(data, field, topLevelKey, nestedPath) {
  if (!data || data.length === 0) return 'string';
  const samples = getDistributedSamples(data, topLevelKey, nestedPath);
  if (samples.length === 0) return 'string';

  const { booleanCount, numberCount, dateCount } = countSampleTypes(samples);
  if (booleanCount === samples.length) return 'boolean';
  if (numberCount === samples.length) return 'number';
  if (dateCount > samples.length * DATE_MAJORITY_THRESHOLD) return 'date';
  return 'string';
}
