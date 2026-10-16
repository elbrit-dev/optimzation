'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ExitHint } from './ExitHint';
import { useExitGuard } from './useExitGuard';
import { backLeavesApp, normalisePath, pushBase } from './backStack';

/* AppExitGuard — mount once, in the app shell. The root's back policy and the
   hint that goes with it, in one place.

   SHELL, NOT NAV BAR. "Which route is the root" is a property of the app, not
   of the component that happens to draw the tabs — and two of these would be
   worse than none: the inner layer answers the first press, the second press
   then pops the OUTER layer's sentinel, which is the same URL, so nothing
   happens and the app looks broken until a third press. One mount.

   THE APP IS ONLY EVER LEFT FROM THE ROOT. Off the root, back is ordinary —
   except where it would leave the app (the page is the first history entry:
   opened from a notification, after a reload, after the root folded its
   history) or land on a page it must never go back to (`blockedPaths`: the
   login page). There `onLeave` runs instead — the host goes home — and the
   root's "press back again" is what leaves. Without `onLeave`, or where the
   browser cannot say what is behind the page, back is left alone.

   TAKES `pathname` AS A PROP rather than reading a router. The two apps that
   use this are on different routers (App Router here, pages there) and the
   file is byte-identical in both trees; a `next/navigation` import would throw
   in the pages app. The shell knows its own router and passes the string,
   and does its own navigating in `onLeave`. */

export function AppExitGuard({
  pathname,
  rootPaths = ['/'],
  enabled = true,
  graceMs = 3000,
  hintText,
  stayLabel,
  surface,
  onPrompt,
  onLeave,
  blockedPaths = [],
}) {
  const roots = useMemo(
    () => (Array.isArray(rootPaths) && rootPaths.length > 0 ? rootPaths : ['/']),
    [rootPaths],
  );

  const current = normalisePath(pathname);
  const isRoot = roots.some((root) => normalisePath(root) === current);

  const { hintOpen, stay, rearm } = useExitGuard({ enabled, isRoot, graceMs, onPrompt });

  /* Landing back on the root by any route — a tab, a redirect, back out of a
     deep page — has to leave the guard up. */
  useEffect(() => {
    if (isRoot) rearm();
  }, [isRoot, pathname, rearm]);

  /* Off the root, at the edge of the app's history: back goes home. Read once
     per page — the entries behind a page do not change while it is shown. */
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  const hasLeave = typeof onLeave === 'function';
  const blockedKey = (Array.isArray(blockedPaths) ? blockedPaths : []).join('\n');
  useEffect(() => {
    if (!enabled || isRoot || !hasLeave) return undefined;
    if (backLeavesApp(blockedKey ? blockedKey.split('\n') : []) !== true) return undefined;
    const layer = pushBase({
      name: 'app-leave',
      onBack: ({ release }) => {
        release();
        onLeaveRef.current?.();
      },
    });
    return () => layer.release();
  }, [enabled, isRoot, hasLeave, current, blockedKey]);

  return (
    <ExitHint
      open={hintOpen}
      text={hintText}
      stayLabel={stayLabel}
      onStay={stay}
      surface={surface}
    />
  );
}
