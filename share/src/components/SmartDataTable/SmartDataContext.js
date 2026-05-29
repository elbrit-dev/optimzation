'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_CONFIG } from './smartDataTableConfig';

export const SmartDataContext = createContext(null);

/** Provides the common tableConfig from SmartDataProvider to all SmartDataTable children. */
export const SmartDataConfigContext = createContext(DEFAULT_CONFIG);

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
