import React from "react";
import useContainerMode from "./useContainerMode";
import { parseAmount } from "./pdParse";

/**
 * MarketSizeCard — the "Molecule market size" card.
 *
 * Takes the ERP Item's amount strings raw:
 *   marketSize <- whg_market_size            ("631Cr")
 *   top5Value  <- custom_top_5_market_shares ("469.3Cr")
 * The top-5 share % and the progress bar are computed from the two numbers
 * (override with sharePct). Wide: single stat card with the bar and caption.
 * Narrow: the field-app Market-tab layout — two tiles + the share bar row.
 */

const STYLE_ID = "elbrit-market-size-card-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .msx-root {
      box-sizing: border-box; width: 100%; max-width: 100%;
      font-family: var(--msx-font, Inter, system-ui, -apple-system, "Segoe UI", sans-serif);
      color: #111827; display: flex; flex-direction: column; gap: 12px;
    }
    .msx-root *, .msx-root *::before, .msx-root *::after { box-sizing: border-box; }
    .msx-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px 18px; }
    .msx-kicker { font-size: 10.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #9ca3af; }
    .msx-big { font-size: 30px; font-weight: 800; color: var(--msx-navy, #1e3a8a); margin-top: 6px; }
    .msx-big small { font-size: 15px; font-weight: 700; margin-left: 4px; }
    .msx-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-top: 12px; font-size: 12.5px; }
    .msx-row b { font-size: 14px; font-weight: 700; }
    .msx-bar { height: 6px; border-radius: 999px; background: #e5e7eb; margin-top: 8px; overflow: hidden; }
    .msx-bar-fill { height: 100%; border-radius: 999px; background: var(--msx-accent, #2563eb); }
    .msx-caption { font-size: 11.5px; color: #9ca3af; margin-top: 8px; }

    .msx-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .msx-tile { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 13px 15px; }
    .msx-tile-value { font-size: 20px; font-weight: 800; color: var(--msx-navy, #1e3a8a); margin-top: 5px; }
    .msx-tile-value small { font-size: 12px; font-weight: 700; margin-left: 3px; }
    .msx-sharecard { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 13px 15px; }
    .msx-share-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 12.5px; }
    .msx-share-row b { font-size: 14px; font-weight: 800; }
  `;
  document.head.appendChild(el);
}

export default function MarketSizeCard({
  mode = "auto",
  breakpoint = 640,
  title = "Molecule market size",
  marketSize = "",
  top5Value = "",
  top5Label = "Top 5 brands",
  sharePct,
  moleculeName = "",
  caption = "",
  className = "",
  style,
}) {
  ensureStyles();
  const [wrapRef, compact] = useContainerMode(mode, breakpoint);

  const mkt = parseAmount(marketSize);
  const top5 = parseAmount(top5Value, mkt.unit);
  const pct =
    sharePct != null && sharePct !== ""
      ? Number(sharePct)
      : isFinite(mkt.num) && isFinite(top5.num) && mkt.num > 0
      ? (top5.num / mkt.num) * 100
      : NaN;
  const pctText = isFinite(pct) ? `${pct.toFixed(1)}%` : "";
  const captionText =
    caption ||
    (pctText
      ? `${pctText} of the ${moleculeName ? moleculeName + " " : ""}market sits with the top 5 brands`
      : "");

  const fmt = (a) => (isFinite(a.num) ? a.num.toLocaleString("en-IN") : "");

  if (compact) {
    return (
      <div ref={wrapRef} className={`msx-root ${className}`} style={style}>
        <div className="msx-tiles">
          <div className="msx-tile">
            <div className="msx-kicker">Market size</div>
            <div className="msx-tile-value">
              {fmt(mkt)}
              <small>{mkt.unit}</small>
            </div>
          </div>
          <div className="msx-tile">
            <div className="msx-kicker">{top5Label}</div>
            <div className="msx-tile-value">
              {fmt(top5)}
              <small>{top5.unit}</small>
            </div>
          </div>
        </div>
        {pctText ? (
          <div className="msx-sharecard">
            <div className="msx-share-row">
              <span>Top 5 share{moleculeName ? ` of ${moleculeName}` : " of molecule"}</span>
              <b>{pctText}</b>
            </div>
            <div className="msx-bar">
              <div className="msx-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`msx-root ${className}`} style={style}>
      <div className="msx-card">
        <div className="msx-kicker">{title}</div>
        <div className="msx-big">
          {fmt(mkt)}
          <small>{mkt.unit}</small>
        </div>
        {isFinite(top5.num) ? (
          <div className="msx-row">
            <span>{top5Label}</span>
            <b>
              {fmt(top5)} {top5.unit}
            </b>
          </div>
        ) : null}
        {isFinite(pct) ? (
          <div className="msx-bar">
            <div className="msx-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        ) : null}
        {captionText ? <div className="msx-caption">{captionText}</div> : null}
      </div>
    </div>
  );
}
