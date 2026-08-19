import React from "react";

/**
 * DetailingAngleCard — the navy quote card with the rep's one-line pitch
 * ("DETAILING ANGLE — "Same 24-hour control, without the pedal edema…"").
 * Renders nothing when the quote is empty, so it's safe to bind a field that
 * doesn't exist yet on every Item.
 */

const STYLE_ID = "elbrit-detailing-angle-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .dax-card {
      box-sizing: border-box; width: 100%; max-width: 100%;
      background: var(--dax-bg, #16255c); border-radius: 14px;
      padding: 18px 20px; color: #fff;
      font-family: var(--dax-font, Inter, system-ui, -apple-system, "Segoe UI", sans-serif);
    }
    .dax-label {
      font-size: 10.5px; font-weight: 700; letter-spacing: .09em;
      text-transform: uppercase; color: rgba(255,255,255,.55);
    }
    .dax-quote { font-size: 15px; font-weight: 700; line-height: 1.45; margin-top: 8px; }
  `;
  document.head.appendChild(el);
}

export default function DetailingAngleCard({
  label = "Detailing angle",
  quote = "",
  quoteMarks = true,
  className = "",
  style,
}) {
  ensureStyles();
  if (!quote) return null;
  return (
    <div className={`dax-card ${className}`} style={style}>
      <div className="dax-label">{label}</div>
      <div className="dax-quote">{quoteMarks ? `“${quote}”` : quote}</div>
    </div>
  );
}
