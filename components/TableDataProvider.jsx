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

  // Merge individual props with the variableOverrides object
  // Individual props (like 'First' or 'Operator') take precedence
  const mergedVariables = useMemo(() => {
    return {
      ...otherProps,
      ...(variableOverrides || {})
    };
  }, [JSON.stringify(variableOverrides)]); 

  // Stabilize merged variables to prevent infinite fetch loops
  const stableOverrides = useMemo(() => mergedVariables, [JSON.stringify(mergedVariables)]);

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

  // Use state for the re-mount key and refs for change detection
  const [instanceKey, setInstanceKey] = useState(`initial-${dataSource || 'offline'}-${queryKey || 'default'}`);
  const lastPropsRef = useRef({ dataSource, queryKey });
  const isInitialMount = useRef(true);

  // Sync props to internal state and manage re-mount key only on genuine prop changes
  useEffect(() => {
    // Skip the initial mount to prevent automatic execution on load
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Only proceed if dataSource or queryKey has actually changed from what we last handled
    if (dataSource !== lastPropsRef.current.dataSource || queryKey !== lastPropsRef.current.queryKey) {
      // Update the key to force a re-mount of the DataProvider only when these specific props change
      // We removed the global localStorage sync to prevent interference between different pages/instances
      setInstanceKey(`${dataSource || 'offline'}-${queryKey || 'default'}-${Date.now()}`);
      lastPropsRef.current = { dataSource, queryKey };
    }
  }, [dataSource, queryKey]);

  return (
    <DataProvider
      key={instanceKey}
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

