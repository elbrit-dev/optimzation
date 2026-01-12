'use client';

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import DataProvider from '../share/datatable/components/DataProvider';
import data from '../resource/data';
import { DataProvider as PlasmicDataProvider } from "@plasmicapp/loader-nextjs";
import { Dropdown } from 'primereact/dropdown';
import { startCase } from 'lodash';
import { TableProvider } from './TableContext';

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
    variableOverrides,
    showSelectors = true,
    hideDataSourceAndQueryKey,
    // Auth control props
    isAdminMode = false,
    salesTeamColumn = null,
    salesTeamValues = [],
    hqColumn = null,
    hqValues = [],
    className,
    style,
    ...otherProps // Collect all other individual props to use as variables
  } = props;

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
    dataSource,
    isAdminMode,
    salesTeamColumn,
    salesTeamValues,
    hqColumn,
    hqValues
  }), [
    currentTableData, currentRawData, currentVariables, savedQueries,
    loadingQueries, executingQuery, availableQueryKeys, selectedQueryKey,
    loadingData, dataSource, isAdminMode, salesTeamColumn, salesTeamValues,
    hqColumn, hqValues
  ]);

  return (
    <DataProvider
      offlineData={data}
      dataSource={dataSource}
      selectedQueryKey={queryKey}
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
      variableOverrides={stableOverrides}
      isAdminMode={isAdminMode}
      salesTeamColumn={salesTeamColumn}
      salesTeamValues={salesTeamValues}
      hqColumn={hqColumn}
      hqValues={hqValues}
      hideDataSourceAndQueryKey={hideDataSourceAndQueryKey !== undefined ? hideDataSourceAndQueryKey : !showSelectors}
      renderHeaderControls={(selectorsJSX) => showSelectors ? (
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex justify-between items-start gap-3 flex-wrap">
            {/* Left: selectorsJSX from DataProvider (Month, Sales Team, HQ, Sync) */}
            {selectorsJSX}

            {/* Right: Data Source and Query Key Selectors (if not hidden) */}
            {!hideDataSourceAndQueryKey && (
              <div className="flex items-end gap-3">
                {/* Data Source Selector */}
                <div className="w-48">
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
                  <div className="w-48">
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

