"use client";

import { useMemo, useState } from "react";
import { Icon, IC, Note, Rail, Sheet, btn, card, ell, tabNum } from "./ui";
import { MON, WD, inr, isoDay, typeColor } from "./model";
import { FOOD_LIMIT } from "./data/claimsApi";

/* Food -- a monthly meal limit (FOOD_LIMIT, every role for now), from the
 * claims prototype's Food page, in the app's theme. The meals are the bills on
 * the person's Food claim of the month (3 Nov 2026): "Add a bill" sends a bill
 * there when the scan reads it as food, with the same AI check as any bill.
 *
 *   FoodBar    the home Settle bar's small bottom line: left of the limit,
 *              days to go, a thin meter
 *   FoodCard   the Settlements page, between the cash card and Highlights:
 *              left of the limit, a meter, the month's days as a sideways
 *              line of day cards, "See all"
 *   FoodSheet  the drawer behind "See all" / a day: the month's budget, four
 *              figures, every working day by week; a day opens to its meals
 *              (amount, check status, bill). "Ask for more" (not sent yet).
 *
 * Every bill not Rejected comes off what is left; the ERP refuses one that
 * would go over ("Expense Running Guard"). */

const UTENSILS = "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7";
const FOOD = typeColor("Food");
const off = (d) => d.getDay() === 0;   // Sundays off

/* The month's working days up to today (and any day with a bill), each with
   the meals on this month's Food claim. */
function monthDays(claims, today) {
  const y = today.getFullYear(), m = today.getMonth(), last = today.getDate();
  const key = isoDay(today).slice(0, 7);
  const byDay = new Map();
  for (const c of claims) {
    if (!c.food || c.status === "Cancelled") continue;
    for (const l of c.lines) {
      if (!l.date || l.date.slice(0, 7) !== key) continue;
      if (!byDay.has(l.date)) byDay.set(l.date, []);
      byDay.get(l.date).push({ id: l.id, label: l.note || "Meal", amt: l.amount, bill: !!l.bill, status: l.state || "Checking" });
    }
  }
  const days = [];
  for (let n = 1; n <= last; n++) {
    const d = new Date(y, m, n), iso = isoDay(d);
    if (off(d) && !byDay.has(iso)) continue;
    days.push({ iso, n, wd: WD[d.getDay()], meals: byDay.get(iso) || [] });
  }
  return days;
}

const counts = (x) => x.status !== "Rejected";
const sumOf = (meals) => meals.filter(counts).reduce((a, x) => a + x.amt, 0);
/* A day's status in a word: anything with Accounts or being checked shows first. */
const dayStatus = (meals) => !meals.length ? null
  : meals.some((x) => x.status === "In Review") ? "In Review"
  : meals.some((x) => x.status === "Checking") ? "Checking"
  : meals.some((x) => x.status === "Verified") ? "Verified" : "Rejected";

export function useFood(claims, today = new Date()) {
  const days = useMemo(() => monthDays(claims || [], today), [claims, today]);
  const [asked, setAsked] = useState(0);   // more limit asked for (not sent yet)
  const limit = FOOD_LIMIT;
  const stats = useMemo(() => {
    const used = days.reduce((s, d) => s + sumOf(d.meals), 0);
    const y = today.getFullYear(), m = today.getMonth(), lastDay = new Date(y, m + 1, 0).getDate();
    let workMonth = 0, workLeft = 0;
    for (let n = 1; n <= lastDay; n++) {
      const d = new Date(y, m, n);
      if (off(d)) continue;
      workMonth++;
      if (n > today.getDate()) workLeft++;
    }
    const claimed = days.filter((d) => d.meals.some(counts)).length;
    const verified = days.reduce((s, d) => s + d.meals.filter((x) => x.status === "Verified").reduce((a, x) => a + x.amt, 0), 0);
    return {
      limit, used, left: Math.max(0, limit - used), pct: Math.min(100, (used / limit) * 100),
      daysToGo: lastDay - today.getDate(), worked: days.length, claimed, workLeft,
      avg: claimed ? used / claimed : 0, pace: limit / workMonth,
      projected: days.length ? used + (used / days.length) * workLeft : 0, verified,
    };
  }, [days, limit, today]);
  return { days, stats, asked, ask: (n) => setAsked((a) => a + n), month: MON[today.getMonth()] };
}

const Meter = ({ pct, h = 6 }) => (
  <span aria-hidden style={{ display: "block", height: h, borderRadius: 99, background: "#f2f4f7", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${pct}%`, background: FOOD.c, borderRadius: 99 }} /></span>
);

/* Home: the Settle bar's bottom line. */
export function FoodBar({ food, onOpen }) {
  const s = food.stats;
  return (
    <button type="button" onClick={onOpen} aria-label={`Food: ${inr(s.left)} left of ${inr(s.limit)}, ${s.daysToGo} days to go. Open settlements`}
      style={{ display: "flex", flexDirection: "column", gap: 5, width: "100%", border: 0, borderTop: "1px solid #eef1f5", background: "transparent", padding: "8px 14px 10px", cursor: "pointer", textAlign: "left" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5b6576", minWidth: 0 }}>
        <span style={{ color: FOOD.c, display: "flex", flex: "none" }}><Icon d={UTENSILS} size={13} /></span>
        <b style={{ fontWeight: 600, flex: "none" }}>Food</b>
        <span style={{ ...ell, minWidth: 0 }}><b style={{ color: "#0b1220", ...tabNum }}>{inr(s.left)}</b> left · {s.daysToGo} days to go</span>
      </span>
      <Meter pct={s.pct} h={4} />
    </button>
  );
}

// A meal's / a day's check status, as bills show it elsewhere.
const TONE = { Verified: ["#067647", "#ecfdf3"], "In Review": ["#b54708", "#fffaeb"], Rejected: ["#b42318", "#fef3f2"], Checking: ["#1d4ed8", "#eff4ff"] };
const WORD = { Verified: "Verified", "In Review": "In review", Rejected: "Rejected", Checking: "AI check" };
const statusTone = (st) => TONE[st] || [FOOD.fg, FOOD.bg];

/* Settlements: the Food card. */
export function FoodCard({ food, isDesk, onSeeAll, onDay }) {
  const s = food.stats;
  const recent = [...food.days].reverse();
  return (
    <section style={{ ...card, padding: isDesk ? "16px 18px" : "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#5b6576" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: FOOD.c }} />Food · {food.month}
        </span>
        <button type="button" className="ec-link" onClick={onSeeAll} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2, height: 30, padding: "0 6px", borderRadius: 8, border: 0, background: "transparent", color: "#1d4ed8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>See all<Icon d={IC.next} size={14} /></button>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", color: FOOD.fg, ...tabNum }}>{inr(s.left)}</span>
        <span style={{ fontSize: 13, color: "#5b6576" }}>left of {inr(s.limit)} · {s.daysToGo} days to go{food.asked ? ` · ${inr(food.asked)} asked` : ""}</span>
      </div>
      <Meter pct={s.pct} />
      <Rail label="Food by day" gap={8} role="group">
        {recent.map((d) => {
          const tot = sumOf(d.meals);
          const st = dayStatus(d.meals);
          const [tc, tb] = st ? statusTone(st) : ["#8a93a3", "#f2f4f7"];
          return (
            <button key={d.iso} type="button" onClick={() => onDay(d.iso)}
              aria-label={`${d.wd} ${d.n}: ${st ? `${inr(tot)} ${WORD[st]}` : "no meal"} -- open the day`}
              style={{ flex: "none", width: 104, display: "flex", flexDirection: "column", gap: 4, padding: "10px 11px", borderRadius: 14, border: 0, boxShadow: "0 0 0 1px #e4e7ec", background: tot ? "#fff" : "#fafbfc", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#8a93a3", textTransform: "uppercase", letterSpacing: ".04em" }}>{d.wd} {d.n}</span>
              <b style={{ fontSize: 15, fontWeight: 700, color: st ? "#0b1220" : "#98a2b3", ...tabNum }}>{st ? inr(tot) : "—"}</b>
              <span style={{ alignSelf: "flex-start", fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 99, color: tc, background: tb, whiteSpace: "nowrap" }}>{st ? WORD[st] : "no meal"}</span>
            </button>
          );
        })}
      </Rail>
    </section>
  );
}

/* "See all": the month in full, a day's meals, ask for more. */
export function FoodSheet({ food, startDay = null, onClose }) {
  const s = food.stats;
  const [view, setView] = useState(startDay ? "day" : "month");   // month | day | ask
  const [day, setDay] = useState(startDay || food.days[food.days.length - 1]?.iso);
  const [filter, setFilter] = useState("all");
  const [askAmt, setAskAmt] = useState("");
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState("");
  const dayOf = food.days.find((d) => d.iso === day);
  const say = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const kpi = (v, l) => (
    <div style={{ background: "#f7f8fa", borderRadius: 14, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <b style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", ...tabNum }}>{v}</b>
      <span style={{ fontSize: 12, color: "#5b6576", lineHeight: 1.3 }}>{l}</span>
    </div>
  );
  const chip = (k, l) => (
    <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
      style={{ flex: "none", height: 34, padding: "0 12px", borderRadius: 99, border: `1.5px solid ${filter === k ? "#0b1220" : "#e4e7ec"}`, background: filter === k ? "#0b1220" : "#fff", color: filter === k ? "#fff" : "#475467", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>
  );

  // Weeks, newest first, Monday to Saturday.
  const weeks = [];
  for (const d of [...food.days].reverse()) {
    const dt = new Date(d.iso + "T00:00:00");
    const mon = isoDay(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - ((dt.getDay() + 6) % 7)));
    if (!weeks.length || weeks[weeks.length - 1].mon !== mon) weeks.push({ mon, days: [] });
    weeks[weeks.length - 1].days.push(d);
  }
  const keep = (d) => filter === "all" || (filter === "meals" ? d.meals.length : !d.meals.length);

  const month = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "14px 18px 18px" }}>
      <section style={{ ...card, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 13, color: "#5b6576" }}>Food limit {inr(s.limit)} a month</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: FOOD.fg, ...tabNum }}>{inr(s.left)}</span>
          <span style={{ fontSize: 14, color: "#5b6576" }}>left</span>
        </div>
        <Meter pct={s.pct} h={8} />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "#5b6576", flexWrap: "wrap" }}>
          <span style={tabNum}>{inr(s.used)} used · {Math.round(s.pct)} %</span>
          <span style={tabNum}>{s.daysToGo} days to go · {inr(s.daysToGo ? s.left / s.daysToGo : s.left)}/day</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {kpi(`${s.claimed} of ${s.worked}`, "working days claimed")}
          {kpi(inr(s.avg), `avg per claimed day · pace ${inr(s.pace)}`)}
          {kpi(inr(s.projected), `projected month end · ${s.projected <= s.limit ? "under" : "over"} limit`)}
          {kpi(food.asked ? inr(food.asked) : "—", food.asked ? "more asked · awaiting approval" : "more asked this month")}
        </div>
        <span style={{ fontSize: 12.5, color: "#5b6576" }}>{inr(s.verified)} verified so far. A bill counts once added; a rejected one gives its amount back.</span>
        <button type="button" onClick={() => setView("ask")} style={{ ...btn.ghost, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon d={IC.plus} size={15} />Ask for more</button>
      </section>
      <div style={{ display: "flex", gap: 8, overflowX: "auto" }} className="ec-rail" role="group" aria-label="Filter days">
        {chip("all", `All · ${s.worked}`)}{chip("meals", `With meal · ${s.claimed}`)}{chip("none", `No meal · ${s.worked - s.claimed}`)}
      </div>
      <section style={{ ...card, padding: "2px 14px 8px" }}>
        {weeks.map((w) => {
          const ds = w.days.filter(keep);
          if (!ds.length) return null;
          const sum = w.days.reduce((a, d) => a + sumOf(d.meals), 0);
          const first = new Date(w.mon + "T00:00:00");
          return (
            <div key={w.mon}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "12px 2px 4px", fontSize: 12.5, fontWeight: 700 }}>
                <span>{first.getDate()} – {first.getDate() + 6} {food.month}</span><span style={{ color: "#8a93a3", fontWeight: 600, ...tabNum }}>{sum ? inr(sum) : "no meals"}</span>
              </div>
              {ds.map((d) => {
                const tot = sumOf(d.meals);
                const st = dayStatus(d.meals);
                const [tc, tb] = st ? statusTone(st) : ["#8a93a3", "#f2f4f7"];
                return (
                  <button key={d.iso} type="button" onClick={() => { setDay(d.iso); setView("day"); }}
                    style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr) auto", gap: 10, alignItems: "center", width: "100%", padding: "10px 2px", border: 0, borderTop: "1px solid #eef1f5", background: "transparent", textAlign: "left", cursor: "pointer" }}>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1, gap: 3 }}><b style={{ fontSize: 17, ...tabNum }}>{d.n}</b><span style={{ fontSize: 10, fontWeight: 600, color: "#8a93a3", textTransform: "uppercase" }}>{d.wd}</span></span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: d.meals.length ? "#0b1220" : "#8a93a3", ...ell }}>{d.meals.length ? d.meals.map((x) => x.label).join(" + ") : "No meal claimed"}</span>
                      <span style={{ display: "block", fontSize: 12, color: "#8a93a3", ...ell }}>{d.meals.length ? (d.meals.some((x) => !x.bill) ? "no bill" : "bill attached") : "nothing claimed"}</span>
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                      <b style={{ fontSize: 15, ...tabNum }}>{st ? inr(tot) : "—"}</b>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 99, color: tc, background: tb, whiteSpace: "nowrap" }}>{st ? WORD[st] : "no meal"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </section>
    </div>
  );

  // A day: its meals. Read only -- a meal comes in through "Add a bill".
  const dayTotal = dayOf ? sumOf(dayOf.meals) : 0;
  const dayView = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "14px 18px 18px" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#344054" }}>Day</span>
        <select value={day} onChange={(e) => setDay(e.target.value)} style={{ height: 48, borderRadius: 12, border: "1.5px solid #e1e5ec", padding: "0 12px", fontSize: 15, background: "#fff" }}>
          {[...food.days].reverse().map((d) => <option key={d.iso} value={d.iso}>{d.wd} {d.n} {food.month}{d.meals.length ? ` · ${inr(sumOf(d.meals))}` : " · no meal"}</option>)}
        </select>
      </label>
      {dayOf?.meals.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dayOf.meals.map((x) => {
            const [tc, tb] = statusTone(x.status);
            return (
              <div key={x.id} style={{ ...card, padding: "12px 14px", display: "grid", gridTemplateColumns: "36px minmax(0,1fr) auto", gap: 12, alignItems: "center" }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: FOOD.bg, color: FOOD.c, display: "grid", placeItems: "center" }}><Icon d={UTENSILS} size={17} /></span>
                <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <b style={{ fontSize: 14.5, fontWeight: 700 }}>{x.label}</b>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: x.bill ? "#067647" : "#b54708", fontWeight: 600 }}>
                    <Icon d={x.bill ? IC.check : IC.camera} size={13} />{x.bill ? "Bill photo attached" : "No bill photo"}
                  </span>
                </span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <b style={{ fontSize: 16, ...tabNum }}>{inr(x.amt)}</b>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 99, color: tc, background: tb, whiteSpace: "nowrap" }}>{WORD[x.status] || x.status}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...card, padding: "22px 16px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>No meal claimed on {dayOf ? `${dayOf.wd} ${dayOf.n} ${food.month}` : "this day"}. A food bill added with &ldquo;Add a bill&rdquo; comes here.</div>
      )}
    </div>
  );

  const askView = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "14px 18px 18px" }}>
      <Note tone="info">Asking for more is not connected yet — nothing is sent. The limit stays {inr(s.limit)}.</Note>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#344054" }}>How much more</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, height: 54, borderRadius: 12, border: "1.5px solid #e1e5ec", padding: "0 14px", background: "#fff" }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#475467" }}>₹</span>
          <input inputMode="decimal" placeholder="0" value={askAmt} onChange={(e) => setAskAmt(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Amount asked" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, fontSize: 20, fontWeight: 800, ...tabNum }} />
        </span>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#344054" }}>Why</span>
        <input value={why} maxLength={140} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Team dinner after the CME" style={{ height: 48, borderRadius: 12, border: "1.5px solid #e1e5ec", padding: "0 14px", fontSize: 15 }} />
      </label>
    </div>
  );

  const footBtn = { ...btn.primary, height: 48, padding: "0 20px", borderRadius: 14, fontSize: 15 };
  const footer = view === "day" ? (
    <>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 12, color: "#5b6576" }}>{dayOf ? `${dayOf.wd} ${dayOf.n} ${food.month}` : "This day"}</span>
        <b style={{ fontSize: 20, ...tabNum }}>{dayOf?.meals.length ? inr(dayTotal) : "No meal"}</b>
      </div>
      <button type="button" onClick={() => setView("month")} style={{ ...btn.ghost, height: 48, borderRadius: 14 }}>Back</button>
    </>
  ) : view === "ask" ? (
    <>
      <span style={{ flex: 1 }} />
      <button type="button" onClick={() => setView("month")} style={{ ...btn.ghost, height: 48, borderRadius: 14 }}>Back</button>
      <button type="button" disabled={!Number(askAmt) || why.trim().length < 3} onClick={() => { food.ask(Number(askAmt)); setAskAmt(""); setWhy(""); setView("month"); say(`${inr(Number(askAmt))} noted — not sent yet`); }}
        style={{ ...footBtn, opacity: !Number(askAmt) || why.trim().length < 3 ? 0.5 : 1 }}>Ask</button>
    </>
  ) : (
    <>
      <span style={{ flex: 1, fontSize: 12.5, color: "#5b6576" }}>{s.claimed} of {s.worked} days · {inr(s.used)} used · {inr(s.left)} left</span>
    </>
  );

  return (
    <Sheet title={view === "day" ? "Meals that day" : view === "ask" ? "Ask for more" : `Food · ${food.month}`}
      sub={view === "month" ? `${inr(s.left)} left of ${inr(s.limit)}` : null}
      onClose={onClose} desktop="dialog" maxWidth={560} footer={footer}>
      {view === "day" ? dayView : view === "ask" ? askView : month}
      {msg && <div role="status" aria-live="polite" style={{ margin: "0 18px 16px", padding: "10px 14px", borderRadius: 10, background: "#101828", color: "#fff", fontSize: 13 }}>{msg}</div>}
    </Sheet>
  );
}
