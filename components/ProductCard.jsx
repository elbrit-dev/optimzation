import React, { useCallback, useMemo, useState } from "react";

/**
 * ProductCard — ONE catalogue card, for ONE brand.
 *
 * This is deliberately a single card, not a list: you place it (or repeat it in
 * Plasmic Studio) and bind each instance its own brand's rows. It renders the
 * brand title, "N variants", the variant pills (10 / 20 / 40), and the
 * MRP / PTR / PTS row for whichever pill is selected.
 *
 * The `children` slot renders below the price row — that's the place to add the
 * per-warehouse stock chips (or anything else) separately in Studio.
 *
 * DATA (`data` prop) — the rows of THIS brand only (its variants). Tolerant of
 * shape: array of nodes, array of edges, { edges:[{node}] }, or a single row
 * object. Each row uses (defaults, overridable): item_name, brand__name,
 * custom_last_mrp / custom_last_ptr / custom_last_pts.
 */

/** Unwrap connection/edge shapes down to a flat array of rows. */
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
  // A single row object.
  return [data];
}

/**
 * Read a field whether the row is flattened ("brand__name") or nested
 * ({ brand: { name } }), tolerating a scalar Link value at the parent.
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

export default function ProductCard({
  data,
  brand,
  brandField = "brand__name",
  variantNameField = "item_name",
  priceFields,
  totalStock,
  totalStockField,
  clickable = true,
  onCardClick,
  onVariantChange,
  // Code-only render hook (not a Studio prop): receives the SELECTED variant's row
  // and renders below the price row — used by CatalogLetterGroup for warehouse
  // chips that follow the active pill. The children slot stays static below it.
  renderExtras,
  children,
  className,
}) {
  const rows = useMemo(() => normalizeRows(data), [data]);

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

  const title = useMemo(() => {
    const explicit = String(brand ?? "").trim();
    if (explicit) return explicit;
    return String(readField(rows[0], brandField) ?? "—").trim() || "—";
  }, [brand, rows, brandField]);

  const [activeIndex, setActiveIndex] = useState(0);
  const active = rows[Math.min(activeIndex, Math.max(rows.length - 1, 0))] ?? null;

  // Direct value wins over reading a column off the selected variant.
  const totalValue = totalStock ?? (totalStockField && active ? readField(active, totalStockField) : null);
  const showTotal = toNumber(totalValue) != null;

  const selectVariant = useCallback(
    (index) => {
      setActiveIndex(index);
      if (onVariantChange) {
        const row = rows[index];
        onVariantChange({
          index,
          variant: variantLabel(readField(row, variantNameField), title),
          row,
        });
      }
    },
    [onVariantChange, rows, variantNameField, title],
  );

  const fire = useCallback(() => {
    if (!clickable || !onCardClick) return;
    onCardClick({
      brand: title,
      variant: active ? variantLabel(readField(active, variantNameField), title) : null,
      row: active,
      variants: rows,
    });
  }, [clickable, onCardClick, title, active, variantNameField, rows]);

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
        clickable
          ? "cursor-pointer transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg active:translate-y-0 active:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
          : ""
      } ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-extrabold uppercase tracking-tight text-[#1e2a5a]">
            {title}
          </h3>
          {rows.length > 0 ? (
            <p className="mt-0.5 text-xs text-gray-400">
              {rows.length} {rows.length === 1 ? "variant" : "variants"}
            </p>
          ) : null}
        </div>
        {showTotal ? (
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Global stock
            </p>
            <p className="text-lg font-bold text-[#1e2a5a]">{formatInt(totalValue)}</p>
          </div>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {rows.map((row, index) => {
            const label = variantLabel(readField(row, variantNameField), title);
            const selected = index === Math.min(activeIndex, rows.length - 1);
            return (
              <button
                key={`${label}-${index}`}
                type="button"
                aria-pressed={selected}
                onClick={(e) => {
                  // Don't let picking a variant count as clicking the card.
                  e.stopPropagation();
                  selectVariant(index);
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

      {active && resolvedPriceFields.length > 0 ? (
        <div
          className="mt-3 grid gap-2 rounded-xl bg-gray-50 px-3 py-2.5"
          style={{ gridTemplateColumns: `repeat(${resolvedPriceFields.length}, minmax(0, 1fr))` }}
        >
          {resolvedPriceFields.map((pf) => (
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

      {typeof renderExtras === "function" && active ? (
        <div className="mt-3">{renderExtras(active)}</div>
      ) : null}

      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
