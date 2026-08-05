import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * ProductCatalogCards — the A–Z product catalogue card list.
 *
 * One card per BRAND (ACIBRIT, AMLOBRIT, …), with its items as selectable variant
 * pills (10 / 20 / 40). Picking a pill swaps the MRP / PTR / PTS row to that item's
 * prices. Cards are grouped into A–Z sections with a letter rail for jumping.
 *
 * Warehouse / per-depot stock is deliberately NOT rendered here — that gets added
 * separately. The only stock shown is the optional GLOBAL STOCK total, and only when
 * `totalStockField` names a column that already holds the total.
 *
 * DATA (`data` prop) — tolerant of shape, accepts any of:
 *   - an array of nodes             [ node, ... ]        (e.g. $ctx.data.main.rawData)
 *   - an array of edges            [ { node }, ... ]
 *   - the connection               { edges: [ { node } ] }
 *   - the whole query object       { Items: { edges: [...] } }
 *
 * Each node is one item, using (defaults, all overridable):
 *   brand__name        the card title / grouping key
 *   item_name          the item, e.g. "ROZULA CV 10" -> variant pill "CV 10"
 *   custom_last_mrp / custom_last_ptr / custom_last_pts
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Unwrap the various connection/edge shapes down to a flat array of nodes. */
function normalizeRows(data) {
  if (data == null) return [];
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    const looksLikeEdges = data.some((d) => d && typeof d === "object" && d.node);
    return looksLikeEdges ? data.map((d) => d?.node ?? d).filter(Boolean) : data.filter(Boolean);
  }
  if (typeof data !== "object") return [];
  if (Array.isArray(data.edges)) return data.edges.map((e) => e?.node ?? e).filter(Boolean);
  if (Array.isArray(data.nodes)) return data.nodes.filter(Boolean);
  // Whole query object — take the first value that itself unwraps to rows.
  for (const value of Object.values(data)) {
    if (value && typeof value === "object") {
      const nested = normalizeRows(value);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

/**
 * Read a field whether the row is flattened ("brand__name") or nested
 * ({ brand: { name } }), and tolerate a plain scalar at the parent ({ brand: "X" }).
 */
function readField(row, key) {
  if (!row || !key) return undefined;
  if (row[key] != null) return row[key];
  const parts = String(key).includes("__") ? String(key).split("__") : String(key).split(".");
  let cursor = row;
  for (const part of parts) {
    if (cursor == null) return undefined;
    // Parent held a scalar (an unexpanded Link field) while path remains — that
    // scalar IS the value, e.g. "brand__name" against { brand: "ROZULA" }.
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

function formatMoney(value) {
  const n = toNumber(value);
  if (n == null) return "—";
  return `₹ ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatInt(value) {
  const n = toNumber(value);
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-IN");
}

/** "ROZULA CV 10" with brand "ROZULA" -> "CV 10"; falls back to the full name. */
function variantLabel(itemName, brand) {
  const name = String(itemName ?? "").trim();
  const b = String(brand ?? "").trim();
  if (!name) return "";
  if (b && name.toUpperCase().startsWith(b.toUpperCase())) {
    const rest = name.slice(b.length).trim();
    if (rest) return rest;
  }
  return name;
}

function sectionLetter(brand) {
  const first = String(brand ?? "").trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}

function ProductCard({ group, priceFields, totalStockField, onCardClick, clickable }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const variants = group.variants;
  const active = variants[Math.min(activeIndex, variants.length - 1)] ?? variants[0];

  const total = totalStockField ? readField(active, totalStockField) : null;
  const showTotal = totalStockField && toNumber(total) != null;

  const fire = useCallback(() => {
    if (!clickable || !onCardClick) return;
    onCardClick({
      brand: group.brand,
      variant: variantLabel(readField(active, group.variantNameField), group.brand),
      row: active,
      variants,
    });
  }, [clickable, onCardClick, group, active, variants]);

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={fire}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fire();
              }
            }
          : undefined
      }
      className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ${
        clickable ? "cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-200" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-extrabold uppercase tracking-tight text-[#1e2a5a]">
            {group.brand}
          </h3>
          <p className="mt-0.5 text-xs text-gray-400">
            {variants.length} {variants.length === 1 ? "variant" : "variants"}
          </p>
        </div>
        {showTotal ? (
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Global stock
            </p>
            <p className="text-lg font-bold text-[#1e2a5a]">{formatInt(total)}</p>
          </div>
        ) : null}
      </div>

      {variants.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {variants.map((row, index) => {
            const label = variantLabel(readField(row, group.variantNameField), group.brand);
            const selected = index === Math.min(activeIndex, variants.length - 1);
            return (
              <button
                key={`${label}-${index}`}
                type="button"
                aria-pressed={selected}
                onClick={(e) => {
                  // Don't let picking a variant count as clicking the card.
                  e.stopPropagation();
                  setActiveIndex(index);
                }}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  selected
                    ? "bg-[#1e2a5a] text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                {label || "—"}
              </button>
            );
          })}
        </div>
      ) : null}

      {priceFields.length > 0 ? (
        <div className="mt-3 grid gap-2 rounded-xl bg-gray-50 px-3 py-2.5" style={{ gridTemplateColumns: `repeat(${priceFields.length}, minmax(0, 1fr))` }}>
          {priceFields.map((pf) => (
            <div key={pf.field} className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {pf.label}
              </p>
              <p className="truncate text-sm font-bold text-slate-800">
                {formatMoney(readField(active, pf.field))}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ProductCatalogCards({
  data,
  brandField = "brand__name",
  variantNameField = "item_name",
  priceFields,
  totalStockField,
  groupByInitial = true,
  showLetterRail = true,
  clickable = true,
  onCardClick,
  emptyText = "No products to show",
  className,
}) {
  const resolvedPriceFields = useMemo(() => {
    const fallback = [
      { field: "custom_last_mrp", label: "MRP" },
      { field: "custom_last_ptr", label: "PTR" },
      { field: "custom_last_pts", label: "PTS" },
    ];
    const list = Array.isArray(priceFields) && priceFields.length > 0 ? priceFields : fallback;
    return list
      .map((pf) => {
        if (typeof pf === "string") return { field: pf, label: pf };
        if (!pf || !pf.field) return null;
        return { field: String(pf.field), label: String(pf.label ?? pf.field) };
      })
      .filter(Boolean);
  }, [priceFields]);

  // One group per brand, preserving the order brands first appear in the incoming
  // (already filtered/sorted) rows.
  const groups = useMemo(() => {
    const rows = normalizeRows(data);
    const byBrand = new Map();
    rows.forEach((row) => {
      const brandRaw = readField(row, brandField);
      const brand = String(brandRaw ?? "").trim() || "—";
      if (!byBrand.has(brand)) byBrand.set(brand, { brand, variants: [], variantNameField });
      byBrand.get(brand).variants.push(row);
    });
    return Array.from(byBrand.values());
  }, [data, brandField, variantNameField]);

  // A–Z sections. Skipped entirely when groupByInitial is off, which is what you
  // want under a non-alphabetical sort (e.g. "MRP, high → low") — letter headings
  // would be meaningless there.
  const sections = useMemo(() => {
    if (!groupByInitial) return null;
    const byLetter = new Map();
    groups.forEach((g) => {
      const letter = sectionLetter(g.brand);
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter).push(g);
    });
    return Array.from(byLetter.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, items]) => ({
        letter,
        groups: items.slice().sort((x, y) => x.brand.localeCompare(y.brand)),
      }));
  }, [groups, groupByInitial]);

  const presentLetters = useMemo(
    () => new Set((sections ?? []).map((s) => s.letter)),
    [sections],
  );

  const sectionRefs = useRef({});
  const [activeLetter, setActiveLetter] = useState(null);

  useEffect(() => {
    if (!sections || sections.length === 0) return undefined;
    setActiveLetter((current) => (current && presentLetters.has(current) ? current : sections[0].letter));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.dataset?.letter) setActiveLetter(visible[0].target.dataset.letter);
      },
      { rootMargin: "-8% 0px -80% 0px", threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections, presentLetters]);

  const jumpTo = useCallback((letter) => {
    const el = sectionRefs.current[letter];
    if (el) {
      setActiveLetter(letter);
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  if (groups.length === 0) {
    return (
      <div className={`flex min-h-[160px] items-center justify-center text-sm text-gray-400 ${className ?? ""}`}>
        {emptyText}
      </div>
    );
  }

  const cardFor = (group) => (
    <ProductCard
      key={group.brand}
      group={group}
      priceFields={resolvedPriceFields}
      totalStockField={totalStockField}
      onCardClick={onCardClick}
      clickable={clickable}
    />
  );

  return (
    <div className={`relative flex gap-1 ${className ?? ""}`}>
      <div className="min-w-0 flex-1 space-y-3 pb-4">
        {sections
          ? sections.map((section) => (
              <section
                key={section.letter}
                data-letter={section.letter}
                ref={(el) => {
                  sectionRefs.current[section.letter] = el;
                }}
                className="scroll-mt-4 space-y-3"
              >
                <h2 className="px-1 text-sm font-bold text-red-600">{section.letter}</h2>
                {section.groups.map(cardFor)}
              </section>
            ))
          : groups.map(cardFor)}
      </div>

      {showLetterRail && sections ? (
        <nav
          aria-label="Jump to letter"
          className="sticky top-2 flex h-fit shrink-0 flex-col items-center gap-0.5 self-start py-1"
        >
          {ALPHABET.map((letter) => {
            const present = presentLetters.has(letter);
            const isActive = activeLetter === letter;
            return (
              <button
                key={letter}
                type="button"
                disabled={!present}
                aria-current={isActive ? "true" : undefined}
                onClick={() => jumpTo(letter)}
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none transition-colors ${
                  isActive
                    ? "bg-red-600 text-white"
                    : present
                      ? "text-slate-500 hover:text-slate-800"
                      : "cursor-default text-gray-200"
                }`}
              >
                {letter}
              </button>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
