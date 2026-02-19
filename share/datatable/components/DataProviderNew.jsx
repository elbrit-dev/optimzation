'use client';
import { generateMonthRangeArray } from '@/app/datatable/utils/dateUtils';
import { indexedDBService } from '@/app/datatable/utils/indexedDBService';
import RangePicker from '@/components/RangePicker';
import { DataProvider as PlasmicDataProvider } from "@plasmicapp/loader-nextjs";
import { Switch } from 'antd';
import * as Comlink from 'comlink';
import {
    isFinite as _isFinite,
    isNaN as _isNaN,
    cloneDeep,
    every,
    filter,
    flatMap,
    get,
    head,
    includes,
    isArray,
    isBoolean,
    isEmpty,
    isNil,
    isNumber,
    orderBy,
    some,
    startCase,
    sumBy,
    take,
    toLower,
    toNumber,
    uniq
} from 'lodash';
import { Button } from 'primereact/button';
import { Calendar } from 'primereact/calendar';
import { Checkbox } from 'primereact/checkbox';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { Sidebar } from 'primereact/sidebar';
import { SplitButton } from 'primereact/splitbutton';
import { TabPanel, TabView } from 'primereact/tabview';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { TableOperationsContext } from '../contexts/TableOperationsContext';
import { useDataPipeline } from '../hooks/useDataPipeline';
import { useMultiSlotPipeline } from '../hooks/useMultiSlotPipeline';
import { useQueryExecution } from '../hooks/useQueryExecution';
import { getDataKeys, getDataValue } from '../utils/dataAccessUtils';
import { applyDerivedColumns, applyDerivedColumnsForRow, getDerivedColumnNames, getOrderedColumnsWithDerived } from '../utils/derivedColumnsUtils';
import { formatDateValue } from '../utils/dateFormatUtils';
import { applyDateFilter, applyNumericFilter, filterRows, parseNumericFilter } from '../utils/filterUtils';
import { getMainOverrides } from '../utils/columnTypesOverrideUtils';
import { isJsonArrayOfObjectsString } from '../utils/jsonArrayParser';
import { useReportData } from '../utils/providerUtils';
import { exportReportToXLSX } from '../utils/reportExportUtils';
import { isDateLike, isNumericValue } from '../utils/typeDetectionUtils';
import DataTableComponent from './DataTableNew';
import { useSlotId } from './DataSlot';
import FilterSortSidebar from './FilterSortSidebar';

export default function DataProviderNew({
  offlineData,
  onDataChange,
  onError,
  onTableDataChange,
  onRawDataChange, // New callback to pass raw/original data for Auth Control
  variableOverrides = {},
  onVariablesChange,
  // Callbacks for parent
  onExecutingQueryChange,
  onSelectedQueryKeyChange,
  onLoadingDataChange,
  // Auth control props
  isAdminMode = false,
  salesTeamColumn = null,
  salesTeamValues = [],
  hqColumn = null,
  hqValues = [],
  // Data source and query key props
  dataSource: dataSourceProp = null,
  selectedQueryKey: selectedQueryKeyProp = null,
  // Table operation props (for orchestration layer)
  enableSort = true,
  enableFilter = true,
  enableSummation = true,
  enableGrouping = true,
  textFilterColumns = [],
  allowedColumns = [], // Developer-controlled: restricts which columns are available for selection
  onAllowedColumnsChange,
  visibleColumns: visibleColumnsProp = null, // User-controlled: actual visible columns (can be passed from parent)
  onVisibleColumnsChange,
  percentageColumns = [],
  derivedColumns = [],
  groupFields = null, // Array for infinite nesting - required for grouping (breaking change: outerGroupField/innerGroupField no longer supported)
  redFields = [],
  greenFields = [],
  enableDivideBy1Lakh = false,
  columnTypesOverride = {}, // Object with column names as keys and type strings as values: {columnName: "date" | "number" | "boolean" | "string"}
  enableCellEdit = false,
  editableColumns = { main: [], nested: {} },
  // Drawer props
  drawerTabs = [],
  onDrawerTabsChange,
  // Report props
  enableReport = false,
  dateColumn = null,
  chartColumns = [],
  chartHeight = 400,
  reportDataOverride = null,
  forceBreakdown = null,
  showProviderHeader = true,
  parentColumnName = undefined,
  nestedTableFieldName = undefined,
  forceEnableWrite = undefined, // Force enableWrite for nested drawer tables
  derivedColumnsMode = undefined, // Override for derived columns scope: 'main' | 'nested' (for sidebar nested tabs)
  derivedColumnsFieldName = undefined, // For mode 'nested', the nested table's field name
  // Parent refs for nested instances (to access parent's tracking data)
  parentOriginalNestedTableDataRef = undefined,
  parentNestedTableEditingDataRef = undefined,
  // Parent handler for nested instances (to use parent's state)
  parentHandleDrawerSaveProp = undefined,
  // Tab ID for nested instances (to update parent's editing buffer)
  nestedTableTabId = undefined,
  // Fallback columns when data is empty (e.g. from other rows' schema for nested tables)
  fallbackColumns = undefined,
  // Callback from parent so nested instance can trigger parent re-render after buffer update
  onNestedBufferChange = undefined,
  // Parent handler to add row at index 0 in nested table (for drawer nested table + button)
  parentHandleAddNestedRowAtZero = undefined,
  // Slots prop: per-slot config. When not provided, derived from flat props for nested/backward compat.
  slots: slotsProp,
  children
}) {
  // Derive slots from prop or flat props (for nested instances)
  const slots = useMemo(() => {
    if (slotsProp && typeof slotsProp === 'object' && Object.keys(slotsProp).length > 0) {
      return slotsProp;
    }
    return {
      main: {
        enableSort,
        enableFilter,
        enableSummation,
        enableGrouping,
        textFilterColumns,
        allowedColumns,
        percentageColumns,
        derivedColumns,
        groupFields,
        redFields,
        greenFields,
        enableDivideBy1Lakh,
        columnTypesOverride,
        enableCellEdit,
        editableColumns,
        drawerTabs,
        enableReport,
        dateColumn,
        chartColumns,
        chartHeight,
      },
    };
  }, [slotsProp, enableSort, enableFilter, enableSummation, enableGrouping, textFilterColumns, allowedColumns, percentageColumns, derivedColumns, groupFields, redFields, greenFields, enableDivideBy1Lakh, columnTypesOverride, enableCellEdit, editableColumns, drawerTabs, enableReport, dateColumn, chartColumns, chartHeight]);

  const slotIds = useMemo(() => Object.keys(slots), [slots]);
  // Effective config: per-slot props (slot override on flat). Shared props stay flat.
  // Shared (flat only): allowedColumns, columnTypesOverride, dateColumn, chartColumns, chartHeight, enableReport, enableDivideBy1Lakh
  // Per-slot (slot override): groupFields, derivedColumns, editableColumns, drawerTabs, redFields, greenFields,
  //   percentageColumns, textFilterColumns, enableSort, enableFilter, enableSummation, enableCellEdit
  const mainSlotConfig = useMemo(() => slots[slotIds[0]] || {}, [slots, slotIds]);
  const effectiveMainConfig = useMemo(() => ({
    enableSort: mainSlotConfig.enableSort ?? enableSort,
    enableFilter: mainSlotConfig.enableFilter ?? enableFilter,
    enableSummation: mainSlotConfig.enableSummation ?? enableSummation,
    enableGrouping: mainSlotConfig.enableGrouping ?? enableGrouping,
    textFilterColumns: mainSlotConfig.textFilterColumns ?? textFilterColumns,
    percentageColumns: mainSlotConfig.percentageColumns ?? percentageColumns,
    derivedColumns: mainSlotConfig.derivedColumns ?? derivedColumns,
    groupFields: mainSlotConfig.groupFields ?? groupFields,
    redFields: mainSlotConfig.redFields ?? redFields,
    greenFields: mainSlotConfig.greenFields ?? greenFields,
    enableCellEdit: mainSlotConfig.enableCellEdit ?? enableCellEdit,
    editableColumns: mainSlotConfig.editableColumns ?? editableColumns,
    drawerTabs: mainSlotConfig.drawerTabs ?? drawerTabs,
  }), [mainSlotConfig, enableSort, enableFilter, enableSummation, enableGrouping, textFilterColumns, percentageColumns, derivedColumns, groupFields, redFields, greenFields, enableCellEdit, editableColumns, drawerTabs]);
  const [preFilterValues, setPreFilterValues] = useState({});
  const [filterSortSidebarVisible, setFilterSortSidebarVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState(null);
  const [isApplyingFilterSort, setIsApplyingFilterSort] = useState(false);
  const [columnGroupBy, setColumnGroupBy] = useState('values');
  const [breakdownType, setBreakdownType] = useState('month');
  const [enableBreakdown, setEnableBreakdown] = useState(forceBreakdown ?? false);

  const queryExecution = useQueryExecution({
    dataSourceProp,
    selectedQueryKeyProp,
    offlineData,
    onError,
    onDataChange,
    onVariablesChange,
    onExecutingQueryChange,
    onSelectedQueryKeyChange,
    onLoadingDataChange,
    variableOverrides,
    searchTerm,
    sortConfig,
  });
  const {
    dataSource,
    selectedQueryKey,
    executingQuery,
    processedData,
    monthRange,
    setMonthRange,
    hasMonthSupport,
    currentQueryDoc,
    lastUpdatedAt,
    offlineDataExecuted,
    runQuery,
    checkIndexedDBAndLoadData,
    availableQueryKeys,
    formatLastUpdatedDate,
  } = queryExecution;

  // Mobile detection for responsive Switch sizing
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const checkMobile = () => {
      const windowWidth = window.innerWidth;
      const isMobileNow = windowWidth < 768;
      setIsMobile(isMobileNow);
    };

    // Check immediately
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Table operation state (needed before pipeline for hook options)
  // When multi-slot (slotIds.length > 1), use per-slot maps; otherwise flat state for backward compat
  const isMultiSlot = slotIds.length > 1;
  const [tableFilters, setTableFilters] = useState({});
  const [tableSortMeta, setTableSortMeta] = useState([]);
  const [tablePagination, setTablePagination] = useState({ first: 0, rows: 10 });
  const [tableExpandedRows, setTableExpandedRows] = useState(null);
  const [tableVisibleColumns, setTableVisibleColumns] = useState(visibleColumnsProp || []);
  const [tableFiltersBySlot, setTableFiltersBySlot] = useState({});
  const [tableSortMetaBySlot, setTableSortMetaBySlot] = useState({});
  const [tablePaginationBySlot, setTablePaginationBySlot] = useState({});
  const reportDataRef = useRef(null);
  // Pipeline must see current reportData; ref is updated in useEffect so it's one render behind.
  // Sync reportData into state so useDataPipeline re-runs when report is ready (avoids "No data available").
  const [reportDataForPipeline, setReportDataForPipeline] = useState(null);

  const computedFallbackColumns = useMemo(() => {
    if (fallbackColumns && isArray(fallbackColumns) && fallbackColumns.length > 0) return fallbackColumns;
    if (parentColumnName) {
      const nestedCols = effectiveMainConfig.editableColumns?.nested?.[parentColumnName];
      if (nestedCols && isArray(nestedCols) && nestedCols.length > 0) return nestedCols;
      return undefined;
    }
    const mainCols = effectiveMainConfig.editableColumns?.main;
    const allowed = allowedColumns;
    if (mainCols?.length) return mainCols;
    if (allowed?.length) return allowed;
    return undefined;
  }, [fallbackColumns, parentColumnName, effectiveMainConfig.editableColumns, allowedColumns]);

  const slotStateBySlot = useMemo(() => {
    const bySlot = {};
    for (const sid of slotIds) {
      bySlot[sid] = {
        tableFilters: isMultiSlot ? (tableFiltersBySlot[sid] ?? {}) : tableFilters,
        tableSortMeta: isMultiSlot ? (tableSortMetaBySlot[sid] ?? []) : tableSortMeta,
        tablePagination: isMultiSlot ? (tablePaginationBySlot[sid] ?? { first: 0, rows: 10 }) : tablePagination,
      };
    }
    return bySlot;
  }, [slotIds, isMultiSlot, tableFiltersBySlot, tableSortMetaBySlot, tablePaginationBySlot, tableFilters, tableSortMeta, tablePagination]);

  const pipeline = useMultiSlotPipeline({
    dataSource,
    processedData,
    selectedQueryKey,
    offlineData,
    offlineDataExecuted,
    fallbackColumns: computedFallbackColumns,
    isAdminMode,
    salesTeamColumn,
    salesTeamValues,
    hqColumn,
    hqValues,
    preFilterValues,
    currentQueryDoc,
    searchTerm,
    sortConfig,
    columnTypesOverride,
    tableFilters,
    groupFields: effectiveMainConfig.groupFields,
    tablePagination,
    tableSortMeta,
    enableFilter: effectiveMainConfig.enableFilter,
    enableSort: effectiveMainConfig.enableSort,
    enableBreakdown,
    reportData: reportDataForPipeline,
    allowedColumns,
    percentageColumns: effectiveMainConfig.percentageColumns,
    derivedColumns: effectiveMainConfig.derivedColumns,
    textFilterColumns: effectiveMainConfig.textFilterColumns,
    dateColumn,
    derivedColumnsMode: derivedColumnsMode ?? 'main',
    derivedColumnsFieldName: derivedColumnsFieldName ?? null,
    useOfflineDataAsTableDataSource: !!(nestedTableTabId && parentNestedTableEditingDataRef),
    slots,
    slotIds,
    slotStateBySlot,
  });

  const pipelinesBySlot = pipeline.pipelinesBySlot ?? {};
  const mainPipeline = pipelinesBySlot[slotIds[0]] ?? pipeline;
  const {
    rawTableData,
    preFilteredData,
    tableData,
    searchSortSortedData,
    filteredData,
    groupedData,
    sortedData,
    paginatedData,
    addEditingKeysToRows,
    mainTableEditingDataRefEarly,
    setTableDataUpdateTrigger,
    effectiveGroupFields,
    sortFieldType,
  } = {
    ...pipeline,
    filteredData: mainPipeline?.filteredData ?? pipeline.filteredData,
    groupedData: mainPipeline?.groupedData ?? pipeline.groupedData,
    sortedData: mainPipeline?.sortedData ?? pipeline.sortedData,
    paginatedData: mainPipeline?.paginatedData ?? pipeline.paginatedData,
    effectiveGroupFields: mainPipeline?.effectiveGroupFields ?? pipeline.effectiveGroupFields,
  };

  // runQuery comes from useQueryExecution

  // Sync visibleColumns from prop
  useEffect(() => {
    if (visibleColumnsProp !== null && visibleColumnsProp !== undefined) {
      setTableVisibleColumns(visibleColumnsProp);
    }
  }, [visibleColumnsProp]);

  // Access parent context to get handleDrawerSave for nested drawer tables
  const parentSlotId = useSlotId() ?? 'main';
  const parentContext = useContext(TableOperationsContext);
  const parentSlotData = parentContext?.rawData !== undefined ? parentContext : parentContext?.[parentSlotId];
  const parentHandleDrawerSave = parentHandleDrawerSaveProp || parentSlotData?.handleDrawerSave;

  // Filter/Sort worker state (declared early for use in useMemo hooks)
  const filterSortWorkerRef = useRef(null);
  const filterSortWorkerInstanceRef = useRef(null);
  const filterSortComputationIdRef = useRef(0);
  const [workerComputedData, setWorkerComputedData] = useState(null);

  // Drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerData, setDrawerData] = useState([]);
  const [activeDrawerTabIndex, setActiveDrawerTabIndex] = useState(0);
  const [clickedDrawerValues, setClickedDrawerValues] = useState({ outerValue: null, innerValue: null });
  const [drawerHeaderTitle, setDrawerHeaderTitle] = useState(null);
  const [drawerTableOptions, setDrawerTableOptions] = useState(null);
  const [, setDrawerJsonTables] = useState(null); // Store nested JSON tables for drawer
  
  // Change tracking for nested tables
  // Map structure: tabId -> { originalData: [...], parentRowData: {...}, nestedTableFieldName: string, parentRowEditingKey: string }
  // Use parent refs if provided (for nested instances), otherwise create own refs
  const originalNestedTableDataRef = parentOriginalNestedTableDataRef || useRef(new Map());
  const nestedTableDataRefsRef = useRef(new Map()); // Store refs to nested DataProviderNew instances to access current data
  const nestedTableEditingDataRef = parentNestedTableEditingDataRef || useRef(new Map()); // Track current editing data per tab (renamed from currentNestedTableDataRef for clarity)

  // Main table buffer state management
  const mainTableOriginalDataRef = useRef([]); // Original buffer (baseline)
  // Use the early ref we created
  const mainTableEditingDataRef = mainTableEditingDataRefEarly; // Editing buffer (working copy)
  const [mainTableEditingData, setMainTableEditingData] = useState([]); // Editing buffer state for reactivity

  // Debounced derived-column recompute for the edited row only
  const derivedRecomputeTimerRef = useRef(null);
  const pendingDerivedRecomputeKeyRef = useRef(null);

  // Parent re-render when nested table buffer is updated (so nested tab gets new tabDataSource)
  const [nestedTableUpdateCounter, setNestedTableUpdateCounter] = useState(0);
  const handleNestedBufferChange = useCallback(() => setNestedTableUpdateCounter((v) => v + 1), []);

  // Selected row in main table (for sidebar form editing) - only used by root provider
  const [selectedRowData, setSelectedRowData] = useState(null);

  // Form buffer (same pattern as nested table): original = baseline, editing = working copy
  const formOriginalRowRef = useRef(null);
  const [formEditingRow, setFormEditingRow] = useState(null);
  const formEditingRowRef = useRef(null);
  formEditingRowRef.current = formEditingRow;

  // Main table save diff dialog (show diff before confirming save)
  const [saveDiffDialogVisible, setSaveDiffDialogVisible] = useState(false);
  const [saveDiffContent, setSaveDiffContent] = useState([]);
  // Bump when we persist so hasMainTableChanges recomputes and Cancel hides
  const [mainTableOriginalVersion, setMainTableOriginalVersion] = useState(0);

  // Sync mainTableEditingData state with the ref for reactivity
  // Also update the early ref so tableData can pick it up
  // NOTE: We don't increment version here because propagateDrawerSaveToMain already does it
  // and we don't want double increments causing excessive recalculations
  useEffect(() => {
    if (mainTableEditingData && isArray(mainTableEditingData) && !isEmpty(mainTableEditingData)) {
      mainTableEditingDataRef.current = mainTableEditingData;
      mainTableEditingDataRefEarly.current = mainTableEditingData;
    } else if (!mainTableEditingData || !isArray(mainTableEditingData) || isEmpty(mainTableEditingData)) {
      // Clear refs if state is empty
      mainTableEditingDataRef.current = [];
      mainTableEditingDataRefEarly.current = [];
    }
  }, [mainTableEditingData]);

  // When dataSource or selectedQueryKey changes, clear editing buffer so tableData falls back to preFilteredData (stale buffer blocks data flow)
  // Only clear when values actually transition (not on initial mount with same values - avoids clearing during offline init)
  const prevDataSourceKeyRef = useRef(null);
  useEffect(() => {
    const key = `${dataSource}|${selectedQueryKey}`;
    const prevKey = prevDataSourceKeyRef.current;
    prevDataSourceKeyRef.current = key;
    if (prevKey !== null && prevKey !== key) {
      if (derivedRecomputeTimerRef.current) {
        clearTimeout(derivedRecomputeTimerRef.current);
        derivedRecomputeTimerRef.current = null;
      }
      pendingDerivedRecomputeKeyRef.current = null;
      mainTableEditingDataRefEarly.current = [];
      mainTableEditingDataRef.current = [];
      setMainTableEditingData([]);
      setTableDataUpdateTrigger((t) => t + 1);
    }
  }, [dataSource, selectedQueryKey]);

  // When groupFields changes, clear buffer so pipeline re-groups from flat data (enables different grouping levels)
  const prevGroupFieldsRef = useRef(null);
  useEffect(() => {
    const gf = effectiveMainConfig.groupFields;
    const prev = prevGroupFieldsRef.current;
    prevGroupFieldsRef.current = gf;
    if (prev !== null && prev !== gf) {
      const prevStr = isArray(prev) ? prev.join(',') : String(prev);
      const currStr = isArray(gf) ? gf.join(',') : String(gf);
      if (prevStr !== currStr) {
        mainTableEditingDataRefEarly.current = [];
        mainTableEditingDataRef.current = [];
        setMainTableEditingData([]);
        setTableDataUpdateTrigger((t) => t + 1);
      }
    }
  }, [effectiveMainConfig.groupFields]);

  // Ensure at least one tab exists
  useEffect(() => {
    const tabs = effectiveMainConfig.drawerTabs;
    if (!tabs || tabs.length === 0) {
      if (onDrawerTabsChange) {
        onDrawerTabsChange([{ id: `tab-${Date.now()}`, name: '', outerGroup: null, innerGroup: null }]);
      }
    }
  }, [effectiveMainConfig.drawerTabs, onDrawerTabsChange]);

  // Clear debounced derived recompute timer on unmount
  useEffect(() => {
    return () => {
      if (derivedRecomputeTimerRef.current) {
        clearTimeout(derivedRecomputeTimerRef.current);
        derivedRecomputeTimerRef.current = null;
      }
      pendingDerivedRecomputeKeyRef.current = null;
    };
  }, []);

  // Notify parent when raw data changes (for Auth Control in DataTableControls)
  useEffect(() => {
    if (onRawDataChange) {
      onRawDataChange(rawTableData);
    }
  }, [rawTableData, onRawDataChange]);

  // Initialize mainTableEditingData with preFilteredData when it first loads (if empty)
  // Skip when sortedData already has data - prevents overwriting buffer with flat data after pipeline produced grouped data
  useEffect(() => {
    if (preFilteredData && isArray(preFilteredData) && !isEmpty(preFilteredData)) {
      const mainEmpty = !mainTableEditingData || !isArray(mainTableEditingData) || isEmpty(mainTableEditingData);
      const sortedHasData = isArray(sortedData) && sortedData.length > 0;
      if (mainEmpty && !sortedHasData) {
        const dataWithKeys = addEditingKeysToRows(preFilteredData);
        setMainTableEditingData(dataWithKeys);
        mainTableEditingDataRef.current = dataWithKeys;
      }
    }
  }, [preFilteredData, mainTableEditingData, addEditingKeysToRows, sortedData]);

  // Note: onTableDataChange is called later with final sortedData (line 2904)
  // which includes both searchFields/sortFields sorting and tableSortMeta sorting

  // Sync function that retriggers query execution
  const handleSync = useCallback(async () => {
    if (!dataSource) return; // Skip for offline mode

    // For month-supported queries, require monthRange
    if (hasMonthSupport && (!monthRange || !Array.isArray(monthRange) || monthRange.length !== 2)) {
      return; // Don't execute if month range is required but not set
    }

    // Check IndexedDB first, then API if needed (same logic as initial load)
    if (currentQueryDoc) {
      await checkIndexedDBAndLoadData(dataSource, currentQueryDoc, monthRange);
    } else {
      // Fallback to direct API call if no queryDoc available
      await runQuery(dataSource, true);
    }
  }, [dataSource, hasMonthSupport, monthRange, currentQueryDoc, checkIndexedDBAndLoadData, runQuery]);

  // Handle clearing cached data for a specific month range (or all data for non-month queries) and syncing
  const handleClearMonthRangeCache = useCallback(async () => {
    if (!dataSource) return; // Skip for offline mode
    if (!currentQueryDoc || currentQueryDoc.clientSave !== true) return;

    try {
      const queryId = dataSource;
      const isMonthQuery = currentQueryDoc.month === true;

      // Get the query database
      const queryDb = await indexedDBService.getQueryDatabase(queryId, currentQueryDoc);
      const existingStores = queryDb.tables.map((table) => table.name);

      if (isMonthQuery) {
        // For month queries: clear stores for the selected month range
        if (!monthRange || !Array.isArray(monthRange) || monthRange.length !== 2) {
          return;
        }

        const [startDate, endDate] = monthRange;

        // Generate month prefixes for the range
        const monthPrefixes = generateMonthRangeArray(startDate, endDate);

        if (monthPrefixes.length === 0) {
          return;
        }

        // Clear all stores that match the month prefixes
        for (const prefix of monthPrefixes) {
          // Find all stores that start with this prefix
          const matchingStores = existingStores.filter(storeName =>
            storeName.startsWith(`${prefix}_`)
          );

          // Clear each matching store
          for (const storeName of matchingStores) {
            try {
              await queryDb.table(storeName).clear();
            } catch (error) {
              console.error(`Error clearing store "${storeName}" for queryId ${queryId}:`, error);
            }
          }
        }

        // Also clear the index entries for the selected months
        // Skip if queryId is null (offline mode / drawer tables)
        if (queryId) {
          try {
            const indexResult = await indexedDBService.getQueryIndexResult(queryId);
            if (indexResult && indexResult.result) {
              const indexData = indexResult.result;

              // Check if index is an object with month keys (month query structure)
              if (typeof indexData === 'object' && !Array.isArray(indexData) && indexData !== null) {
                // Remove the selected month keys from the index
                const updatedIndex = { ...indexData };
                let hasChanges = false;

                for (const prefix of monthPrefixes) {
                  if (prefix in updatedIndex) {
                    delete updatedIndex[prefix];
                    hasChanges = true;
                  }
                }

                // If there are remaining months, save the updated index
                // If no months left, clear the entire index entry
                if (hasChanges) {
                  const remainingKeys = Object.keys(updatedIndex);
                  if (remainingKeys.length > 0) {
                    // Save updated index with remaining months
                    await indexedDBService.saveQueryIndexResult(queryId, updatedIndex, currentQueryDoc);
                  } else {
                    // No months left, clear the entire index
                    await indexedDBService.clearQueryIndexResult(queryId);
                  }
                }
              }
            }
          } catch (indexError) {
            console.error(`Error clearing index for queryId ${queryId}:`, indexError);
          }
        }
      } else {
        // For non-month queries: clear all stores (no month prefix)
        for (const storeName of existingStores) {
          // Only clear stores that don't have a month prefix (YYYY-MM_ format)
          // Month prefix stores start with YYYY-MM_ (7 chars + underscore = 8 chars minimum)
          const hasMonthPrefix = storeName.length >= 8 && /^\d{4}-\d{2}_/.test(storeName);
          if (!hasMonthPrefix) {
            try {
              await queryDb.table(storeName).clear();
            } catch (error) {
              console.error(`Error clearing store "${storeName}" for queryId ${queryId}:`, error);
            }
          }
        }

        // Also clear the index entry for non-month queries
        // Skip if queryId is null (offline mode / drawer tables)
        if (queryId) {
          try {
            await indexedDBService.clearQueryIndexResult(queryId);
          } catch (indexError) {
            console.error(`Error clearing index for queryId ${queryId}:`, indexError);
          }
        }
      }

      // After clearing, call sync to reload data
      await handleSync();
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }, [dataSource, monthRange, currentQueryDoc, handleSync]);

  // Column detection and type analysis (moved from DataTable)
  const columns = useMemo(() => {
    if (!tableData || !Array.isArray(tableData) || isEmpty(tableData)) {
      return [];
    }
    // Exclude __nestedTables__ from columns (it's UI-only metadata, not a data column)
    return uniq(flatMap(tableData, (item) =>
      item && typeof item === 'object' ? getDataKeys(item).filter(key => key !== '__nestedTables__') : []
    ));
  }, [tableData]);

  // Compute array fields separately (will be used to filter columns)
  const arrayFieldsForColumnFilter = useMemo(() => {
    // Check both rawTableData and tableData (which includes user edits)
    // This ensures array fields are detected even after save operations
    const dataToCheck = tableData && !isEmpty(tableData) ? tableData : rawTableData;
    if (!isEmpty(dataToCheck) && isArray(dataToCheck)) {
      const sampleData = take(dataToCheck, 10);
      const arrayFields = new Set();
      
      sampleData.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        for (const [fieldName, value] of Object.entries(row)) {
          // Skip special fields
          if (fieldName.startsWith('__')) continue;
          
          // Check if value is an array of objects or JSON array string
          if (isJsonArrayOfObjectsString(value)) {
            arrayFields.add(fieldName);
          }
        }
      });
      
      return arrayFields;
    }
    return new Set();
  }, [rawTableData, tableData, columns]);

  // Filter columns based on allowedColumns (if provided)
  // This ensures only developer-approved columns are available throughout the app
  // Also exclude array fields (they will be shown as nested tables instead)
  const filteredColumns = useMemo(() => {
    let result = columns;
    if (isEmpty(result) && computedFallbackColumns && isArray(computedFallbackColumns) && computedFallbackColumns.length > 0) {
      result = computedFallbackColumns.filter((c) => c && typeof c === 'string' && !String(c).startsWith('__'));
    }
    const allowed = allowedColumns; // shared
    const derived = effectiveMainConfig.derivedColumns;
    
    // Filter by allowedColumns if provided
    if (allowed && Array.isArray(allowed) && allowed.length > 0) {
      const allowedSet = new Set(allowed);
      result = result.filter(col => allowedSet.has(col));
    }
    
    // Exclude array fields (they will be shown as nested tables, not as columns)
    if (arrayFieldsForColumnFilter.size > 0) {
      result = result.filter(col => !arrayFieldsForColumnFilter.has(col));
    }

    // Include derived columns at their specified position (position = 0-based index; omit to append at end)
    const mode = derivedColumnsMode ?? 'main';
    const fieldName = derivedColumnsFieldName ?? null;
    result = getOrderedColumnsWithDerived(result, derived || [], mode, fieldName);
    return result;
  }, [columns, computedFallbackColumns, allowedColumns, effectiveMainConfig.derivedColumns, arrayFieldsForColumnFilter, derivedColumnsMode, derivedColumnsFieldName]);

  // Column types computation (NEW FORMAT: { field_name: "boolean" | "number" | "date" | "string" })
  const columnTypes = useMemo(() => {
    const detectedTypes = {};
    if (isEmpty(tableData)) {
      return detectedTypes;
    }

    const sampleData = take(tableData, 100);

    filteredColumns.forEach((col) => {
      let numericCount = 0;
      let dateCount = 0;
      let booleanCount = 0;
      let binaryCount = 0;
      let nonNullCount = 0;

      sampleData.forEach((row) => {
        const value = getDataValue(row, col);
        if (!isNil(value)) {
          nonNullCount++;
          if (isBoolean(value)) {
            booleanCount++;
          } else if (value === 0 || value === 1 || value === '0' || value === '1') {
            binaryCount++;
          } else if (isDateLike(value)) {
            dateCount++;
          } else if (isNumericValue(value)) {
            numericCount++;
          }
        }
      });

      const isTrueBooleanColumn = nonNullCount > 0 && booleanCount > nonNullCount * 0.7;
      const isBinaryBooleanColumn = nonNullCount > 0 && binaryCount === nonNullCount && binaryCount >= 1;
      const isBooleanColumn = isTrueBooleanColumn || isBinaryBooleanColumn;

      let dateCountWithBinary = dateCount;
      if (!isBooleanColumn && binaryCount > 0) {
        sampleData.forEach((row) => {
          const value = getDataValue(row, col);
          if (!isNil(value) && (value === 0 || value === 1 || value === '0' || value === '1')) {
            if (isDateLike(value)) {
              dateCountWithBinary++;
            }
          }
        });
      }
      const isDateColumn = !isBooleanColumn && nonNullCount > 0 && dateCountWithBinary > nonNullCount * 0.7;

      let numericCountWithBinary = numericCount;
      if (!isBooleanColumn && !isDateColumn && binaryCount > 0) {
        numericCountWithBinary += binaryCount;
      }
      const isNumericColumn = !isBooleanColumn && !isDateColumn && nonNullCount > 0 && numericCountWithBinary > nonNullCount * 0.8;

      let detectedTypeString = "string";
      if (isBooleanColumn) {
        detectedTypeString = "boolean";
      } else if (isDateColumn) {
        detectedTypeString = "date";
      } else if (isNumericColumn) {
        detectedTypeString = "number";
      }

      detectedTypes[col] = detectedTypeString;
    });

    // Merge detected types with overrides and derived column types (overrides take precedence)
    const mainOverrides = getMainOverrides(columnTypesOverride); // shared
    const mergedTypes = { ...detectedTypes, ...mainOverrides };
    (effectiveMainConfig.derivedColumns || []).forEach((dc) => {
      if (dc.columnName && dc.columnType) {
        mergedTypes[dc.columnName] = dc.columnType;
      }
    });
    return mergedTypes;
  }, [tableData, filteredColumns, isNumericValue, columnTypesOverride, effectiveMainConfig.derivedColumns]);

  // JSON table columns (columns that have __nestedTables__) - for scalar editable columns filter
  const jsonTableColumns = useMemo(() => {
    if (!tableData || !isArray(tableData) || tableData.length === 0) return {};
    const jsonTableMap = {};
    const rowsWithNestedTables = tableData.filter(row => row && row.__nestedTables__ && isArray(row.__nestedTables__) && row.__nestedTables__.length > 0);
    rowsWithNestedTables.forEach(row => {
      if (row && row.__nestedTables__ && isArray(row.__nestedTables__)) {
        row.__nestedTables__.forEach(nestedTable => {
          const columnName = nestedTable.fieldName;
          if (columnName && !columnName.startsWith('__')) {
            if (!jsonTableMap[columnName]) jsonTableMap[columnName] = { fieldName: columnName, nestedTables: [] };
            let nestedColumns = [];
            if (nestedTable.data && isArray(nestedTable.data) && nestedTable.data.length > 0 && nestedTable.data[0] && typeof nestedTable.data[0] === 'object') {
              nestedColumns = Object.keys(nestedTable.data[0]).filter(key => !key.startsWith('__'));
            }
            const existing = jsonTableMap[columnName].nestedTables.find(nt => nt.fieldName === nestedTable.fieldName);
            if (!existing) {
              jsonTableMap[columnName].nestedTables.push({ fieldName: nestedTable.fieldName, title: nestedTable.title || nestedTable.fieldName, columns: nestedColumns });
            } else if (existing.columns.length === 0 && nestedColumns.length > 0) {
              existing.columns = nestedColumns;
            }
          }
        });
      }
    });
    if (rowsWithNestedTables.length === 0 && columns.length > 0) {
      const sampleRows = tableData.slice(0, Math.min(50, tableData.length));
      sampleRows.forEach(row => {
        if (!row || typeof row !== 'object') return;
        columns.forEach(columnName => {
          if (columnName.startsWith('__')) return;
          const columnValue = row[columnName];
          if (isArray(columnValue) && columnValue.length > 0) {
            const firstItem = columnValue[0];
            if (firstItem && typeof firstItem === 'object' && !isArray(firstItem)) {
              if (!jsonTableMap[columnName]) jsonTableMap[columnName] = { fieldName: columnName, nestedTables: [] };
              const cols = Object.keys(firstItem).filter(key => !key.startsWith('__'));
              const existing = jsonTableMap[columnName].nestedTables.find(nt => nt.fieldName === columnName);
              if (!existing) {
                jsonTableMap[columnName].nestedTables.push({
                  fieldName: columnName,
                  title: columnName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                  columns: cols
                });
              } else if (existing.columns.length === 0 && cols.length > 0) {
                existing.columns = cols;
              }
            }
          }
        });
      });
    }
    return jsonTableMap;
  }, [tableData, columns]);

  const editableMain = useMemo(() => Array.isArray(editableColumns) ? editableColumns : (editableColumns?.main || []), [editableColumns]);
  const scalarEditableColumns = useMemo(() => editableMain.filter(col => !jsonTableColumns[col]), [editableMain, jsonTableColumns]);

  // jsonArrayFields comes from useDataPipeline

  // Multiselect columns computation
  const multiselectColumns = useMemo(() => {
    if (!effectiveMainConfig.enableFilter) return [];
    // Get all string columns (non-numeric, non-boolean, non-date)
    const stringColumns = filteredColumns.filter(col => {
      const colType = columnTypes[col] || 'string';
      return colType === 'string';
    });
    // Remove textFilterColumns from string columns to get multiselect columns
    const textFilterSet = new Set(effectiveMainConfig.textFilterColumns);
    return stringColumns.filter(col => !textFilterSet.has(col));
  }, [filteredColumns, columnTypes, effectiveMainConfig.textFilterColumns, effectiveMainConfig.enableFilter]);

  // Percentage column helpers
  const hasPercentageColumns = useMemo(() => {
    const pct = effectiveMainConfig.percentageColumns;
    if (isEmpty(pct) || !isArray(pct)) {
      return false;
    }
    return pct.some(pc => pc.columnName && pc.columnName.trim() !== '');
  }, [effectiveMainConfig.percentageColumns]);

  const percentageColumnNames = useMemo(() => {
    const pct = effectiveMainConfig.percentageColumns;
    return hasPercentageColumns ? (pct || []).map(pc => pc.columnName).filter(Boolean) : [];
  }, [hasPercentageColumns, effectiveMainConfig.percentageColumns]);

  const isPercentageColumn = useCallback((columnName) => {
    const pct = effectiveMainConfig.percentageColumns;
    return hasPercentageColumns && pct && pct.some(pc => pc.columnName === columnName);
  }, [hasPercentageColumns, effectiveMainConfig.percentageColumns]);

  const getPercentageColumnValue = useCallback((rowData, columnName) => {
    const pct = effectiveMainConfig.percentageColumns;
    const config = pct && pct.find(pc => pc.columnName === columnName);
    if (!config || !config.targetField || !config.valueField) return null;
    const targetValue = getDataValue(rowData, config.targetField);
    const actualValue = getDataValue(rowData, config.valueField);
    const targetNum = isNumber(targetValue) ? targetValue : (isNil(targetValue) ? null : toNumber(targetValue));
    const actualNum = isNumber(actualValue) ? actualValue : (isNil(actualValue) ? null : toNumber(actualValue));
    if (!isNil(targetNum) && !isNil(actualNum) && !_isNaN(targetNum) && !_isNaN(actualNum) && _isFinite(targetNum) && _isFinite(actualNum) && targetNum !== 0) {
      return (actualNum / targetNum) * 100;
    }
    return null;
  }, [effectiveMainConfig.percentageColumns]);

  const getPercentageColumnSortFunction = useCallback((col) => {
    return (rowData1, rowData2) => {
      const val1 = getPercentageColumnValue(rowData1, col);
      const val2 = getPercentageColumnValue(rowData2, col);
      if (isNil(val1) && isNil(val2)) return 0;
      if (isNil(val1)) return 1;
      if (isNil(val2)) return -1;
      const num1 = isNumber(val1) ? val1 : toNumber(val1);
      const num2 = isNumber(val2) ? val2 : toNumber(val2);
      if (_isNaN(num1) && _isNaN(num2)) return 0;
      if (_isNaN(num1)) return 1;
      if (_isNaN(num2)) return -1;
      return num1 - num2;
    };
  }, [getPercentageColumnValue]);

  // Filter options computation
  const optionColumnValues = useMemo(() => {
    if (!effectiveMainConfig.enableFilter || isEmpty(tableData)) return {};
    const values = {};
    filteredColumns.forEach((col) => {
      const filteredForColumn = filter(tableData, (row) => {
        if (!row || typeof row !== 'object') return false;
        return every(columns, (otherCol) => {
          if (otherCol === col) return true;
          const filterObj = get(tableFilters, otherCol);
          if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;
          if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;
          const cellValue = getDataValue(row, otherCol);
          const filterValue = filterObj.value;
          const colType = columnTypes[otherCol] || 'string';
          const isMultiselectColumn = includes(multiselectColumns, otherCol);
          if (isMultiselectColumn && isArray(filterValue)) {
            return some(filterValue, (v) => {
              if (isNil(v) && isNil(cellValue)) return true;
              if (isNil(v) || isNil(cellValue)) return false;
              return v === cellValue || String(v) === String(cellValue);
            });
          }
          if (colType === 'boolean') {
            const cellIsTruthy = cellValue === true || cellValue === 1 || cellValue === '1';
            const cellIsFalsy = cellValue === false || cellValue === 0 || cellValue === '0';
            if (filterValue === true) {
              return cellIsTruthy;
            } else if (filterValue === false) {
              return cellIsFalsy;
            }
            return true;
          }
          if (colType === 'date') {
            return applyDateFilter(cellValue, filterValue);
          }
          if (colType === 'number') {
            const parsedFilter = parseNumericFilter(filterValue);
            return applyNumericFilter(cellValue, parsedFilter);
          }
          const strCell = toLower(String(cellValue ?? ''));
          const strFilter = toLower(String(filterValue));
          return includes(strCell, strFilter);
        });
      });
      const uniqueVals = uniq(filteredForColumn.map((row) => getDataValue(row, col)));
      const hasNull = some(uniqueVals, val => isNil(val));
      const nonNullVals = filter(uniqueVals, val => !isNil(val));
      const sortedNonNull = orderBy(nonNullVals);
      const options = [];
      if (hasNull) {
        options.push({ label: '(null)', value: null });
      }
      options.push(...sortedNonNull.map((val) => ({
        label: String(val),
        value: val,
      })));
      values[col] = options;
    });
    return values;
  }, [tableData, searchSortSortedData, multiselectColumns, tableFilters, filteredColumns, columnTypes, hasPercentageColumns, percentageColumnNames, isPercentageColumn, getPercentageColumnValue, effectiveMainConfig.enableFilter]);

  // filteredData comes from useDataPipeline

  // Report data computation state (using Web Worker)
  const reportWorkerRef = useRef(null);
  const reportWorkerInstanceRef = useRef(null); // Store actual worker instance for cleanup

  // Sync forced breakdown state if provided
  useEffect(() => {
    if (forceBreakdown === null || forceBreakdown === undefined) {
      return;
    }
    setEnableBreakdown(forceBreakdown);
  }, [forceBreakdown]);

  // Turn off enableBreakdown when enableReport is turned off (unless forced)
  useEffect(() => {
    if (!enableReport && (forceBreakdown === null || forceBreakdown === undefined)) {
      setEnableBreakdown(false);
    }
  }, [enableReport, forceBreakdown]);

  // Initialize filter/sort worker
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    const initializeFilterSortWorker = async () => {
      try {
        const worker = new Worker(new URL('../workers/filterSortWorker.js', import.meta.url), { type: 'module' });
        filterSortWorkerInstanceRef.current = worker;
        filterSortWorkerRef.current = Comlink.wrap(worker);
      } catch (error) {
        console.error('Failed to initialize filter/sort worker:', error);
        filterSortWorkerRef.current = null;
        filterSortWorkerInstanceRef.current = null;
      }
    };

    initializeFilterSortWorker();

    return () => {
      if (filterSortWorkerInstanceRef.current) {
        try {
          filterSortWorkerInstanceRef.current.terminate();
        } catch (error) {
          // Ignore cleanup errors
        }
        filterSortWorkerInstanceRef.current = null;
      }
      filterSortWorkerRef.current = null;
    };
  }, []);

  // Initialize report worker
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    const initializeWorker = async () => {
      try {
        const worker = new Worker(new URL('../workers/reportWorker.js', import.meta.url), { type: 'module' });
        reportWorkerInstanceRef.current = worker; // Store for cleanup
        reportWorkerRef.current = Comlink.wrap(worker);
      } catch (error) {
        console.error('Failed to initialize report worker:', error);
        reportWorkerRef.current = null;
        reportWorkerInstanceRef.current = null;
      }
    };

    initializeWorker();

    return () => {
      // Cleanup worker on unmount
      if (reportWorkerInstanceRef.current) {
        try {
          reportWorkerInstanceRef.current.terminate();
        } catch (error) {
          // Ignore cleanup errors
        }
        reportWorkerInstanceRef.current = null;
      }
      reportWorkerRef.current = null;
    };
  }, []);

  // sortFieldType and effectiveGroupFields come from useDataPipeline

  const alwaysAllowedKeys = useMemo(() => new Set(['id', 'period', 'periodLabel', 'isNestedRow']), []);

  const allowedFieldSet = useMemo(() => {
    const allowed = allowedColumns; // shared
    const dateCol = dateColumn; // shared
    if (!Array.isArray(allowed) || allowed.length === 0) {
      return null;
    }

    const set = new Set();

    allowed.forEach((col) => {
      if (col) {
        set.add(col);
      }
    });

    filteredColumns.forEach((col) => {
      if (col) {
        set.add(col);
      }
    });

    effectiveGroupFields.forEach((field) => {
      if (field) {
        set.add(field);
      }
    });

    if (dateCol) {
      set.add(dateCol);
    }

    percentageColumnNames.forEach((col) => {
      if (col) {
        set.add(col);
      }
    });

    return set;
  }, [allowedColumns, dateColumn, filteredColumns, effectiveGroupFields, percentageColumnNames]);

  const sanitizeRowsByAllowedColumns = useCallback((rows) => {
    if (!allowedFieldSet || !Array.isArray(rows)) {
      return rows;
    }

    const sanitizeRow = (row) => {
      if (!row || typeof row !== 'object') {
        return row;
      }

      const sanitizedRow = {};
      Object.keys(row).forEach((key) => {
        if (
          allowedFieldSet.has(key) ||
          key.startsWith('__') ||
          alwaysAllowedKeys.has(key)
        ) {
          const value = row[key];
          if (key === '__groupRows__' && Array.isArray(value)) {
            sanitizedRow[key] = sanitizeRowsByAllowedColumns(value);
          } else {
            sanitizedRow[key] = value;
          }
        }
      });
      return sanitizedRow;
    };

    return rows.map((row) => sanitizeRow(row));
  }, [allowedFieldSet, alwaysAllowedKeys]);

  const reportInputData = useMemo(() => sanitizeRowsByAllowedColumns(filteredData), [filteredData, sanitizeRowsByAllowedColumns]);

  const drawerReportInputData = useMemo(() => sanitizeRowsByAllowedColumns(drawerData), [drawerData, sanitizeRowsByAllowedColumns]);

  // Main table report data computation using shared hook
  const { reportData: rawReportData, isComputingReport: internalIsComputingReport } = useReportData(
    enableBreakdown,
    reportInputData,
    effectiveGroupFields,
    dateColumn,
    breakdownType,
    columnTypes,
    sortConfig,
    sortFieldType,
    reportWorkerRef
  );

  // Drawer report data computation using shared hook
  // Get active tab's group fields for drawer report computation
  const effectiveDrawerTabs = effectiveMainConfig.drawerTabs || [];
  const activeDrawerTab = effectiveDrawerTabs.length > 0
    ? effectiveDrawerTabs[Math.min(activeDrawerTabIndex, Math.max(0, effectiveDrawerTabs.length - 1))]
    : null;
  // Convert drawer tab's outerGroup/innerGroup to groupFields array format
  const drawerGroupFields = useMemo(() => {
    if (!activeDrawerTab) return [];
    const fields = [];
    if (activeDrawerTab.outerGroup) fields.push(activeDrawerTab.outerGroup);
    if (activeDrawerTab.innerGroup) fields.push(activeDrawerTab.innerGroup);
    // Support groupFields if provided (new format)
    if (activeDrawerTab.groupFields && Array.isArray(activeDrawerTab.groupFields)) {
      return activeDrawerTab.groupFields;
    }
    return fields;
  }, [activeDrawerTab]);

  const { reportData: rawDrawerReportData } = useReportData(
    enableBreakdown,
    drawerReportInputData,
    drawerGroupFields,
    dateColumn,
    breakdownType,
    columnTypes,
    sortConfig,
    sortFieldType,
    reportWorkerRef
  );

  const baseReportData = reportDataOverride || rawReportData;

  const reportData = useMemo(() => {
    if (!baseReportData || !allowedFieldSet) {
      return baseReportData;
    }

    if (!Array.isArray(baseReportData.metrics)) {
      return baseReportData;
    }

    const filteredMetrics = baseReportData.metrics.filter(metric => allowedFieldSet.has(metric));

    if (filteredMetrics.length === baseReportData.metrics.length) {
      return baseReportData;
    }

    return {
      ...baseReportData,
      metrics: filteredMetrics
    };
  }, [baseReportData, allowedFieldSet]);

  const reportDataWithDerived = useMemo(() => {
    const derived = effectiveMainConfig.derivedColumns;
    if (!reportData || !derived?.length) return reportData;
    const tableDataDerived = reportData.tableData
      ? applyDerivedColumns(reportData.tableData, derived, { mode: 'report', getDataValue })
      : reportData.tableData;
    const nestedTableDataDerived = reportData.nestedTableData
      ? Object.fromEntries(
          Object.entries(reportData.nestedTableData).map(([k, v]) => [
            k,
            applyDerivedColumns(v, derived, { mode: 'report', getDataValue }),
          ])
        )
      : reportData.nestedTableData;
    return {
      ...reportData,
      tableData: tableDataDerived,
      nestedTableData: nestedTableDataDerived,
    };
  }, [reportData, effectiveMainConfig.derivedColumns]);

  useEffect(() => {
    reportDataRef.current = reportDataWithDerived;
    setReportDataForPipeline(reportDataWithDerived);
  }, [reportDataWithDerived]);

  const isComputingReport = reportDataOverride ? false : internalIsComputingReport;

  const drawerReportData = useMemo(() => {
    if (!rawDrawerReportData || !allowedFieldSet) {
      return rawDrawerReportData;
    }

    if (!Array.isArray(rawDrawerReportData.metrics)) {
      return rawDrawerReportData;
    }

    const filteredMetrics = rawDrawerReportData.metrics.filter(metric => allowedFieldSet.has(metric));

    if (filteredMetrics.length === rawDrawerReportData.metrics.length) {
      return rawDrawerReportData;
    }

    return {
      ...rawDrawerReportData,
      metrics: filteredMetrics
    };
  }, [rawDrawerReportData, allowedFieldSet]);

  const drawerReportDataWithDerived = useMemo(() => {
    const derived = effectiveMainConfig.derivedColumns;
    if (!drawerReportData || !derived?.length) return drawerReportData;
    const tableDataDerived = drawerReportData.tableData
      ? applyDerivedColumns(drawerReportData.tableData, derived, { mode: 'report', getDataValue })
      : drawerReportData.tableData;
    const nestedTableDataDerived = drawerReportData.nestedTableData
      ? Object.fromEntries(
          Object.entries(drawerReportData.nestedTableData).map(([k, v]) => [
            k,
            applyDerivedColumns(v, derived, { mode: 'report', getDataValue }),
          ])
        )
      : drawerReportData.nestedTableData;
    return {
      ...drawerReportData,
      tableData: tableDataDerived,
      nestedTableData: nestedTableDataDerived,
    };
  }, [drawerReportData, effectiveMainConfig.derivedColumns]);

  const shouldShowDrawerReport = enableBreakdown && !!drawerReportDataWithDerived;

  // groupDataRecursive, extractJsonNestedTablesFromData, groupedData, filteredDataWithNestedTables, dataForSorting, sortedData, paginatedData come from useDataPipeline

  // Compute filter/sort/group using worker when applying
  useEffect(() => {
    if (!isApplyingFilterSort) {
      setWorkerComputedData(null);
      return;
    }

    // Only use worker if it's available and we have data
    if (!filterSortWorkerRef.current || !tableData || isEmpty(tableData)) {
      return;
    }

    const computationId = ++filterSortComputationIdRef.current;

    const computeWithWorker = async () => {
      try {
        if (!filterSortWorkerRef.current) {
          // Fallback to synchronous computation
          return;
        }

        // Convert preFilterValues to tableFilters format
        const filtersForWorker = {};
        Object.keys(preFilterValues || {}).forEach(col => {
          filtersForWorker[col] = { value: preFilterValues[col] };
        });

        const result = await filterSortWorkerRef.current.computeFilterSortGrouped(tableData, {
          tableFilters: filtersForWorker,
          columns,
          columnTypes,
          multiselectColumns,
          hasPercentageColumns,
          percentageColumns: effectiveMainConfig.percentageColumns,
          percentageColumnNames,
          enableFilter: effectiveMainConfig.enableFilter,
          searchTerm,
          searchFields: currentQueryDoc?.searchFields || {},
          sortConfig,
          sortFieldType,
          tableSortMeta,
          enableSort: effectiveMainConfig.enableSort,
          effectiveGroupFields,
          derivedColumnNames: getDerivedColumnNames(effectiveMainConfig.derivedColumns || [], 'main'),
          // Note: isPercentageColumnFn removed - worker uses percentageColumns array instead
        });

        // Apply derived columns to grouped data (including group summary rows)
        const derivedCols = effectiveMainConfig.derivedColumns;
        const groupedDataWithDerived =
          result.groupedData && derivedCols?.length
            ? applyDerivedColumns(result.groupedData, derivedCols, {
                mode: 'main',
                getDataValue,
              })
            : result.groupedData;

        // Only update if this is still the latest computation
        if (computationId === filterSortComputationIdRef.current) {
          setWorkerComputedData({
            ...result,
            groupedData: groupedDataWithDerived,
          });
          setIsApplyingFilterSort(false);
        }
      } catch (error) {
        console.error('Filter/sort worker computation error:', error);
        if (computationId === filterSortComputationIdRef.current) {
          setIsApplyingFilterSort(false);
        }
      }
    };

    computeWithWorker();
  }, [isApplyingFilterSort, sortConfig, preFilterValues, tableData, columns, columnTypes, multiselectColumns, hasPercentageColumns, effectiveMainConfig.percentageColumns, percentageColumnNames, effectiveMainConfig.enableFilter, searchTerm, currentQueryDoc, sortFieldType, tableSortMeta, effectiveMainConfig.enableSort, effectiveGroupFields, isPercentageColumn, effectiveMainConfig.derivedColumns]);

  // Track when filter/sort computation is complete - callback-based approach with ref guard
  const hasClearedLoadingRef = useRef(false);

  // Watch sortedData changes and clear loading when ready (fallback for non-worker path)
  useEffect(() => {
    if (isApplyingFilterSort && sortedData && !hasClearedLoadingRef.current && !workerComputedData) {
      // sortedData is ready - clear loading immediately
      hasClearedLoadingRef.current = true;

      // Use requestAnimationFrame for immediate UI update
      requestAnimationFrame(() => {
        setIsApplyingFilterSort(false);
      });
    }

    // Reset guard when not applying
    if (!isApplyingFilterSort) {
      hasClearedLoadingRef.current = false;
    }
  }, [sortedData, isApplyingFilterSort, workerComputedData]);

  // Track previous sortedData to prevent unnecessary re-initialization
  const previousSortedDataRef = useRef(null);
  const previousSortedDataHashRef = useRef(null);
  // When we add a new row via drawer, sortedData updates from pipeline - skip re-init so original stays unchanged
  const skipNextInitFromSortedDataRef = useRef(false);

  // Initialize buffers from sortedData (final processed data after all preprocessing)
  useEffect(() => {
    if (skipNextInitFromSortedDataRef.current) {
      skipNextInitFromSortedDataRef.current = false;
      previousSortedDataRef.current = sortedData;
      const firstKey = sortedData?.length ? (sortedData[0]?.__editingKey__ || sortedData[0]?.id || 'no_key') : null;
      const lastKey = sortedData?.length ? (sortedData[sortedData.length - 1]?.__editingKey__ || sortedData[sortedData.length - 1]?.id || 'no_key') : null;
      previousSortedDataHashRef.current = sortedData?.length ? `${sortedData.length}_${firstKey}_${lastKey}` : '0_empty';
      return;
    }
    if (!isArray(sortedData)) {
      const currentEditingLength = mainTableEditingDataRef.current.length;
      const currentOriginalLength = mainTableOriginalDataRef.current.length;
      if (currentEditingLength > 0 || currentOriginalLength > 0) {
        mainTableOriginalDataRef.current = [];
        mainTableEditingDataRef.current = [];
        setMainTableEditingData([]);
        previousSortedDataRef.current = null;
        previousSortedDataHashRef.current = null;
      }
      return;
    }

    // Create a hash of sortedData to detect actual changes (use length and editing keys if available)
    let dataHash;
    try {
      if (sortedData.length === 0) {
        dataHash = `0_empty`;
      } else {
        // Use editing keys if available, otherwise use a simple identifier
        const firstKey = sortedData[0]?.__editingKey__ || sortedData[0]?.id || 'no_key';
        const lastKey = sortedData[sortedData.length - 1]?.__editingKey__ || sortedData[sortedData.length - 1]?.id || 'no_key';
        dataHash = `${sortedData.length}_${firstKey}_${lastKey}`;
      }
    } catch (e) {
      dataHash = `error_${sortedData.length}`;
    }

    // Only re-initialize if data actually changed (different reference or different hash)
    if (previousSortedDataRef.current === sortedData) {
      // Same reference, definitely no change
      return;
    }
    
    if (previousSortedDataHashRef.current === dataHash && sortedData.length === (mainTableOriginalDataRef.current.length || 0)) {
      // Same hash and length, likely no change - but update ref to current reference
      previousSortedDataRef.current = sortedData;
      return;
    }

    // Deep clone sortedData and add editing keys (top-level and nested arrays)
    const dataWithKeys = addEditingKeysToRows(cloneDeep(sortedData));
    const dataWithNestedKeys = dataWithKeys.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const result = { ...row };
      Object.keys(result).forEach((k) => {
        if (String(k).startsWith('__')) return;
        const v = result[k];
        if (isArray(v) && v.every((item) => item == null || (typeof item === 'object' && !isArray(item)))) {
          result[k] = addEditingKeysToRows(v);
        }
      });
      return result;
    });
    // Initialize original buffer
    mainTableOriginalDataRef.current = cloneDeep(dataWithNestedKeys);
    
    // Initialize editing buffer (deep clone from original)
    const editingData = cloneDeep(dataWithNestedKeys);
    mainTableEditingDataRef.current = editingData;
    setMainTableEditingData(editingData);
    // Force pipeline tableData memo to re-run so it picks up the ref (ref doesn't trigger memo deps)
    setTableDataUpdateTrigger((t) => t + 1);

    // Update tracking refs
    previousSortedDataRef.current = sortedData;
    previousSortedDataHashRef.current = dataHash;
  }, [sortedData, addEditingKeysToRows, setTableDataUpdateTrigger]);

  // paginatedData comes from useDataPipeline

  // Initialize filters effect
  useEffect(() => {
    if (!effectiveMainConfig.enableFilter) {
      if (!isEmpty(tableFilters)) {
        setTableFilters({});
      }
      return;
    }
    if (isEmpty(columns)) return;
    const newFilters = { ...tableFilters };
    let changed = false;
    columns.forEach((col) => {
      const colType = columnTypes[col] || 'string';
      const isMultiselectColumn = includes(multiselectColumns, col);
      const desiredMatchMode =
        isMultiselectColumn ? 'in'
          : colType === 'boolean' ? 'equals'
            : colType === 'date' ? 'dateRange'
              : 'contains';
      if (!newFilters[col]) {
        newFilters[col] = { value: null, matchMode: desiredMatchMode };
        changed = true;
      } else if (newFilters[col].matchMode !== desiredMatchMode) {
        newFilters[col] = { ...newFilters[col], matchMode: desiredMatchMode };
        changed = true;
      }
    });
    if (hasPercentageColumns) {
      percentageColumnNames.forEach((col) => {
        if (!newFilters[col]) {
          newFilters[col] = { value: null, matchMode: 'contains' };
          changed = true;
        }
      });
    }
    if (changed) {
      setTableFilters(newFilters);
    }
  }, [columns, effectiveMainConfig.enableFilter, columnTypes, multiselectColumns, hasPercentageColumns, percentageColumnNames, tableFilters]);

  // Action handlers
  const updateFilter = useCallback((column, value) => {
    setTableFilters(prev => ({
      ...prev,
      [column]: { ...get(prev, column, {}), value }
    }));
    setTablePagination(prev => ({ ...prev, first: 0 }));
  }, []);

  const updateFilterForSlot = useCallback((slotId, column, value) => {
    setTableFiltersBySlot(prev => {
      const slotFilters = prev[slotId] ?? {};
      return { ...prev, [slotId]: { ...slotFilters, [column]: { ...get(slotFilters, column, {}), value } } };
    });
    setTablePaginationBySlot(prev => {
      const slotPag = prev[slotId] ?? { first: 0, rows: 10 };
      return { ...prev, [slotId]: { ...slotPag, first: 0 } };
    });
  }, []);

  const clearFilter = useCallback((column) => {
    updateFilter(column, null);
  }, [updateFilter]);

  const clearFilterForSlot = useCallback((slotId, column) => {
    updateFilterForSlot(slotId, column, null);
  }, [updateFilterForSlot]);

  const clearAllFiltersForSlot = useCallback((slotId) => {
    const meta = pipelinesBySlot[slotId]?.pipelineColumnMeta;
    const cols = meta?.filteredColumns ?? columns;
    const colTypes = meta?.columnTypes ?? columnTypes;
    const multiselectCols = meta?.multiselectColumns ?? multiselectColumns;
    const pctCols = meta?.percentageColumnNames ?? percentageColumnNames;
    const hasPct = meta?.hasPercentageColumns ?? hasPercentageColumns;
    const clearedFilters = {};
    cols.forEach((col) => {
      const colType = colTypes[col] || 'string';
      const isMultiselectColumn = includes(multiselectCols, col);
      if (isMultiselectColumn) {
        clearedFilters[col] = { value: null, matchMode: 'in' };
      } else if (colType === 'boolean') {
        clearedFilters[col] = { value: null, matchMode: 'equals' };
      } else if (colType === 'date') {
        clearedFilters[col] = { value: null, matchMode: 'dateRange' };
      } else {
        clearedFilters[col] = { value: null, matchMode: 'contains' };
      }
    });
    if (hasPct && pctCols?.length) {
      pctCols.forEach((col) => {
        clearedFilters[col] = { value: null, matchMode: 'contains' };
      });
    }
    setTableFiltersBySlot(prev => ({ ...prev, [slotId]: clearedFilters }));
    setTablePaginationBySlot(prev => ({ ...prev, [slotId]: { ...(prev[slotId] ?? { first: 0, rows: 10 }), first: 0 } }));
  }, [pipelinesBySlot, columns, columnTypes, multiselectColumns, hasPercentageColumns, percentageColumnNames]);

  const clearAllFilters = useCallback(() => {
    const clearedFilters = {};
    columns.forEach((col) => {
      const colType = columnTypes[col] || 'string';
      const isMultiselectColumn = includes(multiselectColumns, col);
      if (isMultiselectColumn) {
        clearedFilters[col] = { value: null, matchMode: 'in' };
      } else if (colType === 'boolean') {
        clearedFilters[col] = { value: null, matchMode: 'equals' };
      } else if (colType === 'date') {
        clearedFilters[col] = { value: null, matchMode: 'dateRange' };
      } else {
        clearedFilters[col] = { value: null, matchMode: 'contains' };
      }
    });
    if (hasPercentageColumns) {
      percentageColumnNames.forEach((col) => {
        clearedFilters[col] = { value: null, matchMode: 'contains' };
      });
    }
    setTableFilters(clearedFilters);
    setTablePagination(prev => ({ ...prev, first: 0 }));
  }, [columns, columnTypes, multiselectColumns, hasPercentageColumns, percentageColumnNames]);

  const updateSort = useCallback((sortMeta) => {
    setTableSortMeta(sortMeta || []);
    setTablePagination(prev => ({ ...prev, first: 0 }));
  }, []);

  const updateSortForSlot = useCallback((slotId, sortMeta) => {
    setTableSortMetaBySlot(prev => ({ ...prev, [slotId]: sortMeta || [] }));
    setTablePaginationBySlot(prev => ({ ...prev, [slotId]: { ...(prev[slotId] ?? { first: 0, rows: 10 }), first: 0 } }));
  }, []);

  const updatePagination = useCallback((first, rows) => {
    setTablePagination({ first, rows });
  }, []);

  const updatePaginationForSlot = useCallback((slotId, first, rows) => {
    setTablePaginationBySlot(prev => ({ ...prev, [slotId]: { first, rows: rows ?? (prev[slotId]?.rows ?? 10) } }));
  }, []);

  const [tableExpandedRowsBySlot, setTableExpandedRowsBySlot] = useState({});
  const [tableVisibleColumnsBySlot, setTableVisibleColumnsBySlot] = useState({});

  const updateExpandedRows = useCallback((rows) => {
    setTableExpandedRows(rows);
  }, []);

  const updateExpandedRowsForSlot = useCallback((slotId, rows) => {
    setTableExpandedRowsBySlot(prev => ({ ...prev, [slotId]: rows }));
  }, []);

  const updateVisibleColumns = useCallback((columns) => {
    setTableVisibleColumns(columns);
    if (onVisibleColumnsChange) {
      onVisibleColumnsChange(columns);
    }
  }, [onVisibleColumnsChange]);

  const updateVisibleColumnsForSlot = useCallback((slotId, columns) => {
    setTableVisibleColumnsBySlot(prev => ({ ...prev, [slotId]: columns }));
  }, []);

  /**
   * Apply filters to data array
   * @param {Array} data - Data array to filter
   * @param {Object} filters - Filters in format { columnKey: [filterValues] }
   * @param {Object} options - Options for filter application
   * @returns {Array} Filtered data array
   */
  const applyFiltersToData = useCallback((data, filters, options = {}) => {
    if (!isArray(data) || isEmpty(data)) return [];
    if (!filters || isEmpty(filters)) return data;

    const internalFilters = {};
    Object.keys(filters).forEach((columnKey) => {
      const filterValues = filters[columnKey];
      if (isNil(filterValues) || filterValues === '') return;
      if (isArray(filterValues) && isEmpty(filterValues)) return;
      internalFilters[columnKey] = { value: filterValues };
    });
    if (isEmpty(internalFilters)) return data;

    const getCellValue = (row, col) => (includes(percentageColumnNames, col) ? getPercentageColumnValue(row, col) : getDataValue(row, col));
    const columnMeta = {
      columns,
      columnTypes,
      multiselectColumns,
      hasPercentageColumns,
      percentageColumnNames,
      getCellValue,
    };
    return filterRows(data, { filters: internalFilters, columnMeta });
  }, [columns, columnTypes, multiselectColumns, hasPercentageColumns, percentageColumnNames, getPercentageColumnValue]);

  // Variant 1: getSums(data, filters) - calculates sums on provided data with optional filters
  // Variant 2: getSums(filters) - calculates sums on current filteredData with filters applied
  // Variant 3: getSums() - calculates sums on current filteredData without additional filters
  const getSums = useCallback((dataOrFilters, filters) => {
    let dataToSum;
    let filtersToApply;

    // Detect variant: if no arguments, use current filteredData (Variant 3)
    if (dataOrFilters === undefined && filters === undefined) {
      // Variant 3: getSums()
      dataToSum = filteredData;
      filtersToApply = null;
    } else if (isArray(dataOrFilters)) {
      // Variant 1: getSums(data, filters)
      dataToSum = dataOrFilters;
      filtersToApply = filters || null;
    } else {
      // Variant 2: getSums(filters)
      dataToSum = filteredData; // Use current filteredData
      filtersToApply = dataOrFilters || null;
    }

    // Apply filters if provided
    let dataForSums = dataToSum || [];
    if (filtersToApply && !isEmpty(filtersToApply)) {
      dataForSums = applyFiltersToData(dataToSum, filtersToApply);
    }

    // Calculate sums
    const sums = {};
    if (isEmpty(dataForSums)) return sums;
    columns.forEach((col) => {
      const colType = columnTypes[col] || 'string';
      if (colType === 'date') return;
      const values = filter(
        dataForSums.map((row) => getDataValue(row, col)),
        (val) => !isNil(val)
      );
      if (!isEmpty(values) && isNumericValue(head(values))) {
        sums[col] = sumBy(values, (val) => {
          const numVal = isNumber(val) ? val : toNumber(val);
          return _isNaN(numVal) ? 0 : numVal;
        });
      }
    });

    // Run compute on total row for derived columns (totalRow = sums, each key has column sum)
    const derivedColNames = getDerivedColumnNames(derivedColumns || [], derivedColumnsMode ?? 'main', derivedColumnsFieldName ?? null);
    (derivedColumns || []).forEach((dc) => {
      if (!dc.columnName || !dc.compute || !derivedColNames.includes(dc.columnName)) return;
      try {
        const totalRow = { ...sums };
        const ctx = {
          isTotalRow: true,
          isGroupRow: false,
          getDataValue: (r, k) => (r && typeof r === 'object' ? r[k] : undefined),
          parentRow: null,
          fieldName: derivedColumnsFieldName ?? null,
          rowIndex: -1,
          position: -1,
        };
        const value = typeof dc.compute === 'function' && dc.compute.length >= 2
          ? dc.compute(totalRow, ctx)
          : typeof dc.compute === 'function'
            ? dc.compute(totalRow)
            : null;
        sums[dc.columnName] = value;
      } catch (e) {
        sums[dc.columnName] = null;
      }
    });

    return sums;
  }, [filteredData, applyFiltersToData, columns, columnTypes, isNumericValue, getDataValue, derivedColumns, derivedColumnsMode, derivedColumnsFieldName]);

  // Summation computation
  const calculateSums = useMemo(() => {
    return getSums();
  }, [getSums]);

  // Unified drawer function with two variants:
  // Variant 1: openDrawer(data, filters, title, tableOptions) - applies filters on provided data
  // Variant 2: openDrawer(filters, title, tableOptions) - applies filters on current filteredData
  // Optional title parameter can be provided to set custom drawer header title
  // Optional tableOptions parameter can be provided to override default table configuration
  const openDrawer = useCallback((dataOrFilters, filters, title, tableOptions) => {
    let dataToFilter;
    let filtersToApply;
    let customTitle = title;

    // Detect variant: if first arg is an array, it's variant 1 (with data)
    if (isArray(dataOrFilters)) {
      // Variant 1: openDrawer(data, filters, title, tableOptions)
      dataToFilter = dataOrFilters;
      filtersToApply = filters || null;
    } else {
      // Variant 2: openDrawer(filters, title, tableOptions)
      dataToFilter = filteredData; // Use current filteredData
      filtersToApply = dataOrFilters || null;
    }

    // Apply filters if provided
    let filteredResult = dataToFilter || [];
    if (filtersToApply && !isEmpty(filtersToApply)) {
      filteredResult = applyFiltersToData(dataToFilter, filtersToApply);
    }

    // Extract clickedDrawerValues from filters if group fields are present
    // Support all group fields, not just first two
    const clickedValues = {};
    effectiveGroupFields.forEach((field) => {
      if (filtersToApply && field && filtersToApply[field]) {
        const filterValue = filtersToApply[field];
        clickedValues[field] = isArray(filterValue) ? filterValue[0] : filterValue;
      }
    });

    // For backward compatibility, extract first two as outerValue/innerValue
    const outerValue = clickedValues[effectiveGroupFields[0]] || null;
    const innerValue = clickedValues[effectiveGroupFields[1]] || null;

    // Store filtered data
    setDrawerData(filteredResult);
    setClickedDrawerValues({ outerValue, innerValue, ...clickedValues });

    // Compute title: use custom title if provided, otherwise compute from clickedDrawerValues
    const titleParts = effectiveGroupFields.map(field => clickedValues[field]).filter(Boolean);
    const computedTitle = customTitle || (titleParts.length > 0 ? titleParts.join(' : ') : 'Drawer');
    setDrawerHeaderTitle(computedTitle);

    // Store table options if provided
    setDrawerTableOptions(tableOptions || null);

    setActiveDrawerTabIndex(0);
    setDrawerVisible(true);
  }, [filteredData, applyFiltersToData, effectiveGroupFields]);

  // Drawer action handlers (legacy - calls unified openDrawer internally)
  const openDrawerWithData = useCallback((data, outerValue = null, innerValue = null, title = null) => {
    // Compute title: use custom title if provided, otherwise compute from values
    const computedTitle = title || (innerValue
      ? `${outerValue} : ${innerValue}`
      : outerValue || 'Drawer');
    // Use unified API: openDrawer(data, null, computedTitle) - no filters
    openDrawer(data, null, computedTitle);
    // Set clickedDrawerValues for display purposes
    setClickedDrawerValues({ outerValue, innerValue });
  }, [openDrawer]);

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false);
    setDrawerHeaderTitle(null);
    setDrawerTableOptions(null);
    setDrawerJsonTables(null);
    setSelectedRowData(null);
    formOriginalRowRef.current = null;
    setFormEditingRow(null);
    // Clear change tracking data when drawer closes
    originalNestedTableDataRef.current.clear();
    nestedTableEditingDataRef.current.clear();
    nestedTableDataRefsRef.current.clear();
  }, [effectiveMainConfig.drawerTabs, onDrawerTabsChange]);

  // Wrapper so that when user selects another row in the main table (drawer open), form buffer is re-inited
  const setSelectedRowDataWithFormSync = useCallback((row) => {
    setSelectedRowData(row);
    if (drawerVisible && scalarEditableColumns.length > 0 && row) {
      formOriginalRowRef.current = cloneDeep(row);
      setFormEditingRow(cloneDeep(row));
    } else if (!row) {
      formOriginalRowRef.current = null;
      setFormEditingRow(null);
    }
  }, [drawerVisible, scalarEditableColumns.length]);

  const addDrawerTab = useCallback(() => {
    const newTab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: '',
      outerGroup: null,
      innerGroup: null
    };
    if (onDrawerTabsChange) {
      onDrawerTabsChange([...effectiveMainConfig.drawerTabs, newTab]);
    }
    setActiveDrawerTabIndex((effectiveMainConfig.drawerTabs || []).length);
  }, [effectiveMainConfig.drawerTabs, onDrawerTabsChange]);

  const removeDrawerTab = useCallback((tabId) => {
    const tabs = effectiveMainConfig.drawerTabs || [];
    if (tabs.length <= 1) return;
    const newTabs = tabs.filter(tab => tab.id !== tabId);
    if (onDrawerTabsChange) {
      onDrawerTabsChange(newTabs);
    }
    if (activeDrawerTabIndex >= newTabs.length) {
      setActiveDrawerTabIndex(newTabs.length - 1);
    }
  }, [effectiveMainConfig.drawerTabs, activeDrawerTabIndex, onDrawerTabsChange]);

  const updateDrawerTab = useCallback((tabId, updates) => {
    if (onDrawerTabsChange) {
      onDrawerTabsChange((effectiveMainConfig.drawerTabs || []).map(tab =>
        tab.id === tabId ? { ...tab, ...updates } : tab
      ));
    }
  }, [effectiveMainConfig.drawerTabs, onDrawerTabsChange]);

  // Drawer filtering functions for group cells (legacy - calls unified openDrawer internally)
  const openDrawerForOuterGroup = useCallback((value) => {
    if (effectiveGroupFields.length === 0) return;
    const firstGroupField = effectiveGroupFields[0];
    // Use unified API: openDrawer({ [firstGroupField]: [value] })
    const filters = { [firstGroupField]: [value] };
    openDrawer(filters);
  }, [effectiveGroupFields, openDrawer]);

  const openDrawerForInnerGroup = useCallback((outerValue, innerValue) => {
    if (effectiveGroupFields.length < 2) return;
    const firstGroupField = effectiveGroupFields[0];
    const secondGroupField = effectiveGroupFields[1];
    // Use unified API: openDrawer({ [firstGroupField]: [outerValue], [secondGroupField]: [innerValue] })
    const filters = {
      [firstGroupField]: [outerValue],
      [secondGroupField]: [innerValue]
    };
    openDrawer(filters);
  }, [effectiveGroupFields, openDrawer]);

  // Callback to update current nested table data for a specific tab
  const updateCurrentNestedTableData = useCallback((tabId, currentData) => {
    if (tabId && isArray(currentData)) {
      // Don't overwrite saved data: if incoming data matches the saved original, preserve the editing buffer
      // This prevents reverting user edits after save
      const trackingData = originalNestedTableDataRef.current.get(tabId);
      const existingData = nestedTableEditingDataRef.current.get(tabId);
      if (trackingData && trackingData.originalData && existingData && existingData.length > 0) {
        // Check if incoming data matches the saved original (which would revert edits)
        const incomingMatchesSavedOriginal = trackingData.originalData.length === currentData.length && 
          JSON.stringify(trackingData.originalData) === JSON.stringify(currentData);
        // Check if existing data matches the saved original (meaning it's the saved state)
        const existingMatchesSavedOriginal = existingData.length === trackingData.originalData.length &&
          JSON.stringify(existingData) === JSON.stringify(trackingData.originalData);
        if (incomingMatchesSavedOriginal && existingMatchesSavedOriginal) {
          // Both match saved original - this is fine, data is already saved
          return; // Skip update - data already matches saved state
        }
        // If incoming matches saved original but existing doesn't, preserve existing (user has new edits)
        if (incomingMatchesSavedOriginal && !existingMatchesSavedOriginal) {
          return; // Skip update to preserve user's new edits
        }
      }
      // Don't overwrite if we already have data (preserve user edits)
      // Only update if existing data is empty or if the new data is significantly different
      if (existingData && existingData.length > 0 && currentData.length === existingData.length) {
        // Check if data is actually different (not just a re-render with same data)
        const isSameData = JSON.stringify(existingData) === JSON.stringify(currentData);
        if (isSameData) {
          return; // Skip update if data hasn't changed
        }
      }
      // Ensure editing keys are preserved when updating
      const dataWithKeys = addEditingKeysToRows(cloneDeep(currentData));
      nestedTableEditingDataRef.current.set(tabId, dataWithKeys);
    }
  }, [addEditingKeysToRows]);

  const DERIVED_RECOMPUTE_DEBOUNCE_MS = 350;

  // Debounced: recompute derived columns for a single row by editingKey; then update buffer and trigger re-render.
  const scheduleDerivedRecomputeForRow = useCallback((editingKey) => {
    if (derivedRecomputeTimerRef.current) {
      clearTimeout(derivedRecomputeTimerRef.current);
      derivedRecomputeTimerRef.current = null;
    }
    pendingDerivedRecomputeKeyRef.current = editingKey;
    derivedRecomputeTimerRef.current = setTimeout(() => {
      derivedRecomputeTimerRef.current = null;
      const keyToRecompute = pendingDerivedRecomputeKeyRef.current;
      pendingDerivedRecomputeKeyRef.current = null;
      if (keyToRecompute == null) return;
      if (!derivedColumns || !isArray(derivedColumns) || isEmpty(derivedColumns)) return;

      const context = {
        mode: derivedColumnsMode ?? 'main',
        fieldName: derivedColumnsFieldName ?? null,
        getDataValue,
      };

      if (nestedTableTabId && parentNestedTableEditingDataRef) {
        const parentEditingData = parentNestedTableEditingDataRef.current.get(nestedTableTabId) || [];
        const rowIndex = parentEditingData.findIndex((row) => row && row.__editingKey__ === keyToRecompute);
        if (rowIndex === -1) return;
        const row = parentEditingData[rowIndex];
        const enrichedRow = applyDerivedColumnsForRow(row, derivedColumns, context);
        const updatedData = [...parentEditingData];
        updatedData[rowIndex] = enrichedRow;
        parentNestedTableEditingDataRef.current.set(nestedTableTabId, updatedData);
        onNestedBufferChange?.();
      } else {
        const editingData = mainTableEditingDataRef.current;
        if (!editingData || !isArray(editingData)) return;
        const rowIndex = editingData.findIndex((row) => row && row.__editingKey__ === keyToRecompute);
        if (rowIndex === -1) return;
        const row = editingData[rowIndex];
        const enrichedRow = applyDerivedColumnsForRow(row, derivedColumns, context);
        const updatedData = [...editingData];
        updatedData[rowIndex] = enrichedRow;
        mainTableEditingDataRef.current = updatedData;
        mainTableEditingDataRefEarly.current = updatedData;
        setMainTableEditingData(updatedData);
        setTableDataUpdateTrigger((t) => t + 1);
      }
    }, DERIVED_RECOMPUTE_DEBOUNCE_MS);
  }, [
    derivedColumns,
    derivedColumnsMode,
    derivedColumnsFieldName,
    getDataValue,
    nestedTableTabId,
    parentNestedTableEditingDataRef,
    onNestedBufferChange,
    setTableDataUpdateTrigger,
  ]);

  // Main table editing buffer update function
  const updateMainTableEditingData = useCallback((editingKey, field, newValue) => {
    // If this is a nested instance, also update parent's nestedTableEditingDataRef
    if (nestedTableTabId && parentNestedTableEditingDataRef) {
      const parentEditingData = parentNestedTableEditingDataRef.current.get(nestedTableTabId) || [];
      const rowIndex = parentEditingData.findIndex(row => row && row.__editingKey__ === editingKey);
      if (rowIndex !== -1) {
        const updatedRow = { ...parentEditingData[rowIndex], [field]: newValue };
        const updatedData = [...parentEditingData];
        updatedData[rowIndex] = updatedRow;
        parentNestedTableEditingDataRef.current.set(nestedTableTabId, updatedData);
        onNestedBufferChange?.(); // Parent re-renders so nested gets updated offlineData
      }
    }
    
    setMainTableEditingData(prevData => {
      const editingData = [...prevData];
      const rowIndex = editingData.findIndex(row => row && row.__editingKey__ === editingKey);
      if (rowIndex !== -1) {
        editingData[rowIndex] = { ...editingData[rowIndex], [field]: newValue };
        mainTableEditingDataRef.current = editingData;
        return editingData;
      }
      return prevData;
    });

    // Schedule debounced derived-column recompute for this row only
    scheduleDerivedRecomputeForRow(editingKey);
  }, [nestedTableTabId, parentNestedTableEditingDataRef, onNestedBufferChange, scheduleDerivedRecomputeForRow]);

  // Helper function to detect changes in nested table data
  // Compares original data with current data and returns array of changed rows
  const detectNestedTableChanges = useCallback((originalData, currentData) => {
    if (!isArray(originalData) || !isArray(currentData)) {
      return [];
    }

    const changes = [];
    const originalMap = new Map();
    
    // Create a map of original rows by a unique identifier
    // Prefer __editingKey__ (stable in editing buffer), then id/key/__id__, else JSON.stringify
    const getRowKey = (r, i) => r?.__editingKey__ ?? r?.id ?? r?.key ?? r?.__id__ ?? `__match_${i}`;
    originalData.forEach((row, index) => {
      const rowKey = getRowKey(row, index);
      originalMap.set(rowKey, { row: cloneDeep(row), index });
    });

    // Check for modified and new rows
    currentData.forEach((currentRow, currentIndex) => {
      const rowKey = getRowKey(currentRow, currentIndex);
      const originalEntry = originalMap.get(rowKey);
      
      if (originalEntry) {
        // Row exists in original - check for changes
        const originalRow = originalEntry.row;
        const changedFields = {};
        let hasChanges = false;

        // Compare all fields
        const allKeys = new Set([...getDataKeys(originalRow), ...getDataKeys(currentRow)]);
        allKeys.forEach(key => {
          const originalValue = getDataValue(originalRow, key);
          const currentValue = getDataValue(currentRow, key);
          
          // Deep comparison (handle objects and arrays)
          if (JSON.stringify(originalValue) !== JSON.stringify(currentValue)) {
            changedFields[key] = {
              oldValue: originalValue,
              newValue: currentValue,
            };
            hasChanges = true;
          }
        });

        if (hasChanges) {
          changes.push({
            type: 'modified',
            rowKey,
            originalRow: cloneDeep(originalRow),
            currentRow: cloneDeep(currentRow),
            changedFields,
            index: currentIndex,
          });
        }
        
        // Remove from map to track which original rows are still present
        originalMap.delete(rowKey);
      } else {
        // New row (not in original)
        changes.push({
          type: 'added',
          rowKey,
          originalRow: null,
          currentRow: cloneDeep(currentRow),
          changedFields: {},
          index: currentIndex,
        });
      }
    });

    // Remaining entries in originalMap are deleted rows
    originalMap.forEach(({ row, index }) => {
      const rowKey = getRowKey(row, index);
      changes.push({
        type: 'deleted',
        rowKey,
        originalRow: cloneDeep(row),
        currentRow: null,
        changedFields: {},
        index: index,
      });
    });

    return changes;
  }, []);

  // Get changed rows for a specific drawer tab
  const getChangedRowsForTab = useCallback((tabId) => {
    const trackingData = originalNestedTableDataRef.current.get(tabId);
    if (!trackingData) {
      return { tabId, changes: [], parentRowData: null, nestedTableFieldName: null, parentColumnName: null };
    }

    const currentData = nestedTableEditingDataRef.current.get(tabId) || [];
    const changes = detectNestedTableChanges(trackingData.originalData, currentData);
    
    return {
      tabId,
      parentRowData: trackingData.parentRowData,
      nestedTableFieldName: trackingData.nestedTableFieldName,
      parentColumnName: trackingData.parentColumnName,
      changes,
    };
  }, [detectNestedTableChanges]);

  // Get all changed rows across all nested table tabs
  const getAllChangedNestedTableRows = useCallback(() => {
    const allChanges = [];
    
    originalNestedTableDataRef.current.forEach((trackingData, tabId) => {
      const currentData = nestedTableEditingDataRef.current.get(tabId) || [];
      const changes = detectNestedTableChanges(trackingData.originalData, currentData);
      
      if (changes.length > 0) {
        allChanges.push({
          tabId,
          parentRowData: trackingData.parentRowData,
          nestedTableFieldName: trackingData.nestedTableFieldName,
          parentColumnName: trackingData.parentColumnName,
          changes,
        });
      }
    });
    
    return allChanges;
  }, [detectNestedTableChanges]);

  // Helper function to find parent row in editing buffer using editing key
  const findParentRowInEditingBuffer = useCallback((parentRowEditingKey, editingData) => {
    if (!parentRowEditingKey || !isArray(editingData)) {
      return null;
    }
    const rowIndex = editingData.findIndex(row => row && row.__editingKey__ === parentRowEditingKey);
    if (rowIndex === -1) {
      return null;
    }
    return { row: editingData[rowIndex], index: rowIndex };
  }, []);

  // Helper function to propagate drawer save to main table
  // Uses mainTableEditingDataRef so it sees the latest buffer (e.g. after form commit in same save).
  // When parentRowEditingKey is null (new row from openDrawerForNewRow), appends the row instead of updating.
  const propagateDrawerSaveToMain = useCallback((tabId, drawerOriginalData, parentRowEditingKey, nestedTableFieldName) => {
    if (!nestedTableFieldName) {
      console.error('propagateDrawerSaveToMain: Missing nestedTableFieldName');
      return;
    }

    const currentEditingData = mainTableEditingDataRef.current;

    // New row case: parentRowEditingKey is null - prepend form row + all nested tab data to main table at index 0
    if (!parentRowEditingKey) {
      const currentFormRow = formEditingRowRef.current;
      if (!currentFormRow) return;
      const { __nestedTables__, ...rowWithoutNested } = currentFormRow;
      const newRow = { ...rowWithoutNested };
      // Collect nested data from all tabs for this new row (all have parentRowEditingKey null)
      const trackingEntries = Array.from(originalNestedTableDataRef.current.entries());
      trackingEntries.forEach(([tid, tdata]) => {
        if (tdata.parentRowEditingKey === null && tdata.nestedTableFieldName) {
          const nestedData = nestedTableEditingDataRef.current.get(tid) || [];
          newRow[tdata.nestedTableFieldName] = cloneDeep(nestedData);
        }
      });
      const updatedEditingData = [newRow, ...(currentEditingData || [])];
      mainTableEditingDataRef.current = updatedEditingData;
      mainTableEditingDataRefEarly.current = updatedEditingData;
      setMainTableEditingData(updatedEditingData);
      skipNextInitFromSortedDataRef.current = true; // Prevent onTableDataChange from re-initing original
      setTableDataUpdateTrigger(prev => prev + 1);
      return;
    }

    // Existing row case: find and update
    const parentRowInfo = findParentRowInEditingBuffer(parentRowEditingKey, currentEditingData);
    if (!parentRowInfo) {
      console.error('propagateDrawerSaveToMain: Parent row not found with editingKey:', parentRowEditingKey);
      if (onDataChange) {
        onDataChange({
          severity: 'error',
          summary: 'Save Failed',
          detail: 'Could not find parent row in main table. The row may have been deleted.',
          life: 5000,
        });
      }
      return;
    }

    const updatedEditingData = [...currentEditingData];
    const { __nestedTables__, ...rowWithoutNestedTables } = parentRowInfo.row;

    updatedEditingData[parentRowInfo.index] = {
      ...rowWithoutNestedTables,
      [nestedTableFieldName]: cloneDeep(drawerOriginalData),
    };

    mainTableEditingDataRef.current = updatedEditingData;
    mainTableEditingDataRefEarly.current = updatedEditingData;
    setMainTableEditingData(updatedEditingData);
    setTableDataUpdateTrigger(prev => prev + 1);
  }, [findParentRowInEditingBuffer, onDataChange, setTableDataUpdateTrigger]);

  // Handle drawer save - commits form buffer then saves nested table for current active tab
  const handleDrawerSave = useCallback(() => {
    // If we're using parent refs (nested instance), delegate to parent's handleDrawerSave
    if (parentOriginalNestedTableDataRef && parentHandleDrawerSave) {
      return parentHandleDrawerSave();
    }
    if ((!effectiveDrawerTabs || effectiveDrawerTabs.length === 0) && parentHandleDrawerSave) {
      return parentHandleDrawerSave();
    }

    // Commit form buffer to main table if form has changes (read latest from ref)
    const currentFormRow = formEditingRowRef.current;
    let hasFormChanges = false;
    if (scalarEditableColumns.length > 0 && currentFormRow && formOriginalRowRef.current) {
      try {
        hasFormChanges = JSON.stringify(currentFormRow) !== JSON.stringify(formOriginalRowRef.current);
      } catch (e) {}
    }
    if (hasFormChanges) {
      const editingKey = currentFormRow.__editingKey__;
      const editingData = mainTableEditingData;
      const rowIndex = editingData.findIndex(row => row && row.__editingKey__ === editingKey);
      if (rowIndex !== -1) {
        const updatedData = [...editingData];
        const rowToSave = cloneDeep(currentFormRow);
        if (rowToSave && typeof rowToSave === 'object' && rowToSave.id != null && /^main_row_\d+$/.test(String(rowToSave.id))) {
          const { id: _syntheticId, ...rowWithoutSyntheticId } = rowToSave;
          updatedData[rowIndex] = rowWithoutSyntheticId;
        } else {
          updatedData[rowIndex] = rowToSave;
        }
        setMainTableEditingData(updatedData);
        mainTableEditingDataRef.current = updatedData;
        mainTableEditingDataRefEarly.current = updatedData;
        formOriginalRowRef.current = cloneDeep(currentFormRow);
        setTableDataUpdateTrigger((t) => t + 1);
      }
    }

    // Resolve tab for nested save
    let tabId = null;
    let activeTab = null;
    if (!effectiveDrawerTabs || effectiveDrawerTabs.length === 0) {
      const trackingEntries = Array.from(originalNestedTableDataRef.current.entries());
      if (trackingEntries.length > 0) {
        tabId = trackingEntries[0][0];
      } else {
        if (hasFormChanges && onDataChange) {
          onDataChange({
            severity: 'success',
            summary: 'Changes Saved',
            detail: 'Saved changes in form and updated main table.',
            life: 3000,
          });
        }
        return;
      }
    } else {
      activeTab = effectiveDrawerTabs[activeDrawerTabIndex];
      if (!activeTab || !activeTab.isJsonTable) {
        if (hasFormChanges && onDataChange) {
          onDataChange({
            severity: 'success',
            summary: 'Changes Saved',
            detail: 'Saved changes in form and updated main table.',
            life: 3000,
          });
        }
        return;
      }
      tabId = activeTab.id;
    }
    const trackingData = originalNestedTableDataRef.current.get(tabId);
    if (!trackingData) {
      if (hasFormChanges && onDataChange) {
        onDataChange({
          severity: 'success',
          summary: 'Changes Saved',
          detail: 'Saved changes in form and updated main table.',
          life: 3000,
        });
      }
      return;
    }

    const drawerEditingData = nestedTableEditingDataRef.current.get(tabId) || [];
    let hasNestedChanges = false;
    try {
      if (!isArray(drawerEditingData) || !isArray(trackingData.originalData)) {
        hasNestedChanges = drawerEditingData !== trackingData.originalData;
      } else if (drawerEditingData.length !== trackingData.originalData.length) {
        hasNestedChanges = true;
      } else {
        hasNestedChanges = JSON.stringify(drawerEditingData) !== JSON.stringify(trackingData.originalData);
      }
    } catch (e) {
      hasNestedChanges = true;
    }

    if (!hasFormChanges && !hasNestedChanges) {
      if (onDataChange) {
        onDataChange({
          severity: 'info',
          summary: 'No Changes',
          detail: 'No changes detected in this nested table.',
          life: 3000,
        });
      }
      return;
    }

    if (hasNestedChanges) {
      // Step 1: Copy drawerEditing → drawerOriginal (save nested table changes)
      const drawerOriginalData = cloneDeep(drawerEditingData);
      trackingData.originalData = drawerOriginalData;
      originalNestedTableDataRef.current.set(tabId, trackingData);
      nestedTableEditingDataRef.current.set(tabId, cloneDeep(drawerOriginalData));

      // Step 2: Propagate drawerOriginal → mainEditing (update main with saved drawer state)
      const { parentRowEditingKey, nestedTableFieldName } = trackingData;
      if (nestedTableFieldName) {
        propagateDrawerSaveToMain(tabId, drawerOriginalData, parentRowEditingKey, nestedTableFieldName);
      } else {
        console.warn('handleDrawerSave: Missing nestedTableFieldName');
      }

      // New row with multiple nested tabs: sync all tabs' tracking so close does not show unsaved
      if (!parentRowEditingKey) {
        originalNestedTableDataRef.current.forEach((tdata, tid) => {
          if (tdata.parentRowEditingKey === null && tdata.nestedTableFieldName) {
            const nestedData = nestedTableEditingDataRef.current.get(tid) || [];
            tdata.originalData = cloneDeep(nestedData);
            originalNestedTableDataRef.current.set(tid, tdata);
            nestedTableEditingDataRef.current.set(tid, cloneDeep(nestedData));
          }
        });
      }
    } else if (hasFormChanges && !trackingData.parentRowEditingKey && trackingData.nestedTableFieldName) {
      // New row with form changes only (no nested changes) - still need to append to main table
      propagateDrawerSaveToMain(tabId, drawerEditingData, null, trackingData.nestedTableFieldName);
    }

    // For new row: sync form "original" so close does not show unsaved (row was just added to main)
    if (!trackingData.parentRowEditingKey && currentFormRow && (hasFormChanges || hasNestedChanges)) {
      formOriginalRowRef.current = cloneDeep(currentFormRow);
    }

    if ((hasFormChanges || hasNestedChanges) && onDataChange) {
      onDataChange({
        severity: 'success',
        summary: 'Changes Saved',
        detail: hasFormChanges && hasNestedChanges
          ? 'Saved form and nested table changes and updated main table.'
          : hasFormChanges
            ? 'Saved changes in form and updated main table.'
            : 'Saved changes in nested table and updated main table.',
        life: 3000,
      });
    }
  }, [effectiveDrawerTabs, activeDrawerTabIndex, propagateDrawerSaveToMain, onDataChange, parentHandleDrawerSave, parentOriginalNestedTableDataRef, scalarEditableColumns.length, mainTableEditingData, setTableDataUpdateTrigger]);

  // Persist main table editing buffer to original (used after diff dialog OK or when no diff)
  const persistMainSave = useCallback((editingData) => {
    const data = editingData ?? mainTableEditingData;
    const savedData = cloneDeep(data).map(row => {
      if (row && typeof row === 'object' && '__nestedTables__' in row) {
        const { __nestedTables__, ...rowWithoutNestedTables } = row;
        return rowWithoutNestedTables;
      }
      return row;
    });
    mainTableOriginalDataRef.current = savedData;
    setMainTableOriginalVersion((v) => v + 1);
    if (onDataChange) {
      onDataChange({
        severity: 'success',
        summary: 'Changes Saved',
        detail: 'All changes have been saved.',
        life: 3000,
      });
    }
  }, [mainTableEditingData, onDataChange]);

  // Handle main save - copies editing buffer to original buffer
  const handleMainSave = useCallback(() => {
    // Derived columns with save !== true are excluded from save diff (e.g. "twice of sales_qty")
    const excludeFromDiff = new Set(
      (derivedColumns || []).filter((dc) => dc.save !== true).map((dc) => dc.columnName).filter(Boolean)
    );
    const skipKey = (k) => String(k).startsWith('__') || excludeFromDiff.has(k);

    // Stable row key for matching: prefer __editingKey__, then id/key, else fallback for original rows
    const getRowKey = (row, origIndex) => {
      if (!row || typeof row !== 'object') return `__match_${origIndex}`;
      return row.__editingKey__ ?? row.id ?? row.key ?? row.__id__ ?? `__match_${origIndex}`;
    };

    // Helper: diff a single field value; if array-of-objects (nested table), diff by row key (not index)
    const diffFieldValue = (o, e) => {
      const isArrayOfObjects = (v) =>
        isArray(v) && v.every((item) => item == null || (typeof item === 'object' && !isArray(item)));
      if (isArrayOfObjects(o) && isArrayOfObjects(e)) {
        const origArr = o || [];
        const editArr = e || [];
        const getNestedKey = (item, idx) => {
          if (!item || typeof item !== 'object') return `__nested_${idx}`;
          return item.__editingKey__ ?? item.id ?? item.key ?? item.__id__ ?? `__nested_${idx}`;
        };
        const origMap = new Map();
        origArr.forEach((item, idx) => origMap.set(getNestedKey(item, idx), { row: item, index: idx }));
        const nested = [];
        editArr.forEach((editItem, editIdx) => {
          const editKey = getNestedKey(editItem, editIdx);
          const origEntry = origMap.get(editKey);
          origMap.delete(editKey);
          if (!origEntry) {
            nested.push({ nestedKey: editKey, type: 'added', row: editItem });
            return;
          }
          const no = origEntry.row;
          const nKeys = uniq([...getDataKeys(no), ...getDataKeys(editItem)].filter((k) => !skipKey(k)));
          const nChanges = {};
          nKeys.forEach((nk) => {
            const vo = getDataValue(no, nk);
            const ve = getDataValue(editItem, nk);
            if (JSON.stringify(vo) !== JSON.stringify(ve)) {
              nChanges[nk] = { from: vo, to: ve };
            }
          });
          if (Object.keys(nChanges).length > 0) {
            nested.push({ nestedKey: editKey, type: 'changed', changes: nChanges });
          }
        });
        origMap.forEach(({ row }, key) => nested.push({ nestedKey: key, type: 'removed', row }));
        return nested.length > 0 ? { nested } : null;
      }
      if (JSON.stringify(o) !== JSON.stringify(e)) {
        return { from: o, to: e };
      }
      return null;
    };

    const originalData = mainTableOriginalDataRef.current;
    const editingData = mainTableEditingData;
    if (isArray(originalData) && isArray(editingData)) {
      const originalMap = new Map();
      originalData.forEach((row, idx) => originalMap.set(getRowKey(row, idx), { row, index: idx }));
      const diff = [];
      editingData.forEach((editRow, editIndex) => {
        const editKey = getRowKey(editRow, editIndex);
        const origEntry = originalMap.get(editKey);
        originalMap.delete(editKey);
        if (!origEntry) {
          diff.push({ index: editIndex, rowKey: editKey, type: 'added', row: editRow });
          return;
        }
        const orig = origEntry.row;
        const keys = uniq([...getDataKeys(orig), ...getDataKeys(editRow)].filter((k) => !skipKey(k)));
        const changes = {};
        keys.forEach(k => {
          const o = getDataValue(orig, k);
          const e = getDataValue(editRow, k);
          const fieldDiff = diffFieldValue(o, e);
          if (fieldDiff) changes[k] = fieldDiff;
        });
        if (Object.keys(changes).length > 0) {
          diff.push({ index: editIndex, rowKey: editKey, type: 'changed', changes });
        }
      });
      originalMap.forEach(({ row }, key) => diff.push({ index: -1, rowKey: key, type: 'removed', row }));
      if (diff.length > 0) {
        setSaveDiffContent(diff);
        setSaveDiffDialogVisible(true);
        return;
      }
    }
    // No diff or empty: show "No changes" and do not persist
    if (onDataChange) {
      onDataChange({
        severity: 'info',
        summary: 'No changes',
        detail: 'No changes to save.',
        life: 3000,
      });
    }
  }, [mainTableEditingData, onDataChange, derivedColumns, persistMainSave]);

  const handleSaveDiffDialogOk = useCallback(() => {
    persistMainSave(mainTableEditingData);
    setSaveDiffDialogVisible(false);
  }, [persistMainSave, mainTableEditingData]);

  // Format save diff for dialog display (from → to), grouped by New / Updated / Removed
  const saveDiffFormatted = useMemo(() => {
    if (!isArray(saveDiffContent) || saveDiffContent.length === 0) return '';
    const added = saveDiffContent.filter((e) => e.type === 'added');
    const updated = saveDiffContent.filter((e) => e.type === 'changed');
    const removed = saveDiffContent.filter((e) => e.type === 'removed');

    const formatEntry = (entry, label) => {
      const lines = [];
      lines.push(label);
      if (entry.type === 'added' || entry.type === 'removed') {
        lines.push('  ' + JSON.stringify(entry.row, null, 2).replace(/\n/g, '\n  '));
        return lines;
      }
      if (entry.changes) {
        Object.entries(entry.changes).forEach(([field, val]) => {
          if (val && typeof val === 'object' && val.nested) {
            lines.push(`  ${field} (nested):`);
            val.nested.forEach((n, idx) => {
              const nk = n.nestedKey ?? `[${idx}]`;
              if (n.type === 'changed' && n.changes) {
                Object.entries(n.changes).forEach(([k, v]) => {
                  if (v && (v.from !== undefined || v.to !== undefined)) {
                    lines.push(`    ${nk} ${k}: ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}`);
                  }
                });
              } else {
                lines.push(`    ${nk} ${n.type || 'changed'}`);
              }
            });
          } else if (val && (val.from !== undefined || val.to !== undefined)) {
            lines.push(`  ${field}: ${JSON.stringify(val.from)} → ${JSON.stringify(val.to)}`);
          }
        });
      }
      return lines;
    };

    const lines = [];
    if (added.length > 0) {
      lines.push('=== NEW ROWS ===');
      added.forEach((entry, i) => formatEntry(entry, `Row (new ${i + 1})`).forEach((l) => lines.push(l)));
      lines.push('');
    }
    if (updated.length > 0) {
      lines.push('=== UPDATED ROWS ===');
      updated.forEach((entry, i) => formatEntry(entry, `Row ${i + 1} (updated)`).forEach((l) => lines.push(l)));
      lines.push('');
    }
    if (removed.length > 0) {
      lines.push('=== REMOVED ROWS ===');
      removed.forEach((entry, i) => formatEntry(entry, `Row (removed ${i + 1})`).forEach((l) => lines.push(l)));
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }, [saveDiffContent]);

  // Handle main cancel - reverts editing buffer to original buffer
  const handleMainCancel = useCallback(() => {
    // Deep clone originalData → editingData (revert all changes)
    const originalData = mainTableOriginalDataRef.current;
    const editingData = cloneDeep(originalData);
    mainTableEditingDataRef.current = editingData;
    mainTableEditingDataRefEarly.current = editingData;
    setMainTableEditingData(editingData);

    // Reset nested table buffers if needed
    nestedTableEditingDataRef.current.clear();
    originalNestedTableDataRef.current.clear();

    // Force pipeline to recompute tableData from the reverted ref
    setTableDataUpdateTrigger((t) => t + 1);

    // Show notification
    if (onDataChange) {
      onDataChange({
        severity: 'info',
        summary: 'Changes Discarded',
        detail: 'All unsaved changes have been discarded.',
        life: 3000,
      });
    }
  }, [onDataChange, setTableDataUpdateTrigger]);

  // Handle drawer cancel - reverts drawer editing buffer to original buffer
  const handleDrawerCancel = useCallback(() => {
    if (!effectiveDrawerTabs || effectiveDrawerTabs.length === 0) {
      return;
    }

    const activeTab = effectiveDrawerTabs[activeDrawerTabIndex];
    if (!activeTab || !activeTab.isJsonTable) {
      return;
    }

    const tabId = activeTab.id;
    const trackingData = originalNestedTableDataRef.current.get(tabId);
    if (!trackingData) {
      return;
    }

    // Deep clone drawer's originalData → drawer's editingData (revert changes for current tab only)
    const drawerOriginalData = trackingData.originalData;
    const drawerEditingData = cloneDeep(drawerOriginalData);
    nestedTableEditingDataRef.current.set(tabId, drawerEditingData);

    // Revert form buffer to last saved/original
    if (formOriginalRowRef.current) {
      setFormEditingRow(cloneDeep(formOriginalRowRef.current));
    }

    // Show notification
    if (onDataChange) {
      onDataChange({
        severity: 'info',
        summary: 'Changes Discarded',
        detail: 'Unsaved changes in this nested table have been discarded.',
        life: 3000,
      });
    }
  }, [effectiveDrawerTabs, activeDrawerTabIndex, onDataChange]);

  // Check if main table has unsaved changes (use ref to avoid recalculating on every render)
  const hasMainTableChangesRef = useRef(false);
  const hasMainTableChanges = useMemo(() => {
    const originalData = mainTableOriginalDataRef.current;
    const editingData = mainTableEditingData;
    if (!isArray(originalData) || !isArray(editingData) || originalData.length !== editingData.length) {
      const hasChanges = originalData.length !== editingData.length;
      hasMainTableChangesRef.current = hasChanges;
      return hasChanges;
    }
    // Strip __nestedTables__ from editing before compare (original has none after save)
    const editingForCompare = editingData.map((row) => {
      if (row && typeof row === 'object' && '__nestedTables__' in row) {
        const { __nestedTables__, ...rest } = row;
        return rest;
      }
      return row;
    });
    try {
      const hasChanges = JSON.stringify(originalData) !== JSON.stringify(editingForCompare);
      hasMainTableChangesRef.current = hasChanges;
      return hasChanges;
    } catch (e) {
      return false;
    }
  }, [mainTableEditingData, mainTableOriginalVersion]);

  // Check if drawer has unsaved changes (nested tab only; form is computed on demand on Save/Close to avoid lag)
  const hasDrawerChangesRef = useRef(false);
  const hasDrawerChanges = useMemo(() => {
    let hasNestedChanges = false;
    if (effectiveDrawerTabs && effectiveDrawerTabs.length > 0) {
      const activeTab = effectiveDrawerTabs[activeDrawerTabIndex];
      if (activeTab?.isJsonTable) {
        const tabId = activeTab.id;
        const trackingData = originalNestedTableDataRef.current.get(tabId);
        if (trackingData) {
          const originalData = trackingData.originalData;
          const editingData = nestedTableEditingDataRef.current.get(tabId) || [];
          if (!isArray(originalData) || !isArray(editingData) || originalData.length !== editingData.length) {
            hasNestedChanges = originalData.length !== editingData.length;
          } else {
            try {
              hasNestedChanges = JSON.stringify(originalData) !== JSON.stringify(editingData);
            } catch (e) {
              hasNestedChanges = false;
            }
          }
        }
      }
    }
    hasDrawerChangesRef.current = hasNestedChanges;
    return hasNestedChanges;
  }, [effectiveDrawerTabs, activeDrawerTabIndex]);

  // On-demand: form or nested has unsaved changes (used only on Close to avoid recomputing on every keystroke)
  const getHasUnsavedDrawerChanges = useCallback(() => {
    let hasFormChanges = false;
    const currentFormRow = formEditingRowRef.current;
    if (scalarEditableColumns.length > 0 && currentFormRow && formOriginalRowRef.current) {
      try {
        hasFormChanges = JSON.stringify(currentFormRow) !== JSON.stringify(formOriginalRowRef.current);
      } catch (e) {}
    }
    let hasNestedChanges = false;
    if (effectiveDrawerTabs && effectiveDrawerTabs.length > 0) {
      const activeTab = effectiveDrawerTabs[activeDrawerTabIndex];
      if (activeTab?.isJsonTable) {
        const tabId = activeTab.id;
        const trackingData = originalNestedTableDataRef.current.get(tabId);
        if (trackingData) {
          const originalData = trackingData.originalData;
          const editingData = nestedTableEditingDataRef.current.get(tabId) || [];
          if (!isArray(originalData) || !isArray(editingData) || originalData.length !== editingData.length) {
            hasNestedChanges = originalData.length !== editingData.length;
          } else {
            try {
              hasNestedChanges = JSON.stringify(originalData) !== JSON.stringify(editingData);
            } catch (e) {}
          }
        }
      }
    }
    return hasFormChanges || hasNestedChanges;
  }, [effectiveDrawerTabs, activeDrawerTabIndex, scalarEditableColumns.length]);

  // Open drawer with nested JSON tables
  // Creates tabs dynamically for each nested table
  const openDrawerWithJsonTables = useCallback((nestedTables, rowData, tableOptions = null) => {
    if (!nestedTables || !isArray(nestedTables) || nestedTables.length === 0) {
      return;
    }

    // Store nested tables for drawer rendering
    setDrawerJsonTables(nestedTables);

    // Create drawer tabs dynamically - one per nested table
    // Get the parent column name from the first nested table's fieldName (which is the column name in main table)
    // All nested tables in __nestedTables__ come from the same parent column
    const parentColumnName = nestedTables[0]?.fieldName || null;
    const jsonTableTabs = nestedTables.map((nestedTable, index) => {
      const tabId = `json-table-${Date.now()}-${index}`;
      
      // Extract parent row editing key - CRITICAL: rowData must have __editingKey__ from tableData
      const parentRowEditingKey = rowData?.__editingKey__ || null;
      
      // Store original data for change tracking (deep clone to prevent reference issues)
      // Add __editingKey__ to drawer rows
      const originalData = nestedTable.data && isArray(nestedTable.data) 
        ? addEditingKeysToRows(cloneDeep(nestedTable.data))
        : [];
      
      originalNestedTableDataRef.current.set(tabId, {
        originalData,
        parentRowData: cloneDeep(rowData),
        parentRowEditingKey, // Store parent row editing key for lookup
        nestedTableFieldName: nestedTable.fieldName,
        parentColumnName: parentColumnName,
      });
      
      // Initialize editing data with original data (deep clone to preserve editing keys)
      nestedTableEditingDataRef.current.set(tabId, cloneDeep(originalData));
      
      let tabCols = nestedTable.data && isArray(nestedTable.data) && nestedTable.data.length > 0 && nestedTable.data[0]
        ? Object.keys(nestedTable.data[0]).filter(k => !String(k).startsWith('__'))
        : [];
      if (tabCols.length === 0) {
        const jtc = jsonTableColumns[nestedTable.fieldName];
        const nt = jtc?.nestedTables?.find(n => n.fieldName === nestedTable.fieldName);
        if (nt?.columns?.length) tabCols = nt.columns;
      }
      return {
        id: tabId,
        name: nestedTable.title || nestedTable.fieldName || `Table ${index + 1}`,
        data: nestedTable.data,
        fieldName: nestedTable.fieldName, // This is the nested table's fieldName (same as parentColumnName for first-level nested tables)
        parentColumnName: parentColumnName, // Store parent column name for nested editable columns lookup
        nestedTableFieldName: nestedTable.fieldName, // The nested table's own fieldName for lookup in editableColumns.nested
        isJsonTable: true, // Flag to identify JSON table tabs
        columns: tabCols,
      };
    });

    // Use the first nested table's data to open the drawer
    const firstTableData = nestedTables[0]?.data || [];
    
    // Set drawer header title from row data if available
    // Get first column value from rowData keys or use columns array
    let firstColumnValue = null;
    if (rowData && typeof rowData === 'object') {
      // Try to get first column from columns array if available
      if (columns && columns.length > 0) {
        firstColumnValue = getDataValue(rowData, columns[0]);
      } else {
        // Fallback: get first key from rowData (excluding special keys)
        const rowKeys = getDataKeys(rowData).filter(key => !key.startsWith('__'));
        if (rowKeys.length > 0) {
          firstColumnValue = getDataValue(rowData, rowKeys[0]);
        }
      }
    }
    const drawerTitle = firstColumnValue != null ? String(firstColumnValue) : 'Nested Tables';

    // Temporarily set drawer tabs to JSON table tabs
    // We'll need to handle this specially in the drawer rendering
    if (onDrawerTabsChange) {
      onDrawerTabsChange(jsonTableTabs);
    }

    // Pre-select the row we opened from so the scalar edit form has a row without requiring a separate selection
    setSelectedRowData(rowData || null);
    // Init form buffer (drawer not visible yet so wrapper would not run)
    if (rowData && scalarEditableColumns.length > 0) {
      formOriginalRowRef.current = cloneDeep(rowData);
      setFormEditingRow(cloneDeep(rowData));
    } else {
      formOriginalRowRef.current = null;
      setFormEditingRow(null);
    }

    // Open drawer with first table's data
    openDrawer(firstTableData, null, drawerTitle, tableOptions);
  }, [columns, onDrawerTabsChange, openDrawer, scalarEditableColumns, jsonTableColumns]);

  // Open drawer for new row (empty form + empty nested tables) - used by blue "+" in main table
  const openDrawerForNewRow = useCallback(() => {
    let nestedTables = [];

    // Build nested table structure from jsonTableColumns (when we have existing data with nested tables)
    const jsonMap = jsonTableColumns;
    if (jsonMap && typeof jsonMap === 'object' && Object.keys(jsonMap).length > 0) {
      Object.values(jsonMap).forEach((jsonInfo) => {
        if (jsonInfo?.nestedTables && isArray(jsonInfo.nestedTables)) {
          jsonInfo.nestedTables.forEach((nt) => {
            nestedTables.push({
              fieldName: nt.fieldName,
              title: nt.title || nt.fieldName,
              data: [],
              columns: nt.columns && isArray(nt.columns) ? nt.columns : [],
            });
          });
        }
      });
    }

    // Fallback when no data: use editableColumns.nested or writeSchema
    if (nestedTables.length === 0) {
      const nested = effectiveMainConfig.editableColumns?.nested;
      if (nested && typeof nested === 'object') {
        Object.entries(nested).forEach(([fieldName, nestedCols]) => {
          const cols = isArray(nestedCols) ? nestedCols : (nestedCols && typeof nestedCols === 'object' ? Object.keys(nestedCols) : []);
          nestedTables.push({
            fieldName,
            title: startCase(String(fieldName).replace(/_/g, ' ')),
            data: [],
            columns: cols,
          });
        });
      }
      if (nestedTables.length === 0 && currentQueryDoc?.writeSchema) {
        try {
          const schema = typeof currentQueryDoc.writeSchema === 'string'
            ? JSON.parse(currentQueryDoc.writeSchema)
            : currentQueryDoc.writeSchema;
          if (schema && typeof schema === 'object') {
            const visit = (obj, fieldPath = []) => {
              if (!obj || typeof obj !== 'object') return;
              Object.entries(obj).forEach(([k, v]) => {
                if (k === 'children' || (v && typeof v === 'object' && (v.types || v.children))) {
                  const child = v?.children || v;
                  if (child && typeof child === 'object' && !isArray(child)) {
                    const cols = Object.keys(child).filter(x => !x.startsWith('__'));
                    if (cols.length > 0) {
                      const fName = fieldPath.length > 0 ? fieldPath.join('_') : k;
                      nestedTables.push({
                        fieldName: fName,
                        title: startCase(String(fName).replace(/_/g, ' ')),
                        data: [],
                        columns: cols,
                      });
                    }
                    visit(child, [...fieldPath, k]);
                  }
                }
              });
            };
            visit(schema);
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    }

    if (nestedTables.length === 0) {
      if (onDataChange) {
        onDataChange({
          severity: 'warn',
          summary: 'Cannot add new row',
          detail: 'No nested table schema available. Add data first or configure editable columns.',
          life: 5000,
        });
      }
      return;
    }

    setDrawerJsonTables(nestedTables);
    const parentColumnName = nestedTables[0]?.fieldName || null;
    const jsonTableTabs = nestedTables.map((nestedTable, index) => {
      const tabId = `json-table-new-${Date.now()}-${index}`;
      originalNestedTableDataRef.current.set(tabId, {
        originalData: [],
        parentRowData: null,
        parentRowEditingKey: null,
        nestedTableFieldName: nestedTable.fieldName,
        parentColumnName,
      });
      nestedTableEditingDataRef.current.set(tabId, []);

      return {
        id: tabId,
        name: nestedTable.title || nestedTable.fieldName || `Table ${index + 1}`,
        data: [],
        fieldName: nestedTable.fieldName,
        parentColumnName,
        nestedTableFieldName: nestedTable.fieldName,
        isJsonTable: true,
        columns: nestedTable.columns && isArray(nestedTable.columns) ? nestedTable.columns : [],
      };
    });

    const emptyRow = {};
    scalarEditableColumns.forEach((col) => {
      const t = columnTypes[col] || 'string';
      if (t === 'number') emptyRow[col] = null;
      else if (t === 'boolean') emptyRow[col] = false;
      else if (t === 'date') emptyRow[col] = null;
      else emptyRow[col] = '';
    });
    const newEditingKey = `main_row_new_${Date.now()}`;
    emptyRow.__editingKey__ = newEditingKey;

    if (onDrawerTabsChange) {
      onDrawerTabsChange(jsonTableTabs);
    }
    setSelectedRowData(emptyRow);
    formOriginalRowRef.current = cloneDeep(emptyRow);
    setFormEditingRow(cloneDeep(emptyRow));
    const tableOptions = {
      editableColumns: effectiveMainConfig.editableColumns,
      enableCellEdit: true,
    };
    openDrawer([], null, 'New Row', tableOptions);
  }, [
    jsonTableColumns, effectiveMainConfig.editableColumns, currentQueryDoc, scalarEditableColumns,
    columnTypes, onDrawerTabsChange, openDrawer, onDataChange,
  ]);

  // Insert empty row at index 0 in nested table - used by blue "+" in drawer nested table context
  const handleAddNestedRowAtZero = useCallback((tabId) => {
    if (!tabId) return;
    const tab = (effectiveDrawerTabs || []).find(t => t.id === tabId);
    const cols = tab?.columns && isArray(tab.columns) ? tab.columns : [];
    const colTypes = columnTypes || {};
    const emptyRow = {};
    cols.forEach((col) => {
      const t = colTypes[col] || 'string';
      if (t === 'number') emptyRow[col] = null;
      else if (t === 'boolean') emptyRow[col] = false;
      else if (t === 'date') emptyRow[col] = null;
      else emptyRow[col] = '';
    });
    const withKey = addEditingKeysToRows([emptyRow])[0];
    const current = nestedTableEditingDataRef.current.get(tabId) || [];
    const updated = [withKey, ...current];
    nestedTableEditingDataRef.current.set(tabId, updated);
    onNestedBufferChange?.();
    setNestedTableUpdateCounter(c => c + 1);
  }, [effectiveDrawerTabs, columnTypes, addEditingKeysToRows, onNestedBufferChange]);

  // Export helper functions
  const formatHeaderName = useCallback((key) => {
    if (!key || key === null || key === undefined) {
      return '';
    }
    // Check if it's a percentage column
    const percentageConfig = percentageColumns.find(pc => pc.columnName === key);
    if (percentageConfig) {
      return percentageConfig.columnName;
    }
    return startCase(String(key).split('__').join(' ').split('_').join(' '));
  }, [percentageColumns]);

  const isTruthyBoolean = useCallback((value) => {
    return value === true || value === 1 || value === '1';
  }, []);

  // Helper to convert columnTypes string format to flag format for export
  const getColumnTypeFlags = useCallback((col) => {
    const typeString = columnTypes[col] || 'string';
    return {
      isBoolean: typeString === 'boolean',
      isNumeric: typeString === 'number',
      isDate: typeString === 'date',
      isText: typeString === 'string'
    };
  }, [columnTypes]);

  // Export to XLSX function
  const exportToXLSX = useCallback(() => {
    // Check if we're in report mode
    if (enableBreakdown && reportDataWithDerived) {
      // Use report export with merged headers
      // Pass effectiveGroupFields - function will extract first two for backward compatibility if needed
      const wb = exportReportToXLSX(
        reportDataWithDerived,
        columnGroupBy,
        effectiveGroupFields,
        formatHeaderName
      );

      // Generate filename with current date
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `export_${dateStr}.xlsx`;

      // Write file
      XLSX.writeFile(wb, filename);
      return;
    }

    // Regular export logic (non-report mode)
    let dataToExport;
    let allColumns;

    if (effectiveGroupFields.length > 0 && !isEmpty(groupedData)) {
      // Grouped mode: extract inner rows from each group
      const flattenedInnerRows = [];

      groupedData.forEach((groupRow) => {
        if (groupRow.__isGroupRow__ && groupRow.__groupRows__) {
          // Get group key from first group field or __groupKey__
          const firstGroupField = effectiveGroupFields[0];
          const groupKey = groupRow.__groupKey__ || (firstGroupField ? getDataValue(groupRow, firstGroupField) : null);

          groupRow.__groupRows__.forEach((innerRow) => {
            // Ensure all group field values are set (should already be in aggregated rows, but ensure it)
            const rowWithGroup = { ...innerRow };
            effectiveGroupFields.forEach((field, index) => {
              if (!rowWithGroup.hasOwnProperty(field)) {
                if (index === 0) {
                  rowWithGroup[field] = groupKey === '__null__' ? null : groupKey;
                } else {
                  // For nested levels, get from parent group row
                  const parentValue = getDataValue(groupRow, field);
                  rowWithGroup[field] = parentValue;
                }
              }
            });
            flattenedInnerRows.push(rowWithGroup);
          });
        }
      });

      dataToExport = flattenedInnerRows;

      // Collect all columns from flattened data
      const allDataColumns = isEmpty(dataToExport) ? [] : uniq(flatMap(dataToExport, (item) =>
        item && typeof item === 'object' ? getDataKeys(item) : []
      ));

      // In grouped mode, filter to only include numeric columns (plus group fields, percentage columns, and derived columns)
      const derivedColNamesMain = getDerivedColumnNames(derivedColumns || [], 'main');
      allColumns = allDataColumns.filter((col) => {
        // Always include all group fields
        if (effectiveGroupFields.includes(col)) return true;

        // Always include percentage columns (they're numeric)
        if (isPercentageColumn(col)) return true;

        // Always include derived columns
        if (derivedColNamesMain.includes(col)) return true;

        // Include numeric columns
        const colTypeFlags = getColumnTypeFlags(col);
        return colTypeFlags.isNumeric;
      });
    } else {
      // Normal mode: use sortedData (full dataset) and compute percentage columns
      dataToExport = sortedData.map((row) => {
        const rowWithPercentages = { ...row };

        // Compute percentage columns if configured
        if (hasPercentageColumns && percentageColumns) {
          percentageColumns.forEach(pc => {
            if (pc.columnName && pc.targetField && pc.valueField) {
              // Compute percentage value for this row
              const percentageValue = getPercentageColumnValue(row, pc.columnName);
              rowWithPercentages[pc.columnName] = percentageValue;
            }
          });
        }

        return rowWithPercentages;
      });

      // Collect columns from data plus percentage columns
      const dataColumns = isEmpty(dataToExport) ? [] : uniq(flatMap(dataToExport, (item) =>
        item && typeof item === 'object' ? getDataKeys(item) : []
      ));

      // Add percentage columns and derived columns explicitly (in case they're null/undefined and don't appear as keys)
      const percentageColNames = hasPercentageColumns && percentageColumns
        ? percentageColumns.map(pc => pc.columnName).filter(Boolean)
        : [];
      const derivedColNames = getDerivedColumnNames(derivedColumns || [], 'main');

      allColumns = uniq([...dataColumns, ...percentageColNames, ...derivedColNames]);
    }

    // Format and export data (same logic for both modes)
    const exportData = dataToExport.map((row) => {
      const exportRow = {};
      allColumns.forEach((col) => {
        // For percentage columns, the value might already be computed (grouped mode) or we need to compute it (normal mode)
        // But since we computed it in normal mode above, we can just get it from the row
        let value = getDataValue(row, col);

        // If value is still null/undefined and it's a percentage column, try computing it
        if (isNil(value) && isPercentageColumn(col)) {
          value = getPercentageColumnValue(row, col);
        }

        const colTypeFlags = getColumnTypeFlags(col);

        // Format the value for export
        if (isNil(value)) {
          exportRow[formatHeaderName(col)] = '';
        } else if (colTypeFlags.isBoolean) {
          exportRow[formatHeaderName(col)] = isTruthyBoolean(value) ? 'Yes' : 'No';
        } else if (colTypeFlags.isDate) {
          exportRow[formatHeaderName(col)] = formatDateValue(value);
        } else {
          // Check if it's a percentage column or numeric value
          const isPctCol = isPercentageColumn(col);
          const isNumeric = isPctCol || colTypeFlags.isNumeric || (typeof value === 'number' && Number.isFinite(value));

          if (isNumeric) {
            // For numeric columns (including percentage columns), ensure we write real numbers
            const numeric = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
            exportRow[formatHeaderName(col)] = Number.isFinite(numeric) ? numeric : String(value);
          } else {
            // Non-numeric columns: keep as plain string
            exportRow[formatHeaderName(col)] = String(value);
          }
        }
      });
      return exportRow;
    });

    // Create workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    // Generate filename with current date
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `export_${dateStr}.xlsx`;

    // Write file
    XLSX.writeFile(wb, filename);
  }, [enableBreakdown, reportDataWithDerived, columnGroupBy, sortedData, groupedData, effectiveGroupFields, hasPercentageColumns, percentageColumns, isPercentageColumn, getPercentageColumnValue, formatHeaderName, isTruthyBoolean, formatDateValue, getColumnTypeFlags]);

  // Create slot-scoped context (flat object for each slot; for single-slot, all slots share same data)
  const slotContextData = useMemo(() => {
    try {
      return {
        rawData: mainTableEditingData, // Use editingData state for reactivity (triggers updates when changed)
        columns: filteredColumns, // Expose filtered columns (respecting allowedColumns)
        columnTypes,
        columnTypesOverride, // shared
        filteredData,
        groupedData,
        sortedData,
        paginatedData,
        sums: calculateSums,
        getSums,
        filterOptions: optionColumnValues,
        multiselectColumns,
        hasPercentageColumns,
        percentageColumns: effectiveMainConfig.percentageColumns,
        percentageColumnNames,
        isPercentageColumn,
        derivedColumns: effectiveMainConfig.derivedColumns,
        getPercentageColumnValue,
        getPercentageColumnSortFunction,
        filters: tableFilters,
        sortMeta: tableSortMeta,
        pagination: tablePagination,
        expandedRows: tableExpandedRows,
        visibleColumns: tableVisibleColumns,
        enableSort: effectiveMainConfig.enableSort,
        enableFilter: effectiveMainConfig.enableFilter,
        enableSummation: effectiveMainConfig.enableSummation,
        enableGrouping: effectiveMainConfig.enableGrouping,
        textFilterColumns: effectiveMainConfig.textFilterColumns,
        effectiveGroupFields, // Array of group fields for multi-level nesting
        redFields: effectiveMainConfig.redFields,
        greenFields: effectiveMainConfig.greenFields,
        enableDivideBy1Lakh, // shared
        enableReport, // shared
        enableBreakdown,
        reportData: reportDataWithDerived,
        isComputingReport,
        isApplyingFilterSort,
        chartColumns, // shared
        chartHeight, // shared
        // Unified loading state
        isLoading: (() => {
          return isComputingReport || isApplyingFilterSort;
        })(),
        loadingText: (() => {
          return isComputingReport
            ? 'Computing report...'
            : isApplyingFilterSort
              ? 'Applying Filter and Sort...'
              : '';
        })(),
        columnGroupBy,
        updateFilter,
        clearFilter,
        clearAllFilters,
        updateSort,
        updatePagination,
        updateExpandedRows,
        updateVisibleColumns,
        drawerVisible,
        drawerData,
        drawerTabs: effectiveMainConfig.drawerTabs,
        activeDrawerTabIndex,
        clickedDrawerValues,
        openDrawer,
        openDrawerWithData,
        openDrawerForOuterGroup,
        openDrawerForInnerGroup,
        openDrawerWithJsonTables,
        openDrawerForNewRow,
        handleAddNestedRowAtZero: parentHandleAddNestedRowAtZero || handleAddNestedRowAtZero,
        closeDrawer,
        addDrawerTab,
        removeDrawerTab,
        updateDrawerTab,
        drawerTabs: effectiveMainConfig.drawerTabs,
        setActiveDrawerTabIndex,
        selectedRowData,
        setSelectedRowData: setSelectedRowDataWithFormSync,
        formatDateValue,
        formatHeaderName,
        isTruthyBoolean,
        exportToXLSX,
        parseNumericFilter,
        applyNumericFilter,
        applyDateFilter,
        isNumericValue,
        // Search and sort props
        clientSave: currentQueryDoc?.clientSave || false,
        searchFields: currentQueryDoc?.searchFields || null,
        sortFields: currentQueryDoc?.sortFields || null,
        searchTerm,
        setSearchTerm,
        sortConfig,
        setSortConfig,
        // Enable write flag - use forceEnableWrite if provided (for nested drawer tables), otherwise use currentQueryDoc
        enableWrite: forceEnableWrite !== undefined ? forceEnableWrite : (currentQueryDoc?.enableWrite || false),
        // Nested table context for editable columns lookup
        parentColumnName,
        nestedTableFieldName,
        nestedTableTabId,
        // Change tracking for nested tables
        updateCurrentNestedTableData,
        getChangedRowsForTab,
        getAllChangedNestedTableRows,
        // Use parent's handleDrawerSave if available (for nested drawer tables), otherwise use local one
        handleDrawerSave: parentHandleDrawerSave || handleDrawerSave,
        handleMainSave,
        handleMainCancel,
        handleDrawerCancel,
        hasMainTableChanges,
        hasDrawerChanges,
        // Main table editing buffer update function
        updateMainTableEditingData,
        // Read-only access to original buffer for comparison
        mainTableOriginalData: mainTableOriginalDataRef.current,
        // Data control: availableQueryKeys and executingQuery for DataTableControls
        availableQueryKeys,
        executingQuery,
      };
    } catch (error) {
      console.error('DataProviderNew: Error creating slotContextData', error);
      return {};
    }
  }, [
    sortedData, columns, columnTypes, filteredData, groupedData, paginatedData,
    calculateSums, getSums, optionColumnValues, multiselectColumns, hasPercentageColumns, percentageColumnNames,
    isPercentageColumn, getPercentageColumnValue, getPercentageColumnSortFunction, tableFilters, tableSortMeta, tablePagination,
    tableExpandedRows, tableVisibleColumns, effectiveGroupFields,
    updateFilter, clearFilter, clearAllFilters, updateSort, updatePagination, updateExpandedRows,
    updateVisibleColumns, drawerVisible, drawerData, activeDrawerTabIndex, clickedDrawerValues,
    openDrawer, openDrawerWithData, openDrawerForOuterGroup, openDrawerForInnerGroup, openDrawerWithJsonTables, openDrawerForNewRow, handleAddNestedRowAtZero, closeDrawer, addDrawerTab, removeDrawerTab, updateDrawerTab,
    selectedRowData, setSelectedRowDataWithFormSync,
    formatHeaderName, isTruthyBoolean, exportToXLSX, isNumericValue, currentQueryDoc, searchTerm, sortConfig, enableBreakdown, reportData, isComputingReport, isApplyingFilterSort, columnGroupBy, filteredColumns, parentColumnName, nestedTableFieldName, nestedTableTabId,
    updateCurrentNestedTableData, getChangedRowsForTab, getAllChangedNestedTableRows, handleDrawerSave, handleMainSave, handleMainCancel, handleDrawerCancel, hasMainTableChanges, hasDrawerChanges, updateMainTableEditingData, forceEnableWrite, parentHandleDrawerSave, parentHandleAddNestedRowAtZero, addEditingKeysToRows, mainTableEditingData,
    availableQueryKeys, executingQuery, effectiveMainConfig, columnTypesOverride, enableDivideBy1Lakh, enableReport, chartColumns, chartHeight
  ]);

  // When multi-slot, build per-slot context from pipelinesBySlot with slot-scoped handlers
  const slotContextMap = useMemo(() => {
    if (!isMultiSlot || !pipelinesBySlot || Object.keys(pipelinesBySlot).length === 0) return {};
    const map = {};
    for (const slotId of slotIds) {
      const pSlot = pipelinesBySlot[slotId];
      if (!pSlot) continue;
      const slotConfig = slots[slotId] ?? {};
      const effectiveSlotConfig = { ...effectiveMainConfig, ...slotConfig };
      const slotFilters = tableFiltersBySlot[slotId] ?? {};
      const slotSortMeta = tableSortMetaBySlot[slotId] ?? [];
      const slotPagination = tablePaginationBySlot[slotId] ?? { first: 0, rows: 10 };
      const slotExpandedRows = tableExpandedRowsBySlot[slotId] ?? null;
      const slotVisibleColumns = tableVisibleColumnsBySlot[slotId] ?? tableVisibleColumns ?? [];
      const meta = pSlot.pipelineColumnMeta || {};
      const slotFilteredData = pSlot.filteredData ?? [];
      const getSumsForSlot = (dataOrFilters, filters) => {
        if (dataOrFilters === undefined && filters === undefined) return getSums(slotFilteredData);
        if (isArray(dataOrFilters)) return getSums(dataOrFilters, filters);
        return getSums(slotFilteredData, dataOrFilters);
      };
      const slotCalculateSums = getSumsForSlot();
      map[slotId] = {
        rawData: mainTableEditingData,
        columns: meta.filteredColumns ?? [],
        columnTypes: meta.columnTypes ?? columnTypes,
        columnTypesOverride,
        filteredData: pSlot.filteredData,
        groupedData: pSlot.groupedData,
        sortedData: pSlot.sortedData,
        paginatedData: pSlot.paginatedData,
        sums: slotCalculateSums,
        getSums: getSumsForSlot,
        filterOptions: pSlot.optionColumnValues ?? {},
        multiselectColumns: meta.multiselectColumns ?? multiselectColumns,
        hasPercentageColumns: meta.hasPercentageColumns ?? hasPercentageColumns,
        percentageColumns: effectiveSlotConfig.percentageColumns,
        percentageColumnNames: meta.percentageColumnNames ?? percentageColumnNames,
        isPercentageColumn: (col) => (meta.hasPercentageColumns && (effectiveSlotConfig.percentageColumns || []).some((pc) => pc?.columnName === col)),
        derivedColumns: effectiveSlotConfig.derivedColumns,
        getPercentageColumnValue,
        getPercentageColumnSortFunction,
        filters: slotFilters,
        sortMeta: slotSortMeta,
        pagination: slotPagination,
        expandedRows: slotExpandedRows,
        visibleColumns: slotVisibleColumns,
        enableSort: effectiveSlotConfig.enableSort,
        enableFilter: effectiveSlotConfig.enableFilter,
        enableSummation: effectiveSlotConfig.enableSummation,
        enableGrouping: effectiveSlotConfig.enableGrouping,
        textFilterColumns: effectiveSlotConfig.textFilterColumns,
        effectiveGroupFields: pSlot.effectiveGroupFields ?? [],
        redFields: effectiveSlotConfig.redFields,
        greenFields: effectiveSlotConfig.greenFields,
        enableDivideBy1Lakh,
        enableReport,
        enableBreakdown,
        reportData: reportDataWithDerived,
        isComputingReport,
        isApplyingFilterSort,
        chartColumns,
        chartHeight,
        isLoading: isComputingReport || isApplyingFilterSort,
        loadingText: isComputingReport ? 'Computing report...' : (isApplyingFilterSort ? 'Applying Filter and Sort...' : ''),
        columnGroupBy,
        updateFilter: (col, val) => updateFilterForSlot(slotId, col, val),
        clearFilter: (col) => clearFilterForSlot(slotId, col),
        clearAllFilters: () => clearAllFiltersForSlot(slotId),
        updateSort: (sortMeta) => updateSortForSlot(slotId, sortMeta),
        updatePagination: (first, rows) => updatePaginationForSlot(slotId, first, rows),
        updateExpandedRows: (rows) => updateExpandedRowsForSlot(slotId, rows),
        updateVisibleColumns: (cols) => updateVisibleColumnsForSlot(slotId, cols),
        drawerVisible,
        drawerData,
        drawerTabs: effectiveSlotConfig.drawerTabs,
        activeDrawerTabIndex,
        clickedDrawerValues,
        openDrawer,
        openDrawerWithData,
        openDrawerForOuterGroup,
        openDrawerForInnerGroup,
        openDrawerWithJsonTables,
        openDrawerForNewRow,
        handleAddNestedRowAtZero: parentHandleAddNestedRowAtZero || handleAddNestedRowAtZero,
        closeDrawer,
        addDrawerTab,
        removeDrawerTab,
        updateDrawerTab,
        setActiveDrawerTabIndex,
        selectedRowData,
        setSelectedRowData: setSelectedRowDataWithFormSync,
        formatDateValue,
        formatHeaderName,
        isTruthyBoolean,
        exportToXLSX,
        parseNumericFilter,
        applyNumericFilter,
        applyDateFilter,
        isNumericValue,
        clientSave: currentQueryDoc?.clientSave || false,
        searchFields: currentQueryDoc?.searchFields || null,
        sortFields: currentQueryDoc?.sortFields || null,
        searchTerm,
        setSearchTerm,
        sortConfig,
        setSortConfig,
        enableWrite: forceEnableWrite !== undefined ? forceEnableWrite : (currentQueryDoc?.enableWrite || false),
        parentColumnName,
        nestedTableFieldName,
        nestedTableTabId,
        updateCurrentNestedTableData,
        getChangedRowsForTab,
        getAllChangedNestedTableRows,
        handleDrawerSave: parentHandleDrawerSave || handleDrawerSave,
        handleMainSave,
        handleMainCancel,
        handleDrawerCancel,
        hasMainTableChanges,
        hasDrawerChanges,
        updateMainTableEditingData,
        mainTableOriginalData: mainTableOriginalDataRef.current,
        availableQueryKeys,
        executingQuery,
      };
    }
    return map;
  }, [
    isMultiSlot, slotIds, pipelinesBySlot, slots, effectiveMainConfig,
    tableFiltersBySlot, tableSortMetaBySlot, tablePaginationBySlot, tableExpandedRowsBySlot, tableVisibleColumnsBySlot, tableVisibleColumns,
    updateFilterForSlot, clearFilterForSlot, clearAllFiltersForSlot, updateSortForSlot, updatePaginationForSlot, updateExpandedRowsForSlot, updateVisibleColumnsForSlot,
    getSums, mainTableEditingData, columnTypes, columnTypesOverride, multiselectColumns, hasPercentageColumns, percentageColumnNames, getPercentageColumnValue, getPercentageColumnSortFunction,
    reportDataWithDerived, isComputingReport, isApplyingFilterSort, chartColumns, chartHeight, columnGroupBy,
    drawerVisible, drawerData, activeDrawerTabIndex, clickedDrawerValues,
    openDrawer, openDrawerWithData, openDrawerForOuterGroup, openDrawerForInnerGroup, openDrawerWithJsonTables, openDrawerForNewRow,
    parentHandleAddNestedRowAtZero, selectedRowData, setSelectedRowDataWithFormSync,
    formatDateValue, formatHeaderName, isTruthyBoolean, exportToXLSX, isNumericValue,
    currentQueryDoc, searchTerm, sortConfig, forceEnableWrite, parentColumnName, nestedTableFieldName, nestedTableTabId,
    updateCurrentNestedTableData, getChangedRowsForTab, getAllChangedNestedTableRows, parentHandleDrawerSave,
    handleMainSave, handleMainCancel, handleDrawerCancel, hasMainTableChanges, hasDrawerChanges, updateMainTableEditingData,
    availableQueryKeys, executingQuery,
  ]);

  // Build single context as slot map: { main: {...}, salesTeamHq: {...}, ... }
  const contextValue = useMemo(() => {
    const singleData = slotContextData || {};
    const multiMap = slotContextMap || {};
    if (isMultiSlot && Object.keys(multiMap).length > 0) {
      return multiMap;
    }
    return { main: singleData };
  }, [slotContextData, slotContextMap, isMultiSlot]);

  // Memoize field display names to avoid recalculating on every render
  const fieldDisplayNames = useMemo(() => {
    const names = {};
    const searchFields = currentQueryDoc?.searchFields || {};
    for (const topLevelKey of Object.keys(searchFields)) {
      const nestedPaths = searchFields[topLevelKey];
      if (Array.isArray(nestedPaths)) {
        for (const nestedPath of nestedPaths) {
          const key = nestedPath || topLevelKey;
          names[key] = startCase(nestedPath || topLevelKey);
        }
      }
    }
    return names;
  }, [currentQueryDoc?.searchFields]);

  // Determine picker mode based on enableBreakdown, breakdownType, and columnGroupBy
  const getPickerMode = () => {
    if (!enableBreakdown) return 'month'; // Keep current behavior when breakdown is off
    if (columnGroupBy === 'period-over-period') return 'year'; // Override for period-over-period
    // Map breakdownType to mode
    switch (breakdownType) {
      case 'month': return 'month';
      case 'week': return 'week';
      case 'day': return 'date';
      case 'quarter': return 'quarter';
      case 'annual': return 'year';
      default: return 'month';
    }
  };

  const pickerMode = getPickerMode();

  // Get placeholder based on mode
  const getPickerPlaceholder = () => {
    switch (pickerMode) {
      case 'month': return ['Start month', 'End month'];
      case 'week': return ['Start week', 'End week'];
      case 'date': return ['Start date', 'End date'];
      case 'quarter': return ['Start quarter', 'End quarter'];
      case 'year': return ['Start year', 'End year'];
      default: return ['Start month', 'End month'];
    }
  };

  // Conditional rendering helpers
  const isValidMonthRange = monthRange && Array.isArray(monthRange) && monthRange.length === 2;
  const headerEnabled = showProviderHeader !== false;
  const showMonthRangePicker = headerEnabled && dataSource && hasMonthSupport;
  const showBreakdownToggle = headerEnabled && enableReport;
  const showBreakdownControls = headerEnabled && enableBreakdown && dateColumn;
  const showSyncButton = headerEnabled && dataSource; // Show sync button for all query data sources (not offline)
  const isSyncDisabled = executingQuery || (hasMonthSupport && !isValidMonthRange);
  const syncIconClass = executingQuery ? 'pi pi-spin pi-spinner' : 'pi pi-refresh';
  const lastUpdatedText = lastUpdatedAt ? formatLastUpdatedDate(lastUpdatedAt) : 'N/A';

  // Check if header should be shown (if any selectors are visible)
  const hasHeaderContent = headerEnabled && (showMonthRangePicker || showBreakdownToggle || showBreakdownControls ||
    showSyncButton);

  // Render selectors JSX with enhanced responsive classes
  const selectorsJSX = (
    <>
      <div className="flex flex-col gap-2 sm:gap-3 md:gap-4 w-full min-w-0">
        {/* Desktop Layout - Keep existing flex-wrap behavior */}
        <div className="hidden sm:flex flex-row items-end justify-between w-full gap-2 sm:gap-3 md:gap-4">
          <div className="flex flex-row items-end gap-2 sm:gap-3 md:gap-4 flex-wrap">
            <div className='flex flex-row gap-2 sm:gap-3 md:gap-4 w-auto'>
              <div className='flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4'>
                {/* Breakdown Toggle - Only show when report is enabled */}
                {showBreakdownToggle && (
                  <div className="flex items-center gap-2">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap">
                      Report
                    </label>
                    <Switch
                      checked={enableBreakdown}
                      onChange={(checked) => {
                        setEnableBreakdown(checked);
                      }}
                      size={isMobile ? 'small' : 'default'}
                      disabled={isComputingReport}
                    />
                  </div>
                )}

                {/* Breakdown By - Only show when report is enabled, breakdown toggle is on, and date column is set */}
                {showBreakdownControls && (
                  <div className="w-auto min-w-[120px]">
                    <Dropdown
                      value={breakdownType}
                      onChange={(e) => setBreakdownType(e.value)}
                      options={[
                        { label: 'Month', value: 'month' },
                        { label: 'Week', value: 'week' },
                        { label: 'Day', value: 'day' },
                        { label: 'Quarter', value: 'quarter' },
                        { label: 'Year', value: 'annual' }
                      ]}
                      optionLabel="label"
                      optionValue="value"
                      className="w-full items-center"
                      disabled={executingQuery}
                      style={{
                        fontSize: '0.875rem',
                        height: '2rem',
                      }}
                    />
                  </div>
                )}

                {/* Column Group By - Only show when report is enabled and date column is set */}
                {showBreakdownControls && (
                  <div className="w-auto min-w-[120px]">
                    <Dropdown
                      value={columnGroupBy}
                      onChange={(e) => setColumnGroupBy(e.value)}
                      options={[
                        { label: 'Values', value: 'values' },
                        { label: startCase(dateColumn.split('__').join(' ').split('_').join(' ')), value: dateColumn },
                        { label: 'Period-over-Period', value: 'period-over-period' }
                      ]}
                      optionLabel="label"
                      optionValue="value"
                      className="w-full items-center"
                      disabled={executingQuery}
                      style={{
                        fontSize: '0.875rem',
                        height: '2rem',
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Range Picker - Only show when using saved query that supports month filtering */}
            {showMonthRangePicker && (
              <div className="w-64 md:w-72 lg:w-80 min-w-0 shrink-0">
                <RangePicker
                  key={`${dataSource}-${pickerMode}`} // Force re-render when data source or mode changes
                  value={monthRange}
                  onChange={(dates) => {
                    if (dates && dates[0] && dates[1]) {
                      setMonthRange([dates[0], dates[1]]);
                    } else {
                      setMonthRange(null);
                    }
                  }}
                  placeholder={getPickerPlaceholder()}
                  format="MM/YY"
                  mode={pickerMode}
                  disabled={executingQuery}
                  className="w-full"
                  style={{
                    width: '100%',
                    fontSize: '0.875rem',
                    height: '2rem',
                  }}
                />
              </div>
            )}
            {/* Last Updated at with Sync button - Show when using saved query, in a new row below Data Source */}
            {showSyncButton && (
              <div className="flex-1 min-w-0">
                <SplitButton
                  outlined
                  severity="secondary"
                  label={<span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{lastUpdatedText}</span>}
                  icon={syncIconClass}
                  onClick={handleSync}
                  model={[
                    {
                      label: 'Hard Refresh',
                      icon: 'pi pi-sync',
                      command: () => {
                        handleClearMonthRangeCache();
                      }
                    }
                  ]}
                  disabled={isSyncDisabled}
                  style={{ height: '2rem', minWidth: 'fit-content' }}
                />
              </div>
            )}
            {/* Filter and Sort Button - Only show when clientSave === true */}
            {currentQueryDoc?.clientSave === true &&
              (Object.keys(currentQueryDoc?.searchFields || {}).length > 0 || currentQueryDoc?.sortFields) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    icon="pi pi-sliders-h"
                    label="Filter / Sort"
                    onClick={() => setFilterSortSidebarVisible(true)}
                    className="p-button-outlined"
                    severity="secondary"
                    style={{ height: '2rem', fontSize: '0.875rem' }}
                  >
                    {(() => {
                      // Calculate active filter count
                      let count = 0;
                      if (sortConfig && sortConfig.field) count += 1;
                      Object.values(preFilterValues).forEach(vals => {
                        if (Array.isArray(vals) && vals.length > 0) {
                          count += vals.length;
                        }
                      });
                      return count > 0 ? <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">{count}</span> : null;
                    })()}
                  </Button>

                  {/* Applied Sort Button */}
                  {sortConfig && sortConfig.field && (() => {
                    const fieldName = sortConfig.field.split('.').pop();
                    const displayName = startCase(fieldName);
                    const fieldType = columnTypes[fieldName] || 'string';
                    let directionLabel = '';
                    if (fieldType === 'date') {
                      directionLabel = sortConfig.direction === 'asc' ? 'Oldest to Latest' : 'Latest to Oldest';
                    } else if (fieldType === 'number') {
                      directionLabel = sortConfig.direction === 'asc' ? 'Low to High' : 'High to Low';
                    } else {
                      directionLabel = sortConfig.direction === 'asc' ? 'A to Z' : 'Z to A';
                    }
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setIsApplyingFilterSort(true);
                          setSortConfig(null);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md hover:opacity-80 transition-opacity border"
                        style={{
                          height: '2rem',
                          backgroundColor: '#db2d27',
                          color: 'white',
                          borderColor: '#db2d27'
                        }}
                        title="Remove sort"
                      >
                        <i className="pi pi-sort text-xs"></i>
                        <span>{displayName} - {directionLabel}</span>
                        <i className="pi pi-times text-xs"></i>
                      </button>
                    );
                  })()}

                  {/* Applied Filter Value Buttons */}
                  {Object.entries(preFilterValues).map(([fieldKey, values]) => {
                    if (!Array.isArray(values) || values.length === 0) return null;

                    // Get display name for field (use memoized map or fallback to startCase)
                    const fieldDisplayName = fieldDisplayNames[fieldKey] || startCase(fieldKey);

                    return values.map((value, idx) => (
                      <button
                        key={`${fieldKey}-${value}-${idx}`}
                        type="button"
                        onClick={() => {
                          setIsApplyingFilterSort(true);
                          setPreFilterValues(prev => {
                            const newValues = { ...prev };
                            if (newValues[fieldKey]) {
                              newValues[fieldKey] = newValues[fieldKey].filter(v => v !== value);
                              if (newValues[fieldKey].length === 0) {
                                delete newValues[fieldKey];
                              }
                            }
                            return newValues;
                          });
                        }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md hover:opacity-80 transition-opacity border"
                        style={{
                          height: '2rem',
                          backgroundColor: '#db2d27',
                          color: 'white',
                          borderColor: '#db2d27'
                        }}
                        title="Remove filter"
                      >
                        <i className="pi pi-filter text-xs"></i>
                        <span>{fieldDisplayName}: {value}</span>
                        <i className="pi pi-times text-xs"></i>
                      </button>
                    ));
                  })}
                </div>
              )}
          </div>
        </div>

        {/* Mobile Layout - 3 distinct rows */}
        <div className="flex sm:hidden flex-col gap-4 w-full">
          {/* Row 1: Report toggle, Breakdown type, Grouping */}
          {(showBreakdownToggle || showBreakdownControls) && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Breakdown Toggle - Only show when report is enabled */}
              {showBreakdownToggle && (
                <div className="flex items-center gap-2">
                  <label className="block text-xs font-medium text-gray-700 whitespace-nowrap">
                    Report
                  </label>
                  <Switch
                    checked={enableBreakdown}
                    onChange={(checked) => {
                      setEnableBreakdown(checked);
                    }}
                    size="small"
                    disabled={isComputingReport}
                  />
                </div>
              )}

              {/* Breakdown By - Only show when report is enabled, breakdown toggle is on, and date column is set */}
              {showBreakdownControls && (
                <div className="flex-1">
                  <Dropdown
                    value={breakdownType}
                    onChange={(e) => setBreakdownType(e.value)}
                    options={[
                      { label: 'Month', value: 'month' },
                      { label: 'Week', value: 'week' },
                      { label: 'Day', value: 'day' },
                      { label: 'Quarter', value: 'quarter' },
                      { label: 'Year', value: 'annual' }
                    ]}
                    optionLabel="label"
                    optionValue="value"
                    className="w-full items-center"
                    disabled={executingQuery}
                    style={{
                      fontSize: '0.875rem',
                      height: '2rem',
                    }}
                  />
                </div>
              )}

              {/* Column Group By - Only show when report is enabled and date column is set */}
              {showBreakdownControls && (
                <div className="flex-1">
                  <Dropdown
                    value={columnGroupBy}
                    onChange={(e) => setColumnGroupBy(e.value)}
                    options={[
                      { label: 'Values', value: 'values' },
                      { label: startCase(dateColumn.split('__').join(' ').split('_').join(' ')), value: dateColumn },
                      { label: 'Period-over-Period', value: 'period-over-period' }
                    ]}
                    optionLabel="label"
                    optionValue="value"
                    className="w-full items-center"
                    disabled={executingQuery}
                    style={{
                      fontSize: '0.875rem',
                      height: '2rem',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Row 2: Range picker, Sync button */}
          {(showMonthRangePicker || showSyncButton) && (
            <div className="flex items-center gap-2">
              {/* Range Picker - Only show when using saved query that supports month filtering */}
              {showMonthRangePicker && (
                <RangePicker
                  key={`${dataSource}-${pickerMode}`} // Force re-render when data source or mode changes
                  value={monthRange}
                  onChange={(dates) => {
                    if (dates && dates[0] && dates[1]) {
                      setMonthRange([dates[0], dates[1]]);
                    } else {
                      setMonthRange(null);
                    }
                  }}
                  placeholder={getPickerPlaceholder()}
                  format="MM/YY"
                  mode={pickerMode}
                  disabled={executingQuery}
                  className="w-full"
                  style={{
                    fontSize: '0.875rem',
                    height: '2rem',
                  }}
                />
              )}
              {/* Last Updated at with Sync button - Show when using saved query */}
              {showSyncButton && (
                <div className="w-full">
                  <SplitButton
                    outlined
                    severity="secondary"
                    label={<span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{lastUpdatedText}</span>}
                    icon={syncIconClass}
                    onClick={handleSync}
                    model={[
                      {
                        label: 'Hard Refresh',
                        icon: 'pi pi-sync',
                        command: () => {
                          handleClearMonthRangeCache();
                        }
                      }
                    ]}
                    disabled={isSyncDisabled}
                    style={{ height: '2rem', minWidth: 'fit-content' }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Row 3: Filter and Sort button + applied filter buttons (with horizontal scroll) */}
          {currentQueryDoc?.clientSave === true &&
            (Object.keys(currentQueryDoc?.searchFields || {}).length > 0 || currentQueryDoc?.sortFields) && (
              <div className="flex items-center gap-2 w-full min-w-0">
                <Button
                  icon="pi pi-sliders-h"
                  label="Filter and Sort"
                  onClick={() => setFilterSortSidebarVisible(true)}
                  className="p-button-outlined shrink-0"
                  severity="secondary"
                  style={{ height: '2rem', fontSize: '0.875rem' }}
                >
                  {(() => {
                    // Calculate active filter count
                    let count = 0;
                    if (sortConfig && sortConfig.field) count += 1;
                    Object.values(preFilterValues).forEach(vals => {
                      if (Array.isArray(vals) && vals.length > 0) {
                        count += vals.length;
                      }
                    });
                    return count > 0 ? <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">{count}</span> : null;
                  })()}
                </Button>

                {/* Scrollable container for applied filters */}
                <div className="flex-1 min-w-0 overflow-x-auto">
                  <div className="flex items-center gap-2 flex-nowrap">
                    {/* Applied Sort Button */}
                    {sortConfig && sortConfig.field && (() => {
                      const fieldName = sortConfig.field.split('.').pop();
                      const displayName = startCase(fieldName);
                      const fieldType = columnTypes[fieldName] || 'string';
                      let directionLabel = '';
                      if (fieldType === 'date') {
                        directionLabel = sortConfig.direction === 'asc' ? 'Oldest to Latest' : 'Latest to Oldest';
                      } else if (fieldType === 'number') {
                        directionLabel = sortConfig.direction === 'asc' ? 'Low to High' : 'High to Low';
                      } else {
                        directionLabel = sortConfig.direction === 'asc' ? 'A to Z' : 'Z to A';
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            setIsApplyingFilterSort(true);
                            setSortConfig(null);
                          }}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md hover:opacity-80 transition-opacity border shrink-0"
                          style={{
                            height: '2rem',
                            backgroundColor: '#db2d27',
                            color: 'white',
                            borderColor: '#db2d27'
                          }}
                          title="Remove sort"
                        >
                          <i className="pi pi-sort text-xs"></i>
                          <span>{displayName} - {directionLabel}</span>
                          <i className="pi pi-times text-xs"></i>
                        </button>
                      );
                    })()}

                    {/* Applied Filter Value Buttons */}
                    {Object.entries(preFilterValues).map(([fieldKey, values]) => {
                      if (!Array.isArray(values) || values.length === 0) return null;

                      // Get display name for field (use memoized map or fallback to startCase)
                      const fieldDisplayName = fieldDisplayNames[fieldKey] || startCase(fieldKey);

                      return values.map((value, idx) => (
                        <button
                          key={`${fieldKey}-${value}-${idx}`}
                          type="button"
                          onClick={() => {
                            setIsApplyingFilterSort(true);
                            setPreFilterValues(prev => {
                              const newValues = { ...prev };
                              if (newValues[fieldKey]) {
                                newValues[fieldKey] = newValues[fieldKey].filter(v => v !== value);
                                if (newValues[fieldKey].length === 0) {
                                  delete newValues[fieldKey];
                                }
                              }
                              return newValues;
                            });
                          }}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md hover:opacity-80 transition-opacity border shrink-0"
                          style={{
                            height: '2rem',
                            backgroundColor: '#db2d27',
                            color: 'white',
                            borderColor: '#db2d27'
                          }}
                          title="Remove filter"
                        >
                          <i className="pi pi-filter text-xs"></i>
                          <span>{fieldDisplayName}: {value}</span>
                          <i className="pi pi-times text-xs"></i>
                        </button>
                      ));
                    })}
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>
    </>
  );

  // Keep existing callback for backward compatibility
  useEffect(() => {
    if (onTableDataChange) {
      // Pass full sortedData including __nestedTables__ so Column Type Overrides (and similar UIs) can show nested array structure
      onTableDataChange(sortedData);
    }
  }, [sortedData, onTableDataChange]);


  // Drawer sidebar helpers
  const hasDrawerTabs = effectiveDrawerTabs && effectiveDrawerTabs.length > 0;
  const hasDrawerData = drawerData && drawerData.length > 0;
  const drawerActiveIndex = hasDrawerTabs
    ? Math.min(activeDrawerTabIndex, Math.max(0, effectiveDrawerTabs.length - 1))
    : 0;

  // Empty state component for drawer
  const DrawerEmptyState = ({ icon, title, subtitle }) => (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <i className={`pi ${icon} text-4xl text-gray-400 mb-4`}></i>
      <p className="text-gray-600 font-medium">{title}</p>
      <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
    </div>
  );

  // Ensure contextValue is never null/undefined (safeguard)
  if (!contextValue) {
    console.error('DataProviderNew: contextValue is null/undefined');
  }

  return (
    <>
      <TableOperationsContext.Provider value={contextValue || {}}>
        {/* Header Controls - Responsive container */}
        {hasHeaderContent && (
          <div className="px-2 sm:px-3 md:px-4 lg:px-6 xl:px-8 py-2 sm:py-3 md:py-4 border-b border-gray-200 shrink-0 bg-white min-w-0 overflow-x-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3 md:gap-4 min-w-0 w-full">
              <div className="flex-1 min-w-0 w-full">
                {selectorsJSX}
              </div>
            </div>
          </div>
        )}

        {/* Render children - wrap with PlasmicDataProvider so data (slot map) is available in Plasmic Studio. */}
        <PlasmicDataProvider name="data" data={contextValue || {}}>
          {children}
        </PlasmicDataProvider>
      </TableOperationsContext.Provider>

      {/* Filter and Sort Sidebar */}
      {currentQueryDoc?.clientSave === true && (
        <FilterSortSidebar
          visible={filterSortSidebarVisible}
          onHide={() => {
            setFilterSortSidebarVisible(false);
          }}
          searchFields={currentQueryDoc?.searchFields || {}}
          sortFields={currentQueryDoc?.sortFields || {}}
          tableData={preFilteredData}
          columnTypes={columnTypes}
          currentSortConfig={sortConfig}
          currentFilterValues={preFilterValues}
          onApply={async (sortConfig, filterValues) => {
            setIsApplyingFilterSort(true);

            // Update state for worker computation (batch these together)
            setSortConfig(sortConfig);
            setPreFilterValues(filterValues || {});

            // Trigger worker computation immediately (don't wait for useEffect)
            // This reduces the delay between state update and worker start
            if (filterSortWorkerRef.current && tableData && !isEmpty(tableData)) {
              const computationId = ++filterSortComputationIdRef.current;

              // Start worker computation immediately
              (async () => {
                try {
                  // Convert preFilterValues to tableFilters format
                  const filtersForWorker = {};
                  Object.keys(filterValues || {}).forEach(col => {
                    filtersForWorker[col] = { value: filterValues[col] };
                  });

                  const result = await filterSortWorkerRef.current.computeFilterSortGrouped(tableData, {
                    tableFilters: filtersForWorker,
                    columns,
                    columnTypes,
                    multiselectColumns,
                    hasPercentageColumns,
                    percentageColumns,
                    percentageColumnNames,
                    enableFilter,
                    searchTerm,
                    searchFields: currentQueryDoc?.searchFields || {},
                    sortConfig,
                    sortFieldType,
                    tableSortMeta,
                    enableSort,
                    effectiveGroupFields,
                    derivedColumnNames: getDerivedColumnNames(derivedColumns || [], derivedColumnsMode ?? 'main', derivedColumnsFieldName ?? null),
                  });

                  // Apply derived columns to grouped data (including group summary rows)
                  const groupedDataWithDerived =
                    result.groupedData && derivedColumns?.length
                      ? applyDerivedColumns(result.groupedData, derivedColumns, {
                          mode: derivedColumnsMode ?? 'main',
                          fieldName: derivedColumnsFieldName ?? null,
                          getDataValue,
                        })
                      : result.groupedData;

                  // Only update if this is still the latest computation
                  if (computationId === filterSortComputationIdRef.current) {
                    setWorkerComputedData({
                      ...result,
                      groupedData: groupedDataWithDerived,
                    });
                    setIsApplyingFilterSort(false);
                  }
                } catch (error) {
                  console.error('Filter/sort worker computation error:', error);
                  if (computationId === filterSortComputationIdRef.current) {
                    setIsApplyingFilterSort(false);
                  }
                }
              })();
            }

            // Sidebar is already closed by onHide() in FilterSortSidebar
          }}
          onClear={() => {
            setIsApplyingFilterSort(true);
            setSortConfig(null);
            setPreFilterValues({});
          }}
        />
      )}

      {/* Drawer Sidebar - Only render if drawer tabs are configured */}
      {hasDrawerTabs && (() => {
        const drawerHeaderIcons = !parentColumnName && enableCellEdit && handleDrawerSave ? (
          <>
            {handleDrawerSave && (
              <button
                type="button"
                className="p-sidebar-icon p-link mr-2"
                onClick={handleDrawerSave}
                title="Save changes in this nested table"
              >
                <span className="pi pi-save" />
              </button>
            )}
          </>
        ) : null;
        return (
        <Sidebar
          position="bottom"
          blockScroll
          visible={drawerVisible}
          onHide={() => {
            if (getHasUnsavedDrawerChanges()) {
              confirmDialog({
                header: 'Unsaved changes',
                message: 'You have unsaved changes. Discard?',
                acceptLabel: 'Discard',
                rejectLabel: 'Keep editing',
                acceptClassName: 'p-button-danger',
                accept: closeDrawer,
              });
            } else {
              closeDrawer();
            }
          }}
          style={{ height: '100dvh' }}
          className="p-sidebar-sm"
          icons={drawerHeaderIcons}
          header={
            <h2 className="text-lg font-semibold text-gray-800 m-0">
              {drawerHeaderTitle}
            </h2>
          }
        >
          <div className="flex flex-col h-full">
            {/* Scalar editable fields form - sibling above TabView (root provider only) */}
            {!parentColumnName && drawerVisible && enableCellEdit && scalarEditableColumns.length > 0 && (
              <div className="shrink-0 p-3 pb-2 border-b border-gray-200">
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {!(formEditingRow ?? selectedRowData) ? (
                    <div className="col-span-2 text-sm text-gray-500 py-2">
                      Select a row in the table to edit.
                    </div>
                  ) : (
                    scalarEditableColumns.map((col) => {
                      const formRow = formEditingRow ?? selectedRowData;
                      const mainOverrides = getMainOverrides(columnTypesOverride);
                      const resolvedType = mainOverrides[col] || columnTypes[col] || 'string';
                      const value = getDataValue(formRow, col);
                      const label = formatHeaderName(col);
                      const handleChange = (newVal) => {
                        setFormEditingRow(prev => prev ? { ...prev, [col]: newVal } : null);
                      };
                      if (resolvedType === 'date') {
                        return (
                          <div key={col} className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-gray-700">{label}</label>
                            <Calendar
                              value={value ? (value instanceof Date ? value : new Date(value)) : null}
                              onChange={(e) => handleChange(e.value)}
                              dateFormat="M d, yy"
                              showIcon
                              className="w-full"
                              inputClassName="text-sm w-full"
                            />
                          </div>
                        );
                      }
                      if (resolvedType === 'boolean') {
                        return (
                          <div key={col} className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-gray-700">{label}</label>
                            <div className="flex items-center pt-1">
                              <Checkbox
                                inputId={`sidebar-edit-${col}`}
                                checked={!!value}
                                onChange={(e) => handleChange(e.checked)}
                              />
                              <label htmlFor={`sidebar-edit-${col}`} className="ml-2 text-sm text-gray-600">{value ? 'Yes' : 'No'}</label>
                            </div>
                          </div>
                        );
                      }
                      if (resolvedType === 'number') {
                        return (
                          <div key={col} className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-gray-700">{label}</label>
                            <InputNumber
                              value={value != null && value !== '' ? toNumber(value) : null}
                              onValueChange={(e) => handleChange(e.value)}
                              className="w-full"
                              inputClassName="text-sm w-full"
                            />
                          </div>
                        );
                      }
                      return (
                        <div key={col} className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-gray-700">{label}</label>
                          <InputText
                            value={value != null ? String(value) : ''}
                            onChange={(e) => handleChange(e.target.value)}
                            className="w-full text-sm"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
            <div className="flex-1">
              {hasDrawerTabs ? (
                <TabView
                  activeIndex={drawerActiveIndex}
                  onTabChange={(e) => setActiveDrawerTabIndex(e.index)}
                  className="h-full flex flex-col"
                >
                  {effectiveDrawerTabs.map((tab, index) => {
                    // Ensure tab has a unique id (use index as fallback for stability)
                    const tabId = tab.id || `tab-${index}`;

                    // Base props from main table (inherit from DataProviderNew props; slot override applies)
                    const baseTableProps = {
                      rowsPerPageOptions: [5, 10, 25, 50, 100, 200], // drawer-specific default
                      defaultRows: 10, // drawer-specific default
                      scrollable: false, // drawer-specific default
                      enableSort: effectiveMainConfig.enableSort,
                      enableFilter: effectiveMainConfig.enableFilter,
                      enableSummation: effectiveMainConfig.enableSummation,
                      enableDivideBy1Lakh, // shared - pass flat to nested
                      textFilterColumns: effectiveMainConfig.textFilterColumns || [],
                      allowedColumns: allowedColumns || [], // shared
                      onAllowedColumnsChange: onAllowedColumnsChange, // from main table
                      visibleColumns: tableVisibleColumns, // from main table - ensures drawer respects column visibility
                      onVisibleColumnsChange: onVisibleColumnsChange, // from main table
                      redFields: effectiveMainConfig.redFields || [],
                      greenFields: effectiveMainConfig.greenFields || [],
                      groupFields: (() => {
                        // Convert tab's outerGroup/innerGroup to groupFields array, or use tab.groupFields if provided
                        if (tab.groupFields && Array.isArray(tab.groupFields)) {
                          return tab.groupFields;
                        }
                        const fields = [];
                        if (tab.outerGroup) fields.push(tab.outerGroup);
                        if (tab.innerGroup) fields.push(tab.innerGroup);
                        return fields.length > 0 ? fields : null;
                      })(),
                      enableCellEdit: false, // drawer-specific default
                      editableColumns: { main: [], nested: {} }, // drawer-specific default
                      percentageColumns: effectiveMainConfig.percentageColumns || [],
                      derivedColumns: effectiveMainConfig.derivedColumns || [],
                      columnTypes: columnTypes, // from main table
                      columnTypesOverride: columnTypesOverride || {}, // shared
                      tableName: "sidebar",
                      // Report settings - drawer reuses parent report view without local toggle
                      enableReport: false,
                      forceBreakdown: shouldShowDrawerReport,
                      reportDataOverride: shouldShowDrawerReport ? drawerReportDataWithDerived : null,
                      showProviderHeader: false,
                      dateColumn, // shared
                      breakdownType: breakdownType, // from main table
                      columnGroupBy: columnGroupBy, // from main table
                    };

                    // Extract tab-specific overrides (any prop beyond id, name, outerGroup, innerGroup, isJsonTable, data, fieldName, parentColumnName, nestedTableFieldName)
                    const { id, name, outerGroup, innerGroup, isJsonTable, data: tabData, fieldName, parentColumnName, nestedTableFieldName, ...tabOverrides } = tab;
                    // Merge order: default (baseTableProps) → tableOptions (drawerTableOptions) → tabOverrides
                    const mergedTableProps = { ...baseTableProps, ...(drawerTableOptions || {}), ...tabOverrides };

                    // Determine data source: use editing buffer for JSON table tabs, otherwise use drawerData
                    // When nested instance calls onNestedBufferChange(), parent re-renders and re-reads ref here
                    let tabDataSource;
                    if (isJsonTable) {
                      const editingData = nestedTableEditingDataRef.current.get(tab.id);
                      tabDataSource = editingData && isArray(editingData) ? editingData : (tabData && isArray(tabData) ? tabData : []);
                    } else {
                      tabDataSource = drawerData;
                    }
                    const hasTabData = isJsonTable
                      ? (tabDataSource && isArray(tabDataSource))
                      : hasDrawerData;

                    return (
                      <TabPanel
                        key={tabId}
                        header={tab.name || `Tab ${index + 1}`}
                        className="h-full flex flex-col"
                      >
                        <div className="flex-1 overflow-auto">
                          {hasTabData ? (
                            <DataProviderNew
                              dataSource={null}
                              offlineData={tabDataSource}
                              drawerTabs={[]} // Disable drawer in nested instance
                              enableSort={mergedTableProps.enableSort}
                              enableFilter={mergedTableProps.enableFilter}
                              enableSummation={mergedTableProps.enableSummation}
                              enableGrouping={mergedTableProps.enableGrouping}
                              textFilterColumns={mergedTableProps.textFilterColumns || []}
                              percentageColumns={mergedTableProps.percentageColumns || []}
                              derivedColumns={mergedTableProps.derivedColumns || []}
                              {...(isJsonTable && {
                                derivedColumnsMode: 'nested',
                                derivedColumnsFieldName: nestedTableFieldName ?? undefined,
                              })}
                              groupFields={mergedTableProps.groupFields}
                              redFields={mergedTableProps.redFields || []}
                              greenFields={mergedTableProps.greenFields || []}
                              enableDivideBy1Lakh={mergedTableProps.enableDivideBy1Lakh || false}
                              columnTypesOverride={mergedTableProps.columnTypesOverride || {}}
                              allowedColumns={mergedTableProps.allowedColumns || []}
                              editableColumns={mergedTableProps.editableColumns || { main: [], nested: {} }}
                              enableCellEdit={mergedTableProps.enableCellEdit !== undefined ? mergedTableProps.enableCellEdit : false}
                              parentColumnName={isJsonTable ? parentColumnName : undefined}
                              nestedTableFieldName={isJsonTable ? nestedTableFieldName : undefined}
                              onAllowedColumnsChange={mergedTableProps.onAllowedColumnsChange}
                              visibleColumns={isJsonTable ? undefined : mergedTableProps.visibleColumns}
                              onVisibleColumnsChange={isJsonTable ? undefined : mergedTableProps.onVisibleColumnsChange}
                              enableReport={mergedTableProps.enableReport}
                              forceBreakdown={mergedTableProps.forceBreakdown}
                              reportDataOverride={mergedTableProps.reportDataOverride}
                              showProviderHeader={mergedTableProps.showProviderHeader}
                              dateColumn={mergedTableProps.dateColumn}
                              breakdownType={mergedTableProps.breakdownType}
                              columnGroupBy={mergedTableProps.columnGroupBy}
                              chartColumns={mergedTableProps.chartColumns || []}
                              chartHeight={mergedTableProps.chartHeight}
                              // Pass enableWrite from parent for nested drawer tables
                              forceEnableWrite={isJsonTable && currentQueryDoc?.enableWrite ? true : undefined}
                              // Pass parent refs so nested instance can access tracking data
                              parentOriginalNestedTableDataRef={isJsonTable ? originalNestedTableDataRef : undefined}
                              parentNestedTableEditingDataRef={isJsonTable ? nestedTableEditingDataRef : undefined}
                              // Pass parent handler so nested instance uses parent's state
                              parentHandleDrawerSaveProp={isJsonTable ? handleDrawerSave : undefined}
                              // Pass tabId so nested instance can update parent's editing buffer
                              nestedTableTabId={isJsonTable ? tabId : undefined}
                              onNestedBufferChange={isJsonTable ? handleNestedBufferChange : undefined}
                              parentHandleAddNestedRowAtZero={isJsonTable ? (() => handleAddNestedRowAtZero(tabId)) : undefined}
                              fallbackColumns={isJsonTable && tab.columns && isArray(tab.columns) && tab.columns.length > 0 ? tab.columns : undefined}
                              onTableDataChange={isJsonTable ? (data) => {
                                // Update current nested table data for this tab when data changes
                                updateCurrentNestedTableData(tabId, data);
                              } : undefined}
                            >
                              <DataTableComponent
                                useOrchestrationLayer={true}
                                enableFullscreenDialog={mergedTableProps.enableFullscreenDialog}
                                scrollable={mergedTableProps.scrollable}
                                scrollHeight={mergedTableProps.scrollHeight}
                                rowsPerPageOptions={mergedTableProps.rowsPerPageOptions}
                                defaultRows={mergedTableProps.defaultRows}
                                enableCellEdit={mergedTableProps.enableCellEdit !== undefined ? mergedTableProps.enableCellEdit : false}
                                tableName={mergedTableProps.tableName || 'table'}
                                editableColumns={mergedTableProps.editableColumns || { main: [], nested: {} }}
                              />
                            </DataProviderNew>
                          ) : (
                            <DrawerEmptyState
                              icon="pi-inbox"
                              title="No data available"
                              subtitle={tab.isJsonTable ? "No nested table data" : "No matching rows found"}
                            />
                          )}
                        </div>
                      </TabPanel>
                    );
                  })}
                </TabView>
              ) : (
                <DrawerEmptyState
                  icon="pi-inbox"
                  title="No tabs configured"
                  subtitle="Please configure drawer tabs in settings"
                />
              )}
            </div>
          </div>
        </Sidebar>
        );
      })()}
      {!parentColumnName && <ConfirmDialog />}
      {!parentColumnName && (
        <Dialog
          header="Save diff"
          visible={saveDiffDialogVisible}
          style={{ width: '90vw', maxWidth: '640px' }}
          onHide={() => setSaveDiffDialogVisible(false)}
          footer={
            <Button label="OK" onClick={handleSaveDiffDialogOk} />
          }
        >
          <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
            {saveDiffFormatted ? (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {saveDiffFormatted}
              </pre>
            ) : null}
          </div>
        </Dialog>
      )}
    </>
  );
}

