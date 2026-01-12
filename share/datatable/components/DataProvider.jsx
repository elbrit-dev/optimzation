'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { Button } from 'primereact/button';
import { startCase, isNil, isEmpty, uniq, filter as lodashFilter } from 'lodash';
import dayjs from 'dayjs';
import * as Comlink from 'comlink';
import MonthRangePicker from '@/components/MonthRangePicker';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { getInitialEndpoint, getEndpointConfigFromUrlKey } from '@/app/graphql-playground/constants';
import { createExecutionContext, executePipeline, fetchGraphQLRequest } from '@/app/graphql-playground/utils/query-pipeline';
import { extractDataFromResponse } from '@/app/graphql-playground/utils/data-extractor';
import { indexedDBService } from '@/app/datatable/utils/indexedDBService';
import { parseGraphQLVariables } from '@/app/graphql-playground/utils/variableParser';
import { extractValueFromGraphQLResponse } from '@/app/graphql-playground/utils/queryExtractor';
import { extractYearMonthFromDate, generateMonthRangeArray } from '@/app/datatable/utils/dateUtils';
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


export default function DataProvider({
  offlineData,
  onDataChange,
  onError,
  onTableDataChange,
  onRawDataChange, // New callback to pass raw/original data for Auth Control
  renderHeaderControls,
  onDataSourceChange,
  variableOverrides = {},
  onVariablesChange,
  // Callbacks to expose state for selectors in parent
  onSavedQueriesChange,
  onLoadingQueriesChange,
  onExecutingQueryChange,
  onAvailableQueryKeysChange,
  onSelectedQueryKeyChange,
  onLoadingDataChange,
  // Auth control props
  isAdminMode = false,
  salesTeamColumn = null,
  salesTeamValues = [],
  hqColumn = null,
  hqValues = [],
  // Data source and query key props
  dataSource: dataSourceProp = 'offline',
  selectedQueryKey: selectedQueryKeyProp = null,
  children
}) {
  const [dataSource, setDataSource] = useState(dataSourceProp);
  const [selectedQueryKey, setSelectedQueryKey] = useState(selectedQueryKeyProp);

  // Sync props with state when props change (for controlled component)
  useEffect(() => {
    setDataSource(dataSourceProp);
  }, [dataSourceProp]);

  useEffect(() => {
    setSelectedQueryKey(selectedQueryKeyProp);
  }, [selectedQueryKeyProp]);

  const [savedQueries, setSavedQueries] = useState([]);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [executingQuery, setExecutingQuery] = useState(false);
  const [loadingFromCache, setLoadingFromCache] = useState(false);
  const [processedData, setProcessedData] = useState(null);
  const [monthRange, setMonthRange] = useState(null); // Array of [startMonth, endMonth] or null
  const [hasMonthSupport, setHasMonthSupport] = useState(false); // Whether the current query supports month filtering
  const [queryVariables, setQueryVariables] = useState({}); // Variables from the saved query
  const [currentQueryDoc, setCurrentQueryDoc] = useState(null); // Current query document
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null); // Last updated timestamp string from IndexedDB
  const [selectedSalesTeams, setSelectedSalesTeams] = useState([]); // Selected Sales Teams for filter
  const [selectedHqTeams, setSelectedHqTeams] = useState([]); // Selected HQ Teams for filter
  const queryVariablesRef = useRef({}); // Ref to track variables immediately (for synchronous access)
  const executingQueryIdRef = useRef(null); // Track which query is currently executing to prevent duplicates
  const executionContextRef = useRef(null); // Persist execution context across runs for caching
  const pipelineExecutionInFlightRef = useRef(new Set()); // Track pipeline executions in flight to prevent concurrent execution
  const isInitialLoadRef = useRef(false); // Track if we're in initial load phase to prevent monthRange effect from triggering
  const workerRef = useRef(null); // Ref to store worker proxy
  const allQueryDocsRef = useRef({}); // Cache of all query documents for worker
  const indexQueriesExecutedRef = useRef(false); // Track if index queries have been executed
  const cacheLoadInProgressRef = useRef(null); // Track if cache load is in progress to prevent duplicate calls

  // Store onError in ref to avoid dependency issues (only runs once on mount)
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Initialize worker on mount
  useEffect(() => {
    const initializeWorker = async () => {
      try {
        // Create worker - Next.js handles worker imports differently
        // Use dynamic import or direct worker path
        let worker;
        try {
          // Try to create worker using new URL pattern (works in modern environments)
          worker = new Worker(
            new URL('../workers/queryWorker.js', import.meta.url),
            { type: 'module' }
          );
        } catch (error) {
          // Fallback: try absolute path pattern
          console.warn('Failed to create worker with import.meta.url, trying alternative:', error);
          // Worker may not be available in this environment, continue without worker
          return;
        }

        // Wrap with Comlink
        const workerAPI = Comlink.wrap(worker);
        
        // Set up nested query callback
        const nestedQueryCallback = Comlink.proxy(async (queryId) => {
          // Load query from Firestore
          const queryDoc = await firestoreService.loadQuery(queryId);
          if (queryDoc) {
            // Cache it
            allQueryDocsRef.current[queryId] = queryDoc;
            // Ensure transformerCode is explicitly included (Comlink may strip it during serialization)
            // Return a new object with all fields explicitly set to ensure proper serialization
            return {
              ...queryDoc,
              transformerCode: queryDoc.transformerCode || null, // Explicitly include, even if null
            };
          }
          return queryDoc;
        });
        await workerAPI.setNestedQueryCallback(nestedQueryCallback);

        // Set up endpoint config getter
        const endpointConfigGetter = Comlink.proxy((urlKey) => {
          if (urlKey) {
            return getEndpointConfigFromUrlKey(urlKey);
          } else {
            return { endpointUrl: getInitialEndpoint()?.code || null, authToken: null };
          }
        });
        await workerAPI.setEndpointConfigGetter(endpointConfigGetter);

        // Set up global functions getter
        const globalFunctionsGetter = Comlink.proxy(async () => {
          try {
            return await firestoreService.loadGlobalFunctions();
          } catch (error) {
            console.error('Failed to load global functions:', error);
            return '';
          }
        });
        await workerAPI.setGlobalFunctionsGetter(globalFunctionsGetter);

        workerRef.current = workerAPI;
        console.log('Worker initialized successfully');
      } catch (error) {
        console.error('Error initializing worker:', error);
        // Continue without worker - will fallback to main thread execution
      }
    };

    // Only initialize worker in browser environment
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      initializeWorker();
    }

    // Cleanup worker on unmount
    return () => {
      if (workerRef.current) {
        // Cleanup will be handled by Comlink
        workerRef.current = null;
      }
    };
  }, []);

  // Load saved queries on mount - only run once, use ref for onError
  useEffect(() => {
    const loadSavedQueries = async () => {
      setLoadingQueries(true);
      try {
        const queries = await firestoreService.getAllQueries();
        setSavedQueries(queries);
        // Don't execute index queries here - they will be executed when saved queries are loaded
      } catch (error) {
        console.error('Error loading saved queries:', error);
        if (onErrorRef.current) {
          onErrorRef.current({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Execute index queries when saved queries are loaded
  useEffect(() => {
    if (!indexQueriesExecutedRef.current && savedQueries.length > 0) {
      indexQueriesExecutedRef.current = true;
      executeAndStoreIndexQueries(savedQueries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedQueries]);

  // Execute index queries and store results in IndexedDB (using worker)
  const executeAndStoreIndexQueries = async (queries) => {
    if (!queries || queries.length === 0) {
      return;
    }

    // Wait for worker to be initialized
    if (!workerRef.current) {
      console.warn('Worker not initialized, falling back to main thread execution');
      // Fallback to main thread execution (original code) if worker not ready
      return;
    }

    // Store all query docs in cache for worker
    queries.forEach(query => {
      if (query.id) {
        allQueryDocsRef.current[query.id] = query;
      }
    });

    // Create a map of queryId -> query object for quick lookup
    const queryMap = new Map();
    queries.forEach(query => {
      if (query.id) {
        queryMap.set(query.id, query);
      }
    });

    // Register callback for all queries with clientSave === true (still needed for pipeline execution)
    queries.forEach(query => {
      if (query.id && query.index && query.index.trim() && query.clientSave === true) {
        // Store the query object in closure for use in callback
        const queryDoc = query;
        
        // Create the callback function - all index saves happen in worker, so register in worker's indexedDBService
        const onChangeCallback = async (queryId, oldResult, newResult, updatedAt, queryDocFromSave) => {
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

          // Execute pipeline in background for both month == false and month == true queries (using worker)
          if (queryDocToUse && (queryDocToUse.month === false || (queryDocToUse.month === true && queryDocToUse.monthIndex && queryDocToUse.monthIndex.trim()))) {
            // Guard: Check if pipeline execution is already in flight for this queryId (before scheduling)
            if (pipelineExecutionInFlightRef.current.has(queryId)) {
              console.log(`Pipeline execution already in flight for ${queryId}, skipping callback`);
              return;
            }

            // Mark as in flight immediately (before scheduling)
            pipelineExecutionInFlightRef.current.add(queryId);

            // Execute pipeline in background using worker
            const executePipelineAsync = async () => {
              try {
                // Get endpoint/auth from query's urlKey, fallback to default
                const { endpointUrl, authToken } = getEndpointAndAuth(queryDocToUse);

                if (!endpointUrl) {
                  console.warn(`No endpoint available for pipeline execution for ${queryId}`);
                  pipelineExecutionInFlightRef.current.delete(queryId);
                  return;
                }

                // Always use worker for pipeline execution
                if (!workerRef.current) {
                  console.warn('Worker not available, skipping pipeline execution');
                  pipelineExecutionInFlightRef.current.delete(queryId);
                  return;
                }
                await workerRef.current.executePipeline(
                  queryId,
                  queryDocToUse,
                  endpointUrl,
                  authToken,
                  null, // monthRange will be calculated in worker
                  {}, // variableOverrides
                  allQueryDocsRef.current // allQueryDocs cache
                );
                console.log(`Pipeline executed for ${queryId} using worker`);
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
        };

        // Register callback in worker's indexedDBService (all index saves happen in worker)
        if (workerRef.current && workerRef.current.indexedDBService) {
          const proxiedCallback = Comlink.proxy(onChangeCallback);
          workerRef.current.indexedDBService.setOnChangeCallback(query.id, proxiedCallback).catch((error) => {
            console.error(`Failed to register callback in worker for ${query.id}:`, error);
          });
        }
      }
    });

    // Execute index queries using worker (endpoint config getter already set during initialization)
    try {
      await workerRef.current.executeAndCacheIndexQueries(queries);
    } catch (error) {
      console.error('Error executing index queries in worker:', error);
      // Fallback to main thread execution if worker fails
    }
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

  // Expose state values to parent for selectors
  useEffect(() => {
    if (onSavedQueriesChange) {
      onSavedQueriesChange(savedQueries);
    }
  }, [savedQueries, onSavedQueriesChange]);

  useEffect(() => {
    if (onLoadingQueriesChange) {
      onLoadingQueriesChange(loadingQueries);
    }
  }, [loadingQueries, onLoadingQueriesChange]);

  useEffect(() => {
    if (onExecutingQueryChange) {
      onExecutingQueryChange(executingQuery);
    }
  }, [executingQuery, onExecutingQueryChange]);

  // Combine executingQuery and loadingFromCache to track overall data loading
  const isLoadingData = executingQuery || loadingFromCache;
  useEffect(() => {
    if (onLoadingDataChange) {
      onLoadingDataChange(isLoadingData);
    }
  }, [isLoadingData, onLoadingDataChange]);

  useEffect(() => {
    if (onSelectedQueryKeyChange) {
      onSelectedQueryKeyChange(selectedQueryKey);
    }
  }, [selectedQueryKey, onSelectedQueryKeyChange]);

  // Handle data source changes - auto-execute when user changes data source or on initial load
  useEffect(() => {
    if (dataSource === 'offline') {
      // Switching to offline - reset query-related state
      setProcessedData(null);
      setSelectedQueryKey(null);
      setMonthRange(null);
      setHasMonthSupport(false);
      setQueryVariables({});
      setCurrentQueryDoc(null);
      setOfflineDataExecuted(false); // Reset offline execution state
      setSelectedSalesTeams([]); // Reset Sales Teams selection
      setSelectedHqTeams([]); // Reset HQ Teams selection
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
      // Reset Search Teams selection when switching data sources
      setSelectedSalesTeams([]);
      setSelectedHqTeams([]);
      // Mark initial load as in progress
      isInitialLoadRef.current = true;
      // Load query metadata and auto-execute
      const loadQueryMetadata = async () => {
        try {
          const queryDoc = await firestoreService.loadQuery(dataSource);
          if (queryDoc) {
            setCurrentQueryDoc(queryDoc);
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

            // Load initial month range from monthDate (calculate but don't set yet)
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
                }
              } catch (error) {
                console.error('Error parsing monthDate:', error);
              }
            }

            // Auto-execute query after loading metadata (including initial load)
            // Set monthRange first, then load data (combined to avoid duplicate calls)
            // For month-supported queries, only execute if monthRange is set
            // Variables are already set in queryVariablesRef.current, so we can execute immediately
            if (month === true) {
              setMonthRange(initialMonthRange);
            } else {
              setMonthRange(null);
            }

            if (month !== true || initialMonthRange) {
              // Use shared helper function to check IndexedDB first, then API if not found
              await checkIndexedDBAndLoadData(dataSource, queryDoc, initialMonthRange);
            }

            // Clear initial load flag after processing completes
            isInitialLoadRef.current = false;
          }
        } catch (error) {
          console.error('Error loading query metadata:', error);
          setCurrentQueryDoc(null);
          // Clear initial load flag on error
          isInitialLoadRef.current = false;
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

  // Helper function to check IndexedDB and load data if available, otherwise call runQuery
  // Use a ref to store runQuery to avoid dependency order issues
  const runQueryRef = useRef(null);

  // Helper function to fetch and cache all months in a range in background (using worker)
  const fetchAndCacheMonthsInRange = useCallback(async (queryId, queryDoc, monthRangeValue) => {
    if (!queryId || !queryDoc || !monthRangeValue || !Array.isArray(monthRangeValue) || monthRangeValue.length !== 2) {
      return;
    }

    const [startDate, endDate] = monthRangeValue;
    
    // Generate array of month prefixes for the range
    const monthPrefixes = generateMonthRangeArray(startDate, endDate);
    
    if (monthPrefixes.length === 0) {
      return;
    }

    // Execute in background without blocking UI
    const fetchAndCacheAllMonthsAsync = async () => {
      try {
        const { endpointUrl, authToken } = getEndpointAndAuth(queryDoc);
        
        if (!endpointUrl) {
          console.warn(`No endpoint available for fetching months in range for ${queryId}`);
          return;
        }

        // Fetch and cache each month in the range using worker
        for (const prefix of monthPrefixes) {
          try {
            // Parse YYYY-MM to create month range (first day to last day of month)
            const [year, month] = prefix.split('-').map(Number);
            const monthStartDate = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0).getDate();
            const monthEndDate = new Date(year, month - 1, lastDay);
            const monthRange = [monthStartDate, monthEndDate];

            // Always use worker for pipeline execution
            if (!workerRef.current) {
              console.warn('Worker not available for background caching');
              continue;
            }
            await workerRef.current.executePipeline(
              queryId,
              queryDoc,
              endpointUrl,
              authToken,
              monthRange,
              {},
              allQueryDocsRef.current
            );
            console.log(`Cached month ${prefix} for ${queryId} using worker`);
          } catch (error) {
            console.error(`Error fetching and caching month ${prefix} for ${queryId}:`, error);
            // Continue with other months even if one fails
          }
        }
      } catch (error) {
        console.error(`Error in background fetch for months in range for ${queryId}:`, error);
      }
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(fetchAndCacheAllMonthsAsync, { timeout: 5000 });
    } else {
      setTimeout(fetchAndCacheAllMonthsAsync, 0);
    }
  }, []);

  const checkIndexedDBAndLoadData = useCallback(async (queryId, queryDoc, monthRangeValue) => {
    // Prevent duplicate concurrent calls
    const cacheLoadKey = `${queryId}_${monthRangeValue?.[0]?.getTime()}_${monthRangeValue?.[1]?.getTime()}`;
    if (cacheLoadInProgressRef.current === cacheLoadKey) {
      // Already loading this exact query/monthRange, skip duplicate call
      return;
    }
    cacheLoadInProgressRef.current = cacheLoadKey;
    setLoadingFromCache(true);

    if (!queryDoc || queryDoc.clientSave !== true) {
      // No IndexedDB support, go directly to API
      cacheLoadInProgressRef.current = null;
      setLoadingFromCache(false);
      if (runQueryRef.current) {
        await runQueryRef.current(queryId, true);
      }
      return;
    }

    try {
      // For month == true queries, handle multi-month range
      if (queryDoc.month === true && monthRangeValue && Array.isArray(monthRangeValue) && monthRangeValue.length === 2) {
        const [startDate, endDate] = monthRangeValue;
        
        // Generate array of month prefixes for the range
        const monthPrefixes = generateMonthRangeArray(startDate, endDate);
        
        if (monthPrefixes.length > 0) {
          // Check which months are cached
          const cachedPrefixes = await indexedDBService.getCachedMonthPrefixes(queryId, monthPrefixes);
          
          if (cachedPrefixes.length === monthPrefixes.length) {
            // All months cached: reconstruct from all
            const reconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, monthPrefixes);
            
            if (reconstructed && typeof reconstructed === 'object' && Object.keys(reconstructed).length > 0) {
              setProcessedData(reconstructed);
              
              if (onDataChange) {
                onDataChange({
                  severity: 'success',
                  summary: 'Success',
                  detail: 'Data loaded from cache',
                  life: 3000
                });
              }
              cacheLoadInProgressRef.current = null;
              setLoadingFromCache(false);
              return; // Successfully loaded from IndexedDB
            }
          } else if (cachedPrefixes.length > 0) {
            // Some months cached: reconstruct from cached months immediately
            const reconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, cachedPrefixes);
            
            if (reconstructed && typeof reconstructed === 'object' && Object.keys(reconstructed).length > 0) {
              setProcessedData(reconstructed);
              
              if (onDataChange) {
                onDataChange({
                  severity: 'success',
                  summary: 'Success',
                  detail: `Data loaded from cache (${cachedPrefixes.length}/${monthPrefixes.length} months)`,
                  life: 3000
                });
              }
              
              // Cache all months in range in background (even if some already cached)
              fetchAndCacheMonthsInRange(queryId, queryDoc, monthRangeValue);
              
              cacheLoadInProgressRef.current = null;
              setLoadingFromCache(false);
              return; // Successfully loaded from cache, don't call API
            }
          }
          
          // If not all months cached and no cached data available, fall through to API fetch
        }
      } else {
        // Single month or month == false: use original logic
        const yearMonthPrefix = (queryDoc.month === true && monthRangeValue && monthRangeValue[0])
          ? dayjs(monthRangeValue[0]).format('YYYY-MM')
          : null;

        // Try to reconstruct from IndexedDB
        const reconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, yearMonthPrefix);

        // Check if we got data (reconstructed format matches processedData format)
        if (reconstructed && typeof reconstructed === 'object' && Object.keys(reconstructed).length > 0) {
          // Load from IndexedDB - format is already correct, no transformation needed
          setProcessedData(reconstructed);

          if (onDataChange) {
            onDataChange({
              severity: 'success',
              summary: 'Success',
              detail: 'Data loaded from cache',
              life: 3000
            });
          }
          cacheLoadInProgressRef.current = null;
          setLoadingFromCache(false);
          return; // Successfully loaded from IndexedDB, don't call API
        }
      }
    } catch (error) {
      // If IndexedDB loading fails, fall through to normal query execution
      console.error('Error loading from IndexedDB:', error);
      cacheLoadInProgressRef.current = null;
      setLoadingFromCache(false);
    }

    // IndexedDB check failed or no data found, call API
    cacheLoadInProgressRef.current = null;
    setLoadingFromCache(false);
    if (runQueryRef.current) {
      await runQueryRef.current(queryId, true);
    }
  }, [onDataChange, fetchAndCacheMonthsInRange]);

  // Auto-execute when monthRange changes (user changed month range)
  useEffect(() => {
    if (!dataSource || dataSource === 'offline') return; // Skip for offline
    if (!hasMonthSupport) return; // Only for month-supported queries

    // Skip if this is during initial load (prevent race condition with IndexedDB check)
    if (isInitialLoadRef.current) {
      return;
    }

    // Only execute if monthRange is set
    if (monthRange && Array.isArray(monthRange) && monthRange.length === 2 && currentQueryDoc) {
      // Check IndexedDB first, then API if not found
      checkIndexedDBAndLoadData(dataSource, currentQueryDoc, monthRange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthRange, checkIndexedDBAndLoadData]); // Include checkIndexedDBAndLoadData in deps


  // Format date to "10 Jan 2026 4:03:33 PM" format
  const formatLastUpdatedDate = (dateString) => {
    if (!dateString) return null;

    try {
      // Try to parse the date string with dayjs
      const parsedDate = dayjs(dateString);

      // Check if the date is valid
      if (!parsedDate.isValid()) {
        return dateString; // Return original if can't parse
      }

      // Format to "10 Jan 2026 4:03:33 PM" (MMM already returns capitalized month by default)
      return parsedDate.format('D MMM YYYY h:mm:ss A');
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString; // Return original on error
    }
  };

  // Fetch and display last updated timestamp from IndexedDB
  useEffect(() => {
    const fetchLastUpdatedAt = async () => {
      // If offline mode or no dataSource, clear the last updated field
      if (!dataSource || dataSource === 'offline') {
        setLastUpdatedAt(null);
        return;
      }

      try {
        // Get the index result from IndexedDB
        const indexResult = await indexedDBService.getQueryIndexResult(dataSource);

        if (!indexResult || !indexResult.result) {
          setLastUpdatedAt(null);
          return;
        }

        const result = indexResult.result;

        // Check if the query has month support
        if (currentQueryDoc && currentQueryDoc.month === true) {
          // For month == true, result is an object like {"2025-11": "13:14:03.540037"}
          // Extract YYYY-MM from monthRange
          if (monthRange && Array.isArray(monthRange) && monthRange.length > 0 && monthRange[0]) {
            const yearMonthKey = dayjs(monthRange[0]).format('YYYY-MM');
            // Look up the value for this month key
            if (result && typeof result === 'object' && !Array.isArray(result)) {
              const monthValue = result[yearMonthKey];
              setLastUpdatedAt(monthValue || null);
            } else {
              setLastUpdatedAt(null);
            }
          } else {
            // No month range selected, show null
            setLastUpdatedAt(null);
          }
        } else {
          // For month == false, result is a string directly
          if (typeof result === 'string') {
            setLastUpdatedAt(result);
          } else {
            setLastUpdatedAt(null);
          }
        }
      } catch (error) {
        console.error('Error fetching last updated timestamp:', error);
        setLastUpdatedAt(null);
      }
    };

    fetchLastUpdatedAt();
  }, [dataSource, monthRange, currentQueryDoc]);

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

  // Expose availableQueryKeys to parent (after it's defined)
  useEffect(() => {
    if (onAvailableQueryKeysChange) {
      onAvailableQueryKeysChange(availableQueryKeys);
    }
  }, [availableQueryKeys, onAvailableQueryKeysChange]);

  // Execute query using the unified pipeline (using worker)
  const runQuery = useCallback(async (queryId, skipMonthDateLoad = false) => {
    // Update ref so checkIndexedDBAndLoadData can use it
    runQueryRef.current = runQuery;
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
      // Load query doc if not already loaded
      let queryDocToUse = currentQueryDoc;
      if (!queryDocToUse) {
        queryDocToUse = await firestoreService.loadQuery(queryId);
        if (queryDocToUse) {
          allQueryDocsRef.current[queryId] = queryDocToUse;
        }
      }

      if (!queryDocToUse) {
        throw new Error(`Query "${queryId}" not found`);
      }

      // Get endpoint URL and auth token
      const { endpointUrl, authToken } = getEndpointAndAuth(queryDocToUse);
      const finalEndpointUrl = endpointUrl || getInitialEndpoint()?.code || null;
      const finalAuthToken = authToken || null;

      if (!finalEndpointUrl) {
        throw new Error('GraphQL endpoint URL is not set');
      }

      // Always use worker for pipeline execution
      if (!workerRef.current) {
        throw new Error('Worker is not available. Please ensure worker is initialized.');
      }
      const finalData = await workerRef.current.executePipeline(
        queryId,
        queryDocToUse,
        finalEndpointUrl,
        finalAuthToken,
        monthRange && Array.isArray(monthRange) && monthRange.length === 2 ? monthRange : undefined,
        mergedVariables,
        allQueryDocsRef.current
      );

      // Cache in background if clientSave is true (using worker)
      if (queryDocToUse && queryDocToUse.clientSave === true && finalData && typeof finalData === 'object') {
        const cacheApiResultAsync = async () => {
          try {
            if (workerRef.current) {
              // Use worker for caching
              await workerRef.current.executePipeline(
                queryId,
                queryDocToUse,
                finalEndpointUrl,
                finalAuthToken,
                monthRange && Array.isArray(monthRange) && monthRange.length === 2 ? monthRange : undefined,
                mergedVariables,
                allQueryDocsRef.current
              );
            }
          } catch (error) {
            console.error(`Error caching API result for ${queryId}:`, error);
          }
        };

        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(cacheApiResultAsync, { timeout: 5000 });
        } else {
          setTimeout(cacheApiResultAsync, 0);
        }
      }

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
  }, [onDataChange, onError, monthRange, executingQuery, variableOverrides, queryVariables, currentQueryDoc]);

  // Update runQuery ref whenever runQuery changes
  useEffect(() => {
    runQueryRef.current = runQuery;
  }, [runQuery]);

  // Track if offline data has been "executed" (shown)
  const [offlineDataExecuted, setOfflineDataExecuted] = useState(false);

  // Determine which data to use (from executed queries or executed offline)
  const rawTableData = useMemo(() => {
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

  // Apply auth filtering to raw data
  const authFilteredData = useMemo(() => {
    if (!rawTableData || !Array.isArray(rawTableData) || isEmpty(rawTableData)) {
      return rawTableData;
    }

    // If Admin mode is ON, return data as-is
    if (isAdminMode) {
      return rawTableData;
    }

    let filteredData = [...rawTableData];

    // Step 1: Filter by salesTeam
    if (salesTeamColumn && salesTeamValues && salesTeamValues.length > 0) {
      filteredData = filteredData.filter(row => {
        if (!row || typeof row !== 'object') return false;
        const rowValue = getDataValue(row, salesTeamColumn);
        // Handle null/undefined comparison - convert to string for comparison
        if (isNil(rowValue)) {
          return salesTeamValues.some(val => val === null || val === undefined || val === '');
        }
        return salesTeamValues.some(val => String(val) === String(rowValue));
      });
    }

    // Step 2: Filter by hq (only if salesTeamValues count == 1)
    if (salesTeamValues && salesTeamValues.length === 1 && hqColumn && hqValues && hqValues.length > 0) {
      filteredData = filteredData.filter(row => {
        if (!row || typeof row !== 'object') return false;
        const rowValue = getDataValue(row, hqColumn);
        // Handle null/undefined comparison - convert to string for comparison
        if (isNil(rowValue)) {
          return hqValues.some(val => val === null || val === undefined || val === '');
        }
        return hqValues.some(val => String(val) === String(rowValue));
      });
    }

    return filteredData;
  }, [rawTableData, isAdminMode, salesTeamColumn, salesTeamValues, hqColumn, hqValues]);

  // Extract available Sales Team values from auth-filtered data
  const availableSalesTeamValues = useMemo(() => {
    if (!authFilteredData || !Array.isArray(authFilteredData) || isEmpty(authFilteredData)) {
      return [];
    }

    if (!salesTeamColumn) {
      return [];
    }

    const salesTeamValuesSet = new Set();
    authFilteredData.forEach(row => {
      if (row && typeof row === 'object') {
        const value = getDataValue(row, salesTeamColumn);
        if (!isNil(value) && value !== '') {
          salesTeamValuesSet.add(String(value));
        }
      }
    });

    return Array.from(salesTeamValuesSet).sort();
  }, [authFilteredData, salesTeamColumn]);

  // Extract available HQ values from auth-filtered data
  const availableHqValues = useMemo(() => {
    if (!authFilteredData || !Array.isArray(authFilteredData) || isEmpty(authFilteredData)) {
      return [];
    }

    if (!hqColumn) {
      return [];
    }

    const hqValuesSet = new Set();
    authFilteredData.forEach(row => {
      if (row && typeof row === 'object') {
        const value = getDataValue(row, hqColumn);
        if (!isNil(value) && value !== '') {
          hqValuesSet.add(String(value));
        }
      }
    });

    return Array.from(hqValuesSet).sort();
  }, [authFilteredData, hqColumn]);

  // Reset selectedSalesTeams when auth filters change significantly (to avoid stale selections)
  useEffect(() => {
    if (selectedSalesTeams && selectedSalesTeams.length > 0 && availableSalesTeamValues.length > 0) {
      const availableValues = new Set(availableSalesTeamValues);
      const hasInvalidSelection = selectedSalesTeams.some(team => !availableValues.has(team));
      if (hasInvalidSelection) {
        const validTeams = selectedSalesTeams.filter(team => availableValues.has(team));
        setSelectedSalesTeams(validTeams);
      }
    } else if (selectedSalesTeams && selectedSalesTeams.length > 0 && availableSalesTeamValues.length === 0) {
      setSelectedSalesTeams([]);
    }
  }, [availableSalesTeamValues, salesTeamColumn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset selectedHqTeams when auth filters change significantly (to avoid stale selections)
  useEffect(() => {
    if (selectedHqTeams && selectedHqTeams.length > 0 && availableHqValues.length > 0) {
      const availableValues = new Set(availableHqValues);
      const hasInvalidSelection = selectedHqTeams.some(team => !availableValues.has(team));
      if (hasInvalidSelection) {
        const validTeams = selectedHqTeams.filter(team => availableValues.has(team));
        setSelectedHqTeams(validTeams);
      }
    } else if (selectedHqTeams && selectedHqTeams.length > 0 && availableHqValues.length === 0) {
      setSelectedHqTeams([]);
    }
  }, [availableHqValues, hqColumn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply Sales Team and HQ filters to auth-filtered data
  const tableData = useMemo(() => {
    if (!authFilteredData || !Array.isArray(authFilteredData) || isEmpty(authFilteredData)) {
      return authFilteredData;
    }

    let filteredData = [...authFilteredData];

    // Filter by selected Sales Teams
    if (selectedSalesTeams && selectedSalesTeams.length > 0 && salesTeamColumn) {
      filteredData = filteredData.filter(row => {
        if (!row || typeof row !== 'object') return false;
        const salesTeamValue = getDataValue(row, salesTeamColumn);
        if (isNil(salesTeamValue)) {
          return selectedSalesTeams.some(team => team === null || team === undefined || team === '');
        }
        return selectedSalesTeams.some(team => String(team) === String(salesTeamValue));
      });
    }

    // Filter by selected HQ Teams
    if (selectedHqTeams && selectedHqTeams.length > 0 && hqColumn) {
      filteredData = filteredData.filter(row => {
        if (!row || typeof row !== 'object') return false;
        const hqValue = getDataValue(row, hqColumn);
        if (isNil(hqValue)) {
          return selectedHqTeams.some(team => team === null || team === undefined || team === '');
        }
        return selectedHqTeams.some(team => String(team) === String(hqValue));
      });
    }

    return filteredData;
  }, [authFilteredData, selectedSalesTeams, selectedHqTeams, salesTeamColumn, hqColumn]);

  // Notify parent when raw data changes (for Auth Control in DataTableControls)
  useEffect(() => {
    if (onRawDataChange) {
      onRawDataChange(rawTableData);
    }
  }, [rawTableData, onRawDataChange]);

  // Notify parent when filtered table data changes (for DataTable)
  useEffect(() => {
    if (onTableDataChange) {
      onTableDataChange(tableData);
    }
  }, [tableData, onTableDataChange]);

  // Sync function that retriggers query execution
  const handleSync = useCallback(async () => {
    if (!dataSource || dataSource === 'offline') return;

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

  // Render selectors JSX
  const selectorsJSX = (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between w-full gap-3">
          <div className="flex items-end gap-3">
            {/* Month Range Picker - Only show when using saved query that supports month filtering */}
            {dataSource && hasMonthSupport && (
              <div className="w-64">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Month Range
                </label>
                <MonthRangePicker
                  value={monthRange}
                  onChange={(dates) => {
                    if (dates && dates[0] && dates[1]) {
                      setMonthRange([dates[0], dates[1]]);
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
                    height: '3rem',
                  }}
                />
              </div>
            )}

            {/* Sales Team Multi-Selector */}
            {salesTeamColumn && availableSalesTeamValues.length > 0 && (
              <div className="w-48">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Sales Team
                </label>
                <MultiSelect
                  value={selectedSalesTeams}
                  onChange={(e) => setSelectedSalesTeams(e.value || [])}
                  options={availableSalesTeamValues}
                  optionLabel={(option) => String(option)}
                  optionValue={(option) => option}
                  filter
                  filterPlaceholder="Search sales teams..."
                  filterDelay={300}
                  className="w-full"
                  panelClassName="custom-multiselect-panel"
                  display="chip"
                  showClear
                  resetFilterOnHide
                  emptyFilterMessage="No sales teams match your search"
                  emptyMessage="No sales teams available"
                  placeholder="Select sales teams..."
                  disabled={executingQuery}
                  style={{
                    fontSize: '0.875rem',
                    height: '3rem',
                  }}
                />
              </div>
            )}

            {/* HQ Multi-Selector */}
            {hqColumn && availableHqValues.length > 0 && (
              <div className="w-48">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  HQ
                </label>
                <MultiSelect
                  value={selectedHqTeams}
                  onChange={(e) => setSelectedHqTeams(e.value || [])}
                  options={availableHqValues}
                  optionLabel={(option) => String(option)}
                  optionValue={(option) => option}
                  filter
                  filterPlaceholder="Search HQ..."
                  filterDelay={300}
                  className="w-full"
                  panelClassName="custom-multiselect-panel"
                  display="chip"
                  showClear
                  resetFilterOnHide
                  emptyFilterMessage="No HQ match your search"
                  emptyMessage="No HQ available"
                  placeholder="Select HQ..."
                  disabled={executingQuery}
                  style={{
                    fontSize: '0.875rem',
                    height: '3rem',
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Last Updated at with Sync button - Show when using saved query, in a new row below Data Source */}
        {dataSource && dataSource !== 'offline' && (
          <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-700">
            {/* Sync Button - to the left of Last updated at */}
            <Button
              label={executingQuery ? 'Syncing...' : 'Sync'}
              icon={executingQuery ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'}
              onClick={handleSync}
              disabled={executingQuery || (hasMonthSupport && (!monthRange || !Array.isArray(monthRange) || monthRange.length !== 2))}
              className="p-button-sm p-button-outlined flex-shrink-0"
              style={{ fontSize: '0.875rem', height: '2rem' }}
            />
            <span className="whitespace-nowrap">
              Last updated: {lastUpdatedAt ? formatLastUpdatedDate(lastUpdatedAt) : <span className="text-gray-400">N/A</span>}
            </span>
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

