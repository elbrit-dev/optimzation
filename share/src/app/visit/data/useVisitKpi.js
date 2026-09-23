'use client';

/* THE SWAP POINT.
 *
 * Everything above this hook consumes `{ team, rows, today, asOf }` and has no
 * idea where they came from. Live now (see ./liveSource.js); set DATA_SOURCE
 * back to 'mock' to fall back to the deterministic fixture (dev harness /
 * Playwright baseline) without touching any component.
 *
 * Live query shapes, and the two ERP quirks that shaped them, are documented
 * in liveSource.js and PLAN.md §2/§4.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildMockDataset } from './mockData';
import { DEFAULT_GQL_ENVIRONMENT, fetchVisitDataset } from './liveSource';
import {
  asOfFrom,
  forEmployees,
  inPeriod,
  largestManagerRoot,
  periodWindow,
  subtreeOf,
} from './selectors';

export const DATA_SOURCE = 'live';

/* `anchorDate` and `cutoffHour` exist so the dev harness and the Playwright
   baseline can pin the clock. In the app they are omitted and the dataset
   follows the real date. `cutoffHour` only means anything for the mock (it
   truncates the synthesized day); the live source has no such knob -- ERPNext
   already only has visits that have actually happened.

   `gqlEnvironment` is the /tokens row name the live source resolves its
   ENDPOINT from (never its token). `gqlToken` is the signed-in user's own ERP
   credential and is REQUIRED live -- see liveSource.js's fetchVisitDataset,
   which throws rather than falling back to a shared one. The mock ignores
   both; there is nothing to point them at. */
function loadDataset({ anchorDate, cutoffHour, month, monthTo, gqlEnvironment, gqlToken, onWave }) {
  if (DATA_SOURCE === 'mock') return buildMockDataset({ anchorDate, cutoffHour, month, monthTo });
  return fetchVisitDataset({ anchorDate, month, monthTo, gqlEnvironment, gqlToken, onWave });
}

/* WHAT A DATASET WITH NO `ready` MEANS: all of it. The mock builds one
   synchronously and complete, and so did the live source before it learned to
   arrive in waves — neither should have to say so. */
const ALL_READY = { today: true, window: true, pob: true };

const EMPTY_DATASET = { team: [], rows: [], pob: [], today: '', viewerId: null, truncated: false };

export function useVisitKpi({
  scopeId,
  period = 'today',
  /* 'YYYY-MM', or undefined for the month today falls in. Unlike `period`
     and `scopeId` this is NOT a client-side slice: the dataset only ever
     holds one month, so changing it refetches. That is the whole reason it
     is a parameter of the hook and not of periodWindow alone. */
  month,
  monthTo,
  anchorDate,
  cutoffHour,
  gqlEnvironment = DEFAULT_GQL_ENVIRONMENT,
  gqlToken,
} = {}) {
  const [state, setState] = useState({ dataset: null, error: null, loading: true });

  /* Guards a stale response from landing after a newer request has already
     started -- anchorDate/cutoffHour/gqlEnvironment/gqlToken changing
     mid-flight (dev harness, or the playground sidebar) is the one case this
     can happen in. */
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = (requestRef.current += 1);
    setState((s) => ({ ...s, loading: true, error: null }));

    /* EACH WAVE LANDS AS IT ARRIVES. The first one carries today and the
       roster — enough to paint the view the screen opens on — and the month
       and the money follow into the same state. `loading` below is what keeps
       this honest: a wave that has not answered the question the reader is
       currently asking does not get rendered as if it had. */
    const onWave = (dataset) => {
      if (requestRef.current === requestId) setState({ dataset, error: null, loading: false });
    };

    Promise.resolve(loadDataset({ anchorDate, cutoffHour, month, monthTo, gqlEnvironment, gqlToken, onWave }))
      .then((dataset) => {
        if (requestRef.current === requestId) setState({ dataset, error: null, loading: false });
      })
      .catch((error) => {
        if (requestRef.current === requestId) setState({ dataset: null, error, loading: false });
      });
  }, [anchorDate, cutoffHour, month, monthTo, gqlEnvironment, gqlToken]);

  return useMemo(() => {
    const { dataset, error, loading } = state;
    const { team, rows, pob, today, viewerId, truncated } = dataset ?? EMPTY_DATASET;
    const ready = dataset?.ready ?? ALL_READY;

    /* STILL LOADING, AS FAR AS THIS READER IS CONCERNED. The dataset arrives
       in waves (see liveSource): today first, then the picked window, then
       the money. A month view rendered off the today-only wave would not look
       like a half-loaded screen — it would look like a month in which the
       team made fifty visits, which is a wrong answer rather than a missing
       one. So the screen keeps its existing "Loading…" until the wave that
       can answer the question the reader is actually asking has landed.

       Today's view never waits for the month, which is the entire point. */
    const waitingOnPeriod = period === 'month' ? !ready.window : !ready.today;

    /* Priority: an explicit picker choice, then whoever is actually signed in
       (resolved from the SAME token that fetched this dataset -- see
       liveSource.js's resolveViewerEmail), then the largest-subtree
       heuristic as a last resort for when the viewer can't be resolved to an
       Employee at all (a shared/service token, an email ERP has no match
       for). `largestManagerRoot`, not "whoever has no manager": a live roster
       can carry more than one reports_to-less-in-effect employee at once --
       orphaned test records, vacant-seat placeholders, a dangling manager
       reference -- and neither array order nor alphabetical order picks the
       real org over one of those. Falls back to any reports_to-less employee
       only if the roster has no recognised manager whatsoever. */
    const rootId = scopeId ?? viewerId ?? largestManagerRoot(team)?.id ?? team.find((m) => m.reportsTo == null)?.id;
    const scopeTeam = subtreeOf(team, rootId);
    const window = periodWindow(period, today, month, monthTo);
    const ids = new Set(scopeTeam.map((m) => m.id));
    const inScope = forEmployees(rows, ids);
    const scoped = inPeriod(inScope, window);

    return {
      /* The full roster stays available so ScopeSelect can find the VIEWER's
         own manager record regardless of which subtree is currently
         selected -- `viewerId` may not even be inside `scopeTeam` once the
         viewer has drilled down to one of their own reports. */
      allTeam: team,
      /* The window, UNSCOPED. `rows`/`todayRows` below are pre-narrowed to
         one subtree, which is the wrong pool for a caller whose selection
         is a UNION of branches -- a union is not a subtree, so there is no
         single rootId that could have produced it. Worse, a caller that
         narrowed from the scoped set would silently drop any pick outside
         it and look like a control that does nothing. Narrowing costs a
         filter either way; the wider pool is the one that can answer every
         question the picker can ask. */
      allRows: inPeriod(rows, window),
      allTodayRows: inPeriod(rows, { from: today, to: today }),
      allPob: inPeriod(pob ?? [], window),
      team: scopeTeam,
      rows: scoped,
      /* Same scoping as `rows` -- forEmployees then inPeriod -- because a
         PobEntry is shaped with the same employeeId/plannedDate fields on
         purpose (see shape.js). */
      /* `pob ?? []` because a dataset is allowed to have no POB at all --
         the mock fixture carries none, and a live token that cannot read
         Quotation returns none. Without the default this crashed on
         `undefined.filter` and took the whole screen with it, rather than
         showing the visit numbers it DID have and an em dash for the money. */
      pob: inPeriod(forEmployees(pob ?? [], ids), window),
      /* Today's slice, kept separate from the window's whatever the period
         is showing. The DAY view's attendance reads this one; the month
         view's reads the window (see VisitReport). Both exist because the
         question genuinely differs — "who is out right now" is not "who
         reported at some point in August" — and neither can be derived
         from the other. */
      todayRows: inPeriod(inScope, { from: today, to: today }),
      root: scopeTeam.find((m) => m.id === rootId) ?? null,
      /* The signed-in viewer's OWN id, separate from `root` (the currently
         SELECTED scope, which changes as they drill down). ScopeSelect uses
         this -- not `root` -- to restrict the picker to the viewer's own
         subtree, so drilling into a report's numbers never widens what they
         are allowed to navigate back out to. */
      viewerId,
      today,
      window,
      asOf: asOfFrom(scoped),
      loading: loading || waitingOnPeriod,
      /* WHICH PARTS ARE IN, for the one card that can say so itself. The money
         cards render an amount, and an amount is a claim — ₹0 while the
         quotations are still in flight is a wrong one — so KpiGrid shows them
         as pending rather than as zero until `pob` is true. Everything else
         reads `loading` and never sees this. */
      ready,
      error,
      /* The source could not return every row in the window. Not an
         error -- the numbers rendered are real, they are just not all of
         them -- so it rides alongside the data rather than replacing it,
         and the screen says so above the cards.

         An OBJECT, `{ visits, pob }`, because the two overflow at very
         different volumes and the advice for each is different. Normalised
         here so the mock (which never truncates) and an older boolean both
         still read correctly. */
      truncated: {
        visits: Boolean(truncated === true || truncated?.visits),
        pob: Boolean(truncated?.pob),
      },
      source: DATA_SOURCE,
    };
  }, [state, scopeId, period, month, monthTo]);
}
