'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SmartDataCache } from './smartDataCache';
import { DataProvider as PlasmicDataProvider } from '@plasmicapp/loader-nextjs';
import { SmartDataContext, SmartDataConfigContext } from './SmartDataContext';
import { useSmartDataStore } from './useSmartDataStore';
import { graphqlQueryReportDataSource, resolveIndexGqlVars } from './reportSource.jsx';
import { fetchElbritFilterValues, resolveControlDateRange } from './elbritFilterApi.js';
import { buildViewDataState } from './viewContextHelpers';
import { loadReportConfig } from '@/app/report-table/config/reportConfigService';
import { refreshGlobalTokenRows } from '@/app/graphql-playground/constants';
import { queryRegistry } from '@/app/graphql-playground/services/queryRegistry';
import { fetchGraphQLRequest } from '@/app/graphql-playground/utils/query-pipeline';
import { extractValueFromGraphQLResponse } from '@/app/graphql-playground/utils/queryExtractor';
import { resolveApiConfig } from './apiRegistry';
import { Sidebar } from 'primereact/sidebar';
import { SmartDataTable } from './SmartDataTable';
import { DrawerTabBar } from './DrawerTabBar';
import { ReportControls } from '@/app/report-table/components/ReportControls';
import { SmartDataErrorBoundary } from './SmartDataErrorBoundary';

export { deserializeReportConfig } from '@/app/report-table/config/reportConfigParser';

// ─── Config resolution helpers ────────────────────────────────────────────────
//
// deepMerge: recursively merges plain objects.
// Arrays and primitives are overridden, not concatenated.

export function deepMerge(base, override) {
  if (!override) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v)
      && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]))
      ? deepMerge(base[k], v)
      : v;
  }
  return out;
}

/**
 * Resolves root-level reportConfig fields against a per-view override object.
 * Any nested key in viewOverride partially overrides its root counterpart.
 *
 * Returns:
 *   resolvedApi      — deep-merged api config for the data source
 *   resolvedTable    — deep-merged table config for SmartDataTable
 *   resolvedControls — root controls with per-view key overrides applied
 *                      (false = hide that control for this view)
 */
export function resolveViewConfig(rootConfig, viewOverride = {}) {
  const resolvedApi   = deepMerge(rootConfig.api   ?? {}, viewOverride.api   ?? {});
  const resolvedTable = deepMerge(rootConfig.table ?? {}, viewOverride.table ?? {});

  // null = no view-level override; view section will not render its own controls.
  // Array = fully replaces root controls for this view (no merging).
  const resolvedControls = Array.isArray(viewOverride.controls) ? viewOverride.controls : null;

  return { resolvedApi, resolvedTable, resolvedControls };
}

/** Fetch index GQL from saved query; returns extracted string or null. */
async function fetchApiIndexValue(resolvedApi, view) {
  const queryId = resolvedApi?.index?.trim();
  if (!queryId) return null;

  const queryDoc = await queryRegistry.loadQuery(queryId);
  const indexQuery = queryDoc?.index?.trim();
  if (!indexQuery) {
    console.warn(`[SmartDataProvider] api.index "${queryId}": saved query has no index field`);
    return null;
  }

  const { endpoint, token } = await resolveApiConfig(resolvedApi);
  if (!endpoint) {
    console.warn(`[SmartDataProvider] api.index "${queryId}": no endpoint available`);
    return null;
  }

  const gqlVars = resolveIndexGqlVars(resolvedApi, queryDoc, {
    viewParams: view.viewParams,
    sortBy: view.sortBy,
    pagination: view.pagination,
  });

  const res = await fetchGraphQLRequest(indexQuery, gqlVars, {
    endpointUrl: endpoint,
    authToken: token ? `token ${token}` : undefined,
  });
  const json = await res.json();
  if (json.errors?.length) {
    console.warn('[SmartDataProvider] api.index GraphQL error:', json.errors[0].message);
    return null;
  }

  return extractValueFromGraphQLResponse(indexQuery, json);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * @typedef {(params: import('./dataSources').DataSourceParams) => import('./dataSources').DataSourceResult | Promise<import('./dataSources').DataSourceResult>} DataSourceFn
 */

/**
 * SmartDataProvider — orchestrator.
 *
 * Owns Zustand view state. Each SmartDataTable child registers its viewId on mount.
 * When a view's { filters, sortBy, pagination, viewParams } change, the provider
 * calls the resolved dataSource and writes the result back to the store.
 *
 * reportConfig shape:
 *   api: {
 *     urlKey?,        endpoint?, token?,
 *     index?,         Saved query name; GQL from queryDoc.index. Stored in memory after each
 *                     full fetch; refresh control compares live index vs memory before refetching.
 *     indexVariables?, static base vars for index fetch (merged over saved query variables)
 *     indexVariablesMap?, maps controls/sort/pagination → index variable paths (merged on top)
 *     variables:     { report, filters, [custom]: value, ... }   — base GQL variables spread as-is
 *     variableTypes: { [key]: 'GQLType', ... }                   — required for every variable key
 *     variablesMap:  {                                           — maps sources → variable dot-paths
 *       'controls.{key}.{outputKey}': 'dot.path' | { path, transform?, merge? },
 *       'sort':             'sort_by',
 *       'pagination.page':  'page',
 *       'pagination.limit': 'limit',
 *     }
 *   }
 *   table:    { ...tableConfig }
 *   controls: [{ key, type, label, defaultValue? }]   — key is required; controls emit to _controls[key]
 *   views:    { [viewId]: { name, table?, controls?, api? } }
 *
 * Per-view api/table/controls override their root counterparts via deepMerge (api & table) or replace (controls).
 */
function SmartDataProviderCore({ dataSource: providerDataSource, reportConfig: rawReportConfig, config: commonConfig, overrides, children }) {
  const store = useSmartDataStore;

  // Deep-merge overrides on top of reportConfig so every key (api, table, controls, views) is overridable.
  const reportConfig = useMemo(
    () => (rawReportConfig && overrides) ? deepMerge(rawReportConfig, overrides) : (rawReportConfig ?? null),
    [rawReportConfig, overrides]
  );

  const effectiveConfig = useMemo(() => {
    return commonConfig ?? reportConfig?.table ?? {};
  }, [commonConfig, reportConfig?.table]);

  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const [drawerVisible, setDrawerVisible]   = useState(false);
  const [drawerTabs, setDrawerTabs]         = useState([]);
  const [drawerActiveId, setDrawerActiveId] = useState(null);

  const storeViews = useSmartDataStore(state => state.views);

  const unsubsRef           = useRef({});
  const viewDataSources     = useRef({});
  const viewActionsRef      = useRef({});
  const pipelineWatchersRef = useRef({});
  const providerOwnedViewsRef = useRef(new Set());
  // Debounce timers: defers the initial fetch by one task so ReportControls can apply
  // its defaults (dateRange, breakdown, etc.) before the first GQL call fires.
  const runTimersRef = useRef({});

  // Result cache: LRU + TTL, keyed by full request fingerprint.
  const cache          = useRef(new SmartDataCache());
  // Per-view resolved api.variables — component of the cache key.
  const viewApiVarsRef = useRef({});
  // Per-view full resolved api config (for index fetch).
  const viewResolvedApiRef = useRef({});
  // Per-view last-known index value keyed by request fingerprint (for refresh gate).
  const viewIndexRef = useRef({});
  // Batches view pipeline runs so index phase completes for all views before any data fetch.
  const scheduledBatchRef = useRef(new Set());
  const batchFlushTimerRef = useRef(null);
  // Per-view generation counter — bumped on every data fetch to discard stale responses.
  const fetchGenRef    = useRef({});

  // Cache of _meta.meta_filter_values from the most recent fetch.
  const filterValuesCacheRef = useRef({});
  // Raw API config stored so fetchFilterValues can call the customFilter API on search.
  const rawApiConfigRef = useRef(null);
  useEffect(() => {
    if (reportConfig?.api?.urlKey) refreshGlobalTokenRows();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportConfig?.api?.urlKey]);

  const runDataFetch = useCallback(async (viewId) => {
    const state = useSmartDataStore.getState();
    const view  = state.views[viewId];
    const ds    = viewDataSources.current[viewId] ?? providerDataSource;
    if (!view || !ds) return;

    const cacheKey = SmartDataCache.buildKey(viewApiVarsRef.current[viewId] ?? {}, view);
    const gen      = (fetchGenRef.current[viewId] = (fetchGenRef.current[viewId] ?? 0) + 1);
    const isStale  = () => fetchGenRef.current[viewId] !== gen;

    state._setLoading(viewId, true, 'data');
    try {
      const result = await Promise.resolve(
        ds({
          filters:       view.filters,
          sortBy:        view.sortBy,
          pagination:    view.pagination,
          viewParams:    view.viewParams,
          viewId,
          _debugCapture: pipelineWatchersRef.current[viewId],
        })
      );
      if (isStale()) return;
      if (result.filterValues) filterValuesCacheRef.current = result.filterValues;
      cache.current.set(cacheKey, result);
      state._setResult(viewId, result);
      setLastFetchedAt(new Date());
    } catch (err) {
      if (isStale()) return;
      state._setError(viewId, err?.message ?? 'DataSource error');
    }
  }, [providerDataSource]);

  /** Phase 1: parallel index (deduped). Phase 2: parallel data — for initial load, filter change, and refresh. */
  const flushViewPipelineBatch = useCallback(async (viewIds, { bypassCache = false, refreshGate = false } = {}) => {
    if (!viewIds.length) return;

    const store = useSmartDataStore.getState();
    const dataFetchIds = [];
    const indexJobs = [];

    for (const viewId of viewIds) {
      const view = store.views[viewId];
      if (!view) continue;
      const ds = viewDataSources.current[viewId] ?? providerDataSource;
      if (!ds) continue;

      const cacheKey = SmartDataCache.buildKey(viewApiVarsRef.current[viewId] ?? {}, view);
      if (!bypassCache) {
        const cached = cache.current.get(cacheKey);
        if (cached) {
          store._setResult(viewId, cached);
          continue;
        }
      }

      const resolvedApi = viewResolvedApiRef.current[viewId];
      if (resolvedApi?.index?.trim()) {
        indexJobs.push({ viewId, view, resolvedApi, cacheKey });
        store._setLoading(viewId, true, 'index');
      } else {
        dataFetchIds.push(viewId);
      }
    }

    if (indexJobs.length > 0) {
      const needsData = await Promise.all(
        indexJobs.map(async ({ viewId, view, resolvedApi, cacheKey }) => {
          try {
            const indexValue = await fetchApiIndexValue(resolvedApi, view);
            if (refreshGate) {
              const stored = viewIndexRef.current[viewId];
              if (indexValue != null && stored?.key === cacheKey && stored?.value === indexValue) {
                const cached = cache.current.get(cacheKey);
                if (cached) store._setResult(viewId, cached);
                else store._setLoading(viewId, false);
                return false;
              }
            }
            if (indexValue != null) {
              viewIndexRef.current[viewId] = { key: cacheKey, value: indexValue };
            }
            return true;
          } catch (err) {
            console.error('[SmartDataProvider] index check failed:', err);
            return true;
          }
        }),
      );
      needsData.forEach((need, i) => {
        if (need) dataFetchIds.push(indexJobs[i].viewId);
      });
    }

    if (dataFetchIds.length > 0) {
      await Promise.all(dataFetchIds.map(id => runDataFetch(id)));
    }
  }, [providerDataSource, runDataFetch]);

  const scheduleViewPipeline = useCallback((viewId) => {
    scheduledBatchRef.current.add(viewId);
    clearTimeout(batchFlushTimerRef.current);
    batchFlushTimerRef.current = setTimeout(() => {
      const ids = [...scheduledBatchRef.current];
      scheduledBatchRef.current.clear();
      flushViewPipelineBatch(ids);
    }, 0);
  }, [flushViewPipelineBatch]);

  const runDataSource = useCallback(
    (viewId, opts) => flushViewPipelineBatch([viewId], opts),
    [flushViewPipelineBatch],
  );

  const refresh = useCallback(async () => {
    const viewIds = Object.keys(viewDataSources.current);
    await flushViewPipelineBatch(viewIds, { bypassCache: true, refreshGate: true });
  }, [flushViewPipelineBatch]);

  // Stores resolved api vars + creates a dataSource instance for a view.
  // Called whenever a view's api config is known or updated (register, openDrawer).
  // updateRawApiConfig: set true only for the view whose config the filter sidebar should use.
  const activateView = useCallback((viewId, resolvedApi, updateRawApiConfig = false) => {
    viewResolvedApiRef.current[viewId] = resolvedApi;
    viewApiVarsRef.current[viewId]  = resolvedApi.variables ?? {};
    viewDataSources.current[viewId] = graphqlQueryReportDataSource(resolvedApi);
    if (updateRawApiConfig) rawApiConfigRef.current = resolvedApi;
  }, []);

  // Wires a Zustand subscription for a view. No-op if already wired.
  const wireSubscription = useCallback((viewId) => {
    if (unsubsRef.current[viewId]) return;

    const scheduleRun = () => {
      clearTimeout(runTimersRef.current[viewId]);
      runTimersRef.current[viewId] = setTimeout(() => scheduleViewPipeline(viewId), 0);
    };

    unsubsRef.current[viewId] = useSmartDataStore.subscribe(
      state => {
        const v = state.views[viewId];
        if (!v) return null;
        return { filters: v.filters, sortBy: v.sortBy, pagination: v.pagination, viewParams: v.viewParams };
      },
      scheduleRun,
      { equalityFn: shallowEqualPipelineSlice, fireImmediately: true },
    );
  }, [scheduleViewPipeline]);

  // registerView is only called by standalone SmartDataTable instances (no reportConfig.views).
  // Provider-owned views are registered directly in the useEffect below.
  const registerView = useCallback((viewId, viewDataSource, _viewName, defaultPageSize) => {
    if (unsubsRef.current[viewId]) return; // already wired

    let ds = viewDataSource;
    let resolvedPageSize = defaultPageSize;
    if (!ds && reportConfig?.api) {
      const viewOverride              = reportConfig.views?.[viewId] ?? {};
      const { resolvedApi, resolvedTable } = resolveViewConfig(reportConfig, viewOverride);
      activateView(viewId, resolvedApi, true);
      ds = viewDataSources.current[viewId];
      resolvedPageSize ??= resolvedTable?.defaultPageSize;
    }

    useSmartDataStore.getState().registerView(viewId, resolvedPageSize);
    wireSubscription(viewId);
  }, [reportConfig, activateView, wireSubscription]);

  const unregisterView = useCallback((viewId) => {
    if (providerOwnedViewsRef.current.has(viewId)) return; // provider outlives table
    clearTimeout(runTimersRef.current[viewId]);
    delete runTimersRef.current[viewId];
    unsubsRef.current[viewId]?.();
    delete unsubsRef.current[viewId];
    delete viewDataSources.current[viewId];
    delete viewApiVarsRef.current[viewId];
    delete viewResolvedApiRef.current[viewId];
    delete viewIndexRef.current[viewId];
    fetchGenRef.current[viewId] = (fetchGenRef.current[viewId] ?? 0) + 1;
    useSmartDataStore.getState().unregisterView(viewId);
  }, []);

  useEffect(() => {
    if (!reportConfig?.views) return;
    const viewIds = Object.keys(reportConfig.views);

    let rawApiConfigSet = false;
    viewIds.forEach(id => {
      const viewCfg    = reportConfig.views[id];
      const isDrawer   = viewCfg.type === 'drawer';
      providerOwnedViewsRef.current.add(id);

      const { resolvedApi, resolvedTable } = resolveViewConfig(reportConfig, viewCfg);
      // rawApiConfigRef is used by the filter sidebar — set it from the first non-drawer view.
      activateView(id, resolvedApi, !isDrawer && !rawApiConfigSet);
      if (!isDrawer) rawApiConfigSet = true;
      useSmartDataStore.getState().registerView(id, resolvedTable?.defaultPageSize);

      // Drawer views: slot pre-registered but subscription wired lazily in openDrawerView
      // (row-specific variables aren't known until the drawer is actually opened).
      if (!isDrawer) {
        wireSubscription(id);
      }
    });

    return () => {
      viewIds.forEach(id => {
        providerOwnedViewsRef.current.delete(id);
        clearTimeout(runTimersRef.current[id]);
        delete runTimersRef.current[id];
        unsubsRef.current[id]?.();
        delete unsubsRef.current[id];
        delete viewDataSources.current[id];
        delete viewApiVarsRef.current[id];
        fetchGenRef.current[id] = (fetchGenRef.current[id] ?? 0) + 1;
        useSmartDataStore.getState().unregisterView(id);
      });
    };
  }, [reportConfig, activateView, wireSubscription]);

  const setViewParam = useCallback((viewId, key, value) => {
    useSmartDataStore.getState().setViewParam(viewId, key, value);
  }, []);

  const openDrawerView = useCallback((tabs) => {
    const resolvedTabs = tabs.map(({ id, config = {} }) => {
      if (reportConfig?.views && !(id in reportConfig.views))
        return { id, config, error: `View "${id}" not found in report config` };

      const viewConfig = reportConfig?.views?.[id] ?? {};
      if (reportConfig?.api) {
        // 3-way merge: base ← view ← openDrawer (api + table only, controls excluded)
        const viewLayered     = deepMerge(viewConfig, { api: config.api, table: config.table });
        const { resolvedApi } = resolveViewConfig(reportConfig, viewLayered);
        activateView(id, resolvedApi);    // update api vars + dataSource for this open
        wireSubscription(id);            // no-op if already wired from a previous open
        clearTimeout(runTimersRef.current[id]);
        runTimersRef.current[id] = setTimeout(() => runDataSource(id), 0);
      }
      return { id, config: deepMerge(viewConfig, config) };
    });
    setDrawerTabs(resolvedTabs);
    setDrawerActiveId(resolvedTabs[0]?.id ?? null);
    setDrawerVisible(true);
  }, [reportConfig, activateView, wireSubscription, runDataSource]);

  const closeDrawerView = useCallback(() => {
    setDrawerVisible(false);
  }, []);

  const exportView = useCallback(async (viewId) => {
    const view = useSmartDataStore.getState().views[viewId];
    const ds   = viewDataSources.current[viewId] ?? providerDataSource;
    if (!ds || !view) return [];
    try {
      const result = await Promise.resolve(
        ds({
          filters:    view.filters,
          sortBy:     view.sortBy,
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

  const registerPipelineWatcher   = useCallback((viewId, fn) => { pipelineWatchersRef.current[viewId] = fn; }, []);
  const unregisterPipelineWatcher = useCallback((viewId)     => { delete pipelineWatchersRef.current[viewId]; }, []);

  /**
   * Resolves root reportConfig against a view's override object.
   * Consumers (e.g. page.jsx view loop) call this to get per-view table config and controls
   * without importing deepMerge themselves.
   */
  const resolveView = useCallback((viewId) => {
    if (!reportConfig) return { resolvedTable: {}, resolvedControls: null, resolvedApi: {} };
    const viewOverride = reportConfig.views?.[viewId] ?? {};
    return resolveViewConfig(reportConfig, viewOverride);
  }, [reportConfig]);

  /**
   * Serves paginated filter values for a sidebar dimension.
   * No search: fast path from the static _meta cache populated on report fetch.
   * With search: live customFilter GraphQL call (server-side search + cascade filtering).
   */
  const fetchFilterValues = useCallback(async (key, { page = 1, pageLength = 20, search = '', currentFilters = {} } = {}) => {
    const viewId = Object.entries(reportConfig?.views ?? {})
      .find(([, v]) => v.type !== 'drawer')?.[0]
      ?? Object.keys(useSmartDataStore.getState().views)[0];
    const controls = useSmartDataStore.getState().views[viewId]?.viewParams?._controls ?? {};
    const dateRange = resolveControlDateRange(controls);
    return fetchElbritFilterValues(rawApiConfigRef.current, key, { page, pageLength, search, currentFilters, dateRange });
  }, [reportConfig]);

  const handleSignal = useCallback((viewId, signal) => {
    const s = useSmartDataStore.getState();
    switch (signal.type) {
      case 'sort':
        s.setSortBy(viewId, signal.payload);
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
      case 'rowClick': {
        const handler = reportConfig?.views?.[viewId]?.event?.onRowClick;
        if (handler) {
          const controls = useSmartDataStore.getState().views[viewId]?.viewParams?._controls ?? {};
          handler(signal.payload.event, { openDrawer: openDrawerView, closeDrawer: closeDrawerView, controls });
        }
        break;
      }
    }
  }, [openDrawerView, closeDrawerView, reportConfig]);

  useEffect(() => {
    return () => {
      Object.values(runTimersRef.current).forEach(clearTimeout);
      Object.values(unsubsRef.current).forEach(unsub => unsub());
    };
  }, []);

  const registerViewActions = useCallback((viewId, actions) => {
    viewActionsRef.current[viewId] = actions;
  }, []);

  const unregisterViewActions = useCallback((viewId) => {
    delete viewActionsRef.current[viewId];
  }, []);

  const plasmicData = useMemo(() => {
    const views = {};
    for (const [viewId, view] of Object.entries(storeViews)) {
      if (!view.pagination) continue; // guard: view partially initialised or being torn down
      const perPage     = view.pagination.rows;
      const currentPage = Math.floor(view.pagination.first / perPage);
      const totalPages  = Math.ceil(view.totalRecords / perPage) || 1;
      const s           = () => useSmartDataStore.getState();

      views[viewId] = {
        ...buildViewDataState(view),
        actions: {
          column: {
            toggle: (field) => s().setHiddenColumns(viewId,
              (view.hiddenColumns ?? []).includes(field)
                ? (view.hiddenColumns ?? []).filter(f => f !== field)
                : [...(view.hiddenColumns ?? []), field]
            ),
            lock: () => viewActionsRef.current[viewId]?.lockFirstColumn?.(),
          },
          group: {
            reorder: (newOrder) => s().setViewParam(viewId, 'group_by', newOrder),
          },
          export: {
            excel: () => viewActionsRef.current[viewId]?.exportToExcel?.(),
          },
          display: {
            fullscreen: () => viewActionsRef.current[viewId]?.viewInFullscreen?.(),
          },
          page: {
            next:    () => s().setPage(viewId, Math.min((currentPage + 1) * perPage, (totalPages - 1) * perPage), perPage),
            prev:    () => s().setPage(viewId, Math.max((currentPage - 1) * perPage, 0), perPage),
            first:   () => s().setPage(viewId, 0, perPage),
            last:    () => s().setPage(viewId, (totalPages - 1) * perPage, perPage),
            goto:    (n) => s().setPage(viewId, Math.max(n - 1, 0) * perPage, perPage),
            setSize: (n) => s().setPage(viewId, 0, n),
          },
          drawer: {
            open:  (tabs) => openDrawerView(tabs),
            close: closeDrawerView,
          },
          sort: {
            set: (sort) => s().setSortBy(viewId, sort),
          },
        },
      };
    }
    return { views, fetchedAt: lastFetchedAt };
  }, [storeViews, lastFetchedAt, openDrawerView, closeDrawerView]);

  return (
    <SmartDataConfigContext.Provider value={effectiveConfig}>
      <SmartDataContext.Provider value={{
        providerDataSource, reportConfig,
        registerView, unregisterView,
        handleSignal, setViewParam,
        exportView, refresh,
        lastFetchedAt,
        registerPipelineWatcher, unregisterPipelineWatcher,
        fetchFilterValues,
        resolveView,
        openDrawerView, closeDrawerView,
        registerViewActions, unregisterViewActions,
      }}>
        <PlasmicDataProvider name="data" data={plasmicData}>
          {children}
        </PlasmicDataProvider>
        <SmartDrawer
          visible={drawerVisible}
          tabs={drawerTabs}
          activeId={drawerActiveId}
          onTabSelect={setDrawerActiveId}
          onHide={closeDrawerView}
        />
      </SmartDataContext.Provider>
    </SmartDataConfigContext.Provider>
  );
}

export function SmartDataProviderImpl(props) {
  return (
    <SmartDataErrorBoundary label="SmartDataProvider">
      <SmartDataProviderCore {...props} />
    </SmartDataErrorBoundary>
  );
}

/**
 * SmartDataProvider — Plasmic-facing wrapper.
 * Looks up `config` (a report name) from the Firestore `reports` collection,
 * deserializes it, then renders SmartDataProviderImpl.
 * Automatically prepends ReportControls when the report config has root-level controls.
 */
export function SmartDataProvider({ config, dataSource, overrides, children }) {
  const [reportConfig, setReportConfig] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    setLoading(true);
    loadReportConfig(config)
      .then(({ config: migratedConfig }) => { if (!cancelled) setReportConfig(migratedConfig); })
      .catch(() => { if (!cancelled) setReportConfig(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [config]);

  if (loading || !reportConfig) return null;

  const rootControls = reportConfig.controls ?? [];
  const rootViewIds  = Object.entries(reportConfig.views ?? {})
    .filter(([, v]) => v.type !== 'drawer')
    .map(([id]) => id);

  return (
    <SmartDataProviderImpl reportConfig={reportConfig} dataSource={dataSource} overrides={overrides}>
      {rootControls.length > 0 && (
        <ReportControls controls={rootControls} viewIds={rootViewIds} />
      )}
      {children}
    </SmartDataProviderImpl>
  );
}

function SmartDrawer({ visible, tabs, activeId, onTabSelect, onHide }) {
  return (
    <Sidebar
      visible={visible}
      position="bottom"
      style={{ height: '100dvh' }}
      onHide={onHide}
      header={
        <DrawerTabBar tabs={tabs} activeId={activeId} onSelect={onTabSelect} />
      }
      blockScroll
      appendTo="self"
      className="smart-drawer-sidebar"
    >
      <div style={{ padding: 20 }}>
        {tabs.map(({ id, config: tabCfg = {}, error }) => (
          <div key={id} style={{ display: activeId === id ? 'block' : 'none' }}>
            {error
              ? (
                <div className="flex items-center gap-2 px-4 py-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-sm">
                  <i className="pi pi-exclamation-triangle flex-none" />
                  <span>{error}</span>
                </div>
              )
              : <SmartDataTable viewId={id} config={tabCfg.table ?? {}} />
            }
          </div>
        ))}
      </div>
    </Sidebar>
  );
}


function shallowEqualPipelineSlice(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.sortBy !== b.sortBy) return false;
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
