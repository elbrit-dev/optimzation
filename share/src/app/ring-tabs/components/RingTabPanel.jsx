'use client';

import { cx } from '@/design-system';
import { useRingTabs } from './RingTabsContext';

/**
 * One tab's page inside the RingTabs slot. Shows its children only while its
 * tabId is the active tab.
 *
 * Kept mounted and hidden by default, like DataView: unmounting drops the
 * page's own state — a half-filled form, a scroll position, an expanded row —
 * every time the rep glances at another tab. Set keepMounted={false} (or the
 * parent's keepInactiveMounted) for a page that should refetch on return.
 *
 * A real box, not `display: contents`: a tabpanel role on a contents element
 * is dropped from the accessibility tree in some browsers, and a page is a
 * block anyway. Pass className to lay it out.
 */
export default function RingTabPanel({ tabId, keepMounted, className, style, children }) {
  const ctx = useRingTabs();

  // No RingTabs above (or no id yet, mid-edit in Studio) — nothing to switch on.
  if (!ctx || tabId == null || tabId === '') {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  const id = String(tabId);
  const active = ctx.isActive(id);
  const shouldKeepMounted = keepMounted ?? ctx.keepInactiveMounted;
  if (!active && !shouldKeepMounted) return null;

  return (
    <div
      role="tabpanel"
      id={`${ctx.idPrefix}-panel-${id}`}
      aria-labelledby={`${ctx.idPrefix}-tab-${id}`}
      hidden={!active}
      className={cx('min-w-0', className)}
      style={style}
    >
      {children}
    </div>
  );
}
