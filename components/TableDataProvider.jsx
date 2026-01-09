'use client';

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import DataProvider from '../share/datatable/components/DataProvider';
import data from '../resource/data';

const TableDataProvider = (props) => {
  const {
    children,
    dataSource,
    queryKey,
    onDataChange,
    onTableDataChange,
    onVariablesChange,
    onDataSourceChange,
    variableOverrides,
    showSelectors = true,
    ...otherProps // Collect all other individual props to use as variables
  } = props;

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
    onTableDataChangeRef.current?.(data);
  }, []);

  const stableOnDataChange = useCallback((notif) => {
    onDataChangeRef.current?.(notif);
  }, []);

  const stableOnVariablesChange = useCallback((vars) => {
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

  // Sync props to localStorage safely
  useEffect(() => {
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
    }
  }, [dataSource, queryKey]);

  return (
    <DataProvider
      key={`${dataSource || 'offline'}-${queryKey || 'default'}`}
      offlineData={data}
      onDataChange={stableOnDataChange}
      onTableDataChange={stableOnTableDataChange}
      onVariablesChange={stableOnVariablesChange}
      onDataSourceChange={stableOnDataSourceChange}
      variableOverrides={stableOverrides}
      renderHeaderControls={(selectorsJSX) => showSelectors ? (
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-end gap-3 flex-wrap">
            {selectorsJSX}
          </div>
        </div>
      ) : null}
    >
      {children}
    </DataProvider>
  );
};

export default TableDataProvider;

