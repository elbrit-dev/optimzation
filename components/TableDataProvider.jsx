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
    onVariablesChange,
    onDataSourceChange,
    variableOverrides,
    showSelectors = true,
    hideDataSourceAndQueryKey,
    ...otherProps // Collect all other individual props to use as variables
  } = props;

  const [currentTableData, setCurrentTableData] = useState(null);
  const [currentVariables, setCurrentVariables] = useState({});

  // Stable callback wrappers to prevent infinite loops in the shared DataProvider
  const onTableDataChangeRef = useRef(onTableDataChange);
  const onDataChangeRef = useRef(onDataChange);
  const onVariablesChangeRef = useRef(onVariablesChange);
  const onDataSourceChangeRef = useRef(onDataSourceChange);

  useEffect(() => { onTableDataChangeRef.current = onTableDataChange; }, [onTableDataChange]);
  useEffect(() => { onDataChangeRef.current = onDataChange; }, [onDataChange]);
  useEffect(() => { onVariablesChangeRef.current = onVariablesChange; }, [onVariablesChange]);
  useEffect(() => { onDataSourceChangeRef.current = onDataSourceChange; }, [onDataSourceChange]);

  const stableOnTableDataChange = useCallback((data) => {
    setCurrentTableData(data);
    onTableDataChangeRef.current?.(data);
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

  // Sync props to localStorage and manage re-mount key only on genuine prop changes
  useEffect(() => {
    // Skip the initial mount to prevent automatic execution on load
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Only proceed if dataSource or queryKey has actually changed from what we last handled
    if (dataSource !== lastPropsRef.current.dataSource || queryKey !== lastPropsRef.current.queryKey) {
      if (typeof window !== 'undefined') {
        const syncToStore = (key, value) => {
          if (value !== undefined && value !== null) {
            const stringified = JSON.stringify(value);
            if (window.localStorage.getItem(key) !== stringified) {
              window.localStorage.setItem(key, stringified);
            }
          }
        };

        syncToStore('datatable-dataSource', dataSource || 'offline');
        syncToStore('datatable-selectedQueryKey', queryKey);
        
        // Update the key to force a re-mount of the DataProvider only when these specific props change
        setInstanceKey(`${dataSource || 'offline'}-${queryKey || 'default'}-${Date.now()}`);
        lastPropsRef.current = { dataSource, queryKey };
      }
    }
  }, [dataSource, queryKey]);

  return (
    <DataProvider
      key={instanceKey}
      offlineData={data}
      onDataChange={stableOnDataChange}
      onTableDataChange={stableOnTableDataChange}
      onVariablesChange={stableOnVariablesChange}
      onDataSourceChange={stableOnDataSourceChange}
      variableOverrides={stableOverrides}
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
        <PlasmicDataProvider name="queryVariables" data={currentVariables}>
          {children}
          <div style={{ height: 'auto' }}>
            {dataSlot}
          </div>
        </PlasmicDataProvider>
      </PlasmicDataProvider>
    </DataProvider>
  );
};

export default TableDataProvider;

