import React from "react";
import { Check, Link } from "lucide-react";

/**
 * ApprovalCard — a summary card for the secondary approval flow, with 3 variants.
 *
 * Variants (the `variant` prop):
 *   - "select"  : a CHECKBOX for bulk selection (pair with a page-level "Select all").
 *   - "toggle"  : an on/off TOGGLE SWITCH for selecting one at a time.
 *   - "actions" : per-card REJECT / APPROVE buttons for approving one-off.
 *
 * Selection ("select" + "toggle" share this):
 *   `checked` is a Plasmic *writable state* bound to a page state variable, and
 *   `onCheckedChange(checked, value)` hands back BOTH the new flag AND this card's
 *   `value` (its id) so you can maintain a selected-items array + a "Select all".
 *
 * Actions ("actions" variant):
 *   `onApprove(value)` / `onReject(value)` fire with this card's id — wire them to
 *   your ERP approve/reject mutation.
 *
 * Attachments badge (top-right):
 *   Bind `links` to any number of file URLs/paths (bare strings or { label, url }).
 *   A 🔗 icon appears with a count of the links present (or an explicit `linkCount`).
 *   Clicking it fires `onLinkClick(links, value)` where `links` is [{ label, url }]
 *   for each present file — open them, or show them in a dialog.
 *
 * Controlled/uncontrolled:
 *   When `checked` is provided (the normal Plasmic case) the card is controlled;
 *   otherwise it falls back to internal state so it works standalone.
 */

const STYLE_ID = "elbrit-approval-card-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .eac-card {
      box-sizing: border-box;
      display: flex; flex-direction: column; gap: 12px;
      width: 100%; max-width: 100%;
      padding: 14px; border-radius: 12px;
      border: 1px solid var(--eac-border, #e5e7eb);
      background: var(--eac-bg, #ffffff);
      font: 400 13px/1.4 inherit; color: #1f2937;
      transition: border-color .12s ease, box-shadow .12s ease, background .12s ease;
    }
    .eac-card.eac-clickable { cursor: pointer; }
    .eac-card.eac-clickable:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
    .eac-card.eac-selected {
      border-color: var(--eac-accent, #2563eb);
      background: color-mix(in srgb, var(--eac-accent, #2563eb) 6%, #fff);
    }
    .eac-card.eac-disabled { opacity: 0.55; cursor: not-allowed; }
    .eac-card.eac-disabled.eac-clickable:hover { box-shadow: none; }

    .eac-header { display: flex; align-items: center; gap: 10px; }
    .eac-title {
      flex: 1 1 auto; min-width: 0;
      font-weight: 700; font-size: 15px; color: #111827;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .eac-header-right { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; }

    /* checkbox */
    .eac-check {
      flex: 0 0 auto; box-sizing: border-box;
      width: 20px; height: 20px; border-radius: 5px;
      border: 2px solid var(--eac-check-border, #cbd5e1);
      background: #fff; color: #fff;
      display: flex; align-items: center; justify-content: center;
      transition: background .12s ease, border-color .12s ease;
    }
    .eac-check:focus-visible { outline: 2px solid var(--eac-accent, #2563eb); outline-offset: 2px; }
    .eac-check.eac-on { background: var(--eac-accent, #2563eb); border-color: var(--eac-accent, #2563eb); }

    /* toggle switch */
    .eac-toggle {
      flex: 0 0 auto; box-sizing: border-box; position: relative;
      width: 40px; height: 22px; border-radius: 999px;
      background: var(--eac-toggle-off, #cbd5e1); border: none; padding: 0;
      cursor: pointer; transition: background .12s ease;
    }
    .eac-toggle:focus-visible { outline: 2px solid var(--eac-accent, #2563eb); outline-offset: 2px; }
    .eac-toggle.eac-on { background: var(--eac-accent, #2563eb); }
    .eac-toggle-knob {
      position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
      border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.25);
      transition: transform .14s ease;
    }
    .eac-toggle.eac-on .eac-toggle-knob { transform: translateX(18px); }

    /* attachments link + badge */
    .eac-link {
      flex: 0 0 auto; position: relative; box-sizing: border-box;
      width: 28px; height: 28px; border-radius: 8px; border: none;
      background: transparent; color: #64748b; cursor: pointer;
      display: flex; align-items: center; justify-content: center; padding: 0;
      transition: background .12s ease, color .12s ease;
    }
    .eac-link:hover { background: #f1f5f9; color: #334155; }
    .eac-link:focus-visible { outline: 2px solid var(--eac-accent, #2563eb); outline-offset: 2px; }
    .eac-badge {
      position: absolute; top: -5px; right: -5px;
      min-width: 17px; height: 17px; padding: 0 4px; box-sizing: border-box;
      border-radius: 999px; background: #111827; color: #fff;
      font-size: 10px; font-weight: 700; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    }

    /* attachments dropdown (2+ links) */
    .eac-link-wrap { position: relative; flex: 0 0 auto; }
    .eac-menu {
      position: absolute; top: calc(100% + 6px); right: 0; z-index: 20;
      min-width: 180px; max-width: 280px; box-sizing: border-box;
      padding: 6px; border-radius: 10px;
      border: 1px solid var(--eac-border, #e5e7eb); background: #fff;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      display: flex; flex-direction: column; gap: 2px;
    }
    .eac-menu-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-radius: 7px;
      color: #334155; font-size: 12px; font-weight: 500;
      text-decoration: none; cursor: pointer;
      transition: background .12s ease, color .12s ease;
    }
    .eac-menu-item:hover {
      background: color-mix(in srgb, var(--eac-accent, #2563eb) 8%, #fff);
      color: var(--eac-accent, #2563eb);
    }
    .eac-menu-item-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }


    /* metric columns */
    .eac-cols { display: flex; align-items: flex-start; gap: 14px; }
    .eac-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
    .eac-col-head { font-weight: 600; font-size: 13px; color: var(--eac-heading, #2563eb); }
    /* Rows wrap instead of clip: if a value can't fit beside its label it drops to
       the next line (the number itself stays whole) — values are never hidden. */
    .eac-row { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 6px; row-gap: 1px; }
    .eac-row-label { flex: 0 0 auto; color: #6b7280; font-size: 11px; }
    .eac-row-value { color: #374151; font-size: 12px; font-weight: 500; white-space: nowrap; font-variant-numeric: tabular-nums; }

    /* action buttons */
    .eac-hr { height: 1px; background: var(--eac-border, #e5e7eb); margin: 0; }
    .eac-actions { display: flex; justify-content: space-between; gap: 12px; }
    .eac-btn {
      flex: 0 0 auto; box-sizing: border-box; min-width: 96px;
      padding: 9px 18px; border-radius: 8px; border: none;
      font: 600 14px/1 inherit; color: #fff; cursor: pointer;
      transition: filter .12s ease, opacity .12s ease;
    }
    .eac-btn:hover { filter: brightness(0.95); }
    .eac-btn:active { filter: brightness(0.9); }
    .eac-btn:focus-visible { outline: 2px solid #fff; outline-offset: -3px; }
    .eac-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: none; }

    @media (prefers-reduced-motion: reduce) {
      .eac-card, .eac-check, .eac-toggle, .eac-toggle-knob, .eac-link, .eac-btn { transition: none; }
    }
  `;
  document.head.appendChild(el);
}

// Format a quantity: numbers get Indian grouping + the unit; strings pass through.
function fmtQty(qty, unit) {
  if (qty === null || qty === undefined || qty === "") return unit ? `0 ${unit}` : "0";
  if (typeof qty === "number" && isFinite(qty)) {
    const n = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(qty);
    return unit ? `${n} ${unit}` : n;
  }
  return unit ? `${qty} ${unit}` : String(qty);
}

// Resolve an ERP file path into an openable URL.
//  - empty / null            → null (link is hidden)
//  - already absolute (http) → used as-is
//  - relative "/private/..." → prefixed with baseUrl (the ERP site origin)
// encodeURI keeps "/" ":" etc. but turns spaces into %20 so paths like
// "export_2026-06-13 (3).xlsx" open correctly.
function resolveFileUrl(path, baseUrl) {
  if (path === null || path === undefined) return null;
  const p = String(path).trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return encodeURI(p);
  const base = (baseUrl || "").replace(/\/+$/, "");
  const rel = p.startsWith("/") ? p : `/${p}`;
  return encodeURI(`${base}${rel}`);
}

// Derive a readable label from a file path/URL: the last path segment, decoded.
// e.g. "/private/files/export_2026-06-13 (1).xlsx" -> "export_2026-06-13 (1).xlsx"
function fileLabelFromUrl(u) {
  const s = String(u).split(/[?#]/)[0];
  const seg = s.split("/").filter(Boolean).pop() || s;
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

// Normalize the `links` prop into a clean [{ label, url }] array.
// Accepts a single value or an array; each entry can be:
//   - a bare string  ("/private/files/x.xlsx" or "https://...")
//   - an object      ({ url|href|link|value, label|name|title })
// Relative paths get merged with baseUrl; empties are dropped; labels fall back
// to the file name so callers never have to supply one.
function normalizeLinks(links, baseUrl) {
  const arr = Array.isArray(links) ? links : links === null || links === undefined ? [] : [links];
  return arr
    .map((item) => {
      const isObj = item && typeof item === "object";
      const rawUrl = isObj ? item.url ?? item.href ?? item.link ?? item.value : item;
      const url = resolveFileUrl(rawUrl, baseUrl);
      if (!url) return null;
      const label = (isObj ? item.label ?? item.name ?? item.title : null) || fileLabelFromUrl(rawUrl);
      return { label, url };
    })
    .filter(Boolean);
}

// Format a monetary value: numbers get currency symbol + Indian grouping + 2dp; strings pass through.
function fmtValue(val, currency) {
  const sym = currency ?? "₹";
  if (val === null || val === undefined || val === "") return `${sym}0.00`;
  if (typeof val === "number" && isFinite(val)) {
    const n = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
    return `${sym}${n}`;
  }
  return String(val);
}

export default function ApprovalCard({
  // variant
  variant = "select",          // "select" | "toggle" | "actions"

  // identity / selection (select + toggle)
  value,                       // id/object handed back on selection / actions (bind to the row's key)
  checked,                     // controlled selected state (Plasmic writable state) — simple single-card use
  onCheckedChange,             // (checked: boolean, value: any) => void
  selectOnCardClick = true,    // click anywhere on the card to toggle (select/toggle only)

  // actions variant
  onApprove,                   // (value) => void
  onReject,                    // (value) => void
  approveLabel = "Approve",
  rejectLabel = "Reject",
  approveColor = "#2563eb",
  rejectColor = "#ef4444",

  // attachments badge — `links` holds ANY number of files. Each entry can be a
  // "/private/files/..." path or full URL, given as a bare string OR { label, url }.
  // Build it in Plasmic from whatever row fields you have, e.g.
  //   [currentItem.custom_transformed_data, currentItem.custom_ecubix_data]
  // The badge holds them all and hands them back on click. Set fileBaseUrl to the
  // ERP origin so relative paths become openable links.
  links,
  fileBaseUrl = "",
  linkCount,                   // OPTIONAL: force the badge number; auto-counted from `links` if omitted
  openInNewTab = true,         // badge click opens the file(s) in a new tab (1 → direct, 2+ → dropdown menu)
  onLinkClick,                 // (links, value) => void — also fired on badge click for custom wiring

  disabled = false,

  // content
  title = "Sai Radha Pharma",
  currency = "₹",
  leftLabel = "Sales",
  leftQty,
  leftQtyUnit = "Nos",
  leftValue,
  rightLabel = "Closing",
  rightQty,
  rightQtyUnit = "Nos",
  rightValue,

  // theming
  accentColor = "#2563eb",
  headingColor = "#2563eb",

  className,
  style,
}) {
  ensureStyles();

  const isToggle = variant === "toggle";
  const isActions = variant === "actions";
  const isSelect = !isToggle && !isActions; // default
  const selectable = isSelect || isToggle;

  // `checked` is just true/false — bind it to your control (a Select All boolean, or the
  // card's own checked state). The card fires onCheckedChange AUTOMATICALLY whenever
  // `checked` flips — from a click OR from being set outside (Select All) — so you wire
  // the value handling ONCE (Add element / Remove elements) and Select All only flips the
  // boolean; it never passes any value. The ref dedupes so a click + the resulting prop
  // update don't both fire.
  const controlled = checked !== undefined && checked !== null;
  const [internal, setInternal] = React.useState(Boolean(checked));
  React.useEffect(() => {
    if (controlled) setInternal(Boolean(checked));
  }, [controlled, checked]);
  const isChecked = controlled ? Boolean(checked) : internal;

  const lastEmitted = React.useRef(Boolean(checked));
  React.useEffect(() => {
    if (!controlled) return;
    const c = Boolean(checked);
    if (c !== lastEmitted.current) {
      lastEmitted.current = c;
      onCheckedChange?.(c, value);
    }
  }, [controlled, checked, value, onCheckedChange]);

  const toggle = React.useCallback(() => {
    if (disabled) return;
    const next = !isChecked;
    if (!controlled) setInternal(next);
    lastEmitted.current = next;
    onCheckedChange?.(next, value);
  }, [disabled, isChecked, controlled, onCheckedChange, value]);

  // Attachments dropdown (only used when there are 2+ links). We can't reliably
  // window.open several tabs from one click — browsers block all but the first —
  // so for multiple files we show a menu of native <a target="_blank"> links, and
  // each opens on its own click (never blocked).
  const [menuOpen, setMenuOpen] = React.useState(false);
  const linkWrapRef = React.useRef(null);
  React.useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => {
      if (linkWrapRef.current && !linkWrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const openOneLink = React.useCallback((url) => {
    if (typeof window !== "undefined" && url) window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const onCardClick =
    selectable && selectOnCardClick && !disabled ? () => toggle() : undefined;

  const cardClass = [
    "eac-card",
    onCardClick ? "eac-clickable" : "",
    selectable && isChecked ? "eac-selected" : "",
    disabled ? "eac-disabled" : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  const cssVars = {
    "--eac-accent": accentColor,
    "--eac-heading": headingColor,
    ...style,
  };

  // Normalize `links` into [{ label, url }]. This is what the badge click hands back —
  // clicking the 🔗 passes ALL links plus this card's `value` to onLinkClick.
  const fileLinks = normalizeLinks(links, fileBaseUrl);

  // Badge count: an explicit numeric linkCount wins; otherwise derive it from the
  // number of file links present (so you don't have to set a count by hand).
  const badgeCount = typeof linkCount === "number" ? linkCount : fileLinks.length;
  const hasBadge = badgeCount > 0;

  const column = (label, qty, unit, val) => (
    <div className="eac-col">
      <span className="eac-col-head">{label}</span>
      <div className="eac-row">
        <span className="eac-row-label">Qty</span>
        <span className="eac-row-value">{fmtQty(qty, unit)}</span>
      </div>
      <div className="eac-row">
        <span className="eac-row-label">Value</span>
        <span className="eac-row-value">{fmtValue(val, currency)}</span>
      </div>
    </div>
  );

  return (
    <div className={cardClass} style={cssVars} onClick={onCardClick}>
      <div className="eac-header">
        {isSelect ? (
          <span
            role="checkbox"
            aria-checked={isChecked}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : 0}
            className={`eac-check ${isChecked ? "eac-on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle();
              }
            }}
          >
            {isChecked ? <Check size={14} strokeWidth={3} /> : null}
          </span>
        ) : null}

        <span className="eac-title" title={typeof title === "string" ? title : undefined}>
          {title}
        </span>

        <div className="eac-header-right">
          {hasBadge ? (
            <div className="eac-link-wrap" ref={linkWrapRef}>
              <button
                type="button"
                className="eac-link"
                aria-label={`${badgeCount} attached document${badgeCount === 1 ? "" : "s"}`}
                aria-haspopup={fileLinks.length > 1 ? "menu" : undefined}
                aria-expanded={fileLinks.length > 1 ? menuOpen : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onLinkClick?.(fileLinks, value);
                  if (!openInNewTab) return;
                  if (fileLinks.length === 1) {
                    openOneLink(fileLinks[0].url);
                  } else if (fileLinks.length > 1) {
                    setMenuOpen((v) => !v);
                  }
                }}
              >
                <Link size={17} strokeWidth={2.25} />
                <span className="eac-badge">{badgeCount}</span>
              </button>

              {openInNewTab && menuOpen && fileLinks.length > 1 ? (
                <div className="eac-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                  {fileLinks.map((l, i) => (
                    <a
                      key={i}
                      role="menuitem"
                      className="eac-menu-item"
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={l.label}
                      onClick={() => setMenuOpen(false)}
                    >
                      <Link size={13} strokeWidth={2.25} />
                      <span className="eac-menu-item-text">{l.label}</span>
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {isToggle ? (
            <button
              type="button"
              role="switch"
              aria-checked={isChecked}
              aria-disabled={disabled || undefined}
              disabled={disabled}
              className={`eac-toggle ${isChecked ? "eac-on" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
            >
              <span className="eac-toggle-knob" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="eac-cols">
        {column(leftLabel, leftQty, leftQtyUnit, leftValue)}
        {column(rightLabel, rightQty, rightQtyUnit, rightValue)}
      </div>

      {isActions ? (
        <>
          <div className="eac-hr" aria-hidden="true" />
          <div className="eac-actions">
            <button
              type="button"
              className="eac-btn eac-btn-reject"
              style={{ background: rejectColor }}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onReject?.(value);
              }}
            >
              {rejectLabel}
            </button>
            <button
              type="button"
              className="eac-btn eac-btn-approve"
              style={{ background: approveColor }}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onApprove?.(value);
              }}
            >
              {approveLabel}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
