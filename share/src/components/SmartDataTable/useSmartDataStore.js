'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { deepMerge } from './varUtils';

const DEFAULT_VIEW_STATE = {
  filters: {},
  sortBy: {},
  pagination: { first: 0, rows: 50 },
  viewParams: {},      // consumer-owned config bag; changes trigger re-fetch like filters do
  rows: [],
  allRows: [],         // full pre-filter snapshot for FilterSortSidebar unique-value extraction
  filterDefs: [],      // filter field metadata from Report API (key, label, fieldtype, options)
  totalRecords: 0,
  columns:       null,  // populated by dataSource result; null = use prop
  columnGroups:  null,  // populated when meta.column_group === true; drives headerColumnGroup
  expandable:    false, // set to true by groupedReportDataSource
  // Lazily-fetched children, keyed by drillDownKey(row._path):
  //   { status: 'loading'|'ready'|'error', rows, columns, hasNextPage, page, error }
  // Kept flat here rather than spliced into rows._children: splicing means an
  // immutable update through every ancestor on each expand, which churns objects
  // the table has already memoised. Empty for views without drill-down.
  drillDown:     {},
  // Cache key of the request the fetched children belong to. Children survive a
  // re-render or a cache-hit restore of the same request, and are dropped the
  // moment it changes.
  drillDownSignature: null,
  // Resolved drill-down config for this view plus the full group_by, or null.
  // Distinct from `drillDown` above, which holds the fetched children.
  drillDownMeta: null,
  metaTotals:      {},  // column totals from API (field → raw value)
  metaTodayTotals: {},  // today-only totals from API (field → raw value)
  metaCol:         null, // full _meta column object from API
  hiddenColumns: [],    // field names hidden via eye toggle
  loading: false,
  loadingPhase: null,   // 'index' | 'data' while loading; null when idle
  loaded: false,        // true once a fetch has settled (result or error) at least once
  error: null,
};

/**
 * Creates an isolated store instance.
 *
 * Every SmartDataProvider owns one. View state is keyed by viewId, and view ids are
 * only unique *within* a report config — two reports commonly declare the same ids
 * (e.g. `main`, `drawer1`). Sharing one store across providers made those ids collide:
 * the second provider's registerView() no-opped onto the first provider's slot and both
 * fetch pipelines then wrote the same entry, so whichever response landed last painted
 * both tables. Per-instance stores make that collision structurally impossible.
 *
 * Use `useSmartDataStore` (the module-level default below) only for standalone
 * SmartDataTable usage with no provider, and in tests.
 */
export function createSmartDataStore() {
  return create(subscribeWithSelector((set, get) => ({
    views: {},

    registerView(viewId, defaultPageSize) {
      if (get().views[viewId]) return;
      set(state => ({
        views: {
          ...state.views,
          [viewId]: {
            ...DEFAULT_VIEW_STATE,
            ...(defaultPageSize != null && { pagination: { first: 0, rows: defaultPageSize } }),
          },
        },
      }));
    },

    unregisterView(viewId) {
      set(state => {
        const { [viewId]: _, ...rest } = state.views;
        return { views: rest };
      });
    },

    setFilter(viewId, field, value) {
      set(state => ({
        views: {
          ...state.views,
          [viewId]: {
            ...state.views[viewId],
            filters: { ...state.views[viewId].filters, [field]: value },
            pagination: { ...state.views[viewId].pagination, first: 0 },
          },
        },
      }));
    },

    clearFilter(viewId, field) {
      set(state => {
        const { [field]: _, ...rest } = state.views[viewId].filters;
        return {
          views: {
            ...state.views,
            [viewId]: {
              ...state.views[viewId],
              filters: rest,
              pagination: { ...state.views[viewId].pagination, first: 0 },
            },
          },
        };
      });
    },

    setSortBy(viewId, sortBy) {
      set(state => ({
        views: {
          ...state.views,
          [viewId]: {
            ...state.views[viewId],
            sortBy,
            pagination: { ...state.views[viewId].pagination, first: 0 },
          },
        },
      }));
    },

    applySort(viewId, field, direction) {
      set(state => {
        const cur = state.views[viewId];
        return {
          views: {
            ...state.views,
            [viewId]: {
              ...cur,
              sortBy: { ...cur.sortBy, [field]: direction },
              pagination: { ...cur.pagination, first: 0 },
            },
          },
        };
      });
    },

    removeSort(viewId, field) {
      set(state => {
        const { [field]: _, ...rest } = state.views[viewId].sortBy;
        return {
          views: {
            ...state.views,
            [viewId]: {
              ...state.views[viewId],
              sortBy: rest,
              pagination: { ...state.views[viewId].pagination, first: 0 },
            },
          },
        };
      });
    },

    setPage(viewId, first, rows) {
      set(state => ({
        views: {
          ...state.views,
          [viewId]: {
            ...state.views[viewId],
            pagination: { first, rows },
          },
        },
      }));
    },

    setHiddenColumns(viewId, fields) {
      set(state => ({
        views: {
          ...state.views,
          [viewId]: { ...state.views[viewId], hiddenColumns: fields },
        },
      }));
    },

    setViewParam(viewId, key, value) {
      set(state => {
        if (!state.views[viewId]) return state;
        return {
          views: {
            ...state.views,
            [viewId]: {
              ...state.views[viewId],
              viewParams: { ...state.views[viewId].viewParams, [key]: value },
              pagination: { ...state.views[viewId].pagination, first: 0 },
            },
          },
        };
      });
    },

    // Write a control's output into viewParams._controls[key], reset pagination.
    // Controls call this instead of setViewParam so control outputs are namespaced.
    setControlOutput(viewId, key, output) {
      set(state => {
        const view = state.views[viewId];
        if (!view) return state;
        const prev = view.viewParams?._controls ?? {};
        return {
          views: {
            ...state.views,
            [viewId]: {
              ...view,
              viewParams: { ...view.viewParams, _controls: { ...prev, [key]: output } },
              pagination: { ...view.pagination, first: 0 },
            },
          },
        };
      });
    },

    // Batch-set multiple viewParams in a single store update → single subscription fire → single fetch.
    setViewParams(viewId, params) {
      set(state => {
        if (!state.views[viewId]) return state;
        return {
          views: {
            ...state.views,
            [viewId]: {
              ...state.views[viewId],
              viewParams: { ...state.views[viewId].viewParams, ...params },
              pagination: { ...state.views[viewId].pagination, first: 0 },
            },
          },
        };
      });
    },

    _setResult(viewId, { rows, totalRecords, columns, columnGroups, expandable, allRows, filterDefs, labelColDefs, metaTotals, metaTodayTotals, metaCol, drillDownMeta }) {
      set(state => {
        if (!state.views[viewId]) return state; // view unregistered before fetch completed
        return { views: { ...state.views, [viewId]: {
            ...state.views[viewId],
            rows,
            totalRecords,
            loading: false,
            loadingPhase: null,
            loaded: true,
            error: null,
            ...(columns      !== undefined && { columns }),
            ...(columnGroups !== undefined && { columnGroups }),
            ...(allRows      !== undefined && { allRows }),
            ...(filterDefs   !== undefined && { filterDefs }),
            ...(labelColDefs !== undefined && { labelColDefs }),
            ...(metaTotals      !== undefined && { metaTotals }),
            ...(metaTodayTotals !== undefined && { metaTodayTotals }),
            ...(metaCol        !== undefined && { metaCol }),
            expandable: expandable ?? false,
            drillDownMeta: drillDownMeta ?? null,
          },
        } };
      });
    },

    /**
     * Forget one node entirely, so the next expand re-fetches it.
     *
     * Distinct from writing an error status: an aborted fetch is not a failure
     * the user should see, but the entry cannot be left at 'loading' either --
     * the table skips any node already present in this map, so a stuck entry is
     * a branch that spins forever with no way to retry.
     */
    _dropDrillDown(viewId, key) {
      set(state => {
        const view = state.views[viewId];
        if (!view || !(key in view.drillDown)) return state;
        const { [key]: _dropped, ...rest } = view.drillDown;
        return { views: { ...state.views, [viewId]: { ...view, drillDown: rest } } };
      });
    },

    /** Merge one node's drill-down state. */
    _setDrillDown(viewId, key, patch) {
      set(state => {
        const view = state.views[viewId];
        if (!view) return state;
        return { views: { ...state.views, [viewId]: {
          ...view,
          drillDown: { ...view.drillDown, [key]: { ...view.drillDown[key], ...patch } },
        } } };
      });
    },

    /**
     * Drop fetched children when the request they hang off has changed.
     *
     * Called before every _setResult, including the ones served from the client
     * cache. Comparing signatures rather than clearing unconditionally means
     * navigating away and back -- which restores the parent rows from cache --
     * keeps its expanded children instead of silently re-fetching them, while a
     * genuine change (date range, filter, sort) still drops them. Without this
     * the tree can show one request's children under another's parents.
     */
    _syncDrillDownSignature(viewId, signature) {
      set(state => {
        const view = state.views[viewId];
        if (!view || view.drillDownSignature === signature) return state;
        return { views: { ...state.views, [viewId]: {
          ...view, drillDown: {}, drillDownSignature: signature,
        } } };
      });
    },

    /** @param {'index'|'data'} [loadingPhase] — only used when loading is true */
    _setLoading(viewId, loading, loadingPhase = 'data') {
      set(state => {
        if (!state.views[viewId]) return state; // view unregistered before fetch completed
        return {
          views: {
            ...state.views,
            [viewId]: {
              ...state.views[viewId],
              loading,
              loadingPhase: loading ? loadingPhase : null,
            },
          },
        };
      });
    },

    _setError(viewId, error) {
      set(state => {
        if (!state.views[viewId]) return state; // view unregistered before fetch completed
        return {
          views: {
            ...state.views,
            [viewId]: { ...state.views[viewId], error, loading: false, loadingPhase: null, loaded: true },
          },
        };
      });
    },
  })));
}

/**
 * Default store — used by standalone SmartDataTable instances rendered without a
 * SmartDataProvider, and by tests. Provider-owned tables use the provider's own
 * instance, resolved via useSmartDataStoreApi().
 */
export const useSmartDataStore = createSmartDataStore();

// ─── Live instance registry ───────────────────────────────────────────────────
//
// Debug tooling (the /report-table Context panel) renders outside the provider tree
// and so cannot reach provider stores through context. Providers register here on
// mount. Not used for data flow — read through useSmartDataStoreApi() for that.

const liveStores        = new Set();
const registryListeners = new Set();

/** Adds a store to the registry. Returns an unregister function. */
export function registerStoreInstance(store) {
  liveStores.add(store);
  registryListeners.forEach(fn => fn());
  return () => {
    liveStores.delete(store);
    registryListeners.forEach(fn => fn());
  };
}

/** Notifies when a store is added or removed. Returns an unsubscribe function. */
export function subscribeToStoreRegistry(listener) {
  registryListeners.add(listener);
  return () => { registryListeners.delete(listener); };
}

export function getLiveStores() {
  return [...liveStores];
}
