import { create } from 'zustand';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';

/**
 * Saved queries store for GraphQL Playground v2
 * Manages: saved queries list, loading state, selected query
 */
export const useSavedQueriesStore = create((set, get) => ({
  // Queries list
  queries: [],
  setQueries: (queries) => set({ queries }),

  // Loading state
  loading: true,
  setLoading: (loading) => set({ loading }),

  // Selected query ID
  selectedQueryId: null,
  setSelectedQueryId: (id) => set({ selectedQueryId: id }),

  // Actions
  loadQueries: async () => {
    try {
      set({ loading: true });
      const queriesList = await firestoreService.getAllQueries();
      set({ queries: queriesList, loading: false });
    } catch (error) {
      console.error('Error loading queries:', error);
      set({ loading: false });
    }
  },

  deleteQuery: async (queryId) => {
    try {
      await firestoreService.deleteQuery(queryId);
      set((state) => ({
        queries: state.queries.filter((q) => q.id !== queryId),
        selectedQueryId: state.selectedQueryId === queryId ? null : state.selectedQueryId,
      }));
    } catch (error) {
      console.error('Error deleting query:', error);
      throw error;
    }
  },
}));
