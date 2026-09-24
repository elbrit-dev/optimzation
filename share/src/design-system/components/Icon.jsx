'use client';

import { cx } from '../lib/cx';

/* Icon — one call site shape for every glyph, so the underlying set can be
   swapped without touching consumers.

   Today it renders PrimeIcons, which both apps already load in their root
   (`primeicons/primeicons.css`). Pass either the bare name (`"search"`) or
   the full class (`"pi pi-search"`); both work.

   Icons inherit currentColor. Never hard-code a fill. Sizes come from the
   --icon-* tokens: 16px inline, 18px in the bottom nav, 24px in toolbars. */

const SIZE_TOKEN = {
  sm: 'var(--icon-sm)',
  md: 'var(--icon-md)',
  lg: 'var(--icon-lg)',
  xl: 'var(--icon-xl)',
};

function resolveClass(name) {
  if (!name) return null;
  const raw = String(name).trim();
  if (raw.startsWith('pi ') || raw.startsWith('pi-')) {
    return raw.startsWith('pi ') ? raw : `pi ${raw}`;
  }
  return `pi pi-${raw}`;
}

export function Icon({ name, size = 'md', label, className, style, ...rest }) {
  const glyphClass = resolveClass(name);
  const fontSize = SIZE_TOKEN[size] ?? (typeof size === 'string' ? size : SIZE_TOKEN.md);

  return (
    <span
      className={cx('ds-icon', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      style={{ fontSize, width: fontSize, height: fontSize, ...style }}
      {...rest}
    >
      {glyphClass ? <i className={glyphClass} style={{ fontSize: 'inherit' }} /> : null}
    </span>
  );
}
