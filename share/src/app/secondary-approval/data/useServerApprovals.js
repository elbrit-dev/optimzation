'use client';

/* The Secondary Approval screen's data from the "Elbrit Secondary Approval"
 * server script (server/elbrit_secondary_approval.py), as the signed-in
 * user: a light summary of every month (for the switcher) and, for ONE
 * month, every visible tracker — no cap — its entry carrying only the
 * tracker's own seat's lines.
 *
 * Checked against the saved SecondaryApproval query on UAT: every tracker
 * with its entry link reads the same; the ones whose link is empty now come
 * with their lines, which the query lost. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';

function authHeader(token) {
  const t = String(token ?? '').trim();
  if (!t) return null;
  return /^(token|bearer|basic)\s/i.test(t) ? t : `token ${t}`;
}

export async function fetchServerApprovals({ endpointUrl, token, month, fetchImpl = fetch }) {
  const qs = month ? `?${new URLSearchParams({ month })}` : '';
  const res = await fetchImpl(`${new URL(endpointUrl).origin}/api/method/elbrit_secondary_approval${qs}`, {
    headers: { Authorization: authHeader(token), Accept: 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.exc_type || !json.message) throw new Error(json.exc_type || `ERP request failed (${res.status})`);
  return json.message;
}

/* → { data: { month, months: [{ month, waiting }], trackers } | null, error, reload } */
export function useServerApprovals({ enabled, gqlEnvironment = 'ERP', gqlToken, month }) {
  const [state, setState] = useState({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const run = useRef(0);

  useEffect(() => {
    if (!enabled || !gqlToken?.trim()) return undefined;
    const id = ++run.current;
    /* A reload keeps the month on screen until the new answer lands; a
       month switch clears it, so the old month is never shown as the new. */
    setState((prev) => ({ data: attempt && prev.data?.month === (month ?? prev.data?.month) ? prev.data : null, error: null }));
    (async () => {
      try {
        const { endpointUrl } = await getEndpointConfigFromUrlKeyAsync(gqlEnvironment);
        if (!endpointUrl) throw new Error(`No endpoint registered for "${gqlEnvironment}".`);
        const data = await fetchServerApprovals({ endpointUrl, token: gqlToken, month });
        if (run.current === id) setState({ data, error: null });
      } catch (error) {
        console.error('[secondary-approval] could not load from ERP.', error);
        if (run.current === id) setState((prev) => ({ data: prev.data, error }));
      }
    })();
    return undefined;
  }, [enabled, gqlEnvironment, gqlToken, month, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
