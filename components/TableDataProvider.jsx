'use client';

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import DataProvider from '../share/datatable/components/DataProvider';
import data from '../resource/data';
import { DataProvider as PlasmicDataProvider } from "@plasmicapp/loader-nextjs";
import { Dropdown } from 'primereact/dropdown';
import { Sidebar } from 'primereact/sidebar';
import { TabView, TabPanel } from 'primereact/tabview';
import DataTableComponent from '../share/datatable/components/DataTable';
import { startCase, filter as lodashFilter, get, isNil } from 'lodash';
import { TableProvider } from './TableContext';
import { TableOperationsContext } from '../share/datatable/contexts/TableOperationsContext';
import dayjs from 'dayjs';
import { firestoreService } from '../share/graphql-playground/services/firestoreService';
import { indexedDBService } from '../share/datatable/utils/indexedDBService';
import { parseGraphQLVariables } from '../share/graphql-playground/utils/variableParser';

// Custom hook for localStorage with proper JSON serialization for booleans
function useLocalStorageBoolean(key, defaultValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = window.localStorage.getItem(key);
      if (item === null || item === undefined) return defaultValue;
      const parsed = JSON.parse(item);
      return typeof parsed === 'boolean' ? parsed : defaultValue;
    } catch (error) {
      try {
        window.localStorage.removeItem(key);
      } catch { }
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null && item !== undefined) {
        const parsed = JSON.parse(item);
        if (typeof parsed === 'boolean') {
          setValue(parsed);
        }
      }
    } catch (error) { }
  }, [key]);

  const setStoredValue = (newValue) => {
    try {
      if (typeof newValue === 'boolean') {
        const serialized = JSON.stringify(newValue);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, serialized);
        }
        setValue(newValue);
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [value, setStoredValue];
}

// Custom hook for localStorage with proper JSON serialization for arrays
function useLocalStorageArray(key, defaultValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = window.localStorage.getItem(key);
      if (item === null || item === undefined) return defaultValue;
      const parsed = JSON.parse(item);
      return Array.isArray(parsed) ? parsed : defaultValue;
    } catch (error) {
      try {
        window.localStorage.removeItem(key);
      } catch { }
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null && item !== undefined) {
        const parsed = JSON.parse(item);
        if (Array.isArray(parsed)) {
          setValue(parsed);
        }
      }
    } catch (error) { }
  }, [key]);

  const setStoredValue = (newValue) => {
    try {
      if (typeof newValue === 'function') {
        setValue(prev => {
          const updated = newValue(prev);
          if (Array.isArray(updated)) {
            const serialized = JSON.stringify(updated);
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(key, serialized);
            }
            return updated;
          }
          return prev;
        });
      } else if (Array.isArray(newValue)) {
        const serialized = JSON.stringify(newValue);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, serialized);
        }
        setValue(newValue);
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [value, setStoredValue];
}

// Custom hook for localStorage with proper JSON serialization for string/null values
function useLocalStorageString(key, defaultValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = window.localStorage.getItem(key);
      if (item === null || item === undefined) return defaultValue;
      const parsed = JSON.parse(item);
      return (typeof parsed === 'string' || parsed === null) ? parsed : defaultValue;
    } catch (error) {
      try {
        window.localStorage.removeItem(key);
      } catch { }
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null && item !== undefined) {
        const parsed = JSON.parse(item);
        if (typeof parsed === 'string' || parsed === null) {
          setValue(parsed);
        }
      }
    } catch (error) { }
  }, [key]);

  const setStoredValue = (newValue) => {
    try {
      if (typeof newValue === 'string' || newValue === null) {
        const serialized = JSON.stringify(newValue);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, serialized);
        }
        setValue(newValue);
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [value, setStoredValue];
}

const TableDataProvider = (props) => {
  const {
    children,
    dataSlot,
    dataSource,
    queryKey,
    onDataChange,
    onError,
    onTableDataChange,
    onRawDataChange,
    onVariablesChange,
    onDataSourceChange,
    // New callbacks for internal state
    onSavedQueriesChange,
    onLoadingQueriesChange,
    onExecutingQueryChange,
    onAvailableQueryKeysChange,
    onSelectedQueryKeyChange,
    onLoadingDataChange,
    onLastUpdatedAtChange,
    onColumnTypesChange,
    variableOverrides,
    showSelectors = true,
    hideDataSourceAndQueryKey,
    // Auth control props
    isAdminMode = false,
    salesTeamColumn = null,
    salesTeamValues = [],
    hqColumn = null,
    hqValues = [],
    columnTypes = { is_internal_customer: "number" },
    useOrchestrationLayer = false,
    enableSort = true,
    enableFilter = true,
    enableSummation = true,
    enableGrouping = true,
    enableDivideBy1Lakh = false,
    textFilterColumns = [],
    visibleColumns = [],
    redFields = [],
    greenFields = [],
    outerGroupField: propOuterGroupField = null,
    innerGroupField: propInnerGroupField = null,
    percentageColumns = [],
    drawerTabs: propDrawerTabs = [],
    enableReport: propEnableReport = false,
    dateColumn: propDateColumn = null,
    breakdownType: propBreakdownType = 'month',
    onVisibleColumnsChange: propOnVisibleColumnsChange,
    onDrawerTabsChange: propOnDrawerTabsChange,
    onAdminModeChange: propOnAdminModeChange,
    onEnableReportChange: propOnEnableReportChange,
    onDateColumnChange: propOnDateColumnChange,
    onBreakdownTypeChange: propOnBreakdownTypeChange,
    onOuterGroupFieldChange: propOnOuterGroupFieldChange,
    onInnerGroupFieldChange: propOnInnerGroupFieldChange,
    drawerSalesTeamColumn: propDrawerSalesTeamColumn = null,
    drawerSalesTeamValues: propDrawerSalesTeamValues = [],
    drawerHqColumn: propDrawerHqColumn = null,
    drawerHqValues: propDrawerHqValues = [],
    drawerVisible: propDrawerVisible = false,
    onDrawerVisibleChange: propOnDrawerVisibleChange,
    className,
    style,
    ...otherProps // Collect all other individual props to use as variables
  } = props;

  const propOnColumnTypesChange = onColumnTypesChange;

  // 1. Hooks (State & LocalStorage) for new features
  const [outerGroupFieldRawState, setOuterGroupFieldRaw] = useLocalStorageString('datatable-outerGroupField', null);
  const [innerGroupFieldRawState, setInnerGroupFieldRaw] = useLocalStorageString('datatable-innerGroupField', null);
  const [drawerTabsRawState, setDrawerTabs] = useLocalStorageArray('datatable-drawerTabs', [{ id: `tab-${Date.now()}`, name: '', outerGroup: null, innerGroup: null }]);
  const [enableReportState, setEnableReport] = useLocalStorageBoolean('datatable-enableReport', false);
  const [dateColumnRawState, setDateColumnRaw] = useLocalStorageString('datatable-dateColumn', null);
  const [breakdownTypeRawState, setBreakdownTypeRaw] = useLocalStorageString('datatable-breakdownType', 'month');

  // 2. Resolve final values (Prop > LocalStorage)
  const outerGroupField = propOuterGroupField !== null ? propOuterGroupField : outerGroupFieldRawState;
  const innerGroupField = propInnerGroupField !== null ? propInnerGroupField : innerGroupFieldRawState;
  const drawerTabs = (propDrawerTabs && propDrawerTabs.length > 0) ? propDrawerTabs : drawerTabsRawState;
  const enableReport = propEnableReport !== false ? propEnableReport : enableReportState;
  const dateColumn = propDateColumn !== null ? propDateColumn : dateColumnRawState;
  const breakdownType = propBreakdownType !== 'month' ? propBreakdownType : breakdownTypeRawState;

  // 3. Normalize string inputs to arrays for Sales Team and HQ
  const normalizedSalesTeamValues = useMemo(() => {
    if (typeof salesTeamValues === 'string') return salesTeamValues ? [salesTeamValues] : [];
    return Array.isArray(salesTeamValues) ? salesTeamValues : [];
  }, [salesTeamValues]);

  const normalizedHqValues = useMemo(() => {
    if (typeof hqValues === 'string') return hqValues ? [hqValues] : [];
    return Array.isArray(hqValues) ? hqValues : [];
  }, [hqValues]);

  // Normalize Drawer-specific string inputs
  const normalizedDrawerSalesTeamValues = useMemo(() => {
    if (typeof propDrawerSalesTeamValues === 'string') return propDrawerSalesTeamValues ? [propDrawerSalesTeamValues] : [];
    return Array.isArray(propDrawerSalesTeamValues) ? propDrawerSalesTeamValues : [];
  }, [propDrawerSalesTeamValues]);

  const normalizedDrawerHqValues = useMemo(() => {
    if (typeof propDrawerHqValues === 'string') return propDrawerHqValues ? [propDrawerHqValues] : [];
    return Array.isArray(propDrawerHqValues) ? propDrawerHqValues : [];
  }, [propDrawerHqValues]);

  // Determine final drawer filter values (Prop > Inherited from main)
  const drawerSalesTeamColumn = propDrawerSalesTeamColumn || salesTeamColumn;
  const drawerSalesTeamValues = normalizedDrawerSalesTeamValues.length > 0 ? normalizedDrawerSalesTeamValues : normalizedSalesTeamValues;
  const drawerHqColumn = propDrawerHqColumn || hqColumn;
  const drawerHqValues = normalizedDrawerHqValues.length > 0 ? normalizedDrawerHqValues : normalizedHqValues;

  const [currentTableData, setCurrentTableData] = useState(null);
  const [currentRawData, setCurrentRawData] = useState(null);
  const [currentVariables, setCurrentVariables] = useState({});
  
  // Drawer state
  const [drawerVisible, setDrawerVisible] = useState(propDrawerVisible);
  const [drawerData, setDrawerData] = useState([]);
  const [activeDrawerTabIndex, setActiveDrawerTabIndex] = useState(0);
  const [clickedDrawerValues, setClickedDrawerValues] = useState({ outerValue: null, innerValue: null });

  // Sync propDrawerVisible with state
  useEffect(() => {
    setDrawerVisible(propDrawerVisible);
  }, [propDrawerVisible]);

  // New internal state to expose to Plasmic
  const [savedQueries, setSavedQueries] = useState([]);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [executingQuery, setExecutingQuery] = useState(false);
  const [availableQueryKeys, setAvailableQueryKeys] = useState([]);
  const [selectedQueryKey, setSelectedQueryKey] = useState(queryKey);
  const [loadingData, setLoadingData] = useState(false);
  const [variablesLoaded, setVariablesLoaded] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [monthRange, setMonthRange] = useState(null);
  const [currentQueryDoc, setCurrentQueryDoc] = useState(null);
  const [hasMonthSupport, setHasMonthSupport] = useState(false);

  // Robust date formatter that handles time-only strings
  const formatLastUpdatedDate = useCallback((dateString) => {
    if (!dateString) return null;
    try {
      let dateToParse = dateString;
      // If it's just a time string (e.g. "13:14:03"), prepend today's date for dayjs
      if (typeof dateString === 'string' && dateString.includes(':') && !dateString.includes('-') && !dateString.includes('/')) {
        dateToParse = dayjs().format('YYYY-MM-DD') + ' ' + dateString;
      }
      
      const parsedDate = dayjs(dateToParse);
      if (!parsedDate.isValid()) return dateString;
      return parsedDate.format('D MMM YYYY h:mm A');
    } catch (error) {
      return dateString;
    }
  }, []);

  const fetchLastUpdatedFromDB = useCallback(async (dsOverride, docOverride, rangeOverride) => {
    const ds = dsOverride || dataSource;
    const doc = docOverride || currentQueryDoc;
    const range = rangeOverride !== undefined ? rangeOverride : monthRange;

    if (!ds || ds === 'offline') {
      setLastUpdatedAt(null);
      return;
    }

    try {
      const indexResult = await indexedDBService.getQueryIndexResult(ds);
      if (!indexResult || !indexResult.result) return;

      const result = indexResult.result;
      let rawTimestamp = null;

      if (doc && doc.month === true) {
        if (range && range[0]) {
          const yearMonthKey = dayjs(range[0]).format('YYYY-MM');
          if (result && typeof result === 'object' && !Array.isArray(result)) {
            rawTimestamp = result[yearMonthKey] || null;
          }
        }
      } else {
        rawTimestamp = typeof result === 'string' ? result : null;
      }

      if (rawTimestamp) {
        setLastUpdatedAt(rawTimestamp);
      }
    } catch (error) {
      console.error('Error fetching timestamp in wrapper:', error);
    }
  }, [dataSource, monthRange, currentQueryDoc]);

  // Replicate and fix shared DataProvider logic for loading metadata
  useEffect(() => {
    if (!dataSource || dataSource === 'offline') {
      setCurrentQueryDoc(null);
      setHasMonthSupport(false);
      setMonthRange(null);
      setLastUpdatedAt(null);
      return;
    }

    const loadMetadata = async () => {
      try {
        const queryDoc = await firestoreService.loadQuery(dataSource);
        if (queryDoc) {
          let initialMonthRange = null;
          const parsedVariables = parseGraphQLVariables(queryDoc.variables || '');
          if (queryDoc.month === true && parsedVariables.startDate && parsedVariables.endDate) {
            try {
              const start = new Date(parsedVariables.startDate);
              const end = new Date(parsedVariables.endDate);
              if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                initialMonthRange = [start, end];
              }
            } catch (e) {}
          }

          setCurrentQueryDoc(queryDoc);
          setHasMonthSupport(queryDoc.month === true);
          setMonthRange(initialMonthRange);
          
          // Immediate fetch with new metadata
          // Using the local queryDoc and initialMonthRange directly to avoid dependency on state/useCallback that might change
          try {
            const indexResult = await indexedDBService.getQueryIndexResult(dataSource);
            if (indexResult && indexResult.result) {
              const result = indexResult.result;
              let rawTimestamp = null;
              if (queryDoc.month === true && initialMonthRange && initialMonthRange[0]) {
                const yearMonthKey = dayjs(initialMonthRange[0]).format('YYYY-MM');
                if (result && typeof result === 'object' && !Array.isArray(result)) {
                  rawTimestamp = result[yearMonthKey] || null;
                }
              } else {
                rawTimestamp = typeof result === 'string' ? result : null;
              }
              if (rawTimestamp) {
                setLastUpdatedAt(rawTimestamp);
              }
            }
          } catch (e) {
            console.error('Error fetching timestamp during metadata load:', e);
          }
        }
      } catch (error) {
        console.error('Error loading metadata in wrapper:', error);
      }
    };
    loadMetadata();
  }, [dataSource]); // Only depend on dataSource to prevent infinite loops

  // Sync monthRange from variableOverrides if they change in Plasmic
  useEffect(() => {
    if (variableOverrides?.startDate && variableOverrides?.endDate) {
      try {
        setMonthRange([new Date(variableOverrides.startDate), new Date(variableOverrides.endDate)]);
      } catch (e) {}
    }
  }, [variableOverrides]);

  // Periodic refresh of the timestamp
  useEffect(() => {
    fetchLastUpdatedFromDB();
  }, [dataSource, monthRange, currentQueryDoc, fetchLastUpdatedFromDB]);

  // Stable callback wrappers to prevent infinite loops in the shared DataProvider
  const onTableDataChangeRef = useRef(onTableDataChange);
  const onRawDataChangeRef = useRef(onRawDataChange);
  const onDataChangeRef = useRef(onDataChange);
  const onErrorRef = useRef(onError);
  const onVariablesChangeRef = useRef(onVariablesChange);
  const onDataSourceChangeRef = useRef(onDataSourceChange);
  
  // New refs for internal state callbacks
  const onSavedQueriesChangeRef = useRef(onSavedQueriesChange);
  const onLoadingQueriesChangeRef = useRef(onLoadingQueriesChange);
  const onExecutingQueryChangeRef = useRef(onExecutingQueryChange);
  const onAvailableQueryKeysChangeRef = useRef(onAvailableQueryKeysChange);
  const onSelectedQueryKeyChangeRef = useRef(onSelectedQueryKeyChange);
  const onLoadingDataChangeRef = useRef(onLoadingDataChange);
  const onLastUpdatedAtChangeRef = useRef(onLastUpdatedAtChange);
  const onVisibleColumnsChangeRef = useRef(propOnVisibleColumnsChange);
  const onDrawerTabsChangeRef = useRef(propOnDrawerTabsChange);
  const onColumnTypesChangeRef = useRef(propOnColumnTypesChange);
  const onAdminModeChangeRef = useRef(propOnAdminModeChange);
  const onEnableReportChangeRef = useRef(propOnEnableReportChange);
  const onDateColumnChangeRef = useRef(propOnDateColumnChange);
  const onBreakdownTypeChangeRef = useRef(propOnBreakdownTypeChange);
  const onOuterGroupFieldChangeRef = useRef(propOnOuterGroupFieldChange);
  const onInnerGroupFieldChangeRef = useRef(propOnInnerGroupFieldChange);

  useEffect(() => { onTableDataChangeRef.current = onTableDataChange; }, [onTableDataChange]);
  useEffect(() => { onRawDataChangeRef.current = onRawDataChange; }, [onRawDataChange]);
  useEffect(() => { onDataChangeRef.current = onDataChange; }, [onDataChange]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onVariablesChangeRef.current = onVariablesChange; }, [onVariablesChange]);
  useEffect(() => { onDataSourceChangeRef.current = onDataSourceChange; }, [onDataSourceChange]);
  
  useEffect(() => { onSavedQueriesChangeRef.current = onSavedQueriesChange; }, [onSavedQueriesChange]);
  useEffect(() => { onLoadingQueriesChangeRef.current = onLoadingQueriesChange; }, [onLoadingQueriesChange]);
  useEffect(() => { onExecutingQueryChangeRef.current = onExecutingQueryChange; }, [onExecutingQueryChange]);
  useEffect(() => { onAvailableQueryKeysChangeRef.current = onAvailableQueryKeysChange; }, [onAvailableQueryKeysChange]);
  useEffect(() => { onSelectedQueryKeyChangeRef.current = onSelectedQueryKeyChange; }, [onSelectedQueryKeyChange]);
  useEffect(() => { onLoadingDataChangeRef.current = onLoadingDataChange; }, [onLoadingDataChange]);
  useEffect(() => { onLastUpdatedAtChangeRef.current = onLastUpdatedAtChange; }, [onLastUpdatedAtChange]);
  useEffect(() => { onVisibleColumnsChangeRef.current = propOnVisibleColumnsChange; }, [propOnVisibleColumnsChange]);
  useEffect(() => { onDrawerTabsChangeRef.current = propOnDrawerTabsChange; }, [propOnDrawerTabsChange]);
  useEffect(() => { onColumnTypesChangeRef.current = propOnColumnTypesChange; }, [propOnColumnTypesChange]);
  useEffect(() => { onAdminModeChangeRef.current = propOnAdminModeChange; }, [propOnAdminModeChange]);
  useEffect(() => { onEnableReportChangeRef.current = propOnEnableReportChange; }, [propOnEnableReportChange]);
  useEffect(() => { onDateColumnChangeRef.current = propOnDateColumnChange; }, [propOnDateColumnChange]);
  useEffect(() => { onBreakdownTypeChangeRef.current = propOnBreakdownTypeChange; }, [propOnBreakdownTypeChange]);
  useEffect(() => { onOuterGroupFieldChangeRef.current = propOnOuterGroupFieldChange; }, [propOnOuterGroupFieldChange]);
  useEffect(() => { onInnerGroupFieldChangeRef.current = propOnInnerGroupFieldChange; }, [propOnInnerGroupFieldChange]);

  const stableOnTableDataChange = useCallback((data) => {
    setCurrentTableData(prev => {
      if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
      return data;
    });
    onTableDataChangeRef.current?.(data);
  }, []);

  const stableOnRawDataChange = useCallback((data) => {
    setCurrentRawData(prev => {
      if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
      return data;
    });
    onRawDataChangeRef.current?.(data);
  }, []);

  const stableOnDataChange = useCallback((notif) => {
    onDataChangeRef.current?.(notif);
  }, []);

  const stableOnError = useCallback((err) => {
    onErrorRef.current?.(err);
  }, []);

  const stableOnVariablesChange = useCallback((vars) => {
    setCurrentVariables(prev => {
      if (JSON.stringify(prev) === JSON.stringify(vars)) return prev;
      return vars;
    });
    setVariablesLoaded(true);
    onVariablesChangeRef.current?.(vars);
  }, []);

  const stableOnDataSourceChange = useCallback((ds) => {
    onDataSourceChangeRef.current?.(ds);
  }, []);

  // New stable callbacks for internal state
  const stableOnSavedQueriesChange = useCallback((queries) => {
    setSavedQueries(prev => {
      if (JSON.stringify(prev) === JSON.stringify(queries)) return prev;
      return queries;
    });
    onSavedQueriesChangeRef.current?.(queries);
  }, []);

  const stableOnLoadingQueriesChange = useCallback((loading) => {
    setLoadingQueries(prev => {
      if (prev === loading) return prev;
      return loading;
    });
    onLoadingQueriesChangeRef.current?.(loading);
  }, []);

  const stableOnExecutingQueryChange = useCallback((executing) => {
    setExecutingQuery(prev => {
      if (prev === executing) return prev;
      return executing;
    });
    onExecutingQueryChangeRef.current?.(executing);
  }, []);

  const stableOnAvailableQueryKeysChange = useCallback((keys) => {
    setAvailableQueryKeys(prev => {
      if (JSON.stringify(prev) === JSON.stringify(keys)) return prev;
      return keys;
    });
    onAvailableQueryKeysChangeRef.current?.(keys);
  }, []);

  const stableOnSelectedQueryKeyChange = useCallback((key) => {
    setSelectedQueryKey(prev => {
      if (prev === key) return prev;
      return key;
    });
    onSelectedQueryKeyChangeRef.current?.(key);
  }, []);

  const stableOnLoadingDataChange = useCallback((loading) => {
    setLoadingData(prev => {
      if (prev === loading) return prev;
      return loading;
    });
    onLoadingDataChangeRef.current?.(loading);
  }, []);

  const stableOnLastUpdatedAtChange = useCallback((timestamp) => {
    setLastUpdatedAt(prev => {
      if (prev === timestamp) return prev;
      
      // Sticky behavior: if we already have a value and receive null/undefined, 
      // only accept null if the dataSource is offline or we're in a clear state.
      // This prevents the "N/A" flicker when the child DataProvider is re-calculating.
      if (prev && !timestamp && dataSource && dataSource !== 'offline') {
        return prev;
      }
      
      return timestamp;
    });
    onLastUpdatedAtChangeRef.current?.(timestamp);
  }, [dataSource]);

  const stableOnVisibleColumnsChange = useCallback((columns) => {
    onVisibleColumnsChangeRef.current?.(columns);
  }, []);

  const stableOnDrawerTabsChange = useCallback((tabs) => {
    setDrawerTabs(tabs);
    onDrawerTabsChangeRef.current?.(tabs);
  }, []);

  const stableOnColumnTypesChange = useCallback((types) => {
    onColumnTypesChangeRef.current?.(types);
  }, []);

  const stableOnAdminModeChange = useCallback((adminMode) => {
    onAdminModeChangeRef.current?.(adminMode);
  }, []);

  const stableOnEnableReportChange = useCallback((enabled) => {
    setEnableReport(enabled);
    onEnableReportChangeRef.current?.(enabled);
  }, []);

  const stableOnDateColumnChange = useCallback((col) => {
    setDateColumnRaw(col);
    onDateColumnChangeRef.current?.(col);
  }, []);

  const stableOnBreakdownTypeChange = useCallback((type) => {
    setBreakdownTypeRaw(type);
    onBreakdownTypeChangeRef.current?.(type);
  }, []);

  const stableOnOuterGroupFieldChange = useCallback((field) => {
    setOuterGroupFieldRaw(field);
    if (!field) setInnerGroupFieldRaw(null);
    onOuterGroupFieldChangeRef.current?.(field);
  }, []);

  const stableOnInnerGroupFieldChange = useCallback((field) => {
    setInnerGroupFieldRaw(field);
    onInnerGroupFieldChangeRef.current?.(field);
  }, []);

  const openDrawerWithData = useCallback((data, outerValue, innerValue) => {
    setDrawerData(data || []);
    setClickedDrawerValues({ outerValue, innerValue });
    setActiveDrawerTabIndex(0);
    setDrawerVisible(true);
    propOnDrawerVisibleChange?.(true);
  }, [propOnDrawerVisibleChange]);

  const openDrawerForOuterGroup = useCallback((value) => {
    // We use currentTableData which is the filtered data from DataProvider
    const dataToFilter = currentTableData || [];
    const filtered = lodashFilter(dataToFilter, (row) => {
      const rowValue = get(row, outerGroupField);
      return isNil(value) ? isNil(rowValue) : String(rowValue) === String(value);
    });
    openDrawerWithData(filtered, value, null);
  }, [currentTableData, outerGroupField, openDrawerWithData]);

  const openDrawerForInnerGroup = useCallback((outerValue, value) => {
    const dataToFilter = currentTableData || [];
    const filtered = lodashFilter(dataToFilter, (row) => {
      const rowOuterValue = get(row, outerGroupField);
      const rowInnerValue = get(row, innerGroupField);
      let outerMatch = isNil(outerValue) ? isNil(rowOuterValue) : String(rowOuterValue) === String(outerValue);
      if (!outerMatch) return false;
      return isNil(value) ? isNil(rowInnerValue) : String(rowInnerValue) === String(value);
    });
    openDrawerWithData(filtered, outerValue, value);
  }, [currentTableData, outerGroupField, innerGroupField, openDrawerWithData]);

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false);
    propOnDrawerVisibleChange?.(false);
  }, [propOnDrawerVisibleChange]);

  // Stabilize merged variables to prevent infinite fetch loops
  // We only pass variables as "overrides" if they actually differ from the base variables
  // reported by the core DataProvider. This allows the core to use its cache-first
  // logic for the initial load if the props match the query defaults.
  // We use an empty object reference for "no overrides" to avoid triggering DataProvider
  const NO_OVERRIDES = useMemo(() => ({}), []);

  const stableOverrides = useMemo(() => {
    const combined = {
      ...otherProps,
      ...(variableOverrides || {})
    };
    
    // If variables haven't been loaded from the query doc yet, we don't pass any
    // overrides to allow the core DataProvider to check its cache first.
    if (!variablesLoaded) {
      return NO_OVERRIDES;
    }

    // Filter out values that match currentVariables to avoid redundant triggers
    const delta = {};
    let hasActualOverride = false;
    
    Object.keys(combined).forEach(key => {
      // Skip standard React/Plasmic props and internal feature state
      if ([
        'startDate', 'endDate', 'className', 'style',
        'outerGroupField', 'innerGroupField', 'drawerTabs',
        'enableReport', 'dateColumn', 'breakdownType',
        'onEnableReportChange', 'onDateColumnChange', 'onBreakdownTypeChange',
        'onOuterGroupFieldChange', 'onInnerGroupFieldChange',
        'drawerSalesTeamColumn', 'drawerSalesTeamValues', 'drawerHqColumn', 'drawerHqValues',
        'drawerVisible', 'onDrawerVisibleChange'
      ].includes(key)) return;

      const value = combined[key];
      const defaultValue = currentVariables[key];
      
      // Explicitly defined variable props in Plasmic
      const isExplicitVariable = ['First', 'Operator', 'Status', 'Customer'].includes(key);

      if (currentVariables.hasOwnProperty(key)) {
        if (JSON.stringify(value) !== JSON.stringify(defaultValue)) {
          delta[key] = value;
          hasActualOverride = true;
        }
      } else if (isExplicitVariable && value !== undefined && value !== null) {
        delta[key] = value;
        hasActualOverride = true;
      }
    });
    
    if (hasActualOverride) {
      console.log('TableDataProvider: Detected variable overrides:', delta);
      return delta;
    }
    
    return NO_OVERRIDES;
  }, [variablesLoaded, JSON.stringify(otherProps), JSON.stringify(variableOverrides), JSON.stringify(currentVariables), NO_OVERRIDES]);

  const consolidatedData = useMemo(() => ({
    tableData: currentTableData,
    rawTableData: currentRawData,
    queryVariables: currentVariables,
    savedQueries,
    loadingQueries,
    executingQuery,
    availableQueryKeys,
    selectedQueryKey,
    loadingData,
    lastUpdatedAt,
    dataSource,
    isAdminMode,
    salesTeamColumn,
    salesTeamValues: normalizedSalesTeamValues,
    hqColumn,
    hqValues: normalizedHqValues,
    columnTypes,
    useOrchestrationLayer,
    enableSort,
    enableFilter,
    enableSummation,
    enableGrouping,
    enableDivideBy1Lakh,
    textFilterColumns,
    visibleColumns,
    redFields,
    greenFields,
    outerGroupField,
    innerGroupField,
    percentageColumns,
    drawerTabs,
    enableReport,
    dateColumn,
    breakdownType,
    onEnableReportChange: stableOnEnableReportChange,
    onDateColumnChange: stableOnDateColumnChange,
    onBreakdownTypeChange: stableOnBreakdownTypeChange,
    onOuterGroupFieldChange: stableOnOuterGroupFieldChange,
    onInnerGroupFieldChange: stableOnInnerGroupFieldChange,
    // Drawer functions for DataTableComponent to use
    openDrawerWithData,
    openDrawerForOuterGroup,
    openDrawerForInnerGroup,
    closeDrawer,
    setActiveDrawerTabIndex,
  }), [
    currentTableData, currentRawData, currentVariables, savedQueries,
    loadingQueries, executingQuery, availableQueryKeys, selectedQueryKey,
    loadingData, lastUpdatedAt, dataSource, isAdminMode, salesTeamColumn, normalizedSalesTeamValues,
    hqColumn, normalizedHqValues, columnTypes, useOrchestrationLayer,
    enableSort, enableFilter, enableSummation, enableGrouping,
    enableDivideBy1Lakh, textFilterColumns, visibleColumns, redFields, greenFields,
    outerGroupField, innerGroupField, percentageColumns, drawerTabs,
    enableReport, dateColumn, breakdownType,
    stableOnEnableReportChange, stableOnDateColumnChange, stableOnBreakdownTypeChange,
    stableOnOuterGroupFieldChange, stableOnInnerGroupFieldChange,
    openDrawerWithData, openDrawerForOuterGroup, openDrawerForInnerGroup, closeDrawer,
    setActiveDrawerTabIndex
  ]);

  return (
    <DataProvider
      offlineData={data}
      dataSource={dataSource}
      selectedQueryKey={queryKey}
      useOrchestrationLayer={useOrchestrationLayer}
      onDataChange={stableOnDataChange}
      onError={stableOnError}
      onTableDataChange={stableOnTableDataChange}
      onRawDataChange={stableOnRawDataChange}
      onVariablesChange={stableOnVariablesChange}
      onDataSourceChange={stableOnDataSourceChange}
      onSavedQueriesChange={stableOnSavedQueriesChange}
      onLoadingQueriesChange={stableOnLoadingQueriesChange}
      onExecutingQueryChange={stableOnExecutingQueryChange}
      onAvailableQueryKeysChange={stableOnAvailableQueryKeysChange}
      onSelectedQueryKeyChange={stableOnSelectedQueryKeyChange}
      onLoadingDataChange={stableOnLoadingDataChange}
      onLastUpdatedAtChange={stableOnLastUpdatedAtChange}
      onVisibleColumnsChange={stableOnVisibleColumnsChange}
      onDrawerTabsChange={stableOnDrawerTabsChange}
      onColumnTypesOverrideChange={stableOnColumnTypesChange}
      onAdminModeChange={stableOnAdminModeChange}
      onEnableReportChange={stableOnEnableReportChange}
      onDateColumnChange={stableOnDateColumnChange}
      onBreakdownTypeChange={stableOnBreakdownTypeChange}
      onOuterGroupFieldChange={stableOnOuterGroupFieldChange}
      onInnerGroupFieldChange={stableOnInnerGroupFieldChange}
      variableOverrides={stableOverrides}
      isAdminMode={isAdminMode}
      salesTeamColumn={salesTeamColumn}
      salesTeamValues={normalizedSalesTeamValues}
      hqColumn={hqColumn}
      hqValues={normalizedHqValues}
      columnTypes={columnTypes}
      columnTypesOverride={columnTypes}
      enableSort={enableSort}
      enableFilter={enableFilter}
      enableSummation={enableSummation}
      enableGrouping={enableGrouping}
      enableDivideBy1Lakh={enableDivideBy1Lakh}
      textFilterColumns={textFilterColumns}
      visibleColumns={visibleColumns}
      redFields={redFields}
      greenFields={greenFields}
      outerGroupField={outerGroupField}
      innerGroupField={innerGroupField}
      percentageColumns={percentageColumns}
      drawerTabs={drawerTabs}
      enableReport={enableReport}
      dateColumn={dateColumn}
      breakdownType={breakdownType}
      hideDataSourceAndQueryKey={hideDataSourceAndQueryKey !== undefined ? hideDataSourceAndQueryKey : !showSelectors}
      renderHeaderControls={(selectorsJSX) => showSelectors ? (
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-start gap-3 flex-wrap">
              {/* Left: Data Source and Query Key Selectors (if not hidden) */}
              {!hideDataSourceAndQueryKey && (
                <div className="flex items-end gap-3 flex-wrap">
                  {/* Data Source Selector */}
                  <div className="w-full sm:w-48">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Data Source
                    </label>
                    <Dropdown
                      value={dataSource}
                      onChange={(e) => stableOnDataSourceChange(e.value)}
                      options={[
                        { label: 'Offline', value: 'offline' },
                        ...savedQueries.map(q => ({ label: q.name, value: q.id }))
                      ]}
                      optionLabel="label"
                      optionValue="value"
                      placeholder="Select a data source"
                      className="w-full"
                      loading={loadingQueries}
                      disabled={executingQuery}
                      style={{
                        height: '3rem',
                      }}
                    />
                  </div>

                  {/* Query Key Selector */}
                  {dataSource && dataSource !== 'offline' && availableQueryKeys.length > 0 && (
                    <div className="w-full sm:w-48">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Query Key
                      </label>
                      <Dropdown
                        value={selectedQueryKey}
                        onChange={(e) => stableOnSelectedQueryKeyChange(e.value)}
                        options={availableQueryKeys.map(key => ({ 
                          label: startCase(key.split('__').join(' ').split('_').join(' ')), 
                          value: key 
                        }))}
                        optionLabel="label"
                        optionValue="value"
                        placeholder="Select Query Key"
                        className="w-full"
                        disabled={executingQuery}
                        style={{
                          height: '3rem',
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom: selectorsJSX from DataProvider (Month, Sales Team, HQ, Sync, Last Updated) */}
            <div className="w-full wrapper-selectors-container">
              {selectorsJSX}
              
              {/* Corrected Last Updated Display - Following DataProvider.jsx wording/style */}
              {dataSource && dataSource !== 'offline' && (
                <div className="mt-2 text-xs text-gray-700">
                  {/* Last updated: {lastUpdatedAt ? formatLastUpdatedDate(lastUpdatedAt) : <span className="text-gray-400">N/A</span>} */}
                </div>
              )}
            </div>
          </div>
          
          {/* CSS to hide the internal/broken Last Updated text but keep the Sync button */}
          <style dangerouslySetInnerHTML={{ __html: `
            .wrapper-selectors-container .whitespace-nowrap:not(.p-button-label) {
              display: none !important;
            }
            
            /* Fix for Drawer scrolling issues */
            .p-sidebar-bottom.p-sidebar-sm {
              height: 100dvh !important;
            }
            
            .p-sidebar-bottom .p-sidebar-content {
              height: 100%;
              display: flex;
              flex-direction: column;
              overflow-y: auto !important; /* Changed from hidden to auto */
              padding: 0 !important;
            }
            
            .p-sidebar-bottom .p-tabview {
              display: flex;
              flex-direction: column;
              height: 100%;
            }
            
            .p-sidebar-bottom .p-tabview-panels {
              flex: 1;
              display: flex;
              flex-direction: column;
              padding: 0 !important;
              min-height: 0;
            }
            
            .p-sidebar-bottom .p-tabview-panel {
              flex: 1;
              display: flex;
              flex-direction: column;
              height: 100%;
              min-height: 0;
            }
            
            /* Target both the manual overflow-auto div and PrimeReact's internal wrapper */
            .p-sidebar-bottom .overflow-auto,
            .p-sidebar-bottom .p-datatable-wrapper,
            .p-sidebar-bottom .p-datatable-scrollable-body {
              flex: 1;
              overflow-y: auto !important;
              -webkit-overflow-scrolling: touch;
            }
          `}} />
        </div>
      ) : null}
    >
      <PlasmicDataProvider name="data" data={consolidatedData}>
        <TableProvider value={consolidatedData}>
          {children}
          <div style={{ height: 'auto' }}>
            {dataSlot}
          </div>
        </TableProvider>
      </PlasmicDataProvider>

      {/* Drawer Sidebar - copied exactly from DataProviderNew.jsx structure */}
      <Sidebar
        position="bottom"
        blockScroll
        visible={drawerVisible}
        onHide={closeDrawer}
        style={{ height: '100vh' }}
        className="p-sidebar-sm"
        header={
          <h2 className="text-lg font-semibold text-gray-800 m-0">
            {clickedDrawerValues.innerValue
              ? `${clickedDrawerValues.outerValue} : ${clickedDrawerValues.innerValue}`
              : clickedDrawerValues.outerValue || 'Drawer'}
          </h2>
        }
      >
        <div className="flex flex-col h-full">
          <div className="flex-1">
            {drawerTabs && drawerTabs.length > 0 ? (
              <TabView
                activeIndex={Math.min(activeDrawerTabIndex, Math.max(0, drawerTabs.length - 1))}
                onTabChange={(e) => setActiveDrawerTabIndex(e.index)}
                className="h-full flex flex-col"
              >
                {drawerTabs.map((tab) => (
                  <TabPanel
                    key={tab.id}
                    header={tab.name || `Tab ${drawerTabs.indexOf(tab) + 1}`}
                    className="h-full flex flex-col"
                  >
                    <div className="flex-1 overflow-auto">
                      {drawerData && drawerData.length > 0 ? (
                        <TableOperationsContext.Provider value={{
                          ...consolidatedData,
                          paginatedData: drawerData,
                          pagination: { first: 0, rows: drawerData.length },
                          visibleColumns: [], // Show all in drawer
                          enableFilter: enableFilter,
                          enableSort: enableSort,
                          enableSummation: enableSummation,
                          outerGroupField: tab.outerGroup,
                          innerGroupField: tab.innerGroup,
                        }}>
                          <DataTableComponent
                            data={drawerData}
                            useOrchestrationLayer={true}
                            rowsPerPageOptions={[5, 10, 25, 50, 100, 200]}
                            defaultRows={10}
                            scrollable={false}
                            enableSort={enableSort}
                            enableFilter={enableFilter}
                            enableSummation={enableSummation}
                            textFilterColumns={textFilterColumns}
                            visibleColumns={visibleColumns}
                            onVisibleColumnsChange={stableOnVisibleColumnsChange}
                            redFields={redFields}
                            greenFields={greenFields}
                            outerGroupField={tab.outerGroup}
                            innerGroupField={tab.innerGroup}
                            percentageColumns={percentageColumns}
                            enableDivideBy1Lakh={enableDivideBy1Lakh}
                            enableCellEdit={false}
                            columnTypes={columnTypes}
                            tableName="sidebar"
                            isAdminMode={isAdminMode}
                            salesTeamColumn={drawerSalesTeamColumn}
                            salesTeamValues={drawerSalesTeamValues}
                            hqColumn={drawerHqColumn}
                            hqValues={drawerHqValues}
                          />
                        </TableOperationsContext.Provider>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                          <i className="pi pi-inbox text-4xl text-gray-400 mb-4"></i>
                          <p className="text-gray-600 font-medium">No data available</p>
                          <p className="text-sm text-gray-500 mt-1">No matching rows found</p>
                        </div>
                      )}
                    </div>
                  </TabPanel>
                ))}
              </TabView>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <i className="pi pi-inbox text-4xl text-gray-400 mb-4"></i>
                <p className="text-gray-600 font-medium">No tabs configured</p>
                <p className="text-sm text-gray-500 mt-1">Please configure drawer tabs in settings</p>
              </div>
            )}
          </div>
        </div>
      </Sidebar>
    </DataProvider>
  );
};

export default TableDataProvider;
