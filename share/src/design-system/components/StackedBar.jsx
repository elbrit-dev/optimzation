'use client';

import { cx } from '../lib/cx';
import { toneFill } from '../lib/tone';

/* StackedBar — parts of a whole, in one track.

   Two rules the naive version gets wrong:

   1. A zero-value segment renders NOTHING. Flooring every segment at 1px so
      it "stays visible" is how a bar reading 20/1/1/0 grows a fourth stripe
      that is not there. If a category is empty, its legend chip says 0 and
      the bar stays silent.

   2. Percentages are computed against the segment TOTAL, not against a
      caller-supplied max. If you want a partially-filled track, pass a
      trailing neutral segment for the remainder — that keeps the sum honest
      and makes the empty part something you named on purpose. */

const HEIGHT_VAR = {
  sm: 'var(--ds-bar-h-sm)',
  md: 'var(--ds-bar-h-md)',
  lg: 'var(--ds-bar-h-lg)',
};

export function StackedBar({ segments = [], size = 'lg', label, className, style, ...rest }) {
  const clean = segments
    .map((s) => ({ ...s, value: Number(s?.value) || 0 }))
    .filter((s) => s.value > 0);
  const total = clean.reduce((sum, s) => sum + s.value, 0);

  return (
    <div
      className={cx('ds-bar', 'ds-bar--stacked', className)}
      style={{ height: HEIGHT_VAR[size] ?? HEIGHT_VAR.lg, ...style }}
      role="img"
      aria-label={
        label ??
        clean.map((s) => `${s.label ?? s.tone}: ${s.value}`).join(', ') ??
        undefined
      }
      {...rest}
    >
      {total > 0
        ? clean.map((s, i) => (
            <span
              key={s.key ?? s.label ?? i}
              className="ds-bar__fill"
              style={{
                width: `${(s.value / total) * 100}%`,
                backgroundColor: toneFill(s.tone),
                /* A segment that is a SUBDIVISION of its neighbour rather
                   than a category beside it — the joint half of a green
                   block — carries its own style: the same hue at lower
                   opacity, so the bar still reads as its three blocks. The
                   tone stays set either way, because it is what the label
                   and any legend chip colour themselves from. */
                ...s.style,
              }}
            />
          ))
        : null}
    </div>
  );
}
