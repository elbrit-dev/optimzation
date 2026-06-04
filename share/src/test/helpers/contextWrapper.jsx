import React from 'react';
import { render } from '@testing-library/react';
import { SmartDataContext, SmartDataConfigContext } from '@/components/SmartDataTable/SmartDataContext';
import { resolveConfig } from '@/components/SmartDataTable/smartDataTableConfig';

/**
 * Builds a minimal SmartDataContext value for component tests.
 * Pass overrides to customize specific methods.
 */
export function buildMockContext(overrides = {}) {
  return {
    providerDataSource: null,
    reportConfig: null,
    registerView:             vi.fn(),
    unregisterView:           vi.fn(),
    handleSignal:             vi.fn(),
    setViewParam:             vi.fn(),
    exportView:               vi.fn().mockResolvedValue([]),
    refresh:                  vi.fn(),
    lastFetchedAt:            null,
    registerPipelineWatcher:  vi.fn(),
    unregisterPipelineWatcher: vi.fn(),
    fetchFilterValues:        vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    resolveView:              vi.fn().mockReturnValue({ resolvedTable: {}, resolvedControls: null, resolvedApi: {} }),
    openDrawerView:           vi.fn(),
    closeDrawerView:          vi.fn(),
    ...overrides,
  };
}

/**
 * Renders a component wrapped in the SmartDataContext providers required by SmartDataTable.
 */
export function renderWithContext(ui, { contextValue = {}, config = {}, ...options } = {}) {
  const ctx = buildMockContext(contextValue);
  const mergedConfig = { ...resolveConfig(), ...config };

  function Wrapper({ children }) {
    return (
      <SmartDataConfigContext.Provider value={mergedConfig}>
        <SmartDataContext.Provider value={ctx}>
          {children}
        </SmartDataContext.Provider>
      </SmartDataConfigContext.Provider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...options }), ctx };
}
