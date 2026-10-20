"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Router from "next/router";
import { useClaims } from "./data/useClaims";
import { CSS, ClaimForm, DayCard, DaySheet, FONT_HREF, IC, Icon, Note, Spinner, btn, card, ell, tabNum, TypeDot } from "./ui";
import { STATUS, groupDays, inr, monthKey, monthLabel, statusOf, totals, MON, kInr, typeColor } from "./model";

/* Expense claims -- the month's claims, day by day, and the way to file one.
 *
 * Reads and writes the ERP's Expense Claim as the signed-in user (url +
 * token). There is no approval here: a claim is entered, goes to HR, and the
 * page shows the status HR gives it in the ERP (With HR, Approved, Paid).
 * A Draft can be edited until HR acts on it. Bills attach to the claim and
 * open in a preview.
 *
 * Opens on this month; the arrows step back through months that have
 * claims, since HR often posts last month's travel in the first week. Older
 * history lives on the profile's "Expense & claims" tab (historyPath).
 *
 * `?new=1` in the URL, or newClaim, opens the form straight away. */

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

const ORDER = ["Draft", "Submitted", "Unpaid", "Paid", "Rejected", "Cancelled"];

export default function ClaimReport({
  url, token, employee, asOf, viewport = "auto", newClaim = false,
  homePath = "/", historyPath = "/my-profile?tab=claims", onBack, onOpenHistory, className,
}) {
  const rootRef = useRef(null);
  const w = useWidth(rootRef);
  const isDesk = viewport === "desktop" || (viewport === "auto" && w >= 768);
  const today = useMemo(() => { const d = asOf ? new Date(asOf) : new Date(); return isNaN(d) ? new Date() : d; }, [asOf]);
  const cur = monthKey(today);

  const data = useClaims({ url, token, employee });
  const { conn, me, claims = [], types } = data;

  const months = useMemo(() => {
    const set = new Set([cur]);
    for (const c of claims) for (const l of c.lines) if (l.date && l.date.slice(0, 7) <= cur) set.add(l.date.slice(0, 7));
    return [...set].sort();
  }, [claims, cur]);
  const [month, setMonth] = useState(cur);
  const mi = months.indexOf(month);

  const [filter, setFilter] = useState(null);
  const [day, setDay] = useState(null);
  const [form, setForm] = useState(null); // { claim? }
  const [toast, setToast] = useState(null);
  const tt = useRef(null);
  const say = (m, tone = "ok") => { setToast({ m, tone }); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(null), 3200); };
  useEffect(() => () => clearTimeout(tt.current), []);

  /* ?new=1 (or newClaim) opens the form straight away. Opened once, then the
     query is dropped so a refresh does not reopen it. */
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || data.status !== "ready") return;
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    if (newClaim || q?.get("new") === "1") {
      asked.current = true;
      setForm({});
      if (q?.get("new")) { q.delete("new"); const s = q.toString(); window.history.replaceState(null, "", window.location.pathname + (s ? "?" + s : "")); }
    }
  }, [data.status, newClaim]);

  const inMonth = (l) => l.date.slice(0, 7) === month;
  const T = useMemo(() => totals(claims, inMonth), [claims, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => groupDays(claims, (l, c) => inMonth(l) && (!filter || c.status === filter)), [claims, month, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const nClaims = Object.values(T.byStatus).reduce((s, b) => s + b.n, 0);
  const statuses = ORDER.filter((s) => T.byStatus[s] || ["Draft", "Unpaid", "Paid"].includes(s));
  const barTotal = statuses.reduce((s, k) => s + (T.byStatus[k]?.amount || 0), 0) || 1;
  const sanctionedCut = T.sanctioned && claims.some((c) => c.sanctioned != null && c.lines.some((l) => inMonth(l) && l.sanctioned !== l.amount));
  const [y, m] = month.split("-").map(Number);
  const isCur = month === cur;
  const lastDay = new Date(y, m, 0).getDate();
  const kicker = isCur ? `${monthLabel(month)} · day ${today.getDate()} of ${lastDay}` : `${monthLabel(month)} · full month`;

  /* Wide desktop: a side column beside the month -- the split by claim type,
     the last six months, and quick-add by type -- so the width is used. */
  const wide = isDesk && w >= 1180;
  const listTwoCols = wide ? w - 420 >= 760 : isDesk && w >= 900;
  const typeRows = Object.entries(T.byType).sort((a, b) => b[1] - a[1]);
  const typeSum = typeRows.reduce((s, [, v]) => s + v, 0) || 1;
  const trend = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const k = monthKey(new Date(today.getFullYear(), today.getMonth() - 5 + i, 1));
    const t = totals(claims, (l) => l.date.slice(0, 7) === k);
    return { k, cl: t.claimed, sa: t.sanctioned };
  }), [claims, today]);
  const trendMax = Math.max(1, ...trend.map((x) => x.cl));
  const pickMonth = (k) => { if (months.includes(k)) { setMonth(k); setFilter(null); } };

  const openHistory = () => (onOpenHistory ? onOpenHistory() : go(historyPath));
  const back = () => (onBack ? onBack() : go(homePath));
  const pad = isDesk ? 32 : 16;

  const saved = ({ name, edited, warning }) => {
    setForm(null);
    setDay(null);
    data.reload();
    if (warning) say(warning, "error");
    else say(edited ? `${name} updated` : `${name} sent to HR`);
  };

  return (
    <div ref={rootRef} className={"ec-root" + (className ? " " + className : "")} style={{ background: "#f4f5f7", width: "100%", minHeight: "100%" }}>
      <link rel="stylesheet" href={FONT_HREF} />
      <style>{CSS}</style>
      <main style={{ display: "flex", flexDirection: "column", gap: 18, padding: `${isDesk ? 20 : 12}px ${pad}px ${isDesk ? 64 : 28}px`, maxWidth: 1600 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" aria-label="Back" className="ec-ghost" onClick={back} style={{ ...btn.icon, width: 38, height: 38, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec", color: "#344054" }}><Icon d={IC.back} size={18} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: isDesk ? 24 : 20, fontWeight: 700, letterSpacing: "-0.02em" }}>Expense claims</div>
            <div style={{ fontSize: 13, color: "#5b6576", ...ell }}>{[me?.name, me?.department, "claims go to HR"].filter(Boolean).join(" · ")}</div>
          </div>
          <button type="button" className="ec-ghost" onClick={openHistory} style={{ ...btn.ghost, height: 40, padding: "0 14px", display: "flex", alignItems: "center", gap: 6, flex: "none" }}><Icon d={IC.hist} />{isDesk ? "Past claims" : "History"}</button>
        </div>

        {data.status === "idle" && <Note tone="info">Pass the ERP GraphQL URL and the signed-in user’s token to load claims.</Note>}
        {data.status === "error" && <Note>{data.error}</Note>}
        {data.status === "hidden" && <Note tone="info">Expense claims are not open for your role yet.</Note>}
        {data.status === "loading" && <div aria-busy="true" style={{ ...card, height: 220, display: "grid", placeItems: "center" }}><Spinner size={24} /></div>}

        {data.status === "ready" && <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0,1fr) 340px" : "minmax(0,1fr)", gap: 18, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section style={{ ...card, boxShadow: "0 0 0 1px #e4e7ec,0 12px 28px -24px rgba(16,24,40,.35)", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px 12px", flexWrap: "wrap" }}>
              <button type="button" aria-label="Previous month" className="ec-ghost" disabled={mi <= 0} onClick={() => { setMonth(months[mi - 1]); setFilter(null); }} style={{ ...btn.icon, width: 30, height: 30, opacity: mi <= 0 ? 0.3 : 1 }}><Icon d={IC.back} /></button>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#5b6576" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb" }} />{kicker}</span>
              <button type="button" aria-label="Next month" className="ec-ghost" disabled={mi >= months.length - 1} onClick={() => { setMonth(months[mi + 1]); setFilter(null); }} style={{ ...btn.icon, width: 30, height: 30, opacity: mi >= months.length - 1 ? 0.3 : 1 }}><Icon d={IC.next} /></button>
              <span style={{ flex: 1 }} />
              {data.refreshing && <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8a93a3" }}><Spinner size={12} />Updating</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isDesk && w >= 860 ? "minmax(0,1fr) minmax(0,1.3fr)" : "minmax(0,1fr)", gap: "20px 36px", alignItems: "start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#5b6576" }}>Total claimed</span>
                  <span style={{ fontSize: isDesk ? 48 : 40, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, ...tabNum }}>{inr(T.claimed)}</span>
                  <span style={{ fontSize: 13, color: "#8a93a3" }}>{T.rows} expense {T.rows === 1 ? "row" : "rows"} across {nClaims} {nClaims === 1 ? "claim" : "claims"}</span>
                </div>
                {T.sanctioned > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: "#eef3fe" }}>
                    <span style={{ flex: "none", width: 32, height: 32, borderRadius: "50%", background: "#2563eb", color: "#fff", display: "grid", placeItems: "center" }}><Icon d={IC.check} sw={2.4} /></span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: "#1d4ed8", ...tabNum }}>{inr(T.sanctioned)} sanctioned</span>
                      <span style={{ fontSize: 12, color: "#5b6576" }}>{sanctionedCut ? "HR changed some amounts · " : ""}{T.reimbursed ? inr(T.reimbursed) + " already paid" : "paid with salary"}</span>
                    </span>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", background: "#eef1f5", gap: 2 }}>
                  {statuses.filter((s) => T.byStatus[s]?.amount).map((s) => <span key={s} style={{ width: (T.byStatus[s].amount / barTotal) * 100 + "%", background: statusOf(s).dot }} />)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {statuses.map((s) => {
                    const b = T.byStatus[s] || { n: 0, amount: 0 };
                    const on = filter === s;
                    const st = STATUS[s] || statusOf(s);
                    return (
                      <button key={s} type="button" aria-pressed={on} className="ec-ghost" disabled={!b.n} onClick={() => setFilter(on ? null : s)} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto auto", alignItems: "center", gap: 10, minHeight: 44, padding: "0 10px", borderRadius: 10, border: 0, background: on ? "#eef3fe" : "transparent", boxShadow: on ? "inset 0 0 0 1px #b2c8f7" : "none", cursor: b.n ? "pointer" : "default", textAlign: "left", fontSize: 14 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot }} />
                        <span style={{ fontWeight: 600 }}>{st.label}</span>
                        <span style={{ fontSize: 12, color: "#8a93a3" }}>{b.n} {b.n === 1 ? "claim" : "claims"}</span>
                        <span style={{ minWidth: 84, textAlign: "right", fontWeight: 700, color: b.n ? "#0b1220" : "#c0c5cf", ...tabNum }}>{b.n ? inr(b.amount) : "—"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 32 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{filter ? statusOf(filter).label : "Day by day"} · {days.length} {days.length === 1 ? "day" : "days"}</span>
              {filter && <button type="button" className="ec-link" onClick={() => setFilter(null)} style={{ height: 32, padding: "0 10px", borderRadius: 8, border: 0, background: "transparent", color: "#1d4ed8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Show all</button>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: listTwoCols ? "repeat(2,minmax(0,1fr))" : "minmax(0,1fr)", gap: 8 }}>
              {days.map((d) => <DayCard key={d.key} day={d} onOpen={() => setDay(d)} />)}
            </div>
            {!days.length && (
              <div style={{ ...card, padding: "28px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 14, color: "#5b6576" }}>{filter ? "No claims in this status this month." : isCur ? "No claims yet this month." : `No claims for ${monthLabel(month)}.`}</span>
                {!filter && isCur && <button type="button" className="ec-cta" onClick={() => setForm({})} style={{ ...btn.primary, display: "flex", alignItems: "center", gap: 6 }}><Icon d={IC.plus} sw={2.4} />File a claim</button>}
              </div>
            )}
          </section>
          </div>

          {wide && (
            <aside style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 16 }}>
              <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>By claim type</span>
                  <span style={{ fontSize: 12, color: "#8a93a3" }}>{monthLabel(month)}</span>
                </div>
                {typeRows.length ? <>
                  <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "#eef1f5", gap: 2 }}>
                    {typeRows.map(([t, v]) => <span key={t} style={{ width: (v / typeSum) * 100 + "%", background: typeColor(t).c }} />)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {typeRows.map(([t, v]) => (
                      <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <TypeDot type={t} /><span style={{ flex: 1, color: "#344054", fontWeight: 600 }}>{t}</span>
                        <span style={{ color: "#8a93a3", fontSize: 12 }}>{Math.round((v / typeSum) * 100)}%</span>
                        <span style={{ minWidth: 76, textAlign: "right", fontWeight: 700, ...tabNum }}>{inr(v)}</span>
                      </div>
                    ))}
                  </div>
                </> : <span style={{ fontSize: 13, color: "#8a93a3" }}>Nothing claimed this month.</span>}
              </section>

              <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>Last 6 months</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#5b6576" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#d6e2fb" }} />Claimed</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#2563eb" }} />Sanctioned</span>
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 132 }}>
                  {trend.map(({ k, cl, sa }) => {
                    const on = k === month;
                    const has = months.includes(k);
                    return (
                      <button key={k} type="button" disabled={!has} aria-pressed={on} onClick={() => pickMonth(k)} className="ec-ghost" title={`${monthLabel(k)} · claimed ${inr(cl)} · sanctioned ${inr(sa)}`} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 5, border: 0, borderRadius: 8, padding: "4px 0 0", background: on ? "#eef3fe" : "transparent", cursor: has ? "pointer" : "default" }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#5b6576" }}>{cl ? kInr(cl) : ""}</span>
                        <span style={{ position: "relative", width: "58%", height: Math.max(2, (cl / trendMax) * 82), borderRadius: "5px 5px 0 0", background: "#d6e2fb" }}>
                          <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: cl ? (sa / cl) * 100 + "%" : 0, borderRadius: "5px 5px 0 0", background: "#2563eb" }} />
                        </span>
                        <span style={{ fontSize: 11, fontWeight: on ? 700 : 500, color: on ? "#1d4ed8" : "#8a93a3" }}>{MON[+k.slice(5) - 1]}</span>
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="ec-link" onClick={openHistory} style={{ alignSelf: "flex-start", height: 30, padding: "0 8px", marginLeft: -8, borderRadius: 8, border: 0, background: "transparent", color: "#1d4ed8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>All past claims →</button>
              </section>

              <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Quick add</span>
                <span style={{ fontSize: 12, color: "#8a93a3" }}>Opens a new claim with today’s row of that type.</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
                  {[...(types?.length ? types : ["Travel", "Food", "Calls", "Medical", "Others"])].sort((a, b) => { const o = ["Travel", "Food", "Calls", "Medical", "Others"]; return (o.indexOf(a) + 1 || 99) - (o.indexOf(b) + 1 || 99); }).map((t) => (
                    <button key={t} type="button" className="ec-ghost" onClick={() => setForm({ copyFrom: { lines: [{ type: t, note: "", amount: "" }] } })} style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", borderRadius: 10, border: "1px solid #e4e7ec", background: "#fff", fontSize: 13, fontWeight: 600, color: "#344054", cursor: "pointer", textAlign: "left" }}>
                      <TypeDot type={t} size={8} />{t}<span style={{ flex: 1 }} /><Icon d={IC.plus} size={14} />
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          )}
        </div>}
      </main>

      {day && <DaySheet conn={conn} day={day} onClose={() => setDay(null)} onEdit={(c) => { setDay(null); setForm({ claim: c }); }} />}
      {form && conn && me && <ClaimForm conn={conn} me={me} types={types} claim={form.claim} copyFrom={form.copyFrom} today={today} desk={isDesk && w >= 900} onClose={() => setForm(null)} onSaved={saved} />}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: isDesk ? 32 : 96, transform: "translateX(-50%)", zIndex: 95, maxWidth: "calc(100vw - 32px)", padding: "11px 18px", borderRadius: 10, background: toast.tone === "error" ? "#b42318" : "#101828", color: "#fff", fontSize: 13, fontWeight: 500, boxShadow: "0 12px 30px -10px rgba(16,24,40,.5)" }}>{toast.m}</div>
      )}
    </div>
  );
}

