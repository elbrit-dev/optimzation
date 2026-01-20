'use client';

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import DataProvider from '../share/datatable/components/DataProvider';
import data from '../resource/data';
import { DataProvider as PlasmicDataProvider } from "@plasmicapp/loader-nextjs";
import { Dropdown } from 'primereact/dropdown';
import { startCase } from 'lodash';
import { TableProvider } from './TableContext';
import dayjs from 'dayjs';
import { firestoreService } from '../share/graphql-playground/services/firestoreService';
import { indexedDBService } from '../share/datatable/utils/indexedDBService';
import { parseGraphQLVariables } from '../share/graphql-playground/utils/variableParser';

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
    outerGroupField = null,
    innerGroupField = null,
    percentageColumns = [],
    drawerTabs = [],
    onVisibleColumnsChange: propOnVisibleColumnsChange,
    onDrawerTabsChange: propOnDrawerTabsChange,
    onAdminModeChange: propOnAdminModeChange,
    className,
    style,
    ...otherProps // Collect all other individual props to use as variables
  } = props;

  const propOnColumnTypesChange = onColumnTypesChange;

  const [currentTableData, setCurrentTableData] = useState(null);
  const [currentRawData, setCurrentRawData] = useState(null);
  const [currentVariables, setCurrentVariables] = useState({});
  
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
          fetchLastUpdatedFromDB(dataSource, queryDoc, initialMonthRange);
        }
      } catch (error) {
        console.error('Error loading metadata in wrapper:', error);
      }
    };
    loadMetadata();
  }, [dataSource, fetchLastUpdatedFromDB]);

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
    onDrawerTabsChangeRef.current?.(tabs);
  }, []);

  const stableOnColumnTypesChange = useCallback((types) => {
    onColumnTypesChangeRef.current?.(types);
  }, []);

  const stableOnAdminModeChange = useCallback((adminMode) => {
    onAdminModeChangeRef.current?.(adminMode);
  }, []);

  // Stabilize merged variables to prevent infinite fetch loops
  // We only pass variables as "overrides" if they actually differ from the base variables
  // reported by the core DataProvider. This allows the core to use its cache-first
  // logic for the initial load if the props match the query defaults.
  const stableOverrides = useMemo(() => {
    const combined = {
      ...otherProps,
      ...(variableOverrides || {})
    };
    
    // If variables haven't been loaded from the query doc yet, we don't pass any
    // overrides to allow the core DataProvider to check its cache first.
    if (!variablesLoaded) {
      return {};
    }

    // Filter out values that match currentVariables to avoid redundant triggers
    const delta = {};
    let hasActualOverride = false;
    
    Object.keys(combined).forEach(key => {
      // Skip startDate/endDate and standard React/Plasmic props
      if (['startDate', 'endDate', 'className', 'style'].includes(key)) return;

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
    }
    
    return hasActualOverride ? delta : {};
  }, [variablesLoaded, JSON.stringify(otherProps), JSON.stringify(variableOverrides), JSON.stringify(currentVariables)]);

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
    salesTeamValues,
    hqColumn,
    hqValues,
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
    drawerTabs
  }), [
    currentTableData, currentRawData, currentVariables, savedQueries,
    loadingQueries, executingQuery, availableQueryKeys, selectedQueryKey,
    loadingData, lastUpdatedAt, dataSource, isAdminMode, salesTeamColumn, salesTeamValues,
    hqColumn, hqValues, columnTypes, useOrchestrationLayer,
    enableSort, enableFilter, enableSummation, enableGrouping,
    enableDivideBy1Lakh, textFilterColumns, visibleColumns, redFields, greenFields,
    outerGroupField, innerGroupField, percentageColumns, drawerTabs
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
      variableOverrides={stableOverrides}
      isAdminMode={isAdminMode}
      salesTeamColumn={salesTeamColumn}
      salesTeamValues={salesTeamValues}
      hqColumn={hqColumn}
      hqValues={hqValues}
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
                  Last updated: {lastUpdatedAt ? formatLastUpdatedDate(lastUpdatedAt) : <span className="text-gray-400">N/A</span>}
                </div>
              )}
            </div>
          </div>
          
          {/* CSS to hide the internal/broken Last Updated text but keep the Sync button */}
          <style dangerouslySetInnerHTML={{ __html: `
            .wrapper-selectors-container .whitespace-nowrap:not(.p-button-label) {
              display: none !important;
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
    </DataProvider>
  );
};

export default TableDataProvider;
