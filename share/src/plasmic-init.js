'use client';

import { initPlasmicLoader } from '@plasmicapp/loader-nextjs';
import DataProvider from './app/datatable/components/DataProvider.jsx';
import DataTableNew from './app/datatable/components/DataTableNew.jsx';
import Navigation from './app/navigation/components/Navigation.jsx';
import EventTimeline from './app/timeline/components/EventTimeline.jsx';
import { DEFAULT_SAMPLE_EVENTS } from './app/timeline/data/defaultSampleEvents.js';

const dataProviderMeta = {
  name: 'DataProvider',
  displayName: 'Elbrit DataProvider',
  section: 'ElbritCoreLib',
  providesData: true,
  importPath: './src/app/datatable/components/DataProvider',
  isDefaultExport: true,
  props: {
    config: 'object',
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
      description: 'Optional { variables, token } for GraphQL variables and Authorization override.',
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

/**
 * Register Elbrit core code components on your Plasmic loader (same loader as your Studio project).
 * @param {import('@plasmicapp/loader-nextjs').PlasmicComponentLoader} loader
 */
export function registerElbritCoreComponents(loader) {
  loader.registerComponent(DataProvider, dataProviderMeta);
  loader.registerComponent(DataTableNew, dataTableNewMeta);
  loader.registerComponent(Navigation, navigationMeta);
  loader.registerComponent(EventTimeline, eventTimelineMeta);
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
};

export { ElbritCoreLib };
export { DataProvider, DataTableNew, Navigation, EventTimeline };
