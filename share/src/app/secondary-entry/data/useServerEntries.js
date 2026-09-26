'use client';

/* The Secondary Entry screen's data from the "Elbrit Secondary Entry"
 * server script (server/elbrit_secondary_entry.py): every entry the
 * signed-in user may see for the month — no cap — each with only their
 * seat's lines, the other seats' products as names, and the product list
 * for the picker. One call, as the user; the ERP's permissions decide.
 *
 * Checked against the saved SecondaryEntry query on UAT: the screen reads
 * the same thing, entry for entry (July, 343 entries: 9.2 MB / 7 s there,
 * 0.5 MB / 1.4 s here). */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';

function authHeader(token) {
  const t = String(token ?? '').trim();
  if (!t) return null;
  return /^(token|bearer|basic)\s/i.test(t) ? t : `token ${t}`;
}

/* `method` is the task's server script (task.entryMethod) — Secondary's by default. */
export async function fetchServerEntries({ endpointUrl, token, month, seat, method = 'elbrit_secondary_entry', fetchImpl = fetch }) {
  const params = {};
  if (month) params.month = month;
  if (seat) params.seat = seat;
  const qs = Object.keys(params).length ? `?${new URLSearchParams(params)}` : '';
  const res = await fetchImpl(`${new URL(endpointUrl).origin}/api/method/${method}${qs}`, {
    headers: { Authorization: authHeader(token), Accept: 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.exc_type || !json.message) throw new Error(json.exc_type || `ERP request failed (${res.status})`);
  return json.message;
}

/* → { data: { seat, month, entries, products } | null, error, reload } */
export function useServerEntries({ enabled, gqlEnvironment = 'ERP', gqlToken, month, seat, method }) {
  const [state, setState] = useState({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const run = useRef(0);

  useEffect(() => {
    if (!enabled || !gqlToken?.trim()) return undefined;
    const id = ++run.current;
    setState((prev) => ({ data: attempt ? prev.data : null, error: null }));
    (async () => {
      try {
        const { endpointUrl } = await getEndpointConfigFromUrlKeyAsync(gqlEnvironment);
        if (!endpointUrl) throw new Error(`No endpoint registered for "${gqlEnvironment}".`);
        const data = await fetchServerEntries({ endpointUrl, token: gqlToken, month, seat, method });
        if (run.current === id) setState({ data, error: null });
      } catch (error) {
        console.error('[secondary-entry] could not load from ERP.', error);
        if (run.current === id) setState((prev) => ({ data: prev.data, error }));
      }
    })();
    return undefined;
  }, [enabled, gqlEnvironment, gqlToken, month, seat, method, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
