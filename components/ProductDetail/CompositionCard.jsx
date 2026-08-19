import React, { useMemo } from "react";
import { parseBullets } from "./pdParse";

/**
 * CompositionCard — the mobile Overview tab's "COMPOSITION" card:
 * uppercase kicker, the composition line, and the therapeutic tag pills.
 *
 * Bind the ERP Item raw:
 *   composition <- whg_composition          ("• Aceclofenac 100 mg\n• Paracetamol 325 mg"
 *                                            → "Aceclofenac 100 mg + Paracetamol 325 mg")
 *   tags        <- custom_therapeutic_class (bullet string → pills, same tones as the hero)
 * Works anywhere (desktop too) — it has no layout switch, just a compact card.
 */

const STYLE_ID = "elbrit-composition-card-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .cpx-card {
      box-sizing: border-box; width: 100%; max-width: 100%;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
      padding: 16px 18px; color: #111827;
      font-family: var(--cpx-font, Inter, system-ui, -apple-system, "Segoe UI", sans-serif);
    }
    .cpx-card *, .cpx-card *::before, .cpx-card *::after { box-sizing: border-box; }
    .cpx-kicker {
      font-size: 10.5px; font-weight: 700; letter-spacing: .07em;
      text-transform: uppercase; color: #9ca3af;
    }
    .cpx-composition { font-size: 15px; font-weight: 700; margin-top: 6px; }
    .cpx-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .cpx-tag { font-size: 11.5px; font-weight: 600; border-radius: 7px; padding: 4px 10px; border: 1px solid; }
    .cpx-tag--blue { color: #2563eb; border-color: #bfdbfe; background: #eff6ff; }
    .cpx-tag--indigo { color: #4f46e5; border-color: #c7d2fe; background: #eef2ff; }
    .cpx-tag--pink { color: #db2777; border-color: #fbcfe8; background: #fdf2f8; }
  `;
  document.head.appendChild(el);
}

const TAG_TONES = ["blue", "indigo", "pink"];

export default function CompositionCard({
  kicker = "Composition",
  composition = "",
  separator = " + ",
  tags = "",
  className = "",
  style,
}) {
  ensureStyles();
  const compText = useMemo(
    () => parseBullets(composition).join(separator),
    [composition, separator]
  );
  const tagList = useMemo(() => parseBullets(tags), [tags]);

  if (!compText && !tagList.length) return null;

  return (
    <div className={`cpx-card ${className}`} style={style}>
      {kicker ? <div className="cpx-kicker">{kicker}</div> : null}
      {compText ? <div className="cpx-composition">{compText}</div> : null}
      {tagList.length > 0 && (
        <div className="cpx-tags">
          {tagList.map((t, i) => (
            <span key={i} className={`cpx-tag cpx-tag--${TAG_TONES[i % TAG_TONES.length]}`}>
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
