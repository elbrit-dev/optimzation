'use client';

/* The Ring Nav tiles from ERP: the "Elbrit Ring Nav" server script
 * (server/elbrit_ring_nav.py) counts the signed-in user's work with the
 * ERP's own permissions and sends the tiles back READY TO DRAW — nothing is
 * counted or decided here.
 *
 * Fetched when enabled, then every `refreshEvery` ms (default 5 minutes)
 * and when the app comes back to the foreground (at most once a minute).
 * The last answer per environment + token + month is kept for the page's
 * life, so a remount (navigating back) draws at once instead of blank. A
 * failed fetch keeps the last tiles; with none yet it reports the error. */

import { useEffect, useRef, useState } from 'react';
import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';

export const DEFAULT_REFRESH_MS = 5 * 60 * 1000;
const MIN_WAKE_MS = 60 * 1000;
const last = new Map();

export function authHeader(token) {
  const t = String(token ?? '').trim();
  if (!t) return null;
  return /^(token|bearer|basic)\s/i.test(t) ? t : `token ${t}`;
}

export async function fetchErpTiles({ endpointUrl, token, month, today, fetchImpl = fetch }) {
  const params = {};
  if (month) params.month = month;
  if (today) params.today = today;
  const qs = Object.keys(params).length ? `?${new URLSearchParams(params)}` : '';
  const res = await fetchImpl(`${new URL(endpointUrl).origin}/api/method/elbrit_ring_nav${qs}`, {
    headers: { Authorization: authHeader(token), Accept: 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.exc_type) throw new Error(json.exc_type || `ERP request failed (${res.status})`);
  return Array.isArray(json.message?.items) ? json.message.items : [];
}

export function useErpTiles({ enabled, gqlEnvironment = 'ERP', gqlToken, month, today, refreshEvery }) {
  const key = `${gqlEnvironment}|${gqlToken ?? ''}|${month ?? ''}|${today ?? ''}`;
  const [state, setState] = useState(() => ({ items: last.get(key) ?? null, error: null }));
  const lastFetch = useRef(0);

  useEffect(() => {
    if (!enabled || !gqlToken?.trim()) return undefined;
    let stale = false;
    setState({ items: last.get(key) ?? null, error: null });
    const load = async () => {
      lastFetch.current = Date.now();
      try {
        const { endpointUrl } = await getEndpointConfigFromUrlKeyAsync(gqlEnvironment);
        if (!endpointUrl) throw new Error(`No endpoint registered for "${gqlEnvironment}".`);
        const items = await fetchErpTiles({ endpointUrl, token: gqlToken, month, today });
        last.set(key, items);
        if (!stale) setState({ items, error: null });
      } catch (error) {
        console.error('[RingNav] could not load the tiles from ERP.', error);
        if (!stale) setState((prev) => ({ items: prev.items, error }));
      }
    };
    load();
    const every = Number(refreshEvery) > 0 ? Math.max(Number(refreshEvery), 10000) : DEFAULT_REFRESH_MS;
    const id = setInterval(load, every);
    const wake = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > MIN_WAKE_MS) load();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      stale = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [enabled, key, gqlEnvironment, gqlToken, month, today, refreshEvery]);

  return state;
}
