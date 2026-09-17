/**
 * TEMPORARY DIAGNOSTIC — the doctor console in SAMPLE DATA mode.
 *
 * The same idea as `_dxprobe`, one step further: that page hands the component
 * a hand-made Lead row and lets everything else come up empty, which proves the
 * sections RENDER but not that the design WORKS. This one turns on `sampleData`
 * and nothing else, so every surface carries a year of realistic figures and
 * the layout can actually be judged — with no Plasmic page, no ERP credential
 * and, deliberately, no network request at all.
 *
 * Nothing is bound on any card below: no doctor, no ERP URL, no token. If any
 * section here is empty or flat, the fault is in the design or in
 * `DoctorConsole/sampleData.js`, not in ERP.
 */

import DoctorDetail from "../components/DoctorDetail";
import {
  DoctorCoverageCard, DoctorFilterBar, DoctorHeroCard, DoctorInsightsCard, DoctorTotalsCard,
} from "../components/DoctorConsole/plasmic";

const EXPECTED = [
  "Breadcrumb", "Hero card (avatar, name, chips, ROI plate, Rx, clinics, actions)",
  "Totals banner with last-3 lists", "Signed-in strip + Filter",
  "Coverage by role (three rings lit, ZSM dashed)", "Monthly trend over 12 months",
  "Department table (Elbrit / CND / Vasco, expandable to products)", "Activity timeline",
];

export default function DoctorDetailSample() {
  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>DoctorDetail — sample data</h2>
      <p style={{ margin: "0 0 4px", fontSize: 13, color: "#4b5563" }}>
        Placeholder figures only. No ERP read is made on this page — every section below should be
        populated:
      </p>
      <ol style={{ margin: "0 0 16px", fontSize: 13, color: "#4b5563" }}>
        {EXPECTED.map((s) => <li key={s}>{s}</li>)}
      </ol>

      <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>A · built-in stack (all five, nothing bound)</h3>
      <div id="dx-sample-all" style={{ border: "2px dashed #c7d2fe", borderRadius: 12, padding: 8 }}>
        <DoctorDetail sampleData />
      </div>

      <h3 style={{ fontSize: 14, margin: "24px 0 6px" }}>B · the five cards, placed separately</h3>
      <p style={{ margin: "0 0 6px", fontSize: 12, color: "#6b7280" }}>
        Every card has Sample Data on and nothing else set, and they are in a different order on
        purpose — they share one set of placeholder rows the same way five live cards share one read.
      </p>
      <div
        id="dx-sample-cards"
        style={{ border: "2px dashed #fca5a5", borderRadius: 12, padding: 8, display: "grid", gap: 12 }}
      >
        <DoctorHeroCard sampleData />
        <DoctorFilterBar sampleData />
        <DoctorTotalsCard sampleData />
        <DoctorInsightsCard sampleData />
        <DoctorCoverageCard sampleData />
      </div>
    </div>
  );
}
