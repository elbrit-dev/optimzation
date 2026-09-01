'use client';

import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import { resolveConfig } from './smartDataTableConfig';
import { useSmartDataStore } from './useSmartDataStore';

export const SmartDataContext = createContext(null);

/** Provides the common tableConfig from SmartDataProvider to all SmartDataTable children. */
export const SmartDataConfigContext = createContext(resolveConfig());

/**
 * Returns { providerDataSource, registerView, unregisterView, handleSignal, setViewParam,
 *           exportView, refresh, lastFetchedAt, registerPipelineWatcher, unregisterPipelineWatcher,
 *           fetchFilterValues, fetchDrillDown }
 * from the nearest SmartDataProvider.
 *
 * fetchFilterValues(key, { page, pageLength, search, currentFilters })
 *   → Promise<{ items: Array<{ value, label, count }>, hasMore: boolean }>
 *   Paginated dropdown values for one dimension, for FilterSortSidebar. v2 views go to
 *   the reportFilterValues GraphQL query, v1 views to elbrit_sales_filter_api.
 *
 * fetchDrillDown(viewId, path, { page, signal })
 *   → Promise<{ rows, columns, hasNextPage, parentPath } | null>
 *   Fetches one node's children and records them on the view's `drillDown` slice.
 *   Returns null (without throwing) when the view is not a v2 drill-down view, when
 *   the fetch was aborted, or on error — errors are recorded on the node instead.
 */
export function useSmartDataContext() {
  const ctx = useContext(SmartDataContext);
  if (!ctx) throw new Error('useSmartDataContext must be used inside SmartDataProvider');
  return ctx;
}

/** Returns the common tableConfig set on SmartDataProvider (or defaults if none). */
export function useSmartDataConfig() {
  return useContext(SmartDataConfigContext);
}

/**
 * Returns the Zustand store owned by the nearest SmartDataProvider, falling back to the
 * module-level default for standalone SmartDataTable usage.
 *
 * Always resolve the store through this hook rather than importing `useSmartDataStore`
 * directly — view ids are only unique within a report config, so two providers on the
 * same page (e.g. Primary/Secondary tabs) would otherwise share view state.
 */
export function useSmartDataStoreApi() {
  return useContext(SmartDataContext)?.store ?? useSmartDataStore;
}

/** Subscribes to the provider-scoped store. Mirrors calling the store hook directly. */
export function useSmartDataSelector(selector) {
  return useStore(useSmartDataStoreApi(), selector);
}
