"use client";

import { useLayoutEffect, useRef, useState } from "react";

/* Section page -- the shell a "See all" / "Open" from the Home overview lands
 * on: the design's detail header (back arrow, section name, period, two stat
 * chips) above an open slot for the page's own report component.
 *
 * No background or frame of its own: the page around it decides that.
 * Nothing here fetches. The title, the period and the two chips are props, so
 * each page fills them from whatever it already has (a static value, or a
 * binding to its own data); the report itself goes in the slot. */

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";

const CSS = `
.sp-root{font-family:Inter,system-ui,sans-serif;color:#0b1220;-webkit-font-smoothing:antialiased;box-sizing:border-box}
.sp-root *,.sp-root *::before,.sp-root *::after{box-sizing:border-box}
.sp-root button{font-family:inherit;color:inherit;margin:0}
.sp-root button:focus-visible{outline:2px solid #2563eb;outline-offset:3px}
@media (hover:hover) and (pointer:fine){.sp-root .sp-back:hover{background:#f7f8fa!important}}`;

const TONES = { default: "#0b1220", red: "#b42318", green: "#067647", amber: "#b54708", blue: "#1d4ed8" };

function useContainerWidth(ref) {
  const [w, setW] = useState(1024);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function Stat({ value, label, tone }) {
  if (value == null || value === "") return null;
  return (
    <span style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "7px 12px", borderRadius: 10, background: "#f7f8fa", boxShadow: "inset 0 0 0 1px #eef0f3", minWidth: 0 }}>
      <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: TONES[tone] || TONES.default, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
      {label && <span style={{ fontSize: 12, color: "#5b6576", whiteSpace: "nowrap" }}>{label}</span>}
    </span>
  );
}

export default function SectionPage({
  title = "Primary", period = "",
  stat1Value, stat1Label, stat1Tone = "default",
  stat2Value, stat2Label, stat2Tone = "default",
  showBack = true, sticky = true, stickyTop = 0, contentPadding = false,
  onBack, children, className,
}) {
  const rootRef = useRef(null);
  const cw = useContainerWidth(rootRef);
  const desk = cw >= 768;
  const pad = desk ? "24px" : "12px";

  return (
    <div ref={rootRef} className={"sp-root" + (className ? " " + className : "")} style={{ width: "100%" }}>
      <link rel="stylesheet" href={FONT_HREF} />
      <style>{CSS}</style>

      <section style={{
        position: sticky ? "sticky" : "relative", top: sticky ? stickyTop : undefined, zIndex: 20,
        background: "rgba(255,255,255,.96)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 1px 0 #e4e7ec", padding: `${desk ? 12 : 10}px ${pad}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: desk ? 12 : 8, flexWrap: "wrap" }}>
          {showBack && (
            <button type="button" className="sp-back" onClick={() => onBack?.()} aria-label="Back"
              style={{ width: 38, height: 38, flex: "none", borderRadius: 10, border: "1px solid #e4e7ec", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "#344054" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
          )}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: desk ? 24 : 20, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{title}</h1>
            {period && <span style={{ fontSize: 12, color: "#8a93a3" }}>{period}</span>}
          </div>
          {/* On a phone the chips take their own row, under the title, so the
              title and period are not squeezed into a narrow column. */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", ...(desk ? {} : { width: "100%" }) }}>
            <Stat value={stat1Value} label={stat1Label} tone={stat1Tone} />
            <Stat value={stat2Value} label={stat2Label} tone={stat2Tone} />
          </div>
        </div>
      </section>

      <main style={{ padding: contentPadding ? (desk ? `16px ${pad} 40px` : `12px ${pad} 20px`) : 0 }}>
        {children}
      </main>
    </div>
  );
}
