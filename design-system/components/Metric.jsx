'use client';

import { cx } from '../lib/cx';
import { Eyebrow } from './Eyebrow';
import { ProgressBar } from './ProgressBar';
import { toneFill } from '../lib/tone';

/* Metric — eyebrow, big number, caption, and optionally a thin bar.

   Deliberately does NOT render its own Card. A metric appears inside a card,
   inside a list row, and inside a drawer header, and baking the surface in
   would make two of those three wrong. Wrap it where you need the surface.

   `progress` is `{ value, max }`. It is an ORNAMENT: the caption carries the
   meaning ("71% of plan"), and the bar only makes the ratio scannable down a
   column of four cards. That is why it defaults to the 3px size and inherits
   `tone` rather than taking its own.

   The dot is the same idea — a 6px tone marker in the corner so a column of
   metrics can be read for state without reading the words. */

export function Metric({
  label,
  value,
  caption,
  tone = 'brand',
  dot = false,
  progress,
  className,
  ...rest
}) {
  return (
    <div className={cx('ds-metric', className)} {...rest}>
      <div className="ds-metric__head">
        <Eyebrow>{label}</Eyebrow>
        {dot ? (
          <span
            className="ds-metric__dot"
            style={{ backgroundColor: toneFill(tone) }}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <div className="ds-metric__value">{value}</div>
      {caption != null ? <div className="ds-metric__caption">{caption}</div> : null}
      {progress ? (
        <ProgressBar
          size="sm"
          tone={tone}
          value={progress.value}
          max={progress.max}
          label={`${label}: ${progress.value} of ${progress.max}`}
        />
      ) : null}
    </div>
  );
}
