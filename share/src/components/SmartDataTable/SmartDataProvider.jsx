'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SmartDataContext, SmartDataConfigContext } from './SmartDataContext';
import { useSmartDataStore } from './useSmartDataStore';
import { uniGridGroupedReportDataSource } from './reportSource.js';
import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';

/**
 * @typedef {(params: import('./dataSources').DataSourceParams) => import('./dataSources').DataSourceResult | Promise<import('./dataSources').DataSourceResult>} DataSourceFn
 */

/**
 * SmartDataProvider — orchestrator.
 *
 * Owns Zustand view state. Each SmartDataTable child registers its viewId on mount.
 * When a view's { filters, sortMeta, pagination } change, the provider calls the
 * resolved dataSource and writes the result back to the store.
 *
 * @param {{ dataSource?: DataSourceFn, children: React.ReactNode }} props
 */
export function SmartDataProvider({ dataSource: providerDataSource, reportConfig, config: commonConfig, overrides, children }) {
  const store = useSmartDataStore;

  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  const effectiveConfig = useMemo(() => {
    const base = commonConfig ?? {};
    const patch = overrides?.config;
    return (patch && typeof patch === 'object') ? { ...base, ...patch } : base;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commonConfig, overrides?.config]);

  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  // Track per-view unsubscribe functions so we can clean up on unmount.
  const unsubsRef = useRef({});

  // Per-view dataSource registry: { [viewId]: DataSourceFn }
  const viewDataSources = useRef({});

  // Per-view pipeline step watchers: { [viewId]: (stepName, state) => void }
  const pipelineWatchersRef = useRef({});

  const runDataSource = useCallback(async (viewId) => {
    const state = useSmartDataStore.getState();
    const view  = state.views[viewId];
    if (!view) return;

    const ds = viewDataSources.current[viewId] ?? providerDataSource;
    if (!ds) return;

    state._setLoading(viewId, true);

    try {
      const result = await Promise.resolve(
        ds({
          filters:        view.filters,
          sortMeta:       view.sortMeta,
          pagination:     view.pagination,
          viewParams:     view.viewParams,
          viewId,
          _debugCapture:  pipelineWatchersRef.current[viewId],
        })
      );
      useSmartDataStore.getState()._setResult(viewId, result);
      setLastFetchedAt(new Date());
    } catch (err) {
      useSmartDataStore.getState()._setError(viewId, err?.message ?? 'DataSource error');
    }
  }, [providerDataSource]);

  const refresh = useCallback(async () => {
    const viewIds = Object.keys(viewDataSources.current);
    if (viewIds.length === 0) return;
    await Promise.all(viewIds.map(id => runDataSource(id)));
  }, [runDataSource]);

  /**
   * Called by SmartDataTable on mount. Registers the view and sets up its
   * subscription so that state changes automatically trigger the dataSource.
   */
  const registerView = useCallback((viewId, viewDataSource, viewName, defaultPageSize) => {
    let ds = viewDataSource;
    if (!ds && viewName && reportConfig?.urlKey) {
      const { urlKey, baseFilters, requestBuilder, method, endpoint: configEndpoint } = reportConfig;
      ds = (params) => {
        const ov = overridesRef.current;
        return uniGridGroupedReportDataSource({
          urlKey,
          view:           viewName,
          filters:        { ...(baseFilters ?? {}), ...(ov?.api?.params ?? {}) },
          requestBuilder,
          token:          ov?.token ?? null,
          endpoint:       ov?.api?.endpoint ?? configEndpoint ?? null,
          method:         method ?? 'POST',
        })(params);
      };
    }
    if (ds) viewDataSources.current[viewId] = ds;

    useSmartDataStore.getState().registerView(viewId, defaultPageSize);

    // Subscribe to only the pipeline-relevant slice for this view.
    const unsub = useSmartDataStore.subscribe(
      state => {
        const v = state.views[viewId];
        if (!v) return null;
        return { filters: v.filters, sortMeta: v.sortMeta, pagination: v.pagination, viewParams: v.viewParams };
      },
      () => runDataSource(viewId),
      { equalityFn: shallowEqualPipelineSlice, fireImmediately: true }
    );

    unsubsRef.current[viewId] = unsub;
  }, [runDataSource, reportConfig]);

  const unregisterView = useCallback((viewId) => {
    unsubsRef.current[viewId]?.();
    delete unsubsRef.current[viewId];
    delete viewDataSources.current[viewId];
    useSmartDataStore.getState().unregisterView(viewId);
  }, []);

  /**
   * Handles signals from SmartDataTable and maps them to store actions.
   */
  const setViewParam = useCallback((viewId, key, value) => {
    useSmartDataStore.getState().setViewParam(viewId, key, value);
  }, []);

  const exportView = useCallback(async (viewId) => {
    const view = useSmartDataStore.getState().views[viewId];
    const ds = viewDataSources.current[viewId] ?? providerDataSource;
    if (!ds || !view) return [];
    try {
      const result = await Promise.resolve(
        ds({
          filters:    view.filters,
          sortMeta:   view.sortMeta,
          pagination: { first: 0, rows: view.totalRecords || 10000 },
          viewParams: view.viewParams,
          viewId,
        })
      );
      return result?.rows ?? [];
    } catch {
      return [];
    }
  }, [providerDataSource]);

  const registerPipelineWatcher = useCallback((viewId, fn) => {
    pipelineWatchersRef.current[viewId] = fn;
  }, []);

  const unregisterPipelineWatcher = useCallback((viewId) => {
    delete pipelineWatchersRef.current[viewId];
  }, []);

  /**
   * Fetches paginated filter values from the Filter API.
   * Called by FilterSortSidebar for each filter tab (with infinite scroll + search).
   *
   * @param {string} key  - Filter key (e.g. 'customer', 'item')
   * @param {{ page?: number, pageLength?: number, search?: string }} opts
   * @returns {Promise<Array<{ value: string, label: string }>>}
   */
  const fetchFilterValues = useCallback(async (key, { page = 1, pageLength = 20, search = '' } = {}) => {
    if (!reportConfig?.urlKey) return [];
    try {
      const { endpointUrl, authToken } = await getEndpointConfigFromUrlKeyAsync(reportConfig.urlKey);
      const origin = new URL(endpointUrl).origin;
      const token = reportConfig.token ?? authToken;
      const params = new URLSearchParams({
        key,
        page:        String(page),
        page_length: String(pageLength),
      });
      if (search) params.set('search', search);
      const res = await fetch(`${origin}/api/method/report-filter?${params}`, {
        headers: { Authorization: token },
      });
      if (!res.ok) throw new Error(`Filter values fetch failed: HTTP ${res.status}`);
      const json = await res.json();
      const msg   = json?.message ?? {};
      const raw   = msg.values ?? msg.data ?? msg ?? [];
      const items = (Array.isArray(raw) ? raw : []).map(item =>
        typeof item === 'string'
          ? { value: item, label: item }
          : { value: String(item.value ?? item.name ?? ''), label: String(item.label ?? item.value ?? item.name ?? '') }
      );
      // Use the API's has_more flag if present, otherwise infer from page size
      const hasMore = msg.has_more ?? (items.length === pageLength);
      return { items, hasMore };
    } catch (err) {
      console.error('[SmartDataProvider] fetchFilterValues error:', err);
      return { items: [], hasMore: false };
    }
  }, [reportConfig]);

  const handleSignal = useCallback((viewId, signal) => {
    const s = useSmartDataStore.getState();
    switch (signal.type) {
      case 'sort':
        s.setSort(viewId, signal.payload);
        break;
      case 'filter':
        if (signal.payload.value === null || signal.payload.value === undefined || signal.payload.value === '') {
          s.clearFilter(viewId, signal.payload.field);
        } else {
          s.setFilter(viewId, signal.payload.field, signal.payload.value);
        }
        break;
      case 'page':
        s.setPage(viewId, signal.payload.first, signal.payload.rows);
        break;
    }
  }, []);

  // Clean up all subscriptions when provider unmounts.
  useEffect(() => {
    return () => {
      Object.values(unsubsRef.current).forEach(unsub => unsub());
    };
  }, []);

  return (
    <SmartDataConfigContext.Provider value={effectiveConfig}>
      <SmartDataContext.Provider value={{ providerDataSource, reportConfig, registerView, unregisterView, handleSignal, setViewParam, exportView, refresh, lastFetchedAt, registerPipelineWatcher, unregisterPipelineWatcher, fetchFilterValues }}>
        {children}
      </SmartDataContext.Provider>
    </SmartDataConfigContext.Provider>
  );
}

// Shallow-compare only the three pipeline-relevant keys to avoid spurious re-runs.
function shallowEqualPipelineSlice(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.sortMeta !== b.sortMeta) return false;
  if (a.pagination !== b.pagination) return false;
  if (a.viewParams !== b.viewParams) return false;
  if (a.filters === b.filters) return true;
  const ak = Object.keys(a.filters);
  const bk = Object.keys(b.filters);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a.filters[k] !== b.filters[k]) return false;
  }
  return true;
}
