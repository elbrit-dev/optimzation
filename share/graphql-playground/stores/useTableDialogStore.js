import { create } from 'zustand';

/**
 * Table dialog store
 * Manages: active tab, processed data
 * Note: transformerCode is now stored per-tab in useAppStore.tabData
 */
export const useTableDialogStore = create((set, get) => ({
  // Active tab index (for internal TableDialog tabs, not GraphiQL tabs)
  activeTab: 0,
  setActiveTab: (index) => set({ activeTab: index }),

  // Processed data
  processedData: null,
  setProcessedData: (data) => set({ processedData: data }),

  // Reset all state
  reset: () => {
    set({
      activeTab: 0,
      processedData: null,
    });
  },
}));

