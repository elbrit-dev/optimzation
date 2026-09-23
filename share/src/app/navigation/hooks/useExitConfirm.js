'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* useExitConfirm — turns the hardware/browser back press on a root tab into a
   "leave the app?" question instead of an immediate exit.

   The web gives no way to cancel a back press, so this does the only thing
   that works: it keeps a sentinel history entry on top of the root route.
   Back pops the sentinel (same URL, so nothing re-renders), we hear the
   popstate, push a fresh sentinel to stay put, and open the confirmation.
   Cancel leaves the sentinel in place, so the trick still works next time;
   confirming steps back past both the sentinel and the root entry, which is
   what actually closes an installed/TWA app.

   The sentinel spreads the existing history state so Next's own router keys
   survive — replacing the state object outright breaks App Router navigation.

   Guarded only on the root route: anywhere else, back should still mean back. */

const GUARD_KEY = '__elbritExitGuard';

export function useExitConfirm({ enabled, isExitRoute, onExit }) {
  const [open, setOpen] = useState(false);
  const exitingRef = useRef(false);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    if (!enabled || !isExitRoute || typeof window === 'undefined') return undefined;

    exitingRef.current = false;

    const pushGuard = () => {
      if (window.history.state?.[GUARD_KEY]) return;
      window.history.pushState({ ...window.history.state, [GUARD_KEY]: true }, '');
    };

    pushGuard();

    const onPopState = () => {
      /* Already on the way out — let the browser finish the navigation. */
      if (exitingRef.current) return;
      pushGuard();
      setOpen(true);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [enabled, isExitRoute]);

  const cancelExit = useCallback(() => setOpen(false), []);

  const confirmExit = useCallback(() => {
    exitingRef.current = true;
    setOpen(false);

    /* A host that knows how to close the app for real (a native shell, a
       Plasmic interaction) takes over here. */
    if (typeof onExitRef.current === 'function') {
      onExitRef.current();
      return;
    }

    /* Past the sentinel AND past the root entry: one step back would only
       land on the root route again. */
    window.history.go(-2);
  }, []);

  return { exitConfirmOpen: open, confirmExit, cancelExit };
}
