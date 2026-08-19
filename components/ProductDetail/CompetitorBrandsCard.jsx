import React, { useMemo } from "react";
import { parseAmount } from "./pdParse";

/**
 * CompetitorBrandsCard — the "Competitor brands" card (desktop right rail and
 * the mobile Market tab share the same layout).
 *
 * Takes the ERP Item's kly_market_share_table rows RAW:
 *   [{ brands: "ZERODOL-P", company: "IPCA LABS", mat_24: "46.2", mat_25: "305.9" }, …]
 * Growth % is computed from mat_24 → mat_25, bars are scaled to the largest
 * mat_25 value, rows sorted by mat_25 descending (sortByValue).
 *
 * If `top5Value` is given (custom_top_5_market_shares, "469.3Cr"), the footer
 * shows "Published <sum of mat_25> of <top5> Cr" and — when fewer rows are
 * published than expectedCount — the dashed "N of the top 5 brands are not
 * published in the source sheet" note appears automatically.
 */

const STYLE_ID = "elbrit-competitor-brands-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .cbx-card {
      box-sizing: border-box; width: 100%; max-width: 100%;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
      padding: 16px 18px; color: #111827;
      font-family: var(--cbx-font, Inter, system-ui, -apple-system, "Segoe UI", sans-serif);
    }
    .cbx-card *, .cbx-card *::before, .cbx-card *::after { box-sizing: border-box; }
    .cbx-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
    .cbx-title { font-size: 15px; font-weight: 700; color: var(--cbx-navy, #1e3a8a); margin: 0; }
    .cbx-period { font-size: 11px; color: #9ca3af; white-space: nowrap; }

    .cbx-row { margin-top: 14px; }
    .cbx-row-top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
    .cbx-brand { font-size: 13px; font-weight: 700; }
    .cbx-growth { font-size: 12px; font-weight: 700; white-space: nowrap; }
    .cbx-growth--up { color: #111827; }
    .cbx-growth--down { color: #dc2626; }
    .cbx-row-sub { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; color: #9ca3af; margin-top: 2px; }
    .cbx-bar { height: 5px; border-radius: 999px; background: #eef1f5; margin-top: 7px; overflow: hidden; }
    .cbx-bar-fill { height: 100%; border-radius: 999px; background: var(--cbx-navy, #1e3a8a); }

    .cbx-note {
      margin-top: 15px; border: 1px dashed #d1d5db; border-radius: 9px;
      padding: 10px 12px; font-size: 11.5px; color: #9ca3af; text-align: center;
    }
    .cbx-foot {
      display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap;
      margin-top: 13px; padding-top: 11px; border-top: 1px solid #f3f4f6;
      font-size: 10.5px; color: #9ca3af;
    }
  `;
  document.head.appendChild(el);
}

function toNum(v) {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : NaN;
}

export default function CompetitorBrandsCard({
  title = "Competitor brands",
  periodLabel = "MAT 24 → MAT 25",
  brands = [],
  sortByValue = true,
  expectedCount = 5,
  top5Value = "",
  note = "",
  footLeft = "Values in ₹ Cr. * as reported",
  footRight = "",
  className = "",
  style,
}) {
  ensureStyles();

  const rows = useMemo(() => {
    const list = (Array.isArray(brands) ? brands : [])
      .map((b) => {
        if (!b) return null;
        const name = b.name || b.brands || b.brand || "";
        const from = toNum(b.from ?? b.mat_24);
        const to = toNum(b.to ?? b.mat_25);
        return name ? { name, company: b.company || "", from, to } : null;
      })
      .filter(Boolean);
    if (sortByValue) list.sort((a, b) => (b.to || 0) - (a.to || 0));
    return list;
  }, [brands, sortByValue]);

  const maxTo = Math.max(...rows.map((r) => (isFinite(r.to) ? r.to : 0)), 0);
  const published = rows.reduce((a, r) => a + (isFinite(r.to) ? r.to : 0), 0);
  const top5 = parseAmount(top5Value);

  const missing = Math.max(0, expectedCount - rows.length);
  const noteText =
    note ||
    (missing > 0
      ? `${missing} of the top ${expectedCount} brands are not published in the source sheet`
      : "");

  const footRightText =
    footRight ||
    (isFinite(top5.num)
      ? `Published ${published.toLocaleString("en-IN", { maximumFractionDigits: 1 })} of ${top5.num.toLocaleString("en-IN")} ${top5.unit}`
      : "");

  return (
    <div className={`cbx-card ${className}`} style={style}>
      <div className="cbx-head">
        <h3 className="cbx-title">{title}</h3>
        {periodLabel ? <span className="cbx-period">{periodLabel}</span> : null}
      </div>

      {rows.map((r, i) => {
        const growth =
          isFinite(r.from) && isFinite(r.to) && r.from !== 0
            ? ((r.to - r.from) / r.from) * 100
            : NaN;
        const up = isFinite(growth) && growth >= 0;
        return (
          <div key={i} className="cbx-row">
            <div className="cbx-row-top">
              <span className="cbx-brand">{r.name}</span>
              {isFinite(growth) ? (
                <span className={`cbx-growth ${up ? "cbx-growth--up" : "cbx-growth--down"}`}>
                  {up ? "↑" : "↓"} {Math.abs(growth).toFixed(1)}%
                </span>
              ) : null}
            </div>
            <div className="cbx-row-sub">
              <span>{r.company}</span>
              {isFinite(r.from) && isFinite(r.to) ? (
                <span>
                  {r.from} → {r.to}
                </span>
              ) : null}
            </div>
            {maxTo > 0 && isFinite(r.to) ? (
              <div className="cbx-bar">
                <div className="cbx-bar-fill" style={{ width: `${Math.max(2, (r.to / maxTo) * 100)}%` }} />
              </div>
            ) : null}
          </div>
        );
      })}

      {noteText ? <div className="cbx-note">{noteText}</div> : null}

      {footLeft || footRightText ? (
        <div className="cbx-foot">
          <span>{footLeft}</span>
          <span>{footRightText}</span>
        </div>
      ) : null}
    </div>
  );
}
