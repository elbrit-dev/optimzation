'use client';

import { cx } from '../lib/cx';
import { toneFill } from '../lib/tone';

/* ProgressRing — StackedBar's segments, drawn round a circle.

   SVG ARCS, NOT A CONIC GRADIENT. The source mock drew this ring with
   `conic-gradient` and a radial `mask`. Principle 4 forbids gradients
   outright, and a gradient also cannot transition between two readings or
   carry a per-segment tone from lib/tone.js. One stroked circle per segment
   does both, with the same two rules StackedBar follows:

   1. A zero-value segment renders nothing — no hairline sliver for a
      category that is not there.
   2. Lengths are shares of the segment TOTAL. For a partly-done ring, pass
      the remainder as its own segment (usually `danger` for "still owed"),
      so the empty part is something you named on purpose.

   A segment's colour is its `tone` (lib/tone.js); `color` — any CSS colour
   or token, "#7c3aed", "var(--brand-primary)" — overrides it, for a category
   the five tones do not name. As many segments as there are categories.

   Segments are separated by a small gap, only when there are two or more: a
   single full segment is a closed ring, not a ring with a notch in it.

   The first segment starts at 9 o'clock and runs clockwise over the top.
   That is where the mock starts it, and it puts "done" in the upper-left
   quadrant a left-to-right reader sees first.

   The stroke is a RATIO of the diameter, not a token: `--ds-ring-size` sets
   how big, this file sets the proportions, so a resized ring stays a ring. */

const VIEWBOX = 100;
const STROKE = 9;
const RADIUS = (VIEWBOX - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/* ~4 degrees, the gap the mock uses between arcs. */
const GAP = CIRCUMFERENCE * (4 / 360);

/**
 * Arc geometry for a list of segments. Exported for the tests: the maths is
 * the part that goes wrong silently (a 1px arc for a zero, a notch in a full
 * ring), and it is easier to assert on numbers than on pixels.
 */
export function ringArcs(segments = []) {
  const clean = segments
    .map((s, i) => ({ ...s, key: s?.key ?? s?.label ?? i, value: Number(s?.value) || 0 }))
    .filter((s) => s.value > 0);
  const total = clean.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return [];

  const gap = clean.length > 1 ? GAP : 0;
  let cursor = 0;
  return clean.map((s) => {
    const share = (s.value / total) * CIRCUMFERENCE;
    const length = Math.max(share - gap, 0);
    const arc = { ...s, start: cursor + gap / 2, length };
    cursor += share;
    return arc;
  });
}

export function ProgressRing({ segments = [], label, children, className, style, ...rest }) {
  const arcs = ringArcs(segments);
  const hidden = rest['aria-hidden'] === true || rest['aria-hidden'] === 'true';

  return (
    <div
      className={cx('ds-ring', className)}
      style={style}
      role={hidden ? undefined : 'img'}
      aria-label={
        hidden ? undefined : (label ?? arcs.map((a) => `${a.label ?? a.tone}: ${a.value}`).join(', '))
      }
      {...rest}
    >
      <svg className="ds-ring__svg" viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} aria-hidden="true" focusable="false">
        {arcs.length === 0 ? (
          <circle className="ds-ring__track" cx="50" cy="50" r={RADIUS} strokeWidth={STROKE} />
        ) : (
          arcs.map((a) => (
            <circle
              key={a.key}
              className="ds-ring__arc"
              cx="50"
              cy="50"
              r={RADIUS}
              strokeWidth={STROKE}
              strokeDasharray={`${a.length} ${CIRCUMFERENCE - a.length}`}
              /* Negative: a positive offset pulls the dash BACK along the
                 path, and this needs it moved forward to `start`. */
              strokeDashoffset={-a.start}
              style={{ stroke: a.color || toneFill(a.tone), ...a.style }}
            />
          ))
        )}
      </svg>
      {children != null ? <div className="ds-ring__centre">{children}</div> : null}
    </div>
  );
}
