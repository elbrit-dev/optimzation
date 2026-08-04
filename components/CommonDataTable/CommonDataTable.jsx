'use client';

/**
 * CommonDataTable — a simple, standalone data table.
 *
 * Takes rows as a prop and owns its pipeline in local state, so unlike the
 * provider-backed table in `share/src/app/datatable` it works anywhere with no context
 * above it. Deliberately small: grouping, sorting, totals and export — nothing else.
 *
 * Grouping renders as a header row per group with that group's totals, followed by the
 * group's rows directly beneath it. No expanding, no nested tables.
 *
 * Nothing in this folder imports from `share/`; copy the folder and it still runs.
 *
 * @example
 * <CommonDataTable data={rows} title="Secondary sales" groupFields={['hq']} enableSummation />
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { isEmpty, isNil, take } from 'lodash';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';

import useCommonTablePipeline from './hooks/useCommonTablePipeline';
import { formatDateValue, isTruthyBoolean } from './utils/typeUtils';
import { exportRows } from './utils/exportUtils';
import { formatHeaderName, formatNumber, getDataValue } from './utils/valueUtils';

const WIDTH_SAMPLE_ROWS = 100;
const CHAR_PX = 9;
const SORT_PADDING_PX = 26;

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
        const p95 = lengths[Math.floor(lengths.length * 0.95)];
        contentLength = Math.min(Math.max(median, lengths[Math.floor(lengths.length * 0.75)]), p95);
      }
      base = Math.max(contentLength * CHAR_PX, headerWidth);
    }
    widths[col] = Math.round(base + (enableSort ? SORT_PADDING_PX : 0));
  });

  return widths;
}

function CommonDataTable({
  /* data */
  data,
  loading = false,
  emptyMessage = 'No records found.',

  /* columns */
  columns: columnsProp,
  hiddenColumns,
  columnLabels,
  columnTypes: columnTypeOverrides,
  columnWidths: columnWidthOverrides,

  /* grouping */
  groupFields,
  childField,
  parentFields,

  /* features */
  enableSort = true,
  enableSummation = false,
  enableExport = true,
  exportFileName = 'table-export',
  initialSort,

  /* presentation */
  title,
  scrollable = true,
  tableHeight = '520px',
  showGridlines = true,
  stripedRows = true,
  size = 'small',
  className = '',
  style,
}) {
  const {
    displayColumns, columnTypes, isGrouped,
    leafRows, displayRows, groupCount, columnTotals,
    sort, toggleSortForColumn,
  } = useCommonTablePipeline({
    data,
    columns: columnsProp,
    hiddenColumns,
    columnTypeOverrides,
    groupFields,
    childField,
    parentFields,
    enableSort,
    initialSort,
  });

  const [isExporting, setIsExporting] = useState(false);

  const getLabel = useCallback(
    (col) => columnLabels?.[col] || formatHeaderName(col),
    [columnLabels],
  );

  const autoWidths = useMemo(
    () => computeColumnWidths(leafRows, displayColumns, { columnTypes, columnLabels, enableSort }),
    [leafRows, displayColumns, columnTypes, columnLabels, enableSort],
  );

  /* ---------------------------------- cells ------------------------------- */

  const formatCell = useCallback((value, type) => {
    if (isNil(value) || value === '') return '';
    if (type === 'number') return formatNumber(value);
    if (type === 'date') return formatDateValue(value);
    if (type === 'boolean') return isTruthyBoolean(value) ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }, []);

  const buildBody = useCallback((col) => {
    const type = columnTypes[col] || 'string';
    const isNumeric = type === 'number';

    return function bodyTemplate(row) {
      const text = formatCell(getDataValue(row, col), type);
      const isGroupName = row?.__isGroupRow__ && col === row.__groupField__;

      return (
        <div
          className={`truncate ${isNumeric ? 'text-right tabular-nums' : 'text-left'}`}
          style={isGroupName ? { paddingLeft: `${(row.__groupLevel__ ?? 0) * 0.85}rem` } : undefined}
          title={text || undefined}
        >
          {text}
          {isGroupName && row.__groupCount__ > 0 && (
            <span className="ml-1.5 text-[10px] font-normal text-gray-500">
              ({row.__groupCount__.toLocaleString('en-US')})
            </span>
          )}
        </div>
      );
    };
  }, [columnTypes, formatCell]);

  /* --------------------------------- headers ------------------------------ */

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
        onClick={() => toggleSortForColumn(col)}
        className={`flex items-center gap-1 w-full ${alignment} font-semibold cursor-pointer select-none`}
        title={`Sort by ${label}`}
      >
        <span className="truncate">{label}</span>
        <i className={`pi ${icon} text-[10px] ${order ? 'text-blue-600' : 'text-gray-400'}`} />
      </button>
    );
  }, [getLabel, columnTypes, enableSort, sort, toggleSortForColumn]);

  const buildFooter = useCallback((col, isFirst) => {
    if (!enableSummation) return undefined;
    if ((columnTypes[col] || 'string') !== 'number') {
      return isFirst ? <strong className="text-xs">Total</strong> : null;
    }
    return (
      <strong className="block text-right tabular-nums text-xs">
        {formatNumber(columnTotals[col] ?? 0)}
      </strong>
    );
  }, [enableSummation, columnTypes, columnTotals]);

  /* --------------------------------- export ------------------------------- */

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      // Group header rows are totals, not records, so only the leaves go to the file.
      await exportRows({
        rows: leafRows,
        columns: displayColumns,
        columnLabels,
        columnTypes,
        getCell: getDataValue,
        fileName: exportFileName,
        sheetName: title || 'Sheet1',
      });
    } finally {
      setIsExporting(false);
    }
  }, [leafRows, displayColumns, columnLabels, columnTypes, exportFileName, title]);

  /* ---------------------------------- render ------------------------------ */

  const rowClassName = useCallback((row) => {
    if (!row?.__isGroupRow__) return '';
    return row.__groupLevel__ === 0
      ? 'font-semibold bg-blue-50/60'
      : 'font-medium bg-gray-50';
  }, []);

  const showHeaderBar = Boolean(title) || enableExport;

  return (
    <div
      className={`common-data-table border border-gray-200 rounded-lg bg-white w-full overflow-hidden ${className}`}
      style={style}
    >
      {showHeaderBar && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50/80">
          <div className="flex items-baseline gap-2 mr-auto min-w-0">
            {title && <span className="font-semibold text-gray-800 truncate">{title}</span>}
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {isGrouped
                ? `${groupCount.toLocaleString('en-US')} ${groupCount === 1 ? 'group' : 'groups'} · ${leafRows.length.toLocaleString('en-US')} rows`
                : `${leafRows.length.toLocaleString('en-US')} ${leafRows.length === 1 ? 'row' : 'rows'}`}
            </span>
          </div>
          {enableExport && (
            <Button
              type="button"
              icon={isExporting ? 'pi pi-spin pi-spinner' : 'pi pi-file-excel'}
              label="Export"
              onClick={handleExport}
              disabled={isExporting || leafRows.length === 0}
              className="p-button-sm p-button-text p-button-secondary"
            />
          )}
        </div>
      )}

      <DataTable
        value={displayRows}
        loading={loading}
        emptyMessage={emptyMessage}
        scrollable={scrollable}
        scrollHeight={scrollable ? tableHeight : undefined}
        resizableColumns
        columnResizeMode="expand"
        showGridlines={showGridlines}
        stripedRows={stripedRows}
        rowClassName={rowClassName}
        className={`${size === 'small' ? 'p-datatable-sm' : size === 'large' ? 'p-datatable-lg' : ''} w-full`}
        style={{ minWidth: '100%' }}
      >
        {displayColumns.map((col, index) => (
          <Column
            key={col}
            field={col}
            header={buildHeader(col)}
            headerClassName="text-xs whitespace-nowrap"
            bodyClassName="text-xs"
            style={{ width: columnWidthOverrides?.[col] ?? `${autoWidths[col] ?? 120}px`, minWidth: '4rem' }}
            body={buildBody(col)}
            footer={buildFooter(col, index === 0)}
          />
        ))}
      </DataTable>
    </div>
  );
}

export default memo(CommonDataTable);
