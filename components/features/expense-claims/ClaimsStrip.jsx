"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useClaims } from "./data/useClaims";
import { ClaimForm, IC, Icon, Spinner, tabNum } from "./ui";
import { MON, inr, monthKey, statusOf, totals } from "./model";

/* The Home page's claims strip: this month's claims as a ticker. "+" opens
   the claim form right here, on the page the strip sits on, and saves it to
   the ERP. Anywhere else on the strip fires onOpen -- one event, for the page
   to redirect with. Reads the same cached claims the Claims page does, as the
   signed-in user's token. */

const STRIP_CSS = `
@keyframes ec-marq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media (hover:hover) and (pointer:fine){
.ec-strip:hover{box-shadow:0 0 0 1px #b2c8f7,0 10px 24px -16px rgba(37,99,235,.55)!important}
.ec-strip .ec-marq:hover{animation-play-state:paused!important}
.ec-strip .ec-plus:hover{background:#eef3fe!important}
}
@media (prefers-reduced-motion:reduce){.ec-strip .ec-marq{animation:none!important}}`;

export default function ClaimsStrip({ url, token, employee, today = new Date(), pad = "16px", sample = false, desk = false, onOpen }) {
  const data = useClaims({ url, token, employee });
  const key = monthKey(today);
  const mon = MON[today.getMonth()];
  const [form, setForm] = useState(false);
  const [toast, setToast] = useState(null);
  const tt = useRef(null);
  useEffect(() => () => clearTimeout(tt.current), []);
  const saved = ({ name, edited, warning }) => {
    setForm(false);
    data.reload();
    setToast(warning ? { m: warning, error: true } : { m: `${name} ${edited ? "updated" : "sent to HR"}` });
    clearTimeout(tt.current);
    tt.current = setTimeout(() => setToast(null), 3500);
  };

  const items = useMemo(() => {
    if (sample) return [{ dot: "#0b1220", a: "₹4,860 claimed", b: `${mon} · 6 rows` }, { dot: "#d97706", a: "₹2,350 with hr", b: "1 claim" }, { dot: "#2563eb", a: "₹2,510 approved · unpaid", b: "1 claim" }];
    if (data.status !== "ready") return [];
    const T = totals(data.claims, (l) => l.date.slice(0, 7) === key);
    const out = [{ dot: "#0b1220", a: `${inr(T.claimed)} claimed`, b: `${mon} · ${T.rows} ${T.rows === 1 ? "row" : "rows"}` }];
    if (T.sanctioned) out.push({ dot: "#2563eb", a: `${inr(T.sanctioned)} sanctioned`, b: "paid with salary" });
    for (const s of ["Draft", "Unpaid", "Paid", "Rejected"]) {
      const b = T.byStatus[s];
      if (b?.n) out.push({ dot: statusOf(s).dot, a: `${inr(b.amount)} ${statusOf(s).label.toLowerCase()}`, b: `${b.n} ${b.n === 1 ? "claim" : "claims"}` });
    }
    if (!T.rows) out.push({ dot: "#98a2b3", a: "Nothing filed yet", b: "tap + to add today's expenses" });
    return out;
  }, [sample, data.status, data.claims, key, mon]);

  /* Nothing until the claims are in: claims are open only to whoever
     canUseClaims lets in, and a loading strip that then vanishes would flash on
     everyone else's home page. */
  if (!sample && (!url || !token || data.status !== "ready")) return null;
  const loop = items.length > 1 ? [...items, ...items] : items;

  return (
    <div style={{ padding: `10px ${pad} 0` }}>
      <style>{STRIP_CSS}</style>
      <div className="ec-strip" style={{ display: "flex", alignItems: "stretch", height: 48, borderRadius: 14, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec", overflow: "hidden", transition: "box-shadow .2s" }}>
        <button type="button" onClick={onOpen} aria-label="Open this month's claims" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "stretch", border: 0, padding: 0, background: "transparent", cursor: "pointer", textAlign: "left" }}>
          <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 14px", background: "#0b1220", color: "#fff", fontSize: 13, fontWeight: 600 }}>
            <Icon d={IC.wallet} size={17} sw={1.8} />Claims<span style={{ fontWeight: 500, color: "#98a2b3" }}>{mon}</span>
          </span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", WebkitMaskImage: "linear-gradient(90deg,transparent,#000 20px,#000 calc(100% - 20px),transparent)", maskImage: "linear-gradient(90deg,transparent,#000 20px,#000 calc(100% - 20px),transparent)" }}>
            {!sample && data.status !== "ready" ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, height: "100%", padding: "0 22px", fontSize: 13, color: "#8a93a3" }}><Spinner size={12} />Reading your claims…</span>
            ) : (
              <span className="ec-marq" style={{ display: "flex", width: "max-content", height: "100%", alignItems: "center", animation: items.length > 1 ? `ec-marq ${Math.max(20, items.length * 9)}s linear infinite` : "none" }}>
                {loop.map((t, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 22px", fontSize: 13, whiteSpace: "nowrap", color: "#5b6576" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot }} />
                    <span style={{ fontWeight: 600, color: "#0b1220", ...tabNum }}>{t.a}</span><span>{t.b}</span>
                  </span>
                ))}
              </span>
            )}
          </span>
        </button>
        <button type="button" className="ec-plus" onClick={() => { if (!sample && data.conn && data.me) setForm(true); }} aria-label="New expense claim" title="New claim" style={{ flex: "none", width: 52, border: 0, padding: 0, background: "transparent", boxShadow: "inset 1px 0 0 #eef1f5", display: "grid", placeItems: "center", cursor: "pointer" }}>
          <span style={{ width: 32, height: 32, borderRadius: 10, background: "#2563eb", color: "#fff", display: "grid", placeItems: "center", boxShadow: "0 4px 10px -4px rgba(37,99,235,.7)" }}><Icon d={IC.plus} sw={2.4} /></span>
        </button>
      </div>
      {form && <ClaimForm conn={data.conn} me={data.me} types={data.types} today={today} desk={desk} onClose={() => setForm(false)} onSaved={saved} />}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: desk ? 32 : 96, transform: "translateX(-50%)", zIndex: 95, maxWidth: "calc(100vw - 32px)", padding: "11px 18px", borderRadius: 10, background: toast.error ? "#b42318" : "#101828", color: "#fff", fontSize: 13, fontWeight: 500, boxShadow: "0 12px 30px -10px rgba(16,24,40,.5)" }}>{toast.m}</div>
      )}
    </div>
  );
}
