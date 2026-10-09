'use client';

import { ReviewReport } from '@/app/review-report/components/ReviewReport';
import { reviewReportMeta } from '@/app/review-report/plasmic.meta';

/* The monthly review reads ERP as the person acting, through the
   elbrit_sm_review server script (sums only). Nothing to write. */
export const reviewReportHarness = {
  id: 'review-report',
  title: 'Monthly Review Report',
  component: ReviewReport,
  meta: reviewReportMeta,
  bind: ({ envName, token }) => ({ gqlEnvironment: envName, gqlToken: token }),
  frame: { width: null },
  modes: [{ id: 'live', label: 'ERP', note: 'Per-seat monthly sums (elbrit_sm_review).' }],
};
