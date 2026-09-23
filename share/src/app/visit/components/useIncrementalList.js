'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* Show a page, and another page each time the reader reaches the end.
 *
 * REPLACES A HARD CAP. Both sheets used to slice to sixty and say "showing
 * first 60" in the subtitle. That was honest -- a list that silently stops is
 * a list you cannot trust -- but on a month it hid 2,247 of 2,307 calls behind
 * a sentence, and there was no way to reach them at all.
 *
 * WHY NOT RENDER ALL OF THEM. The cap was never about honesty, it was about
 * jank: each call is a card with an avatar, two pills and a status, and a
 * couple of thousand of those in one scroll container stutters on the hardware
 * this runs on. Paging keeps the DOM small and the scroll smooth, and the
 * reader still gets everything.
 *
 * `rootMargin` loads the next page BEFORE the sentinel is on screen, so the
 * list extends while there is still a screenful to scroll through and the
 * reader never meets the bottom.
 *
 * THE OBSERVER IS REBUILT EACH PAGE, deliberately. IntersectionObserver fires
 * on a CHANGE of intersection, so if one page does not fill the container the
 * sentinel stays visible, never "changes", and the list stops loading half a
 * screen short. Re-observing forces a fresh callback and the next page.
 *
 * Falls back to rendering everything where IntersectionObserver does not
 * exist (jsdom, very old browsers): slow beats truncated, and unreachable
 * rows are worse than janky ones. */

export function useIncrementalList(total, { pageSize = 30, resetKey = null } = {}) {
  const [count, setCount] = useState(pageSize);
  const observerRef = useRef(null);

  /* Back to page one whenever the list underneath changes -- a different
     doctor plan, a different bar, a different month. Without this, opening a
     short list after a long one would start it scrolled deep into a list that
     no longer exists. */
  useEffect(() => {
    setCount(pageSize);
  }, [resetKey, pageSize]);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  const sentinelRef = useCallback(
    (node) => {
      observerRef.current?.disconnect();
      if (!node) return;

      if (typeof IntersectionObserver === 'undefined') {
        setCount(total);
        return;
      }

      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setCount((c) => Math.min(c + pageSize, total));
          }
        },
        /* The sheet's own scroll container, not the viewport: the sentinel
           moves within that box, and observing against the viewport makes
           the trigger depend on where the sheet happens to sit on screen. */
        { root: node.closest('.ds-sheet__body') ?? null, rootMargin: '300px' },
      );
      io.observe(node);
      observerRef.current = io;
    },
    [pageSize, total, count],
  );

  const shown = Math.min(count, total);
  return { shown, hasMore: shown < total, sentinelRef };
}
