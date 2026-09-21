'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';

/* Sheet — a modal panel anchored to the bottom of the screen: title, close,
   and a scrolling body. The way a phone shows "the rows behind this number"
   without navigating away from the number.

   PORTALLED TO document.body, not rendered in place. Every screen that opens
   one of these has the panel inside a card, inside a grid, inside a
   `@container` — and a container establishes a containing block, so a
   position:fixed child would anchor to the CARD rather than to the viewport
   and a half-height sheet would appear inside a 200px box. The portal is not
   a z-index workaround; it is the only way `fixed` means what it says here.

   Because the portal lands outside the app's `data-surface` wrapper, the
   density scope does not come with it. `surface` puts it back — pass the same
   value the screen's root carries, or the sheet renders at console density
   inside a field-app screen.

   NO ENTRANCE ANIMATION. The system ships no keyframes (see README), and a
   slide-up faked with a mount-then-transition dance costs a second render on
   every open for motion that `prefers-reduced-motion` would have to remove
   again. It appears, which is what a sheet triggered by a tap needs to do.

   Dismissal is Escape, the close button, or the scrim — all three, because
   this is the one component on a phone with no visible way back otherwise.
   The scrim listens on mousedown-and-target-is-self rather than click: a
   click fires on the scrim when a drag STARTS on the panel and ends outside
   it, which closed the sheet mid text-selection. */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  surface,
  children,
  className,
  ...rest
}) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();

  /* onClose through a ref, not through the effect's dependency list. Callers
     pass an inline arrow, so a dependency on it re-runs the effect on every
     parent render — which would re-focus the panel and pull focus off
     whatever row the reader had tabbed to. */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  /* The portal target only exists in the browser. Rendering null on the
     server and on the first client pass keeps hydration identical. */
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    restoreRef.current = document.activeElement;
    panelRef.current?.focus();

    /* Captured, so a key handled inside the sheet's own content cannot
       swallow Escape before the sheet sees it. */
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    /* The page behind must not scroll under the scrim — on a phone a swipe
       over the scrim otherwise moves the report, and the reader comes back
       to a different place than they left. */
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      const restore = restoreRef.current;
      if (restore && typeof restore.focus === 'function') restore.focus();
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="ds-sheet-scrim"
      data-surface={surface}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRef.current?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx('ds-sheet', className)}
        {...rest}
      >
        <div className="ds-sheet__head">
          <div className="ds-sheet__heading">
            <h2 id={titleId} className="ds-sheet__title">
              {title}
            </h2>
            {subtitle != null ? <p className="ds-sheet__subtitle">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="ds-sheet__close"
            aria-label="Close"
            onClick={() => closeRef.current?.()}
          >
            <i className="pi pi-times" aria-hidden="true" />
          </button>
        </div>
        <div className="ds-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
