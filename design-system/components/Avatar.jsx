'use client';

import { cx } from '../lib/cx';

/* Avatar — an image if there is one, initials if there is not.

   The fallback colour is derived from the name rather than passed in, so the
   same person is the same colour on every screen without anyone maintaining a
   mapping. It picks from the CATEGORICAL ramp, never the status ramp: a
   person is not a state, and tinting someone green would read as "approved".

   Initials are first + last, which is what a two-word Indian name and a
   two-word Western name both want. Single-word names take the first letter
   only — never the first two, which turns "Deekshith" into "DE". */

const PALETTE = [
  'var(--elbrit-blue)',
  'var(--elbrit-magenta)',
  'var(--elbrit-violet)',
  'var(--elbrit-plum)',
  'var(--elbrit-cyan)',
];

const SIZE_VAR = {
  sm: 'var(--ds-avatar-sm)',
  md: 'var(--ds-avatar-md)',
  lg: 'var(--ds-avatar-lg)',
};

export function initialsOf(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashHue(name) {
  const s = String(name ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function Avatar({ name, src, size = 'md', color, className, style, ...rest }) {
  const box = SIZE_VAR[size] ?? SIZE_VAR.md;
  const label = String(name ?? '');

  return (
    <span
      className={cx('ds-avatar', className)}
      style={{
        width: box,
        height: box,
        backgroundColor: src ? 'transparent' : (color ?? hashHue(label)),
        ...style,
      }}
      title={label || undefined}
      {...rest}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="ds-avatar__img" />
      ) : (
        <span aria-hidden="true">{initialsOf(label)}</span>
      )}
      {src ? null : <span className="ds-visually-hidden">{label}</span>}
    </span>
  );
}
