'use client';

import { createContext, useContext } from 'react';

export const DataViewContext = createContext(null);

/**
 * View/tab state published by DataProviderViews.
 * Returns null outside that provider so DataView can degrade to always-visible
 * (a DataView dropped under the plain DataProvider still renders its children).
 * Shape: { views, activeView, setActiveView, isActive, keepInactiveMounted }.
 */
export function useDataViews() {
  return useContext(DataViewContext);
}
