'use client';

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import DataProvider from '../share/datatable/components/DataProvider';
import data from '../resource/data';
import { DataProvider as PlasmicDataProvider } from "@plasmicapp/loader-nextjs";

const TableDataProvider = (props) => {
  const {
    children,
    dataSlot,
    dataSource,
    queryKey,
    onDataChange,
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

  // Stable callback wrappers to prevent infinite loops in the shared DataProvider
  const onTableDataChangeRef = useRef(onTableDataChange);
  const onRawDataChangeRef = useRef(onRawDataChange);
  const onDataChangeRef = useRef(onDataChange);
  const onVariablesChangeRef = useRef(onVariablesChange);
  const onDataSourceChangeRef = useRef(onDataSourceChange);
  
  // New refs for internal state callbacks
  const onSavedQueriesChangeRef = useRef(onSavedQueriesChange);
  const onLoadingQueriesChangeRef = useRef(onLoadingQueriesChange);
  const onExecutingQueryChangeRef = useRef(onExecutingQueryChange);
  const onAvailableQueryKeysChangeRef = useRef(onAvailableQueryKeysChange);
  const onSelectedQueryKeyChangeRef = useRef(onSelectedQueryKeyChange);

  useEffect(() => { onTableDataChangeRef.current = onTableDataChange; }, [onTableDataChange]);
  useEffect(() => { onRawDataChangeRef.current = onRawDataChange; }, [onRawDataChange]);
  useEffect(() => { onDataChangeRef.current = onDataChange; }, [onDataChange]);
  useEffect(() => { onVariablesChangeRef.current = onVariablesChange; }, [onVariablesChange]);
  useEffect(() => { onDataSourceChangeRef.current = onDataSourceChange; }, [onDataSourceChange]);
  
  useEffect(() => { onSavedQueriesChangeRef.current = onSavedQueriesChange; }, [onSavedQueriesChange]);
  useEffect(() => { onLoadingQueriesChangeRef.current = onLoadingQueriesChange; }, [onLoadingQueriesChange]);
  useEffect(() => { onExecutingQueryChangeRef.current = onExecutingQueryChange; }, [onExecutingQueryChange]);
  useEffect(() => { onAvailableQueryKeysChangeRef.current = onAvailableQueryKeysChange; }, [onAvailableQueryKeysChange]);
  useEffect(() => { onSelectedQueryKeyChangeRef.current = onSelectedQueryKeyChange; }, [onSelectedQueryKeyChange]);

  const stableOnTableDataChange = useCallback((data) => {
    setCurrentTableData(data);
    onTableDataChangeRef.current?.(data);
  }, []);

  const stableOnRawDataChange = useCallback((data) => {
    setCurrentRawData(data);
    onRawDataChangeRef.current?.(data);
  }, []);

  const stableOnDataChange = useCallback((notif) => {
    onDataChangeRef.current?.(notif);
  }, []);

  const stableOnVariablesChange = useCallback((vars) => {
    setCurrentVariables(vars);
    onVariablesChangeRef.current?.(vars);
  }, []);

  const stableOnDataSourceChange = useCallback((ds) => {
    onDataSourceChangeRef.current?.(ds);
  }, []);

  // New stable callbacks for internal state
  const stableOnSavedQueriesChange = useCallback((queries) => {
    setSavedQueries(queries);
    onSavedQueriesChangeRef.current?.(queries);
  }, []);

  const stableOnLoadingQueriesChange = useCallback((loading) => {
    setLoadingQueries(loading);
    onLoadingQueriesChangeRef.current?.(loading);
  }, []);

  const stableOnExecutingQueryChange = useCallback((executing) => {
    setExecutingQuery(executing);
    onExecutingQueryChangeRef.current?.(executing);
  }, []);

  const stableOnAvailableQueryKeysChange = useCallback((keys) => {
    setAvailableQueryKeys(keys);
    onAvailableQueryKeysChangeRef.current?.(keys);
  }, []);

  const stableOnSelectedQueryKeyChange = useCallback((key) => {
    setSelectedQueryKey(key);
    onSelectedQueryKeyChangeRef.current?.(key);
  }, []);

  // Merge individual props with the variableOverrides object
  // Individual props (like 'First' or 'Operator') take precedence
  const mergedVariables = useMemo(() => {
    return {
      ...otherProps,
      ...(variableOverrides || {})
    };
  }, [JSON.stringify(otherProps), JSON.stringify(variableOverrides)]);

  // Stabilize merged variables to prevent infinite fetch loops
  const stringifiedOverrides = JSON.stringify(mergedVariables);
  const stableOverrides = useMemo(() => JSON.parse(stringifiedOverrides), [stringifiedOverrides]);

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
      onTableDataChange={stableOnTableDataChange}
      onRawDataChange={stableOnRawDataChange}
      onVariablesChange={stableOnVariablesChange}
      onDataSourceChange={stableOnDataSourceChange}
      onSavedQueriesChange={stableOnSavedQueriesChange}
      onLoadingQueriesChange={stableOnLoadingQueriesChange}
      onExecutingQueryChange={stableOnExecutingQueryChange}
      onAvailableQueryKeysChange={stableOnAvailableQueryKeysChange}
      onSelectedQueryKeyChange={stableOnSelectedQueryKeyChange}
      variableOverrides={stableOverrides}
      isAdminMode={isAdminMode}
      salesTeamColumn={salesTeamColumn}
      salesTeamValues={salesTeamValues}
      hqColumn={hqColumn}
      hqValues={hqValues}
      hideDataSourceAndQueryKey={hideDataSourceAndQueryKey !== undefined ? hideDataSourceAndQueryKey : !showSelectors}
      renderHeaderControls={(selectorsJSX) => showSelectors ? (
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-end gap-3 flex-wrap">
            {selectorsJSX}
          </div>
        </div>
      ) : null}
    >
      <PlasmicDataProvider name="tableData" data={currentTableData}>
        <PlasmicDataProvider name="rawTableData" data={currentRawData}>
          <PlasmicDataProvider name="queryVariables" data={currentVariables}>
            <PlasmicDataProvider name="savedQueries" data={savedQueries}>
              <PlasmicDataProvider name="loadingQueries" data={loadingQueries}>
                <PlasmicDataProvider name="executingQuery" data={executingQuery}>
                  <PlasmicDataProvider name="availableQueryKeys" data={availableQueryKeys}>
                    <PlasmicDataProvider name="selectedQueryKey" data={selectedQueryKey}>
                      {children}
                      <div style={{ height: 'auto' }}>
                        {dataSlot}
                      </div>
                    </PlasmicDataProvider>
                  </PlasmicDataProvider>
                </PlasmicDataProvider>
              </PlasmicDataProvider>
            </PlasmicDataProvider>
          </PlasmicDataProvider>
        </PlasmicDataProvider>
      </PlasmicDataProvider>
    </DataProvider>
  );
};

export default TableDataProvider;

