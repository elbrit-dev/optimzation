"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Router from "next/router";
import { buildView, primaryPanel, repsPanel, secondaryPanel, supportPanel, updatedLabel, visitPanel } from "./model";
import { SAMPLE } from "./sampleData";
import { useOverviewData } from "./data/useOverviewData";

/* Home overview -- the "Elbrit Home" design below the entry rings.
 *
 * Desktop opens on a command board: Primary on the left (achievement vs pace,
 * Sales / Returns / Offers, the units furthest behind), Visit, Secondary and
 * Support on the right, and a "Needs your attention" strip. A phone gets the
 * same four as a swipe deck. Below: Field activity, Team ranking, Sell-through
 * and Support value rails. Tiles open a detail panel (a dialog on desktop, a
 * bottom sheet on a phone); "See all" and "Open" report through onOpen.
 *
 * There is no period picker: each section shows this month to date, or last
 * month when this one has nothing yet. Units are departments for a token
 * that sees several, HQs for one that sees a single department.
 *
 *   onOpen(section, hq)   section = primary | secondary | visit | support
 *
 * Each section also has its own event -- onOpenPrimary, onOpenSecondary,
 * onOpenVisit, onOpenSupport -- for a Studio "Go to page" action. When a
 * section's event is wired, that action is the navigation; when it is not,
 * "See all" / "Open" go to the section's path (primaryPath ...
 * supportPath, /home/<section> by default) by themselves. */

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";

/* Inline styles win over classes, so hover rules need !important. Hover is
   gated to real pointers so a tap on a phone doesn't leave a tile lifted. */
const CSS = `
.ho-root{font-family:Inter,system-ui,sans-serif;color:#0b1220;-webkit-font-smoothing:antialiased;box-sizing:border-box}
.ho-root *,.ho-root *::before,.ho-root *::after{box-sizing:border-box}
.ho-root button{font-family:inherit;color:inherit;margin:0}
.ho-root button:focus-visible{outline:2px solid #2563eb;outline-offset:3px}
.ho-root .ho-rail{scrollbar-width:none}
.ho-root .ho-rail::-webkit-scrollbar{display:none}
@keyframes ho-pulse{0%,100%{opacity:1}50%{opacity:.5}}
@media (hover:hover) and (pointer:fine){
.ho-root .ho-tile:hover{transform:translateY(-3px)!important;box-shadow:0 0 0 1px #d0d5dd,0 14px 28px -16px rgba(16,24,40,.35)!important}
.ho-root .ho-link:hover{background:#eef3fe!important}
.ho-root .ho-ghost:hover{background:#f7f8fa!important}
.ho-root .ho-cta:hover{background:#1d4ed8!important}
.ho-root .ho-row:hover{background:#fafbfc!important}
.ho-root .ho-x:hover{background:#e4e7ec!important}
}
.ho-root .ho-cta:active{transform:scale(.98)}
@media (prefers-reduced-motion:reduce){.ho-root *{transition:none!important}}`;

const SLIDE_MS = 8000;

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

const Chevron = ({ d = "M9 6l6 6-6 6", size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const Arrow = () => <Chevron d="M5 12h14M13 6l6 6-6 6" size={17} />;

const eyebrow = { fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#8a93a3" };
const tabNum = { fontVariantNumeric: "tabular-nums" };
const ell = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const track = (h) => ({ height: h, borderRadius: 99, background: "#eef1f5", overflow: "hidden" });
const fill = (w, c = "#2563eb") => ({ display: "block", height: "100%", width: w, background: c, borderRadius: 99 });
const circleBtn = { width: 34, height: 34, borderRadius: "50%", border: "1px solid #e4e7ec", background: "#fff", cursor: "pointer", display: "grid", placeItems: "center", color: "#475467" };
const board = { background: "#fff", borderRadius: 16, boxShadow: "0 0 0 1px #e4e7ec,0 12px 28px -24px rgba(16,24,40,.35)" };

function Tile({ width, onClick, style, children, label }) {
  return (
    <button type="button" className="ho-tile" onClick={onClick} aria-label={label} style={{
      flex: "none", width, scrollSnapAlign: "start", display: "flex", flexDirection: "column", gap: 12, padding: 18,
      borderRadius: 14, border: 0, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec", textAlign: "left", cursor: "pointer",
      transition: "transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s", ...style,
    }}>
      {children}
    </button>
  );
}

function Row({ L, kicker, dot, title, onSeeAll, arrows, railRef, children, footer, alignStart }) {
  const scroll = (d) => {
    const el = railRef?.current;
    if (el) el.scrollBy({ left: d * el.clientWidth * 0.8, behavior: "smooth" });
  };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, padding: `0 ${L.pad}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...eyebrow, display: "flex", alignItems: "center", gap: 7 }}>
            {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot }} />}
            {kicker}
          </div>
          <h2 style={{ margin: "3px 0 0", fontSize: L.rowTitle, fontWeight: 700, letterSpacing: "-0.02em" }}>{title}</h2>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="ho-link" onClick={onSeeAll} style={{ display: "flex", alignItems: "center", gap: 4, height: 34, padding: "0 6px 0 10px", borderRadius: 8, border: 0, background: "transparent", color: "#1d4ed8", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          See all<Chevron />
        </button>
        {arrows && (
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" aria-label="Scroll left" className="ho-ghost" onClick={() => scroll(-1)} style={circleBtn}><Chevron d="M15 6l-6 6 6 6" size={15} /></button>
            <button type="button" aria-label="Scroll right" className="ho-ghost" onClick={() => scroll(1)} style={circleBtn}><Chevron size={15} /></button>
          </div>
        )}
      </div>
      <div ref={railRef} className="ho-rail" style={{ display: "flex", alignItems: alignStart ? "flex-start" : "stretch", gap: L.tileGap, overflowX: "auto", scrollSnapType: "x mandatory", padding: `8px ${L.pad} 12px`, scrollPadding: `0 ${L.pad}` }}>
        {children}
      </div>
      {footer}
    </section>
  );
}

function Chip({ t, fg, bg }) {
  return <span style={{ flex: "none", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, background: bg, color: fg }}>{t}</span>;
}
/* wrap: the chip drops under the kicker when both do not fit, rather than
   the kicker being cut to "DOCTOR SUPPORT · J" -- the narrow side cards. */
function Kicker({ dot, text, children, wrap }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: wrap ? "4px 10px" : 10, minWidth: 0, flexWrap: wrap ? "wrap" : "nowrap" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#5b6576", ...(wrap ? { whiteSpace: "nowrap" } : ell) }}>
        <span style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: dot }} />{text}
      </span>
      {children}
    </div>
  );
}
function OpenLink({ onClick }) {
  return (
    <button type="button" className="ho-link" onClick={onClick} style={{ flex: "none", display: "flex", alignItems: "center", gap: 3, height: 28, padding: "0 6px 0 10px", borderRadius: 8, border: 0, background: "transparent", color: "#1d4ed8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
      Open<Chevron size={15} />
    </button>
  );
}

/* ---------------- Command board (desktop) ---------------- */

function PrimaryCard({ P, open, pop }) {
  const c = P.card;
  return (
    <div style={{ ...board, display: "flex", flexDirection: "column", gap: 18, padding: "22px 24px", minWidth: 0 }}>
      <Kicker dot="#d97706" text={c.kicker}>
        <Chip t={c.verdict} fg={c.vFg} bg={c.vBg} /><span style={{ flex: 1 }} /><OpenLink onClick={() => open("primary")} />
      </Kicker>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "12px 28px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span style={{ fontSize: 60, fontWeight: 700, letterSpacing: "-0.045em", lineHeight: 0.9, ...tabNum }}>{c.pct}</span><span style={{ fontSize: 15, color: "#5b6576" }}>of target</span></div>
        <div style={{ fontSize: 14, color: "#475467", paddingBottom: 4 }}><b style={{ color: "#0b1220" }}>{c.ach}</b> booked of {c.tgt}</div>
        {c.today && (
          <button type="button" onClick={() => pop({ mode: "pri", k: null })} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "7px 12px", borderRadius: 10, border: 0, background: "#eef3fe", marginBottom: 2, cursor: "pointer" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8" }}>{c.todayLbl}</span><b style={{ fontSize: 17, letterSpacing: "-0.01em", ...tabNum }}>{c.today}</b><span style={{ fontSize: 12, color: "#5b6576" }}>{c.todaySub}</span>
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ position: "relative", height: 14, borderRadius: 99, background: "#eef1f5" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: c.w, borderRadius: 99, background: c.barC }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: "#5b6576" }}>
          <span>₹0</span><b style={{ color: "#0b1220", fontWeight: 600 }}>{c.toGo}</b><span>Target {c.tgt}</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 1, borderRadius: 12, overflow: "hidden", background: "#eef0f3", boxShadow: "0 0 0 1px #eef0f3" }}>
        {c.tot.map((k) => (
          <div key={k.l} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "12px 14px", background: k.bg, boxShadow: `inset 3px 0 0 ${k.c}`, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: k.c }}>{k.l}</span>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: k.c, ...tabNum, ...ell }}>{k.v}</span>
            <span style={{ fontSize: 11, color: "#5b6576" }}>{k.s}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{c.lagT}</span><span style={{ fontSize: 11, color: "#8a93a3" }}>% of target</span></div>
        {c.lag.map((t) => (
          <button key={t.key} type="button" className="ho-row" onClick={() => pop({ mode: "pri", k: t.key })} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1.4fr) 54px", gap: 12, alignItems: "center", padding: "7px 0", border: 0, borderTop: "1px solid #f2f4f7", background: "transparent", textAlign: "left", cursor: "pointer" }}>
            <span style={{ fontSize: 13, fontWeight: 500, ...ell }}>{t.short}</span>
            <span style={{ position: "relative", height: 6, borderRadius: 99, background: "#eef1f5" }}><span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: t.w, borderRadius: 99, background: t.bar }} /></span>
            <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right", color: t.fg, ...tabNum }}>{t.pctTxt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniCard({ dot, card, onOpen, children }) {
  return (
    <div style={{ ...board, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,150px)", gap: 16, alignItems: "center", padding: "16px 18px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <Kicker dot={dot} text={card.kicker} wrap><Chip t={card.verdict} fg={card.vFg} bg={card.vBg} /></Kicker>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}><span style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05, ...tabNum }}>{card.big}</span><span style={{ fontSize: 13, color: "#5b6576" }}>{card.sub}</span></div>
        <div style={{ fontSize: 12, color: "#475467", textWrap: "pretty" }}>{card.note}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, minWidth: 0 }}>
        {children}
        <div style={{ display: "flex", justifyContent: "flex-end" }}><OpenLink onClick={onOpen} /></div>
      </div>
    </div>
  );
}
const MiniBars = ({ bars }) => (
  <div style={{ height: 56, display: "flex", alignItems: "flex-end", gap: 4, borderBottom: "1px solid #e4e7ec" }}>
    {bars.map((b, i) => <span key={i} style={{ flex: 1, height: b.h, background: b.c, borderRadius: "3px 3px 0 0" }} />)}
  </div>
);

function CommandBoard({ L, view, open, pop }) {
  const { P, V, S, U, HA } = view;
  return (
    <>
      <div style={{ margin: `16px ${L.pad} 0`, display: "grid", gridTemplateColumns: L.cmdCols, gap: 12 }}>
        {P ? <PrimaryCard P={P} open={open} pop={pop} /> : <div />}
        <div style={{ display: "grid", gridTemplateRows: "repeat(3,auto)", gap: 12, minWidth: 0 }}>
          {V && <MiniCard dot="#16a34a" card={V.card} onOpen={() => open("visit")}><MiniBars bars={V.card.bars} /></MiniCard>}
          {S && (
            <MiniCard dot="#2563eb" card={S.card} onOpen={() => open("secondary")}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", height: 12, borderRadius: 99, overflow: "hidden", gap: 2 }}><span style={{ width: S.card.soldW, background: "#2563eb" }} /><span style={{ flex: 1, background: "#dbe5f7" }} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#5b6576" }}><span>Sold</span><span>Closing</span></div>
              </div>
            </MiniCard>
          )}
          {U && <MiniCard dot="#2563eb" card={U.card} onOpen={() => open("support")}><MiniBars bars={U.card.bars} /></MiniCard>}
        </div>
      </div>
      {HA.length > 0 && (
        <div style={{ margin: `12px ${L.pad} 0`, ...board, display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, padding: "14px 20px", borderRight: "1px solid #eef0f3" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Needs your attention</span><span style={{ fontSize: 11, color: "#8a93a3" }}>{HA.length} {HA.length === 1 ? "item" : "items"}</span>
          </div>
          {HA.map((a) => (
            <button key={a.t} type="button" className="ho-row" onClick={() => pop(a.act)} style={{ flex: "1 1 200px", minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", border: 0, borderRight: "1px solid #eef0f3", background: "transparent", textAlign: "left", cursor: "pointer" }}>
              <span style={{ flex: "none", width: 8, height: 8, borderRadius: "50%", background: a.c }} />
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}><span style={{ fontSize: 13, fontWeight: 600, ...ell }}>{a.t}</span><span style={{ fontSize: 12, color: "#5b6576", ...ell }}>{a.s}</span></span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------- Phone swipe deck ---------------- */

function MobileCard({ s, pace, open, clone }) {
  return (
    <div aria-hidden={clone || undefined} style={{ flex: "none", width: "88%", scrollSnapAlign: "start", borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec,0 8px 20px -14px rgba(16,24,40,.3)", display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#5b6576" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />{s.kicker}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: s.title.length > 10 ? 30 : 40, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, ...tabNum }}>{s.title}</span>
        <span style={{ fontSize: 14, color: "#5b6576" }}>{s.sub}</span>
      </div>
      <div style={{ height: 52, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {s.isRing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
            <div style={{ position: "relative", height: 10, borderRadius: 99, background: "#eef1f5" }}>
              <div style={{ position: "absolute", inset: "0 auto 0 0", width: s.w, borderRadius: 99, background: s.barC || "#2563eb" }} />
              {pace && <div style={{ position: "absolute", left: pace.pct, top: -5, bottom: -5, width: 2, background: "#0b1220" }} />}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#5b6576" }}><span>{s.ringA}</span><span>{pace ? "Pace " + pace.txt : s.ringB}</span></div>
          </div>
        ) : (
          <div style={{ height: 52, display: "flex", alignItems: "flex-end", gap: 6, borderBottom: "1px solid #e4e7ec" }}>
            {s.bars.map((b, i) => (
              <div key={i} style={{ flex: 1, height: "100%", position: "relative" }}>
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: b.gh, borderRadius: "5px 5px 0 0", background: "#eef1f5", border: b.gb || 0, borderBottom: 0 }} />
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: b.h, borderRadius: "5px 5px 0 0", background: b.c }} />
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {s.mstats.map((m) => (
          <div key={m.l} style={{ display: "flex", flexDirection: "column", gap: 1, padding: "10px 12px", borderRadius: 10, background: "#f7f8fa", minWidth: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", color: m.c || "#0b1220", ...tabNum, ...ell }}>{m.v}</span>
            <span style={{ fontSize: 11, color: "#5b6576" }}>{m.l}</span>
          </div>
        ))}
      </div>
      <button type="button" className="ho-cta" tabIndex={clone ? -1 : undefined} onClick={() => open(s.key)} style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 12, border: 0, background: "#2563eb", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
        Open {s.name}<Arrow />
      </button>
    </div>
  );
}

/* The swipe deck. It turns on its own every SLIDE_MS and loops without end:
   a copy of the first card sits after the last, the deck scrolls forward onto
   it, and the moment it lands there the scroll is put back on the real first
   card with no animation -- the two are identical, so the reader sees an
   endless strip rather than a rewind across every card. A touch holds it; a
   swipe or a dot restarts the count from the card it lands on. Reduced
   motion switches the timer off; the dots and swiping still work. */
function MobileHero({ slides, pace, open }) {
  const railRef = useRef(null);
  const [cur, setCur] = useState(0);
  const [held, setHeld] = useState(false);
  const n = slides.length;
  const loop = n > 1;

  const step = () => {
    const el = railRef.current, c = el?.firstElementChild;
    return c ? c.offsetWidth + 12 : el?.clientWidth || 1;
  };
  /* The dot follows the tap or the timer at once, not the scroll event: a
     swipe still updates it through onScroll, but a jump the deck made
     itself should not depend on the browser getting round to telling us. */
  const wrapRef = useRef(null);
  const goTo = (i) => {
    const el = railRef.current;
    if (!el) return;
    clearTimeout(wrapRef.current);
    el.scrollTo({ left: i * step(), behavior: "smooth" });
    setCur(i >= n ? 0 : i);
    // Onto the copy of the first card: back onto the real one once it lands.
    if (i >= n) wrapRef.current = setTimeout(() => el.scrollTo({ left: 0, behavior: "auto" }), 700);
  };
  useEffect(() => () => clearTimeout(wrapRef.current), []);

  const onScroll = (e) => {
    const el = e.currentTarget, s = step();
    const at = el.scrollLeft / s;
    // Landed on the copy of the first card: swap to the real one, unseen.
    if (loop && at >= n - 0.02) {
      clearTimeout(wrapRef.current);
      el.scrollTo({ left: (at - n) * s, behavior: "auto" });
      if (cur !== 0) setCur(0);
      return;
    }
    const i = Math.max(0, Math.min(n - 1, Math.round(at)));
    if (i !== cur) setCur(i);
  };

  useEffect(() => {
    if (!loop || held) return undefined;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const t = setTimeout(() => goTo(cur + 1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [cur, held, loop]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-label="Highlights" aria-roledescription="carousel" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
      <div ref={railRef} className="ho-rail" onScroll={onScroll}
        onTouchStart={() => setHeld(true)} onTouchEnd={() => setHeld(false)} onTouchCancel={() => setHeld(false)}
        onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
        style={{ display: "flex", alignItems: "stretch", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", padding: "0 16px 4px", scrollPadding: "0 16px" }}>
        {slides.map((s) => <MobileCard key={s.key} s={s} pace={pace} open={open} />)}
        {loop && <MobileCard key="loop-copy" s={slides[0]} pace={pace} open={open} clone />}
      </div>
      {loop && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          {slides.map((s, i) => (
            <button key={s.key} type="button" aria-label={"Show " + s.name} aria-current={i === cur} onClick={() => goTo(i)}
              style={{ border: 0, background: "none", padding: "8px 3px", cursor: "pointer", display: "grid", placeItems: "center" }}>
              <span style={{ display: "block", width: i === cur ? 20 : 6, height: 6, borderRadius: 3, background: i === cur ? "#2563eb" : "#d0d5dd", transition: "width .3s,background .3s" }} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- Rails ---------------- */

function VisitRow({ L, view, open, pop }) {
  const { V, kind } = view;
  const between = { justifyContent: "space-between" };
  return (
    <Row L={L} kicker={V.kicker} dot={V.live ? "#16a34a" : null} title="Field activity" onSeeAll={() => open("visit")}>
      <Tile width={L.wideW} onClick={() => pop({ mode: "visit", u: null, f: "all" })}>
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Visits by hour</span>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{V.done}<span style={{ fontSize: 13, fontWeight: 500, color: "#8a93a3" }}> / {V.plan}</span></span>
        </span>
        <span style={{ height: 100, display: "flex", alignItems: "flex-end", gap: 6, borderBottom: "1px solid #e4e7ec" }}>
          {V.allHours.map((h, i) => (
            <span key={i} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2 }}>
              <span style={{ height: h.fH, background: "#dc2626", borderRadius: "3px 3px 0 0" }} />
              <span style={{ height: h.gH, background: "#16a34a", borderRadius: h.gR }} />
            </span>
          ))}
        </span>
        <span style={{ display: "flex", gap: 12, fontSize: 12, color: "#5b6576" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#16a34a" }} />Geo {V.geoT}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#dc2626" }} />Force {V.forceT}</span>
          <span style={{ marginLeft: "auto", color: "#8a93a3" }}>{V.range}</span>
        </span>
      </Tile>
      {V.reps && (
        <Tile width={L.posterW} onClick={() => pop({ mode: "reps", f: "not" })} style={between}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Reps reported</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}>{V.reps.reported}</span>
            <span style={{ fontSize: 13, color: "#8a93a3" }}>of {V.reps.total}</span>
          </span>
          <span style={{ display: "flex", height: 6, borderRadius: 99, overflow: "hidden", gap: 2, background: "#eef1f5" }}>
            <span style={{ width: V.repsW.rep, background: "#16a34a" }} /><span style={{ width: V.repsW.not, background: "#dc2626" }} />
          </span>
          <span style={{ fontSize: 12, color: "#5b6576" }}>{V.repsW.notN} not yet · {V.reps.vacant} vacant</span>
        </Tile>
      )}
      {V.units.map((h) => (
        <Tile key={h.key} width={L.posterW} onClick={() => pop({ mode: "visit", u: h.key, f: "all" })} style={between}>
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{h.short}</span>
            <span style={{ fontSize: 11, color: "#8a93a3", flex: "none" }}>{kind}</span>
          </span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}>{h.done}</span>
            <span style={{ fontSize: 13, color: "#8a93a3" }}>/ {h.plan} visits</span>
          </span>
          <span style={track(6)}><span style={fill(h.w)} /></span>
          <span style={{ fontSize: 12, color: "#5b6576" }}>{h.pending} pending · {h.forceN} force</span>
        </Tile>
      ))}
    </Row>
  );
}

function PrimaryRow({ L, view, open, pop, railRef }) {
  const { P, TD } = view;
  return (
    <Row L={L} kicker={"Primary · " + (P.period.label || "")} title="Team ranking" onSeeAll={() => open("primary")} arrows={L.isDesk} railRef={railRef}>
      {TD && (
        <Tile width={L.wideW} onClick={() => pop({ mode: "pri", k: null })}>
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{TD.title}</span>
              <span style={{ fontSize: 12, color: "#5b6576" }}>{TD.count} · {TD.by}</span>
            </span>
            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", ...tabNum }}>{TD.total}</span>
          </span>
          <span style={{ display: "flex", flexDirection: "column" }}>
            {TD.top.map((i) => (
              <span key={i.key} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "4px 10px", alignItems: "center", padding: "7px 0", borderTop: "1px solid #f2f4f7" }}>
                <span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 500, ...ell }}>{i.name}</span><span style={{ fontSize: 11, color: "#8a93a3" }}>{i.nS}</span></span>
                <span style={{ fontSize: 13, fontWeight: 600, ...tabNum }}>{i.v}</span>
                <span style={{ gridColumn: "1/-1", ...track(3) }}><span style={{ ...fill(i.w, "#93b4f5") }} /></span>
              </span>
            ))}
          </span>
        </Tile>
      )}
      {/* The Sell-through card's shape, on target vs Inc. Primary: the bar and
          the percentage take the unit's band colour. */}
      {P.tiles.map((t) => (
        <Tile key={t.key ?? "all"} width={L.landW} onClick={() => pop({ mode: "pri", k: t.key })} style={{ boxShadow: t.all ? "0 0 0 1.5px #2563eb" : "0 0 0 1px #e4e7ec" }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{t.all ? t.name : t.short}</span>
            <span style={{ fontSize: 12, color: "#8a93a3", whiteSpace: "nowrap" }}>Target {t.tgtC}</span>
          </span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1, color: t.dot, ...tabNum }}>{t.pctTxt}</span>
            <span style={{ fontSize: 13, color: "#5b6576" }}>achieved</span>
          </span>
          <span style={track(6)}><span style={fill(t.w, t.dot)} /></span>
          {/* This unit's own invoicing for the day -- the department's on a
              department card, the HQ's on an HQ card -- in the command card's
              Today chip. "Yesterday" / the latest day when today has none. */}
          {t.todayC != null && (
            <span style={{ alignSelf: "flex-start", display: "flex", alignItems: "baseline", gap: 7, padding: "6px 10px", borderRadius: 10, background: "#eef3fe", maxWidth: "100%" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8" }}>{P.todayLbl}</span>
              <b style={{ fontSize: 15, letterSpacing: "-0.01em", ...tabNum }}>{t.todayC}</b>
              <span style={{ fontSize: 12, color: "#5b6576", whiteSpace: "nowrap" }}>{t.todayN} {t.todayN === 1 ? "invoice" : "invoices"}</span>
            </span>
          )}
          {/* Its top two HQs (teams, on All teams) -- none when the card is an HQ. */}
          {t.hqTop?.length > 0 && (
            <span style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {t.hqTop.map((h) => (
                <span key={h.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 70px 48px", gap: 8, alignItems: "center", fontSize: 12 }}>
                  <span style={{ color: "#344054", ...ell }}>{h.name}</span>
                  <span style={track(4)}><span style={fill(h.w, h.c)} /></span>
                  <span style={{ fontWeight: 600, color: h.fg, textAlign: "right", ...tabNum }}>{h.pctTxt}</span>
                </span>
              ))}
            </span>
          )}
          {/* One per line, label left and the full amount right: three full
              rupee amounts side by side do not fit a card, on a phone least.
              Pinned to the bottom: the cards stretch to the row's tallest tile
              (Invoiced today), and the spare height sits above the figures. */}
          <span style={{ display: "flex", flexDirection: "column", marginTop: "auto", ...tabNum }}>
            {t.cells.map((c) => (
              <span key={c.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, padding: "7px 0", borderTop: "1px solid #f2f4f7" }}>
                <span style={{ fontSize: 12, color: "#5b6576" }}>{c.l}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: c.c || "#0b1220", whiteSpace: "nowrap" }}>{c.n}</span>
              </span>
            ))}
          </span>
        </Tile>
      ))}
    </Row>
  );
}

function SecondaryRow({ L, view, open, pop }) {
  const { S } = view;
  return (
    <Row L={L} kicker={"Secondary · " + (S.period.label || "")} title="Sell-through by team" onSeeAll={() => open("secondary")}>
      {S.tiles.map((t) => (
        <Tile key={t.key ?? "all"} width={L.landW} onClick={() => pop({ mode: "sec", k: t.key })} style={{ boxShadow: t.all ? "0 0 0 1.5px #2563eb" : "0 0 0 1px #e4e7ec" }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</span>
            <span style={{ fontSize: 12, color: "#8a93a3", whiteSpace: "nowrap" }}>{t.dist} {t.dist === 1 ? "distributor" : "distributors"}</span>
          </span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1, ...tabNum }}>{t.pctTxt}</span>
            <span style={{ fontSize: 13, color: "#5b6576" }}>sold</span>
          </span>
          <span style={track(6)}><span style={fill(t.w)} /></span>
          <span style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, ...tabNum }}>
            {t.cells.map((c) => (
              <span key={c.l} style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 11, color: "#8a93a3" }}>{c.l}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{c.n}</span>
              </span>
            ))}
          </span>
        </Tile>
      ))}
    </Row>
  );
}

function SupportRow({ L, view, open, pop }) {
  const { U } = view;
  return (
    <Row L={L} kicker={U.kicker} title="Support value" onSeeAll={() => open("support")}>
      <Tile width={L.wideW} onClick={() => pop({ mode: "sup", k: -1 })}>
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1 }}>{U.latest}</span>
            <span style={{ fontSize: 12, color: "#5b6576" }}>{U.latestSub}</span>
          </span>
          {U.dd && <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: U.dd.bg, color: U.dd.c }}>{U.dd.t}</span>}
        </span>
        <span style={{ height: 84, display: "flex", alignItems: "flex-end", gap: 10, borderBottom: "1px solid #e4e7ec" }}>
          {U.mini.map((m) => <span key={m.l} style={{ flex: 1, height: m.h, background: m.c, borderRadius: "5px 5px 0 0" }} />)}
        </span>
        <span style={{ display: "flex", gap: 10 }}>
          {U.mini.map((m) => <span key={m.l} style={{ flex: 1, textAlign: "center", fontSize: 11, color: m.lc, fontWeight: m.lw }}>{m.l}</span>)}
        </span>
      </Tile>
      {U.cast.map((m) => (
        <Tile key={m.key} width={L.posterW} onClick={() => pop({ mode: "sup", k: m.key })}>
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ width: 40, height: 40, borderRadius: "50%", background: "#f2f4f7", color: "#344054", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>{m.ini}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#5b6576", background: "#f2f4f7", padding: "2px 8px", borderRadius: 99 }}>{m.role ? m.role + " · " : ""}#{m.rank}</span>
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, minHeight: 36 }}>{m.name}</span>
          <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{m.vS}</span>
            <span style={track(5)}><span style={fill(m.w)} /></span>
            <span style={{ fontSize: 12, color: "#5b6576" }}>{m.share} of total</span>
          </span>
        </Tile>
      ))}
      {U.health && (
        <Tile width={L.landW} onClick={() => open("support")}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
            {U.health.issues > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: "#fffaeb", color: "#b54708" }}>{U.health.issues} {U.health.issues === 1 ? "issue" : "issues"}</span>}
            Data health
          </span>
          <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <span style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>{U.health.zero}</span><span style={{ fontSize: 12, color: "#5b6576" }}>lines with ₹0 rate</span></span>
            <span style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>{U.health.vacant}</span><span style={{ fontSize: 12, color: "#5b6576" }}>on vacant profiles</span></span>
          </span>
          {U.health.lastImport && <span style={{ fontSize: 12, color: "#8a93a3", marginTop: "auto" }}>Last import {U.health.lastImport}</span>}
        </Tile>
      )}
    </Row>
  );
}

/* ---------------- Detail panel ---------------- */

const filterBtn = (on) => ({ flex: "none", height: 32, padding: "0 12px", borderRadius: 99, border: 0, background: on ? "#0b1220" : "#fff", color: on ? "#fff" : "#344054", boxShadow: on ? "none" : "inset 0 0 0 1px #d0d5dd", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" });
const kpiBox = { display: "flex", flexDirection: "column", gap: 2, padding: "10px 12px", borderRadius: 10, background: "#f7f8fa", minWidth: 0 };
const boxed = { display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 12, boxShadow: "0 0 0 1px #e4e7ec" };

function Kpis({ kpis }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {kpis.map((k) => (
        <div key={k.l} style={kpiBox}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#5b6576" }}>{k.dot && <span style={{ width: 7, height: 7, borderRadius: 2, background: k.dot }} />}{k.l}</span>
          <span title={String(k.v)} style={{ fontSize: String(k.v).length > 10 ? 15 : 19, fontWeight: 700, letterSpacing: "-0.02em", color: k.c || "#0b1220", ...tabNum, ...ell }}>{k.v}</span>
          {k.s && <span style={{ fontSize: 11, color: "#8a93a3", ...ell }}>{k.s}</span>}
        </div>
      ))}
    </div>
  );
}

function DetailBody({ spec }) {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <Kpis kpis={spec.kpis} />
        {spec.bar && (
          <div style={boxed}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{spec.bar.t}</span>
            <div style={{ position: "relative", height: 10, borderRadius: 99, background: spec.bar.bg || "#eef1f5" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: spec.bar.w, borderRadius: 99, background: spec.bar.c || "#2563eb" }} />
              {spec.bar.mk && <div style={{ position: "absolute", left: spec.bar.mk, top: -4, bottom: -4, width: 2, background: "#0b1220" }} />}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "#5b6576" }}><span>{spec.bar.l}</span><span>{spec.bar.r}</span></div>
          </div>
        )}
        {spec.chart && (
          <div style={boxed}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{spec.chart.t}</span>
            <div style={{ height: 96, display: "flex", alignItems: "flex-end", gap: 8, borderBottom: "1px solid #e4e7ec" }}>
              {spec.chart.bars.map((b) => (
                <span key={b.l} style={{ flex: 1, height: "100%", position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: b.h, background: b.c, borderRadius: "4px 4px 0 0" }} />
                  <span style={{ position: "absolute", left: -6, right: -6, bottom: `calc(${b.h} + 3px)`, textAlign: "center", fontSize: 10, fontWeight: 600, color: "#344054" }}>{b.v}</span>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>{spec.chart.bars.map((b) => <span key={b.l} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#8a93a3" }}>{b.l}</span>)}</div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
        {spec.groups && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 }}>
            {spec.groups.map((g) => (
              <div key={g.t} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", borderRadius: 12, background: g.bg, boxShadow: `inset 0 0 0 1px ${g.bd}`, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: g.hc }}>{g.t}</span>
                {g.rows.map((r) => (
                  <div key={r.l} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "#5b6576" }}>{r.l}</span>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 5, whiteSpace: "nowrap", minWidth: 0, overflow: "hidden" }}><b style={{ fontSize: 14, color: g.vc, ...tabNum }}>{r.v}</b><span style={{ fontSize: 11, color: "#8a93a3" }}>{r.p}</span></span>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, paddingTop: 6, marginTop: "auto", borderTop: `1px solid ${g.bd}`, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: "#344054" }}>{g.totL}</span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 5, whiteSpace: "nowrap", minWidth: 0, overflow: "hidden" }}><b style={{ fontSize: 14, color: g.vc, ...tabNum }}>{g.totV}</b><span style={{ fontSize: 11, color: "#8a93a3" }}>{g.totP}</span></span>
                </div>
              </div>
            ))}
          </div>
        )}
        {spec.tables.map((tb) => (
          <div key={tb.t} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 8 }}><span style={{ fontSize: 14, fontWeight: 600 }}>{tb.t}</span><span style={{ fontSize: 11, color: "#8a93a3" }}>{tb.s}</span></div>
            <div style={{ display: "grid", gridTemplateColumns: tb.gtc, gap: 10, padding: "0 0 6px", fontSize: 11, fontWeight: 600, color: "#8a93a3" }}>{tb.head.map((c) => <span key={c.t} style={{ textAlign: c.a }}>{c.t}</span>)}</div>
            {tb.loading && <div style={{ padding: "14px 0", borderTop: "1px solid #f2f4f7", fontSize: 12, color: "#8a93a3" }}>Loading…</div>}
            {!tb.loading && !tb.rows.length && <div style={{ padding: "14px 0", borderTop: "1px solid #f2f4f7", fontSize: 12, color: "#8a93a3" }}>Nothing on file.</div>}
            {tb.rows.map((r, i) => (
              <div key={r.name + i} style={{ display: "grid", gridTemplateColumns: tb.gtc, gap: "4px 10px", alignItems: "center", padding: "9px 0", borderTop: "1px solid #f2f4f7" }}>
                <span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 500, ...ell }}>{r.name}</span>{r.sub && <span style={{ display: "block", fontSize: 11, color: "#8a93a3", ...ell }}>{r.sub}</span>}</span>
                {r.cells.map((c, j) => <span key={j} style={{ textAlign: "right", fontSize: 13, fontWeight: c.fw, color: c.c, ...tabNum, whiteSpace: "nowrap" }}>{c.v}</span>)}
                {r.w && <span style={{ gridColumn: "1/-1", ...track(4) }}><span style={{ ...fill(r.w, r.wc), borderRadius: 0 }} /></span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function VisitBody({ spec, setPan, pan }) {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <Kpis kpis={spec.kpis} />
        <div style={boxed}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Visits by hour</span>
          <div style={{ height: 110, display: "flex", alignItems: "flex-end", gap: 5, borderBottom: "1px solid #e4e7ec" }}>
            {spec.hours.map((b, i) => (
              <span key={i} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2 }}>
                <span style={{ height: b.fH, background: "#dc2626", borderRadius: "3px 3px 0 0" }} /><span style={{ height: b.gH, background: "#16a34a", borderRadius: b.gR }} />
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 5 }}>{spec.hours.map((b, i) => <span key={i} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#8a93a3" }}>{b.label}</span>)}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="ho-rail" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10 }}>
          {spec.filters.map((f) => <button key={f.k} type="button" onClick={() => setPan({ ...pan, f: f.k })} style={filterBtn(f.on)}>{f.label} · {f.n}</button>)}
        </div>
        {spec.rows.map((m) => (
          <div key={m.id} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8, padding: `12px 0 12px ${m.lvl * 18}px`, borderTop: "1px solid #f2f4f7" }}>
            {m.lvl > 0 && <span style={{ position: "absolute", left: m.lvl * 18 - 10, top: 0, bottom: 0, width: 1, background: "#d0d5dd" }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {m.kids ? (
                <button type="button" aria-expanded={m.isOpen} aria-label={"Show team of " + m.name} onClick={() => setPan({ ...pan, exp: { ...(pan.exp || {}), [m.id]: !m.isOpen } })}
                  style={{ flex: "none", width: 24, height: 24, marginLeft: -4, borderRadius: 6, border: 0, background: "#f2f4f7", color: "#344054", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <span style={{ display: "grid", transform: `rotate(${m.isOpen ? 90 : 0}deg)`, transition: "transform .2s" }}><Chevron size={12} /></span>
                </button>
              ) : <span style={{ flex: "none", width: 20 }} />}
              <span style={{ flex: "none", width: 34, height: 34, borderRadius: "50%", background: m.av, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>{m.ini}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, ...ell }}>{m.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, minWidth: 0 }}><span style={{ flex: "none", fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: "#eef3fe", color: "#1d4ed8" }}>{m.role}</span><span style={{ fontSize: 12, color: "#5b6576", ...ell }}>{m.rep}</span></div>
              </div>
              {m.isUnit && <button type="button" onClick={() => setPan({ mode: "visit", u: m.unit, f: "all" })} style={{ flex: "none", height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid #2563eb", background: "#fff", color: "#1d4ed8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Open ›</button>}
            </div>
            {m.has && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 62 }}>
                <span style={track(4)}><span style={{ ...fill(m.w, m.barC), borderRadius: 0 }} /></span>
                <span style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#5b6576" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a" }} />Geo <b style={{ color: "#0b1220" }}>{m.geo}</b> · Joint <b style={{ color: "#0b1220" }}>{m.joint}</b></span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#dc2626" }} />Force <b style={{ color: "#0b1220" }}>{m.force}</b></span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#98a2b3" }} />Pending <b style={{ color: "#0b1220" }}>{m.pending}</b></span>
                </span>
              </div>
            )}
            {m.noPlan && <span style={{ paddingLeft: 62, fontSize: 12, color: "#b54708" }}>No doctor plan filed</span>}
          </div>
        ))}
        {spec.empty && <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: "#8a93a3" }}>No one matches this filter.</div>}
      </div>
    </>
  );
}

function RepsBody({ spec, setPan, pan }) {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <Kpis kpis={spec.kpis} />
        <div style={boxed}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Territories</span>
          <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", gap: 2, background: "#eef1f5" }}><span style={{ width: spec.repW, background: "#16a34a" }} /><span style={{ width: spec.notW, background: "#dc2626" }} /><span style={{ width: spec.vacW, background: "#98a2b3" }} /></div>
          <span style={{ fontSize: 12, color: "#5b6576", textWrap: "pretty" }}>{spec.note}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <div className="ho-rail" style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          {spec.filters.map((f) => <button key={f.k} type="button" onClick={() => setPan({ ...pan, f: f.k, ex: undefined })} style={filterBtn(f.on)}>{f.label} · {f.n}</button>)}
        </div>
        {spec.groups.map((u) => (
          <div key={u.key} style={{ borderRadius: 12, boxShadow: "0 0 0 1px #e4e7ec", overflow: "hidden" }}>
            <button type="button" className="ho-row" aria-expanded={u.open} onClick={() => setPan({ ...pan, ex: u.open ? null : u.key })} style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto 20px", gap: 12, alignItems: "center", padding: "12px 14px", border: 0, background: "#fff", textAlign: "left", cursor: "pointer" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, ...ell }}>{u.name}</span>
                <span style={{ display: "flex", height: 5, borderRadius: 99, overflow: "hidden", gap: 1, background: "#eef1f5" }}><span style={{ width: u.repW, background: "#16a34a" }} /><span style={{ width: u.notW, background: "#dc2626" }} /><span style={{ width: u.vacW, background: "#98a2b3" }} /></span>
                <span style={{ fontSize: 12, color: "#5b6576" }}>{u.rep} of {u.tot} reported · {u.vac} vacant</span>
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: u.fc, ...tabNum }}>{u.n}</span>
              <span style={{ color: "#8a93a3", display: "grid", placeItems: "center", transform: `rotate(${u.open ? 180 : 0}deg)`, transition: "transform .2s" }}><Chevron d="M6 9l6 6 6-6" /></span>
            </button>
            {u.open && (
              <div style={{ display: "flex", flexDirection: "column", padding: "0 14px 8px", background: "#fff" }}>
                {u.people.map((p, i) => (
                  <div key={p.name + i} style={{ display: "grid", gridTemplateColumns: "30px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid #f2f4f7" }}>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", background: p.av, color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{p.ini}</span>
                    <span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 500, ...ell }}>{p.name}</span><span style={{ fontSize: 11, color: "#8a93a3" }}>{p.meta}</span></span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: p.sc, whiteSpace: "nowrap" }}>{p.st}</span>
                  </div>
                ))}
                {u.more > 0 && <div style={{ padding: "8px 0 4px", borderTop: "1px solid #f2f4f7", fontSize: 12, color: "#5b6576" }}>+ {u.more} more in {u.name}</div>}
                {!u.n && <div style={{ padding: "10px 0", borderTop: "1px solid #f2f4f7", fontSize: 12, color: "#8a93a3" }}>No one in this list.</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* The panel goes to <body>: a transformed ancestor, common in a page
   builder, turns position:fixed into position:absolute. */
function Panel({ spec, mobile, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="ho-root" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(16,24,40,.5)", display: "flex", alignItems: mobile ? "flex-end" : "center", justifyContent: "center", padding: mobile ? 0 : 24 }}>
      <div role="dialog" aria-modal="true" aria-label={spec.title} onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: mobile ? "100%" : 940, height: mobile ? "88vh" : "auto", maxHeight: mobile ? "88vh" : "min(820px, calc(100vh - 48px))", display: "flex", flexDirection: "column", background: "#fff", borderRadius: mobile ? "20px 20px 0 0" : 18, boxShadow: "0 24px 64px -12px rgba(16,24,40,.45)", overflow: "hidden", color: "#0b1220" }}>
        {mobile && <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 0", flex: "none" }}><span style={{ width: 40, height: 4, borderRadius: 2, background: "#d0d5dd" }} /></div>}
        <div style={{ flex: "none", display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 20px 14px", borderBottom: "1px solid #eef0f3" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#8a93a3" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: spec.dot }} />{spec.kicker}</div>
            <h3 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", ...ell }}>{spec.title}</h3>
            <div style={{ marginTop: 2, fontSize: 13, color: "#5b6576" }}>{spec.sub}</div>
          </div>
          <button type="button" className="ho-x" onClick={onClose} aria-label="Close" style={{ flex: "none", width: 36, height: 36, borderRadius: 10, border: 0, background: "#f2f4f7", color: "#344054", display: "grid", placeItems: "center", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", gridTemplateColumns: mobile ? "minmax(0,1fr)" : "minmax(0,280px) minmax(0,1fr)", gap: 16, alignContent: "start", padding: "16px 20px 24px" }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const skel = (w, h, r = 8) => ({ width: w, height: h, borderRadius: r, background: "#e9ecf1", animation: "ho-pulse 1.4s ease-in-out infinite" });

function SkeletonRow({ L }) {
  return (
    <section aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: `0 ${L.pad}` }}><span style={skel(110, 10)} /><span style={skel(170, 18)} /></div>
      <div className="ho-rail" style={{ display: "flex", gap: L.tileGap, overflow: "hidden", padding: `8px ${L.pad} 12px` }}>
        {[L.wideW, L.posterW, L.posterW, L.posterW].map((w, i) => <span key={i} style={{ ...skel(w, 190, 14), flex: "none" }} />)}
      </div>
    </section>
  );
}

const LABEL = { primary: "Primary", invoiced: "Invoiced today", secondary: "Secondary", visit: "Visit", support: "Support" };

export default function HomeOverview({
  url, token,
  userName, scope, asOf, updatedAt, primary, secondary, visit, support,
  sampleData = false, viewport = "auto", onOpen, className,
  primaryPath = "/home/primary", secondaryPath = "/home/secondary", visitPath = "/home/visit", supportPath = "/home/support",
  onOpenPrimary, onOpenSecondary, onOpenVisit, onOpenSupport,
}) {
  const rootRef = useRef(null);
  const topRef = useRef(null);
  const cw = useContainerWidth(rootRef);
  const today = useMemo(() => { const d = asOf ? new Date(asOf) : new Date(); return isNaN(d) ? new Date() : d; }, [asOf]);


  /* Where each section comes from, in order: its prop when bound, else the
     ERP when a URL and token are given, else the sample -- and the sample
     only while nothing at all is bound, so real and sample never mix. */
  const live = !!(url && token);
  const liveState = useOverviewData({ url, token, today, enabled: live });
  const bound = { primary, secondary, visit, support };
  const useSample = sampleData && !live && Object.values(bound).every((v) => v == null);
  const got = (k) => (liveState[k]?.status === "ready" ? liveState[k].data : null);
  const loading = (k) => live && bound[k] == null && (!liveState[k] || liveState[k].status === "loading");
  const src = useSample ? SAMPLE : {
    primary: primary ?? (live ? got("primary") : null), invoiced: live ? got("invoiced") : null,
    secondary: secondary ?? (live ? got("secondary") : null), visit: visit ?? (live ? got("visit") : null), support: support ?? (live ? got("support") : null),
  };
  const viewer = got("viewer");
  const name = userName || (useSample ? SAMPLE.userName : viewer?.name || "");
  const scopeTxt = scope || (useSample ? SAMPLE.scope : viewer?.scope || "");

  const view = useMemo(
    () => buildView({ primary: src.primary, invoiced: src.invoiced, secondary: src.secondary, visit: src.visit, support: src.support, asOf }),
    [src.primary, src.invoiced, src.secondary, src.visit, src.support, asOf],
  );
  const { T, P, S, V, U, slides } = view;

  const isDesk = viewport === "desktop" || (viewport === "auto" && cw >= 768);
  const phone = viewport === "mobile" || cw < 600;
  const L = {
    isDesk, pad: isDesk ? "32px" : "16px", cmdCols: cw < 1100 ? "minmax(0,1fr)" : "minmax(0,1.3fr) minmax(0,1fr)",
    rowGap: isDesk ? "36px" : "28px", rowsTop: isDesk ? "32px" : "24px", bottomPad: isDesk ? "64px" : "28px",
    rowTitle: isDesk ? "20px" : "18px", tileGap: isDesk ? "14px" : "10px",
    posterW: phone ? "170px" : "200px", landW: phone ? "270px" : "340px", wideW: phone ? "290px" : "420px",
    ringW: phone ? "96px" : "120px", ringNum: phone ? "18px" : "22px",
  };
  /* "See all" / "Open": tell the page, then go to the section's own page.
     Next's router when there is one (no reload); a plain navigation where
     there is not, such as the Studio canvas. */
  const paths = { primary: primaryPath, secondary: secondaryPath, visit: visitPath, support: supportPath };
  const handlers = { primary: onOpenPrimary, secondary: onOpenSecondary, visit: onOpenVisit, support: onOpenSupport };
  const open = (section, hq = null) => {
    onOpen?.(section, hq);
    // A wired per-section event is the navigation: the built-in redirect stands down.
    if (handlers[section]) { handlers[section](hq); return; }
    const to = paths[section];
    if (!to) return;
    const hard = () => { if (typeof window !== "undefined") window.location.assign(to); };
    try { Router.push(to)?.catch?.(hard); } catch { hard(); }
  };

  /* The detail panel: { mode: pri|sec|sup|visit|reps, ... }. */
  const [pan, setPan] = useState(null);
  const [dist, setDist] = useState({});
  useEffect(() => {
    if (pan?.mode !== "pri" || pan.k == null || pan.k === "__all__" || !P || dist[pan.k] || !live) return;
    let alive = true;
    liveState.loadDistributors(P.period, pan.k, view.level).then((d) => alive && setDist((x) => ({ ...x, [pan.k]: d }))).catch(() => alive && setDist((x) => ({ ...x, [pan.k]: [] })));
    return () => { alive = false; };
  }, [pan, P, live]); // eslint-disable-line react-hooks/exhaustive-deps
  const spec = !pan ? null
    : pan.mode === "pri" ? primaryPanel(view, pan.k, { distributors: live ? dist[pan.k] : [] })
    : pan.mode === "sec" ? secondaryPanel(view, pan.k)
    : pan.mode === "sup" ? supportPanel(view, pan.k)
    : pan.mode === "reps" ? repsPanel(view, pan.f, pan.ex)
    : visitPanel(view, pan.u, pan.f, pan.exp || {});

  /* Stamped when the last live section lands, unless the page supplies one. */
  const anyLoading = ["primary", "secondary", "visit", "support"].some(loading);
  const [landedAt, setLandedAt] = useState(null);
  useEffect(() => { if (live && !anyLoading) setLandedAt(new Date()); }, [live, anyLoading]);
  const updated = anyLoading ? "Loading…" : updatedLabel(updatedAt || landedAt);
  const greeting = T.greet + (name ? ", " + name : "");
  const failed = live ? Object.keys(LABEL).filter((k) => liveState[k]?.status === "error") : [];
  const empty = live ? ["primary", "secondary", "visit", "support"].filter((k) => bound[k] == null && liveState[k]?.status === "ready" && !liveState[k].data) : [];
  const any = P || S || V || U;

  return (
    <div ref={rootRef} className={"ho-root" + (className ? " " + className : "")} style={{ background: "#f4f5f7", width: "100%" }}>
      <link rel="stylesheet" href={FONT_HREF} />
      <style>{CSS}</style>

      {isDesk ? (
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, padding: `14px ${L.pad} 0`, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>{greeting}</div>
            <div style={{ fontSize: 13, color: "#5b6576" }}>{[scopeTxt, T.long].filter(Boolean).join(" · ")}</div>
          </div>
          {updated && <span style={{ fontSize: 12, color: "#8a93a3" }}>{updated}</span>}
        </div>
      ) : (
        <div style={{ padding: "14px 16px 0" }}>
          <div style={{ fontSize: 13, color: "#5b6576", ...ell }}>{[scopeTxt, T.short].filter(Boolean).join(" · ")}</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{greeting}</div>
        </div>
      )}

      {liveState.error && <div style={{ margin: `16px ${L.pad} 0`, padding: "14px 16px", borderRadius: 12, background: "#fef3f2", color: "#b42318", fontSize: 13 }}>{liveState.error}</div>}

      {any
        ? (isDesk ? <CommandBoard L={L} view={view} open={open} pop={setPan} /> : <MobileHero slides={slides} pace={null} open={open} />)
        : anyLoading && <div aria-busy="true" style={{ ...skel("auto", isDesk ? 420 : 300, 18), margin: `16px ${L.pad} 0` }} />}

      <div style={{ display: "flex", flexDirection: "column", gap: L.rowGap, padding: `${L.rowsTop} 0 ${L.bottomPad}` }}>
        {V ? <VisitRow L={L} view={view} open={open} pop={setPan} /> : loading("visit") && <SkeletonRow L={L} />}
        {P ? <PrimaryRow L={L} view={view} open={open} pop={setPan} railRef={topRef} /> : loading("primary") && <SkeletonRow L={L} />}
        {S ? <SecondaryRow L={L} view={view} open={open} pop={setPan} /> : loading("secondary") && <SkeletonRow L={L} />}
        {U ? <SupportRow L={L} view={view} open={open} pop={setPan} /> : loading("support") && <SkeletonRow L={L} />}
        {!any && !anyLoading && !liveState.error && (
          <div style={{ margin: `0 ${L.pad}`, padding: "22px 20px", borderRadius: 14, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec", fontSize: 14, color: "#5b6576" }}>
            {live ? "Nothing on file for you this month or last." : "Nothing to show yet. Pass the ERP URL and token, bind the section data, or switch on Sample data to preview."}
          </div>
        )}
        {empty.length > 0 && any && <div style={{ margin: `0 ${L.pad}`, fontSize: 12, color: "#8a93a3" }}>{"Nothing on file this month or last: " + empty.map((k) => LABEL[k]).join(", ") + "."}</div>}
        {failed.length > 0 && <div style={{ margin: `0 ${L.pad}`, fontSize: 12, color: "#8a93a3" }}>{"Could not load " + failed.map((k) => LABEL[k]).join(", ") + " — " + liveState[failed[0]].error}</div>}
      </div>

      {spec && (
        <Panel spec={spec} mobile={!isDesk} onClose={() => setPan(null)}>
          {pan.mode === "visit" ? <VisitBody spec={spec} pan={pan} setPan={setPan} /> : pan.mode === "reps" ? <RepsBody spec={spec} pan={pan} setPan={setPan} /> : <DetailBody spec={spec} />}
        </Panel>
      )}
    </div>
  );
}
