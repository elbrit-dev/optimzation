'use client';

import { useEffect, useMemo } from 'react';
import { ExitHint } from './ExitHint';
import { useExitGuard } from './useExitGuard';

/* AppExitGuard — mount once, in the app shell. The root's back policy and the
   hint that goes with it, in one place.

   SHELL, NOT NAV BAR. "Which route is the root" is a property of the app, not
   of the component that happens to draw the tabs — and two of these would be
   worse than none: the inner layer answers the first press, the second press
   then pops the OUTER layer's sentinel, which is the same URL, so nothing
   happens and the app looks broken until a third press. One mount.

   TAKES `pathname` AS A PROP rather than reading a router. The two apps that
   use this are on different routers (App Router here, pages there) and the
   file is byte-identical in both trees; a `next/navigation` import would throw
   in the pages app. The shell knows its own router and passes the string. */

export function AppExitGuard({
  pathname,
  rootPaths = ['/'],
  enabled = true,
  graceMs = 3000,
  hintText,
  stayLabel,
  surface,
  onPrompt,
}) {
  const roots = useMemo(
    () => (Array.isArray(rootPaths) && rootPaths.length > 0 ? rootPaths : ['/']),
    [rootPaths],
  );

  const current = normalise(pathname);
  const isRoot = roots.some((root) => normalise(root) === current);

  const { hintOpen, stay, rearm } = useExitGuard({ enabled, isRoot, graceMs, onPrompt });

  /* Landing back on the root by any route — a tab, a redirect, back out of a
     deep page — has to leave the guard up. */
  useEffect(() => {
    if (isRoot) rearm();
  }, [isRoot, pathname, rearm]);

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

/** Trailing slash, query and hash are not part of "which route is this". */
function normalise(pathname) {
  if (!pathname) return '/';
  const path = String(pathname).split('?')[0].split('#')[0];
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}
