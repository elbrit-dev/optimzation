"use client";

/**
 * WHICH of a doctor's departments the signed-in reader may see — for the parts
 * of a doctor card that are not ERP rows: the division chips, the popup's
 * Coverage list and its department tabs.
 *
 * The history rows (visits, support, POB, service) are already narrowed by
 * `scopeRawRows` inside the doctor session. The frame around them was not: a
 * ZSM over CND and Elbrit Kerala opened a Coimbatore doctor and was offered
 * Vasco and Elbrit Coimbatore tabs and coverage rows that are nobody on his
 * team. This applies the same span to those.
 *
 * ONE lookup per credential, shared by every card on the page: a list of 200
 * doctors must not walk the reporting tree 200 times. A failed lookup is not
 * kept, so the next card to mount tries again.
 *
 * Fails CLOSED like the rest of the scoping: an unresolved reader sees no
 * other division's coverage, and head office (`unlimited`) sees all of it.
 */

import { useEffect, useState } from "react";
import { fetchOrg, makeConn } from "./source";
import { viewerFromOrg } from "./loadDoctor";
import { canSeeCoverage, resolveScopeFromOrg } from "./scope";

export { canSeeCoverage };

const cache = new Map();

export function getViewerScope({ erpUrl, authToken } = {}) {
  const key = `${erpUrl ?? ""}|${authToken ?? ""}`;
  if (!cache.has(key)) {
    // The same GraphQL org read the doctor detail makes (cached per token), so
    // the card, its popup and the detail page agree on who this reader is.
    const promise = Promise.resolve()
      .then(() => makeConn({ url: erpUrl, token: authToken }))
      .then(async (conn) => {
        const org = await fetchOrg(conn);
        return resolveScopeFromOrg(viewerFromOrg(org).row, org);
      })
      .catch(() => null);
    promise.then((scope) => { if (!scope?.resolved) cache.delete(key); });
    cache.set(key, promise);
  }
  return cache.get(key);
}

/**
 * `{ status, scope }` for a card. status:
 *   'none'    — no credential bound (e.g. Studio design time): nothing to scope
 *               against, so callers show the doctor as-is;
 *   'loading' — callers show NO foreign coverage until it lands;
 *   'ready'   — `scope` is the span, or null when it could not be resolved.
 */
export function useViewerScope(erpUrl, authToken) {
  const bound = !!(erpUrl && authToken);
  const [state, setState] = useState(() => ({ status: bound ? "loading" : "none", scope: null }));
  useEffect(() => {
    if (!bound) { setState({ status: "none", scope: null }); return undefined; }
    let live = true;
    setState((s) => (s.status === "ready" ? s : { status: "loading", scope: null }));
    getViewerScope({ erpUrl, authToken }).then((scope) => {
      if (live) setState({ status: "ready", scope });
    });
    return () => { live = false; };
  }, [bound, erpUrl, authToken]);
  return state;
}
