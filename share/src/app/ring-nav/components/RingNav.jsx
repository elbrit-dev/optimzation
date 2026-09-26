'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { RingNav as DsRingNav, cx } from '@/design-system';
import { normalizeRingNavItems } from '../utils/normalizeRingNavItems';
import { compileTiles, isDynamic, resolveTiles, tileContext } from '../utils/resolveTiles';
import { useErpTiles } from '../data/useErpTiles';

/* RingNav — the field app's task strip as a row of shortcuts. Each tile
   links to its task's own page; tapping one navigates there.

   This wraps the design-system RingNav with what the design system
   deliberately does not own:

   - ROUTING. Each tile is a next/link, so a tap is a client-side
     navigation. External hrefs (https://…) still work.
   - TILES FROM ERP. Give `gqlToken` (the signed-in user's own, as Visit)
     and `gqlEnvironment`, and no `items`: the tiles come from the ERP
     READY TO DRAW — the "Elbrit Ring Nav" server script counts the user's
     work with the ERP's own permissions (data/useErpTiles.js). Refetched
     every `refreshEvery` ms (default 5 minutes) and on return to the app.
     `hrefs` re-points a tile by id: { 'secondary-entry': '/secondary/entry' }.
   - DYNAMIC TILES, for `items` given here instead. Any field may be a
     function of { data, now, today, day, weekday, month } — its caption,
     count, segments — and `show` says whether it is on the strip at all (see
     utils/resolveTiles.js). `items` may also be JavaScript text evaluating
     to the array. Such tiles re-resolve on new items or data, on return to
     the app, and at local midnight; `refreshEvery` adds a finer beat.
   - CONFIG NORMALISATION. normalizeRingNavItems turns what was typed into
     what the tiles render.

   WHEN THE SET OF TILES CHANGES the strip goes back to its start. It
   scroll-snaps, and the browser re-snaps to the tile it was on: a tile
   appearing before it opened scrolled out of view.

   NO SELECTED STATE, on purpose: no tile is ever highlighted, including the
   one for the current route. */

const MAX_DELAY = 2 ** 31 - 1;

function pinnedTime(now) {
  if (now == null || now === '') return null;
  /* A bare date is LOCAL midnight — not a UTC instant that is still the
     day before east of Greenwich. */
  const s = String(now);
  const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s).getTime();
  return Number.isFinite(t) ? t : null;
}

function nextBeat(now, refreshEvery) {
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 50).getTime();
  const every = Number(refreshEvery);
  return every > 0 ? Math.min(midnight, now + Math.max(every, 250)) : midnight;
}

export default function RingNav({
  items,
  gqlEnvironment = 'ERP',
  gqlToken,
  month,
  hrefs,
  data,
  now: nowProp,
  refreshEvery,
  onItemClick,
  stickyBar = false,
  inset = true,
  ariaLabel = 'Shortcuts',
  className,
}) {
  /* Tiles given here win; otherwise, with a token, they come from ERP. */
  const fromErp = items == null && Boolean(gqlToken?.trim());
  /* `now` previews a day on the server too: the entry tile's 1st-5th window
     and due date are the ERP's to work out. */
  const previewDay = nowProp ? String(nowProp).slice(0, 10) : undefined;
  const remote = useErpTiles({ enabled: fromErp, gqlEnvironment, gqlToken, month, today: previewDay, refreshEvery });
  const source = fromErp ? remote.items : items;

  const defs = useMemo(() => {
    const list = typeof source === 'string' ? compileTiles(source) : source;
    if (!hrefs || !Array.isArray(list)) return list;
    return list.map((t) => (t && typeof t === 'object' && hrefs[t.id] ? { ...t, href: hrefs[t.id] } : t));
  }, [source, hrefs]);
  const dynamic = useMemo(() => isDynamic(defs), [defs]);

  const pinned = pinnedTime(nowProp);
  const [clock, setClock] = useState(() => Date.now());
  const now = pinned ?? clock;

  const tiles = useMemo(
    () => normalizeRingNavItems(dynamic ? resolveTiles(defs, tileContext(now, data)) : defs),
    [defs, dynamic, data, now],
  );

  /* Back to the start when tiles come or go (see above). */
  const rootRef = useRef(null);
  const ids = tiles.map((t) => t.id).join('|');
  const lastIds = useRef(ids);
  useLayoutEffect(() => {
    if (lastIds.current === ids) return;
    lastIds.current = ids;
    const strip = rootRef.current?.querySelector('nav');
    if (strip) strip.scrollLeft = 0;
  }, [ids]);

  const live = dynamic && pinned == null;
  useEffect(() => {
    if (!live) return undefined;
    const id = setTimeout(() => setClock(Date.now()), Math.min(Math.max(nextBeat(clock, refreshEvery) - Date.now(), 0), MAX_DELAY));
    return () => clearTimeout(id);
  }, [live, clock, refreshEvery]);

  useEffect(() => {
    if (!live) return undefined;
    const wake = () => document.visibilityState === 'visible' && setClock(Date.now());
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [live]);

  return (
    <div ref={rootRef} className={cx(stickyBar && 'sticky top-0 z-10 bg-surface', inset && 'pt-1.5 pb-0.5', className)}>
      {/* The side margin is INSIDE the scroller: the strip runs to the device
          edges, the first and last tiles rest 16px in, and tiles scroll out
          under the screen edge rather than being cut at a padded box.
          scroll-px keeps snapping on that margin, not on the edge. */}
      <DsRingNav
        items={tiles}
        linkAs={Link}
        onItemClick={onItemClick}
        ariaLabel={ariaLabel}
        className={inset ? 'px-4 scroll-px-4' : undefined}
      />
    </div>
  );
}
