import React, { useMemo } from "react";
import ProductCard from "./ProductCard";

/**
 * CatalogLetterGroup — ONE letter, MANY brand cards.
 *
 * Combines the letter heading and the Product Cards so a whole letter group is
 * a single binding: pass the "A" group and every brand under A renders as its
 * own card beneath one shared letter — instead of repeating Letter Section per
 * brand and getting a red "A" above every card.
 *
 * The letter is a plain in-flow heading on its OWN ROW, at the left of the
 * group; the cards start on the next row, centered at `cardWidth`. It
 * deliberately does NOT pin/float while the cards scroll — the old JS-pinned
 * (position:fixed) letter rode on top of the first card and read as "letter
 * and card in the same row".
 *
 * Warehouse chips (KA – 3,978 / CB – 0 …) are built in, rendered from the
 * SELECTED variant's warehouses[] — they swap when a pill is picked. Zero = red,
 * at/below lowStockThreshold = amber.
 *
 * DATA (`data` prop) — tolerant of shape:
 *   { letter: "A", brands: [{ brand__name, items }] }   letter group with brand
 *       grouping inside (the recommended transformer shape — repeat this
 *       component per letter and bind currentItem)
 *   { letter: "A", items: [rows across brands] }        rows grouped by brandField
 *   [{ letter, brand__name, items }, ...]               per-brand entries — pass one
 *       letter's entries, or the whole dataset plus the `letter` prop to select
 *   [rows]                                              flat rows, grouped by brandField
 * Rows use the same fields as Product Card, plus warehouses[{ code, qty }] and
 * total_stock. Rows with a null brand fall back to their entry's brand__name.
 */

function readField(row, key) {
  if (!row || !key) return undefined;
  if (row[key] != null) return row[key];
  const parts = String(key).includes("__") ? String(key).split("__") : String(key).split(".");
  let cursor = row;
  for (const part of parts) {
    if (cursor == null) return undefined;
    if (typeof cursor !== "object") return cursor;
    cursor = cursor[part];
  }
  return cursor;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatInt(value) {
  const n = toNumber(value);
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-IN");
}

/** Flatten every accepted shape into [{ row, entryBrand, entryLetter }]. */
function collectRows(data, letterFilter) {
  const out = [];
  const wanted = letterFilter ? String(letterFilter).trim().charAt(0).toUpperCase() : null;
  const pushEntry = (entry) => {
    if (!entry || typeof entry !== "object") return;
    const entryLetter = entry.letter != null ? String(entry.letter).trim().charAt(0).toUpperCase() : null;
    // Letter group with brand grouping inside: { letter, brands: [{ brand__name, items }] }
    if (Array.isArray(entry.brands)) {
      if (wanted && entryLetter && entryLetter !== wanted) return;
      entry.brands.forEach((brandEntry) => {
        if (!brandEntry || typeof brandEntry !== "object" || !Array.isArray(brandEntry.items)) return;
        brandEntry.items.filter(Boolean).forEach((row) =>
          out.push({ row, entryBrand: brandEntry.brand__name ?? brandEntry.brand ?? null, entryLetter }),
        );
      });
      return;
    }
    if (Array.isArray(entry.items)) {
      if (wanted && entryLetter && entryLetter !== wanted) return;
      entry.items.filter(Boolean).forEach((row) =>
        out.push({ row, entryBrand: entry.brand__name ?? entry.brand ?? null, entryLetter }),
      );
      return;
    }
    // A plain row.
    out.push({ row: entry, entryBrand: null, entryLetter: null });
  };
  if (Array.isArray(data)) data.forEach(pushEntry);
  else pushEntry(data);
  return out;
}

function chipTone(qty, lowStockThreshold) {
  const n = toNumber(qty) ?? 0;
  if (n <= 0) return "bg-red-50 text-red-600 border border-red-100";
  if (n <= lowStockThreshold) return "bg-amber-50 text-amber-700 border border-amber-100";
  return "bg-gray-50 text-slate-600 border border-gray-200";
}

function WarehouseChips({ list, lowStockThreshold }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((wh, index) => {
        const code = String(wh?.code ?? "").trim() || `W${index}`;
        const qty = toNumber(wh?.qty) ?? 0;
        return (
          <span
            key={`${code}-${index}`}
            title={wh?.warehouse ?? code}
            className={`rounded-lg px-2 py-1 text-xs font-semibold ${chipTone(qty, lowStockThreshold)}`}
          >
            {code} – {formatInt(qty)}
          </span>
        );
      })}
    </div>
  );
}

export default function CatalogLetterGroup({
  data,
  letter,
  showLetter = true,
  letterClassName,
  brandField = "brand__name",
  variantNameField = "item_name",
  priceFields,
  totalStockField = "total_stock",
  showWarehouseChips = true,
  warehousesField = "warehouses",
  lowStockThreshold = 100,
  clickable = true,
  onCardClick,
  // Fixed card width — 320px is the mobile standard. Cards are centered and
  // never exceed the viewport (max-width caps at 100%).
  cardWidth = "320px",
  className,
}) {
  // One entry per brand, preserving the order brands first appear.
  const { resolvedLetter, brands } = useMemo(() => {
    const collected = collectRows(data, letter);
    const byBrand = new Map();
    let firstLetter = null;
    collected.forEach(({ row, entryBrand, entryLetter }) => {
      if (!firstLetter && entryLetter) firstLetter = entryLetter;
      const brandName = String(readField(row, brandField) ?? entryBrand ?? "—").trim() || "—";
      if (!byBrand.has(brandName)) byBrand.set(brandName, []);
      byBrand.get(brandName).push(row);
    });
    const groups = Array.from(byBrand.entries()).map(([brandName, rows]) => ({ brand: brandName, rows }));
    const fallbackLetter = groups.length > 0 ? groups[0].brand.charAt(0).toUpperCase() : "#";
    const resolved = (letter ? String(letter).trim().charAt(0).toUpperCase() : null) || firstLetter || fallbackLetter;
    return { resolvedLetter: /[A-Z]/.test(resolved) ? resolved : "#", brands: groups };
  }, [data, letter, brandField]);

  const renderChips = useMemo(() => {
    if (!showWarehouseChips) return undefined;
    function chipsForActiveRow(activeRow) {
      const list = readField(activeRow, warehousesField);
      if (!Array.isArray(list) || list.length === 0) return null;
      return <WarehouseChips list={list.filter(Boolean)} lowStockThreshold={lowStockThreshold} />;
    }
    return chipsForActiveRow;
  }, [showWarehouseChips, warehousesField, lowStockThreshold]);

  if (brands.length === 0) return null;

  return (
    <section data-letter={resolvedLetter} className={`scroll-mt-4 space-y-3 ${className ?? ""}`}>
      {showLetter ? (
        <h2 className={letterClassName ?? "px-1 text-sm font-bold text-red-600"}>{resolvedLetter}</h2>
      ) : null}
      {brands.map(({ brand, rows }) => (
        <div
          key={brand}
          className="mx-auto w-full"
          style={cardWidth ? { width: cardWidth, maxWidth: "100%" } : undefined}
        >
          <ProductCard
            data={rows}
            brand={brand}
            brandField={brandField}
            variantNameField={variantNameField}
            priceFields={priceFields}
            totalStockField={totalStockField}
            clickable={clickable}
            onCardClick={onCardClick}
            renderExtras={renderChips}
          />
        </div>
      ))}
    </section>
  );
}
