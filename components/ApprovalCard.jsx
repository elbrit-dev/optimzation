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
 *   When `linkCount > 0` a 🔗 icon with a count badge appears; clicking it fires
 *   `onLinkClick(value)`. Use it to fetch/open the list of attached documents from
 *   UAT/ERP for this card.
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

// Identity key for membership/dedup. Primitives compare directly; objects (a JSON
// `value`) compare by their serialized form so add/remove works whether `value` is
// a plain id string or a whole record object.
function keyOf(v) {
  return v && typeof v === "object" ? JSON.stringify(v) : v;
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

  // multi-select (array) API — pass the current list IN, get the full updated list OUT
  selectedKeys,                // current selection array (bind to page state, e.g. $state.selectedKeys)
  onSelectedKeysChange,        // (selectedKeys: array) => void — the COMPLETE updated array
  multiSelect = true,          // false = single-select (returns [value] / [])

  // actions variant
  onApprove,                   // (value) => void
  onReject,                    // (value) => void
  approveLabel = "Approve",
  rejectLabel = "Reject",
  approveColor = "#2563eb",
  rejectColor = "#ef4444",

  // attachments badge
  linkCount,                   // number of attached documents; badge hidden when 0/empty
  onLinkClick,                 // (value) => void — open/fetch the attached docs

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

  const [internal, setInternal] = React.useState(Boolean(checked));
  React.useEffect(() => {
    if (checked !== undefined && checked !== null) setInternal(Boolean(checked));
  }, [checked]);

  // When `selectedKeys` is bound (an array) the card DERIVES its checked state from
  // whether its `value` is in that list — so you never bind `checked` yourself.
  // Otherwise it falls back to the `checked` prop / internal state (simple single use).
  const usingKeys = Array.isArray(selectedKeys);
  const inKeys = usingKeys && selectedKeys.some((v) => keyOf(v) === keyOf(value));
  const isChecked = usingKeys
    ? inKeys
    : checked !== undefined && checked !== null
    ? Boolean(checked)
    : internal;

  const toggle = React.useCallback(() => {
    if (disabled) return;
    const nextChecked = !isChecked;
    setInternal(nextChecked);
    onCheckedChange?.(nextChecked, value);

    // Emit the FULL updated selection array so Plasmic can store it directly
    // (Update state -> New value -> this arg), without reading the old state.
    if (onSelectedKeysChange) {
      const arr = Array.isArray(selectedKeys) ? selectedKeys : [];
      const without = arr.filter((v) => keyOf(v) !== keyOf(value));
      const next = nextChecked
        ? multiSelect
          ? [...without, value]
          : [value]
        : multiSelect
        ? without
        : [];
      onSelectedKeysChange(next);
    }
  }, [
    disabled,
    isChecked,
    value,
    onCheckedChange,
    onSelectedKeysChange,
    selectedKeys,
    multiSelect,
  ]);

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

  const hasBadge = typeof linkCount === "number" && linkCount > 0;

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
            <button
              type="button"
              className="eac-link"
              aria-label={`${linkCount} attached document${linkCount === 1 ? "" : "s"}`}
              onClick={(e) => {
                e.stopPropagation();
                onLinkClick?.(value);
              }}
            >
              <Link size={17} strokeWidth={2.25} />
              <span className="eac-badge">{linkCount}</span>
            </button>
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
