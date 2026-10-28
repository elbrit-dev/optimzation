"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useClaims } from "./data/useClaims";
import { Icon, ell, tabNum } from "./ui";
import { BillSheet } from "./sheets";
import { MON, cashOf, inr, isoDay, ledger, typeColor } from "./model";

/* The Home page's Expense section, between the greeting and Visits: one
 * Settle bar --
 *
 *   Settle  cash in hand (what is left of the advances Accounts paid, less
 *           the verified bills since) or, below zero, what is owed to the
 *           person, and this week's bills; filled to what is left of the
 *           cash. The camera opens "Add a bill" (BillSheet) -- photo, AI
 *           reads it, the AI check decides it.
 *
 * (Food -- a monthly limit for RBM and above -- will show inside this bar as
 * a small progress line later; Food and Stay rows are gone.)
 *
 * Tapping the bar fires onOpen -- one event, for the page to redirect to the
 * Settlements page. Reads the same cached claims the Settlements page does. */

const CSS = `
@media (hover:hover) and (pointer:fine){
.ec-ov .ec-row:hover{box-shadow:0 0 0 1px #b2c8f7,0 8px 20px -14px rgba(37,99,235,.5)!important}
.ec-ov .ec-act:hover{background:#1d4ed8!important}
}`;

const RECEIPT = "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1zM16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 17.5v-11";
const CAMERA = "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";

const SAMPLE = { cash: { balance: 1940, added: 10000, over: 0 }, bills: 2 };

export default function ClaimsStrip({ url, token, employee, today = new Date(), pad = "16px", sample = false, desk = false, onOpen }) {
  const data = useClaims({ url, token, employee });
  const [form, setForm] = useState(false); // "Add a bill" open
  const [toast, setToast] = useState(null);
  const tt = useRef(null);
  useEffect(() => () => clearTimeout(tt.current), []);
  const saved = ({ name, message }) => {
    setForm(false);
    data.reload();
    setToast(`${message || "Saved"} · ${name}`);
    clearTimeout(tt.current);
    tt.current = setTimeout(() => setToast(null), 3500);
  };

  const view = useMemo(() => {
    if (sample) return SAMPLE;
    if (data.status !== "ready") return null;
    // This week's bills: Monday to today, on the running claims.
    const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
    const from = isoDay(mon), to = isoDay(today);
    const bills = ledger(data.claims, data.advances).entries.filter((e) => e.kind === "bill" && e.date >= from && e.date <= to).length;
    return { cash: cashOf(data.claims, data.advances), bills };
  }, [sample, data.status, data.claims, data.advances, today]);

  if (!view || (!sample && (!url || !token))) return null;
  const canAdd = sample || (data.conn && data.me);
  const { cash } = view;
  const cashC = typeColor("Advance");
  const cashPct = cash.added && !cash.over ? Math.min(100, (cash.balance / cash.added) * 100) : 0;
  const tint = (c) => `color-mix(in srgb,${c} 16%,#fff)`;
  const row = { position: "relative", display: "flex", alignItems: "center", gap: 8, borderRadius: 14, boxShadow: "0 0 0 1px #e4e7ec", overflow: "hidden", transition: "box-shadow .2s" };

  return (
    <section className="ec-ov" style={{ padding: `14px ${pad} 0`, display: "flex", flexDirection: "column", gap: 8 }}>
      <style>{CSS}</style>
      {/* Same eyebrow as the home page's other sections. */}
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#5b6576" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: cashC.c }} />Expense · {MON[today.getMonth()]}
      </span>
      <div className="ec-row" style={{ ...row, minHeight: 60, padding: "0 8px 0 14px", maxWidth: desk ? 520 : undefined, background: `linear-gradient(90deg,${tint(cashC.c)} ${cashPct}%,#fff ${cashPct}%)` }}>
        <button type="button" onClick={onOpen} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, minHeight: 60, border: 0, padding: 0, background: "transparent", cursor: "pointer", textAlign: "left" }}
          aria-label={`Settle: ${cash.over ? `${inr(cash.over)} owed to you` : `${inr(cash.balance)} in hand`}, ${view.bills} bills this week. Open settlements`}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#5b6576" }}><span style={{ color: cashC.c, display: "flex" }}><Icon d={RECEIPT} size={15} /></span>Settle</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", whiteSpace: "nowrap", color: cash.over ? "#b42318" : "#0b1220", ...tabNum }}>{inr(cash.over || cash.balance)}</span>
            <span style={{ fontSize: 12, color: "#8a93a3", ...ell }}>{cash.over ? "owed to you" : "in hand"} · {view.bills} {view.bills === 1 ? "bill" : "bills"}{cash.checking ? ` · ${inr(cash.checking)} checking` : ""}</span>
          </span>
        </button>
        <button type="button" className="ec-act" onClick={() => canAdd && !sample && setForm(true)} aria-label="Add a bill" title="Add a bill"
          style={{ flex: "none", width: 44, height: 44, borderRadius: 14, border: 0, background: "#2563eb", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", transition: "background .18s" }}><Icon d={CAMERA} size={20} /></button>
      </div>

      {form && <BillSheet conn={data.conn} me={data.me} claims={data.claims} advances={data.advances} today={today} desk={desk} onClose={() => setForm(false)} onSaved={saved} onChecked={data.reload} />}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: desk ? 32 : 96, transform: "translateX(-50%)", zIndex: 95, maxWidth: "calc(100vw - 32px)", padding: "11px 18px", borderRadius: 10, background: "#101828", color: "#fff", fontSize: 13, fontWeight: 500, boxShadow: "0 12px 30px -10px rgba(16,24,40,.5)" }}>{toast}</div>
      )}
    </section>
  );
}
