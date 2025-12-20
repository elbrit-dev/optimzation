"use client";

import { initPlasmicLoader } from "@plasmicapp/loader-nextjs";
import jmespath from "jmespath";
import _ from "lodash";


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

if (typeof window !== 'undefined') {
  window.jmespath = jmespath;
  window._ = _;
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