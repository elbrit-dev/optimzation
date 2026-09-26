'use client';

/* /ring-nav — Ring Nav in the dev harness (src/app/dev/harness): tiles from
   the ERP as anyone, or a mock config; any prop; device widths; link presses
   kept in the frame. The same harness serves every screen at
   /dev/harness/<screen>; this URL is kept so existing links still work.
   Not in ProtectedRoute, so it can be screenshotted. */

import { HarnessShell } from '@/app/dev/harness/HarnessShell';
import { ringNavHarness } from '@/app/dev/harness/entries/ringNav';

export default function Page() {
  return <HarnessShell entry={ringNavHarness} />;
}
