'use client';

import { isValidElement, useCallback, useMemo, useState } from 'react';
import { Card, Icon, cx } from '@/design-system';

/* ProductCard — ONE catalogue card for ONE brand: title, "N variants", the
 * variant pills (10 / 20 / 40) and the MRP / PTR / PTS row for whichever pill
 * is selected. Ported from elbrit-app's components/ProductCard.jsx — same
 * props, same data tolerance, same pill order, same click payload — so a
 * handler written against one works against the other.
 *
 * ADAPTED TO THE DESIGN SYSTEM, NOT PASTED (DoctorCard's rule). The original
 * is stock Tailwind, and `tailwind-strict.css` deletes the stock palette, so a
 * verbatim copy would emit no rules at all. The mapping:
 *
 *   bg-white + shadow-sm                    -> Card (shadow variant — the DS allows
 *                                              one of border/shadow, and the app's
 *                                              card reads as the soft shadow)
 *   text-[#1e2a5a] (navy)                   -> text-heading (--elbrit-navy, the same navy)
 *   text-gray-400 / -600                    -> text-ds-muted / text-ds-secondary
 *   text-lg extrabold / text-sm / 10px      -> text-18 extrabold / text-13–14 / text-10
 *   bg-gray-50 price tray                   -> bg-sunken
 *   selected pill bg-[#1e2a5a] text-white   -> bg-heading text-on-brand (the app's navy pill)
 *   pill border-gray-200 bg-white           -> border-line bg-surface
 *   hover:border-indigo-200 + ring-indigo   -> hover:border-brand + the DS focus ring
 *
 * Same colours as elbrit-app, through tokens. The lift-on-hover is dropped on
 * purpose: principle 5 is hover lighter, press darker — no movement. */

function normalizeRows(data) {
  if (data == null) return [];
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    const looksLikeEdges = data.some((d) => d && typeof d === 'object' && d.node);
    return looksLikeEdges ? data.map((d) => d?.node ?? d).filter(Boolean) : data.filter(Boolean);
  }
  if (typeof data !== 'object') return [];
  if (Array.isArray(data.edges)) return data.edges.map((e) => e?.node ?? e).filter(Boolean);
  if (Array.isArray(data.nodes)) return data.nodes.filter(Boolean);
  return [data];
}

/* Flattened ("brand__name") or nested ({ brand: { name } }), tolerating a
   scalar Link value at the parent. */
export function readField(row, key) {
  if (!row || !key) return undefined;
  if (row[key] != null) return row[key];
  const parts = String(key).includes('__') ? String(key).split('__') : String(key).split('.');
  let cursor = row;
  for (const part of parts) {
    if (cursor == null) return undefined;
    if (typeof cursor !== 'object') return cursor;
    cursor = cursor[part];
  }
  return cursor;
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(value) {
  const n = toNumber(value);
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatInt(value) {
  const n = toNumber(value);
  if (n == null) return '—';
  return Math.round(n).toLocaleString('en-IN');
}

/* "ROZULA CV 10" under brand "ROZULA" -> "CV 10"; falls back to the full name. */
export function variantLabel(itemName, brand) {
  const name = String(itemName ?? '').trim();
  const b = String(brand ?? '').trim();
  if (!name) return '';
  if (b && name.toUpperCase().startsWith(b.toUpperCase())) {
    const rest = name.slice(b.length).replace(/^[-\s]+/, '').trim();
    if (rest) return rest;
  }
  return name;
}

/* Numeric-leading variants ("10", "10F") before word-leading ("CV 10"); then
   pack size ascending; then a plain number before a suffixed one. */
function parseVariantSortKey(label) {
  const s = String(label ?? '').trim();
  const match = s.match(/\d+/);
  if (!match) return { group: 2, size: Infinity, kind: 3, label: s };
  const size = Number(match[0]);
  const before = s.slice(0, match.index).trim();
  const after = s.slice(match.index + match[0].length).trim();
  return { group: before ? 1 : 0, size, kind: before ? 2 : after ? 1 : 0, label: s };
}

function compareVariantSortKeys(a, b) {
  if (a.group !== b.group) return a.group - b.group;
  if (a.size !== b.size) return a.size - b.size;
  if (a.kind !== b.kind) return a.kind - b.kind;
  return a.label.localeCompare(b.label);
}

const DEFAULT_PRICE_FIELDS = [
  { field: 'custom_last_mrp', label: 'MRP' },
  { field: 'custom_last_ptr', label: 'PTR' },
  { field: 'custom_last_pts', label: 'PTS' },
];

export function ProductCard({
  data,
  brand,
  brandField = 'brand__name',
  variantNameField = 'item_name',
  priceFields,
  totalStock,
  totalStockField,
  clickable = true,
  onCardClick,
  onVariantChange,
  singleProduct = false,
  showBrandLine = true,
  /* The price tray. Off where the card holds a line being FILLED rather than
     a product being chosen — the figures there are the quantities. (An empty
     priceFields cannot mean "none": it falls back to MRP/PTR/PTS, as in the
     elbrit-app original.) */
  showPrices = true,
  /* A product INSIDE another card (a stockist's lines): a hairline instead
     of a shadow, and the title at list size rather than the catalogue's
     18px capitals, so a column of them reads as rows, not as a catalogue. */
  compact = false,
  /* Single-product mode only: the BRAND as the title and the item's variant
     as a chip at the right ("CALBRIT" · [60K]) — one variant per card; a
     second variant is a second card. No chip when the item is just the
     brand ("C FERT"). */
  variantChip = false,
  /* Custom cells for the grey tray, in place of the price fields:
     [{ label, value, caption? }]. Secondary Approval shows Sales / Closing
     here, in the same tray the catalogue shows MRP / PTR / PTS in. A
     `value` that is an element (Secondary Entry's quantity inputs) is
     placed as it is, without the figure's text styling. */
  tray,
  /* Choice mode, for a picker. `isRowSelected(row)` marks a variant as
     picked; while any of the card's variants is, a tick sits top right.
     With `onRowToggle` as well, several variants can be picked: each pill
     is its own toggle — filled navy while picked, outlined when not — and
     a tap also brings that variant's prices up. */
  isRowSelected,
  onRowToggle,
  /* Code-only: receives the SELECTED variant's row, renders below the price
     row — so an extra (stock chips, an "Added" mark) follows the active pill. */
  renderExtras,
  children,
  className,
}) {
  const rows = useMemo(() => normalizeRows(data), [data]);

  const resolvedPriceFields = useMemo(() => {
    const list = Array.isArray(priceFields) && priceFields.length > 0 ? priceFields : DEFAULT_PRICE_FIELDS;
    return list
      .map((pf) => {
        if (typeof pf === 'string') return { field: pf, label: pf };
        if (!pf || !pf.field) return null;
        return { field: String(pf.field), label: String(pf.label ?? pf.field) };
      })
      .filter(Boolean);
  }, [priceFields]);

  const brandName = useMemo(() => {
    const explicit = String(brand ?? '').trim();
    if (explicit) return explicit;
    return String(readField(rows[0], brandField) ?? '—').trim() || '—';
  }, [brand, rows, brandField]);

  const [activeIndex, setActiveIndex] = useState(0);
  const active = singleProduct
    ? (rows[0] ?? null)
    : (rows[Math.min(activeIndex, Math.max(rows.length - 1, 0))] ?? null);

  const chip =
    singleProduct && variantChip && active ? variantLabel(readField(active, variantNameField), brandName) : '';
  const showChip = Boolean(chip) && chip.toUpperCase() !== String(brandName).toUpperCase();
  const title = useMemo(() => {
    if (!singleProduct || (variantChip && brandName !== '—')) return brandName;
    const name = String(readField(active, variantNameField) ?? '').trim();
    return name || brandName;
  }, [singleProduct, variantChip, brandName, active, variantNameField]);

  const totalValue = totalStock ?? (totalStockField && active ? readField(active, totalStockField) : null);
  const showTotal = toNumber(totalValue) != null;

  /* Display order for the pills only — indices still point into `rows`. */
  const sortedVariants = useMemo(
    () =>
      rows
        .map((row, index) => ({ row, index, label: variantLabel(readField(row, variantNameField), brandName) }))
        .sort((a, b) => compareVariantSortKeys(parseVariantSortKey(a.label), parseVariantSortKey(b.label))),
    [rows, variantNameField, brandName],
  );

  const selectVariant = useCallback(
    (index) => {
      setActiveIndex(index);
      onVariantChange?.({ index, variant: variantLabel(readField(rows[index], variantNameField), brandName), row: rows[index] });
    },
    [onVariantChange, rows, variantNameField, brandName],
  );

  const fire = useCallback(() => {
    if (!clickable || !onCardClick) return;
    onCardClick({
      brand: brandName,
      variant: active ? variantLabel(readField(active, variantNameField), brandName) : null,
      row: active,
      variants: rows,
    });
  }, [clickable, onCardClick, brandName, active, variantNameField, rows]);

  const interactive = clickable && typeof onCardClick === 'function';
  const choice = typeof isRowSelected === 'function';
  /* The mark top right is a checkbox's three states, for the whole card:
     every variant chosen → a solid tick; some → a light dash (the
     "indeterminate" mark); none → nothing. */
  const chosenCount = choice ? rows.filter((r) => isRowSelected(r)).length : 0;
  const allSelected = chosenCount > 0 && chosenCount === rows.length;
  const someSelected = chosenCount > 0 && !allSelected;
  const multiPick = choice && typeof onRowToggle === 'function';

  return (
    <Card
      variant={compact ? 'hairline' : 'shadow'}
      onClick={interactive ? fire : undefined}
      aria-pressed={choice && interactive ? (allSelected ? true : someSelected ? 'mixed' : false) : undefined}
      className={cx('relative flex flex-col', compact ? 'gap-2' : 'gap-3', className)}
    >
      {allSelected || someSelected ? (
        <span
          aria-hidden="true"
          data-mark={allSelected ? 'all' : 'some'}
          className={cx(
            'absolute right-3 top-3 flex size-6 items-center justify-center rounded-full',
            allSelected ? 'bg-brand text-on-brand' : 'bg-brand-tint text-brand-text',
          )}
        >
          <Icon name={allSelected ? 'check' : 'minus'} size="var(--fs-12)" />
        </span>
      ) : null}
      <div className={cx('flex items-start justify-between gap-3', choice && 'pr-8')}>
        <div className="min-w-0">
          <h3 className={cx('truncate text-heading', compact ? 'text-13 font-bold' : 'text-18 font-extrabold uppercase tracking-tight')}>{title}</h3>
          {singleProduct ? (
            showBrandLine && !variantChip && brandName && brandName !== title ? (
              <p className="mt-0.5 truncate text-11 text-ds-muted">{brandName}</p>
            ) : null
          ) : rows.length > 0 ? (
            <p className="mt-0.5 text-11 text-ds-muted">
              {rows.length} {rows.length === 1 ? 'variant' : 'variants'}
            </p>
          ) : null}
        </div>
        {showChip ? (
          <span className="shrink-0 rounded-full bg-heading px-3 py-1 text-12 font-semibold text-on-brand">{chip}</span>
        ) : null}
        {showTotal ? (
          <div className="shrink-0 text-right">
            <p className="text-10 font-semibold uppercase tracking-wide text-ds-muted">Global stock</p>
            <p className="text-18 font-bold tabular-nums text-heading">{formatInt(totalValue)}</p>
          </div>
        ) : null}
      </div>

      {!singleProduct && rows.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {sortedVariants.map(({ row, index, label }) => {
            /* In multi-pick mode the pill shows whether it is PICKED; in
               the catalogue it shows which variant's prices are up. */
            const selected = multiPick ? isRowSelected(row) : index === Math.min(activeIndex, rows.length - 1);
            return (
              <button
                key={`${label}-${index}`}
                type="button"
                aria-pressed={selected}
                onClick={(e) => {
                  /* Picking a variant is not clicking the card. */
                  e.stopPropagation();
                  selectVariant(index);
                  if (multiPick) onRowToggle(row);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className={cx(
                  'rounded-full border px-3.5 py-1.5 text-13 font-semibold transition-colors',
                  selected
                    ? 'border-heading bg-heading text-on-brand'
                    : 'border-line bg-surface text-ds-secondary hover:border-brand',
                )}
              >
                {label || '—'}
              </button>
            );
          })}
        </div>
      ) : null}

      {Array.isArray(tray) && tray.length ? (
        <div className="grid gap-2 rounded-xl bg-sunken px-3 py-2.5" style={{ gridTemplateColumns: `repeat(${tray.length}, minmax(0, 1fr))` }}>
          {tray.map((cell) => (
            <div key={cell.label} className="min-w-0">
              <p className="text-10 font-semibold uppercase tracking-wide text-ds-muted">{cell.label}</p>
              {isValidElement(cell.value) ? (
                <div className="mt-0.5">{cell.value}</div>
              ) : (
                <p className="truncate text-14 font-bold tabular-nums text-heading">{cell.value}</p>
              )}
              {cell.caption ? <p className="truncate text-10 tabular-nums text-ds-muted">{cell.caption}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {showPrices && active && resolvedPriceFields.length > 0 ? (
        <div
          className="grid gap-2 rounded-xl bg-sunken px-3 py-2.5"
          style={{ gridTemplateColumns: `repeat(${resolvedPriceFields.length}, minmax(0, 1fr))` }}
        >
          {resolvedPriceFields.map((pf) => (
            <div key={pf.field} className="min-w-0">
              <p className="text-10 font-semibold uppercase tracking-wide text-ds-muted">{pf.label}</p>
              <p className="truncate text-14 font-bold tabular-nums text-heading">{formatMoney(readField(active, pf.field))}</p>
            </div>
          ))}
        </div>
      ) : null}

      {typeof renderExtras === 'function' && active ? <div>{renderExtras(active)}</div> : null}
      {children ? <div>{children}</div> : null}
    </Card>
  );
}

export default ProductCard;
