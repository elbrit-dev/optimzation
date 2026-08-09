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
};

export { ElbritCoreLib };
export { DataProvider, DataProviderViews, DataView, DataTableNew, Navigation, EventTimeline, SmartDataProvider, SmartDataTable, ReportControls };
