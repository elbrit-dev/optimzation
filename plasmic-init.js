import { initPlasmicLoader, DataProvider as PlasmicDataProvider } from "@plasmicapp/loader-nextjs";
import jmespath from "jmespath";
import _ from "lodash";
import jmespath_plus from '@metrichor/jmespath-plus';
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
// import DataProvider from "./share/src/app/datatable/components/DataProviderNew";
// import DataTableNew from "./share/src/app/datatable/components/DataTableNew";
// import Navigation from "./share/src/app/navigation/components/Navigation";
import { registerElbritCoreComponents } from './share/src/plasmic-init'
import FirebaseUIComponent from "./components/FirebaseUIComponent";
import CalendarPage from "@calendar/components/CalendarPage";
import NovuInbox from "./components/NovuInbox";
import PushNotificationToggle from "./components/PushNotificationToggle";
import NetworkBanner from "./components/NetworkBanner";
import DevicePrimaryGuard from "./components/DevicePrimaryGuard";
import ApprovalCard from "./components/ApprovalCard";
// import TableDataProvider from "./components/TableDataProvider";
import jsonata from 'jsonata';
import { db } from "./firebase";

// Validate tag: only "dev" (test) and "prod" (live) are allowed.
const plasmicTag = process.env.NEXT_PUBLIC_PLASMIC_TAG;

const allowedTags = ["dev", "prod"];
if (plasmicTag && !allowedTags.includes(plasmicTag)) {
  throw new Error(`Invalid Plasmic Tag "${plasmicTag}" for current deployment setting.`);
}

// Resolve which Plasmic version to load:
// - "prod" (live): only versions published with the "prod" tag, so
//   live changes ONLY when you publish to "prod" in Plasmic Studio.
// - "dev" / unset (test): the latest publish regardless of tag, so a
//   "dev" publish shows on test only, while a "prod" publish shows on
//   both test and live.
const plasmicVersion = plasmicTag === "prod" ? "prod" : undefined;

export const PLASMIC = initPlasmicLoader({
  projects: [
    {
      id: "b6mXu8rXhi8fdDd6jwb8oh",
      token: "hKaQFlYDzP6By8Fk45XBc6AhEoXVcAk3jJA5AvDn7lEnJI4Ho97wv9zkcp0LvOnjUhV0wQ6ZeeXBj5V135I9YA",
      version: plasmicVersion,
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
// PLASMIC.registerComponent(DataTable, {
//   name: "DataTable",
//   props: {
//     data: {
//       type: "object",
//       description: "The array of data to display in the table",
//     },
//     queryVariables: {
//       type: "object",
//       description: "Base variables for the query (provided by DataProvider)",
//     },
//     onVariableOverridesChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "overrides", type: "object" }],
//     },
//     showControls: {
//       type: "boolean",
//       description: "Toggle the visibility of the table controls (sort, filter, etc.)",
//       defaultValue: false,
//     },
//     dataSource: {
//       type: "string",
//       description: "The data source ID or 'offline' for local data",
//     },
//     queryKey: {
//       type: "string",
//       description: "The specific key within the data source results to display",
//     },
//     rowsPerPageOptions: {
//       type: "object",
//       defaultValue: [10, 25, 50, 100],
//     },
//     defaultRows: {
//       type: "number",
//       defaultValue: 10,
//     },
//     scrollable: {
//       type: "boolean",
//       defaultValue: true,
//     },
//     scrollHeight: {
//       type: "string",
//       defaultValue: "600px",
//     },
//     tableName: {
//       type: "string",
//       defaultValue: "table",
//     },
//     enableSort: {
//       type: "boolean",
//       defaultValue: true,
//       description: "Show/hide sorting controls within the header",
//     },
//     enableFilter: {
//       type: "boolean",
//       defaultValue: true,
//       description: "Show/hide filtering controls within the header",
//     },
//     enableSummation: {
//       type: "boolean",
//       defaultValue: true,
//       description: "Show/hide summation controls within the header",
//     },
//     enableGrouping: {
//       type: "boolean",
//       defaultValue: true,
//       description: "Initial grouping state for orchestration layer",
//     },
//     enableDivideBy1Lakh: {
//       type: "boolean",
//       defaultValue: false,
//       description: "Toggle dividing numerical values by 1,0,00,000 (1 Lakh)",
//     },
//     percentageColumns: {
//       type: "object",
//       description: "Configuration for percentage-based columns",
//       defaultValue: [],
//     },
//     textFilterColumns: {
//       type: "object",
//       description: "Array of fields to use text search instead of multi-select",
//       defaultValue: [],
//     },
//     visibleColumns: {
//       type: "object",
//       description: "Array of fields to display (empty = all)",
//       defaultValue: [],
//     },
//     onVisibleColumnsChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "columns", type: "object" }],
//     },
//     redFields: {
//       type: "object",
//       defaultValue: [],
//     },
//     greenFields: {
//       type: "object",
//       defaultValue: [],
//     },
//     outerGroupField: {
//       type: "string",
//       description: "Field to group by (e.g. team name)",
//     },
//     innerGroupField: {
//       type: "string",
//       description: "Field to sub-group/aggregate by",
//     },
//     enableCellEdit: {
//       type: "boolean",
//       defaultValue: false,
//     },
//     nonEditableColumns: {
//       type: "object",
//       defaultValue: [],
//     },
//     isAdminMode: {
//       type: "boolean",
//       description: "Enable admin mode to bypass data filtering",
//       defaultValue: false,
//     },
//     salesTeamColumn: {
//       type: "string",
//       description: "Column name for Sales Team filtering",
//     },
//     salesTeamValues: {
//       type: "object",
//       description: "Array of allowed Sales Team values",
//       defaultValue: [],
//     },
//     hqColumn: {
//       type: "string",
//       description: "Column name for HQ filtering",
//     },
//     hqValues: {
//       type: "object",
//       description: "Array of allowed HQ values",
//       defaultValue: [],
//     },
//     enableFullscreenDialog: {
//       type: "boolean",
//       defaultValue: true,
//       description: "Enable/disable fullscreen dialog feature",
//     },
//     drawerTabs: {
//       type: "object",
//       description: "Array of tab configurations for the detail drawer (name, outerGroup, innerGroup)",
//       defaultValue: [],
//     },
//     enableReport: {
//       type: "boolean",
//       defaultValue: false,
//     },
//     dateColumn: {
//       type: "string",
//     },
//     breakdownType: {
//       type: "string",
//       defaultValue: "month",
//     },
//     onDrawerTabsChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "tabs", type: "object" }],
//     },
//     onEnableReportChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "enabled", type: "boolean" }],
//     },
//     onDateColumnChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "column", type: "string" }],
//     },
//     onBreakdownTypeChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "type", type: "string" }],
//     },
//     onOuterGroupFieldChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "field", type: "string" }],
//     },
//     onInnerGroupFieldChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "field", type: "string" }],
//     },
//     controlsPanelSize: {
//       type: "number",
//       description: "The percentage width of the controls sidebar (0-100)",
//       defaultValue: 20,
//     },
//     columnTypes: {
//       type: "object",
//       description: "Override column types (e.g., { fieldName: 'number' })",
//       defaultValue: { is_internal_customer: "number" },
//     },
//     onColumnTypesChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "columnTypes", type: "object" }],
//     },
//     useOrchestrationLayer: {
//       type: "boolean",
//       description: "Enable the new orchestration layer for data processing",
//       defaultValue: false,
//     },
//     onSave: {
//       type: "eventHandler",
//       argTypes: [],
//     },
//     onAdminModeChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "isAdminMode", type: "boolean" }],
//     },
//   },
//   importPath: "./components/DataTable",
// });

// PLASMIC.registerComponent(Navigation, {
//   name: "Navigation",
//   props: {
//     items: {
//       type: "object",
//       description: "JSON array of navigation items. Each item should have: label (string), path (string), iconActive (JSX element), iconInactive (JSX element), mobileFullscreen (boolean), mobileOnly (boolean), isDefault (boolean), isDisabled (boolean). Icons must be JSX elements, not strings.",
//       defaultValue: [],
//     },
//     defaultIndex: {
//       type: "number",
//       defaultValue: 0,
//       description: "Fallback index if no URL path matches and no item has isDefault: true",
//     },
//     desktopWidth: {
//       type: "string",
//       defaultValue: "16rem",
//       description: "Width of the desktop sidebar navigation",
//     },
//     desktopHeight: {
//       type: "string",
//       defaultValue: "93dvh",
//       description: "Height of the desktop sidebar navigation",
//     },
//     mobileWidth: {
//       type: "string",
//       defaultValue: "100%",
//       description: "Width of the mobile bottom navigation",
//     },
//     mobileHeight: {
//       type: "string",
//       defaultValue: "4rem",
//       description: "Height of the mobile bottom navigation",
//     },
//     showCollapse: {
//       type: "boolean",
//       defaultValue: true,
//       description: "Show/hide the collapse button in desktop sidebar",
//     },
//   },
//   importPath: "./share/src/app/navigation/components/Navigation",
// });

// Register FirebaseUIComponent
PLASMIC.registerComponent(FirebaseUIComponent, {
  name: "FirebaseUIComponent",
  description: "Native Firebase Authentication UI (Google & Phone)",
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
    googleClientId:{
      type: "string",
      helpText: "Google Client ID",
    },
    googleRedirectUri:{
      type: "string",
      helpText: "Google Redirect URI",
    },
  },
});

PLASMIC.registerComponent(NovuInbox, {
  name: "NovuInbox",
  props: {
    email: {
      type: "string",
      description: "User email (used as Novu subscriberId)",
    },
    firstName: {
      type: "string",
      description: "User first name (optional).",
    },
    lastName: {
      type: "string",
      description: "User last name (optional).",
    },
    phone: {
      type: "string",
      description: "User phone number in E.164 format.",
    },
    tags: {
      type: "object",
      description: "User tags (Flat object).",
    },
    meta: {
      type: "object",
      description: "Additional metadata (Flat object).",
    },
    applicationIdentifier: {
      type: "string",
      description: "Novu application identifier.",
      // Reads NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER (set per Netlify deploy context); falls back to Production.
      defaultValue: process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER || "pdnBD6k7fkMq",
    },
    subscriberHash: {
      type: "string",
      description: "Optional subscriber hash for HMAC.",
    },
    className: {
      type: "string",
      description: "CSS class name for the container",
    },
    fallbackRedirectPath: {
      type: "string",
      description: "Page to open when a clicked notification has no redirect URL of its own.",
      defaultValue: "/chat",
    },
    bellSize: {
      type: "number",
      description: "Size (px) of the notification bell icon.",
      defaultValue: 28,
    },
    bellPadding: {
      type: "string",
      description: "Padding around the bell trigger button (any CSS length, e.g. '0', '2px'). Smaller = less background space around the bell.",
      defaultValue: "2px",
    },
    promptGateKey: {
      type: "string",
      defaultValue: "token",
      description:
        "The automatic notification-permission popup at page open only appears when this localStorage key holds a non-empty value (i.e. the user is logged in). Leave empty to always prompt. The Push Notification Toggle is never gated by this.",
    },
    onNotificationClick: {
      type: "eventHandler",
      argTypes: [
        { name: "notification", type: "object" }
      ],
      description: "Called when a notification (body) is clicked. The notification's own redirect URL still navigates automatically.",
    },
    onPrimaryActionClick: {
      type: "eventHandler",
      argTypes: [
        { name: "notification", type: "object" }
      ],
      description: "Callback function called when primary action button is clicked",
    },
    onSecondaryActionClick: {
      type: "eventHandler",
      argTypes: [
        { name: "notification", type: "object" }
      ],
      description: "Callback function called when secondary action button is clicked",
    },
  },
  importPath: "./components/NovuInbox",
});

PLASMIC.registerComponent(PushNotificationToggle, {
  name: "PushNotificationToggle",
  displayName: "Push Notification Toggle",
  description:
    "A 'Show notifications' label with a toggle switch that reflects the live push subscription status. Toggling ON re-opens the native browser permission popup for users who skipped it at login, then registers the device for push (Novu/OneSignal). Toggling OFF opts the device out of push. If the user previously clicked Block, it shows instructions to enable notifications in browser settings (browsers never allow re-opening the popup after Block).",
  props: {
    email: {
      type: "string",
      description:
        "Bind the SAME email value you bind to NovuInbox (the Novu bell) — the logged-in user's email, used as the Novu subscriberId when registering this device for push. If left unbound, it falls back to the identity NovuInbox already set in OneSignal.",
    },
    label: {
      type: "string",
      defaultValue: "Show notifications",
      description: "Text shown next to the toggle.",
    },
    deniedMessage: {
      type: "string",
      defaultValue:
        "Notifications are blocked for this site. Enable them from the lock icon in your browser's address bar (Site settings → Notifications → Allow), then try again.",
      description: "Help text shown when the browser has notifications blocked.",
    },
    sdkErrorMessage: {
      type: "string",
      defaultValue:
        "The notification service couldn't start on this page — usually the domain isn't authorized in OneSignal (Settings → Push & In-App → Web → Site URL). Check the browser console for a red OneSignal error.",
      description:
        "Warning shown when the OneSignal SDK fails to initialize within 8 seconds (e.g. domain mismatch with the OneSignal dashboard's Site URL).",
    },
    braveErrorMessage: {
      type: "string",
      defaultValue:
        "Brave blocks push notifications by default. Open Brave Settings → Privacy and security → turn ON \"Use Google services for push messaging\", restart Brave, then try again — or use Chrome instead.",
      description:
        "Shown instead of the generic SDK error when the browser is Brave, which disables web push unless the user enables Google services for push messaging.",
    },
    hideWhenUnsupported: {
      type: "boolean",
      defaultValue: true,
      description: "Hide when the browser doesn't support web push (e.g. iOS Safari not installed as a PWA).",
    },
    activeColor: {
      type: "color",
      defaultValue: "#2c5282",
      description: "Toggle track color when notifications are enabled.",
    },
    inactiveColor: {
      type: "color",
      defaultValue: "#cbd5e0",
      description: "Toggle track color when notifications are disabled.",
    },
    labelColor: {
      type: "color",
      description: "Label text color (inherits from the page if unset).",
    },
    fontSize: {
      type: "number",
      defaultValue: 14,
      description: "Label font size (px).",
    },
    toggleHeight: {
      type: "number",
      defaultValue: 24,
      description: "Height (px) of the toggle switch; width scales with it.",
    },
    className: {
      type: "string",
      description: "CSS class name for the container",
    },
    onChange: {
      type: "eventHandler",
      argTypes: [
        { name: "enabled", type: "boolean" },
        { name: "deviceId", type: "string" },
      ],
      description:
        "Called when the toggle changes: enabled=true after the user allows notifications and the device is registered; enabled=false after opting out.",
    },
  },
  importPath: "./components/PushNotificationToggle",
});

PLASMIC.registerComponent(NetworkBanner, {
  name: "NetworkBanner",
  displayName: "Network Banner",
  description:
    "Floating overlay banner that measures real download speed and appears at the top of the screen only when the connection is genuinely slow or offline. Clicking it runs a fast.com-style speed test; an X dismisses it. It portals to <body> and floats above everything, so it takes no layout space — placing it once anywhere in the tree is enough.",
  props: {
    showWhenFast: {
      type: "boolean",
      defaultValue: false,
      description: "Also show a green banner when the connection is fast.",
    },
    topOffset: {
      type: "string",
      defaultValue: "8vh",
      description: "Distance from the top of the screen (any CSS length, e.g. 8vh, 64px).",
    },
    zIndex: {
      type: "number",
      defaultValue: 2000000000,
      description: "Stacking order. Kept very high so the banner stays in front of everything.",
    },
    forceShow: {
      type: "boolean",
      defaultValue: false,
      description:
        "Editor preview only: force the banner to render so you can see/style it on the canvas.",
    },
    demoSeverity: {
      type: "choice",
      options: ["red", "orange", "yellow", "green"],
      description:
        "Editor preview only: render a specific state (offline/slow/etc.) on the canvas.",
    },
  },
  importPath: "./components/NetworkBanner",
});

PLASMIC.registerComponent(DevicePrimaryGuard, {
  name: "DevicePrimaryGuard",
  displayName: "Device Primary Guard",
  description:
    "One-time capture of the user's attendance device. Shows a modal ONLY when the ERP field attendance_device_id is empty AND the device is a phone or tablet (never on desktop). The user decides: 'Yes, save' persists the id + the complete device JSON to localStorage and fires onSave (wire this to your ERP mutation); 'Not now' saves nothing, leaves the ERP field empty, and the popup returns next time. Correctly treats iPads (which pretend to be desktop) as tablets. Renders nothing when it shouldn't trigger.",
  props: {
    storedDeviceId: {
      type: "string",
      description:
        "Bind the employee's current attendance_device_id from ERP. If it has any value, the popup NEVER shows. Empty/None/null => eligible to trigger.",
    },
    employeeId: {
      type: "string",
      description:
        "The Employee docname (e.g. 'HR-EMP-0001'). When set, the popup writes attendance_device_id to ERP itself via saveDoc (same as the planner). Leave empty to instead handle the write yourself in the onSave interaction.",
    },
    employeeDoctype: {
      type: "string",
      defaultValue: "Employee",
      description: "Doctype to update. Normally 'Employee'.",
    },
    deviceIdFieldname: {
      type: "string",
      defaultValue: "attendance_device_id",
      description: "The fieldname on the doctype that stores the device id.",
    },
    enabled: {
      type: "boolean",
      defaultValue: true,
      description:
        "Gate the check until the employee record is loaded — bind to something like !isLoading. While false, the popup can't flash from an initial undefined storedDeviceId.",
    },
    localStorageIdKey: {
      type: "string",
      defaultValue: "attendance_device_id",
      description: "localStorage key under which the device id is saved (only on 'Yes').",
    },
    localStorageInfoKey: {
      type: "string",
      defaultValue: "attendance_device_info",
      description: "localStorage key under which the COMPLETE device JSON is saved (only on 'Yes').",
    },
    allowDesktop: {
      type: "boolean",
      defaultValue: false,
      description: "Testing escape hatch: allow the popup on desktop too. Leave OFF for the mobile/tablet-only rule.",
    },
    title: {
      type: "string",
      defaultValue: "Register this device?",
      description: "Popup heading.",
    },
    description: {
      type: "string",
      defaultValue: "Save this phone/tablet as your attendance device? You'll use it to check in.",
      description: "Popup body text.",
    },
    saveLabel: {
      type: "string",
      defaultValue: "Yes, save this device",
      description: "Confirm button label.",
    },
    declineLabel: {
      type: "string",
      defaultValue: "Not now",
      description: "Decline button label.",
    },
    accentColor: {
      type: "color",
      defaultValue: "#2c5282",
      description: "Accent color for the icon and the confirm button.",
    },
    zIndex: {
      type: "number",
      defaultValue: 2000000001,
      description: "Stacking order of the modal overlay.",
    },
    forceShow: {
      type: "boolean",
      defaultValue: false,
      description: "Editor preview only: force the modal to render on the Studio canvas so you can style it.",
    },
    className: {
      type: "string",
      description: "CSS class for the modal card.",
    },
    onSave: {
      type: "eventHandler",
      argTypes: [
        { name: "deviceId", type: "string" },
        { name: "info", type: "object" },
      ],
      description:
        "Fired after a successful confirm. If employeeId is set, the ERP write already happened automatically — use this only for extra side effects (toast, refetch). If employeeId is empty, do the ERP write here. `info` is the complete device JSON (also saved to localStorage).",
    },
    onDecline: {
      type: "eventHandler",
      argTypes: [],
      description: "Fired when the user declines. ERP is left untouched (stays empty).",
    },
  },
  importPath: "./components/DevicePrimaryGuard",
});

PLASMIC.registerComponent(ApprovalCard, {
  name: "ApprovalCard",
  displayName: "Approval Card",
  description:
    "Summary card for the secondary approval flow with 4 variants: 'select' (checkbox), 'toggle' (on/off switch), 'actions' (per-card Reject/Approve buttons), and 'select-actions' (checkbox AND Reject/Approve together). Title + a status pill + two metric columns (e.g. Sales / Closing, each Qty + Value) and an optional attachments badge (🔗 + count) that fires onLinkClick. `checked` is just true/false — bind it to your control (a Select All boolean, or the card's own checked state). onCheckedChange fires (checked, value) AUTOMATICALLY whenever checked flips — on a click OR when set from outside — so you wire the value handling once: Add element `value` (when checked) / Remove elements `value` (when not) into your [] array (init it to []). Select All only flips the boolean; it never passes a value. For actions/select-actions, onApprove/onReject fire with `value`. Wire onCardClick to open the slice's detail view; set `locked` on already-decided slices (dim, no controls) and drive the `status`/`statusTone`/`rejectionReason` pill from the tracker's status.",
  props: {
    variant: {
      type: "choice",
      options: [
        { value: "select", label: "Select (checkbox — bulk)" },
        { value: "toggle", label: "Toggle (switch — single)" },
        { value: "actions", label: "Actions (Reject / Approve)" },
        { value: "select-actions", label: "Select + Actions (checkbox AND Reject / Approve)" },
      ],
      defaultValue: "select",
      description:
        "Which control(s) the card shows: 'select' = checkbox (bulk select-all), 'toggle' = on/off switch (single), 'actions' = Reject + Approve buttons, 'select-actions' = checkbox AND Reject + Approve together (bulk-select while still allowing per-card decisions).",
    },
    value: {
      type: "object",
      description:
        "The id/value handed back with selection AND with approve/reject/attachment events. Bind this to the current row's key (e.g. customer name or docname). This is what you collect into your selected-items list.",
    },
    checked: {
      type: "boolean",
      defaultValue: false,
      description:
        "Just true/false — whether the card is ticked. Bind it to your control: a Select All boolean, or leave it to the card's own checked state for individual ticking. Changing it (click OR from outside) fires onCheckedChange automatically.",
    },
    onCheckedChange: {
      type: "eventHandler",
      argTypes: [
        { name: "checked", type: "boolean" },
        { name: "value", type: "object" },
      ],
      description:
        "Fires (checked, value) automatically whenever the tick flips — on a click OR when `checked` is set from outside (a Select All). Wire it: when checked -> Update your [] state, operation 'Add element', value = `value`; when NOT checked -> operation 'Remove elements', value = `value`. Initialize that state to [] first (else Add element errors with 'push of undefined').",
    },
    selectOnCardClick: {
      type: "boolean",
      defaultValue: true,
      description:
        "select/toggle/select-actions: click anywhere on the card to toggle the tick (not just the control). IGNORED once onCardClick is wired — then the body navigates instead and only the checkbox selects. No effect in the actions variant.",
    },
    onCardClick: {
      type: "eventHandler",
      argTypes: [{ name: "value", type: "object" }],
      description:
        "Fired when the card BODY is clicked, with this card's `value`. Wire it to open the slice's detail view (navigate / redirect / open a drawer). Wiring it turns OFF click-anywhere-to-select — only the checkbox then selects. Fires even on a locked card (but not a disabled one). The checkbox, toggle, Approve/Reject buttons and 🔗 badge all swallow their own clicks, so they never trigger this.",
    },
    onApprove: {
      type: "eventHandler",
      argTypes: [{ name: "value", type: "object" }],
      description: "actions/select-actions: fired when Approve is clicked, with this card's `value`. Approve is a direct one-tap action — wire it straight to your ERP approve mutation.",
    },
    onReject: {
      type: "eventHandler",
      argTypes: [{ name: "value", type: "object" }],
      description: "actions/select-actions: fired when Reject is clicked, with this card's `value`. This only SIGNALS reject intent — wire it to open your reason sheet (quick-pick + required note). The status change and the write to reason_for_rejection happen on confirm, not here; the card never writes anything.",
    },
    approveLabel: {
      type: "string",
      defaultValue: "Approve",
      description: "actions variant: label of the Approve button.",
    },
    rejectLabel: {
      type: "string",
      defaultValue: "Reject",
      description: "actions variant: label of the Reject button.",
    },
    approveColor: {
      type: "color",
      defaultValue: "#2563eb",
      description: "actions variant: Approve button background color.",
    },
    rejectColor: {
      type: "color",
      defaultValue: "#ef4444",
      description: "actions variant: Reject button background color.",
    },
    links: {
      type: "array",
      itemType: {
        type: "object",
        nameFunc: (item) => item?.label || item?.url,
        fields: {
          label: { type: "string" },
          url: { type: "string" },
        },
      },
      description:
        "Any number of file links. Bind a dynamic expression that builds the list from whatever row fields you have — bare URL/path strings OR { label, url } objects both work, e.g. [currentItem.custom_transformed_data, currentItem.custom_ecubix_data] or [{ label: 'Transformed', url: currentItem.custom_transformed_data }, ...]. Relative '/private/files/...' paths get merged with fileBaseUrl; empties are dropped; missing labels fall back to the file name. Feeds the 🔗 badge.",
    },
    fileBaseUrl: {
      type: "string",
      defaultValue: "",
      description:
        "Origin prepended to relative '/private/files/...' paths so links open on the ERP host (e.g. 'https://uat.elbrit.org'). Leave blank if the app is served from the same host as ERPNext. Absolute http(s) URLs are used as-is.",
    },
    linkCount: {
      type: "number",
      description:
        "OPTIONAL override of the badge number. Leave EMPTY to auto-count the entries in `links`. Only set this to force a specific count. Never bind a URL/string here.",
    },
    openInNewTab: {
      type: "boolean",
      defaultValue: true,
      description:
        "When ON (default), clicking the 🔗 badge opens the file(s) in a new tab: 1 link opens directly, 2+ links show a dropdown so each opens on its own click (avoids popup-blockers). Turn OFF if you want to handle opening yourself via onLinkClick.",
    },
    onLinkClick: {
      type: "eventHandler",
      argTypes: [
        { name: "links", type: "object" },
        { name: "value", type: "object" },
      ],
      description:
        "Also fired when the 🔗 badge is clicked (alongside the built-in open). `links` is the resolved array [{ label, url }] of every file present; `value` is this card's id. Use it for extra side-effects, or set openInNewTab OFF and do the opening here.",
    },
    disabled: {
      type: "boolean",
      defaultValue: false,
      description: "Temporarily block a PENDING card: dim it and block selection, buttons AND navigation. Different from `locked` — use this to freeze a still-pending card (e.g. while a mutation is in flight).",
    },
    locked: {
      type: "boolean",
      defaultValue: false,
      description: "Mark an already-DECIDED slice: dim the card and hide the checkbox and Reject/Approve buttons (it can still be tapped to open detail if onCardClick is wired). Set this whenever the status is NOT 'ABM Approval Waiting'. Different from `disabled`, which fully blocks a pending card.",
    },
    title: {
      type: "string",
      defaultValue: "Sai Radha Pharma",
      description: "Card heading (e.g. the customer / party name).",
    },
    status: {
      type: "string",
      defaultValue: "ABM Approval Waiting",
      description: "Status pill text shown near the title (e.g. 'ABM Approval Waiting', 'Approved · with MIS', 'ABM Rejected'). Leave empty to hide the pill. Bind to the tracker's approval status.",
    },
    statusTone: {
      type: "choice",
      options: [
        { value: "waiting", label: "Waiting (amber)" },
        { value: "approved", label: "Approved (blue)" },
        { value: "rejected", label: "Rejected (red)" },
      ],
      defaultValue: "waiting",
      description: "Colour of the status pill. On the page, derive it from the status text (e.g. 'ABM Approval Waiting' → waiting, contains 'Approved' → approved, contains 'Reject' → rejected).",
    },
    rejectionReason: {
      type: "string",
      description: "Rejection reason shown as a red inline note — appears ONLY when statusTone is 'rejected'. Bind to the tracker's reason_for_rejection.",
    },
    currency: {
      type: "string",
      defaultValue: "₹",
      description: "Currency symbol prefixed to Value figures.",
    },
    leftLabel: {
      type: "string",
      defaultValue: "Sales",
      description: "Heading of the left metric column.",
    },
    leftQty: {
      type: "number",
      defaultValue: 688,
      description: "Left column quantity. Numbers are grouped (Indian format); strings pass through.",
    },
    leftQtyUnit: {
      type: "string",
      defaultValue: "Nos",
      description: "Unit shown after the left quantity (e.g. Nos).",
    },
    leftValue: {
      type: "number",
      defaultValue: 82780.33,
      description: "Left column value. Numbers are formatted as currency; strings pass through.",
    },
    rightLabel: {
      type: "string",
      defaultValue: "Closing",
      description: "Heading of the right metric column.",
    },
    rightQty: {
      type: "number",
      defaultValue: 590,
      description: "Right column quantity.",
    },
    rightQtyUnit: {
      type: "string",
      defaultValue: "Nos",
      description: "Unit shown after the right quantity.",
    },
    rightValue: {
      type: "number",
      defaultValue: 65780.33,
      description: "Right column value (formatted as currency).",
    },
    accentColor: {
      type: "color",
      defaultValue: "#2563eb",
      description: "Checkbox/toggle fill and selected-card border color.",
    },
    headingColor: {
      type: "color",
      defaultValue: "#2563eb",
      description: "Color of the column headings (Sales / Closing).",
    },
    className: {
      type: "string",
      description: "CSS class for the card container.",
    },
  },
  states: {
    checked: {
      type: "writable",
      variableType: "boolean",
      valueProp: "checked",
      onChangeProp: "onCheckedChange",
    },
  },
  importPath: "./components/ApprovalCard",
});

registerElbritCoreComponents(PLASMIC)

// PLASMIC.registerComponent(DataProvider, {
//   name: "DataProvider",
//   props: {
//     offlineData: {
//       type: "object",
//       description: "Offline/local data to use when dataSource is 'offline'",
//     },
//     dataSource: {
//       type: "string",
//       description: "The data source ID or 'offline' for local data",
//     },
//     selectedQueryKey: {
//       type: "string",
//       description: "The specific key within the data source results to display",
//     },
//     variableOverrides: {
//       type: "object",
//       description: "Overrides for query variables (as an object)",
//       defaultValue: {},
//     },
//     isAdminMode: {
//       type: "boolean",
//       description: "Enable admin mode to bypass data filtering",
//       defaultValue: false,
//     },
//     salesTeamColumn: {
//       type: "string",
//       description: "Column name for Sales Team filtering",
//     },
//     salesTeamValues: {
//       type: "object",
//       description: "Array of allowed Sales Team values",
//       defaultValue: [],
//     },
//     hqColumn: {
//       type: "string",
//       description: "Column name for HQ filtering",
//     },
//     hqValues: {
//       type: "object",
//       description: "Array of allowed HQ values",
//       defaultValue: [],
//     },
//     columnTypesOverride: {
//       type: "object",
//       description: "Override column types (e.g., { fieldName: 'number' })",
//       defaultValue: {},
//     },
//     useOrchestrationLayer: {
//       type: "boolean",
//       description: "Enable the new orchestration layer for data processing",
//       defaultValue: false,
//     },
//     enableSort: {
//       type: "boolean",
//       defaultValue: true,
//       description: "Initial sort state for orchestration layer",
//     },
//     enableFilter: {
//       type: "boolean",
//       defaultValue: true,
//       description: "Initial filter state for orchestration layer",
//     },
//     enableSummation: {
//       type: "boolean",
//       defaultValue: true,
//       description: "Initial summation state for orchestration layer",
//     },
//     enableGrouping: {
//       type: "boolean",
//       defaultValue: true,
//       description: "Initial grouping state for orchestration layer",
//     },
//     enableDivideBy1Lakh: {
//       type: "boolean",
//       defaultValue: false,
//       description: "Initial divide by 1 lakh state for orchestration layer",
//     },
//     textFilterColumns: {
//       type: "object",
//       defaultValue: [],
//       description: "Columns to use text search in orchestration layer",
//     },
//     visibleColumns: {
//       type: "object",
//       description: "Initial visible columns for orchestration layer (can be passed from parent)",
//     },
//     redFields: {
//       type: "object",
//       defaultValue: [],
//       description: "Array of column names to display in red",
//     },
//     greenFields: {
//       type: "object",
//       defaultValue: [],
//       description: "Array of column names to display in green",
//     },
//     groupFields: {
//       type: "object",
//       description: "Array of field names for grouping (supports infinite nesting). Main/outer group: 'sales_team', inner group: 'hq'. Example: ['sales_team', 'hq']",
//     },
//     percentageColumns: {
//       type: "object",
//       defaultValue: [],
//       description: "Array of percentage column configurations",
//     },
//     drawerTabs: {
//       type: "object",
//       defaultValue: [],
//       description: "Array of drawer tab configurations",
//     },
//     enableReport: {
//       type: "boolean",
//       defaultValue: false,
//       description: "Enable report mode with time breakdown",
//     },
//     dateColumn: {
//       type: "string",
//       description: "Column name containing date values for report breakdown",
//     },
//     onDataChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "notification", type: "object" }],
//       description: "Callback when data changes",
//     },
//     onError: {
//       type: "eventHandler",
//       argTypes: [{ name: "error", type: "object" }],
//       description: "Callback when an error occurs",
//     },
//     onTableDataChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "data", type: "object" }],
//       description: "Callback when table data changes",
//     },
//     onRawDataChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "data", type: "object" }],
//       description: "Callback when raw data changes",
//     },
//     onVariablesChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "variables", type: "object" }],
//       description: "Callback when query variables change",
//     },
//     onExecutingQueryChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "executing", type: "boolean" }],
//       description: "Callback when query execution state changes",
//     },
//     onSelectedQueryKeyChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "key", type: "string" }],
//       description: "Callback when selected query key changes",
//     },
//     onLoadingDataChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "loading", type: "boolean" }],
//       description: "Callback when loading data state changes",
//     },
//     onVisibleColumnsChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "columns", type: "object" }],
//       description: "Callback when visible columns change",
//     },
//     onDrawerTabsChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "tabs", type: "object" }],
//       description: "Callback when drawer tabs change",
//     },
//     chartColumns: {
//       type: "object",
//       defaultValue: [],
//       description: "Array of column names to display in the chart",
//     },
//     chartHeight: {
//       type: "number",
//       defaultValue: 400,
//       description: "Height of the chart in pixels",
//     },
//     allowedColumns: {
//       type: "object",
//       description: "Developer-controlled: restricts which columns are available for selection",
//       defaultValue: [],
//     },
//     onAllowedColumnsChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "columns", type: "object" }],
//       description: "Callback when allowed columns change",
//     },
//     derivedColumns: {
//       type: "object",
//       description: "Array of derived column configurations",
//       defaultValue: [],
//     },
//     derivedRows: {
//       type: "object",
//       description: "Derived rows configuration (e.g. for row-level derived data)",
//     },
//     reportDataOverride: {
//       type: "object",
//       description: "Override report data (for custom report data)",
//     },
//     forceBreakdown: {
//       type: "boolean",
//       description: "Force breakdown mode (overrides enableBreakdown state)",
//     },
//     showProviderHeader: {
//       type: "boolean",
//       defaultValue: true,
//       description: "Show/hide the provider header controls",
//     },
//     forceEnableWrite: {
//       type: "boolean",
//       description: "Force enableWrite for nested drawer tables. If provided, overrides the query's enableWrite setting. Use true to enable editing in nested tables.",
//     },
//     enableCellEdit: {
//       type: "boolean",
//       defaultValue: false,
//       description: "Enable cell editing in the table",
//     },
//     editableColumns: {
//       type: "object",
//       defaultValue: { main: [], nested: {} },
//       description: "Object defining editable columns. Format: { main: ['col1', 'col2'], nested: { parentCol: { nestedField: ['col1'] } } }. Empty main array means all columns editable. For nested tables, specify parent column and nested field name.",
//     },
//     slots: {
//       type: "object",
//       description: "Per-slot configuration object. When provided, allows different configurations for different slots. Format: { slotId: { enableSort, enableFilter, groupFields, derivedColumns, etc. } }. If not provided, falls back to flat props for backward compatibility.",
//     },
//     columnsExemptFromBreakdown: {
//       type: "object",
//       defaultValue: [],
//       description: "Array of column names exempt from report breakdown",
//     },
//     onAvailableQueryKeysChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "keys", type: "object" }],
//       description: "Callback when available query keys change",
//     },
//     derivedColumnsMode: {
//       type: "string",
//       description: "Override for derived columns scope: 'main' | 'nested' (for sidebar nested tabs)",
//     },
//     derivedColumnsFieldName: {
//       type: "string",
//       description: "For mode 'nested', the nested table's field name",
//     },
//     fallbackColumns: {
//       type: "object",
//       description: "Fallback columns when data is empty (e.g., from other rows' schema for nested tables)",
//     },
//     parentColumnName: {
//       type: "string",
//       description: "Parent column name for nested tables (used with nestedTableFieldName)",
//     },
//     nestedTableFieldName: {
//       type: "string",
//       description: "Nested table field name (used with parentColumnName for nested drawer tables)",
//     },
//     parentOriginalNestedTableDataRef: {
//       type: "object",
//       description: "Parent ref for nested instances to access parent's original nested table data",
//     },
//     parentNestedTableEditingDataRef: {
//       type: "object",
//       description: "Parent ref for nested instances to access parent's nested table editing data",
//     },
//     parentHandleDrawerSaveProp: {
//       type: "function",
//       description: "Parent handler for nested instances to use parent's drawer save state",
//     },
//     nestedTableTabId: {
//       type: "string",
//       description: "Tab ID for nested instances to update parent's editing buffer",
//     },
//     onNestedBufferChange: {
//       type: "eventHandler",
//       argTypes: [{ name: "buffer", type: "object" }],
//       description: "Callback from parent so nested instance can trigger parent re-render after buffer update",
//     },
//     parentHandleAddNestedRowAtZero: {
//       type: "function",
//       description: "Parent handler to add row at index 0 in nested table (for drawer nested table + button)",
//     },
//     skipConfirmDialog: {
//       type: "boolean",
//       defaultValue: false,
//       description: "When true, do not render ConfirmDialog (parent page provides one - avoids duplicate dialogs)",
//     },
//     formInputOverride: {
//       type: "object",
//       defaultValue: {},
//       description: "Per-column input override for editing. Format: { columnName: 'Calendar'|'Checkbox'|'InputNumber'|'InputText'|'Quill'|{ type:'Select', getOptions:(ctx)=>string[]|Promise<string[]> } } where ctx={ columnName, query }",
//     },
//     children: {
//       type: "slot",
//       description: "Slot to add custom UI components that can access the table data",
//     }
//   },
//   providesData: true,
//   importPath: "./share/src/app/datatable/components/DataProviderNew",
// });

// PLASMIC.registerComponent(DataTableNew, {
//   name: "DataTableNew",
//   props: {
//     rowsPerPageOptions: {
//       type: "object",
//       defaultValue: [10, 25, 50, 100],
//       description: "Array of rows per page options",
//     },
//     defaultRows: {
//       type: "number",
//       defaultValue: 10,
//       description: "Default number of rows per page",
//     },
//     scrollable: {
//       type: "boolean",
//       defaultValue: true,
//       description: "Enable/disable table scrolling",
//     },
//     scrollHeight: {
//       type: "string",
//       description: "Height of the scrollable area (e.g., '600px', 'flex' for dynamic)",
//     },
//     enableCellEdit: {
//       type: "boolean",
//       defaultValue: false,
//       description: "Enable cell editing",
//     },
//     onCellEditComplete: {
//       type: "eventHandler",
//       argTypes: [
//         { name: "rowData", type: "object" },
//         { name: "field", type: "string" },
//         { name: "newValue", type: "any" },
//         { name: "oldValue", type: "any" }
//       ],
//       description: "Callback when cell edit is completed",
//     },
//     isCellEditable: {
//       type: "function",
//       description: "Function to determine if a cell is editable: (rowData, field) => boolean",
//     },
//     editableColumns: {
//       type: "object",
//       defaultValue: { main: [], nested: {} },
//       description: "Object defining editable columns. Format: { main: ['col1', 'col2'], nested: { parentCol: { nestedField: ['col1'] } } }. Empty main array means all columns editable. For nested tables, specify parent column and nested field name.",
//     },
//     enableFullscreenDialog: {
//       type: "boolean",
//       defaultValue: true,
//       description: "Enable/disable fullscreen dialog feature",
//     },
//     tableName: {
//       type: "string",
//       defaultValue: "table",
//       description: "Name identifier for the table",
//     },
//     useOrchestrationLayer: {
//       type: "boolean",
//       defaultValue: false,
//       description: "Use orchestration layer (must be child of DataProvider with useOrchestrationLayer=true)",
//     },
//     parentColumnName: {
//       type: "string",
//       description: "Parent column name for nested tables (used with nestedTableFieldName)",
//     },
//     nestedTableFieldName: {
//       type: "string",
//       description: "Nested table field name (used with parentColumnName for nested drawer tables)",
//     },
//     onOuterGroupClick: {
//       type: "eventHandler",
//       argTypes: [
//         { name: "rowData", type: "object" },
//         { name: "column", type: "string" },
//         { name: "value", type: "any" }
//       ],
//       description: "Handler for outer group row clicks (for backward compatibility)",
//     },
//     onInnerGroupClick: {
//       type: "eventHandler",
//       argTypes: [
//         { name: "rowData", type: "object" },
//         { name: "column", type: "string" },
//         { name: "value", type: "any" }
//       ],
//       description: "Handler for inner group row clicks (for backward compatibility)",
//     },
//     slotId: {
//       type: "string",
//       description: "Slot ID to select which slot's data to use (defaults to 'main' if not provided)",
//     },
//   },
//   importPath: "./share/src/app/datatable/components/DataTableNew",
// });