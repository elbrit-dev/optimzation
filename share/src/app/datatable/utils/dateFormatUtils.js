import { isNil, isString, trim } from 'lodash';
import { parseToDate } from './dateParsingUtils';

export function getDateDisplayPrecision(value, date) {
  let hasTime = false;
  let hasSeconds = false;
  let hasMilliseconds = false;
  if (isString(value)) {
    const trimmedValue = trim(value);
    hasMilliseconds = /\.\d{1,3}Z?$/.test(trimmedValue) || /\.\d{1,3}[+-]/.test(trimmedValue);
    hasSeconds = /:\d{2}(\.|Z|[+-]|$)/.test(trimmedValue) || /:\d{2}:\d{2}/.test(trimmedValue);
    hasTime = /T\d{2}:\d{2}/.test(trimmedValue) || /\d{1,2}:\d{2}/.test(trimmedValue);
  } else {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const milliseconds = date.getMilliseconds();
    hasTime = hours !== 0 || minutes !== 0 || seconds !== 0 || milliseconds !== 0;
    hasSeconds = seconds !== 0 || milliseconds !== 0;
    hasMilliseconds = milliseconds !== 0;
  }
  return { hasTime, hasSeconds, hasMilliseconds };
}

export function formatDateValue(value) {
  if (isNil(value) || value === '' || value === 0 || value === '0') return '';
  const date = parseToDate(value);
  if (!date) return String(value ?? '');

  const { hasTime, hasSeconds, hasMilliseconds } = getDateDisplayPrecision(value, date);
  if (!hasTime) {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  const formatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  if (hasSeconds) formatOptions.second = '2-digit';

  let formatted = date.toLocaleString('en-US', formatOptions);
  if (hasMilliseconds) {
    const milliseconds = date.getMilliseconds();
    const millisecondsPadded = String(milliseconds).padStart(3, '0');
    formatted = hasSeconds
      ? formatted.replace(/(:\d{2})/, `$1.${millisecondsPadded}`)
      : `${formatted}.${millisecondsPadded}`;
  }
  return formatted;
}
