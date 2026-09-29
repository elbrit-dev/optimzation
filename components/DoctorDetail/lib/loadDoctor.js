"use client";

/**
 * Every ERP read the doctor detail makes, as ONE plain async function over a
 * GraphQL connection (see source.js).
 *
 * Two waves, as before. Wave one is the org (who is reading, and everyone under
 * them) alongside the six doctor reads, all fired together. Wave two is purely
 * local now: the rows are narrowed to the reader's span and the visit rows'
 * employee ids are turned into roles and departments from the org already in
 * hand — no second trip to ERP.
 *
 * Every read fails ON ITS OWN. A refused or broken read empties its own panel
 * and names itself in `errors` / `denied`; it never takes the rest of the page
 * with it. Only a missing connection is fatal.
 *
 * Nothing is bounded by the selected period: the chart's window is the last
 * twelve months of anything on record, and a doctor's whole history is a few
 * hundred rows at the outside, so it is read whole and filtered in the browser.
 */

import { ladderRole, parseDepartment, rolePrefix } from "./erp";
import { SERVICE_MIN_RANK, gradeRank } from "./grade";
import { dataFloor } from "./analytics";
import {
  fetchAddresses, fetchLead, fetchOrg, fetchPobs, fetchServices, fetchSupport, fetchVisits,
} from "./source";
import {
  deriveClinics, deriveDoctor, deriveNotes, derivePharmacies, derivePobs,
  deriveServices, deriveSupport, deriveVisits, eventOwnerIndex, normalizeRow,
} from "./derive";
import { FEATURES } from "./features";
import { resolveScopeFromOrg, scopeLeadCoverage, scopeRawRows } from "./scope";

const EMPTY = Object.freeze([]);

/** The doctor id and the bound row, from whatever a page bound. */
export function readDoctorInput(doctorInput) {
  const bound = typeof doctorInput === "string" ? null : normalizeRow(doctorInput);
  const doctorId = typeof doctorInput === "string"
    ? (doctorInput.trim() || null)
    : (bound?.name ?? bound?.id ?? null);
  return { bound, doctorId };
}

/** What the page shows before anything has landed. */
export function emptyData(doctorId, bound) {
  return {
    doctorId,
    loading: !!doctorId,
    ready: false,
    fatal: null,
    scope: "user",
    endpoint: null,
    viewer: null,
    span: null,
    scoped: false,
    canSeeService: false,
    // The bound row paints the hero before any read lands.
    doctor: doctorId ? deriveDoctor(null, bound, doctorId) : null,
    support: EMPTY, service: EMPTY, pobs: EMPTY, visits: EMPTY, notes: EMPTY,
    clinics: EMPTY, pharmacies: EMPTY,
    errors: {}, denied: {},
  };
}

/**
 * WHO is reading, from the org. The token names a User; the Employee keyed to
 * that User names the seat. `user_id`, never `company_email` — field staff
 * routinely have that empty. ERP hands a login on to replacements, so where
 * several rows share it the Active one wins.
 *
 * Unresolved is the LEAST privileged reader: no row, no service figures.
 */
export function viewerFromOrg(org) {
  const email = String(org?.email ?? "").trim() || null;
  const mine = email ? (org?.rows ?? []).filter((r) => String(r.user_id ?? "").toLowerCase() === email.toLowerCase()) : [];
  const row = mine.find((r) => r.status === "Active") ?? mine[0] ?? null;
  const roleId = row?.custom_role_profile ?? row?.role_id ?? null;
  const rank = gradeRank({ roleId, designation: row?.designation });
  return {
    email,
    employee: row?.name ?? null,
    employeeName: row?.employee_name ?? null,
    designation: row?.designation ?? null,
    roleId,
    role: rolePrefix(roleId) ?? null,
    rank,
    division: parseDepartment(row?.department).division,
    hq: row?.fsl_hq ?? row?.custom_territory ?? null,
    canSeeService: rank >= SERVICE_MIN_RANK,
    row,
    resolved: !!row,
  };
}

/** Employee id -> { role, department, … } for the visit rows, from the org. */
function employeeIndex(org) {
  const byId = new Map();
  for (const row of org?.rows ?? []) {
    const roleId = row.custom_role_profile ?? row.role_id ?? null;
    const department = parseDepartment(row.department);
    byId.set(row.name, {
      employee: row.name,
      name: row.employee_name,
      role: ladderRole(roleId),
      roleId,
      division: department.division,
      department: department.label,
      hq: row.fsl_hq ?? row.custom_territory ?? null,
    });
  }
  return { byId };
}

/**
 * Read everything for one doctor.
 *
 * `isStale()` is checked at every await boundary so a page that has been
 * pointed at another doctor — or unmounted — never paints the old one's rows.
 */
export async function loadDoctorData(
  { conn, doctorId, bound, employee, roleProfile, pobLimit = 500 },
  isStale = () => false
) {
  const errors = {};
  const denied = {};
  // 403-shaped answers are a permission, not a bug: a Retry will never fix them.
  const run = async (name, promise, fallback) => {
    try {
      return await promise;
    } catch (error) {
      if (/permission|not permitted|403|forbidden/i.test(String(error?.message ?? ""))) denied[name] = true;
      else errors[name] = true;
      console.warn(`[doctor-detail] ${name} failed:`, error);
      return fallback;
    }
  };

  const org = await run("org", fetchOrg(conn), null);
  if (isStale()) return null;
  const viewer = viewerFromOrg(org);
  const canSeeService = viewer.canSeeService;

  const first = Math.max(1, Math.min(1000, Number(pobLimit) || 500));
  /*
   * ONLY THE CURRENT FINANCIAL YEAR — from 1 April — is read. The dated reads
   * ask ERP for that window; everything is cut again below after deriving,
   * which also covers Doctor Service (its service_date can be null, so it is
   * read whole and cut here) and the notes, which arrive on the Lead.
   */
  const floor = dataFloor();
  const f = new Date(floor);
  const since = f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0") + "-01";
  const inFy = (rows) => (rows ?? []).filter((r) => r?.t != null && r.t >= floor);
  const [span, lead, supportAll, serviceAll, addressRaw, pobAll, visitAll] = await Promise.all([
    run("scope", resolveScopeFromOrg(viewer.row, org ?? {}, { employee, roleProfile }), null),
    run("lead", fetchLead(conn, doctorId), null),
    run("support", fetchSupport(conn, doctorId, since), { totals: [], items: [] }),
    // Never even asked for a reader who may not see it.
    canSeeService ? run("service", fetchServices(conn, doctorId), EMPTY) : Promise.resolve(EMPTY),
    // Switched off for now (lib/features.js) — not even asked for.
    FEATURES.clinics ? run("addresses", fetchAddresses(conn, doctorId), EMPTY) : Promise.resolve(EMPTY),
    run("pobs", fetchPobs(conn, doctorId, first, since), EMPTY),
    run("visits", fetchVisits(conn, doctorId, since), EMPTY),
  ]);
  if (isStale()) return null;

  // Narrowed HERE, on the raw rows, so every total and every chart series below
  // is computed over the reader's own rows and nothing else.
  const { support: supportRaw, service: serviceRaw, pobs: pobRaw, visits: visitRaw } =
    scopeRawRows(span, { support: supportAll, service: serviceAll, pobs: pobAll, visits: visitAll });

  const visits = inFy(deriveVisits(visitRaw, employeeIndex(org)));
  const pobs = inFy(derivePobs(pobRaw, eventOwnerIndex(visits)));
  const support = inFy(deriveSupport(supportRaw));
  const service = inFy(deriveServices(serviceRaw));

  // The doctor's departments, HQs and covering reps, cut to the reader's team
  // the same way the rows were — see scopeLeadCoverage. A division the doctor
  // has and the reader's OWN (already scoped) rows fall under stays too, so a
  // teammate's real visit is never dropped just because the Lead's coverage
  // table does not list that pairing.
  const full = deriveDoctor(lead, bound, doctorId);
  const doctor = deriveDoctor(scopeLeadCoverage(lead, span), bound, doctorId);
  const ownDivs = new Set([...visits, ...pobs, ...service, ...support].map((r) => r?.div).filter(Boolean));
  const extra = (full.divisions ?? []).filter((d) => ownDivs.has(d.key) && !doctor.divisions.some((x) => x.key === d.key));
  if (extra.length) {
    doctor.divisions = [...doctor.divisions, ...extra];
    doctor.divs = doctor.divisions.map((d) => d.key);
  }

  return {
    doctorId,
    loading: false,
    ready: true,
    fatal: null,
    scope: "user",
    // WHICH ERP answered. A UAT front end reading production is invisible
    // otherwise, and that is how permission fixes land on the wrong instance.
    endpoint: conn.endpointUrl,
    viewer,
    span,
    // False means we could not establish WHAT this reader covers, so every
    // scoped panel is empty on purpose — and the page says so.
    scoped: !!span?.resolved,
    canSeeService,
    doctor,
    support,
    service,
    pobs,
    visits,
    notes: inFy(deriveNotes(lead)),
    clinics: FEATURES.clinics ? deriveClinics(addressRaw, doctor) : EMPTY,
    pharmacies: FEATURES.pharmacies ? derivePharmacies(pobs) : EMPTY,
    errors,
    denied,
  };
}
