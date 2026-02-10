import { initPlasmicLoader, DataProvider as PlasmicDataProvider } from "@plasmicapp/loader-nextjs";
import jmespath from "jmespath";
import _ from "lodash";
import jmespath_plus from '@metrichor/jmespath-plus';
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import DataTable from "./components/DataTable";
import DataProvider from "./share/datatable/components/DataProviderNew";
import DataTableNew from "./share/datatable/components/DataTableNew";
import FirebaseUIComponent from "./components/FirebaseUIComponent";
import CalendarPage from "@calendar/components/CalendarPage";
import NovuInbox from "./components/NovuInbox";
// import TableDataProvider from "./components/TableDataProvider";
import jsonata from 'jsonata';
import Navigation from "./share/navigation/components/Navigation";
import { db } from "./firebase";

// Validate tag: if deployLive is false,tag must be "dev"
// const plasmicTag = process.env.NEXT_PUBLIC_PLASMIC_TAG;
// const settings = await db.collection('DevOps').doc('Setting').get().catch(() => null);
// const isLive = settings?.data()?.deployLive;

// if (plasmicTag && plasmicTag !== "dev" && !isLive) {
//   throw new Error(`Invalid Plasmic Tag "${plasmicTag}" for current deployment setting.`);
// }

export const PLASMIC = initPlasmicLoader({
  projects: [
    {
      id: "b6mXu8rXhi8fdDd6jwb8oh",
      token: "hKaQFlYDzP6By8Fk45XBc6AhEoXVcAk3jJA5AvDn7lEnJI4Ho97wv9zkcp0LvOnjUhV0wQ6ZeeXBj5V135I9YA",
      version: process.env.NEXT_PUBLIC_PLASMIC_TAG ,
    },
  ],

  // By default Plasmic will use the last published version of your project.
  // For development, you can set preview to true, which will use the unpublished
  // project, allowing you to see your designs without publishing.  Please
  // only use this for development, as this is significantly slower.
  preview: false,
});
// You can register any code components that you want to use here; see
// https://docs.plasmic.app/learn/code-components-ref/
// And configure your Plasmic project to use the host url pointing at
// the /plasmic-host page of your nextjs app (for example,
// http://localhost:3000/plasmic-host).  See
// https://docs.plasmic.app/learn/app-hosting/#set-a-plasmic-project-to-use-your-app-host

// PLASMIC.registerComponent(LocalStorageStateProvider, {
//   name: 'LocalStorageStateProvider',
//   props: {
//     storageKey: 'string',
//     initialValue: 'string',
//     children: 'slot',
    
//   },
//   providesData: true, 
// });

// Helper function to get valid teams based on posting date
const getValidTeams = (items, itemName, postingDate) => {
  const item = items?.[itemName];
  if (!item) return {};
  const d = new Date(postingDate);
  return Object.fromEntries(Object.entries(item.team ?? {}).filter(([, t]) => (!t.valid_from || d >= new Date(t.valid_from)) && (!t.valid_to || d <= new Date(t.valid_to))))
}

// Function to add sales team and HQ information
const addStHq = (itemMap, cusMap, data, itemKey, dateKey, cusKey, hqKey) => {
  const itemStArr = getValidTeams(itemMap, data[itemKey], data[dateKey])
  const custTeam = cusMap[data[cusKey].trim()]
  const st = _.intersection(Object.keys(custTeam), Object.keys(itemStArr))
  let sthq = {"sales_team": null, "hq": null}
  if (st.length > 0) sthq = {"sales_team": st[0], "hq": custTeam[st[0]][hqKey]}
  if (st.length > 1) console.log("Extra mapping found :", data)
  return {...data, ...sthq}
}

// Global state management (similar to _app.jsx but accessible via $$)
let globalStateStore = {};
const globalStateListeners = new Set();

const notifyListeners = () => {
  globalStateListeners.forEach(listener => listener(globalStateStore));
};

const setGlobalState = (stateName, data) => {
  if (typeof stateName === 'string') {
    globalStateStore = {
      ...globalStateStore,
      [stateName]: data
    };
  } else if (typeof stateName === 'object' && stateName !== null) {
    globalStateStore = {
      ...globalStateStore,
      ...stateName
    };
  }
  notifyListeners();
  
  // Update window.state reference
  if (typeof window !== 'undefined') {
    window.state = globalStateStore;
  }
  
  return globalStateStore;
};

const getGlobalState = (stateName) => {
  if (stateName) {
    return globalStateStore[stateName];
  }
  return globalStateStore;
};

if (typeof window !== 'undefined') {
  window.jmespath = jmespath;
  window._ = _;
  window.useState = useState;
  window.useEffect = useEffect;
  window.useCallback = useCallback;
  window.useMemo = useMemo;
  window.useRef = useRef;
  window.setGlobalState = setGlobalState;
  window.getGlobalState = getGlobalState;
  window.state = globalStateStore;
}

// Helper component to provide global utilities
export const GlobalUtils = ({ children }) => {
  return (
    <PlasmicDataProvider name="utils" data={{ _, jmespath, jmespath_plus, jsonata }}>
      {children}
    </PlasmicDataProvider>
  );
};

PLASMIC.registerGlobalContext(GlobalUtils, {
  name: "GlobalUtils",
  props: {},
  providesData: true,
  importPath: "./plasmic-init",
});

PLASMIC.registerFunction(jmespath_plus.search, {
  name: "jmespath_plus",
  params: [
    { name: "data", type: "object" },
    { name: "expression", type: "string" }
  ],
  description: "Execute a JMESPath Plus expression on data"
});

PLASMIC.registerFunction(jmespath.search, {
  name: "jmespath",
  description: "Run a JMESPath expression on JSON data",
  parameters: [
    { name: "data", type: "any" },
    { name: "expression", type: "string" },
  ],
  returnType: "any",
});

PLASMIC.registerFunction(jsonata, {
  name: "jsonata",
  params: [
    { name: "expression", type: "string" }
  ],
  description: "Create a JSONata expression"
});
PLASMIC.registerFunction(addStHq, {
  name: "addStHq",
  description: "Add sales team and HQ information to data based on item and customer mappings",
  parameters: [
    { name: "itemMap", type: "object", description: "Item mapping object" },
    { name: "cusMap", type: "object", description: "Customer mapping object" },
    { name: "data", type: "object", description: "Data object to process" },
    { name: "itemKey", type: "string", description: "Key to access item in data" },
    { name: "dateKey", type: "string", description: "Key to access posting date in data" },
    { name: "cusKey", type: "string", description: "Key to access customer in data" },
    { name: "hqKey", type: "string", description: "Key to access HQ in customer team" },
  ],
  returnType: "object",
});

PLASMIC.registerFunction(useState, {
  name: "useState",
  description: "React useState hook (only works in React component context)",
  parameters: [
    { name: "initialValue", type: "any", description: "Initial state value" },
  ],
  returnType: "array",
});

PLASMIC.registerFunction(useEffect, {
  name: "useEffect",
  description: "React useEffect hook (only works in React component context)",
  parameters: [
    { name: "effect", type: "function", description: "Effect function to run" },
    { name: "deps", type: "array", description: "Dependency array", optional: true },
  ],
  returnType: "void",
});

PLASMIC.registerFunction(useCallback, {
  name: "useCallback",
  description: "React useCallback hook (only works in React component context)",
  parameters: [
    { name: "callback", type: "function", description: "Callback function to memoize" },
    { name: "deps", type: "array", description: "Dependency array" },
  ],
  returnType: "function",
});

PLASMIC.registerFunction(useMemo, {
  name: "useMemo",
  description: "React useMemo hook (only works in React component context)",
  parameters: [
    { name: "factory", type: "function", description: "Factory function that returns memoized value" },
    { name: "deps", type: "array", description: "Dependency array" },
  ],
  returnType: "any",
});

PLASMIC.registerFunction(useRef, {
  name: "useRef",
  description: "React useRef hook (only works in React component context)",
  parameters: [
    { name: "initialValue", type: "any", description: "Initial ref value", optional: true },
  ],
  returnType: "object",
});

PLASMIC.registerFunction(setGlobalState, {
  name: "setGlobalState",
  description: "Set global state accessible via getGlobalState",
  parameters: [
    { name: "stateName", type: "string", description: "State key name or object to merge" },
    { name: "data", type: "any", description: "Data to store", optional: true },
  ],
  returnType: "object",
});

PLASMIC.registerFunction(getGlobalState, {
  name: "getGlobalState",
  description: "Get global state by key",
  parameters: [
    { name: "stateName", type: "string", description: "State key name (optional - returns all if omitted)", optional: true },
  ],
  returnType: "any",
});

// Register DataTable Component
PLASMIC.registerComponent(DataTable, {
  name: "DataTable",
  props: {
    data: {
      type: "object",
      description: "The array of data to display in the table",
    },
    queryVariables: {
      type: "object",
      description: "Base variables for the query (provided by DataProvider)",
    },
    onVariableOverridesChange: {
      type: "eventHandler",
      argTypes: [{ name: "overrides", type: "object" }],
    },
    showControls: {
      type: "boolean",
      description: "Toggle the visibility of the table controls (sort, filter, etc.)",
      defaultValue: false,
    },
    dataSource: {
      type: "string",
      description: "The data source ID or 'offline' for local data",
    },
    queryKey: {
      type: "string",
      description: "The specific key within the data source results to display",
    },
    rowsPerPageOptions: {
      type: "object",
      defaultValue: [10, 25, 50, 100],
    },
    defaultRows: {
      type: "number",
      defaultValue: 10,
    },
    scrollable: {
      type: "boolean",
      defaultValue: true,
    },
    scrollHeight: {
      type: "string",
      defaultValue: "600px",
    },
    tableName: {
      type: "string",
      defaultValue: "table",
    },
    enableSort: {
      type: "boolean",
      defaultValue: true,
      description: "Show/hide sorting controls within the header",
    },
    enableFilter: {
      type: "boolean",
      defaultValue: true,
      description: "Show/hide filtering controls within the header",
    },
    enableSummation: {
      type: "boolean",
      defaultValue: true,
      description: "Show/hide summation controls within the header",
    },
    enableGrouping: {
      type: "boolean",
      defaultValue: true,
      description: "Initial grouping state for orchestration layer",
    },
    enableDivideBy1Lakh: {
      type: "boolean",
      defaultValue: false,
      description: "Toggle dividing numerical values by 1,0,00,000 (1 Lakh)",
    },
    percentageColumns: {
      type: "object",
      description: "Configuration for percentage-based columns",
      defaultValue: [],
    },
    textFilterColumns: {
      type: "object",
      description: "Array of fields to use text search instead of multi-select",
      defaultValue: [],
    },
    visibleColumns: {
      type: "object",
      description: "Array of fields to display (empty = all)",
      defaultValue: [],
    },
    onVisibleColumnsChange: {
      type: "eventHandler",
      argTypes: [{ name: "columns", type: "object" }],
    },
    redFields: {
      type: "object",
      defaultValue: [],
    },
    greenFields: {
      type: "object",
      defaultValue: [],
    },
    outerGroupField: {
      type: "string",
      description: "Field to group by (e.g. team name)",
    },
    innerGroupField: {
      type: "string",
      description: "Field to sub-group/aggregate by",
    },
    enableCellEdit: {
      type: "boolean",
      defaultValue: false,
    },
    nonEditableColumns: {
      type: "object",
      defaultValue: [],
    },
    isAdminMode: {
      type: "boolean",
      description: "Enable admin mode to bypass data filtering",
      defaultValue: false,
    },
    salesTeamColumn: {
      type: "string",
      description: "Column name for Sales Team filtering",
    },
    salesTeamValues: {
      type: "object",
      description: "Array of allowed Sales Team values",
      defaultValue: [],
    },
    hqColumn: {
      type: "string",
      description: "Column name for HQ filtering",
    },
    hqValues: {
      type: "object",
      description: "Array of allowed HQ values",
      defaultValue: [],
    },
    enableFullscreenDialog: {
      type: "boolean",
      defaultValue: true,
      description: "Enable/disable fullscreen dialog feature",
    },
    drawerTabs: {
      type: "object",
      description: "Array of tab configurations for the detail drawer (name, outerGroup, innerGroup)",
      defaultValue: [],
    },
    enableReport: {
      type: "boolean",
      defaultValue: false,
    },
    dateColumn: {
      type: "string",
    },
    breakdownType: {
      type: "string",
      defaultValue: "month",
    },
    onDrawerTabsChange: {
      type: "eventHandler",
      argTypes: [{ name: "tabs", type: "object" }],
    },
    onEnableReportChange: {
      type: "eventHandler",
      argTypes: [{ name: "enabled", type: "boolean" }],
    },
    onDateColumnChange: {
      type: "eventHandler",
      argTypes: [{ name: "column", type: "string" }],
    },
    onBreakdownTypeChange: {
      type: "eventHandler",
      argTypes: [{ name: "type", type: "string" }],
    },
    onOuterGroupFieldChange: {
      type: "eventHandler",
      argTypes: [{ name: "field", type: "string" }],
    },
    onInnerGroupFieldChange: {
      type: "eventHandler",
      argTypes: [{ name: "field", type: "string" }],
    },
    controlsPanelSize: {
      type: "number",
      description: "The percentage width of the controls sidebar (0-100)",
      defaultValue: 20,
    },
    columnTypes: {
      type: "object",
      description: "Override column types (e.g., { fieldName: 'number' })",
      defaultValue: { is_internal_customer: "number" },
    },
    onColumnTypesChange: {
      type: "eventHandler",
      argTypes: [{ name: "columnTypes", type: "object" }],
    },
    useOrchestrationLayer: {
      type: "boolean",
      description: "Enable the new orchestration layer for data processing",
      defaultValue: false,
    },
    onSave: {
      type: "eventHandler",
      argTypes: [],
    },
    onAdminModeChange: {
      type: "eventHandler",
      argTypes: [{ name: "isAdminMode", type: "boolean" }],
    },
  },
  importPath: "./components/DataTable",
});

PLASMIC.registerComponent(Navigation, {
  name: "Navigation",
  props: {
    items: {
      type: "object",
      description: "JSON array of navigation items. Each item should have: label (string), path (string), iconActive (JSX element), iconInactive (JSX element), mobileFullscreen (boolean), mobileOnly (boolean), isDefault (boolean), isDisabled (boolean). Icons must be JSX elements, not strings.",
      defaultValue: [],
    },
    defaultIndex: {
      type: "number",
      defaultValue: 0,
      description: "Fallback index if no URL path matches and no item has isDefault: true",
    },
    desktopWidth: {
      type: "string",
      defaultValue: "16rem",
      description: "Width of the desktop sidebar navigation",
    },
    desktopHeight: {
      type: "string",
      defaultValue: "93dvh",
      description: "Height of the desktop sidebar navigation",
    },
    mobileWidth: {
      type: "string",
      defaultValue: "100%",
      description: "Width of the mobile bottom navigation",
    },
    mobileHeight: {
      type: "string",
      defaultValue: "4rem",
      description: "Height of the mobile bottom navigation",
    },
    showCollapse: {
      type: "boolean",
      defaultValue: true,
      description: "Show/hide the collapse button in desktop sidebar",
    },
  },
  importPath: "./share/navigation/components/Navigation",
});

// Register FirebaseUIComponent
PLASMIC.registerComponent(FirebaseUIComponent, {
  name: "FirebaseUIComponent",
  description: "Native Firebase Authentication UI (Microsoft & Phone)",
  isDefaultExport: true,
  importPath: "./components/FirebaseUIComponent",
  props: {
    className: {
      type: "string",
    },
    onSuccess: {
      type: "eventHandler",
      argTypes: [{ name: "data", type: "object" }],
    },
    onError: {
      type: "eventHandler",
      argTypes: [{ name: "error", type: "object" }],
    },
  },
});

PLASMIC.registerComponent(CalendarPage, {
  name: "CalendarPage",
  props: {
    erpUrl: {
      type: "string",
      helpText: "ERP GraphQL endpoint",
    },
    authToken: {
      type: "string",
      helpText: "User auth token",
    },
    homeUrl: {
      type: "string",
      defaultValue: "/",
      helpText: "Redirect if not logged in",
    },
    me: {
      type: "object",
      helpText: "Result of GraphQL `me` query",
    },
  },
});

PLASMIC.registerComponent(NovuInbox, {
  name: "NovuInbox",
  props: {
    subscriberId: {
      type: "string",
      description: "Novu subscriber ID (user identifier). If not provided, will use 'employeeid' from localStorage, then fall back to NEXT_PUBLIC_NOVU_SUBSCRIBER_ID from environment variables.",
    },
    applicationIdentifier: {
      type: "string",
      description: "Novu application identifier. If not provided, will use NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER from environment variables.",
    },
    subscriberHash: {
      type: "string",
      description: "Optional subscriber hash for HMAC authentication (only needed if using HMAC). If not provided, will use NEXT_PUBLIC_NOVU_SUBSCRIBER_HASH from environment variables. Can be left empty if not using HMAC.",
    },
    email: {
      type: "string",
      description: "User email address (optional). Will be added to OneSignal user profile.",
    },
    phone: {
      type: "string",
      description: "User phone number in E.164 format, e.g., +91XXXXXXXXXX (optional). Will be added to OneSignal user profile.",
    },
    tags: {
      type: "object",
      description: "User tags as key-value pairs (optional). Flat object only, no nested objects. Example: { role: 'admin', division: 'sales' }",
    },
    className: {
      type: "string",
      description: "CSS class name for the container",
    },
  },
  importPath: "./components/NovuInbox",
});

PLASMIC.registerComponent(DataProvider, {
  name: "DataProvider",
  props: {
    offlineData: {
      type: "object",
      description: "Offline/local data to use when dataSource is 'offline'",
    },
    dataSource: {
      type: "string",
      description: "The data source ID or 'offline' for local data",
      defaultValue: "offline",
    },
    selectedQueryKey: {
      type: "string",
      description: "The specific key within the data source results to display",
    },
    variableOverrides: {
      type: "object",
      description: "Overrides for query variables (as an object)",
      defaultValue: {},
    },
    showSelectors: {
      type: "boolean",
      description: "Show/hide data source and query selectors",
      defaultValue: true,
    },
    hideDataSourceAndQueryKey: {
      type: "boolean",
      description: "Explicitly hide the data source and query key dropdowns even if selectors are shown",
    },
    isAdminMode: {
      type: "boolean",
      description: "Enable admin mode to bypass data filtering",
      defaultValue: false,
    },
    salesTeamColumn: {
      type: "string",
      description: "Column name for Sales Team filtering",
    },
    salesTeamValues: {
      type: "object",
      description: "Array of allowed Sales Team values",
      defaultValue: [],
    },
    hqColumn: {
      type: "string",
      description: "Column name for HQ filtering",
    },
    hqValues: {
      type: "object",
      description: "Array of allowed HQ values",
      defaultValue: [],
    },
    columnTypesOverride: {
      type: "object",
      description: "Override column types (e.g., { fieldName: 'number' })",
      defaultValue: {},
    },
    useOrchestrationLayer: {
      type: "boolean",
      description: "Enable the new orchestration layer for data processing",
      defaultValue: false,
    },
    enableSort: {
      type: "boolean",
      defaultValue: true,
      description: "Initial sort state for orchestration layer",
    },
    enableFilter: {
      type: "boolean",
      defaultValue: true,
      description: "Initial filter state for orchestration layer",
    },
    enableSummation: {
      type: "boolean",
      defaultValue: true,
      description: "Initial summation state for orchestration layer",
    },
    enableGrouping: {
      type: "boolean",
      defaultValue: true,
      description: "Initial grouping state for orchestration layer",
    },
    enableDivideBy1Lakh: {
      type: "boolean",
      defaultValue: false,
      description: "Initial divide by 1 lakh state for orchestration layer",
    },
    textFilterColumns: {
      type: "object",
      defaultValue: [],
      description: "Columns to use text search in orchestration layer",
    },
    visibleColumns: {
      type: "object",
      defaultValue: [],
      description: "Initial visible columns for orchestration layer",
    },
    redFields: {
      type: "object",
      defaultValue: [],
      description: "Array of column names to display in red",
    },
    greenFields: {
      type: "object",
      defaultValue: [],
      description: "Array of column names to display in green",
    },
    groupFields: {
      type: "object",
      description: "Array of field names for grouping (supports infinite nesting). Main/outer group: 'sales_team', inner group: 'hq'. Example: ['sales_team', 'hq']",
      defaultValue: ['sales_team', 'hq'],
    },
    percentageColumns: {
      type: "object",
      defaultValue: [],
      description: "Array of percentage column configurations",
    },
    drawerTabs: {
      type: "object",
      defaultValue: [],
      description: "Array of drawer tab configurations",
    },
    enableReport: {
      type: "boolean",
      defaultValue: false,
      description: "Enable report mode with time breakdown",
    },
    dateColumn: {
      type: "string",
      description: "Column name containing date values for report breakdown",
    },
    breakdownType: {
      type: "string",
      defaultValue: "month",
      description: "Type of time breakdown: 'month', 'quarter', 'year'",
    },
    onDataChange: {
      type: "eventHandler",
      argTypes: [{ name: "notification", type: "object" }],
      description: "Callback when data changes",
    },
    onError: {
      type: "eventHandler",
      argTypes: [{ name: "error", type: "object" }],
      description: "Callback when an error occurs",
    },
    onTableDataChange: {
      type: "eventHandler",
      argTypes: [{ name: "data", type: "object" }],
      description: "Callback when table data changes",
    },
    onRawDataChange: {
      type: "eventHandler",
      argTypes: [{ name: "data", type: "object" }],
      description: "Callback when raw data changes",
    },
    onVariablesChange: {
      type: "eventHandler",
      argTypes: [{ name: "variables", type: "object" }],
      description: "Callback when query variables change",
    },
    onDataSourceChange: {
      type: "eventHandler",
      argTypes: [{ name: "dataSource", type: "string" }],
      description: "Callback when data source changes",
    },
    onSavedQueriesChange: {
      type: "eventHandler",
      argTypes: [{ name: "queries", type: "object" }],
      description: "Callback when saved queries change",
    },
    onLoadingQueriesChange: {
      type: "eventHandler",
      argTypes: [{ name: "loading", type: "boolean" }],
      description: "Callback when loading queries state changes",
    },
    onExecutingQueryChange: {
      type: "eventHandler",
      argTypes: [{ name: "executing", type: "boolean" }],
      description: "Callback when query execution state changes",
    },
    onAvailableQueryKeysChange: {
      type: "eventHandler",
      argTypes: [{ name: "keys", type: "object" }],
      description: "Callback when available query keys change",
    },
    onSelectedQueryKeyChange: {
      type: "eventHandler",
      argTypes: [{ name: "key", type: "string" }],
      description: "Callback when selected query key changes",
    },
    onLoadingDataChange: {
      type: "eventHandler",
      argTypes: [{ name: "loading", type: "boolean" }],
      description: "Callback when loading data state changes",
    },
    onVisibleColumnsChange: {
      type: "eventHandler",
      argTypes: [{ name: "columns", type: "object" }],
      description: "Callback when visible columns change",
    },
    onDrawerTabsChange: {
      type: "eventHandler",
      argTypes: [{ name: "tabs", type: "object" }],
      description: "Callback when drawer tabs change",
    },
    onBreakdownTypeChange: {
      type: "eventHandler",
      argTypes: [{ name: "type", type: "string" }],
      description: "Callback when breakdown type changes",
    },
    enableBreakdown: {
      type: "boolean",
      defaultValue: false,
      description: "Enable breakdown mode for report visualization",
    },
    onEnableBreakdownChange: {
      type: "eventHandler",
      argTypes: [{ name: "enabled", type: "boolean" }],
      description: "Callback when breakdown mode is toggled",
    },
    chartColumns: {
      type: "object",
      defaultValue: [],
      description: "Array of column names to display in the chart",
    },
    chartHeight: {
      type: "number",
      defaultValue: 400,
      description: "Height of the chart in pixels",
    },
    allowedColumns: {
      type: "object",
      description: "Developer-controlled: restricts which columns are available for selection",
      defaultValue: [],
    },
    onAllowedColumnsChange: {
      type: "eventHandler",
      argTypes: [{ name: "columns", type: "object" }],
      description: "Callback when allowed columns change",
    },
    derivedColumns: {
      type: "object",
      description: "Array of derived column configurations",
      defaultValue: [],
    },
    reportDataOverride: {
      type: "object",
      description: "Override report data (for custom report data)",
    },
    forceBreakdown: {
      type: "boolean",
      description: "Force breakdown mode (overrides enableBreakdown state)",
    },
    showProviderHeader: {
      type: "boolean",
      defaultValue: true,
      description: "Show/hide the provider header controls",
    },
    children: {
      type: "slot",
      description: "Slot to add custom UI components that can access the table data",
    }
  },
  providesData: true,
  importPath: "./share/datatable/components/DataProviderNew",
});

PLASMIC.registerComponent(DataTableNew, {
  name: "DataTableNew",
  props: {
    rowsPerPageOptions: {
      type: "object",
      defaultValue: [10, 25, 50, 100],
      description: "Array of rows per page options",
    },
    defaultRows: {
      type: "number",
      defaultValue: 10,
      description: "Default number of rows per page",
    },
    scrollable: {
      type: "boolean",
      defaultValue: true,
      description: "Enable/disable table scrolling",
    },
    scrollHeight: {
      type: "string",
      description: "Height of the scrollable area (e.g., '600px')",
    },
    enableCellEdit: {
      type: "boolean",
      defaultValue: false,
      description: "Enable cell editing",
    },
    onCellEditComplete: {
      type: "eventHandler",
      argTypes: [
        { name: "rowData", type: "object" },
        { name: "field", type: "string" },
        { name: "newValue", type: "any" }
      ],
    },
    isCellEditable: {
      type: "function",
      description: "Function to determine if a cell is editable",
    },
    nonEditableColumns: {
      type: "object",
      defaultValue: [],
      description: "Array of column names that cannot be edited",
    },
    enableFullscreenDialog: {
      type: "boolean",
      defaultValue: true,
      description: "Enable/disable fullscreen dialog feature",
    },
    tableName: {
      type: "string",
      defaultValue: "table",
      description: "Name identifier for the table",
    },
    useOrchestrationLayer: {
      type: "boolean",
      defaultValue: false,
      description: "Use orchestration layer (must be child of DataProvider with useOrchestrationLayer=true)",
    },
    onOuterGroupClick: {
      type: "eventHandler",
      argTypes: [{ name: "event", type: "object" }],
      description: "Handler for outer group row clicks",
    },
    onInnerGroupClick: {
      type: "eventHandler",
      argTypes: [{ name: "event", type: "object" }],
      description: "Handler for inner group row clicks",
    },
  },
  importPath: "./share/datatable/components/DataTableNew",
});