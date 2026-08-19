import React, { useMemo, useState } from "react";
import useContainerMode from "./useContainerMode";
import { parseBullets, parseImages, fmtMoney, fmtNum } from "./pdParse";

/**
 * ProductHero — the identity card of the product detail page.
 *
 * Wide container (web console): pack-shot viewer on the left (Rx ONLY badge,
 * ribbon, clickable thumbnails, caption) + on the right the brand · manufacturer
 * · item-code topline, product name, composition/form subtitle, therapeutic tag
 * pills, the MRP / PTR / PTS price strip (margins auto-computed) and the spec
 * line (pack, stock UOM, MOQ, lead time, manufacturer).
 *
 * Narrow container (field app): image carousel with dots, then the price strip
 * and a compact spec strip.
 *
 * Built to take the ERP Item record's raw fields directly:
 *   images   <- custom_product_urls      ([{product_url}] — parsed as-is)
 *   tags     <- custom_therapeutic_class ("• NSAID…\n• Anti-inflammatory…")
 *   subtitle <- whg_composition          ("• Aceclofenac 100 mg\n• Paracetamol 325 mg"
 *                                         → "Aceclofenac 100 mg + Paracetamol 325 mg")
 *   mrp/ptr/pts <- custom_last_mrp / custom_last_ptr / custom_last_pts
 *   Retailer margin = (MRP−PTR)/MRP, stockist margin = (PTR−PTS)/PTR.
 */

const STYLE_ID = "elbrit-product-hero-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .phx-card {
      box-sizing: border-box; width: 100%; max-width: 100%;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
      font-family: var(--phx-font, Inter, system-ui, -apple-system, "Segoe UI", sans-serif);
      color: #111827; overflow: hidden;
    }
    .phx-card *, .phx-card *::before, .phx-card *::after { box-sizing: border-box; }
    .phx-cols { display: flex; gap: 24px; padding: 20px; }
    .phx-cols--compact { flex-direction: column; gap: 0; padding: 0 0 12px 0; }

    /* ---------- gallery ---------- */
    .phx-media { flex: 0 0 42%; min-width: 0; }
    .phx-stage {
      position: relative; border-radius: 10px; background: #f6f8fb;
      display: flex; align-items: center; justify-content: center;
      min-height: 280px; overflow: hidden;
    }
    .phx-stage--compact { border-radius: 0; min-height: 210px; background: #fff; }
    .phx-stage img { max-width: 88%; max-height: 260px; object-fit: contain; }
    .phx-rx {
      position: absolute; top: 12px; left: 12px;
      font-size: 11px; font-weight: 700; color: #dc2626;
      background: #fff; border: 1px solid #fecaca; border-radius: 6px; padding: 3px 8px;
    }
    .phx-ribbon {
      position: absolute; top: 44px; left: 12px;
      font-size: 10.5px; font-weight: 600; color: #fff;
      background: #3b3f8f; border-radius: 4px; padding: 3px 9px;
    }
    .phx-thumbs { display: flex; gap: 10px; margin-top: 12px; align-items: center; }
    .phx-thumb {
      width: 62px; height: 48px; border-radius: 8px; border: 1px solid #e5e7eb;
      background: #fff; cursor: pointer; padding: 3px;
      display: flex; align-items: center; justify-content: center;
    }
    .phx-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .phx-thumb--on { border-color: var(--phx-accent, #2563eb); box-shadow: 0 0 0 1px var(--phx-accent, #2563eb); }
    .phx-media-note { font-size: 11.5px; color: #9ca3af; margin-left: auto; }
    .phx-dots { display: flex; gap: 6px; justify-content: center; padding: 8px 0 4px 0; }
    .phx-dot {
      width: 16px; height: 4px; border-radius: 999px; border: none; padding: 0;
      background: #e5e7eb; cursor: pointer;
    }
    .phx-dot--on { background: var(--phx-navy, #1e3a8a); }

    /* ---------- identity ---------- */
    .phx-body { flex: 1; min-width: 0; }
    .phx-body--pad { padding: 0 15px; }
    .phx-topline {
      display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
      font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
      color: #9ca3af;
    }
    .phx-topline b { color: #6b7280; }
    .phx-topline .phx-sep { color: #e5e7eb; }
    .phx-name { margin: 8px 0 0 0; font-size: 27px; font-weight: 800; color: var(--phx-navy, #1e3a8a); }
    .phx-name--compact { font-size: 18px; }
    .phx-subtitle { font-size: 14px; color: #4b5563; margin-top: 6px; }
    .phx-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .phx-tag { font-size: 11.5px; font-weight: 600; border-radius: 7px; padding: 4px 10px; border: 1px solid; }
    .phx-tag--blue { color: #2563eb; border-color: #bfdbfe; background: #eff6ff; }
    .phx-tag--indigo { color: #4f46e5; border-color: #c7d2fe; background: #eef2ff; }
    .phx-tag--pink { color: #db2777; border-color: #fbcfe8; background: #fdf2f8; }

    /* ---------- prices ---------- */
    .phx-prices {
      display: flex; border: 1px solid #e5e7eb; border-radius: 10px;
      margin-top: 16px; overflow: hidden;
    }
    .phx-price { flex: 1; min-width: 0; padding: 12px 14px; border-left: 1px solid #e5e7eb; }
    .phx-price:first-child { border-left: none; }
    .phx-price-label { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; color: #9ca3af; }
    .phx-price-value { font-size: 20px; font-weight: 800; color: var(--phx-navy, #1e3a8a); margin-top: 4px; white-space: nowrap; }
    .phx-price-value--compact { font-size: 16px; }
    .phx-price-sub { font-size: 11px; color: #9ca3af; margin-top: 3px; }

    /* ---------- specs ---------- */
    .phx-specs {
      display: flex; flex-wrap: wrap; gap: 6px 22px; margin-top: 16px;
      font-size: 12.5px; color: #9ca3af;
    }
    .phx-specs b { color: #111827; font-weight: 600; }
    .phx-specs--strip {
      margin: 12px 15px 0 15px; padding: 10px 12px; gap: 6px 16px;
      background: #f8fafc; border: 1px solid #eef2f7; border-radius: 9px;
      font-size: 11.5px;
    }
  `;
  document.head.appendChild(el);
}

const TAG_TONES = ["blue", "indigo", "pink"];

function marginPct(a, b, base) {
  const x = Number(a), y = Number(b), z = Number(base);
  if (!isFinite(x) || !isFinite(y) || !isFinite(z) || z === 0) return "";
  return (((x - y) / z) * 100).toFixed(1) + "%";
}

export default function ProductHero({
  mode = "auto",
  breakpoint = 640,
  name = "Product name",
  brand = "",
  itemCode = "",
  subtitle = "",
  tags = "",
  rx = true,
  rxLabel = "Rx ONLY",
  ribbon = "",
  images = [],
  mediaNote = "Pack shots from the brand library",
  mrp,
  ptr,
  pts,
  mrpSubtitle = "",
  currency = "₹",
  packText = "",
  packing,
  box,
  stockUom = "",
  moq,
  leadTime,
  manufacturer = "",
  onImageChange,
  className = "",
  style,
}) {
  ensureStyles();
  const [wrapRef, compact] = useContainerMode(mode, breakpoint);
  const [active, setActive] = useState(0);

  const imgs = useMemo(() => parseImages(images), [images]);
  const tagList = useMemo(() => parseBullets(tags), [tags]);
  const subtitleText = useMemo(() => parseBullets(subtitle).join(" + "), [subtitle]);
  const current = imgs[Math.min(active, imgs.length - 1)] || null;

  const setImage = (i) => {
    setActive(i);
    if (typeof onImageChange === "function") onImageChange(i, imgs[i]?.url || "");
  };

  const pack =
    packText ||
    (packing && box ? `${box} × ${packing}` : packing ? String(packing) : "");

  const prices = [
    { label: "MRP", value: mrp, sub: mrpSubtitle || (pack ? `Pack of ${pack}` : "") },
    { label: "PTR", value: ptr, sub: mrp ? `Retailer margin ${marginPct(mrp, ptr, mrp)}` : "" },
    { label: "PTS", value: pts, sub: ptr ? `Stockist margin ${marginPct(ptr, pts, ptr)}` : "" },
  ].filter((p) => p.value != null && p.value !== "");

  const specs = [
    pack ? { label: "Pack", value: pack } : null,
    stockUom ? { label: "Stock UOM", value: stockUom } : null,
    moq ? { label: "MOQ", value: fmtNum(moq) } : null,
    leadTime ? { label: "Lead time", value: `${leadTime} days` } : null,
    manufacturer ? { label: "Manufacturer", value: manufacturer } : null,
  ].filter(Boolean);

  const stage = (
    <div className={`phx-stage ${compact ? "phx-stage--compact" : ""}`}>
      {rx ? <span className="phx-rx">{rxLabel}</span> : null}
      {ribbon ? <span className="phx-ribbon">{ribbon}</span> : null}
      {current ? <img src={current.url} alt={current.label || name} /> : null}
    </div>
  );

  const priceStrip = prices.length > 0 && (
    <div className="phx-prices">
      {prices.map((p, i) => (
        <div key={i} className="phx-price">
          <div className="phx-price-label">{p.label}</div>
          <div className={`phx-price-value ${compact ? "phx-price-value--compact" : ""}`}>
            {fmtMoney(p.value, currency)}
          </div>
          {p.sub ? <div className="phx-price-sub">{p.sub}</div> : null}
        </div>
      ))}
    </div>
  );

  return (
    <div ref={wrapRef} className={`phx-card ${className}`} style={style}>
      <div className={`phx-cols ${compact ? "phx-cols--compact" : ""}`}>
        {compact ? (
          <>
            <div className="phx-body--pad" style={{ paddingTop: 14 }}>
              <div className="phx-topline">
                {brand ? <b>{brand}</b> : null}
                {subtitleText ? (
                  <>
                    <span className="phx-sep">·</span>
                    <span style={{ textTransform: "none", fontWeight: 500 }}>{subtitleText}</span>
                  </>
                ) : null}
              </div>
              <h2 className="phx-name phx-name--compact">{name}</h2>
            </div>
            {imgs.length > 0 && (
              <>
                {stage}
                {imgs.length > 1 && (
                  <div className="phx-dots">
                    {imgs.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Image ${i + 1}`}
                        className={`phx-dot ${i === active ? "phx-dot--on" : ""}`}
                        onClick={() => setImage(i)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="phx-body--pad">{priceStrip}</div>
            {specs.length > 0 && (
              <div className="phx-specs phx-specs--strip">
                {specs.map((s, i) => (
                  <span key={i}>
                    {s.label === "Pack" ? null : <>{s.label} </>}
                    <b>{s.value}</b>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {imgs.length > 0 && (
              <div className="phx-media">
                {stage}
                <div className="phx-thumbs">
                  {imgs.map((im, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`phx-thumb ${i === active ? "phx-thumb--on" : ""}`}
                      onClick={() => setImage(i)}
                      aria-label={im.label}
                    >
                      <img src={im.url} alt={im.label} />
                    </button>
                  ))}
                  {mediaNote ? <span className="phx-media-note">{mediaNote}</span> : null}
                </div>
              </div>
            )}
            <div className="phx-body">
              <div className="phx-topline">
                {brand ? <b>{brand}</b> : null}
                {brand && manufacturer ? <span className="phx-sep">|</span> : null}
                {manufacturer ? <b>{manufacturer}</b> : null}
                {itemCode ? (
                  <>
                    <span className="phx-sep">|</span>
                    <span>Item code {itemCode}</span>
                  </>
                ) : null}
              </div>
              <h2 className="phx-name">{name}</h2>
              {subtitleText ? <div className="phx-subtitle">{subtitleText}</div> : null}
              {tagList.length > 0 && (
                <div className="phx-tags">
                  {tagList.map((t, i) => (
                    <span key={i} className={`phx-tag phx-tag--${TAG_TONES[i % TAG_TONES.length]}`}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {priceStrip}
              {specs.length > 0 && (
                <div className="phx-specs">
                  {specs.map((s, i) => (
                    <span key={i}>
                      {s.label} <b>{s.value}</b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
