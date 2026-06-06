'use client';

import { initPlasmicLoader } from '@plasmicapp/loader-nextjs';
import DataProvider from './app/datatable/components/DataProvider.jsx';
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
  DataTableNew,
  Navigation,
  EventTimeline,
  SmartDataProvider,
  SmartDataTable,
  ReportControls,
};

export { ElbritCoreLib };
export { DataProvider, DataTableNew, Navigation, EventTimeline, SmartDataProvider, SmartDataTable, ReportControls };
