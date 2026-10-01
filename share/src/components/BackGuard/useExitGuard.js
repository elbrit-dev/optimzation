'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { pushLayer, rearmTop } from './backStack';

/* useExitGuard — the bottom layer of the back stack: the app's root.

   PRESS BACK AGAIN TO LEAVE, and it is the only shape that actually works.
   The first press is caught and answered with a hint; the layer then stays
   registered but DISARMED, so a second press within the grace window is not
   consumed and the browser performs a real back — which at the root of an
   installed app is what the OS turns into "close". After the window expires
   the layer re-arms and the next press asks again.

   This is why there is no "Quit" button. A button cannot do what the second
   press does: `window.close()` is refused by Chromium unless the window has
   an opener, and at history entry 0 there is nothing for `go(-1)` to reach.
   An earlier attempt at an Exit button in the other app was removed for
   exactly this reason after it failed on real handsets. Do not re-add one
   without a mechanism proven on a device.

   `onPrompt` fires when the hint goes up — the one moment a host (Plasmic, a
   native shell that CAN close itself) gets a say. */

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

    const layer = pushLayer({
      name: 'app-root',
      onBack: () => {
        /* Disarmed on purpose. The next press is the one that leaves. */
        layer.disarm();
        setHintOpen(true);
        onPromptRef.current?.();

        clearTimer();
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setHintOpen(false);
          layer.rearm();
        }, graceMs);
      },
    });
    layerRef.current = layer;

    return () => {
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
