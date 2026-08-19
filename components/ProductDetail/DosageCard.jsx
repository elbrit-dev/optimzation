import React, { useMemo } from "react";
import { parseSections } from "./pdParse";

/**
 * DosageCard — the "Dosage" card.
 *
 * Takes the ERP Item's kly_dose raw:
 *   "Adults:\n• 1 tablet twice daily, after meals\n\nDuration:\n• Short-term use (3–7 days) or as advised"
 * Each blank-line block renders as a section — its heading muted, its bullets
 * as the text. The first section is emphasised (bigger line), matching the
 * design's "20 mg once daily, adults" treatment; the optional `dose` prop puts
 * an explicit big value in front (e.g. "20 mg") when the strength is known.
 */

const STYLE_ID = "elbrit-dosage-card-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .dsx-card {
      box-sizing: border-box; width: 100%; max-width: 100%;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
      padding: 20px; color: #111827;
      font-family: var(--dsx-font, Inter, system-ui, -apple-system, "Segoe UI", sans-serif);
    }
    .dsx-card *, .dsx-card *::before, .dsx-card *::after { box-sizing: border-box; }
    .dsx-head { display: flex; align-items: center; gap: 14px; }
    .dsx-title { font-size: 16px; font-weight: 700; color: var(--dsx-navy, #1e3a8a); margin: 0; white-space: nowrap; }
    .dsx-rule { flex: 1; height: 1px; background: #e5e7eb; }

    .dsx-hero { margin-top: 14px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .dsx-dose { font-size: 32px; font-weight: 800; color: var(--dsx-navy, #1e3a8a); }
    .dsx-qualifier { font-size: 14px; color: #374151; }
    .dsx-primary { font-size: 15px; color: #111827; margin-top: 12px; line-height: 1.5; }
    .dsx-note { font-size: 13px; color: #4b5563; margin-top: 8px; line-height: 1.5; }
    .dsx-section {
      margin-top: 13px; padding-top: 12px; border-top: 1px solid #f3f4f6;
      font-size: 13px; color: #374151; line-height: 1.5;
    }
    .dsx-section-label { color: #9ca3af; }
  `;
  document.head.appendChild(el);
}

export default function DosageCard({
  title = "Dosage",
  dose = "",
  doseQualifier = "",
  doseText = "",
  note = "",
  className = "",
  style,
}) {
  ensureStyles();
  const sections = useMemo(() => parseSections(doseText), [doseText]);
  const [first, ...rest] = sections;

  return (
    <div className={`dsx-card ${className}`} style={style}>
      <div className="dsx-head">
        <h3 className="dsx-title">{title}</h3>
        <span className="dsx-rule" />
      </div>

      {dose ? (
        <div className="dsx-hero">
          <span className="dsx-dose">{dose}</span>
          {doseQualifier ? <span className="dsx-qualifier">{doseQualifier}</span> : null}
        </div>
      ) : null}

      {first ? (
        <div className="dsx-primary">
          {first.heading && !dose ? <span className="dsx-section-label">{first.heading} · </span> : null}
          {first.items.join(" ")}
        </div>
      ) : null}

      {note ? <div className="dsx-note">{note}</div> : null}

      {rest.map((s, i) => (
        <div key={i} className="dsx-section">
          {s.heading ? <span className="dsx-section-label">{s.heading} · </span> : null}
          {s.items.join(" ")}
        </div>
      ))}
    </div>
  );
}
