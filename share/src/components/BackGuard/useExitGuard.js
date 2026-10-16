'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { collapseHistory, olderDocumentBehind, pushBase, rearmTop } from './backStack';

/* useExitGuard — the bottom of the back stack: the app's root.

   PRESS BACK AGAIN TO LEAVE, and it is the only shape that actually works.
   The first press is caught and answered with a hint; the guard then stays
   registered but DISARMED, so a second press within the grace window is not
   consumed and the browser performs a real back — which at the root of an
   installed app is what the OS turns into "close". After the window expires
   the guard re-arms and the next press asks again.

   The guard is the stack's BASE (backStack.pushBase): a close watcher where
   the browser has one, so re-arming after a back press — no gesture behind
   it — still holds the next press instead of being skipped by Chromium.

   When the hint goes up the history behind the root is folded away
   (collapseHistory): the second press only closes the app on the first
   entry, and by now there is usually /login or a page or two behind home.

   AN OLDER PAGE LOAD BEHIND HOME cannot be folded: a sign-in that ended in a
   full page load leaves the pre-sign-in document at the first entry, and the
   second press LOADS it instead of leaving. So the hint leaves a short-lived
   note in sessionStorage; the root of the document that press loads finds it
   and comes up already showing the hint, disarmed — the press after it
   leaves. One extra press, but never a silent one.

   This is why there is no "Quit" button. A button cannot do what the second
   press does: `window.close()` is refused by Chromium unless the window has
   an opener, and at history entry 0 there is nothing for `go(-1)` to reach.
   An earlier attempt at an Exit button in the other app was removed for
   exactly this reason after it failed on real handsets. Do not re-add one
   without a mechanism proven on a device.

   `onPrompt` fires when the hint goes up — the one moment a host (Plasmic, a
   native shell that CAN close itself) gets a say. */

const EXIT_PENDING_KEY = 'elbrit-back-exit-pending';

function markExitPending() {
  try {
    window.sessionStorage.setItem(EXIT_PENDING_KEY, String(Date.now()));
  } catch {
    /* storage refused: the older document just asks once more */
  }
}

/** True once, within `withinMs` of the note being left. */
function takeExitPending(withinMs) {
  try {
    const at = Number(window.sessionStorage.getItem(EXIT_PENDING_KEY));
    window.sessionStorage.removeItem(EXIT_PENDING_KEY);
    return Number.isFinite(at) && at > 0 && Date.now() - at <= withinMs;
  } catch {
    return false;
  }
}

export function useExitGuard({ enabled = true, isRoot, graceMs = 3000, onPrompt } = {}) {
  const [hintOpen, setHintOpen] = useState(false);
  const layerRef = useRef(null);
  const timerRef = useRef(null);
  const onPromptRef = useRef(onPrompt);
  onPromptRef.current = onPrompt;

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (!enabled || !isRoot) return undefined;

    /* Disarmed on purpose. The next press is the one that leaves. */
    const showHint = () => {
      layer.disarm();
      setHintOpen(true);
      onPromptRef.current?.();

      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setHintOpen(false);
        layer.rearm();
      }, graceMs);
    };

    const layer = pushBase({
      name: 'app-root',
      onBack: () => {
        if (olderDocumentBehind()) markExitPending();
        collapseHistory();
        showHint();
      },
    });
    layerRef.current = layer;

    /* Loaded (or restored from the back/forward cache) by the press after a
       hint in a newer document: carry on where that one left off. */
    const carryOver = () => {
      if (takeExitPending(graceMs + 2000)) showHint();
    };
    carryOver();
    const onPageShow = (event) => {
      if (event.persisted) carryOver();
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      window.removeEventListener('pageshow', onPageShow);
      clearTimer();
      setHintOpen(false);
      layerRef.current = null;
      layer.release();
    };
  }, [enabled, isRoot, graceMs]);

  /* "I did not mean to leave." Closes the hint and takes the gesture back, so
     the press after it asks again rather than leaving. */
  const stay = useCallback(() => {
    clearTimer();
    setHintOpen(false);
    layerRef.current?.rearm();
  }, []);

  /* Landing back on the root by any route — a tab, a redirect, back out of a
     deep page — has to leave the guard up. */
  const rearm = useCallback(() => {
    if (hintOpen) return;
    rearmTop();
  }, [hintOpen]);

  return { hintOpen, stay, rearm };
}
