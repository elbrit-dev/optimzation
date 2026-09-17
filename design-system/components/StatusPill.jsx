'use client';

import { cx } from '../lib/cx';
import { toneFill, toneText } from '../lib/tone';

/* StatusPill — one colour, one meaning. The status hue as text on a 12% tint
   of itself, 22px box, 6px dot.

   TWO tokens per status, not one. The saturated value tints the wash and fills
   the dot; the deeper twin carries the label. Using the saturated value for
   both — which is what this did — put green at 2.28:1 and amber at 1.93:1
   against a 4.5:1 floor, so the labels were decorative rather than readable.
   The pill still looks like its status because the wash and dot are unchanged.

   Status is semantic and closed. For open/categorical labels use Tag.

   The token pairs now come from lib/tone.js, shared with the quantitative
   primitives, rather than from a private copy here — so a pill and a bar
   meaning the same thing cannot drift to two greens. `status` still takes
   approved/pending/rejected/draft/info and additionally accepts the outcome
   names (success/warning/danger/neutral/brand) those primitives use. */

export function StatusPill({
  status = 'pending',
  children,
  showDot = true,
  className,
  style,
  ...rest
}) {
  const text = toneText(status);
  const fill = toneFill(status);

  return (
    <span
      className={cx('ds-pill', className)}
      style={{
        color: text,
        backgroundColor: `color-mix(in srgb, ${fill} 12%, transparent)`,
        ...style,
      }}
      {...rest}
    >
      {showDot ? <span className="ds-pill__dot" style={{ background: fill }} /> : null}
      {children ?? status}
    </span>
  );
}
