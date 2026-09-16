"use client";

/**
 * Every ERP read the page makes, in two waves.
 *
 * Wave one is the six independent reads, fired together. Wave two is the
 * employee lookup, which cannot start until wave one has told us WHICH people
 * to look up — POBs name a login and visits name an employee id, and both have
 * to become a role and a department before the table or the coverage ring mean
 * anything.
 *
 * Nothing is bounded by the selected period. The chart's window is the last
 * twelve months of anything on record, so clipping the fetch to the period
 * would empty the chart the moment someone picked "This month". A doctor's
 * whole history is a few hundred rows at the outside, so it is read whole and
 * filtered in the browser.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ensureErpAuth, fetchEmployeeIndex, resolveViewer } from "./erp";
import {
  fetchAddresses, fetchLead, fetchPobs, fetchServices, fetchSupport, fetchVisits,
} from "./queries";
import {
  deriveClinics, deriveDoctor, deriveNotes, derivePharmacies, derivePobs,
  deriveServices, deriveSupport, deriveVisits, eventOwnerIndex, normalizeRow,
} from "./derive";
import { resolveScope, scopeRawRows } from "./scope";

const EMPTY = Object.freeze([]);

export function useDoctorData(doctorInput, { erpUrl, authToken, employee, roleProfile, pobLimit = 500 } = {}) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState(null);

  const bound = useMemo(
    () => (typeof doctorInput === "string" ? null : normalizeRow(doctorInput)),
    [doctorInput]
  );
  const doctorId = useMemo(() => {
    if (typeof doctorInput === "string") return doctorInput.trim() || null;
    return bound?.name ?? bound?.id ?? null;
  }, [doctorInput, bound]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // The bound row is read through a ref, NEVER as an effect dependency. A
  // Plasmic page commonly binds an inline object, which is a fresh identity on
  // every render — depending on it would re-fire all six reads every render and
  // never settle.
  const boundRef = useRef(bound);
  boundRef.current = bound;

  useEffect(() => {
    if (!doctorId) { setState(null); return undefined; }
    let live = true;
    const key = doctorId + "#" + nonce;

    (async () => {
      let scope = "user";
      let endpoint = null;
      try {
        ({ scope, endpoint } = await ensureErpAuth({ erpUrl, authToken }));
      } catch (error) {
        if (live) setState({ key, fatal: error?.message ?? "No ERP endpoint is configured.", errors: {} });
        return;
      }

      // Who is reading. Resolved before anything else so a failure here cannot
      // be mistaken for a data failure, and so the service reads below are
      // never even issued for a viewer who may not see them.
      const viewer = await resolveViewer().catch(() => null);
      if (!live) return;
      const canSeeService = !!viewer?.canSeeService;

      // WHAT they may count, not just who they are. The span walk is a handful
      // of Employee reads and is issued alongside the doctor reads below rather
      // than before them, because nothing can be filtered until both have
      // landed anyway.
      const scopePromise = resolveScope(viewer?.row ?? null, { employee, roleProfile }).catch(() => null);

      // A read can fail two ways and they must not be reported the same. 403
      // means this user's ERP role cannot see that doctype — not a bug, and not
      // something a Retry button will ever fix.
      const errors = {};
      const denied = {};
      const run = async (name, fn, fallback) => {
        try {
          return await fn();
        } catch (error) {
          if (error?.denied) denied[name] = true; else errors[name] = true;
          return fallback;
        }
      };

      const vars = { name: doctorId, first: Math.max(1, Math.min(1000, Number(pobLimit) || 500)) };
      const [lead, supportAll, serviceAll, addressRaw, pobAll, visitAll, span] = await Promise.all([
        run("lead", () => fetchLead(vars), null),
        run("support", () => fetchSupport(doctorId), EMPTY),
        canSeeService ? run("service", () => fetchServices(doctorId), EMPTY) : Promise.resolve(EMPTY),
        run("addresses", () => fetchAddresses(doctorId), EMPTY),
        run("pobs", () => fetchPobs(vars), EMPTY),
        run("visits", () => fetchVisits(vars), EMPTY),
        scopePromise,
      ]);
      if (!live) return;

      // Narrowed HERE, on the raw rows, so every total and every chart series
      // below is computed over the reader's own rows and nothing else.
      const { support: supportRaw, service: serviceRaw, pobs: pobRaw, visits: visitRaw } =
        scopeRawRows(span, {
          support: supportAll,
          service: serviceAll,
          pobs: pobAll,
          visits: visitAll,
        });

      // Wave two: turn employee ids into roles and departments. Only the VISIT
      // rows name an employee — a Quotation names none, which is why POBs are
      // attributed through the visit they were raised on rather than through
      // whoever saved them.
      const index = await fetchEmployeeIndex({
        employeeIds: (visitRaw ?? []).map((v) => (
          typeof v?.custom_employee_id === "string"
            ? v.custom_employee_id
            : v?.custom_employee_id?.employee ?? v?.custom_employee_id__name
        )),
      }).catch(() => ({ byId: new Map() }));
      if (!live) return;

      const doctor = deriveDoctor(lead, boundRef.current, doctorId);
      const visits = deriveVisits(visitRaw, index);
      const pobs = derivePobs(pobRaw, eventOwnerIndex(visits));

      setState({
        key,
        scope,
        // WHICH ERP answered. Kept so the page can name it: a UAT front end
        // reading production is invisible otherwise, and that is exactly how
        // permission fixes get applied to the wrong instance.
        endpoint,
        viewer,
        span,
        // False means we could not establish WHAT this reader covers, so every
        // scoped panel above is empty on purpose. The page must say so —
        // otherwise it reads as a doctor with no history.
        scoped: !!span?.resolved,
        canSeeService,
        doctor,
        support: deriveSupport(supportRaw),
        service: deriveServices(serviceRaw),
        pobs,
        visits,
        notes: deriveNotes(lead),
        clinics: deriveClinics(addressRaw, doctor),
        pharmacies: derivePharmacies(pobs),
        errors,
        denied,
        fatal: null,
      });
    })();

    return () => { live = false; };
  }, [doctorId, erpUrl, authToken, employee, roleProfile, pobLimit, nonce]);

  // Never paint the previous doctor's rows during the render before the effect
  // for a new one has run.
  const current = state?.key === doctorId + "#" + nonce ? state : null;

  const placeholder = useMemo(
    () => (doctorId ? deriveDoctor(null, bound, doctorId) : null),
    [doctorId, bound]
  );

  return {
    doctorId,
    loading: !!doctorId && !current,
    ready: !!current && !current.fatal,
    fatal: current?.fatal ?? null,
    scope: current?.scope ?? "user",
    endpoint: current?.endpoint ?? null,
    viewer: current?.viewer ?? null,
    span: current?.span ?? null,
    scoped: current?.scoped ?? false,
    canSeeService: current?.canSeeService ?? false,
    // The bound row paints the hero before any read lands.
    doctor: current?.doctor ?? placeholder,
    support: current?.support ?? EMPTY,
    service: current?.service ?? EMPTY,
    pobs: current?.pobs ?? EMPTY,
    visits: current?.visits ?? EMPTY,
    notes: current?.notes ?? EMPTY,
    clinics: current?.clinics ?? EMPTY,
    pharmacies: current?.pharmacies ?? EMPTY,
    errors: current?.errors ?? {},
    denied: current?.denied ?? {},
    refresh,
  };
}
