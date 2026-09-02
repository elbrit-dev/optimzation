import { initPlasmicLoader, DataProvider as PlasmicDataProvider } from "@plasmicapp/loader-nextjs";
import jmespath from "jmespath";
import _ from "lodash";
import jmespath_plus from '@metrichor/jmespath-plus';
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
// import DataProvider from "./share/src/app/datatable/components/DataProviderNew";
// import DataTableNew from "./share/src/app/datatable/components/DataTableNew";
// import Navigation from "./share/src/app/navigation/components/Navigation";
import { registerElbritCoreComponents } from './share/src/plasmic-init';
import MyProfile from "./components/features/my-profile";
import FirebaseUIComponent from "./components/FirebaseUIComponent";
import LoginHelpForm from "./components/LoginHelpForm";
import HelpSupport from "./components/features/help-support";
import CalendarPage from "@calendar/components/CalendarPage";
import { TAGS, TAG_IDS, EVENT_TYPE_MODES } from "@calendar/components/calendar/constants";
import NovuInbox from "./components/NovuInbox";
import PushNotificationToggle from "./components/PushNotificationToggle";
import NetworkBanner from "./components/NetworkBanner";
import DevicePrimaryGuard from "./components/DevicePrimaryGuard";
import ApprovalCard from "./components/ApprovalCard";
import SecondaryDataSummary from "./components/SecondaryDataSummary";
import SecondaryApprovalSummary from "./components/SecondaryApprovalSummary";
import ProductCard from "./components/ProductCard";
import ProductStockSheet from "./components/ProductStockSheet";
import CatalogLetterSection from "./components/CatalogLetterSection";
import CatalogLetterGroup from "./components/CatalogLetterGroup";
import DoctorCard from "./components/DoctorCard";
import HomeNavRings from "./components/HomeNavRings";
import ProgressRing from "./components/ProgressRing";
import EmployeeProfileCard from "./components/EmployeeProfileCard";
import ActionButton from "./components/ActionButton";
import VariantPills from "./components/ProductDetail/VariantPills";
import ProductHero from "./components/ProductDetail/ProductHero";
import SectionListCard from "./components/ProductDetail/SectionListCard";
import MechanismCard from "./components/ProductDetail/MechanismCard";
import DosageCard from "./components/ProductDetail/DosageCard";
import LabelClaimCard from "./components/ProductDetail/LabelClaimCard";
import MarketSizeCard from "./components/ProductDetail/MarketSizeCard";
import CompetitorBrandsCard from "./components/ProductDetail/CompetitorBrandsCard";
import DetailingAngleCard from "./components/ProductDetail/DetailingAngleCard";
import CompositionCard from "./components/ProductDetail/CompositionCard";
import CommonDataTable from "./components/CommonDataTable/CommonDataTable";
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

PLASMIC.registerComponent(HelpSupport, {
  name: "HelpSupport",
  displayName: "Help Support",
  description: "Help desk dashboard, knowledge base, and HD ticket creation flow.",
  props: {
    url: {
      type: "string",
      displayName: "GraphQL URL",
      description: "ERP GraphQL URL, for example https://uat.elbrit.org/api/method/graphql.",
    },
    token: {
      type: "string",
      displayName: "Auth token",
      description: "ERP token header value, for example token key:secret.",
    },
    className: {
      type: "string",
      displayName: "className",
      description:
        "Applied to the root element so width, height, and spacing can be set from Studio. Setting it replaces the built-in full-height sizing, so set a height here too.",
      defaultValue: "",
    },
  },
  styleSections: true,
  importPath: "./components/features/help-support",
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

// Register FirebaseUIComponent
PLASMIC.registerComponent(FirebaseUIComponent, {
  name: "FirebaseUIComponent",
  description:
    "Native Firebase Authentication UI (Google & Phone). Shows a busy overlay for the whole sign-in — including your own onSuccess work — and toasts the result.",
  isDefaultExport: true,
  importPath: "./components/FirebaseUIComponent",
  props: {
    className: {
      type: "string",
    },
    showToasts: {
      type: "boolean",
      defaultValue: true,
      description:
        "Toast the outcome: success names who signed in, failure shows a readable reason instead of a raw Firebase code.",
    },
    renderToaster: {
      type: "boolean",
      defaultValue: true,
      description:
        "Render this component's own Sonner <Toaster>. Turn OFF only if the page already renders one, or toasts appear twice.",
    },
    toastPosition: {
      type: "choice",
      options: [
        "top-right",
        "top-center",
        "top-left",
        "bottom-right",
        "bottom-center",
        "bottom-left",
      ],
      defaultValue: "top-right",
      description: "Where the toasts appear. Ignored when \"Render toaster\" is off.",
    },
    finishingLabel: {
      type: "string",
      defaultValue: "Setting up your account…",
      description:
        "Overlay text while YOUR onSuccess handler runs (the ERP login / redirect step) — the slow part users used to see nothing during.",
    },
    onSuccess: {
      type: "eventHandler",
      argTypes: [{ name: "data", type: "object" }],
      description:
        "Runs after Firebase authenticates. The overlay stays up until this finishes, so if it fails the user gets an error toast and the sign-in form back.",
    },
    onError: {
      type: "eventHandler",
      argTypes: [{ name: "error", type: "object" }],
    },
    onLoadingChange: {
      type: "eventHandler",
      argTypes: [{ name: "loading", type: "boolean" }],
      description:
        "Fires whenever the overlay opens or closes — bind it to page state to disable your own buttons while signing in.",
    },
  },
});

PLASMIC.registerComponent(LoginHelpForm, {
  name: "LoginHelpForm",
  displayName: "Help / Report Form",
  description:
    "ONE component, TWO jobs — pick with `variant`. LOGIN: the \"Can't log in?\" escape hatch for the login page, which talks about HR. IN-APP: a \"Something looks wrong? Report it\" button for use inside the app, which talks about SUPPORT instead, asks what kind of problem it is, attaches the browser console errors and page context, and files to BUGS - IT for vishnuk.mis@elbrit.org. Everything below describes the login variant; see the `variant` prop for how in-app differs. Original description: the \"Can't log in?\" escape hatch for the LOGIN page — a small trigger link plus the modal it opens. Drop it under the FirebaseUIComponent sign-in widget; it needs no props to work. The employee enters Employee ID + designation + mobile, and it raises an ERP Task assigned to HR. Designation is a SEARCHABLE dropdown fed live from ERP's Designation doctype (type to filter, arrows + Enter to pick) that falls back to plain free text if ERP can't be reached. Otherwise deliberately a PLAIN form: it does not check the details as they type — someone already locked out shouldn't be argued with by a form. The diagnosis happens out of sight instead: the API route reads the Employee record AND the ERP User it links to, then writes the actual cause into the ticket HR receives (empty user_id, a stale user_id pointing at nothing, a disabled ERP User, a non-Active employee) with the specific fix for each, and raises the priority to High when it finds one. The phone is recorded but never verified — User.mobile_no is empty on all but a couple of Users, so checking it would flag nearly everyone. Repeat submits reuse the existing open ticket instead of spamming HR. Because this runs BEFORE login there is no user ERP token, so it posts to /api/hr/login-help, which reads ERP credentials server-side — by default the NEXT_PUBLIC_GRAPHQL_ENDPOINT_/_AUTH_TOKEN_ pair already on Netlify (erpTarget picks ERP vs UAT). Nothing needs adding to Netlify to make it work.",
  isDefaultExport: true,
  importPath: "./components/LoginHelpForm",
  props: {
    variant: {
      type: "choice",
      options: [
        { value: "login", label: "Login — can't sign in (login page)" },
        { value: "in-app", label: "In-app — report a problem (inside the app)" },
      ],
      defaultValue: "login",
      description:
        "Which job this instance does. 'login' is the escape hatch for the LOGIN page: a quiet \"Can't log in? Click here\" text link, a bottom sheet on mobile, three fields (Employee ID, Designation, Mobile), and it names HR throughout — filed to HR under LoginIssue. 'in-app' is for use INSIDE the app — someone on the home page seeing blanks or zeros. It has NO input fields at all: it shows who they're reporting as (from the `employee` prop) and a single send button, and the browser's console errors + page context are the report. It says SUPPORT rather than HR everywhere (the person reporting a blank screen has no reason to think about HR), and files to BUGS - IT for vishnuk.mis@elbrit.org, using the first console error as the ticket subject. BOTH variants check ERP on open: if that employee already has a ticket open, the form shows that ticket and its progress INSTEAD of a send button, so nobody can raise the same thing twice. Everything below overrides the variant's own defaults; leave a field empty to keep them.",
    },
    triggerLabel: {
      type: "string",
      defaultValue: "",
      description:
        "Text on the trigger. Leave EMPTY for the variant's own wording — \"Can't log in? Click here\" on login, \"Something looks wrong? Report it\" in-app. Keep it plain; the people who need it are already stuck.",
    },
    title: {
      type: "string",
      defaultValue: "",
      description: "Heading inside the modal. Leave empty for the variant's own wording.",
    },
    subtitle: {
      type: "string",
      defaultValue: "",
      description:
        "Supporting line under the heading, hidden on the success screen. Leave empty for the variant's own wording.",
    },
    reassurance: {
      type: "string",
      defaultValue: "",
      description:
        "The general line under the submit button. It stands in for the per-field checking the form deliberately doesn't do — it tells them what happens next instead of judging what they typed. Leave empty for the variant's own wording.",
    },
    submitLabel: {
      type: "string",
      defaultValue: "",
      description: "Label on the submit button. Leave empty for the variant's own wording.",
    },
    employee: {
      type: "object",
      description:
        "WHO is reporting — ONE object, for the in-app variant. Bind a raw ERP Employee record straight to it: it reads `name` (or employeeId/employee/id) as the Employee ID, `employee_name` as the person, plus `designation` and `cell_number`. Give it this and the in-app form asks for NO personal details at all — just \"What looks wrong?\" and a send button, with a quiet \"Sending as …\" line so they can see who it goes as. Values arriving after mount are picked up. If it's missing an Employee ID the form falls back to asking for one, since a report nobody can trace to a person is close to useless. The login variant ignores this — nobody is signed in there yet.",
    },
    captureConsole: {
      type: "boolean",
      description:
        "Attach recent browser console errors/warnings, uncaught exceptions, the page URL and device details to the report. Defaults ON for the in-app variant and OFF for login (nothing is running there yet worth capturing). Capture starts when the component MOUNTS, so put it high on the page — anything thrown before that is missed. The form always tells the person what's being attached; it is never silent.",
    },
    accentColor: {
      type: "color",
      defaultValue: "#2563eb",
      description:
        "Drives the trigger link, focus rings and the submit button. Match it to the login page's primary colour.",
    },
    showNoteField: {
      type: "boolean",
      defaultValue: true,
      description:
        "Keeps the optional \"What happens when you try?\" box. Worth leaving on — free-text symptoms ('I never get the OTP') are what tell HR apart the cases the automatic diagnosis can't see.",
    },
    project: {
      type: "string",
      defaultValue: "",
      description:
        "ERP project the tickets are filed under. Accepts the project ID (BUG-0002) or the name (LoginIssue). LEAVE EMPTY to use the variant's default — LoginIssue for login, BUGS - IT for in-app — which is normally what you want. If it doesn't resolve, the ticket is still created and assigned, just unfiled.",
    },
    assignee: {
      type: "string",
      defaultValue: "",
      description:
        "ERP user the tickets are assigned to. LEAVE EMPTY for the variant's default: hr@elbrit.org for login, vishnuk.mis@elbrit.org for in-app. Whatever you put here must be a REAL ERP User — assignment failures are swallowed so they can never lose the ticket, which means a typo leaves reports filed but silently unassigned. (There is no vishnu.mis@elbrit.org; the account is vishnuk.mis, with the k.) Must be an @elbrit.org address — the endpoint is public, so anything else is rejected rather than letting a stranger direct ERP mail at an outside address.",
    },
    erpTarget: {
      type: "choice",
      options: ["", "ERP", "UAT"],
      defaultValue: "",
      description:
        "Which ERP the tickets go to — picks the NEXT_PUBLIC_GRAPHQL_ENDPOINT_/_AUTH_TOKEN_ pair by suffix. LEAVE EMPTY for the deployment's own setting (ERP_TARGET, defaulting to ERP/production). Set UAT on a test page so its tickets don't land in live ERP.",
    },
    erpUrl: {
      type: "string",
      defaultValue: "",
      description:
        "The ERP origin. Just the scheme + host, no path and no trailing slash: https://erp.elbrit.org for production, https://uat.elbrit.org for UAT. (A /api/method/graphql suffix is tolerated and stripped, so pasting the GraphQL endpoint works too.) Must be set TOGETHER with Auth Token — either alone is rejected, because a URL from one environment married to a token from another is how prod tickets get written with a UAT credential. Only those two hosts plus whatever is in NEXT_PUBLIC_GRAPHQL_ENDPOINT_ERP/_UAT or ERP_BASE_URL are accepted; an unrestricted URL here would let anyone point our server at a host of their choosing.",
    },
    authToken: {
      type: "string",
      defaultValue: "",
      description:
        "A Frappe API key + secret joined by a colon: <api_key>:<api_secret> — generate it in ERP under User → API Access → Generate Keys. Do NOT include the word \"token\" (it's tolerated if you do). The account needs read on Employee and User, and create on Task. ⚠️ A token typed here is PUBLIC: this component sits on the LOGIN page, so the value ships to every visitor's browser and is readable in devtools by anyone, signed in or not. Left empty, the token is read server-side from env and never reaches the browser at all — so prefer erpTarget, and only put a value here if it's a narrow credential you'd be comfortable publishing. Must be set together with ERP URL.",
    },
    submitEndpoint: {
      type: "string",
      defaultValue: "/api/hr/login-help",
      description:
        "Ticket-raising endpoint. Only change this if the API route is moved.",
    },
    ticketStatusEndpoint: {
      type: "string",
      defaultValue: "/api/hr/ticket-status",
      description:
        "IN-APP ONLY. Looks up whether this employee already has an open ticket. PREFETCHED on mount, not on click, and cached in localStorage per variant+employee, so the modal opens with the answer already in hand instead of waiting on ERP. The cached answer renders immediately and is refreshed behind it (stale-while-revalidate, 5-minute TTL) — a ticket resolved since it was stored self-corrects, so nobody is left stuck looking at a closed ticket. The login variant never calls this: its Employee ID is typed by hand, so a lookup would fire on every keystroke; it waits for Submit instead, and the submit route reports an existing ticket back. If the call fails, the form just offers to send; the submit route dedupes server-side regardless, so the worst case is a wasted tap rather than a duplicate. Only change this if the API route is moved.",
    },
    designationsEndpoint: {
      type: "string",
      defaultValue: "/api/hr/designations",
      description:
        "LOGIN VARIANT ONLY: supplies the Designation dropdown from ERP's Designation doctype (~85 entries), fetched the first time the modal opens rather than on page load. In-app has no designation field, so it never calls this. Only change it if the API route is moved. If it fails, the field silently degrades to free text — the form is never blocked on it.",
    },
    onSubmitted: {
      type: "eventHandler",
      argTypes: [
        { name: "ticket", type: "string" },
        { name: "duplicate", type: "boolean" },
      ],
      description:
        "Fires (ticket, duplicate) once the ERP Task exists — `ticket` is the Task ID (TASK-2026-00234), `duplicate` is true when an open ticket already existed and was reused. Optional: the modal already shows its own confirmation, so wire this only if the page needs to react too.",
    },
    className: { type: "string" },
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
    eventTypes: {
      type: "choice",
      multiSelect: true,
      options: TAGS.map((tag) => ({ label: tag.label, value: tag.id })),
      defaultValue: [TAG_IDS.LEAVE, TAG_IDS.MEETING, TAG_IDS.TODO_LIST],
      helpText:
        "Event types to apply the rule below to. Pick none and every type is enabled.",
    },
    eventTypesMode: {
      type: "choice",
      options: [
        { label: "Disabled — hide the picked types", value: EVENT_TYPE_MODES.DISABLED },
        { label: "Enabled — show only the picked types", value: EVENT_TYPE_MODES.ENABLED },
      ],
      defaultValue: EVENT_TYPE_MODES.DISABLED,
      helpText:
        "How to read the picked types. A type that ends up off is hidden from the event form, filtered off the calendar, and its data is never fetched — and with Leave off, the 'employee is on approved leave' guard on Add Event stops blocking.",
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
      // Reads NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER (set per Netlify deploy context);
      // falls back to the self-hosted (notify.elbrit.org) Production env identifier.
      defaultValue: process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER || "K3rsfIP_eYvg",
    },
    subscriberHash: {
      type: "string",
      description: "Optional subscriber hash for HMAC.",
    },
    apiUrl: {
      type: "string",
      description: "Novu API base URL. Self-hosted; without it the widget hits Novu Cloud.",
      defaultValue: process.env.NEXT_PUBLIC_NOVU_BACKEND_URL || "https://api.notify.elbrit.org",
    },
    socketUrl: {
      type: "string",
      description: "Novu WebSocket URL for live inbox updates (self-hosted).",
      defaultValue: process.env.NEXT_PUBLIC_NOVU_SOCKET_URL || "https://ws.notify.elbrit.org",
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
    "Inline banner that measures real download speed and appears only when the connection is genuinely slow or offline. Place it anywhere in the tree (page top, inside a header, above a table) and it renders right there, filling the width of its slot. Clicking it runs a fast.com-style speed test with a live Mbps readout; it then closes itself once the connection reads good. When there is nothing to report it renders nothing at all, so it takes up zero space — no gap or empty box in your layout.",
  props: {
    showWhenFast: {
      type: "boolean",
      defaultValue: false,
      description: "Also show a green banner when the connection is fast.",
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
    "Summary card for the secondary approval flow with 4 variants: 'select' (checkbox), 'toggle' (on/off switch), 'actions' (per-card Reject/Approve buttons), and 'select-actions' (checkbox AND Reject/Approve together). Title + a status pill + two metric columns (e.g. Sales / Closing, each Qty + Value) and an optional attachments badge (🔗 + count) that fires onLinkClick. `checked` is just true/false — bind it to your control (a Select All boolean, or the card's own checked state). onCheckedChange fires (checked, value) AUTOMATICALLY whenever checked flips — on a click OR when set from outside — so you wire the value handling once: Add element `value` (when checked) / Remove elements `value` (when not) into your [] array (init it to []). Select All only flips the boolean; it never passes a value. For actions/select-actions, onApprove/onReject fire with `value`, and turning on `showRevisit` adds the ERP's third action (Reject | Revisit | Approve) — Revisit sends the slice back to the start of the chain, stays available while the slice awaits verification, and must be committed through the ERP method operational_tracker_decision, never a plain status write. Wire onCardClick to open the slice's detail view; set `locked` on already-decided slices (dim, no controls) and drive the `status`/`statusTone`/`rejectionReason` pill from the tracker's status.",
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
      defaultValue: false,
      description:
        "OFF by default: only the checkbox/toggle itself selects — clicking the card body does NOT tick it. Turn ON to also toggle when clicking anywhere on the card. IGNORED once onCardClick is wired (the body navigates instead). No effect in the actions variant.",
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
    showRevisit: {
      type: "boolean",
      defaultValue: false,
      description:
        "actions/select-actions: add the THIRD button — Revisit — which sends the slice back to the start of the approval chain. The row becomes Reject | Revisit | Approve (equal columns, so it still fits a phone). Turn this on wherever the approver acts on Operational Tracker slices.",
    },
    onRevisit: {
      type: "eventHandler",
      argTypes: [{ name: "value", type: "object" }],
      description:
        "Fired when Revisit is clicked, with this card's `value`. Like Reject this only SIGNALS intent — wire it to open your reason sheet, then on confirm call the ERP method `operational_tracker_decision` with { name, action: 'revisit', reason_for_revisit } (the reason is REQUIRED). Do NOT just write the status: the server only restarts the chain when the previous state ended in 'Rejected', which that method stages for you.",
    },
    revisitLabel: {
      type: "string",
      defaultValue: "Revisit",
      description: "Label of the Revisit button.",
    },
    revisitColor: {
      type: "color",
      defaultValue: "#7c3aed",
      description: "Revisit button background color (violet by default, to read as neither approve nor reject).",
    },
    canRevisit: {
      type: "boolean",
      description:
        "OPTIONAL hard override for whether Revisit is allowed. Leave EMPTY (the normal case) and the card derives it from `status`: allowed while the status ends with 'Approval Waiting' OR with 'Approved and Waiting for Verification'. Set true/false only to drive the rule from the page yourself.",
    },
    viewerRole: {
      type: "string",
      description:
        "OPTIONAL role of the logged-in user ('ABM' / 'RBM' / 'SM' / 'GM' / 'CEO' / 'MIS'). When set, Revisit shows only if it matches the role that owns the current state (the first word of `status`) — per the ERP workflow only that role may revisit, and MIS (who verifies) may not. IMPORTANT: the ERP method does NOT enforce this server-side, so this or `canRevisit` is the only thing holding the rule. Leave empty if the page already gates the card.",
    },
    revisitReason: {
      type: "string",
      description:
        "OPTIONAL explicit revisit note. Normally leave EMPTY — after a revisit the ERP writes the reason back onto reason_for_rejection prefixed 'Revisit (from <state>): …', and the card detects that prefix on `rejectionReason` by itself.",
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
      description: "Force an already-DECIDED look: dim the card and hide the checkbox and Reject/Approve buttons (it can still be tapped to open detail if onCardClick is wired). Usually you DON'T need to set this — with lockWhenDecided on (the default) the card locks itself once the status is approved/rejected. Use this only to lock a card manually. Different from `disabled`, which fully blocks a pending card. NOTE: locking never hides a legal Revisit — that button follows its own rule.",
    },
    lockWhenDecided: {
      type: "boolean",
      defaultValue: true,
      description: "Auto-lock the card once its status is DECIDED — i.e. the tone resolves to approved or rejected (only 'ABM Approval Waiting' stays actionable). After Approve/Reject flips the status, those two buttons disappear on their own. Turn OFF to keep them visible after a decision. Revisit is exempt: a card sitting in 'ABM Approved and Waiting for Verification' still shows Revisit alone, because ERP still allows it there.",
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
        { value: "auto", label: "Auto (from status text)" },
        { value: "waiting", label: "Waiting (amber)" },
        { value: "approved", label: "Approved (green)" },
        { value: "rejected", label: "Rejected (red)" },
      ],
      defaultValue: "auto",
      description: "Colour of the status pill. Leave on 'Auto' and the tone is derived from the status TEXT automatically (contains 'Reject' → red, 'Approved' → green, e.g. 'ABM Approval Waiting' → amber). Pick a specific tone only to override.",
    },
    rejectionReason: {
      type: "string",
      description:
        "Bind to the tracker's reason_for_rejection. Shown as a red inline note when the tone is 'rejected'. If the text carries the ERP revisit prefix ('Revisit (from <state>): …') it instead renders as a VIOLET 'Sent back for revisit' note plus a 'Revisited' chip, and stays visible in the waiting tone a revisited slice returns to. Make sure your query actually fetches reason_for_rejection — it's the only field carrying the revisit note.",
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

PLASMIC.registerComponent(SecondaryDataSummary, {
  name: "SecondaryDataSummary",
  displayName: "Secondary Summary Card",
  description:
    "A single summary card for the Secondary Data Entry page — sits beside the Approval Cards. Shows the entrant's (BE / covering manager) whole period at a glance: total secondary sales & closing, customer count, and how many SEAT ROUTES are Approved / Waiting / Rejected, plus four status-split cards (Secondary Value/Qty, Closing Value/Qty). Clicking the card, a KPI, the badge or a split card opens a POPUP with the rejections to fix, a customer-by-customer breakdown (seat routes + item lines) and top products. Bind `data` to the `secondary` result of the page query ($queries.<query>.secondary) — it accepts the whole query object, the connection ({edges}), an array of edges, or an array of nodes. One entry can span several seats (custom_role_profile); each seat's numbers are summed from its item lines and its status (single-level approval — the status text names the approver) comes from the matching custom_status_tracker row.",
  props: {
    data: {
      type: "object",
      description:
        "The Secondary Data Entry rows for the selected period. Bind to the flat array on the page, e.g. $ctx.data.main.rawData (or a query's `secondary` field). Tolerant of shape — accepts an array of nodes (rawData), an array of edges, the { edges:[{node}] } connection, or the whole query object { secondary: {...} }. Each node uses: total_sales_qty/total_sales_value/total_closing_qty/total_closing_balance (header totals; custom_total_* also accepted), distributor.customer_name (or distributor_customer_name/distributor__name), date, items[] (sales_qty/sales_value/closing_qty/closing_balance + custom_role_profile__name/custom_hq__name/custom_department__name + item__name + flat custom_last_pts/ptr/mrp), and custom_status_tracker[] (status__name, tracker__name).",
      defaultValue: {
        edges: [
          {
            node: {
              name: "Sujith Pharma-2027-09-13",
              distributor: { customer_name: "Sujith Pharma" },
              distributor__name: "Sujith Pharma",
              date: "2027-09-13",
              items: [
                { item__name: "CARDI Q", item: { item_name: "CARDI Q" }, sales_qty: 11, sales_value: 1650, closing_qty: 5, closing_balance: 750, custom_role_profile__name: "BE7-VASC-CO-NAG", custom_hq__name: "HQ-Nagercoil", custom_department__name: "Vasco Coimbatore - ELPL" },
                { item__name: "CARDI Q", item: { item_name: "CARDI Q" }, sales_qty: 5, sales_value: 750, closing_qty: 3, closing_balance: 450, custom_role_profile__name: "ABM1-ELBR-CO-COI", custom_hq__name: "HQ-Coimbatore", custom_department__name: "Elbrit Coimbatore - ELPL" },
                { item__name: "CARDI Q", item: { item_name: "CARDI Q" }, sales_qty: 4, sales_value: 600, closing_qty: 1, closing_balance: 150, custom_role_profile__name: "BE8-ELBR-RA-JOD", custom_hq__name: "HQ-Jodhpur", custom_department__name: "Elbrit Rajasthan - ELPL" },
              ],
              custom_status_tracker: [
                { status__name: "ABM Rejected", tracker__name: "Secondary Data Entry-Sujith Pharma-2027-09-13-BE7-VASC-CO-NAG" },
                { status__name: "RBM Approval Waiting", tracker__name: "Secondary Data Entry-Sujith Pharma-2027-09-13-ABM1-ELBR-CO-COI" },
                { status__name: "ABM Approval Waiting", tracker__name: "Secondary Data Entry-Sujith Pharma-2027-09-13-BE8-ELBR-RA-JOD" },
              ],
            },
          },
          {
            node: {
              name: "Amrutha Agencies-2027-08-27",
              distributor: { customer_name: "Amrutha Agencies" },
              distributor__name: "Amrutha Agencies",
              date: "2027-08-27",
              items: [
                { item__name: "SITADOC 50", item: { item_name: "SITADOC 50" }, sales_qty: 66, sales_value: 8427.54, closing_qty: 20, closing_balance: 2553.8, custom_role_profile__name: "BE16-ELBR-PR-ALI", custom_hq__name: "HQ-Aligharh", custom_department__name: "Elbrit West Uttar Pradesh - ELPL" },
                { item__name: "TELBRIT NB 40/2.5", item: { item_name: "TELBRIT NB 40/2.5" }, sales_qty: 43, sales_value: 3631.78, closing_qty: 5, closing_balance: 422.3, custom_role_profile__name: "BE16-ELBR-PR-ALI", custom_hq__name: "HQ-Aligharh", custom_department__name: "Elbrit West Uttar Pradesh - ELPL" },
              ],
              custom_status_tracker: [
                { status__name: "ABM Approval Waiting", tracker__name: "Secondary Data Entry-Amrutha Agencies-2027-08-27-BE16-ELBR-PR-ALI" },
              ],
            },
          },
        ],
      },
    },
    title: {
      type: "string",
      defaultValue: "Secondary summary",
      description: "Card heading.",
    },
    periodLabel: {
      type: "string",
      defaultValue: "",
      description: "Optional period shown before the title (e.g. 'Sep 2027'). Bind to the selected month/report label. Leave empty to show just the title.",
    },
    currency: {
      type: "string",
      defaultValue: "₹",
      description: "Currency symbol prefixed to value figures.",
    },
    locale: {
      type: "string",
      defaultValue: "en-IN",
      description: "Intl locale for number grouping (Indian grouping by default).",
    },
    showClosingCards: {
      type: "boolean",
      defaultValue: true,
      description: "Show all four status-split cards (Secondary Value/Qty + Closing Value/Qty). Turn OFF to show only the two Secondary cards.",
    },
    showProducts: {
      type: "boolean",
      defaultValue: true,
      description: "Show the 'Top products · secondary value' list inside the popup.",
    },
    showItems: {
      type: "boolean",
      defaultValue: true,
      description: "Show the item-line table inside each expanded customer in the popup.",
    },
    openByDefault: {
      type: "boolean",
      defaultValue: false,
      description: "Open the detail popup on load. Handy for previewing the popup on the Studio canvas; leave OFF in production.",
    },
    emptyText: {
      type: "string",
      defaultValue: "No secondary entries for this period.",
      description: "Message shown when `data` has no rows.",
    },
    accentColor: {
      type: "color",
      defaultValue: "#2f43c9",
      description: "Accent used for card hover/focus and product bars.",
    },
    onCustomerClick: {
      type: "eventHandler",
      argTypes: [{ name: "customer", type: "object" }],
      description: "Fires with the customer's docname when a customer's group title in the popup is clicked (only while grouped by Customer). Wire it to open that Secondary Data Entry if you want; leave unwired and the title is plain text.",
    },
    onFixRejected: {
      type: "eventHandler",
      argTypes: [{ name: "route", type: "object" }],
      description: "Fires when 'Fix & resubmit' is clicked on a rejected route, with { customer, roleProfile, hq }. Wire it to open that entry for re-entry. If left unwired, the button is hidden.",
    },
    className: {
      type: "string",
      description: "CSS class for the card container.",
    },
  },
  importPath: "./components/SecondaryDataSummary",
});

PLASMIC.registerComponent(ProductCard, {
  name: "ProductCard",
  displayName: "Product Card",
  description:
    "ONE catalogue card for ONE brand — place it, or repeat it in Studio, and bind each instance its own brand's rows. Renders the brand title, variant pills (10 / 20 / 40) and the MRP / PTR / PTS row for the selected pill. The children slot renders BELOW the price row — that's where you add the per-warehouse stock chips separately. Optional GLOBAL STOCK shows only when totalStock (direct value) or totalStockField (column on the selected row) is set; the card never sums anything itself.",
  props: {
    data: {
      type: "object",
      description:
        "The rows of THIS brand only (its variants). Tolerant of shape — array of nodes, array of edges, { edges:[{node}] }, or a single row object. Each row uses item_name and custom_last_mrp / custom_last_ptr / custom_last_pts by default.",
      defaultValue: [
        { brand__name: "ACIBRIT", item_name: "ACIBRIT 10", custom_last_mrp: 466.45, custom_last_ptr: 355.39, custom_last_pts: 319.85 },
        { brand__name: "ACIBRIT", item_name: "ACIBRIT 20", custom_last_mrp: 512.1, custom_last_ptr: 390.2, custom_last_pts: 351.18 },
        { brand__name: "ACIBRIT", item_name: "ACIBRIT 40", custom_last_mrp: 133.29, custom_last_ptr: 101.55, custom_last_pts: 91.4 },
      ],
    },
    brand: {
      type: "string",
      description: "Card title. Leave empty to take it from the first row's brandField.",
    },
    brandField: {
      type: "string",
      defaultValue: "brand__name",
      description: "Column holding the brand, used when the brand prop is empty. Reads flattened (\"brand__name\") or nested ({ brand: { name } }) shapes.",
    },
    variantNameField: {
      type: "string",
      defaultValue: "item_name",
      description: "Column holding the item name. The variant pill strips the brand prefix, so \"ROZULA CV 10\" under brand \"ROZULA\" shows as \"CV 10\".",
    },
    priceFields: {
      type: "object",
      description: "The price row, in order. Defaults to [{ field: \"custom_last_mrp\", label: \"MRP\" }, { field: \"custom_last_ptr\", label: \"PTR\" }, { field: \"custom_last_pts\", label: \"PTS\" }]. Pass fewer or different entries to change the row.",
    },
    totalStock: {
      type: "number",
      description: "GLOBAL STOCK shown directly — bind a computed total here. Takes precedence over totalStockField. Leave both unset to hide the block.",
    },
    totalStockField: {
      type: "string",
      description: "Column on the selected variant's row already holding the stock TOTAL. The card does not sum a nested per-warehouse list — total it upstream (derivedColumn) and name it here.",
    },
    singleProduct: {
      type: "boolean",
      defaultValue: false,
      description: "Switches the card to its SINGLE-PRODUCT variant: it represents one product instead of a brand with several variants. The title becomes the item name, the variant pills and the \"N variants\" count are dropped, and the brand shows as a small line beneath. Prices, stock, extras and the click payload are unchanged, so the same onCardClick handler works in both modes. Bind `data` to a single row (or the first row is used).",
    },
    showBrandLine: {
      type: "boolean",
      defaultValue: true,
      description: "Single-product mode only: show the brand as a small line under the product name.",
    },
    clickable: {
      type: "boolean",
      defaultValue: true,
      description: "Make the card clickable (fires onCardClick). Variant pills always stay independently clickable.",
    },
    onCardClick: {
      type: "eventHandler",
      description: "Fires when the card is clicked, with { brand, variant, row, variants } — row is the currently selected variant's full data row.",
      argTypes: [{ name: "payload", type: "object" }],
    },
    onVariantChange: {
      type: "eventHandler",
      description: "Fires when a variant pill is picked, with { index, variant, row }.",
      argTypes: [{ name: "payload", type: "object" }],
    },
    children: {
      type: "slot",
      description: "Renders below the price row — the place for warehouse chips or any extra content.",
    },
    className: { type: "string", description: "CSS class for the card container." },
  },
  importPath: "./components/ProductCard",
});

PLASMIC.registerComponent(CatalogLetterSection, {
  name: "CatalogLetterSection",
  displayName: "Catalog Letter Section",
  description:
    "The letter holder (A, B, C …) for the catalogue: a red letter heading plus a slot for the Product Cards you place or repeat inside it. Stamps data-letter on itself — the jump target the provider's A–Z rail (showLetterRail on Elbrit DataProvider (Views)) scrolls to and tracks.",
  props: {
    letter: {
      type: "string",
      defaultValue: "A",
      description: "The section letter. Only the first character is used, uppercased.",
    },
    showLetter: {
      type: "boolean",
      defaultValue: true,
      description: "Show the red letter heading. The data-letter jump target stays either way.",
    },
    children: {
      type: "slot",
      defaultValue: [{ type: "component", name: "ProductCard" }],
    },
    className: { type: "string", description: "CSS class for the section container." },
  },
  importPath: "./components/CatalogLetterSection",
});

PLASMIC.registerComponent(ProductStockSheet, {
  name: "ProductStockSheet",
  displayName: "Product Stock Sheet",
  description:
    "The product-detail sheet: title + Brand line, the brand's variants as pills, MRP/PTR/PTS tiles, STOCK BY WAREHOUSE rows (code chip, level bar, qty) that expand into per-batch rows (batch no, months to expire, qty), Total across warehouses, and a full-width CTA. RESPONSIVE: a bottom sheet on mobile, a centred two-column dialog (meta + total + CTA left, warehouses scrolling right) on desktop — see `layout`. Open it from a Product Card's onCardClick: set visible=true, bind items to the brand's rows and initialItemName to the clicked row's item_name. Zero-stock warehouses show red, low stock amber (lowStockThreshold).",
  props: {
    visible: {
      type: "boolean",
      defaultValue: false,
      description: "Sheet visibility. Registered as writable state — set true in an interaction (e.g. Product Card onCardClick), the sheet sets it false on close. Toggle true in Studio to style it.",
    },
    onVisibleChange: {
      type: "eventHandler",
      argTypes: [{ name: "visible", type: "boolean" }],
    },
    onClose: { type: "eventHandler", argTypes: [] },
    items: {
      type: "object",
      description:
        "The brand's items. Accepts the brand group ({ brand__name, items:[...] }), a plain array of items, a single item, or the WHOLE letter-grouped dataset (array of groups) — in that case `brand` selects the group. Item fields: item_name, custom_last_mrp/ptr/pts, package, divison[{company__name}], total_stock, warehouses[{ code, warehouse, qty, batches[{ batch_no, qty, expire_text, months_to_expire }] }].",
      defaultValue: {
        brand__name: "CLAVBRIT",
        items: [
          {
            item_name: "CLAVBRIT 375",
            custom_last_mrp: 272.55,
            custom_last_ptr: 207.66,
            custom_last_pts: 186.89,
            total_stock: 9917,
            warehouses: [
              { code: "KE", warehouse: "Kerala", qty: 0, batches: [] },
              { code: "KA", warehouse: "Karnataka", qty: 5, batches: [{ batch_no: "LGQ04/052/10", qty: 5, expire_text: "19 months to expire", months_to_expire: 19 }] },
              { code: "TG", warehouse: "Telangana", qty: 911, batches: [{ batch_no: "EET-2504062", qty: 911, expire_text: "7 months to expire", months_to_expire: 7 }] },
              { code: "SW", warehouse: "Stores – SW", qty: 731, batches: [{ batch_no: "LGP11/201/05", qty: 731, expire_text: "14 months to expire", months_to_expire: 14 }] },
              { code: "M", warehouse: "Mother WH", qty: 8270, batches: [{ batch_no: "LGQ04/052/10", qty: 8270, expire_text: "19 months to expire", months_to_expire: 19 }] },
            ],
          },
          { item_name: "CLAVBRIT 625", custom_last_mrp: 310, custom_last_ptr: 236.19, custom_last_pts: 212.57, total_stock: 4210, warehouses: [] },
          { item_name: "CLAVBRIT DUO SYP", custom_last_mrp: 118, custom_last_ptr: 89.9, custom_last_pts: 80.91, total_stock: 1830, warehouses: [] },
        ],
      },
    },
    brand: {
      type: "string",
      description: "Brand for the header line; also selects the group when items is the whole letter-grouped dataset.",
    },
    initialItemName: {
      type: "string",
      description: "Which variant is selected when the sheet opens, by FULL name — bind to the clicked card's row.item_name.",
    },
    variant: {
      type: "string",
      description: "Which variant is selected when the sheet opens, by SHORT label — bind to the click payload's `variant` (\"P\", \"MR\"). Full names also match. Case- and spacing-insensitive. Tried after initialItemName; if neither matches an item, the first variant shows.",
    },
    variantNameField: { type: "string", defaultValue: "item_name" },
    priceFields: {
      type: "object",
      description: "Same as Product Card: [{ field, label }], defaults to custom_last_mrp/ptr/pts as MRP/PTR/PTS.",
    },
    showPrices: { type: "boolean", defaultValue: true },
    showPackage: { type: "boolean", defaultValue: false, description: "Show the item's package line (e.g. \"10 x 10 Tablets\") under the brand." },
    showComposition: {
      type: "boolean",
      defaultValue: true,
      description:
        "Show the COMPOSITION tile under the prices — the item's whg_composition bullet string rendered as 'Aceclofenac 100 mg + Paracetamol 325 mg'. Hides itself when the active item has no composition, so it's safe to leave ON (just make sure the dataset feeding `items` includes the field).",
    },
    compositionField: {
      type: "string",
      defaultValue: "whg_composition",
      description: "Which item field holds the composition text. Change only if your dataset names it differently.",
    },
    compositionLabel: { type: "string", defaultValue: "Composition" },
    showDivisions: { type: "boolean", defaultValue: false, description: "Show division/company chips (from divison[].company__name)." },
    showStockBars: { type: "boolean", defaultValue: true, description: "The little stock-level bar per warehouse, scaled to the largest warehouse." },
    expandableBatches: { type: "boolean", defaultValue: true, description: "Warehouse rows with batches expand on tap to show batch no / expiry / qty." },
    hideZeroStockWarehouses: { type: "boolean", defaultValue: false },
    lowStockThreshold: { type: "number", defaultValue: 10, description: "Qty at or below shows amber; zero always shows red." },
    stockLabel: { type: "string", defaultValue: "Stock by warehouse" },
    totalLabel: { type: "string", defaultValue: "Total across warehouses" },
    showCta: { type: "boolean", defaultValue: true },
    ctaLabel: { type: "string", defaultValue: "View full product page" },
    ctaHref: {
      type: "string",
      description:
        "URL template for the CTA — the no-interaction way to navigate. {placeholders} fill from the ACTIVE item's fields plus {brand} and {variant}, URL-encoded. E.g. \"/product/{code}\" or \"/product?item={item_name}\". Leave empty to handle navigation yourself via onCtaClick.",
    },
    ctaTarget: {
      type: "choice",
      options: ["_self", "_blank"],
      defaultValue: "_self",
      description: "Where the ctaHref link opens.",
    },
    ctaBusyMs: {
      type: "number",
      defaultValue: 6000,
      description: "After a CTA tap the button presses in and fills a progress bar for this many milliseconds, giving the tap feedback while the product page opens. TIME-BASED, not real progress — set it near how long that page actually takes (5000–8000 is typical). 0 disables the busy state.",
    },
    ctaBusyLabel: {
      type: "string",
      defaultValue: "Opening…",
      description: "Label shown on the CTA while the progress bar is running.",
    },
    onCtaClick: {
      type: "eventHandler",
      description: "Fires on CTA click (also when ctaHref is set, before navigation). Payload: { brand, variant, item }.",
      argTypes: [{ name: "payload", type: "object" }],
    },
    onVariantChange: {
      type: "eventHandler",
      description: "Fires when a variant pill is picked in the sheet. Payload: { brand, variant, item }.",
      argTypes: [{ name: "payload", type: "object" }],
    },
    sheetHeight: { type: "string", defaultValue: "85vh", description: "Height of the MOBILE bottom sheet. Desktop uses desktopHeight." },
    layout: {
      type: "choice",
      options: ["auto", "sheet", "dialog"],
      defaultValue: "auto",
      description:
        "Which shell to render. \"auto\" = bottom sheet below desktopBreakpoint, centred dialog at or above it. \"sheet\" / \"dialog\" pin one everywhere — use these to style each layout in Studio, where the canvas width isn't the real device width.",
    },
    desktopBreakpoint: {
      type: "number",
      defaultValue: 1024,
      description: "Viewport width (px) at which \"auto\" switches from the bottom sheet to the desktop dialog.",
    },
    desktopWidth: {
      type: "string",
      defaultValue: "58rem",
      description: "Width of the desktop dialog (capped at 95vw). Ignored on mobile.",
    },
    desktopHeight: {
      type: "string",
      defaultValue: "min(80vh, 640px)",
      description: "Height of the desktop dialog. Ignored on mobile.",
    },
    className: { type: "string" },
  },
  states: {
    visible: {
      type: "writable",
      variableType: "boolean",
      valueProp: "visible",
      onChangeProp: "onVisibleChange",
    },
  },
  importPath: "./components/ProductStockSheet",
});

PLASMIC.registerComponent(CatalogLetterGroup, {
  name: "CatalogLetterGroup",
  displayName: "Catalog Letter Group",
  defaultStyles: { width: "stretch" },
  description:
    "ONE letter, MANY brand cards — the combined letter + Product Card component. Bind a letter group and every brand in it renders as its own card under a single red letter, instead of repeating Letter Section per brand and duplicating the letter. The letter is STICKY: pinned while its cards scroll, pushed away by the next group (repeat this over the letter-grouped array). Warehouse chips (KA – 3,978 / CB – 0) are built in from the selected variant's warehouses[] and swap when a pill is picked: zero = red, at/below lowStockThreshold = amber. The section carries data-letter, so the provider's A–Z rail works unchanged.",
  props: {
    data: {
      type: "object",
      description:
        "The letter's data. Accepts { letter, items:[rows across brands] }, per-brand entries [{ letter, brand__name, items }] (pass one letter's entries — or the whole dataset plus the `letter` prop to select), or a flat rows array. Rows: item_name, custom_last_mrp/ptr/pts, total_stock, warehouses[{ code, qty }]. Rows with null brand__name fall back to their entry's brand__name.",
      defaultValue: [
        {
          letter: "A",
          brand__name: "ACEBRIT",
          items: [
            { item_name: "ACEBRIT P", custom_last_mrp: 87.19, custom_last_ptr: 66.43, custom_last_pts: 59.79, total_stock: 2939, warehouses: [{ code: "CH", warehouse: "Chennai", qty: 586 }, { code: "KA", warehouse: "Karnataka", qty: 376 }, { code: "KE", warehouse: "Kerala", qty: 8 }, { code: "M", warehouse: "Mother WH", qty: 1568 }] },
            { item_name: "ACEBRIT MR", custom_last_mrp: 225, custom_last_ptr: 171.43, custom_last_pts: 154.29, total_stock: 6372, warehouses: [{ code: "CH", warehouse: "Chennai", qty: 1509 }, { code: "CB", warehouse: "Coimbatore", qty: 0 }, { code: "KA", warehouse: "Karnataka", qty: 927 }, { code: "M", warehouse: "Mother WH", qty: 2940 }] },
          ],
        },
        {
          letter: "A",
          brand__name: "AMOXIBRIT",
          items: [
            { item_name: "AMOXIBRIT 625", custom_last_mrp: 171.36, custom_last_ptr: 130.56, custom_last_pts: 117.5, total_stock: 19477, warehouses: [{ code: "KA", warehouse: "Karnataka", qty: 3978 }, { code: "CB", warehouse: "Coimbatore", qty: 0 }, { code: "TG", warehouse: "Telangana", qty: 4136 }, { code: "M", warehouse: "Mother WH", qty: 10593 }] },
          ],
        },
      ],
    },
    letter: {
      type: "string",
      description: "Letter override / selector. With the whole per-brand dataset bound to data, this picks only that letter's entries. Leave empty when data is already one letter's group.",
    },
    showLetter: { type: "boolean", defaultValue: true },
    stickyLetter: {
      type: "boolean",
      defaultValue: true,
      description: "Pin the letter to the top while its cards scroll; the next group's letter pushes it away. JS-driven (fixed-position while pinned), so it works even inside page sections whose overflow breaks CSS sticky.",
    },
    stickyOffset: {
      type: "string",
      defaultValue: "0px",
      description: "How far from the top of the SCREEN the letter pins — set this to your fixed app header's height (e.g. \"8vh\" or \"56px\"; px, vh, vw and rem all work) or the letter will pin underneath it and look like it disappeared.",
    },
    letterClassName: {
      type: "string",
      description: "Replaces the letter's default classes entirely (default: plain small red letter, no background at rest).",
    },
    pinnedLetterClassName: {
      type: "string",
      defaultValue: "bg-gray-50",
      description: "Background applied to the letter row ONLY while it is pinned, so cards scroll underneath instead of showing through it. Set this to match your page background (e.g. \"bg-white\") — a transparent value brings the see-through look back.",
    },
    brandField: { type: "string", defaultValue: "brand__name" },
    variantNameField: { type: "string", defaultValue: "item_name" },
    priceFields: {
      type: "object",
      description: "Same as Product Card: [{ field, label }], defaults to custom_last_mrp/ptr/pts as MRP/PTR/PTS.",
    },
    totalStockField: { type: "string", defaultValue: "total_stock" },
    showWarehouseChips: { type: "boolean", defaultValue: true },
    warehousesField: { type: "string", defaultValue: "warehouses" },
    lowStockThreshold: {
      type: "number",
      defaultValue: 100,
      description: "Chip qty at or below shows amber; zero always shows red.",
    },
    clickable: { type: "boolean", defaultValue: true },
    onCardClick: {
      type: "eventHandler",
      description: "Same payload as Product Card: { brand, variant, row, variants } — variants is that brand's rows, ready to hand to Product Stock Sheet.",
      argTypes: [{ name: "payload", type: "object" }],
    },
    cardWidth: {
      type: "string",
      defaultValue: "320px",
      description: "Fixed card width (the mobile standard). Cards are centered and shrink on viewports narrower than this. Set empty to let cards fill the component's width.",
    },
    sortBy: {
      type: "object",
      description:
        "Bind to $ctx.data.main.sortConfig so the Sort sidebar reorders the brand cards WITHIN this letter ({ field, direction }). Numeric fields (custom_last_mrp, total_stock, …) rank each brand by its best variant's value; other fields sort brands by name. Letters themselves keep the order of your repeated data.",
    },
    className: { type: "string" },
  },
  importPath: "./components/CatalogLetterGroup",
});

PLASMIC.registerComponent(DoctorCard, {
  name: "DoctorCard",
  displayName: "Doctor Card",
  description:
    "ONE doctor row card for the doctor page list view — place it and REPEAT it over the doctor rows, binding each instance its own row (currentItem). Renders the initials avatar, doctor name, coloured speciality chip, the doctor code with a copy button, the HQ territory with a pin, and the department chips (Elbrit Kanchipuram / Vasco Coimbatore …) across the card's full width — as many per row as fit, the rest wrapping onto the next line. The whole card is clickable: onDoctorClick gives you the full row, so wire it to open a detail sheet, navigate, or start a visit — the copy button stays independently clickable. Every field is optional: anything null is left out of the card instead of rendering an empty line.",
  props: {
    data: {
      type: "object",
      description:
        "ONE doctor row (bind currentItem inside a repeat). Tolerant of shape — the row itself, a GraphQL edge ({ node }), or a single-row array/connection. Rows are ERP Lead nodes (lead_name, name, custom_specialty__name, territory { name }, custom_role_profile[{ department__name }]).",
      defaultValue: {
        name: "DR-36661",
        lead_name: "Dr Shanmugam",
        custom_specialty__name: "NEURO",
        custom_category1__name: "C",
        city: "Trichy",
        territory: { name: "HQ-Trichy" },
        custom_role_profile: [
          { department__name: "Vasco Coimbatore - ELPL" },
          { department__name: "Elbrit Trichy - ELPL" },
        ],
      },
    },
    nameField: {
      type: "string",
      defaultValue: "lead_name",
      description: "Column holding the doctor's display name. Falls back to first_name, then the code, so a card is never nameless. The salutation is skipped when building the avatar initials (\"Dr Meenakshi R\" → MR).",
    },
    codeField: {
      type: "string",
      defaultValue: "name",
      description: "Column holding the doctor code shown top-right (the Lead id, e.g. DR-36661). Falls back to custom_doctor_code.",
    },
    specialityField: {
      type: "string",
      defaultValue: "custom_specialty__name",
      description: "Column holding the speciality shown as the coloured chip. Falls back to custom_speciality / custom_specialty. The colour is derived from the text, so one speciality always keeps the same colour.",
    },
    hqField: {
      type: "string",
      defaultValue: "territory",
      description: "Column holding the HQ shown next to the pin. Reads the nested Link ({ territory: { name } }) or the flattened territory__name, then custom_hq__name.",
    },
    cityField: {
      type: "string",
      defaultValue: "city",
      description: "Column holding the city, shown as a smaller line right under the HQ. Skipped when it is the same text as the HQ; when the HQ is missing, the city takes the pin line instead.",
    },
    tagsField: {
      type: "string",
      defaultValue: "custom_role_profile",
      description: "Child table holding the department chips. Also accepts a plain array of strings or a comma-separated string. Every department is shown — the row wraps onto the next line instead of collapsing or truncating.",
    },
    tagLabelField: {
      type: "string",
      defaultValue: "department__name",
      description: "Field inside each tag row to label the chip. Falls back to role_profile_list__name. The trailing company abbreviation is trimmed (\"Elbrit Trichy - ELPL\" → \"Elbrit Trichy\").",
    },
    showAvatar: { type: "boolean", defaultValue: true, description: "Show the initials avatar." },
    showCopyCode: {
      type: "boolean",
      defaultValue: true,
      description: "Show the copy button beside the doctor code. Copying never counts as clicking the card.",
    },
    showCategories: {
      type: "boolean",
      defaultValue: false,
      description: "Add a muted C1 / C2 / C3 grading line under the chips, from custom_category1__name … custom_category3__name. Off by default — it isn't part of the list design.",
    },
    clickable: {
      type: "boolean",
      defaultValue: true,
      description: "Make the card clickable and keyboard-operable (fires onDoctorClick).",
    },
    selected: {
      type: "boolean",
      defaultValue: false,
      description: "Highlight this card (indigo ring) — bind e.g. currentItem.name == the open doctor to keep the list in sync with a detail sheet.",
    },
    onDoctorClick: {
      type: "eventHandler",
      description: "Fires when the card is clicked, with { doctor, row, name, code, speciality, hq, city, tags } — doctor/row is the full data row.",
      argTypes: [{ name: "payload", type: "object" }],
    },
    onCopyCode: {
      type: "eventHandler",
      description: "Fires after the doctor code is copied to the clipboard, with { code, doctor } — use it for a toast.",
      argTypes: [{ name: "payload", type: "object" }],
    },
    className: { type: "string", description: "CSS class for the card container." },
  },
  importPath: "./components/DoctorCard",
});

PLASMIC.registerComponent(SecondaryApprovalSummary, {
  name: "SecondaryApprovalSummary",
  displayName: "Secondary Approval Summary Card",
  description:
    "The summary card for the Secondary APPROVAL page — sits ABOVE the per-employee approval groups. FACE: a COUNTS row (Employees, Customers, Waiting, Approved, Rejected — the three status tiles also show SQ = Secondary Qty and CQ = Closing Qty for that bucket) and a VALUE TRACKING section (Secondary Value/Qty + Closing Value/Qty, each split Waiting/Approved/Rejected with a proportion bar). SCOPED DRILL-DOWN: every tile and every value card is clickable and opens a read-only popup with ONLY that slice (e.g. Waiting → only waiting submissions; Closing Value → the closing view), broken down BY HQ / BY CUSTOMER / BY EMPLOYEE (toggle). Bind `data` to the grouped-by-employee array the page already builds from the Operational Tracker query (Object.values(byEmp)) — it also accepts { edges:[{node}] } / { employees } / a single employee, or (fallback) a flat array of Operational Tracker nodes, which it groups by role_profile itself. Each customer's HQ falls back to the employee's hq or the item's custom_hq__name; the customer name comes from `distributor`.",
  props: {
    data: {
      type: "object",
      description:
        "The approval queue grouped by employee/seat. Bind to the page's grouped array (Object.values(byEmp)). Each element: { avatar, employee_name, role_profile, hq, customers:[{ status (or workflow_state), sales_value }] } — only the status (for the bucket) and sales_value (for the total) are read off each customer; extra fields are ignored. Tolerant of shape — also accepts the array wrapped in { edges:[{node}] } or { employees }, a single employee object, or a flat array of Operational Tracker nodes (grouped by role_profile automatically). Status buckets come from the status text (reject → Rejected, approved → Approved, else Waiting).",
      defaultValue: [
        {
          avatar: "V",
          employee_name: "Velraj S",
          role_profile: "BE7-VASC-CO-NAG",
          department: "Vasco Coimbatore - ELPL",
          hq: "HQ-Nagercoil",
          customers: [
            {
              distributor: "Prakas Pharmacy Private Limited",
              entry: "Prakas Pharmacy Private Limited-2026-08-31",
              tracker: "Secondary Data Entry-Prakas Pharmacy Private Limited-2026-08-31-BE7-VASC-CO-NAG",
              role_profile: "BE7-VASC-CO-NAG",
              date: "2026-08-31",
              status: "ABM Rejected",
              workflow_state: "ABM Rejected",
              next_role: "—",
              reason: "Closing stock looks high — recheck.",
              items: [
                { item__name: "CARDI Q", opening_qty: 51, sales_qty: 39, sales_value: 5850, closing_qty: 66, closing_balance: 9900, rate: 150 },
              ],
              sales_qty: 39, sales_value: 5850, closing_qty: 66, closing_value: 9900,
            },
            {
              distributor: "Optival Health Solutions Private Limited",
              entry: "Optival Health Solutions Private Limited-2026-08-31",
              tracker: "Secondary Data Entry-Optival Health Solutions Private Limited-2026-08-31-BE7-VASC-CO-NAG",
              role_profile: "BE7-VASC-CO-NAG",
              date: "2026-08-31",
              status: "ABM Approved and Waiting for Verification",
              workflow_state: "ABM Approved and Waiting for Verification",
              next_role: "",
              items: [
                { item__name: "NERO PG 50", opening_qty: 58, sales_qty: 25, sales_value: 3000, closing_qty: 104, closing_balance: 12480, rate: 120 },
              ],
              sales_qty: 25, sales_value: 3000, closing_qty: 104, closing_value: 12480,
            },
          ],
        },
        {
          avatar: "K",
          employee_name: "Karthick A R",
          role_profile: "BE6-VASC-CO-MAD",
          department: "Vasco Coimbatore - ELPL",
          hq: "HQ-Madurai",
          customers: [
            {
              distributor: "Palepu Pharma Dist Pvt Ltd Tambaram",
              entry: "Palepu Pharma Dist Pvt Ltd Tambaram-2026-08-31",
              tracker: "Secondary Data Entry-Palepu Pharma Dist Pvt Ltd Tambaram-2026-08-31-BE6-VASC-CO-MAD",
              role_profile: "BE6-VASC-CO-MAD",
              date: "2026-08-31",
              status: "ABM Approval Waiting",
              workflow_state: "ABM Approval Waiting",
              next_role: "ABM",
              items: [
                { item__name: "ROZULA 10 F", opening_qty: 65, sales_qty: 13, sales_value: 754, closing_qty: 132, closing_balance: 7656, rate: 58 },
              ],
              sales_qty: 13, sales_value: 754, closing_qty: 132, closing_value: 7656,
            },
          ],
        },
      ],
    },
    title: {
      type: "string",
      defaultValue: "Approval summary",
      description: "Card heading.",
    },
    periodLabel: {
      type: "string",
      defaultValue: "",
      description: "Optional period shown before the title (e.g. 'Sep 2026'). Leave empty to show just the title.",
    },
    currency: {
      type: "string",
      defaultValue: "₹",
      description: "Currency symbol prefixed to value figures.",
    },
    locale: {
      type: "string",
      defaultValue: "en-IN",
      description: "Intl locale for number grouping (Indian grouping by default).",
    },
    showClosingCards: {
      type: "boolean",
      defaultValue: true,
      description: "Show all four Value Tracking cards (Secondary Value/Qty + Closing Value/Qty). Turn OFF to show only the two Secondary cards.",
    },
    emptyText: {
      type: "string",
      defaultValue: "Nothing is waiting for your approval.",
      description: "Message shown when `data` has no rows.",
    },
    accentColor: {
      type: "color",
      defaultValue: "#2f43c9",
      description: "Accent used for the card's icon and focus outlines.",
    },
    className: {
      type: "string",
      description: "CSS class for the card container.",
    },
  },
  importPath: "./components/SecondaryApprovalSummary",
});

PLASMIC.registerComponent(HomeNavRings, {
  name: "HomeNavRings",
  displayName: "Home Nav Rings",
  description:
    "The home-screen quick-action nav row, as Instagram-style story rings. One tile per action category (Approval / Visit / Secondary / Gift / Service). The RING is split into one SEGMENT PER EVENT — green = done, red = pending — so the progress is countable at a glance; a category with no work draws a solid green 'all clear' ring. The red BADGE is the pending count, and the SUB-LABEL is when the next one is due, with red reserved for the single most urgent category. Tiles are auto-ordered by soonest deadline, and cleared categories sink to the end and mute (still tappable). Self-contained — drop it on the page and bind `data`; there is nothing to assemble in Studio. Wire `onSelect` to route to the category's page.",
  props: {
    data: {
      type: "object",
      description:
        "The action categories for today. Tolerant of shape — accepts an array of categories, a { edges:[{node}] } connection, a { categories|items|rows } wrapper, or an object keyed by category id. Per category (first alias wins): key|id|code|type, label|name|title, icon (approval|visit|secondary|gift|service), and the work as EITHER sections|tabs|groups — ONE PER SUB-TAB of that page, each { label, state } where state is done (green) / waiting (amber) / none (red) — OR the legacy per-record forms events|items|tasks, segments|done booleans, or total + pending counts. With sections, set `badge` to the record count you want on the badge, since three amber tabs are not '3 to do'. Deadline from dueAt|due|due_date|next_due (ISO or Date) drives the ordering; pass dueLabel|sub to override the computed 'due ...' text.",
      defaultValue: [
        {
          key: "apr",
          label: "Approval",
          sections: [
            { label: "Secondary", state: "waiting" },
            { label: "Service", state: "none" },
            { label: "Support", state: "none" },
          ],
          badge: 6,
          dueLabel: "due 4:00 pm",
        },
        {
          key: "vis",
          label: "Visit",
          sections: [
            { label: "Doctor", state: "done" },
            { label: "Chemist", state: "waiting" },
            { label: "Stockist", state: "none" },
          ],
          badge: 2,
          dueLabel: "due 5:30 pm",
        },
        {
          key: "sec",
          label: "Secondary",
          sections: [
            { label: "Draft", state: "done" },
            { label: "Waiting", state: "waiting" },
            { label: "Approved", state: "done" },
            { label: "Rejected", state: "none" },
          ],
          badge: 4,
          dueLabel: "due tomorrow",
        },
        { key: "srv", label: "Service", sections: [] },
      ],
    },
    sortByDue: {
      type: "boolean",
      defaultValue: true,
      description:
        "Order tiles by soonest deadline, with cleared categories last. Turn OFF to keep the order of your data exactly as given.",
    },
    showBadge: {
      type: "boolean",
      defaultValue: true,
      description: "Show the red pending-count badge on the ring.",
    },
    showDue: {
      type: "boolean",
      defaultValue: true,
      description: "Show the due / 'all clear' sub-label under each tile.",
    },
    dimCleared: {
      type: "boolean",
      defaultValue: true,
      description: "Mute categories that have nothing pending. They stay tappable either way.",
    },
    size: {
      type: "number",
      defaultValue: 62,
      description: "Ring diameter in px. The icon scales with it.",
    },
    thickness: {
      type: "number",
      defaultValue: 5,
      description: "Ring stroke thickness in px.",
    },
    gapDeg: {
      type: "number",
      defaultValue: 5,
      description:
        "Gap between ring segments, in degrees. Automatically shrinks when a category has many events so the segments stay visible.",
    },
    maxSegments: {
      type: "number",
      defaultValue: 10,
      description:
        "Above this many events the ring stops slicing per event and draws ONE two-tone arc instead — the done fraction in green, the rest in red. Past ~10 slices the gaps are wider than the segments and the ring reads as dashed noise, while the exact number is already on the badge. Raise it if you want countable ticks for longer lists, lower it to switch to the arc sooner.",
    },
    accentColor: {
      type: "color",
      defaultValue: "#2563eb",
      description: "Icon colour for categories with pending work.",
    },
    accentBg: {
      type: "color",
      defaultValue: "#eff6ff",
      description: "Inner disc colour for categories with pending work.",
    },
    doneColor: {
      type: "color",
      defaultValue: "#16a34a",
      description: "Colour of completed ring segments, and of the whole 'all clear' ring.",
    },
    pendingColor: {
      type: "color",
      defaultValue: "#dc2626",
      description:
        "Colour of 'none' segments — a tab with no data at all — plus the count badge and the most-urgent sub-label.",
    },
    waitingColor: {
      type: "color",
      defaultValue: "#f59e0b",
      description:
        "Colour of 'waiting' segments — a tab that is started but not finished (awaiting approval, partially entered).",
    },
    stateColors: {
      type: "object",
      description:
        "Per-state colour overrides, e.g. { rejected: '#b91c1c' }. Keys: done | waiting | none | rejected. 'rejected' paints as 'none' unless overridden, because 'has rejections' means different things on different pages.",
    },
    allClearText: {
      type: "string",
      defaultValue: "all clear",
      description: "Sub-label for a category with no events at all today.",
    },
    allDoneText: {
      type: "string",
      defaultValue: "all done",
      description: "Sub-label for a category whose events are all completed.",
    },
    emptyText: {
      type: "string",
      defaultValue: "Nothing queued for today.",
      description: "Shown in place of the row when `data` has no categories.",
    },
    locale: {
      type: "string",
      defaultValue: "en-IN",
      description: "Intl locale used to format due times and weekdays.",
    },
    onSelect: {
      type: "eventHandler",
      argTypes: [{ name: "category", type: "object" }],
      description:
        "Fires when a tile is tapped, with the normalised category { key, label, segments, total, pending, cleared, dueAt, href, raw }. Wire it to navigate. If left unwired, the tiles render but are not interactive.",
    },
    className: {
      type: "string",
      description: "CSS class for the row container.",
    },
  },
  importPath: "./components/HomeNavRings",
});

PLASMIC.registerComponent(ProgressRing, {
  name: "ProgressRing",
  displayName: "Progress Ring",
  description:
    "Just the story-style ring — a CONTAINER you build the rest of the tile around in Studio. Use this when you want to design the tile yourself; use 'Home Nav Rings' instead if you want the whole nav row ready-made. Two slots: the middle of the ring (drop an Icon / Image / Text) and a top-right corner (drop a box for the count badge — nothing renders if you leave it empty). Assemble the tile as a vertical stack: this ring, then your own Text elements for the label and sub-label. MODE 'segments' draws one segment per event (green = done, red = pending) so the ring stays countable and can never disagree with your badge; an empty array means 'all clear' and draws a solid unbroken ring. MODE 'progress' draws one continuous arc from a 0..1 or 0..100 number, with an optional blue→violet→pink Instagram sweep. Drawn with a CSS conic-gradient, so unlike an SVG gradient several rings on one page never collide.",
  props: {
    mode: {
      type: "choice",
      options: ["segments", "progress"],
      defaultValue: "segments",
      description:
        "'segments' = one segment per event, driven by `segments` (or `total` + `pending`). 'progress' = one continuous arc, driven by `progress`.",
    },
    segments: {
      type: "array",
      description:
        "SEGMENTS MODE. One entry per event: true = done (green), false = pending (red). Bind to your data, e.g. currentItem.segments. An EMPTY array means there is no work at all and draws a solid green 'all clear' ring. Leave this unset to use `total` + `pending` instead.",
      defaultValue: [true, true, false, false],
      hidden: (props) => props.mode === "progress",
    },
    total: {
      type: "number",
      description:
        "SEGMENTS MODE, counts fallback. Total events. Only used when `segments` is not set — the component builds the segment array for you, completed ones first.",
      hidden: (props) => props.mode === "progress" || Array.isArray(props.segments),
    },
    pending: {
      type: "number",
      description: "SEGMENTS MODE, counts fallback. How many of `total` are still pending.",
      hidden: (props) => props.mode === "progress" || Array.isArray(props.segments),
    },
    progress: {
      type: "number",
      defaultValue: 0.4,
      description:
        "PROGRESS MODE. How much of the ring is filled — 0..1, or 0..100 (anything above 1 is read as a percentage).",
      hidden: (props) => props.mode !== "progress",
    },
    useGradient: {
      type: "boolean",
      defaultValue: false,
      description:
        "PROGRESS MODE. Sweep the filled arc through a colour ramp instead of one flat colour — the original Instagram-story look.",
      hidden: (props) => props.mode !== "progress",
    },
    gradientColors: {
      type: "array",
      description:
        "PROGRESS MODE. Two or more colours for the sweep. Defaults to blue → violet → pink (#2563eb, #7c3aed, #db2777).",
      hidden: (props) => props.mode !== "progress" || !props.useGradient,
    },
    size: { type: "number", defaultValue: 62, description: "Outer diameter in px." },
    thickness: { type: "number", defaultValue: 5, description: "Ring thickness in px." },
    gapDeg: {
      type: "number",
      defaultValue: 5,
      description:
        "SEGMENTS MODE. Gap between segments, in degrees. Shrinks automatically when there are many events so the segments stay visible.",
      hidden: (props) => props.mode === "progress",
    },
    discPadding: {
      type: "number",
      defaultValue: 2,
      description: "Gap in px between the ring and the inner disc.",
    },
    doneColor: {
      type: "color",
      defaultValue: "#16a34a",
      description: "SEGMENTS MODE. Completed segments, and the whole 'all clear' ring.",
      hidden: (props) => props.mode === "progress",
    },
    pendingColor: {
      type: "color",
      defaultValue: "#dc2626",
      description: "SEGMENTS MODE. Pending segments.",
      hidden: (props) => props.mode === "progress",
    },
    fillColor: {
      type: "color",
      defaultValue: "#2563eb",
      description: "PROGRESS MODE. The filled arc, when no gradient is used.",
      hidden: (props) => props.mode !== "progress",
    },
    trackColor: {
      type: "color",
      defaultValue: "#f1f5f9",
      description: "PROGRESS MODE. The unfilled remainder of the ring.",
      hidden: (props) => props.mode !== "progress",
    },
    discColor: {
      type: "color",
      defaultValue: "#eff6ff",
      description: "Background of the disc inside the ring, behind the slot content.",
    },
    children: {
      type: "slot",
      displayName: "Center",
      description: "Goes in the middle of the ring — usually the category icon.",
      defaultValue: { type: "text", value: "★" },
    },
    badge: {
      type: "slot",
      displayName: "Corner badge",
      description:
        "Pinned to the top-right of the ring — usually a small box with the pending count. Leave empty and nothing renders.",
    },
    className: { type: "string", description: "CSS class for the ring container." },
  },
  importPath: "./components/ProgressRing",
});

PLASMIC.registerComponent(EmployeeProfileCard, {
  name: "EmployeeProfileCard",
  displayName: "Employee Profile Card",
  description:
    "Identity card for ONE employee — built for the home-page profile drawer (tap the header avatar): one card for the logged-in user, another for their manager. Deliberately SHORT — a few fields, not the whole employee record: avatar (image or initial) + name + designation + a status line ('● Active · HQ-Chennai'), then three labelled rows (company email, employee code, reports-to) each with a COPY button, and a 'View profile' button. Every field is its OWN prop — there is NO single data object to bind, so wire each one straight off the employee record: name <- employee_name, designation <- designation__name, status <- status, hq <- fsl_hq__name, email <- company_email, employeeCode <- employee, reportsTo <- reports_to.employee_name, avatarUrl <- userAvatar, initial <- Initial. The seat code (role_id / custom_role_profile__name) is deliberately NOT shown — it duplicates the HQ in the header; bind `territory` only if you want the raw code instead. Any row whose value is empty hides itself — that's how you drop a row you don't want.",
  props: {
    name: {
      type: "string",
      defaultValue: "Janardhanan A",
      description: "Employee name — the card heading. Bind to employee_name.",
    },
    designation: {
      type: "string",
      defaultValue: "Zonal Sales Manager",
      description: "Job title shown under the name. Bind to designation__name. Leave empty to hide.",
    },
    status: {
      type: "string",
      defaultValue: "ACTIVE",
      description: "Employment status. Bind to `status` — ERP stores it upper-cased ('ACTIVE') and the card displays it title-cased ('Active'). Leave empty to hide the status line.",
    },
    statusTone: {
      type: "choice",
      options: [
        { value: "auto", label: "Auto (from status text)" },
        { value: "active", label: "Active (green)" },
        { value: "inactive", label: "Inactive / Suspended (amber)" },
        { value: "left", label: "Left (grey)" },
      ],
      defaultValue: "auto",
      description: "Colour of the status dot + text. Leave on 'Auto' and it derives from the status TEXT ('ACTIVE' → green, 'Inactive'/'Suspended' → amber, 'Left' → grey). Pick a tone only to override.",
    },
    hq: {
      type: "string",
      defaultValue: "HQ-Chennai",
      description: "Headquarters shown after the status, separated by '·'. Bind to fsl_hq__name. Leave empty to show the status alone.",
    },
    avatarUrl: {
      type: "string",
      description: "Avatar image URL — bind to `userAvatar` (the data:image/svg+xml avatar works as-is). Leave EMPTY to show the initial on a tinted circle instead.",
    },
    initial: {
      type: "string",
      description: "Single letter shown when there's no avatarUrl. Bind to `Initial`, or leave empty and the card takes the first letter of `name`.",
    },
    avatarBg: {
      type: "color",
      defaultValue: "#dbeafe",
      description: "Background of the initial-letter avatar circle (ignored when avatarUrl is set).",
    },
    avatarColor: {
      type: "color",
      defaultValue: "#2563eb",
      description: "Colour of the initial letter in the avatar circle.",
    },
    email: {
      type: "string",
      defaultValue: "janardhanan@elbrit.org",
      description: "Bind to company_email. Row hides itself when empty. NOTE: many BE employees have an EMPTY company_email — fall back to the User login (user_id) if you need one that's always filled.",
    },
    emailLabel: { type: "string", defaultValue: "Company email", description: "Label of the email row." },
    employeeCode: {
      type: "string",
      defaultValue: "E00004",
      description: "Bind to `employee` (same as the record's `name`, e.g. 'E00004'). Shown in a monospace font. Row hides itself when empty.",
    },
    employeeCodeLabel: { type: "string", defaultValue: "Employee code", description: "Label of the employee-code row." },
    territory: {
      type: "string",
      description: "OPT-IN, normally leave EMPTY. The seat code — role_id / custom_role_profile__name ('SM-Aura_CHN_CBE_MDU_KER'). It says the same thing as `hq` in the header, and 'HQ-Chennai' reads better, so the row is hidden by default. Bind it only if you want the raw code, and then clear `hq` so the two don't repeat each other. Shown in a monospace font.",
    },
    territoryLabel: { type: "string", defaultValue: "Territory", description: "Label of the territory row (change to 'Role profile' if that reads better)." },
    reportsTo: {
      type: "string",
      defaultValue: "Vice President – Sales",
      description: "Who this employee reports to — bind to reports_to.employee_name (or the manager's designation). Row hides itself when empty.",
    },
    reportsToLabel: { type: "string", defaultValue: "Reports to", description: "Label of the reports-to row." },
    showCopy: {
      type: "boolean",
      defaultValue: true,
      description: "Show a copy button on every detail row. It copies the raw value, flashes a green tick, and fires onCopy.",
    },
    onCopy: {
      type: "eventHandler",
      argTypes: [
        { name: "field", type: "string" },
        { name: "value", type: "string" },
      ],
      description: "Fires after a row is copied, with the row key ('email' | 'employeeCode' | 'territory' | 'reportsTo') and the copied text. Optional — the copy itself already happened; wire this only for a toast.",
    },
    linkEmail: {
      type: "boolean",
      defaultValue: true,
      description: "Make the email a mailto: link (it keeps the row styling and doesn't trigger the card click). Turn OFF for plain text.",
    },
    onCardClick: {
      type: "eventHandler",
      argTypes: [{ name: "value", type: "object" }],
      description: "OPTIONAL. Fires when the card BODY is clicked, with `value`. Wiring it makes the whole card clickable (hover lift). The copy buttons, contact links and the footer button all swallow their own clicks.",
    },
    value: {
      type: "object",
      description: "The id handed back by onCardClick / onViewProfile — bind to the employee docname (e.g. 'E00004') or the whole row.",
    },
    showButton: {
      type: "boolean",
      defaultValue: true,
      description: "Show the footer action button. Turn OFF for a read-only card.",
    },
    buttonLabel: { type: "string", defaultValue: "View profile", description: "Label of the footer button." },
    onViewProfile: {
      type: "eventHandler",
      argTypes: [{ name: "value", type: "object" }],
      description: "Fires when the footer button is clicked, with `value`. Wire it to navigate to the employee's profile page or open a drawer.",
    },
    fullWidthButton: {
      type: "boolean",
      defaultValue: false,
      description: "Stretch the footer button across the card. OFF (default) keeps it left-aligned at its natural width.",
    },
    disabled: {
      type: "boolean",
      defaultValue: false,
      description: "Block the footer button and the card click (e.g. while something is loading).",
    },
    accentColor: {
      type: "color",
      defaultValue: "#2563eb",
      description: "Button background, link hover colour and the hover border of a clickable card.",
    },
    children: {
      type: "slot",
      description: "Extra content between the detail rows and the button — e.g. team chips, approver lines, or a KPI strip. Leave empty and nothing renders.",
    },
    className: { type: "string", description: "CSS class for the card container." },
  },
  importPath: "./components/EmployeeProfileCard",
});

PLASMIC.registerComponent(ActionButton, {
  name: "ActionButton",
  displayName: "Action Button (icon + label)",
  description:
    "One icon + label row — the kind stacked at the bottom of the profile drawer ('Help Desk', 'Logout') or in any menu/settings list. The ICONS ARE BUILT IN as inline SVG: pick one from the `icon` dropdown (~40 ready icons — headphones, logout, bell, calendar, approvals, product, doctor, wallet, shield…) and it takes `iconColor`/`iconSize` automatically; nothing external is loaded. Need an icon that isn't listed? Drop any element into the `iconSlot` and it replaces the built-in one. Wire `onClick` for the interaction (it fires with `value`, so several buttons can share one handler), or set `href` to render a real link (mailto:, tel:, external page). Three looks via `variant` — plain borderless row (the drawer look), outlined card, or soft tinted block — and `tone` 'danger' turns it red for Logout / Delete.",
  props: {
    label: {
      type: "string",
      defaultValue: "Help Desk",
      description: "The button text.",
    },
    icon: {
      type: "choice",
      options: [
        { value: "headphones", label: "🎧 Headphones — Help Desk" },
        { value: "lifeBuoy", label: "🛟 Life buoy — Support" },
        { value: "question", label: "❓ Question — Help / FAQ" },
        { value: "chat", label: "💬 Chat — Feedback" },
        { value: "phone", label: "📞 Phone — Call" },
        { value: "mail", label: "✉️ Mail — Email" },
        { value: "send", label: "➤ Send — Submit / Raise" },
        { value: "logout", label: "⏻ Logout — Sign out" },
        { value: "user", label: "👤 User — Profile" },
        { value: "userSettings", label: "👤⚙ User settings — Account" },
        { value: "team", label: "👥 Team — My team" },
        { value: "settings", label: "⚙️ Settings" },
        { value: "bell", label: "🔔 Bell — Notifications" },
        { value: "calendar", label: "📅 Calendar" },
        { value: "calendarCheck", label: "📅✓ Calendar check — Tour plan / visits" },
        { value: "clock", label: "🕐 Clock — Attendance / history" },
        { value: "approvals", label: "📋✓ Clipboard check — Approvals / tasks" },
        { value: "report", label: "📄 File — Reports / documents" },
        { value: "sales", label: "📈 Trending up — Sales" },
        { value: "product", label: "📦 Package — Products / stock" },
        { value: "store", label: "🏪 Store — Distributor / customer" },
        { value: "doctor", label: "🩺 Stethoscope — Doctor" },
        { value: "location", label: "📍 Map pin — Territory / HQ" },
        { value: "wallet", label: "👛 Wallet — Expense" },
        { value: "receipt", label: "🧾 Receipt — Invoice / claim" },
        { value: "search", label: "🔍 Search" },
        { value: "download", label: "⬇️ Download / export" },
        { value: "upload", label: "⬆️ Upload / import" },
        { value: "sync", label: "🔄 Refresh — Sync" },
        { value: "lock", label: "🔒 Lock — Change password" },
        { value: "shield", label: "🛡️ Shield — Privacy / security" },
        { value: "info", label: "ℹ️ Info — About" },
        { value: "star", label: "⭐ Star — Rate us" },
        { value: "share", label: "🔗 Share — Refer" },
        { value: "home", label: "🏠 Home" },
        { value: "dashboard", label: "▦ Dashboard" },
        { value: "catalog", label: "📖 Book — Catalogue / guide" },
        { value: "add", label: "➕ Plus — Add / new" },
        { value: "trash", label: "🗑️ Trash — Delete" },
        { value: "externalLink", label: "↗️ External link" },
        { value: "globe", label: "🌐 Globe — Language / website" },
        { value: "moon", label: "🌙 Moon — Dark mode" },
      ],
      defaultValue: "headphones",
      description: "Which built-in icon to show. All of them are inline SVG inside the component (nothing is fetched) and they follow iconColor / iconSize. Ignored when iconSlot is filled.",
    },
    iconSlot: {
      type: "slot",
      description: "OPTIONAL escape hatch: drop any element here (a Studio icon, an image) and it replaces the built-in `icon`. Leave empty to use the dropdown.",
    },
    iconSize: {
      type: "number",
      defaultValue: 20,
      description: "Icon size in px (also the spinner size while loading).",
    },
    iconStrokeWidth: {
      type: "number",
      defaultValue: 2,
      description: "Stroke thickness of the built-in icon. 1.75 reads lighter, 2.25 bolder.",
    },
    iconColor: {
      type: "color",
      description: "Overrides the tone's icon colour. Leave empty to follow `tone` (blue by default, red for danger).",
    },
    labelColor: {
      type: "color",
      description: "Overrides the tone's text colour. Leave empty to follow `tone`.",
    },
    variant: {
      type: "choice",
      options: [
        { value: "plain", label: "Plain (borderless row — drawer look)" },
        { value: "outlined", label: "Outlined (own border)" },
        { value: "soft", label: "Soft (tinted background)" },
      ],
      defaultValue: "plain",
      description: "How the button is framed. 'plain' is the drawer/menu row in the mock — put a few of them inside one bordered container.",
    },
    tone: {
      type: "choice",
      options: [
        { value: "default", label: "Default (blue icon, dark text)" },
        { value: "primary", label: "Primary (blue icon and text)" },
        { value: "danger", label: "Danger (red — Logout / Delete)" },
      ],
      defaultValue: "default",
      description: "Colour preset for the icon + text. iconColor / labelColor override it.",
    },
    fullWidth: {
      type: "boolean",
      defaultValue: true,
      description: "Stretch to the container width (the menu-row default). Turn OFF to size to the label.",
    },
    align: {
      type: "choice",
      options: [
        { value: "left", label: "Left (menu row)" },
        { value: "center", label: "Centred" },
      ],
      defaultValue: "left",
      description: "Where the icon + label sit inside the button.",
    },
    hoverColor: {
      type: "color",
      defaultValue: "#f3f4f6",
      description: "Background on hover / press.",
    },
    badge: {
      type: "string",
      description: "OPTIONAL small pill on the right — e.g. an unread count on a Notifications row. Hidden when empty.",
    },
    showChevron: {
      type: "boolean",
      defaultValue: false,
      description: "Add a right-hand '›' for rows that lead somewhere (a sub-page). Leave OFF for terminal actions like Logout.",
    },
    onClick: {
      type: "eventHandler",
      argTypes: [{ name: "value", type: "object" }],
      description: "THE interaction. Fires with this button's `value` — wire it to navigate, open a dialog, sign out, etc. Several buttons can share one handler and tell themselves apart by `value`. Blocked while `disabled` or `loading`.",
    },
    value: {
      type: "object",
      description: "Passed back by onClick — an id like 'logout' / 'help-desk', or any object.",
    },
    href: {
      type: "string",
      description: "OPTIONAL. Set it and the button renders as a real link — use for mailto:, tel: or an external page. onClick still fires. Ignored while disabled/loading.",
    },
    newTab: {
      type: "boolean",
      defaultValue: false,
      description: "Open `href` in a new tab (rel=noopener). Only applies when href is set.",
    },
    disabled: {
      type: "boolean",
      defaultValue: false,
      description: "Dim the button and block clicks.",
    },
    loading: {
      type: "boolean",
      defaultValue: false,
      description: "Swap the icon for a spinner and block clicks — e.g. while the sign-out is in flight.",
    },
    className: { type: "string", description: "CSS class for the button." },
  },
  importPath: "./components/ActionButton",
});

PLASMIC.registerComponent(CommonDataTable, {
  name: "CommonDataTable",
  displayName: "Common DataTable",
  description:
    "A simple table that needs NO provider above it — bind an array to `data` and it works anywhere in Studio. This is the standalone sibling of 'Elbrit DataTable', which only renders inside 'Elbrit DataProvider'. Deliberately small: it reads each column's type from the data (number / date / boolean / text), sorts on a header click, filters from a row of inputs under the headers, totals the numeric columns in a footer, and exports to Excel. Grouping is a drill-down: each group is a row with an expander, and opening it reveals the next level as its own table with its own headers, filters, sort and totals. No editing, no selection, no pagination — for those, use 'Elbrit DataTable' with its provider.",
  importPath: "./components/CommonDataTable/CommonDataTable",
  isDefaultExport: true,
  props: {
    data: {
      type: "array",
      displayName: "data",
      description:
        "The rows. An array of flat objects — one object per row, keys become columns. Bind this to a query result or page state.",
      defaultValue: [
        { region: "South", hq: "Chennai", doctor: "Dr. Anand", visits: 14, sales: 182000 },
        { region: "South", hq: "Chennai", doctor: "Dr. Bhaskar", visits: 9, sales: 96500 },
        { region: "South", hq: "Madurai", doctor: "Dr. Chitra", visits: 11, sales: 143200 },
        { region: "West", hq: "Pune", doctor: "Dr. Deshmukh", visits: 6, sales: 71800 },
        { region: "West", hq: "Mumbai", doctor: "Dr. Elena", visits: 18, sales: 265400 },
      ],
    },
    title: {
      type: "string",
      description: "Shown at the left of the header bar, next to the row count. Also used as the export sheet name.",
    },
    loading: {
      type: "boolean",
      defaultValue: false,
      description: "Shows the table's loading overlay. Bind to your query's loading state.",
    },
    emptyMessage: {
      type: "string",
      defaultValue: "No records found.",
      description: "Shown in place of rows when there is nothing to display.",
    },

    columns: {
      type: "array",
      displayName: "columns",
      description:
        "Which columns to show and in what order, e.g. ['doctor','hq','sales']. Leave empty and every key found in the data is used.",
    },
    hiddenColumns: {
      type: "array",
      description: "Columns to drop entirely. Use this for ids and internal fields.",
    },
    columnLabels: {
      type: "object",
      description:
        "Nicer headers, as { field: 'Label' } — e.g. { hq: 'Headquarters' }. Anything not listed is title-cased from the field name.",
    },
    columnTypes: {
      type: "object",
      description:
        "Force a column's type when detection guesses wrong, as { field: 'number' | 'date' | 'boolean' | 'string' }. Type drives alignment, sorting, group totals and the footer — so this is the first knob to reach for if a column misbehaves.",
    },
    columnWidths: {
      type: "object",
      description: "Pin specific widths, as { field: '220px' }. Unlisted columns are sized from their content, and all stay drag-resizable.",
    },

    groupFields: {
      type: "array",
      description:
        "Group a FLAT array by these fields, outermost first — e.g. ['region','hq']. The table opens on the first field: one row per group showing its name, row count and the total of each numeric column. Expanding a group reveals the next field as its own table, and the deepest level shows the records with their own columns. Leave empty for a plain flat table. If your data already arrives nested, use `childField` instead.",
    },
    childField: {
      type: "string",
      description:
        "For data that ALREADY arrives grouped — each row carrying its own rows in an array field. Name that field here, e.g. 'batches' for [{ warehouse, total_qty, batches: [{ batch_no, qty }, …] }]. The outer objects become the top-level rows showing exactly their own fields; expanding one reveals its children as their own table showing exactly the child fields. Nothing is copied between levels. Use this OR `groupFields`, not both — when this is set, `groupFields` is ignored.",
    },
    parentFields: {
      type: "array",
      description:
        "Parent fields to repeat on the child rows, e.g. ['warehouse']. Empty by default — each level shows only its own fields. Set this when you want the parent's identity on every child row and in the exported file.",
      hidden: (props) => !props.childField,
    },

    enableFilter: {
      type: "boolean",
      defaultValue: true,
      description:
        "Adds a row of inputs under the headers — a search box for text columns and an operator box for numbers (>100, >=100, <100, <=100, =100, and 10<>50 for a range; a bare number is a substring match). Every level has its own, so filtering a nested table narrows only that table, and that table's totals follow.",
    },

    enableSort: {
      type: "boolean",
      defaultValue: true,
      description: "Click a header to sort ascending, again for descending, again to clear. Type-aware, so 1,234 and 09/08/2026 order correctly.",
    },
    initialSort: {
      type: "object",
      description: "Sort on first render, as { field: 'sales', order: -1 } — order 1 is ascending, -1 descending.",
      hidden: (props) => props.enableSort === false,
    },
    enableSummation: {
      type: "boolean",
      defaultValue: false,
      description: "Adds a footer row totalling every numeric column across all rows.",
    },
    enableExport: {
      type: "boolean",
      defaultValue: true,
      description: "Adds the Export button. A grouped table exports the underlying rows, not the group headers.",
    },
    exportFileName: {
      type: "string",
      defaultValue: "table-export",
      description: "File name without the extension.",
      hidden: (props) => props.enableExport === false,
    },

    scrollable: {
      type: "boolean",
      defaultValue: true,
      description: "Keep the header fixed and scroll the body. Turn off to let the table grow to its full height.",
    },
    tableHeight: {
      type: "string",
      defaultValue: "520px",
      description: "Body height, e.g. '480px' or '60vh'.",
      hidden: (props) => props.scrollable === false,
    },
    size: {
      type: "choice",
      options: ["small", "normal", "large"],
      defaultValue: "small",
      description: "Row density.",
    },
    showGridlines: { type: "boolean", defaultValue: true, description: "Draw cell borders." },
    stripedRows: { type: "boolean", defaultValue: true, description: "Alternate row background." },
    className: { type: "string", description: "CSS class on the table's outer container." },
  },
});

PLASMIC.registerComponent(MyProfile, {
  name: "MyProfile",
  displayName: "MyProfile",
  description:
    "Employee profile: personal info, role details, account details, documents and payslips, with PDF export. Every field is read-only except the profile picture, which writes back to the ERP.",
  props: {
    profile: {
      type: "object",
      displayName: "Profile",
      description:
        "Company, employee identity and the read-only field sections. Shape: { company, employee, syncText, readonlyNote, personalInfo: { overviewNote, overview[], contactNote, contact[] }, roleDetails: { reportingNote, reporting[] }, accountDetails: { salaryNote, salary[], statutoryNote, statutory[], insuranceNote, insuranceCoverage, insurance[] } }. Every field list is an array of { label, value, copy?, reveal?, maskedValue? }. `employee` also drives the avatar: { imageUrl, userId, id } - `imageUrl` is the current picture (User.user_image, absolute or /files/…), `userId` is the ERP User id that a new picture is saved onto (Employee.user_id; falls back to the Company email row, then the button disables), and `id` is the Employee docname the picture is mirrored to (falls back to employeeCode).",
    },
    leaveBalance: {
      type: "object",
      displayName: "Leave balance",
      description:
        "Leave balance card. Shape: { note, items: [{ label, value, caption, strong? }] }.",
    },
    payslips: {
      type: "object",
      displayName: "Payslips",
      description:
        "Salary Slip data. Shape: { summary[], fiscalYears[], slips: [{ month, period, gross, deductions, netPay, status }], selectedSlip: { title, subtitle, netPay, creditText, earnings[], grossPay, deductions[], totalDeductions, meta[], incomeTaxSlab?, taxSummary?[], incomeTaxSummary?[] } }. Earnings/deductions rows accept an optional `ytd` for the Year To Date column.",
    },
    documents: {
      type: "object",
      displayName: "Documents",
      description:
        "Documents tab. Shape: { note, items: [{ name, issued, format, size, url? }] }. Give an item a `url` and its download serves that file instead of a generated record sheet.",
    },
    defaultTab: {
      type: "choice",
      displayName: "Default tab",
      options: ["personal", "role", "account", "documents", "payslips"],
      defaultValue: "personal",
    },
    helpDeskLink: {
      type: "string",
      displayName: "Help desk link",
      description: "URL for the \"Open Help desk\" link in the desktop header. Left empty, it renders as plain non-interactive text.",
    },
    erpBaseUrl: {
      type: "string",
      displayName: "ERP base URL",
      description:
        "Only needed when profile.employee.imageUrl is a relative ERP path such as /files/avatar.jpg - it is resolved against this origin, for example https://uat.elbrit.org. A picture saved from here always comes back absolute.",
    },
    erpEndpointKey: {
      type: "string",
      displayName: "ERP endpoint key",
      description:
        "Leave this empty unless more than one ERP is configured. It names which one a new picture is written to, and it is only the {KEY} half of NEXT_PUBLIC_GRAPHQL_ENDPOINT_{KEY} - \"UAT\", not the whole variable name. Empty means the server picks NEXT_PUBLIC_GRAPHQL_DEFAULT_ENDPOINT, or the only endpoint it finds.",
    },
    onPictureChange: {
      type: "eventHandler",
      displayName: "On picture change",
      description: "Fires after a new profile picture is saved to the ERP. Use it to refetch the profile query.",
      argTypes: [{ name: "imageUrl", type: "string" }],
    },
  },
  styleSections: true,
  importPath: "./components/features/my-profile",
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
// ============================================================
// Product detail page (Cilnitab-20 design, 1A desktop / 1B field app)
// Responsive code components under components/ProductDetail/ — each
// renders the desktop layout when its container is wide and the
// field-app layout when narrow (mode="auto"), or can be forced.
// All list-ish props take the ERP Item's RAW fields (bullet strings,
// child tables) and parse internally — bind fields directly.
// ============================================================

PLASMIC.registerComponent(VariantPills, {
  name: "VariantPills",
  displayName: "PD · Variant Pills",
  description:
    "The 'VARIANTS · N' pill switcher at the top of the product detail page. `variants` takes plain strings ('20', 'T 40') or {label, value} objects (label on the pill, value handed back — bind value to the variant's item_code). `selected` is a writable state; picking a pill fires onSelect(value, variant) — update the state / re-drive the page's item query from it. Same component on desktop and mobile (scrolls horizontally when tight).",
  props: {
    variants: {
      type: "array",
      itemType: {
        type: "object",
        nameFunc: (item) => item?.label,
        fields: {
          label: { type: "string" },
          value: { type: "string" },
        },
      },
      defaultValue: [
        { label: "20", value: "CILNITAB 20" },
        { label: "5", value: "CILNITAB 5" },
        { label: "10", value: "CILNITAB 10" },
        { label: "T 40", value: "CILNITAB T 40" },
        { label: "NB 10/5", value: "CILNITAB NB 10/5" },
        { label: "NB 10/2.5", value: "CILNITAB NB 10/2.5" },
      ],
      description:
        "The strength variants of the brand. Bind a dynamic expression mapping your variant list, e.g. items of the same brand__name: [{label: shortName, value: item_code}]. Plain strings work too.",
    },
    selected: {
      type: "string",
      description:
        "Value of the active pill (a variant's `value`). Writable state — leave unset to fall back to initialSelected (then the first variant); the page reads it to fetch that variant's Item.",
    },
    initialSelected: {
      type: "string",
      description:
        "Which variant is active BEFORE the user picks one — e.g. the item_code the page was opened with. Only used while `selected` is unset; ignored (and never fought against) once a pill is clicked. Must match a variant's `value`; a non-matching value falls back to the first variant.",
    },
    onSelect: {
      type: "eventHandler",
      argTypes: [
        { name: "value", type: "string" },
        { name: "variant", type: "object" },
      ],
      description: "Fires with the picked value AND the whole variant object. Update your selected state / refetch the item here.",
    },
    kicker: {
      type: "string",
      defaultValue: "Variants",
      description: "The small uppercase label before the pills. Empty hides it.",
    },
    showCount: {
      type: "boolean",
      defaultValue: true,
      description: "Append '· N' (variant count) to the kicker.",
    },
    className: { type: "string" },
  },
  states: {
    selected: {
      type: "writable",
      variableType: "text",
      valueProp: "selected",
      onChangeProp: "onSelect",
    },
  },
  importPath: "./components/ProductDetail/VariantPills",
});

PLASMIC.registerComponent(ProductHero, {
  name: "ProductHero",
  displayName: "PD · Product Hero",
  description:
    "The identity card of the product detail page. Wide: pack-shot viewer (Rx ONLY badge, ribbon, thumbnails) + name block with tag pills, the MRP/PTR/PTS price strip (retailer margin (MRP−PTR)/MRP and stockist margin (PTR−PTS)/PTR auto-computed) and the spec line. Narrow: title, image carousel with dots, price strip, compact spec strip. Bind the ERP Item RAW: images<-custom_product_urls (the [{product_url}] child table as-is), tags<-custom_therapeutic_class (bullet string → pills), subtitle<-whg_composition (bullets joined with ' + '), mrp/ptr/pts<-custom_last_mrp/_ptr/_pts, packing<-fsl_packing, box<-fsl_box, stockUom<-stock_uom__name, brand<-brand__name, itemCode<-item_code, name<-item_name.",
  props: {
    mode: {
      type: "choice",
      options: [
        { value: "auto", label: "Auto (by container width)" },
        { value: "desktop", label: "Force desktop layout" },
        { value: "mobile", label: "Force mobile layout" },
      ],
      defaultValue: "auto",
      description: "'auto' measures the component's OWN container and switches at `breakpoint`.",
    },
    breakpoint: {
      type: "number",
      defaultValue: 640,
      description: "Container width (px) below which the field-app layout renders (mode='auto' only).",
    },
    name: { type: "string", defaultValue: "ACEBRIT P", description: "Product name. <- item_name" },
    brand: { type: "string", defaultValue: "ACEBRIT", description: "Brand line in the topline. <- brand__name" },
    itemCode: { type: "string", defaultValue: "ACEBRIT P", description: "Item code in the topline. <- item_code" },
    subtitle: {
      type: "string",
      defaultValue: "• Aceclofenac 100 mg\n• Paracetamol 325 mg",
      description:
        "Composition/form line under the name. Accepts whg_composition's raw bullet string — bullets are joined with ' + ' ('Aceclofenac 100 mg + Paracetamol 325 mg'). A plain string shows as-is.",
    },
    tags: {
      type: "string",
      defaultValue: "• NSAID + Analgesic/Antipyretic\n• Anti-inflammatory Pain Reliever",
      description:
        "Therapeutic tag pills. Accepts custom_therapeutic_class's raw bullet string (or an array). Pills cycle blue/indigo/pink.",
    },
    rx: { type: "boolean", defaultValue: true, description: "Show the red 'Rx ONLY' badge on the image." },
    rxLabel: { type: "string", defaultValue: "Rx ONLY" },
    ribbon: {
      type: "string",
      description: "Optional ribbon on the image (the design's 'New Design'). Empty hides it.",
    },
    images: {
      type: "array",
      itemType: {
        type: "object",
        nameFunc: (item) => item?.label || item?.product_url || item?.url,
        fields: {
          product_url: { type: "string" },
          label: { type: "string" },
        },
      },
      description:
        "Pack shots. Bind custom_product_urls DIRECTLY — the [{product_url}] child table is understood as-is; plain URL strings or {url, label} also work. Desktop shows thumbnails, mobile a dot carousel.",
    },
    mediaNote: {
      type: "string",
      defaultValue: "Pack shots from the brand library",
      description: "Muted caption beside the thumbnails (desktop). Empty hides it.",
    },
    mrp: { type: "number", defaultValue: 87.19, description: "MRP. <- custom_last_mrp" },
    ptr: { type: "number", defaultValue: 66.43, description: "Price to retailer. <- custom_last_ptr. Retailer margin (MRP−PTR)/MRP shows under it automatically." },
    pts: { type: "number", defaultValue: 59.79, description: "Price to stockist. <- custom_last_pts. Stockist margin (PTR−PTS)/PTR shows under it automatically." },
    mrpSubtitle: {
      type: "string",
      description: "Text under the MRP (the design's 'Per strip of 15'). Empty auto-builds 'Pack of <pack>' from packing/box.",
    },
    currency: { type: "string", defaultValue: "₹" },
    packing: { type: "number", defaultValue: 10, description: "Units per pack. <- fsl_packing. Combined with `box` into '<box> × <packing>'." },
    box: { type: "number", defaultValue: 10, description: "Packs per box. <- fsl_box" },
    packText: {
      type: "string",
      description: "Explicit pack text ('10 strips × 15 tablets') overriding the '<box> × <packing>' auto-build.",
    },
    stockUom: { type: "string", defaultValue: "STRIPS", description: "<- stock_uom__name" },
    onImageChange: {
      type: "eventHandler",
      argTypes: [
        { name: "index", type: "number" },
        { name: "url", type: "string" },
      ],
      description: "Fires when a thumbnail/dot switches the pack shot.",
    },
    className: { type: "string" },
  },
  importPath: "./components/ProductDetail/ProductHero",
});

PLASMIC.registerComponent(SectionListCard, {
  name: "SectionListCard",
  displayName: "PD · Section List Card",
  description:
    "One generic content card, reused for three sections via `variant`: 'numbered' = Key clinical benefits (01–06, bind items<-kly_key_cinical_benf), 'bullet' = Patient profile (items<-kly_patient_profile), 'chips' = Target customers (items<-kly_target_doc, footerLabel 'Advantage', footerText<-whg_advantages). `items` takes the ERP's RAW bullet string ('• a\\n• b') or an array — bind the field directly, no mapping. Two columns wide / one narrow.",
  props: {
    mode: {
      type: "choice",
      options: [
        { value: "auto", label: "Auto (by container width)" },
        { value: "desktop", label: "Force desktop layout" },
        { value: "mobile", label: "Force mobile layout" },
      ],
      defaultValue: "auto",
    },
    breakpoint: { type: "number", defaultValue: 640 },
    title: { type: "string", defaultValue: "Key clinical benefits" },
    caption: {
      type: "string",
      description: "Muted caption at the right of the title rule (e.g. 'Molecule · Cilnidipine'). Empty hides it.",
    },
    variant: {
      type: "choice",
      options: [
        { value: "numbered", label: "Numbered (01, 02, …)" },
        { value: "bullet", label: "Bulleted dots" },
        { value: "chips", label: "Chips (specialties)" },
      ],
      defaultValue: "numbered",
    },
    items: {
      type: "string",
      defaultValue:
        "• Rapid relief from pain & inflammation\n• Effective in musculoskeletal and joint pain\n• Paracetamol adds fast analgesia & antipyresis\n• Better GI tolerability vs older NSAIDs\n• Improves mobility & functional recovery",
      description:
        "The list content. Bind the raw ERP bullet string (kly_key_cinical_benf / kly_patient_profile / kly_target_doc) directly — '•' bullets and newlines are parsed; an array of strings also works.",
    },
    columns: {
      type: "number",
      defaultValue: 2,
      description: "Columns of the numbered/bullet grid when wide (narrow is always 1). Chips just wrap.",
    },
    footerLabel: {
      type: "string",
      description: "Muted lead-in of the footer line, e.g. 'Advantage'.",
    },
    footerText: {
      type: "string",
      description: "Footer line under a divider ('Advantage · Effective combination…'). <- whg_advantages for the Target customers card. Empty hides the footer.",
    },
    className: { type: "string" },
  },
  importPath: "./components/ProductDetail/SectionListCard",
});

PLASMIC.registerComponent(MechanismCard, {
  name: "MechanismCard",
  displayName: "PD · Mechanism Card",
  description:
    "The 'Mechanism of action' card: tinted molecule panels + ✓ takeaway lines. Bind the kly_mechanism_table row RAW: content<-row.content ('Aceclofenac\\n• Inhibits COX…\\n\\nParacetamol\\n• Central…' — each blank-line block becomes a panel, first line the panel title, bullets the body) and takeaways<-row.mechanism_type (bullet string → ✓ lines). Structured input works too (content = [{title, items}]). Panels sit side by side when there's room, stack when narrow.",
  props: {
    title: { type: "string", defaultValue: "Mechanism of action" },
    caption: {
      type: "string",
      description: "Muted caption at the right of the title rule (e.g. 'Molecule · Cilnidipine').",
    },
    content: {
      type: "string",
      defaultValue:
        "Aceclofenac\n• Inhibits COX enzymes → reduces prostaglandin synthesis\n• Decreases inflammation, swelling & pain\n\nParacetamol\n• Central analgesic & antipyretic action\n• Enhances pain relief without added GI risk",
      description:
        "The panels. Bind kly_mechanism_table[0].content directly. Blank lines split panels; each panel's first non-bullet line is its title (colored dot added automatically).",
    },
    takeaways: {
      type: "string",
      defaultValue:
        "• Dual-action pain control: anti-inflammatory + fast analgesia\n• Effective relief with good tolerability",
      description: "The ✓ lines under the panels. Bind kly_mechanism_table[0].mechanism_type directly.",
    },
    className: { type: "string" },
  },
  importPath: "./components/ProductDetail/MechanismCard",
});

PLASMIC.registerComponent(DosageCard, {
  name: "DosageCard",
  displayName: "PD · Dosage Card",
  description:
    "The 'Dosage' card. Bind doseText<-kly_dose RAW ('Adults:\\n• 1 tablet twice daily…\\n\\nDuration:\\n• Short-term use…') — blank-line blocks become sections, the first emphasised, the rest as muted 'Duration · …' lines. The optional `dose`/`doseQualifier` pair puts a big value in front (the design's '20 mg · once daily, adults') when the strength is known.",
  props: {
    title: { type: "string", defaultValue: "Dosage" },
    dose: {
      type: "string",
      description: "Optional big dose value ('20 mg'). Leave empty when the raw kly_dose text is all you have.",
    },
    doseQualifier: {
      type: "string",
      description: "Inline text after the big value ('once daily, adults'). Only shown with `dose`.",
    },
    doseText: {
      type: "string",
      defaultValue: "Adults:\n• 1 tablet twice daily, after meals\n\nDuration:\n• Short-term use (3–7 days) or as advised",
      description: "The dosing text. Bind kly_dose directly — headings ('Adults:', 'Duration:') and bullets are parsed.",
    },
    note: {
      type: "string",
      description: "Optional extra note line under the first section ('Dose individualised based on BP control.').",
    },
    className: { type: "string" },
  },
  importPath: "./components/ProductDetail/DosageCard",
});

PLASMIC.registerComponent(LabelClaimCard, {
  name: "LabelClaimCard",
  displayName: "PD · Label Claim Card",
  description:
    "The 'Label claim & supply' card (desktop) and the whole mobile Supply tab. Bind labelClaim<-whg_label_claim RAW — the first line ('Each film coated tablet contains:') becomes the tinted box's caption, remaining lines the claim rows. Supply facts: packing<-fsl_packing, box<-fsl_box, stockUom<-stock_uom__name, plus optional HSN/GST rows. Wide: a cell strip; narrow: label-left/value-right rows.",
  props: {
    mode: {
      type: "choice",
      options: [
        { value: "auto", label: "Auto (by container width)" },
        { value: "desktop", label: "Force desktop layout" },
        { value: "mobile", label: "Force mobile layout" },
      ],
      defaultValue: "auto",
    },
    breakpoint: { type: "number", defaultValue: 640 },
    title: { type: "string", defaultValue: "Label claim & supply" },
    labelClaim: {
      type: "string",
      defaultValue:
        "Each flim coated tablet contains: \nAceclofenac  IP…………100  Mg\nParacetamol  IP………...325  Mg\nColour : Sunset Yellow Supra.",
      description: "The label-claim text. Bind whg_label_claim directly — line breaks are preserved.",
    },
    packing: { type: "number", defaultValue: 10, description: "<- fsl_packing (combined with `box` into '<box> × <packing>')." },
    box: { type: "number", defaultValue: 10, description: "<- fsl_box" },
    packText: { type: "string", description: "Explicit packing text ('10 strips × 15 tablets') overriding the auto-build." },
    stockUom: { type: "string", defaultValue: "STRIPS", description: "<- stock_uom__name" },
    hsnCode: {
      type: "string",
      description: "Optional 'HSN code' row in the supply facts. <- gst_hsn_code ('30049074'). Empty hides the row.",
    },
    gstText: {
      type: "string",
      description: "Optional 'GST' row in the supply facts. <- custom_current_tax ('GST 5% - ELPL'). Empty hides the row.",
    },
    className: { type: "string" },
  },
  importPath: "./components/ProductDetail/LabelClaimCard",
});

PLASMIC.registerComponent(MarketSizeCard, {
  name: "MarketSizeCard",
  displayName: "PD · Market Size Card",
  description:
    "The 'Molecule market size' card. Bind the ERP's amount strings RAW: marketSize<-whg_market_size ('631Cr'), top5Value<-custom_top_5_market_shares ('469.3Cr') — numbers and the unit are parsed, the top-5 share % and progress bar computed ((469.3/631)=74.4%). Wide: one stat card with bar + caption; narrow: the field-app Market-tab layout (two tiles + share bar).",
  props: {
    mode: {
      type: "choice",
      options: [
        { value: "auto", label: "Auto (by container width)" },
        { value: "desktop", label: "Force desktop layout" },
        { value: "mobile", label: "Force mobile layout" },
      ],
      defaultValue: "auto",
    },
    breakpoint: { type: "number", defaultValue: 640 },
    title: { type: "string", defaultValue: "Molecule market size" },
    marketSize: {
      type: "string",
      defaultValue: "631Cr",
      description: "Total molecule market. Bind whg_market_size as-is ('631Cr'); a plain number works too.",
    },
    top5Value: {
      type: "string",
      defaultValue: "469.3Cr",
      description: "Top-5 brands' combined value. Bind custom_top_5_market_shares as-is.",
    },
    top5Label: { type: "string", defaultValue: "Top 5 brands" },
    sharePct: {
      type: "number",
      description: "OPTIONAL override of the top-5 share %. Leave empty to compute top5Value/marketSize.",
    },
    moleculeName: {
      type: "string",
      description: "Molecule name used in the auto caption ('64.1% of the Cilnidipine market sits with the top 5 brands').",
    },
    caption: {
      type: "string",
      description: "Explicit caption overriding the auto-built one.",
    },
    className: { type: "string" },
  },
  importPath: "./components/ProductDetail/MarketSizeCard",
});

PLASMIC.registerComponent(CompetitorBrandsCard, {
  name: "CompetitorBrandsCard",
  displayName: "PD · Competitor Brands Card",
  description:
    "The 'Competitor brands' card (desktop right rail; the mobile Market tab uses the same layout). Bind brands<-kly_market_share_table DIRECTLY — rows {brands, company, mat_24, mat_25} are understood as-is ({name, company, from, to} also works). Growth % is computed mat_24→mat_25 (↑/↓, red when negative), bars scale to the largest mat_25, rows sort by value (sortByValue). With top5Value<-custom_top_5_market_shares the footer shows 'Published <sum> of <top5> Cr', and when fewer than expectedCount rows are published the dashed 'N of the top 5 brands are not published…' note appears automatically.",
  props: {
    title: { type: "string", defaultValue: "Competitor brands" },
    periodLabel: { type: "string", defaultValue: "MAT 24 → MAT 25" },
    brands: {
      type: "array",
      itemType: {
        type: "object",
        nameFunc: (item) => item?.brands || item?.name,
        fields: {
          brands: { type: "string" },
          company: { type: "string" },
          mat_24: { type: "string" },
          mat_25: { type: "string" },
        },
      },
      defaultValue: [
        { brands: "ZERODOL-P", company: "IPCA LABS", mat_24: "46.2", mat_25: "305.9" },
        { brands: "HIFENAC-P", company: "INTAS PHARMA*", mat_24: "76.2", mat_25: "82.8" },
        { brands: "DOLOKIND PLUS", company: "MANKIND", mat_24: "29.1", mat_25: "30.2" },
        { brands: "ACECLO PLUS", company: "ARISTO PHARMA*", mat_24: "28.7", mat_25: "27.4" },
        { brands: "ACENAC-P", company: "MEDLEY PHARMA", mat_24: "23", mat_25: "23.1" },
      ],
      description: "Bind kly_market_share_table directly — no mapping needed.",
    },
    sortByValue: {
      type: "boolean",
      defaultValue: true,
      description: "Sort rows by mat_25 descending. OFF keeps the child-table order.",
    },
    expectedCount: {
      type: "number",
      defaultValue: 5,
      description: "How many top brands SHOULD be listed. Fewer published rows triggers the dashed 'not published' note.",
    },
    top5Value: {
      type: "string",
      description: "Bind custom_top_5_market_shares ('469.3Cr') to get the 'Published X of Y Cr' footer automatically.",
    },
    note: { type: "string", description: "Explicit text for the dashed note, overriding the auto one." },
    footLeft: { type: "string", defaultValue: "Values in ₹ Cr. * as reported" },
    footRight: { type: "string", description: "Explicit right footer, overriding the auto 'Published X of Y Cr'." },
    className: { type: "string" },
  },
  importPath: "./components/ProductDetail/CompetitorBrandsCard",
});

PLASMIC.registerComponent(DetailingAngleCard, {
  name: "DetailingAngleCard",
  displayName: "PD · Detailing Angle Card",
  description:
    "The navy quote card with the rep's one-line pitch ('DETAILING ANGLE — \\'Same 24-hour control…\\''). Renders NOTHING when `quote` is empty, so it's safe to bind an Item field that isn't filled on every product yet.",
  props: {
    label: { type: "string", defaultValue: "Detailing angle" },
    quote: {
      type: "string",
      defaultValue: "Same 24-hour control, without the pedal edema that makes patients quit Amlodipine.",
      description: "The pitch line. Curly quotes are added automatically (quoteMarks). Empty hides the whole card.",
    },
    quoteMarks: { type: "boolean", defaultValue: true },
    className: { type: "string" },
  },
  importPath: "./components/ProductDetail/DetailingAngleCard",
});

PLASMIC.registerComponent(CompositionCard, {
  name: "CompositionCard",
  displayName: "PD · Composition Card",
  description:
    "The mobile Overview tab's 'COMPOSITION' card: uppercase kicker, the composition line and the therapeutic tag pills (same blue/indigo/pink tones as the hero). Bind RAW: composition<-whg_composition (bullets joined with ' + ': 'Aceclofenac 100 mg + Paracetamol 325 mg'), tags<-custom_therapeutic_class. Renders nothing when both are empty. No layout switch — usable on desktop too.",
  props: {
    kicker: { type: "string", defaultValue: "Composition" },
    composition: {
      type: "string",
      defaultValue: "• Aceclofenac 100 mg\n• Paracetamol 325 mg",
      description: "Bind whg_composition directly — the bullet lines are joined with `separator`.",
    },
    separator: {
      type: "string",
      defaultValue: " + ",
      description: "Joiner between composition lines (' + ' → 'A 100 mg + B 325 mg').",
    },
    tags: {
      type: "string",
      defaultValue: "• NSAID + Analgesic/Antipyretic\n• Anti-inflammatory Pain Reliever",
      description: "Tag pills. Bind custom_therapeutic_class directly (bullet string or array).",
    },
    className: { type: "string" },
  },
  importPath: "./components/ProductDetail/CompositionCard",
});
