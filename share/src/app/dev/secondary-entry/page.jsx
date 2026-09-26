'use client';

/* /dev/secondary-entry — Secondary Entry in the dev harness (src/app/dev/harness): pick
   the ERP and who to act as, set any prop, switch data modes and viewport
   widths, and watch the events. The same harness serves every screen at
   /dev/harness/<screen>; this URL is kept so existing links still work. */

import { HarnessShell } from '@/app/dev/harness/HarnessShell';
import { secondaryEntryHarness } from '@/app/dev/harness/entries/secondaryEntry';

export default function Page() {
  return <HarnessShell entry={secondaryEntryHarness} />;
}
