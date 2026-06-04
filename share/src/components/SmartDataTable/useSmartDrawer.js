'use client';

import { useSmartDataContext } from './SmartDataContext';

/**
 * Returns { openDrawer, closeDrawer } for opening/closing drawer views from
 * any component inside a SmartDataProvider tree.
 *
 * openDrawer(viewId, paramMap, rowData)
 *   viewId   — the drawer view's id (type: 'drawer' in reportConfig.views)
 *   paramMap — { viewParamKey: rowFieldName } mapping (same as table.drawer.params)
 *   rowData  — the source row object whose field values populate the viewParams
 *
 * closeDrawer(viewId)
 */
export function useSmartDrawer() {
  const { openDrawerView, closeDrawerView } = useSmartDataContext();
  return { openDrawer: openDrawerView, closeDrawer: closeDrawerView };
}
