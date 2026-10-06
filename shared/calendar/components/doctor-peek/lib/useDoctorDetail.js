"use client";

/**
 * The doctor detail's data, handled the way the Support Report and Home
 * Overview handle theirs: ONE hook, owned by ONE component.
 *
 *   connection  `url` + `token` props (the signed-in user's own ERP GraphQL
 *               endpoint and token) become a `conn` via the Support Report's
 *               `makeConn`. `erpUrl` / `authToken` are still read, so a page
 *               bound before the rename keeps working.
 *   reads       GraphQL only (lib/source.js), fired together, each one failing
 *               on its own into `errors` / `denied` — see lib/loadDoctor.js.
 *   state       plain React state: the rows, and the reader's choices (period,
 *               departments, open panels). No module-level store — there is no
 *               second component to share it with any more.
 *   errors      a bad connection is a `fatal` message, not a throw; a stale
 *               answer (doctor changed, component gone) is dropped by a
 *               generation guard; `refresh` asks again.
 *
 * Returns the `buildConsole` object every section of the page renders from,
 * or null when no doctor is bound.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { emptyData, loadDoctorData, readDoctorInput } from "./loadDoctor";
import { makeConn } from "./source";
import { appendLeadNote, ensureErpAuth } from "./erp";
import { PERIODS, buildConsole, initialUi, parseDepartments } from "./console";
import { makeActions } from "./actions";
// Sample mode is not carried over to the calendar copy: it always reads ERP.
const SAMPLE_DOCTOR_ID = null;
const sampleConsoleData = () => null;

export function useDoctorDetail({
  doctor,
  url,
  token,
  erpUrl,
  authToken,
  employee,
  roleProfile,
  pobLimit,
  department,
  period,
  valueFormat,
  sampleData,
} = {}) {
  const sample = false;
  const endpoint = url || erpUrl;
  const credential = token || authToken;

  const input = readDoctorInput(doctor);
  const doctorId = sample ? SAMPLE_DOCTOR_ID : input.doctorId;
  // The bound row is only a first paint; re-keying on its identity would
  // re-read ERP every time a page re-renders the list it came from.
  const boundRef = useRef(input.bound);
  boundRef.current = input.bound;

  const connResult = useMemo(() => {
    if (sample) return {};
    try {
      return { conn: makeConn({ url: endpoint, token: credential }) };
    } catch (e) {
      return { error: e.message.replace("Support Report", "Doctor detail") };
    }
  }, [sample, endpoint, credential]);
  const { conn } = connResult;

  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState(() => (sample ? sampleConsoleData() : emptyData(doctorId, input.bound)));
  const gen = useRef(0);

  useEffect(() => {
    const g = ++gen.current;
    // Sample mode makes no request at all: the design has to be reviewable on
    // a page with no credential bound.
    if (sample) { setData(sampleConsoleData()); return undefined; }
    if (!doctorId) { setData(emptyData(null, null)); return undefined; }
    if (!conn) {
      setData({ ...emptyData(doctorId, boundRef.current), loading: false, fatal: connResult.error });
      return undefined;
    }
    setData((d) => (d.doctorId === doctorId ? { ...d, loading: true } : emptyData(doctorId, boundRef.current)));
    const stale = () => g !== gen.current;
    loadDoctorData({ conn, doctorId, bound: boundRef.current, employee, roleProfile, pobLimit }, stale)
      .then((next) => { if (next && !stale()) setData(next); })
      .catch((error) => {
        if (stale()) return;
        console.warn("[doctor-detail] load failed:", error);
        setData({
          ...emptyData(doctorId, boundRef.current),
          loading: false,
          fatal: error?.message ?? "Could not read this doctor from ERP.",
        });
      });
    return () => { gen.current += 1; };
  }, [sample, doctorId, conn, connResult.error, employee, roleProfile, pobLimit, attempt]);

  /* ---- the reader's choices ---- */
  const [ui, setUi] = useState(() => initialUi({ department, period, valueFormat }));
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const dataRef = useRef(data);
  dataRef.current = data;

  // A Studio prop that changes after mount moves the page, same as a tap would.
  const deptKey = parseDepartments(department).join("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setUi((u) => ({ ...u, divs: parseDepartments(department), sel: null, chartPage: 0 }));
  }, [deptKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setUi((u) => ({ ...u, rangeMode: { ...u.rangeMode, mode: PERIODS.has(period) ? period : "fy" }, sel: null }));
  }, [period]);
  useEffect(() => { setUi((u) => ({ ...u, numShort: valueFormat === "short" })); }, [valueFormat]);

  const refresh = useCallback(() => setAttempt((a) => a + 1), []);
  const panel = useRef({ node: null }).current;

  const on = useMemo(() => makeActions({
    patch: (next) => setUi((u) => {
      const delta = typeof next === "function" ? next(u) : next;
      return delta ? { ...u, ...delta } : u;
    }),
    getUi: () => uiRef.current,
    getData: () => dataRef.current,
    doctorId: () => dataRef.current.doctorId,
    refresh,
    // The note is the page's one write. It goes through the same user token.
    writeNote: async (id, note) => {
      await ensureErpAuth({ erpUrl: endpoint, authToken: credential });
      return appendLeadNote(id, note);
    },
    sample,
    panel,
  }), [refresh, endpoint, credential, sample, panel]);

  // A missing or malformed credential is known from the props alone, so it is
  // named on the very first paint instead of after an effect runs.
  const shown = useMemo(
    () => (!sample && doctorId && !conn
      ? { ...emptyData(doctorId, boundRef.current), loading: false, fatal: connResult.error }
      : data),
    [sample, doctorId, conn, connResult.error, data],
  );

  return useMemo(() => (doctorId ? buildConsole(shown, ui, on) : null), [doctorId, shown, ui, on]);
}

export default useDoctorDetail;
