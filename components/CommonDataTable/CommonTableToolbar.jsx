'use client';

/**
 * Toolbar above the table: search, column visibility, export, and view toggles.
 * Purely presentational — every control is driven by props from CommonDataTable.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { MultiSelect } from 'primereact/multiselect';
import { OverlayPanel } from 'primereact/overlaypanel';
import { formatHeaderName } from './utils/valueUtils';

const SEARCH_DEBOUNCE_MS = 300;

const GlobalSearchInput = memo(function GlobalSearchInput({ value, onChange, placeholder }) {
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const commit = useMemo(
    () => debounce((raw) => onChangeRef.current(raw), SEARCH_DEBOUNCE_MS),
    [],
  );
  useEffect(() => () => commit.cancel?.(), [commit]);

  return (
    <span className="p-input-icon-left relative">
      <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
      <InputText
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          commit(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          commit.cancel?.();
          setDraft('');
          onChangeRef.current('');
        }}
        placeholder={placeholder}
        className="p-inputtext-sm"
        style={{ minWidth: '13rem', paddingLeft: '2rem' }}
        aria-label="Search all columns"
      />
    </span>
  );
});

function CommonTableToolbar({
  title,
  totalRecords,
  leafRecords,
  sourceRecords,
  isGrouped,
  isFiltered,
  // search
  enableGlobalSearch,
  globalSearch,
  onGlobalSearchChange,
  searchPlaceholder = 'Search all columns…',
  onClearFilters,
  // columns
  enableColumnVisibility,
  allColumns,
  visibleColumns,
  columnLabels,
  onVisibleColumnsChange,
  // export
  enableExport,
  onExport,
  isExporting,
  // grouping
  hasGroups,
  allGroupsExpanded,
  onToggleAllGroups,
  // view toggles
  enableFreezeFirstColumn,
  freezeFirstColumn,
  onToggleFreeze,
  enableFullscreen,
  isFullscreen,
  onToggleFullscreen,
  showUnitToggle,
  divideBy1Lakh,
  onToggleUnit,
  onRefresh,
  loading,
  actions,
}) {
  const exportPanelRef = useRef(null);

  const columnOptions = useMemo(
    () => allColumns.map((col) => ({ label: columnLabels?.[col] || formatHeaderName(col), value: col })),
    [allColumns, columnLabels],
  );

  /**
   * `totalRecords` counts what the pager pages over — group rows once grouping is on —
   * so it is reported separately from the leaf rows behind them. Without that split a
   * grouped table reads "4 of 120 rows", which sounds like 116 rows went missing.
   */
  const countLabel = useMemo(() => {
    if (!Number.isFinite(totalRecords)) return null;
    const n = (value) => value.toLocaleString('en-US');
    const leaves = Number.isFinite(leafRecords) ? leafRecords : totalRecords;
    const source = Number.isFinite(sourceRecords) ? sourceRecords : leaves;
    const rowsPart = leaves === source ? `${n(source)} rows` : `${n(leaves)} of ${n(source)} rows`;
    if (!isGrouped) return leaves === 1 && source === 1 ? '1 row' : rowsPart;
    return `${n(totalRecords)} ${totalRecords === 1 ? 'group' : 'groups'} · ${rowsPart}`;
  }, [totalRecords, leafRecords, sourceRecords, isGrouped]);

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50/80">
      {(title || countLabel) && (
        <div className="flex items-baseline gap-2 mr-auto min-w-0">
          {title && <span className="font-semibold text-gray-800 truncate">{title}</span>}
          {countLabel && <span className="text-xs text-gray-500 whitespace-nowrap">{countLabel}</span>}
        </div>
      )}
      {!title && !countLabel && <div className="mr-auto" />}

      {enableGlobalSearch && (
        <GlobalSearchInput
          value={globalSearch}
          onChange={onGlobalSearchChange}
          placeholder={searchPlaceholder}
        />
      )}

      {isFiltered && (
        <Button
          type="button"
          icon="pi pi-filter-slash"
          label="Clear"
          onClick={onClearFilters}
          className="p-button-sm p-button-text p-button-secondary"
          tooltip="Clear all filters and search"
          tooltipOptions={{ position: 'bottom' }}
        />
      )}

      {hasGroups && (
        <Button
          type="button"
          icon={allGroupsExpanded ? 'pi pi-minus-circle' : 'pi pi-plus-circle'}
          onClick={onToggleAllGroups}
          className="p-button-sm p-button-text p-button-secondary"
          tooltip={allGroupsExpanded ? 'Collapse all groups' : 'Expand all groups'}
          tooltipOptions={{ position: 'bottom' }}
          aria-label={allGroupsExpanded ? 'Collapse all groups' : 'Expand all groups'}
        />
      )}

      {enableColumnVisibility && allColumns.length > 0 && (
        <MultiSelect
          value={visibleColumns}
          options={columnOptions}
          onChange={(event) => onVisibleColumnsChange(event.value)}
          placeholder="Columns"
          display="chip"
          maxSelectedLabels={0}
          selectedItemsLabel={`${visibleColumns.length}/${allColumns.length} columns`}
          filter={columnOptions.length > 8}
          className="text-xs"
          style={{ maxWidth: '11rem' }}
          panelClassName="text-sm"
          appendTo={typeof document === 'undefined' ? undefined : document.body}
          aria-label="Choose visible columns"
        />
      )}

      {showUnitToggle && (
        <Button
          type="button"
          label={divideBy1Lakh ? 'Lakhs' : 'Units'}
          onClick={onToggleUnit}
          className={`p-button-sm p-button-text ${divideBy1Lakh ? '' : 'p-button-secondary'}`}
          tooltip={divideBy1Lakh ? 'Showing values in lakhs' : 'Show values in lakhs'}
          tooltipOptions={{ position: 'bottom' }}
        />
      )}

      {enableFreezeFirstColumn && (
        <Button
          type="button"
          icon={freezeFirstColumn ? 'pi pi-lock' : 'pi pi-lock-open'}
          onClick={onToggleFreeze}
          className={`p-button-sm p-button-text ${freezeFirstColumn ? '' : 'p-button-secondary'}`}
          tooltip={freezeFirstColumn ? 'Unfreeze first column' : 'Freeze first column'}
          tooltipOptions={{ position: 'bottom' }}
          aria-label="Toggle frozen first column"
        />
      )}

      {enableExport && (
        <>
          <Button
            type="button"
            icon={isExporting ? 'pi pi-spin pi-spinner' : 'pi pi-download'}
            onClick={(event) => exportPanelRef.current?.toggle(event)}
            disabled={isExporting || totalRecords === 0}
            className="p-button-sm p-button-text p-button-secondary"
            tooltip="Export"
            tooltipOptions={{ position: 'bottom' }}
            aria-label="Export data"
          />
          <OverlayPanel ref={exportPanelRef} className="text-sm">
            <div className="flex flex-col gap-1 min-w-[10rem]">
              <Button
                type="button"
                icon="pi pi-file-excel"
                label="Excel (.xlsx)"
                onClick={() => {
                  exportPanelRef.current?.hide();
                  onExport('xlsx');
                }}
                className="p-button-sm p-button-text justify-start"
              />
              <Button
                type="button"
                icon="pi pi-file"
                label="CSV (.csv)"
                onClick={() => {
                  exportPanelRef.current?.hide();
                  onExport('csv');
                }}
                className="p-button-sm p-button-text justify-start"
              />
            </div>
          </OverlayPanel>
        </>
      )}

      {onRefresh && (
        <Button
          type="button"
          icon={loading ? 'pi pi-spin pi-refresh' : 'pi pi-refresh'}
          onClick={onRefresh}
          disabled={loading}
          className="p-button-sm p-button-text p-button-secondary"
          tooltip="Refresh"
          tooltipOptions={{ position: 'bottom' }}
          aria-label="Refresh data"
        />
      )}

      {enableFullscreen && (
        <Button
          type="button"
          icon={isFullscreen ? 'pi pi-window-minimize' : 'pi pi-window-maximize'}
          onClick={onToggleFullscreen}
          className="p-button-sm p-button-text p-button-secondary"
          tooltip={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          tooltipOptions={{ position: 'bottom' }}
          aria-label="Toggle fullscreen"
        />
      )}

      {actions}
    </div>
  );
}

export default memo(CommonTableToolbar);
