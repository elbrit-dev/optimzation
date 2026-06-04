import { useSmartDataStore } from '@/components/SmartDataTable/useSmartDataStore';

/**
 * Returns a fresh store instance with no views registered.
 * Call between tests to prevent state leakage.
 */
export function createFreshStore() {
  useSmartDataStore.setState({ views: {} });
  return useSmartDataStore;
}

/**
 * Register a view and return the store for chaining.
 */
export function storeWithView(viewId = 'test', defaultPageSize = 25) {
  const store = createFreshStore();
  store.getState().registerView(viewId, defaultPageSize);
  return store;
}

/**
 * Returns the state slice for a specific view.
 */
export function getView(store, viewId = 'test') {
  return store.getState().views[viewId];
}
