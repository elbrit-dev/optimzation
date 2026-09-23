'use client';

import { DataProvider as PlasmicDataProvider } from '@plasmicapp/loader-nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataProvider from './DataProvider';
import AlphabetRail from './views/AlphabetRail';
import FilterSortPill from './views/FilterSortPill';
import { InfiniteScrollLoader } from './views/InfiniteScroll';
import ProductSearchBar from './views/ProductSearchBar';
import ServerOpsBridge from './views/ServerOpsBridge';
import StaleDataBridge from './views/StaleDataBridge';
import SyncPill from './views/SyncPill';
import useServerQueryOps from '../hooks/useServerQueryOps';
import {
  DEFAULT_BOTTOM_GAP,
  LOAD_MORE_RESERVED_SPACE,
  LoadMoreBar,
  PageSizePill,
} from './views/ViewPaginator';
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

// Named insets for the slot. `none` hands spacing entirely to the Studio layout
// inside the slot, which is the right choice when the cards carry their own.
const CONTENT_PADDING_PRESETS = {
  default: DEFAULT_CONTENT_PADDING,
  tight: 'px-1 pt-1 pb-2 sm:px-1.5',
  none: '',
};
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
  // `contentPadding` picks a named inset; `contentClassName` overrides it
  // outright, including with '' for no classes at all.
  contentPadding = 'default',
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
  // Rows each subsequent batch adds. Defaults to pageSize, so the old
  // behaviour is unchanged — set it lower to load a big first screen and then
  // top up in small steps (e.g. pageSize 50, pageStep 25).
  pageStep,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  // GraphQL variable that carries the limit. `first` for the Relay-style ERP
  // queries; name it differently for a query that uses e.g. `limit`.
  pageSizeVariable = 'first',
  showPageSizeControl = true,
  showLoadMore = true,
  // 'header' = size pill on the control row, 'bottom' = Load more under the
  // content, 'both' = each in its place.
  paginatorPosition = 'both',
  // How the Load-more bar sits: 'sticky' keeps it visible while scrolling
  // (default), 'fixed' pins it to the viewport, 'static' scrolls away with the
  // content. Lifted placements clear the app's bottom navigation by
  // loadMoreBottomGap + the device's safe-area inset.
  loadMorePlacement = 'sticky',
  loadMoreBottomGap = DEFAULT_BOTTOM_GAP,
  loadMoreVariant = 'floating',
  // How the next batch is asked for: the button ('button', default), scrolling
  // to the end ('scroll'), or scrolling with the button still there as a manual
  // fallback ('both'). Scroll-loading shows skeleton rows while the batch is in
  // flight, so reaching the end of the list never looks like the end of the data.
  loadMoreMode = 'button',
  // How far ahead of the end of the list the next batch starts fetching.
  infiniteScrollMargin = '400px',
  // What asks for the next batch: nearing the end of the list ('near-end',
  // default) or simply having scrolled far enough ('distance').
  loadTrigger = 'near-end',
  // Minimum downward scrolling between batches, in pixels — how much reading a
  // reader has to do before the next fetch. 0 = half the visible height of
  // whatever is scrolling, which suits a phone and a desktop without picking a
  // number for each.
  scrollDistancePerBatch = 0,
  skeletonCount = 3,
  skeletonVariant = 'card',
  // Ceiling on batches loaded by scrolling alone, after which the reader taps
  // once to continue. Also the backstop if the list's container never grows.
  maxAutoBatches = 20,
  // --- server-side search / sort: cover the WHOLE dataset, not the loaded page.
  // Without these, searching a 45,000-row doctor list at `first: 25` searches
  // 25 rows. With them the term and the sort become query variables and the ERP
  // does the work over every row (see hooks/useServerQueryOps.js).
  // Requires the query body to expose its filter as a variable, e.g.
  // `$filter: [DBFilterInput] = [{fieldname: "status", value: "ACTIVE", operator: EQ}]`
  // — and, for sort, `sortBy: {field: $sortField, direction: $sortDirection}`.
  enableServerSearch = false,
  enableServerSort = false,
  // Same idea for the Filter/Sort sidebar's filter selections: without this the
  // sidebar filters only the rows already fetched, so on a 45,000-row list a
  // filter applied at `first: 25` narrowed 25 rows. With it the selections
  // become AND-ed clauses on the same `$filter` variable the search uses, and
  // the ERP applies them over every row.
  //
  // The sidebar's VALUE LIST is still built from loaded rows -- this changes
  // what a chosen value matches, not which values are offered. Declare the
  // fields you want filterable in the query doc's searchFields.
  enableServerFilter = false,
  // ERP fieldnames to search. Defaults to the query doc's own searchFields
  // (with `x__name` reduced to the filterable `x`), so the two cannot drift.
  serverSearchFields,
  // Names the list to search in a body that has more than one root selection.
  serverSearchRootField = '',
  // Ceiling on the id union used when a term matches several fields at once.
  // A single-field match ignores it entirely (it filters by LIKE, uncapped).
  serverSearchMatchLimit = 500,
  serverSearchDebounceMs = 400,
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

  // The step is its own size so a page can open with a full screen of rows and
  // then top up in smaller batches. Falls back to pageSize when unset.
  const stepFetchSize = useMemo(() => {
    const n = Number(pageStep);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : initialFetchSize;
  }, [pageStep, initialFetchSize]);

  const loadMore = useCallback(() => {
    setFetchSizeState((current) => current + stepFetchSize);
  }, [stepFetchSize]);

  const showPaginatorInHeader = enableServerPaging && showPageSizeControl
    && (paginatorPosition === 'header' || paginatorPosition === 'both');
  const showPaginatorAtBottom = enableServerPaging && showLoadMore
    && (paginatorPosition === 'bottom' || paginatorPosition === 'both');

  // --- server-side search / sort ---------------------------------------------
  // The variant holds the search term itself in this mode instead of pushing it
  // into the engine: the rows coming back are already the server's matches, and
  // a second client-side pass over them could only drop rows that matched on a
  // field the client-side search doesn't cover.
  const [serverTerm, setServerTerm] = useState('');
  // The sort lives in the engine's context, which is BELOW this component, so a
  // bridge rendered inside the provider reports it back up. The Filter/Sort
  // sidebar stays the only place a sort is chosen.
  const [engineSortConfig, setEngineSortConfig] = useState(null);
  const [engineFilterValues, setEngineFilterValues] = useState(null);

  const serverOpsEnabled = enableServerSearch === true || enableServerSort === true || enableServerFilter === true;

  // Stabilized for the same reason as `overrides`: Studio hands down a fresh
  // array literal every render, and this one reaches the hook's probe callback,
  // which the search effect depends on — an unstable identity would re-arm the
  // debounce on every render and keep firing probe rounds.
  const stableServerSearchFields = useStableValue(serverSearchFields);

  const { variables: serverOpsVariables, status: serverOpsStatus, isNarrowed } = useServerQueryOps({
    enabled: serverOpsEnabled,
    queryId: presetDataSource,
    term: serverTerm,
    sortConfig: engineSortConfig,
    rootField: serverSearchRootField,
    searchFields: stableServerSearchFields,
    matchLimit: serverSearchMatchLimit,
    debounceMs: serverSearchDebounceMs,
    serverSearch: enableServerSearch === true,
    serverSort: enableServerSort === true,
    filterValues: engineFilterValues,
    serverFilter: enableServerFilter === true,
  });

  // An explicit contentClassName wins outright — '' is a valid value meaning
  // "no padding from the provider", so this cannot use ?? on the preset.
  const resolvedContentClass = typeof contentClassName === 'string'
    ? contentClassName
    : (CONTENT_PADDING_PRESETS[contentPadding] ?? DEFAULT_CONTENT_PADDING);

  // Stabilized for the same reason as the overrides object: `paging` rides on
  // viewCtx / $ctx.view, so a fresh array literal from Studio would give the
  // whole view context a new identity on every render.
  const stablePageSizeOptions = useStableValue(pageSizeOptions);

  const paging = useMemo(() => ({
    enabled: enableServerPaging === true,
    fetchSize,
    setFetchSize,
    loadMore,
    loadMoreStep: stepFetchSize,
    pageSizeOptions: stablePageSizeOptions,
    pageSizeVariable,
    showLoadMore: showPaginatorAtBottom,
    mode: loadMoreMode,
  }), [
    enableServerPaging, fetchSize, setFetchSize, loadMore, stepFetchSize,
    stablePageSizeOptions, pageSizeVariable, showPaginatorAtBottom, loadMoreMode,
  ]);

  // `term` stays the hook's resolved term (what the last probe round actually
  // ran for), so a count never gets shown against a term it doesn't belong to.
  // `inputTerm` is what is in the box right now.
  const serverOps = useMemo(() => ({
    ...serverOpsStatus,
    inputTerm: serverTerm,
    setTerm: setServerTerm,
  }), [serverOpsStatus, serverTerm]);

  const viewCtx = useMemo(() => ({
    views: normalizedViews,
    activeView: resolvedActiveView,
    setActiveView,
    isActive: (id) => id === resolvedActiveView,
    keepInactiveMounted,
    paging,
    serverOps,
  }), [normalizedViews, resolvedActiveView, setActiveView, keepInactiveMounted, paging, serverOps]);

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
        // Server-side mode: the input drives this component's term (which
        // becomes a query variable) rather than the engine's client-side one.
        // Passed as props because the header is rendered by the engine, ABOVE
        // DataViewContext — context is not reachable from this slot.
        {...(enableServerSearch ? {
          term: serverTerm,
          onTermChange: setServerTerm,
          debounceMs: 0, // the hook debounces the network round instead
          busy: serverOpsStatus.searching,
          unavailable: !serverOpsStatus.available,
          unavailableHint: serverOpsStatus.reason
            ? `Server-side search unavailable: ${serverOpsStatus.reason}`
            : undefined,
        } : null)}
      />
    </div>
  ) : null), [
    showSearch, searchPlaceholder, showRecentSearches, recentSearchLimit, recentSearchStorageKey,
    enableServerSearch, serverTerm, serverOpsStatus.searching, serverOpsStatus.available, serverOpsStatus.reason,
  ]);

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
          {/* sortOnly={false} so this opens the FULL Filter and Sort, not just Sort.
             The search bar no longer owns filtering alone: the worker is handed
             `tableFilters` and `searchTerm` together, so a sidebar filter narrows the
             search result rather than replacing it. The filter's value list is built
             from the data actually loaded, so under enableServerSearch it offers only
             values present in the current server-narrowed result. */}
          <FilterSortPill sortOnly={false} defaultLabel="Filter / Sort" />
          <SyncPill />
          {/* `paging` is passed explicitly: this slot renders inside the engine's
              header, which is above DataViewContext in the tree. */}
          {showPaginatorInHeader ? <PageSizePill paging={paging} /> : null}
        </div>
        {inHeader ? switcher : null}
      </div>
    );
  }, [compact, inHeader, switcher, showPaginatorInHeader, paging]);

  // Non-compact: the engine renders its own controls, so the size pill joins the
  // switcher on the right rather than duplicating a control row.
  const headerRight = useMemo(() => {
    if (compact) return null;
    const pill = showPaginatorInHeader ? <PageSizePill paging={paging} /> : null;
    if (!pill) return inHeader ? switcher : null;
    return (
      <div className="flex shrink-0 flex-nowrap items-center gap-1.5 sm:gap-2">
        {pill}
        {inHeader ? switcher : null}
      </div>
    );
  }, [compact, inHeader, switcher, showPaginatorInHeader, paging]);

  const hasServerOpsVariables = Object.keys(serverOpsVariables).length > 0;
  const usesOverrides = (enableServerPaging && pageSizeVariable) || hasServerOpsVariables;

  // Is this fetch something other than "the whole query, in its own order"?
  // A search narrows it, a sort reorders it (so a limited fetch returns a
  // different slice of rows), and a page size shortens it. Any of those has to
  // stay out of the shared cache — see internalForProvider.
  const fetchIsNarrowed = isNarrowed
    || Boolean(serverOpsStatus.sortField)
    || (enableServerPaging === true && Boolean(pageSizeVariable));

  // Rendered as the last thing inside the list's own container, so it sits in
  // the scroll flow the reader is actually moving — and NOT inside the sticky
  // Load-more bar, which stays on screen and would trigger forever.
  const scrollLoader = useMemo(() => {
    if (!enableServerPaging || loadMoreMode === 'button') return null;
    return (
      <InfiniteScrollLoader
        paging={paging}
        serverOps={serverOps}
        rootMargin={infiniteScrollMargin}
        loadTrigger={loadTrigger}
        scrollDistancePerBatch={scrollDistancePerBatch}
        skeletonCount={skeletonCount}
        skeletonVariant={skeletonVariant}
        maxAutoBatches={maxAutoBatches}
        resetKey={serverOpsStatus.term}
      />
    );
  }, [
    enableServerPaging, loadMoreMode, paging, serverOps, infiniteScrollMargin,
    loadTrigger, scrollDistancePerBatch, skeletonCount, skeletonVariant, maxAutoBatches, serverOpsStatus.term,
  ]);

  const internalForProvider = useMemo(() => {
    const next = { ...__internal };
    if (headerTop || headerLeft || headerRight) {
      next.headerSlots = { top: headerTop, left: headerLeft, right: headerRight };
    }
    // Hide the engine's controls entirely in compact mode (the pills replace them).
    if (compact) next.showProviderHeader = false;
    if (hideNativeFilterSort) next.hideNativeFilterSort = true;
    // Only the baseline result may be cached. The engine's IndexedDB cache is
    // keyed by query id (plus month prefix), NOT by variables, so any fetch that
    // narrowed, reordered or shortened the dataset would sit there to be painted
    // as the whole list on the next cold load: 25 search hits, or the Z-end of a
    // descending sort, presented as the entire table. That applies to a
    // page-size fetch too, which is why turning on paging alone is enough.
    if (fetchIsNarrowed) next.skipCacheWrite = true;
    // Scroll-loading makes the list continuous — the loader holds the table's
    // visible window at every row fetched — so DataTableNew's own paginator
    // would sit on a single page, and its rows-per-page dropdown would fight
    // that window. Drop it for those modes only.
    if (enableServerPaging && loadMoreMode !== 'button') next.hideTablePaginator = true;
    return next;
  }, [
    __internal, headerTop, headerLeft, headerRight, compact, hideNativeFilterSort,
    fetchIsNarrowed, enableServerPaging, loadMoreMode,
  ]);

  // The whole server-paging trick: `overrides.variables` already flows through
  // DataProvider into the GraphQL request (DataProviderNew builds
  // variableOverrides from it), so merging the chosen size in limits the fetch
  // with no engine change. Merged INTO any existing variables so a caller's own
  // overrides (or a token) survive, and stabilized by content — see
  // useStableValue for why identity matters here.
  // Server-side search and sort ride the same channel: they are query variables,
  // so the engine re-runs the query and the ERP does the filtering over every
  // row. With no search and no sort the hook contributes nothing and the request
  // on the wire is unchanged.
  const overridesWithPaging = useMemo(() => {
    if (!usesOverrides) return overrides;
    return {
      ...(overrides && typeof overrides === 'object' ? overrides : {}),
      variables: {
        ...(overrides?.variables ?? {}),
        ...(enableServerPaging && pageSizeVariable ? { [pageSizeVariable]: fetchSize } : null),
        ...serverOpsVariables,
      },
    };
  }, [usesOverrides, enableServerPaging, pageSizeVariable, overrides, fetchSize, serverOpsVariables]);
  const stableOverrides = useStableValue(overridesWithPaging);

  return (
    <DataProvider
      presetDataSource={presetDataSource}
      presetName={presetName}
      offlineData={offlineData}
      onDataChange={onDataChange}
      onError={onError}
      overrides={usesOverrides ? stableOverrides : overrides}
      __internal={internalForProvider}
    >
      <DataViewContext.Provider value={viewCtx}>
        <PlasmicDataProvider name="view" data={viewCtx}>
          {(() => {
            const content = (
              <div className={className ?? 'flex flex-col min-h-0 flex-1'}>
                {/* Renders nothing; reports the sidebar's sort choice up so it
                    can become a query variable (see ServerOpsBridge). */}
                {enableServerSort || enableServerFilter ? (
                  <ServerOpsBridge
                    onSortConfigChange={enableServerSort ? setEngineSortConfig : undefined}
                    onFilterValuesChange={enableServerFilter ? setEngineFilterValues : undefined}
                  />
                ) : null}
                {viewSwitcherPosition === 'top' ? standaloneSwitcher : null}
                {showLetterRail ? (
                  <div className={`flex min-h-0 flex-1 gap-1 ${resolvedContentClass}`}>
                    <div className="min-w-0 flex-1">{children}{scrollLoader}</div>
                    {/* Rail only on the views that have letter sections (cards).
                        The wrapper row stays constant so toggling views never
                        remounts the slot content. */}
                    {!Array.isArray(letterRailViews) || letterRailViews.length === 0 || letterRailViews.includes(resolvedActiveView) ? (
                      <AlphabetRail field={letterRailField || undefined} />
                    ) : null}
                  </div>
                ) : (
                  <div className={resolvedContentClass}>{children}{scrollLoader}</div>
                )}
                {showPaginatorAtBottom ? (
                  <>
                    {/* A fixed bar is out of flow, so the list needs the space
                        reserved or its last row hides underneath. Sticky stays
                        in flow and needs nothing. */}
                    {loadMorePlacement === 'fixed' ? (
                      <div aria-hidden="true" style={{ height: LOAD_MORE_RESERVED_SPACE }} />
                    ) : null}
                    <LoadMoreBar
                      placement={loadMorePlacement}
                      bottomGap={loadMoreBottomGap}
                      variant={loadMoreVariant}
                      paging={paging}
                      serverOps={serverOps}
                      mode={loadMoreMode}
                    />
                  </>
                ) : null}
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
