/**
 * ringGeometry — the maths behind the story-style progress rings.
 *
 * Shared by the two components that draw them, so they can never drift apart:
 *   - HomeNavRings   the whole nav row, assembled in code
 *   - ProgressRing   just the ring, assembled in Plasmic Studio around a slot
 *
 * Both render as a CSS `conic-gradient` behind a radial mask (see `ringMask`), rather than
 * an SVG arc. That buys us three things an SVG `stroke-dasharray` cannot: per-segment colours
 * without one <circle> per segment, no document-global gradient id to collide on when the
 * component mounts more than once, and no `stroke-linecap` overhang inflating small values.
 *
 * Angles start at -90deg so the ring begins at 12 o'clock.
 */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * A ring divided into one segment per event.
 *
 * @param {boolean[]} segments  one entry per event; true = done
 * @param {object}    opts
 * @param {string}    opts.doneColor     colour of completed segments
 * @param {string}    opts.pendingColor  colour of pending segments
 * @param {number}    opts.gapDeg        gap between segments, in degrees
 * @returns {string}  a CSS `background` value
 *
 * An empty array means there is no work at all, which draws a solid unbroken ring in
 * `doneColor` — the "all clear" state. The gap shrinks automatically when a category has
 * many events, so the segments stay visible instead of collapsing into the gaps.
 */
export function segmentRing(segments, { doneColor, pendingColor, gapDeg = 5 }) {
  const n = Array.isArray(segments) ? segments.length : 0;
  if (!n) return doneColor;

  const step = 360 / n;
  const gap = n > 1 ? clamp(gapDeg, 0, step / 3) : 0;
  const stops = [];

  segments.forEach((done, i) => {
    const a = i * step;
    const color = done ? doneColor : pendingColor;
    if (gap) stops.push(`transparent ${a}deg ${a + gap}deg`);
    stops.push(`${color} ${a + gap}deg ${a + step - gap}deg`);
    if (gap) stops.push(`transparent ${a + step - gap}deg ${a + step}deg`);
  });

  return `conic-gradient(from -90deg,${stops.join(",")})`;
}

/**
 * A ring showing one continuous arc — the original Instagram-story look.
 *
 * @param {number}   progress   0..1, or 0..100 (anything above 1 is read as a percentage)
 * @param {object}   opts
 * @param {string}   opts.fillColor   colour of the filled arc (ignored when gradient is set)
 * @param {string}   opts.trackColor  colour of the remainder
 * @param {string[]} [opts.gradient]  two or more colours to sweep across the filled arc
 * @returns {string} a CSS `background` value
 */
export function progressRing(progress, { fillColor, trackColor, gradient }) {
  const raw = Number(progress) || 0;
  const frac = clamp(raw > 1 ? raw / 100 : raw, 0, 1);
  const deg = frac * 360;

  if (deg <= 0) return trackColor;
  if (Array.isArray(gradient) && gradient.length > 1) {
    const last = gradient.length - 1;
    const ramp = gradient.map((c, i) => `${c} ${((deg * i) / last).toFixed(2)}deg`).join(",");
    return `conic-gradient(from -90deg,${ramp},${trackColor} ${deg.toFixed(2)}deg 360deg)`;
  }
  return `conic-gradient(from -90deg,${fillColor} 0deg ${deg.toFixed(2)}deg,${trackColor} ${deg.toFixed(2)}deg 360deg)`;
}

/**
 * The radial mask that punches the hole out of the disc, turning it into a ring.
 * Apply to both `mask` and `WebkitMask`.
 *
 * @param {number|string} thickness  ring thickness — a number is treated as px
 */
export function ringMask(thickness) {
  const t = typeof thickness === "number" ? `${thickness}px` : thickness;
  return `radial-gradient(farthest-side,transparent calc(100% - ${t}),#000 calc(100% - ${t} + .5px))`;
}
