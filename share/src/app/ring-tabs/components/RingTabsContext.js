'use client';

import { createContext, useContext } from 'react';

export const RingTabsContext = createContext(null);

/**
 * Tab state published by RingTabs. Null outside it, so a RingTabPanel dropped
 * anywhere else degrades to always-visible rather than vanishing.
 * Shape: { tabs, activeTab, setActiveTab, isActive, keepInactiveMounted, idPrefix }.
 */
export function useRingTabs() {
  return useContext(RingTabsContext);
}
