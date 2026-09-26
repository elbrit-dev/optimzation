'use client';

import { Avatar, Card, Icon, StatusPill, cx } from '@/design-system';
import { STATUS_LABEL, STATUS_TONE } from '../data/shape';
import { formatMoney, formatQty, hqLabel } from '../data/format';

/* The EBS code chip, at the StatusPill's own 22px box so every chip on the
   card is the same height. Colour sits in its own constant: cx joins without
   resolving conflicts, so a base bg plus an override bg would be decided by
   stylesheet order. */
const CHIP = 'inline-flex h-5.5 shrink-0 items-center whitespace-nowrap rounded-chip px-2 text-10 font-medium leading-none tabular-nums';
const CHIP_NEUTRAL = 'bg-sunken text-ds-secondary';

/* One figure in the card's grey tray — ProductCard's price-tray type: a
   small uppercase label, the count in bold, its value (when it has one)
   muted beneath. A zero stays on the card, muted, so the columns line up
   down the list. */
function Figure({ label, qty, value }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-10 font-semibold uppercase tracking-wide text-ds-muted">{label}</span>
      <span className={cx('truncate text-14 font-bold tabular-nums', qty ? 'text-heading' : 'text-ds-muted')}>{formatQty(qty)}</span>
      {value ? <span className="truncate text-10 tabular-nums text-ds-muted">{formatMoney(value)}</span> : null}
    </span>
  );
}

/* One stockist, laid out like /visit's DoctorCard. ONE card for both places
 * a stockist appears — the list, and the top of its own filling page — so
 * the reader recognises the stockist they tapped on the page it opened.
 *
 * ROW 1 — WHO. Avatar and name with the status pill top right; under the
 * name one chip per EBS code, and the HQ under a pin at the far right. The
 * name truncates and the chips clip; the pill and the HQ never give way.
 *
 * ROW 2 — THE FIGURES. Sales, Closing and Products in ProductCard's grey
 * tray (label above, count, value below), across the card's full width.
 * On the filling page the caller passes the form's LIVE totals, so the
 * card answers "what am I about to submit".
 *
 * `onOpen` makes it the list's control: the whole card is the tap target and
 * the pill carries a small chevron. Without it the card is a header, not a
 * button — no chevron, no hover, no role.
 *
 * The avatar takes its tint from the categorical ramp, never green or red:
 * a stockist is not a status.
 *
 * SELECTING, WITHOUT A MODE (`showCheckbox`, the list's bulk send). A
 * checkbox sits at the card's top-left corner and is the ONLY thing that
 * picks; a tap anywhere else on the card opens its edit page, as always. For
 * a stockist that cannot be sent the box is shown disabled — so the list
 * stays aligned and says at a glance what will not go. The box is its own
 * button and stops its click and key from reaching the card. Without
 * `showCheckbox` (the stockist's own page) the card is unchanged.
 *
 * SHARED WITH SECONDARY APPROVAL, which shows each stockist on this same card
 * so the two screens read as one flow.
 *
 * EXPANDING IN PLACE (`expanded`, `children`). Given `expanded`, the card
 * opens and closes instead of navigating: the pill's chevron points down or
 * up, and `children` — the stockist's products, an approver's decision —
 * render at the bottom of the card. Clicks and keys inside `children` stop
 * there, so typing a space in a field or pressing a button in it does not
 * also toggle the card. */
export function StockistCard({
  entry,
  onOpen,
  className,
  showCheckbox = false,
  selectable = false,
  selected = false,
  onToggle,
  expanded,
  children,
}) {
  const products = entry.lines.length;
  const hq = hqLabel(entry.hq);
  const codes = [entry.ebsCode, ...(entry.otherEbsCodes ?? [])].filter(Boolean);
  const canOpen = typeof onOpen === 'function';
  const pickable = showCheckbox && selectable && typeof onToggle === 'function';
  const interactive = canOpen;
  const pillText = STATUS_LABEL[entry.status];
  const pillTone = STATUS_TONE[entry.status];
  const shownFigures = [
    { label: 'Sales', qty: entry.salesQty, value: entry.salesValue },
    { label: 'Closing', qty: entry.closingQty, value: entry.closingValue },
    { label: 'Products', qty: products },
  ];

  const label = [
    entry.stockist,
    entry.ebsCode,
    entry.otherEbsCodes?.length ? `also ${entry.otherEbsCodes.join(', ')}` : null,
    hq,
    pillText,
    ...shownFigures.map((f) => `${f.label.toLowerCase()} ${formatQty(f.qty)}`),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card
      variant="hairline"
      data-entry={entry.name}
      onClick={canOpen ? () => onOpen(entry.name) : undefined}
      aria-label={interactive ? label : undefined}
      aria-expanded={canOpen && expanded != null ? expanded : undefined}
      /* min-w-0: as a grid or flex item a card will not shrink below its
         min-content, and a nowrap stockist name ("Auctus Labs Private
         Limited") IS its min-content — so a long name pushed the card past a
         320px screen instead of truncating. */
      className={cx('relative flex min-w-0 flex-col gap-2.5', className)}
    >
      {showCheckbox ? (
        /* Top-left corner of the card, over the avatar's corner like a badge
           — the ring in the card's own colour cuts it cleanly out of the
           avatar. Its own button: it is the only thing on the card that
           picks, so its click and key must not also open the card. The hit
           area is padded past the 20px box, since a corner target is small. */
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${entry.stockist} for approval`}
          disabled={!pickable}
          title={pickable ? undefined : 'Nothing to send — fill it first, or it is already sent'}
          onClick={(e) => {
            e.stopPropagation();
            if (pickable) onToggle(entry.name);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="absolute left-0 top-0 z-1 rounded-md p-1 disabled:cursor-not-allowed"
        >
          <span
            aria-hidden="true"
            data-checked={selected || undefined}
            className={cx(
              'flex size-5 items-center justify-center rounded-md border-2 ring-2 transition-colors',
              'ring-surface',
              selected
                ? 'border-brand bg-brand text-on-brand'
                : pickable
                  ? 'border-line-strong bg-surface text-transparent hover:border-brand'
                  : 'border-dashed border-line bg-sunken text-transparent',
            )}
          >
            <Icon name="check" size="var(--fs-12)" />
          </span>
        </button>
      ) : null}
      <span className="flex w-full items-start gap-3">
        <Avatar name={entry.stockist} size="md" aria-hidden="true" />
        {/* Hidden from the tree when the card is a button — its label already
            says all of this. As a header the text IS the content. */}
        <span className="flex min-w-0 flex-1 flex-col gap-1.5" aria-hidden={interactive || undefined}>
          <span className="flex w-full items-start justify-between gap-3">
            <span className="min-w-0 truncate text-14 font-semibold text-heading">{entry.stockist}</span>
            <StatusPill status={pillTone} className="shrink-0 gap-1" title={entry.statusText || undefined}>
              {pillText}
              {canOpen ? (
                <Icon name={expanded == null ? 'chevron-right' : expanded ? 'chevron-up' : 'chevron-down'} size="var(--fs-8)" />
              ) : null}
            </StatusPill>
          </span>
          {/* WHO IN ERP. Every EBS code as its own chip — a stockist billed
              under three codes is three codes, not one with a footnote — and
              the HQ pinned to the far right. The chips clip rather than wrap
              so every card keeps the same height. */}
          {codes.length || hq ? (
            <span className="flex w-full min-w-0 items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1 overflow-hidden">
                {codes.map((code) => (
                  <span key={code} className={cx(CHIP, CHIP_NEUTRAL)} title="EBS code">
                    {code}
                  </span>
                ))}
              </span>
              {hq ? (
                <span className="flex shrink-0 items-center gap-1 text-11 text-ds-muted">
                  <Icon name="map-marker" size="var(--fs-10)" />
                  {hq}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </span>

      {/* ROW 2 — THE FIGURES, in ProductCard's grey tray across the card's
          full width, so a stockist and the products under it read as one
          family on both the entry and the approval screens. */}
      <span className="grid w-full grid-cols-3 gap-2 rounded-xl bg-sunken px-3 py-2.5" aria-hidden={interactive || undefined}>
        {shownFigures.map((f) => (
          <Figure key={f.label} label={f.label} qty={f.qty} value={f.value} />
        ))}
      </span>

      {children ? (
        /* Its own region: nothing in here opens or closes the card. */
        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {children}
        </div>
      ) : null}
    </Card>
  );
}
