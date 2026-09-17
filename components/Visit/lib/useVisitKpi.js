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
function loadDataset({ anchorDate, cutoffHour, gqlEnvironment, gqlToken }) {
  if (DATA_SOURCE === 'mock') return buildMockDataset({ anchorDate, cutoffHour });
  return fetchVisitDataset({ anchorDate, gqlEnvironment, gqlToken });
}

const EMPTY_DATASET = { team: [], rows: [], pob: [], today: '', viewerId: null };

export function useVisitKpi({
  scopeId,
  period = 'today',
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

    Promise.resolve(loadDataset({ anchorDate, cutoffHour, gqlEnvironment, gqlToken }))
      .then((dataset) => {
        if (requestRef.current === requestId) setState({ dataset, error: null, loading: false });
      })
      .catch((error) => {
        if (requestRef.current === requestId) setState({ dataset: null, error, loading: false });
      });
  }, [anchorDate, cutoffHour, gqlEnvironment, gqlToken]);

  return useMemo(() => {
    const { dataset, error, loading } = state;
    const { team, rows, pob, today, viewerId } = dataset ?? EMPTY_DATASET;

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
    const window = periodWindow(period, today);
    const ids = new Set(scopeTeam.map((m) => m.id));
    const inScope = forEmployees(rows, ids);
    const scoped = inPeriod(inScope, window);

    return {
      /* The full roster stays available so ScopeSelect can find the VIEWER's
         own manager record regardless of which subtree is currently
         selected -- `viewerId` may not even be inside `scopeTeam` once the
         viewer has drilled down to one of their own reports. */
      allTeam: team,
      team: scopeTeam,
      rows: scoped,
      /* Same scoping as `rows` -- forEmployees then inPeriod -- because a
         PobEntry is shaped with the same employeeId/plannedDate fields on
         purpose (see shape.js). */
      pob: inPeriod(forEmployees(pob, ids), window),
      /* Always today, whatever the period. Attendance is a right-now fact:
         computing it from a month of rows would count anyone who worked once
         in five days as "in the field". */
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
      loading,
      error,
      source: DATA_SOURCE,
    };
  }, [state, scopeId, period]);
}
