'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Icon, cx } from '@/design-system';
import { entryValue } from '../data/selectors';
import { formatMoney, formatMonth, formatQty } from '../data/format';
import { StockistCard } from './StockistCard';
import { ProductPickerSheet } from './ProductPickerSheet';
import { ProductCard } from './ProductCard';
import { PinnedBar, PinnedBarSpacer } from './PinnedBar';

/* One stockist, quantity by item, for this seat — its own page state: it
 * replaces the list, and "All stockists" takes the reader back to the card
 * they opened (SecondaryEntry restores the scroll).
 *
 * Sales AND closing per line — the design shows a single "Qty", but the ERP
 * line and the list both carry the two, and a closing figure keyed nowhere is
 * a closing figure lost. The value column is sales qty × PTS, the same number
 * the server sums into custom_total_sales_value.
 *
 * Editable while the seat's entry is Draft or Rejected. Once submitted it is
 * the approvers' — shown read-only with its tracker status. */

function toFormLines(entry, products) {
  const byItem = new Map(products.map((p) => [p.item, p]));
  return entry.lines.map((l) => ({
    item: l.item,
    pack: l.pack || byItem.get(l.item)?.pack || '',
    price: l.price || byItem.get(l.item)?.price || 0,
    salesQty: l.salesQty ? String(l.salesQty) : '',
    closingQty: l.closingQty ? String(l.closingQty) : '',
  }));
}

/* An underline-only quantity field, sitting in the product card's grey tray
 * — a box inside a card inside a page was three frames for one number. The
 * figure at the card's own number size, a line under it; the tray cell
 * carries the label (`label` here is for use outside one).
 *
 * Not the DS Field: Field's look IS its box (--shadow-field draws the frame),
 * and it has no underline variant to extend. So this is authored from tokens:
 * the underline is `border-line`, darkening on hover (lighter-hover / darker
 * rule for a line), brand while focused, and dashed when disabled so a
 * read-only figure reads as fixed rather than empty. Keyboard focus keeps
 * base.css's ring as well — principle 5, focus is never only a colour swap. */
function QtyInput({ label, ariaLabel, value, onChange, disabled }) {
  const input = (
      <input
        aria-label={label ? undefined : ariaLabel}
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        value={value}
        placeholder="0"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        className={cx(
          'w-full min-w-0 rounded-none border-0 border-b-2 border-line bg-transparent px-0 pb-1 pt-0.5',
          'text-16 font-bold tabular-nums text-heading placeholder:font-semibold placeholder:text-ds-muted',
          'transition-colors hover:border-line-strong focus:border-brand focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus',
          'disabled:border-dashed disabled:text-ds-secondary',
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        )}
      />
  );
  if (!label) return input;
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-10 font-semibold uppercase tracking-wide text-ds-muted">{label}</span>
      {input}
    </label>
  );
}

/* What "unsaved" compares: the figures and the product list, not the
   cosmetic pack/price strings, so an Items query landing late cannot make an
   untouched form look dirty. */
function formSignature(lines) {
  return JSON.stringify(lines.map((l) => [l.item, Number(l.salesQty) || 0, Number(l.closingQty) || 0]));
}

export function EntryForm({ entry, products, canEdit, readOnlyReason, onBack, onSave, onDirtyChange, bottomGap = 'var(--space-12)' }) {
  const rootRef = useRef(null);
  const [barHeight, setBarHeight] = useState(0);
  const [lines, setLines] = useState(() => toFormLines(entry, products));
  /* Fixed for the page's life: a successful save closes it. */
  const [baseline] = useState(() => formSignature(toFormLines(entry, products)));
  const dirty = formSignature(lines) !== baseline;

  /* Tell the screen, so every way out can ask first (useUnsavedGuard). */
  const onDirtyRef = useRef(onDirtyChange);
  onDirtyRef.current = onDirtyChange;
  useEffect(() => {
    onDirtyRef.current?.(dirty);
  }, [dirty]);
  useEffect(() => () => onDirtyRef.current?.(false), []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);

  const editable = canEdit && (entry.status === 'draft' || entry.status === 'rejected' || entry.status === 'revisit');
  /* Sent back for revisit: the approval is still open and waiting, so the
     only way out is to resubmit — a draft save would put Draft lines behind
     a live approval. */
  const revisit = entry.status === 'revisit';
  /* What the picker must not offer: this seat's own lines, and every
     product another BE already carries on this stockist. */
  const addedItems = useMemo(() => new Set([...lines.map((l) => l.item), ...(entry.otherItems ?? [])]), [lines, entry.otherItems]);
  const byItem = useMemo(() => new Map(products.map((p) => [p.item, p])), [products]);
  const total = entryValue(lines);
  const totalSales = lines.reduce((n, l) => n + (Number(l.salesQty) || 0), 0);
  const totalClosing = lines.reduce((n, l) => n + (Number(l.closingQty) || 0), 0);
  const liveEntry = useMemo(
    () => ({
      ...entry,
      lines,
      salesQty: totalSales,
      salesValue: total,
      closingQty: totalClosing,
      closingValue: lines.reduce((n, l) => n + (Number(l.closingQty) || 0) * (Number(l.price) || 0), 0),
    }),
    [entry, lines, totalSales, totalClosing, total],
  );
  const hasAnyQty = lines.some((l) => Number(l.salesQty) > 0 || Number(l.closingQty) > 0);

  const setLine = (index, patch) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const addProduct = (item) => {
    const p = products.find((x) => x.item === item);
    if (!p) return;
    setLines((prev) => (prev.some((l) => l.item === p.item) ? prev : [...prev, { item: p.item, pack: p.pack, price: p.price, salesQty: '', closingQty: '' }]));
  };

  const run = async (submit) => {
    setSaving(submit ? 'submit' : 'draft');
    setError(null);
    try {
      await onSave({
        submit,
        lines: lines.map((l) => ({ item: l.item, price: l.price, salesQty: Number(l.salesQty) || 0, closingQty: Number(l.closingQty) || 0 })),
      });
    } catch (e) {
      setError(e?.message || 'Could not save this entry.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1 rounded-md text-12 font-medium text-brand-text transition-colors hover:text-brand-hover"
      >
        <Icon name="chevron-left" size="sm" />
        All stockists
      </button>

      {/* THE SAME CARD the list showed — so the reader knows at a glance
          they landed on the stockist they tapped — but fed the form's LIVE
          totals, so it reads "what am I about to submit" as they type. */}
      <StockistCard entry={liveEntry} />

      {/* What this page is for — or, once submitted, the tracker's own words
          for where it has got to. */}
      <p className="truncate px-1 text-11 text-ds-muted">
        {formatMonth(entry.month)} entry · quantity by item
        {editable && entry.status === 'rejected' ? ' · sent back, correct and resubmit' : ''}
        {revisit ? ' · sent back for revisit' : ''}
        {!editable && entry.statusText ? ` · ${entry.statusText}` : ''}
      </p>
      {/* The approver's reason, where the BE will act on it — statusText
          carries it for a revisit (see shape.revisitReason). */}
      {revisit ? (
        <p role="note" className="flex items-start gap-2 rounded-lg bg-danger-wash px-3 py-2 text-12 text-danger-text">
          <Icon name="replay" size="sm" className="mt-px shrink-0" />
          <span>
            <span className="font-semibold">Sent back for revisit: </span>
            {entry.statusText}
          </span>
        </p>
      ) : null}

      {/* EACH LINE IS THE CATALOGUE'S OWN PRODUCT CARD, in its single-product
          mode — the brand as the name and the variant as a chip at the right,
          the same card the approver sees — so a product looks the same where
          it is filled and where it is decided. The grey tray that carries
          prices in the catalogue carries the two quantity inputs here, and
          the line's value (a by-product of them) as its third cell. */}
      {lines.length === 0 ? (
        <Card variant="hairline" className="py-6 text-center text-12 text-ds-muted">
          No products yet — add the ones this stockist carries.
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((l, i) => {
            const value = (Number(l.salesQty) || 0) * (Number(l.price) || 0);
            const product = byItem.get(l.item);
            const row = product?.row ?? { item_name: l.item, custom_last_pts: l.price || null };
            /* An item with no brand of its own stands as its own brand (see
               normalizeProducts), and then there is no variant chip. */
            const brand = product?.brand && product.brand !== l.item ? product.brand : undefined;
            return (
              <li key={l.item}>
                <ProductCard
                  data={row}
                  brand={brand}
                  singleProduct
                  variantChip={Boolean(brand)}
                  clickable={false}
                  showPrices={false}
                  tray={[
                    {
                      label: 'Sales',
                      value: <QtyInput ariaLabel={`${l.item} sales`} value={l.salesQty} disabled={!editable} onChange={(v) => setLine(i, { salesQty: v })} />,
                    },
                    {
                      label: 'Closing',
                      value: <QtyInput ariaLabel={`${l.item} closing`} value={l.closingQty} disabled={!editable} onChange={(v) => setLine(i, { closingQty: v })} />,
                    },
                    { label: 'Value', value: value ? formatMoney(value) : '—', caption: l.pack || undefined },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}

      {editable && products.length ? (
        <>
          <Button type="dashed" size="lg" block icon={<Icon name="plus" size="sm" />} onClick={() => setPickerOpen(true)}>
            Add product
          </Button>
          <ProductPickerSheet
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            stockist={entry.stockist}
            products={products}
            addedItems={addedItems}
            onAdd={(p) => addProduct(p.item)}
          />
        </>
      ) : null}

      {!canEdit && readOnlyReason ? <p className="text-11 text-ds-muted">{readOnlyReason}</p> : null}
      {!editable && canEdit ? (
        <p className="text-11 text-ds-muted">
          Submitted {formatQty(entry.salesQty)} sales · {formatQty(entry.closingQty)} closing — now with the approvers.
        </p>
      ) : null}
      {error ? <p role="alert" className="text-12 text-danger-text">{error}</p> : null}

      {/* The total and the two actions, pinned to the bottom of the SCREEN
          (PinnedBar — fixed and portalled, since `sticky` cannot stick
          inside the provider's overflow slot), so they stay in reach however
          many products the stockist carries. The spacer lets the last
          product scroll clear of it. */}
      <PinnedBarSpacer height={barHeight} bottomGap={bottomGap} />
      <PinnedBar anchorRef={rootRef} bottomGap={bottomGap} onHeight={setBarHeight}>
      <Card className="flex flex-col gap-3 shadow-pop" role="region" aria-label="Entry total and save">
        <div className="flex items-start justify-between gap-3">
          <span className="text-12 text-ds-secondary">Entry total</span>
          <span className="flex flex-col items-end">
            <span className="text-14 font-semibold tabular-nums text-heading">
              {formatQty(totalSales)} sales · {formatQty(totalClosing)} closing
            </span>
            <span className="text-10 tabular-nums text-ds-muted">{formatMoney(total)}</span>
          </span>
        </div>
        {editable ? (
          revisit ? (
            <Button type="primary" size="lg" block loading={saving === 'submit'} disabled={saving != null || !hasAnyQty} onClick={() => run(true)}>
              Resubmit for approval
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button type="default" size="lg" block loading={saving === 'draft'} disabled={saving != null || !lines.length} onClick={() => run(false)}>
                Save draft
              </Button>
              <Button type="primary" size="lg" block loading={saving === 'submit'} disabled={saving != null || !hasAnyQty} onClick={() => run(true)}>
                Submit for approval
              </Button>
            </div>
          )
        ) : null}
      </Card>
      </PinnedBar>
    </div>
  );
}
