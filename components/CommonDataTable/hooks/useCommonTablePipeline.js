'use client';

/**
 * Shapes the data for CommonDataTable: columns and their types, and the tree the table
 * drills down through.
 *
 * Sorting and filtering are NOT here — each level of the table owns its own, so filtering
 * a nested table narrows only that table. This hook is the part that has to look at the
 * whole dataset once.
 *
 * Groups come from one of two places, never both:
 *  - `groupFields` groups a flat array by one or more fields.
 *  - `childField` reads data that arrives already nested, each row carrying its own rows.
 */

import { useMemo, useRef } from 'react';
import { isArray, isEmpty, take, uniq } from 'lodash';
import { detectColumnTypes } from '../utils/typeUtils';
import { buildNestedTree, flattenLeaves, groupRows } from '../utils/groupUtils';
import { getDataKeys, getDataValue, isInternalKey, toPlainRow } from '../utils/valueUtils';

/** Rows scanned when unioning keys — enough to catch fields missing from row 0. */
const COLUMN_SCAN_ROWS = 50;
/** Child rows folded into the type-detection sample when data arrives nested. */
const CHILD_TYPE_SAMPLE = 200;

/**
 * Hold a config array/object stable across renders while its contents are unchanged.
 *
 * Callers (and Plasmic) routinely pass fresh literals — `groupFields={['hq']}` — and a new
 * reference every render would re-run type detection and the whole pipeline.
 */
function useStableConfig(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value ?? null);
  } catch {
    serialized = null; // non-serializable — keep identity semantics
  }
  const valueRef = useRef(value);
  const serializedRef = useRef(serialized);
  if (serialized === null || serialized !== serializedRef.current) {
    valueRef.current = value;
    serializedRef.current = serialized;
  }
  return valueRef.current;
}

function normalizeRows(data) {
  if (!isArray(data)) return [];
  return data.some((row) => row instanceof Map) ? data.map(toPlainRow) : data;
}

const usableKeys = (row, childField) =>
  getDataKeys(row).filter((key) => !isInternalKey(key) && key !== childField);

/** Keys carried by the outer objects, and keys carried by their children, kept apart. */
function deriveKeysByLevel(rows, childField) {
  const parentKeys = [];
  const childKeys = [];
  take(rows, COLUMN_SCAN_ROWS).forEach((row) => {
    parentKeys.push(...usableKeys(row, childField));
    if (!childField) return;
    const kids = getDataValue(row, childField);
    if (!isArray(kids)) return;
    take(kids, COLUMN_SCAN_ROWS).forEach((child) => childKeys.push(...usableKeys(child, childField)));
  });
  return { parentKeys: uniq(parentKeys), childKeys: uniq(childKeys) };
}

/** Parents plus a slice of their children — a column only the children carry still gets typed. */
function buildTypeSample(rows, childField) {
  if (!childField) return rows;
  const sample = [...rows];
  for (const row of rows) {
    const kids = getDataValue(row, childField);
    if (isArray(kids)) sample.push(...kids);
    if (sample.length > CHILD_TYPE_SAMPLE) break;
  }
  return sample;
}

/**
 * @param {Object} params
 * @param {Array<Object>} params.data source rows
 * @param {Array<string>} [params.columns] explicit column list + order
 * @param {Array<string>} [params.hiddenColumns] columns dropped entirely
 * @param {Object} [params.columnTypeOverrides] column → `'number'|'date'|'boolean'|'string'`
 * @param {Array<string>} [params.groupFields] group-by fields, outermost first
 * @param {string} [params.childField] field holding child rows, for already-nested data
 * @param {Array<string>} [params.parentFields] parent fields repeated on child rows
 */
export function useCommonTablePipeline({
  data,
  columns: columnsRaw,
  hiddenColumns: hiddenColumnsRaw = [],
  columnTypeOverrides: columnTypeOverridesRaw = {},
  groupFields: groupFieldsRaw = [],
  childField,
  parentFields: parentFieldsRaw,
}) {
  const columnsProp = useStableConfig(columnsRaw);
  const hiddenColumns = useStableConfig(hiddenColumnsRaw);
  const columnTypeOverrides = useStableConfig(columnTypeOverridesRaw);
  const groupFields = useStableConfig(groupFieldsRaw);
  const parentFields = useStableConfig(parentFieldsRaw);

  const rows = useMemo(() => normalizeRows(data), [data]);

  /* ------------------------------- columns ------------------------------- */

  const keysByLevel = useMemo(() => deriveKeysByLevel(rows, childField), [rows, childField]);

  const isVisibleColumn = useMemo(() => {
    const hidden = new Set(hiddenColumns);
    return (col) => typeof col === 'string' && !isInternalKey(col) && col !== childField && !hidden.has(col);
  }, [hiddenColumns, childField]);

  /** `columns` prop, when given, decides both which columns appear and their order. */
  const orderColumns = useMemo(() => {
    if (!isArray(columnsProp) || columnsProp.length === 0) {
      return (cols) => cols.filter(isVisibleColumn);
    }
    return (cols) => {
      const available = new Set(cols);
      return columnsProp.filter((col) => available.has(col) && isVisibleColumn(col));
    };
  }, [columnsProp, isVisibleColumn]);

  const allColumns = useMemo(
    () => orderColumns([...keysByLevel.parentKeys, ...keysByLevel.childKeys]),
    [orderColumns, keysByLevel],
  );

  const detectedTypes = useMemo(
    () => detectColumnTypes(buildTypeSample(rows, childField), allColumns, getDataValue),
    [rows, childField, allColumns],
  );

  const columnTypes = useMemo(
    () => ({ ...detectedTypes, ...columnTypeOverrides }),
    [detectedTypes, columnTypeOverrides],
  );

  // Nested data brings its own structure; `groupFields` only applies to a flat array.
  const effectiveGroupFields = useMemo(() => {
    if (childField || !isArray(groupFields)) return [];
    return groupFields.filter((field) => typeof field === 'string' && allColumns.includes(field));
  }, [childField, groupFields, allColumns]);

  const isGrouped = Boolean(childField) || effectiveGroupFields.length > 0;

  /**
   * Columns per depth. Each level is its own table, so it shows only what its rows can
   * fill: a group level shows its own dimension plus the totals, and the deepest level
   * shows the records.
   */
  const levelColumns = useMemo(() => {
    if (childField) {
      return [orderColumns(keysByLevel.parentKeys), orderColumns(keysByLevel.childKeys)];
    }
    if (effectiveGroupFields.length === 0) return [allColumns];

    const groupSet = new Set(effectiveGroupFields);
    const totals = allColumns.filter((col) => !groupSet.has(col) && columnTypes[col] === 'number');
    const recordColumns = allColumns.filter((col) => !groupSet.has(col));
    return [
      ...effectiveGroupFields.map((field) => [field, ...totals]),
      recordColumns,
    ];
  }, [childField, orderColumns, keysByLevel, effectiveGroupFields, allColumns, columnTypes]);

  /** Levels beyond the list reuse the last one — nested data can go deeper than two. */
  const columnsForDepth = useMemo(
    () => (depth) => levelColumns[Math.min(depth, levelColumns.length - 1)] ?? [],
    [levelColumns],
  );

  /* --------------------------------- tree -------------------------------- */

  const rootRows = useMemo(() => {
    if (childField) return buildNestedTree(rows, { childField, parentFields, getCell: getDataValue });
    if (effectiveGroupFields.length === 0) return rows;
    return groupRows(rows, effectiveGroupFields, {
      columns: allColumns,
      columnTypes,
      getCell: getDataValue,
    });
  }, [childField, rows, parentFields, effectiveGroupFields, allColumns, columnTypes]);

  const leafRows = useMemo(
    () => (isGrouped ? flattenLeaves(rootRows) : rows),
    [isGrouped, rootRows, rows],
  );

  return {
    rows,
    rootRows,
    leafRows,
    allColumns,
    levelColumns,
    columnsForDepth,
    columnTypes,
    isGrouped,
    groupCount: isGrouped ? rootRows.length : 0,
    isEmptyData: isEmpty(rows),
  };
}

export default useCommonTablePipeline;
