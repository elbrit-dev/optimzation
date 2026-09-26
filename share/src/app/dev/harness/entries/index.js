/* Every screen the harness can run. To add one: write an entry in this
   folder (see HarnessShell's ENTRY CONTRACT) and list it here. */

import { visitHarness } from './visit';
import { secondaryEntryHarness } from './secondaryEntry';
import { secondaryApprovalHarness } from './secondaryApproval';
import { ringNavHarness } from './ringNav';

export const HARNESS_ENTRIES = [visitHarness, secondaryEntryHarness, secondaryApprovalHarness, ringNavHarness];

export function harnessEntry(id) {
  return HARNESS_ENTRIES.find((e) => e.id === id) ?? null;
}
