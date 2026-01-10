'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { startCase } from 'lodash';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { getInitialEndpoint, getEndpointConfigFromUrlKey } from '@/app/graphql-playground/constants';
import { createExecutionContext, executePipeline, fetchGraphQLRequest } from '@/app/graphql-playground/utils/query-pipeline';
import { extractDataFromResponse } from '@/app/graphql-playground/utils/data-extractor';
import { indexedDBService } from '@/app/datatable/utils/indexedDBService';
import { parseGraphQLVariables } from '@/app/graphql-playground/utils/variableParser';
import { extractValueFromGraphQLResponse } from '@/app/graphql-playground/utils/queryExtractor';
import { extractYearMonthFromDate } from '@/app/datatable/utils/dateUtils';
import { getDataKeys, getDataValue } from '../utils/dataAccessUtils';

/**
 * Utility function to extract full date/timestamp from index query response
 * Uses the unified extractValueFromGraphQLResponse utility
 * @param {string} indexQuery - The index GraphQL query string
 * @param {Object} jsonResponse - The JSON response from the index query
 * @returns {string|null} The extracted full date/timestamp string or null if not found
 */
function extractFullDateFromIndexResponse(indexQuery, jsonResponse) {
  return extractValueFromGraphQLResponse(indexQuery, jsonResponse);
}

/**
 * Utility function to execute monthIndex query and extract YYYY-MM from the single date field
 * @param {string} monthIndexQuery - The monthIndex GraphQL query string
 * @param {Object} queryDoc - The query document containing urlKey and variables
 * @returns {Promise<string|null>} The extracted YYYY-MM string or null if not found
 */
async function executeMonthIndexQueryAndExtractYearMonth(monthIndexQuery, queryDoc) {
  if (!monthIndexQuery || !monthIndexQuery.trim()) {
    return null;
  }

  try {
    // Get endpoint/auth from query's urlKey, fallback to default
    const { endpointUrl, authToken } = getEndpointAndAuth(queryDoc);

    if (!endpointUrl) {
      console.warn('No endpoint available for monthIndex query execution');
      return null;
    }

    // Parse variables if provided
    const parsedVariables = parseGraphQLVariables(queryDoc.variables || '');

    // Execute the monthIndex query
    const response = await fetchGraphQLRequest(monthIndexQuery, parsedVariables, {
      endpointUrl,
      authToken
    });

    // Parse JSON response
    const jsonResponse = await response.json();
    
    if (jsonResponse.errors) {
      console.error('GraphQL errors for monthIndex query:', jsonResponse.errors);
      return null;
    }

    // Extract the date value using the unified utility
    const dateValue = extractValueFromGraphQLResponse(monthIndexQuery, jsonResponse);

    if (!dateValue) {
      return null;
    }

    // Extract YYYY-MM from the date value using dayjs utility
    return extractYearMonthFromDate(dateValue);
  } catch (error) {
    console.error('Error executing monthIndex query:', error);
    return null;
  }
}

const { RangePicker } = DatePicker;

/**
 * Helper function to get endpoint URL and auth token from query document
 * @param {Object} queryDoc - Query document with optional urlKey
 * @returns {Object} Object with endpointUrl and authToken, or null values if not available
 */
function getEndpointAndAuth(queryDoc) {
  let endpointUrl, authToken;
  
  if (queryDoc?.urlKey) {
    const config = getEndpointConfigFromUrlKey(queryDoc.urlKey);
    endpointUrl = config.endpointUrl;
    authToken = config.authToken;
  }
  
  // Fallback to default endpoint if urlKey didn't provide one
  if (!endpointUrl) {
    const defaultEndpoint = getInitialEndpoint();
    endpointUrl = defaultEndpoint?.code;
    authToken = null; // Will use DEFAULT_AUTH_TOKEN
  }
  
  return { endpointUrl, authToken };
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
  const pipelineExecutionInFlightRef = useRef(new Set()); // Track pipeline executions in flight to prevent concurrent execution

  // Load saved queries on mount
  useEffect(() => {
    const loadSavedQueries = async () => {
      setLoadingQueries(true);
      try {
        const queries = await firestoreService.getAllQueries();
        setSavedQueries(queries);

        // Execute index queries and store results in IndexedDB
        await executeAndStoreIndexQueries(queries);
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

  // Execute index queries and store results in IndexedDB
  const executeAndStoreIndexQueries = async (queries) => {
    if (!queries || queries.length === 0) {
      return;
    }

    // Create a map of queryId -> query object for quick lookup
    const queryMap = new Map();
    queries.forEach(query => {
      if (query.id) {
        queryMap.set(query.id, query);
      }
    });

    // Register callback for all queries with clientSave === true
    queries.forEach(query => {
      if (query.id && query.index && query.index.trim() && query.clientSave === true) {
        // Store the query object in closure for use in callback
        const queryDoc = query;
        indexedDBService.setOnChangeCallback(query.id, async (queryId, oldResult, newResult, updatedAt, queryDocFromSave) => {
          // Use queryDocFromSave if provided, otherwise fallback to stored queryDoc
          const queryDocToUse = queryDocFromSave || queryMap.get(queryId) || queryDoc;
          
          // Only proceed if clientSave is true
          if (!queryDocToUse || queryDocToUse.clientSave !== true) {
            console.log(`Skipping pipeline execution for ${queryId}: clientSave is not true`);
            return;
          }
          
          console.log('Query index result changed:', {
            queryId,
            oldResult,
            newResult,
            updatedAt: new Date(updatedAt).toISOString(),
            queryDoc: queryDocToUse
          });

          // Execute pipeline in background for both month == false and month == true queries
          if (queryDocToUse && (queryDocToUse.month === false || (queryDocToUse.month === true && queryDocToUse.monthIndex && queryDocToUse.monthIndex.trim()))) {
            // Guard: Check if pipeline execution is already in flight for this queryId (before scheduling)
            if (pipelineExecutionInFlightRef.current.has(queryId)) {
              console.log(`Pipeline execution already in flight for ${queryId}, skipping callback`);
              return;
            }

            // Mark as in flight immediately (before scheduling)
            pipelineExecutionInFlightRef.current.add(queryId);

            // Execute pipeline in background
            const executePipelineAsync = async () => {
              try {
                // For month == true, extract YYYY-MM from monthIndex query first
                let yearMonthPrefix = null;
                if (queryDocToUse.month === true && queryDocToUse.monthIndex && queryDocToUse.monthIndex.trim()) {
                  const yearMonth = await executeMonthIndexQueryAndExtractYearMonth(
                    queryDocToUse.monthIndex,
                    queryDocToUse
                  );
                  
                  if (yearMonth) {
                    yearMonthPrefix = yearMonth;
                    console.log(`Extracted YYYY-MM from monthIndex query for ${queryId}: ${yearMonthPrefix}`);
                  } else {
                    console.warn(`Could not extract YYYY-MM for ${queryId}, skipping pipeline execution`);
                    pipelineExecutionInFlightRef.current.delete(queryId);
                    return;
                  }
                }

                // Create/get the query database (creates it if doesn't exist)
                console.log(`Creating database for queryId: ${queryId}`);
                const queryDb = await indexedDBService.getQueryDatabase(queryId, queryDocToUse);
                console.log(`Database created/opened for queryId: ${queryId}`, queryDb);

                // Create execution context
                const context = createExecutionContext();
                
                // Get endpoint/auth from query's urlKey, fallback to default (same as index query)
                const { endpointUrl, authToken } = getEndpointAndAuth(queryDocToUse);

                if (!endpointUrl) {
                  console.warn(`No endpoint available for pipeline execution for ${queryId}`);
                  pipelineExecutionInFlightRef.current.delete(queryId);
                  return;
                }

                // Execute pipeline
                const pipelineResult = await executePipeline(queryId, context, {
                  endpointUrl,
                  authToken,
                  // Don't pass monthRange for month == false queries
                  // For month == true, we'll organize by YYYY-MM prefix instead
                });

                // Ensure stores exist for each key in the pipeline result
                if (pipelineResult && typeof pipelineResult === 'object') {
                  await indexedDBService.ensureStoresForPipelineResult(queryId, pipelineResult, yearMonthPrefix, queryDocToUse);
                  // Store pipeline result entries in IndexedDB tables
                  await indexedDBService.savePipelineResultEntries(queryId, pipelineResult, yearMonthPrefix, queryDocToUse);
                  console.log(`Pipeline executed for ${queryId}${yearMonthPrefix ? ` with prefix ${yearMonthPrefix}` : ''}, stores ensured and entries saved for keys:`, getDataKeys(pipelineResult));
                  
                  // Reconstruct and print the pipeline result from IndexedDB
                  const reconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, yearMonthPrefix);
                  console.log(`Reconstructed pipeline result for ${queryId}${yearMonthPrefix ? ` with prefix ${yearMonthPrefix}` : ''}:`, reconstructed);
                }
              } catch (error) {
                console.error(`Error executing pipeline for ${queryId}:`, error);
                // Don't throw - this is background execution
              } finally {
                // Remove from in flight set
                pipelineExecutionInFlightRef.current.delete(queryId);
              }
            };

            // Use requestIdleCallback if available, otherwise fallback to setTimeout
            if (typeof requestIdleCallback !== 'undefined') {
              requestIdleCallback(executePipelineAsync, { timeout: 5000 });
            } else {
              setTimeout(executePipelineAsync, 0);
            }
          }
        });
      }
    });

    // Execute index queries for each query that has an index field and clientSave === true
    const indexQueryPromises = queries
      .filter(query => query.index && query.index.trim() && query.clientSave === true)
      .map(async (query) => {
        // Use the query object from getAllQueries (already has all needed data including month)
        const queryDoc = query;
        try {
          // Get endpoint/auth from query's urlKey, fallback to default
          const { endpointUrl, authToken } = getEndpointAndAuth(queryDoc);

          if (!endpointUrl) {
            console.warn(`No endpoint available for query ${query.id}, skipping index query execution`);
            // Store null result (pass queryDoc if available)
            await indexedDBService.saveQueryIndexResult(query.id, null, queryDoc);
            return;
          }

          // Parse variables if provided
          const parsedVariables = parseGraphQLVariables(query.variables || '');

          // Execute the index query
          let response;
          try {
            response = await fetchGraphQLRequest(query.index, parsedVariables, {
              endpointUrl,
              authToken
            });
          } catch (fetchError) {
            // Handle network errors, HTTP errors (500, etc.)
            console.error(`Failed to fetch index query for ${query.id}:`, fetchError.message || fetchError);
            // Store null result on error (pass queryDoc if available)
            await indexedDBService.saveQueryIndexResult(query.id, null, queryDoc);
            return;
          }

          // Parse JSON response
          let jsonResponse;
          try {
            jsonResponse = await response.json();
          } catch (parseError) {
            console.error(`Failed to parse response for index query ${query.id}:`, parseError);
            // Store null result on error (pass queryDoc if available)
            await indexedDBService.saveQueryIndexResult(query.id, null, queryDoc);
            return;
          }
          
          if (jsonResponse.errors) {
            console.error(`GraphQL errors for index query ${query.id}:`, jsonResponse.errors);
            // Store null result on error (pass queryDoc if available)
            await indexedDBService.saveQueryIndexResult(query.id, null, queryDoc);
            return;
          }

          // Extract full date/timestamp from index query response using the same mechanism
          // This works for both month == true and month == false queries
          const fullDate = extractFullDateFromIndexResponse(query.index, jsonResponse);
          
          // Handle two paths for saving:
          // 1. month == false: save full date string directly
          // 2. month == true: extract YYYY-MM from monthIndex query and save as { "YYYY-MM": "full date string" }
          let resultToSave = null;
          
          if (query.month === true && query.monthIndex && query.monthIndex.trim()) {
            // Extract YYYY-MM from monthIndex query
            const yearMonth = await executeMonthIndexQueryAndExtractYearMonth(
              query.monthIndex,
              queryDoc
            );
            
            if (yearMonth && fullDate) {
              // Save as { "YYYY-MM": "full date string" }
              resultToSave = {
                [yearMonth]: fullDate
              };
              console.log(`Saved index result for ${query.id} as { "${yearMonth}": "${fullDate}" }`);
            } else {
              if (!yearMonth) {
                console.warn(`Could not extract YYYY-MM for ${query.id}`);
              }
              if (!fullDate) {
                console.warn(`Could not extract full date from index query for ${query.id}`);
              }
              // If we can't extract either, save null (fallback)
              resultToSave = null;
            }
          } else {
            // month == false: save full date string directly
            if (fullDate) {
              resultToSave = fullDate;
              console.log(`Saved index result for ${query.id} as: ${fullDate}`);
            } else {
              console.warn(`Could not extract full date from index query for ${query.id}`);
              resultToSave = null;
            }
          }

          // Store result in IndexedDB (will only save if changed, pass queryDoc)
          await indexedDBService.saveQueryIndexResult(query.id, resultToSave, queryDoc);
        } catch (error) {
          console.error(`Error executing index query for ${query.id}:`, error);
          // Store null result on error (use the query object from getAllQueries)
          try {
            await indexedDBService.saveQueryIndexResult(query.id, null, queryDoc);
          } catch (saveError) {
            console.error(`Error saving null result for ${query.id}:`, saveError);
          }
        }
      });

    // Execute all index queries (can run in parallel)
    await Promise.all(indexQueryPromises);
  };

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
            const parsedVariables = parseGraphQLVariables(rawVariables || '');
            // Remove startDate and endDate
            const { startDate, endDate, ...filteredVariables } = parsedVariables;
            // Update both state and ref immediately
            setQueryVariables(filteredVariables);
            queryVariablesRef.current = filteredVariables;
            // Notify parent that variables changed
            if (onVariablesChange) {
              onVariablesChange(filteredVariables);
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
    return getDataKeys(processedData).filter(key => {
      const value = getDataValue(processedData, key);
      return value && value.length > 0;
    });
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
      return getDataValue(processedData, selectedQueryKey) || [];
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

