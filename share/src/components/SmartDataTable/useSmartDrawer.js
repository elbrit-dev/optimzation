'use client';

import { useSmartDataContext } from './SmartDataContext';

/**
 * Returns { openDrawer, closeDrawer } for opening/closing drawer views from
 * any component inside a SmartDataProvider tree.
 *
 * openDrawer(viewId, configOverride?)
 *   viewId         — the drawer view's id (type: 'drawer' in reportConfig.views)
 *   configOverride — optional, reserved for future per-open config merging
 *
 * closeDrawer(viewId)
 */
export function useSmartDrawer() {
  const { openDrawerView, closeDrawerView } = useSmartDataContext();
  return { openDrawer: openDrawerView, closeDrawer: closeDrawerView };
}
