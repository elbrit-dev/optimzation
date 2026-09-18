# DataProvider (Views) — Change Document

**Scope:** `share/src/app/datatable/` + `share/src/plasmic-init.js`
**Commit range:** `62ee1ee..dd84b57` (base: `f8e3939`)
**Net effect:** 7 new files, 4 existing files modified, 1 file added-then-removed.

---

## 1. Why this work happened

The existing **`DataProvider`** (Plasmic: *Elbrit DataProvider*) is a single-slot component. It fetches once, owns one filter/sort/search state, and publishes everything on `$ctx.data`. That works well for one table on a page.

The product ask was a **mobile product-catalog screen** with:

- a **Cards view and a Table view of the same data**, switchable by a toggle;
- a **search bar** that filters both views at once;
- an **A–Z jump rail** (iOS-contacts style) down the side of the cards;
- a **compact, mobile-sized control row** instead of the desktop-scale header;
- **instant paint on repeat visits** rather than a spinner every time.

None of this fits the plain `DataProvider`, and all of it could have been bolted onto `DataProviderNew` — which is the risk. `DataProviderNew.jsx` is ~5,900 lines and backs **every table in the app**. Any change to its fetch loop, loading flow, or header rendering is a blast-radius change.

### The governing decision

> **Build a sibling variant that wraps the existing engine. Touch the engine only to *expose* things it already had, never to change what it does.**

So:

- `DataProviderViews` **wraps** `DataProvider` — same preset resolution, same fetch, same filter/sort state. There is no second data path to keep in sync.
- Every new behaviour (tabs, search bar, letter rail, compact pills, stale cache) lives in **new files under `components/views/`**, consuming the engine through the existing `TableOperationsContext`.
- The four edits to existing files are **purely additive and default-off**. With no new props passed, every current page renders byte-identically.

That constraint is why the code looks the way it does in several places, and it is called out again at each edit below.

---

## 2. Architecture

```
DataProviderViews                     ← NEW: the variant (tabs, search, rail, cache)
  └─ DataProvider                     ← unchanged: preset resolution
       └─ DataProviderNew             ← unchanged engine (+4 additive hooks)
            ├─ header (headerSlots)   ← NEW injection point
            └─ TableOperationsContext ← +6 values now exposed
                 ├─ StaleDataBridge   ← NEW: re-provides context with cached snapshot
                 └─ DataViewContext   ← NEW: which tab is active
                      └─ DataView[]   ← NEW: one per tab, in the single slot
```

Two context layers, deliberately separate:

| Context | Owner | Carries | Why separate |
|---|---|---|---|
| `TableOperationsContext` | `DataProviderNew` | data, columns, filter/sort/search, sync | Pre-existing. The variant only **reads** it. |
| `DataViewContext` | `DataProviderViews` | `views`, `activeView`, `setActiveView`, `isActive` | View state is a variant concern. The engine must not learn about tabs. |

Both are also published to Plasmic Studio: `$ctx.data` (existing) and `$ctx.view` (new).

---

## 3. New files

### 3.1 `contexts/ViewContext.jsx` (15 lines)

Plain React context + `useDataViews()` hook.

**Why it returns `null` outside the provider:** so a `DataView` dropped under the *plain* `DataProvider` degrades to always-visible instead of crashing. Studio users move components between providers; that should not produce a blank screen.

---

### 3.2 `components/DataView.jsx` (43 lines)

One tab's content. Renders children only when its `viewId` is active.

Two decisions worth recording:

**`display: contents` by default.** A `DataTableNew` needs an unbroken flex chain from the provider down to itself to compute its height. A normal `<div>` wrapper breaks that chain and the table collapses. `display: contents` makes the wrapper layout-transparent — the child participates in the *grandparent's* flex context. Passing `className` or `style` opts back into a real box when you actually want one.

**Hidden, not unmounted (`keepInactiveMounted`, default `true`).** Unmounting an inactive view throws away the child's local state — table scroll position, expanded rows, column widths. Tab away and back and the user loses their place. So inactive views get `display: none` and stay mounted. `keepMounted={false}` opts out per view when the memory cost matters more.

ARIA `role="tabpanel"` / `aria-labelledby` are wired to the switcher's `role="tab"` ids.

---

### 3.3 `components/DataProviderViews.jsx` (289 lines) — the variant

Wraps `DataProvider`, owns view state, and assembles the header.

#### `normalizeViews()`
Accepts `['Cards','Table']` **or** `[{id,label,icon}]`, de-dupes by id, falls back to a Cards/Table default. **Why:** Studio users type an array of strings; code callers want icons. Rejecting either form would be a support burden for zero benefit.

#### Controlled / uncontrolled `activeView`
Uncontrolled by default (internal `useState`); becomes controlled the moment `activeView` is non-empty. Registered in Plasmic as a **writable state**, so Studio can either let the provider own the tab or drive it from a page variable.

A `useEffect` re-validates the internal selection when the `views` list changes underneath it, and `resolvedActiveView` falls back to the first view if a controlled value names a tab that does not exist — **an unknown id paints the first view rather than an empty screen.**

#### Header assembly — and why every piece is `useMemo`'d
The header elements are passed down through `__internal.headerSlots`, which lands in a `useMemo` dependency array inside `DataProviderNew`. Inline JSX would produce a new object identity on every render and defeat that memo, re-rendering the whole engine on every keystroke. Hence `switcher`, `headerTop`, `headerLeft` are each memoized.

#### Compact mode (`compactHeader`, defaults to `showSearch`)
Sets `__internal.showProviderHeader = false` and renders the variant's own pills instead:

```
[⛭ A → Z] [⟳ 5 Aug, 11:25 ⌄]  ……  [ Cards | Table ]
```

**Why everything goes in the LEFT slot as one `justify-between` row:** the engine's header row is `flex-col sm:flex-row`. Below the `sm` breakpoint it *stacks* left and right slots vertically — which is exactly the wrong thing on the mobile screen this was built for. Putting the whole row in the left slot keeps it on one line at every width. `flex-nowrap` + `min-w-0` enforce it.

Sizing: pills and switcher are all `height: 1.75rem`, against the engine's own `2rem` controls — deliberately one notch smaller, since compact mode never shows them side by side.

#### Spacing constants
`DEFAULT_CONTENT_PADDING` and `HEADER_SLOT_PADDING` exist because the engine's header wrapper is `px-2` on mobile, which reads as cramped. **The variant insets its own slots rather than changing the engine's padding** — same constraint as everywhere else.

#### Letter rail placement
The rail is rendered as a **sibling** of the children slot inside a constant flex row, and gated by `letterRailViews` (default `['cards']` — the table view has no letter sections).

**Why the wrapper row is constant:** if the row itself appeared and disappeared with the active view, React would remount the slot content on every tab switch, defeating `keepInactiveMounted`. Only the rail toggles; the row does not.

#### Stale-while-revalidate wiring
When `staleWhileRevalidate` is on, the content is wrapped in `StaleDataBridge` with a key defaulting to `preset:{presetDataSource}:{presetName}`.

---

### 3.4 `components/views/ProductSearchBar.jsx` (191 lines)

Search input that drives the engine's own `setSearchTerm`, so **cards and table filter together from one state** — that was the requirement, and it is why this drives the provider rather than filtering locally.

| Detail | Why |
|---|---|
| 250 ms debounce on `setSearchTerm`, immediate on the local `text` state | The provider re-filters the whole dataset on every change. Typing must stay responsive without re-filtering per keystroke. |
| `setSearchTermRef` instead of the callback in deps | The engine's `setSearchTerm` identity is not guaranteed stable; a ref keeps the debounce closure from being rebuilt mid-type. |
| Sync-back `useEffect` on `searchTerm` | Something else (e.g. `clearAllFilters`) can reset the term. Without this the input would show a stale query. |
| Recents panel is `position: fixed`, anchored to the input's rect | **The engine's header sets `overflow-x-auto`, which clips the cross axis too.** An absolutely positioned panel gets cut off. Fixed positioning escapes the clipping context entirely. Repositioned on scroll/resize. |
| Every `localStorage` access wrapped in `typeof window` + `try/catch` | SSR/prerender has no `localStorage`; private mode throws on quota. Recents are a convenience, never a failure path. |
| `searchUnavailable` → a `title` tooltip, not a disabled input | The underlying search only works when the query doc has `clientSave: true` **and** a `searchFields` map. Silently doing nothing was the previous failure mode; this explains it. |

---

### 3.5 `components/views/AlphabetRail.jsx` (225 lines)

The A–Z jump rail. **Owned by the provider, not by any card component** — so it can be toggled from one prop and works with any Studio-built layout.

#### The DOM contract
Clicking "A" scrolls to the nearest `[data-letter="A"]` inside the provider's content area. That is the entire coupling. `CatalogLetterGroup` renders these attributes; any custom Studio layout can too. **Why a DOM contract rather than a data prop:** the rail must not know how the slot content is structured, and the slot content is built in Studio where we cannot enforce a component API.

#### Two sources of letters
- **`letterRailField` set** (e.g. `brand__name`) — letters come from the provider's own pipeline data, so **search and filter dim letters live**.
- **No field** — a `MutationObserver` learns the letters from whatever `[data-letter]` sections rendered.

`readField()` tolerates flattened (`brand__name`), nested (`brand.name`), and scalar-Link shapes, because rows arrive in all three depending on the query.

#### Why a rAF-throttled scroll listener, not `IntersectionObserver`
This was a considered choice. `IntersectionObserver` is the idiomatic answer but is unreliable here:

- sections taller than the viewport never intersect cleanly;
- several sections can share a letter;
- sections mount *after* the rail does.

The implementation instead re-queries `[data-letter]` each frame and picks the section spanning a probe line at 20% viewport height, falling back to the nearest section top above it. Deterministic in all three cases. The listener is registered with `capture: true` so it catches scrolls of **nested** containers, not just the window.

#### Scrubbing
Pointer events + `elementFromPoint` give iOS-contacts-style drag-to-scrub, with a floating letter bubble. `touch-action: none` stops the page panning under the finger. Jumps during a drag use `behavior: 'auto'` — **smooth scrolling cannot keep up with a finger** and lags visibly behind. Taps still use smooth via the buttons' `onClick`.

---

### 3.6 `components/views/SyncPill.jsx` (126 lines)

Compact replacement for the engine's sync `SplitButton` in compact mode: `⟳ 5 Aug, 11:25 ⌄`, with *Hard Refresh* on the chevron.

**It calls the engine's own `handleSync` / `handleHardRefresh`.** Nothing about refreshing was reimplemented — only the button was. This is why those two functions had to be exposed on the context (§4.1).

- `busy` ORs `executingQuery || isRevalidating || isLoading` — **`executingQuery` alone misses the cache-read phases of a sync**, so the spinner would stop early and the control would look idle mid-refresh.
- Renders `null` when there is no `dataSource` (offline data) — nothing to sync.
- Menu is `position: fixed` anchored to the button, for the same `overflow-x-auto` clipping reason as the search bar; it closes on scroll/resize so it cannot drift away from its trigger.

---

### 3.7 `components/views/FilterSortPill.jsx` (61 lines)

Compact trigger: `⛭ A → Z`.

**This is only a restyled button.** It opens the *original* `FilterSortSidebar`, with `sortFields`/`searchFields` from the same query doc. There is no parallel sort implementation.

By default it opens the sidebar in **sort-only** mode, because in this layout the search bar owns filtering and the filter tabs would be redundant.

The label is typed the same way the engine's own applied-sort chip types it — `A → Z` for text, `Low → High` for numbers, `Oldest → Latest` for dates — so the two surfaces never disagree.

It mirrors the native button's availability check exactly (`clientSave === true` and search or sort fields present), so the pill can never appear where the sidebar would be empty.

---

### 3.8 `components/views/StaleDataBridge.jsx` (189 lines)

Stale-while-revalidate: paint last session's data instantly, refresh behind it.

**The central point: `DataProviderNew`'s loading flow is not modified.** The bridge sits *between* the provider and the slot content and works purely on the published context value:

1. After each successful load it snapshots the **data fields only** to IndexedDB (`elbrit-view-snapshots`).
2. On the next visit, while the provider is loading and has nothing on screen, it re-provides the context with the snapshot patched in — `isLoading: false`, `isRevalidating: true`.
3. The moment live data lands it passes the real context through untouched and re-snapshots.

Details and their reasons:

| Detail | Why |
|---|---|
| `SNAPSHOT_FIELDS` is an explicit allow-list of 12 data fields | **Functions are never snapshotted.** The live provider's callbacks are kept, so sort/filter/sync still work during the stale window instead of calling into a dead cached closure. |
| `MAX_SNAPSHOT_ROWS = 20000` | The goal is a fast first paint, not a full offline mirror. Serializing a huge dataset costs more than the spinner it saves. |
| `snapshotSignature()` before writing | Cheap change detection so identical data isn't rewritten to IndexedDB on every render. |
| `idbSet` failure retries without `reportData` | `reportData` can hold non-structured-cloneable values. Rather than losing the whole snapshot, it drops the one risky field. |
| `normalizeSlots()` handles flat vs slot-map contexts | The engine publishes `{rawData,...}` in some configurations and `{main:{...}}` in others. Both must snapshot. |
| Providers always render, even when not patching | If the provider element itself appeared/disappeared, the entire child tree would remount when patching toggled — a visible flash exactly when we're trying to avoid one. |
| `shouldPatch = anyLoading && !hasLiveData && snapshot != null` | Patch **only** during a cold load with nothing on screen. Never overwrite live data with stale data. |

**First-ever visit is a passthrough** — the normal spinner shows. Documented as *avoid on tables where users edit rows*, since a stale picture of editable data is misleading.

---

### 3.9 Added then removed: `views/SortSheet.jsx`

Added in `7553e84`, deleted in `40f5216`.

The first attempt at compact sorting was a **bottom sheet of named sort presets** driving `updateSort` with PrimeReact `sortMeta`. It was dropped because it was a **second sort implementation** that had to be configured separately from the query doc's `sortFields` — two places to maintain, and two sources of truth that could disagree.

Replaced by `FilterSortPill` + sort-only mode on the existing sidebar: same compact trigger, zero duplicated logic. This is the clearest example of the governing decision in §1 being applied mid-stream.

---

## 4. Modified existing files

Every change below is additive and default-off.

### 4.1 `components/DataProviderNew.jsx` (+56 / −5)

Four changes, no behavioural change to existing callers.

**(a) `__internal.headerSlots` — caller-supplied header content.** New prop `{top, left, right}`, default `null`.

- `top` — full-width row above the control row (the search bar).
- `left` / `right` — bracket `selectorsJSX` inside its existing `justify-between` row.

The header wrapper condition widened from `hasHeaderContent` to `hasHeaderContent || headerSlotTop || headerSlotLeft || headerSlotRight`, and `selectorsJSX` is now gated on `hasHeaderContent`. **With `headerSlots` null all three expressions collapse to the original behaviour** — the header renders iff `hasHeaderContent`, containing exactly `selectorsJSX`.

*Why in the engine at all:* the variant needs its controls **inside** the engine's header (sharing its border, background, and sticky behaviour), not in a second bar above it. Two stacked bars looked wrong and wasted vertical space on mobile.

**(b) `__internal.hideNativeFilterSort`** — drops the built-in *Filter / Sort* button when the caller supplies its own. Applied-filter chips are kept. Default `false`.

**(c) Sort-only sidebar access.** New state `filterSortSidebarSortOnly` + `openFilterSortSidebar({sortOnly})`, passed to `FilterSortSidebar` as `sortOnly`. **The native button now explicitly sets `sortOnly = false`** before opening, so the flag can never leak from a pill-opened session into a button-opened one.

**(d) Six values added to `TableOperationsContext`** (both the main and the secondary context builder, with matching dependency-array entries):

```
handleSync, handleHardRefresh, lastUpdatedAt, formatLastUpdatedDate,
setFilterSortSidebarVisible, openFilterSortSidebar
```

*Why:* `SyncPill` and `FilterSortPill` must invoke the **existing** behaviours. Exposing them was the alternative to reimplementing them — which is what makes those two components ~60 and ~126 lines instead of several hundred each.

### 4.2 `components/FilterSortSidebar.jsx` (+15 / −4)

New `sortOnly` prop, default `false`.

- Hides the left tab-navigation column (sort-only has a single pane) and forces `activeTabIndex = 0` on open.
- Header text becomes `Sort` instead of `Filter and Sort`.
- `handleClear` **returns early before touching filter selections** — clearing sort must not silently wipe filters the search bar or another surface applied.
- `hasActiveFilters` considers only the sort in this mode.

Default `false` preserves the original behaviour exactly.

### 4.3 `plasmic-init.js` (+203 / −2)

Registers `DataProviderViews` (*Elbrit DataProvider (Views)*) and `DataView` (*Elbrit DataView*, `parentComponentName: 'DataProviderViews'`) in the `ElbritCoreLib` section, and adds both to the components map and the export list.

`DataProviderViews` declares `providesData: true`, a **writable `activeView` state**, and a default children slot pre-filled with a `cards` and a `table` `DataView` (the table one already containing a `DataTableNew`) — so dragging it in produces a working two-tab setup without manual assembly.

The prop descriptions are written as **Studio-facing documentation**, including the constraints a Studio user cannot discover from the UI: that search needs `clientSave: true` + `searchFields`, that `compactHeader` hides the month picker, that `staleWhileRevalidate` should be avoided on editable tables.

### 4.4 `config/configs/slotConfig.js` (+3 / −3)

**Unrelated to the Views variant** — a data-correctness fix committed in the same range (`dd84b57`). Percentage-column denominators were wrong:

| Column | Before (`targetField`) | After |
|---|---|---|
| Target % | `target` | `target_value` |
| Prod % | `target` | `net_primary` |
| Inv % | `target` | `net_primary` |

`Target %` was pointing at a field name that no longer matched the query output. `Prod %` and `Inv %` were being divided by *target* when the intended denominator is *net primary* — offer percentages are a share of actual primary sales, not of target. `beforeColumn` for Target % moved to `target_value` to match.

---

## 5. Plasmic Studio prop reference

### Elbrit DataProvider (Views)

| Prop | Type | Default | Notes |
|---|---|---|---|
| `views` | object | Cards + Table | `['Cards','Table']` or `[{id,label,icon}]`; ids must match `DataView.viewId` |
| `defaultView` | string | first view | |
| `activeView` | string (writable state) | — | unset = provider owns selection |
| `onViewChange` | eventHandler(`viewId`) | — | |
| `showViewSwitcher` | boolean | `true` | off → build your own, call `$ctx.view.setActiveView(id)` |
| `viewSwitcherPosition` | choice | `header` | `header` \| `top` \| `bottom` |
| `viewSwitcherAlign` | choice | `right` | `top`/`bottom` only |
| `keepInactiveMounted` | boolean | `true` | keeps table scroll/expanded rows |
| `contentPadding` | choice | `default` | `default` \| `tight` \| `none` — inset around the slot |
| `contentClassName` | string | — | replaces the padding classes outright; `''` = none |
| `showSearch` | boolean | `false` | needs `clientSave: true` + `searchFields` |
| `searchPlaceholder` | string | `Search product or brand…` | |
| `showRecentSearches` / `recentSearchLimit` / `recentSearchStorageKey` | bool / num / string | `true` / `5` / — | set the key to isolate per page |
| `compactHeader` | boolean | = `showSearch` | replaces engine controls with pills |
| `hideNativeFilterSort` | boolean | `false` | |
| `showLetterRail` | boolean | `false` | needs `[data-letter]` in the slot |
| `letterRailField` | string | — | e.g. `brand__name`; enables live dimming |
| `letterRailViews` | object | `['cards']` | `[]` = all views |
| `enableServerPaging` | boolean | `false` | drives the query's own limit variable — needs it declared in the query body |
| `pageSize` | number | `25` | initial fetch size, and the "Load more" step |
| `pageSizeOptions` | object | `[10,25,50,100,200]` | current size is always included |
| `pageSizeVariable` | string | `first` | `first` for Relay-style ERP queries |
| `showPageSizeControl` / `showLoadMore` | boolean | `true` / `true` | |
| `paginatorPosition` | choice | `both` | `header` \| `bottom` \| `both` |
| `loadMorePlacement` | choice | `sticky` | `sticky` \| `fixed` \| `static` |
| `loadMoreBottomGap` | string | `4.5rem` | clears the 4rem bottom nav; safe-area inset added on top |
| `loadMoreVariant` | choice | `floating` | `floating` \| `bar` \| `plain` |
| `loadMoreMode` | choice | `button` | `button` \| `scroll` \| `both` — see §5c |
| `pageStep` | number | = `pageSize` | rows each following batch adds; also what paces scroll-loading |
| `infiniteScrollMargin` | string | `400px` | how far ahead of the end loading starts |
| `skeletonCount` / `skeletonVariant` | number / choice | `3` / `card` | placeholders while a batch loads |
| `maxAutoBatches` | number | `20` | batches per scroll session before a tap is needed; `0` = no ceiling |
| `enableServerSearch` | boolean | `false` | search the whole dataset; needs `$filter: [DBFilterInput]` in the body (§5b) |
| `enableServerSort` | boolean | `false` | sort the whole dataset; needs `sortBy: {field: $sortField, direction: $sortDirection}` |
| `serverSearchFields` | object | derived | ERP fieldnames, e.g. `['lead_name','custom_specialty','city']` |
| `serverSearchRootField` | string | — | names the list to search in a multi-root body |
| `serverSearchMatchLimit` | number | `500` | id-union cap; ignored when a term matches one field |
| `serverSearchDebounceMs` | number | `400` | quiet period before a term goes to the server |
| `staleWhileRevalidate` | boolean | `false` | `$ctx.data.main.isRevalidating` during stale window |
| `cacheKey` | string | `preset:{src}:{name}` | set to unshare snapshots |
| `presetDataSource`, `presetName`, `offlineData`, `overrides`, `onDataChange`, `onError` | — | — | identical to Elbrit DataProvider |

### Elbrit DataView

| Prop | Type | Notes |
|---|---|---|
| `viewId` | string | must match an id in the parent's `views` |
| `keepMounted` | boolean | overrides parent's `keepInactiveMounted` |
| `className` / `children` | string / slot | setting `className` opts out of `display: contents` |

### Studio bindings

- `$ctx.data` — unchanged (data, columns, filter/sort state)
- `$ctx.view` — `{ views, activeView, setActiveView, isActive, keepInactiveMounted, paging, serverOps }`
- `$ctx.view.paging` — `{ enabled, fetchSize, setFetchSize, loadMore, loadMoreStep, pageSizeOptions, pageSizeVariable, showLoadMore, mode }`
- `$ctx.view.serverOps` — `{ available, reason, searching, term, inputTerm, setTerm, matchCount, matchCapped, matchedFields, totalCount, sortField, sortDirection, searchableFields, unsearchableFields, error }`. `available: false` + `reason` is the diagnostic when server-side search or sort is configured but the query body cannot support it.

---

## 5a. Fetch size (`ViewPaginator`)

Added after the original range. The ask was pagination "so we load less data each time", and the important finding was that **the engine has no fetch-size concept to expose** — `$ctx.data.paginatedData` is `sortedData.slice(first, first + rows)`, a slice of what is already in memory. Paginating it changes render cost, not bytes on the wire.

The limit that does exist is in the query body itself, as a literal:

```graphql
query Doctors { Leads(first: 10, filter: {…}) { … } }   # before
query Doctors($first: Int = 10) { Leads(first: $first, filter: {…}) { … } }   # after
```

### Why no engine change was needed

`overrides.variables` already reaches the GraphQL request: `DataProvider` passes `overrides` straight through, `DataProviderNew` folds it into `variableOverrides` (line ~362), and `useQueryExecution` merges that into the sent variables (line ~534) — then **re-runs the query whenever `variableOverrides` changes** (line ~822). So the variant merges the chosen size into `overrides.variables` and the engine does the rest. Zero lines changed in `DataProviderNew`, `DataTableNew`, `DataProvider`, or either pipeline hook.

### Decisions worth recording

**`useStableValue` around the merged overrides.** That "re-run on `variableOverrides` change" effect keys on **object identity**. A caller building `overrides` inline — Plasmic Studio does — hands down a fresh object every render, which loops: fetch → state → render → new object → fetch. The variant therefore stabilizes the merged object by JSON signature, and passes `overrides` through untouched when paging is off so the default path stays byte-identical.

**"Load more" by growing `first`, not cursors.** `Doctors` carries a `filter`, and `after` + `filter` together throws `Filter must be a tuple or list` on our ERP. Cursor paging is unavailable, so the control raises the limit (10 → 25 → 50) and rows 1..N always come down together. No page can be skipped.

**"More may exist" is a heuristic.** Nothing in the pipeline reads `pageInfo` — `hasNextPage`/`endCursor` appear nowhere in `graphql-playground/utils/` — so a full page coming back is the only available signal. With a search or filter active the loaded count is already narrowed, so the button stays enabled rather than claiming the end of the list.

**A native `<select>` for the size pill.** The engine's header row is `overflow-x-auto`, which clips a popup on the cross axis too — the reason `SyncPill` has to position its menu `fixed`. A native select has no such problem.

**The size also drives `updatePagination`.** So a view bound to `$ctx.data.paginatedData` shows the same window as one bound to `sortedData`, instead of the two silently disagreeing.

**`sticky` over `fixed` as the placement default.** Sticky stays in normal flow, so the bar can never cover the last row and no space has to be reserved for it. `fixed` is offered for pages whose scroll container isn't the provider's content, and there the variant inserts its own spacer — a fixed bar with nothing reserved would hide the final card. Sticky's cost is that it needs a scrolling ancestor and no ancestor with `overflow: hidden`; if the bar refuses to lift, that's the first thing to check.

**The gap is `4.5rem` + `env(safe-area-inset-bottom)`.** The app's bottom navigation is `fixed bottom-0` with `height: 4rem` (`navigation/components/Navigation.jsx`), so 4.5rem clears it with breathing room. The inset is added here explicitly because the nav's own `safe-area-bottom` class **is not defined in any stylesheet** — it looks like padding but does nothing.

**Lifted bars are `pointer-events-none` with an `auto` inner.** A floating capsule sits over the cards; without this it would swallow taps on the rows either side of it. It also sits at `z-20` against the nav's `z-10` — above it in stacking order, clear of it in space.

### Costs the caller has to accept

1. ~~**Search and sort only cover loaded rows.**~~ **Fixed in §5b.** This was the original cost: `clientSave: true` queries search and sort in memory, so at `first: 25` the search bar and the A–Z rail saw 25 doctors out of 45,000. §5b pushes both to the server.
2. **Every size change is a network round-trip.** The `variableOverrides` effect calls `runQuery(dataSource, true)`, which is the direct query path, not the IndexedDB-first path used at mount — so with paging on, the provider fetches live rather than reading cache. Pair it with `staleWhileRevalidate` if instant paint matters.
3. ~~**The IndexedDB cache is not keyed by variables.**~~ **Handled in §5b.** The cache is still keyed `` `${queryId}_${monthRange}` `` and still cannot hold pages separately — but a narrowed fetch is no longer written to it at all, so it can no longer be read back as the full dataset.
4. **Only works where the variable is declared.** A query without `$first` in its body ignores the variable and keeps its hardcoded limit; the control then does nothing but re-slice locally.

---

## 5b. Server-side search and sort (`useServerQueryOps`)

The ask after §5a: paginating meant search and sort now covered the *page*, not the data. On the doctor list that is 25 rows searched out of 45,682. The provider does have access to all of them — it was simply asking for 25 and then filtering those.

So search and sort become **query variables**, and the ERP does the work over every row. No second data path: the engine already re-runs its query whenever `overrides.variables` changes, which is the same channel §5a's page size rides on.

### What the ERP actually supports

Probed against `erp.elbrit.org` before any code was written, because the design depends entirely on the answers:

| Capability | Result |
|---|---|
| `filter: [DBFilterInput]` | `{fieldname, value \| values, operator}`; `LIKE` with `%term%` works |
| **AND only** | No `orFilter` / `or_filters` argument; `DBFilterInput` has no `logical` field |
| `sortBy: {field, direction}` | `field` is a `<Doctype>SortField` **enum** — the fieldname in UPPER_SNAKE (`LEAD_NAME`); `direction` is `SortDirection` |
| `totalCount` | Exact, and respects the filter — the real match count is one cheap request away |
| `first` / `after` | `after` **with** `filter` still throws `Filter must be a tuple or list` |
| Enum values in variables | A JSON string (`"LEAD_NAME"`) is accepted for an enum variable, so the client needs no per-doctype enum knowledge |

Two of those shape everything below: **search cannot be one request** (no OR), and **a searched list cannot be cursor-paged** (so Load more keeps growing `first`, exactly as it already did).

### The body has to expose its filter

`Doctors` hardcoded its filter:

```graphql
Leads(first: $first, filter: {fieldname: "status", value: "ACTIVE", operator: EQ}, sortBy: {direction: ASC, field: NAME})
```

A hardcoded literal cannot be extended — GraphQL cannot concatenate two lists and the ERP takes exactly one `filter` argument — so the body parameterizes it, with the base clauses as the variable's **default**:

```graphql
query Doctors(
  $first: Int = 100
  $filter: [DBFilterInput] = [{fieldname: "status", value: "ACTIVE", operator: EQ}]
  $sortField: LeadSortField = NAME
  $sortDirection: SortDirection = ASC
) {
  Leads(first: $first, filter: $filter, sortBy: {field: $sortField, direction: $sortDirection}) { … }
}
```

**Why the default and not a prop.** `readQueryShape()` parses the body (with `graphql`'s own `parse` + `valueFromASTUntyped`, not a regex) and reads the base clauses out of that default. The body stays the single source of truth for "which rows does this query mean" — a `serverFilterBase` prop would be the same list written twice, in two places that can disagree.

A body that still hardcodes its filter is not an error: `readQueryShape` reports `filterIsLiteral`, server search reports itself unavailable, and the search box's tooltip says what to add. Nothing breaks.

**Verified against the live ERP** in all four states — no variables (100 rows, `NAME ASC`, identical to the body it replaces), page size only, search + sort + page size, and the explicit return to the base filter. The default values are what make the first of those byte-identical, so **the query doc keeps working unchanged for every page that does not opt in**.

The `Doctors` doc (Firestore `gql/Doctors`, field `body`) becomes:

```graphql
query Doctors(
  $first: Int = 100
  $filter: [DBFilterInput] = [{fieldname: "status", value: "ACTIVE", operator: EQ}]
  $sortField: LeadSortField = NAME
  $sortDirection: SortDirection = ASC
) {
  Leads(
    first: $first
    filter: $filter
    sortBy: {field: $sortField, direction: $sortDirection}
  ) {
    edges {
      node {
        city
        first_name
        lead_name
        name
        custom_category1__name
        custom_category2__name
        custom_category3__name
        custom_address_created
        custom_latitude
        custom_latitude_and_longitude
        custom_longitude
        custom_specialty__name
        custom_speciality
        email_id
        customer__name
        custom_category__name
        territory {
          name
          territory_name
        }
        custom_role_profile {
          role_profile_list__name
          department__name
          hq__name
        }
        status
      }
    }
  }
}
```

Only the operation header and the three arguments change; the selection set is the existing one verbatim. Save it through the graphql-playground UI (or PATCH the Firestore doc with `updateMask.fieldPaths=body` so the other ~15 fields survive).

### Search: the two-step id union

For a term, per searchable field, one **id-only** probe: `LIKE %term%` selecting just `name`, which also returns that field's exact `totalCount`. Then:

- **one field matched** → filter the real query with that field's `LIKE` clause. Uncapped, exact count, Load more walks the whole match set.
- **several matched** → union their ids (bounded by `serverSearchMatchLimit`, default 500) and filter with `name IN [...]`.
- **none matched** → a deliberately unsatisfiable clause. Not `IN []`: Frappe rejects an empty value list, which would surface as a query error instead of an empty result.

Measured: `"raj"` → 1,984 matches (lead_name), `"cardio"` → 3,064 (custom_specialty), probe round 0.4–0.8 s, main query ~0.2 s.

**Probes are separate requests, not one aliased document.** An aliased document is a single operation, so one unfilterable fieldname fails the whole search and the user gets nothing — verified: `territory_territory_name` returns `Unknown column 'tabLead.territory_territory'` and took the other four fields down with it. As separate requests that field drops out alone, and is remembered so it costs one request per session rather than one per keystroke.

**The search fields are derived, not declared.** From the query doc's own `searchFields`, with `custom_specialty__name` reduced to the filterable `custom_specialty` (Frappe stores a Link's target id — which *is* the name — in the column itself). Two reasons: one source of truth, and the rows that come back are still handed to whatever client-side filtering is active, so a server field with no client counterpart would match a row that is then dropped again on screen. Anything still carrying a `__` or a `.` after the strip is a genuinely nested selection that SQL cannot reach from this table, so it is dropped rather than guessed at. `serverSearchFields` overrides the derivation when a query needs it — note that Doctors' `territory` and `city` are **not** in `searchFields`, so "chennai" finds nothing until they are added.

**The empty-edges retry.** This ERP intermittently answers a probe with a correct `totalCount` and an **empty** `edges` list, with no GraphQL error — reproduced on a repeat of the identical request, both serially and in parallel, so it is a server flake and not a concurrency rule. Taken at face value it would silently drop a field's matches from the union, so an inconsistent probe is retried once; if it still comes back empty and nothing else yielded ids, the search falls back to a `LIKE` on the widest-matching field rather than returning nothing.

### Sort

`ServerOpsBridge` renders nothing and lifts the engine's `sortConfig` up to the variant, because `DataProviderViews` sits *above* the engine and cannot read `TableOperationsContext`. The existing Filter/Sort sidebar stays the only place a sort is chosen — the same rule that got `SortSheet` deleted in §3.9. The field becomes `UPPER_SNAKE`, the direction `ASC`/`DESC`, and the query doc's `sortFields` allow-list is checked first, the same check the engine makes before sorting client-side.

### Clearing has to be sent, not omitted

The engine re-runs on a **change** to `overrides`, so dropping a variable reads as "nothing happened" and the search results would stay on screen after the box was cleared. Once a search or sort has gone to the server, clearing it therefore sends an explicit return to the body's defaults — the base filter, and the sort variables' own default values read out of the body. Before the first search the variables are left out entirely, so the request is byte-identical to today's and the mount still reads the IndexedDB cache first.

### Only the baseline is cached

The cache is keyed by query id, not by variables. A narrowed fetch written there would be read back as the whole dataset on the next cold load — 25 search hits, or the Z-end of a descending sort, presented as the entire table. So `__internal.skipCacheWrite` (new, additive, default false) carries "this fetch is not the baseline" down to the worker, which skips the write. It is set for a search, for a sort, **and for a page-size fetch** — which also fixes §5a's cost 3 for tables already using paging.

### Real counts

The Load-more bar's "a full page came back" heuristic is replaced by `totalCount` whenever server ops are on: `25 of 1,984 matches` while searching, `25 of 31,306 total` otherwise, and the button stops offering more at the end of the list. A capped union says so rather than presenting the first 500 as the whole answer.

### Fixed along the way

`PageSizePill` read `paging` from `DataViewContext` — but a header slot is rendered by `DataProviderNew`, whose header is a *sibling* of `{children}`, and the provider is inside `children`. So `useDataViews()` returned `null` there and the header pill silently rendered nothing at `paginatorPosition: 'header' | 'both'`. It now takes `paging` as a prop, with the context as fallback.

### Costs and limits

1. **A term matching several fields is capped** at `serverSearchMatchLimit` ids. A single-field match is uncapped; the cap only bites on a genuinely ambiguous term.
2. **Each committed term is a probe round plus a page fetch** — hence a 400 ms debounce and a spinner in the box, rather than the 250 ms a client-side filter needs.
3. **Search is only as wide as the fields it is given.** Derivation drops what it cannot filter, silently by design; `$ctx.view.serverOps.unsearchableFields` lists them.
4. **Sorting is by one field**, whatever the sidebar chose. The ERP takes a single `sortBy`.
5. **The A–Z rail still reads loaded rows.** With `letterRailField` set it dims letters from the pipeline data, which is the fetched page — the rail is a jump control over what is on screen, not an index of the dataset.
6. **`enableServerSort` needs the sort enum to exist for that doctype.** `LeadSortField` has one value per column in UPPER_SNAKE; a field the enum does not carry is rejected by the server.

---

## 5c. Scroll-loading (`InfiniteScroll`)

`loadMoreMode` adds two alternatives to tapping Load more: `scroll` (the list loads itself as you near the end) and `both` (it does, and the button is still there). Default stays `button`, so nothing changes unless a page asks for it.

It drives **the same `paging.loadMore()`** the button does. Only the trigger is new — there is no second paging path, and everything in §5a still applies, including that a step re-fetches rows 1..N rather than appending a page, because `after` + `filter` throws here. That is the real limit on this: each batch costs more than the last, so scroll-loading is for the first few hundred rows. `pageStep` exists for that — open with a full screen (`pageSize: 50`) and top up in smaller steps (`pageStep: 25`) instead of doubling every time.

### Why it listens for scrolls rather than watching a sentinel

The obvious build is a 1px probe after the list plus an `IntersectionObserver`. It was the first build, and it does not work here, because **no single element's visibility means "the reader is at the end"**:

- the cards view scrolls the page (or an ancestor), so a probe after the list does move;
- `DataTableNew` renders `scrollable` with its own `scrollHeight`, so its rows scroll **inside** `.p-datatable-wrapper`. A probe after the table never moves. Depending on layout it is then either permanently visible (loads everything at once) or permanently off screen (loads nothing).

So instead there is one capture-phase `scroll` listener, and whatever element reported the scroll is the element that gets measured — `scrollHeight - scrollTop - clientHeight <= rootMargin`. Scroll events do not bubble, but capture still sees them, which is how the letter rail tracks nested scrolling too. That covers the page, any scrolling ancestor, and the table's own box without having to know which is in play.

Two guards on which scrolls count: the element must be **vertically** scrollable (a horizontally-scrolling table wrapper has a distance-to-bottom of 0 and would fire on every sideways nudge), and it must either contain the list's box or be contained by it, so an unrelated scroller elsewhere on the page is ignored.

### One batch per gesture — and what actually paces the loading

"The end is in view, so load" is not enough on its own. Measured in a headless browser against a list whose container never grows: **19 batches off a single scroll**, stopping only when the cap was hit, and 2 batches before the reader had scrolled at all. So a batch also costs one scroll **gesture** — not one scroll event, because a single flick emits events for as long as its momentum runs and "one event" would be satisfied within a frame. Events are grouped into bursts separated by 150ms of quiet.

**Requiring several gestures per batch was tried and removed.** It cannot be made to work: every route to more rows ends at the bottom of the list, and at the bottom no further gestures can arrive — a flick against the end produces no movement and no event. The requirement therefore has to be waived exactly where it was meant to bite, and measurement confirmed it: with the waiver, 12 flicks produced the same 3 batches whether the setting was 1 or 3; without it, a reader pinned on the last row would sit in front of a list that looks finished.

What genuinely sets the pace is **`pageStep` against the screen height**, because a bigger batch pushes the end of the list further away. Measured over 12 one-screen phone flicks (80px rows, 600px viewport):

| `pageStep` | batches | pace |
|---|---|---|
| 10 | 6 | one per 2 flicks |
| 25 | 3 | one per 4 flicks |
| 50 | 2 | one per 6 flicks |

`infiniteScrollMargin` is the other half: it decides how far ahead of the end a batch starts, so it trades "already there when the reader arrives" against fetching rows they may never reach.

So a batch costs a ticket. One is granted at mount (a list too short to scroll can still fill the first screen), spent on each ask, and granted again by a `scroll` event on the root. Extra tickets are harmless — a batch also has to be *new* (asked once per row count), so continuous scrolling cannot double-load.

Measured with both mechanisms in place, on layouts that mirror the two views — a cards list that grows the page, and rows inside a 600px `.p-datatable-wrapper`:

| | cards view (page scrolls) | table view (inner scroller) |
|---|---|---|
| before any scroll | 0 batches | 0 batches |
| one scroll to the end | 1 | 1 |
| five more scrolls | 6 total, one each | 6 total, one each |
| 40 more | stops at the cap (20) | stops at the cap (20) |
| duplicate asks for one batch | none | none |

### `maxAutoBatches`

A ceiling (default 20) on batches loaded by scrolling alone, after which a Load more button appears and continuing resets the budget. A new search resets it too. It is the backstop for the never-growing-container case above, and a reason to pause on a list that would otherwise never end. `0` removes it.

### Making it work in the table view

Watching the right scroller is only half of it. `DataTableNew` renders **`paginatedData`** — `sortedData.slice(first, first + rows)` — and `rows` defaults to **10**. So scroll-loading would fetch more rows and show none of them: they would pile up as extra pages behind the table's own paginator instead of extending the list being scrolled.

Two things follow, both scoped to the scroll modes (the loader is not rendered at all for `button`, so nothing here touches existing pages):

- **The visible window is held at every row fetched.** The loader calls `updatePagination(0, max(rowsInHand, fetchSize))` whenever either changes, so the table renders one continuous run and the scroll inside it is the scroll that loads.
- **`DataTableNew`'s own paginator is hidden** (`__internal.hideTablePaginator`, new, default false). With the window pinned it would sit on a single page anyway, and its rows-per-page dropdown would fight the window — pick 10 and the sync immediately puts it back.

### Skeletons

While a scroll-triggered batch is in flight, placeholder rows render at the end of the list — `skeletonCount` of them, `card` or `row` shaped. The point is the reader who gets to the bottom faster than the network: without them the list looks finished. They are `aria-hidden` behind a single `role="status"` "Loading more", so a screen reader hears it once instead of reading out empty boxes.

In the **table** view they land below the table's box rather than after the last row, because the rows are inside its scroller and this is not — so use `skeletonVariant: 'row'` there, and note that the Load-more bar's own "Loading…" is the indicator that sits closest to where the reader is looking.

Rows already on screen stay there throughout: the engine only replaces `processedData` on success, so a growing re-fetch never blanks the list.

### Limits

1. **The window and the table's paginator are taken over.** See "Making it work in the table view" above: in scroll modes the visible window is held at every row fetched and `DataTableNew`'s own paginator is hidden. A page that wants readers to page the table by hand should stay on `button`.
2. **`enableServerPaging` has to be on.** Scroll-loading raises the same fetch-size variable; with paging off there is nothing to raise.
3. **The fetch size is not reset by a search.** Search after scrolling to 300 rows and you fetch 300 matches. Deliberate — resetting it would fire a second query on every search — but it means a long scroll makes later searches heavier.

---

## 6. Backward compatibility

| File | Guarantee |
|---|---|
| `DataProviderNew.jsx` | `headerSlots` null, `hideNativeFilterSort` false and `skipCacheWrite` false ⇒ header condition, `selectorsJSX` gating, sidebar mode and caching all evaluate to the pre-change values. The six new context entries are additions only. |
| `FilterSortSidebar.jsx` | `sortOnly` defaults `false` ⇒ original tabs, header text, clear behaviour. |
| `plasmic-init.js` | Registrations added; `DataProvider` and `DataTableNew` metas untouched. |
| `DataProvider.jsx` | Not modified — the variant reuses it as-is. |
| `useQueryExecution.js` | New `skipCacheWrite` option defaults `false`; only `runQuery`'s pipeline call passes it on. |
| `DataTableNew.jsx` | New `hidePaginator` (from context) defaults `false` ⇒ both `PaginatorWrapper` renders are unchanged. Only a provider in a scroll mode sets it. |
| `queryWorker.js` | `executePipeline` gained a trailing `options = {}`; with it absent the cache condition is the original `clientSave === true`. |
| `ProductSearchBar.jsx` | Controlled mode only engages when `onTermChange` is supplied; otherwise it drives the engine's `setSearchTerm` as before. |

No existing page passes any of the new props. Nothing currently rendered changes.

**Server-side search and sort are off by default** and, even when switched on, contribute no variables until a term is typed or a sort chosen — so a page that enables them but is not used still issues the same request it does today.

---

## 7. Known limitations and gotchas

1. **Compact mode hides the month picker.** `compactHeader` sets `showProviderHeader: false`, which zeroes `hasHeaderContent` and drops all of `selectorsJSX`. Month-range queries need the engine header — keep `compactHeader` off for those. (Documented in the Studio prop description.)

2. **Compact mode also hides applied-filter chips**, since they live inside `selectorsJSX`. Note the distinction: `hideNativeFilterSort` keeps the chips; `compactHeader` does not. If chips matter on a compact screen, `hideNativeFilterSort` alongside the standard header is the combination to use.

3. **Search silently no-ops without `clientSave: true` + a `searchFields` map** on the query doc. The input shows an explanatory `title` tooltip rather than being disabled — check the query doc first when search "does nothing".

4. **The letter rail needs `[data-letter]` targets in the slot.** With no matching sections, the letters dim and clicks do nothing. Custom Studio layouts must add the attribute themselves.

5. **`staleWhileRevalidate` on editable tables is misleading.** During the stale window the view is a static picture of the previous session; interactions apply to the live provider and take effect when fresh data lands.

6. **Snapshots are skipped above 20,000 rows** — large datasets fall back to the normal spinner with no warning surfaced in the UI.

7. **The DOM contract is untyped.** A typo in `data-letter` or a renamed `letterRailField` fails silently rather than raising. Both are the cost of decoupling the rail from Studio-authored layout.

---

## 8. Commit map

| Commit | Change |
|---|---|
| `62ee1ee` | `DataProviderViews`, `DataView`, `ViewContext` + registration — tabs working |
| `7553e84` | `ProductSearchBar`, `SortSheet` (first sort attempt), header-slot plumbing |
| `2d911d7` | `AlphabetRail` added |
| `a050de4` | `SyncPill`, `StaleDataBridge`; rail + search refinements |
| `40f5216` | **`SortSheet` deleted, `FilterSortPill` added**; sort-only mode in `FilterSortSidebar` |
| `2198421` | Rail: scroll-tracked active letter |
| `d678016`–`3e7d5ec` | Pill sizing/spacing, single-row compact header, fixed-position popovers |
| `dd84b57` | `slotConfig.js` percentage-denominator fix (unrelated) |

### Companion work outside `share/` (context only)

The same range adds root-level catalog components — `components/ProductCard.jsx`, `CatalogLetterGroup.jsx`, `CatalogLetterSection.jsx`, `ProductStockSheet.jsx` — plus `KT.md` and `erp-queries-inventory.md`. These are the **consumers** of the variant: `CatalogLetterGroup` is what renders the `data-letter` sections the rail scrolls to. They are a separate surface and are not covered by this document.
