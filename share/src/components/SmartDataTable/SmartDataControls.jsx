'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useSmartDataStore } from './useSmartDataStore';
import { useSmartDataContext } from './SmartDataContext';

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

// ─── Group-by hook ────────────────────────────────────────────────────────────

function _parseGroupBy(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value).split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Resolves the current group_by for a view:
 *   - base value from resolvedApi.variables.group_by (from reportConfig)
 *   - overridden by viewParams.group_by when the user reorders
 *
 * Returns groups as a string[] regardless of whether the config uses a string,
 * comma-separated string, or array.
 *
 * setGroupBy(newOrder: string[]) writes the new order into viewParams, which
 * triggers the data source to re-fetch automatically.
 *
 * @param {string} viewId
 * @returns {{ groups: string[], setGroupBy: (newOrder: string[]) => void }}
 */
export function useGroupBy(viewId) {
  const { resolveView } = useSmartDataContext();
  const viewParams = useSmartDataStore(state => state.views[viewId]?.viewParams ?? EMPTY_PARAMS);

  const baseGroupBy = useMemo(() => {
    const { resolvedApi } = resolveView(viewId);
    // group_by can live either at variables.group_by or variables.filters.group_by
    return resolvedApi?.variables?.filters?.group_by ?? null;
  }, [resolveView, viewId]);

  const groups = useMemo(() => {
    const raw = viewParams.group_by !== undefined ? viewParams.group_by : baseGroupBy;
    return _parseGroupBy(raw);
  }, [viewParams.group_by, baseGroupBy]);

  const setGroupBy = useCallback((newOrder) => {
    useSmartDataStore.getState().setViewParam(viewId, 'group_by', newOrder);
  }, [viewId]);

  return { groups, setGroupBy };
}
