'use client';

import { cx } from '../lib/cx';

/* SectionLabel — the sentence-case heading that sits OUTSIDE and above a card
   or a group of them: "Where the visits happened".

   Distinct from Eyebrow, which lives inside a card and is uppercase. The pair
   is what gives a long scrolling column two levels of structure without
   introducing a third type size. */

export function SectionLabel({ as: Tag = 'h2', children, className, ...rest }) {
  return (
    <Tag className={cx('ds-section-label', className)} {...rest}>
      {children}
    </Tag>
  );
}
