'use client';

/* /review-report — the Monthly Review Report in the dev harness
   (src/app/dev/harness): pick the ERP and who to act as, set any prop and
   try phone and desktop widths. Also at /dev/harness/review-report. */

import { HarnessShell } from '@/app/dev/harness/HarnessShell';
import { reviewReportHarness } from '@/app/dev/harness/entries/reviewReport';

export default function Page() {
  return <HarnessShell entry={reviewReportHarness} />;
}
