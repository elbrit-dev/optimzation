'use client';

import { DataProvider as PlasmicDataProvider } from '@plasmicapp/loader-nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataProvider from './DataProvider';
import AlphabetRail from './views/AlphabetRail';
import ProductSearchBar from './views/ProductSearchBar';
import SortSheet from './views/SortSheet';
import { DataViewContext } from '../contexts/ViewContext';

const DEFAULT_VIEWS = [
  { id: 'cards', label: 'Cards', icon: 'pi pi-th-large' },
  { id: 'table', label: 'Table', icon: 'pi pi-bars' },
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

/**
 * Segmented Cards/Table control. Sized to 2rem to line up with the header's
 * other controls (Filter / Sort, sync SplitButton) which all set height: '2rem'.
 */
function ViewSwitcher({ views, activeView, onSelect, className }) {
  if (views.length < 2) return null;
  return (
    <div
      role="tablist"
      aria-label="View"
      className={`inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 p-0.5 ${className ?? ''}`}
      style={{ height: '2rem' }}
    >
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
            className={`inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded px-2.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-white text-slate-800 shadow-sm ring-1 ring-gray-200'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {view.icon ? <i className={`${view.icon} text-xs`} aria-hidden="true" /> : null}
            {view.label}
          </button>
        );
      })}
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
  viewSwitcherPosition = 'header',
  viewSwitcherAlign = 'right',
  viewSwitcherClassName,
  keepInactiveMounted = true,
  className,
  // --- search bar (drives the provider's own multi-field searchTerm) ---
  showSearch = false,
  searchPlaceholder = 'Search product or brand…',
  showRecentSearches = true,
  recentSearchLimit = 5,
  recentSearchStorageKey,
  // --- sort sheet (named presets instead of the built-in Filter / Sort sidebar) ---
  sortOptions,
  sortSheetTitle = 'Sort products',
  hideNativeFilterSort = false,
  // --- A–Z letter rail (provider-owned; jumps to [data-letter] sections in the slot) ---
  showLetterRail = false,
  letterRailField = '',
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

  // Each header element is memoized so `__internal` keeps a stable identity between
  // renders — inline JSX would change every time and defeat the memo below.
  const switcher = useMemo(() => (showViewSwitcher ? (
    <ViewSwitcher
      views={normalizedViews}
      activeView={resolvedActiveView}
      onSelect={setActiveView}
      className={viewSwitcherClassName}
    />
  ) : null), [showViewSwitcher, normalizedViews, resolvedActiveView, setActiveView, viewSwitcherClassName]);

  // 'header' puts it on the provider's own control row, right of Filter / Sort and
  // the sync button. 'top'/'bottom' give it a standalone row inside the slot instead.
  const inHeader = viewSwitcherPosition === 'header';
  const standaloneSwitcher = switcher && !inHeader ? (
    <div className={`flex ${ALIGN_CLASS[viewSwitcherAlign] ?? ALIGN_CLASS.right} px-2 py-2 sm:px-3`}>
      {switcher}
    </div>
  ) : null;

  const hasSortOptions = Array.isArray(sortOptions) && sortOptions.length > 0;

  // These render inside DataProviderNew's header, which sits within
  // TableOperationsContext.Provider — so useTableOperations() resolves for them.
  const sortSheet = useMemo(() => (hasSortOptions ? (
    <SortSheet options={sortOptions} title={sortSheetTitle} />
  ) : null), [hasSortOptions, sortOptions, sortSheetTitle]);

  const headerTop = useMemo(() => (showSearch ? (
    <ProductSearchBar
      placeholder={searchPlaceholder}
      showRecents={showRecentSearches}
      recentLimit={recentSearchLimit}
      storageKey={recentSearchStorageKey || undefined}
    />
  ) : null), [showSearch, searchPlaceholder, showRecentSearches, recentSearchLimit, recentSearchStorageKey]);

  // Sort pill goes left of the sync button; the view switcher stays hard right.
  const headerRight = inHeader ? switcher : null;

  const internalForProvider = useMemo(() => {
    const next = { ...__internal };
    if (headerTop || sortSheet || headerRight) {
      next.headerSlots = { top: headerTop, left: sortSheet, right: headerRight };
    }
    // Only suppress the built-in button when this provider offers a replacement.
    if (hideNativeFilterSort || hasSortOptions) next.hideNativeFilterSort = true;
    return next;
  }, [__internal, headerTop, sortSheet, headerRight, hideNativeFilterSort, hasSortOptions]);

  return (
    <DataProvider
      presetDataSource={presetDataSource}
      presetName={presetName}
      offlineData={offlineData}
      onDataChange={onDataChange}
      onError={onError}
      overrides={overrides}
      __internal={internalForProvider}
    >
      <DataViewContext.Provider value={viewCtx}>
        <PlasmicDataProvider name="view" data={viewCtx}>
          <div className={className ?? 'flex flex-col min-h-0 flex-1'}>
            {viewSwitcherPosition === 'top' ? standaloneSwitcher : null}
            {showLetterRail ? (
              <div className="flex min-h-0 flex-1 gap-1">
                <div className="min-w-0 flex-1">{children}</div>
                <AlphabetRail field={letterRailField || undefined} />
              </div>
            ) : (
              children
            )}
            {viewSwitcherPosition === 'bottom' ? standaloneSwitcher : null}
          </div>
        </PlasmicDataProvider>
      </DataViewContext.Provider>
    </DataProvider>
  );
}
