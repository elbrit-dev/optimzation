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

export const UNASSIGNED = "Unassigned";

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

  // REST hands back the raw column, GraphQL the resolved Link label. Both
  // shapes reach here because the reads race two transports.
  const pick = (...keys) => { for (const k of keys) { const v = read(k); if (v != null && v !== "") return v; } return null; };
  const profiles = Array.isArray(read("custom_role_profile")) ? read("custom_role_profile") : [];
  const seen = new Map();
  const covering = [];
  // The doctor's HQ, gathered from the COVERAGE rows rather than from the
  // parent `territory` Link. `Lead.territory` is null on thousands of records
  // that nonetheless know exactly which HQ works them — the import wrote the
  // child table and skipped the parent field — so territory is treated as one
  // source among several and never as the only one. A doctor genuinely worked
  // out of two HQs (DR-24758 is Kollam for Elbrit and Trivandrum for A&P) keeps
  // both, in coverage order.
  const hqSeen = new Set();
  const hqs = [];
  profiles.forEach((entry) => {
    if (!entry) return;
    const territory = entry.hq__name ?? entry.hq ?? null;
    const label = String(territory ?? "").trim();
    if (label && !hqSeen.has(label)) { hqSeen.add(label); hqs.push(label); }
  });
  profiles.forEach((entry) => {
    if (!entry) return;
    const label = entry.department__name ?? entry.department ?? null;
    const { division, region } = parseDepartment(label);
    const short = shortDivision(division);
    if (division && !seen.has(short)) {
      seen.set(short, { key: short, label: short, division, region, department: label });
    }
    // GraphQL nests the employee under the role profile; REST returns the role
    // profile as a bare string, so there is nobody to list.
    const list = entry.role_profile_list;
    const holder = list && typeof list === "object" ? list.custom_employee_id : null;
    const people = Array.isArray(holder) ? holder : holder ? [holder] : [];
    people.forEach((p) => {
      if (!p?.employee) return;
      covering.push({
        employee: p.employee,
        name: p.employee_name ?? p.employee,
        division: short,
        roleId: entry.role_profile_list__name ?? (typeof list === "string" ? list : null),
        role: rolePrefix(entry.role_profile_list__name ?? (typeof list === "string" ? list : null)),
      });
    });
  });

  const divisions = [...seen.values()];
  const name = String(read("lead_name") ?? read("first_name") ?? doctorId ?? "").trim();
  const cats = [pick("custom_category__name", "custom_category"),
    pick("custom_category1__name", "custom_category1"),
    pick("custom_category2__name", "custom_category2"),
    pick("custom_category3__name", "custom_category3")]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean);

  const lat = toNumber(read("custom_latitude"));
  const lon = toNumber(read("custom_longitude"));

  return {
    id: doctorId ?? read("name") ?? null,
    name: name || (doctorId ?? "Doctor"),
    initials: initialsOf(name),
    spec: pick("custom_specialty__name", "custom_specialty", "custom_speciality"),
    qual: pick("custom_qualification__name", "custom_qualification"),
    city: read("city") ?? null,
    state: read("state") ?? null,
    // Territory first when it is set, the coverage rows when it is not. Null
    // only when ERP genuinely knows no HQ for this doctor at all.
    hq: linkName(read("territory")) ?? hqs[0] ?? null,
    hqs,
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
 * WHO it belongs to comes from the doctor VISIT the quotation was raised on
 * (`custom_event` -> that event's employee), never from `owner`. Owner is
 * whoever saved the row — frequently an admin or an integration account — and
 * crediting a call to them would put other people's POBs in their column.
 *
 * A quotation with no event (a POB added straight from the doctor page) keeps
 * its money and sits in Unassigned. That is the honest answer: ERP genuinely
 * does not record whose it was.
 *
 * Two input shapes are accepted because the read races two transports: REST
 * returns one flat row per line with `item_name`/`net_amount` on it, GraphQL
 * one row per quotation with a nested `items` array.
 */
export function derivePobs(rows, eventIndex) {
  const out = [];
  const push = (q, line, i) => {
    const t = T(q.transaction_date);
    if (t == null) return;
    const eventId = q.custom_event ?? q.custom_event__name ?? null;
    const who = eventId ? eventIndex?.get(eventId) ?? null : null;
    out.push({
      k: "pob",
      quotation: q.name,
      id: q.name + "#" + i,
      d: String(q.transaction_date).slice(0, 10),
      t,
      div: shortDivision(who?.division) ?? UNASSIGNED,
      role: who?.role ?? null,
      by: who?.name ?? null,
      event: eventId,
      chemist: q.customer_name ?? "Unnamed chemist",
      address: q.address_display ? stripHtml(q.address_display) : null,
      territory: q.territory ?? q.territory__name ?? null,
      status: q.status ?? null,
      item: line.item ?? "Item",
      qty: toNumber(line.qty),
      amt: toNumber(line.amt),
    });
  };

  (rows ?? []).forEach((q, qi) => {
    if (Array.isArray(q.items)) {
      // GraphQL shape: one row per quotation.
      if (!q.items.length) {
        push(q, { item: "No line items", qty: q.total_qty, amt: q.grand_total }, 0);
        return;
      }
      q.items.forEach((it, i) => push(q, {
        item: it.item_name ?? it.item_code ?? it.item_code__name, qty: it.qty, amt: it.net_amount,
      }, i));
      return;
    }
    // REST shape: already one row per line.
    push(q, { item: q.item_name ?? q.item_code ?? q.item_code__name, qty: q.qty, amt: q.net_amount }, qi);
  });

  return out.sort((a, b) => b.t - a.t);
}

/**
 * Which employee each doctor visit belongs to, keyed by event id.
 *
 * Built from the visits the page already holds, so attributing the POB ledger
 * costs no extra read.
 */
export function eventOwnerIndex(visits) {
  const map = new Map();
  (visits ?? []).forEach((v) => {
    if (!v.id) return;
    map.set(v.id, { name: v.who, role: v.role, division: v.div, employee: v.employee });
  });
  return map;
}

/**
 * Whether a visit actually HAPPENED.
 *
 * A plan nobody carried out is still an Event, so the date alone proves
 * nothing. TWO signals say a call was made, and they are read together because
 * each covers a case the other cannot:
 *
 *   Event.status == "Completed"   on the PARENT, and maintained: ERP's own
 *     Event list filtered to Completed returns 1,000+ doctor visits. Being on
 *     the parent, it is the only one of the two that survives the REST
 *     fallback, where the child table cannot be read at all.
 *
 *   participant attending / custom_visit_time   on the EMPLOYEE participant
 *     row. Direct evidence, and it carries the TIME as well as the fact, which
 *     the status never does.
 *
 * Either one alone is enough to call it made. The parent's own `attending`
 * field is NOT one of them: it reads "" on every event inspected, so treating
 * it as the signal would report every planned call as made.
 *
 * WHY THE DOCTOR VISITS LOOK ABSENT IF YOU GO LOOKING: they are all
 * `event_type: "Private"`, which Frappe shows only to their owner and
 * participants. A service account reading the Event list sees none of them and
 * concludes the field is unused. That is also why this page must keep reading
 * with the signed-in user's own token -- that permission IS the per-rep
 * boundary on visits.
 */
function readAttendance(visit) {
  const status = String(visit?.status ?? "").trim().toLowerCase();
  const completed = status === "completed";

  // The REST fallback cannot read the participant table at all. The status
  // still came back on the parent though, so this is no longer the blind spot
  // it was: only an event carrying NO status at all is genuinely unknown, and
  // reporting "planned, not made" off an absent child table would have libelled
  // every rep whose visits happened to come back over that route.
  if (visit?.__attendanceUnknown || !Array.isArray(visit?.event_participants)) {
    return { made: status ? completed : null, at: null, forced: false };
  }
  const rows = visit.event_participants;
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
  // A Completed parent counts even when no participant row was stamped -- the
  // two signals are independent and either is enough. `at` stays null in that
  // case because only the participant row ever carries the time.
  return { made: made || completed, at, forced };
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
      // GraphQL nests it, REST returns the bare employee id.
      const empId = typeof v.custom_employee_id === "string"
        ? v.custom_employee_id
        : v.custom_employee_id?.employee ?? v.custom_employee_id__name ?? null;
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
        hq: v.custom_hq__name ?? v.custom_hq ?? null,
        subject: v.subject ?? v.event_type ?? "Visit",
        category: v.event_category ?? null,
        pobGiven: v.custom_pob_given ?? null,
        made: attendance.made,
        attendanceKnown: attendance.made !== null,
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
        by: n?.added_by__name ?? n?.added_by ?? null,
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
