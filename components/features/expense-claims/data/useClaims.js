import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_TYPES, canUseClaims, fetchAdvances, fetchClaimTypes, fetchClaims, fetchMe, invalidateClaims, makeConn } from "./claimsApi";

/* Who is signed in, their claims and the claim types -- one read each, shared
   through erpClient's per-token cache so the home strip, the Claims page and
   the profile tab never fetch the same thing twice in a session.
 *
 * "hidden": the person is not one claims is open to (canUseClaims) -- their
 * claims are never read, and every claims surface renders nothing.
 *
 *   { status: "idle" | "loading" | "ready" | "hidden" | "error", conn, me, claims, advances, types, typeInfo, error, reload } */
export function useClaims({ url, token, employee, enabled = true }) {
  const { conn, error: connError } = useMemo(() => {
    if (!enabled || !url || !token) return {};
    try {
      return { conn: makeConn({ url, token }) };
    } catch (e) {
      return { error: e.message };
    }
  }, [url, token, enabled]);

  const [state, setState] = useState({ status: "idle" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!conn) {
      setState(connError ? { status: "error", error: connError } : { status: "idle" });
      return undefined;
    }
    let alive = true;
    setState((s) => ({ ...s, status: s.claims ? "ready" : "loading", refreshing: !!s.claims }));
    (async () => {
      try {
        const me = await fetchMe(conn, employee);
        if (!canUseClaims(me)) {
          if (alive) setState({ status: "hidden", me });
          return;
        }
        const [claims, typeInfo, advances] = await Promise.all([
          fetchClaims(conn, me.id),
          fetchClaimTypes(conn).catch(() => DEFAULT_TYPES),
          // Cash paid to them (Employee Advance); unreadable = none, not a dead page.
          fetchAdvances(conn, me.id).catch((e) => { console.warn("[expense-claims] advances unreadable:", e.message); return []; }),
        ]);
        // types: names (filters, quick add); typeInfo: with sub types (the form).
        if (alive) setState({ status: "ready", me, claims, advances, types: typeInfo.map((t) => t.name), typeInfo });
      } catch (e) {
        console.warn("[expense-claims] load failed:", e);
        if (alive) setState({ status: "error", error: e.message });
      }
    })();
    return () => { alive = false; };
  }, [conn, connError, employee, tick]);

  const reload = useCallback(() => {
    if (conn && state.me) invalidateClaims(conn, state.me.id);
    setTick((t) => t + 1);
  }, [conn, state.me]);

  return { ...state, conn, reload };
}

/* Only whether claims are open to the signed-in person: true once their
   Employee record says so, false while it is being read or when it cannot be,
   so a claims tab never flashes in for someone it is not meant for. Shares
   fetchMe's cache with useClaims. */
export function useClaimsAccess({ url, token, employee }) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    if (!url || !token) { setAllowed(false); return undefined; }
    let alive = true;
    (async () => {
      try {
        const me = await fetchMe(makeConn({ url, token }), employee);
        if (alive) setAllowed(canUseClaims(me));
      } catch {
        if (alive) setAllowed(false);
      }
    })();
    return () => { alive = false; };
  }, [url, token, employee]);
  return allowed;
}
