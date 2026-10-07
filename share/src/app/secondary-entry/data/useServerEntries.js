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
import { coveringLabel } from './shape';

function authHeader(token) {
  const t = String(token ?? '').trim();
  if (!t) return null;
  return /^(token|bearer|basic)\s/i.test(t) ? t : `token ${t}`;
}

/* `method` is the task's server script (task.entryMethod) — Secondary's by default. */
/* AN ANSWER IS CHECKED AGAINST ITS QUESTION. With several requests in flight
   this ERP can hand one request another's answer (seen on the Support and
   Visit reads): a team seat's rows coming back as another seat's would show
   its stockists under the wrong seat, missing their own approval (a Rework
   read as submitted). So an answer must name the seat and month asked for;
   one that does not is asked again, and after ATTEMPTS is an error rather
   than a wrong list. */
const ATTEMPTS = 3;
export async function fetchServerEntries({ endpointUrl, token, month, seat, method = 'elbrit_secondary_entry', fetchImpl = fetch, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const params = {};
  if (month) params.month = month;
  if (seat) params.seat = seat;
  const qs = Object.keys(params).length ? `?${new URLSearchParams(params)}` : '';
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetchImpl(`${new URL(endpointUrl).origin}/api/method/${method}${qs}`, {
      headers: { Authorization: authHeader(token), Accept: 'application/json' },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.exc_type || !json.message) throw new Error(json.exc_type || `ERP request failed (${res.status})`);
    const m = json.message;
    const wrong = (seat && m.seat && m.seat !== seat) || (month && m.month && m.month !== month);
    if (!wrong) return m;
    if (attempt >= ATTEMPTS) throw new Error(`ERP answered for ${m.seat ?? 'another seat'} / ${m.month ?? '?'} when asked for ${seat ?? 'your seat'} / ${month ?? '?'}. Please reload.`);
    await wait(300 * attempt);
  }
}

/* run(item) over items, at most `limit` at a time, results in order. */
async function inPool(items, limit, run) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await run(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/* COVERED SEATS IN "MY ENTRIES". The server says which vacant seats the
   caller covers (`covers`: their nearest live manager is the caller). Their
   rows are fetched too (the server returns a covered seat's rows when asked
   with `seat`) and added to the caller's own, each marked:
     name      "<record>::<seat>" — unique, as two covered seats can share a stockist
     docName   the record's real name, for saving
     covering  { seat, holder, hq } — whose lines these are
   Products are the union of every seat's. The covered seats' `addable`
   joins the caller's too, so "Add doctor" in My entries offers their
   parties, each named "<party>::<seat>" (`code` the party, `seat` whose
   lines it gets; the screen sends each seat's to the add script under it).
   AN EXTRA USER'S TEAM comes in the same way: the server's `enters` (every
   live seat under theirs) join `covers` marked `team`, so My entries holds
   the whole team's stockists / doctors as the nav tile counts them — each marked "For
   <holder>" instead of covering. Its parties join "Add" too, marked
   "For <holder>": the add scripts take an extra user's team seat as they
   take a covered vacant one.
   Pure, for the test. */
export function mergeCovered(own, covered) {
  if (!covered.length) return own;
  const products = [...(own.products ?? [])];
  const seen = new Set(products.map((p) => p.name));
  const entries = [...(own.entries ?? [])];
  let addable = Array.isArray(own.addable) ? [...own.addable] : own.addable;
  for (const { cover, data } of covered) {
    if (Array.isArray(addable) && Array.isArray(data?.addable)) {
      for (const a of data.addable) {
        addable.push({
          ...a,
          name: `${a.name}::${cover.seat}`,
          code: a.name,
          seat: cover.seat,
          note: [coveringLabel(cover), a.note].filter(Boolean).join(' · '),
        });
      }
    }
    for (const p of data?.products ?? []) {
      if (!seen.has(p.name)) {
        seen.add(p.name);
        products.push(p);
      }
    }
    for (const row of data?.entries ?? []) {
      entries.push({ ...row, name: `${row.name}::${cover.seat}`, docName: row.name, covering: { seat: cover.seat, holder: cover.holder, hq: cover.hq, ...(cover.team ? { team: true } : {}) } });
    }
  }
  if (Array.isArray(addable)) {
    addable.sort((a, b) => String(a.customer_name ?? '').localeCompare(String(b.customer_name ?? '')));
  }
  return { ...own, entries, products, addable };
}

/* → { data: { seat, month, entries, products, covers } | null, error, reload }
   `withCovers`: add the covered seats' rows (the caller's own view). */
export function useServerEntries({ enabled, gqlEnvironment = 'ERP', gqlToken, month, seat, method, withCovers = false }) {
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
        const own = await fetchServerEntries({ endpointUrl, token: gqlToken, month, seat, method });
        const covers = withCovers ? [...(own.covers ?? []), ...(own.enters ?? []).map((e) => ({ ...e, team: true }))] : [];
        /* A few at a time: a team can be a dozen seats or more (see fetchServerEntries). */
        const covered = await inPool(covers, 4, async (cover) => ({ cover, data: await fetchServerEntries({ endpointUrl, token: gqlToken, month, seat: cover.seat, method }) }));
        const data = mergeCovered(own, covered);
        if (run.current === id) setState({ data, error: null });
      } catch (error) {
        console.error('[secondary-entry] could not load from ERP.', error);
        if (run.current === id) setState((prev) => ({ data: prev.data, error }));
      }
    })();
    return undefined;
  }, [enabled, gqlEnvironment, gqlToken, month, seat, method, attempt, withCovers]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
