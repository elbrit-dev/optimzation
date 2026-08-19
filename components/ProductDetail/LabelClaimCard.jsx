import React, { useMemo } from "react";
import useContainerMode from "./useContainerMode";
import { fmtNum } from "./pdParse";

/**
 * LabelClaimCard — the "Label claim & supply" card (desktop) and the whole
 * Supply tab (mobile).
 *
 * labelClaim takes whg_label_claim raw:
 *   "Each flim coated tablet contains: \nAceclofenac  IP…………100  Mg\n…"
 * The first line renders as the muted caption of the tinted box, the remaining
 * lines as the claim rows (line breaks preserved).
 *
 * The supply facts come from separate props (packText/stockUom/moq/leadTime/
 * manufacturer <- fsl_box×fsl_packing, stock_uom__name, whg_standard_moq,
 * whg_lead_time_to_manufacture, custom_manufacturer__name). Wide: a cell strip;
 * narrow: a label-left / value-right list, exactly like the field-app design.
 */

const STYLE_ID = "elbrit-label-claim-card-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .lcx-card {
      box-sizing: border-box; width: 100%; max-width: 100%;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
      padding: 20px; color: #111827;
      font-family: var(--lcx-font, Inter, system-ui, -apple-system, "Segoe UI", sans-serif);
    }
    .lcx-card *, .lcx-card *::before, .lcx-card *::after { box-sizing: border-box; }
    .lcx-head { display: flex; align-items: center; gap: 14px; }
    .lcx-title { font-size: 16px; font-weight: 700; color: var(--lcx-navy, #1e3a8a); margin: 0; white-space: nowrap; }
    .lcx-rule { flex: 1; height: 1px; background: #e5e7eb; }

    .lcx-claim {
      margin-top: 16px; border-radius: 10px; background: #f6f8fc;
      padding: 14px 16px; font-size: 13px; line-height: 1.6; color: #111827;
    }
    .lcx-claim-caption { font-size: 12px; color: #9ca3af; margin-bottom: 6px; }
    .lcx-claim-line { white-space: pre-wrap; }

    .lcx-cells { display: flex; border: 1px solid #e5e7eb; border-radius: 10px; margin-top: 14px; overflow: hidden; }
    .lcx-cell { flex: 1; min-width: 0; padding: 12px 14px; border-left: 1px solid #e5e7eb; }
    .lcx-cell:first-child { border-left: none; }
    .lcx-cell-label { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #9ca3af; }
    .lcx-cell-value { font-size: 14px; font-weight: 700; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .lcx-rows { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
    .lcx-row {
      display: flex; justify-content: space-between; align-items: baseline; gap: 14px;
      background: #f8fafc; border: 1px solid #eef2f7; border-radius: 9px;
      padding: 11px 13px; font-size: 12.5px;
    }
    .lcx-row-label { color: #9ca3af; }
    .lcx-row-value { font-weight: 700; text-align: right; }
  `;
  document.head.appendChild(el);
}

export default function LabelClaimCard({
  mode = "auto",
  breakpoint = 640,
  title = "Label claim & supply",
  labelClaim = "",
  packText = "",
  packing,
  box,
  stockUom = "",
  moq,
  leadTime,
  manufacturer = "",
  hsnCode = "",
  gstText = "",
  className = "",
  style,
}) {
  ensureStyles();
  const [wrapRef, compact] = useContainerMode(mode, breakpoint);

  const claim = useMemo(() => {
    const lines = String(labelClaim || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return null;
    const capFirst = /contains\s*:?\s*$/i.test(lines[0]) || /:$/.test(lines[0]);
    return {
      caption: capFirst ? lines[0] : "",
      rows: capFirst ? lines.slice(1) : lines,
    };
  }, [labelClaim]);

  const pack =
    packText || (packing && box ? `${box} × ${packing}` : packing ? String(packing) : "");

  const specs = [
    pack ? { label: "Packing", value: pack } : null,
    stockUom ? { label: "Stock UOM", value: stockUom } : null,
    moq ? { label: "Standard MOQ", value: fmtNum(moq) } : null,
    leadTime ? { label: "Lead time", value: `${leadTime} days` } : null,
    manufacturer ? { label: "Manufacturer", value: manufacturer } : null,
    hsnCode ? { label: "HSN code", value: hsnCode } : null,
    gstText ? { label: "GST", value: gstText } : null,
  ].filter(Boolean);

  return (
    <div ref={wrapRef} className={`lcx-card ${className}`} style={style}>
      <div className="lcx-head">
        <h3 className="lcx-title">{title}</h3>
        <span className="lcx-rule" />
      </div>

      {claim ? (
        <div className="lcx-claim">
          {claim.caption ? <div className="lcx-claim-caption">{claim.caption}</div> : null}
          {claim.rows.map((l, i) => (
            <div key={i} className="lcx-claim-line">{l}</div>
          ))}
        </div>
      ) : null}

      {specs.length > 0 &&
        (compact ? (
          <div className="lcx-rows">
            {specs.map((s, i) => (
              <div key={i} className="lcx-row">
                <span className="lcx-row-label">{s.label}</span>
                <span className="lcx-row-value">{s.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="lcx-cells">
            {specs.map((s, i) => (
              <div key={i} className="lcx-cell">
                <div className="lcx-cell-label">{s.label}</div>
                <div className="lcx-cell-value">{s.value}</div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
