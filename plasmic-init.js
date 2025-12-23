import { initPlasmicLoader } from "@plasmicapp/loader-nextjs";
import jmespath from "jmespath";
import _ from "lodash";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import DataTable from "./components/DataTable";
import DataTableControls from "./components/DataTableControls";


export const PLASMIC = initPlasmicLoader({
  projects: [
    {
      id: "b6mXu8rXhi8fdDd6jwb8oh",
      token: "hKaQFlYDzP6By8Fk45XBc6AhEoXVcAk3jJA5AvDn7lEnJI4Ho97wv9zkcp0LvOnjUhV0wQ6ZeeXBj5V135I9YA",
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

PLASMIC.registerFunction(jmespath.search, {
  name: "jmespath",
  description: "Run a JMESPath expression on JSON data",
  parameters: [
    { name: "data", type: "any" },
    { name: "expression", type: "string" },
  ],
  returnType: "any",
});

// Register lodash as a global object
PLASMIC.registerGlobalContext(_, {
  name: "_",
  description: "Lodash utility library",
  props: {},
  providesData: true,
  globalActions: {
    map: {
      parameters: [
        { name: "collection", type: "any" },
        { name: "iteratee", type: "function" },
      ],
    },
    filter: {
      parameters: [
        { name: "collection", type: "any" },
        { name: "predicate", type: "function" },
      ],
    },
    find: {
      parameters: [
        { name: "collection", type: "any" },
        { name: "predicate", type: "function" },
      ],
    },
    groupBy: {
      parameters: [
        { name: "collection", type: "any" },
        { name: "iteratee", type: "function" },
      ],
    },
    sortBy: {
      parameters: [
        { name: "collection", type: "any" },
        { name: "iteratees", type: "any" },
      ],
    },
    uniq: {
      parameters: [
        { name: "array", type: "array" },
      ],
    },
    intersection: {
      parameters: [
        { name: "arrays", type: "array" },
      ],
    },
  },
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
  description: "Advanced data table with sorting, filtering, grouping, and pagination",
  isDefaultExport: true,
  importPath: "./components/DataTable",
  props: {
    data: {
      type: "array",
      description: "Array of objects to display in the table",
      defaultValue: [],
    },
    rowsPerPageOptions: {
      type: "array",
      description: "Available rows per page options",
      defaultValue: [10, 25, 50, 100],
    },
    defaultRows: {
      type: "number",
      description: "Default number of rows per page",
      defaultValue: 10,
    },
    scrollable: {
      type: "boolean",
      description: "Enable scrolling",
      defaultValue: true,
    },
    scrollHeight: {
      type: "string",
      description: "Height for scrollable area (e.g., '600px')",
      defaultValue: "600px",
    },
    enableSort: {
      type: "boolean",
      description: "Enable column sorting",
      defaultValue: true,
    },
    enableFilter: {
      type: "boolean",
      description: "Enable column filtering",
      defaultValue: true,
    },
    enableSummation: {
      type: "boolean",
      description: "Enable summary row with totals",
      defaultValue: true,
    },
    textFilterColumns: {
      type: "array",
      description: "Columns to use text filter instead of multiselect",
      defaultValue: [],
    },
    redFields: {
      type: "array",
      description: "Fields to display in red color",
      defaultValue: [],
    },
    greenFields: {
      type: "array",
      description: "Fields to display in green color",
      defaultValue: [],
    },
  },
});

// Register DataTableControls Component
PLASMIC.registerComponent(DataTableControls, {
  name: "DataTableControls",
  description: "Control panel for DataTable configuration",
  isDefaultExport: true,
  importPath: "./components/DataTableControls",
  props: {
    enableSort: {
      type: "boolean",
      description: "Enable sorting",
      defaultValue: true,
    },
    enableFilter: {
      type: "boolean",
      description: "Enable filtering",
      defaultValue: true,
    },
    enableSummation: {
      type: "boolean",
      description: "Enable summation",
      defaultValue: true,
    },
    rowsPerPageOptions: {
      type: "array",
      description: "Rows per page options",
      defaultValue: [10, 25, 50, 100],
    },
    columns: {
      type: "array",
      description: "Available columns",
      defaultValue: [],
    },
    textFilterColumns: {
      type: "array",
      description: "Text filter columns",
      defaultValue: [],
    },
    redFields: {
      type: "array",
      description: "Red colored fields",
      defaultValue: [],
    },
    greenFields: {
      type: "array",
      description: "Green colored fields",
      defaultValue: [],
    },
    onSortChange: {
      type: "eventHandler",
      argTypes: [{ name: "enabled", type: "boolean" }],
    },
    onFilterChange: {
      type: "eventHandler",
      argTypes: [{ name: "enabled", type: "boolean" }],
    },
    onSummationChange: {
      type: "eventHandler",
      argTypes: [{ name: "enabled", type: "boolean" }],
    },
    onRowsPerPageOptionsChange: {
      type: "eventHandler",
      argTypes: [{ name: "options", type: "array" }],
    },
    onTextFilterColumnsChange: {
      type: "eventHandler",
      argTypes: [{ name: "columns", type: "array" }],
    },
    onRedFieldsChange: {
      type: "eventHandler",
      argTypes: [{ name: "fields", type: "array" }],
    },
    onGreenFieldsChange: {
      type: "eventHandler",
      argTypes: [{ name: "fields", type: "array" }],
    },
  },
});