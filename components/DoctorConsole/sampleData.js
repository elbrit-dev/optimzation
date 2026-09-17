"use client";

/**
 * SAMPLE DATA — one complete, made-up doctor, so the design can be signed off
 * before the real reads are wired back in.
 *
 * WHY THIS EXISTS. The console only looks like itself when it is full. An empty
 * hero, a flat chart and a table of em dashes tell a reviewer nothing about
 * whether the layout works, and the real page cannot be shown to anyone without
 * an ERP credential, a doctor who happens to have history, and a grade senior
 * enough to see service. So `sampleData` on any card draws the whole design
 * from here and makes NO network request at all — see `session.js`, which never
 * calls `loadDoctorData` in that mode.
 *
 * WHY IT IS BUILT FROM RAW-ISH ROWS RATHER THAN FINISHED VIEW MODELS. Everything
 * below is shaped like what ERP actually returns and is then put through the
 * very same `derive*` functions the live read uses. That is deliberate: the
 * design is reviewed against the same attribution rules the real page obeys —
 * support's department comes off its item child rows, a POB is credited through
 * the visit it was raised on and lands in Unassigned when there is no visit, a
 * visit counts as made only when its participant row says so. A hand-written
 * set of finished cards would drift from those shapes the first time
 * `derive.js` changed, and would quietly flatter the design by giving every row
 * a department the real one cannot always supply.
 *
 * WHY THE DATES ARE RELATIVE TO TODAY. The page opens on the current financial
 * year, so a fixture pinned to fixed dates would be a blank page a year from
 * now. Every row below is placed relative to the current month, which keeps the
 * default view populated forever. The one edge is the first days of April, when
 * the financial year is a few days old and only the newest rows are inside it —
 * the sample still renders, with less in it.
 *
 * THE NUMBERS ARE UNEVEN ON PURPOSE. A quiet monsoon month sits next to a
 * January that ran hot, one month arrived from Ecubix as a total with no product
 * breakdown, one visit was planned and never marked as made, one was a force
 * visit, and one POB was raised straight from the doctor page with no visit
 * behind it. All five are real situations, and a design review that never sees
 * them is a design review of the happy path only.
 */

import { parseDepartment, rolePrefix } from "../DoctorDetail/lib/erp";
import {
  deriveClinics, deriveDoctor, deriveNotes, derivePharmacies, derivePobs,
  deriveServices, deriveSupport, deriveVisits, eventOwnerIndex,
} from "../DoctorDetail/lib/derive";
import { MONTHS, now } from "../DoctorDetail/lib/format";
import { SERVICE_MIN_RANK } from "../DoctorDetail/lib/grade";

/**
 * The sample doctor's Lead id.
 *
 * It doubles as the SESSION KEY for sample mode (see `useDoctorConsole`), which
 * is what lets five cards with `sampleData` on and nothing else bound share one
 * set of rows the same way five live cards share one read. DR-51204 is not a
 * real Lead — a real id here would invite someone to compare the placeholder
 * figures against that doctor's actual ones.
 */
export const SAMPLE_DOCTOR_ID = "DR-51204";

const DOCTOR_NAME = "Dr Meenakshi Sundaram";
const HQ = "HQ-Erode";

/**
 * The three divisions this doctor is covered for, each with the department
 * string ERP really stores. `parseDepartment` turns "Elbrit Coimbatore - ELPL"
 * into the division "Elbrit" and the region "Coimbatore", which is where the
 * chips, the chart's pager and the table's rows get their labels from — so the
 * long form is what has to be written here, not the short key.
 */
const DEPTS = {
  Elbrit: "Elbrit Coimbatore - ELPL",
  CND: "CND Coimbatore - ELPL",
  Vasco: "Vasco Coimbatore - ELPL",
};

/**
 * The people who cover the doctor, one seat each.
 *
 * The seat code is what decides the role — `rolePrefix("ABM2-ELBR-CO-ERO")` is
 * "ABM" — so the coverage rings are derived here exactly as they are live,
 * rather than being asserted. There is deliberately NO ZSM: a ladder where
 * every rung is lit tells a reviewer nothing about how the dashed "no touch"
 * ring reads next to a live one, and a doctor no zonal manager has ever called
 * is the ordinary case.
 */
const PEOPLE = [
  { id: "E01255", name: "Karthik Raja", seat: "BE4-ELBR-CO-ERO", div: "Elbrit" },
  { id: "E01188", name: "Suresh Kumar", seat: "BE3-CND-CO-ERO", div: "CND" },
  { id: "E00942", name: "Vignesh Anand", seat: "BE2-VASC-CO-ERO", div: "Vasco" },
  { id: "E00713", name: "Ramesh Balan", seat: "ABM2-ELBR-CO-ERO", div: "Elbrit" },
  { id: "E00455", name: "Prakash Menon", seat: "RBM1-CND-CO-CBE", div: "CND" },
];

const PERSON = new Map(PEOPLE.map((p) => [p.id, p]));

/**
 * Three product lines per division, with a rate each, so support and POB
 * amounts are a quantity times a price rather than a round number somebody
 * typed. The table's expanded product rows key support and POB by the same
 * product name, which only looks right when both sides sell the same things.
 */
const PRODUCTS = {
  Elbrit: [
    { item: "Elbrit Cal Soft Gel", brand: "Elbrit Cal", rate: 186 },
    { item: "Ebast-M 10mg Tablet", brand: "Ebast", rate: 92 },
    { item: "Elrofol L Tablet", brand: "Elrofol", rate: 132 },
  ],
  CND: [
    { item: "Dinorich D3 60K Sachet", brand: "Dinorich", rate: 58 },
    { item: "Glykind M2 Tablet", brand: "Glykind", rate: 76 },
    { item: "Nervijoint Plus Capsule", brand: "Nervijoint", rate: 118 },
  ],
  Vasco: [
    { item: "Vasolab 20mg Tablet", brand: "Vasolab", rate: 88 },
    { item: "Vastat 10mg Tablet", brand: "Vastat", rate: 145 },
    { item: "Vaclop AP 75 Capsule", brand: "Vaclop", rate: 96 },
  ],
};

/** The chemists the POB ledger names, which is where "linked pharmacies" comes from. */
const CHEMISTS = [
  { name: "Sri Venkateswara Medicals", addr: "142, Brough Road, Erode, Tamil Nadu 638001" },
  { name: "Thangam Pharmacy", addr: "7/3, Sathy Main Road, Gobichettipalayam, Tamil Nadu 638452" },
  { name: "Kongu Medical Stores", addr: "23, Perundurai Road, Erode, Tamil Nadu 638011" },
  { name: "Amman Pharma", addr: "5, Kaveri Street, Bhavani, Tamil Nadu 638301" },
];

/**
 * Twelve months of trade, OLDEST FIRST — the last entry is the current month.
 *
 * `sup` is [division, product index, quantity] and becomes one Support Items
 * child row; `gap` is money the month's parent total carries that no item row
 * accounts for, which is how a month Ecubix sent as a bare total reaches the
 * page as Unassigned instead of quietly shrinking the doctor's support. `vis`
 * is the calls made that month, each optionally carrying the POB lines raised
 * on it as [chemist index, product index, quantity] — the product comes from
 * the visiting rep's own division, because that is how the real ledger ends up
 * attributed. `svc` is what the company spent on the doctor.
 *
 * The shape of the year is meant to be legible at a glance: Elbrit opens the
 * doctor, CND builds through the middle of the year, Vasco joins late, support
 * dips hard in the monsoon month and peaks two months before today.
 */
const MONTH_PLAN = [
  {
    sup: [["Elbrit", 0, 110], ["Elbrit", 2, 70]],
    vis: [{ who: "E01255", day: 5, pob: [[0, 0, 18]] }],
  },
  {
    sup: [["Elbrit", 0, 130], ["CND", 1, 85]],
    vis: [
      { who: "E01255", day: 8, pob: [[0, 0, 22], [0, 1, 14]] },
      { who: "E01188", day: 19 },
    ],
  },
  {
    sup: [["Elbrit", 0, 95], ["Elbrit", 1, 60], ["CND", 1, 110]],
    vis: [
      { who: "E01255", day: 3, pob: [[2, 2, 16]] },
      { who: "E00713", day: 14, subject: "Joint call with ABM" },
    ],
    svc: [{ day: 20, kind: "Clinic branding", who: "E00713", amt: 42000, note: "Signage and waiting-room boards" }],
  },
  {
    // Ecubix sent this month as a total with no product breakdown at all. The
    // headline support figure is still right; the design has to show the
    // missing part rather than lose it.
    sup: [],
    gap: 38400,
    vis: [{ who: "E01188", day: 12, pob: [[1, 1, 20]] }],
  },
  {
    sup: [["Elbrit", 0, 180], ["CND", 1, 140], ["Vasco", 0, 95]],
    vis: [
      { who: "E01255", day: 6, pob: [[0, 0, 26]] },
      { who: "E00942", day: 21, subject: "First Vasco detailing call", pob: [[3, 0, 12]] },
    ],
  },
  {
    sup: [["Elbrit", 2, 150], ["CND", 2, 80], ["Vasco", 1, 60]],
    vis: [
      { who: "E01255", day: 9, pob: [[2, 2, 19]] },
      // A force visit: outside the tour plan, with a reason recorded.
      { who: "E01188", day: 17, forced: true, subject: "Force visit — stock-out escalation" },
    ],
    svc: [{ day: 14, kind: "CME sponsorship", who: "E00455", amt: 118000, note: "District diabetology update, Coimbatore" }],
  },
  {
    // The monsoon dip. One product line, one call, and that call never got
    // marked as made.
    sup: [["Elbrit", 0, 60]],
    vis: [{ who: "E01255", day: 11, made: false }],
  },
  {
    sup: [["Elbrit", 0, 210], ["Elbrit", 1, 120], ["CND", 1, 160], ["Vasco", 0, 110]],
    vis: [
      { who: "E01255", day: 4, pob: [[0, 0, 32], [0, 2, 18]] },
      { who: "E00713", day: 16, subject: "Joint call with ABM", pob: [[2, 1, 15]] },
      { who: "E00942", day: 23, pob: [[3, 1, 9]] },
    ],
  },
  {
    sup: [["Elbrit", 0, 160], ["CND", 1, 120], ["Vasco", 1, 85]],
    vis: [
      { who: "E01255", day: 7, pob: [[0, 1, 24]] },
      // The second force visit of the year, placed here rather than only in the
      // older month so the "Force visit" flag is inside the financial year the
      // page opens on — a flag nobody can see without changing the period is a
      // flag that never gets reviewed.
      { who: "E01188", day: 18, forced: true, subject: "Force visit — camp follow-up", pob: [[1, 0, 30]] },
    ],
    svc: [{ day: 9, kind: "Patient education camp", who: "E00713", amt: 26500, note: "Foot-care camp, 140 patients screened" }],
  },
  {
    sup: [["Elbrit", 2, 190], ["CND", 2, 130], ["Vasco", 0, 140]],
    vis: [
      { who: "E01255", day: 5, pob: [[0, 0, 28], [0, 1, 20]] },
      { who: "E00942", day: 13, pob: [[3, 2, 14]] },
      { who: "E00713", day: 26, subject: "Quarterly review call" },
    ],
    svc: [{ day: 22, kind: "Conference travel — APICON", who: "E00455", amt: 96000, note: "Registration, travel and stay" }],
  },
  {
    // The peak, and a month whose items fall a little short of the recorded
    // total — a partial breakdown, which is commoner than a missing one.
    sup: [["Elbrit", 0, 240], ["Elbrit", 1, 140], ["CND", 1, 175], ["Vasco", 1, 100]],
    gap: 12400,
    vis: [
      { who: "E01255", day: 6, pob: [[0, 0, 36], [2, 2, 22]] },
      { who: "E01188", day: 15, pob: [[1, 1, 26]] },
      { who: "E00713", day: 21, subject: "Joint call with ABM" },
    ],
    svc: [{ day: 11, kind: "Equipment support — glucometer", who: "E00713", amt: 34500, note: "Two units plus first strip pack" }],
  },
  {
    // The current month, part-way through. Three calls rather than one so the
    // "last 3" lists on the totals strip are populated even in the first weeks
    // of a financial year, when nothing older is inside the default period.
    sup: [["Elbrit", 0, 150], ["CND", 1, 110], ["Vasco", 0, 90]],
    vis: [
      { who: "E01255", day: 3, pob: [[0, 0, 21]] },
      { who: "E01188", day: 9, pob: [[1, 1, 17]] },
      { who: "E00942", day: 12, pob: [[3, 0, 11]] },
    ],
    svc: [{ day: 6, kind: "Journal subscription", who: "E00455", amt: 18500, note: "Annual, Indian Journal of Endocrinology" }],
  },
];

/**
 * The notes on the Lead, as day offsets from today.
 *
 * Notes are the one kind of row with no month to hang on, and the newest three
 * are placed inside the last three weeks so the notes card always has its
 * "last 3" however far into a financial year the review happens.
 */
const NOTE_PLAN = [
  { back: 2, who: "E01255", body: "Prefers detailing after 7pm — OP runs long on Mondays and Thursdays." },
  { back: 9, who: "E00713", body: "Asked for the Elrofol L clinical reprints before he switches the post-natal cases over." },
  { back: 21, who: "E01188", body: "Glykind M2 stock ran out at Thangam Pharmacy for four days; he wrote the substitute instead. Chemist has re-ordered." },
  { back: 40, who: "E01255", body: "Second clinic at Gobichettipalayam now runs Tuesday and Friday mornings only." },
  { back: 68, who: "E00455", body: "Agreed to chair the district CME session if we cover travel. Confirm the date with the academic committee." },
  { back: 115, who: "E00942", body: "Started prescribing Vasolab for the cardio-renal cases. Wants the 90-day pack." },
];

/* --------------------------------------------------------------- helpers */

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => y + "-" + pad(m + 1) + "-" + pad(d);

/** The first of the month `back` months before the current one. */
function monthStart(back) {
  const at = now();
  return new Date(at.getFullYear(), at.getMonth() - back, 1);
}

/**
 * A date inside that month, clamped twice: to the length of the month, and — in
 * the current month — to today. A support row or a visit dated next week would
 * read as a plan rather than as something that happened, which is a different
 * thing on this page and not what the sample is trying to show.
 */
function dayIn(date, day) {
  const at = now();
  const y = date.getFullYear();
  const m = date.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  let d = Math.max(1, Math.min(day, last));
  if (y === at.getFullYear() && m === at.getMonth()) d = Math.min(d, at.getDate());
  return iso(y, m, d);
}

/** "Aug-2026" — the form `custom_period` is written in. */
function periodKey(date) {
  return MONTHS[date.getMonth()] + "-" + date.getFullYear();
}

function daysAgo(n) {
  const at = now();
  const d = new Date(at.getFullYear(), at.getMonth(), at.getDate() - n);
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
}

/* ------------------------------------------------------------ the fixture */

/**
 * The Lead, including the coverage child table.
 *
 * `custom_role_profile` is the axis the whole page is organised by — the
 * department chips, the chart's pager and the table's rows all come from it —
 * and it is written in the GraphQL shape, with the covering employee nested
 * under the role profile, because that is the shape with the most in it.
 */
function buildLead() {
  return {
    name: SAMPLE_DOCTOR_ID,
    lead_name: DOCTOR_NAME,
    first_name: "Meenakshi",
    custom_doctor_code: "51204",
    custom_specialty: "Diabetologist",
    custom_qualification: "MBBS, MD (Gen Med)",
    custom_category: "A",
    custom_category1: "HIHR",
    city: "Erode",
    state: "Tamil Nadu",
    email_id: "sundaram.diabetes@example.in",
    status: "Open",
    // Erode town centre. 0,0 would put the map pin in the Gulf of Guinea, which
    // is exactly the case the live derive guards against.
    custom_latitude: 11.341,
    custom_longitude: 77.7172,
    creation: iso(monthStart(11).getFullYear(), monthStart(11).getMonth(), 1) + " 09:14:02.000000",
    modified: daysAgo(2) + " 18:41:55.000000",
    custom_role_profile: PEOPLE.map((p) => ({
      role_profile_list__name: p.seat,
      role_profile_list: {
        custom_employee_id: [{ employee: p.id, employee_name: p.name }],
      },
      department__name: DEPTS[p.div],
      hq__name: HQ,
    })),
    notes: NOTE_PLAN.map((n, i) => ({
      name: "NOTE-" + SAMPLE_DOCTOR_ID + "-" + pad(i + 1),
      added_on: daysAgo(n.back) + " 17:05:00.000000",
      // Frappe stores a note as HTML; `deriveNotes` flattens it and never
      // injects it, and the sample keeps the tags so that path is exercised.
      note: "<div class=\"ql-editor read-mode\"><p>" + n.body + "</p></div>",
      added_by__name: PERSON.get(n.who)?.name ?? n.who,
    })),
  };
}

const ADDRESSES = [
  {
    name: "Sundaram Diabetes Centre-Office",
    address_title: "Sundaram Diabetes Centre",
    address_type: "Office",
    address_line1: "12/4, Perundurai Road",
    address_line2: "Opposite Kongu Arts College",
    city: "Erode",
    state: "Tamil Nadu",
    pincode: "638011",
    phone: "+91 94433 20114",
  },
  {
    name: "Gobi Consulting Room-Billing",
    address_title: "Gobi Consulting Room",
    address_type: "Billing",
    address_line1: "3, Sathy Main Road",
    address_line2: null,
    city: "Gobichettipalayam",
    state: "Tamil Nadu",
    pincode: "638452",
    phone: null,
  },
];

/**
 * Walk the month plan and emit the ERP-shaped rows: the Doctor Support parent
 * and item rows, the Events with their participant child rows, the Quotations
 * hung off those Events, and the Doctor Service rows.
 */
function buildRows() {
  const totals = [];
  const items = [];
  const visits = [];
  const quotations = [];
  const services = [];
  let seq = 0;

  MONTH_PLAN.forEach((plan, i) => {
    const back = MONTH_PLAN.length - 1 - i;
    const month = monthStart(back);
    const period = periodKey(month);
    const parent = "DS-" + String(month.getFullYear()).slice(2) + pad(month.getMonth() + 1) + "-" + SAMPLE_DOCTOR_ID.slice(3);
    // Support is booked against the month, not against a call, so it carries
    // the last day of the month it belongs to — or today, in the month we are in.
    const bookedOn = dayIn(month, 28);

    let monthAmount = 0;
    let monthQty = 0;
    plan.sup.forEach(([div, pi, qty]) => {
      const product = PRODUCTS[div][pi];
      const amount = qty * product.rate;
      monthAmount += amount;
      monthQty += qty;
      items.push({
        name: parent,
        date: bookedOn,
        custom_period: period,
        item: product.item,
        brand: product.brand,
        qty,
        rate: product.rate,
        amount,
        department: DEPTS[div],
        hq: HQ,
        role_profile: PEOPLE.find((p) => p.div === div)?.seat ?? null,
        item_status: "Approved",
      });
    });

    if (monthAmount || plan.gap) {
      totals.push({
        name: parent,
        date: bookedOn,
        custom_period: period,
        // The parent total is the authority on the money. Anything the items do
        // not account for becomes an Unassigned row downstream.
        custom_total_amount: monthAmount + (plan.gap ?? 0),
        custom_total_qty: monthQty,
      });
    }

    (plan.vis ?? []).forEach((call) => {
      const who = PERSON.get(call.who);
      const on = dayIn(month, call.day);
      seq += 1;
      const event = "EV-" + String(seq).padStart(5, "0");
      const made = call.made !== false;
      visits.push({
        name: event,
        subject: call.subject ?? "Doctor visit · " + DOCTOR_NAME,
        event_type: "Public",
        event_category: "Doctor Visit",
        starts_on: on + " 10:30:00",
        custom_hq: HQ,
        custom_doctor: SAMPLE_DOCTOR_ID,
        custom_employee_id: who.id,
        custom_force_visit_reason: call.forced ? "Chemist reported a stock-out; called outside the tour plan." : null,
        // Attendance lives on the EMPLOYEE participant row, never on the parent
        // Event — the parent's own `attending` is never written, so reading it
        // would mark every plan as a call made.
        event_participants: [{
          reference_doctype: "Employee",
          reference_docname: who.id,
          attending: made ? "Yes" : "No",
          custom_visit_time: made ? on + " 11:05:00" : null,
          custom_is_force_visit: call.forced ? 1 : 0,
        }],
      });

      (call.pob ?? []).forEach((line, li) => {
        const chemist = CHEMISTS[line[0]];
        const product = PRODUCTS[who.div][line[1]];
        const qty = line[2];
        quotations.push({
          name: "SAL-QTN-" + String(month.getFullYear()).slice(2) + "-" + String(seq * 10 + li).padStart(5, "0"),
          transaction_date: on,
          customer_name: chemist.name,
          address_display: "<div>" + chemist.addr + "</div>",
          territory: HQ,
          status: "Open",
          // The only honest link back to a person: the visit the POB was raised
          // on. Nothing on a Quotation names an employee.
          custom_event: event,
          custom_doctorvisit: SAMPLE_DOCTOR_ID,
          items: [{ item_name: product.item, item_code: product.item, qty, rate: product.rate, net_amount: qty * product.rate }],
        });
      });
    });

    (plan.svc ?? []).forEach((s, si) => {
      const who = PERSON.get(s.who);
      services.push({
        name: "DSV-" + String(month.getFullYear()).slice(2) + pad(month.getMonth() + 1) + "-" + pad(si + 1),
        service_name: s.kind,
        service_amount: s.amt,
        service_date: dayIn(month, s.day),
        by: who.name,
        hq: HQ,
        department: DEPTS[who.div],
        role_profile: who.seat,
        remarks: "<p>" + s.note + "</p>",
        // Every real row sits in Draft and is never filtered on; filtering
        // would empty the panel for every doctor there is.
        workflow_state: "Draft",
      });
    });
  });

  // A POB added straight from the doctor page, with no visit behind it. ERP
  // genuinely does not record whose call it was, so it keeps its money and
  // sits in Unassigned — the design has to have somewhere to put it.
  quotations.push({
    name: "SAL-QTN-" + String(now().getFullYear()).slice(2) + "-90001",
    transaction_date: daysAgo(15),
    customer_name: CHEMISTS[2].name,
    address_display: "<div>" + CHEMISTS[2].addr + "</div>",
    territory: HQ,
    status: "Open",
    custom_event: null,
    custom_doctorvisit: SAMPLE_DOCTOR_ID,
    items: [{
      item_name: PRODUCTS.Elbrit[1].item,
      item_code: PRODUCTS.Elbrit[1].item,
      qty: 14,
      rate: PRODUCTS.Elbrit[1].rate,
      net_amount: 14 * PRODUCTS.Elbrit[1].rate,
    }],
  });

  return { totals, items, visits, quotations, services };
}

/**
 * Who the sample is being read AS.
 *
 * A ZSM, because the reviewer has to be able to see the service and ROI
 * surfaces — half the design is about them, and a reader below SM never sees
 * them at all. This is not a way around the live rule: the real page still
 * resolves the viewer from their own ERP token, and `sampleData` is only ever
 * placeholder figures for nobody's doctor.
 */
const SAMPLE_VIEWER = Object.freeze({
  email: "sample.reviewer@elbrit.org",
  employee: "E00181",
  employeeName: "S Balamurugan",
  designation: "Zonal Sales Manager",
  roleId: "ZSM1-ELBR-TN-CBE",
  role: "ZSM",
  rank: SERVICE_MIN_RANK,
  division: "Elbrit",
  hq: "HQ-Coimbatore",
  canSeeService: true,
  row: null,
  resolved: true,
});

/**
 * The span the figures are notionally narrowed to. Only `resolved` is read —
 * it is what tells the page the scoping worked, so the panels are empty because
 * there is nothing there rather than because we could not work out what this
 * reader covers.
 */
const SAMPLE_SPAN = Object.freeze({
  resolved: true,
  rank: SERVICE_MIN_RANK,
  canSeeService: true,
  roleProfiles: new Set(PEOPLE.map((p) => p.seat)),
  departments: new Set(Object.values(DEPTS)),
  hqs: new Set([HQ]),
  employees: new Set(PEOPLE.map((p) => p.id)),
  people: PEOPLE.map((p) => ({ name: p.id, employee_name: p.name })),
});

/** The employee index the live read builds from ERP, built here from the roster. */
function buildEmployeeIndex() {
  const byId = new Map();
  PEOPLE.forEach((p) => {
    const department = parseDepartment(DEPTS[p.div]);
    byId.set(p.id, {
      employee: p.id,
      name: p.name,
      role: rolePrefix(p.seat),
      roleId: p.seat,
      division: department.division,
      department: department.label,
      hq: HQ,
    });
  });
  return { byId };
}

// Built once per day. The rows are dated relative to today, so the only thing
// that can invalidate them is the date changing under a long-lived tab; keying
// the cache on it costs nothing and means every card that joins the sample
// session gets the identical rows rather than its own copy.
let cache = null;
let cacheDay = null;

/**
 * The finished `data` object — the same shape `loadDoctorData` resolves to, so
 * `buildConsole` cannot tell the difference and neither can any card.
 */
export function sampleConsoleData() {
  const at = now();
  const day = iso(at.getFullYear(), at.getMonth(), at.getDate());
  if (cache && cacheDay === day) return cache;

  const lead = buildLead();
  const { totals, items, visits: visitRaw, quotations, services } = buildRows();

  const doctor = deriveDoctor(lead, null, SAMPLE_DOCTOR_ID);
  const visits = deriveVisits(visitRaw, buildEmployeeIndex());
  const pobs = derivePobs(quotations, eventOwnerIndex(visits));

  cache = {
    doctorId: SAMPLE_DOCTOR_ID,
    loading: false,
    ready: true,
    fatal: null,
    scope: "user",
    // No ERP answered, and saying one did would be the one lie on the page that
    // could actually mislead somebody — the endpoint line exists precisely so a
    // UAT front end reading production is not invisible.
    endpoint: null,
    viewer: SAMPLE_VIEWER,
    span: SAMPLE_SPAN,
    scoped: true,
    canSeeService: true,
    doctor,
    support: deriveSupport({ totals, items }),
    service: deriveServices(services),
    pobs,
    visits,
    notes: deriveNotes(lead),
    clinics: deriveClinics(ADDRESSES, doctor),
    pharmacies: derivePharmacies(pobs),
    errors: {},
    denied: {},
    // The one field that has no live counterpart: it tells the session not to
    // read ERP, and nothing else in the console reads it.
    sample: true,
  };
  cacheDay = day;
  return cache;
}

export default sampleConsoleData;
