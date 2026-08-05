'use client';

import { DataProvider as PlasmicDataProvider } from '@plasmicapp/loader-nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataProvider from './DataProvider';
import { DataViewContext } from '../contexts/ViewContext';

const DEFAULT_VIEWS = [
  { id: 'cards', label: 'Cards', icon: 'pi pi-th-large' },
  { id: 'table', label: 'Table', icon: 'pi pi-table' },
];

/** Accepts ['Cards', 'Table'] or [{ id, label, icon }] and returns a normalized, de-duped list. */
function normalizeViews(views) {
  const list = Array.isArray(views) ? views : [];
  const seen = new Set();
  const out = [];
  list.forEach((entry, index) => {
    if (entry == null) return;
    const raw = typeof entry === 'string' ? { id: entry, label: entry } : entry;
    const id = String(raw.id ?? raw.viewId ?? raw.label ?? `view-${index}`).trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, label: String(raw.label ?? id), icon: raw.icon ?? null });
  });
  return out.length > 0 ? out : DEFAULT_VIEWS;
}

const ALIGN_CLASS = { left: 'justify-start', center: 'justify-center', right: 'justify-end' };

function ViewSwitcher({ views, activeView, onSelect, align, className }) {
  if (views.length < 2) return null;
  return (
    <div className={`flex ${ALIGN_CLASS[align] ?? ALIGN_CLASS.right} px-2 py-2 sm:px-3 ${className ?? ''}`}>
      <div role="tablist" aria-label="View" className="inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1">
        {views.map((view) => {
          const active = view.id === activeView;
          return (
            <button
              key={view.id}
              type="button"
              role="tab"
              id={`dataview-tab-${view.id}`}
              aria-selected={active}
              aria-controls={`dataview-panel-${view.id}`}
              onClick={() => onSelect(view.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {view.icon ? <i className={`${view.icon} text-xs`} aria-hidden="true" /> : null}
              {view.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * DataProvider variant that turns its single children slot into tabbed views.
 *
 * Same data engine as <DataProvider> (preset resolution -> DataProviderNew): one
 * fetch, one filter/sort state, shared by every view. Children are <DataView
 * viewId="..."> blocks; the provider owns which one is showing. The view layouts
 * themselves are built in Plasmic Studio against $ctx.data.
 *
 * Studio bindings: $ctx.view.activeView / $ctx.view.views, plus the usual $ctx.data.
 */
export default function DataProviderViews({
  views,
  defaultView,
  activeView: activeViewProp,
  onViewChange,
  showViewSwitcher = true,
  viewSwitcherPosition = 'top',
  viewSwitcherAlign = 'right',
  viewSwitcherClassName,
  keepInactiveMounted = true,
  className,
  // --- passthrough to DataProvider ---
  presetDataSource,
  presetName,
  offlineData,
  onDataChange,
  onError,
  overrides,
  __internal = {},
  children,
}) {
  const normalizedViews = useMemo(() => normalizeViews(views), [views]);
  const fallbackView = useMemo(() => {
    const wanted = defaultView != null ? String(defaultView) : null;
    if (wanted && normalizedViews.some((v) => v.id === wanted)) return wanted;
    return normalizedViews[0].id;
  }, [defaultView, normalizedViews]);

  const [internalView, setInternalView] = useState(fallbackView);

  // Controlled when activeView is supplied (Plasmic writable state), else internal.
  const isControlled = activeViewProp != null && activeViewProp !== '';
  const activeView = isControlled ? String(activeViewProp) : internalView;

  // Keep the internal selection valid when the views list changes under it.
  useEffect(() => {
    if (isControlled) return;
    setInternalView((current) =>
      normalizedViews.some((v) => v.id === current) ? current : fallbackView,
    );
  }, [isControlled, normalizedViews, fallbackView]);

  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

  const setActiveView = useCallback((nextId) => {
    const id = String(nextId);
    if (!isControlled) setInternalView(id);
    onViewChangeRef.current?.(id);
  }, [isControlled]);

  // Resolve against the list so an unknown controlled value still paints something.
  const resolvedActiveView = normalizedViews.some((v) => v.id === activeView)
    ? activeView
    : fallbackView;

  const viewCtx = useMemo(() => ({
    views: normalizedViews,
    activeView: resolvedActiveView,
    setActiveView,
    isActive: (id) => id === resolvedActiveView,
    keepInactiveMounted,
  }), [normalizedViews, resolvedActiveView, setActiveView, keepInactiveMounted]);

  const switcher = showViewSwitcher ? (
    <ViewSwitcher
      views={normalizedViews}
      activeView={resolvedActiveView}
      onSelect={setActiveView}
      align={viewSwitcherAlign}
      className={viewSwitcherClassName}
    />
  ) : null;

  return (
    <DataProvider
      presetDataSource={presetDataSource}
      presetName={presetName}
      offlineData={offlineData}
      onDataChange={onDataChange}
      onError={onError}
      overrides={overrides}
      __internal={__internal}
    >
      <DataViewContext.Provider value={viewCtx}>
        <PlasmicDataProvider name="view" data={viewCtx}>
          <div className={className ?? 'flex flex-col min-h-0 flex-1'}>
            {viewSwitcherPosition === 'top' ? switcher : null}
            {children}
            {viewSwitcherPosition === 'bottom' ? switcher : null}
          </div>
        </PlasmicDataProvider>
      </DataViewContext.Provider>
    </DataProvider>
  );
}
