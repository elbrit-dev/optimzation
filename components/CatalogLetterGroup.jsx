import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePlasmicCanvasContext } from "@plasmicapp/loader-nextjs";
import ProductCard from "./ProductCard";

/**
 * CatalogLetterGroup — ONE letter, MANY brand cards.
 *
 * Combines the letter heading and the Product Cards so a whole letter group is
 * a single binding: pass the "A" group and every brand under A renders as its
 * own card beneath one shared letter — instead of repeating Letter Section per
 * brand and getting a red "A" above every card.
 *
 * The letter is STICKY: it pins to the top while its cards scroll past and is
 * pushed away when the next letter group arrives (repeat this component over
 * the letter-grouped array and the handoff works automatically).
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
  stickyLetter = true,
  stickyOffset = "0px",
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
    <LetterSection
      resolvedLetter={resolvedLetter}
      showLetter={showLetter}
      stickyLetter={stickyLetter}
      stickyOffset={stickyOffset}
      letterClassName={letterClassName}
      className={className}
    >
      <div className="space-y-3">
        {brands.map(({ brand, rows }) => (
          <div key={brand} className="mx-auto w-full" style={cardWidth ? { width: cardWidth, maxWidth: "100%" } : undefined}>
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
      </div>
    </LetterSection>
  );
}

/** stickyOffset -> pixels. Supports px (or unitless), vh, vw and rem. */
function resolveOffsetPx(value) {
  if (typeof value === "number") return value;
  const s = String(value ?? "").trim();
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  if (typeof window === "undefined") return n;
  if (s.endsWith("vh")) return (n / 100) * window.innerHeight;
  if (s.endsWith("vw")) return (n / 100) * window.innerWidth;
  if (s.endsWith("rem")) {
    const rootSize = parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    return n * rootSize;
  }
  return n; // px or unitless
}

/**
 * Section wrapper with a JS-pinned letter heading (contacts-app style):
 * the letter rides in flow, PINS below `stickyOffset` while its section
 * scrolls past, and is pushed out by the next section. Implemented with a
 * scroll-driven fixed/absolute swap instead of CSS position:sticky, because
 * sticky silently dies inside page-builder sections that have overflow set.
 */
function LetterSection({ resolvedLetter, showLetter, stickyLetter, stickyOffset, letterClassName, className, children }) {
  const sectionRef = useRef(null);
  const letterRef = useRef(null);
  // mode: 'static' (in flow, at the TOP of its section) | 'pinned' (fixed below
  // the header while the section scrolls past). There is deliberately no
  // "pushed out at the bottom" phase — that parked the letter over the last
  // card. When the section's end approaches, the letter simply unpins and the
  // next section's letter takes over once it reaches the top.
  const [pin, setPin] = useState({ mode: "static", left: 0, width: 0, height: 0 });
  // Inside Plasmic Studio the artboard pans instead of scrolling, so viewport
  // math is meaningless — always render the letter in flow at the top there.
  const inCanvas = usePlasmicCanvasContext();

  useEffect(() => {
    if (!showLetter || !stickyLetter || inCanvas) return undefined;
    let frame = null;
    const update = () => {
      frame = null;
      const section = sectionRef.current;
      const letterEl = letterRef.current;
      if (!section || !letterEl) return;
      const offset = resolveOffsetPx(stickyOffset);
      const rect = section.getBoundingClientRect();
      const height = letterEl.offsetHeight || 0;
      const mode = rect.top < offset && rect.bottom > offset + height ? "pinned" : "static";
      setPin((prev) =>
        prev.mode === mode && prev.left === rect.left && prev.width === rect.width && prev.height === height
          ? prev
          : { mode, left: rect.left, width: rect.width, height },
      );
    };
    const onScroll = () => {
      if (frame == null) frame = window.requestAnimationFrame(update);
    };
    update();
    // Capture phase catches window scrolls AND nested scroll containers.
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      if (frame != null) window.cancelAnimationFrame(frame);
    };
  }, [showLetter, stickyLetter, stickyOffset, inCanvas]);

  const pinnedStyle =
    pin.mode === "pinned" && !inCanvas
      ? { position: "fixed", top: resolveOffsetPx(stickyOffset), left: pin.left, width: pin.width, zIndex: 20 }
      : undefined;

  // The heading is EXACTLY CatalogLetterSection's — a plain small red letter,
  // no background, in every state. Pinning only changes its position.
  const letterClasses = "px-1 text-sm font-bold text-red-600";

  return (
    <section
      ref={sectionRef}
      data-letter={resolvedLetter}
      className={`relative scroll-mt-4 space-y-3 ${className ?? ""}`}
    >
      {showLetter ? (
        // The placeholder keeps the row's space when the heading leaves the flow.
        <div style={pin.mode !== "static" && pin.height ? { height: pin.height } : undefined}>
          <h2
            ref={letterRef}
            className={letterClassName ?? letterClasses}
            style={pinnedStyle}
          >
            {resolvedLetter}
          </h2>
        </div>
      ) : null}
      {children}
    </section>
  );
}
