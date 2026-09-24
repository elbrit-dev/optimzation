'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { DataProvider as PlasmicDataProvider } from '@plasmicapp/loader-nextjs';
import { RingTabBar, cx } from '@/design-system';
import { RingTabsContext } from './RingTabsContext';
import { normalizeRingTabs } from '../utils/normalizeRingTabs';

/* RingTabs — the task strip as page navigation. Each tile is a tab, and each
   tab's page is a RingTabPanel dropped in the one children slot.

   Same split as DataProviderViews / DataView, for the same reason: Plasmic
   has one slot per prop, not one per array entry, so the parent owns the
   selection and the config, and each child panel asks "am I the active one?"
   by tabId. That keeps the tab list a CONFIG (bindable, data-driven — the
   counts and rings come from a query) while the pages stay canvases you
   build in Studio.

   The bar itself is the design-system RingTabBar; nothing here draws a tile.

   Selection is controlled when `value` is set (the Plasmic writable state),
   else internal from `defaultValue`. An unknown or disabled id resolves to
   the first enabled tab rather than to nothing, so a stale bound value
   still paints a page.

   Studio bindings: $ctx.ringTabs.activeTab, .activeTabConfig, .tabs, and
   .setActiveTab(id) for a button inside one page that opens another. */

function firstEnabled(tabs) {
  return (tabs.find((t) => !t.disabled) ?? tabs[0])?.id ?? null;
}

function isSelectable(tabs, id) {
  return tabs.some((t) => t.id === id && !t.disabled);
}

export default function RingTabs({
  tabs,
  value,
  defaultValue,
  onChange,
  keepInactiveMounted = true,
  stickyBar = false,
  ariaLabel = 'Sections',
  className,
  barClassName,
  contentClassName,
  children,
}) {
  const normalizedTabs = useMemo(() => normalizeRingTabs(tabs), [tabs]);

  const fallbackTab = useMemo(() => {
    const wanted = defaultValue != null && defaultValue !== '' ? String(defaultValue) : null;
    if (wanted && isSelectable(normalizedTabs, wanted)) return wanted;
    return firstEnabled(normalizedTabs);
  }, [defaultValue, normalizedTabs]);

  const [internalTab, setInternalTab] = useState(fallbackTab);

  const isControlled = value != null && value !== '';
  const requested = isControlled ? String(value) : internalTab;

  // Keep the internal selection valid when the tab list changes under it.
  useEffect(() => {
    if (isControlled) return;
    setInternalTab((current) => (isSelectable(normalizedTabs, current) ? current : fallbackTab));
  }, [isControlled, normalizedTabs, fallbackTab]);

  const activeTab = isSelectable(normalizedTabs, requested) ? requested : fallbackTab;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const activeRef = useRef(activeTab);
  activeRef.current = activeTab;

  const setActiveTab = useCallback(
    (nextId) => {
      const id = String(nextId);
      // Re-pressing the open tab is not a change; firing onChange for it would
      // make a bound page variable "update" to the value it already has.
      if (id === activeRef.current) return;
      if (!isControlled) setInternalTab(id);
      onChangeRef.current?.(id);
    },
    [isControlled],
  );

  /* useId, not the tab id alone: two strips on one page would otherwise emit
     duplicate element ids and cross-wire their aria-controls. */
  const idPrefix = `ringtabs-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const ctx = useMemo(
    () => ({
      tabs: normalizedTabs,
      activeTab,
      activeTabConfig: normalizedTabs.find((t) => t.id === activeTab) ?? null,
      setActiveTab,
      isActive: (id) => id === activeTab,
      keepInactiveMounted,
      idPrefix,
    }),
    [normalizedTabs, activeTab, setActiveTab, keepInactiveMounted, idPrefix],
  );

  return (
    <RingTabsContext.Provider value={normalizedTabs.length ? ctx : null}>
      <PlasmicDataProvider name="ringTabs" data={ctx}>
        <div className={cx('flex min-w-0 flex-col', className)}>
          <div
            className={cx(
              /* Sticky needs a fill, or the page scrolls visibly through it. */
              stickyBar && 'sticky top-0 z-10 bg-surface',
              barClassName ?? 'px-4 pt-1.5 pb-0.5',
            )}
          >
            <RingTabBar
              items={normalizedTabs}
              value={activeTab}
              onChange={setActiveTab}
              ariaLabel={ariaLabel}
              idPrefix={idPrefix}
            />
          </div>
          <div className={cx('min-w-0', contentClassName)}>{children}</div>
        </div>
      </PlasmicDataProvider>
    </RingTabsContext.Provider>
  );
}
