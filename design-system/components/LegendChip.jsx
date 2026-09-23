'use client';

import { cx } from '../lib/cx';
import { toneFill } from '../lib/tone';

/* LegendChip — `● Working 20 ›`. Reads a StackedBar segment, and when it is
   given an `onClick` it is also the way into that segment's rows.

   The visual is 15px tall and that is not a tap target. It renders as a
   button with --tap-target-min of vertical hit area supplied by padding, so
   the chips still LOOK like a legend and behave like controls. Without an
   onClick it degrades to a plain span — a legend nobody can drill into should
   not advertise itself as pressable.

   `size="sm"` drops to the 10px label step and trims the block padding, for a
   legend inside a card rather than beside a full-width bar. It is only
   legitimate on the NON-interactive form: shrinking a tap target to fit is
   the wrong trade, so the padding stays put when there is an onClick. */

export function LegendChip({
  label,
  value,
  tone = 'neutral',
  /* Styles merged into the swatch, for a series that is a SUBDIVISION of its
     tone rather than the tone itself — the joint half of a green segment,
     say, which is the same green at lower opacity. An object rather than a
     colour so the chip can match whatever the bar did, including the opacity
     that carries the distinction; the tone stays set regardless, because it
     is what everything else about the chip reads from. */
  dotStyle,
  size = 'default',
  onClick,
  showChevron,
  className,
  ...rest
}) {
  const interactive = typeof onClick === 'function';
  const chevron = showChevron ?? interactive;

  const body = (
    <>
      <span className="ds-legend__dot" style={{ backgroundColor: toneFill(tone), ...dotStyle }} aria-hidden="true" />
      <span className="ds-legend__label">{label}</span>
      {value != null ? <span className="ds-legend__value">{value}</span> : null}
      {chevron ? (
        <span className="ds-legend__chevron" aria-hidden="true">
          ›
        </span>
      ) : null}
    </>
  );

  const sizeClass = size === 'sm' ? 'ds-legend--sm' : null;

  if (!interactive) {
    return (
      <span className={cx('ds-legend', sizeClass, className)} {...rest}>
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={cx('ds-legend', sizeClass, 'ds-legend--interactive', className)}
      onClick={onClick}
      {...rest}
    >
      {body}
    </button>
  );
}
