'use client';

import { useDataViews } from '../contexts/ViewContext';

/**
 * One tab's worth of content inside the single DataProviderViews slot.
 *
 * Layout-transparent by default (`display: contents`) so it does not break the
 * flex/grid chain a DataTable needs for its height — pass className/style to
 * make it a real box.
 */
export default function DataView({ viewId, children, keepMounted, className, style }) {
  const ctx = useDataViews();

  // No views provider above (or no id set) — nothing to switch on, just render.
  if (!ctx || !viewId) {
    return <div className={className} style={className || style ? style : { display: 'contents' }}>{children}</div>;
  }

  const active = ctx.isActive(viewId);
  const shouldKeepMounted = keepMounted ?? ctx.keepInactiveMounted;

  // Unmounting drops the child's own state (table scroll, expanded rows), so the
  // default is to keep it mounted and hidden.
  if (!active && !shouldKeepMounted) return null;

  const resolvedStyle = active
    ? (className || style ? style : { display: 'contents' })
    : { ...(style || {}), display: 'none' };

  return (
    <div
      className={className}
      style={resolvedStyle}
      role="tabpanel"
      id={`dataview-panel-${viewId}`}
      aria-labelledby={`dataview-tab-${viewId}`}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}
