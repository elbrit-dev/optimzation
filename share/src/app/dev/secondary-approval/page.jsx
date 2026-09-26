'use client';

/* /dev/secondary-approval — Secondary Approval in the dev harness (src/app/dev/harness): pick
   the ERP and who to act as, set any prop, switch data modes and viewport
   widths, and watch the events. The same harness serves every screen at
   /dev/harness/<screen>; this URL is kept so existing links still work. */

import { HarnessShell } from '@/app/dev/harness/HarnessShell';
import { secondaryApprovalHarness } from '@/app/dev/harness/entries/secondaryApproval';

export default function Page() {
  return <HarnessShell entry={secondaryApprovalHarness} />;
}
