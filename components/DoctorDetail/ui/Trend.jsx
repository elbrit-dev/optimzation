"use client";

/**
 * The monthly trend.
 *
 * Money series are smoothed lines on one shared rupee axis; visits are counts,
 * so they sit on their own rail below as dots that grow with the count rather
 * than being forced onto a scale where 3 visits and ₹90,000 share a height.
 *
 * Every month is a full-height invisible button, so the crosshair answers to a
 * tap as readily as a hover — the design is used one-handed in the field as
 * often as on a desk.
 */

import React, { useRef } from "react";

export default function Trend({
  title = "Monthly trend",
  readLabel, page, cols, yLabels, lines, series,
  crossLeft, markers, tip, onHover, onLeave,
}) {
  const startX = useRef(null);

  return (
    <div className="dx-panel-pad" style={{ padding: "11px 13px 10px" }}>
      <div className="dx-panel-head" style={{ flexWrap: "wrap" }}>
        <h2>{title}</h2>
        <span className="dx-pill">{readLabel}</span>
        <div className="dx-spring" />
        {page.many ? (
          <div className="dx-pager">
            <button type="button" aria-label="Previous department" onClick={page.prev}>‹</button>
            <span>{page.label}</span>
            <button type="button" aria-label="Next department" onClick={page.next}>›</button>
          </div>
        ) : null}
      </div>

      <div className="dx-chart">
        <div className="dx-chart-y dx-num">
          {yLabels.map((y, i) => <span key={i}>{y}</span>)}
        </div>
        <div
          className="dx-chart-plot"
          onTouchStart={(e) => { startX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (startX.current == null) return;
            const dx = e.changedTouches[0].clientX - startX.current;
            startX.current = null;
            if (Math.abs(dx) < 40 || !page.many) return;
            (dx < 0 ? page.next : page.prev)();
          }}
        >
          <i className="dx-grid-line" style={{ top: 0 }} />
          <i className="dx-grid-line" style={{ top: "33.3%" }} />
          <i className="dx-grid-line" style={{ top: "66.6%" }} />

          <svg viewBox="0 0 600 184" preserveAspectRatio="none" className="dx-chart-svg" aria-hidden="true">
            {lines.map((l) => (
              <path
                key={l.k}
                d={l.line}
                fill="none"
                stroke={l.hue}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          <i className="dx-cross" style={{ left: crossLeft + "%" }} aria-hidden="true" />
          {markers.map((m) => (
            <i key={m.k} className="dx-marker" style={{ left: crossLeft + "%", top: m.top + "%", background: m.hue }} />
          ))}

          <div className="dx-hit" onMouseLeave={onLeave}>
            {cols.map((c, i) => (
              <button
                key={i}
                type="button"
                aria-label={c.aria}
                onClick={() => onHover(i)}
                onMouseEnter={() => onHover(i)}
                onFocus={() => onHover(i)}
              />
            ))}
          </div>

          {tip ? (
            <div className="dx-tip" style={{ left: tip.left + "%", transform: "translateX(" + tip.shift + ")" }}>
              <div className="dx-tip-box">
                <div className="dx-tip-t">{tip.label}</div>
                <div className="dx-tip-rows">
                  {tip.rows.map((t) => (
                    <div className="dx-tip-row" key={t.label}>
                      <i style={{ background: t.hue }} />
                      <span>{t.label}</span>
                      <b className="dx-num">{t.value}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="dx-visrail">
        <span>Visits</span>
        <div className="dx-visrail-track">
          {cols.map((c, i) => (
            <div className="dx-visrail-cell" key={i}>
              {c.visOn
                ? <i style={{ background: "#047857", width: c.visSize, height: c.visSize }} />
                : <i style={{ background: "#e2e6ee", width: 3, height: 3 }} />}
            </div>
          ))}
        </div>
      </div>

      <div className="dx-xaxis">
        {cols.map((c, i) => (
          <div key={i}>
            {c.on || c.showLabel
              ? <span className={"dx-xlab" + (c.on ? " dx-xlab--on" : "")}>{c.short}</span>
              : null}
          </div>
        ))}
      </div>

      <div className="dx-legend">
        {series.map((s) => (
          <button
            key={s.k}
            type="button"
            className={s.on ? undefined : "dx-off"}
            onClick={s.toggle}
            aria-pressed={s.on}
            aria-label={(s.on ? "Hide " : "Show ") + s.label}
          >
            <i style={{ background: s.hue }} />
            <span>{s.label}</span>
            <b className="dx-num">{s.value}</b>
          </button>
        ))}
      </div>

      <p className="dx-chart-foot">
        Lines share one ₹ axis · visits sit on the rail below (bigger dot = more visits) · hover or tap a month for the full read
      </p>
    </div>
  );
}
