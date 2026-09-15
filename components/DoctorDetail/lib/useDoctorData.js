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
  deriveServices, deriveSupport, deriveVisits, normalizeRow,
} from "./derive";

const EMPTY = Object.freeze([]);

export function useDoctorData(doctorInput, { erpUrl, authToken, erpTarget, pobLimit = 500 } = {}) {
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
      try {
        ({ scope } = await ensureErpAuth({ erpUrl, authToken, erpTarget }));
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

      const errors = {};
      const run = async (name, fn, fallback) => {
        try { return await fn(); } catch { errors[name] = true; return fallback; }
      };

      const vars = { name: doctorId, first: Math.max(1, Math.min(1000, Number(pobLimit) || 500)) };
      const [lead, supportRaw, serviceRaw, addressRaw, pobRaw, visitRaw] = await Promise.all([
        run("lead", () => fetchLead(vars), null),
        run("support", () => fetchSupport(doctorId), EMPTY),
        canSeeService ? run("service", () => fetchServices(doctorId), EMPTY) : Promise.resolve(EMPTY),
        run("addresses", () => fetchAddresses(doctorId), EMPTY),
        run("pobs", () => fetchPobs(vars), EMPTY),
        run("visits", () => fetchVisits(vars), EMPTY),
      ]);
      if (!live) return;

      // Wave two. Both lists are usually small and overlap heavily, so one
      // lookup covers the whole page.
      const index = await fetchEmployeeIndex({
        userIds: (pobRaw ?? []).map((q) => q.owner),
        employeeIds: (visitRaw ?? []).map(
          (v) => v?.custom_employee_id?.employee ?? v?.custom_employee_id__name
        ),
      }).catch(() => ({ byUser: new Map(), byId: new Map() }));
      if (!live) return;

      const doctor = deriveDoctor(lead, boundRef.current, doctorId);
      const pobs = derivePobs(pobRaw, index);

      setState({
        key,
        scope,
        viewer,
        canSeeService,
        doctor,
        support: deriveSupport(supportRaw),
        service: deriveServices(serviceRaw),
        pobs,
        visits: deriveVisits(visitRaw, index),
        notes: deriveNotes(lead),
        clinics: deriveClinics(addressRaw, doctor),
        pharmacies: derivePharmacies(pobs),
        errors,
        fatal: null,
      });
    })();

    return () => { live = false; };
  }, [doctorId, erpUrl, authToken, erpTarget, pobLimit, nonce]);

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
    viewer: current?.viewer ?? null,
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
    refresh,
  };
}
