'use client';

/**
 * CommonDataTable — a standalone, provider-free data table.
 *
 * Same feature set as the provider-backed table in `share/src/app/datatable`
 * (typed columns, per-column + global filtering, multi-sort, multi-level grouping with
 * aggregates, footer totals, column visibility, frozen column, export, fullscreen,
 * inline cell edit, conditional styling), but it takes rows as a prop and owns its
 * pipeline in local state — so it works anywhere, with no context above it.
 *
 * Nothing in this folder imports from `share/`; copy the folder and it still runs.
 *
 * @example
 * <CommonDataTable
 *   data={rows}
 *   title="Secondary sales"
 *   groupFields={['hq']}
 *   enableGrouping
 *   enableSummation
 * />
 */

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isEmpty, isNil, take } from 'lodash';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Paginator } from 'primereact/paginator';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Checkbox } from 'primereact/checkbox';
import { Calendar } from 'primereact/calendar';
import { Chip } from 'primereact/chip';

import useCommonTablePipeline from './hooks/useCommonTablePipeline';
import CommonTableToolbar from './CommonTableToolbar';
import {
  ColumnFilterBoolean,
  ColumnFilterDate,
  ColumnFilterMultiselect,
  ColumnFilterNumber,
  ColumnFilterText,
  resolveFilterKind,
} from './filters/ColumnFilters';
import { formatDateValue, isTruthyBoolean, parseToDate } from './utils/typeUtils';
import { flattenGroupRows } from './utils/groupUtils';
import { exportRows } from './utils/exportUtils';
import { getSortIndex, getSortOrder } from './utils/sortUtils';
import {
  computeCellStyle,
  computeColumnStyle,
  computeRowStyle,
  getFieldColorClass,
  getRulesForMode,
} from './utils/styleUtils';
import { formatHeaderName, formatNumber, getDataValue, toFiniteNumber } from './utils/valueUtils';

const WIDTH_SAMPLE_ROWS = 100;
const CHAR_PX = 9;
const SORT_PADDING_PX = 30;

/* ------------------------------------------------------------------ helpers */

/** Content-aware column widths, so 20 columns don't all render at the same size. */
function computeColumnWidths(rows, columns, { columnTypes, columnLabels, enableSort }) {
  const widths = {};
  if (isEmpty(columns)) return widths;
  const sample = take(rows, WIDTH_SAMPLE_ROWS);

  columns.forEach((col) => {
    const headerLength = String(columnLabels?.[col] || formatHeaderName(col)).length;
    const headerWidth = headerLength * CHAR_PX;
    const type = columnTypes[col] || 'string';

    let base;
    if (type === 'boolean') base = Math.max(headerWidth, 60);
    else if (type === 'date') base = Math.max(headerWidth, 120);
    else if (type === 'number') base = Math.max(headerWidth, 80);
    else {
      const lengths = [];
      sample.forEach((row) => {
        const value = getDataValue(row, col);
        if (!isNil(value)) lengths.push(String(value).length);
      });
      let contentLength = headerLength;
      if (lengths.length > 0) {
        lengths.sort((a, b) => a - b);
        const median = lengths[Math.floor(lengths.length / 2)];
        const p75 = lengths[Math.floor(lengths.length * 0.75)];
        const p95 = lengths[Math.floor(lengths.length * 0.95)];
        contentLength = Math.min(Math.max(median, p75), p95);
      }
      base = Math.max(contentLength * CHAR_PX, headerWidth);
    }
    widths[col] = Math.round(base + (enableSort ? SORT_PADDING_PX : 0));
  });

  return widths;
}

/** Responsive fallback height when no explicit `tableHeight` is given. */
function useResponsiveScrollHeight(tableHeight, scrollable) {
  const [height, setHeight] = useState(tableHeight || '600px');

  useEffect(() => {
    if (!scrollable) {
      setHeight(undefined);
      return undefined;
    }
    if (tableHeight) {
      setHeight(tableHeight);
      return undefined;
    }
    const update = () => {
      const width = window.innerWidth;
      setHeight(width < 640 ? '400px' : width < 1024 ? '500px' : '600px');
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [tableHeight, scrollable]);

  return height;
}

/** Popup listing the full value tally behind a `value x n +k more` group cell. */
const BreakdownDialog = forwardRef(function BreakdownDialog(_props, ref) {
  const [state, setState] = useState({ visible: false, label: '', rows: [], total: 0 });

  useImperativeHandle(ref, () => ({
    open: ({ label, breakdown }) => {
      if (!Array.isArray(breakdown) || breakdown.length === 0) return;
      const rows = breakdown.map((item, index) => ({
        id: `${label}_${index}`,
        value: String(item?.value ?? ''),
        count: toFiniteNumber(item?.count) ?? 0,
      }));
      setState({
        visible: true,
        label: String(label ?? ''),
        rows,
        total: rows.reduce((sum, row) => sum + row.count, 0),
      });
    },
  }), []);

  return (
    <Dialog
      header={`${state.label} — ${state.rows.length} values / ${state.total.toLocaleString('en-US')} rows`}
      visible={state.visible}
      onHide={() => setState((current) => ({ ...current, visible: false }))}
      style={{ width: 'min(32rem, 92vw)' }}
      dismissableMask
    >
      <DataTable value={state.rows} dataKey="id" scrollable scrollHeight="50vh" className="p-datatable-sm">
        <Column field="value" header="Value" />
        <Column
          field="count"
          header="Rows"
          style={{ width: '7rem' }}
          bodyClassName="text-right"
          headerClassName="justify-end"
          body={(row) => row.count.toLocaleString('en-US')}
        />
      </DataTable>
    </Dialog>
  );
});

/**
 * One expanded group's children. Holds its own expansion state so sibling groups —
 * and deeper levels — never fight over a single shared `expandedRows`.
 */
const GroupChildTable = memo(function GroupChildTable({ rows, renderColumns, dataKey }) {
  const [expandedRows, setExpandedRows] = useState([]);
  const hasNestedGroups = useMemo(() => rows.some((row) => row?.__isGroupRow__), [rows]);

  return (
    <div className="p-2 bg-gray-50/60">
      <DataTable
        value={rows}
        dataKey={hasNestedGroups ? '__rowKey__' : dataKey}
        className="p-datatable-sm border border-gray-200 rounded"
        showGridlines
        scrollable
        scrollHeight="flex"
        expandedRows={hasNestedGroups ? expandedRows : undefined}
        onRowToggle={hasNestedGroups ? (event) => setExpandedRows(event.data) : undefined}
        rowExpansionTemplate={hasNestedGroups
          ? (row) => (
            <GroupChildTable
              rows={row.__groupRows__ || []}
              renderColumns={renderColumns}
              dataKey={dataKey}
            />
          )
          : undefined}
        rowClassName={(row) => (row?.__isGroupRow__ ? 'font-medium bg-white' : '')}
      >
        {hasNestedGroups && <Column expander style={{ width: '3rem' }} />}
        {renderColumns({ nested: true, rows })}
      </DataTable>
    </div>
  );
});

/* ---------------------------------------------------------------- component */

function CommonDataTable({
  /* data */
  data,
  loading = false,
  emptyMessage = 'No records found.',
  onRefresh,

  /* columns */
  columns: columnsProp,
  hiddenColumns,
  columnLabels,
  columnTypes: columnTypeOverrides,
  columnWidths: columnWidthOverrides,
  columnBodies,
  dataKey,

  /* features */
  enableSort = true,
  enableFilter = true,
  enableGlobalSearch = true,
  enableGrouping = false,
  groupFields,
  enableSummation = false,
  enablePagination = true,
  enableColumnVisibility = true,
  enableExport = true,
  enableFreezeFirstColumn = true,
  enableFullscreen = true,
  enableCellEdit = false,
  editableColumns,
  enableDivideBy1Lakh = false,
  lakhColumns,
  showUnitToggle = false,

  /* filter tuning */
  multiselectColumns,
  textFilterColumns,
  multiselectMaxOptions = 50,
  nonAggregatableColumns,

  /* sorting */
  initialSortMeta,

  /* pagination */
  rowsPerPageOptions = [10, 25, 50, 100],
  defaultRows = 10,

  /* selection */
  selectionMode,
  onSelectionChange,
  onRowClick,

  /* styling */
  redFields,
  greenFields,
  rowColumnStyles,
  scrollable = true,
  tableHeight,
  showGridlines = true,
  stripedRows = true,
  size = 'small',
  className = '',
  style,

  /* chrome */
  title,
  showToolbar = true,
  searchPlaceholder,
  toolbarActions,
  exportFileName = 'table-export',

  /* events */
  onCellEditComplete,
  isCellEditable,
}) {
  const pipeline = useCommonTablePipeline({
    data,
    columns: columnsProp,
    hiddenColumns,
    columnTypeOverrides,
    groupFields,
    enableGrouping,
    enableFilter,
    enableGlobalSearch,
    enableSort,
    enablePagination,
    multiselectColumns,
    textFilterColumns,
    multiselectMaxOptions,
    nonAggregatableColumns,
    initialSortMeta,
    defaultRows,
  });

  const {
    allColumns, displayColumns, visibleColumns, setVisibleColumns, columnTypes, effectiveGroupFields,
    rows, filteredRows, sortedRows, paginatedRows, totalRecords, columnTotals,
    filters, filterOptions, multiselectColumns: activeMultiselectColumns,
    globalSearch, setGlobalSearch, updateFilter, clearAllFilters, isFiltered,
    sortMeta, toggleSortForColumn,
    first, rowsPerPage, onPageChange,
  } = pipeline;

  /* ------------------------------- local UI state ------------------------- */

  const [freezeFirstColumn, setFreezeFirstColumn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expandedRows, setExpandedRows] = useState([]);
  const [selection, setSelection] = useState(selectionMode === 'single' ? null : []);
  const [divideBy1Lakh, setDivideBy1Lakh] = useState(enableDivideBy1Lakh);
  const [isExporting, setIsExporting] = useState(false);
  const breakdownRef = useRef(null);

  useEffect(() => setDivideBy1Lakh(enableDivideBy1Lakh), [enableDivideBy1Lakh]);

  // Collapsed groups must not linger once the group set changes underneath them.
  useEffect(() => setExpandedRows([]), [effectiveGroupFields, filters, globalSearch]);

  const scrollHeight = useResponsiveScrollHeight(tableHeight, scrollable);

  /* --------------------------------- labels ------------------------------- */

  const getLabel = useCallback(
    (col) => columnLabels?.[col] || formatHeaderName(col),
    [columnLabels],
  );

  const autoWidths = useMemo(
    () => computeColumnWidths(filteredRows, displayColumns, { columnTypes, columnLabels, enableSort }),
    [filteredRows, displayColumns, columnTypes, columnLabels, enableSort],
  );

  const getColumnWidth = useCallback(
    (col) => columnWidthOverrides?.[col] ?? `${autoWidths[col] ?? 120}px`,
    [columnWidthOverrides, autoWidths],
  );

  /* --------------------------------- styling ------------------------------ */

  const rowRules = useMemo(() => getRulesForMode(rowColumnStyles, 'row'), [rowColumnStyles]);
  const columnRules = useMemo(() => getRulesForMode(rowColumnStyles, 'column'), [rowColumnStyles]);

  // Row styles are per-row but read by every cell, so memoize per row. The deps are the
  // cache key, not inputs to the factory: a new rule set or new data must drop the cache.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are intentional cache-busters
  const rowStyleCache = useMemo(() => new WeakMap(), [rowRules, rows]);

  const getRowStyle = useCallback((row, rowIndex) => {
    if (rowRules.length === 0 || !row || typeof row !== 'object') return null;
    if (rowStyleCache.has(row)) return rowStyleCache.get(row);
    const computed = computeRowStyle(row, rowRules, { rowIndex, getDataValue });
    rowStyleCache.set(row, computed);
    return computed;
  }, [rowRules, rowStyleCache]);

  const columnStyles = useMemo(() => {
    if (columnRules.length === 0) return {};
    const styles = {};
    displayColumns.forEach((col, columnIndex) => {
      const values = filteredRows.map((row) => getDataValue(row, col));
      styles[col] = computeColumnStyle(
        col,
        { columnName: col, values, columnIndex, rowCount: values.length },
        columnRules,
        { tableData: filteredRows, getDataValue },
      );
    });
    return styles;
  }, [columnRules, displayColumns, filteredRows]);

  const cellRulesByColumn = useMemo(() => {
    const map = {};
    displayColumns.forEach((col) => {
      const rules = getRulesForMode(rowColumnStyles, 'cell', col);
      if (rules.length > 0) map[col] = rules;
    });
    return map;
  }, [rowColumnStyles, displayColumns]);

  /* ---------------------------------- cells ------------------------------- */

  /**
   * Whether a column is shown in lakhs. Scoped by `lakhColumns` when given — dividing
   * every numeric column turns a visit count of 10 into 0.0001, which is never wanted.
   */
  const isDivided = useCallback(
    (col) => divideBy1Lakh && (!Array.isArray(lakhColumns) || lakhColumns.includes(col)),
    [divideBy1Lakh, lakhColumns],
  );

  /** Text a cell shows — the same formatting export and group aggregates use. */
  const formatCell = useCallback((value, type, col) => {
    if (isNil(value) || value === '') return '';
    if (type === 'number') return formatNumber(value, { divideBy1Lakh: isDivided(col) });
    if (type === 'date') return formatDateValue(value);
    if (type === 'boolean') return isTruthyBoolean(value) ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }, [isDivided]);

  const buildBody = useCallback((col) => {
    const type = columnTypes[col] || 'string';
    const isNumeric = type === 'number';
    const colorClass = getFieldColorClass(col, { redFields, greenFields });
    const customBody = columnBodies?.[col];
    const cellRules = cellRulesByColumn[col];

    return function bodyTemplate(row, options) {
      const rowIndex = options?.rowIndex ?? 0;
      const value = getDataValue(row, col);
      const breakdown = row?.__isGroupRow__ ? row.__stringBreakdown__?.[col] : null;

      let content;
      if (typeof customBody === 'function') {
        content = customBody(value, row, { column: col, type, rowIndex });
      } else if (breakdown && breakdown.length > 0) {
        const [primary] = breakdown;
        // Mirror the aggregate string groupUtils produced: an all-distinct column reads
        // as a cardinality, anything else as "top value × n" plus an overflow link.
        const allDistinct = breakdown.length > 1 && breakdown.every((entry) => entry.count === 1);
        const chipLabel = allDistinct
          ? `${breakdown.length.toLocaleString('en-US')} values`
          : `${primary.value} × ${primary.count}`;
        const moreCount = allDistinct ? 0 : breakdown.length - 1;
        content = (
          <span className="inline-flex flex-nowrap items-center gap-1 min-w-0">
            <button
              type="button"
              className="shrink-0"
              onClick={(event) => {
                event.stopPropagation();
                breakdownRef.current?.open({ label: getLabel(col), breakdown });
              }}
            >
              <Chip
                label={chipLabel}
                className="text-[10px] py-0 px-1.5 h-5 cursor-pointer hover:bg-gray-200 [&_.p-chip-text]:text-[10px]"
              />
            </button>
            {moreCount > 0 && (
              <button
                type="button"
                className="shrink-0 text-[10px] text-blue-600 hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  breakdownRef.current?.open({ label: getLabel(col), breakdown });
                }}
              >
                {`+${moreCount} more`}
              </button>
            )}
          </span>
        );
      } else if (type === 'boolean') {
        const truthy = isTruthyBoolean(value);
        content = isNil(value) || value === ''
          ? ''
          : (
            <i
              className={`pi ${truthy ? 'pi-check text-green-600' : 'pi-times text-gray-400'} text-xs`}
              title={truthy ? 'Yes' : 'No'}
            />
          );
      } else {
        content = formatCell(value, type, col);
      }

      const style = {
        ...(columnStyles[col] || null),
        ...(getRowStyle(row, rowIndex) || null),
        ...(cellRules ? computeCellStyle(value, row, cellRules, { column: col, rowIndex, columnType: type }) : null),
      };

      const groupIndent = row?.__isGroupRow__ && col === row.__groupField__
        ? { paddingLeft: `${(row.__groupLevel__ ?? 0) * 0.75}rem` }
        : null;

      return (
        <div
          className={`min-w-0 truncate ${isNumeric ? 'text-right tabular-nums' : 'text-left'} ${colorClass}`}
          style={isEmpty(style) && !groupIndent ? undefined : { ...style, ...groupIndent }}
          title={typeof content === 'string' ? content : undefined}
        >
          {content}
          {row?.__isGroupRow__ && col === row.__groupField__ && row.__groupCount__ > 0 && (
            <span className="ml-1.5 text-[10px] text-gray-500 font-normal">
              ({row.__groupCount__.toLocaleString('en-US')})
            </span>
          )}
        </div>
      );
    };
  }, [
    columnTypes, redFields, greenFields, columnBodies, cellRulesByColumn,
    formatCell, columnStyles, getRowStyle, getLabel,
  ]);

  /* --------------------------------- headers ------------------------------ */

  const buildHeader = useCallback((col) => {
    const label = getLabel(col);
    const isNumeric = (columnTypes[col] || 'string') === 'number';
    const alignment = isNumeric ? 'justify-end' : 'justify-start';

    if (!enableSort) {
      return <span className={`flex ${alignment} w-full truncate font-semibold`}>{label}</span>;
    }

    const order = getSortOrder(sortMeta, col);
    const sortIndex = getSortIndex(sortMeta, col);
    const icon = order === 1 ? 'pi-sort-amount-up-alt' : order === -1 ? 'pi-sort-amount-down' : 'pi-sort-alt';

    return (
      <button
        type="button"
        onClick={(event) => toggleSortForColumn(col, { additive: event.shiftKey })}
        className={`flex items-center gap-1 w-full ${alignment} font-semibold cursor-pointer select-none`}
        title={`Sort by ${label}. Shift-click to add to the current sort.`}
      >
        <span className="truncate">{label}</span>
        <i className={`pi ${icon} text-[10px] ${order ? 'text-blue-600' : 'text-gray-400'}`} />
        {sortMeta.length > 1 && sortIndex > 0 && (
          <span className="text-[9px] text-blue-600 font-bold">{sortIndex}</span>
        )}
      </button>
    );
  }, [getLabel, columnTypes, enableSort, sortMeta, toggleSortForColumn]);

  const buildFilterElement = useCallback((col) => {
    const kind = resolveFilterKind(col, { columnTypes, multiselectColumns: activeMultiselectColumns });
    const committedValue = filters[col]?.value ?? null;
    const shared = { column: col, committedValue, onCommit: updateFilter };

    if (kind === 'boolean') return <ColumnFilterBoolean {...shared} />;
    if (kind === 'date') return <ColumnFilterDate {...shared} />;
    if (kind === 'number') return <ColumnFilterNumber {...shared} />;
    if (kind === 'multiselect') {
      return <ColumnFilterMultiselect {...shared} options={filterOptions[col] || []} label={getLabel(col)} />;
    }
    return <ColumnFilterText {...shared} />;
  }, [columnTypes, activeMultiselectColumns, filters, updateFilter, filterOptions, getLabel]);

  /* --------------------------------- footers ------------------------------ */

  const buildFooter = useCallback((col, isFirst) => {
    if (!enableSummation) return undefined;
    const type = columnTypes[col] || 'string';
    if (type !== 'number') {
      return isFirst ? <strong className="text-xs">Total</strong> : null;
    }
    const colorClass = getFieldColorClass(col, { redFields, greenFields });
    return (
      <strong className={`block text-right tabular-nums text-xs ${colorClass}`}>
        {formatNumber(columnTotals[col] ?? 0, { divideBy1Lakh: isDivided(col) })}
      </strong>
    );
  }, [enableSummation, columnTypes, redFields, greenFields, columnTotals, isDivided]);

  /* ------------------------------- cell editing --------------------------- */

  const editableSet = useMemo(
    () => new Set(Array.isArray(editableColumns) ? editableColumns : []),
    [editableColumns],
  );

  const buildEditor = useCallback((col) => {
    if (!enableCellEdit || !editableSet.has(col)) return undefined;
    const type = columnTypes[col] || 'string';

    return function cellEditor(options) {
      const row = options.rowData;
      if (row?.__isGroupRow__) return formatCell(options.value, type, col);
      if (typeof isCellEditable === 'function' && !isCellEditable(row, col)) {
        return formatCell(options.value, type, col);
      }

      if (type === 'number') {
        return (
          <InputNumber
            value={toFiniteNumber(options.value)}
            onValueChange={(event) => options.editorCallback(event.value)}
            className="w-full p-inputtext-sm"
            inputClassName="text-right"
            maxFractionDigits={4}
            autoFocus
          />
        );
      }
      if (type === 'boolean') {
        return (
          <Checkbox
            checked={isTruthyBoolean(options.value)}
            onChange={(event) => options.editorCallback(event.checked)}
          />
        );
      }
      if (type === 'date') {
        return (
          <Calendar
            value={parseToDate(options.value)}
            onChange={(event) => options.editorCallback(event.value)}
            dateFormat="d M yy"
            className="w-full"
            inputClassName="p-inputtext-sm"
            appendTo={typeof document === 'undefined' ? undefined : document.body}
          />
        );
      }
      return (
        <InputText
          value={options.value ?? ''}
          onChange={(event) => options.editorCallback(event.target.value)}
          className="w-full p-inputtext-sm"
          autoFocus
        />
      );
    };
  }, [enableCellEdit, editableSet, columnTypes, formatCell, isCellEditable]);

  const handleCellEditComplete = useCallback((event) => {
    const { rowData, newValue, field, originalEvent } = event;
    if (rowData?.__isGroupRow__) {
      originalEvent?.preventDefault?.();
      return;
    }
    if (typeof onCellEditComplete === 'function') {
      onCellEditComplete({
        rowData,
        field,
        newValue,
        oldValue: getDataValue(rowData, field),
        originalEvent,
      });
      return;
    }
    // No handler wired up: keep the cell as it was rather than silently dropping the edit.
    originalEvent?.preventDefault?.();
  }, [onCellEditComplete]);

  /* --------------------------------- columns ------------------------------ */

  const renderColumns = useCallback(({ nested = false } = {}) => {
    const canEdit = enableCellEdit && editableSet.size > 0;

    return displayColumns.map((col, index) => {
      const isFirst = index === 0;
      const showFilter = enableFilter && !nested;
      const editor = nested ? undefined : buildEditor(col);

      return (
        <Column
          key={`${nested ? 'nested' : 'main'}-${col}-${columnTypes[col] || 'string'}`}
          field={col}
          header={nested ? getLabel(col) : buildHeader(col)}
          headerClassName="text-xs whitespace-nowrap"
          bodyClassName="text-xs"
          style={{ width: getColumnWidth(col), minWidth: '4rem' }}
          frozen={!nested && isFirst && freezeFirstColumn}
          filter={showFilter}
          filterElement={showFilter ? buildFilterElement(col) : undefined}
          showFilterMenu={false}
          showClearButton={false}
          body={buildBody(col)}
          footer={nested ? undefined : buildFooter(col, isFirst)}
          editor={editor}
          onCellEditComplete={canEdit && editor ? handleCellEditComplete : undefined}
        />
      );
    });
  }, [
    displayColumns, enableFilter, enableCellEdit, editableSet, columnTypes, freezeFirstColumn,
    getLabel, buildHeader, buildFilterElement, buildBody, buildFooter, buildEditor,
    getColumnWidth, handleCellEditComplete,
  ]);

  /* -------------------------------- grouping ------------------------------ */

  const hasGroups = effectiveGroupFields.length > 0;
  const groupRowsOnPage = useMemo(
    () => (hasGroups ? paginatedRows.filter((row) => row?.__isGroupRow__ && !isEmpty(row.__groupRows__)) : []),
    [hasGroups, paginatedRows],
  );
  const allGroupsExpanded = groupRowsOnPage.length > 0 && expandedRows.length >= groupRowsOnPage.length;

  const toggleAllGroups = useCallback(() => {
    setExpandedRows((current) => (current.length >= groupRowsOnPage.length ? [] : groupRowsOnPage));
  }, [groupRowsOnPage]);

  const rowExpansionTemplate = useCallback(
    (row) => (
      <GroupChildTable
        rows={row.__groupRows__ || []}
        renderColumns={renderColumns}
        dataKey={dataKey}
      />
    ),
    [renderColumns, dataKey],
  );

  /* --------------------------------- export ------------------------------- */

  const handleExport = useCallback(async (format) => {
    setIsExporting(true);
    try {
      // Export the rows as currently narrowed and ordered; group rows are expanded
      // back to leaves so the file holds real data, not aggregate strings.
      const exportable = hasGroups ? flattenGroupRows(sortedRows) : sortedRows;
      await exportRows({
        rows: exportable,
        columns: displayColumns,
        columnLabels,
        columnTypes,
        isDivided,
        getCell: getDataValue,
        format,
        fileName: exportFileName,
        sheetName: title || 'Sheet1',
      });
    } finally {
      setIsExporting(false);
    }
  }, [hasGroups, sortedRows, displayColumns, columnLabels, columnTypes, isDivided, exportFileName, title]);

  /* ------------------------------- selection ------------------------------ */

  const primeSelectionMode = selectionMode === 'checkbox' ? 'multiple' : selectionMode;

  const handleSelectionChange = useCallback((event) => {
    const value = Array.isArray(event.value)
      ? event.value.filter((row) => !row?.__isGroupRow__)
      : (event.value?.__isGroupRow__ ? null : event.value ?? null);
    setSelection(value);
    onSelectionChange?.(value);
  }, [onSelectionChange]);

  /* ---------------------------------- render ------------------------------ */

  const rowClassName = useCallback((row) => {
    if (!row?.__isGroupRow__) return '';
    const level = row.__groupLevel__ ?? 0;
    return level === 0 ? 'font-semibold bg-blue-50/50' : 'font-medium bg-gray-50';
  }, []);

  const table = (
    <DataTable
      value={paginatedRows}
      dataKey={hasGroups ? '__rowKey__' : dataKey}
      loading={loading}
      emptyMessage={emptyMessage}
      scrollable={scrollable}
      scrollHeight={isFullscreen ? 'flex' : scrollHeight}
      resizableColumns
      columnResizeMode="expand"
      showGridlines={showGridlines}
      stripedRows={stripedRows}
      className={`${size === 'small' ? 'p-datatable-sm' : size === 'large' ? 'p-datatable-lg' : ''} w-full`}
      style={{ minWidth: '100%' }}
      filterDisplay={enableFilter ? 'row' : undefined}
      expandedRows={hasGroups ? expandedRows : undefined}
      onRowToggle={hasGroups ? (event) => setExpandedRows(event.data) : undefined}
      rowExpansionTemplate={hasGroups ? rowExpansionTemplate : undefined}
      rowClassName={rowClassName}
      editMode={enableCellEdit && editableSet.size > 0 ? 'cell' : undefined}
      selectionMode={primeSelectionMode}
      selection={selectionMode ? selection : undefined}
      onSelectionChange={selectionMode ? handleSelectionChange : undefined}
      onRowClick={onRowClick ? (event) => {
        if (event.data?.__isGroupRow__) return;
        onRowClick(event.data, event);
      } : undefined}
      rowHover={!!onRowClick}
    >
      {hasGroups && (
        <Column
          expander={(row) => row?.__isGroupRow__ && !isEmpty(row.__groupRows__)}
          style={{ width: '3rem', minWidth: '3rem' }}
          frozen={freezeFirstColumn}
        />
      )}
      {selectionMode === 'checkbox' && (
        <Column selectionMode="multiple" style={{ width: '3rem', minWidth: '3rem' }} />
      )}
      {renderColumns({ nested: false })}
    </DataTable>
  );

  const content = (
    <div className="flex flex-col min-h-0 w-full">
      {showToolbar && (
        <CommonTableToolbar
          title={title}
          totalRecords={totalRecords}
          leafRecords={filteredRows.length}
          sourceRecords={rows.length}
          isGrouped={hasGroups}
          isFiltered={isFiltered}
          enableGlobalSearch={enableGlobalSearch}
          globalSearch={globalSearch}
          onGlobalSearchChange={setGlobalSearch}
          searchPlaceholder={searchPlaceholder}
          onClearFilters={clearAllFilters}
          enableColumnVisibility={enableColumnVisibility}
          allColumns={allColumns}
          visibleColumns={visibleColumns}
          columnLabels={columnLabels}
          onVisibleColumnsChange={setVisibleColumns}
          enableExport={enableExport}
          onExport={handleExport}
          isExporting={isExporting}
          hasGroups={hasGroups && groupRowsOnPage.length > 0}
          allGroupsExpanded={allGroupsExpanded}
          onToggleAllGroups={toggleAllGroups}
          enableFreezeFirstColumn={enableFreezeFirstColumn}
          freezeFirstColumn={freezeFirstColumn}
          onToggleFreeze={() => setFreezeFirstColumn((current) => !current)}
          enableFullscreen={enableFullscreen}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen((current) => !current)}
          showUnitToggle={showUnitToggle}
          divideBy1Lakh={divideBy1Lakh}
          onToggleUnit={() => setDivideBy1Lakh((current) => !current)}
          onRefresh={onRefresh}
          loading={loading}
          actions={toolbarActions}
        />
      )}

      <div className="min-h-0 flex-1 overflow-hidden">{table}</div>

      {enablePagination && totalRecords > 0 && (
        <Paginator
          first={first}
          rows={rowsPerPage}
          totalRecords={totalRecords}
          rowsPerPageOptions={rowsPerPageOptions}
          onPageChange={onPageChange}
          template="CurrentPageReport FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
          currentPageReportTemplate="{first}–{last} of {totalRecords}"
          className="border-t border-gray-200 text-xs"
        />
      )}
    </div>
  );

  return (
    <>
      <div
        className={`common-data-table border border-gray-200 rounded-lg bg-white w-full overflow-hidden ${className}`}
        style={style}
      >
        {isFullscreen ? (
          <div className="p-6 text-center text-sm text-gray-500">Table is open in fullscreen.</div>
        ) : content}
      </div>

      <Dialog
        visible={isFullscreen}
        onHide={() => setIsFullscreen(false)}
        header={title || 'Table'}
        maximized
        blockScroll
        contentClassName="p-0 flex flex-col min-h-0"
        className="common-data-table-fullscreen"
      >
        {isFullscreen ? content : null}
      </Dialog>

      <BreakdownDialog ref={breakdownRef} />
    </>
  );
}

export default memo(CommonDataTable);
