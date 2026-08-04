'use client';

/**
 * The data pipeline for CommonDataTable, held in local state.
 *
 *   data → columns/types → sort → group → flatten for display
 *
 * This is the piece the provider-backed table gets from context; keeping it in a hook is
 * what lets the table run standalone. Each stage is memoized separately, so re-sorting
 * never re-runs column type detection.
 *
 * Groups come from one of two places, never both:
 *  - `groupFields` groups a flat array by one or more fields.
 *  - `childField` reads data that arrives already nested, each row carrying its own rows.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { isArray, isEmpty, take, uniq } from 'lodash';
import { detectColumnTypes } from '../utils/typeUtils';
import { expandNestedRows, flattenGroupsForDisplay, groupRows } from '../utils/groupUtils';
import { sortRows, toggleSort } from '../utils/sortUtils';
import { getDataKeys, getDataValue, isInternalKey, sumColumn, toPlainRow } from '../utils/valueUtils';

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

/**
 * Union of keys across a sample, so sparse rows still contribute their columns.
 * With nested data the parent's own fields lead, then the child fields.
 */
function deriveColumns(rows, childField) {
  if (isEmpty(rows)) return [];
  const parentKeys = [];
  const childKeys = [];

  take(rows, COLUMN_SCAN_ROWS).forEach((row) => {
    parentKeys.push(...usableKeys(row, childField));
    if (!childField) return;
    const kids = getDataValue(row, childField);
    if (!isArray(kids)) return;
    take(kids, COLUMN_SCAN_ROWS).forEach((child) => {
      childKeys.push(...usableKeys(child, childField));
    });
  });

  return uniq([...parentKeys, ...childKeys]);
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
 * @param {Array<string>} [params.columns] explicit column list + order; defaults to detected keys
 * @param {Array<string>} [params.hiddenColumns] columns dropped entirely
 * @param {Object} [params.columnTypeOverrides] column → `'number'|'date'|'boolean'|'string'`
 * @param {Array<string>} [params.groupFields] group-by fields, outermost first
 * @param {string} [params.childField] field holding child rows, for already-nested data
 * @param {Array<string>} [params.parentFields] parent fields carried onto child rows
 * @param {{field: string, order: number}} [params.initialSort]
 */
export function useCommonTablePipeline({
  data,
  columns: columnsRaw,
  hiddenColumns: hiddenColumnsRaw = [],
  columnTypeOverrides: columnTypeOverridesRaw = {},
  groupFields: groupFieldsRaw = [],
  childField,
  parentFields: parentFieldsRaw,
  enableSort = true,
  initialSort = null,
}) {
  const columnsProp = useStableConfig(columnsRaw);
  const hiddenColumns = useStableConfig(hiddenColumnsRaw);
  const columnTypeOverrides = useStableConfig(columnTypeOverridesRaw);
  const groupFields = useStableConfig(groupFieldsRaw);
  const parentFields = useStableConfig(parentFieldsRaw);

  const rows = useMemo(() => normalizeRows(data), [data]);

  /* ------------------------------- columns ------------------------------- */

  const allColumns = useMemo(() => {
    const base = isArray(columnsProp) && columnsProp.length > 0
      ? columnsProp
      : deriveColumns(rows, childField);
    const hidden = new Set(hiddenColumns);
    return base.filter((col) => (
      typeof col === 'string' && !isInternalKey(col) && col !== childField && !hidden.has(col)
    ));
  }, [columnsProp, rows, hiddenColumns, childField]);

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

  /** Group fields lead, so a group header's name sits in the first column. */
  const displayColumns = useMemo(() => {
    if (effectiveGroupFields.length === 0) return allColumns;
    const groupSet = new Set(effectiveGroupFields);
    return [...effectiveGroupFields, ...allColumns.filter((col) => !groupSet.has(col))];
  }, [allColumns, effectiveGroupFields]);

  /* -------------------------------- sorting ------------------------------ */

  const [sort, setSort] = useState(initialSort);
  const activeSort = enableSort ? sort : null;

  const sortLeaves = useCallback(
    (leaves) => sortRows(leaves, activeSort, { columnTypes, getCell: getDataValue }),
    [activeSort, columnTypes],
  );

  /* ------------------------ grouping + display rows ---------------------- */

  /**
   * Leaves are sorted before grouping so rows read in order inside each group; the group
   * headers are then sorted among themselves. Ungrouped, it is just one sort.
   */
  const displayRows = useMemo(() => {
    if (childField) {
      return expandNestedRows(rows, {
        childField,
        columns: displayColumns,
        columnTypes,
        parentFields,
        sortRowsFn: sortLeaves,
        getCell: getDataValue,
      });
    }
    if (effectiveGroupFields.length === 0) return sortLeaves(rows);

    const grouped = groupRows(sortLeaves(rows), effectiveGroupFields, {
      columns: allColumns,
      columnTypes,
      getCell: getDataValue,
    });
    return flattenGroupsForDisplay(sortLeaves(grouped));
  }, [
    childField, rows, displayColumns, columnTypes, parentFields,
    effectiveGroupFields, sortLeaves, allColumns,
  ]);

  const isGrouped = Boolean(childField) || effectiveGroupFields.length > 0;

  const leafRows = useMemo(
    () => (isGrouped ? displayRows.filter((row) => !row?.__isGroupRow__) : displayRows),
    [isGrouped, displayRows],
  );

  const groupCount = useMemo(
    () => (isGrouped ? displayRows.filter((row) => row?.__groupLevel__ === 0).length : 0),
    [isGrouped, displayRows],
  );

  /* -------------------------------- totals ------------------------------- */

  /**
   * Sum a column over the rows that actually carry it. With nested data a parent-only
   * aggregate like `total_qty` lives on the header rows, while `qty` lives on the children —
   * summing the wrong set would report zero for one of them.
   */
  const columnTotals = useMemo(() => {
    const headerRows = displayRows.filter((row) => row?.__isGroupRow__);
    const totals = {};
    displayColumns.forEach((col) => {
      if ((columnTypes[col] || 'string') !== 'number') return;
      const source = leafRows.some((row) => getDataValue(row, col) != null) ? leafRows : headerRows;
      totals[col] = sumColumn(source, col, getDataValue);
    });
    return totals;
  }, [displayRows, leafRows, displayColumns, columnTypes]);

  const toggleSortForColumn = useCallback((col) => {
    setSort((current) => toggleSort(current, col));
  }, []);

  return {
    rows,
    leafRows,
    displayColumns,
    columnTypes,
    isGrouped,
    displayRows,
    groupCount,
    columnTotals,
    sort: activeSort,
    setSort,
    toggleSortForColumn,
  };
}

export default useCommonTablePipeline;
