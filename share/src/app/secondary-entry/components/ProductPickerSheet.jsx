'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Icon, Sheet } from '@/design-system';
import { productGroups } from '../data/selectors';
import { ProductCard } from './ProductCard';

/* "+ Add product" — the catalogue as product cards in a Sheet, over the
 * stockist's page. One card per brand; its pills pick the variant.
 *
 * CHOOSE, THEN CONFIRM. Each variant pill is a toggle: tap to choose it
 * (filled), tap again to drop it — several variants of one brand can be
 * chosen. A tap on the card body toggles the variant whose prices are up.
 * A card with anything chosen shows a tick. Nothing reaches the entry until
 * "Add N products", whose count says how many are chosen; Discard, the ×,
 * Escape or the scrim all drop the choice.
 *
 * ONLY WHAT IS NOT ON THE ENTRY YET: a product already added is not offered,
 * so no card needs an "added" mark and there is no filter.
 *
 * Search lives in the Sheet's `toolbar` — it acts on the list, so it must not
 * scroll away from it (Sheet's own note on the slot). */

export function ProductPickerSheet({ open, onClose, stockist, products, addedItems, onAdd }) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(() => new Set());

  /* A fresh sheet every time it opens: the last visit's choice and search
     are not carried into the next. */
  useEffect(() => {
    if (open) {
      setChosen(new Set());
      setQuery('');
    }
  }, [open]);

  const groups = useMemo(
    () => productGroups(products, { query, filter: 'notAdded', added: addedItems }),
    [products, query, addedItems],
  );
  const remaining = useMemo(() => products.filter((p) => !addedItems.has(p.item)).length, [products, addedItems]);
  const byRow = useMemo(() => new Map(products.map((p) => [p.row, p])), [products]);
  const chosenProducts = useMemo(() => products.filter((p) => chosen.has(p.item)), [products, chosen]);

  const toggle = (item) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });

  const discard = () => {
    setChosen(new Set());
    onClose();
  };
  const confirm = () => {
    chosenProducts.forEach((p) => onAdd(p));
    setChosen(new Set());
    onClose();
  };

  const count = chosenProducts.length;

  return (
    <Sheet
      open={open}
      onClose={discard}
      surface="app"
      title="Add product"
      subtitle={stockist ? `${stockist} · ${remaining} not on this entry` : undefined}
      toolbar={
        <Field
          size="lg"
          type="search"
          placeholder="Search brand or product…"
          value={query}
          onChange={setQuery}
          aria-label="Search products"
          prefix={<Icon name="search" size="sm" />}
        />
      }
    >
      {groups.length ? (
        <div className="flex flex-col gap-2 pt-1">
          {groups.map(({ brand, items }) => (
            <ProductCard
              key={brand}
              brand={brand}
              data={items.map((i) => i.row)}
              isRowSelected={(row) => chosen.has(byRow.get(row)?.item)}
              onRowToggle={(row) => {
                const product = byRow.get(row);
                if (product) toggle(product.item);
              }}
              onCardClick={({ row }) => {
                const product = byRow.get(row);
                if (product) toggle(product.item);
              }}
            />
          ))}
        </div>
      ) : (
        <p className="py-10 text-center text-12 text-ds-muted">
          {query ? `No product matches "${query}".` : 'Every product is already on this entry.'}
        </p>
      )}

      {/* Pinned to the sheet's bottom edge: the two ways out. The negative
          margins match .ds-sheet__body's 16px inline and bottom padding, so
          the bar runs edge to edge — and `-bottom-4`, not `bottom-0`: a
          sticky box stops at the scroller's PADDING edge, which left a 16px
          strip under the bar with the list scrolling through it. */}
      <div className="sticky -bottom-4 z-1 -mx-4 -mb-4 mt-3 border-t border-line-subtle bg-surface px-4 pb-4 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <Button type="default" size="lg" block onClick={discard}>
            Discard
          </Button>
          <Button type="primary" size="lg" block disabled={!count} onClick={confirm}>
            {count ? `Add ${count} product${count === 1 ? '' : 's'}` : 'Add'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
