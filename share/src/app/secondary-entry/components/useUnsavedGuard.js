'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* useUnsavedGuard — "you have unsaved changes" for Secondary Entry as a
 * whole, on the same mechanism as Navigation's useExitConfirm.
 *
 * FOUR WAYS OUT, all guarded while `dirty`:
 *   1. In-app controls (the back arrow, "All stockists") call
 *      `request(action)`: the action runs at once when clean, and waits
 *      behind the confirmation when not.
 *   2. The hardware/browser BACK press. The web cannot cancel one, so — as
 *      useExitConfirm does — a sentinel history entry is kept on top while
 *      dirty; back pops it (same URL, nothing re-renders), we hear the
 *      popstate, put the sentinel back and ask. Confirming runs `onBack`
 *      (Secondary Entry: discard and return to the list — back is "one level
 *      up") and then drops the sentinel, so the history is as it was.
 *      The sentinel spreads the existing history state so Next's router keys
 *      survive — replacing it outright breaks App Router navigation.
 *   3. An in-app LINK anywhere on the page (a bottom-nav tab): a capture-phase
 *      click listener holds same-origin <a href> clicks and asks; confirming
 *      re-clicks the link with the guard lifted, so next/link still does a
 *      client-side navigation instead of a full reload.
 *   4. Reload / closing the tab: `beforeunload`, the only thing the browser
 *      allows there — its own prompt, no custom text.
 *
 * Only while dirty: a clean screen adds no history entry and catches no
 * clicks. */

const GUARD_KEY = '__elbritUnsavedGuard';

export function useUnsavedGuard({ dirty, onBack }) {
  const [open, setOpen] = useState(false);
  const pendingRef = useRef(null);
  const bypassRef = useRef(false);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  /* 2. Back press. */
  useEffect(() => {
    if (!dirty || typeof window === 'undefined') return undefined;
    const pushGuard = () => {
      if (window.history.state?.[GUARD_KEY]) return;
      window.history.pushState({ ...window.history.state, [GUARD_KEY]: true }, '');
    };
    pushGuard();
    const onPopState = () => {
      if (bypassRef.current) return;
      pushGuard();
      pendingRef.current = { kind: 'back' };
      setOpen(true);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      /* Leaving the dirty state some other way (saved, discarded): take our
         sentinel back off so a later back press is an ordinary one. */
      if (window.history.state?.[GUARD_KEY]) {
        bypassRef.current = true;
        window.history.back();
        setTimeout(() => {
          bypassRef.current = false;
        }, 0);
      }
    };
  }, [dirty]);

  /* 3. In-app links. */
  useEffect(() => {
    if (!dirty || typeof document === 'undefined') return undefined;
    const onClick = (e) => {
      if (bypassRef.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      pendingRef.current = { kind: 'link', anchor: a };
      setOpen(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);

  /* 4. Reload / close. */
  useEffect(() => {
    if (!dirty || typeof window === 'undefined') return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  /* 1. In-app controls. */
  const request = useCallback(
    (action) => {
      if (!dirty) {
        action?.();
        return;
      }
      pendingRef.current = { kind: 'action', action };
      setOpen(true);
    },
    [dirty],
  );

  const cancel = useCallback(() => {
    pendingRef.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    if (!pending) return;
    if (pending.kind === 'action') {
      pending.action?.();
    } else if (pending.kind === 'back') {
      onBackRef.current?.();
    } else if (pending.kind === 'link') {
      bypassRef.current = true;
      pending.anchor.click();
      setTimeout(() => {
        bypassRef.current = false;
      }, 0);
    }
  }, []);

  return { confirmOpen: open, request, confirm, cancel };
}
