'use client';

import { create } from 'zustand';

/**
 * Global store for pre-fetched Select options (formInputOverride type: Select).
 * Key format: "main|col" or "parentCol|col" (e.g. "items|item__name").
 * Persists across component re-renders and effect cancellations.
 */
export const useSelectOptionsCacheStore = create((set) => ({
  cache: {},
  setEntry: (key, arr) =>
    set((state) => ({
      cache: { ...state.cache, [key]: Array.isArray(arr) ? arr : [] },
    })),
  getCache: () => useSelectOptionsCacheStore.getState().cache,
}));
