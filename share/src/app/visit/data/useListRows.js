'use client';

import { useEffect, useState } from 'react';

/* The visits behind ONE list, fetched when it opens — the report's numbers
 * are server-side counts (see liveSource.fetchVisitCounts), so the Dr plan
 * and the hour sheet ask for their own rows (liveSource.loadVisitRows).
 *
 * `request` null means the list is closed: nothing is fetched and the last
 * answer is dropped, so reopening never shows another list's rows first. */
export function useListRows(loadRows, request) {
  const key = request ? JSON.stringify(request) : null;
  const [state, setState] = useState({ key: null, rows: [], loading: false, error: null });

  useEffect(() => {
    if (!key || typeof loadRows !== 'function') {
      setState({ key: null, rows: [], loading: false, error: null });
      return undefined;
    }
    let stale = false;
    setState({ key, rows: [], loading: true, error: null });
    loadRows(JSON.parse(key))
      .then((rows) => !stale && setState({ key, rows, loading: false, error: null }))
      .catch((error) => {
        console.error('[visit] could not load the list from ERP.', error);
        if (!stale) setState({ key, rows: [], loading: false, error });
      });
    return () => {
      stale = true;
    };
  }, [key, loadRows]);

  return state.key === key ? state : { key, rows: [], loading: Boolean(key), error: null };
}
