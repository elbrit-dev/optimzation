'use client';

/* The review's numbers — the "Elbrit SM Review" server script
 * (server/elbrit_sm_review.py), as the signed-in user. One call per root and
 * FY: every scope the page can show (a seat's subtree, a department) is a
 * subset of it, so moving around the tree never goes back to the ERP.
 *
 * Kept for two minutes per (ERP, token, root, fy, drafts), so a remount or a
 * second component on the canvas shares the answer instead of asking again. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';

const TTL = 2 * 60 * 1000;
const cache = new Map();

function authHeader(token) {
  const t = String(token ?? '').trim();
  return /^(token|bearer|basic)\s/i.test(t) ? t : `token ${t}`;
}

export async function fetchReview({ endpointUrl, token, root, fy, upto, drafts, parts, items, fetchImpl = fetch }) {
  const params = {};
  if (parts) params.parts = parts;
  if (items) params.items = items;
  if (upto) params.upto = upto;
  if (root) params.root = root;
  if (fy) params.fy = fy;
  if (drafts) params.drafts = '1';
  const res = await fetchImpl(`${new URL(endpointUrl).origin}/api/method/elbrit_sm_review?${new URLSearchParams(params)}`, {
    headers: { Authorization: authHeader(token), Accept: 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.exc_type || !json.message) {
    throw new Error(json.exc_type ? `${json.exc_type}${json.exception ? `: ${String(json.exception).slice(0, 200)}` : ''}` : `ERP request failed (${res.status})`);
  }
  return json.message;
}

/* → { data, error, loading, reload } */
export function useReview({ gqlEnvironment = 'ERP', gqlToken, root, fy, upto, drafts = false, parts, items, enabled = true }) {
  const [state, setState] = useState({ data: null, error: null, loading: false });
  const [attempt, setAttempt] = useState(0);
  const run = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!gqlToken?.trim()) {
      setState({ data: null, error: new Error('No ERP token — bind gqlToken to the signed-in user.'), loading: false });
      return undefined;
    }
    const id = ++run.current;
    const key = [gqlEnvironment, gqlToken, root ?? '', fy ?? '', upto ?? '', drafts ? 1 : 0, parts ?? '', items ?? ''].join('|');
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL && attempt === hit.attempt) {
      hit.promise.then(
        (data) => run.current === id && setState({ data, error: null, loading: false }),
        (error) => run.current === id && setState({ data: null, error, loading: false }),
      );
      return undefined;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    const promise = (async () => {
      const { endpointUrl } = await getEndpointConfigFromUrlKeyAsync(gqlEnvironment);
      if (!endpointUrl) throw new Error(`No endpoint registered for "${gqlEnvironment}".`);
      return fetchReview({ endpointUrl, token: gqlToken, root, fy, upto, drafts, parts, items });
    })();
    cache.set(key, { at: Date.now(), attempt, promise });
    promise.then(
      (data) => run.current === id && setState({ data, error: null, loading: false }),
      (error) => {
        cache.delete(key);
        if (run.current === id) setState({ data: null, error, loading: false });
      },
    );
    return undefined;
  }, [gqlEnvironment, gqlToken, root, fy, upto, drafts, parts, items, enabled, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
