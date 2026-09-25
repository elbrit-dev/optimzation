"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSupportData } from "./data/useSupportData";
import { NO_RP, buildTree } from "./data/model";
import { buildView } from "./viewModel";

/* Doctor Support report -- the "Support Report" design, on live ERPNext data.
 *
 * Props are just the GraphQL URL and the viewer's token. The token IS the
 * permission model: the ERP returns only what that user may read, and the
 * report opens at that user's own place in the sales tree (resolved from the
 * same token), so a BE sees their doctors and a manager their team. */

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap";
const MONO = "'Geist Mono',ui-monospace,monospace";

/* Inline styles win over classes, so every hover/focus rule needs
   !important. Hover is gated to real pointers: a touch screen keeps :hover
   after a tap and leaves a stuck highlight that reads as a selection. */
const CSS = `
.sr-root{font-family:'Geist',system-ui,sans-serif;color:#101828;-webkit-font-smoothing:antialiased;box-sizing:border-box}
.sr-root *,.sr-root *::before,.sr-root *::after{box-sizing:border-box}
.sr-root button,.sr-root input{font-family:inherit;margin:0}
.sr-root [data-sr-scroll]{scrollbar-width:none}
.sr-root [data-sr-scroll]::-webkit-scrollbar{display:none}
.sr-root .sr-in:focus{border-color:#1F4FD8!important;box-shadow:0 0 0 3px #DCE6FD}
@keyframes sr-pulse{0%,100%{opacity:1}50%{opacity:.45}}
.sr-root .sr-skel{background:#EEF1F5;border-radius:8px;animation:sr-pulse 1.4s ease-in-out infinite}
@media (hover:hover) and (pointer:fine){
.sr-root .sr-hb:hover{border-color:#1F4FD8!important}
.sr-root .sr-hi:hover{background:#F5F7FA!important}
.sr-root .sr-hp:hover{border-color:#1F4FD8!important;color:#1F4FD8!important}
.sr-root .sr-hr:hover{background:#FAFBFC!important}
.sr-root .sr-hx:hover{background:#F2F4F7!important}
.sr-root .sr-hd:hover{background:#EEF3FF!important}
.sr-root .sr-hc:hover{border-color:#C7D4F7!important}
}`;

const INITIAL = {
  sel: null, scExp: {}, months: null, pfy: null, cfy: null, pop: null, exp: {}, bexp: null, bview: "brand", bAll: false, modal: null, drawer: null, dq: "", pq: "",
  sort: "amt", fTab: "sort", fq: "", fSpec: [], fCat: [], fHq: [], docAll: false, allItems: false, tab: "overview", pmode: "month",
};

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

/* Fixed layers go to <body>: a transformed ancestor (common in a page
   builder) would otherwise turn position:fixed into position:absolute. */
function Layer({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(<div className="sr-root">{children}</div>, document.body);
}

const card = { background: "#fff", border: "1px solid #EAECF0", borderRadius: 14 };
const h14 = { fontSize: 14, fontWeight: 600 };
const s12 = { fontSize: 12, color: "#667085" };
const ell = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const eyebrowS = { fontSize: 11, color: "#667085", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 };
const navBtn = (op, w = 40, h = 44) => ({ width: w, height: h, border: "1px solid #D0D5DD", background: "#fff", borderRadius: 10, cursor: "pointer", fontSize: 16, color: "#344054", opacity: op, flex: "none" });
const yrBtn = (op, size = 32) => ({ width: size, height: size, border: "1px solid #EAECF0", background: "#fff", borderRadius: 8, cursor: "pointer", color: "#344054", opacity: op });

function Segmented({ items, h = 32, radius = 9, bg = "#F2F4F7" }) {
  return (
    <div style={{ display: "flex", background: bg, borderRadius: radius, padding: 3, gap: 2 }}>
      {items.map((o) => (
        <button key={o.id} type="button" onClick={o.onClick} style={{ flex: 1, height: h, border: 0, borderRadius: radius - 2, fontSize: 13, fontWeight: 600, cursor: "pointer", background: o.bg, color: o.fg, boxShadow: o.sh, whiteSpace: "nowrap" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Popover({ P, mob, onClose, children, style }) {
  const panel = (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: P.sBg, zIndex: 1000 }} />
      <div style={{ position: P.pos, top: P.top, right: P.right, left: P.left, bottom: P.bottom, width: P.w, maxHeight: P.maxH, borderRadius: P.rad, background: "#fff", border: "1px solid #EAECF0", boxShadow: "0 16px 40px rgba(16,24,40,.18)", zIndex: 1001, display: "flex", flexDirection: "column", ...style }}>
        {children}
      </div>
    </>
  );
  return mob ? <Layer>{panel}</Layer> : panel;
}

function Search({ value, onChange, placeholder, h = 40 }) {
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#98A2B3", fontSize: 14 }}>⌕</span>
      <input className="sr-in" value={value} onChange={onChange} placeholder={placeholder} style={{ width: "100%", height: h, border: "1px solid #D0D5DD", borderRadius: 10, padding: "0 10px 0 30px", fontSize: 14, outline: "none", background: "#fff", color: "#101828" }} />
    </div>
  );
}

function Shell({ rootRef, className, children }) {
  return (
    <div ref={rootRef} className={"sr-root" + (className ? " " + className : "")} style={{ background: "#F4F5F7", width: "100%", minHeight: className ? undefined : "100%" }}>
      <link rel="stylesheet" href={FONT_HREF} />
      <style>{CSS}</style>
      {children}
    </div>
  );
}

function StatusCard({ title, body, action }) {
  return (
    <div style={{ ...card, padding: "22px 20px", display: "flex", flexDirection: "column", gap: 8, maxWidth: 560 }}>
      <div style={{ fontSize: 15, fontWeight: 650 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#475467", lineHeight: 1.5 }}>{body}</div>
      {action ? <div><button type="button" onClick={action.onClick} style={{ marginTop: 6, height: 34, padding: "0 14px", border: 0, background: "#101828", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{action.label}</button></div> : null}
    </div>
  );
}

function Skeleton({ L }) {
  return (
    <div style={{ padding: L.pad, display: "flex", flexDirection: "column", gap: L.gap, maxWidth: 1440, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div className="sr-skel" style={{ width: L.av, height: L.av, borderRadius: 14 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "#667085", fontWeight: 500 }}>Doctor Support · loading from ERP</div>
          <div className="sr-skel" style={{ width: 220, height: 22 }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(min(100%,${L.kpiMin}px),1fr))`, gap: L.kgap }}>
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="sr-skel" style={{ height: 104, borderRadius: 14 }} />)}
      </div>
      <div className="sr-skel" style={{ height: 280, borderRadius: 14 }} />
    </div>
  );
}

export default function SupportReport({ url, token, className }) {
  const rootRef = useRef(null);
  const width = useContainerWidth(rootRef);
  const mob = width < 640;
  /* The two columns are flex-basis 580 + 340 with a 20 gap inside 28px side
     padding, so below 996px they wrap onto separate lines. */
  const side = !mob && width >= 996;
  const data = useSupportData({ url, token });

  const [s, setS] = useState(INITIAL);
  const set = useCallback((u) => setS((x) => ({ ...x, ...(typeof u === "function" ? u(x) : u) })), []);
  // A person's doctors open as a popup; a doctor opens the drawer on top of it.
  const openDrawer = useCallback(
    (d) => set(d.type === "person" ? { modal: { id: d.id }, drawer: null, pq: "", pop: null } : { drawer: d, allItems: false, pop: null }),
    [set],
  );

  // A different token is a different person: start from their own defaults.
  useEffect(() => setS(INITIAL), [url, token]);

  useEffect(() => {
    // Escape peels one layer at a time: drawer, then the popup behind it.
    const k = (e) => { if (e.key === "Escape") set((x) => (x.drawer ? { drawer: null } : { modal: null, pop: null })); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [set]);

  const { months, org } = data;
  const lineRps = useMemo(() => {
    const out = new Set();
    for (const m of Object.values(months)) for (const l of m.lines) out.add(l.rp || NO_RP);
    return out;
  }, [months]);
  const tree = useMemo(() => (org ? buildTree(org, lineRps) : null), [org, lineRps]);
  const DOC = useMemo(() => {
    const out = {};
    for (const ym of Object.keys(months).sort()) Object.assign(out, months[ym].doctors);
    return out;
  }, [months]);
  const cache = useMemo(() => new Map(), [tree, months]); // eslint-disable-line react-hooks/exhaustive-deps

  const L = mob
    ? { pad: "12px 14px 32px", gap: 14, av: 40, h1: 20, ctrlFlex: "1 1 100%", scopeFlex: "1 1 100%", scopeMin: "0", monthFlex: "1 1 100%", monthMin: "0", kpiMin: 150, kgap: 10, kpad: "12px 14px", barGap: 4, barW: 18, chartH: 150, valFs: 8, lblFs: 10, spark: false }
    : { pad: "24px 28px 48px", gap: 20, av: 48, h1: 26, ctrlFlex: "0 1 auto", scopeFlex: "0 1 auto", scopeMin: "280px", monthFlex: "0 1 auto", monthMin: "210px", kpiMin: 190, kgap: 12, kpad: "16px 18px", barGap: 10, barW: 30, chartH: 190, valFs: 10, lblFs: 12, spark: true };
  const P = mob
    ? { sBg: "rgba(16,24,40,.4)", pos: "fixed", top: "auto", right: "0", left: "0", bottom: "0", w: "auto", maxH: "78vh", rad: "22px 22px 0 0" }
    : { sBg: "transparent", pos: "absolute", top: "calc(100% + 8px)", right: "0", left: "auto", bottom: "auto", w: "380px", maxH: "70vh", rad: "14px" };
  const DR = mob
    ? { top: "auto", right: "0", bottom: "0", left: "0", w: "auto", h: "86vh", rad: "24px 24px 0 0", hPad: "12px 16px 14px" }
    : { top: "0", right: "0", bottom: "0", left: "auto", w: "min(580px,100%)", h: "auto", rad: "0", hPad: "18px 22px 16px" };

  const v = useMemo(() => {
    if (data.status !== "ready" || !tree) return null;
    return buildView({ s, set, tl: data.timeline, onFile: data.onFile, months, tree, DOC, mob, fill: side, cache, openDrawer });
  }, [data.status, data.timeline, data.onFile, s, set, months, tree, DOC, mob, side, cache, openDrawer]);

  const neededKey = v ? v.needed.join(",") : "";
  const { request } = data;
  useEffect(() => {
    if (neededKey) request(neededKey.split(","));
  }, [neededKey, request]);

  if (data.status === "error") {
    return (
      <Shell rootRef={rootRef} className={className}>
        <div style={{ padding: L.pad }}><StatusCard title="Couldn't load Doctor Support" body={data.error} action={{ label: "Try again", onClick: data.retry }} /></div>
      </Shell>
    );
  }
  if (data.status === "empty") {
    return (
      <Shell rootRef={rootRef} className={className}>
        <div style={{ padding: L.pad }}><StatusCard title="No Doctor Support records" body="This ERP token can't see any Doctor Support documents in the last two financial years. If you expect data here, check the token's permissions on the Doctor Support doctype." action={{ label: "Refresh", onClick: data.retry }} /></div>
      </Shell>
    );
  }
  if (!v || v.pending && !Object.keys(months).length) {
    return <Shell rootRef={rootRef} className={className}><Skeleton L={L} /></Shell>;
  }

  const { ctx, sc, pk, kpis, trend, team, docs, fl, pw, dw, dd } = v;
  const closePop = () => set({ pop: null });
  const closeDrawer = () => set({ drawer: null });
  const closeModal = () => set({ modal: null, drawer: null });

  return (
    <Shell rootRef={rootRef} className={className}>
      <div style={{ padding: L.pad, display: "flex", flexDirection: "column", gap: L.gap, maxWidth: 1440, margin: "0 auto" }}>
        {/* ── Header ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 24px", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
            <div style={{ width: L.av, height: L.av, borderRadius: ctx.rad, background: ctx.avBg, color: "#fff", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 15, flex: "none" }}>{ctx.initials}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "#667085", fontWeight: 500 }}>{ctx.eyebrow}</div>
              <div style={{ fontSize: L.h1, fontWeight: 650, letterSpacing: "-.02em", lineHeight: 1.1 }}>{ctx.title}</div>
              <div style={{ fontSize: 13, color: "#475467" }}>{ctx.sub}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", flex: L.ctrlFlex, minWidth: 0, justifyContent: "flex-end" }}>
            {sc.show ? (
              <div style={{ position: "relative", flex: L.scopeFlex, minWidth: 0 }}>
                <button type="button" className="sr-hb" onClick={sc.toggle} style={{ width: "100%", height: 44, minWidth: L.scopeMin, padding: "0 14px", border: "1px solid #D0D5DD", background: "#fff", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, textAlign: "left" }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#101828", ...ell }}>{sc.label}</span>
                  <span style={{ color: "#667085", fontSize: 11, flex: "none" }}>▼</span>
                </button>
                {sc.open ? (
                  <Popover P={P} mob={mob} onClose={closePop}>
                    <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderBottom: "1px solid #F2F4F7" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}><span style={{ fontSize: 15, fontWeight: 650 }}>Team members</span><span style={s12}>{sc.count}</span></div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" onClick={sc.collapseAll} style={{ height: 30, padding: "0 10px", border: "1px solid #EAECF0", background: "#fff", color: "#475467", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>Collapse all</button>
                        <button type="button" onClick={sc.reset} style={{ height: 30, padding: "0 10px", border: "1px solid #C7D4F7", background: "#fff", color: "#1F4FD8", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>My team</button>
                      </div>
                    </div>
                    <div data-sr-scroll="1" style={{ overflow: "auto", padding: "6px 8px 10px" }}>
                      {sc.items.map((o) => (
                        <div key={o.id} className="sr-hi" onClick={o.onClick} style={{ display: "flex", gap: 8, alignItems: "center", padding: `6px 8px 6px ${o.pad}px`, borderRadius: 8, cursor: "pointer" }}>
                          {o.hasKids ? (
                            <button type="button" className="sr-hx" aria-label={o.rot ? "Collapse" : "Expand"} aria-expanded={!!o.rot} title={o.kidCount + " reporting"}
                              onClick={(e) => { e.stopPropagation(); o.toggleOpen(); }}
                              style={{ width: 22, height: 22, flex: "none", border: "1px solid #EAECF0", background: "#fff", borderRadius: 6, cursor: "pointer", color: "#475467", display: "grid", placeItems: "center", padding: 0 }}>
                              <span style={{ display: "inline-block", transform: `rotate(${o.rot}deg)`, transition: "transform .18s ease", fontSize: 8 }}>▶</span>
                            </button>
                          ) : <span style={{ width: 22, flex: "none" }} />}
                          <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${o.bd}`, background: o.bg, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, flex: "none" }}>{o.tick}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: o.fw, ...ell }}>{o.name}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: o.chipFg, background: o.chipBg, padding: "2px 6px", borderRadius: 5, flex: "none" }}>{o.role}</span>
                          <span style={{ fontFamily: MONO, fontSize: 11, color: "#667085", minWidth: 52, textAlign: "right", flex: "none" }}>{o.qty}</span>
                        </div>
                      ))}
                    </div>
                  </Popover>
                ) : null}
              </div>
            ) : null}

            <div style={{ position: "relative", display: "flex", gap: 6, alignItems: "center", flex: L.monthFlex, minWidth: 0 }}>
              <button type="button" onClick={pk.prev} aria-label="Previous month" style={navBtn(pk.prevOp)}>‹</button>
              <button type="button" className="sr-hb" onClick={pk.toggle} style={{ flex: 1, height: 44, minWidth: L.monthMin, padding: "0 14px", border: "1px solid #D0D5DD", background: "#fff", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, textAlign: "left" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#101828", ...ell }}>{pk.label}</span>
                  <span style={{ fontSize: 11, color: "#667085", ...ell }}>{pk.sub}</span>
                </span>
                <span style={{ color: "#667085", fontSize: 11, flex: "none" }}>▼</span>
              </button>
              <button type="button" onClick={pk.next} aria-label="Next month" style={navBtn(pk.nextOp)}>›</button>
              {pk.open ? (
                <Popover P={P} mob={mob} onClose={closePop} style={{ padding: "14px 16px 16px", gap: 12, overflow: "auto" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}><span style={{ fontSize: 15, fontWeight: 650 }}>Select months</span><span style={s12}>{pk.hint} · {pk.count}</span></div>
                    <button type="button" onClick={closePop} aria-label="Done" style={{ height: 30, padding: "0 12px", border: 0, background: "#101828", color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Done</button>
                  </div>
                  <Segmented items={pk.modes} />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {pk.presets.map((o) => (
                      <button key={o.label} type="button" className="sr-hp" onClick={o.onClick} style={{ height: 30, padding: "0 11px", borderRadius: 999, border: "1px solid #D0D5DD", background: "#fff", color: "#344054", fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>{o.label}</button>
                    ))}
                  </div>
                  {pk.showFy ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <button type="button" onClick={pk.fyPrev} aria-label="Previous year" style={yrBtn(pk.fyPrevOp)}>‹</button>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{pk.fyLabel}</span>
                      <button type="button" onClick={pk.fyNext} aria-label="Next year" style={yrBtn(pk.fyNextOp)}>›</button>
                    </div>
                  ) : null}
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${pk.cols},minmax(0,1fr))`, gap: 6 }}>
                    {pk.cells.map((c) => (
                      <button key={c.key} type="button" onClick={c.onClick} style={{ height: pk.cellH, borderRadius: 10, border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, cursor: c.cur, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "0 4px", position: "relative" }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</span>
                        <span style={{ fontSize: 10, fontFamily: MONO, color: c.sfg, whiteSpace: "nowrap" }}>{c.sub}</span>
                        <span style={{ position: "absolute", top: 5, right: 6, fontSize: 10, color: c.tfg }}>{c.tick}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, paddingTop: 10, borderTop: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: 11, color: "#667085" }}>On file · {pk.onFile}</span>
                    <button type="button" onClick={pk.clear} style={{ height: 28, padding: "0 10px", border: 0, background: "transparent", color: "#C4262B", fontSize: 12, fontWeight: 600, cursor: "pointer", flex: "none" }}>Reset to latest</button>
                  </div>
                </Popover>
              ) : null}
            </div>
          </div>
        </div>

        {data.monthError || v.truncated.length ? (
          <div style={{ background: "#FEF3F2", border: "1px solid #FECDCA", color: "#B42318", borderRadius: 12, padding: "10px 14px", fontSize: 13, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <span>{data.monthError ? "Some months failed to load: " + data.monthError : "Totals are short: the ERP sent fewer records than it counts for " + v.truncated.join(", ") + ". Retrying automatically."}</span>
            {data.monthError ? <button type="button" onClick={data.retry} style={{ height: 28, padding: "0 10px", border: "1px solid #FECDCA", background: "#fff", color: "#B42318", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Retry</button> : null}
          </div>
        ) : null}

        {/* ── KPIs ── */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(min(100%,${L.kpiMin}px),1fr))`, gap: L.kgap }}>
          {kpis.map((c) => (
            <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 14, padding: L.kpad, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <div style={{ ...eyebrowS, ...ell }}>{c.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                {v.pending ? <span className="sr-skel" style={{ width: 90, height: mob ? 24 : 32 }} /> : <span style={{ fontFamily: MONO, fontSize: c.fs, fontWeight: 600, letterSpacing: "-.03em", color: c.vc, whiteSpace: "nowrap" }}>{c.value}</span>}
                <span style={{ fontSize: 12, color: "#98A2B3" }}>{c.unit}</span>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "#475467", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: c.dBg, color: c.dFg }}>{c.delta}</span>
                <span style={{ ...ell, minWidth: 0 }}>{c.note}</span>
              </div>
            </div>
          ))}
        </div>

        {mob ? (
          <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#F4F5F7", padding: "6px 0" }}>
            <Segmented items={v.tabs} h={36} radius={11} bg="#E9EBEF" />
          </div>
        ) : null}

        {/* Stretch only when the columns sit side by side, so the right one is
            as tall as the left and By HQ can fill the gap (see below). */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: L.gap, alignItems: side ? "stretch" : "flex-start" }}>
          <div style={{ flex: "1 1 580px", minWidth: 0, display: "flex", flexDirection: "column", gap: L.gap }}>
            {/* ── Value by month ── */}
            {v.vis.trend ? (
              <div style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><div style={h14}>Value by month</div><div style={s12}>{trend.sub}</div></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button type="button" onClick={trend.fyPrev} aria-label="Previous year" style={yrBtn(trend.fyPrevOp, 30)}>‹</button>
                    <span style={{ fontSize: 13, fontWeight: 600, minWidth: 78, textAlign: "center" }}>{trend.fyLabel}</span>
                    <button type="button" onClick={trend.fyNext} aria-label="Next year" style={yrBtn(trend.fyNextOp, 30)}>›</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(12,minmax(0,1fr))", gap: L.barGap, alignItems: "end", height: L.chartH, borderBottom: "1px solid #EAECF0" }}>
                  {trend.bars.map((b) => (
                    <div key={b.key} onClick={b.onClick} title={b.title} style={{ cursor: b.cur, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 5, height: "100%", minWidth: 0 }}>
                      <span style={{ fontFamily: MONO, fontSize: L.valFs, fontWeight: 600, color: b.lc, whiteSpace: "nowrap" }}>{b.val}</span>
                      <div style={{ width: "100%", maxWidth: L.barW, height: b.h, background: b.bg, border: `1px dashed ${b.dash}`, borderBottom: 0, borderRadius: "5px 5px 0 0", transition: "height .25s ease" }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(12,minmax(0,1fr))", gap: L.barGap, marginTop: -8 }}>
                  {trend.bars.map((b) => (
                    <div key={b.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, minWidth: 0 }}>
                      <span style={{ fontSize: L.lblFs, fontWeight: b.fw, color: b.lc }}>{b.label}</span>
                      <span style={{ fontSize: 9, color: "#98A2B3", height: 11 }}>{b.yr}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#667085", flexWrap: "wrap", alignItems: "center" }}>
                  <Legend c="#1F4FD8">Selected</Legend><Legend c="#D6E0FA">Other</Legend><Legend dashed>No data</Legend>
                  <span style={{ marginLeft: "auto" }}>Qty <b style={{ fontFamily: MONO, color: "#475467" }}>{trend.qty}</b> units</span>
                </div>
              </div>
            ) : null}

            {/* ── Team ── */}
            {v.showTeam ? (
              <div style={{ ...card, padding: "16px 18px 6px", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", paddingBottom: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><div style={h14}>{team.title}</div><div style={s12}>{team.sub}</div></div>
                  <button type="button" onClick={team.collapse} style={{ height: 28, padding: "0 10px", border: "1px solid #EAECF0", background: "#fff", borderRadius: 7, fontSize: 12, color: "#475467", cursor: "pointer" }}>Collapse all</button>
                </div>
                {team.rows.map((r) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "stretch" }}>
                    {r.guides.map((g) => <div key={g} style={{ flex: "none", width: 18, display: "flex", justifyContent: "center" }}><div style={{ width: 1, background: "#E4E7EC" }} /></div>)}
                    <div style={{ flex: 1, minWidth: 0, padding: "11px 0", borderTop: "1px solid #F2F4F7", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        {r.hasKids ? (
                          <button type="button" className="sr-hx" onClick={r.toggle} aria-label="Expand" aria-expanded={r.rot === 90} style={{ width: 24, height: 24, flex: "none", border: "1px solid #EAECF0", background: "#fff", cursor: "pointer", color: "#475467", display: "grid", placeItems: "center", borderRadius: 7, padding: 0 }}>
                            <span style={{ display: "inline-block", transform: `rotate(${r.rot}deg)`, transition: "transform .18s ease", fontSize: 9 }}>▶</span>
                          </button>
                        ) : <span style={{ width: 24, flex: "none" }} />}
                        <div style={{ width: 34, height: 34, borderRadius: "50%", background: r.avBg, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, flex: "none" }}>{r.initials}</div>
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, ...ell }}>{r.name}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: r.chipFg, background: r.chipBg, padding: "2px 6px", borderRadius: 5, flex: "none" }}>{r.role}</span>
                          </div>
                          <span style={{ fontSize: 12, color: "#667085", ...ell }}>{r.sub}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flex: "none" }}>
                          <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600 }}>{r.main}</span>
                          <span style={{ fontSize: 11, color: "#98A2B3" }}>{r.minor}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 34, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 120px", height: 5, borderRadius: 3, background: "#EEF1F5", overflow: "hidden" }}><div style={{ height: "100%", width: `${r.w}%`, background: r.bar, borderRadius: 3 }} /></div>
                        <span style={{ fontSize: 12, color: "#475467", whiteSpace: "nowrap" }}><b style={{ color: "#101828" }}>{r.n}</b> drs</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: r.dFg, whiteSpace: "nowrap" }}>{r.delta}</span>
                        {r.canDocs ? <button type="button" className="sr-hd" onClick={r.openDocs} style={{ height: 26, padding: "0 10px", border: "1px solid #C7D4F7", background: "#fff", color: "#1F4FD8", fontSize: 12, fontWeight: 600, borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap" }}>Doctors ›</button> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* ── Doctors ── */}
            {v.vis.docs ? (
              <div style={{ ...card, padding: "16px 18px 8px", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><div style={h14}>{docs.title}</div><div style={s12}>{docs.sub}</div></div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Search value={docs.q} onChange={(e) => set({ dq: e.target.value })} placeholder="Search name or DR code" />
                    <div style={{ position: "relative", flex: "none" }}>
                      <button type="button" onClick={fl.toggle} style={{ height: 40, padding: "0 14px", border: `1px solid ${fl.bd}`, background: fl.bg, color: fl.fg, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
                        ⚲ Filters{fl.has ? <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: "#1F4FD8", color: "#fff", fontSize: 11, display: "grid", placeItems: "center", padding: "0 5px" }}>{fl.count}</span> : null}
                      </button>
                      {fl.open ? (
                        <Popover P={P} mob={mob} onClose={closePop} style={{ padding: 0, overflow: "hidden", width: mob ? "auto" : 540, height: mob ? "78vh" : 480, maxHeight: mob ? "78vh" : "70vh" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "12px 14px 12px 16px", borderBottom: "1px solid #EAECF0", flex: "none" }}>
                            <span style={{ fontSize: 15, fontWeight: 650 }}>Filter &amp; sort</span>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button type="button" onClick={fl.clear} style={{ height: 30, padding: "0 10px", border: 0, background: "transparent", color: "#C4262B", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Clear all</button>
                              <button type="button" onClick={closePop} style={{ height: 30, padding: "0 12px", border: 0, background: "#101828", color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>Show {fl.result}</button>
                            </div>
                          </div>
                          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                            {/* Group rail */}
                            <div data-sr-scroll="1" style={{ width: mob ? 116 : 148, flex: "none", background: "#F9FAFB", borderRight: "1px solid #EAECF0", padding: 8, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
                              {fl.tabs.map((t) => (
                                <button key={t.id} type="button" className={t.on ? undefined : "sr-hx"} onClick={t.onClick} style={{ height: 38, padding: "0 10px", border: 0, borderRadius: 8, background: t.on ? "#E6EDFD" : "transparent", color: t.on ? "#1F4FD8" : "#344054", fontSize: 13, fontWeight: t.on ? 600 : 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, textAlign: "left" }}>
                                  <span style={ell}>{t.title}</span>
                                  {t.badge ? <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: "#1F4FD8", color: "#fff", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 5px", flex: "none" }}>{t.badge}</span> : null}
                                </button>
                              ))}
                            </div>
                            {/* Options of the active group */}
                            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 14px 6px", flex: "none" }}>
                                <span style={eyebrowS}>{fl.pane.title}{fl.pane.picked ? " · " + fl.pane.picked : ""}</span>
                                {fl.pane.clear && fl.pane.picked !== "any" ? <button type="button" onClick={fl.pane.clear} style={{ height: 24, padding: "0 6px", border: 0, background: "transparent", color: "#C4262B", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Clear</button> : null}
                              </div>
                              {fl.pane.showSearch ? (
                                <div style={{ padding: "0 14px 6px", flex: "none" }}>
                                  <Search value={fl.pane.q} onChange={fl.pane.onQ} placeholder={"Search " + fl.pane.total + " " + fl.pane.title.toLowerCase() + " options"} h={34} />
                                </div>
                              ) : null}
                              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 10px", scrollbarWidth: "thin", scrollbarColor: "#D0D5DD transparent" }}>
                                {fl.pane.opts.map((o) => (
                                  <div key={o.key} role={fl.pane.single ? "radio" : "checkbox"} aria-checked={o.on} tabIndex={0} className="sr-hi" onClick={o.onClick}
                                    onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); o.onClick(); } }}
                                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 8px", borderRadius: 8, cursor: "pointer" }}>
                                    <span style={{ width: 18, height: 18, flex: "none", borderRadius: fl.pane.single ? "50%" : 5, border: `1.5px solid ${o.on ? "#1F4FD8" : "#D0D5DD"}`, background: o.on ? "#1F4FD8" : "#fff", color: "#fff", display: "grid", placeItems: "center", fontSize: 11, lineHeight: 1 }}>
                                      {o.on ? (fl.pane.single ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} /> : "✓") : null}
                                    </span>
                                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#101828", fontWeight: o.on ? 600 : 400, ...ell }}>{o.label}</span>
                                    {o.n ? <span style={{ fontFamily: MONO, fontSize: 11, color: "#98A2B3", flex: "none" }}>{o.n}</span> : null}
                                  </div>
                                ))}
                                {!fl.pane.opts.length ? <div style={{ padding: "18px 8px", fontSize: 13, color: "#667085" }}>No matches.</div> : null}
                              </div>
                            </div>
                          </div>
                        </Popover>
                      ) : null}
                    </div>
                  </div>
                  {fl.has ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {fl.chips.map((c) => (
                        <button key={c.key} type="button" onClick={c.onClick} style={{ height: 26, padding: "0 8px 0 10px", borderRadius: 999, border: 0, background: "#EEF3FF", color: "#1F4FD8", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", gap: 6, alignItems: "center" }}>{c.label}<span style={{ fontSize: 11 }}>✕</span></button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {docs.rows.map((d) => (
                  <div key={d.id} className="sr-hr" onClick={d.open} style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "11px 0", borderTop: "1px solid #F2F4F7", cursor: "pointer" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: d.avBg, color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600 }}>{d.initials}</div>
                    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, ...ell }}>{d.name}</span>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: "#98A2B3", flex: "none" }}>{d.id}</span>
                      </div>
                      <div style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12, color: "#667085", minWidth: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#1F4FD8", background: "#EEF3FF", padding: "1px 6px", borderRadius: 5, flex: "none" }}>{d.spec}</span>
                        <span style={{ background: "#F2F4F7", padding: "1px 6px", borderRadius: 5, flex: "none", fontSize: 11 }}>{d.cat}</span>
                        <span style={ell}>{d.place}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {L.spark ? (
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 22, width: 44 }}>
                          {d.spark.map((sp) => <div key={sp.key} style={{ flex: 1, height: sp.h, background: sp.c, borderRadius: 1 }} />)}
                        </div>
                      ) : null}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, minWidth: 64 }}>
                        <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600 }}>{d.main}</span>
                        <span style={{ fontSize: 11, color: "#98A2B3" }}>{d.minor}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: d.dFg }}>{d.delta}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {docs.empty ? <div style={{ padding: "22px 0", fontSize: 13, color: "#667085", borderTop: "1px solid #F2F4F7", textAlign: "center" }}>No doctors match these filters.</div> : null}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 0 8px", borderTop: "1px solid #F2F4F7" }}>
                  <span style={{ fontSize: 12, color: "#98A2B3" }}>{docs.footer}</span>
                  {docs.more ? <button type="button" onClick={docs.toggleAll} style={{ height: 30, padding: "0 12px", border: "1px solid #EAECF0", background: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#1F4FD8", cursor: "pointer" }}>{docs.moreTxt}</button> : null}
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ flex: "1 1 340px", maxWidth: "100%", minWidth: 0, display: "flex", flexDirection: "column", gap: L.gap }}>
            {/* ── Data health ── */}
            {v.showHealth ? (
              <div style={{ background: "#101828", color: "#fff", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><div style={h14}>Data health</div><div style={{ fontSize: 12, color: "#98A2B3" }}>Admin · IT / MIS</div></div>
                {v.health.map((h) => (
                  <div key={h.label} style={{ display: "grid", gridTemplateColumns: "8px minmax(0,1fr) auto", gap: 10, alignItems: "start", paddingTop: 9, borderTop: "1px solid #1D2939" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: h.dot, marginTop: 5 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}><span style={{ fontSize: 13, fontWeight: 500 }}>{h.label}</span><span style={{ fontSize: 11, color: "#98A2B3" }}>{h.note}</span></div>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, textAlign: "right", maxWidth: 170 }}>{h.v}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* ── Division split ── */}
            {v.showDivs ? (
              <div style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><div style={h14}>Division split</div><div style={s12}>by value</div></div>
                <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", gap: 2 }}>
                  {v.divs.map((d) => <div key={d.key} style={{ width: `${d.pct}%`, background: d.c }} />)}
                </div>
                {v.divs.map((d) => (
                  <div key={d.key} style={{ display: "grid", gridTemplateColumns: "10px minmax(0,1fr) auto 40px", gap: 10, alignItems: "center" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: d.c }} />
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><span style={{ fontSize: 13, fontWeight: 500 }}>{d.name}</span><span style={{ fontSize: 11, color: "#98A2B3" }}>{d.minor}</span></div>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>{d.main}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: "#667085", textAlign: "right" }}>{d.pctTxt}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* ── Brands (pivots to HQs) ──
                Side by side it fills whatever height is left in the right column
                and ends level with the Doctors card: it sits absolutely inside a
                flex:1 slot, so a long list can't stretch the column, and the rows
                scroll inside. Stacked (phone / narrow), it is ordinary height. */}
            {v.vis.brands ? (
              <div style={side ? { flex: "1 1 0", position: "relative", minHeight: 360 } : undefined}>
              <div style={{ ...card, padding: "16px 18px 6px", display: "flex", flexDirection: "column", ...(side ? { position: "absolute", inset: 0 } : null) }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", paddingBottom: 8, flex: "none" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><div style={h14}>{v.brandTitle}</div><div style={s12}>{v.bk.hint}</div></div>
                  <div style={{ width: 176 }}><Segmented items={v.bk.modes} h={26} radius={8} /></div>
                </div>
                <div style={side ? { flex: "1 1 0", minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", scrollbarWidth: "thin", scrollbarColor: "#D0D5DD transparent", marginRight: -8, paddingRight: 8 } : undefined}>
                {v.brands.map((b) => (
                  <div key={b.name} style={{ borderTop: "1px solid #F2F4F7" }}>
                    <div className="sr-hr" onClick={b.toggle} style={{ display: "grid", gridTemplateColumns: "14px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "10px 0", cursor: "pointer" }}>
                      <span style={{ display: "inline-block", transform: `rotate(${b.rot}deg)`, transition: "transform .18s ease", fontSize: 9, color: "#667085" }}>▶</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                        <span style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, fontWeight: 600 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: b.c, flex: "none" }} />{b.name}</span>
                        <div style={{ height: 5, borderRadius: 3, background: "#EEF1F5", overflow: "hidden" }}><div style={{ height: "100%", width: `${b.w}%`, background: b.c, borderRadius: 3 }} /></div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, minWidth: 62 }}><span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>{b.main}</span><span style={{ fontSize: 11, color: "#98A2B3" }}>{b.minor}</span></div>
                    </div>
                    {b.open ? (
                      <div style={{ margin: "0 0 10px 24px", padding: "8px 10px", background: "#F8F9FB", borderRadius: 10, display: "flex", flexDirection: "column", gap: 7, maxHeight: 340, overflowY: "auto", overscrollBehavior: "contain", scrollbarWidth: "thin", scrollbarColor: "#D0D5DD transparent" }}>
                        <span style={{ ...eyebrowS, fontSize: 10 }}>{b.name} {v.bk.subLabel}</span>
                        {b.hqs.map((h) => (
                          <div key={h.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 54px 56px", gap: 8, alignItems: "center", fontSize: 12 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}><span style={{ fontWeight: 500 }}>{h.name}</span><div style={{ height: 4, borderRadius: 2, background: "#E4E7EC", overflow: "hidden" }}><div style={{ height: "100%", width: `${h.w}%`, background: h.c }} /></div></div>
                            <span style={{ fontFamily: MONO, fontWeight: 600, textAlign: "right" }}>{h.main}</span>
                            <span style={{ fontFamily: MONO, color: "#98A2B3", textAlign: "right", fontSize: 11 }}>{h.minor}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {!v.brands.length ? <div style={{ padding: "18px 0", fontSize: 13, color: "#667085", borderTop: "1px solid #F2F4F7", textAlign: "center" }}>{v.pending ? "Loading…" : "Nothing in this period."}</div> : null}
                </div>
                {v.bk.more ? (
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 0 8px", borderTop: "1px solid #F2F4F7", flex: "none" }}>
                    <button type="button" onClick={v.bk.toggleAll} style={{ height: 30, padding: "0 12px", border: "1px solid #EAECF0", background: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#1F4FD8", cursor: "pointer" }}>{v.bk.moreTxt}</button>
                  </div>
                ) : null}
              </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Person popup: a team member's doctors. Sits below the drawer so a
          doctor opened from it slides over it and closing returns here. ── */}
      {pw.open ? (
        <Layer>
          <div onClick={closeModal} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,.45)", zIndex: 1100 }} />
          <div role="dialog" aria-modal="true" aria-label={pw.title + " · doctors"} style={{ position: "fixed", zIndex: 1101, background: "#F8F9FB", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(16,24,40,.28)", ...(mob ? { left: 0, right: 0, bottom: 0, height: "86vh", borderRadius: "24px 24px 0 0" } : { left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(640px, calc(100vw - 32px))", height: "min(720px, calc(100vh - 48px))", borderRadius: 16 }) }}>
            <div style={{ background: "#fff", padding: mob ? "12px 16px 14px" : "18px 22px 16px", borderBottom: "1px solid #EAECF0", display: "flex", flexDirection: "column", gap: 12 }}>
              {mob ? <div style={{ width: 40, height: 4, borderRadius: 2, background: "#D0D5DD", alignSelf: "center", marginTop: -4 }} /> : null}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: pw.avBg, color: "#fff", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 600, flex: "none" }}>{pw.initials}</div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
                    <span style={{ fontSize: 17, fontWeight: 650, ...ell }}>{pw.title}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: "#98A2B3", flex: "none" }}>{pw.code}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "#667085", ...ell }}>{pw.sub}</span>
                </div>
                <button type="button" onClick={closeModal} aria-label="Close" style={{ width: 34, height: 34, border: 0, background: "#F2F4F7", borderRadius: 9, cursor: "pointer", fontSize: 14, color: "#475467", flex: "none" }}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 1, background: "#EAECF0", border: "1px solid #EAECF0", borderRadius: 10, overflow: "hidden" }}>
                {pw.stats.map((t) => (
                  <div key={t.label} style={{ background: "#fff", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 10, color: "#667085", textTransform: "uppercase", letterSpacing: ".04em", ...ell }}>{t.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: t.fs, fontWeight: 600, color: t.c, whiteSpace: "nowrap" }}>{t.v}</span>
                  </div>
                ))}
              </div>
              <Search value={pw.q} onChange={(e) => set({ pq: e.target.value })} placeholder="Search doctor, code or city" h={38} />
            </div>
            <div data-sr-scroll="1" style={{ flex: 1, overflow: "auto", padding: "12px 14px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
              {pw.docs.map((d) => (
                <div key={d.id} className="sr-hc" onClick={d.open} style={{ background: "#fff", border: "1px solid #EAECF0", borderRadius: 12, padding: "11px 13px", display: "grid", gridTemplateColumns: "36px minmax(0,1fr) auto", gap: 10, alignItems: "center", cursor: "pointer", flex: "none" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: d.avBg, color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600 }}>{d.initials}</div>
                  <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, ...ell }}>{d.name}</span>
                    <span style={{ fontSize: 11, color: "#667085", ...ell }}>{d.spec} · {d.id}{d.city ? " · " + d.city : ""}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                    <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>{d.main}</span>
                    <span style={{ fontSize: 11, color: "#98A2B3" }}>{d.minor}</span>
                  </div>
                </div>
              ))}
              {pw.empty ? <div style={{ fontSize: 13, color: "#667085", textAlign: "center", padding: "22px 0" }}>No doctors match.</div> : null}
              <div style={{ fontSize: 12, color: "#98A2B3", textAlign: "center", padding: "6px 0" }}>{pw.footer}</div>
            </div>
          </div>
        </Layer>
      ) : null}

      {/* ── Doctor drawer ── */}
      {dw.open ? (
        <Layer>
          <div onClick={closeDrawer} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,.45)", zIndex: 1200 }} />
          <div role="dialog" aria-label="Details" style={{ position: "fixed", top: DR.top, right: DR.right, bottom: DR.bottom, left: DR.left, width: DR.w, height: DR.h, borderRadius: DR.rad, background: "#F8F9FB", zIndex: 1201, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 -8px 40px rgba(16,24,40,.2)" }}>
            <div style={{ background: "#fff", padding: DR.hPad, borderBottom: "1px solid #EAECF0", display: "flex", flexDirection: "column", gap: 12 }}>
              {mob ? <div style={{ width: 40, height: 4, borderRadius: 2, background: "#D0D5DD", alignSelf: "center", marginTop: -4 }} /> : null}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: dw.avBg, color: "#fff", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 600, flex: "none" }}>{dw.initials}</div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
                    <span style={{ fontSize: 17, fontWeight: 650, ...ell }}>{dw.title}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: "#98A2B3", flex: "none" }}>{dw.code}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "#667085", ...ell }}>{dw.sub}</span>
                </div>
                <button type="button" onClick={closeDrawer} aria-label="Close" style={{ width: 34, height: 34, border: 0, background: "#F2F4F7", borderRadius: 9, cursor: "pointer", fontSize: 14, color: "#475467", flex: "none" }}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 1, background: "#EAECF0", border: "1px solid #EAECF0", borderRadius: 10, overflow: "hidden" }}>
                {dw.stats.map((t) => (
                  <div key={t.label} style={{ background: "#fff", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 10, color: "#667085", textTransform: "uppercase", letterSpacing: ".04em", ...ell }}>{t.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: t.fs, fontWeight: 600, color: t.c, whiteSpace: "nowrap" }}>{t.v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div data-sr-scroll="1" style={{ flex: 1, overflow: "auto", padding: "12px 14px 28px", display: "flex", flexDirection: "column", gap: 10 }}>
              {dw.open ? (
                <>
                  <div style={{ background: "#fff", border: "1px solid #EAECF0", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, flex: "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", ...eyebrowS }}><span>Qty · last 6 months</span><span style={{ color: dd.dFg, textTransform: "none", letterSpacing: 0 }}>{dd.delta}</span></div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 8, alignItems: "end", height: 92 }}>
                      {dd.months.map((m) => (
                        <div key={m.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, height: "100%", minWidth: 0 }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: m.lc, whiteSpace: "nowrap" }}>{m.v}</span>
                          <div style={{ width: "100%", maxWidth: 26, height: m.h, background: m.bg, borderRadius: "4px 4px 0 0" }} />
                          <span style={{ fontSize: 11, color: m.lc, fontWeight: m.fw }}>{m.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {dd.hasProfiles ? (
                    <div style={{ background: "#fff", border: "1px solid #EAECF0", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 9, flex: "none" }}>
                      <span style={eyebrowS}>By role profile</span>
                      {dd.profiles.map((p) => (
                        <div key={p.code} style={{ display: "grid", gridTemplateColumns: "9px minmax(0,1fr) auto", gap: 10, alignItems: "center", fontSize: 12 }}>
                          <span style={{ width: 9, height: 9, borderRadius: 3, background: p.c }} />
                          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><span style={{ fontFamily: MONO, fontWeight: 600 }}>{p.code}</span><span style={{ color: "#667085", fontSize: 11, ...ell }}>{p.who}</span></div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}><span style={{ fontFamily: MONO, fontWeight: 600 }}>{p.main}</span><span style={{ fontSize: 11, color: "#98A2B3" }}>{p.minor}</span></div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {dd.hasItems ? (
                    <>
                      <div style={{ background: "#fff", border: "1px solid #EAECF0", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 9, flex: "none" }}>
                        <span style={eyebrowS}>Brands · {dd.brandCount}</span>
                        {dd.brands.map((b) => (
                          <div key={b.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center", fontSize: 12 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}><span style={{ fontWeight: 500 }}>{b.name}</span><div style={{ height: 4, background: "#EEF1F5", borderRadius: 2 }}><div style={{ height: "100%", width: `${b.w}%`, background: b.c, borderRadius: 2 }} /></div></div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 60 }}><span style={{ fontFamily: MONO, fontWeight: 600 }}>{b.main}</span><span style={{ fontSize: 11, color: "#98A2B3" }}>{b.minor}</span></div>
                          </div>
                        ))}
                      </div>
                      <div style={{ background: "#fff", border: "1px solid #EAECF0", borderRadius: 12, padding: "12px 14px 4px", display: "flex", flexDirection: "column", flex: "none" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 48px 52px 70px", gap: 8, fontSize: 10, color: "#667085", textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 600, paddingBottom: 6 }}>
                          <span>Item · {dd.itemCount}</span><span style={{ textAlign: "right" }}>Qty</span><span style={{ textAlign: "right" }}>Rate</span><span style={{ textAlign: "right" }}>Value</span>
                        </div>
                        {dd.items.map((it) => (
                          <div key={it.item} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 48px 52px 70px", gap: 8, alignItems: "center", fontSize: 12, padding: "7px 0", borderTop: "1px solid #F2F4F7" }}>
                            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><span style={{ fontWeight: 500, ...ell }}>{it.item}</span><span style={{ fontSize: 10, color: "#98A2B3" }}>{it.brand}</span></div>
                            <span style={{ fontFamily: MONO, color: "#475467", textAlign: "right" }}>{it.qty}</span>
                            <span style={{ fontFamily: MONO, color: "#98A2B3", textAlign: "right", fontSize: 11 }}>{it.rate}</span>
                            <span style={{ fontFamily: MONO, fontWeight: 600, color: "#101828", textAlign: "right" }}>{it.amt}</span>
                          </div>
                        ))}
                        {dd.more ? <button type="button" onClick={dd.toggleAll} style={{ margin: "4px 0 8px", height: 34, border: "1px solid #EAECF0", background: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "#1F4FD8", cursor: "pointer" }}>{dd.moreTxt}</button> : null}
                      </div>
                    </>
                  ) : null}
                  {dd.hasNote ? <div style={{ fontSize: 12, color: "#667085", padding: 2 }}>{dd.note}</div> : null}
                </>
              ) : null}
            </div>
          </div>
        </Layer>
      ) : null}
    </Shell>
  );
}

function Legend({ c, dashed, children }) {
  return (
    <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: dashed ? "transparent" : c, border: dashed ? "1px dashed #D0D5DD" : 0 }} />
      {children}
    </span>
  );
}
