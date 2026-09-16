/**
 * TEMPORARY DIAGNOSTIC — delete once the doctor page renders correctly.
 *
 * Renders DoctorDetail on its own, with a doctor row passed straight in and NO
 * ERP call at all. Everything the component can draw without data draws here:
 * the hero, the totals banner, coverage by role, the monthly trend and the
 * table/activity panel.
 *
 * WHY IT EXISTS. The component renders every one of those sections in a real
 * server render locally, but sections are reported missing on the deployed
 * doctor page. That difference is either the Plasmic page around the component
 * or the browser it runs in — this page removes both Plasmic and ERP from the
 * picture so the two can be told apart:
 *
 *   sections show HERE but not on /doctor-detail/[id]
 *       -> the Plasmic page is the problem, not the component. That page still
 *          carries eight Studio-built nodes beside the code component
 *          (avatar, modal, textAreaInput, pobDrawer, table, molEmpDoc,
 *          docDetialKpi, embedHtml); delete them so the page is
 *          layout -> stack -> doctorDetailPage.
 *
 *   sections are missing HERE too
 *       -> nothing to do with Plasmic or ERP. Send this page's DOM.
 */

import DoctorDetail from "../components/DoctorDetail";
import {
  DoctorCoverage, DoctorFilterBar, DoctorHero, DoctorInsights, DoctorTotals,
} from "../components/DoctorConsole/sections";

// Shaped like a real Lead row, including the coverage child table, so the hero
// and the coverage ring have something true to draw.
const ROW = {
  name: "DR-56679",
  lead_name: "Dr Arun Prabhu",
  custom_doctor_code: "56679",
  custom_specialty: "Surgeon",
  custom_category: "C",
  city: "Gobi",
  state: "Tamil Nadu",
  territory: "HQ-Erode",
  custom_role_profile: [
    { role_profile_list: "BE4-ELBR-CO-ERO", department: "Elbrit Coimbatore - ELPL", hq: "HQ-Erode" },
    { role_profile_list: "BE4-CND-CO-ERO", department: "CND Coimbatore - ELPL", hq: "HQ-Erode" },
    { role_profile_list: "BE3-VASC-CO-ERO", department: "Vasco Coimbatore - ELPL", hq: "HQ-Erode" },
  ],
};

const EXPECTED = [
  "Breadcrumb", "Hero card (avatar, name, chips, Rx)", "Totals banner",
  "Signed-in strip + Filter", "Coverage by role", "Monthly trend",
  "Table / Activity panel",
];

export default function DoctorDetailProbe() {
  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>DoctorDetail — isolated render</h2>
      <p style={{ margin: "0 0 4px", fontSize: 13, color: "#4b5563" }}>
        No Plasmic page, no ERP. Every section below should be present:
      </p>
      <ol style={{ margin: "0 0 16px", fontSize: 13, color: "#4b5563" }}>
        {EXPECTED.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>A · built-in stack (no children)</h3>
      <div style={{ border: "2px dashed #c7d2fe", borderRadius: 12, padding: 8 }}>
        <DoctorDetail doctor={ROW} />
      </div>

      <h3 style={{ fontSize: 14, margin: "24px 0 6px" }}>B · composed from sections (what Studio will do)</h3>
      <div style={{ border: "2px dashed #fca5a5", borderRadius: 12, padding: 8 }}>
        <DoctorDetail doctor={ROW} department="Elbrit" period="all" valueFormat="short">
          <DoctorHero />
          <DoctorTotals />
          <DoctorFilterBar />
          <DoctorCoverage />
          <DoctorInsights />
        </DoctorDetail>
      </div>
    </div>
  );
}
