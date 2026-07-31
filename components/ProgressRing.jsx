import React from "react";
import { segmentRing, progressRing, ringMask } from "./ringGeometry";

/**
 * ProgressRing — the story-style ring ON ITS OWN, as a container you build around in Studio.
 *
 * This is the HYBRID half of the pair. Where `HomeNavRings` ships the whole nav row in code,
 * this ships only the part Studio genuinely cannot express — the ring itself — and hands the
 * rest back to the designer through two slots:
 *
 *   children   the middle of the ring. Drop a Plasmic Icon, Image or Text in here.
 *   badge      pinned to the top-right corner. Drop a Plasmic box in here for the count.
 *              Nothing renders if you leave it empty.
 *
 * So the tile gets assembled in Studio — a vertical stack holding this ring plus your own
 * Text elements for the label and sub-label — and only the arcs come from code. Style the
 * outer element from the Studio style panel as usual; `className` is applied to it.
 *
 * TWO MODES:
 *   mode="segments"  (default) one segment per event, green = done, red = pending. Bind
 *                    `segments` to an array of booleans. An empty array draws a solid,
 *                    unbroken ring in `doneColor` — the "all clear" state. This is the
 *                    countable version: it can never disagree with a badge showing the
 *                    same pending count.
 *   mode="progress"  one continuous arc. Bind `progress` to 0..1 or 0..100. Turn on
 *                    `useGradient` for the original blue -> violet -> pink Instagram sweep.
 *
 * If you have counts rather than a boolean array, leave `segments` empty and set `total`
 * and `pending` — the segments get built for you, completed ones first.
 *
 * Drawn as a CSS conic-gradient behind a radial mask, so several instances on one page
 * cannot collide the way SVG `url(#id)` gradients do. See ./ringGeometry.
 */

const STYLE_ID = "elbrit-progress-ring-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .epr{position:relative;display:inline-flex;flex:none;box-sizing:border-box}
    .epr *{box-sizing:border-box}
    .epr-ring{position:absolute;inset:0;border-radius:50%}
    .epr-inner{position:absolute;border-radius:50%;display:flex;align-items:center;
      justify-content:center;overflow:hidden}
    .epr-badge{position:absolute;top:-2px;right:-2px;z-index:1;display:flex;
      align-items:center;justify-content:center;pointer-events:none}
  `;
  document.head.appendChild(el);
}

export default function ProgressRing({
  mode = "segments",
  segments,
  total,
  pending,
  progress = 0,
  size = 62,
  thickness = 5,
  gapDeg = 5,
  discPadding = 2,
  doneColor = "#16a34a",
  pendingColor = "#dc2626",
  fillColor = "#2563eb",
  trackColor = "#f1f5f9",
  discColor = "#eff6ff",
  useGradient = false,
  gradientColors,
  children,
  badge,
  className,
  style,
}) {
  ensureStyles();

  // Segments come from the array if given, otherwise from the two counts. Completed first.
  const resolved = React.useMemo(() => {
    if (Array.isArray(segments)) return segments.map(Boolean);
    const t = Number(total) || 0;
    const p = Number(pending) || 0;
    const n = Math.max(t, p);
    return n > 0 ? Array.from({ length: n }, (_, i) => i < n - p) : [];
  }, [segments, total, pending]);

  const background =
    mode === "progress"
      ? progressRing(progress, {
          fillColor,
          trackColor,
          gradient: useGradient
            ? gradientColors && gradientColors.length > 1
              ? gradientColors
              : ["#2563eb", "#7c3aed", "#db2777"]
            : null,
        })
      : segmentRing(resolved, { doneColor, pendingColor, gapDeg });

  const mask = ringMask(thickness);
  const hasBadge = React.Children.count(badge) > 0;

  return (
    <div
      className={["epr", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size, ...style }}
    >
      <div className="epr-ring" style={{ background, WebkitMask: mask, mask }} />
      <div
        className="epr-inner"
        style={{ inset: thickness + discPadding, background: discColor }}
      >
        {children}
      </div>
      {hasBadge && <div className="epr-badge">{badge}</div>}
    </div>
  );
}
