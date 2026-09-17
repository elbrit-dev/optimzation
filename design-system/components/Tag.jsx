'use client';

import { cx } from '../lib/cx';

/* Tag — a categorical label. Unlike StatusPill these colours carry no
   meaning; they only need to be distinguishable. Never use a categorical
   colour to mean success or failure.

   `tone="neutral"` is the right default for data-derived labels. */

/* [text, fill] — the label and the wash/border are NOT the same value.
   Measured on white: magenta 6.67:1, violet 4.51:1, plum 8.48:1 all clear the
   4.5 floor and use one value for both. Blue (3.59), cyan (2.21) and amber
   (1.93) do not, so their label takes the palette's deeper twin while the wash
   and border keep the saturated hue — the tag still reads as its colour. */
const TONE_TOKEN = {
  neutral: ['var(--ds-text-secondary)', 'var(--ds-text-secondary)'],
  blue: ['var(--brand-text)', 'var(--elbrit-blue)'],
  magenta: ['var(--elbrit-magenta)', 'var(--elbrit-magenta)'],
  violet: ['var(--elbrit-violet)', 'var(--elbrit-violet)'],
  plum: ['var(--elbrit-plum)', 'var(--elbrit-plum)'],
  cyan: ['var(--cat-cyan-text)', 'var(--elbrit-cyan)'],
  amber: ['var(--status-pending-text)', 'var(--elbrit-amber)'],
};

export function Tag({
  tone = 'neutral',
  variant = 'tint',
  children,
  icon = null,
  className,
  style,
  ...rest
}) {
  const [text, fill] = TONE_TOKEN[tone] ?? TONE_TOKEN.neutral;

  const variantStyle =
    variant === 'outline'
      ? { color: text, borderColor: fill, backgroundColor: 'transparent' }
      : {
          color: text,
          borderColor: 'transparent',
          backgroundColor: `color-mix(in srgb, ${fill} 10%, transparent)`,
        };

  return (
    <span className={cx('ds-tag', className)} style={{ ...variantStyle, ...style }} {...rest}>
      {icon ? (
        <span className="ds-icon" aria-hidden="true" style={{ fontSize: 'var(--icon-md)' }}>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
