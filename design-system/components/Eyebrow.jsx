'use client';

import { cx } from '../lib/cx';

/* Eyebrow — the small uppercase kicker above a number: "VISIT PLANS TODAY".

   Renders as a <span> by default because it is usually inside a heading
   structure the caller already owns. Pass `as="h3"` where it genuinely is the
   card's heading, so the card is not a stack of anonymous divs to a screen
   reader.

   Uppercasing is done in CSS, not in the string. The prop stays sentence-case
   so it can be read aloud, searched and translated. */

export function Eyebrow({ as: Tag = 'span', children, className, ...rest }) {
  return (
    <Tag className={cx('ds-eyebrow', className)} {...rest}>
      {children}
    </Tag>
  );
}
