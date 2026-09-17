"use client";

/**
 * What every doctor card calls to get its numbers.
 *
 * `useDoctorConsole(props)` resolves the shared session (see `session.js`),
 * subscribes to it, and returns the finished snapshot — or null when no card on
 * the page has been given a doctor yet.
 *
 * A card that names a doctor OWNS a session. A card that does not JOINS the
 * most recent one. That is what lets a page bind the doctor once, on the hero,
 * and drop the other four cards with nothing bound at all.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { readDoctorInput } from "../DoctorDetail/lib/loadDoctor";
import { parseDepartments } from "../DoctorDetail/lib/console";
import {
  getRegistryVersion, getSession, latestSession, sessionKey, subscribeToRegistry,
} from "./session";

/**
 * Apply a prop as a DEFAULT, and again whenever the PROP changes — never on an
 * unrelated re-render, which would fight the reader for the control.
 */
function useWhenPropChanges(value, apply) {
  const prev = useRef(value);
  const fn = useRef(apply);
  fn.current = apply;
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    fn.current(value);
  }, [value]);
}

export function useDoctorConsole({
  doctor,
  erpUrl,
  authToken,
  employee,
  roleProfile,
  pobLimit,
  department,
  period,
  valueFormat,
} = {}) {
  const { doctorId } = readDoctorInput(doctor);

  // Re-resolve when a session appears or goes away, so a card placed ABOVE the
  // one that binds the doctor still attaches once that one mounts.
  const version = useSyncExternalStore(subscribeToRegistry, getRegistryVersion, () => 0);

  const key = doctorId
    ? sessionKey({ doctorId, erpUrl, authToken, employee, roleProfile, pobLimit })
    : null;

  // The bound doctor row is read through a ref, never as a dependency: a
  // Plasmic page commonly binds an inline object, which is a fresh identity on
  // every render, and depending on it would rebuild the session forever.
  const doctorRef = useRef(doctor);
  doctorRef.current = doctor;

  const session = useMemo(() => {
    if (key) {
      return getSession(key, {
        doctor: doctorRef.current,
        erpUrl, authToken, employee, roleProfile, pobLimit,
        department, period, valueFormat,
      });
    }
    // eslint-disable-next-line no-unused-expressions
    version;
    return latestSession();
    // `version` is a dependency on purpose — it is how a joiner notices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, erpUrl, authToken, employee, roleProfile, pobLimit]);

  // Reading starts on the client only. On the server the snapshot is the empty
  // state, which is what the placeholder hero is drawn from.
  useEffect(() => {
    if (!session) return undefined;
    session.refs += 1;
    session.start();
    return () => { session.refs -= 1; };
  }, [session]);

  // The three filter props are defaults, not controls: they set where the page
  // opens, and the reader may then change any of them.
  //
  // `department` is watched by VALUE rather than identity: it is a LIST now, and
  // a Studio page that binds an inline array hands over a fresh one every
  // render — watching the identity would re-apply the default forever and the
  // reader could never change the department at all.
  const departmentKey = parseDepartments(department).join("");
  useWhenPropChanges(departmentKey, () => session?.on.setDivs(department));
  useWhenPropChanges(period, (v) => session?.on.setRangeMode(v));
  useWhenPropChanges(valueFormat, (v) => session?.on.setNumShort(v === "short"));

  const subscribe = useCallback(
    (fn) => (session ? session.subscribe(fn) : () => {}),
    [session]
  );
  const read = useCallback(() => (session ? session.getSnapshot() : null), [session]);

  return useSyncExternalStore(subscribe, read, read);
}

export default useDoctorConsole;
