'use client';

import { cx } from '../lib/cx';
import { toneFill } from '../lib/tone';

/* ProgressBar — one value against a maximum.

   If you have two or more parts of a whole, this is the wrong component:
   use StackedBar, which is the same geometry and will not let the segments
   drift out of sync.

   The fill is clamped to [0, max]. A rep who did 14 of 12 planned calls is a
   real thing that happens, and the bar must not overflow its track when it
   does — the number beside it carries the overshoot. */

const HEIGHT_VAR = {
  sm: 'var(--ds-bar-h-sm)',
  md: 'var(--ds-bar-h-md)',
  lg: 'var(--ds-bar-h-lg)',
};

export function ProgressBar({
  value = 0,
  max = 100,
  tone = 'brand',
  size = 'md',
  label,
  showTrack = true,
  className,
  style,
  ...rest
}) {
  const safeMax = Number(max) > 0 ? Number(max) : 1;
  const raw = Number(value);
  const clamped = Math.min(Math.max(Number.isFinite(raw) ? raw : 0, 0), safeMax);
  const pct = (clamped / safeMax) * 100;

  return (
    <div
      className={cx('ds-bar', !showTrack && 'ds-bar--no-track', className)}
      style={{ height: HEIGHT_VAR[size] ?? HEIGHT_VAR.md, ...style }}
      role="progressbar"
      aria-valuenow={raw}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label}
      {...rest}
    >
      <span
        className="ds-bar__fill"
        style={{ width: `${pct}%`, backgroundColor: toneFill(tone) }}
      />
    </div>
  );
}
