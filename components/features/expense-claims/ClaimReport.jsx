"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Router from "next/router";
import { useClaims } from "./data/useClaims";
import { fetchFileBlob } from "./data/claimsApi";
import { CSS, FONT_HREF, Highlights, IC, Icon, Note, Sheet, Spinner, btn, card, ell, tabNum } from "./ui";
import { BillSheet, CashSheet } from "./sheets";
import { BILL_STATE, MON, WD, billState, dateOf, inr, ledger, monthKey, monthLabel, shortDate, weeksOf } from "./model";

/* Expense claims -- the claims prototype's Settlements screen, in the app's
 * theme, on the settlement model (Miscellaneous, 27 Oct 2026):
 *
 *   Cash card     what is in hand -- what is left of the cash Accounts paid
 *                 (Employee Advance) less the verified bills since -- or, below
 *                 zero, what is owed to the person, as Paid to you -> Verified
 *                 bills -> In hand / Owed, plus bills still being checked and
 *                 cash asked for. "Scan a bill", "Request cash". Verified is
 *                 final for now: nothing is booked (no Accounts Payable) --
 *                 Accounts settle what is owed later.
 *   Highlights    the month: verified, cash paid, bills, AI-verified share.
 *   Bills & cash  the month's bills and cash, newest first by week. Each bill
 *                 shows its own status (Checking / Verified / Accounts
 *                 checking / Rejected) and opens its detail.
 *
 * A bill counts once it is Verified: the AI check at once (90+), or Accounts.
 * The next cash payment settles the open bills -- they come out of it first.
 *
 * Reads the ERP as the signed-in user (url + token). The month pill steps
 * back through months with bills or cash. ?new=1 (or newClaim) opens "Add a
 * bill". Claims of the old flow are under "All past claims". */

function useWidth(ref) {
  const [w, setW] = useState(1024);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export function go(to) {
  if (!to) return;
  const hard = () => { if (typeof window !== "undefined") window.location.assign(to); };
  try { Router.push(to)?.catch?.(hard); } catch { hard(); }
}

const kicker = { display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#5b6576" };
const ADV = "#7c3aed";
const link = { display: "flex", alignItems: "center", gap: 5, height: 36, padding: "0 8px", borderRadius: 8, border: 0, background: "transparent", color: "#2563eb", fontSize: 13.5, fontWeight: 600, cursor: "pointer" };

/* One step of the money flow: Paid to you > Verified bills > In hand. */
function Step({ k, v, color, soft, dashed, small }) {
  return (
    <span style={{ flex: "1 0 auto", minWidth: 86, display: "flex", flexDirection: "column", gap: 2, padding: "10px 11px 9px", borderRadius: 14, background: soft || "#f4f5f7", boxShadow: dashed ? "inset 0 0 0 1.5px #fedf89" : "none" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: dashed ? "#b54708" : "#667085" }}>{k}</span>
      <b style={{ fontSize: 15, fontWeight: 700, color: color || "#0b1220", whiteSpace: "nowrap", ...tabNum }}>{v}</b>
      {small && <span style={{ fontSize: 10, fontWeight: 700, color: "#b54708" }}>{small}</span>}
    </span>
  );
}
const arrow = (k) => <span key={k} aria-hidden style={{ alignSelf: "center", color: "#c0c5cf", display: "flex", flex: "none" }}><Icon d={IC.next} size={14} /></span>;

/* One line of the ledger: a bill (−), cash paid (+), cash asked for, or a pay-back. */
function Entry({ e, onOpen }) {
  const dt = dateOf(e.date);
  const day = (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1, gap: 3 }}>
      <span style={{ fontSize: 17, fontWeight: 700, ...tabNum }}>{dt.getDate()}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: "#8a93a3", textTransform: "uppercase" }}>{WD[dt.getDay()]}</span>
    </span>
  );
  const rowStyle = { width: "100%", display: "grid", gridTemplateColumns: "40px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "10px 4px", border: 0, borderTop: "1px solid #eef1f5", borderRadius: 10, background: "transparent", textAlign: "left" };
  const after = e.bal < 0 ? `owed ${inr(-e.bal)}` : `${inr(e.bal)} in hand`;
  if (e.kind !== "bill") {
    const req = e.kind === "request";
    const title = req ? "Cash requested" : e.kind === "payout" ? "Paid back by Accounts" : "Cash from Accounts";
    return (
      <div style={{ ...rowStyle, opacity: req ? 0.85 : 1 }}>
        {day}
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 600, ...ell }}>{title}</span>
          <span style={{ display: "block", fontSize: 12, color: "#5b6576", ...ell }}>{e.note}{req ? " · waiting for Accounts" : ""}</span>
        </span>
        <span style={{ textAlign: "right" }}>
          <b style={{ display: "block", fontSize: 15, color: req ? "#b54708" : "#067647", whiteSpace: "nowrap", ...tabNum }}>+ {inr(e.amount)}</b>
          <span style={{ fontSize: 11, color: "#8a93a3", whiteSpace: "nowrap" }}>{req ? "paid once approved" : after}</span>
        </span>
      </div>
    );
  }
  const st = billState(e.claim, e.line);
  const counted = e.state === "Verified";
  return (
    <button type="button" className="ec-ghost" onClick={onOpen} style={{ ...rowStyle, cursor: "pointer" }}>
      {day}
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 600, ...ell }}>{e.line.note || e.line.type}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: st.tone, minWidth: 0 }}>
          <span style={{ flex: "none", display: "flex" }}><Icon d={IC[st.icon]} size={12} /></span><span style={{ minWidth: 0, ...ell }}>{st.text}{st.where ? <span style={{ color: "#8a93a3", fontWeight: 500 }}> · {st.where}</span> : null}</span>
        </span>
      </span>
      <span style={{ textAlign: "right" }}>
        <b style={{ display: "block", fontSize: 15, whiteSpace: "nowrap", color: e.state === "Rejected" ? "#98a2b3" : "#0b1220", textDecoration: e.state === "Rejected" ? "line-through" : "none", ...tabNum }}>− {inr(e.amount)}</b>
        <span style={{ fontSize: 11, whiteSpace: "nowrap", color: counted && e.bal < 0 ? "#b42318" : "#8a93a3" }}>{counted ? after : e.state === "Rejected" ? "not counted" : "not counted yet"}</span>
      </span>
    </button>
  );
}

/* A bill, opened: what it is, its status in full, the AI's reading,
   Accounts' note, and the photo. */
function BillDetail({ conn, e, onClose }) {
  const [opening, setOpening] = useState(false);
  const [err, setErr] = useState("");
  const l = e.line;
  const st = BILL_STATE[e.state] || BILL_STATE.Checking;
  const explain = {
    Checking: "The AI has not finished checking this bill yet. It counts once it is verified.",
    Verified: "The bill matches what you entered. It counts towards your settlement.",
    "In Review": "The AI could not confirm this bill, so Accounts are checking it by hand. It counts once they verify it.",
    Rejected: "Accounts did not accept this bill. It does not count.",
  }[e.state] || "";
  const view = async () => {
    setOpening(true);
    setErr("");
    try {
      const blob = await fetchFileBlob(conn, l.bill);
      const u = URL.createObjectURL(blob);
      window.open(u, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(u), 60000);
    } catch (x) {
      setErr(x.message);
    }
    setOpening(false);
  };
  const row = (k, v) => v ? <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", fontSize: 14, borderTop: "1px solid #eef1f5" }}><span style={{ color: "#5b6576" }}>{k}</span><b style={{ textAlign: "right", ...tabNum }}>{v}</b></div> : null;
  return (
    <Sheet title={l.note || "Bill"} sub={`${shortDate(l.date)} · ${e.claim.id}`} onClose={onClose} desktop="dialog" maxWidth={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 20px 22px" }}>
        <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", ...tabNum }}>{inr(l.amount)}</span>
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 14, background: `color-mix(in srgb,${st.tone} 9%,#fff)` }}>
          <span style={{ color: st.tone, display: "flex", flex: "none", marginTop: 1 }}><Icon d={IC[st.icon]} size={18} /></span>
          <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <b style={{ fontSize: 14, color: st.tone }}>{st.text}</b>
            <span style={{ fontSize: 13, color: "#475467", lineHeight: 1.45 }}>{explain}</span>
          </span>
        </div>
        {l.review && <Note tone={e.state === "Rejected" ? "error" : "info"}>Accounts: {l.review}</Note>}
        <div style={{ ...card, padding: "0 14px" }}>
          {row("AI score", l.ai?.score != null ? `${Math.round(l.ai.score)} / 100` : null)}
          {row("AI says", l.ai?.reason)}
          {row("On the bill", [l.ai?.amount ? inr(l.ai.amount) : null, l.ai?.date ? shortDate(l.ai.date) : null, l.ai?.vendor].filter(Boolean).join(" · ") || null)}
          {row("Status", e.claim.docstatus === 1 ? "Settled" : "In your open bills")}
        </div>
        {l.bill && (
          <button type="button" className="ec-ghost" disabled={opening} onClick={view} style={{ ...btn.ghost, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {opening ? <Spinner size={14} /> : <Icon d={IC.eye} size={16} />}View the bill
          </button>
        )}
        {err && <Note>{err}</Note>}
      </div>
    </Sheet>
  );
}

export default function ClaimReport({
  url, token, employee, asOf, viewport = "auto", newClaim = false,
  homePath = "/", historyPath = "/my-profile?tab=claims", onBack, onOpenHistory, className,
}) {
  const rootRef = useRef(null);
  const w = useWidth(rootRef);
  const isDesk = viewport === "desktop" || (viewport === "auto" && w >= 768);
  // Wide desktop: cash on the left (stays in view), bills & cash on the right.
  const wide = isDesk && (viewport === "desktop" || w >= 1024);
  const today = useMemo(() => { const d = asOf ? new Date(asOf) : new Date(); return isNaN(d) ? new Date() : d; }, [asOf]);
  const cur = monthKey(today);

  const data = useClaims({ url, token, employee });
  const { conn, me, claims = [], advances = [] } = data;

  const L = useMemo(() => ledger(claims, advances), [claims, advances]);
  const months = useMemo(() => {
    const set = new Set([cur]);
    for (const e of L.entries) if (e.date && e.date.slice(0, 7) <= cur) set.add(e.date.slice(0, 7));
    return [...set].sort();
  }, [L, cur]);
  const [month, setMonth] = useState(cur);
  const mi = months.indexOf(month);

  const [bill, setBill] = useState(null);
  const [sheet, setSheet] = useState(null); // "bill" | "cash"
  const [toast, setToast] = useState(null);
  const tt = useRef(null);
  const say = (m, tone = "ok") => { setToast({ m, tone }); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(null), 3200); };
  useEffect(() => () => clearTimeout(tt.current), []);

  /* ?new=1 (or newClaim) opens "Add a bill" once; the query is then dropped
     so a refresh does not reopen it. */
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || data.status !== "ready") return;
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    if (newClaim || q?.get("new") === "1") {
      asked.current = true;
      setSheet("bill");
      if (q?.get("new")) { q.delete("new"); const s = q.toString(); window.history.replaceState(null, "", window.location.pathname + (s ? "?" + s : "")); }
    }
  }, [data.status, newClaim]);

  const isCur = month === cur;
  const inMonth = L.entries.filter((e) => e.date.slice(0, 7) === month);
  const bills = inMonth.filter((e) => e.kind === "bill");
  const [y, m] = month.split("-").map(Number);
  const weeks = useMemo(() => weeksOf(month)
    .filter((wk) => !isCur || wk.from <= today.getDate())
    .map((wk) => {
      const es = inMonth.filter((e) => { const n = +e.date.slice(8, 10); return n >= wk.from && n <= wk.to; }).reverse();
      const bs = es.filter((e) => e.kind === "bill");
      return { ...wk, es, total: bs.reduce((s, e) => s + e.amount, 0), n: bs.length, now: isCur && wk.from <= today.getDate() && today.getDate() <= wk.to };
    })
    .filter((wk) => wk.es.length || wk.now)
    .reverse(), [month, inMonth, isCur, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const hl = useMemo(() => {
    const out = [];
    const verified = bills.filter((e) => e.state === "Verified");
    if (verified.length) out.push({ key: "paid", value: inr(verified.reduce((s, e) => s + e.amount, 0)), label: "verified · counted", tone: "ok" });
    const added = inMonth.filter((e) => e.kind === "topup").reduce((s, e) => s + e.amount, 0);
    if (added) out.push({ key: "added", value: inr(added), label: "cash from Accounts", tone: "settle" });
    if (bills.length) out.push({ key: "bills", value: `${bills.length} ${bills.length === 1 ? "bill" : "bills"}`, label: `${inr(bills.reduce((s, e) => s + e.amount, 0))} this month`, tone: "field" });
    const decided = bills.filter((e) => e.state !== "Checking");
    if (decided.length) {
      const clean = decided.filter((e) => e.line.ai?.score >= 90).length;
      out.push({ key: "ai", value: `${clean}/${decided.length}`, label: `AI verified · ${decided.length - clean} by Accounts`, tone: "ok", pct: clean / decided.length });
    }
    return out;
  }, [bills, inMonth]);

  const openHistory = () => (onOpenHistory ? onOpenHistory() : go(historyPath));
  const back = () => (onBack ? onBack() : go(homePath));
  const pad = isDesk ? 32 : 16;
  const saved = ({ name, message }) => {
    setSheet(null);
    data.reload();
    say(`${message || "Saved"} · ${name}`);
  };

  const over = L.over, has = L.added > 0 || L.balance > 0;
  const say1 = over
    ? <>{inr(over)} of verified bills is owed to you — Accounts settle it with you later.</>
    : has
      ? <>Left of the cash Accounts paid you. Bills you add come out of it once they are verified.</>
      : <>No cash from Accounts yet. Add your bills as you spend — you are paid back once they are verified — or request cash up front.</>;

  return (
    <div ref={rootRef} className={"ec-root" + (className ? " " + className : "")} style={{ background: "#f4f5f7", width: "100%", minHeight: "100%" }}>
      <link rel="stylesheet" href={FONT_HREF} />
      <style>{CSS}</style>
      <main style={{ display: "flex", flexDirection: "column", gap: 16, padding: `${isDesk ? 20 : 12}px ${pad}px ${isDesk ? 64 : 28}px`, maxWidth: wide ? 1200 : 760, margin: "0 auto", boxSizing: "border-box", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" aria-label="Back" className="ec-ghost" onClick={back} style={{ ...btn.icon, width: 40, height: 40, borderRadius: 12, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec", color: "#344054" }}><Icon d={IC.back} size={18} /></button>
          <span style={{ flex: 1, minWidth: 0, fontSize: isDesk ? 24 : 21, fontWeight: 700, letterSpacing: "-0.02em", ...ell }}>Settlements</span>
          <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 2, height: 36, padding: "0 4px", borderRadius: 99, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec" }}>
            <button type="button" aria-label="Previous month" disabled={mi <= 0} onClick={() => setMonth(months[mi - 1])} style={{ ...btn.icon, width: 28, height: 28, opacity: mi <= 0 ? 0.3 : 1 }}><Icon d={IC.back} size={14} /></button>
            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{MON[m - 1]} {y}</span>
            <button type="button" aria-label="Next month" disabled={mi >= months.length - 1} onClick={() => setMonth(months[mi + 1])} style={{ ...btn.icon, width: 28, height: 28, opacity: mi >= months.length - 1 ? 0.3 : 1 }}><Icon d={IC.next} size={14} /></button>
          </span>
        </div>

        {data.status === "idle" && <Note tone="info">Pass the ERP GraphQL URL and the signed-in user’s token to load claims.</Note>}
        {data.status === "error" && <Note>{data.error}</Note>}
        {data.status === "hidden" && <Note tone="info">Expense claims are not open for your role yet.</Note>}
        {data.status === "loading" && <div aria-busy="true" style={{ ...card, height: 260, display: "grid", placeItems: "center" }}><Spinner size={24} /></div>}

        {data.status === "ready" && <div style={wide ? { display: "grid", gridTemplateColumns: "minmax(0,420px) minmax(0,1fr)", gap: 20, alignItems: "start" } : { display: "contents" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0, ...(wide ? { position: "sticky", top: 16 } : null) }}>
          <section style={{ ...card, padding: isDesk ? "20px 22px" : "16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={kicker}><span style={{ width: 6, height: 6, borderRadius: "50%", background: ADV }} />{over ? "Owed to you" : "Cash in hand"}</span>
              {data.refreshing ? <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8a93a3" }}><Spinner size={12} />Updating</span>
                : L.checking > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: "#fffaeb", color: "#b54708" }}>{inr(L.checking)} being checked</span>}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: isDesk ? 44 : 40, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: over ? "#b42318" : "#0b1220", ...tabNum }}>{inr(over || L.balance)}</span>
              <span style={{ fontSize: 14, color: "#5b6576" }}>{over ? "owed to you" : "in hand"}</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: "#344054" }}>{say1}</p>
            <div className="ec-rail" role="group" aria-label="Your settlement" style={{ display: "flex", alignItems: "stretch", gap: 4, overflowX: "auto" }}>
              <Step k="Paid to you" v={`+ ${inr(L.added)}`} color="#067647" />{arrow("a1")}
              <Step k="Verified bills" v={`− ${inr(L.spent)}`} />{arrow("a2")}
              <Step k={over ? "Owed to you" : "In hand"} v={inr(over || L.balance)} color={over ? "#b42318" : undefined} />
              {L.checking > 0 && <Step k="Being checked" v={inr(L.checking)} color="#b54708" soft="#fffaeb" dashed small="not counted yet" />}
              {L.requested > 0 && <Step k="Requested" v={`+ ${inr(L.requested)}`} color="#b54708" soft="#fffaeb" dashed small="waiting for Accounts" />}
            </div>
            <button type="button" className="ec-cta" onClick={() => setSheet("bill")} style={{ ...btn.primary, height: 52, borderRadius: 14, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 2 }}><Icon d={IC.camera} size={20} />Scan a bill</button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#c0c5cf" }}>
              <button type="button" className="ec-link" onClick={() => setSheet("cash")} style={link}><Icon d={IC.wallet} size={14} />Request cash</button>
            </div>
          </section>

          {hl.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#5b6576" }}>Highlights · {monthLabel(month).split(" ")[0]}</span>
              <Highlights items={hl} bleed={wide ? "0px" : pad + "px"} />
            </section>
          )}
          </div>

          <section style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#5b6576" }}>Bills &amp; cash</span>
            <div style={{ ...card, padding: "4px 14px 10px" }}>
              {weeks.map((wk) => (
                <div key={wk.from}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 2px 4px" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: wk.now ? "#1d4ed8" : "#0b1220" }}>{wk.from} – {wk.to} {MON[m - 1]}{wk.now ? " · this week" : ""}</span>
                    <span style={{ fontSize: 12, color: "#8a93a3", ...tabNum }}>{wk.n ? `${wk.n} ${wk.n === 1 ? "bill" : "bills"} · ${inr(wk.total)}` : "no bills yet"}</span>
                  </div>
                  {wk.es.map((e, i) => <Entry key={`${e.kind}|${e.line?.id || e.adv?.id || e.claim?.id}|${i}`} e={e} onOpen={() => setBill(e)} />)}
                </div>
              ))}
              {!inMonth.length && (
                <div style={{ padding: "22px 8px 12px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>{isCur ? "No bills yet this month — scan one above." : `No bills for ${monthLabel(month)}.`}</div>
              )}
            </div>
            <button type="button" className="ec-link" onClick={openHistory} style={{ alignSelf: "flex-start", height: 32, padding: "0 8px", borderRadius: 8, border: 0, background: "transparent", color: "#1d4ed8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>All past claims →</button>
          </section>
        </div>}
      </main>

      {bill && <BillDetail conn={conn} e={bill} onClose={() => setBill(null)} />}
      {sheet === "bill" && conn && me && <BillSheet conn={conn} me={me} claims={claims} advances={advances} today={today} desk={isDesk} onClose={() => setSheet(null)} onSaved={saved} onChecked={data.reload} />}
      {sheet === "cash" && conn && me && <CashSheet conn={conn} me={me} claims={claims} advances={advances} today={today} desk={isDesk} onClose={() => setSheet(null)} onSaved={saved} />}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: isDesk ? 32 : 96, transform: "translateX(-50%)", zIndex: 95, maxWidth: "calc(100vw - 32px)", padding: "11px 18px", borderRadius: 10, background: toast.tone === "error" ? "#b42318" : "#101828", color: "#fff", fontSize: 13, fontWeight: 500, boxShadow: "0 12px 30px -10px rgba(16,24,40,.5)" }}>{toast.m}</div>
      )}
    </div>
  );
}
