'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { startCase } from 'lodash';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { parse as parseJsonc, stripComments } from 'jsonc-parser';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { getInitialEndpoint } from '@/app/graphql-playground/constants';
import { createExecutionContext, executePipeline } from '@/app/graphql-playground/utils/query-pipeline';

const { RangePicker } = DatePicker;

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
    } catch (error) {
      // Ignore errors during sync
    }
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

export default function DataProvider({ 
  offlineData, 
  onDataChange, 
  onError,
  onTableDataChange,
  renderHeaderControls,
  onDataSourceChange,
  variableOverrides = {},
  onVariablesChange,
  children 
}) {
  const [dataSource, setDataSource] = useLocalStorageString('datatable-dataSource', 'offline');
  const [selectedQueryKey, setSelectedQueryKey] = useLocalStorageString('datatable-selectedQueryKey', null);
  const [savedQueries, setSavedQueries] = useState([]);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [executingQuery, setExecutingQuery] = useState(false);
  const [processedData, setProcessedData] = useState(null);
  const [monthRange, setMonthRange] = useState(null); // Array of [startMonth, endMonth] or null
  const [hasMonthSupport, setHasMonthSupport] = useState(false); // Whether the current query supports month filtering
  const [queryVariables, setQueryVariables] = useState({}); // Variables from the saved query
  const queryVariablesRef = useRef({}); // Ref to track variables immediately (for synchronous access)
  const executingQueryIdRef = useRef(null); // Track which query is currently executing to prevent duplicates
  const executionContextRef = useRef(null); // Persist execution context across runs for caching

  // Load saved queries on mount
  useEffect(() => {
    const loadSavedQueries = async () => {
      setLoadingQueries(true);
      try {
        const queries = await firestoreService.getAllQueries();
        setSavedQueries(queries);
      } catch (error) {
        console.error('Error loading saved queries:', error);
        if (onError) {
          onError({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load saved queries',
            life: 3000
          });
        }
      } finally {
        setLoadingQueries(false);
      }
    };
    loadSavedQueries();
  }, [onError]);

  // Initialize execution context on mount
  useEffect(() => {
    if (!executionContextRef.current) {
      executionContextRef.current = createExecutionContext();
    }
  }, []);

  // Keep ref in sync with queryVariables state (for cases where state is updated elsewhere)
  useEffect(() => {
    queryVariablesRef.current = queryVariables;
  }, [queryVariables]);

  // Notify parent when data source changes
  useEffect(() => {
    if (onDataSourceChange) {
      onDataSourceChange(dataSource);
    }
  }, [dataSource, onDataSourceChange]);

  // Handle data source changes - auto-execute when user changes data source or on initial load
  useEffect(() => {
    if (dataSource === 'offline') {
      // Switching to offline - reset query-related state
      setProcessedData(null);
      setSelectedQueryKey(null);
      setMonthRange(null);
      setHasMonthSupport(false);
      setQueryVariables({});
      setOfflineDataExecuted(false); // Reset offline execution state
      // Reset execution context when switching to offline
      executionContextRef.current = createExecutionContext();
      // Notify parent that variables changed
      if (onVariablesChange) {
        onVariablesChange({});
      }
      // Auto-execute offline data
      setOfflineDataExecuted(true);
      if (onDataChange) {
        onDataChange({
          severity: 'success',
          summary: 'Success',
          detail: 'Offline data loaded',
          life: 3000
        });
      }
    } else if (dataSource && dataSource !== 'offline') {
      // Load query metadata and auto-execute
      const loadQueryMetadata = async () => {
        try {
          const queryDoc = await firestoreService.loadQuery(dataSource);
          if (queryDoc) {
            const { month, monthDate, variables: rawVariables } = queryDoc;
            setHasMonthSupport(month === true);
            
            // Parse and set query variables (excluding startDate and endDate)
            // Use jsonc-parser (same as GraphiQL) to handle JSON with comments and lenient syntax
            let parsedVariables = {};
            if (rawVariables && rawVariables.trim()) {
              try {
                // Use jsonc-parser to parse (handles comments, trailing commas, etc. like GraphiQL)
                parsedVariables = parseJsonc(rawVariables);
                // Remove startDate and endDate
                const { startDate, endDate, ...filteredVariables } = parsedVariables;
                // Update both state and ref immediately
                setQueryVariables(filteredVariables);
                queryVariablesRef.current = filteredVariables;
                // Notify parent that variables changed
                if (onVariablesChange) {
                  onVariablesChange(filteredVariables);
                }
              } catch (e) {
                // If jsonc-parser fails, try to strip comments and parse again
                try {
                  const stripped = stripComments(rawVariables);
                  parsedVariables = JSON.parse(stripped);
                  // Remove startDate and endDate
                  const { startDate, endDate, ...filteredVariables } = parsedVariables;
                  // Update both state and ref immediately
                  setQueryVariables(filteredVariables);
                  queryVariablesRef.current = filteredVariables;
                  // Notify parent that variables changed
                  if (onVariablesChange) {
                    onVariablesChange(filteredVariables);
                  }
                } catch (fallbackError) {
                  console.error('Failed to parse variables:', fallbackError);
                  // Set empty variables but log the issue
                  setQueryVariables({});
                  queryVariablesRef.current = {};
                  if (onVariablesChange) {
                    onVariablesChange({});
                  }
                }
              }
            } else {
              setQueryVariables({});
              queryVariablesRef.current = {};
              if (onVariablesChange) {
                onVariablesChange({});
              }
            }
            
            // Load initial month range from monthDate
            let initialMonthRange = null;
            if (month === true && monthDate) {
              try {
                const date = new Date(monthDate);
                if (!isNaN(date.getTime())) {
                  const year = date.getFullYear();
                  const monthIndex = date.getMonth();
                  const startOfMonth = new Date(year, monthIndex, 1);
                  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
                  const endOfMonth = new Date(year, monthIndex, lastDay);
                  initialMonthRange = [startOfMonth, endOfMonth];
                  setMonthRange(initialMonthRange);
                } else {
                  setMonthRange(null);
                }
              } catch (error) {
                console.error('Error parsing monthDate:', error);
                setMonthRange(null);
              }
            } else if (month !== true) {
              setMonthRange(null);
            }

            // Auto-execute query after loading metadata (including initial load)
            // For month-supported queries, only execute if monthRange is set
            // Variables are already set in queryVariablesRef.current, so we can execute immediately
            if (month !== true || initialMonthRange) {
              runQuery(dataSource, true);
            }
          }
        } catch (error) {
          console.error('Error loading query metadata:', error);
        }
      };
      loadQueryMetadata();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource]); // Only depend on dataSource, not onVariablesChange to avoid infinite loops

  // Auto-execute when variableOverrides change (user applied variables)
  useEffect(() => {
    if (!dataSource || dataSource === 'offline') return; // Skip for offline
    
    // Only execute if there are actual variable overrides
    const hasOverrides = Object.keys(variableOverrides).length > 0;
    
    if (hasOverrides) {
      // For month-supported queries, require monthRange
      if (hasMonthSupport && (!monthRange || !Array.isArray(monthRange) || monthRange.length !== 2)) {
        return; // Don't execute if month range is required but not set
      }
      runQuery(dataSource, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variableOverrides]); // Only depend on variableOverrides

  // Auto-execute when monthRange changes (user changed month range)
  useEffect(() => {
    if (!dataSource || dataSource === 'offline') return; // Skip for offline
    if (!hasMonthSupport) return; // Only for month-supported queries
    
    // Only execute if monthRange is set
    if (monthRange && Array.isArray(monthRange) && monthRange.length === 2) {
      runQuery(dataSource, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthRange]); // Only depend on monthRange

  // Get available query keys from processedData
  const availableQueryKeys = useMemo(() => {
    if (!processedData || !dataSource) return [];
    return Object.keys(processedData).filter(key => 
      processedData[key] && 
      processedData[key].length > 0
    );
  }, [processedData, dataSource]);

  // Reset selectedQueryKey if it's not in available keys or if processedData changes
  useEffect(() => {
    if (dataSource && processedData) {
      if (selectedQueryKey && !availableQueryKeys.includes(selectedQueryKey)) {
        if (availableQueryKeys.length > 0) {
          setSelectedQueryKey(availableQueryKeys[0]);
        } else {
          setSelectedQueryKey(null);
        }
      } else if (!selectedQueryKey && availableQueryKeys.length > 0) {
        setSelectedQueryKey(availableQueryKeys[0]);
      }
    }
  }, [processedData, availableQueryKeys, selectedQueryKey, dataSource, setSelectedQueryKey]);


  // Execute query using the unified pipeline
  const runQuery = useCallback(async (queryId, skipMonthDateLoad = false) => {
    // Hard guard: prevent execution if already executing any query
    if (executingQuery) {
      return;
    }

    // Prevent concurrent execution of the same query
    if (executingQueryIdRef.current === queryId) {
      return;
    }

    // Ensure execution context exists
    if (!executionContextRef.current) {
      executionContextRef.current = createExecutionContext();
    }

    executingQueryIdRef.current = queryId;
    setExecutingQuery(true);
    
    // Use ref for immediate access (avoids stale closure issues)
    // Merge queryVariables with variableOverrides (variableOverrides take precedence for user overrides)
    const mergedVariables = { ...queryVariablesRef.current, ...variableOverrides };
    
    try {
      // Get endpoint URL and auth token
      const endpoint = getInitialEndpoint();
      const endpointUrl = endpoint?.code;

      // Execute pipeline using persisted execution context (enables caching)
      const finalData = await executePipeline(queryId, executionContextRef.current, {
        endpointUrl,
        monthRange: monthRange && Array.isArray(monthRange) && monthRange.length === 2 ? monthRange : undefined,
        variableOverrides: mergedVariables,
      });

      // Store final processed data
      setProcessedData(finalData);

      if (onDataChange) {
        onDataChange({
          severity: 'success',
          summary: 'Success',
          detail: 'Query executed successfully',
          life: 3000
        });
      }
    } catch (error) {
      console.error(`Query execution failed: ${queryId}`, error);
      if (onError) {
        onError({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to execute query',
          life: 5000
        });
      }
      setProcessedData(null);
    } finally {
      // Only clear if this is still the current executing query
      if (executingQueryIdRef.current === queryId) {
        executingQueryIdRef.current = null;
      }
      setExecutingQuery(false);
    }
  }, [onDataChange, onError, monthRange, executingQuery, variableOverrides, queryVariables]);

  // Track if offline data has been "executed" (shown)
  const [offlineDataExecuted, setOfflineDataExecuted] = useState(false);

  // Determine which data to use (from executed queries or executed offline)
  const tableData = useMemo(() => {
    // If offline mode and executed, show offline data
    if (dataSource === 'offline' && offlineDataExecuted) {
      return offlineData || [];
    }
    // If query mode and executed, show processed data
    if (dataSource && dataSource !== 'offline' && processedData && selectedQueryKey) {
      return processedData[selectedQueryKey] || [];
    }
    // Return null to indicate no data available (will show placeholder)
    return null;
  }, [dataSource, processedData, selectedQueryKey, offlineData, offlineDataExecuted]);

  // Notify parent when table data changes
  useEffect(() => {
    if (onTableDataChange) {
      onTableDataChange(tableData);
    }
  }, [tableData, onTableDataChange]);

  // Render selectors JSX
  const selectorsJSX = (
    <>
      <div className="flex items-center justify-between w-full gap-3">
        <div className="flex items-end gap-3">
          {/* Data Source Selector */}
          <div className="w-48">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Data Source
            </label>
            <Dropdown
              value={dataSource}
              onChange={(e) => setDataSource(e.value)}
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
            />
          </div>

          {/* Query Key Selector - Only show when using saved query */}
          {dataSource && availableQueryKeys.length > 0 && (
            <div className="w-48">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Query Key
              </label>
              <Dropdown
                value={selectedQueryKey}
                onChange={(e) => setSelectedQueryKey(e.value)}
                options={availableQueryKeys.map(key => ({ 
                  label: startCase(key.split('__').join(' ').split('_').join(' ')), 
                  value: key 
                }))}
                optionLabel="label"
                optionValue="value"
                placeholder="Select Query Key"
                className="w-full"
                disabled={executingQuery || !processedData}
              />
            </div>
          )}

          {/* Month Range Picker - Only show when using saved query that supports month filtering */}
          {dataSource && hasMonthSupport && (
            <div className="w-64">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Month Range
              </label>
              <RangePicker
                picker="month"
                value={
                  monthRange && Array.isArray(monthRange) && monthRange.length === 2
                    ? [dayjs(monthRange[0]), dayjs(monthRange[1])]
                    : null
                }
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    // Convert dayjs to Date objects
                    setMonthRange([dates[0].toDate(), dates[1].toDate()]);
                  } else {
                    setMonthRange(null);
                  }
                }}
                placeholder={['Start month', 'End month']}
                format="MM/YY"
                disabled={executingQuery}
                className="w-full"
                style={{
                  width: '100%',
                  fontSize: '0.875rem',
                  height: '2.5rem',
                }}
              />
            </div>
          )}
        </div>

        {/* Loading indicator when executing - vertically centered and at the right */}
        {executingQuery && dataSource && dataSource !== 'offline' && (
          <div className="flex items-center gap-2 text-sm text-gray-500 shrink-0">
            <i className="pi pi-spin pi-spinner text-blue-600"></i>
            <span>Executing...</span>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Render header controls if render prop provided */}
      {renderHeaderControls && renderHeaderControls(selectorsJSX)}
      
      {/* Render children */}
      {children}
    </>
  );
}

