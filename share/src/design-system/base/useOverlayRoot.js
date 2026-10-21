'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { pushLayer } from '@/components/BackGuard';

/* What every base overlay root (Drawer, Dialog) does the same way.

   OPEN STATE, controlled or not. The root has to know whether it is open
   either way: the back layer exists exactly while it is.

   BACK CLOSES IT. While open, the overlay holds a BackGuard layer, so the
   phone's back button (or the browser's) closes it instead of leaving the
   page, innermost first when overlays stack. On Android Chrome a Base UI
   Drawer's own CloseWatcher takes the press first; the layer's history entry
   is then handed back when `open` goes false. Elsewhere the press pops the
   layer's entry and the layer closes the overlay.

   A screen may refuse to close (a save in flight): the press has already
   disarmed the layer, so if the overlay is still open a beat later, re-arm it
   — otherwise the NEXT press would leave the page. */

export function useOverlayRoot({ open: openProp, defaultOpen = false, onOpenChange, backName }) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? Boolean(openProp) : innerOpen;

  const handleOpenChange = useCallback(
    (next, eventDetails) => {
      if (!controlled) setInnerOpen(next);
      onOpenChange?.(next, eventDetails);
    },
    [controlled, onOpenChange],
  );

  const openRef = useRef(open);
  openRef.current = open;
  const onBackRef = useRef(null);
  onBackRef.current = ({ rearm }) => {
    handleOpenChange(false);
    window.setTimeout(() => {
      if (openRef.current) rearm();
    }, 0);
  };

  /* THE LAYER IS PUSHED A TICK LATE, and not at all if the overlay is gone by
     then. An overlay MOUNTED already open (`{open && <Sheet.Root open>}`) runs
     its effect, its cleanup and its effect again in quick succession — React
     does exactly that in development, and a parent re-keying does it in
     production. Pushed eagerly, the first layer's release queues a
     history.back() that lands AFTER the second push and walks the history
     one entry too far, so the next back press leaves the page. The press
     that opened the overlay is still a user activation a tick later, so the
     entry is not one Chromium skips. */
  useEffect(() => {
    if (!open) return undefined;
    let layer = null;
    const timer = window.setTimeout(() => {
      layer = pushLayer({ name: backName, onBack: (ctx) => onBackRef.current?.(ctx) });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      layer?.release();
    };
  }, [open, backName]);

  return { open, onOpenChange: handleOpenChange };
}

/* The system's one phone/desktop switch for overlays: 768px, the breakpoint
   the app's other phone/desktop switches use. false on the server and the
   first client pass, so hydration matches; an overlay is never open on first
   paint, so the late switch is invisible. */
const DESKTOP_QUERY = '(min-width: 768px)';

export function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setDesktop(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return desktop;
}
