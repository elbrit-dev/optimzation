'use client';

/**
 * One level of the table, and — through `rowExpansionTemplate` — every level below it.
 *
 * Each level is a table in its own right: its own header row, its own filter row, its own
 * sort, its own totals. Expanding a group row renders the next level indented beneath it,
 * with the columns that level can actually fill. Filtering or sorting a nested table
 * therefore narrows only that table, which is what makes drilling down feel local.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { isEmpty, isNil, take } from 'lodash';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';

import ColumnFilterInput from './filters/ColumnFilterInput';
import { filterRows } from './utils/filterUtils';
import { sortRows, toggleSort } from './utils/sortUtils';
import { sumOver } from './utils/groupUtils';
import { formatDateValue, isTruthyBoolean } from './utils/typeUtils';
import { formatHeaderName, formatNumber, getDataValue } from './utils/valueUtils';

const WIDTH_SAMPLE_ROWS = 60;
const CHAR_PX = 9;
const CONTROL_PADDING_PX = 30;

/** Content-aware column widths, so twenty columns don't all render at the same size. */
function computeColumnWidths(rows, columns, { columnTypes, columnLabels }) {
  const widths = {};
  if (isEmpty(columns)) return widths;
  const sample = take(rows, WIDTH_SAMPLE_ROWS);

  columns.forEach((col) => {
    const headerLength = String(columnLabels?.[col] || formatHeaderName(col)).length;
    const headerWidth = headerLength * CHAR_PX;
    const type = columnTypes[col] || 'string';

    let base;
    if (type === 'boolean') base = Math.max(headerWidth, 70);
    else if (type === 'date') base = Math.max(headerWidth, 120);
    else if (type === 'number') base = Math.max(headerWidth, 100);
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
        const p95 = lengths[Math.floor(lengths.length * 0.95)];
        contentLength = Math.min(Math.max(median, lengths[Math.floor(lengths.length * 0.75)]), p95);
      }
      base = Math.max(contentLength * CHAR_PX, headerWidth);
    }
    widths[col] = Math.round(base + CONTROL_PADDING_PX);
  });

  return widths;
}

function GroupTable({
  rows,
  depth = 0,
  columnsForDepth,
  columnTypes,
  columnLabels,
  columnWidths: columnWidthOverrides,
  enableSort,
  enableFilter,
  enableSummation,
  emptyMessage,
  loading,
  scrollable,
  tableHeight,
  showGridlines,
  stripedRows,
  size,
  initialSort,
  expandAllSignal,
}) {
  const columns = columnsForDepth(depth);

  const [sort, setSort] = useState(depth === 0 ? initialSort ?? null : null);
  const [filters, setFilters] = useState({});
  const [expandedRows, setExpandedRows] = useState(null);

  // The toolbar's Expand all / Collapse all only speaks to the outermost level; deeper
  // levels stay wherever the reader left them. Deriving state from a changed prop during
  // render is the pattern React documents for exactly this.
  const [appliedSignal, setAppliedSignal] = useState(expandAllSignal);
  if (depth === 0 && expandAllSignal !== appliedSignal) {
    setAppliedSignal(expandAllSignal);
    setExpandedRows(expandAllSignal?.expanded ? rows.filter((row) => row?.__isGroupRow__) : null);
  }

  const hasGroupRows = useMemo(() => rows.some((row) => row?.__isGroupRow__), [rows]);

  const visibleRows = useMemo(() => {
    const filtered = enableFilter ? filterRows(rows, filters, columnTypes, getDataValue) : rows;
    return enableSort ? sortRows(filtered, sort, { columnTypes, getCell: getDataValue }) : filtered;
  }, [rows, filters, sort, enableFilter, enableSort, columnTypes]);

  const autoWidths = useMemo(
    () => computeColumnWidths(visibleRows, columns, { columnTypes, columnLabels }),
    [visibleRows, columns, columnTypes, columnLabels],
  );

  const getLabel = useCallback(
    (col) => columnLabels?.[col] || formatHeaderName(col),
    [columnLabels],
  );

  const updateFilter = useCallback((col, value) => {
    setFilters((current) => {
      if (String(value ?? '').trim() === '') {
        if (current[col] === undefined) return current;
        const { [col]: _dropped, ...rest } = current;
        return rest;
      }
      if (current[col] === value) return current;
      return { ...current, [col]: value };
    });
  }, []);

  /* ---------------------------------- cells ------------------------------- */

  const formatCell = useCallback((value, type) => {
    if (isNil(value) || value === '') return '';
    if (type === 'number') return formatNumber(value);
    if (type === 'date') return formatDateValue(value);
    if (type === 'boolean') return isTruthyBoolean(value) ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }, []);

  const buildBody = useCallback((col, isFirstColumn) => {
    const type = columnTypes[col] || 'string';
    const isNumeric = type === 'number';

    return function bodyTemplate(row) {
      const text = formatCell(getDataValue(row, col), type);
      const showCount = isFirstColumn && row?.__isGroupRow__ && row.__groupCount__ > 0;
      return (
        <div className={`truncate ${isNumeric ? 'text-right tabular-nums' : 'text-left'}`} title={text || undefined}>
          {text}
          {showCount && (
            <span className="ml-1.5 text-[10px] font-normal text-gray-500">
              ({row.__groupCount__.toLocaleString('en-US')})
            </span>
          )}
        </div>
      );
    };
  }, [columnTypes, formatCell]);

  const buildHeader = useCallback((col) => {
    const label = getLabel(col);
    const alignment = (columnTypes[col] || 'string') === 'number' ? 'justify-end' : 'justify-start';

    if (!enableSort) {
      return <span className={`flex ${alignment} w-full truncate font-semibold`}>{label}</span>;
    }

    const order = sort?.field === col ? sort.order : 0;
    const icon = order === 1 ? 'pi-sort-amount-up-alt' : order === -1 ? 'pi-sort-amount-down' : 'pi-sort-alt';

    return (
      <button
        type="button"
        onClick={() => setSort((current) => toggleSort(current, col))}
        className={`flex items-center gap-1 w-full ${alignment} font-semibold cursor-pointer select-none`}
        title={`Sort by ${label}`}
      >
        <span className="truncate">{label}</span>
        <i className={`pi ${icon} text-[10px] ${order ? 'text-blue-600' : 'text-gray-400'}`} />
      </button>
    );
  }, [getLabel, columnTypes, enableSort, sort]);

  const buildFooter = useCallback((col, isFirstColumn) => {
    if (!enableSummation) return undefined;
    if ((columnTypes[col] || 'string') !== 'number') {
      return isFirstColumn ? <strong className="text-xs">Total</strong> : null;
    }
    return (
      <strong className="block text-right tabular-nums text-xs">
        {formatNumber(sumOver(visibleRows, col, getDataValue))}
      </strong>
    );
  }, [enableSummation, columnTypes, visibleRows]);

  /* --------------------------------- render ------------------------------- */

  const expansionTemplate = useCallback((row) => (
    <div className="pl-6 pr-2 py-2 bg-gray-50/70">
      <GroupTable
        rows={row.__groupRows__ || []}
        depth={depth + 1}
        columnsForDepth={columnsForDepth}
        columnTypes={columnTypes}
        columnLabels={columnLabels}
        columnWidths={columnWidthOverrides}
        enableSort={enableSort}
        enableFilter={enableFilter}
        enableSummation={enableSummation}
        emptyMessage={emptyMessage}
        scrollable={false}
        showGridlines={showGridlines}
        stripedRows={stripedRows}
        size={size}
      />
    </div>
  ), [
    depth, columnsForDepth, columnTypes, columnLabels, columnWidthOverrides,
    enableSort, enableFilter, enableSummation, emptyMessage, showGridlines, stripedRows, size,
  ]);

  return (
    <DataTable
      value={visibleRows}
      // Only the levels that expand carry a key; the deepest level holds the caller's own
      // records, which have no key of ours to resolve.
      dataKey={hasGroupRows ? '__rowKey__' : undefined}
      loading={loading}
      emptyMessage={emptyMessage}
      scrollable={scrollable}
      scrollHeight={scrollable ? tableHeight : undefined}
      resizableColumns
      columnResizeMode="expand"
      showGridlines={showGridlines}
      stripedRows={stripedRows}
      filterDisplay={enableFilter ? 'row' : undefined}
      expandedRows={hasGroupRows ? expandedRows ?? [] : undefined}
      onRowToggle={hasGroupRows ? (event) => setExpandedRows(event.data) : undefined}
      rowExpansionTemplate={hasGroupRows ? expansionTemplate : undefined}
      rowClassName={(row) => (row?.__isGroupRow__ ? 'font-medium' : '')}
      className={`${size === 'small' ? 'p-datatable-sm' : size === 'large' ? 'p-datatable-lg' : ''} w-full ${depth > 0 ? 'border border-gray-200 rounded' : ''}`}
      style={{ minWidth: '100%' }}
    >
      {hasGroupRows && (
        <Column
          expander={(row) => row?.__isGroupRow__ && !isEmpty(row.__groupRows__)}
          style={{ width: '3rem', minWidth: '3rem' }}
        />
      )}
      {columns.map((col, index) => (
        <Column
          key={col}
          field={col}
          header={buildHeader(col)}
          headerClassName="text-xs whitespace-nowrap"
          bodyClassName="text-xs"
          style={{ width: columnWidthOverrides?.[col] ?? `${autoWidths[col] ?? 120}px`, minWidth: '4rem' }}
          filter={enableFilter}
          filterElement={enableFilter ? (
            <ColumnFilterInput
              column={col}
              value={filters[col] ?? ''}
              onCommit={updateFilter}
              isNumeric={(columnTypes[col] || 'string') === 'number'}
            />
          ) : undefined}
          showFilterMenu={false}
          showClearButton={false}
          body={buildBody(col, index === 0)}
          footer={buildFooter(col, index === 0)}
        />
      ))}
    </DataTable>
  );
}

export default memo(GroupTable);
