"use client";

/**
 * The totals carousel: one card per metric, with the last three entries and a
 * way into the timeline filtered to that metric.
 *
 * The peeking cards either side are buttons, not decoration — on a desktop the
 * fastest way to the next total is to click the thing you can already see. They
 * are dropped on compact, where there is no room for them and the swipe does
 * the same job.
 */

import React, { useRef } from "react";
import { Icon, TONE } from "./parts";

export default function Banner({ order, cards, index, onIndex, compact }) {
  const startX = useRef(null);
  if (!order.length) return null;

  const idx = Math.min(index, order.length - 1);
  const key = order[idx];
  const tone = TONE[key];
  const card = cards[key];
  const prevKey = order[(idx - 1 + order.length) % order.length];
  const nextKey = order[(idx + 1) % order.length];

  const go = (delta) => onIndex(((idx + delta) % order.length + order.length) % order.length);

  const peek = (k, side) => {
    const t = TONE[k];
    const c = cards[k];
    return (
      <button
        type="button"
        className={"dx-peek dx-peek--" + side}
        aria-label={"Show " + t.label}
        onClick={() => onIndex(order.indexOf(k))}
        style={{
          border: "1px solid " + t.bd,
          background: "linear-gradient(118deg," + t.tint + " 0%,#fff 70%)",
        }}
      >
        <span style={{ border: "1px solid " + t.bd, color: t.hue }}>{t.label}</span>
        <b className="dx-num dx-clip">{c.value}</b>
        <em className="dx-clip">{c.sub}</em>
      </button>
    );
  };

  return (
    <>
      <div className="dx-banner-head" style={{ maxWidth: compact ? "none" : 1010 }}>
        <span className="dx-eyebrow">Totals {cards.scope}</span>
        <i className="dx-hr" />
        <span className="dx-num" style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>
          {idx + 1} / {order.length}
        </span>
      </div>

      <div
        className="dx-banner-stage"
        style={{ maxWidth: compact ? "none" : 1010 }}
        onTouchStart={(e) => { startX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (startX.current == null) return;
          const d = e.changedTouches[0].clientX - startX.current;
          startX.current = null;
          if (Math.abs(d) < 36) return;
          go(d < 0 ? 1 : -1);
        }}
      >
        <div className="dx-banner-rail">
          {!compact ? peek(prevKey, "prev") : null}

          <div className="dx-banner-slot">
            <div
              className="dx-banner"
              style={{
                border: "1px solid " + tone.bd,
                background: "linear-gradient(118deg," + tone.tint + " 0%,#fff 58%)",
              }}
            >
              <span className="dx-banner-ghost" aria-hidden="true">
                {tone.icon({ size: 124, w: 1, rest: { stroke: tone.hue } })}
              </span>

              <div className="dx-banner-lead">
                <span className="dx-banner-kind" style={{ border: "1px solid " + tone.bd, color: tone.hue }}>
                  {tone.icon({ size: 13, w: 2 })}
                  {tone.label}
                </span>
                <b className="dx-banner-value dx-num dx-break">{card.value}</b>
                <span className="dx-banner-sub">{card.sub}</span>
              </div>

              <i className="dx-banner-div" style={{ background: tone.bd }} />

              <div className="dx-banner-items">
                <div className="dx-eyebrow">{card.itemsLabel}</div>
                {card.items.length ? (
                  <div className="dx-item-row">
                    {card.items.map((it, i) => (
                      <div className="dx-item" key={i} title={it.full}>
                        <span className="dx-a dx-clip">{it.a}</span>
                        <span className="dx-c dx-clip">
                          {Icon.person({ size: 7 })}
                          {it.c}
                        </span>
                        <b className="dx-b dx-num dx-clip" style={{ color: tone.hue }}>{it.b}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="dx-banner-empty">Nothing recorded in this period.</div>
                )}
              </div>

              <div className="dx-banner-foot">
                <span>Newest first · {card.shownOf}</span>
                <button type="button" className="dx-view-all" onClick={card.open} style={{ background: tone.hue }}>
                  View all<span style={{ fontSize: 13 }}>→</span>
                </button>
              </div>
            </div>

            <button type="button" className="dx-arrow dx-arrow--l" aria-label="Previous total" onClick={() => go(-1)}>‹</button>
            <button type="button" className="dx-arrow dx-arrow--r" aria-label="Next total" onClick={() => go(1)}>›</button>
          </div>

          {!compact ? peek(nextKey, "next") : null}
        </div>

        <div className="dx-dots">
          {order.map((k, i) => (
            <button
              key={k}
              type="button"
              aria-label={TONE[k].label}
              aria-current={i === idx}
              onClick={() => onIndex(i)}
              className={"dx-dot" + (i === idx ? " dx-dot--on" : "")}
            />
          ))}
        </div>
      </div>
    </>
  );
}
