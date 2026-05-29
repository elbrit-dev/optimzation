'use client';

import { createContext, useCallback, useContext } from 'react';
import { useSmartDataStore } from './useSmartDataStore';

const SmartDataControlsContext = createContext(null);
const EMPTY_PARAMS = {};

/**
 * Provides `viewId` context to all descendant control widgets.
 * Multiple `SmartDataControls` instances with the same `viewId` share the same
 * Zustand view entry, so they stay in sync automatically.
 *
 * @param {{ viewId: string, children: React.ReactNode }} props
 */
export function SmartDataControls({ viewId, children }) {
  return (
    <SmartDataControlsContext.Provider value={viewId}>
      {children}
    </SmartDataControlsContext.Provider>
  );
}

/**
 * Hook for control panel widgets.
 *
 * Usage inside `<SmartDataControls>` — no viewId needed:
 *   const { viewParams, setViewParam } = useSmartDataControls();
 *
 * Usage outside `<SmartDataControls>` — pass viewId explicitly:
 *   const { viewParams, setViewParam } = useSmartDataControls('dept-hq');
 *
 * @param {string} [explicitViewId]
 * @returns {{ viewParams: object, setViewParam: (key: string, value: any) => void }}
 */
export function useSmartDataControls(explicitViewId) {
  const contextViewId = useContext(SmartDataControlsContext);
  const viewId = explicitViewId ?? contextViewId;
  if (!viewId) throw new Error('useSmartDataControls: provide a viewId or use inside <SmartDataControls>');

  const viewParams = useSmartDataStore(state => state.views[viewId]?.viewParams ?? EMPTY_PARAMS);

  const setViewParam = useCallback((key, value) => {
    useSmartDataStore.getState().setViewParam(viewId, key, value);
  }, [viewId]);

  return { viewParams, setViewParam };
}
