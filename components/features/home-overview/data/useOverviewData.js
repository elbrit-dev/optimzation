import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchInvoiced, fetchPrimary, fetchPrimaryDistributors, fetchSecondary, fetchSupport, fetchViewer, fetchVisit, makeConn } from "./liveOverview";

/* Every section loads on its own and lands on its own, so the page fills in
 * as answers arrive instead of waiting for the slowest (Support, which reads
 * whole months of Doctor Support lines). Each entry is
 *   { status: "loading" | "ready" | "error", data?, error? }
 * and a ready section with data === null simply has nothing to show.
 *
 * There is no period to pass: each read picks this month to date, or last
 * month when this one has nothing yet (liveOverview's monthsToTry). */

function connFor(url, token) {
  try {
    return { conn: makeConn({ url, token }) };
  } catch (e) {
    return { error: e.message.replace("Support Report", "Home Overview") };
  }
}

export function useOverviewData({ url, token, today, enabled }) {
  const [state, setState] = useState({});
  const dayKey = today.toDateString();
  const { conn, error } = useMemo(() => (enabled ? connFor(url, token) : {}), [url, token, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!conn) {
      setState({ error });
      return undefined;
    }
    let alive = true;
    const run = (key, promise) =>
      promise
        .then((data) => alive && setState((s) => ({ ...s, [key]: { status: "ready", data } })))
        .catch((e) => {
          console.warn(`[home-overview] ${key} failed:`, e);
          if (alive) setState((s) => ({ ...s, [key]: { status: "error", error: e.message } }));
        });
    setState(Object.fromEntries(["viewer", "primary", "invoiced", "secondary", "visit", "support"].map((k) => [k, { status: "loading" }])));
    run("viewer", fetchViewer(conn));
    run("primary", fetchPrimary(conn, today));
    run("invoiced", fetchInvoiced(conn, today));
    run("secondary", fetchSecondary(conn, today));
    run("visit", fetchVisit(conn, today));
    run("support", fetchSupport(conn, today));
    return () => { alive = false; };
  }, [conn, error, dayKey, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Read on demand by the Primary team panel: its top distributors. */
  const loadDistributors = useCallback(
    (period, unit, level) => (conn ? fetchPrimaryDistributors(conn, period, unit, level) : Promise.resolve([])),
    [conn],
  );

  return { ...state, loadDistributors };
}
