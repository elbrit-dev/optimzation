/**
 * Studio registrations for the doctor console's five blocks.
 *
 * Follows `registerElbritCoreComponents` (share/src/plasmic-init.js): one
 * component owns the data and declares `providesData`, the rest name it as
 * `parentComponentName` so Studio only offers them where they can work.
 *
 * The provider is `DoctorDetail` itself — it already does every read, the
 * scoping, the filter and the analytics, and it now takes children. Drop blocks
 * inside it and they replace its built-in stack; leave it empty and the page is
 * exactly what it was. Additive, so no existing page changes.
 *
 * FIVE blocks, one per card in the approved design. The clinic row, the Add POB
 * and Notes buttons, the Rx chip and the Data/Activity switch are parts of their
 * card, not components — a page should not be able to place half a card.
 */

import {
  DoctorCoverage, DoctorFilterBar, DoctorHero, DoctorInsights, DoctorTotals,
} from "./sections";

const PARENT = "DoctorDetail";
const SECTION = "Doctor console";

const base = (name, displayName, description, props = {}) => ({
  name,
  displayName,
  section: SECTION,
  parentComponentName: PARENT,
  importPath: "./components/DoctorConsole/sections",
  description,
  props,
});

const heroMeta = base(
  "DoctorHero",
  "Doctor · Hero card",
  "The identity card, whole: initials avatar, name, speciality | qualification | city · HQ, the doctor code and category chips, the ROI plate and the pharmacies button, the clinic chips with map and directions, and the Add POB / Notes / Request service row. The HQ falls back to the doctor's coverage rows when Lead.territory is empty — which it is on thousands of records.",
  {
    showRoi: {
      type: "boolean",
      defaultValue: true,
      description:
        "Show the ROI plate and the stat strip. This can only HIDE them — whether the reader may see service figures at all is decided by their ERP token (SM and above), never by this prop.",
    },
    showClinics: { type: "boolean", defaultValue: true, description: "Show the clinic chips, the address line and the map link." },
    showActions: { type: "boolean", defaultValue: true, description: "Show the Add POB / Notes / Request service row." },
    compact: {
      type: "choice",
      options: ["auto", "full", "compact"],
      defaultValue: "auto",
      description: "`auto` follows the container width (compact under 720px). Force one to preview that layout in Studio.",
    },
  }
);

const totalsMeta = base(
  "DoctorTotals",
  "Doctor · Totals",
  "The swipeable totals strip — visits, POB, support, notes and service — each showing its last three entries and a way into the timeline.",
  {
    cards: {
      type: "choice",
      multiSelect: true,
      options: ["visit", "pob", "support", "note", "service"],
      description:
        "Which cards, in order. Leave empty for all five. `service` removes itself for a reader who may not see it, whatever is chosen here.",
    },
  }
);

const filterBarMeta = base(
  "DoctorFilterBar",
  "Doctor · Filter bar",
  "\"Signed in as …\", the note that service is hidden at this level, the Filter button showing the current department and period, and the notices for reads ERP refused (403) or that failed.",
  {
    showViewer: { type: "boolean", defaultValue: true, description: "Show who is signed in and their grade." },
    showWarnings: {
      type: "boolean",
      defaultValue: true,
      description:
        "Show the permission and failure notices. Turning these off hides the reason a panel is empty — leave them on unless another part of the page says it.",
    },
  }
);

const coverageMeta = base(
  "DoctorCoverage",
  "Doctor · Coverage by role",
  "BE / ABM / RBM / ZSM rings showing who has actually touched this doctor in the selected period, each openable for the per-department split.",
  { openable: { type: "boolean", defaultValue: true, description: "Let a ring be opened for its department breakdown." } }
);

const insightsMeta = base(
  "DoctorInsights",
  "Doctor · Trend & data",
  "One card: the monthly trend (smoothed support / service / POB lines over a single rupee axis, visits on their own rail, a pager through the doctor's departments), the Data ⇄ Activity switch, and whichever panel is showing — the department table, expandable to real product lines, or the activity timeline. They share one surface in the design, so they are one block.",
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
  }
);

export function registerDoctorConsoleComponents(loader) {
  loader.registerComponent(DoctorHero, heroMeta);
  loader.registerComponent(DoctorTotals, totalsMeta);
  loader.registerComponent(DoctorFilterBar, filterBarMeta);
  loader.registerComponent(DoctorCoverage, coverageMeta);
  loader.registerComponent(DoctorInsights, insightsMeta);
}

export { DoctorHero, DoctorTotals, DoctorFilterBar, DoctorCoverage, DoctorInsights };
