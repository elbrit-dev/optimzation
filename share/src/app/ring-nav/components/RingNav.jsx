'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { RingNav as DsRingNav, cx } from '@/design-system';
import { normalizeRingNavItems } from '../utils/normalizeRingNavItems';

/* RingNav — the field app's task strip as a row of shortcuts. Each tile
   links to its task's own page; tapping one navigates there.

   This wraps the design-system RingNav with two things the design system
   deliberately does not own:

   - ROUTING. The DS renders plain anchors so it stays framework-free; here
     each tile is a next/link, so a tap is a client-side navigation, not a
     full page reload. External hrefs (https://…) still work — next/link
     falls back to an ordinary anchor for them.
   - CONFIG NORMALISATION. Studio and the harness hand over whatever was
     typed; normalizeRingNavItems turns it into what the tiles render.

   NO SELECTED STATE, on purpose. Once you are on the page a tile points at,
   you are looking at that page, not at the strip — so no tile is ever
   highlighted, including the one for the current route. */

export default function RingNav({
  items,
  onItemClick,
  stickyBar = false,
  inset = true,
  ariaLabel = 'Shortcuts',
  className,
}) {
  const normalized = useMemo(() => normalizeRingNavItems(items), [items]);

  return (
    <div
      className={cx(
        /* Sticky needs a fill, or the page scrolls visibly through it. */
        stickyBar && 'sticky top-0 z-10 bg-surface',
        inset && 'px-4 pt-1.5 pb-0.5',
        className,
      )}
    >
      <DsRingNav items={normalized} linkAs={Link} onItemClick={onItemClick} ariaLabel={ariaLabel} />
    </div>
  );
}
