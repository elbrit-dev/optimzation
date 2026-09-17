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
   endpoint and token from, and `gqlTokenOverride` -- when non-empty -- is
   used in place of that row's own token, against the same endpoint. See
   liveSource.js. The mock ignores both; there is nothing to point them at. */
function loadDataset({ anchorDate, cutoffHour, gqlEnvironment, gqlTokenOverride }) {
  if (DATA_SOURCE === 'mock') return buildMockDataset({ anchorDate, cutoffHour });
  return fetchVisitDataset({ anchorDate, gqlEnvironment, gqlTokenOverride });
}

const EMPTY_DATASET = { team: [], rows: [], pob: [], today: '' };

export function useVisitKpi({
  scopeId,
  period = 'today',
  anchorDate,
  cutoffHour,
  gqlEnvironment = DEFAULT_GQL_ENVIRONMENT,
  gqlTokenOverride,
} = {}) {
  const [state, setState] = useState({ dataset: null, error: null, loading: true });

  /* Guards a stale response from landing after a newer request has already
     started -- anchorDate/cutoffHour/gqlEnvironment/gqlTokenOverride changing
     mid-flight (dev harness, or the playground sidebar) is the one case this
     can happen in. */
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = (requestRef.current += 1);
    setState((s) => ({ ...s, loading: true, error: null }));

    Promise.resolve(loadDataset({ anchorDate, cutoffHour, gqlEnvironment, gqlTokenOverride }))
      .then((dataset) => {
        if (requestRef.current === requestId) setState({ dataset, error: null, loading: false });
      })
      .catch((error) => {
        if (requestRef.current === requestId) setState({ dataset: null, error, loading: false });
      });
  }, [anchorDate, cutoffHour, gqlEnvironment, gqlTokenOverride]);

  return useMemo(() => {
    const { dataset, error, loading } = state;
    const { team, rows, pob, today } = dataset ?? EMPTY_DATASET;

    /* `largestManagerRoot`, not "whoever has no manager": a live roster can
       carry more than one reports_to-less-in-effect employee at once --
       orphaned test records, vacant-seat placeholders, a dangling manager
       reference -- and neither array order nor alphabetical order picks the
       real org over one of those. Falls back to any reports_to-less employee
       only if the roster has no recognised manager whatsoever. */
    const rootId = scopeId ?? largestManagerRoot(team)?.id ?? team.find((m) => m.reportsTo == null)?.id;
    const scopeTeam = subtreeOf(team, rootId);
    const window = periodWindow(period, today);
    const ids = new Set(scopeTeam.map((m) => m.id));
    const inScope = forEmployees(rows, ids);
    const scoped = inPeriod(inScope, window);

    return {
      /* The full roster stays available so the scope picker can offer managers
         outside the current subtree. */
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
      today,
      window,
      asOf: asOfFrom(scoped),
      loading,
      error,
      source: DATA_SOURCE,
    };
  }, [state, scopeId, period]);
}
