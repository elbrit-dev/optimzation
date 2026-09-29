'use client';

/* The caller's team and its month — the "Elbrit Entry Team" server script
 * (server/elbrit_entry_team.py), as the signed-in user. For the Entry
 * screen's team tree: who is under them and how far each has got. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';

function authHeader(token) {
  const t = String(token ?? '').trim();
  return /^(token|bearer|basic)\s/i.test(t) ? t : `token ${t}`;
}

export async function fetchServerTeam({ endpointUrl, token, month, task = 'secondary', fetchImpl = fetch }) {
  const params = { task };
  if (month) params.month = month;
  const res = await fetchImpl(`${new URL(endpointUrl).origin}/api/method/elbrit_entry_team?${new URLSearchParams(params)}`, {
    headers: { Authorization: authHeader(token), Accept: 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.exc_type || !json.message) throw new Error(json.exc_type || `ERP request failed (${res.status})`);
  return json.message;
}

/* → { data: { month, task, root, members } | null, error, reload } */
export function useServerTeam({ enabled, gqlEnvironment = 'ERP', gqlToken, month, task }) {
  const [state, setState] = useState({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const run = useRef(0);

  useEffect(() => {
    if (!enabled || !gqlToken?.trim()) return undefined;
    const id = ++run.current;
    (async () => {
      try {
        const { endpointUrl } = await getEndpointConfigFromUrlKeyAsync(gqlEnvironment);
        if (!endpointUrl) throw new Error(`No endpoint registered for "${gqlEnvironment}".`);
        const data = await fetchServerTeam({ endpointUrl, token: gqlToken, month, task });
        if (run.current === id) setState({ data, error: null });
      } catch (error) {
        /* A team is extra: an ERP without the script, or a caller with no
           Employee, simply has none. */
        if (run.current === id) setState({ data: null, error });
      }
    })();
    return undefined;
  }, [enabled, gqlEnvironment, gqlToken, month, task, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
