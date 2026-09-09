'use client';

import { DataProvider as PlasmicDataProvider } from '@plasmicapp/loader-nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataProvider from './DataProvider';
import AlphabetRail from './views/AlphabetRail';
import FilterSortPill from './views/FilterSortPill';
import ProductSearchBar from './views/ProductSearchBar';
import StaleDataBridge from './views/StaleDataBridge';
import SyncPill from './views/SyncPill';
import { LoadMoreBar, PageSizePill } from './views/ViewPaginator';
import { ViewSwitcher } from '../../../components/ViewSwitcher';
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

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

/**
 * Hold an object's identity steady while its contents are unchanged.
 *
 * Needed because DataProviderNew derives `variableOverrides` from the
 * `overrides` prop by identity, and re-runs the query whenever that identity
 * changes. A caller that builds `overrides` inline (Plasmic Studio does) hands
 * down a fresh object every render, which would loop: fetch -> state -> render
 * -> new object -> fetch. Non-serializable values fall through unstabilized.
 */
function useStableValue(value) {
  const ref = useRef({ signature: undefined, value });
  let signature;
  try {
    signature = JSON.stringify(value ?? null);
  } catch {
    return value;
  }
  if (signature !== ref.current.signature) {
    ref.current = { signature, value };
  }
  return ref.current.value;
}

// Breathing room around the slot content — the engine's header is shared with the
// original provider, so the variant adds its own spacing here instead of touching it.
const DEFAULT_CONTENT_PADDING = 'px-3 pt-3 pb-4 sm:px-4 sm:pt-4';
// Same reason for the header: the engine wraps it in px-2 (8px on mobile), which
// reads as cramped, so the variant insets its OWN header slots a little further.
const HEADER_SLOT_PADDING = 'px-1 sm:px-1.5';

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
  // Padding around the slot content (variant-only; the engine header is shared).
  contentClassName,
  // --- search bar (drives the provider's own multi-field searchTerm) ---
  showSearch = false,
  searchPlaceholder = 'Search product or brand…',
  showRecentSearches = true,
  recentSearchLimit = 5,
  recentSearchStorageKey,
  hideNativeFilterSort = false,
  // Compact control row: hides the engine's own header controls and renders
  // [⛭ sort pill] [⟳ short-date] … [Cards | Table] on one line, mobile-sized.
  // The pill opens the ORIGINAL Filter/Sort sidebar — only the button is
  // restyled. Defaults to on when the search bar is enabled.
  compactHeader,
  // --- A–Z letter rail (provider-owned; jumps to [data-letter] sections in the slot) ---
  showLetterRail = false,
  letterRailField = '',
  // Views (by id) where the rail is shown — the table has no letter sections,
  // so it defaults to the cards view only. Empty array = every view.
  letterRailViews = ['cards'],
  // --- fetch size ("pagination"): the page-size control drives the query's own
  // limit variable, so the SERVER returns fewer rows — not a client-side slice.
  // Off by default; requires the query body to declare the variable, e.g.
  // `query Doctors($first: Int = 10) { Leads(first: $first, ...) }`.
  enableServerPaging = false,
  pageSize = 25,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  // GraphQL variable that carries the limit. `first` for the Relay-style ERP
  // queries; name it differently for a query that uses e.g. `limit`.
  pageSizeVariable = 'first',
  showPageSizeControl = true,
  showLoadMore = true,
  // 'header' = size pill on the control row, 'bottom' = Load more under the
  // content, 'both' = each in its place.
  paginatorPosition = 'both',
  // --- cache: paint last session's data instantly, refresh behind it.
  // Variant-only (StaleDataBridge): the underlying DataProvider's loading flow
  // is untouched — this only re-provides the published context while it loads. ---
  staleWhileRevalidate = false,
  cacheKey,
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

  // --- fetch size -----------------------------------------------------------
  // Normalized once so a Studio-typed string ("25") or a stray 0 can't reach
  // the query as a bad variable.
  const initialFetchSize = useMemo(() => {
    const n = Number(pageSize);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 25;
  }, [pageSize]);

  const [fetchSize, setFetchSizeState] = useState(initialFetchSize);

  // Follow the prop when it changes (Studio edit, or a page variable driving it).
  useEffect(() => { setFetchSizeState(initialFetchSize); }, [initialFetchSize]);

  const setFetchSize = useCallback((next) => {
    const n = Number(next);
    if (!Number.isFinite(n) || n <= 0) return;
    setFetchSizeState(Math.floor(n));
  }, []);

  const loadMore = useCallback(() => {
    setFetchSizeState((current) => current + initialFetchSize);
  }, [initialFetchSize]);

  const showPaginatorInHeader = enableServerPaging && showPageSizeControl
    && (paginatorPosition === 'header' || paginatorPosition === 'both');
  const showPaginatorAtBottom = enableServerPaging && showLoadMore
    && (paginatorPosition === 'bottom' || paginatorPosition === 'both');

  // Stabilized for the same reason as the overrides object: `paging` rides on
  // viewCtx / $ctx.view, so a fresh array literal from Studio would give the
  // whole view context a new identity on every render.
  const stablePageSizeOptions = useStableValue(pageSizeOptions);

  const paging = useMemo(() => ({
    enabled: enableServerPaging === true,
    fetchSize,
    setFetchSize,
    loadMore,
    loadMoreStep: initialFetchSize,
    pageSizeOptions: stablePageSizeOptions,
    pageSizeVariable,
    showLoadMore: showPaginatorAtBottom,
  }), [
    enableServerPaging, fetchSize, setFetchSize, loadMore, initialFetchSize,
    stablePageSizeOptions, pageSizeVariable, showPaginatorAtBottom,
  ]);

  const viewCtx = useMemo(() => ({
    views: normalizedViews,
    activeView: resolvedActiveView,
    setActiveView,
    isActive: (id) => id === resolvedActiveView,
    keepInactiveMounted,
    paging,
  }), [normalizedViews, resolvedActiveView, setActiveView, keepInactiveMounted, paging]);

  // Each header element is memoized so `__internal` keeps a stable identity between
  // renders — inline JSX would change every time and defeat the memo below.
  const switcher = useMemo(() => (showViewSwitcher ? (
    <ViewSwitcher
      views={normalizedViews}
      value={resolvedActiveView}
      onChange={setActiveView}
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

  const headerTop = useMemo(() => (showSearch ? (
    <div className={HEADER_SLOT_PADDING}>
      <ProductSearchBar
        placeholder={searchPlaceholder}
        showRecents={showRecentSearches}
        recentLimit={recentSearchLimit}
        storageKey={recentSearchStorageKey || undefined}
      />
    </div>
  ) : null), [showSearch, searchPlaceholder, showRecentSearches, recentSearchLimit, recentSearchStorageKey]);

  // Compact mode replaces the engine's controls with the variant's own pills —
  // same behaviors underneath (the sort pill opens the native Filter/Sort sidebar,
  // the refresh pill calls handleSync). Auto-enabled with the search bar.
  const compact = compactHeader ?? showSearch;

  // In compact mode everything lives in the LEFT slot as one justify-between row,
  // so mobile keeps a single line (the engine's own header row stacks left/right
  // slots vertically below the sm breakpoint).
  const headerLeft = useMemo(() => {
    if (!compact) return null;
    return (
      // flex-nowrap + min-w-0 keeps this a single row; the gaps guarantee the
      // pills can never sit flush against each other.
      <div className={`flex w-full min-w-0 flex-nowrap items-center justify-between gap-2 sm:gap-3 ${HEADER_SLOT_PADDING}`}>
        <div className="flex min-w-0 flex-nowrap items-center gap-1.5 sm:gap-2">
          <FilterSortPill />
          <SyncPill />
          {showPaginatorInHeader ? <PageSizePill /> : null}
        </div>
        {inHeader ? switcher : null}
      </div>
    );
  }, [compact, inHeader, switcher, showPaginatorInHeader]);

  // Non-compact: the engine renders its own controls, so the size pill joins the
  // switcher on the right rather than duplicating a control row.
  const headerRight = useMemo(() => {
    if (compact) return null;
    const pill = showPaginatorInHeader ? <PageSizePill /> : null;
    if (!pill) return inHeader ? switcher : null;
    return (
      <div className="flex shrink-0 flex-nowrap items-center gap-1.5 sm:gap-2">
        {pill}
        {inHeader ? switcher : null}
      </div>
    );
  }, [compact, inHeader, switcher, showPaginatorInHeader]);

  const internalForProvider = useMemo(() => {
    const next = { ...__internal };
    if (headerTop || headerLeft || headerRight) {
      next.headerSlots = { top: headerTop, left: headerLeft, right: headerRight };
    }
    // Hide the engine's controls entirely in compact mode (the pills replace them).
    if (compact) next.showProviderHeader = false;
    if (hideNativeFilterSort) next.hideNativeFilterSort = true;
    return next;
  }, [__internal, headerTop, headerLeft, headerRight, compact, hideNativeFilterSort]);

  // The whole server-paging trick: `overrides.variables` already flows through
  // DataProvider into the GraphQL request (DataProviderNew builds
  // variableOverrides from it), so merging the chosen size in limits the fetch
  // with no engine change. Merged INTO any existing variables so a caller's own
  // overrides (or a token) survive, and stabilized by content — see
  // useStableValue for why identity matters here.
  const overridesWithPaging = useMemo(() => {
    if (!enableServerPaging || !pageSizeVariable) return overrides;
    return {
      ...(overrides && typeof overrides === 'object' ? overrides : {}),
      variables: {
        ...(overrides?.variables ?? {}),
        [pageSizeVariable]: fetchSize,
      },
    };
  }, [enableServerPaging, pageSizeVariable, overrides, fetchSize]);
  const stableOverrides = useStableValue(overridesWithPaging);

  return (
    <DataProvider
      presetDataSource={presetDataSource}
      presetName={presetName}
      offlineData={offlineData}
      onDataChange={onDataChange}
      onError={onError}
      overrides={enableServerPaging ? stableOverrides : overrides}
      __internal={internalForProvider}
    >
      <DataViewContext.Provider value={viewCtx}>
        <PlasmicDataProvider name="view" data={viewCtx}>
          {(() => {
            const content = (
              <div className={className ?? 'flex flex-col min-h-0 flex-1'}>
                {viewSwitcherPosition === 'top' ? standaloneSwitcher : null}
                {showLetterRail ? (
                  <div className={`flex min-h-0 flex-1 gap-1 ${contentClassName ?? DEFAULT_CONTENT_PADDING}`}>
                    <div className="min-w-0 flex-1">{children}</div>
                    {/* Rail only on the views that have letter sections (cards).
                        The wrapper row stays constant so toggling views never
                        remounts the slot content. */}
                    {!Array.isArray(letterRailViews) || letterRailViews.length === 0 || letterRailViews.includes(resolvedActiveView) ? (
                      <AlphabetRail field={letterRailField || undefined} />
                    ) : null}
                  </div>
                ) : (
                  <div className={contentClassName ?? DEFAULT_CONTENT_PADDING}>{children}</div>
                )}
                {showPaginatorAtBottom ? <LoadMoreBar /> : null}
                {viewSwitcherPosition === 'bottom' ? standaloneSwitcher : null}
              </div>
            );
            if (!staleWhileRevalidate) return content;
            const snapshotKey = cacheKey
              || (presetDataSource ? `preset:${presetDataSource}:${presetName ?? ''}` : 'dataprovider-views:default');
            return <StaleDataBridge cacheKey={snapshotKey}>{content}</StaleDataBridge>;
          })()}
        </PlasmicDataProvider>
      </DataViewContext.Provider>
    </DataProvider>
  );
}
