"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ATTACH_ACCEPT, checkFile, deleteClaimFile, fetchClaimFiles, fetchFileBlob, invalidateClaims, saveClaim, uploadClaimFile,
} from "./data/claimsApi";
import { MON, WD, WDL, dateOf, dayTotal, daySanctioned, inr, isoDay, shortDate, sizeLabel, spanOf, statusOf, typeColor } from "./model";

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
};

export function Spinner({ size = 16 }) {
  return <span aria-hidden style={{ width: size, height: size, borderRadius: "50%", border: "2px solid #d0d5dd", borderTopColor: "#2563eb", display: "inline-block", animation: "ec-spin .8s linear infinite" }} />;
}

export function Chip({ status }) {
  const s = statusOf(status);
  return <span style={{ flex: "none", alignSelf: "flex-start", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>{s.label}</span>;
}

export function TypeDot({ type, size = 7 }) {
  return <span style={{ flex: "none", width: size, height: size, borderRadius: "50%", background: typeColor(type).c }} />;
}

export function Note({ tone = "error", children, style }) {
  const t = tone === "error" ? ["#fef3f2", "#b42318"] : tone === "ok" ? ["#ecfdf3", "#067647"] : ["#f7f8fa", "#475467"];
  return <div role={tone === "error" ? "alert" : "status"} style={{ padding: "11px 14px", borderRadius: 12, background: t[0], color: t[1], fontSize: 13, fontWeight: 500, ...style }}>{children}</div>;
}

function useEscape(onClose, on = true) {
  useEffect(() => {
    if (!on) return undefined;
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, on]);
}

/* A bottom sheet on every screen size, as in the design: it keeps the page
   behind it in view and reads the same on a phone and a desk. */
export function Sheet({ title, sub, chips, onClose, maxWidth = 640, z = 70, body, footer, children }) {
  useEscape(onClose);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="ec-root" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: z, background: "rgba(16,24,40,.52)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth, maxHeight: "92vh", display: "flex", flexDirection: "column", background: body || "#fff", borderRadius: "20px 20px 0 0", boxShadow: "0 -12px 48px -12px rgba(16,24,40,.45)", overflow: "hidden", animation: "ec-up .3s cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ flex: "none", display: "flex", justifyContent: "center", padding: "8px 0 0", background: "#fff" }}><span style={{ width: 40, height: 4, borderRadius: 99, background: "#d0d5dd" }} /></div>
        <div style={{ flex: "none", display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 12px 14px 20px", background: "#fff", boxShadow: "0 1px 0 #eef1f5" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</span>
            {(chips || sub) && <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{chips}{sub && <span style={{ fontSize: 12, color: "#8a93a3" }}>{sub}</span>}</span>}
          </div>
          <button type="button" aria-label="Close" className="ec-ghost" onClick={onClose} style={btn.icon}><Icon d={IC.x} size={18} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</div>
        {footer && <div style={{ flex: "none", display: "flex", gap: 8, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", background: "#fff", boxShadow: "inset 0 1px 0 #eef1f5" }}>{footer}</div>}
      </div>
    </div>,
    document.body,
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
          <Chip status={c.status} />
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
  useEscape(onClose);
  useEffect(() => {
    const k = (e) => {
      if (e.key === "ArrowRight" && i >= 0 && i < files.length - 1) setCur(files[i + 1]);
      if (e.key === "ArrowLeft" && i > 0) setCur(files[i - 1]);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [i, files]);
  if (typeof document === "undefined") return null;
  const nav = (d) => setCur(files[i + d]);
  return createPortal(
    <div className="ec-root" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(10,14,22,.86)", display: "flex", flexDirection: "column" }}>
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
    </div>,
    document.body,
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

/* ------------------------------ day sheet ------------------------------ */

export function DaySheet({ conn, day, onClose, onEdit, maxWidth = 640 }) {
  const c = day.claim;
  const dt = dateOf(day.date);
  const san = daySanctioned(day);
  const others = c.lines.length - day.rows.length;
  return (
    <Sheet
      title={`${WDL[dt.getDay()]}, ${dt.getDate()} ${MON[dt.getMonth()]} ${dt.getFullYear()}`}
      chips={<Chip status={c.status} />}
      sub={`${c.id} · covers ${spanOf(c.lines)}${c.posting ? " · filed " + shortDate(c.posting) : ""}`}
      onClose={onClose}
      maxWidth={maxWidth}
      footer={<>
        <button type="button" className="ec-ghost" onClick={onClose} style={{ ...btn.ghost, flex: 1 }}>Close</button>
        {c.editable && onEdit && <button type="button" className="ec-cta" onClick={() => onEdit(c)} style={{ ...btn.primary, flex: 1 }}>Edit claim</button>}
      </>}
    >
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {day.rows.map((r) => {
          const col = typeColor(r.type);
          const cut = c.sanctioned != null && r.sanctioned !== r.amount;
          return (
            <div key={r.id || r.idx} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: 12, background: "#f7f8fa", boxShadow: `inset 3px 0 0 ${col.c}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, height: 24, padding: "0 9px", borderRadius: 7, background: col.bg, color: col.fg, fontSize: 12, fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: col.c }} />{r.type}</span>
                <span style={{ flex: 1 }} />
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, ...tabNum, textDecoration: cut ? "line-through" : "none", color: cut ? "#8a93a3" : "#0b1220" }}>{inr(r.amount)}</span>
                  {cut && <span style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8" }}>{inr(r.sanctioned)} sanctioned</span>}
                </span>
              </div>
              <span style={{ fontSize: 14, color: r.note ? "#344054" : "#8a93a3", textWrap: "pretty" }}>{r.note || "No description"}</span>
            </div>
          );
        })}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 1, borderRadius: 12, overflow: "hidden", background: "#eef1f5", boxShadow: "0 0 0 1px #eef1f5" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 12px", background: "#fff" }}><span style={{ fontSize: 11, color: "#8a93a3" }}>Claimed this day</span><span style={{ fontSize: 16, fontWeight: 700, ...tabNum }}>{inr(dayTotal(day))}</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 12px", background: "#fff" }}><span style={{ fontSize: 11, color: "#8a93a3" }}>Sanctioned</span><span style={{ fontSize: 16, fontWeight: 700, ...tabNum, color: san != null ? "#1d4ed8" : "#8a93a3" }}>{san != null ? inr(san) : c.status === "Cancelled" ? "—" : "When HR approves"}</span></div>
        </div>
        {others > 0 && <span style={{ fontSize: 12, color: "#8a93a3" }}>This claim has {others} more {others === 1 ? "entry" : "entries"} on other days · {inr(c.claimed)} in all.</span>}
        {c.remark && <span style={{ fontSize: 13, color: "#475467" }}><b style={{ fontWeight: 600 }}>Remark:</b> {c.remark}</span>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
          <span style={label}>Bills & receipts · whole claim</span>
          <FileList conn={conn} claim={c} />
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------ claim form ----------------------------- */

let rowSeq = 0;
const newRow = (type, date) => ({ key: ++rowSeq, type, date, note: "", amount: "" });

const PLACEHOLDER = {
  Travel: "From → to, purpose · e.g. HQ → Kanchipuram, doctor calls",
  Food: "Daily allowance · HQ or outstation",
  Calls: "Mobile bill · month",
  Medical: "Pharmacy or clinic, bill no.",
  Others: "Courier, stationery… and bill no.",
};

/* New claim, or editing a Draft. Writes the Expense Claim as the user, then
   attaches the bills to it. Dates may run back to the start of last month:
   HR closes a month in the first week of the next. */
export function ClaimForm({ conn, me, types, claim, copyFrom, today = new Date(), onClose, onSaved, desk }) {
  const todayIso = isoDay(today);
  const minIso = isoDay(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const typeList = types?.length ? types : ["Travel", "Food", "Calls", "Medical", "Others"];
  const seed = claim || copyFrom;
  const [rows, setRows] = useState(() => (seed?.lines?.length
    ? seed.lines.map((l) => ({ key: ++rowSeq, id: claim ? l.id : undefined, type: l.type, date: claim ? l.date : todayIso, note: l.note, amount: String(l.amount || "") }))
    : [newRow(typeList[0], todayIso)]));
  const [remark, setRemark] = useState(claim?.remark || "");
  const [newFiles, setNewFiles] = useState([]);
  const [removed, setRemoved] = useState(() => new Set());
  const existing = useClaimFiles(claim ? conn : null, claim);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const set = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const byType = useMemo(() => {
    const m = {};
    for (const r of rows) if (Number(r.amount)) m[r.type] = (m[r.type] || 0) + Number(r.amount);
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const rowError = (r) => (!r.date ? "Pick a date" : r.date < minIso || r.date > todayIso ? `Date must be ${shortDate(minIso)} – ${shortDate(todayIso)}` : !(Number(r.amount) > 0) ? "Enter an amount" : "");
  const bad = rows.filter(rowError).length;
  const keptFiles = (existing.files || []).filter((f) => !removed.has(f.id));
  const fileCount = keptFiles.length + newFiles.length;

  const pick = (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    const errs = list.map(checkFile).filter(Boolean);
    setError(errs.join(" "));
    setNewFiles((fs) => [...fs, ...list.filter((f) => !checkFile(f))]);
  };

  const submit = async () => {
    setTried(true);
    setError("");
    if (!rows.length) return setError("Add at least one expense.");
    if (bad) return setError(`Fix ${bad} ${bad === 1 ? "row" : "rows"} before saving.`);
    let name = claim?.id;
    try {
      setBusy("Saving claim…");
      name = await saveClaim(conn, {
        claim, employee: me.id, postingDate: claim?.posting || todayIso, remark: remark.trim(),
        lines: rows.map((r) => ({ id: r.id, type: r.type, date: r.date, note: r.note.trim(), amount: Number(r.amount) })),
      });
    } catch (e) {
      setBusy("");
      return setError(/modified after/i.test(e.message) ? "HR changed this claim while you had it open. Close and open it again." : e.message);
    }
    const failed = [];
    for (const [i, f] of newFiles.entries()) {
      setBusy(`Uploading bill ${i + 1} of ${newFiles.length}…`);
      try { await uploadClaimFile(conn, name, f); } catch (e) { failed.push(e.message); }
    }
    for (const id of removed) {
      try { await deleteClaimFile(conn, id); } catch (e) { failed.push(e.message); }
    }
    forgetClaimFiles(name);
    invalidateClaims(conn, me.id);
    setBusy("");
    onSaved?.({ name, edited: !!claim, warning: failed.length ? `${name} saved, but ${failed.length} ${failed.length === 1 ? "bill" : "bills"} did not go through: ${failed[0]}` : "" });
  };

  const field = { width: "100%", minWidth: 0, height: 42, borderRadius: 10, border: "1px solid #d0d5dd", background: "#fff", fontSize: 14, padding: "0 10px" };
  const lineCols = desk ? "150px 150px minmax(0,1fr) 128px 40px" : "minmax(0,1fr) minmax(0,1fr)";

  return (
    <Sheet
      title={claim ? "Edit expense claim" : "New expense claim"}
      sub={[claim?.id, me?.name, me?.department].filter(Boolean).join(" · ")}
      onClose={busy ? () => {} : onClose}
      maxWidth={desk ? 1100 : 640}
      body="#f4f5f7"
      footer={<>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={{ fontSize: 11, color: "#8a93a3" }}>Total claimed</span>
          <span style={{ fontSize: 20, fontWeight: 700, ...tabNum }}>{inr(total)}</span>
        </div>
        <button type="button" className="ec-ghost" disabled={!!busy} onClick={onClose} style={{ ...btn.ghost, opacity: busy ? 0.5 : 1 }}>Cancel</button>
        <button type="button" className="ec-cta" disabled={!!busy} onClick={submit} style={{ ...btn.primary, minWidth: 150, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.8 : 1 }}>
          {busy ? <><Spinner />{busy}</> : claim ? "Save changes" : "Send to HR"}
        </button>
      </>}
    >
      <div style={{ padding: desk ? 20 : 12, display: "grid", gridTemplateColumns: desk ? "minmax(0,1fr) 280px" : "minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Expenses <span style={{ color: "#8a93a3", fontWeight: 500 }}>· {rows.length} {rows.length === 1 ? "row" : "rows"}</span></span>
              <span style={{ fontSize: 12, color: "#8a93a3" }}>Dates from {shortDate(minIso)} to today</span>
            </div>
            {rows.map((r) => {
              const err = tried && rowError(r);
              return (
                <div key={r.key} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 12, background: "#f7f8fa", boxShadow: `inset 3px 0 0 ${typeColor(r.type).c}` }}>
                  <div style={{ display: "grid", gridTemplateColumns: lineCols, gap: "10px 12px", alignItems: "end" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}><span style={label}>Expense type</span>
                      <select value={r.type} onChange={(e) => set(r.key, { type: e.target.value })} style={{ ...field, cursor: "pointer" }}>
                        {typeList.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}><span style={label}>Date</span>
                      <input type="date" min={minIso} max={todayIso} value={r.date} onChange={(e) => set(r.key, { date: e.target.value })} style={{ ...field, borderColor: err && !r.date ? "#f04438" : "#d0d5dd" }} />
                    </label>
                    <label style={{ gridColumn: desk ? "auto" : "1 / -1", display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}><span style={label}>Description</span>
                      <input placeholder={PLACEHOLDER[r.type] || "What was it for?"} value={r.note} onChange={(e) => set(r.key, { note: e.target.value })} style={field} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}><span style={label}>Amount</span>
                      <span style={{ ...field, display: "flex", alignItems: "center", gap: 4, borderColor: err && !(Number(r.amount) > 0) ? "#f04438" : "#d0d5dd" }}>
                        <span style={{ color: "#8a93a3" }}>₹</span>
                        <input inputMode="decimal" placeholder="0" value={r.amount} onChange={(e) => set(r.key, { amount: e.target.value.replace(/[^\d.]/g, "") })} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 15, fontWeight: 700, textAlign: "right", ...tabNum }} />
                      </span>
                    </label>
                    <button type="button" aria-label="Remove expense" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="ec-ghost" style={{ height: 42, borderRadius: 10, border: 0, background: "transparent", color: "#8a93a3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
                      <Icon d={IC.trash} />{desk ? "" : "Remove"}
                    </button>
                  </div>
                  {err && <span style={{ fontSize: 12, fontWeight: 600, color: "#b42318" }}>{err}</span>}
                </div>
              );
            })}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#5b6576" }}>Add row</span>
              {typeList.map((t) => (
                <button key={t} type="button" className="ec-ghost" onClick={() => setRows((rs) => [...rs, newRow(t, rs[rs.length - 1]?.date || todayIso)])} style={{ display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 12px", borderRadius: 99, border: "1px dashed #d0d5dd", background: "#fff", fontSize: 13, fontWeight: 600, color: "#344054", cursor: "pointer" }}>
                  <TypeDot type={t} />{t}
                </button>
              ))}
            </div>
          </div>

          <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Bills & receipts <span style={{ color: "#8a93a3", fontWeight: 500 }}>· {fileCount}</span></span>
              <button type="button" className="ec-link" onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 10, border: "1px solid #d0d5dd", background: "#fff", color: "#1d4ed8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><Icon d={IC.clip} />Attach photos or PDFs</button>
              <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} multiple onChange={pick} style={{ display: "none" }} />
            </div>
            <span style={{ fontSize: 12, color: "#8a93a3" }}>Photos or PDFs up to 10 MB each. They are attached to the whole claim in the ERP.</span>
            {claim && existing.status === "loading" && <span style={{ display: "flex", gap: 8, fontSize: 13, color: "#8a93a3" }}><Spinner />Reading attached bills…</span>}
            {(keptFiles.length > 0 || newFiles.length > 0) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {keptFiles.map((f) => (
                  <FileRow key={f.id} name={f.name} meta={sizeLabel(f.size) || "In the ERP"} onPreview={() => setPreview({ file: f })} onRemove={() => setRemoved((s) => new Set([...s, f.id]))} />
                ))}
                {newFiles.map((f, i) => (
                  <FileRow key={i + f.name} name={f.name} meta={`${sizeLabel(f.size)} · new`} isNew onPreview={() => setPreview({ file: { name: f.name, kind: f.type === "application/pdf" ? "pdf" : "image", local: f } })} onRemove={() => setNewFiles((fs) => fs.filter((x) => x !== f))} />
                ))}
              </div>
            )}
          </div>

          <label style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={label}>Remark for HR · optional</span>
            <textarea rows={2} placeholder="Anything HR should know — e.g. joint work with ABM" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: "100%", minHeight: 52, resize: "vertical", borderRadius: 10, border: "1px solid #d0d5dd", padding: 10, fontSize: 14 }} />
          </label>
          {error && <Note>{error}</Note>}
        </div>

        <div style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 12, position: desk ? "sticky" : "static", top: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#5b6576" }}>Total claimed</span>
            <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", ...tabNum }}>{inr(total)}</span>
            <span style={{ fontSize: 12, color: "#8a93a3" }}>{rows.length} {rows.length === 1 ? "row" : "rows"} · {fileCount} {fileCount === 1 ? "bill" : "bills"}</span>
          </div>
          {byType.length > 0 && <>
            <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "#eef1f5", gap: 2 }}>
              {byType.map(([t, v]) => <span key={t} style={{ width: (v / total) * 100 + "%", background: typeColor(t).c }} />)}
            </div>
            {byType.map(([t, v]) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><TypeDot type={t} /><span style={{ flex: 1, color: "#344054" }}>{t}</span><b style={{ fontWeight: 600, ...tabNum }}>{inr(v)}</b></div>
            ))}
          </>}
          <span style={{ fontSize: 12, color: "#8a93a3", textWrap: "pretty" }}>HR reviews the claim in the ERP and sets the sanctioned amount. You can edit it until HR acts on it.</span>
        </div>
      </div>
      {preview && <FilePreview conn={conn} file={preview.file} onClose={() => setPreview(null)} />}
    </Sheet>
  );
}

function FileRow({ name, meta, isNew, onPreview, onRemove }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 6px 6px 12px", borderRadius: 10, background: isNew ? "#eef3fe" : "#f7f8fa" }}>
      <span style={{ color: "#475467", display: "flex" }}><Icon d={IC.file} /></span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 13, fontWeight: 600, ...ell }}>{name}</span>
        <span style={{ fontSize: 11, color: "#8a93a3" }}>{meta}</span>
      </span>
      <button type="button" aria-label={`Preview ${name}`} className="ec-link" onClick={onPreview} style={{ ...btn.icon, width: 34, height: 34, color: "#1d4ed8" }}><Icon d={IC.eye} /></button>
      <button type="button" aria-label={`Remove ${name}`} className="ec-ghost" onClick={onRemove} style={{ ...btn.icon, width: 34, height: 34, color: "#b42318" }}><Icon d={IC.x} /></button>
    </div>
  );
}
