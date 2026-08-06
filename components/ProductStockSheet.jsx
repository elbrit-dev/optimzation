import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "primereact/sidebar";

/**
 * ProductStockSheet — the product-detail bottom sheet.
 *
 * Opens over the catalogue with the selected product: title + "Brand: X", the
 * brand's variants as pills, MRP / PTR / PTS tiles, STOCK BY WAREHOUSE rows
 * (code chip, name, level bar, qty, chevron) that expand into per-batch rows
 * (batch no, months-to-expire, qty), a "Total across warehouses" footer and a
 * full-width CTA. Built as a real component because a generic drawer can't do
 * the per-warehouse expansion and stock styling.
 *
 * DATA — deliberately split across props instead of one blob:
 *   items   → the brand group ({ brand__name, items:[...] }), a plain array of
 *             item objects, a single item, or the WHOLE letter-grouped dataset
 *             (array of groups) — in that last case `brand` picks the group.
 *   brand   → title fallback / group selector.
 *   initialItemName → which variant is selected when the sheet opens
 *             (e.g. from ProductCard's onCardClick payload: row.item_name).
 * Item fields used: item_name, custom_last_mrp/ptr/pts (via priceFields),
 * package, divison[]/division[] ({company__name}), total_stock, warehouses[]
 * ({ code, warehouse, qty, batches:[{ batch_no, qty, expire_text,
 * months_to_expire }] }).
 */

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

/** "CLAVBRIT 375" with brand "CLAVBRIT" -> "375"; falls back to the full name. */
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

/**
 * Accepts: a brand group { brand__name, items }, an array of items, a single
 * item, or the whole letter-grouped dataset (array of groups — `brand` selects).
 */
function resolveGroup(input, brand) {
  const empty = { brand: brand || null, items: [] };
  if (input == null) return empty;
  if (Array.isArray(input)) {
    if (input.length === 0) return empty;
    if (Array.isArray(input[0]?.items)) {
      const wanted = brand ? String(brand).trim().toUpperCase() : null;
      const group = (wanted && input.find((g) => String(g?.brand__name ?? "").trim().toUpperCase() === wanted)) || input[0];
      return { brand: brand || group?.brand__name || null, items: (group?.items ?? []).filter(Boolean) };
    }
    return { brand: brand || input[0]?.brand__name || null, items: input.filter(Boolean) };
  }
  if (typeof input === "object") {
    if (Array.isArray(input.items)) {
      return { brand: brand || input.brand__name || input.brand || null, items: input.items.filter(Boolean) };
    }
    return { brand: brand || input.brand__name || null, items: [input] };
  }
  return empty;
}

function warehouseTone(qty, lowStockThreshold) {
  const n = toNumber(qty) ?? 0;
  if (n <= 0) return { chip: "bg-red-50 text-red-600", qty: "text-red-600", bar: "bg-red-500" };
  if (n <= lowStockThreshold) return { chip: "bg-amber-50 text-amber-600", qty: "text-amber-600", bar: "bg-amber-500" };
  return { chip: "bg-gray-100 text-slate-600", qty: "text-slate-800", bar: "bg-[#1e2a5a]" };
}

function expiryTone(monthsToExpire) {
  const n = toNumber(monthsToExpire);
  if (n == null) return "text-gray-400";
  if (n <= 0) return "text-red-500";
  if (n <= 3) return "text-amber-600";
  return "text-gray-400";
}

export default function ProductStockSheet({
  visible = false,
  onVisibleChange,
  onClose,
  items,
  brand,
  initialItemName,
  variantNameField = "item_name",
  priceFields,
  showPrices = true,
  showPackage = false,
  showDivisions = false,
  showStockBars = true,
  expandableBatches = true,
  hideZeroStockWarehouses = false,
  lowStockThreshold = 10,
  stockLabel = "Stock by warehouse",
  totalLabel = "Total across warehouses",
  showCta = true,
  ctaLabel = "View full product page",
  onCtaClick,
  onVariantChange,
  sheetHeight = "85vh",
  className,
}) {
  const group = useMemo(() => resolveGroup(items, brand), [items, brand]);
  const brandName = group.brand ? String(group.brand).trim() : "";

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

  const [activeName, setActiveName] = useState(initialItemName ?? null);
  const [expanded, setExpanded] = useState(() => new Set());

  // Re-sync the selected variant when the sheet targets a new product.
  useEffect(() => {
    setActiveName(initialItemName ?? null);
    setExpanded(new Set());
  }, [initialItemName, brandName, visible]);

  const active = useMemo(() => {
    if (group.items.length === 0) return null;
    if (activeName) {
      const hit = group.items.find((it) => String(it?.[variantNameField] ?? "") === String(activeName));
      if (hit) return hit;
    }
    return group.items[0];
  }, [group.items, activeName, variantNameField]);

  const selectVariant = useCallback((item) => {
    const name = String(item?.[variantNameField] ?? "");
    setActiveName(name);
    setExpanded(new Set());
    if (onVariantChange) onVariantChange({ brand: brandName, variant: variantLabel(name, brandName), item });
  }, [variantNameField, onVariantChange, brandName]);

  const close = useCallback(() => {
    if (onVisibleChange) onVisibleChange(false);
    if (onClose) onClose();
  }, [onVisibleChange, onClose]);

  const toggleWarehouse = useCallback((code) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const warehouses = useMemo(() => {
    const list = Array.isArray(active?.warehouses) ? active.warehouses.filter(Boolean) : [];
    return hideZeroStockWarehouses ? list.filter((w) => (toNumber(w?.qty) ?? 0) > 0) : list;
  }, [active, hideZeroStockWarehouses]);

  const maxQty = useMemo(
    () => Math.max(1, ...warehouses.map((w) => toNumber(w?.qty) ?? 0)),
    [warehouses],
  );

  const total = active?.total_stock ?? warehouses.reduce((sum, w) => sum + (toNumber(w?.qty) ?? 0), 0);

  const divisions = useMemo(() => {
    const raw = active?.divison ?? active?.division;
    if (!Array.isArray(raw)) return [];
    return raw.map((d) => String(d?.company__name ?? d ?? "").trim()).filter(Boolean);
  }, [active]);

  const title = String(active?.[variantNameField] ?? brandName ?? "").trim() || "—";

  return (
    <Sidebar
      visible={visible}
      position="bottom"
      onHide={close}
      showCloseIcon={false}
      blockScroll
      style={{ height: sheetHeight, borderTopLeftRadius: "1rem", borderTopRightRadius: "1rem" }}
      className={className}
    >
      <div className="mx-auto flex h-full w-full max-w-lg flex-col">
        <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-gray-300" aria-hidden="true" />

        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-xl font-extrabold uppercase tracking-tight text-[#1e2a5a]">{title}</h3>
            {brandName ? <p className="mt-0.5 text-xs text-gray-400">Brand: {brandName}</p> : null}
            {showPackage && active?.package ? (
              <p className="mt-0.5 text-xs text-gray-400">{active.package}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
          >
            <i className="pi pi-times text-xs" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-2">
          {group.items.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {group.items.map((item, index) => {
                const label = variantLabel(item?.[variantNameField], brandName);
                const selected = active === item;
                return (
                  <button
                    key={`${label}-${index}`}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectVariant(item)}
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

          {showPrices && active && resolvedPriceFields.length > 0 ? (
            <div
              className="mt-3 grid gap-2"
              style={{ gridTemplateColumns: `repeat(${resolvedPriceFields.length}, minmax(0, 1fr))` }}
            >
              {resolvedPriceFields.map((pf) => (
                <div key={pf.field} className="min-w-0 rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{pf.label}</p>
                  <p className="truncate text-sm font-bold text-slate-800">{formatMoney(active?.[pf.field])}</p>
                </div>
              ))}
            </div>
          ) : null}

          {showDivisions && divisions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {divisions.map((name) => (
                <span key={name} className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {name}
                </span>
              ))}
            </div>
          ) : null}

          {warehouses.length > 0 ? (
            <>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-gray-400">{stockLabel}</p>
              <ul>
                {warehouses.map((wh, index) => {
                  const code = String(wh?.code ?? index);
                  const qty = toNumber(wh?.qty) ?? 0;
                  const tone = warehouseTone(qty, lowStockThreshold);
                  const batches = Array.isArray(wh?.batches) ? wh.batches.filter(Boolean) : [];
                  const canExpand = expandableBatches && batches.length > 0;
                  const isOpen = expanded.has(code);
                  const pct = Math.max(qty > 0 ? (qty / maxQty) * 100 : 0, qty > 0 ? 6 : 3);
                  return (
                    <li key={code} className="border-b border-gray-100 last:border-b-0">
                      <button
                        type="button"
                        onClick={canExpand ? () => toggleWarehouse(code) : undefined}
                        aria-expanded={canExpand ? isOpen : undefined}
                        className={`flex w-full items-center gap-3 py-3 text-left ${canExpand ? "" : "cursor-default"}`}
                      >
                        <span className={`flex h-8 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${tone.chip}`}>
                          {code}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                          {wh?.warehouse ?? code}
                        </span>
                        {showStockBars ? (
                          <span className="block h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-gray-100 sm:w-24" aria-hidden="true">
                            <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
                          </span>
                        ) : null}
                        <span className={`shrink-0 text-sm font-bold ${tone.qty}`}>{formatInt(qty)}</span>
                        {canExpand ? (
                          <i
                            className={`pi pi-chevron-down shrink-0 text-xs text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                            aria-hidden="true"
                          />
                        ) : (
                          <span className="w-3 shrink-0" aria-hidden="true" />
                        )}
                      </button>
                      {canExpand && isOpen ? (
                        <div className="mb-3 ml-12 overflow-hidden rounded-lg border-l-2 border-indigo-100">
                          {batches.map((batch, bIndex) => (
                            <div
                              key={`${batch?.batch_no ?? bIndex}`}
                              className="flex items-center gap-2 bg-indigo-50/60 px-3 py-2 even:bg-indigo-50/30"
                            >
                              <span className="text-xs font-bold text-[#1e2a5a]">{batch?.batch_no ?? "—"}</span>
                              <span className={`min-w-0 flex-1 truncate text-xs ${expiryTone(batch?.months_to_expire)}`}>
                                {batch?.expire_text ?? ""}
                              </span>
                              <span className="shrink-0 text-xs font-semibold text-slate-800">{formatInt(batch?.qty)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">{totalLabel}</span>
            <span className="text-lg font-extrabold text-[#1e2a5a]">{formatInt(total)}</span>
          </div>
          {showCta ? (
            <button
              type="button"
              onClick={() => {
                if (onCtaClick) {
                  onCtaClick({
                    brand: brandName,
                    variant: active ? variantLabel(active?.[variantNameField], brandName) : null,
                    item: active,
                  });
                }
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1e2a5a] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#27356e]"
            >
              {ctaLabel}
              <i className="pi pi-arrow-right text-xs" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </Sidebar>
  );
}
