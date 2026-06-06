'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataProvider as PlasmicDataProvider } from '@plasmicapp/loader-nextjs';
import { SmartDataContext, SmartDataConfigContext } from './SmartDataContext';
import { useSmartDataStore } from './useSmartDataStore';
import { graphqlQueryReportDataSource, graphqlFetchFilterValues } from './reportSource.jsx';
import { buildViewDataState } from './viewContextHelpers';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { refreshGlobalTokenRows } from '@/app/graphql-playground/constants';
import { Sidebar } from 'primereact/sidebar';
import { SmartDataTable } from './SmartDataTable';
import { DrawerTabBar } from './DrawerTabBar';
import { ReportControls } from '@/app/report-table/components/ReportControls';

export function deserializeReportConfig(jsString) {
  if (!jsString?.trim()) return null;
  try {
    const code = jsString.trim().replace(/;\s*$/, '').trim();
    const result = new Function('return (' + code + ')')();
    if (result === null || typeof result !== 'object' || Array.isArray(result)) return null;
    return result;
  } catch {
    return null;
  }
}

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
export function SmartDataProviderImpl({ dataSource: providerDataSource, reportConfig: rawReportConfig, config: commonConfig, overrides, children }) {
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

  const unsubsRef            = useRef({});
  const viewDataSources      = useRef({});
  const viewActionsRef       = useRef({});
  const pipelineWatchersRef  = useRef({});
  const pendingDrawerConfigRef = useRef({});
  // Debounce timers: defers the initial fetch by one task so ReportControls can apply
  // its defaults (dateRange, breakdown, etc.) before the first GQL call fires.
  const runTimersRef = useRef({});

  // Cache of _meta.meta_filter_values from the most recent fetch.
  const filterValuesCacheRef = useRef({});
  // Raw API config stored so fetchFilterValues can call the customFilter API on search.
  const rawApiConfigRef = useRef(null);
  // Per-view page cache: viewId → Map<cacheKey, fetchedData>. Keyed by "page:limit".
  const pageCacheRef  = useRef({});
  // Tracks the last filters+sort+viewParams basis per view to detect invalidation.
  const cacheBasisRef = useRef({});

  useEffect(() => {
    if (reportConfig?.api?.urlKey) refreshGlobalTokenRows();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportConfig?.api?.urlKey]);

  const runDataSource = useCallback(async (viewId) => {
    const state = useSmartDataStore.getState();
    const view  = state.views[viewId];
    if (!view) return;

    const ds = viewDataSources.current[viewId] ?? providerDataSource;
    if (!ds) return;

    // Invalidate page cache when filters/sort/viewParams change (not on page navigation).
    const basis = _getCacheBasis(view);
    if (cacheBasisRef.current[viewId] !== basis) {
      pageCacheRef.current[viewId] = new Map();
      cacheBasisRef.current[viewId] = basis;
    }

    state._setLoading(viewId, true);

    try {
      const result = await Promise.resolve(
        ds({
          filters:       view.filters,
          sortBy:        view.sortBy,
          pagination:    view.pagination,
          viewParams:    view.viewParams,
          viewId,
          _pageCache:    pageCacheRef.current[viewId],
          _debugCapture: pipelineWatchersRef.current[viewId],
        })
      );
      if (result.filterValues) filterValuesCacheRef.current = result.filterValues;
      useSmartDataStore.getState()._setResult(viewId, result);
      setLastFetchedAt(new Date());
    } catch (err) {
      useSmartDataStore.getState()._setError(viewId, err?.message ?? 'DataSource error');
    }
  }, [providerDataSource]);

  const refresh = useCallback(async () => {
    const viewIds = Object.keys(viewDataSources.current);
    if (viewIds.length === 0) return;
    viewIds.forEach(id => {
      pageCacheRef.current[id] = new Map();
      delete cacheBasisRef.current[id];
    });
    await Promise.all(viewIds.map(id => runDataSource(id)));
  }, [runDataSource]);

  const registerView = useCallback((viewId, viewDataSource, viewName, defaultPageSize) => {
    let ds = viewDataSource;

    if (!ds && reportConfig?.api) {
      // Resolve per-view api config via deepMerge so each view can override payload fields
      const viewOverride = reportConfig.views?.[viewId] ?? {};
      const { resolvedApi } = resolveViewConfig(reportConfig, viewOverride);
      rawApiConfigRef.current = resolvedApi;
      ds = graphqlQueryReportDataSource(resolvedApi);
    }

    const pendingConfig = pendingDrawerConfigRef.current[viewId];
    if (pendingConfig && reportConfig?.api) {
      const viewOverride = reportConfig.views?.[viewId] ?? {};
      const { resolvedApi } = resolveViewConfig(reportConfig, deepMerge(viewOverride, pendingConfig));
      ds = graphqlQueryReportDataSource(resolvedApi);
      delete pendingDrawerConfigRef.current[viewId];
    }

    if (ds) viewDataSources.current[viewId] = ds;

    useSmartDataStore.getState().registerView(viewId, defaultPageSize);

    const scheduleRun = () => {
      clearTimeout(runTimersRef.current[viewId]);
      runTimersRef.current[viewId] = setTimeout(() => runDataSource(viewId), 0);
    };

    const unsub = useSmartDataStore.subscribe(
      state => {
        const v = state.views[viewId];
        if (!v) return null;
        return { filters: v.filters, sortBy: v.sortBy, pagination: v.pagination, viewParams: v.viewParams };
      },
      scheduleRun,
      { equalityFn: shallowEqualPipelineSlice, fireImmediately: true }
    );

    unsubsRef.current[viewId] = unsub;
  }, [runDataSource, reportConfig]);

  const unregisterView = useCallback((viewId) => {
    clearTimeout(runTimersRef.current[viewId]);
    delete runTimersRef.current[viewId];
    unsubsRef.current[viewId]?.();
    delete unsubsRef.current[viewId];
    delete viewDataSources.current[viewId];
    useSmartDataStore.getState().unregisterView(viewId);
  }, []);

  const setViewParam = useCallback((viewId, key, value) => {
    useSmartDataStore.getState().setViewParam(viewId, key, value);
  }, []);

  const openDrawerView = useCallback((tabs) => {
    const resolvedTabs = tabs.map(({ id, config = {} }) => {
      if (reportConfig?.views && !(id in reportConfig.views))
        return { id, config, error: `View "${id}" not found in report config` };
      const viewOverride = reportConfig?.views?.[id] ?? {};
      const merged = deepMerge(viewOverride, config);
      if (reportConfig?.api) {
        if (viewDataSources.current[id]) {
          const { resolvedApi } = resolveViewConfig(reportConfig, merged);
          viewDataSources.current[id] = graphqlQueryReportDataSource(resolvedApi);
          clearTimeout(runTimersRef.current[id]);
          runTimersRef.current[id] = setTimeout(() => runDataSource(id), 0);
        } else {
          pendingDrawerConfigRef.current[id] = merged;
        }
      }
      return { id, config: merged };
    });
    setDrawerTabs(resolvedTabs);
    setDrawerActiveId(resolvedTabs[0]?.id ?? null);
    setDrawerVisible(true);
  }, [reportConfig, runDataSource]);

  const closeDrawerView = useCallback(() => setDrawerVisible(false), []);

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
    if (!search) {
      const all   = filterValuesCacheRef.current[key] ?? [];
      const start = (page - 1) * pageLength;
      return {
        items:   all.slice(start, start + pageLength).map(item => ({ value: item.value, label: item.value })),
        hasMore: start + pageLength < all.length,
      };
    }
    return graphqlFetchFilterValues(rawApiConfigRef.current, key, { page, pageLength, search, currentFilters });
  }, []);

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
    firestoreService.loadReport(config)
      .then(str => { if (!cancelled) setReportConfig(deserializeReportConfig(str)); })
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

function _getCacheBasis(view) {
  return JSON.stringify({
    f: Object.fromEntries(Object.entries(view.filters).sort()),
    s: view.sortBy,
    v: view.viewParams,
  });
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
