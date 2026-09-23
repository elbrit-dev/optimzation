'use client';

import { cx } from '@/design-system';

/* A map pin, at the 12px mark.
 *
 * ONE COPY, because two cards on this screen put a territory in their right
 * rail — a doctor's and a rep's — and the icon is what says "this is a
 * place" without spending a word on it. It started life inside DoctorCard
 * and moved here the moment the second caller appeared.
 *
 * `currentColor` and no explicit colour of its own: it inherits from the
 * line it sits on, so the muted-and-secondary distinction is made once, by
 * the text beside it.
 *
 * Always `aria-hidden`. The place is already written out next to it, and an
 * icon that announces "pin" adds a word nobody needs to hear. */

export function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-3 w-3 shrink-0"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/* The disclosure caret, pointing down when there is more and flipping when
   the thing is open.
 *
 * Shared for the same reason PinIcon is: three cards on this screen promise
 * "there is a list behind me" and the promise has to look identical, or the
 * reader learns it three times. The rotation is a transform rather than a
 * second path, so it animates.

   `aria-hidden`, always: the row that owns it is a button carrying
   `aria-expanded`, which is the accessible version of this glyph. */
export function Chevron({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      className={cx(
        'h-3 w-3 shrink-0 transition-transform duration-150 ease-out',
        open && 'rotate-180',
      )}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
