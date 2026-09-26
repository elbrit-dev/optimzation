'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* A bar pinned to the bottom of the SCREEN, over a list — the home of a
 * selection's actions (Secondary Entry's Send, Secondary Approval's
 * Approve / Reject).
 *
 * FIXED, NOT STICKY. `sticky` binds to the nearest ancestor with overflow,
 * and both the dev frame and DataProvider (Views)' slot carry an
 * `overflow: auto` that never itself scrolls — the page does — so a sticky
 * bar just sat at the end of the list, where nobody with 20 stockists would
 * see it. So it is portalled to <body> (a @container ancestor can capture a
 * fixed child, see Sheet's note) and placed over `anchorRef` with its own
 * left edge and width. The portal leaves the density scope behind, so it
 * carries `data-surface="app"` itself. `bottomGap` lifts it clear of an app's
 * bottom navigation. `onHeight` reports the bar's height so the caller can
 * reserve it at the end of the list and the last card can always be scrolled
 * above it. */

/* The anchor's own box, tracked live, so the viewport-fixed bar sits exactly
   over it — same left edge, same width — at any layout width. */
export function useAnchorBox(ref) {
  const [box, setBox] = useState(null);
  /* `attempt` re-runs the effect once when the anchor is not attached yet:
     a bar mounted in the SAME commit as its anchor runs this effect before
     React attaches the parent's ref (children first), so the first look
     finds nothing and nothing would ever look again. */
  const [attempt, setAttempt] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (typeof window === 'undefined') return undefined;
    if (!el) {
      const id = window.requestAnimationFrame(() => setAttempt((n) => n + 1));
      return () => window.cancelAnimationFrame(id);
    }
    const update = () => {
      const r = el.getBoundingClientRect();
      setBox((prev) => (prev && prev.left === r.left && prev.width === r.width ? prev : { left: r.left, width: r.width }));
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener('resize', update);
    /* Capture: a horizontal scroll inside any ancestor moves the list too. */
    window.addEventListener('scroll', update, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [ref, attempt]);
  return box;
}

export function PinnedBar({ anchorRef, bottomGap = 'var(--space-12)', onHeight, children }) {
  const box = useAnchorBox(anchorRef);
  const barRef = useRef(null);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const report = () => onHeight?.(el.getBoundingClientRect().height);
    report();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(report) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      onHeight?.(0);
    };
  }, [onHeight, box]);

  if (!box || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-surface="app"
      className="pointer-events-none fixed z-1000"
      style={{ left: box.left, width: box.width, bottom: `calc(${bottomGap} + env(safe-area-inset-bottom, 0px))` }}
    >
      <div ref={barRef} className="pointer-events-auto">
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* Room at the end of a list for a PinnedBar, so its last card can always be
   scrolled clear of the bar. */
export function PinnedBarSpacer({ height, bottomGap = 'var(--space-12)' }) {
  return <div aria-hidden="true" style={{ height: `calc(${height}px + ${bottomGap})` }} />;
}
