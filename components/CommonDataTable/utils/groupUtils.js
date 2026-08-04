/**
 * Multi-level grouping with per-group aggregation.
 *
 * A group becomes one summary row carrying its children on `__groupRows__`, so the
 * table can render groups as expandable rows and recurse for deeper levels:
 *
 *   { hq: 'Chennai', amount: 91200, __isGroupRow__: true, __groupLevel__: 0,
 *     __groupField__: 'hq', __groupPath__: ['Chennai'], __groupCount__: 14,
 *     __groupRows__: [ …leaf rows or deeper group rows… ] }
 *
 * Numeric columns sum. Non-numeric columns collapse to their most common value
 * (`Chennai x 9 +2 more`) with the full tally kept on `__stringBreakdown__` for the
 * breakdown popup.
 */

import { isArray, isEmpty, isNil } from 'lodash';
import { formatDateValue, parseToDate } from './typeUtils';
import { getDataValue, isInternalKey, toFiniteNumber } from './valueUtils';

const NULL_GROUP_KEY = '__null__';
/** A string column still sums when this share of its non-empty cells parse as numbers. */
const NUMERIC_COERCION_THRESHOLD = 0.8;

/** Sort value tallies by count desc, then label, and render `top x n +k more`. */
function buildDisplayAndBreakdown(entries) {
  const sorted = entries
    .filter((entry) => !isNil(entry?.value) && entry.count > 0)
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : String(a.value).localeCompare(String(b.value))));
  if (sorted.length === 0) return { display: null, breakdown: [] };

  const totalCount = sorted.reduce((sum, entry) => sum + entry.count, 0);
  // Every value distinct (a name or code column): "Dr. Anand x 1 +21 more" tells the
  // reader nothing, so report the cardinality instead. The tally still drives the popup.
  if (sorted.length > 1 && sorted.length === totalCount) {
    return { display: `${totalCount.toLocaleString('en-US')} values`, breakdown: sorted };
  }

  const [first] = sorted;
  const moreCount = sorted.length - 1;
  const base = `${first.value} x ${first.count}`;
  return {
    display: moreCount > 0 ? `${base} +${moreCount} more` : base,
    breakdown: sorted,
  };
}

/** Collapse a non-numeric column across a group into one display string + tally. */
export function aggregateNonNumeric(col, colType, rows, getCell = getDataValue) {
  if (!isArray(rows) || rows.length === 0) return { display: null, breakdown: [] };
  const values = rows.map((row) => getCell(row, col)).filter((v) => !isNil(v) && v !== '');
  if (values.length === 0) return { display: null, breakdown: [] };

  if (colType === 'date') {
    const counts = new Map();
    values.forEach((value) => {
      // Tally the raw value, not a parsed Date: `formatDateValue(new Date('2026-07-03'))`
      // reads the UTC-midnight Date as having a time and would print "05:30" on a
      // date-only column.
      if (!parseToDate(value)) return;
      const key = formatDateValue(value);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    if (counts.size === 0) return { display: null, breakdown: [] };
    return buildDisplayAndBreakdown(Array.from(counts, ([value, count]) => ({ value, count })));
  }

  if (colType === 'boolean') {
    const isTruthy = (v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'yes' || v === 'y';
    const truthy = values.filter(isTruthy).length;
    return buildDisplayAndBreakdown([
      { value: 'true', count: truthy },
      { value: 'false', count: values.length - truthy },
    ]);
  }

  const counts = new Map();
  values.forEach((value) => {
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return buildDisplayAndBreakdown(Array.from(counts, ([value, count]) => ({ value, count })));
}

/**
 * True when enough of a *string* column's cells are numeric to be worth summing —
 * a numeric column that detection read as text still gets its total.
 *
 * Deliberately limited to string columns: booleans coerce to 1/0, so letting this run
 * on them would replace a `true × 18` tally with the meaningless number 18.
 */
function shouldCoerceToSum(colType, rows, col, getCell) {
  if (colType !== 'string') return false;
  let meaningful = 0;
  let numeric = 0;
  for (const row of rows) {
    const value = getCell(row, col);
    if (value == null || value === '') continue;
    meaningful++;
    if (toFiniteNumber(value) != null) numeric++;
  }
  return meaningful > 0 && numeric / meaningful >= NUMERIC_COERCION_THRESHOLD;
}

function sumOver(rows, col, getCell) {
  let total = 0;
  for (const row of rows) {
    const num = toFiniteNumber(getCell(row, col));
    if (num != null) total += num;
  }
  return total;
}

function countLeaves(rows) {
  if (!isArray(rows)) return 0;
  return rows.reduce(
    (acc, row) => acc + (row?.__isGroupRow__ ? (row.__groupCount__ ?? countLeaves(row.__groupRows__)) : 1),
    0,
  );
}

/**
 * Group leaf rows by `fields`, one nesting level per field.
 *
 * @param {Array<Object>} data leaf rows (existing group rows are ignored)
 * @param {Array<string>} fields group-by fields, outermost first
 * @param {Object} options
 * @param {Array<string>} options.columns columns to aggregate
 * @param {Object} options.columnTypes column → type
 * @param {Function} [options.getCell]
 * @param {Array<string>} [options.nonAggregatableColumns] carry the first row's value instead of aggregating
 * @returns {Array<Object>} group summary rows
 */
export function groupRows(data, fields, options = {}) {
  const {
    columns = [],
    columnTypes = {},
    getCell = getDataValue,
    nonAggregatableColumns = [],
  } = options;
  const nonAggregatable = new Set(nonAggregatableColumns);

  const build = (rows, level, parentPath) => {
    if (level >= fields.length || isEmpty(rows)) return rows;
    const field = fields[level];

    const groups = new Map();
    rows.forEach((row) => {
      if (row?.__isGroupRow__) return;
      const raw = getCell(row, field);
      const key = isNil(raw) || raw === '' ? NULL_GROUP_KEY : String(raw);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

    const result = [];
    groups.forEach((leafRows, groupKey) => {
      const keyValue = groupKey === NULL_GROUP_KEY ? null : groupKey;
      const path = [...parentPath, keyValue];
      const hasDeeperLevel = level + 1 < fields.length;
      const children = hasDeeperLevel ? build(leafRows, level + 1, path) : leafRows;
      if (isEmpty(children)) return;

      const summary = {};
      summary[field] = keyValue;

      columns.forEach((col) => {
        if (isInternalKey(col)) return;
        if (col === field) {
          summary[col] = keyValue;
          return;
        }
        const groupFieldIndex = fields.indexOf(col);
        if (groupFieldIndex > -1) {
          // An ancestor group field is constant inside this group — show the value
          // itself rather than tallying it into "South × 9". A deeper group field is
          // still ambiguous here, so it stays blank.
          summary[col] = groupFieldIndex < level ? path[groupFieldIndex] : null;
          return;
        }
        if (nonAggregatable.has(col)) {
          summary[col] = getCell(leafRows[0], col);
          return;
        }

        const colType = columnTypes[col] || 'string';
        if (colType === 'number' || shouldCoerceToSum(colType, leafRows, col, getCell)) {
          summary[col] = sumOver(leafRows, col, getCell);
          return;
        }

        const { display, breakdown } = aggregateNonNumeric(col, colType, leafRows, getCell);
        if (display != null) {
          summary[col] = display;
          if (breakdown.length > 0) {
            if (!summary.__stringBreakdown__) summary.__stringBreakdown__ = {};
            summary.__stringBreakdown__[col] = breakdown;
          }
        } else {
          summary[col] = null;
        }
      });

      summary.__isGroupRow__ = true;
      summary.__groupKey__ = keyValue;
      summary.__groupField__ = field;
      summary.__groupLevel__ = level;
      summary.__groupPath__ = path;
      summary.__groupRows__ = children;
      summary.__groupCount__ = countLeaves(children);
      summary.__rowKey__ = `g${level}:${path.map((p) => String(p ?? '∅')).join('›')}`;
      result.push(summary);
    });

    return result;
  };

  if (!isArray(data) || isEmpty(data) || !isArray(fields) || isEmpty(fields)) {
    return isArray(data) ? data : [];
  }
  return build(data, 0, []);
}

/** Walk group rows back down to their leaf rows (used by export). */
export function flattenGroupRows(rows) {
  if (!isArray(rows)) return [];
  const out = [];
  const visit = (list) => {
    list.forEach((row) => {
      if (row?.__isGroupRow__ && isArray(row.__groupRows__)) visit(row.__groupRows__);
      else if (row) out.push(row);
    });
  };
  visit(rows);
  return out;
}
