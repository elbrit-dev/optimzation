'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/design-system';

/* ExitHint — the answer to the first back press at the app root.

   A toast, not a Sheet. A modal dialog would be the wrong shape twice over:
   it takes focus and it implies a decision, when the decision has already
   been handed back to the hardware button. All this has to do is say which
   press leaves, then get out of the way.

   PORTALLED TO document.body for the same reason Sheet is: every screen that
   can be at the root renders inside a `@container`, and a container is a
   containing block — a `fixed` child would anchor to the card rather than to
   the viewport. `bottom` clears the mobile nav bar and the home indicator.

   `role="status"` with `aria-live="polite"`: a screen reader announces it
   without the interruption of an alert, and nothing steals focus — focus has
   to stay where it is, because the next press is a hardware one. */

export function ExitHint({
  open,
  text = 'Press back again to exit',
  stayLabel = 'Stay',
  onStay,
  surface,
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      data-surface={surface}
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        /* Above the design system sheet (1100) and the app's own overlays
           (1000). A toast about a HARDWARE gesture has to be readable even
           when something modal is up — hidden, it just looks like the first
           press did nothing. */
        zIndex: 1200,
        maxWidth: 'calc(100vw - 2rem)',
      }}
      className="flex items-center gap-2 rounded-2xl border border-line-subtle bg-surface px-4 py-2 shadow-pop"
    >
      <span className="text-sm text-body whitespace-nowrap">{text}</span>
      {onStay ? (
        <Button type="text" size="sm" onClick={onStay}>
          {stayLabel}
        </Button>
      ) : null}
    </div>,
    document.body,
  );
}
