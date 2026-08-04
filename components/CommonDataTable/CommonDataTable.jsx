'use client';

/**
 * CommonDataTable — a simple, standalone data table.
 *
 * Takes rows as a prop and shapes them itself, so unlike the provider-backed table in
 * `share/src/app/datatable` it works anywhere with no context above it. Deliberately
 * small: grouping, filtering, sorting, totals and export — nothing else.
 *
 * Grouping is a drill-down. Each group is a row with an expander; opening it reveals the
 * next level as its own table, with its own headers, filter row, sort and totals, showing
 * the columns that level can actually fill.
 *
 * Nothing in this folder imports from `share/`; copy the folder and it still runs.
 *
 * @example
 * <CommonDataTable data={rows} title="Secondary sales" groupFields={['region', 'hq']} enableSummation />
 */

import { memo, useCallback, useState } from 'react';
import { Button } from 'primereact/button';

import useCommonTablePipeline from './hooks/useCommonTablePipeline';
import GroupTable from './GroupTable';
import { exportRows } from './utils/exportUtils';
import { getDataValue } from './utils/valueUtils';

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
  columnWidths,

  /* grouping */
  groupFields,
  childField,
  parentFields,

  /* features */
  enableSort = true,
  enableFilter = true,
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
    rootRows, leafRows, levelColumns, columnsForDepth, columnTypes, isGrouped, groupCount,
  } = useCommonTablePipeline({
    data,
    columns: columnsProp,
    hiddenColumns,
    columnTypeOverrides,
    groupFields,
    childField,
    parentFields,
  });

  const [isExporting, setIsExporting] = useState(false);
  const [expandAllSignal, setExpandAllSignal] = useState(null);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      // The records, with the columns the deepest level shows — group rows are totals.
      await exportRows({
        rows: leafRows,
        columns: levelColumns[levelColumns.length - 1],
        columnLabels,
        columnTypes,
        getCell: getDataValue,
        fileName: exportFileName,
        sheetName: title || 'Sheet1',
      });
    } finally {
      setIsExporting(false);
    }
  }, [leafRows, levelColumns, columnLabels, columnTypes, exportFileName, title]);

  const isExpanded = expandAllSignal?.expanded === true;
  const showHeaderBar = Boolean(title) || enableExport || isGrouped;

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

          {isGrouped && (
            <Button
              type="button"
              icon={isExpanded ? 'pi pi-minus-circle' : 'pi pi-plus-circle'}
              label={isExpanded ? 'Collapse all' : 'Expand all'}
              onClick={() => setExpandAllSignal({ expanded: !isExpanded })}
              className="p-button-sm p-button-text p-button-secondary"
            />
          )}

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

      <GroupTable
        rows={rootRows}
        depth={0}
        columnsForDepth={columnsForDepth}
        columnTypes={columnTypes}
        columnLabels={columnLabels}
        columnWidths={columnWidths}
        enableSort={enableSort}
        enableFilter={enableFilter}
        enableSummation={enableSummation}
        emptyMessage={emptyMessage}
        loading={loading}
        scrollable={scrollable}
        tableHeight={tableHeight}
        showGridlines={showGridlines}
        stripedRows={stripedRows}
        size={size}
        initialSort={initialSort}
        expandAllSignal={expandAllSignal}
      />
    </div>
  );
}

export default memo(CommonDataTable);
