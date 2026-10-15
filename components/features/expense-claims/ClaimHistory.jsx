"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useClaims } from "./data/useClaims";
import { CSS, Chip, ClaimForm, DayCard, DaySheet, FONT_HREF, IC, Icon, Note, Spinner, TypeDot, btn, card, ell, tabNum } from "./ui";
import { MON, MONTH, claimMonth, fyLabel, fyOf, groupDays, inr, kInr, monthKey, spanOf, statusOf, totals, typeColor } from "./model";

/* Expense & claims -- the profile tab for past claims.
 *
 * Every Expense Claim on the person's Employee record, read as their own
 * token: totals, a month-by-month chart, the split by claim type, and the
 * claims month by month, each opening day by day with its bills. Nothing is
 * approved here; the status is HR's, from the ERP. A claim still With HR can
 * be edited from its day sheet. This month's filing lives on the Claims page
 * (claimsPath). */

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

const STATUS_CHOICES = ["Draft", "Unpaid", "Paid", "Rejected", "Cancelled"];
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function ClaimHistory({ url, token, employee, asOf, claimsPath, onOpenClaims, embedded = false, className }) {
  const rootRef = useRef(null);
  const w = useWidth(rootRef);
  const isDesk = w >= 720;
  const today = useMemo(() => { const d = asOf ? new Date(asOf) : new Date(); return isNaN(d) ? new Date() : d; }, [asOf]);
  const curFy = fyOf(monthKey(today));

  const data = useClaims({ url, token, employee });
  const { conn, me, claims = [], types } = data;

  const fys = useMemo(() => [...new Set([curFy, ...claims.map((c) => fyOf(claimMonth(c) || monthKey(today)))])].sort((a, b) => b - a), [claims, curFy]); // eslint-disable-line react-hooks/exhaustive-deps
  const [range, setRange] = useState(String(curFy));
  /* Open on this FY, or on the latest FY with claims when this one has none
     yet -- April, or someone whose last claim was in March. Once only, so a
     range the reader picks is never overridden. */
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current || data.status !== "ready") return;
    settled.current = true;
    const years = claims.map((c) => fyOf(claimMonth(c))).filter(Number.isFinite);
    if (years.length && !years.includes(curFy)) setRange(String(Math.max(...years)));
  }, [data.status, claims, curFy]);
  const [month, setMonth] = useState(null);
  const [status, setStatus] = useState(null);
  const [typeSel, setTypeSel] = useState([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("new");
  const [panel, setPanel] = useState(false);
  const [openM, setOpenM] = useState(undefined);
  const [shown, setShown] = useState(8);
  const [day, setDay] = useState(null);
  const [form, setForm] = useState(null);
  const [note, setNote] = useState(null);

  const inRange = (c) => {
    const k = claimMonth(c);
    if (range === "all") return true;
    if (range === "l6") {
      const d = new Date(today.getFullYear(), today.getMonth() - 5, 1);
      return k >= monthKey(d);
    }
    return fyOf(k) === Number(range);
  };
  const needle = q.trim().toLowerCase();
  const matchQ = (c) => !needle || c.id.toLowerCase().includes(needle) || c.remark.toLowerCase().includes(needle) || c.lines.some((l) => l.note.toLowerCase().includes(needle) || l.type.toLowerCase().includes(needle));
  const matchT = (c) => !typeSel.length || c.lines.some((l) => typeSel.includes(l.type));
  const pool = claims.filter((c) => inRange(c) && matchQ(c) && matchT(c));
  const base = pool.filter((c) => !month || claimMonth(c) === month);
  const rows = base.filter((c) => !status || c.status === status);
  const keepType = (l) => !typeSel.length || typeSel.includes(l.type);
  const T = totals(rows, keepType);
  const cancelled = rows.filter((c) => c.status === "Cancelled" || c.status === "Rejected");

  /* Months on the chart: every month of the period, so a gap reads as a gap. */
  const chartMonths = useMemo(() => {
    const keys = new Set(pool.map(claimMonth));
    if (range !== "all" && range !== "l6") {
      const y = Number(range);
      for (let i = 0; i < 12; i++) { const d = new Date(y, 3 + i, 1); const k = monthKey(d); if (k <= monthKey(today)) keys.add(k); }
    }
    return [...keys].filter(Boolean).sort();
  }, [pool, range, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const mAgg = chartMonths.map((k) => {
    const t = totals(pool.filter((c) => claimMonth(c) === k), keepType);
    return { k, cl: t.claimed, sa: t.sanctioned };
  });
  const mMax = Math.max(1, ...mAgg.map((x) => x.cl));
  const typeRows = Object.entries(T.byType).sort((a, b) => b[1] - a[1]);
  const typeSum = typeRows.reduce((s, [, v]) => s + v, 0) || 1;

  const groups = useMemo(() => {
    const g = new Map();
    for (const c of rows) { const k = claimMonth(c); if (!g.has(k)) g.set(k, []); g.get(k).push(c); }
    const list = [...g.entries()].map(([k, cs]) => ({ k, cs, t: totals(cs, keepType) }));
    return sort === "old" ? list.sort((a, b) => a.k.localeCompare(b.k)) : sort === "amt" ? list.sort((a, b) => b.t.claimed - a.t.claimed) : list.sort((a, b) => b.k.localeCompare(a.k));
  }, [rows, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const openKey = openM === undefined ? groups[0]?.k : openM;

  const rangeLabel = range === "all" ? "All time" : range === "l6" ? "Last 6 months" : fyLabel(Number(range));
  const nFilters = (status ? 1 : 0) + typeSel.length + (month ? 1 : 0) + (sort !== "new" ? 1 : 0) + (range !== String(curFy) ? 1 : 0);
  const clear = () => { setStatus(null); setTypeSel([]); setMonth(null); setSort("new"); setRange(String(curFy)); setQ(""); setShown(8); };

  const exportCsv = () => {
    const lines = [["Claim", "Status", "Posting date", "Expense date", "Type", "Description", "Amount", "Sanctioned"].map(csvCell).join(",")];
    for (const c of rows) for (const l of c.lines) if (keepType(l)) lines.push([c.id, statusOf(c.status).label, c.posting, l.date, l.type, l.note, l.amount, c.sanctioned != null ? l.sanctioned : ""].map(csvCell).join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `expense-claims-${(me?.id || "me").toLowerCase()}-${rangeLabel.replace(/\W+/g, "-").toLowerCase()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const pill = (on) => ({ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${on ? "#2563eb" : "#d0d5dd"}`, background: on ? "#eef3fe" : "#fff", color: on ? "#1d4ed8" : "#344054" });
  const seg = (on) => ({ height: 38, borderRadius: 9, border: 0, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "0 10px", whiteSpace: "nowrap", background: on ? "#fff" : "transparent", color: on ? "#0b1220" : "#5b6576", boxShadow: on ? "0 1px 2px rgba(16,24,40,.14)" : "none" });
  const lbl = { fontSize: 12, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "#667085" };

  const active = [
    { l: rangeLabel, fixed: true },
    month && { l: `${MON[+month.slice(5) - 1]} ${month.slice(0, 4)}`, rm: () => setMonth(null) },
    status && { l: statusOf(status).label, c: statusOf(status).dot, rm: () => setStatus(null) },
    ...typeSel.map((t) => ({ l: t, c: typeColor(t).c, rm: () => setTypeSel((s) => s.filter((x) => x !== t)) })),
    sort !== "new" && { l: sort === "old" ? "Oldest first" : "Highest amount", rm: () => setSort("new") },
  ].filter(Boolean);

  return (
    <div ref={rootRef} className={"ec-root" + (className ? " " + className : "")} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14, background: embedded ? "transparent" : "#f4f5f7", padding: embedded ? 0 : isDesk ? 24 : 12 }}>
      <link rel="stylesheet" href={FONT_HREF} />
      <style>{CSS}</style>

      {data.status === "idle" && <Note tone="info">Pass the ERP GraphQL URL and the signed-in user's token to load claims.</Note>}
      {data.status === "error" && <Note>{data.error}</Note>}
      {data.status === "hidden" && <Note tone="info">Expense claims are not open for your role yet.</Note>}
      {data.status === "loading" && <div aria-busy="true" style={{ ...card, height: 200, display: "grid", placeItems: "center" }}><Spinner size={24} /></div>}

      {data.status === "ready" && <>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 12px", borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff" }}>
              <span style={{ color: "#8a93a3", display: "flex" }}><Icon d={IC.search} size={17} sw={1.8} /></span>
              <input aria-label="Search claims" placeholder="Search claim no., description, type…" value={q} onChange={(e) => { setQ(e.target.value); setShown(8); }} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 14 }} />
              {q && <button type="button" aria-label="Clear search" onClick={() => setQ("")} style={{ ...btn.icon, width: 26, height: 26, borderRadius: 99, background: "#f2f4f7" }}><Icon d={IC.x} size={12} /></button>}
            </span>
            <button type="button" aria-expanded={panel} onClick={() => setPanel((p) => !p)} style={{ flex: "none", display: "flex", alignItems: "center", gap: 7, height: 44, padding: "0 14px", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 600, border: `1px solid ${nFilters ? "#2563eb" : "#d0d5dd"}`, background: nFilters ? "#eef3fe" : "#fff", color: nFilters ? "#1d4ed8" : "#344054" }}>
              <Icon d={IC.filter} size={17} sw={1.9} />{isDesk ? "Filter" : ""}
              {nFilters > 0 && <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 99, background: "#2563eb", color: "#fff", fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center" }}>{nFilters}</span>}
            </button>
            <button type="button" aria-label="Export CSV" title="Export CSV" className="ec-ghost" onClick={exportCsv} style={{ ...btn.icon, width: 44, height: 44, borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#344054" }}><Icon d={IC.dl} size={17} sw={1.9} /></button>
          </div>
          <div className="ec-rail" style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto" }}>
            {active.map((f) => (
              <span key={f.l} style={{ flex: "none", display: "flex", alignItems: "center", gap: 6, height: 32, padding: f.rm ? "0 4px 0 12px" : "0 12px", borderRadius: 99, background: f.fixed ? "#0b1220" : "#eef3fe", color: f.fixed ? "#fff" : "#1d4ed8", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                {f.c && <span style={{ width: 7, height: 7, borderRadius: "50%", background: f.c }} />}{f.l}
                {f.rm && <button type="button" aria-label={`Remove ${f.l}`} onClick={f.rm} style={{ width: 24, height: 24, borderRadius: 99, border: 0, background: "transparent", color: "inherit", display: "grid", placeItems: "center", cursor: "pointer" }}><Icon d={IC.x} size={12} sw={2.4} /></button>}
              </span>
            ))}
            {(nFilters > 0 || q) && <button type="button" className="ec-link" onClick={clear} style={{ flex: "none", height: 32, padding: "0 10px", borderRadius: 8, border: 0, background: "transparent", color: "#1d4ed8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Clear all</button>}
          </div>

          {panel && <>
            <div onClick={() => setPanel(false)} style={{ position: "fixed", inset: 0, zIndex: 66, background: isDesk ? "transparent" : "rgba(16,24,40,.45)" }} />
            <div role="dialog" aria-label="Filters" style={{ position: isDesk ? "absolute" : "fixed", zIndex: 67, ...(isDesk ? { top: 52, right: 0, width: 400 } : { left: 0, right: 0, bottom: 0 }), borderRadius: isDesk ? 16 : "18px 18px 0 0", background: "#fff", boxShadow: "0 0 0 1px #e4e7ec,0 24px 48px -16px rgba(16,24,40,.4)", display: "flex", flexDirection: "column", maxHeight: isDesk ? 560 : "85vh" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", boxShadow: "inset 0 -1px 0 #eef1f5" }}><span style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>Filters</span><button type="button" aria-label="Close filters" className="ec-ghost" onClick={() => setPanel(false)} style={btn.icon}><Icon d={IC.x} size={17} /></button></div>
              <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span style={lbl}>Period</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 4, padding: 4, borderRadius: 12, background: "#f2f4f7" }}>
                    {[...fys.map((y) => [String(y), fyLabel(y)]), ["l6", "Last 6 months"], ["all", "All time"]].map(([k, l]) => <button key={k} type="button" aria-pressed={range === k} onClick={() => { setRange(k); setMonth(null); setShown(8); }} style={seg(range === k)}>{l}</button>)}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span style={lbl}>Status</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button type="button" aria-pressed={!status} onClick={() => setStatus(null)} style={pill(!status)}>All<span style={{ fontWeight: 500, opacity: 0.7 }}>{base.length}</span></button>
                    {STATUS_CHOICES.map((s) => { const n = base.filter((c) => c.status === s).length; return n ? <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(status === s ? null : s)} style={pill(status === s)}><span style={{ width: 7, height: 7, borderRadius: "50%", background: statusOf(s).dot }} />{statusOf(s).label}<span style={{ fontWeight: 500, opacity: 0.7 }}>{n}</span></button> : null; })}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span style={lbl}>Expense claim type</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(types || []).map((t) => { const on = typeSel.includes(t); return <button key={t} type="button" aria-pressed={on} onClick={() => setTypeSel((s) => (on ? s.filter((x) => x !== t) : [...s, t]))} style={pill(on)}><TypeDot type={t} />{t}{on && <Icon d={IC.check} size={13} sw={2.6} />}</button>; })}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span style={lbl}>Sort months by</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 4, padding: 4, borderRadius: 12, background: "#f2f4f7" }}>
                    {[["new", "Newest"], ["old", "Oldest"], ["amt", "Highest ₹"]].map(([k, l]) => <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)} style={seg(sort === k)}>{l}</button>)}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", boxShadow: "inset 0 1px 0 #eef1f5" }}>
                <button type="button" className="ec-ghost" onClick={clear} style={btn.ghost}>Reset</button>
                <button type="button" className="ec-cta" onClick={() => setPanel(false)} style={{ ...btn.primary, flex: 1 }}>Show {rows.length} {rows.length === 1 ? "claim" : "claims"}</button>
              </div>
            </div>
          </>}
        </div>

        {note && <Note tone={note.tone}>{note.m}</Note>}

        <div style={{ display: "grid", gridTemplateColumns: isDesk ? "repeat(4,minmax(0,1fr))" : "repeat(2,minmax(0,1fr))", gap: 12 }}>
          {[
            { dot: "#0b1220", l: "Total claimed", v: inr(T.claimed), s: `${rows.length - cancelled.length} claims · ${T.rows} rows`, c: "#0b1220" },
            { dot: "#2563eb", l: "Sanctioned by HR", v: inr(T.sanctioned), s: T.claimed ? `${Math.round((T.sanctioned / T.claimed) * 100)}% of claimed` : "—", c: "#1d4ed8" },
            { dot: "#12b76a", l: "Paid", v: inr(T.reimbursed), s: "credited with salary", c: "#067647" },
            { dot: "#d97706", l: "With HR", v: inr(T.byStatus.Draft?.amount || 0), s: `${T.byStatus.Draft?.n || 0} not yet approved`, c: "#b54708" },
          ].map((k) => (
            <div key={k.l} style={{ ...card, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: "#5b6576" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: k.dot }} />{k.l}</span>
              <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: k.c, ...tabNum, ...ell }}>{k.v}</span>
              <span style={{ fontSize: 12, color: "#8a93a3" }}>{k.s}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: w >= 980 ? "minmax(0,1.6fr) minmax(0,1fr)" : "minmax(0,1fr)", gap: 12, alignItems: "stretch" }}>
          <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>By month</span>
              <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#5b6576" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#d6e2fb" }} />Claimed</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#2563eb" }} />Sanctioned</span>
              </span>
            </div>
            <div className="ec-rail" style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 170, overflowX: "auto" }}>
              {mAgg.map(({ k, cl, sa }, i) => {
                const on = month === k;
                const mo = +k.slice(5) - 1;
                return (
                  <button key={k} type="button" aria-pressed={on} title={`${MONTH[mo]} ${k.slice(0, 4)} · claimed ${inr(cl)} · sanctioned ${inr(sa)}`} onClick={() => { setMonth(on ? null : k); setOpenM(on ? undefined : k); }} className="ec-ghost" style={{ flex: "1 0 34px", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6, border: 0, borderRadius: 8, padding: "4px 0 0", background: on ? "#eef3fe" : "transparent", cursor: "pointer", opacity: month && !on ? 0.45 : 1 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#5b6576", whiteSpace: "nowrap" }}>{cl ? kInr(cl) : ""}</span>
                    <span style={{ position: "relative", width: "60%", maxWidth: 30, height: Math.max(2, (cl / mMax) * 110), borderRadius: "5px 5px 0 0", background: "#d6e2fb" }}>
                      <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: cl ? (sa / cl) * 100 + "%" : 0, borderRadius: "5px 5px 0 0", background: "#2563eb" }} />
                    </span>
                    <span style={{ fontSize: 11, fontWeight: on ? 700 : 500, color: on ? "#1d4ed8" : "#8a93a3", whiteSpace: "nowrap" }}>{MON[mo]}{mo === 0 || i === 0 ? ` '${k.slice(2, 4)}` : ""}</span>
                  </button>
                );
              })}
            </div>
            <span style={{ fontSize: 12, color: "#8a93a3" }}>{month ? `Showing ${MONTH[+month.slice(5) - 1]} ${month.slice(0, 4)} · tap again to see all months` : "Tap a month to see only its claims"}</span>
          </section>
          <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>By expense claim type</span>
            <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "#eef1f5", gap: 2 }}>
              {typeRows.map(([t, v]) => <span key={t} style={{ width: (v / typeSum) * 100 + "%", background: typeColor(t).c }} />)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {typeRows.map(([t, v]) => {
                const on = typeSel.length === 1 && typeSel[0] === t;
                return (
                  <button key={t} type="button" className="ec-ghost" onClick={() => setTypeSel(on ? [] : [t])} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, padding: "0 8px", borderRadius: 8, border: 0, background: on ? "#eef3fe" : "transparent", cursor: "pointer", fontSize: 13, textAlign: "left" }}>
                    <TypeDot type={t} /><span style={{ flex: 1, color: "#344054", fontWeight: 600 }}>{t}</span>
                    <span style={{ color: "#8a93a3", fontSize: 12 }}>{Math.round((v / typeSum) * 100)}%</span>
                    <span style={{ minWidth: 76, textAlign: "right", fontWeight: 700, ...tabNum }}>{inr(v)}</span>
                  </button>
                );
              })}
              {!typeRows.length && <span style={{ fontSize: 13, color: "#8a93a3" }}>No expenses in this period.</span>}
            </div>
          </section>
        </div>

        <section style={{ ...card, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "14px 16px", boxShadow: "inset 0 -1px 0 #eef1f5", flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{month ? `${MONTH[+month.slice(5) - 1]} ${month.slice(0, 4)}` : rangeLabel} · {groups.length} {groups.length === 1 ? "month" : "months"} · {rows.length} {rows.length === 1 ? "claim" : "claims"}</span>
            {(onOpenClaims || claimsPath) && <button type="button" className="ec-link" onClick={() => (onOpenClaims ? onOpenClaims() : window.location.assign(claimsPath))} style={{ height: 30, padding: "0 8px", borderRadius: 8, border: 0, background: "transparent", color: "#1d4ed8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>This month's claims →</button>}
          </div>
          {groups.slice(0, shown).map((g) => {
            const open = openKey === g.k;
            const mo = +g.k.slice(5) - 1;
            const counts = {};
            for (const c of g.cs) counts[c.status] = (counts[c.status] || 0) + 1;
            const days = open ? groupDays(g.cs, keepType) : [];
            return (
              <div key={g.k} style={{ boxShadow: "inset 0 -1px 0 #f0f2f5" }}>
                <button type="button" aria-expanded={open} onClick={() => setOpenM(open ? null : g.k)} className="ec-ghost" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", border: 0, background: open ? "#fafbfc" : "#fff", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ flex: "none", width: 44, height: 44, borderRadius: 10, background: "#eef3fe", color: "#1d4ed8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{MON[mo]}</span><span style={{ fontSize: 10, fontWeight: 600, marginTop: 3, opacity: 0.75 }}>{g.k.slice(0, 4)}</span>
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{MONTH[mo]} {g.k.slice(0, 4)}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {Object.keys(counts).map((s) => <Chip key={s} status={s} />)}
                      <span style={{ fontSize: 12, color: "#8a93a3", whiteSpace: "nowrap" }}>{g.cs.length} {g.cs.length === 1 ? "claim" : "claims"} · {g.t.rows} rows</span>
                    </span>
                  </span>
                  <span style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, ...tabNum }}>{inr(g.t.claimed)}</span>
                    {g.t.sanctioned > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "#1d4ed8", ...tabNum }}>{inr(g.t.sanctioned)} sanctioned</span>}
                  </span>
                  <span style={{ flex: "none", color: "#98a2b3", display: "flex", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}><Icon d={IC.down} /></span>
                </button>
                {open && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "2px 12px 14px", background: "#fafbfc" }}>
                    <span style={{ fontSize: 12, color: "#8a93a3", padding: "6px 4px 0", ...ell }}>{g.cs.map((c) => `${c.id} · ${spanOf(c.lines)}`).join("   ·   ")}</span>
                    <div style={{ display: "grid", gridTemplateColumns: w >= 900 ? "repeat(2,minmax(0,1fr))" : "minmax(0,1fr)", gap: 8 }}>
                      {days.map((d) => <DayCard key={d.key} day={d} onOpen={() => setDay(d)} />)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!groups.length && <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>{claims.length ? "No claims match these filters." : "No expense claims on file yet."}</div>}
          {groups.length > shown && <button type="button" className="ec-link" onClick={() => setShown((n) => n + 6)} style={{ width: "100%", height: 46, border: 0, background: "#fafbfc", color: "#1d4ed8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Show {Math.min(6, groups.length - shown)} more months</button>}
        </section>
      </>}

      {day && <DaySheet conn={conn} day={day} onClose={() => setDay(null)} onEdit={(c) => { setDay(null); setForm({ claim: c }); }} />}
      {form && conn && me && (
        <ClaimForm conn={conn} me={me} types={types} claim={form.claim} today={today} desk={w >= 900} onClose={() => setForm(null)}
          onSaved={({ name, edited, warning }) => { setForm(null); data.reload(); setNote(warning ? { tone: "error", m: warning } : { tone: "ok", m: edited ? `${name} updated.` : `${name} sent to HR.` }); }} />
      )}
    </div>
  );
}
