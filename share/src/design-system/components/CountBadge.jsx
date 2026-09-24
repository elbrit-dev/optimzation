'use client';

import { cx } from '../lib/cx';

/* CountBadge — how many things are waiting, pinned to the corner of
   something else.

   Not StatusPill (a closed set of document states) and not a Tabs count (a
   quiet total inside the label). This one is a CALL TO ACTION: it exists to
   be noticed, and it disappears at zero — a "0" badge is noise that trains
   people to ignore the badge.

   Two tones, both FILLS THAT CARRY A WHITE LABEL, which is why they are not
   the tone.js fills: white on --status-rejected is 3.27:1 and on
   --brand-primary 3.59:1. --intent-danger-fill and --brand-fill are the
   palette's own deeper values for exactly this job (4.62 and 6.16:1).

     danger  things overdue or owed — the default, and the mock's red
     brand   things new but not late

   No success/warning: white on the green and amber fills cannot pass at
   any weight, and "3 approved" is not something anyone needs a badge for. */

const TONE_CLASS = {
  danger: 'ds-count-badge--danger',
  brand: 'ds-count-badge--brand',
};

export function CountBadge({ value, max = 99, tone = 'danger', label, className, ...rest }) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;

  const whole = Math.floor(n);
  const text = whole > max ? `${max}+` : String(whole);

  return (
    <span
      className={cx('ds-count-badge', TONE_CLASS[tone] ?? TONE_CLASS.danger, className)}
      aria-label={label}
      {...rest}
    >
      {text}
    </span>
  );
}
