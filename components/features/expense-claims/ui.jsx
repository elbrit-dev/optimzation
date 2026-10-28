"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, Drawer } from "@/design-system";
import {
  ADVANCE, ATTACH_ACCEPT, DEFAULT_TYPES, applyAction, checkClaim, checkFile, fetchClaim, fetchClaimComments, fetchClaimFiles, fetchFileBlob,
  extractBill, fileKind, invalidateClaims, saveClaim, uploadClaimFile,
} from "./data/claimsApi";
import { MON, RISK, WD, WDL, claimStatusLabel, dateOf, dayTotal, daySanctioned, inr, isoDay, shortDate, sizeLabel, spanOf, statusOf, typeColor } from "./model";

/* The pieces every claims surface shares: the day card, the day sheet with
   its bills and their preview, and the New / Edit claim form. Inline styles
   like the Home overview, scoped under .ec-root. */

export const FONT_HREF = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";

export const CSS = `
.ec-root{font-family:Inter,system-ui,sans-serif;color:#0b1220;-webkit-font-smoothing:antialiased;box-sizing:border-box}
.ec-root *,.ec-root *::before,.ec-root *::after{box-sizing:border-box}
.ec-root button,.ec-root input,.ec-root select,.ec-root textarea{font-family:inherit;color:inherit;margin:0}
.ec-root button:focus-visible,.ec-root input:focus-visible,.ec-root select:focus-visible,.ec-root textarea:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
.ec-root .ec-rail{scrollbar-width:none}.ec-root .ec-rail::-webkit-scrollbar{display:none}
@keyframes ec-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes ec-marq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes ec-spin{to{transform:rotate(360deg)}}
@media (hover:hover) and (pointer:fine){
.ec-root .ec-card:hover{box-shadow:0 0 0 1px #b2c8f7,0 8px 20px -14px rgba(37,99,235,.5)!important}
.ec-root .ec-ghost:hover{background:#f2f4f7!important}
.ec-root .ec-link:hover{background:#eef3fe!important}
.ec-root .ec-cta:hover{background:#1d4ed8!important}
.ec-root .ec-marq:hover{animation-play-state:paused!important}
}
@media (prefers-reduced-motion:reduce){.ec-root *{animation:none!important;transition:none!important}}`;

export const card = { background: "#fff", borderRadius: 16, boxShadow: "0 0 0 1px #e4e7ec" };
export const tabNum = { fontVariantNumeric: "tabular-nums" };
export const ell = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
export const label = { fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "#667085" };
export const btn = {
  primary: { height: 44, padding: "0 16px", borderRadius: 11, border: 0, background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  ghost: { height: 44, padding: "0 16px", borderRadius: 11, border: "1px solid #d0d5dd", background: "#fff", color: "#344054", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  icon: { width: 40, height: 40, borderRadius: 10, border: 0, background: "transparent", color: "#475467", display: "grid", placeItems: "center", cursor: "pointer", flex: "none" },
};

export const Icon = ({ d, size = 16, sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
export const IC = {
  x: "M6 6l12 12M18 6L6 18", back: "M15 6l-6 6 6 6", next: "M9 6l6 6-6 6", down: "M6 9l6 6 6-6", plus: "M12 5v14M5 12h14",
  clip: "M20 11.5l-8.2 8.2a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4L14.6 7.5",
  file: "M6 3h9l4 4v14H6zM14 3v5h5", eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  dl: "M12 4v11M7 10l5 5 5-5M5 20h14", trash: "M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  wallet: "M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4zM4 7l11-3v3M16 13.5h.01", hist: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  check: "M5 12l5 5 9-10", search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4", filter: "M4 6h16M7 12h10M10 18h4",
  shield: "M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4-4",
  flame: "M12 22c4.4 0 7-2.9 7-6.6 0-2.4-1.3-4.3-2.6-5.9-.4 1.7-1.2 2.8-2.4 3.4-.3-2.9-1.9-5.6-5-7.9.4 3-.8 4.6-2 6.4-.9 1.4-1.4 2.6-1.4 3.9C5.6 19.3 8.1 22 12 22z",
  camera: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  arrow: "M5 12h14M13 6l6 6-6 6",
};

/* The prototype's colour families: field blue, food orange, settle = the Advance purple,
   ok green, reward amber. [ink, soft] */
export const TONE = { ok: ["#067647", "#ecfdf3"], reward: ["#b54708", "#fffaeb"], field: ["#1d4ed8", "#eef3fe"], settle: ["#7c3aed", "#f4f0ff"] };
const HL_ICON = { ai: "shield", bill: "clip", cleared: "check", streak: "flame", paid: "check", added: "wallet", bills: "file" };

/* A sideways-scrolling row of highlight cards (model.highlights). `bleed`
   lets the row run to the screen edge under a padded parent (a CSS length). */
/* `wrap` (desktop): a grid that shows every tile -- a mouse cannot swipe the rail. */
export function Highlights({ items, bleed = "0px", onTip, wrap = false }) {
  if (!items?.length) return null;
  const box = wrap
    ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }
    : { display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x proximity", margin: `0 calc(-1 * ${bleed})`, padding: `0 ${bleed} 2px` };
  return (
    <div className="ec-rail" role="list" aria-label="Highlights" style={box}>
      {items.map((a) => {
        const [c, s] = TONE[a.tone] || TONE.field;
        return (
          <button key={a.key} type="button" role="listitem" title={a.tip} onClick={() => onTip?.(a.tip)} style={{ flex: "none", scrollSnapAlign: "start", minWidth: 148, display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", columnGap: 9, alignItems: "center", padding: "10px 12px", borderRadius: 16, border: 0, background: a.tone === "reward" && a.pct === 1 ? s : "#fff", boxShadow: "0 0 0 1px #e4e7ec", cursor: "pointer", textAlign: "left" }}>
            <span style={{ gridRow: "1 / 4", width: 30, height: 30, borderRadius: 10, background: s, color: c, display: "grid", placeItems: "center" }}><Icon d={IC[HL_ICON[a.key] || "check"]} size={16} /></span>
            <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em", whiteSpace: "nowrap", ...tabNum }}>{a.value}</span>
            <span style={{ fontSize: 11, color: "#5b6576", ...ell }}>{a.label}</span>
            {a.pct != null && <span aria-hidden style={{ height: 3, borderRadius: 99, background: "#eef1f5", overflow: "hidden", marginTop: 4 }}><span style={{ display: "block", height: "100%", width: Math.round(a.pct * 100) + "%", background: c, borderRadius: 99 }} /></span>}
          </button>
        );
      })}
    </div>
  );
}

export function Spinner({ size = 16 }) {
  return <span aria-hidden style={{ width: size, height: size, borderRadius: "50%", border: "2px solid #d0d5dd", borderTopColor: "#2563eb", display: "inline-block", animation: "ec-spin .8s linear infinite" }} />;
}

export function Chip({ status, claim }) {
  const s = statusOf(claim ? claim.status : status);
  const text = claim ? claimStatusLabel(claim) : s.label;
  return <span style={{ flex: "none", alignSelf: "flex-start", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>{text}</span>;
}

export function TypeDot({ type, size = 7 }) {
  return <span style={{ flex: "none", width: size, height: size, borderRadius: "50%", background: typeColor(type).c }} />;
}

export function Note({ tone = "error", children, style }) {
  const t = tone === "error" ? ["#fef3f2", "#b42318"] : tone === "ok" ? ["#ecfdf3", "#067647"] : ["#f7f8fa", "#475467"];
  return <div role={tone === "error" ? "alert" : "status"} style={{ padding: "11px 14px", borderRadius: 12, background: t[0], color: t[1], fontSize: 13, fontWeight: 500, ...style }}>{children}</div>;
}

/* The design system's Drawer, drawn as the design's sheet: a bottom sheet on a
   phone that swipes down to close, a side drawer from 768px. Escape, the scrim
   and back close it; a sheet opened on top of another stacks and closes
   first. Mounted only while shown, so it renders open and closes through
   onClose. (`z` is accepted for existing callers; stacking is the order the
   sheets open in.) */
const WIDE_QUERY = "(min-width: 768px)";
/* Desktop-width screen? Read at once (no first-frame flash), then followed. */
export function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const q = window.matchMedia(WIDE_QUERY);
    const sync = () => setWide(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);
  return wide;
}

/* desktop="drawer" (default): the side drawer from 768px.
   desktop="dialog": a centred popup from 768px -- the claim form. On a phone
   both are the swipeable bottom drawer. */
export function Sheet({ title, sub, chips, onClose, maxWidth = 640, z: _z = 70, body, footer, children, desktop = "drawer" }) {
  const wide = useWide();
  const popup = desktop === "dialog" && wide;
  const inner = (
    <>
      <div style={{ flex: "none", display: "flex", alignItems: "flex-start", gap: 12, padding: popup ? "18px 14px 16px 24px" : "8px 12px 14px 20px", background: "#fff", boxShadow: "0 1px 0 #eef1f5" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: popup ? 20 : 18, fontWeight: 700, letterSpacing: "-0.015em" }}>{title}</span>
          {(chips || sub) && <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{chips}{sub && <span style={{ fontSize: 12.5, color: "#8a93a3" }}>{sub}</span>}</span>}
        </div>
        <button type="button" aria-label="Close" className="ec-ghost" onClick={onClose} style={btn.icon}><Icon d={IC.x} size={18} /></button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</div>
      {footer && <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: popup ? "14px 24px" : "12px 16px calc(12px + env(safe-area-inset-bottom))", background: "#fff", boxShadow: "inset 0 1px 0 #eef1f5" }}>{footer}</div>}
    </>
  );
  if (popup) {
    return (
      <Dialog.Root open onOpenChange={(next) => { if (!next) onClose?.(); }} backName="expense-claims">
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Viewport>
            <Dialog.Popup className="ec-root" aria-label={title} style={{ inlineSize: "100%", maxInlineSize: maxWidth, maxBlockSize: "min(92dvh, 980px)", borderRadius: 22, display: "flex", flexDirection: "column", background: body || "#fff", overflow: "hidden", boxShadow: "0 24px 64px -16px rgba(16,24,40,.35)" }}>
              {inner}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }
  return (
    <Drawer.Root open onOpenChange={(next) => { if (!next) onClose?.(); }} backName="expense-claims">
      <Drawer.Portal>
        <Drawer.Backdrop />
        <Drawer.Viewport>
      {/* 92dvh is the phone sheet's cap; from 768px it is a full-height side drawer. */}
      <Drawer.Popup className="ec-root max-h-[92dvh] md:max-h-none" aria-label={title} style={{ width: "100%", maxWidth, display: "flex", flexDirection: "column", background: body || "#fff", overflow: "hidden" }}>
        <Drawer.Handle />
        {inner}
      </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ------------------------------ day card ------------------------------- */

export function DayCard({ day, onOpen }) {
  const c = day.claim;
  const dt = dateOf(day.date);
  const tot = dayTotal(day);
  const san = daySanctioned(day);
  const cut = san != null && san !== tot;
  const byType = [];
  for (const r of day.rows) {
    const t = byType.find((x) => x.type === r.type);
    if (t) { t.n += 1; t.amount += r.amount; } else byType.push({ type: r.type, n: 1, amount: r.amount });
  }
  return (
    <button type="button" className="ec-card" onClick={onOpen} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 9, padding: "11px 12px", borderRadius: 14, border: 0, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec", cursor: "pointer", textAlign: "left", transition: "box-shadow .15s" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
        <span style={{ flex: "none", width: 42, height: 42, borderRadius: 10, background: "#f2f4f7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
          <span style={{ fontSize: 17, fontWeight: 700, ...tabNum }}>{dt.getDate()}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#667085", textTransform: "uppercase", marginTop: 2 }}>{WD[dt.getDay()]}</span>
        </span>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Chip claim={c} /><RiskBadge ai={c.ai} small /></span>
          <span style={{ fontSize: 12, color: "#8a93a3", ...ell }}>{c.id} · {day.rows.length} {day.rows.length === 1 ? "entry" : "entries"}</span>
        </span>
        <span style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 700, ...tabNum }}>{inr(tot)}</span>
          {cut && <span style={{ fontSize: 11, fontWeight: 600, color: "#b54708" }}>{inr(san)} sanctioned</span>}
        </span>
        <span style={{ flex: "none", color: "#98a2b3", display: "flex" }}><Icon d={IC.next} /></span>
      </span>
      <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {byType.map((t) => {
          const col = typeColor(t.type);
          return (
            <span key={t.type} style={{ display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 9px", borderRadius: 8, background: col.bg, fontSize: 12, fontWeight: 600, color: col.fg, whiteSpace: "nowrap" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: col.c }} />
              {t.type}{t.n > 1 ? ` ×${t.n}` : ""}
              <span style={{ color: "#0b1220", ...tabNum }}>{inr(t.amount)}</span>
            </span>
          );
        })}
      </span>
    </button>
  );
}

/* ---------------------------- attachments ------------------------------ */

/* Bills on a claim, read once per claim version. */
const fileCache = new Map();
export function useClaimFiles(conn, claim) {
  const key = claim ? `${claim.id}|${claim.modified}` : "";
  const [state, setState] = useState(() => (key && fileCache.has(key) ? { status: "ready", files: fileCache.get(key) } : { status: "loading", files: [] }));
  useEffect(() => {
    if (!conn || !claim) return undefined;
    if (fileCache.has(key)) { setState({ status: "ready", files: fileCache.get(key) }); return undefined; }
    let alive = true;
    setState({ status: "loading", files: [] });
    fetchClaimFiles(conn, claim.id)
      .then((files) => { fileCache.set(key, files); if (alive) setState({ status: "ready", files }); })
      .catch((e) => alive && setState({ status: "error", files: [], error: e.message }));
    return () => { alive = false; };
  }, [conn, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
export const forgetClaimFiles = (claimId) => { for (const k of fileCache.keys()) if (k.startsWith(claimId + "|")) fileCache.delete(k); };

const blobCache = new Map();
function useFileUrl(conn, file) {
  const [s, setS] = useState({ status: "loading" });
  useEffect(() => {
    if (!file) return undefined;
    let alive = true;
    if (file.local) { const u = URL.createObjectURL(file.local); setS({ status: "ready", url: u }); return () => URL.revokeObjectURL(u); }
    const hit = blobCache.get(file.url);
    const p = hit || fetchFileBlob(conn, file.url).then((b) => URL.createObjectURL(b));
    if (!hit) { blobCache.set(file.url, p); p.catch(() => blobCache.delete(file.url)); }
    p.then((url) => alive && setS({ status: "ready", url })).catch((e) => alive && setS({ status: "error", error: e.message }));
    return () => { alive = false; };
  }, [conn, file]);
  return s;
}

function Thumb({ conn, file, onOpen }) {
  const { status, url } = useFileUrl(file.kind === "image" ? conn : null, file.kind === "image" ? file : null);
  return (
    <button type="button" onClick={onOpen} className="ec-card" title={`Preview ${file.name}`} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, padding: 8, borderRadius: 12, border: 0, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec", cursor: "pointer", textAlign: "left" }}>
      <span style={{ flex: "none", width: 44, height: 44, borderRadius: 8, background: "#f2f4f7", display: "grid", placeItems: "center", overflow: "hidden", color: file.kind === "pdf" ? "#b42318" : "#475467" }}>
        {file.kind === "image" && status === "ready" ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : file.kind === "image" && status === "loading" ? <Spinner />
          : file.kind === "pdf" ? <span style={{ fontSize: 10, fontWeight: 800 }}>PDF</span> : <Icon d={IC.file} size={18} />}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, ...ell }}>{file.name}</span>
        <span style={{ fontSize: 11, color: "#8a93a3" }}>{[file.kind === "pdf" ? "PDF" : file.kind === "image" ? "Photo" : "File", sizeLabel(file.size)].filter(Boolean).join(" · ")}</span>
      </span>
      <span style={{ flex: "none", color: "#1d4ed8", display: "flex" }}><Icon d={IC.eye} /></span>
    </button>
  );
}

export function FilePreview({ conn, file, files = [], onClose }) {
  const [cur, setCur] = useState(file);
  const i = files.findIndex((f) => f === cur);
  const { status, url, error } = useFileUrl(conn, cur);
  useEffect(() => {
    const k = (e) => {
      if (e.key === "ArrowRight" && i >= 0 && i < files.length - 1) setCur(files[i + 1]);
      if (e.key === "ArrowLeft" && i > 0) setCur(files[i - 1]);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [i, files]);
  const nav = (d) => setCur(files[i + d]);
  /* Full screen, on the design system's Dialog: no swipe (a PDF scrolls), but
     Escape and back close it like every other overlay, and a press on the
     dark space around the file closes it as before. */
  return (
    <Dialog.Root open onOpenChange={(next) => { if (!next) onClose?.(); }} backName="claim-file">
      <Dialog.Portal>
        <Dialog.Backdrop style={{ background: "rgba(10,14,22,.86)" }} />
        <Dialog.Viewport style={{ padding: 0 }}>
    <Dialog.Popup className="ec-root" aria-label={cur.name} onClick={onClose} style={{ inlineSize: "100%", blockSize: "100%", maxInlineSize: "none", maxBlockSize: "none", borderRadius: 0, background: "transparent", boxShadow: "none", display: "flex", flexDirection: "column" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "12px 12px 12px 18px", color: "#fff" }}>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 14, fontWeight: 600, ...ell }}>{cur.name}</span>
          {files.length > 1 && <span style={{ fontSize: 12, color: "#98a2b3" }}>{i + 1} of {files.length}</span>}
        </span>
        {status === "ready" && <a href={url} download={cur.name} aria-label="Download" style={{ ...btn.icon, color: "#fff", textDecoration: "none" }}><Icon d={IC.dl} size={18} /></a>}
        <button type="button" aria-label="Close preview" onClick={onClose} style={{ ...btn.icon, color: "#fff" }}><Icon d={IC.x} size={18} /></button>
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px 16px", position: "relative" }}>
        {status === "loading" && <Spinner size={28} />}
        {status === "error" && <Note>{error}</Note>}
        {status === "ready" && cur.kind === "image" && <img src={url} alt={cur.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, background: "#fff" }} />}
        {status === "ready" && cur.kind === "pdf" && <iframe title={cur.name} src={url} style={{ width: "100%", maxWidth: 900, height: "100%", border: 0, borderRadius: 8, background: "#fff" }} />}
        {status === "ready" && cur.kind === "other" && (
          <div style={{ ...card, padding: 24, textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "#475467" }}>This file type cannot be previewed here.</span>
            <a href={url} download={cur.name} style={{ ...btn.primary, display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}><Icon d={IC.dl} />Download</a>
          </div>
        )}
        {i > 0 && <button type="button" aria-label="Previous file" onClick={() => nav(-1)} style={{ ...btn.icon, position: "absolute", left: 12, background: "rgba(255,255,255,.14)", color: "#fff", borderRadius: "50%" }}><Icon d={IC.back} size={18} /></button>}
        {i >= 0 && i < files.length - 1 && <button type="button" aria-label="Next file" onClick={() => nav(1)} style={{ ...btn.icon, position: "absolute", right: 12, background: "rgba(255,255,255,.14)", color: "#fff", borderRadius: "50%" }}><Icon d={IC.next} size={18} /></button>}
      </div>
    </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function FileList({ conn, claim, empty = "No bills attached to this claim." }) {
  const { status, files, error } = useClaimFiles(conn, claim);
  const [open, setOpen] = useState(null);
  if (status === "loading") return <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#8a93a3" }}><Spinner />Looking for bills…</span>;
  if (status === "error") return <span style={{ fontSize: 13, color: "#b42318" }}>Bills could not be read — {error}</span>;
  if (!files.length) return <span style={{ fontSize: 13, color: "#8a93a3" }}>{empty}</span>;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8 }}>
        {files.map((f) => <Thumb key={f.id} conn={conn} file={f} onOpen={() => setOpen(f)} />)}
      </div>
      {open && <FilePreview conn={conn} file={open} files={files} onClose={() => setOpen(null)} />}
    </>
  );
}

/* ------------------------------ AI badges ------------------------------ */

export function RiskBadge({ ai, small }) {
  if (!ai || !ai.risk) return null;
  const r = RISK[ai.risk] || RISK.High;
  return (
    <span title={ai.summary || ai.reason || ""} style={{ flex: "none", alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, fontSize: small ? 10.5 : 11, fontWeight: 700, padding: small ? "1px 7px" : "2px 8px", borderRadius: 99, background: r.bg, color: r.fg, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: r.dot }} />
      {r.label}{ai.score != null ? ` · ${Math.round(ai.score)}` : ""}
    </span>
  );
}

/* A row's bill, opened in the preview. */
export const billFile = (url) => (url ? { id: url, url, name: decodeURIComponent(url.split("/").pop()), kind: fileKind(url) } : null);

/* ------------------------------ day sheet ------------------------------ */

const ACTION_COPY = {
  "Send for Approval": ["Sending for approval…", "sent to your reporting officer"],
  Withdraw: ["Taking it back…", "taken back -- you can edit it again"],
};

export function DaySheet({ conn, day, onClose, onEdit, onChanged, maxWidth = 640 }) {
  const c = day.claim;
  const dt = dateOf(day.date);
  const san = daySanctioned(day);
  const others = c.lines.length - day.rows.length;
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [notes, setNotes] = useState([]);
  useEffect(() => {
    if (!conn || c.status !== "Rejected") return undefined;
    let alive = true;
    fetchClaimComments(conn, c.id).then((n) => alive && setNotes(n));
    return () => { alive = false; };
  }, [conn, c.id, c.status]);

  const act = async (action) => {
    setBusy(ACTION_COPY[action][0]);
    setMsg(null);
    try {
      if (action === "Send for Approval" && !c.isAdvance) {
        setBusy("Checking bills…");
        try { await checkClaim(conn, c.id); } catch (e) { console.warn("[expense-claims] bill check:", e.message); }
        setBusy(ACTION_COPY[action][0]);
      }
      await applyAction(conn, c.id, action);
      invalidateClaims(conn, c.employee || "");
      setMsg({ tone: "ok", text: `${c.id} ${ACTION_COPY[action][1]}.` });
      onChanged?.();
    } catch (e) {
      setMsg({ tone: "error", text: e.message });
    }
    setBusy("");
  };

  const canSend = c.inFlow ? ["Draft", "Rejected"].includes(c.status) : false;
  const canWithdraw = c.status === "Waiting for Approval";
  return (
    <Sheet
      title={`${WDL[dt.getDay()]}, ${dt.getDate()} ${MON[dt.getMonth()]} ${dt.getFullYear()}`}
      chips={<><Chip claim={c} /><RiskBadge ai={c.ai} /></>}
      sub={`${c.id} · covers ${spanOf(c.lines)}${c.posting ? " · filed " + shortDate(c.posting) : ""}`}
      onClose={busy ? () => {} : onClose}
      maxWidth={maxWidth}
      footer={<>
        <button type="button" className="ec-ghost" disabled={!!busy} onClick={onClose} style={{ ...btn.ghost, flex: 1 }}>Close</button>
        {c.editable && onEdit && <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => onEdit(c)} style={{ ...btn.ghost, flex: 1 }}>Edit</button>}
        {canWithdraw && <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => act("Withdraw")} style={{ ...btn.ghost, flex: 1 }}>Take back</button>}
        {canSend && <button type="button" className="ec-cta" disabled={!!busy} onClick={() => act("Send for Approval")} style={{ ...btn.primary, flex: 1.4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{busy ? <><Spinner />{busy}</> : "Send for approval"}</button>}
      </>}
    >
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {msg && <Note tone={msg.tone}>{msg.text}</Note>}
        {c.status === "Rejected" && (
          <Note>{notes[0] ? <>Rejected{notes[0].by ? ` by ${notes[0].by}` : ""}: {notes[0].text}</> : "Rejected. Fix the claim and send it again."}</Note>
        )}
        {c.isAdvance && c.advance && c.status === "Verified" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 1, borderRadius: 12, overflow: "hidden", background: "#eef1f5", boxShadow: "0 0 0 1px #eef1f5" }}>
            {[["Advance", c.claimed], ["Spent", c.advance.spent], ["Balance", c.advance.balance]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 12px", background: "#fff" }}><span style={{ fontSize: 11, color: "#8a93a3" }}>{k}</span><span style={{ fontSize: 16, fontWeight: 700, ...tabNum, color: k === "Balance" ? "#5b21b6" : "#0b1220" }}>{inr(v)}</span></div>
            ))}
          </div>
        )}
        {c.advanceOf && <span style={{ fontSize: 12, color: "#5b21b6", fontWeight: 600 }}>Spent from advance {c.advanceOf}{c.coveredByAdvance ? ` · ${inr(c.coveredByAdvance)} covered by it` : ""}</span>}
        {c.ai?.summary && <span style={{ fontSize: 12.5, color: "#475467", textWrap: "pretty" }}><b style={{ fontWeight: 600 }}>Bill check:</b> {c.ai.summary}</span>}
        {day.rows.map((r) => {
          const col = typeColor(r.type);
          const cut = c.sanctioned != null && r.sanctioned && r.sanctioned !== r.amount;
          const bill = billFile(r.bill);
          return (
            <div key={r.id || r.idx} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: 12, background: "#f7f8fa", boxShadow: `inset 3px 0 0 ${col.c}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, height: 24, padding: "0 9px", borderRadius: 7, background: col.bg, color: col.fg, fontSize: 12, fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: col.c }} />{r.type}{r.sub ? ` · ${r.sub}` : ""}</span>
                <RiskBadge ai={r.ai} small />
                <span style={{ flex: 1 }} />
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, ...tabNum, textDecoration: cut ? "line-through" : "none", color: cut ? "#8a93a3" : "#0b1220" }}>{inr(r.amount)}</span>
                  {cut && <span style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8" }}>{inr(r.sanctioned)} sanctioned</span>}
                </span>
              </div>
              {r.note && <span style={{ fontSize: 14, color: "#344054", textWrap: "pretty" }}>{r.note}</span>}
              {r.ai?.reason && <span style={{ fontSize: 12, color: r.ai.risk === "Low" ? "#067647" : "#b54708" }}>{r.ai.reason}{r.ai.vendor ? ` · ${r.ai.vendor}` : ""}</span>}
              {bill && <button type="button" className="ec-link" onClick={() => setPreview(bill)} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", borderRadius: 8, border: "1px solid #d0d5dd", background: "#fff", color: "#1d4ed8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}><Icon d={IC.eye} size={14} />View bill</button>}
            </div>
          );
        })}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 1, borderRadius: 12, overflow: "hidden", background: "#eef1f5", boxShadow: "0 0 0 1px #eef1f5" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 12px", background: "#fff" }}><span style={{ fontSize: 11, color: "#8a93a3" }}>Claimed this day</span><span style={{ fontSize: 16, fontWeight: 700, ...tabNum }}>{inr(dayTotal(day))}</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 12px", background: "#fff" }}><span style={{ fontSize: 11, color: "#8a93a3" }}>Sanctioned</span><span style={{ fontSize: 16, fontWeight: 700, ...tabNum, color: san != null ? "#1d4ed8" : "#8a93a3" }}>{san != null ? inr(san) : c.status === "Cancelled" || c.status === "Rejected" ? "—" : "When verified"}</span></div>
        </div>
        {c.payrollEntry && <span style={{ fontSize: 12, color: "#067647" }}>In next month&rsquo;s salary · {c.payrollEntry}</span>}
        {others > 0 && <span style={{ fontSize: 12, color: "#8a93a3" }}>This claim has {others} more {others === 1 ? "entry" : "entries"} on other days · {inr(c.claimed)} in all.</span>}
        {c.remark && <span style={{ fontSize: 13, color: "#475467" }}><b style={{ fontWeight: 600 }}>Remark:</b> {c.remark}</span>}
        {!c.inFlow && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
            <span style={label}>Bills & receipts · whole claim</span>
            <FileList conn={conn} claim={c} />
          </div>
        )}
      </div>
      {preview && <FilePreview conn={conn} file={preview} onClose={() => setPreview(null)} />}
    </Sheet>
  );
}

/* ------------------------------ claim form ----------------------------- */

let rowSeq = 0;
const newRow = (type, date) => ({ key: ++rowSeq, type, sub: "", date, note: "", amount: "", bill: "", file: null });

const normTypes = (types) =>
  (types?.length ? types : DEFAULT_TYPES).map((t) => (typeof t === "string" ? { name: t, subs: [], open: false } : t));

/* New claim, or editing a Draft / Rejected one. Two kinds:
 *   expenses  rows of Food / Travel / Miscellaneous…, each with its own bill
 *             (required -- the AI checks every bill against its row), and
 *             optionally spent from one of the person's advances
 *   advance   money asked for up front (Advance rows only, no bills)
 * "Send for approval" saves, uploads the bills, has them checked, and moves
 * the claim to the reporting officer; "Save draft" only saves. */
export function ClaimForm({ conn, me, types, claims = [], claim, copyFrom, today = new Date(), onClose, onSaved, desk }) {
  const todayIso = isoDay(today);
  const minIso = isoDay(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const info = normTypes(types);
  const typeOf = (name) => info.find((t) => t.name === name) || { name, subs: [], open: false };
  const ORDER = ["Travel", "Food", "Miscellaneous"];
  const expenseTypes = info.filter((t) => t.name !== ADVANCE).map((t) => t.name).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  const seed = claim || copyFrom;
  const [mode, setMode] = useState(() => (seed?.lines?.length && seed.lines.every((l) => l.type === ADVANCE) ? "advance" : "expense"));
  const [rows, setRows] = useState(() => (seed?.lines?.length
    ? seed.lines.map((l) => ({ key: ++rowSeq, id: claim ? l.id : undefined, type: l.type, sub: l.sub || "", date: claim ? l.date : todayIso, note: l.note || "", amount: String(l.amount || ""), bill: claim ? l.bill || "" : "", file: null }))
    : [newRow(mode === "advance" ? ADVANCE : expenseTypes[0] || "Travel", todayIso)]));
  const [remark, setRemark] = useState(claim?.remark || "");
  const advances = claims.filter((c) => c.isAdvance && c.status === "Verified" && (c.advance?.balance > 0 || c.id === claim?.advanceOf));
  const [advanceOf, setAdvanceOf] = useState(claim?.advanceOf || "");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const fileRefs = useRef({});

  const switchMode = (m) => {
    if (m === mode) return;
    setMode(m);
    setRows([newRow(m === "advance" ? ADVANCE : expenseTypes[0] || "Travel", todayIso)]);
    setAdvanceOf("");
    setTried(false);
    setError("");
  };
  const set = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const byType = useMemo(() => {
    const m = {};
    for (const r of rows) if (Number(r.amount)) m[r.type] = (m[r.type] || 0) + Number(r.amount);
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const rowError = (r) => {
    const t = typeOf(r.type);
    if (!r.date) return "Pick a date";
    if (mode === "expense" && (r.date < minIso || r.date > todayIso)) return `Date must be ${shortDate(minIso)} – ${shortDate(todayIso)}`;
    if (t.subs.length && !t.open && !r.sub) return `Pick what kind of ${r.type.toLowerCase()}`;
    if (!(Number(r.amount) > 0)) return "Enter an amount";
    if (mode === "expense" && !r.bill && !r.file) return "Attach the bill for this row";
    return "";
  };
  const bad = rows.filter(rowError).length;
  const bills = rows.filter((r) => r.bill || r.file).length;

  /* A bill is read as soon as it is attached: its amount and date fill the
     row (an amount the person typed is never overwritten -- the line below
     says what the bill shows instead). Nothing is scored here; the
     comparison and score happen on send, before the reporting officer. */
  const attach = (key, f) => {
    const err = checkFile(f);
    if (err) return setError(err);
    setError("");
    const row = rows.find((r) => r.key === key);
    set(key, { file: f, read: { busy: true } });
    extractBill(conn, f, row && [row.type, row.sub].filter(Boolean).join(" / "))
      .then((x) => setRows((rs) => rs.map((r) => {
        if (r.key !== key || r.file !== f) return r; // replaced meanwhile
        const patch = { read: { ...x, busy: false } };
        const typed = Number(r.amount) > 0 && Number(r.amount) !== r.read?.filled;
        if (x.amount && !typed) { patch.amount = String(x.amount); patch.read.filled = x.amount; }
        if (x.date && x.date >= minIso && x.date <= todayIso) patch.date = x.date;
        return { ...r, ...patch };
      })))
      .catch((e) => setRows((rs) => rs.map((r) => (r.key === key && r.file === f ? { ...r, read: { busy: false, error: e.message } } : r))));
  };
  const pickBill = (key, e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) attach(key, f);
  };

  const submit = async (send) => {
    setTried(true);
    setError("");
    if (!rows.length) return setError("Add at least one row.");
    if (bad) return setError(`Fix ${bad} ${bad === 1 ? "row" : "rows"} first.`);
    const lineOf = (r, id, bill) => ({ id, type: r.type, sub: r.sub.trim(), date: r.date, note: r.note.trim(), amount: Number(r.amount), bill });
    let name = claim?.id;
    try {
      setBusy("Saving…");
      name = await saveClaim(conn, {
        claim, employee: me.id, postingDate: claim?.posting || todayIso, remark: remark.trim(),
        advanceOf: mode === "expense" ? advanceOf : "",
        lines: rows.map((r) => lineOf(r, r.id, r.bill)),
      });
      // Bills go on the claim, then each row points at its own.
      const pending = rows.map((r, i) => ({ r, i })).filter((x) => x.r.file);
      if (pending.length) {
        const urls = {};
        for (const [n, { r, i }] of pending.entries()) {
          setBusy(`Uploading bill ${n + 1} of ${pending.length}…`);
          urls[i] = (await uploadClaimFile(conn, name, r.file)).file_url;
        }
        setBusy("Saving bills…");
        const fresh = await fetchClaim(conn, name);
        await saveClaim(conn, {
          claim: fresh, employee: me.id, postingDate: fresh.posting, remark: remark.trim(),
          advanceOf: mode === "expense" ? advanceOf : "",
          lines: rows.map((r, i) => lineOf(r, fresh.lines[i]?.id, urls[i] || r.bill)),
        });
      }
    } catch (e) {
      setBusy("");
      return setError(/modified after/i.test(e.message) ? "This claim changed while you had it open. Close and open it again." : e.message);
    }
    let warning = "";
    let check = null;
    if (send) {
      if (mode === "expense") {
        setBusy("Checking bills…");
        try { check = await checkClaim(conn, name); } catch (e) { warning = `The bills could not be checked (${e.message}) -- a reviewer will check them.`; }
      }
      setBusy("Sending for approval…");
      try {
        await applyAction(conn, name, "Send for Approval");
      } catch (e) {
        warning = `${name} is saved but was not sent: ${e.message}`;
        send = false;
      }
    }
    invalidateClaims(conn, me.id);
    setBusy("");
    onSaved?.({ name, edited: !!claim, sent: send, check, warning });
  };

  const wide = useWide();
  const twoCol = wide && desk;
  const input = { width: "100%", minWidth: 0, height: 44, borderRadius: 12, border: "1px solid #e1e5ec", background: "#fbfcfd", fontSize: 14.5, padding: "0 12px", transition: "border-color .15s, box-shadow .15s" };
  const addRow = () => setRows((rs) => [...rs, newRow(mode === "advance" ? ADVANCE : rs[rs.length - 1]?.type || expenseTypes[0] || "Travel", rs[rs.length - 1]?.date || todayIso)]);
  const pct = rows.length ? Math.round((bills / rows.length) * 100) : 0;

  return (
    <Sheet
      desktop="dialog"
      title={claim ? `Edit ${mode === "advance" ? "advance request" : "expense claim"}` : mode === "advance" ? "Ask for an advance" : "New expense claim"}
      sub={[claim?.id, me?.name, me?.department].filter(Boolean).join(" · ")}
      onClose={busy ? () => {} : onClose}
      maxWidth={twoCol ? 1080 : 720}
      body="#f5f6f8"
      footer={<>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "#8a93a3", whiteSpace: "nowrap" }}>{!wide ? "Total" : mode === "advance" ? "Advance asked" : "Total claimed"}</span>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", ...tabNum }}>{inr(total)}</span>
        </div>
        <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => submit(false)} style={{ ...btn.ghost, height: 46, borderRadius: 12, padding: wide ? "0 16px" : "0 12px", opacity: busy ? 0.5 : 1 }}>{wide ? "Save draft" : "Draft"}</button>
        <button type="button" className="ec-cta" disabled={!!busy} onClick={() => submit(true)} style={{ ...btn.primary, height: 46, borderRadius: 12, minWidth: wide ? 190 : 150, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.85 : 1, boxShadow: "0 6px 16px -6px rgba(37,99,235,.55)" }}>
          {busy ? <><Spinner />{busy}</> : <>Send for approval<Icon d={IC.next} size={16} /></>}
        </button>
      </>}
    >
      <style>{FORM_CSS}</style>
      <div style={{ padding: wide ? 24 : 12, display: "grid", gridTemplateColumns: twoCol ? "minmax(0,1fr) 300px" : "minmax(0,1fr)", gap: 18, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {!claim && (
            <div role="tablist" aria-label="Kind of claim" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 5, borderRadius: 14, background: "#e9ecf1" }}>
              {[["expense", "Expenses", "Bills for money you spent", IC.file], ["advance", "Advance request", "Money up front", IC.wallet]].map(([m, t, s, ic]) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: 0, background: mode === m ? "#fff" : "transparent", boxShadow: mode === m ? "0 1px 3px rgba(16,24,40,.12)" : "none", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ flex: "none", width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", background: mode === m ? (m === "advance" ? "#f4f0ff" : "#eef3fe") : "#dfe3ea", color: mode === m ? (m === "advance" ? "#6d28d9" : "#1d4ed8") : "#667085" }}><Icon d={ic} size={16} /></span>
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: mode === m ? "#0b1220" : "#5b6576" }}>{t}</span>
                    {wide && <span style={{ fontSize: 11.5, color: "#8a93a3" }}>{s}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}

          {mode === "expense" && advances.length > 0 && (
            <div className="ecf-card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ flex: "none", width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", background: "#f4f0ff", color: "#6d28d9" }}><Icon d={IC.wallet} size={16} /></span>
              <label style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Spent from an advance?</span>
                <select className="ecf-in" value={advanceOf} onChange={(e) => setAdvanceOf(e.target.value)} style={{ ...input, cursor: "pointer" }}>
                  <option value="">No — my own money</option>
                  {advances.map((a) => <option key={a.id} value={a.id}>{a.lines[0]?.sub || "Advance"} · {a.id} · {inr(a.advance?.balance || 0)} left</option>)}
                </select>
              </label>
            </div>
          )}

          {rows.map((r, i) => {
            const err = tried && rowError(r);
            const t = typeOf(r.type);
            const col = typeColor(r.type);
            const listId = `ec-subs-${r.key}`;
            return (
              <div key={r.key} className="ecf-card" style={{ padding: wide ? 18 : 14, display: "flex", flexDirection: "column", gap: 14, boxShadow: err ? "0 0 0 1.5px #fda29b" : undefined }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: "none", width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", background: col.bg, color: col.fg, fontSize: 13, fontWeight: 800 }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, ...ell }}>{[r.type, r.sub].filter(Boolean).join(" · ") || "Expense"}</span>
                  <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em", color: Number(r.amount) ? "#0b1220" : "#c0c6d0", ...tabNum }}>{inr(r.amount)}</span>
                  {rows.length > 1 && (
                    <button type="button" aria-label={`Remove expense ${i + 1}`} className="ec-ghost" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} style={{ ...btn.icon, width: 34, height: 34, color: "#98a2b3" }}><Icon d={IC.trash} size={16} /></button>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: wide && mode === "expense" ? "minmax(0,1fr) 132px" : "minmax(0,1fr)", gap: 16, alignItems: "start" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                    {mode === "expense" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        <span className="ecf-lbl">Type</span>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {[...new Set([...expenseTypes, r.type])].map((x) => (
                            <Pill key={x} on={r.type === x} color={typeColor(x)} onClick={() => set(r.key, { type: x, sub: "" })}><TypeDot type={x} />{x}</Pill>
                          ))}
                        </div>
                      </div>
                    )}

                    {(t.subs.length > 0 || t.open || mode === "advance") && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        <span className="ecf-lbl">{mode === "advance" ? "What it's for" : "Kind"}{t.open ? " · pick or type a new one" : ""}</span>
                        {t.subs.length > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {t.subs.map((s) => <Pill key={s} small on={r.sub.toLowerCase() === s.toLowerCase()} color={col} onClick={() => set(r.key, { sub: r.sub === s ? "" : s })}>{s}</Pill>)}
                          </div>
                        )}
                        {t.open && (
                          <>
                            <input className="ecf-in" list={listId} placeholder={t.subs.length ? "Or type a new one" : "e.g. Office pantry"} value={r.sub} onChange={(e) => set(r.key, { sub: e.target.value })} style={input} />
                            <datalist id={listId}>{t.subs.map((s) => <option key={s} value={s} />)}</datalist>
                          </>
                        )}
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                        <span className="ecf-lbl">Date</span>
                        <input className="ecf-in" type="date" min={mode === "expense" ? minIso : undefined} max={mode === "expense" ? todayIso : undefined} value={r.date} onChange={(e) => set(r.key, { date: e.target.value })} style={input} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                        <span className="ecf-lbl">Amount</span>
                        <span className="ecf-in ecf-amt" style={{ ...input, display: "flex", alignItems: "center", gap: 6, borderColor: err && !(Number(r.amount) > 0) ? "#f04438" : "#e1e5ec" }}>
                          <span style={{ color: "#8a93a3", fontWeight: 600 }}>₹</span>
                          <input inputMode="decimal" placeholder="0" aria-label="Amount" value={r.amount} onChange={(e) => set(r.key, { amount: e.target.value.replace(/[^\d.]/g, "") })} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 16, fontWeight: 700, textAlign: "right", ...tabNum }} />
                        </span>
                      </label>
                    </div>

                  </div>

                  {mode === "expense" && (
                    <BillDrop
                      conn={conn}
                      row={r}
                      wide={wide}
                      missing={!!err && !r.bill && !r.file}
                      onPick={() => fileRefs.current[r.key]?.click()}
                      onDropFile={(f) => attach(r.key, f)}
                      onClear={() => set(r.key, { file: null, bill: "", read: null })}
                      onPreview={() => setPreview(r.file ? { name: r.file.name, kind: r.file.type === "application/pdf" ? "pdf" : "image", local: r.file } : billFile(r.bill))}
                    />
                  )}
                  {mode === "expense" && <input ref={(el) => { fileRefs.current[r.key] = el; }} type="file" accept={ATTACH_ACCEPT} onChange={(e) => pickBill(r.key, e)} style={{ display: "none" }} />}
                </div>
                {mode === "expense" && r.read && <BillRead read={r.read} amount={Number(r.amount) || 0} onUse={(a) => set(r.key, { amount: String(a), read: { ...r.read, filled: a } })} />}
                {err && <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#b42318" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f04438" }} />{err}</span>}
              </div>
            );
          })}

          {/* An advance is one line: one amount for one purpose (the ERP refuses more). */}
          {mode === "expense" && (
            <button type="button" className="ecf-add" onClick={addRow}>
              <Icon d={IC.plus} size={16} />Add another expense
            </button>
          )}

          <label className="ecf-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="ecf-lbl">Note <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#98a2b3" }}>· optional · for your reporting officer</span></span>
            <textarea className="ecf-in" rows={2} placeholder={mode === "advance" ? "What the advance is for, e.g. office pantry for October" : "e.g. HQ → Kanchipuram doctor calls, joint work with ABM on 20 Oct"} value={remark} onChange={(e) => setRemark(e.target.value)} style={{ ...input, height: "auto", minHeight: 64, padding: 12, resize: "vertical", lineHeight: 1.45 }} />
          </label>
          {error && <Note>{error}</Note>}
          {!twoCol && <Summary mode={mode} total={total} rows={rows.length} bills={bills} pct={pct} byType={byType} compact />}
        </div>

        {twoCol && (
          <div style={{ position: "sticky", top: 0 }}>
            <Summary mode={mode} total={total} rows={rows.length} bills={bills} pct={pct} byType={byType} />
          </div>
        )}
      </div>
      {preview && <FilePreview conn={conn} file={preview} onClose={() => setPreview(null)} />}
    </Sheet>
  );
}

const FORM_CSS = `
.ecf-card{background:#fff;border-radius:18px;box-shadow:0 0 0 1px #e9edf3,0 1px 2px rgba(16,24,40,.04)}
.ecf-lbl{font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#7a8394}
.ecf-in:focus,.ecf-in:focus-within{outline:none;border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,.14);background:#fff!important}
.ecf-add{display:flex;align-items:center;justify-content:center;gap:8px;height:50px;border-radius:16px;border:1.5px dashed #c7cfdb;background:transparent;color:#1d4ed8;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s,border-color .15s}
.ecf-add:hover{background:#eef3fe;border-color:#93b0f5}
.ecf-pill{display:inline-flex;align-items:center;gap:7px;border-radius:999px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,color .15s}
.ecf-drop{transition:border-color .15s,background .15s}
.ecf-drop:hover{border-color:#93b0f5!important;background:#f5f8ff!important}
`;

function Pill({ on, color, small, onClick, children }) {
  return (
    <button type="button" className="ecf-pill" aria-pressed={on} onClick={onClick} style={{ height: small ? 32 : 36, padding: small ? "0 12px" : "0 14px", fontSize: small ? 13 : 13.5, border: `1px solid ${on ? color.c : "#e1e5ec"}`, background: on ? color.bg : "#fff", color: on ? color.fg : "#344054", boxShadow: on ? `0 0 0 2px ${color.bg}` : "none" }}>
      {children}
      {on && <Icon d={IC.check} size={13} sw={2.6} />}
    </button>
  );
}

/* What the AI read off a row's bill, under the row: reading, read (amount ·
   date · shop), the bill's amount when it differs from the row's, or that it
   could not be read (the check on send still runs). */
export function BillRead({ read, amount, onUse }) {
  const line = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "8px 10px", borderRadius: 10, fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 };
  if (read.busy) return <span style={{ ...line, background: "#f2f4f7", color: "#475467" }}><Spinner size={12} />Reading the bill…</span>;
  if (read.error || (!read.amount && !read.date)) return <span style={{ ...line, background: "#f2f4f7", color: "#667085" }}><Icon d={IC.eye} size={14} />Couldn’t read this bill — enter the amount and date; it is checked again when you send.</span>;
  const off = read.amount && amount && Math.abs(read.amount - amount) > read.amount * 0.02;
  const what = [read.amount ? inr(read.amount) : null, read.date ? shortDate(read.date) : null, read.vendor].filter(Boolean).join(" · ");
  return off ? (
    <span style={{ ...line, background: "#fffaeb", color: "#b54708" }}>
      <Icon d={IC.eye} size={14} />The bill says {inr(read.amount)}, you entered {inr(amount)}.
      <button type="button" onClick={() => onUse(read.amount)} style={{ marginLeft: "auto", height: 28, padding: "0 10px", borderRadius: 8, border: 0, background: "#fff", boxShadow: "inset 0 0 0 1px #fedf89", color: "#b54708", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Use {inr(read.amount)}</button>
    </span>
  ) : (
    <span style={{ ...line, background: "#ecfdf3", color: "#067647" }}><Icon d={IC.shield} size={14} /><span style={{ minWidth: 0 }}>Read from the bill · {what}</span></span>
  );
}

/* A row's bill: a tile to tap (camera / files on a phone) or drop a file on;
   once there, its thumbnail, to preview, replace or remove. */
function BillDrop({ conn, row, wide, missing, onPick, onDropFile, onClear, onPreview }) {
  const [over, setOver] = useState(false);
  const file = row.file ? { name: row.file.name, kind: row.file.type === "application/pdf" ? "pdf" : "image", local: row.file } : row.bill ? billFile(row.bill) : null;
  const img = useFileUrl(file && file.kind === "image" ? conn : null, file && file.kind === "image" ? file : null);
  const drop = {
    onDragOver: (e) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onDropFile(f); },
  };
  const box = wide ? { width: 132, height: 156, flexDirection: "column" } : { width: "100%", height: 64, flexDirection: "row" };

  if (!file) {
    return (
      <button type="button" className="ecf-drop" onClick={onPick} {...drop} style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", gap: wide ? 8 : 10, borderRadius: 14, border: `1.5px dashed ${missing ? "#f04438" : over ? "#2563eb" : "#c7cfdb"}`, background: missing ? "#fef3f2" : over ? "#eef3fe" : "#fbfcfd", color: missing ? "#b42318" : "#1d4ed8", cursor: "pointer", padding: 10, textAlign: "center" }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", background: missing ? "#fee4e2" : "#e6edfd" }}><Icon d={IC.clip} size={17} /></span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: wide ? "center" : "flex-start" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Add bill</span>
          <span style={{ fontSize: 11, color: missing ? "#b42318" : "#8a93a3", fontWeight: 500 }}>{wide ? "Photo or PDF · drop here" : "Photo or PDF · required"}</span>
        </span>
      </button>
    );
  }
  return (
    <div {...drop} style={{ ...box, display: "flex", gap: 8, borderRadius: 14, overflow: "hidden", boxShadow: `0 0 0 ${over ? 2 : 1}px ${over ? "#2563eb" : "#e1e5ec"}`, background: "#fff", padding: wide ? 0 : 6, alignItems: wide ? "stretch" : "center" }}>
      <button type="button" onClick={onPreview} aria-label={`Preview ${file.name}`} style={{ flex: wide ? 1 : "none", width: wide ? "100%" : 52, height: wide ? "auto" : 52, minHeight: 0, border: 0, padding: 0, borderRadius: wide ? 0 : 10, overflow: "hidden", background: file.kind === "pdf" ? "#fef3f2" : "#f2f4f7", cursor: "zoom-in", display: "grid", placeItems: "center" }}>
        {file.kind === "image" && img.status === "ready" ? <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : file.kind === "image" ? <Spinner /> : <span style={{ fontSize: 12, fontWeight: 800, color: "#b42318" }}>PDF</span>}
      </button>
      <div style={{ flex: wide ? "none" : 1, minWidth: 0, display: "flex", alignItems: "center", gap: 2, padding: wide ? "0 4px 6px 8px" : 0 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: "#475467", ...ell }} title={file.name}>{wide ? (row.file ? "New bill" : "Attached") : file.name}</span>
        <button type="button" aria-label="Replace bill" className="ec-ghost" onClick={onPick} style={{ ...btn.icon, width: 28, height: 28, color: "#475467" }}><Icon d={IC.hist} size={14} /></button>
        <button type="button" aria-label="Remove bill" className="ec-ghost" onClick={onClear} style={{ ...btn.icon, width: 28, height: 28, color: "#b42318" }}><Icon d={IC.x} size={14} /></button>
      </div>
    </div>
  );
}

function Summary({ mode, total, rows, bills, pct, byType, compact }) {
  return (
    <div className="ecf-card" style={{ padding: compact ? 16 : 20, display: "flex", flexDirection: "column", gap: 14, background: compact ? "#fff" : "linear-gradient(180deg,#ffffff 0%,#f8faff 100%)" }}>
      {!compact && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#5b6576" }}>{mode === "advance" ? "Advance asked" : "Total claimed"}</span>
          <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.035em", ...tabNum }}>{inr(total)}</span>
          <span style={{ fontSize: 12, color: "#8a93a3" }}>{rows} {rows === 1 ? "line" : "lines"}</span>
        </div>
      )}
      {mode === "expense" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600 }}>
            <span style={{ color: "#344054" }}>Bills attached</span>
            <span style={{ color: pct === 100 ? "#067647" : "#b54708", ...tabNum }}>{bills} of {rows}</span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: "#eef1f5", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: pct + "%", borderRadius: 99, background: pct === 100 ? "#12b76a" : "#f79009", transition: "width .25s" }} />
          </div>
        </div>
      )}
      {byType.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "#eef1f5", gap: 2 }}>
            {byType.map(([t, v]) => <span key={t} style={{ width: (v / (total || 1)) * 100 + "%", background: typeColor(t).c }} />)}
          </div>
          {byType.map(([t, v]) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><TypeDot type={t} /><span style={{ flex: 1, color: "#344054" }}>{t}</span><b style={{ fontWeight: 700, ...tabNum }}>{inr(v)}</b></div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, padding: 12, borderRadius: 12, background: "#f2f5fa" }}>
        <span style={{ flex: "none", color: "#2563eb", display: "flex", paddingTop: 1 }}><Icon d={IC.check} size={15} sw={2.4} /></span>
        <span style={{ fontSize: 12, color: "#475467", lineHeight: 1.5, textWrap: "pretty" }}>
          {mode === "advance"
            ? "Your reporting officer approves it, then it is released to you. Add your spends against it as you go — no deadline."
            : "Your reporting officer approves it. Bills that match are verified at once and paid; the rest are checked by a reviewer first."}
        </span>
      </div>
    </div>
  );
}
