"use client";

import { useMemo, useState } from "react";
import { Icon, IC, Note, Rail, Sheet, btn, card, ell, tabNum } from "./ui";
import { MON, WD, inr, isoDay, typeColor } from "./model";

/* Food -- a monthly meal limit by role (RBM and above), from the claims
 * prototype's Food page, in the app's theme. SAMPLE ONLY for now: there is
 * no ERP side yet, so the numbers are made up and nothing is saved -- every
 * view says so. When the ERP side exists, swap useFood's sample for reads.
 *
 *   FoodBar    the home Settle bar's small bottom line: left of the limit,
 *              days to go, a thin meter
 *   FoodCard   the Settlements page, between the cash card and Highlights:
 *              left of the limit, a meter, the month's days as a sideways
 *              line of day cards, "See all"
 *   FoodSheet  the drawer behind "See all" / a day: the month's budget, four
 *              figures, every working day by week (tap one to add a meal),
 *              "Ask for more"
 *
 * Each meal comes off what is left; going over the limit is refused. More
 * can be asked for -- it shows as requested until approved. */

// Monthly limit by role profile prefix; the sample uses RBM's.
export const FOOD_LIMITS = { RBM: 7000, SM: 5000 };
const SAMPLE_ROLE = "RBM";
export const FOOD_SAMPLE = true;

const UTENSILS = "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7";
const FOOD = typeColor("Food");
const off = (d) => d.getDay() === 0;   // Sundays off (sample)

/* The month's working days up to today, and a sample meal on most of them. */
function sampleMonth(today) {
  const y = today.getFullYear(), m = today.getMonth(), last = today.getDate();
  const days = [];
  for (let n = 1; n <= last; n++) {
    const d = new Date(y, m, n);
    if (off(d)) continue;
    const amt = (n * 37) % 5 === 0 ? 0 : 120 + ((n * 53) % 9) * 20;   // a few days without a meal
    days.push({ iso: isoDay(d), n, wd: WD[d.getDay()], meals: amt ? [{ id: `s${n}`, label: "Lunch", amt, bill: (n % 4) !== 0, status: last - n > 6 ? "In payroll" : "Submitted" }] : [] });
  }
  return days;
}

export function useFood(today = new Date()) {
  const [days, setDays] = useState(() => sampleMonth(today));
  const [asked, setAsked] = useState(0);   // more limit requested, not approved yet
  const limit = FOOD_LIMITS[SAMPLE_ROLE];
  const stats = useMemo(() => {
    const used = days.reduce((s, d) => s + d.meals.reduce((a, x) => a + x.amt, 0), 0);
    const y = today.getFullYear(), m = today.getMonth(), lastDay = new Date(y, m + 1, 0).getDate();
    let workMonth = 0, workLeft = 0;
    for (let n = 1; n <= lastDay; n++) {
      const d = new Date(y, m, n);
      if (off(d)) continue;
      workMonth++;
      if (n > today.getDate()) workLeft++;
    }
    const claimed = days.filter((d) => d.meals.length).length;
    const inPayroll = days.reduce((s, d) => s + d.meals.filter((x) => x.status === "In payroll").reduce((a, x) => a + x.amt, 0), 0);
    return {
      limit, used, left: Math.max(0, limit - used), pct: Math.min(100, (used / limit) * 100),
      daysToGo: lastDay - today.getDate(), worked: days.length, claimed, workLeft,
      avg: claimed ? used / claimed : 0, pace: limit / workMonth,
      projected: days.length ? used + (used / days.length) * workLeft : 0, inPayroll,
    };
  }, [days, limit, today]);
  const addMeal = (iso, amt, bill) => setDays((ds) => ds.map((d) => (d.iso === iso ? { ...d, meals: [...d.meals, { id: `n${Date.now()}`, label: "Meal", amt, bill, status: "Submitted" }] } : d)));
  return { days, stats, asked, ask: (n) => setAsked((a) => a + n), addMeal, role: SAMPLE_ROLE, month: MON[today.getMonth()] };
}

const SampleTag = () => (
  <span title="Sample data -- Food is not connected to the ERP yet; nothing is saved" style={{ flex: "none", fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 99, background: "#f2f4f7", color: "#667085" }}>Sample</span>
);
const Meter = ({ pct, h = 6 }) => (
  <span aria-hidden style={{ display: "block", height: h, borderRadius: 99, background: "#f2f4f7", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${pct}%`, background: FOOD.c, borderRadius: 99 }} /></span>
);

/* Home: the Settle bar's bottom line. */
export function FoodBar({ food, onOpen }) {
  const s = food.stats;
  return (
    <button type="button" onClick={onOpen} aria-label={`Food: ${inr(s.left)} left of ${inr(s.limit)}, ${s.daysToGo} days to go (sample). Open settlements`}
      style={{ display: "flex", flexDirection: "column", gap: 5, width: "100%", border: 0, borderTop: "1px solid #eef1f5", background: "transparent", padding: "8px 14px 10px", cursor: "pointer", textAlign: "left" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5b6576", minWidth: 0 }}>
        <span style={{ color: FOOD.c, display: "flex", flex: "none" }}><Icon d={UTENSILS} size={13} /></span>
        <b style={{ fontWeight: 600, flex: "none" }}>Food</b>
        <span style={{ ...ell, minWidth: 0 }}><b style={{ color: "#0b1220", ...tabNum }}>{inr(s.left)}</b> left · {s.daysToGo} days to go</span>
        <span style={{ marginLeft: "auto" }}><SampleTag /></span>
      </span>
      <Meter pct={s.pct} h={4} />
    </button>
  );
}

const statusTone = (st) => (st === "In payroll" ? ["#067647", "#ecfdf3"] : [FOOD.fg, FOOD.bg]);

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
        <SampleTag />
        <button type="button" className="ec-link" onClick={onSeeAll} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2, height: 30, padding: "0 6px", borderRadius: 8, border: 0, background: "transparent", color: "#1d4ed8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>See all<Icon d={IC.next} size={14} /></button>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", color: FOOD.fg, ...tabNum }}>{inr(s.left)}</span>
        <span style={{ fontSize: 13, color: "#5b6576" }}>left of {inr(s.limit)} · {s.daysToGo} days to go{food.asked ? ` · ${inr(food.asked)} asked` : ""}</span>
      </div>
      <Meter pct={s.pct} />
      <Rail label="Food by day" gap={8}>
        {recent.map((d) => {
          const tot = d.meals.reduce((a, x) => a + x.amt, 0);
          const st = d.meals.length ? (d.meals.every((x) => x.status === "In payroll") ? "In payroll" : "Submitted") : null;
          const [tc, tb] = st ? statusTone(st) : ["#8a93a3", "#f2f4f7"];
          return (
            <button key={d.iso} type="button" role="listitem" onClick={() => onDay(d.iso)}
              aria-label={`${d.wd} ${d.n}: ${tot ? `${inr(tot)} ${st}` : "no meal"} -- add a meal`}
              style={{ flex: "none", width: 104, display: "flex", flexDirection: "column", gap: 4, padding: "10px 11px", borderRadius: 14, border: 0, boxShadow: "0 0 0 1px #e4e7ec", background: tot ? "#fff" : "#fafbfc", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#8a93a3", textTransform: "uppercase", letterSpacing: ".04em" }}>{d.wd} {d.n}</span>
              <b style={{ fontSize: 15, fontWeight: 700, color: tot ? "#0b1220" : "#98a2b3", ...tabNum }}>{tot ? inr(tot) : "—"}</b>
              <span style={{ alignSelf: "flex-start", fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 99, color: tc, background: tb, whiteSpace: "nowrap" }}>{st || "+ add"}</span>
            </button>
          );
        })}
      </Rail>
    </section>
  );
}

/* "See all": the month in full, add a meal, ask for more. */
export function FoodSheet({ food, startDay = null, onClose }) {
  const s = food.stats;
  const [view, setView] = useState(startDay ? "add" : "month");   // month | add | ask
  const [day, setDay] = useState(startDay || food.days[food.days.length - 1]?.iso);
  const [filter, setFilter] = useState("all");
  const [amount, setAmount] = useState("");
  const [bill, setBill] = useState(false);
  const [askAmt, setAskAmt] = useState("");
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState("");
  const amt = Number(amount) || 0, over = amt > s.left;
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
        <span style={{ fontSize: 13, color: "#5b6576" }}>{food.role} limit {inr(s.limit)} a month</span>
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
        <span style={{ fontSize: 12.5, color: "#5b6576" }}>{inr(s.inPayroll)} approved so far goes into {food.month} payroll.</span>
        <button type="button" onClick={() => setView("ask")} style={{ ...btn.ghost, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon d={IC.plus} size={15} />Ask for more</button>
      </section>
      <div style={{ display: "flex", gap: 8, overflowX: "auto" }} className="ec-rail" role="group" aria-label="Filter days">
        {chip("all", `All · ${s.worked}`)}{chip("meals", `With meal · ${s.claimed}`)}{chip("none", `No meal · ${s.worked - s.claimed}`)}
      </div>
      <section style={{ ...card, padding: "2px 14px 8px" }}>
        {weeks.map((w) => {
          const ds = w.days.filter(keep);
          if (!ds.length) return null;
          const sum = w.days.reduce((a, d) => a + d.meals.reduce((b, x) => b + x.amt, 0), 0);
          const first = new Date(w.mon + "T00:00:00");
          return (
            <div key={w.mon}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "12px 2px 4px", fontSize: 12.5, fontWeight: 700 }}>
                <span>{first.getDate()} – {first.getDate() + 6} {food.month}</span><span style={{ color: "#8a93a3", fontWeight: 600, ...tabNum }}>{sum ? inr(sum) : "no meals"}</span>
              </div>
              {ds.map((d) => {
                const tot = d.meals.reduce((a, x) => a + x.amt, 0);
                const st = d.meals.length ? (d.meals.every((x) => x.status === "In payroll") ? "In payroll" : "Submitted") : null;
                const [tc, tb] = st ? statusTone(st) : ["#8a93a3", "#f2f4f7"];
                return (
                  <button key={d.iso} type="button" onClick={() => { setDay(d.iso); setView("add"); }}
                    style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr) auto", gap: 10, alignItems: "center", width: "100%", padding: "10px 2px", border: 0, borderTop: "1px solid #eef1f5", background: "transparent", textAlign: "left", cursor: "pointer" }}>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1, gap: 3 }}><b style={{ fontSize: 17, ...tabNum }}>{d.n}</b><span style={{ fontSize: 10, fontWeight: 600, color: "#8a93a3", textTransform: "uppercase" }}>{d.wd}</span></span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: tot ? "#0b1220" : "#8a93a3", ...ell }}>{tot ? d.meals.map((x) => x.label).join(" + ") : "No meal claimed"}</span>
                      <span style={{ display: "block", fontSize: 12, color: "#8a93a3", ...ell }}>{tot ? (d.meals.some((x) => !x.bill) ? "no bill" : "bill attached") : "tap to add a meal"}</span>
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                      <b style={{ fontSize: 15, ...tabNum }}>{tot ? inr(tot) : "—"}</b>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 99, color: tc, background: tb, whiteSpace: "nowrap" }}>{st || "+ add"}</span>
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

  const add = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "14px 18px 18px" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#344054" }}>Day</span>
        <select value={day} onChange={(e) => setDay(e.target.value)} style={{ height: 48, borderRadius: 12, border: "1.5px solid #e1e5ec", padding: "0 12px", fontSize: 15, background: "#fff" }}>
          {[...food.days].reverse().map((d) => <option key={d.iso} value={d.iso}>{d.wd} {d.n} {food.month}{d.meals.length ? ` · ${inr(d.meals.reduce((a, x) => a + x.amt, 0))} claimed` : ""}</option>)}
        </select>
      </label>
      {dayOf?.meals.length > 0 && (
        <div style={{ ...card, padding: "4px 14px" }}>
          {dayOf.meals.map((x, i) => (
            <div key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", fontSize: 13.5, borderTop: i ? "1px solid #eef1f5" : 0 }}>
              <span>{x.label} <span style={{ color: "#8a93a3" }}>· {x.status}</span></span><b style={tabNum}>{inr(x.amt)}</b>
            </div>
          ))}
        </div>
      )}
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#344054" }}>Amount</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, height: 54, borderRadius: 12, border: `1.5px solid ${over ? "#f04438" : "#e1e5ec"}`, padding: "0 14px", background: "#fff" }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#475467" }}>₹</span>
          <input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Meal amount" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, fontSize: 20, fontWeight: 800, ...tabNum }} />
        </span>
        {over && <span style={{ fontSize: 13, color: "#b42318", fontWeight: 600 }}>Over the limit by {inr(amt - s.left)} — only {inr(s.left)} can be claimed. Ask for more first.</span>}
      </label>
      <button type="button" onClick={() => setBill((b) => !b)} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 52, padding: "0 14px", borderRadius: 12, border: `1.5px ${bill ? "solid #12b76a" : "dashed #b2c8f7"}`, background: bill ? "#f6fef9" : "#f5f8ff", color: bill ? "#067647" : "#1d4ed8", fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
        <Icon d={bill ? IC.check : IC.camera} size={18} />{bill ? "Bill photo attached" : "Attach bill photo"}
      </button>
    </div>
  );

  const askView = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "14px 18px 18px" }}>
      <span style={{ fontSize: 13.5, color: "#5b6576", lineHeight: 1.45 }}>Your manager approves it; until then it shows as asked and the limit stays {inr(s.limit)}.</span>
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
  const footer = view === "add" ? (
    <>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 12, color: "#5b6576" }}>After this meal</span>
        <b style={{ fontSize: 20, ...tabNum }}>{inr(Math.max(0, s.left - amt))} left</b>
      </div>
      <button type="button" onClick={() => setView("month")} style={{ ...btn.ghost, height: 48, borderRadius: 14 }}>Back</button>
      <button type="button" disabled={!amt || over} onClick={() => { food.addMeal(day, amt, bill); setAmount(""); setBill(false); setView("month"); say(`Sample: ${inr(amt)} added — not saved to the ERP`); }}
        style={{ ...footBtn, opacity: !amt || over ? 0.5 : 1 }}>Claim</button>
    </>
  ) : view === "ask" ? (
    <>
      <span style={{ flex: 1 }} />
      <button type="button" onClick={() => setView("month")} style={{ ...btn.ghost, height: 48, borderRadius: 14 }}>Back</button>
      <button type="button" disabled={!Number(askAmt) || why.trim().length < 3} onClick={() => { food.ask(Number(askAmt)); setAskAmt(""); setWhy(""); setView("month"); say(`Sample: ${inr(Number(askAmt))} asked — not sent`); }}
        style={{ ...footBtn, opacity: !Number(askAmt) || why.trim().length < 3 ? 0.5 : 1 }}>Ask</button>
    </>
  ) : (
    <>
      <span style={{ flex: 1, fontSize: 12.5, color: "#5b6576" }}>{s.claimed} of {s.worked} days · {inr(s.used)} used</span>
      <button type="button" onClick={() => setView("add")} style={{ ...footBtn, display: "flex", alignItems: "center", gap: 6 }}><Icon d={IC.plus} size={16} />Add a meal</button>
    </>
  );

  return (
    <Sheet title={view === "add" ? "Add a meal" : view === "ask" ? "Ask for more" : `Food · ${food.month}`}
      sub={view === "month" ? `${inr(s.left)} left of ${inr(s.limit)}` : null}
      chips={<SampleTag />} onClose={onClose} desktop="dialog" maxWidth={560} footer={footer}>
      <div style={{ padding: "12px 18px 0" }}><Note tone="info">Sample data — Food is not connected to the ERP yet, so nothing here is saved.</Note></div>
      {view === "add" ? add : view === "ask" ? askView : month}
      {msg && <div role="status" aria-live="polite" style={{ margin: "0 18px 16px", padding: "10px 14px", borderRadius: 10, background: "#101828", color: "#fff", fontSize: 13 }}>{msg}</div>}
    </Sheet>
  );
}
