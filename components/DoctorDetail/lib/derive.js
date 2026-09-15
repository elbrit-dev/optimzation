/**
 * ERP rows -> the row shapes the approved design works in.
 *
 * The design was drawn against hand-written sample rows that already had a
 * `div` and a `role` on every line. Real ERP puts those in four different
 * places, and on one doctype they are not there at all. Everything that
 * reconciles the two lives here, so the view layer only ever sees the design's
 * vocabulary.
 */

import {
  T, toNumber, stripHtml, initialsOf, MONTHS,
} from "./format";
import { parseDepartment, shortDivision, rolePrefix } from "./erp";

const UNASSIGNED = "Unassigned";

/** Unwrap edge/connection/array wrappers down to the ONE row inside. */
export function normalizeRow(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return normalizeRow(value[0]);
  if (value.node) return normalizeRow(value.node);
  if (Array.isArray(value.edges)) return normalizeRow(value.edges[0]);
  if (Array.isArray(value.data)) return normalizeRow(value.data[0]);
  return typeof value === "object" ? value : null;
}

function linkName(value) {
  if (value == null) return null;
  if (typeof value === "string") return value || null;
  if (typeof value === "object") return value.name ?? value.territory_name ?? null;
  return null;
}

/* ------------------------------------------------------------- the doctor */

/**
 * Identity, plus the department list.
 *
 * The departments are the axis the whole page is organised by — the chart's
 * pager, the table's rows and the filter all page through them — and they come
 * from `custom_role_profile`, which also names the reps covering each one.
 * Those child rows are routinely DUPLICATED in ERP (a doctor with three real
 * divisions often carries six rows), so they are deduped by division here
 * rather than showing "Elbrit" twice in the filter.
 */
export function deriveDoctor(lead, fallbackRow, doctorId) {
  const row = lead ?? fallbackRow ?? {};
  const alt = fallbackRow ?? {};
  const read = (key) => row[key] ?? alt[key] ?? null;

  const profiles = Array.isArray(read("custom_role_profile")) ? read("custom_role_profile") : [];
  const seen = new Map();
  const covering = [];
  profiles.forEach((entry) => {
    if (!entry) return;
    const label = entry.department__name ?? entry.department ?? null;
    const { division, region } = parseDepartment(label);
    const short = shortDivision(division);
    if (division && !seen.has(short)) {
      seen.set(short, { key: short, label: short, division, region, department: label });
    }
    const list = entry.role_profile_list;
    const holder = list && typeof list === "object" ? list.custom_employee_id : null;
    const people = Array.isArray(holder) ? holder : holder ? [holder] : [];
    people.forEach((p) => {
      if (!p?.employee) return;
      covering.push({
        employee: p.employee,
        name: p.employee_name ?? p.employee,
        division: short,
        roleId: entry.role_profile_list__name ?? null,
        role: rolePrefix(entry.role_profile_list__name),
      });
    });
  });

  const divisions = [...seen.values()];
  const name = String(read("lead_name") ?? read("first_name") ?? doctorId ?? "").trim();
  const cats = [read("custom_category__name"), read("custom_category1__name"),
    read("custom_category2__name"), read("custom_category3__name")]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean);

  const lat = toNumber(read("custom_latitude"));
  const lon = toNumber(read("custom_longitude"));

  return {
    id: doctorId ?? read("name") ?? null,
    name: name || (doctorId ?? "Doctor"),
    initials: initialsOf(name),
    spec: read("custom_specialty__name") ?? read("custom_speciality") ?? null,
    qual: read("custom_qualification__name") ?? read("custom_qualification") ?? null,
    city: read("city") ?? null,
    state: read("state") ?? null,
    hq: linkName(read("territory")),
    code: read("custom_doctor_code") ?? null,
    status: read("status") ?? null,
    email: read("email_id") ?? null,
    cats,
    catLine: cats.join(" · "),
    divisions,
    divs: divisions.map((d) => d.key),
    covering,
    // 0,0 is what a doctor with no captured location carries, not the Gulf of Guinea.
    lat: lat || null,
    lon: lon || null,
    creation: read("creation") ?? null,
    modified: read("modified") ?? null,
  };
}

/* ------------------------------------------------------------------ rows */

/**
 * Support, one row per PRODUCT LINE.
 *
 * `Doctor Support`'s child table carries a department, an HQ, a role profile
 * and a brand on every item, so support is attributed exactly like everything
 * else on the page — it is only the parent row that looks bare.
 *
 * The parent totals are still read, and any month whose item rows do not add up
 * to its recorded total gets a balancing row with no department. That covers a
 * month Ecubix sent as a total with no breakdown: the headline figure stays
 * correct and the missing part is visible as Unattributed instead of quietly
 * shrinking the doctor's support.
 */
export function deriveSupport(payload) {
  const totals = Array.isArray(payload) ? payload : payload?.totals ?? [];
  const items = Array.isArray(payload) ? [] : payload?.items ?? [];

  const periodOf = (row) => {
    const t = T(row.date);
    const x = t == null ? null : new Date(t);
    return row.custom_period
      ? String(row.custom_period).replace("-", " ")
      : x ? MONTHS[x.getMonth()] + " " + x.getFullYear() : "—";
  };

  const rows = [];
  const claimed = new Map();

  items.forEach((r, i) => {
    const t = T(r.date);
    if (t == null) return;
    const amt = toNumber(r.amount);
    const { division } = parseDepartment(r.department);
    rows.push({
      k: "support",
      id: r.name + "#" + i,
      parent: r.name,
      d: String(r.date).slice(0, 10),
      t,
      p: periodOf(r),
      div: shortDivision(division) ?? UNASSIGNED,
      role: rolePrefix(r.role_profile),
      roleId: r.role_profile ?? null,
      hq: r.hq ?? null,
      item: r.item ?? "Item",
      brand: r.brand ?? null,
      qty: toNumber(r.qty),
      rate: toNumber(r.rate),
      amt,
      state: r.item_status ?? null,
    });
    claimed.set(r.name, (claimed.get(r.name) ?? 0) + amt);
  });

  totals.forEach((r) => {
    const t = T(r.date);
    if (t == null) return;
    const total = toNumber(r.custom_total_amount);
    const gap = Math.round(total - (claimed.get(r.name) ?? 0));
    // A rupee either way is rounding inside Ecubix, not a missing product.
    if (Math.abs(gap) < 2) return;
    rows.push({
      k: "support",
      id: r.name + "#rest",
      parent: r.name,
      d: String(r.date).slice(0, 10),
      t,
      p: periodOf(r),
      div: UNASSIGNED,
      role: null,
      roleId: null,
      hq: null,
      item: claimed.has(r.name) ? "Not itemised" : "No product breakdown",
      brand: null,
      qty: claimed.has(r.name) ? 0 : toNumber(r.custom_total_qty),
      rate: 0,
      amt: gap,
      state: null,
      unattributed: true,
    });
  });

  return rows.sort((a, b) => b.t - a.t);
}

/**
 * Service: the one doctype that attributes itself.
 *
 * ERP files the same payment under two employees often enough that a naive sum
 * double-counts, so one date + amount is treated as one service.
 */
export function deriveServices(rows) {
  const mapped = (rows ?? [])
    .map((r) => {
      const raw = r.service_date ?? r.date;
      const t = T(raw);
      if (t == null) return null;
      const { division } = parseDepartment(r.department);
      return {
        k: "service",
        id: r.name,
        d: String(raw).slice(0, 10),
        t,
        kind: r.service_name ?? "Service",
        amt: toNumber(r.service_amount),
        by: r.by ?? null,
        role: rolePrefix(r.role_profile),
        roleId: r.role_profile ?? null,
        div: shortDivision(division) ?? UNASSIGNED,
        hq: r.hq ?? null,
        ref: r.remarks ? stripHtml(r.remarks) : "",
        state: r.workflow_state ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.t - a.t);

  const seen = new Set();
  return mapped.filter((r) => {
    const key = r.d + "|" + r.amt;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * POB: one row per ITEM LINE, not per quotation.
 *
 * The design's table and banner both read POB as product lines, which is also
 * how the business talks about it. Department and role are not on the
 * Quotation — they come from `owner` through the employee index. A line whose
 * author cannot be resolved keeps its money and lands in Unassigned rather
 * than being dropped; a POB is real whether or not the rep still works here.
 */
export function derivePobs(rows, employeeIndex) {
  const out = [];
  (rows ?? []).forEach((q) => {
    const t = T(q.transaction_date);
    if (t == null) return;
    const who = employeeIndex?.byUser?.get(q.owner) ?? null;
    const div = shortDivision(who?.division) ?? UNASSIGNED;
    const items = Array.isArray(q.items) ? q.items : [];
    const chemist = q.customer_name ?? "Unnamed chemist";
    const base = {
      k: "pob",
      quotation: q.name,
      d: String(q.transaction_date).slice(0, 10),
      t,
      div,
      role: who?.role ?? null,
      by: who?.name ?? q.owner ?? null,
      chemist,
      address: q.address_display ? stripHtml(q.address_display) : null,
      territory: q.territory__name ?? null,
      status: q.status ?? null,
    };
    if (!items.length) {
      out.push({ ...base, item: "No line items", qty: toNumber(q.total_qty), amt: toNumber(q.grand_total) });
      return;
    }
    items.forEach((it, i) => {
      out.push({
        ...base,
        id: q.name + "#" + i,
        item: it.item_name ?? it.item_code ?? "Item",
        qty: toNumber(it.qty),
        amt: toNumber(it.net_amount),
      });
    });
  });
  return out.sort((a, b) => b.t - a.t);
}

/**
 * Whether a visit actually HAPPENED.
 *
 * A plan nobody carried out is still an Event, so the date alone proves
 * nothing. The calendar marks a visit by stamping the EMPLOYEE participant
 * `attending` with a `custom_visit_time`; that pair is the only evidence a call
 * was made. The parent Event's own `attending` is never written.
 */
function readAttendance(visit) {
  const rows = Array.isArray(visit?.event_participants) ? visit.event_participants : [];
  let made = false;
  let at = null;
  let forced = false;
  rows.forEach((row) => {
    if (!row) return;
    if (String(row.custom_is_force_visit) === "1" || row.custom_is_force_visit === true) forced = true;
    const attending = String(row.attending ?? "").toLowerCase();
    if (attending === "yes" || attending === "1" || row.custom_visit_time) {
      made = true;
      const stamp = T(row.custom_visit_time);
      if (stamp != null && (at == null || stamp > at)) at = stamp;
    }
  });
  return { made, at, forced };
}

/**
 * Visits.
 *
 * Every event row is kept and counted, which is what the approved design does.
 * `made` rides along so the timeline can say a call was only planned — the
 * count and the truth are both on the page rather than one standing in for the
 * other.
 */
export function deriveVisits(rows, employeeIndex) {
  return (rows ?? [])
    .map((v) => {
      const t = T(v.starts_on);
      if (t == null) return null;
      const empId = v.custom_employee_id?.employee ?? v.custom_employee_id__name ?? null;
      const who = empId ? employeeIndex?.byId?.get(empId) ?? null : null;
      const attendance = readAttendance(v);
      return {
        k: "visit",
        id: v.name,
        d: String(v.starts_on).slice(0, 10),
        t,
        who: who?.name ?? v.custom_employee_id?.employee_name ?? empId ?? "Unknown",
        employee: empId,
        role: who?.role ?? null,
        div: shortDivision(who?.division) ?? UNASSIGNED,
        hq: v.custom_hq__name ?? null,
        subject: v.subject ?? v.event_type ?? "Visit",
        category: v.event_category ?? null,
        pobGiven: v.custom_pob_given ?? null,
        made: attendance.made,
        at: attendance.at,
        forced: attendance.forced || !!v.custom_force_visit_reason,
        forceReason: v.custom_force_visit_reason ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.t - a.t);
}

/** Lead.notes[].note is HTML and is flattened, never injected. */
export function deriveNotes(lead) {
  const rows = Array.isArray(lead?.notes) ? lead.notes : [];
  return rows
    .map((n, i) => {
      const raw = n?.added_on ?? n?.creation ?? null;
      const t = T(raw);
      const body = stripHtml(n?.note);
      if (!body && t == null) return null;
      const title = body.length > 80 ? body.slice(0, 77).trimEnd() + "…" : body || "Note";
      return {
        k: "note",
        id: n?.name ?? "note-" + i,
        d: raw ? String(raw).slice(0, 10) : null,
        t,
        tag: "Note",
        title,
        body,
        by: n?.added_by__name ?? null,
      };
    })
    .filter((n) => n && n.t != null)
    .sort((a, b) => b.t - a.t);
}

const CLINIC_HUES = ["#1e3a8a", "#047857", "#a02019", "#6d28d9", "#b45309"];

/**
 * Clinics, as far as ERP has them.
 *
 * The design shows a clinic TYPE and VISITING DAYS on every chip. ERP records
 * neither — `address_type` is Billing/Office/Shipping, which is the nearest
 * thing to a type, and there is no timings field anywhere on Address. Rather
 * than invent them the chip falls back to the address type and the timing line
 * says it is not on file.
 *
 * Coordinates exist only on the Lead, not per address, so the map pin belongs
 * to the doctor. It is attached to the first clinic and left off the rest —
 * showing every clinic at the same point would be worse than showing one.
 */
export function deriveClinics(addresses, doctor) {
  const rows = (addresses ?? []).map((a, i) => {
    const parts = [a.address_line1, a.address_line2, a.city, a.state, a.pincode]
      .map((v) => (v == null ? "" : String(v).trim()))
      .filter(Boolean);
    return {
      id: a.name,
      hue: CLINIC_HUES[i % CLINIC_HUES.length],
      name: a.address_title ?? a.city ?? "Clinic " + (i + 1),
      tag: a.address_type ?? "Address",
      addr: parts.join(", ") || "Address not captured",
      days: null,
      phone: a.phone ?? null,
      lat: i === 0 ? doctor?.lat ?? null : null,
      lon: i === 0 ? doctor?.lon ?? null : null,
    };
  });

  // A doctor with coordinates but no Address row still has somewhere to point at.
  if (!rows.length && doctor?.lat && doctor?.lon) {
    rows.push({
      id: "lead-pin",
      hue: CLINIC_HUES[0],
      name: doctor.city ? doctor.city + " location" : "Recorded location",
      tag: "Pin",
      addr: [doctor.city, doctor.state].filter(Boolean).join(", ") || "Address not captured",
      days: null,
      phone: null,
      lat: doctor.lat,
      lon: doctor.lon,
    });
  }
  return rows;
}

/**
 * Linked pharmacies, reconstructed from the POB ledger.
 *
 * There is no doctor-to-pharmacy link in ERP. What exists is the chemist named
 * on each POB, so "linked" here means "has ordered against this doctor" —
 * which is what the panel's own footnote claims it means.
 */
export function derivePharmacies(pobs) {
  const map = new Map();
  (pobs ?? []).forEach((r) => {
    const key = r.chemist;
    if (!key) return;
    const entry = map.get(key) ?? { name: key, addr: r.address ?? null, code: null, lastT: null, last: null, pob: 0, lines: 0 };
    entry.pob += r.amt;
    entry.lines += 1;
    if (entry.lastT == null || r.t > entry.lastT) {
      entry.lastT = r.t;
      entry.last = r.d;
      if (r.address) entry.addr = r.address;
    }
    map.set(key, entry);
  });
  return [...map.values()].sort((a, b) => b.pob - a.pob);
}

export { UNASSIGNED };
