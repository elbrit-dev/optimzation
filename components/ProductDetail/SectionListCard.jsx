import React, { useMemo } from "react";
import useContainerMode from "./useContainerMode";
import { parseBullets } from "./pdParse";

/**
 * SectionListCard — one generic content card of the product detail page,
 * reused for three sections via `variant`:
 *   numbered — Key clinical benefits (01–06)   <- kly_key_cinical_benf
 *   bullet   — Patient profile                 <- kly_patient_profile
 *   chips    — Target customers (+ Advantage)  <- kly_target_doc / whg_advantages
 *
 * `items` accepts the ERP's raw bullet-string ("• a\n• b") OR an array — no
 * mapping needed in Studio. Two columns when the container is wide, one when
 * narrow. The optional footer renders "Advantage · <text>" under a divider.
 */

const STYLE_ID = "elbrit-section-list-card-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .slc-card {
      box-sizing: border-box; width: 100%; max-width: 100%;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
      padding: 20px; color: #111827;
      font-family: var(--slc-font, Inter, system-ui, -apple-system, "Segoe UI", sans-serif);
    }
    .slc-card *, .slc-card *::before, .slc-card *::after { box-sizing: border-box; }
    .slc-head { display: flex; align-items: center; gap: 14px; }
    .slc-title { font-size: 16px; font-weight: 700; color: var(--slc-navy, #1e3a8a); margin: 0; white-space: nowrap; }
    .slc-rule { flex: 1; height: 1px; background: #e5e7eb; }
    .slc-caption { font-size: 11.5px; color: #9ca3af; white-space: nowrap; }

    .slc-grid { display: grid; gap: 12px 32px; margin-top: 16px; }
    .slc-item { display: flex; gap: 10px; font-size: 13.5px; color: #374151; line-height: 1.45; }
    .slc-num { font-size: 12px; font-weight: 700; color: var(--slc-accent, #2563eb); flex: none; padding-top: 1px; }
    .slc-dot { width: 5px; height: 5px; border-radius: 999px; background: var(--slc-accent, #2563eb); flex: none; margin-top: 8px; }

    .slc-chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .slc-chip {
      font-size: 12.5px; font-weight: 500; color: #374151;
      border: 1px solid #e5e7eb; border-radius: 999px; padding: 6px 14px; background: #fff;
    }
    .slc-footer {
      margin-top: 16px; padding-top: 13px; border-top: 1px solid #f3f4f6;
      font-size: 13px; color: #111827;
    }
    .slc-footer-label { color: #9ca3af; }
  `;
  document.head.appendChild(el);
}

export default function SectionListCard({
  mode = "auto",
  breakpoint = 640,
  title = "Key clinical benefits",
  caption = "",
  variant = "numbered",
  items = "",
  columns = 2,
  footerLabel = "",
  footerText = "",
  className = "",
  style,
}) {
  ensureStyles();
  const [wrapRef, compact] = useContainerMode(mode, breakpoint);
  const list = useMemo(() => parseBullets(items), [items]);
  const cols = compact ? 1 : Math.max(1, columns);

  return (
    <div ref={wrapRef} className={`slc-card ${className}`} style={style}>
      <div className="slc-head">
        <h3 className="slc-title">{title}</h3>
        <span className="slc-rule" />
        {caption ? <span className="slc-caption">{caption}</span> : null}
      </div>

      {variant === "chips" ? (
        <div className="slc-chips">
          {list.map((it, i) => (
            <span key={i} className="slc-chip">{it}</span>
          ))}
        </div>
      ) : (
        <div className="slc-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {list.map((it, i) => (
            <div key={i} className="slc-item">
              {variant === "numbered" ? (
                <span className="slc-num">{String(i + 1).padStart(2, "0")}</span>
              ) : (
                <span className="slc-dot" />
              )}
              <span>{it}</span>
            </div>
          ))}
        </div>
      )}

      {footerText ? (
        <div className="slc-footer">
          {footerLabel ? <span className="slc-footer-label">{footerLabel} · </span> : null}
          {footerText}
        </div>
      ) : null}
    </div>
  );
}
