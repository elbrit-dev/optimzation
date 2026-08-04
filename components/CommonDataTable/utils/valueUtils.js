/**
 * Value access + display formatting for CommonDataTable.
 *
 * Self-contained on purpose: nothing here imports from `share/`, so the table can be
 * lifted into another app by copying the CommonDataTable folder alone.
 */

import { isNil, isNumber, isString, get, startCase, toNumber, trim } from 'lodash';

export const ONE_LAKH = 100000;

/** Internal keys the table hangs off rows; never rendered as columns. */
export const INTERNAL_KEY_PREFIX = '__';

function mapToObject(map) {
  const out = {};
  map.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/**
 * Read one cell out of a row. Handles plain objects, Maps, and dotted paths
 * (`sales_team.name`) — a flat key always wins over a path lookup, so a literal
 * key containing a dot still resolves.
 */
export function getDataValue(row, key) {
  if (!row || !key || typeof row !== 'object') return undefined;
  if (row instanceof Map) {
    if (row.has(key)) return row.get(key);
    return key.includes('.') ? get(mapToObject(row), key) : undefined;
  }
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  return key.includes('.') ? get(row, key) : undefined;
}

/** Keys of a row, Map or object. */
export function getDataKeys(row) {
  if (!row || typeof row !== 'object') return [];
  if (row instanceof Map) return Array.from(row.keys());
  return Object.keys(row);
}

/** Normalize a Map row to a plain object so PrimeReact templates can read it. */
export function toPlainRow(row) {
  return row instanceof Map ? mapToObject(row) : row;
}

/** `custom_doctor_code` → `Custom Doctor Code`. */
export function formatHeaderName(col) {
  if (isNil(col)) return '';
  const cleaned = String(col).replace(/__+/g, '_');
  return startCase(cleaned);
}

/** Parse to a finite number, tolerating thousands separators. Returns null when not numeric. */
export function toFiniteNumber(value) {
  if (isNumber(value)) return Number.isFinite(value) ? value : null;
  if (isString(value)) {
    const cleaned = trim(value).replace(/,/g, '');
    if (cleaned === '') return null;
    const parsed = toNumber(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return null;
}

/**
 * Number display used by cells, group aggregates and footer totals alike —
 * integers stay bare, fractions land on exactly 2 decimals.
 */
export function formatNumber(value, { divideBy1Lakh = false } = {}) {
  const num = toFiniteNumber(value);
  if (num == null) return isNil(value) ? '' : String(value);
  const display = divideBy1Lakh ? num / ONE_LAKH : num;
  return display % 1 === 0
    ? display.toLocaleString('en-US')
    : display.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Sum a column across rows, treating non-numeric cells as 0. */
export function sumColumn(rows, col, getCell = getDataValue) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let total = 0;
  for (const row of rows) {
    const num = toFiniteNumber(getCell(row, col));
    if (num != null) total += num;
  }
  return total;
}

/** True when a cell should be treated as "no value" for sorting/aggregation. */
export function isBlankValue(value) {
  if (isNil(value)) return true;
  if (isString(value) && trim(value) === '') return true;
  return false;
}

/** Hidden bookkeeping fields (`__groupRows__`, `__isGroupRow__`, …). */
export function isInternalKey(key) {
  return isString(key) && key.startsWith(INTERNAL_KEY_PREFIX);
}
