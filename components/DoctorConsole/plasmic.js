/**
 * Studio registrations for the doctor console's five cards.
 *
 * Five ORDINARY components, registered the way the product detail cards are:
 * top level, no `parentComponentName`, no slot, nothing to nest them in. A page
 * drops whichever ones it wants, wherever it wants, in any order — a hero on
 * its own, a totals strip in a sidebar, the trend card on a different tab.
 *
 * They share one reading and one filter through a module-level session (see
 * `session.js`), not through a parent, so five cards still mean one set of ERP
 * reads and the filter bar still moves every figure on the page.
 *
 * BINDING: give the doctor and the ERP token to ONE card — the hero, normally.
 * Cards with nothing bound attach to it. Bind a different doctor on a card and
 * it reads that doctor instead, which is how two can sit side by side.
 *
 * FIVE cards, one per surface in the approved design. The clinic row, the Add
 * POB and Notes buttons, the Rx chip and the Data/Activity switch are parts of
 * their card, not components — a page should not be able to place half a card.
 */

import DoctorHeroCard from "./DoctorHeroCard";
import DoctorTotalsCard from "./DoctorTotalsCard";
import DoctorFilterBar from "./DoctorFilterBar";
import DoctorCoverageCard from "./DoctorCoverageCard";
import DoctorInsightsCard from "./DoctorInsightsCard";

const SECTION = "Doctor console";

/**
 * What every card takes. The doctor and the token are what a reading IS, so
 * they are on all five rather than on a privileged one — but only one card
 * needs them filled in.
 */
const dataProps = {
  doctor: {
    type: "object",
    description:
      "The doctor: a Lead id ('DR-47718') or the row from the doctor list. Bind this on ONE card on the page — every other doctor card with nothing bound reads the same doctor, the same rows and the same filter. Bind a different doctor here and this card reads that one instead.",
  },
  erpUrl: {
    type: "string",
    defaultValue: "",
    description:
      "ERP base URL. Leave empty to use the app's configured endpoint. Only needs setting on the card that binds the doctor.",
  },
  authToken: {
    type: "string",
    defaultValue: "",
    description:
      "The SIGNED-IN USER's ERP token. This is what decides whose rows are counted and whether service figures appear at all — leave it empty and the page falls back to the shared service credential, which is not narrowed to anyone. Only needs setting on the card that binds the doctor.",
  },
  employee: {
    type: "string",
    description:
      "Optional Employee id to resolve the reader as, when the token cannot be trusted to name them. Normally left empty.",
  },
  sampleData: {
    type: "boolean",
    defaultValue: false,
    description:
      "SAMPLE DATA — draw the whole card from realistic PLACEHOLDER figures and make NO ERP READ AT ALL. For reviewing and signing off the design before the real data is wired in: one made-up doctor with a year of support, service, POB, visits and notes across Elbrit, CND and Vasco, so every surface carries content instead of em dashes. Nothing is bound and nothing is fetched — no doctor, no ERP URL, no token — and service and ROI are shown, because half the design is those surfaces. Turning it on for ONE card fills any other doctor card on the page that has nothing bound. TURN IT OFF BEFORE THE PAGE GOES LIVE: while it is on the card shows a doctor who does not exist, whatever is bound beside it.",
  },
};

/**
 * The filter DEFAULTS. They say where the page opens; the reader may then
 * change any of them from the filter bar, and changing one moves every card.
 * Set them on one card only — two cards setting different defaults would fight.
 */
const filterProps = {
  period: {
    type: "choice",
    options: [
      { value: "fy", label: "This financial year" },
      { value: "cur", label: "This month" },
      { value: "last", label: "Last month" },
      { value: "m3", label: "Last 3 months" },
      { value: "m6", label: "Last 6 months" },
    ],
    defaultValue: "fy",
    description: "Period the page OPENS on. The reader can change it from the filter bar.",
  },
  valueFormat: {
    type: "choice",
    options: [
      { value: "full", label: "Full (₹1,24,300)" },
      { value: "short", label: "Short (₹1.24L)" },
    ],
    defaultValue: "full",
    description: "How rupee figures are written. The reader can change it from the filter bar.",
  },
};

const layoutProp = {
  type: "choice",
  options: [
    { value: "auto", label: "Auto (by this card's width)" },
    { value: "full", label: "Force full layout" },
    { value: "compact", label: "Force compact layout" },
  ],
  defaultValue: "auto",
  description:
    "'auto' measures THIS CARD's own box, not the window — so a card in a narrow column gets the compact layout on a wide screen. Force one to preview it in Studio.",
};

const card = (name, displayName, description, props = {}) => ({
  name,
  displayName,
  section: SECTION,
  // Dropped full-width, height from content. Every card is a horizontal band in
  // the approved design -- none of them is a thing you size by hand -- and a
  // Studio instance left to guess its own box is how the page ended up with
  // cards narrower than their content.
  defaultStyles: { width: "stretch" },
  importPath: "./components/DoctorConsole/" + name,
  description,
  props: { ...dataProps, ...filterProps, ...props, className: { type: "string" } },
});

const heroMeta = card(
  "DoctorHeroCard",
  "Doctor · Hero card",
  "The identity card, whole: initials avatar, name, speciality | qualification | city · HQ, the doctor code and category chips, the ROI plate and the pharmacies button, the clinic chips with map and directions, and the Add POB / Notes / Request service row. The HQ falls back to the doctor's coverage rows when Lead.territory is empty — which it is on thousands of records. Usually the card that binds the doctor for the whole page.",
  {
    showRoi: {
      type: "boolean",
      defaultValue: true,
      description:
        "Show the ROI plate and the stat strip. This can only HIDE them — whether the reader may see service figures at all is decided by their ERP token (SM and above), never by this prop.",
    },
    showClinics: { type: "boolean", defaultValue: true, description: "Show the clinic chips, the address line and the map link." },
    showActions: { type: "boolean", defaultValue: true, description: "Show the Add POB / Notes / Request service row." },
    layout: layoutProp,
    onAddClinic: {
      type: "eventHandler",
      description: "Fires when the reader asks to add a clinic. Leave unset to hide that action.",
      argTypes: [{ name: "payload", type: "object" }],
    },
    onAddPharmacy: {
      type: "eventHandler",
      description: "Fires from the pharmacy list when the reader asks to add one. Leave unset to hide that action.",
      argTypes: [{ name: "payload", type: "object" }],
    },
    onRequestService: {
      type: "eventHandler",
      description: "Fires when the reader asks for a service for this doctor. Leave unset to hide that action.",
      argTypes: [{ name: "payload", type: "object" }],
    },
    onPobSaved: {
      type: "eventHandler",
      description:
        "Fires after Add POB writes a Quotation. Optional — every card on the page refreshes itself, so wire this only if something else has to react.",
      argTypes: [{ name: "payload", type: "object" }],
    },
  }
);

const totalsMeta = card(
  "DoctorTotalsCard",
  "Doctor · Totals",
  "The swipeable totals strip — visits, POB, support, notes and service, each showing its last three entries and a way into the timeline. Opening one switches the trend card to its activity panel and scrolls to it, wherever that card is on the page.",
  {
    cards: {
      type: "choice",
      multiSelect: true,
      options: ["visit", "pob", "support", "note", "service"],
      description:
        "Which cards, in order. Leave empty for all five. `service` removes itself for a reader who may not see it, whatever is chosen here.",
    },
    layout: layoutProp,
  }
);

const filterBarMeta = card(
  "DoctorFilterBar",
  "Doctor · Filter bar",
  "\"Signed in as …\", the note that service is hidden at this level, the Filter button showing the current department and period, and the notices for reads ERP refused (403) or that failed. This is the card that owns the department, the period and the rupee format — changing them here moves every other doctor card on the page at the same instant.",
  {
    showViewer: { type: "boolean", defaultValue: true, description: "Show who is signed in and their grade." },
    showWarnings: {
      type: "boolean",
      defaultValue: true,
      description:
        "Show the permission, credential and failure notices. Turning these off hides the reason a card is empty — leave them on unless another part of the page says it.",
    },
  }
);

const coverageMeta = card(
  "DoctorCoverageCard",
  "Doctor · Coverage by role",
  "BE / ABM / RBM / ZSM rings showing who has actually touched this doctor in the selected period, each openable for the per-department split.",
  { openable: { type: "boolean", defaultValue: true, description: "Let a ring be opened for its department breakdown." } }
);

const insightsMeta = card(
  "DoctorInsightsCard",
  "Doctor · Trend & data",
  "One card: the monthly trend (smoothed support / service / POB lines over a single rupee axis, visits on their own rail, a pager through the doctor's departments), the Data ⇄ Activity switch, and whichever panel is showing — the department table, expandable to real product lines, or the activity timeline. They share one surface in the design, so they are one card.",
  {
    startOn: {
      type: "choice",
      options: ["table", "activity"],
      defaultValue: "table",
      description: "Which panel shows when the switch is turned off.",
    },
    showSwitch: {
      type: "boolean",
      defaultValue: true,
      description: "Show the Data ⇄ Activity switch. Off pins the card to `startOn`.",
    },
    showTrend: {
      type: "boolean",
      defaultValue: true,
      description: "Show the monthly chart above the panel. Off leaves just the table or the timeline.",
    },
  }
);

export function registerDoctorConsoleComponents(loader) {
  loader.registerComponent(DoctorHeroCard, heroMeta);
  loader.registerComponent(DoctorTotalsCard, totalsMeta);
  loader.registerComponent(DoctorFilterBar, filterBarMeta);
  loader.registerComponent(DoctorCoverageCard, coverageMeta);
  loader.registerComponent(DoctorInsightsCard, insightsMeta);
}

export {
  DoctorHeroCard, DoctorTotalsCard, DoctorFilterBar, DoctorCoverageCard, DoctorInsightsCard,
};
