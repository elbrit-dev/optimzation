'use client';

import { useEffect, useRef } from 'react';
import { pushLayer } from './backStack';

/* useBackLayer — "while this is open, back closes it instead of leaving".

   The overlay half of the back stack: dialogs, sheets, a dirty form. Register
   while `active`, and the press lands on `onBack` instead of the router.

   `onBack` receives `{ rearm, release }`. Returning without calling either
   leaves the next press unconsumed, which only the root guard wants; an
   overlay either closes (its `active` goes false and the effect releases) or
   keeps holding the gesture with `rearm()` — what the calendar does when the
   press only dismissed a popover or the soft keyboard. */

export function useBackLayer(active, onBack, name = 'layer') {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return undefined;
    const layer = pushLayer({
      name,
      onBack: (ctx) => onBackRef.current?.(ctx),
    });
    return () => layer.release();
  }, [active, name]);
}
