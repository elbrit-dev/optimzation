/**
 * Grouping — builds the tree the table drills down through.
 *
 * Each group becomes one row carrying its children on `__groupRows__`:
 *
 *   { region: 'South', sales: 3408242, __isGroupRow__: true, __groupLevel__: 0,
 *     __groupField__: 'region', __groupCount__: 22,
 *     __groupRows__: [ …deeper group rows, or the records themselves… ] }
 *
 * A group row claims only what a group actually has: its own name and the sum of each
 * numeric column. Text and date columns stay blank rather than collapsing into a "most
 * common value" tally, which would read as data the group doesn't have.
 *
 * The table renders each level as its own table, so a group row is only ever shown
 * alongside columns it can fill.
 */

import { isArray, isEmpty, isNil } from 'lodash';
import { getDataValue, isInternalKey, toFiniteNumber, toPlainRow } from './valueUtils';

const NULL_GROUP_KEY = '__null__';
/** A text column still totals when this share of its non-empty cells parse as numbers. */
const NUMERIC_COERCION_THRESHOLD = 0.8;

/**
 * True when enough of a *text* column's cells are numeric to be worth totalling — a numeric
 * column that type detection read as text still gets its sum.
 *
 * Limited to text columns on purpose: booleans coerce to 1/0, so running this on them would
 * put a meaningless count where a blank belongs.
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

export function sumOver(rows, col, getCell = getDataValue) {
  let total = 0;
  for (const row of rows) {
    const num = toFiniteNumber(getCell(row, col));
    if (num != null) total += num;
  }
  return total;
}

/** Records beneath a set of rows, however deep the grouping goes. */
export function flattenLeaves(rows) {
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

const countLeaves = (rows) => (isArray(rows)
  ? rows.reduce(
    (acc, row) => acc + (row?.__isGroupRow__ ? (row.__groupCount__ ?? countLeaves(row.__groupRows__)) : 1),
    0,
  )
  : 0);

/**
 * Group records by `fields`, one nesting level per field.
 *
 * @param {Array<Object>} data records
 * @param {Array<string>} fields group-by fields, outermost first
 * @param {Object} options
 * @param {Array<string>} options.columns columns to total
 * @param {Object} options.columnTypes column → type
 * @param {Function} [options.getCell]
 * @returns {Array<Object>} top-level group rows
 */
export function groupRows(data, fields, options = {}) {
  const { columns = [], columnTypes = {}, getCell = getDataValue } = options;

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
    groups.forEach((records, groupKey) => {
      const keyValue = groupKey === NULL_GROUP_KEY ? null : groupKey;
      const path = [...parentPath, keyValue];
      const hasDeeperLevel = level + 1 < fields.length;
      const children = hasDeeperLevel ? build(records, level + 1, path) : records;
      if (isEmpty(children)) return;

      const summary = { [field]: keyValue };
      columns.forEach((col) => {
        if (isInternalKey(col) || col === field || fields.includes(col)) return;
        const colType = columnTypes[col] || 'string';
        if (colType === 'number' || shouldCoerceToSum(colType, records, col, getCell)) {
          summary[col] = sumOver(records, col, getCell);
        }
      });

      summary.__isGroupRow__ = true;
      summary.__groupField__ = field;
      summary.__groupLevel__ = level;
      summary.__groupRows__ = children;
      summary.__groupCount__ = countLeaves(children);
      summary.__rowKey__ = `g${level}:${path.map((part) => String(part ?? '∅')).join('›')}`;
      result.push(summary);
    });

    return result;
  };

  if (!isArray(data) || isEmpty(data) || !isArray(fields) || isEmpty(fields)) {
    return isArray(data) ? data : [];
  }
  return build(data, 0, []);
}

/**
 * Adapt data that arrives already nested — each row carrying its own rows in an array
 * field — to the same tree shape {@link groupRows} produces.
 *
 *   [{ warehouse: 'Chennai', total_qty: 7219, batches: [{ batch_no, qty, … }, …] }]
 *
 * The outer object keeps exactly its own fields; nothing is copied between levels, because
 * each level renders as its own table with its own columns.
 *
 * @param {Array<Object>} data parent rows
 * @param {Object} options
 * @param {string} options.childField field holding the child array, e.g. `'batches'`
 * @param {Array<string>} [options.parentFields] parent fields to repeat on child rows; none
 *   by default
 * @param {Function} [options.getCell]
 * @returns {Array<Object>} top-level group rows
 */
export function buildNestedTree(data, options = {}) {
  const { childField, parentFields, getCell = getDataValue } = options;
  if (!isArray(data) || isEmpty(data) || !childField) return isArray(data) ? data : [];

  const carriedFields = isArray(parentFields) ? parentFields : [];

  const build = (rows, level, keyPrefix) => rows.reduce((out, row, index) => {
    if (!row || typeof row !== 'object') return out;

    const kids = getCell(row, childField);
    const rowKey = `${keyPrefix}${index}`;
    if (!isArray(kids) || kids.length === 0) {
      out.push({ ...toPlainRow(row), __rowKey__: rowKey });
      return out;
    }

    const carried = {};
    carriedFields.forEach((key) => {
      const value = getCell(row, key);
      if (!isNil(value)) carried[key] = value;
    });

    const children = build(
      kids.filter((child) => child && typeof child === 'object').map((child) => ({
        ...carried,
        ...toPlainRow(child),
      })),
      level + 1,
      `${rowKey}.`,
    );

    const header = { ...toPlainRow(row) };
    delete header[childField];
    header.__isGroupRow__ = true;
    header.__groupLevel__ = level;
    header.__groupRows__ = children;
    header.__groupCount__ = countLeaves(children);
    header.__rowKey__ = rowKey;

    out.push(header);
    return out;
  }, []);

  return build(data, 0, 'n');
}
