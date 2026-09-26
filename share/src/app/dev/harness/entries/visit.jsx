'use client';

import { VisitReport } from '@/app/visit/components/VisitReport';
import { visitReportMeta } from '@/app/visit/plasmic.meta';
import { emulatedBrowser } from '../addons/emulatedBrowser';

/* The Visit report reads ERP as the person acting; its numbers come from
   the elbrit_visit_summary server script and its lists from
   elbrit_visit_rows. Nothing to write, so no dry run. */
export const visitHarness = {
  id: 'visit',
  title: 'Visit Report',
  component: VisitReport,
  meta: visitReportMeta,
  bind: ({ envName, token }) => ({ gqlEnvironment: envName, gqlToken: token }),
  frame: { width: null },
  modes: [{ id: 'live', label: 'ERP', note: 'Server-side counts (elbrit_visit_summary), rows on demand (elbrit_visit_rows).' }],
  addons: [emulatedBrowser()],
};
