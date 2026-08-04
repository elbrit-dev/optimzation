'use client';

/**
 * The whole data pipeline for CommonDataTable, held in local state.
 *
 *   data → columns/types → filter + search → group → sort → paginate
 *
 * This is the piece the provider-backed table gets from context; keeping it in a hook
 * is what lets the table run standalone. Everything is memoized per stage, so typing
 * in one filter doesn't re-detect column types or rebuild filter dropdowns.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isArray, isEmpty, take, uniq } from 'lodash';
import { detectColumnTypes } from '../utils/typeUtils';
import { buildFilterOptions, filterRows, hasActiveFilters, isEmptyFilterValue } from '../utils/filterUtils';
import { groupRows } from '../utils/groupUtils';
import { sortRows, toggleSort } from '../utils/sortUtils';
import { getDataKeys, getDataValue, isInternalKey, sumColumn, toPlainRow } from '../utils/valueUtils';

/** Rows scanned when unioning keys — enough to catch fields missing from row 0. */
const COLUMN_SCAN_ROWS = 50;
/** Rows scanned when building filter dropdown options on very large datasets. */
const OPTION_SCAN_ROWS = 20000;

/**
 * Hold a config array/object stable across renders while its contents are unchanged.
 *
 * Callers (and Plasmic) routinely pass fresh literals — `groupFields={['hq']}` — and a
 * new reference every render would re-run type detection and the whole pipeline. Only
 * used for small config values, never for `data`.
 */
function useStableConfig(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value ?? null);
  } catch {
    serialized = null; // non-serializable (e.g. a compute function) — keep identity semantics
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
  let hasMap = false;
  for (const row of data) {
    if (row instanceof Map) { hasMap = true; break; }
  }
  return hasMap ? data.map(toPlainRow) : data;
}

/** Union of keys across a sample, so sparse rows still contribute their columns. */
function deriveColumns(rows) {
  if (isEmpty(rows)) return [];
  const keys = [];
  take(rows, COLUMN_SCAN_ROWS).forEach((row) => {
    getDataKeys(row).forEach((key) => {
      if (!isInternalKey(key)) keys.push(key);
    });
  });
  return uniq(keys);
}

/**
 * @param {Object} params
 * @param {Array<Object>} params.data source rows
 * @param {Array<string>} [params.columns] explicit column list + order; defaults to detected keys
 * @param {Array<string>} [params.hiddenColumns] columns dropped entirely (not just unchecked)
 * @param {Object} [params.columnTypeOverrides] column → `'number'|'date'|'boolean'|'string'`
 * @param {Array<string>} [params.groupFields] group-by fields, outermost first
 * @param {Array<string>} [params.multiselectColumns] force multiselect filters (else auto by cardinality)
 * @param {Array<string>} [params.textFilterColumns] force a text input filter
 * @param {number} [params.multiselectMaxOptions=50] cardinality cut-off for auto multiselect
 * @param {Array<string>} [params.nonAggregatableColumns] don't aggregate in group rows
 * @param {Array<{field:string,order:number}>} [params.initialSortMeta]
 * @param {number} [params.defaultRows=10]
 */
export function useCommonTablePipeline({
  data,
  columns: columnsRaw,
  hiddenColumns: hiddenColumnsRaw = [],
  columnTypeOverrides: columnTypeOverridesRaw = {},
  groupFields: groupFieldsRaw = [],
  enableGrouping = false,
  enableFilter = true,
  enableGlobalSearch = true,
  enableSort = true,
  enablePagination = true,
  multiselectColumns: multiselectColumnsRaw,
  textFilterColumns: textFilterColumnsRaw = [],
  multiselectMaxOptions = 50,
  nonAggregatableColumns: nonAggregatableColumnsRaw = [],
  initialSortMeta = [],
  defaultRows = 10,
}) {
  // Fresh literals from the caller must not invalidate the pipeline every render.
  const columnsProp = useStableConfig(columnsRaw);
  const hiddenColumns = useStableConfig(hiddenColumnsRaw);
  const columnTypeOverrides = useStableConfig(columnTypeOverridesRaw);
  const groupFields = useStableConfig(groupFieldsRaw);
  const multiselectColumnsProp = useStableConfig(multiselectColumnsRaw);
  const textFilterColumns = useStableConfig(textFilterColumnsRaw);
  const nonAggregatableColumns = useStableConfig(nonAggregatableColumnsRaw);

  const rows = useMemo(() => normalizeRows(data), [data]);

  /* ------------------------------- columns ------------------------------- */

  const allColumns = useMemo(() => {
    const base = isArray(columnsProp) && columnsProp.length > 0 ? columnsProp : deriveColumns(rows);
    const hidden = new Set(hiddenColumns);
    return base.filter((col) => typeof col === 'string' && !isInternalKey(col) && !hidden.has(col));
  }, [columnsProp, rows, hiddenColumns]);

  const detectedTypes = useMemo(
    () => detectColumnTypes(rows, allColumns, getDataValue),
    [rows, allColumns],
  );

  const columnTypes = useMemo(
    () => ({ ...detectedTypes, ...columnTypeOverrides }),
    [detectedTypes, columnTypeOverrides],
  );

  const [visibleColumns, setVisibleColumns] = useState(allColumns);
  // Re-sync visibility when the column set itself changes (new data shape), keeping
  // the user's choices for columns that still exist.
  const knownColumnsRef = useRef(allColumns);
  useEffect(() => {
    const previous = knownColumnsRef.current;
    const sameSet =
      previous.length === allColumns.length && previous.every((col, i) => col === allColumns[i]);
    if (sameSet) return;
    knownColumnsRef.current = allColumns;
    setVisibleColumns((current) => {
      const stillValid = current.filter((col) => allColumns.includes(col));
      const added = allColumns.filter((col) => !previous.includes(col));
      const next = [...stillValid, ...added];
      return next.length > 0 ? next : allColumns;
    });
  }, [allColumns]);

  const effectiveGroupFields = useMemo(() => {
    if (!enableGrouping || !isArray(groupFields)) return [];
    return groupFields.filter((field) => typeof field === 'string' && allColumns.includes(field));
  }, [enableGrouping, groupFields, allColumns]);

  /** Visible columns in `allColumns` order; group fields pulled to the front. */
  const displayColumns = useMemo(() => {
    const visible = new Set(visibleColumns);
    const ordered = allColumns.filter((col) => visible.has(col));
    if (effectiveGroupFields.length === 0) return ordered;
    const groupSet = new Set(effectiveGroupFields);
    return [
      ...effectiveGroupFields.filter((field) => visible.has(field)),
      ...ordered.filter((col) => !groupSet.has(col)),
    ];
  }, [allColumns, visibleColumns, effectiveGroupFields]);

  /* -------------------------- filters and search ------------------------- */

  const [filters, setFilters] = useState({});
  const [globalSearch, setGlobalSearch] = useState('');

  const filterOptions = useMemo(() => {
    if (!enableFilter) return {};
    const stringColumns = allColumns.filter((col) => (columnTypes[col] || 'string') === 'string');
    if (stringColumns.length === 0) return {};
    const sample = rows.length > OPTION_SCAN_ROWS ? take(rows, OPTION_SCAN_ROWS) : rows;
    return buildFilterOptions(sample, stringColumns, getDataValue, multiselectMaxOptions + 1);
  }, [enableFilter, allColumns, columnTypes, rows, multiselectMaxOptions]);

  /** Explicit prop wins; otherwise a string column becomes multiselect when low-cardinality. */
  const multiselectColumns = useMemo(() => {
    if (isArray(multiselectColumnsProp)) return multiselectColumnsProp;
    const forcedText = new Set(textFilterColumns);
    return allColumns.filter((col) => {
      if (forcedText.has(col)) return false;
      if ((columnTypes[col] || 'string') !== 'string') return false;
      const options = filterOptions[col];
      return isArray(options) && options.length > 0 && options.length <= multiselectMaxOptions;
    });
  }, [multiselectColumnsProp, textFilterColumns, allColumns, columnTypes, filterOptions, multiselectMaxOptions]);

  const filteredRows = useMemo(() => {
    if (!enableFilter && !enableGlobalSearch) return rows;
    return filterRows(rows, {
      filters: enableFilter ? filters : {},
      globalSearch: enableGlobalSearch ? globalSearch : '',
      columns: displayColumns,
      columnTypes,
      multiselectColumns,
      getCell: getDataValue,
    });
  }, [
    enableFilter, enableGlobalSearch, rows, filters, globalSearch,
    displayColumns, columnTypes, multiselectColumns,
  ]);

  /* ------------------------------- grouping ------------------------------ */

  const groupedRows = useMemo(() => {
    if (effectiveGroupFields.length === 0) return filteredRows;
    return groupRows(filteredRows, effectiveGroupFields, {
      columns: allColumns,
      columnTypes,
      getCell: getDataValue,
      nonAggregatableColumns,
    });
  }, [effectiveGroupFields, filteredRows, allColumns, columnTypes, nonAggregatableColumns]);

  /* -------------------------------- sorting ------------------------------ */

  const [sortMeta, setSortMeta] = useState(() => (isArray(initialSortMeta) ? initialSortMeta : []));

  const sortedRows = useMemo(() => {
    if (!enableSort || isEmpty(sortMeta)) return groupedRows;
    return sortRows(groupedRows, sortMeta, { columnTypes, getCell: getDataValue });
  }, [enableSort, groupedRows, sortMeta, columnTypes]);

  /* ------------------------------ pagination ----------------------------- */

  const [first, setFirst] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(defaultRows);

  useEffect(() => {
    setRowsPerPage(defaultRows);
    setFirst(0);
  }, [defaultRows]);

  // Any change to what's being shown sends the reader back to page 1 — staying on
  // page 7 of a result set that now has 2 pages renders an empty table.
  useEffect(() => {
    setFirst(0);
  }, [filters, globalSearch, sortMeta, effectiveGroupFields]);

  const totalRecords = sortedRows.length;

  const paginatedRows = useMemo(() => {
    if (!enablePagination) return sortedRows;
    return sortedRows.slice(first, first + rowsPerPage);
  }, [enablePagination, sortedRows, first, rowsPerPage]);

  /* -------------------------------- totals ------------------------------- */

  /** Footer totals run over every filtered leaf row, not just the visible page. */
  const columnTotals = useMemo(() => {
    const totals = {};
    displayColumns.forEach((col) => {
      if ((columnTypes[col] || 'string') !== 'number') return;
      totals[col] = sumColumn(filteredRows, col, getDataValue);
    });
    return totals;
  }, [displayColumns, columnTypes, filteredRows]);

  /* ------------------------------- handlers ------------------------------ */

  const updateFilter = useCallback((col, value) => {
    setFilters((current) => {
      if (isEmptyFilterValue(value)) {
        if (!current[col]) return current;
        const { [col]: _removed, ...rest } = current;
        return rest;
      }
      const existing = current[col];
      if (existing && existing.value === value) return current;
      return { ...current, [col]: { value, matchMode: 'custom' } };
    });
  }, []);

  const clearFilter = useCallback((col) => {
    setFilters((current) => {
      if (!current[col]) return current;
      const { [col]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({});
    setGlobalSearch('');
  }, []);

  const toggleSortForColumn = useCallback((col, { additive = false } = {}) => {
    setSortMeta((current) => toggleSort(current, col, { additive }));
  }, []);

  const clearSort = useCallback(() => setSortMeta([]), []);

  const onPageChange = useCallback((event) => {
    setFirst(event.first ?? 0);
    if (event.rows) setRowsPerPage(event.rows);
  }, []);

  const resetVisibleColumns = useCallback(() => setVisibleColumns(allColumns), [allColumns]);

  return {
    // columns
    allColumns,
    displayColumns,
    visibleColumns,
    setVisibleColumns,
    resetVisibleColumns,
    columnTypes,
    effectiveGroupFields,
    // data stages
    rows,
    filteredRows,
    groupedRows,
    sortedRows,
    paginatedRows,
    totalRecords,
    columnTotals,
    // filter state
    filters,
    filterOptions,
    multiselectColumns,
    globalSearch,
    setGlobalSearch,
    updateFilter,
    clearFilter,
    clearAllFilters,
    isFiltered: hasActiveFilters(filters) || String(globalSearch ?? '').trim() !== '',
    // sort state
    sortMeta,
    setSortMeta,
    toggleSortForColumn,
    clearSort,
    // pagination state
    first,
    rowsPerPage,
    onPageChange,
  };
}

export default useCommonTablePipeline;
