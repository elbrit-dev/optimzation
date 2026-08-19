import React, { useMemo } from "react";
import { Check } from "lucide-react";
import { parseBullets, parseSections } from "./pdParse";

/**
 * MechanismCard — the "Mechanism of action" card.
 *
 * Takes the ERP Item's kly_mechanism_table row raw:
 *   content        <- row.content         ("Aceclofenac\n• Inhibits COX…\n\nParacetamol\n• Central…")
 *                     Each blank-line block becomes a tinted panel — first line
 *                     is the panel title, its bullets the body.
 *   takeaways      <- row.mechanism_type  ("• Dual-action pain control…\n• Effective relief…")
 *                     Rendered as ✓ lines under the panels.
 * Structured input works too: content = [{title, items:[…]}].
 * Panels sit side by side when wide, stacked when narrow (plain CSS wrap).
 */

const STYLE_ID = "elbrit-mechanism-card-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .mcx-card {
      box-sizing: border-box; width: 100%; max-width: 100%;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
      padding: 20px; color: #111827;
      font-family: var(--mcx-font, Inter, system-ui, -apple-system, "Segoe UI", sans-serif);
    }
    .mcx-card *, .mcx-card *::before, .mcx-card *::after { box-sizing: border-box; }
    .mcx-head { display: flex; align-items: center; gap: 14px; }
    .mcx-title { font-size: 16px; font-weight: 700; color: var(--mcx-navy, #1e3a8a); margin: 0; white-space: nowrap; }
    .mcx-rule { flex: 1; height: 1px; background: #e5e7eb; }
    .mcx-caption { font-size: 11.5px; color: #9ca3af; white-space: nowrap; }

    .mcx-panels { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 16px; }
    .mcx-panel {
      flex: 1 1 260px; min-width: 240px; border-radius: 10px;
      background: #f6f8fc; padding: 14px 16px;
    }
    .mcx-panel-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 13.5px; font-weight: 700; color: #111827;
    }
    .mcx-panel-dot { width: 7px; height: 7px; border-radius: 999px; flex: none; }
    .mcx-panel-body { font-size: 13px; color: #4b5563; line-height: 1.5; margin-top: 7px; }
    .mcx-panel-body div { margin-top: 4px; }

    .mcx-checks { margin-top: 15px; display: flex; flex-direction: column; gap: 8px; }
    .mcx-check { display: flex; gap: 9px; font-size: 13px; color: #374151; align-items: flex-start; }
    .mcx-check svg { flex: none; margin-top: 2px; color: #111827; }
  `;
  document.head.appendChild(el);
}

const DOT_COLORS = ["#2563eb", "#a21caf", "#0d9488", "#d97706"];

export default function MechanismCard({
  title = "Mechanism of action",
  caption = "",
  content = "",
  takeaways = "",
  className = "",
  style,
}) {
  ensureStyles();

  const panels = useMemo(() => {
    if (Array.isArray(content)) {
      return content
        .map((p) => {
          if (!p) return null;
          if (typeof p === "string") return { heading: "", items: parseBullets(p) };
          return { heading: p.title || p.heading || "", items: parseBullets(p.items ?? p.text ?? "") };
        })
        .filter(Boolean);
    }
    return parseSections(content);
  }, [content]);

  const checks = useMemo(() => parseBullets(takeaways), [takeaways]);

  return (
    <div className={`mcx-card ${className}`} style={style}>
      <div className="mcx-head">
        <h3 className="mcx-title">{title}</h3>
        <span className="mcx-rule" />
        {caption ? <span className="mcx-caption">{caption}</span> : null}
      </div>

      {panels.length > 0 && (
        <div className="mcx-panels">
          {panels.map((p, i) => (
            <div key={i} className="mcx-panel">
              {p.heading ? (
                <div className="mcx-panel-title">
                  <span className="mcx-panel-dot" style={{ background: DOT_COLORS[i % DOT_COLORS.length] }} />
                  {p.heading}
                </div>
              ) : null}
              <div className="mcx-panel-body">
                {p.items.map((it, j) => (
                  <div key={j}>{it}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {checks.length > 0 && (
        <div className="mcx-checks">
          {checks.map((c, i) => (
            <div key={i} className="mcx-check">
              <Check size={14} />
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
