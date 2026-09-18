'use client';

import { initPlasmicLoader } from '@plasmicapp/loader-nextjs';
import DataProvider from './app/datatable/components/DataProvider.jsx';
import DataProviderViews from './app/datatable/components/DataProviderViews.jsx';
import DataView from './app/datatable/components/DataView.jsx';
import DataTableNew from './app/datatable/components/DataTableNew.jsx';
import Navigation from './app/navigation/components/Navigation.jsx';
import EventTimeline from './app/timeline/components/EventTimeline.jsx';
import { DEFAULT_SAMPLE_EVENTS } from './app/timeline/data/defaultSampleEvents.js';
import { SmartDataProvider } from './components/SmartDataTable/SmartDataProvider.jsx';
import { SmartDataTable } from './components/SmartDataTable/SmartDataTable.jsx';
import { ReportControls } from './app/report-table/components/ReportControls.jsx';
import { ViewSwitcher } from './components/ViewSwitcher.jsx';

const dataProviderMeta = {
  name: 'DataProvider',
  displayName: 'Elbrit DataProvider',
  section: 'ElbritCoreLib',
  providesData: true,
  importPath: './src/app/datatable/components/DataProvider',
  isDefaultExport: true,
  props: {
    presetDataSource: {
      type: 'string',
      displayName: 'presetDataSource',
      description: 'When set with presetName, loads config from Firebase via resolveFirebaseConfig.',
    },
    presetName: {
      type: 'string',
      displayName: 'presetName',
      description: 'Firebase preset name; used with presetDataSource.',
    },
    offlineData: 'object',
    overrides: {
      type: 'object',
      displayName: 'overrides',
      description:
        'Optional { variables?, token?, config? }. GraphQL variables + Authorization; config is a partial preset overlay merged in DataProvider (not read by DataProviderNew). Full table config is not a Studio prop — use presets or code with __internal.config.',
    },
    onDataChange: {
      type: 'eventHandler',
      argTypes: [{ name: 'notification', type: 'object' }],
    },
    onError: {
      type: 'eventHandler',
      argTypes: [{ name: 'error', type: 'object' }],
    },
    children: 'slot',
  },
};

const dataProviderViewsMeta = {
  name: 'DataProviderViews',
  displayName: 'Elbrit DataProvider (Views)',
  section: 'ElbritCoreLib',
  providesData: true,
  importPath: './src/app/datatable/components/DataProviderViews',
  isDefaultExport: true,
  description:
    'Same data engine as Elbrit DataProvider — one fetch, one filter/sort state — but its single slot is tabbed. Drop an Elbrit DataView per tab and build each layout in Studio against $ctx.data. View state is on $ctx.view.',
  props: {
    // --- view/tab surface (this is what differs from Elbrit DataProvider) ---
    views: {
      type: 'object',
      displayName: 'views',
      description:
        'Tabs to offer. Either ["Cards","Table"] or [{ id, label, icon }]. `icon` is a PrimeReact class, e.g. "pi pi-th-large". Each id must match a DataView viewId.',
      defaultValue: [
        { id: 'cards', label: 'Cards', icon: 'pi pi-th-large' },
        { id: 'table', label: 'Table', icon: 'pi pi-table' },
      ],
    },
    defaultView: {
      type: 'string',
      displayName: 'defaultView',
      description: 'View id shown first. Defaults to the first entry in views.',
    },
    activeView: {
      type: 'string',
      displayName: 'activeView',
      description: 'Leave unset for the provider to own the selection. Set it to drive the tabs from your own state.',
    },
    onViewChange: {
      type: 'eventHandler',
      argTypes: [{ name: 'viewId', type: 'string' }],
    },
    showViewSwitcher: {
      type: 'boolean',
      defaultValue: true,
      description: 'Turn off to build your own switcher in Studio and call $ctx.view.setActiveView(id).',
    },
    viewSwitcherPosition: {
      type: 'choice',
      options: ['header', 'top', 'bottom'],
      defaultValue: 'header',
      description:
        '"header" sits it on the provider control row, right of Filter / Sort and the sync button. "top"/"bottom" give it its own row inside the slot.',
    },
    viewSwitcherAlign: {
      type: 'choice',
      options: ['left', 'center', 'right'],
      defaultValue: 'right',
      description: 'Only applies to the "top"/"bottom" positions; in the header it is always right-aligned.',
    },
    viewSwitcherClassName: { type: 'string' },
    keepInactiveMounted: {
      type: 'boolean',
      defaultValue: true,
      description:
        'Keep hidden views mounted so a table keeps its scroll/expanded rows when you tab away. Turn off to unmount them.',
    },
    className: { type: 'string' },
    // --- search bar ---
    showSearch: {
      type: 'boolean',
      defaultValue: false,
      description:
        'Full-width search bar above the control row, with a recent-searches panel. Drives the provider\'s own multi-field search, so cards and table filter together. Requires the query doc to have clientSave: true and a searchFields map.',
    },
    searchPlaceholder: { type: 'string', defaultValue: 'Search product or brand…' },
    showRecentSearches: {
      type: 'boolean',
      defaultValue: true,
      description: 'Show previously used searches when the input is focused (kept in localStorage).',
    },
    recentSearchLimit: { type: 'number', defaultValue: 5 },
    recentSearchStorageKey: {
      type: 'string',
      description: 'Set a distinct key to keep one page\'s recent searches separate from another\'s.',
    },
    compactHeader: {
      type: 'boolean',
      description:
        'Compact control row: hides the engine\'s own header controls and renders [⛭ sort pill] [⟳ 5 Aug, 11:25] … [Cards | Table] on one line, mobile-sized. Only the buttons are restyled — the sort pill opens the ORIGINAL Filter/Sort sidebar (searchFields/sortFields from the query doc) and the refresh pill runs the same sync. Defaults to ON whenever showSearch is on; set false to keep the engine header alongside the search bar. Note: month-range queries need the engine header for the month picker — keep this off for those.',
    },
    hideNativeFilterSort: {
      type: 'boolean',
      defaultValue: false,
      description:
        'Hide the built-in Filter / Sort button even without sortOptions. Applied-filter chips stay visible either way.',
    },
    // --- A–Z letter rail ---
    showLetterRail: {
      type: 'boolean',
      defaultValue: false,
      description:
        'A–Z jump rail down the right edge, owned by the provider. Clicking a letter scrolls to the element with a matching data-letter attribute in the slot (Product Catalog Cards renders these; any custom layout can add data-letter="A" to its sections). Letters with no data are dimmed; the active letter tracks scrolling.',
    },
    letterRailField: {
      type: 'string',
      description:
        'Column that feeds the rail\'s letters, e.g. "brand__name" — connect this and search/filter dim letters live from the provider\'s own data. Leave empty to let the rail learn its letters from the rendered data-letter sections instead.',
    },
    letterRailViews: {
      type: 'object',
      defaultValue: ['cards'],
      description:
        'View ids where the rail shows. Defaults to ["cards"] — the table view has no letter sections, so the rail hides there. Empty array = show on every view.',
    },
    // --- slot spacing ---
    contentPadding: {
      type: 'choice',
      options: ['default', 'tight', 'none'],
      defaultValue: 'default',
      description:
        'Inset the provider puts around the slot content. "default" = px-3 pt-3 pb-4 (sm:px-4). "tight" = px-1. "none" = no padding at all, so the layout inside the slot owns its own spacing — use this when your cards already carry margins.',
    },
    contentClassName: {
      type: 'string',
      description:
        'Escape hatch: replaces the contentPadding classes outright with your own. An empty string means no classes at all. Leave unset to use contentPadding.',
    },
    // --- fetch size (server-side limit, not a client slice) ---
    enableServerPaging: {
      type: 'boolean',
      defaultValue: false,
      description:
        'Let the page-size control drive the query\'s own limit variable, so the SERVER returns fewer rows. REQUIRES the query body to declare the variable, e.g. query Doctors($first: Int = 10) { Leads(first: $first, ...) } — a query that does not declare it keeps its own hardcoded limit and this does nothing. On its own this means search / sort / the A–Z rail only cover the rows actually loaded: turn on enableServerSearch / enableServerSort to push those to the server instead.',
    },
    pageSize: {
      type: 'number',
      defaultValue: 25,
      description:
        'Rows to fetch initially, and the step "Load more" adds each time. Also sets the engine\'s own row window so sortedData- and paginatedData-bound views agree.',
    },
    pageStep: {
      type: 'number',
      description:
        'Rows each FOLLOWING batch adds, when it should differ from pageSize — e.g. pageSize 50 to fill the first screen, pageStep 25 to top up in smaller steps after that. Leave unset to keep using pageSize for both. This is also what paces SCROLL-loading, because a batch loads when the reader nears the end and a bigger step pushes that further away: measured over 12 one-screen phone flicks, a step of 10 rows loaded every 2 flicks, 25 every 4, and 50 every 6.',
    },
    loadMoreMode: {
      type: 'choice',
      options: ['button', 'scroll', 'both'],
      defaultValue: 'button',
      description:
        'How the next batch is asked for. "button" (default) = tap Load more. "scroll" = it loads by itself when the reader nears the end, with skeleton rows while the batch is in flight, so reaching the bottom never looks like the end of the data. "both" = the same, with the button kept as a manual fallback. Works in the table view as well as in cards: whatever element scrolled is measured, so the table\'s own inner scroller counts. In the scroll modes the table is also made continuous — the visible window is held at every row fetched and DataTableNew\'s own row paginator is hidden, since both would otherwise fight it. Stay on "button" if readers should page the table by hand.',
    },
    infiniteScrollMargin: {
      type: 'string',
      defaultValue: '400px',
      description:
        'How far ahead of the end of the list the next batch starts fetching, so it is usually there before the reader arrives. Any CSS length; larger means earlier and more eager.',
    },
    loadTrigger: {
      type: 'choice',
      options: ['near-end', 'distance'],
      defaultValue: 'near-end',
      description:
        'What asks for the next batch. "near-end" (default) fetches as the end of the list comes within infiniteScrollMargin — it paces itself, because each batch pushes the end further away. "distance" fetches every scrollDistancePerBatch pixels of scrolling instead, wherever the reader is in the list: a steady prefetch. Measured over 12 one-screen phone flicks with 20-row batches of 80px rows, "distance" at 500px loaded 14 batches for 12 screens of reading, and at 1500px loaded 4 — so set the distance to about what one batch adds (pageStep x row height) or it will outrun the reader, and every batch re-fetches rows 1..N.',
    },
    scrollDistancePerBatch: {
      type: 'number',
      defaultValue: 0,
      description:
        'Minimum DOWNWARD scrolling between batches, in pixels — how much reading someone does before the next fetch. 0 means half the visible height of whatever is scrolling, which suits a phone and a desktop without picking a number for each; 500 on a phone is about two thirds of a screen. Scrolling back up to re-read does not count. With loadTrigger "distance" this IS the trigger. With "near-end" it is only a floor between batches, and in practice it rarely bites there: reaching the end of the list means reaching the bottom, where it has to be waived or the reader would be stranded on the last row.',
    },
    skeletonCount: {
      type: 'number',
      defaultValue: 3,
      description: 'Placeholder rows shown at the end of the list while a scroll-triggered batch loads (1–12).',
    },
    skeletonVariant: {
      type: 'choice',
      options: ['card', 'row'],
      defaultValue: 'card',
      description: 'Shape of those placeholders: "card" for a cards view, "row" for a denser list.',
    },
    maxAutoBatches: {
      type: 'number',
      defaultValue: 20,
      description:
        'How many batches scrolling may load before the reader has to tap once to continue (a Load more button appears, and continuing resets the budget). This is also the backstop for a list whose container never grows — a table that scrolls inside itself keeps the sentinel permanently in view, and without a ceiling one scroll would fetch every remaining row. A new search resets it. 0 removes the ceiling.',
    },
    pageSizeOptions: {
      type: 'object',
      defaultValue: [10, 25, 50, 100, 200],
      description: 'Choices in the page-size pill. The current size is always included even if it is not listed here.',
    },
    pageSizeVariable: {
      type: 'string',
      defaultValue: 'first',
      description:
        'GraphQL variable that carries the limit. "first" for the Relay-style ERP queries; change it for a query that uses e.g. "limit".',
    },
    showPageSizeControl: {
      type: 'boolean',
      defaultValue: true,
      description: 'Show the "25 / page" pill on the control row.',
    },
    showLoadMore: {
      type: 'boolean',
      defaultValue: true,
      description:
        'Show the row count + "Load more" bar under the content. Load more raises the fetch size by one pageSize step and re-queries — it is not cursor paging (after + filter throws on our ERP), so rows always come down from the first one.',
    },
    paginatorPosition: {
      type: 'choice',
      options: ['header', 'bottom', 'both'],
      defaultValue: 'both',
      description: 'Where the fetch-size controls go: size pill on the header row, Load more under the content, or both.',
    },
    loadMorePlacement: {
      type: 'choice',
      options: ['sticky', 'fixed', 'static'],
      defaultValue: 'sticky',
      description:
        'How the Load-more bar sits while scrolling. "sticky" (default) keeps it visible at the bottom of the scrolling area and stays in flow, so it can never cover the last row — it needs a scrolling ancestor and no ancestor with overflow:hidden. "fixed" pins it to the viewport (space is reserved automatically) for pages whose scroll container is not the provider content. "static" leaves it at the end of the list.',
    },
    loadMoreBottomGap: {
      type: 'string',
      defaultValue: '4.5rem',
      description:
        'Gap below the bar for sticky/fixed placement, clearing the app\'s bottom navigation (fixed, 4rem) — the device safe-area inset is added on top of this automatically. Any CSS length.',
    },
    loadMoreVariant: {
      type: 'choice',
      options: ['floating', 'bar', 'plain'],
      defaultValue: 'floating',
      description:
        '"floating" = centered white capsule with shadow over the content. "bar" = full-width footer with a top border. "plain" = no background (the original look; it will be unreadable over content when sticky).',
    },
    // --- server-side search / sort (cover the whole dataset) ---
    enableServerSearch: {
      type: 'boolean',
      defaultValue: false,
      description:
        'Search the WHOLE dataset instead of the loaded page. Without this, a search on a 45,000-row list with pageSize 25 searches 25 rows. With it, the term becomes a query filter and the ERP matches every row, and the Load-more bar shows the real match count. REQUIRES the query body to expose its filter as a variable: $filter: [DBFilterInput] = [{fieldname: "status", value: "ACTIVE", operator: EQ}] passed as filter: $filter (the default keeps the query meaning the same rows as before). Hover the search box to see why it is unavailable when the body is not set up.',
    },
    enableServerSort: {
      type: 'boolean',
      defaultValue: false,
      description:
        'Sort the WHOLE dataset on the server, so "A → Z" orders all 45,000 rows and the first page is the true first page — not the loaded page reshuffled. The existing Filter/Sort sidebar stays the only place a sort is chosen. REQUIRES the body to declare sortBy: {field: $sortField, direction: $sortDirection} with $sortField: <Doctype>SortField (e.g. LeadSortField, values are the fieldname in UPPER_SNAKE) and $sortDirection: SortDirection.',
    },
    serverSearchFields: {
      type: 'object',
      description:
        'ERP fieldnames a server-side search looks in, e.g. ["lead_name", "custom_specialty", "city"]. Leave unset to derive them from the query doc\'s own searchFields (a flattened "custom_specialty__name" becomes the filterable "custom_specialty"), which keeps the two from drifting apart. A fieldname the ERP cannot filter on is dropped after its first attempt rather than failing the search.',
    },
    serverSearchRootField: {
      type: 'string',
      description:
        'Which root list to search in a body that selects more than one (e.g. Primary fetches targets AND invoices). Leave unset for a single-list query.',
    },
    serverSearchMatchLimit: {
      type: 'number',
      defaultValue: 500,
      description:
        'Cap on matches when a term hits SEVERAL fields at once. The ERP filter is AND-only — there is no OR — so a multi-field search is resolved by collecting matching ids per field and filtering on that union, which has to be bounded. A term matching only one field ignores this entirely and filters by LIKE, uncapped.',
    },
    serverSearchDebounceMs: {
      type: 'number',
      defaultValue: 400,
      description:
        'Quiet period before a typed term goes to the server. Each change costs a probe round plus a re-fetch of the page, so this is longer than a client-side search would need.',
    },
    // --- cache ---
    staleWhileRevalidate: {
      type: 'boolean',
      defaultValue: false,
      description:
        'Show last session\'s data instantly while the provider loads, then swap in the fresh result. VARIANT-ONLY: the underlying DataProvider\'s loading flow is untouched — a bridge snapshots the published data after each load and re-provides it during the next load ($ctx.data.main.isRevalidating is true during the stale window). First-ever visit still shows the normal spinner. Avoid on tables where users EDIT rows.',
    },
    cacheKey: {
      type: 'string',
      description:
        'Storage key for the stale-data snapshot. Defaults to presetDataSource + presetName — set it explicitly when two pages share the same preset but should not share snapshots.',
    },
    // --- identical to Elbrit DataProvider ---
    presetDataSource: {
      type: 'string',
      displayName: 'presetDataSource',
      description: 'When set with presetName, loads config from Firebase via resolveFirebaseConfig.',
    },
    presetName: {
      type: 'string',
      displayName: 'presetName',
      description: 'Firebase preset name; used with presetDataSource.',
    },
    offlineData: 'object',
    overrides: {
      type: 'object',
      displayName: 'overrides',
      description:
        'Optional { variables?, token?, config? }. GraphQL variables + Authorization; config is a partial preset overlay merged in DataProvider (not read by DataProviderNew). Full table config is not a Studio prop — use presets or code with __internal.config.',
    },
    onDataChange: {
      type: 'eventHandler',
      argTypes: [{ name: 'notification', type: 'object' }],
    },
    onError: {
      type: 'eventHandler',
      argTypes: [{ name: 'error', type: 'object' }],
    },
    children: {
      type: 'slot',
      defaultValue: [
        { type: 'component', name: 'DataView', props: { viewId: 'cards' } },
        {
          type: 'component',
          name: 'DataView',
          props: {
            viewId: 'table',
            children: [{ type: 'component', name: 'DataTableNew' }],
          },
        },
      ],
    },
  },
  states: {
    activeView: {
      type: 'writable',
      variableType: 'text',
      valueProp: 'activeView',
      onChangeProp: 'onViewChange',
    },
  },
};

const dataViewMeta = {
  name: 'DataView',
  displayName: 'Elbrit DataView',
  section: 'ElbritCoreLib',
  importPath: './src/app/datatable/components/DataView',
  isDefaultExport: true,
  parentComponentName: 'DataProviderViews',
  description:
    'One tab of an Elbrit DataProvider (Views). Shows its children only while its viewId is the active view. Layout-transparent by default, so it will not break a table\'s height chain.',
  props: {
    viewId: {
      type: 'string',
      displayName: 'viewId',
      description: 'Must match an id in the parent provider\'s `views` list.',
    },
    keepMounted: {
      type: 'boolean',
      description: 'Overrides the parent\'s keepInactiveMounted for this one view.',
    },
    className: { type: 'string' },
    children: 'slot',
  },
};

const dataTableNewMeta = {
  name: 'DataTableNew',
  displayName: 'Elbrit DataTable',
  section: 'ElbritCoreLib',
  importPath: './src/app/datatable/components/DataTableNew',
  isDefaultExport: true,
  props: {
    slotId: 'string',
    tableName: { type: 'string', defaultValue: 'table' },
    onCellEditComplete: {
      type: 'eventHandler',
      description:
        'Fired with one argument: an object with rowData, field, newValue, oldValue, originalEvent (and other column-editor props).',
      argTypes: [{ name: 'payload', type: 'object' }],
    },
    isCellEditable: {
      type: "function",
      description: "Function to determine if a cell is editable: (rowData, field) => boolean",
    },
  },
};

const navigationMeta = {
  name: 'Navigation',
  displayName: 'Elbrit Navigation',
  section: 'ElbritCoreLib',
  importPath: './src/app/navigation/components/Navigation',
  isDefaultExport: true,
  props: {
    items: {
      type: 'object',
      defaultValue: [],
      displayName: 'items',
      description: 'Array of navigation item objects (label, path, iconKey, …).',
    },
    defaultIndex: { type: 'number', defaultValue: 0 },
    desktopWidth: { type: 'string', defaultValue: '16rem' },
    desktopHeight: { type: 'string', defaultValue: '93dvh' },
    mobileWidth: { type: 'string', defaultValue: '100%' },
    mobileHeight: { type: 'string', defaultValue: '4rem' },
    showCollapse: { type: 'boolean', defaultValue: true },
    iconMap: {
      type: 'object',
      displayName: 'iconMap',
      description:
        'Optional map of iconKey → { active, inactive, defaultProps, … }. Defaults to built-in icon map when omitted.',
    },
  },
};

const eventTimelineMeta = {
  name: 'EventTimeline',
  displayName: 'Elbrit Event Timeline',
  section: 'ElbritCoreLib',
  importPath: './src/app/timeline/components/EventTimeline',
  isDefaultExport: true,
  props: {
    events: {
      type: 'object',
      displayName: 'events',
      description:
        'Array of timeline items. With `onEventClick` set, only items with `clickable: true` are interactive; omit or false means not clickable. With no `onEventClick`, rows are not interactive.',
      defaultValue: DEFAULT_SAMPLE_EVENTS,
    },
    align: {
      type: 'string',
      displayName: 'align',
      description: 'Timeline alignment: left, right, alternate (vertical cards).',
      defaultValue: 'alternate',
    },
    className: {
      type: 'string',
      displayName: 'className',
      defaultValue: '',
    },
    onEventClick: {
      type: 'eventHandler',
      displayName: 'onEventClick',
      description:
        'Called when a clickable event marker or card is clicked (only items with `clickable: true`). Args: timelineEvent, clickSource (`marker` | `card`).',
      argTypes: [
        { name: 'timelineEvent', type: 'object' },
        { name: 'clickSource', type: 'string' },
      ],
    },
  },
};

const smartDataProviderMeta = {
  name: 'SmartDataProvider',
  displayName: 'Elbrit SmartDataProvider',
  section: 'ElbritCoreLib',
  providesData: true,
  importPath: './src/components/SmartDataTable/SmartDataProvider',
  importName: 'SmartDataProvider',
  props: {
    config: {
      type: 'string',
      displayName: 'Report Name',
      description: 'Name of a report saved in the Firestore reports collection.',
    },
    overrides: {
      type: 'object',
      displayName: 'Config Overrides',
      description: 'Deep-merged onto the loaded reportConfig. Objects merge recursively; arrays replace.',
      defaultValue: {},
    },
    children: 'slot',
    toolbarExtra: {
      type: 'slot',
      displayName: 'Toolbar Extra',
      description:
        'Rendered inline inside the built-in controls row (next to Pivot / Display in Lakhs / Filter & Sort), instead of appended below like the main slot.',
    },
  },
};

const reportControlsMeta = {
  name: 'ReportControls',
  displayName: 'Elbrit ReportControls',
  section: 'ElbritCoreLib',
  importPath: './src/app/report-table/components/ReportControls',
  importName: 'ReportControls',
  props: {
    controls: {
      type: 'object',
      displayName: 'controls',
      description: 'Array of control definitions. Each item: { type, key, label, defaultValue, … }. Types: toggle, dateRange, filterSort, refresh.',
      defaultValue: [],
    },
    viewIds: {
      type: 'object',
      displayName: 'viewIds',
      description: 'Array of SmartDataTable viewId strings this control bar should target.',
      defaultValue: [],
    },
  },
};

const smartDataTableMeta = {
  name: 'SmartDataTable',
  displayName: 'Elbrit SmartDataTable',
  section: 'ElbritCoreLib',
  importPath: './src/components/SmartDataTable/SmartDataTable',
  importName: 'SmartDataTable',
  props: {
    viewId: {
      type: 'string',
      displayName: 'viewId',
      description: 'Unique identifier for this table\'s Zustand state slice.',
    },
    view: {
      type: 'string',
      displayName: 'view',
      description: 'Report view name passed to the API (e.g. "Department HQ"). Used with reportConfig on the parent SmartDataProvider.',
    },
    loadingMessage: {
      type: 'string',
      displayName: 'loadingMessage',
      description: 'Message shown while data is loading for this view.',
    },
  },
};

const viewSwitcherMeta = {
  name: 'ViewSwitcher',
  displayName: 'Elbrit View Switcher',
  section: 'ElbritCoreLib',
  importPath: './src/components/ViewSwitcher',
  importName: 'ViewSwitcher',
  description:
    'Standalone segmented control (e.g. Cards / Table). Not tied to any provider — drop it into the toolbarExtra slot, or anywhere else, and bind its value to a Plasmic variable to drive which layout shows. Also used internally by Elbrit DataProvider (Views) for its built-in view switcher.',
  props: {
    views: {
      type: 'object',
      displayName: 'views',
      description:
        'Options to offer. Either ["Cards","Table"] or [{ id, label, icon }]. `icon` is a PrimeReact class, e.g. "pi pi-th-large".',
      defaultValue: [
        { id: 'cards', label: 'Cards', icon: 'pi pi-th-large' },
        { id: 'table', label: 'Table', icon: 'pi pi-bars' },
      ],
    },
    value: {
      type: 'string',
      displayName: 'value',
      description: 'Leave unset for the component to own its own selection. Set it to drive the toggle from your own state.',
    },
    defaultValue: {
      type: 'string',
      displayName: 'defaultValue',
      description: 'Initial selected id when uncontrolled. Defaults to the first entry in views.',
    },
    onChange: {
      type: 'eventHandler',
      argTypes: [{ name: 'viewId', type: 'string' }],
    },
    height: {
      type: 'string',
      displayName: 'height',
      defaultValue: '1.75rem',
      description: 'CSS height of the control, e.g. "1.75rem" or "32px". Defaults to 1.75rem to line up with SmartDataProvider\'s other toolbar controls.',
    },
    className: { type: 'string' },
  },
  states: {
    value: {
      type: 'writable',
      variableType: 'text',
      valueProp: 'value',
      onChangeProp: 'onChange',
    },
  },
};

/**
 * Register Elbrit core code components on your Plasmic loader (same loader as your Studio project).
 * @param {import('@plasmicapp/loader-nextjs').PlasmicComponentLoader} loader
 */
export function registerElbritCoreComponents(loader) {
  loader.registerComponent(DataProvider, dataProviderMeta);
  loader.registerComponent(DataTableNew, dataTableNewMeta);
  loader.registerComponent(DataProviderViews, dataProviderViewsMeta);
  loader.registerComponent(DataView, dataViewMeta);
  loader.registerComponent(Navigation, navigationMeta);
  loader.registerComponent(EventTimeline, eventTimelineMeta);
  loader.registerComponent(SmartDataProvider, smartDataProviderMeta);
  loader.registerComponent(SmartDataTable, smartDataTableMeta);
  loader.registerComponent(ReportControls, reportControlsMeta);
  loader.registerComponent(ViewSwitcher, viewSwitcherMeta);
}

const ElbritCoreLib = initPlasmicLoader({
  projects: [],
});

registerElbritCoreComponents(ElbritCoreLib);

ElbritCoreLib.components = {
  DataProvider,
  DataProviderViews,
  DataView,
  DataTableNew,
  Navigation,
  EventTimeline,
  SmartDataProvider,
  SmartDataTable,
  ReportControls,
  ViewSwitcher,
};

export { ElbritCoreLib };
export { DataProvider, DataProviderViews, DataView, DataTableNew, Navigation, EventTimeline, SmartDataProvider, SmartDataTable, ReportControls, ViewSwitcher };
