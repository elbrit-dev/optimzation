import React from "react";

/**
 * VariantPills — the "VARIANTS · 6" pill switcher of the product detail page.
 *
 * Variants can be plain strings ("20", "T 40") or { label, value } objects
 * (label shown on the pill, value handed back — e.g. the variant's item_code).
 * `selected` is exposed as a writable Plasmic state; picking a pill fires
 * onSelect(value, variant) — re-drive the page's item query from it.
 */

const STYLE_ID = "elbrit-variant-pills-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .vpl-wrap {
      box-sizing: border-box; width: 100%; max-width: 100%;
      display: flex; align-items: center; gap: 12px;
      font-family: var(--vpl-font, Inter, system-ui, -apple-system, "Segoe UI", sans-serif);
    }
    .vpl-wrap * { box-sizing: border-box; }
    .vpl-kicker {
      font-size: 11px; font-weight: 600; letter-spacing: .06em;
      color: #9ca3af; text-transform: uppercase; white-space: nowrap; flex: none;
    }
    .vpl-scroll { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; }
    .vpl-scroll::-webkit-scrollbar { display: none; }
    .vpl-pill {
      font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
      padding: 7px 16px; border-radius: 999px; white-space: nowrap; flex: none;
      background: #fff; color: #374151; border: 1px solid #e5e7eb;
    }
    .vpl-pill:hover { border-color: #c7d2fe; }
    .vpl-pill--on {
      background: var(--vpl-accent, #1e3a8a); color: #fff; border-color: var(--vpl-accent, #1e3a8a);
    }
  `;
  document.head.appendChild(el);
}

function normalize(variants) {
  if (!Array.isArray(variants)) return [];
  return variants
    .map((v) => {
      if (v == null) return null;
      if (typeof v === "string" || typeof v === "number")
        return { label: String(v), value: String(v) };
      const label = v.label ?? v.name ?? v.item_code ?? "";
      return label ? { label: String(label), value: String(v.value ?? label), raw: v } : null;
    })
    .filter(Boolean);
}

export default function VariantPills({
  variants = [],
  selected,
  onSelect,
  showCount = true,
  kicker = "Variants",
  className = "",
  style,
}) {
  ensureStyles();
  const list = normalize(variants);
  const sel = selected != null && selected !== "" ? String(selected) : list[0]?.value;

  return (
    <div className={`vpl-wrap ${className}`} style={style}>
      {kicker ? (
        <span className="vpl-kicker">
          {kicker}
          {showCount && list.length ? ` · ${list.length}` : ""}
        </span>
      ) : null}
      <div className="vpl-scroll">
        {list.map((v, i) => (
          <button
            key={i}
            type="button"
            className={`vpl-pill ${v.value === sel ? "vpl-pill--on" : ""}`}
            onClick={() => typeof onSelect === "function" && onSelect(v.value, v.raw || v)}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
