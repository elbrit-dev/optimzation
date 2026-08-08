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
| `showSearch` | boolean | `false` | needs `clientSave: true` + `searchFields` |
| `searchPlaceholder` | string | `Search product or brand…` | |
| `showRecentSearches` / `recentSearchLimit` / `recentSearchStorageKey` | bool / num / string | `true` / `5` / — | set the key to isolate per page |
| `compactHeader` | boolean | = `showSearch` | replaces engine controls with pills |
| `hideNativeFilterSort` | boolean | `false` | |
| `showLetterRail` | boolean | `false` | needs `[data-letter]` in the slot |
| `letterRailField` | string | — | e.g. `brand__name`; enables live dimming |
| `letterRailViews` | object | `['cards']` | `[]` = all views |
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
- `$ctx.view` — `{ views, activeView, setActiveView, isActive, keepInactiveMounted }`

---

## 6. Backward compatibility

| File | Guarantee |
|---|---|
| `DataProviderNew.jsx` | `headerSlots` null and `hideNativeFilterSort` false ⇒ header condition, `selectorsJSX` gating, and sidebar mode all evaluate to the pre-change values. The six new context entries are additions only. |
| `FilterSortSidebar.jsx` | `sortOnly` defaults `false` ⇒ original tabs, header text, clear behaviour. |
| `plasmic-init.js` | Registrations added; `DataProvider` and `DataTableNew` metas untouched. |
| `DataProvider.jsx` | Not modified — the variant reuses it as-is. |

No existing page passes any of the new props. Nothing currently rendered changes.

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
