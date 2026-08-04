/**
 * Grouping with per-group totals.
 *
 * Each group becomes one header row carrying its children on `__groupRows__`:
 *
 *   { region: 'South', sales: 3408242, __isGroupRow__: true, __groupLevel__: 0,
 *     __groupField__: 'region', __groupPath__: ['South'], __groupCount__: 22,
 *     __groupRows__: [ …leaf rows or deeper group rows… ] }
 *
 * A header row shows only what a group can honestly claim: its own name, the names of the
 * groups above it, and the sum of each numeric column. Text and date columns are left
 * blank rather than collapsed into a "most common value" tally — that reads as data the
 * group doesn't actually have.
 *
 * {@link flattenGroupsForDisplay} then interleaves headers with their rows for display.
 */

import { isArray, isEmpty, isNil } from 'lodash';
import { getDataKeys, getDataValue, isInternalKey, toFiniteNumber, toPlainRow } from './valueUtils';

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
 * @param {Array<string>} options.columns columns to total
 * @param {Object} options.columnTypes column → type
 * @param {Function} [options.getCell]
 * @returns {Array<Object>} group header rows
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
    groups.forEach((leafRows, groupKey) => {
      const keyValue = groupKey === NULL_GROUP_KEY ? null : groupKey;
      const path = [...parentPath, keyValue];
      const hasDeeperLevel = level + 1 < fields.length;
      const children = hasDeeperLevel ? build(leafRows, level + 1, path) : leafRows;
      if (isEmpty(children)) return;

      const summary = {};
      summary[field] = keyValue;

      columns.forEach((col) => {
        if (isInternalKey(col) || col === field) return;

        const groupFieldIndex = fields.indexOf(col);
        if (groupFieldIndex > -1) {
          // An outer group field is constant inside this group, so show it. A deeper one
          // isn't decided yet at this level, so leave it blank.
          summary[col] = groupFieldIndex < level ? path[groupFieldIndex] : null;
          return;
        }

        const colType = columnTypes[col] || 'string';
        summary[col] = colType === 'number' || shouldCoerceToSum(colType, leafRows, col, getCell)
          ? sumOver(leafRows, col, getCell)
          : null;
      });

      summary.__isGroupRow__ = true;
      summary.__groupKey__ = keyValue;
      summary.__groupField__ = field;
      summary.__groupLevel__ = level;
      summary.__groupPath__ = path;
      summary.__groupRows__ = children;
      summary.__groupCount__ = countLeaves(children);
      result.push(summary);
    });

    return result;
  };

  if (!isArray(data) || isEmpty(data) || !isArray(fields) || isEmpty(fields)) {
    return isArray(data) ? data : [];
  }
  return build(data, 0, []);
}

/* ------------------------------------------------- already-nested source data */

/**
 * Which of a parent's own fields get copied onto its child rows.
 *
 * Automatic rule: its non-numeric fields. On `{ warehouse, total_qty, batch_count, batches }`
 * that carries `warehouse` down — so each row still says which warehouse it belongs to, and
 * the export is self-contained — while leaving `total_qty` and `batch_count` on the header
 * where they belong. Repeating an aggregate on every row would read as a per-row value.
 */
function resolveCarriedFields(parent, childField, columnTypes, parentFields) {
  if (isArray(parentFields)) return parentFields;
  return getDataKeys(parent).filter((key) => {
    if (key === childField || isInternalKey(key)) return false;
    if (isArray(getDataValue(parent, key))) return false;
    return (columnTypes[key] || 'string') !== 'number';
  });
}

/**
 * Expand data that arrives already nested — each row carrying its own rows in an array
 * field — into the same header-then-rows list {@link flattenGroupsForDisplay} produces.
 *
 *   [{ warehouse: 'Chennai', total_qty: 7219, batches: [{ batch_no, qty, … }, …] }]
 *
 * The parent becomes the header row and keeps whatever aggregates it already carries; any
 * numeric column it does *not* define is summed from its children, so a `qty` column still
 * totals on the header even though only the children have it.
 *
 * Nests to any depth: a child holding its own `childField` array becomes a header in turn.
 *
 * @param {Array<Object>} data parent rows
 * @param {Object} options
 * @param {string} options.childField field holding the child array, e.g. `'batches'`
 * @param {Array<string>} options.columns display columns
 * @param {Object} options.columnTypes column → type
 * @param {Array<string>} [options.parentFields] override which parent fields carry down
 * @param {Function} [options.sortRowsFn] (rows) => rows, applied at every level
 * @param {Function} [options.getCell]
 */
export function expandNestedRows(data, options = {}) {
  const {
    childField,
    columns = [],
    columnTypes = {},
    parentFields,
    sortRowsFn,
    getCell = getDataValue,
  } = options;

  if (!isArray(data) || isEmpty(data) || !childField) return isArray(data) ? data : [];

  const numericColumns = columns.filter((col) => (columnTypes[col] || 'string') === 'number');

  const countLeaves = (rows) => rows.reduce((acc, row) => {
    const kids = getCell(row, childField);
    return acc + (isArray(kids) && kids.length > 0 ? countLeaves(kids) : 1);
  }, 0);

  const out = [];

  const visit = (rows, level) => {
    // Header rows are built before sorting so a parent can be ordered by a total that only
    // exists once its children have been summed.
    const entryByRow = new Map();

    rows.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const kids = getCell(row, childField);
      if (!isArray(kids) || kids.length === 0) {
        entryByRow.set(toPlainRow(row), null);
        return;
      }

      const carried = {};
      resolveCarriedFields(row, childField, columnTypes, parentFields).forEach((key) => {
        const value = getCell(row, key);
        if (!isNil(value)) carried[key] = value;
      });

      const children = kids
        .filter((child) => child && typeof child === 'object')
        .map((child) => ({ ...carried, ...toPlainRow(child) }));

      const header = { ...toPlainRow(row) };
      delete header[childField];
      numericColumns.forEach((col) => {
        if (!isNil(header[col])) return;
        if (!children.some((child) => !isNil(getCell(child, col)))) return;
        header[col] = sumOver(children, col, getCell);
      });

      header.__isGroupRow__ = true;
      header.__groupLevel__ = level;
      header.__groupCount__ = countLeaves(kids);
      // The name badge hangs off the first column this parent actually names itself in.
      header.__groupField__ =
        columns.find((col) => !isNil(header[col]) && (columnTypes[col] || 'string') !== 'number')
        ?? columns[0];

      entryByRow.set(header, children);
    });

    const ordered = sortRowsFn ? sortRowsFn([...entryByRow.keys()]) : [...entryByRow.keys()];
    ordered.forEach((row) => {
      out.push(row);
      const children = entryByRow.get(row);
      if (children) visit(children, level + 1);
    });
  };

  visit(data, 0);
  return out;
}

/**
 * Interleave groups into one flat list for display: each group's header row, then that
 * group's rows directly beneath it.
 *
 *   [ South header, …South rows…, West header, …West rows… ]
 *
 * The table renders this as one continuous body — group headers are ordinary rows wearing
 * a heavier style, so their totals stay aligned to the columns above them and there is no
 * expand/collapse or nested table anywhere.
 *
 * @param {Array<Object>} rows output of {@link groupRows}
 */
export function flattenGroupsForDisplay(rows) {
  if (!isArray(rows)) return [];
  const out = [];
  const visit = (list) => {
    list.forEach((row) => {
      if (!row) return;
      out.push(row);
      if (row.__isGroupRow__ && isArray(row.__groupRows__)) visit(row.__groupRows__);
    });
  };
  visit(rows);
  return out;
}
