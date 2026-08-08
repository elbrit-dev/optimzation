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
 *           fetchFilterValues }
 * from the nearest SmartDataProvider.
 *
 * fetchFilterValues(key, { page, pageLength, search }) → Promise<Array<{ value, label }>>
 *   Fetches paginated filter values from /api/method/report-filter for use in FilterSortSidebar.
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
