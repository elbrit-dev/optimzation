'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnGroup } from 'primereact/columngroup';
import { Row } from 'primereact/row';
import { Dialog } from 'primereact/dialog';
import * as XLSX from 'xlsx';

import { useSmartDataStore } from './useSmartDataStore';
import { useSmartDataContext, useSmartDataConfig } from './SmartDataContext';
import { resolveConfig } from './smartDataTableConfig';
import { localFilter, localSort } from './tableUtils';
import { TableSkeleton, LoadingOverlay } from './TableSkeleton';
import { TextFilter } from './filters/TextFilter';
import { NumericFilter } from './filters/NumericFilter';
import { BooleanFilter } from './filters/BooleanFilter';
import { DateRangeFilter } from './filters/DateRangeFilter';
import { MultiselectFilter } from './filters/MultiselectFilter';
import { SmartTableToolbar, ColumnVisibilityDropdown, GroupByReorder } from './SmartTableToolbar';
import { useGroupBy } from './SmartDataControls';

// ─── Export utilities (module-scope, no hooks) ───────────────────────────────

/** Extract a cell value suitable for Excel from a { value, repr } cell or plain value. */
function extractExportValue(row, col) {
  const cell = row?.[col.field];
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object' && 'value' in cell) {
    const { value, repr } = cell;
    if (value === null || value === undefined) return '';
    if (col.type === 'boolean') return value ? 'Yes' : 'No';
    // Preserve actual numbers so Excel formats them as numbers, not strings.
    if (col.type === 'number' || (typeof value === 'number' && Number.isFinite(value))) {
      return typeof value === 'number' && Number.isFinite(value) ? value : (repr ?? String(value));
    }
    return repr ?? String(value);
  }
  if (typeof cell === 'number' && Number.isFinite(cell)) return cell;
  return String(cell);
}

/**
 * Collect all rows at a given tree depth (0 = top-level root rows).
 * For depth > 0, each collected row is augmented with ancestor label values
 * stored under `__anc_<depth>` keys so the exporter can prepend prior-level columns.
 */
function collectAtDepth(rows, targetDepth, labelColDefs = [], currentDepth = 0, ancestorLabels = {}) {
  if (!rows?.length) return [];
  if (currentDepth === targetDepth) {
    return Object.keys(ancestorLabels).length
      ? rows.map(row => ({ ...ancestorLabels, ...row }))
      : rows;
  }
  const result = [];
  const field  = labelColDefs[currentDepth]?.field  ?? 'label';
  const header = labelColDefs[currentDepth]?.header ?? `Level ${currentDepth + 1}`;
  for (const row of rows) {
    if (row._children?.length) {
      const next = {
        ...ancestorLabels,
        [`__anc_${currentDepth}`]: { field, header, value: row[field] },
      };
      result.push(...collectAtDepth(row._children, targetDepth, labelColDefs, currentDepth + 1, next));
    }
  }
  return result;
}

/** Return the maximum tree depth present in the rows (0 = no children). */
function getMaxDepth(rows, currentDepth = 0) {
  let max = currentDepth;
  for (const row of (rows ?? [])) {
    if (row._children?.length) {
      const d = getMaxDepth(row._children, currentDepth + 1);
      if (d > max) max = d;
    }
  }
  return max;
}

/** Like extractExportValue but honours col._preferField (label2/label3 for inner depths). */
function resolveExportCellValue(row, col) {
  if (col._preferField) {
    const preferred = row[col._preferField];
    if (preferred != null && preferred !== '') {
      if (typeof preferred === 'object' && 'repr' in preferred) return preferred.repr ?? preferred.value ?? '';
      return String(preferred);
    }
  }
  return extractExportValue(row, col);
}

/**
 * Build an XLSX worksheet with a two-row grouped header (mirrors the UI ColumnGroup layout).
 * Columns not in any named group (including the label col and ancCols) span both header rows.
 * Named groups show the group label merged across their columns in row 1, field headers in row 2.
 */
function buildGroupedWorksheet(sheetRows, exportCols, columnGroups) {
  const fieldToIdx = Object.fromEntries(exportCols.map((c, i) => [c.field, i]));
  const namedGroupFields = new Set(
    (columnGroups ?? []).filter(g => g.label).flatMap(g => g.fields)
  );

  const row1 = exportCols.map(() => '');
  const row2 = exportCols.map(() => '');
  const merges = [];

  // Columns outside named groups → header in row 1, merged down to row 2
  exportCols.forEach((col, i) => {
    if (!namedGroupFields.has(col.field)) {
      row1[i] = col.header;
      merges.push({ s: { r: 0, c: i }, e: { r: 1, c: i } });
    }
  });

  // Named groups → group label merged across row 1, field headers in row 2
  for (const group of (columnGroups ?? [])) {
    if (!group.label) continue;
    const visIndices = group.fields
      .filter(f => fieldToIdx[f] != null)
      .map(f => fieldToIdx[f]);
    if (!visIndices.length) continue;
    const first = Math.min(...visIndices);
    const last  = Math.max(...visIndices);
    row1[first] = group.label;
    if (first < last) merges.push({ s: { r: 0, c: first }, e: { r: 0, c: last } });
    visIndices.forEach(i => { row2[i] = exportCols[i].header; });
  }

  const dataRows = sheetRows.map(row =>
    exportCols.map(col => {
      if (col._ancKey) {
        const cell = row[col._ancKey]?.value;
        return cell != null && typeof cell === 'object' && 'repr' in cell
          ? (cell.repr ?? cell.value ?? '') : (cell ?? '');
      }
      return resolveExportCellValue(row, col);
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([row1, row2, ...dataRows]);
  if (merges.length) ws['!merges'] = merges;
  return ws;
}

function sanitizeSheetName(name) {
  if (!name || typeof name !== 'string') return 'Sheet';
  const s = name.replace(/[\\/*?[\]]/g, '_').trim();
  return s ? s.slice(0, 31) : 'Sheet';
}

/**
 * SmartDataTable — pure renderer.
 *
 * Receives data entirely via the Zustand store (keyed by viewId).
 * Fires all user interactions back through onSignal → SmartDataProvider.
 *
 * @param {{
 *   viewId: string,
 *   columns?: import('./dataSources').ColumnDef[],
 *   dataSource?: import('./SmartDataProvider').DataSourceFn,
 *   loadingMessage?: React.ReactNode,
 * }} props
 */
function SmartDataTableInner({ viewId, view, columns: columnsProp, dataSource: viewDataSource, loadingMessage, config: perViewConfig }) {
  const commonConfig = useSmartDataConfig();
  const cfg = useMemo(() => resolveConfig(commonConfig, perViewConfig), [commonConfig, perViewConfig]);

  const { registerView, unregisterView, handleSignal, exportView,
          registerViewActions, unregisterViewActions } = useSmartDataContext();

  // Subscribe only to this view's slice — other views changing won't re-render this.
  const viewState = useSmartDataStore(state => state.views[viewId]);

  useEffect(() => {
    registerView(viewId, viewDataSource ?? null, view ?? null, cfg.defaultPageSize);
    return () => unregisterView(viewId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId]);


  const onSignal = useCallback(
    signal => handleSignal(viewId, signal),
    [viewId, handleSignal]
  );

  // ── Sort ──────────────────────────────────────────────────────────────────
  const onSort = useCallback(e => {
    const current  = useSmartDataStore.getState().views[viewId]?.sortBy ?? {};
    const incoming = e.multiSortMeta ?? [];
    const next = { ...current };
    incoming.forEach(({ field, order }) => { next[field] = order === 1 ? 'asc' : 'desc'; });
    Object.keys(current).forEach(f => { if (!incoming.some(m => m.field === f)) delete next[f]; });
    onSignal({ type: 'sort', payload: next });
  }, [viewId, onSignal]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const onPage = useCallback(
    e => onSignal({ type: 'page', payload: { first: e.first, rows: e.rows } }),
    [onSignal]
  );

  // ── Filter helper ─────────────────────────────────────────────────────────
  const onFilter = useCallback(
    (field, filterValue) => onSignal({ type: 'filter', payload: { field, value: filterValue } }),
    [onSignal]
  );

  // columnsProp takes precedence; falls back to columns returned by the dataSource (e.g. reportDataSource)
  const columns = columnsProp ?? viewState?.columns ?? [];
  const columnGroups = viewState?.columnGroups ?? null;
  const labelColDefs = viewState?.labelColDefs ?? [];

  // ── Eye / column visibility ───────────────────────────────────────────────
  const hiddenColumns = viewState?.hiddenColumns ?? [];
  const visibleColumns = useMemo(
    () => columns.filter(c => !hiddenColumns.includes(c.field)),
    [columns, hiddenColumns]
  );

  const onHiddenColumnsChange = useCallback((fields) => {
    useSmartDataStore.getState().setHiddenColumns(viewId, fields);
  }, [viewId]);

  // ── Group-by reorder ─────────────────────────────────────────────────────────
  const { groups: groupByGroups, setGroupBy } = useGroupBy(viewId);

  // ── Lock / freeze first column ────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [freezeFirstColumn, setFreezeFirstColumn] = useState(() => cfg.enableFreezeFirstColumn);

  const containerRef = useRef(null);

  // ── Maximize / fullscreen ─────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

  // ── Export ────────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportLevelsVisible, setExportLevelsVisible] = useState(false);
  const [exportSelectedLevels, setExportSelectedLevels] = useState([]);
  const [exportDialogLoading, setExportDialogLoading] = useState(false);

  // Build workbook from per-sheet descriptors and trigger download.
  const doExport = useCallback((rows, selectedDepths) => {
    const cols = visibleColumns;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const filename = typeof cfg.exportFilename === 'function'
      ? cfg.exportFilename(now)
      : (cfg.exportFilename ?? `export_${dateStr}.xlsx`);
    const wb = XLSX.utils.book_new();
    const usedNames = new Set();

    const hasGroups = columnGroups?.some(g => g.label);

    const appendSheet = (sheetRows, exportCols, rawName) => {
      let ws;
      if (hasGroups) {
        ws = buildGroupedWorksheet(sheetRows, exportCols, columnGroups);
      } else {
        const data = sheetRows.map(row =>
          exportCols.reduce((obj, col) => {
            if (col._ancKey) {
              const cell = row[col._ancKey]?.value;
              obj[col.header] = cell != null && typeof cell === 'object' && 'repr' in cell
                ? (cell.repr ?? cell.value ?? '')
                : (cell ?? '');
            } else {
              obj[col.header] = resolveExportCellValue(row, col);
            }
            return obj;
          }, {})
        );
        ws = XLSX.utils.json_to_sheet(data);
      }
      let name = sanitizeSheetName(rawName);
      let n = 1;
      while (usedNames.has(name)) { name = sanitizeSheetName(`${rawName}_${n++}`); }
      usedNames.add(name);
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    if (selectedDepths?.length) {
      // Multi-sheet: one sheet per selected tree depth.
      [...selectedDepths].sort((a, b) => a - b).forEach(depth => {
        const sheetName = viewState.filterDefs?.[depth]?.label ?? `Level ${depth + 1}`;
        const rawRows = collectAtDepth(rows, depth, labelColDefs);

        // Build ancestor columns from __anc_ metadata embedded by collectAtDepth.
        const ancCols = rawRows.length
          ? Object.keys(rawRows[0])
              .filter(k => k.startsWith('__anc_'))
              .sort()
              .map(k => ({ header: rawRows[0][k].header, _ancKey: k }))
          : [];

        // Override the label column header and preferred read-field for the current depth.
        const depthLabelHeader = labelColDefs[depth]?.header;
        const depthCols = cols.map(col => {
          if (col.field !== 'label') return col;
          return {
            ...col,
            ...(depthLabelHeader ? { header: depthLabelHeader } : {}),
            // At depth > 0 prefer label2/label3/… (mirrors InnerDataTable body logic)
            ...(depth > 0 ? { _preferField: `label${depth + 1}` } : {}),
          };
        });

        appendSheet(rawRows, [...ancCols, ...depthCols], sanitizeSheetName(sheetName));
      });
    } else {
      appendSheet(rows, cols, 'Sheet1');
    }

    XLSX.writeFile(wb, filename);
    setExportLevelsVisible(false);
  }, [visibleColumns, labelColDefs, columnGroups]);

  const handleExport = useCallback(async () => {
    if (viewState?.expandable) {
      // Show level picker immediately using already-loaded store rows — fetch happens on confirm.
      const maxDepth = getMaxDepth(viewState.rows);
      setExportSelectedLevels(Array.from({ length: maxDepth + 1 }, (_, i) => i));
      setExportLevelsVisible(true);
    } else {
      setExporting(true);
      try {
        const allRows = await exportView(viewId);
        if (allRows?.length) doExport(allRows, null);
      } finally {
        setExporting(false);
      }
    }
  }, [exportView, viewId, viewState?.expandable, viewState?.rows, doExport]);

  const handleDialogExport = useCallback(async () => {
    setExportDialogLoading(true);
    try {
      const allRows = await exportView(viewId);
      if (allRows?.length) doExport(allRows, exportSelectedLevels);
    } finally {
      setExportDialogLoading(false);
    }
  }, [exportView, viewId, exportSelectedLevels, doExport]);

  useEffect(() => {
    registerViewActions(viewId, {
      lockFirstColumn:  () => setFreezeFirstColumn(v => !v),
      viewInFullscreen: () => { setIsFullscreen(true); setIsMaximized(true); },
      exportToExcel:    () => handleExport(),
    });
    return () => unregisterViewActions(viewId);
  }, [viewId, registerViewActions, unregisterViewActions, handleExport]);

  // ── Toolbar action arrays ─────────────────────────────────────────────────
  const hasGroups = !!columnGroups?.length;
  const hasData = (viewState?.rows?.length ?? 0) > 0;

  const leftActions = useMemo(() => {
    const actions = [];
    if (cfg.enableColumnVisibility) {
      actions.push({
        id: 'eye',
        type: 'custom',
        render: () => (
          <ColumnVisibilityDropdown
            key="eye"
            columns={columns}
            columnGroups={columnGroups}
            hiddenColumns={hiddenColumns}
            onChange={onHiddenColumnsChange}
          />
        ),
      });
    }
    if (cfg.enableColumnFreeze) {
      actions.push({
        id: 'lock',
        type: 'button',
        icon: freezeFirstColumn ? 'pi-lock' : 'pi-unlock',
        title: freezeFirstColumn ? 'Unlock first column' : 'Lock first column',
        active: freezeFirstColumn,
        color: 'default',
        onClick: () => setFreezeFirstColumn(v => !v),
      });
    }
    if (groupByGroups.length > 0) {
      actions.push({
        id: 'group-by',
        type: 'custom',
        render: () => (
          <GroupByReorder
            key="group-by"
            groups={groupByGroups}
            onChange={setGroupBy}
          />
        ),
      });
    }
    return actions;
  }, [cfg.enableColumnVisibility, cfg.enableColumnFreeze, columns, hiddenColumns, freezeFirstColumn, onHiddenColumnsChange, groupByGroups, setGroupBy]);

  const rightActions = useMemo(() => {
    const actions = [];
    if (cfg.enableExport) {
      actions.push({
        id: 'export',
        type: 'button',
        icon: 'pi-file-excel',
        title: exporting ? 'Exporting…' : 'Export to Excel',
        color: 'green',
        disabled: !hasData || exporting,
        onClick: handleExport,
      });
    }
    if (cfg.enableFullscreen) {
      actions.push({
        id: 'maximize',
        type: 'button',
        icon: 'pi-window-maximize',
        title: 'View in fullscreen',
        color: 'purple',
        onClick: () => { setIsFullscreen(true); setIsMaximized(true); },
      });
    }
    return actions;
  }, [cfg.enableExport, cfg.enableFullscreen, hasData, exporting, handleExport]);

  // Dialog-specific right actions: swap maximize for restore+close
  const dialogRightActions = useMemo(() => [
    ...rightActions.filter(a => a.id !== 'maximize'),
    {
      id: 'restore',
      type: 'button',
      icon: isMaximized ? 'pi-window-minimize' : 'pi-window-maximize',
      title: isMaximized ? 'Restore' : 'Maximize',
      color: 'indigo',
      onClick: () => setIsMaximized(v => !v),
    },
    {
      id: 'close',
      type: 'button',
      icon: 'pi-times',
      title: 'Close',
      color: 'default',
      onClick: () => { setIsFullscreen(false); setIsMaximized(false); },
    },
  ], [rightActions, isMaximized]);

  // ── Column JSX (memoized — only rebuilt when columns prop changes) ─────────
  // When columnGroups is active, filters live in the ColumnGroup filter row (Row 3).
  // Body columns must have filter=false so PrimeReact doesn't render a conflicting filter row.
  const columnElements = useMemo(() => {
    if (!visibleColumns?.length) return null;
    const hasGroupedHeader = !!columnGroups?.length;
    const filtersEnabled = cfg.enableFilterRow !== false;
    const totalsEnabled = cfg.enableTotalRow === true;

    return visibleColumns.map((col, idx) => {
      const currentFilter = viewState?.filters?.[col.field] ?? null;

      const filterElement = (filtersEnabled && !hasGroupedHeader && col.filterable !== false)
        ? buildFilterElement(col, currentFilter, onFilter, cfg.filterDebounceText, cfg.filterDebounceNumeric)
        : null;

      const defaultBody = (rowData) => rowData[col.field]?.repr ?? '';

      // Dynamic freeze: first visible column frozen when lock is engaged
      const isFrozen = (freezeFirstColumn && idx === 0) ? true : (col.frozen ?? false);

      return (
        <Column
          key={col.field}
          field={col.field}
          header={col.header}
          sortable={cfg.enableSort !== false && col.sortable !== false}
          filter={filtersEnabled && !hasGroupedHeader && col.filterable !== false}
          filterElement={filterElement}
          showFilterMenu={false}
          style={col.width ? { width: col.width, minWidth: col.width } : undefined}
          frozen={isFrozen}
          footer={totalsEnabled ? col.footer?.repr : undefined}
          body={col.body ?? defaultBody}
        />
      );
    });
    // viewState?.filters intentionally in deps so filter elements reflect active values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleColumns, columnGroups, viewState?.filters, onFilter, freezeFirstColumn, cfg.enableFilterRow, cfg.enableTotalRow, cfg.enableSort, cfg.filterDebounceText, cfg.filterDebounceNumeric]);

  // ── Row expansion (set by groupedReportDataSource via expandable: true) ──────
  const [expandedRows, setExpandedRows] = useState(null);
  const expandable = viewState?.expandable ?? false;

  const rowExpansionTemplate = useCallback((rowData) => {
    if (!rowData._children?.length) return null;
    return (
      <div className="px-6 py-2 bg-gray-50">
        <InnerDataTable rows={rowData._children} columns={visibleColumns} columnGroups={columnGroups} labelColDefs={labelColDefs} depth={1} onSignal={onSignal} _parent={{ data: (({ _children, ...rest }) => rest)(rowData), _parent: null }} />
      </div>
    );
  }, [visibleColumns, columnGroups, labelColDefs, onSignal]);

  // ── Column group header (built when meta.column_group === true) ────────────
  // Uses visibleColumns so hidden columns are excluded from the group header too.
  const headerColumnGroup = useMemo(() => {
    if (!columnGroups?.length) return null;
    const colByField = Object.fromEntries(visibleColumns.map(c => [c.field, c]));
    const filters = viewState?.filters ?? {};
    const visibleFields = new Set(visibleColumns.map(c => c.field));
    const filtersEnabled = cfg.enableFilterRow !== false;
    const rowSpan = filtersEnabled ? 3 : 2;

    return (
      <ColumnGroup>
        <Row>
          {expandable && <Column rowSpan={rowSpan} style={{ width: '3rem' }} />}
          <Column header={colByField['label']?.header ?? 'Name'} rowSpan={2} sortable field="label" frozen={freezeFirstColumn} />
          {columnGroups.map(g => {
            const visCount = g.fields.filter(f => visibleFields.has(f)).length;
            if (visCount === 0) return null;
            return <Column key={g.id} header={g.label} colSpan={visCount} />;
          })}
        </Row>
        <Row>
          {columnGroups.flatMap(g =>
            g.fields.filter(f => visibleFields.has(f)).map(f => (
              <Column key={f} header={colByField[f]?.header ?? f} sortable field={f} />
            ))
          )}
        </Row>
        {filtersEnabled && (
          <Row>
            <Column header={buildFilterElement(colByField['label'], filters['label'] ?? null, onFilter, cfg.filterDebounceText, cfg.filterDebounceNumeric)()} frozen={freezeFirstColumn} />
            {columnGroups.flatMap(g =>
              g.fields.filter(f => visibleFields.has(f)).map(f => {
                const col = colByField[f];
                return (
                  <Column
                    key={`filter-${f}`}
                    header={col ? buildFilterElement(col, filters[f] ?? null, onFilter, cfg.filterDebounceText, cfg.filterDebounceNumeric)() : ''}
                  />
                );
              })
            )}
          </Row>
        )}
      </ColumnGroup>
    );
  }, [columnGroups, visibleColumns, expandable, freezeFirstColumn, viewState?.filters, onFilter, cfg.enableFilterRow, cfg.filterDebounceText, cfg.filterDebounceNumeric]);

  // ── Row click ─────────────────────────────────────────────────────────────
  const onRowClick = useCallback(
    e => onSignal({ type: 'rowClick', payload: { event: { ...e, data: { ...(({ _children, ...rest }) => rest)(e.data), _parent: null } } } }),
    [onSignal]
  );

  if (!viewState) return null;

  const { rows, totalRecords, loading, error } = viewState;
  const { first, rows: perPage } = viewState.pagination;

  if (error && !loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-sm">
        <i className="pi pi-exclamation-triangle flex-none" />
        <span>{error}</span>
      </div>
    );
  }

  // Initial load: no rows + still fetching → skeleton with overlay message
  if (loading && rows.length === 0) {
    return (
      <TableSkeleton
        columns={visibleColumns}
        rowCount={cfg.skeletonRows}
        colCount={cfg.skeletonColumns}
        message={loadingMessage ?? cfg.loadingMessage}
      />
    );
  }

  // ── Shared DataTable props ─────────────────────────────────────────────────
  const sharedTableProps = {
    value: rows,
    sortMode: cfg.enableMultiSort ? 'multiple' : 'single',
    multiSortMeta: Object.entries(viewState?.sortBy ?? {}).map(([field, direction]) => ({ field, order: direction === 'asc' ? 1 : -1 })),
    onSort,
    removableSort: cfg.enableRemovableSort,
    ...(cfg.enableFilterRow !== false && { filterDisplay: 'row' }),
    paginator: cfg.enablePaginator,
    lazy: true,
    first,
    rows: perPage,
    totalRecords,
    onPage,
    rowsPerPageOptions: cfg.pageSizeOptions,
    scrollable: true,
    size: cfg.size === 'normal' ? undefined : cfg.size,
    emptyMessage: cfg.emptyMessage,
    showGridlines: cfg.enableGridlines,
    stripedRows: cfg.enableStripedRows,
    resizableColumns: cfg.enableResizableColumns,
    columnResizeMode: cfg.columnResizeMode,
    reorderableColumns: cfg.enableReorderableColumns,
    ...(headerColumnGroup && { headerColumnGroup }),
    ...(expandable && {
      expandedRows,
      onRowToggle: e => setExpandedRows(e.data),
      rowExpansionTemplate,
    }),
    onRowClick,
    selectionMode: 'single',
  };

  return (
    <div className="relative" ref={containerRef}>
      <SmartTableToolbar leftActions={leftActions} rightActions={rightActions} />

      <DataTable
        {...sharedTableProps}
        scrollHeight={cfg.scrollHeight}
      >
        {expandable && <Column expander style={{ width: '3rem' }} />}
        {columnElements}
      </DataTable>

      {loading && <LoadingOverlay message={loadingMessage ?? cfg.loadingMessage} />}

      {/* Fullscreen dialog */}
      <Dialog
        visible={isFullscreen}
        showHeader={false}
        maximizable
        maximized={isMaximized}
        modal
        style={{ width: '70vw', height: '90vh' }}
        contentStyle={{
          padding: '1rem',
          paddingBottom: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
        onHide={() => { setIsFullscreen(false); setIsMaximized(false); }}
        onMaximize={e => setIsMaximized(e.maximized)}
      >
        <div className="w-full h-full flex flex-col" style={{ minHeight: 0 }}>
          <SmartTableToolbar
            leftActions={leftActions}
            rightActions={dialogRightActions}
            className="shrink-0"
          />
          <div className="flex-1" style={{ minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <DataTable
              {...sharedTableProps}
              scrollHeight="flex"
              style={{ height: '100%' }}
            >
              {expandable && <Column expander style={{ width: '3rem' }} />}
              {columnElements}
            </DataTable>
          </div>
        </div>
      </Dialog>

      {/* Export levels dialog — shown when expandable tree data has multiple depths */}
      <Dialog
        header="Export grouped data"
        visible={exportLevelsVisible}
        style={{ width: '90vw', maxWidth: '480px' }}
        onHide={() => setExportLevelsVisible(false)}
        footer={
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              disabled={exportDialogLoading}
              onClick={() => setExportLevelsVisible(false)}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!exportSelectedLevels.length || exportDialogLoading}
              onClick={handleDialogExport}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {exportDialogLoading
                ? <><i className="pi pi-spin pi-spinner"></i> Exporting…</>
                : <><i className="pi pi-download"></i> Export</>
              }
            </button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-gray-600">
          Select which levels to export. Each selected level becomes a separate sheet in the Excel file.
        </p>
        <div className="flex flex-col gap-2">
          {exportSelectedLevels.map((_, i) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={exportSelectedLevels.includes(i)}
                onChange={() =>
                  setExportSelectedLevels(prev =>
                    prev.includes(i) ? prev.filter(v => v !== i) : [...prev, i]
                  )
                }
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span>{viewState.filterDefs?.[i]?.label ?? `Level ${i + 1}`}</span>
            </label>
          ))}
        </div>
      </Dialog>
    </div>
  );
}

export const SmartDataTable = memo(SmartDataTableInner);

// ─── Inner expansion table ───────────────────────────────────────────────────

function InnerDataTable({ rows, columns, columnGroups, labelColDefs = [], depth = 0, onSignal, _parent = null }) {
  const [filters, setFilters] = useState({});
  const [sortMeta, setSortMeta] = useState([]);
  const [expandedRows, setExpandedRows] = useState(null);

  const onFilter = useCallback((field, filterValue) => {
    setFilters(prev => {
      if (!filterValue || filterValue.value === null || filterValue.value === undefined || filterValue.value === '') {
        const { [field]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: filterValue };
    });
  }, []);

  const processedRows = useMemo(
    () => localSort(localFilter(rows, filters), sortMeta),
    [rows, filters, sortMeta]
  );

  const expandable = useMemo(() => rows.some(r => r._children?.length), [rows]);

  const rowExpansionTemplate = useCallback((rowData) => {
    if (!rowData._children?.length) return null;
    return (
      <div className="px-6 py-2 bg-gray-50">
        <InnerDataTable rows={rowData._children} columns={columns} columnGroups={columnGroups} labelColDefs={labelColDefs} depth={depth + 1} onSignal={onSignal} _parent={{ data: (({ _children, ...rest }) => rest)(rowData), _parent }} />
      </div>
    );
  }, [columns, columnGroups, labelColDefs, depth]);

  // When columnGroups active, body column filters are in the ColumnGroup filter row.
  const columnElements = useMemo(() => {
    const hasGroupedHeader = !!columnGroups?.length;
    return columns.map(col => {
      const filterElement = (!hasGroupedHeader && col.filterable !== false)
        ? buildFilterElement(col, filters[col.field] ?? null, onFilter)
        : null;
      const defaultBody = (rowData) => rowData[col.field]?.repr ?? '';

      // For the label column in inner tables, prefer label{depth+1} if available, fall back to label
      let body = col.body ?? defaultBody;
      if (col.field === 'label') {
        const preferredKey = `label${depth + 1}`;
        body = (rowData) => rowData[preferredKey] || rowData['label']?.repr || '';
      }

      const header = (col.field === 'label' && labelColDefs[depth]?.header)
        ? labelColDefs[depth].header
        : col.header;

      return (
        <Column
          key={col.field}
          field={col.field}
          header={header}
          sortable={col.sortable !== false}
          filter={!hasGroupedHeader && col.filterable !== false}
          filterElement={filterElement}
          showFilterMenu={false}
          style={col.width ? { width: col.width, minWidth: col.width } : undefined}
          body={body}
        />
      );
    });
  }, [columns, columnGroups, filters, onFilter, depth, labelColDefs]);

  // 3-row header:
  //   Row 1: (expander col if expandable) + label col (rowSpan=2) + group spanning headers
  //   Row 2: leaf field headers (sortable)
  //   Row 3: filter row
  const headerColumnGroup = useMemo(() => {
    if (!columnGroups?.length) return null;
    const colByField = Object.fromEntries(columns.map(c => [c.field, c]));
    const labelHeader = labelColDefs[depth]?.header ?? colByField['label']?.header ?? 'Name';
    return (
      <ColumnGroup>
        <Row>
          {expandable && <Column rowSpan={2} style={{ width: '3rem' }} />}
          <Column header={labelHeader} rowSpan={2} sortable field="label" />
          {columnGroups.map(g => (
            <Column key={g.id} header={g.label} colSpan={g.fields.length} />
          ))}
        </Row>
        <Row>
          {columnGroups.flatMap(g =>
            g.fields.map(f => (
              <Column key={f} header={colByField[f]?.header ?? f} sortable field={f} />
            ))
          )}
        </Row>
        <Row>
          {expandable && <Column header="" />}
          <Column header={buildFilterElement(colByField['label'], filters['label'] ?? null, onFilter)()} />
          {columnGroups.flatMap(g =>
            g.fields.map(f => {
              const col = colByField[f];
              return (
                <Column
                  key={`filter-${f}`}
                  header={col ? buildFilterElement(col, filters[f] ?? null, onFilter)() : ''}
                />
              );
            })
          )}
        </Row>
      </ColumnGroup>
    );
  }, [columnGroups, columns, filters, onFilter, labelColDefs, depth, expandable]);

  return (
    <DataTable
      value={processedRows}
      size="small"
      showGridlines
      stripedRows
      sortMode="multiple"
      multiSortMeta={sortMeta}
      onSort={e => setSortMeta(e.multiSortMeta ?? [])}
      removableSort
      filterDisplay="row"
      {...(expandable && {
        expandedRows,
        onRowToggle: e => setExpandedRows(e.data),
        rowExpansionTemplate,
      })}
      {...(headerColumnGroup && { headerColumnGroup })}
      {...(onSignal && {
        onRowClick: e => onSignal({ type: 'rowClick', payload: { event: { ...e, data: { ...(({ _children, ...rest }) => rest)(e.data), _parent } } } }),
        selectionMode: 'single',
      })}
    >
      {expandable && <Column expander style={{ width: '3rem' }} />}
      {columnElements}
    </DataTable>
  );
}

// ─── Filter element builder ──────────────────────────────────────────────────

// PrimeReact's filterElement prop expects a render function () => ReactNode, not a ReactNode directly.
// When embedding filters in a ColumnGroup header, call the returned function to get the ReactNode.
function buildFilterElement(col, currentFilter, onFilter, debounceText = 300, debounceNumeric = 400) {
  const type = col.filterType ?? inferFilterType(col.type);

  switch (type) {
    case 'multiselect':
      return () => (
        <MultiselectFilter
          field={col.field}
          value={currentFilter}
          options={col.filterOptions ?? []}
          onFilter={onFilter}
        />
      );
    case 'date':
      return () => <DateRangeFilter field={col.field} value={currentFilter} onFilter={onFilter} />;
    case 'boolean':
      return () => <BooleanFilter field={col.field} value={currentFilter} onFilter={onFilter} />;
    case 'numeric':
      return () => <NumericFilter field={col.field} value={currentFilter} onFilter={onFilter} debounceMs={debounceNumeric} />;
    case 'text':
    default:
      return () => <TextFilter field={col.field} value={currentFilter} onFilter={onFilter} debounceMs={debounceText} />;
  }
}

function inferFilterType(colType) {
  if (colType === 'number')  return 'numeric';
  if (colType === 'date')    return 'date';
  if (colType === 'boolean') return 'boolean';
  return 'text';
}
