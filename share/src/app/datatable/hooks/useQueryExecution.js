'use client';

import * as Comlink from 'comlink';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDataKeys, getDataValue } from '../utils/dataAccessUtils';
import { getEndpointAndAuth } from '../utils/queryEndpointUtils';
import { generateMonthRangeArray } from '../utils/dateUtils';
import { indexedDBService } from '../utils/indexedDBService';
import { fetchGraphQLSchema } from '@/app/graphql-playground-v2/utils/schema-fetcher';
import { getEndpointConfigFromUrlKey, getInitialEndpoint } from '@/app/graphql-playground/constants';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { queryRegistry } from '@/app/graphql-playground/services/queryRegistry';
import { createExecutionContext } from '@/app/graphql-playground/utils/query-pipeline';
import { parseGraphQLVariables } from '@/app/graphql-playground/utils/variableParser';
import { serializeGraphQLField } from '../utils/graphqlSchemaSerialization';

/**
 * Hook: query execution state and runQuery pipeline.
 * Owns: dataSource, selectedQueryKey, savedQueries, executingQuery, processedData, monthRange, hasMonthSupport,
 * queryVariables, currentQueryDoc, lastUpdatedAt, loadingFromCache, offlineDataExecuted; runQuery and helpers.
 * @param {Object} options
 * @param {string|null} options.dataSourceProp - Controlled dataSource (query id or null for offline)
 * @param {string|null} options.selectedQueryKeyProp - Controlled selectedQueryKey
 * @param {Array} options.offlineData - Offline data when dataSource is null
 * @param {Function} [options.onError] - Error toast callback
 * @param {Function} [options.onDataChange] - Success toast callback
 * @param {Function} [options.onVariablesChange] - Variables changed callback
 * @param {Function} [options.onExecutingQueryChange] - Executing state callback
 * @param {Function} [options.onAvailableQueryKeysChange] - Available query keys callback
 * @param {Function} [options.onSelectedQueryKeyChange] - Selected key callback
 * @param {Function} [options.onLoadingDataChange] - Loading state callback
 * @param {Object} [options.variableOverrides] - User variable overrides
 * @param {string} [options.searchTerm] - Search term for clientSave=false queries
 * @param {Object|null} [options.sortConfig] - Sort config for clientSave=false queries
 */
export function useQueryExecution(options) {
  const {
    dataSourceProp = null,
    selectedQueryKeyProp = null,
    offlineData = [],
    onError,
    onDataChange,
    onVariablesChange,
    onExecutingQueryChange,
    onAvailableQueryKeysChange,
    onSelectedQueryKeyChange,
    onLoadingDataChange,
    variableOverrides = {},
    searchTerm = '',
    sortConfig = null,
  } = options;

  const [dataSource, setDataSource] = useState(dataSourceProp);
  const [selectedQueryKey, setSelectedQueryKey] = useState(selectedQueryKeyProp);
  const [savedQueries, setSavedQueries] = useState([]);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [executingQuery, setExecutingQuery] = useState(false);
  const [loadingFromCache, setLoadingFromCache] = useState(false);
  const [processedData, setProcessedData] = useState(null);
  const [monthRange, setMonthRange] = useState(null);
  const [hasMonthSupport, setHasMonthSupport] = useState(false);
  const [queryVariables, setQueryVariables] = useState({});
  const [currentQueryDoc, setCurrentQueryDoc] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [offlineDataExecuted, setOfflineDataExecuted] = useState(false);

  const queryVariablesRef = useRef({});
  const executingQueryIdRef = useRef(null);
  const executingQueriesRef = useRef(new Set());
  const executionContextRef = useRef(null);
  const pipelineExecutionInFlightRef = useRef(new Map());
  const isInitialLoadRef = useRef(false);
  const workerRef = useRef(null);
  const allQueryDocsRef = useRef({});
  const indexQueriesExecutedRef = useRef(false);
  const cacheLoadInProgressRef = useRef(null);
  const previousDataSourceRef = useRef(dataSource);
  const queryKeySetForDataSourceRef = useRef(null);
  const lastSetQueryKeyRef = useRef(null);
  const loggedWriteSchemaRef = useRef(new Set());
  const onErrorRef = useRef(onError);
  const runQueryRef = useRef(null);

  useEffect(() => {
    setDataSource(dataSourceProp);
  }, [dataSourceProp, offlineData]);

  useEffect(() => {
    setSelectedQueryKey(selectedQueryKeyProp);
  }, [selectedQueryKeyProp]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;
    const initializeWorker = async () => {
      try {
        let worker;
        try {
          worker = new Worker(new URL('../workers/queryWorker.js', import.meta.url), { type: 'module' });
        } catch (err) {
          return;
        }
        const workerAPI = Comlink.wrap(worker);
        const nestedQueryCallback = Comlink.proxy(async (queryId) => {
          const queryDoc = await queryRegistry.loadQuery(queryId);
          if (queryDoc) {
            allQueryDocsRef.current[queryId] = queryDoc;
            return { ...queryDoc, transformerCode: queryDoc.transformerCode || null };
          }
          return queryDoc;
        });
        await workerAPI.setNestedQueryCallback(nestedQueryCallback);
        const endpointConfigGetter = Comlink.proxy((urlKey) => {
          if (urlKey) return getEndpointConfigFromUrlKey(urlKey);
          const defaultEndpoint = getInitialEndpoint();
          if (!defaultEndpoint) return { endpointUrl: null, authToken: null };
          const config = getEndpointConfigFromUrlKey(defaultEndpoint.name);
          return { endpointUrl: config.endpointUrl || defaultEndpoint.code, authToken: config.authToken || null };
        });
        await workerAPI.setEndpointConfigGetter(endpointConfigGetter);
        const globalFunctionsGetter = Comlink.proxy(async () => {
          try {
            return await firestoreService.loadGlobalFunctions();
          } catch (err) {
            return '';
          }
        });
        await workerAPI.setGlobalFunctionsGetter(globalFunctionsGetter);
        workerRef.current = workerAPI;
      } catch (err) {
        console.error('Error initializing query worker:', err);
      }
    };
    initializeWorker();
    return () => { workerRef.current = null; };
  }, []);

  useEffect(() => {
    const loadSavedQueries = async () => {
      setLoadingQueries(true);
      try {
        const queries = await queryRegistry.getAllQueries();
        setSavedQueries(queries);
      } catch (err) {
        if (onErrorRef.current) {
          onErrorRef.current({ severity: 'error', summary: 'Error', detail: 'Failed to load saved queries', life: 3000 });
        }
      } finally {
        setLoadingQueries(false);
      }
    };
    loadSavedQueries();
  }, []);

  const createExecutionKey = useCallback((queryId, variables, monthRangeValue) => {
    const variablesStr = variables && typeof variables === 'object'
      ? JSON.stringify(variables, Object.keys(variables).sort())
      : '';
    const monthRangeStr = monthRangeValue && Array.isArray(monthRangeValue) && monthRangeValue.length === 2
      ? `${monthRangeValue[0].getTime()}_${monthRangeValue[1].getTime()}`
      : '';
    return `${queryId}__${variablesStr}__${monthRangeStr}`;
  }, []);

  const fetchLastUpdatedAt = useCallback(async (queryDocOverride = null, monthRangeOverride = null) => {
    const queryDocToUse = queryDocOverride || currentQueryDoc;
    const monthRangeToUse = monthRangeOverride !== null ? monthRangeOverride : monthRange;
    if (!dataSource) {
      setLastUpdatedAt(null);
      return;
    }
    try {
      const indexResult = await indexedDBService.getQueryIndexResult(dataSource);
      if (!indexResult?.result) {
        setLastUpdatedAt(null);
        return;
      }
      const result = indexResult.result;
      if (queryDocToUse?.month === true) {
        if (monthRangeToUse && Array.isArray(monthRangeToUse) && monthRangeToUse.length > 0 && monthRangeToUse[0]) {
          const yearMonthKey = dayjs(monthRangeToUse[0]).format('YYYY-MM');
          const monthValue = result && typeof result === 'object' && !Array.isArray(result) ? result[yearMonthKey] : null;
          setLastUpdatedAt(monthValue || null);
        } else {
          setLastUpdatedAt(null);
        }
      } else {
        setLastUpdatedAt(typeof result === 'string' ? result : null);
      }
    } catch (err) {
      setLastUpdatedAt(null);
    }
  }, [dataSource, monthRange, currentQueryDoc]);

  const fetchAndCacheMonthsInRange = useCallback(async (queryId, queryDoc, monthRangeValue, onComplete) => {
    if (!queryId || !queryDoc || !monthRangeValue || !Array.isArray(monthRangeValue) || monthRangeValue.length !== 2) return;
    const [startDate, endDate] = monthRangeValue;
    const monthPrefixes = generateMonthRangeArray(startDate, endDate);
    if (monthPrefixes.length === 0) return;
    const doFetch = async () => {
      try {
        const { endpointUrl, authToken } = getEndpointAndAuth(queryDoc);
        if (!endpointUrl) return;
        for (const prefix of monthPrefixes) {
          try {
            const [year, month] = prefix.split('-').map(Number);
            const monthStartDate = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0).getDate();
            const monthEndDate = new Date(year, month - 1, lastDay);
            const monthRangeSerialized = [
              { year: monthStartDate.getFullYear(), month: monthStartDate.getMonth(), day: monthStartDate.getDate() },
              { year: monthEndDate.getFullYear(), month: monthEndDate.getMonth(), day: monthEndDate.getDate() },
            ];
            if (!workerRef.current) continue;
            await workerRef.current.executePipeline(queryId, queryDoc, endpointUrl, authToken, monthRangeSerialized, {}, allQueryDocsRef.current);
          } catch (e) {
            console.error(`Error fetching month ${prefix}:`, e);
          }
        }
        if (typeof onComplete === 'function') {
          try {
            await onComplete();
          } catch (e) {
            console.error('Error in fetchAndCacheMonthsInRange onComplete:', e);
          }
        }
      } catch (e) {
        console.error('Error in background fetch months:', e);
      }
    };
    if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(doFetch, { timeout: 5000 });
    else setTimeout(doFetch, 0);
  }, []);

  const executeAndCacheMonthRange = useCallback(async (queryId, queryDoc, monthRangeValue, endpointUrl, authToken, mergedVariables) => {
    if (!queryId || !queryDoc || !monthRangeValue || !Array.isArray(monthRangeValue) || monthRangeValue.length !== 2) {
      throw new Error('Invalid parameters for executeAndCacheMonthRange');
    }
    const [startDate, endDate] = monthRangeValue;
    const monthPrefixes = generateMonthRangeArray(startDate, endDate);
    if (monthPrefixes.length === 0) throw new Error('No months in range');
    const reversedMonthPrefixes = [...monthPrefixes].reverse();
    if (queryDoc.index?.trim() && queryDoc.clientSave === true && workerRef.current) {
      try {
        const monthRangeSerialized = [
          { year: startDate.getFullYear(), month: startDate.getMonth(), day: startDate.getDate() },
          { year: endDate.getFullYear(), month: endDate.getMonth(), day: endDate.getDate() },
        ];
        await workerRef.current.executeIndexQueryForMonthRange(queryId, queryDoc, endpointUrl, authToken, monthRangeSerialized);
      } catch (e) {
        console.error('Error executing index for month range:', e);
      }
    }
    const pipelinePromises = reversedMonthPrefixes.map(async (prefix) => {
      const [year, month] = prefix.split('-').map(Number);
      const monthStartDate = new Date(year, month - 1, 1);
      const lastDay = new Date(year, month, 0).getDate();
      const monthEndDate = new Date(year, month - 1, lastDay);
      const monthRangeSerialized = [
        { year: monthStartDate.getFullYear(), month: monthStartDate.getMonth(), day: monthStartDate.getDate() },
        { year: monthEndDate.getFullYear(), month: monthEndDate.getMonth(), day: monthEndDate.getDate() },
      ];
      await workerRef.current.executePipeline(queryId, queryDoc, endpointUrl, authToken, monthRangeSerialized, mergedVariables, allQueryDocsRef.current);
    });
    const results = await Promise.allSettled(pipelinePromises);
    const successfulExecutions = results.filter((r) => r.status === 'fulfilled').length;
    const failedExecutions = results.filter((r) => r.status === 'rejected');
    if (successfulExecutions === 0) {
      const errors = failedExecutions.map((r) => r.reason?.message || r.reason || 'Unknown error').filter(Boolean);
      throw new Error(`All pipeline executions failed: ${errors.join('; ')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    await indexedDBService.clearQueryDatabaseCache(queryId);
    let cachedPrefixes = await indexedDBService.getCachedMonthPrefixes(queryId, monthPrefixes);
    if (cachedPrefixes.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      cachedPrefixes = await indexedDBService.getCachedMonthPrefixes(queryId, monthPrefixes);
    }
    if (cachedPrefixes.length === 0) {
      const queryDb = await indexedDBService.getQueryDatabase(queryId);
      const existingStores = queryDb.tables.map((t) => t.name);
      const matchingStores = existingStores.filter((name) => monthPrefixes.some((p) => name.startsWith(`${p}_`)));
      if (matchingStores.length === 0) throw new Error(`No data cached for months: ${monthPrefixes.join(', ')}`);
      cachedPrefixes = monthPrefixes;
    }
    const reconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, cachedPrefixes);
    if (!reconstructed || typeof reconstructed !== 'object' || Object.keys(reconstructed).length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const retry = await indexedDBService.reconstructPipelineResult(queryId, null, monthPrefixes);
      if (!retry || typeof retry !== 'object' || Object.keys(retry).length === 0) {
        throw new Error('Failed to reconstruct from cache');
      }
      return retry;
    }
    return reconstructed;
  }, []);

  const checkIndexedDBAndLoadData = useCallback(async (queryId, queryDoc, monthRangeValue) => {
    const cacheLoadKey = `${queryId}_${monthRangeValue?.[0]?.getTime()}_${monthRangeValue?.[1]?.getTime()}`;
    if (cacheLoadInProgressRef.current === cacheLoadKey) return;
    cacheLoadInProgressRef.current = cacheLoadKey;
    setLoadingFromCache(true);
    const isOffline = queryDoc?.json != null && queryDoc?.body;
    if (isOffline) {
      cacheLoadInProgressRef.current = null;
      setLoadingFromCache(false);
      if (runQueryRef.current) await runQueryRef.current(queryId, true);
      return;
    }
    if (!queryDoc || queryDoc.clientSave !== true) {
      cacheLoadInProgressRef.current = null;
      setLoadingFromCache(false);
      if (runQueryRef.current) await runQueryRef.current(queryId, true);
      return;
    }
    if (!queryId) {
      cacheLoadInProgressRef.current = null;
      setLoadingFromCache(false);
      if (runQueryRef.current) await runQueryRef.current(queryId, true);
      return;
    }
    if (queryDoc.index?.trim() && workerRef.current) {
      try {
        const { endpointUrl, authToken } = getEndpointAndAuth(queryDoc);
        const finalEndpointUrl = endpointUrl || getInitialEndpoint()?.code || null;
        const finalAuthToken = authToken || null;
        if (finalEndpointUrl) {
          const cachedIndexResult = await indexedDBService.getQueryIndexResult(queryId);
          const cachedIndex = cachedIndexResult?.result ?? null;
          let currentIndex = null;
          if (queryDoc.month === true && monthRangeValue?.length === 2) {
            const monthRangeSerialized = [
              { year: monthRangeValue[0].getFullYear(), month: monthRangeValue[0].getMonth(), day: monthRangeValue[0].getDate() },
              { year: monthRangeValue[1].getFullYear(), month: monthRangeValue[1].getMonth(), day: monthRangeValue[1].getDate() },
            ];
            await workerRef.current.executeIndexQueryForMonthRange(queryId, queryDoc, finalEndpointUrl, finalAuthToken, monthRangeSerialized);
            const updated = await indexedDBService.getQueryIndexResult(queryId);
            currentIndex = updated?.result ?? null;
          } else {
            const parsedVariables = parseGraphQLVariables(queryDoc.variables || '');
            const monthRangeVariables = parsedVariables.startDate && parsedVariables.endDate
              ? { startDate: parsedVariables.startDate, endDate: parsedVariables.endDate }
              : null;
            await workerRef.current.executeIndexQuery(queryId, queryDoc, finalEndpointUrl, finalAuthToken, monthRangeVariables);
            const updated = await indexedDBService.getQueryIndexResult(queryId);
            currentIndex = updated?.result ?? null;
          }
          if (cachedIndex != null && currentIndex != null && JSON.stringify(cachedIndex) !== JSON.stringify(currentIndex)) {
            cacheLoadInProgressRef.current = null;
            setLoadingFromCache(false);
            if (runQueryRef.current) await runQueryRef.current(queryId, true);
            return;
          }
          if (cachedIndex === null && currentIndex != null) {
            cacheLoadInProgressRef.current = null;
            setLoadingFromCache(false);
            if (runQueryRef.current) await runQueryRef.current(queryId, true);
            return;
          }
        }
      } catch (e) {
        console.error('Error checking index:', e);
      }
    }
    try {
      if (queryDoc.month === true && monthRangeValue?.length === 2) {
        const [startDate, endDate] = monthRangeValue;
        const monthPrefixes = generateMonthRangeArray(startDate, endDate);
        if (monthPrefixes.length > 0) {
          const cachedPrefixes = await indexedDBService.getCachedMonthPrefixes(queryId, monthPrefixes);
          if (cachedPrefixes.length === monthPrefixes.length) {
            const reconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, monthPrefixes);
            if (reconstructed && typeof reconstructed === 'object' && Object.keys(reconstructed).length > 0) {
              setProcessedData(reconstructed);
              await fetchLastUpdatedAt(queryDoc, monthRangeValue);
              if (onDataChange) onDataChange({ severity: 'success', summary: 'Success', detail: 'Data loaded from cache', life: 3000 });
              cacheLoadInProgressRef.current = null;
              setLoadingFromCache(false);
              return;
            }
          } else if (cachedPrefixes.length > 0) {
            const reconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, cachedPrefixes);
            if (reconstructed && typeof reconstructed === 'object' && Object.keys(reconstructed).length > 0) {
              setProcessedData(reconstructed);
              await fetchLastUpdatedAt(queryDoc, monthRangeValue);
              if (onDataChange) onDataChange({ severity: 'success', summary: 'Success', detail: `Data loaded from cache (${cachedPrefixes.length}/${monthPrefixes.length} months)`, life: 3000 });
              const onBackgroundComplete = async () => {
                await new Promise((resolve) => setTimeout(resolve, 100));
                const fullReconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, monthPrefixes);
                if (fullReconstructed && typeof fullReconstructed === 'object' && Object.keys(fullReconstructed).length > 0) {
                  setProcessedData(fullReconstructed);
                  await fetchLastUpdatedAt(queryDoc, monthRangeValue);
                  if (onDataChange) onDataChange({ severity: 'success', summary: 'Success', detail: 'All months loaded', life: 3000 });
                }
              };
              fetchAndCacheMonthsInRange(queryId, queryDoc, monthRangeValue, onBackgroundComplete);
              cacheLoadInProgressRef.current = null;
              setLoadingFromCache(false);
              return;
            }
          }
        }
      } else {
        const yearMonthPrefix = queryDoc.month === true && monthRangeValue?.[0] ? dayjs(monthRangeValue[0]).format('YYYY-MM') : null;
        const reconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, yearMonthPrefix);
        if (reconstructed && typeof reconstructed === 'object' && Object.keys(reconstructed).length > 0) {
          setProcessedData(reconstructed);
          await fetchLastUpdatedAt(queryDoc, monthRangeValue);
          if (onDataChange) onDataChange({ severity: 'success', summary: 'Success', detail: 'Data loaded from cache', life: 3000 });
          cacheLoadInProgressRef.current = null;
          setLoadingFromCache(false);
          return;
        }
      }
    } catch (e) {
      console.error('Error loading from IndexedDB:', e);
    }
    cacheLoadInProgressRef.current = null;
    setLoadingFromCache(false);
    if (runQueryRef.current) await runQueryRef.current(queryId, true);
  }, [onDataChange, fetchAndCacheMonthsInRange, fetchLastUpdatedAt]);

  const executeAndStoreIndexQueries = useCallback(async (queries) => {
    if (!queries?.length) return;
    if (!workerRef.current) return;
    queries.forEach((q) => { if (q.id) allQueryDocsRef.current[q.id] = q; });
    const queryMap = new Map(queries.filter((q) => q.id).map((q) => [q.id, q]));
    queries.forEach((query) => {
      if (!query.id || !query.index?.trim() || query.clientSave !== true || (query.json != null && query.body)) return;
      const queryDoc = query;
      const onChangeCallback = async (queryId, oldResult, newResult, updatedAt, queryDocFromSave) => {
        const queryDocToUse = queryDocFromSave || queryMap.get(queryId) || queryDoc;
        if (!queryDocToUse || queryDocToUse.clientSave !== true) return;
        if (!queryDocToUse.month && queryDocToUse.month !== false) return;
        const hasMonth = queryDocToUse.month === true && queryDocToUse.monthIndex?.trim();
        if (!hasMonth) return;
        const { endpointUrl, authToken } = getEndpointAndAuth(queryDocToUse);
        if (!endpointUrl) return;
        if (pipelineExecutionInFlightRef.current.has(queryId)) return;
        pipelineExecutionInFlightRef.current.set(queryId, { endpointUrl });
        const run = async () => {
          try {
            if (!workerRef.current) return;
            await workerRef.current.executePipeline(queryId, queryDocToUse, endpointUrl, authToken, null, {}, allQueryDocsRef.current);
          } finally {
            pipelineExecutionInFlightRef.current.delete(queryId);
          }
        };
        if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(run, { timeout: 5000 });
        else setTimeout(run, 0);
      };
      if (workerRef.current?.indexedDBService) {
        workerRef.current.indexedDBService.setOnChangeCallback(query.id, Comlink.proxy(onChangeCallback)).catch(() => {});
      }
    });
    try {
      await workerRef.current.executeAndCacheIndexQueries(queries);
    } catch (e) {
      console.error('Error executing index queries:', e);
    }
  }, []);

  const runQuery = useCallback(async (queryId, skipMonthDateLoad = false) => {
    runQueryRef.current = runQuery;
    if (executingQuery) return;
    let mergedVariables = { ...queryVariablesRef.current, ...variableOverrides };
    if (monthRange?.length === 2) {
      const { startDate, endDate, ...rest } = mergedVariables;
      mergedVariables = rest;
    }
    if (currentQueryDoc?.clientSave === false) {
      if (searchTerm?.trim()) mergedVariables.searchText = searchTerm.trim();
      if (sortConfig?.field) {
        const [topLevelKey, ...nestedParts] = sortConfig.field.split('.');
        const nestedPath = nestedParts.join('.');
        let shouldAdd = true;
        if (currentQueryDoc.sortFields?.[topLevelKey]) {
          shouldAdd = nestedPath ? currentQueryDoc.sortFields[topLevelKey].includes(nestedPath) : true;
        }
        if (shouldAdd) {
          mergedVariables.sortField = nestedPath || topLevelKey;
          mergedVariables.sortDirection = sortConfig.direction || 'asc';
        }
      }
    }
    const executionKey = createExecutionKey(queryId, mergedVariables, monthRange);
    if (executingQueriesRef.current.has(executionKey)) return;
    const mergedVariablesForFinally = mergedVariables;
    if (!executionContextRef.current) executionContextRef.current = createExecutionContext();
    executingQueryIdRef.current = queryId;
    executingQueriesRef.current.add(executionKey);
    setExecutingQuery(true);
    try {
      let queryDocToUse = currentQueryDoc;
      if (!queryDocToUse) {
        queryDocToUse = await queryRegistry.loadQuery(queryId);
        if (queryDocToUse) allQueryDocsRef.current[queryId] = queryDocToUse;
      }
      if (!queryDocToUse) throw new Error(`Query "${queryId}" not found`);
      const isOffline = queryDocToUse?.json != null && queryDocToUse?.body;
      const { endpointUrl, authToken } = getEndpointAndAuth(queryDocToUse);
      const finalEndpointUrl = endpointUrl || getInitialEndpoint()?.code || null;
      const finalAuthToken = authToken ?? null;
      if (!isOffline && !finalEndpointUrl) throw new Error('GraphQL endpoint URL is not set');
      // Wait for worker to be ready (handles race when offline data loads before worker initializes)
      const maxWaitMs = 10000;
      const pollIntervalMs = 50;
      let waited = 0;
      while (!workerRef.current && waited < maxWaitMs) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        waited += pollIntervalMs;
      }
      if (!workerRef.current) throw new Error('Worker is not available.');
      if (!isOffline && queryDocToUse.month === true && monthRange?.length === 2) {
        const finalData = await executeAndCacheMonthRange(queryId, queryDocToUse, monthRange, finalEndpointUrl, finalAuthToken, mergedVariables);
        setProcessedData(finalData);
        await fetchLastUpdatedAt(queryDocToUse, monthRange);
      } else {
        const monthRangeToPass = monthRange?.length === 2
          ? [
              { year: monthRange[0].getFullYear(), month: monthRange[0].getMonth(), day: monthRange[0].getDate() },
              { year: monthRange[1].getFullYear(), month: monthRange[1].getMonth(), day: monthRange[1].getDate() },
            ]
          : undefined;
        if (!isOffline && queryDocToUse.index?.trim() && queryDocToUse.clientSave === true && workerRef.current) {
          try {
            if (monthRangeToPass) {
              await workerRef.current.executeIndexQueryForMonthRange(queryId, queryDocToUse, finalEndpointUrl, finalAuthToken, monthRangeToPass);
            } else {
              const monthRangeVariables = mergedVariables.startDate && mergedVariables.endDate
                ? { startDate: mergedVariables.startDate, endDate: mergedVariables.endDate }
                : null;
              await workerRef.current.executeIndexQuery(queryId, queryDocToUse, finalEndpointUrl, finalAuthToken, monthRangeVariables);
            }
          } catch (e) {
            console.error('Error executing index queries:', e);
          }
        }
        const finalData = await workerRef.current.executePipeline(
          queryId,
          queryDocToUse,
          finalEndpointUrl,
          finalAuthToken,
          monthRangeToPass,
          mergedVariables,
          allQueryDocsRef.current
        );
        setProcessedData(finalData);
      }
      await fetchLastUpdatedAt(queryDocToUse, monthRange);
      if (onDataChange) onDataChange({ severity: 'success', summary: 'Success', detail: 'Query executed successfully', life: 3000 });
    } catch (error) {
      if (onError) onError({ severity: 'error', summary: 'Error', detail: error.message || 'Failed to execute query', life: 5000 });
      setProcessedData(null);
    } finally {
      executingQueriesRef.current.delete(createExecutionKey(queryId, mergedVariablesForFinally, monthRange));
      if (executingQueryIdRef.current === queryId) {
        const hasOther = Array.from(executingQueriesRef.current).some((key) => key.startsWith(`${queryId}__`));
        if (!hasOther) executingQueryIdRef.current = null;
      }
      setExecutingQuery(false);
    }
  }, [onDataChange, onError, monthRange, executingQuery, variableOverrides, currentQueryDoc, searchTerm, sortConfig, createExecutionKey, executeAndCacheMonthRange, fetchLastUpdatedAt]);

  /**
   * Execute a query and return processed data (similar to transformer's queryFunction).
   * Used by formInputOverride getOptions and other contexts that need to fetch query results.
   * @param {string} queryId - Query ID to execute
   * @returns {Promise<Object>} Processed data from the query pipeline
   */
  const queryFunction = useCallback(async (queryId) => {
    if (!queryId || !queryId.trim()) {
      throw new Error('Query key is required');
    }
    let mergedVariables = { ...queryVariablesRef.current, ...variableOverrides };
    if (monthRange?.length === 2) {
      const { startDate, endDate, ...rest } = mergedVariables;
      mergedVariables = rest;
    }
    let queryDocToUse = allQueryDocsRef.current[queryId];
    if (!queryDocToUse) {
      queryDocToUse = await queryRegistry.loadQuery(queryId);
      if (queryDocToUse) allQueryDocsRef.current[queryId] = queryDocToUse;
    }
    if (!queryDocToUse) {
      throw new Error(`Query "${queryId}" not found`);
    }
    if (queryDocToUse.clientSave === false) {
      if (searchTerm?.trim()) mergedVariables.searchText = searchTerm.trim();
      if (sortConfig?.field) {
        const [topLevelKey, ...nestedParts] = sortConfig.field.split('.');
        const nestedPath = nestedParts.join('.');
        let shouldAdd = true;
        if (queryDocToUse.sortFields?.[topLevelKey]) {
          shouldAdd = nestedPath ? queryDocToUse.sortFields[topLevelKey].includes(nestedPath) : true;
        }
        if (shouldAdd) {
          mergedVariables.sortField = nestedPath || topLevelKey;
          mergedVariables.sortDirection = sortConfig.direction || 'asc';
        }
      }
    }
    const isOffline = queryDocToUse?.json != null && queryDocToUse?.body;
    const { endpointUrl, authToken } = getEndpointAndAuth(queryDocToUse);
    const finalEndpointUrl = endpointUrl || getInitialEndpoint()?.code || null;
    const finalAuthToken = authToken ?? null;
    if (!isOffline && !finalEndpointUrl) {
      throw new Error('GraphQL endpoint URL is not set');
    }
    const maxWaitMs = 10000;
    const pollIntervalMs = 50;
    let waited = 0;
    while (!workerRef.current && waited < maxWaitMs) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      waited += pollIntervalMs;
    }
    if (!workerRef.current) {
      throw new Error('Worker is not available');
    }
    const monthRangeToPass = monthRange?.length === 2
      ? [
          { year: monthRange[0].getFullYear(), month: monthRange[0].getMonth(), day: monthRange[0].getDate() },
          { year: monthRange[1].getFullYear(), month: monthRange[1].getMonth(), day: monthRange[1].getDate() },
        ]
      : undefined;
    if (queryDocToUse.month === true && monthRange?.length === 2) {
      return executeAndCacheMonthRange(queryId, queryDocToUse, monthRange, finalEndpointUrl, finalAuthToken, mergedVariables);
    }
    return workerRef.current.executePipeline(
      queryId,
      queryDocToUse,
      finalEndpointUrl,
      finalAuthToken,
      monthRangeToPass,
      mergedVariables,
      allQueryDocsRef.current
    );
  }, [variableOverrides, monthRange, searchTerm, sortConfig, executeAndCacheMonthRange]);

  useEffect(() => {
    if (!executionContextRef.current) executionContextRef.current = createExecutionContext();
  }, []);

  useEffect(() => {
    queryVariablesRef.current = queryVariables;
  }, [queryVariables]);

  useEffect(() => {
    if (onExecutingQueryChange) onExecutingQueryChange(executingQuery);
  }, [executingQuery, onExecutingQueryChange]);

  const isLoadingData = executingQuery || loadingFromCache;
  useEffect(() => {
    if (onLoadingDataChange) onLoadingDataChange(isLoadingData);
  }, [isLoadingData, onLoadingDataChange]);

  useEffect(() => {
    if (onSelectedQueryKeyChange) onSelectedQueryKeyChange(selectedQueryKey);
  }, [selectedQueryKey, onSelectedQueryKeyChange]);

  useEffect(() => {
    if (!currentQueryDoc?.enableWrite || !currentQueryDoc?.writeSchema) return;
    const urlKey = typeof currentQueryDoc.urlKey === 'string' ? currentQueryDoc.urlKey.toUpperCase() : null;
    if (!urlKey) return;
    const fieldName = String(currentQueryDoc.writeSchema).trim();
    if (!fieldName) return;
    const cacheKey = `${currentQueryDoc.id ?? 'unknown'}::${urlKey}::${fieldName}`;
    if (loggedWriteSchemaRef.current.has(cacheKey)) return;
    const log = async () => {
      try {
        const schema = await fetchGraphQLSchema(urlKey);
        const queryType = schema?.getQueryType?.();
        if (!queryType) return;
        const fields = queryType.getFields?.();
        const fieldDefinition = fields?.[fieldName];
        if (!fieldDefinition) return;
        const serialized = serializeGraphQLField(fieldDefinition, schema);
        if (serialized?.types) loggedWriteSchemaRef.current.add(cacheKey);
      } catch (e) {
        console.error('Failed to log write schema:', e);
      }
    };
    log();
  }, [currentQueryDoc]);

  useEffect(() => {
    if (!dataSource) {
      setProcessedData(null);
      setSelectedQueryKey(null);
      setMonthRange(null);
      setHasMonthSupport(false);
      setQueryVariables({});
      setCurrentQueryDoc(null);
      setOfflineDataExecuted(false);
      executionContextRef.current = createExecutionContext();
      if (onVariablesChange) onVariablesChange({});
      setOfflineDataExecuted(true);
      if (onDataChange) onDataChange({ severity: 'success', summary: 'Success', detail: 'Data loaded', life: 3000 });
    } else {
      isInitialLoadRef.current = true;
      const loadQueryMetadata = async () => {
        try {
          const queryDoc = await queryRegistry.loadQuery(dataSource);
          if (queryDoc) {
            setCurrentQueryDoc(queryDoc);
            const { month, variables: rawVariables } = queryDoc;
            setHasMonthSupport(month === true);
            const parsedVariables = parseGraphQLVariables(rawVariables || '');
            let initialMonthRange = null;
            if (month === true && parsedVariables.startDate && parsedVariables.endDate) {
              try {
                const startDate = new Date(parsedVariables.startDate);
                const endDate = new Date(parsedVariables.endDate);
                if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) initialMonthRange = [startDate, endDate];
              } catch (e) {}
            }
            const { startDate, endDate, ...filteredVariables } = parsedVariables;
            setQueryVariables(filteredVariables);
            queryVariablesRef.current = filteredVariables;
            if (onVariablesChange) onVariablesChange(filteredVariables);
            if (month === true) setMonthRange(initialMonthRange);
            else setMonthRange(null);
            await fetchLastUpdatedAt(queryDoc, initialMonthRange);
            if (month !== true || initialMonthRange) {
              await checkIndexedDBAndLoadData(dataSource, queryDoc, initialMonthRange);
            }
            isInitialLoadRef.current = false;
          }
        } catch (e) {
          setCurrentQueryDoc(null);
          isInitialLoadRef.current = false;
        }
      };
      loadQueryMetadata();
    }
  }, [dataSource]);

  useEffect(() => {
    if (!dataSource) return;
    const hasOverrides = Object.keys(variableOverrides).length > 0;
    if (hasOverrides) {
      if (hasMonthSupport && (!monthRange || !Array.isArray(monthRange) || monthRange.length !== 2)) return;
      runQuery(dataSource, true);
    }
  }, [variableOverrides]);

  useEffect(() => {
    if (!currentQueryDoc || currentQueryDoc.clientSave !== false || !dataSource) return;
    runQuery(dataSource, true);
  }, [searchTerm, sortConfig, currentQueryDoc, dataSource]);

  useEffect(() => {
    if (!indexQueriesExecutedRef.current && savedQueries.length > 0) {
      indexQueriesExecutedRef.current = true;
      executeAndStoreIndexQueries(savedQueries);
    }
  }, [savedQueries, executeAndStoreIndexQueries]);

  useEffect(() => {
    if (!dataSource) return;
    if (!hasMonthSupport) return;
    if (isInitialLoadRef.current) return;
    if (monthRange && Array.isArray(monthRange) && monthRange.length === 2 && currentQueryDoc) {
      checkIndexedDBAndLoadData(dataSource, currentQueryDoc, monthRange);
    }
  }, [monthRange, checkIndexedDBAndLoadData]);

  useEffect(() => {
    if (currentQueryDoc && dataSource && currentQueryDoc.id === dataSource && monthRange) {
      fetchLastUpdatedAt();
    }
  }, [monthRange, currentQueryDoc, dataSource, fetchLastUpdatedAt]);

  const availableQueryKeys = useMemo(() => {
    const saved = currentQueryDoc?.queryKeys;
    return (dataSource && Array.isArray(saved)) ? saved : [];
  }, [dataSource, currentQueryDoc?.queryKeys]);

  useEffect(() => {
    if (onAvailableQueryKeysChange) onAvailableQueryKeysChange(availableQueryKeys);
  }, [availableQueryKeys, onAvailableQueryKeysChange]);

  useEffect(() => {
    const dataSourceChanged = previousDataSourceRef.current !== dataSource;
    if (dataSourceChanged) {
      previousDataSourceRef.current = dataSource;
      queryKeySetForDataSourceRef.current = null;
      lastSetQueryKeyRef.current = null;
      if (dataSource) setSelectedQueryKey(null);
    }
  }, [dataSource]);

  useEffect(() => {
    if (!dataSource || !processedData) return;
    const firstAvailableKey = availableQueryKeys.length > 0 ? availableQueryKeys[0] : null;
    const defaultKeyIsValid = selectedQueryKeyProp && availableQueryKeys.includes(selectedQueryKeyProp);
    if (queryKeySetForDataSourceRef.current !== dataSource) {
      const keyToUse = defaultKeyIsValid ? selectedQueryKeyProp : firstAvailableKey;
      if (keyToUse && lastSetQueryKeyRef.current !== keyToUse) {
        queryKeySetForDataSourceRef.current = dataSource;
        lastSetQueryKeyRef.current = keyToUse;
        setSelectedQueryKey(keyToUse);
      }
      return;
    }
    if (queryKeySetForDataSourceRef.current === dataSource) {
      setSelectedQueryKey((current) => {
        if (current && !availableQueryKeys.includes(current)) {
          const keyToUse = defaultKeyIsValid ? selectedQueryKeyProp : firstAvailableKey;
          if (keyToUse && lastSetQueryKeyRef.current !== keyToUse) {
            lastSetQueryKeyRef.current = keyToUse;
            return keyToUse;
          }
        }
        if (!current && defaultKeyIsValid) {
          if (lastSetQueryKeyRef.current !== selectedQueryKeyProp) {
            lastSetQueryKeyRef.current = selectedQueryKeyProp;
            return selectedQueryKeyProp;
          }
        }
        return current;
      });
    }
  }, [processedData, availableQueryKeys, dataSource, selectedQueryKeyProp]);

  useEffect(() => {
    runQueryRef.current = runQuery;
  }, [runQuery]);

  const formatLastUpdatedDate = useCallback((dateString) => {
    if (!dateString) return null;
    try {
      const parsed = dayjs(dateString);
      return parsed.isValid() ? parsed.format('D MMM YY HH:mm') : dateString;
    } catch (e) {
      return dateString;
    }
  }, []);

  return {
    dataSource,
    setDataSource,
    selectedQueryKey,
    setSelectedQueryKey,
    savedQueries,
    loadingQueries,
    executingQuery,
    processedData,
    setProcessedData,
    monthRange,
    setMonthRange,
    hasMonthSupport,
    lastUpdatedAt,
    queryVariables,
    setQueryVariables,
    currentQueryDoc,
    loadingFromCache,
    offlineDataExecuted,
    setOfflineDataExecuted,
    runQuery,
    queryFunction,
    checkIndexedDBAndLoadData,
    availableQueryKeys,
    workerRef,
    executionContextRef,
    allQueryDocsRef,
    formatLastUpdatedDate,
    isLoadingData,
  };
}
