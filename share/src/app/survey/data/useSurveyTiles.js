'use client';

/* The survey circles for Elbrit Ring Nav (18 Nov 2026). Ring Nav is the
 * home strip again — no "Surveys" wrapper, no child slot — and it draws the
 * survey circles itself: one per survey sent to the signed-in person, from
 * survey_my_list (as them), by the rules of ./tiles.js. A circle links to
 * <hrefBase>/<campaign>, the page with Survey Page on it.
 *
 * Same rhythm as the Ring Nav tiles: on mount, every `refreshEvery` ms and
 * back in the foreground (at most once a minute). The last answer per
 * environment + token is kept for the page's life, so a remount draws at
 * once. A failure is quiet — the strip just has no survey circles. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createSurveyApi } from '../api';
import { surveyTiles } from './tiles';
import { DEFAULT_REFRESH_MS } from '@/app/ring-nav/data/useErpTiles';

const MIN_WAKE_MS = 60 * 1000;
const last = new Map();

export function useSurveyTiles({ enabled, gqlEnvironment = 'ERP', gqlToken, today, refreshEvery, hrefBase = '/survey' }) {
  const key = `${gqlEnvironment}|${gqlToken ?? ''}`;
  const [list, setList] = useState(() => last.get(key) ?? null);
  const lastFetch = useRef(0);

  useEffect(() => {
    if (!enabled || !gqlToken?.trim()) return undefined;
    let stale = false;
    setList(last.get(key) ?? null);
    const api = createSurveyApi({ source: 'erp', gqlEnvironment, gqlToken });
    const load = async () => {
      lastFetch.current = Date.now();
      try {
        const res = await api.getMyList();
        last.set(key, res);
        if (!stale) setList(res);
      } catch (error) {
        console.warn('[RingNav] could not load the survey circles.', error);
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
  }, [enabled, key, gqlEnvironment, gqlToken, refreshEvery]);

  return useMemo(() => {
    if (!enabled || !list) return NONE;
    const day = today || list.today || new Date().toISOString().slice(0, 10);
    return surveyTiles(list, day, { hrefBase });
  }, [enabled, list, today, hrefBase]);
}

const NONE = [];
