"use client";

/* Approvals, one page per kind (27 Nov 2026, the owner) -- ?view=tada / ?view=nonrep / ?view=cars.
 *
 * TA/DA: the approver sees each rep's whole month live -- trips not sent yet and the bills uploaded
 * so far included ("Field Team Month API"). A trip is accepted or sent back once the rep sends it;
 * the month is approved only when every trip is sent and accepted ("Field Month Approve Gate"
 * holds the ERP to the same rule).
 * Non-reported days and car requests: the same layout -- people tabs, a date column, cards that
 * open -- each day / request decided on its own. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BedDouble, Car, Check, ChevronDown, ChevronLeft, ChevronRight, Fuel, Loader2, Lock, MessageSquare, Receipt, TrainFront, UtensilsCrossed, CalendarDays } from "lucide-react";
import {
  CAB_REMARK,
  addClaimComment,
  applyAction,
  approveCabClaim,
  cabBillCheck,
  decideCarRequest,
  decideNonReport,
  decideTrip,
  fetchCarQueue,
  fetchClaimsByRemark,
  fetchNonReportQueue,
  fetchTeamMonth,
  makeConn,
  sendBackCabClaim,
} from "./data/claimsApi";
import { parseTripTag } from "./fieldTrips";
import { FilePreview, billFile, useFileUrl } from "./ui";
import { loggedUser } from "../support-report/data/erpClient";

const cn = (...a) => a.filter(Boolean).join(" ");
const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const dOf = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00`);
const dd = (iso) => `${Number(String(iso).slice(8, 10))} ${MON[Number(String(iso).slice(5, 7)) - 1]}`;
const addDays = (iso, n) => {
  const t = dOf(iso);
  t.setDate(t.getDate() + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const daysBetween = (a, b) => Math.round((dOf(b) - dOf(a)) / 86400000);
const monthOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const prevMonth = () => {
  const t = new Date();
  t.setDate(1);
  t.setMonth(t.getMonth() - 1);
  return monthOf(t);
};
const shiftMonth = (m, n) => {
  const t = dOf(`${m}-01`);
  t.setMonth(t.getMonth() + n);
  return monthOf(t);
};
const monthLabel = (m) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const errText = (e) => String(e?.message || e || "Something went wrong").replace(/^[\w.]+Error:\s*/, "");

const COLORS = ["#2563eb", "#ea580c", "#db2777", "#7c3aed", "#0891b2", "#0f766e", "#b45309", "#16a34a", "#9333ea", "#dc2626"];
const colorOf = (s) => COLORS[[...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];
const initials = (n) =>
  String(n || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
const firstName = (n) => String(n || "").split(/\s+/)[0];

export function viewOfUrl() {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("view");
  return v === "tada" || v === "nonrep" || v === "cars" ? v : null;
}

/* ------------------------------ shared pieces ------------------------------ */

/* a PC screen (27 Nov 2026): people down the left, the list in the middle, the opened one on the right */
function useWide() {
  const q = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/* people + the page body: the strip of avatars on top (the app shell already has its own left menu) */
// eslint-disable-next-line no-unused-vars
function Body({ wide, people, sel, onSel, children }) {
  return (
    <>
      <People list={people} sel={sel} onSel={onSel} />
      {children}
    </>
  );
}

/* the list: cards that open in place on a phone; on a PC a list on the left and the
   opened one in a panel on the right (the first one when none is picked) */
/* the columns fill the window down to the bottom bar (bottom = room kept for it) */
function useFit(wide, bottom = 76) {
  const ref = useRef(null);
  const [h, setH] = useState(null);
  useLayoutEffect(() => {
    if (!wide || !ref.current) return undefined;
    const fit = () => ref.current && setH(Math.max(320, Math.round(window.innerHeight - ref.current.getBoundingClientRect().top - bottom)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  });
  return [ref, h];
}

function Split({ wide, items, open, setOpen, bottom }) {
  const [fitRef, fitH] = useFit(wide, bottom);
  if (!items.length) return <Empty>Nothing here.</Empty>;
  if (!wide)
    return (
      <div className="flex flex-col gap-2.5 px-3 pt-2">
        {items.map((it) => (
          <div key={it.id} className="flex gap-2">
            <Rail from={it.from} to={it.to} />
            <Card {...it.card} open={open === it.id} onToggle={() => setOpen(open === it.id ? null : it.id)}>
              {it.body}
            </Card>
          </div>
        ))}
      </div>
    );
  const cur = items.find((i) => i.id === open) || items[0];
  return (
    <div ref={fitRef} className="grid grid-cols-[minmax(320px,420px)_minmax(0,1fr)] gap-4 px-4 pt-3" style={fitH ? { height: fitH } : undefined}>
      <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto pb-3 pr-1">
        {items.map((it) => (
          <div key={it.id} className="flex gap-2">
            <Rail from={it.from} to={it.to} />
            <Card {...it.card} selected={cur.id === it.id} onToggle={() => setOpen(it.id)} />
          </div>
        ))}
      </div>
      <div className="min-h-0 self-start overflow-y-auto rounded-xl border border-gray-200 bg-white p-4" style={fitH ? { maxHeight: fitH - 12 } : undefined}>
        <div className="mb-3 flex items-start gap-3 border-b border-gray-100 pb-3">
          <span className="min-w-0 flex-1">
            <b className="block text-[17px] font-extrabold">
              {cur.card.tag && <span className={cn("mr-1.5 rounded px-1.5 py-px align-[2px] text-[10px] font-extrabold", cur.card.tag === "HQ" ? "bg-slate-100 text-slate-600" : "bg-indigo-50 text-indigo-700")}>{cur.card.tag}</span>}
              {cur.card.title}
            </b>
            <span className="text-[12.5px] text-gray-500">
              {cur.to && cur.to !== cur.from ? `${dd(cur.from)} – ${dd(cur.to)}` : dd(cur.from)}
              {cur.card.sub ? ` · ${cur.card.sub}` : ""}
            </span>
          </span>
          <span className="flex flex-col items-end gap-1">
            {cur.card.amount != null && <b className="text-[17px] font-extrabold">{inr(cur.card.amount)}</b>}
            {cur.card.label && <i className={cn("rounded-full px-2 py-px text-[11px] font-bold not-italic", CHIP[cur.card.state])}>{cur.card.label}</i>}
          </span>
        </div>
        {cur.body}
      </div>
    </div>
  );
}

function Page({ title, month, onMonth, children }) {
  return (
    <div className="mx-auto flex min-h-full w-full flex-col lg:max-w-none bg-[#f6f7f9] pb-6 font-[Inter,system-ui,sans-serif] text-gray-900">
      <div className="flex items-center gap-2 bg-white px-4 pb-2 pt-4">
        <h1 className="text-[22px] font-extrabold tracking-tight">{title}</h1>
        {month && (
          <span className="ml-1 inline-flex items-center rounded-lg border border-gray-200 text-[13px] font-semibold text-gray-600">
            <button type="button" aria-label="Previous month" className="px-1.5 py-1" onClick={() => onMonth(shiftMonth(month, -1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            {monthLabel(month)}
            <button type="button" aria-label="Next month" className="px-1.5 py-1" onClick={() => onMonth(shiftMonth(month, 1))}>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function People({ list, sel, onSel }) {
  if (!list.length) return null;
  return (
    <div className="flex gap-4 overflow-x-auto border-b border-gray-200 bg-white px-4 pb-2 pt-1">
      {list.map((p) => (
        <button key={p.id} type="button" onClick={() => onSel(p.id)} className="flex w-[64px] flex-none flex-col items-center gap-0.5 pb-1">
          <span
            className={cn("relative grid h-11 w-11 place-items-center rounded-full text-[13px] font-extrabold text-white", sel === p.id && "ring-2 ring-blue-600 ring-offset-2")}
            style={{ background: colorOf(p.name) }}
          >
            {initials(p.name)}
            {p.badge > 0 && (
              <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-white bg-blue-600 px-1 text-[9.5px] font-extrabold">
                {p.badge}
              </span>
            )}
          </span>
          <b className={cn("w-full truncate text-center text-[12px] font-bold", sel === p.id ? "text-blue-700" : "text-gray-700")}>{firstName(p.name)}</b>
          {p.sub && <small className={cn("text-[10px] font-semibold", p.subOk ? "text-green-600" : "text-gray-400")}>{p.sub}</small>}
          {sel === p.id && <i className="mt-0.5 h-[2px] w-10 rounded bg-blue-600" />}
        </button>
      ))}
    </div>
  );
}

function Filters({ items, sel, onSel }) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-1 pt-3">
      {items.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onSel(f.id)}
          className={cn("flex-none rounded-full border px-3 py-1 text-[12.5px] font-bold", sel === f.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700")}
        >
          {f.label} {f.n}
        </button>
      ))}
    </div>
  );
}

function Rail({ from, to }) {
  const a = dOf(from);
  const multi = to && to !== from;
  const b = multi ? dOf(to) : null;
  return (
    <div className="flex w-10 flex-none flex-col items-center pt-1 text-center">
      <small className="text-[9.5px] font-bold text-gray-500">{WD[a.getDay()]}</small>
      <b className="text-[19px] font-extrabold leading-tight">{a.getDate()}</b>
      {multi && (
        <>
          <i className="my-1 w-[2px] flex-1 rounded bg-gray-300" style={{ minHeight: 10 }} />
          <small className="text-[9.5px] font-bold text-gray-500">{WD[b.getDay()]}</small>
          <b className="text-[14px] font-extrabold leading-tight">{b.getDate()}</b>
        </>
      )}
    </div>
  );
}

const CHIP = {
  accepted: "bg-green-600 text-white",
  sent: "bg-green-100 text-green-700",
  back: "bg-red-100 text-red-700",
  notsent: "bg-gray-100 text-gray-600",
  waiting: "bg-gray-100 text-gray-600",
  partial: "bg-amber-50 text-amber-700",
  approved: "bg-green-600 text-white",
  rejected: "bg-red-100 text-red-700",
};
const EDGE = { partial: "border-l-amber-400", accepted: "border-l-green-500", sent: "border-l-green-500", back: "border-l-red-500", notsent: "border-l-gray-300", waiting: "border-l-amber-400", approved: "border-l-green-500", rejected: "border-l-red-500" };

function Card({ state, label, title, tag, sub, amount, open, selected, onToggle, children }) {
  return (
    <div className={cn("min-w-0 flex-1 rounded-xl border border-l-4 bg-white", EDGE[state], state === "notsent" && "border-dashed", (open || selected) && "border-blue-300", selected && "ring-2 ring-blue-500")}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <span className="min-w-0 flex-1">
          <b className="block text-[14px] font-bold leading-tight">
            {tag && <span className={cn("mr-1.5 rounded px-1.5 py-px align-[1px] text-[9.5px] font-extrabold", tag === "HQ" ? "bg-slate-100 text-slate-600" : "bg-indigo-50 text-indigo-700")}>{tag}</span>}
            {title}
          </b>
          {sub && <span className="mt-0.5 block text-[12px] text-gray-500">{sub}</span>}
        </span>
        <span className="flex flex-none flex-col items-end gap-1">
          {amount != null && <b className="text-[14px] font-extrabold">{inr(amount)}</b>}
          {label && <i className={cn("rounded-full px-2 py-px text-[10.5px] font-bold not-italic", CHIP[state])}>{label}</i>}
        </span>
        {selected === undefined && <ChevronDown className={cn("h-4 w-4 flex-none text-gray-400 transition-transform", open && "rotate-180")} />}
      </button>
      {open && children && <div className="border-t border-gray-100 px-3 pb-3 pt-2">{children}</div>}
    </div>
  );
}

function Actions({ busy, backLabel = "Send back", okLabel, onBack, onOk, reasonNeeded = true }) {
  const [back, setBack] = useState(false);
  const [why, setWhy] = useState("");
  if (back)
    return (
      <div className="mt-2 flex flex-col gap-2">
        <textarea autoFocus rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why? They see this." className="w-full rounded-lg border border-gray-300 p-2 text-[13px]" />
        <div className="flex gap-2">
          <button type="button" onClick={() => setBack(false)} className="flex-1 rounded-lg border border-gray-300 py-2 text-[13px] font-bold text-gray-700">
            Cancel
          </button>
          <button
            type="button"
            disabled={!!busy || (reasonNeeded && why.trim().length < 3)}
            onClick={() => onBack(why.trim())}
            className="flex-1 rounded-lg bg-red-600 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {busy === "back" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : backLabel}
          </button>
        </div>
      </div>
    );
  return (
    <div className="mt-2 flex gap-2">
      <button type="button" disabled={!!busy} onClick={() => setBack(true)} className="flex-1 rounded-lg border border-red-200 bg-white py-2 text-[13px] font-bold text-red-700">
        {backLabel}
      </button>
      <button type="button" disabled={!!busy} onClick={onOk} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-600 py-2 text-[13px] font-bold text-white disabled:opacity-60">
        {busy === "ok" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {okLabel}
      </button>
    </div>
  );
}

const Empty = ({ children }) => <p className="px-6 py-10 text-center text-[13px] text-gray-500">{children}</p>;
const Loading = () => (
  <div className="grid place-items-center py-16">
    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
  </div>
);
const Err = ({ msg, onRetry }) => (
  <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-800">
    {msg}{" "}
    {onRetry && (
      <button type="button" className="font-bold underline" onClick={onRetry}>
        Try again
      </button>
    )}
  </div>
);

/* --------------------------------- TA / DA --------------------------------- */

const OS_TYPES = new Set(["OS", "OS-HQ", "OS-EQ", "EQ-HQ", "EQ-EQ"]);
const kindOfDay = (t) => (OS_TYPES.has(t) ? "OS" : "HQ");
const typeWord = (t) => (OS_TYPES.has(t) ? "Outstation" : t === "HQ" ? "HQ day" : "Ex-HQ");
/* "HQ Chennai → Perambur → Kundrathur (56 km)" -> { place: "Kundrathur", km: 56 } */
const placeOf = (route) => {
  const stops = String(route || "")
    .split("→")
    .map((s) => s.trim())
    .filter(Boolean);
  const last = stops[stops.length - 1] || "";
  const m = /\((\d+(?:\.\d+)?)\s*km\)/.exec(last);
  return { place: last.replace(/\(.*?\)/, "").replace(/^HQ[-\s]*/i, "").trim(), km: m ? Math.round(Number(m[1])) : null };
};
const BILL_KIND = { Stay: "stay", Food: "food", Travel: "ticket", Fuel: "fuel", Toll: "toll" };

/* a rep's month -> trips with their days, lines, bills and state */
function tripsOfRep(rep) {
  const days = (rep.days || []).filter((d) => Number(d.total) > 0);
  const lines = (rep.claims || []).flatMap((c) => (c.lines || []).map((l) => ({ ...l, claim: c.name, claimState: c.workflow_state })));
  const byTag = new Map();
  for (const l of lines) {
    // a line the office added with a tag of its own ("Own car · 16–24 Oct · local km", 28 Nov 2026):
    // not a trip -- shown on its own card (extrasOfRep), never decided with a trip
    if (isOfficeTag(l.custom_trip)) continue;
    const t = parseTripTag(l.custom_trip) || { from: String(l.expense_date).slice(0, 10), to: String(l.expense_date).slice(0, 10), name: "" };
    const k = `${t.from}..${t.to}`;
    if (!byTag.has(k)) byTag.set(k, { ...t, lines: [] });
    byTag.get(k).lines.push(l);
  }
  const trips = [...byTag.values()].map((t) => ({ ...t, sent: true }));
  const covered = (date) => trips.some((t) => date >= t.from && date <= t.to);
  // unsent paid days: runs of consecutive days, outstation apart from local
  let run = null;
  for (const d of days) {
    const date = String(d.date).slice(0, 10);
    if (covered(date)) {
      run = null;
      continue;
    }
    const k = kindOfDay(d.day_type);
    if (run && run.kind === k && addDays(run.to, 1) === date) run.to = date;
    else {
      run = { from: date, to: date, kind: k, lines: [], sent: false, name: "" };
      trips.push(run);
    }
  }
  const dayMap = new Map((rep.days || []).map((d) => [String(d.date).slice(0, 10), d]));
  return trips
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((t) => {
      const tdays = [];
      for (let d = t.from; d <= t.to; d = addDays(d, 1)) if (dayMap.get(d)) tdays.push(dayMap.get(d));
      const os = tdays.some((d) => OS_TYPES.has(d.day_type));
      const decisions = t.lines.map((l) => l.custom_trip_decision || "");
      const approvedClaim = t.lines.length && t.lines.every((l) => ["Approved", "Verified", "Paid"].includes(l.claimState));
      const state = !t.sent
        ? "notsent"
        : decisions.includes("Rejected")
          ? "back"
          : approvedClaim || decisions.every((x) => x === "Approved")
            ? "accepted"
            : "sent";
      // bills: on the sent lines, and every upload of the rep falling in the trip (sent or not)
      const bills = [];
      const seen = new Set();
      // one bill counts once (27 Nov 2026): the same bill can sit on the claim and in the register
      // under another file (uploaded twice) -- matched by its type, date and amount too
      const key = (kind, date, amt) => `${kind}|${String(date || "").slice(0, 10)}|${Math.round(Number(amt) || 0)}`;
      for (const l of t.lines)
        if (l.custom_bill && !seen.has(l.custom_bill)) {
          const k = key(l.expense_type, l.custom_bill_date || l.expense_date, l.custom_bill_amount || l.amount);
          if (seen.has(k)) continue;
          seen.add(l.custom_bill);
          seen.add(k);
          bills.push({ url: l.custom_bill, kind: l.expense_type, amount: Number(l.custom_bill_amount) || Number(l.amount) || 0, vendor: l.custom_bill_vendor || "" });
        }
      for (const b of rep.bills || []) {
        const ds = (b.nights || []).length ? b.nights : [b.date];
        if (!b.url || seen.has(b.url) || !ds.some((x) => x >= addDays(t.from, -1) && x <= t.to)) continue;
        const k = key(b.kind, b.date, b.amount);
        if (seen.has(k)) continue;
        seen.add(k);
        seen.add(b.url);
        bills.push({ url: b.url, kind: b.kind, amount: Number(b.amount) || 0, vendor: b.vendor || "", manual: b.manual, flag: b.flag });
      }
      const amount = t.sent ? t.lines.reduce((a, l) => a + (Number(l.amount) || 0), 0) : tdays.reduce((a, d) => a + (Number(d.total) || 0), 0);
      const places = tdays.filter((d) => OS_TYPES.has(d.day_type)).map((d) => placeOf(d.route).place).filter(Boolean);
      const title = os ? String(t.name || "").split(" · ").filter((x) => x && x !== "HQ").pop() || places[0] || "Outstation" : "Local days";
      const nHq = tdays.filter((d) => d.day_type === "HQ").length;
      const nEq = tdays.length - nHq;
      const sub = os
        ? [`${Math.max(1, daysBetween(t.from, t.to))} day${daysBetween(t.from, t.to) > 1 ? "s" : ""} away`, bills.length ? `${bills.length} bill${bills.length > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")
        : [nHq ? `${nHq} HQ` : null, nEq ? `${nEq} EQ` : null].filter(Boolean).join(" · ");
      const note = t.lines.find((l) => l.custom_trip_decision === "Rejected")?.custom_trip_note || "";
      const claim = t.lines[0]?.claim || null;
      const claimState = t.lines[0]?.claimState || null;
      return { ...t, id: `${t.from}..${t.to}`, days: tdays, os, state, bills, amount, title, sub, note, claim, claimState };
    });
}

/* a tag that is set but is not "from..to · name": the office's own lines (28 Nov 2026) */
const isOfficeTag = (tag) => !!String(tag || "").trim() && !parseTripTag(tag);
/* "Own car · 16–24 Oct · local km" (or "28 Sep–2 Oct") -> { from, to } in the line's year */
const rangeOfTag = (tag, year) => {
  const m = /(\d{1,2})(?:\s+([A-Z][a-z]{2}))?\s*[–-]\s*(\d{1,2})\s+([A-Z][a-z]{2})/.exec(String(tag || ""));
  if (!m) return null;
  const mi = (w) => MON.indexOf(w) + 1;
  const m2 = mi(m[4]);
  const m1 = m[2] ? mi(m[2]) : m2;
  if (!m1 || !m2) return null;
  const iso = (mo, d) => `${year}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { from: iso(m1, m[1]), to: iso(m2, m[3]) };
};
/* the office's lines of a rep's month, one group per tag: "Own car · 16–24 Oct · local km" */
function extrasOfRep(rep) {
  const groups = new Map();
  for (const c of rep.claims || [])
    for (const l of c.lines || []) {
      if (!isOfficeTag(l.custom_trip)) continue;
      const tag = String(l.custom_trip).trim();
      if (!groups.has(tag)) groups.set(tag, { tag, lines: [], claimState: c.workflow_state });
      groups.get(tag).lines.push({ ...l, claim: c.name, claimState: c.workflow_state });
    }
  return [...groups.values()].map((g) => {
    const ds = g.lines.map((l) => String(l.expense_date).slice(0, 10)).sort();
    const r = rangeOfTag(g.tag, (ds[0] || "").slice(0, 4)) || { from: ds[0], to: ds[ds.length - 1] };
    const parts = g.tag.split(" · ").map((x) => x.trim()).filter(Boolean);
    const decisions = g.lines.map((l) => l.custom_trip_decision || "");
    const done = g.lines.every((l) => ["Approved", "Verified", "Paid"].includes(l.claimState));
    const state = decisions.includes("Rejected") ? "back" : done || decisions.every((x) => x === "Approved") ? "accepted" : "sent";
    return {
      id: `office:${g.tag}`,
      ...r,
      car: /own car/i.test(g.tag) || g.lines.every((l) => l.expense_type === "Fuel"),
      title: parts[0] || "Added by the office",
      sub: [parts.slice(1).join(" · "), "added by the office"].filter(Boolean).join(" · "),
      lines: g.lines,
      state,
      amount: g.lines.reduce((a, l) => a + (Number(l.amount) || 0), 0),
    };
  });
}

/* the local days between outstation trips as ONE HQ & EQ block (27 Nov 2026, as the rep's own
   HQ & EQ card): a row per day with its own state; accept / send back covers its sent days */
function blocksOf(trips) {
  const out = [];
  for (const t of trips) {
    const last = out[out.length - 1];
    if (!t.os && last && last.local) last.parts.push(t);
    else out.push(t.os ? t : { local: true, parts: [t] });
  }
  return out.map((b) => {
    if (!b.local) return b;
    const ps = b.parts;
    const days = ps.flatMap((p) => p.days);
    const nHq = days.filter((d) => d.day_type === "HQ").length;
    const has = (st) => ps.some((p) => p.state === st);
    const nNot = ps.filter((p) => p.state === "notsent").reduce((a, p) => a + p.days.length, 0);
    const state = has("back") ? "back" : has("sent") ? "sent" : has("notsent") ? (has("accepted") ? "partial" : "notsent") : "accepted";
    const dayState = {};
    for (const p of ps) for (const d of p.days) dayState[String(d.date).slice(0, 10)] = { state: p.state, sent: p.sent };
    return {
      id: `local:${ps[0].from}`,
      from: ps[0].from,
      to: ps[ps.length - 1].to,
      os: false,
      local: true,
      parts: ps,
      days,
      lines: ps.flatMap((p) => p.lines),
      sent: ps.every((p) => p.sent),
      state,
      dayState,
      bills: ps.flatMap((p) => p.bills),
      amount: ps.reduce((a, p) => a + p.amount, 0),
      title: "HQ & EQ days",
      sub: [nHq ? `${nHq} HQ` : null, days.length - nHq ? `${days.length - nHq} EQ` : null].filter(Boolean).join(" · "),
      partialLabel: nNot ? `${nNot} day${nNot > 1 ? "s" : ""} not sent` : null,
      note: ps.map((p) => p.note).filter(Boolean).join(" · "),
    };
  });
}
const STATE_LABEL = { accepted: "Accepted", sent: "Sent", back: "Sent back", notsent: "Not sent yet", partial: "Partly sent" };

function BillTile({ conn, bill, onOpen }) {
  const file = useMemo(() => billFile(bill.url), [bill.url]);
  const img = file?.kind === "image";
  const { status, url } = useFileUrl(img ? conn : null, img ? file : null);
  const Icon = { Stay: BedDouble, Food: UtensilsCrossed, Travel: TrainFront, Fuel, Toll: Receipt }[bill.kind] || Receipt;
  const warn = bill.manual || bill.flag;
  return (
    <button type="button" onClick={onOpen} className={cn("flex w-[96px] flex-none flex-col overflow-hidden rounded-xl border bg-white text-left", warn ? "border-amber-300" : "border-gray-200")}>
      <span className="relative grid h-[56px] w-full place-items-center overflow-hidden bg-gray-100 text-gray-400">
        {img && status === "ready" ? <img src={url} alt="" className="h-full w-full object-cover object-top" /> : file?.kind === "pdf" ? <b className="text-[11px] text-red-700">PDF</b> : <Icon className="h-5 w-5" />}
        <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-md bg-white/95 text-gray-700 shadow-sm">
          <Icon className="h-3 w-3" />
        </span>
      </span>
      <span className="flex items-center justify-between gap-1 px-2 py-1">
        <b className="text-[12.5px] font-extrabold">{inr(bill.amount)}</b>
        {warn && <span className="whitespace-nowrap text-[9px] font-bold text-amber-700">by hand</span>}
      </span>
    </button>
  );
}

function TripBody({ conn, trip, office = [], busy, onAccept, onBack }) {
  const [full, setFull] = useState(null);
  const files = useMemo(() => trip.bills.map((b) => billFile(b.url)).filter(Boolean), [trip.bills]);
  const lineOf = (date, type) => trip.lines.filter((l) => String(l.expense_date).slice(0, 10) === date && l.expense_type === type).reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const billTotal = trip.bills.reduce((a, b) => a + b.amount, 0);
  // an own-car trip (28 Nov 2026): its fuel bills, one summary row -- the fuel lines if sent, else the bills
  const fuelLines = trip.lines.filter((l) => l.expense_type === "Fuel");
  const fuelBills = trip.bills.filter((b) => b.kind === "Fuel");
  const fuelTotal = fuelLines.length
    ? fuelLines.reduce((a, l) => a + (Number(l.amount) || 0), 0)
    : fuelBills.length
      ? fuelBills.reduce((a, b) => a + b.amount, 0)
      : null;
  /* a sent outstation trip's DA is pooled (27 Nov 2026): each OS day shows its share -- the trip's
     stay + food + DA lines split in proportion to each day's own allowance -- as "OS day i/n" */
  const osDays = trip.days.filter((d) => OS_TYPES.has(d.day_type) && Number(d.da) > 0);
  const osDates = new Set(osDays.map((d) => String(d.date).slice(0, 10)));
  const pooled = trip.sent ? trip.lines.filter((l) => osDates.has(String(l.expense_date).slice(0, 10)) && ["Stay", "Food", "Daily Allowance"].includes(l.expense_type)).reduce((a, l) => a + (Number(l.amount) || 0), 0) : null;
  const base = osDays.reduce((a, d) => a + Number(d.da), 0);
  const shareOf = {};
  let given = 0;
  osDays.forEach((d, i) => {
    const sh = pooled == null ? Number(d.da) : i === osDays.length - 1 ? Math.round(pooled - given) : base ? Math.round((pooled * Number(d.da)) / base) : 0;
    given += sh;
    shareOf[String(d.date).slice(0, 10)] = { sh, i: i + 1, n: osDays.length };
  });
  return (
    <>
      <div className="grid grid-cols-[30px_minmax(0,1fr)_52px_52px] gap-x-2 pb-1 text-[9.5px] font-bold uppercase tracking-wide text-gray-400">
        <span>Day</span>
        <span>Place</span>
        <span className="text-right">TA</span>
        <span className="text-right">DA</span>
      </div>
      {trip.days.map((d) => {
        const date = String(d.date).slice(0, 10);
        const { place, km } = placeOf(d.route);
        const ta = (trip.dayState ? trip.dayState[date]?.sent : trip.sent) ? lineOf(date, "Travel") : Number(d.ta) || 0;
        const os = shareOf[date];
        const ds = trip.dayState ? trip.dayState[date] : null;
        const daySent = ds ? ds.sent : trip.sent;
        const da = os ? os.sh : daySent ? lineOf(date, "Daily Allowance") : Number(d.da) || 0;
        return (
          <div key={date} className="grid grid-cols-[30px_minmax(0,1fr)_52px_52px] items-start gap-x-2 py-1 text-[12px]">
            <b className="text-gray-700">{Number(date.slice(8))}</b>
            <span className="min-w-0">
              <span className="block break-words text-gray-800">{place || "—"}</span>
              <span className={cn("text-[10.5px] font-semibold", OS_TYPES.has(d.day_type) ? "text-indigo-700" : "text-slate-500")}>
                {typeWord(d.day_type)}
                {km ? <span className="ml-1 font-semibold text-gray-500">{km} km</span> : null}
                {os && os.n > 1 ? <span className="ml-1 font-semibold text-gray-400">· OS day {os.i}/{os.n}</span> : null}
                {ds && ds.state !== "accepted" ? <span className={cn("ml-1.5 rounded-full px-1.5 text-[10px] font-bold", CHIP[ds.state])}>{STATE_LABEL[ds.state]}</span> : null}
              </span>
            </span>
            <b className="text-right">{inr(ta)}</b>
            <b className="text-right">{inr(da)}</b>
          </div>
        );
      })}
      {(fuelTotal != null || office.length > 0) && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[12px]">
          <Car className="mt-0.5 h-4 w-4 flex-none text-gray-500" aria-hidden />
          <span className="min-w-0 flex-1 text-gray-700">
            <b className="text-gray-900">Own car</b>
            {fuelTotal != null ? <> · fuel {inr(fuelTotal)}</> : null}
            <span className="block text-[11px] text-gray-500">TA on car days ₹0 — paid from fuel</span>
            {/* the office's own car lines over this trip's days: named here, listed on their own card */}
            {office.map((o) => (
              <span key={o.id} className="block text-[11px] text-gray-500">
                Fuel for {rangeWords(o.from, o.to)} {inr(o.amount)} · added by the office, on its own card
              </span>
            ))}
          </span>
        </div>
      )}
      {trip.bills.length > 0 && (
        <>
          <p className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
            Bills · {trip.bills.length} · {inr(billTotal)}
          </p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {trip.bills.map((b) => (
              <BillTile key={b.url} conn={conn} bill={b} onOpen={() => setFull(billFile(b.url))} />
            ))}
          </div>
        </>
      )}
      {trip.note && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[12px] text-red-800">Sent back: {trip.note}</p>}
      <div className="mt-2 flex justify-between border-t border-dashed border-gray-200 pt-2 text-[12.5px]">
        <span className="text-gray-600">{trip.sent ? "Claimed" : "So far"}</span>
        <b>{inr(trip.amount)}</b>
      </div>
      {trip.state === "sent" && trip.local && (
        <p className="mt-2 text-[11.5px] text-gray-500">
          Accepts the {trip.parts.filter((p) => p.state === "sent").reduce((a, p) => a + p.days.length, 0)} sent day(s); days not sent yet wait.
        </p>
      )}
      {trip.state === "sent" && <Actions busy={busy} backLabel="Send back trip" okLabel="Accept trip" onOk={onAccept} onBack={onBack} />}
      {trip.state === "notsent" && <p className="mt-2 text-[11.5px] text-gray-500">Not sent yet — accept it once it is sent.</p>}
      {trip.state === "partial" && <p className="mt-2 text-[11.5px] text-gray-500">{trip.partialLabel} yet — the rest are accepted.</p>}
      {full && conn ? <FilePreview conn={conn} file={full} files={files} onClose={() => setFull(null)} /> : null}
    </>
  );
}

const rangeWords = (from, to) => (!from ? "" : from === to ? dd(from) : from.slice(5, 7) === to.slice(5, 7) ? `${Number(from.slice(8))}–${dd(to)}` : `${dd(from)}–${dd(to)}`);

/* Lines the office added to the rep's claim under a tag of their own (28 Nov 2026), e.g. the
   own car's fuel "Own car · 16–24 Oct · local km": listed here, no trip actions -- they go
   with the month's approval. */
function OfficeBody({ conn, group: g }) {
  const [full, setFull] = useState(null);
  const lines = useMemo(() => [...g.lines].sort((a, b) => String(a.expense_date).localeCompare(String(b.expense_date))), [g.lines]);
  const files = useMemo(() => lines.map((l) => (l.custom_bill ? billFile(l.custom_bill) : null)).filter(Boolean), [lines]);
  const bills = lines.filter((l) => l.custom_bill).map((l) => ({ url: l.custom_bill, kind: l.expense_type, amount: Number(l.custom_bill_amount) || Number(l.amount) || 0, vendor: l.custom_bill_vendor || "" }));
  return (
    <>
      {g.car && (
        <p className="mb-2 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[12px] text-gray-700">
          <Car className="mt-0.5 h-4 w-4 flex-none text-gray-500" aria-hidden />
          <span>
            <b className="text-gray-900">Own car</b> · {rangeWords(g.from, g.to)}
            <span className="block text-[11px] text-gray-500">TA on car days ₹0 — paid from fuel</span>
          </span>
        </p>
      )}
      {lines.map((l) => {
        const Icon = l.expense_type === "Fuel" ? Fuel : Receipt;
        return (
          <div key={l.name || `${l.expense_date}-${l.amount}`} className="flex items-center gap-2 border-b border-gray-100 py-1.5 text-[12px] last:border-b-0">
            <Icon className="h-4 w-4 flex-none text-gray-500" aria-hidden />
            <b className="w-12 flex-none text-gray-800">{dd(l.expense_date)}</b>
            <span className="min-w-0 flex-1 truncate text-gray-600">{[l.expense_type, l.custom_bill_vendor].filter(Boolean).join(" · ")}</span>
            <b className="tabular-nums">{inr(l.amount)}</b>
          </div>
        );
      })}
      {bills.length > 0 && (
        <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
          {bills.map((b) => (
            <BillTile key={b.url} conn={conn} bill={b} onOpen={() => setFull(billFile(b.url))} />
          ))}
        </div>
      )}
      <div className="mt-2 flex justify-between border-t border-dashed border-gray-200 pt-2 text-[12.5px]">
        <span className="text-gray-600">Added by the office</span>
        <b>{inr(g.amount)}</b>
      </div>
      <p className="mt-2 text-[11.5px] text-gray-500">On the TA/DA claim — approved with the month, not trip by trip.</p>
      {full && conn ? <FilePreview conn={conn} file={full} files={files} onClose={() => setFull(null)} /> : null}
    </>
  );
}

/* A manager's (SM / ZSM) monthly CAB claim (28 Nov 2026): remark "Field Cab · YYYY-MM",
   bills paid by Accounts outside payroll -- decided on its own, never with the TA/DA month.
   Same two steps as the combined page's CabClaimPanel: Approve, or a comment + Reject. */
const CAB_TONE = { "not checked": "text-amber-700", handwritten: "text-amber-700", "possible repeat": "text-red-700", checked: "text-green-700" };
const cabCheck = (ai) => {
  const w = cabBillCheck(ai);
  return [w, CAB_TONE[w]];
};
const cabState = (st) => (st === "Waiting for Approval" ? "sent" : ["Approved", "Verified", "Paid"].includes(st) ? "approved" : st === "Rejected" ? "rejected" : "notsent");
const CAB_LABEL = { sent: "To approve", approved: "Approved", rejected: "Sent back", notsent: "Not sent yet" };

function CabRow({ conn, line, onOpen }) {
  const file = useMemo(() => (line.bill ? billFile(line.bill) : null), [line.bill]);
  const img = file?.kind === "image";
  const { status, url } = useFileUrl(img ? conn : null, img ? file : null);
  const [word, tone] = cabCheck(line.ai);
  const vendor = line.ai?.vendor || String(line.note || "").split(" · ")[1] || "Cab";
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_auto_44px] items-center gap-x-2 border-b border-gray-100 py-1.5 text-[12px] last:border-b-0">
      <span className="text-center leading-none">
        <b className="block text-[14px] text-gray-800">{Number(line.date.slice(8, 10))}</b>
        <small className="text-[9.5px] font-bold uppercase text-gray-500">{MON[Number(line.date.slice(5, 7)) - 1]}</small>
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-gray-800">{vendor}</span>
        <span className={cn("block truncate text-[10.5px] font-semibold", tone)}>{word === "checked" ? "bill checked" : line.ai?.reason ? `${word} · ${line.ai.reason}` : word}</span>
      </span>
      <b className="text-right tabular-nums">{inr(line.amount)}</b>
      {file ? (
        <button type="button" onClick={onOpen} aria-label={`Bill ${dd(line.date)} ${inr(line.amount)}`} className="relative grid h-10 w-11 place-items-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100 text-gray-400">
          {img && status === "ready" ? <img src={url} alt="" className="h-full w-full object-cover object-top" /> : file.kind === "pdf" ? <b className="text-[10px] text-red-700">PDF</b> : <Receipt className="h-4 w-4" />}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function CabBody({ conn, claim: c, canAct, busy, onApprove, onBack }) {
  const [full, setFull] = useState(null);
  const lines = useMemo(() => [...c.lines].sort((a, b) => a.date.localeCompare(b.date)), [c.lines]);
  const files = useMemo(() => lines.filter((l) => l.bill).map((l) => billFile(l.bill)).filter(Boolean), [lines]);
  const total = lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const flagged = lines.filter((l) => cabCheck(l.ai)[0] !== "checked").length;
  const st = cabState(c.status);
  return (
    <>
      <div className="grid grid-cols-[34px_minmax(0,1fr)_auto_44px] gap-x-2 pb-1 text-[9.5px] font-bold uppercase tracking-wide text-gray-400">
        <span>Day</span>
        <span>Cab</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Bill</span>
      </div>
      {lines.map((l) => (
        <CabRow key={l.id} conn={conn} line={l} onOpen={() => setFull(billFile(l.bill))} />
      ))}
      <div className="mt-2 flex justify-between border-t border-dashed border-gray-200 pt-2 text-[12.5px]">
        <span className="text-gray-600">
          {lines.length} bill{lines.length === 1 ? "" : "s"}
          {flagged ? <span className="ml-1 font-semibold text-amber-700">· {flagged} to look at</span> : null}
        </span>
        <b>{inr(total)}</b>
      </div>
      <p className="mt-2 text-[11.5px] text-gray-500">Not TA/DA. Approving is final — Accounts pay cabs outside payroll. The TA/DA Approve below does not cover these.</p>
      {st === "sent" && canAct && <Actions busy={busy} backLabel="Send back" okLabel="Approve cabs" onOk={onApprove} onBack={onBack} />}
      {st === "sent" && !canAct && <p className="mt-2 text-[11.5px] text-gray-500">Waiting for its own approver.</p>}
      {full && conn ? <FilePreview conn={conn} file={full} files={files} onClose={() => setFull(null)} /> : null}
    </>
  );
}

function TaDaView({ conn }) {
  const wide = useWide();
  const [month, setMonth] = useState(prevMonth);
  const [data, setData] = useState({ status: "loading" });
  const [sel, setSel] = useState(null);
  const [flt, setFlt] = useState("all");
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null); // { trip, what }
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => {
    setData((s) => ({ ...s, status: s.reps ? "ready" : "loading" }));
    fetchTeamMonth(conn, month)
      .then((m) => setData({ status: "ready", reps: m.reps || [] }))
      .catch((e) => setData({ status: "error", error: errText(e) }));
  }, [conn, month]);
  useEffect(() => {
    setData({ status: "loading" });
    load();
  }, [load]);

  const reps = useMemo(
    () =>
      (data.reps || [])
        .map((r) => {
          const trips = tripsOfRep(r);
          const sent = trips.filter((t) => t.sent).length;
          const acc = trips.filter((t) => t.state === "accepted").length;
          const toAccept = trips.filter((t) => t.state === "sent").length;
          const waiting = (r.claims || []).filter((c) => c.workflow_state === "Waiting for Approval");
          const done = trips.length > 0 && (r.claims || []).every((c) => ["Approved", "Verified", "Paid"].includes(c.workflow_state)) && sent === trips.length;
          // what the page counts: the cards (a run of HQ / EQ days is one card)
          const blocks = blocksOf(trips);
          const dayN = (st) => trips.filter(st).reduce((a, t) => a + t.days.filter((d) => Number(d.total) > 0).length, 0);
          const card = { n: dayN(() => true), sent: dayN((t) => t.sent), acc: dayN((t) => t.state === "accepted"), toAccept: blocks.filter((b) => b.state === "sent").length };
          return { ...r, trips, blocks, extras: extrasOfRep(r), card, sent, acc, toAccept: card.toAccept, waiting, done };
        })
        .filter((r) => r.trips.length)
        .sort((a, b) => b.toAccept - a.toAccept || a.done - b.done || String(a.name).localeCompare(String(b.name))),
    [data.reps]
  );
  const rep = reps.find((r) => r.employee === sel) || reps[0] || null;
  useEffect(() => {
    if (rep && rep.employee !== sel) setSel(rep.employee);
  }, [rep, sel]);

  // the person's cab claim(s) of the month (28 Nov 2026) -- read on their own, decided on their own
  const [me, setMe] = useState(null);
  useEffect(() => {
    let alive = true;
    loggedUser(conn).then((u) => alive && setMe(u));
    return () => {
      alive = false;
    };
  }, [conn]);
  const [cabs, setCabs] = useState({ key: null, list: [] });
  const [cabTick, setCabTick] = useState(0);
  const repId = rep?.employee || null;
  useEffect(() => {
    if (!repId) return undefined;
    let alive = true;
    const key = `${repId}|${month}`;
    fetchClaimsByRemark(conn, repId, `${CAB_REMARK}${month}`, 20)
      .then((list) => alive && setCabs({ key, list: (list || []).filter((c) => c.lines.length) }))
      .catch(() => alive && setCabs({ key, list: [] }));
    return () => {
      alive = false;
    };
  }, [conn, repId, month, cabTick]);
  const cabList = cabs.key === `${repId}|${month}` ? cabs.list : [];

  const run = async (trip, what, fn, ok) => {
    setBusy({ trip: trip?.id || "month", what });
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ ok: true, text: ok });
      load();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  };
  // a block decides each of its sent parts (each in its own claim / trip tag)
  const partsOf = (t) => (t.local ? t.parts.filter((p) => p.state === "sent") : [t]);
  const accept = (t) =>
    run(
      t,
      "ok",
      async () => {
        for (const p of partsOf(t)) await decideTrip(conn, { claim: p.claim, rows: p.lines.map((l) => l.name), decision: "Approved", note: "", trip: `${dd(p.from)}–${dd(p.to)} · ${p.title}` });
      },
      `${t.title} accepted`
    );
  const sendBack = (t, why) =>
    run(
      t,
      "back",
      async () => {
        const claims = new Map();
        for (const p of partsOf(t)) {
          await decideTrip(conn, { claim: p.claim, rows: p.lines.map((l) => l.name), decision: "Rejected", note: why, trip: `${dd(p.from)}–${dd(p.to)} · ${p.title}` });
          claims.set(p.claim, p.claimState);
        }
        for (const [c, st] of claims) {
          await addClaimComment(conn, c, `Sent back -- ${dd(t.from)}–${dd(t.to)} ${t.title}: ${why}`);
          if (st === "Waiting for Approval") await applyAction(conn, c, "Reject");
        }
      },
      `${t.title} sent back to ${firstName(rep?.name)}`
    );
  const cabRun = async (c, what, fn, ok) => {
    setBusy({ trip: `cab:${c.id}`, what });
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      setCabTick((n) => n + 1);
    } catch (e) {
      const t = errText(e);
      setMsg({ ok: false, text: /modified after/i.test(t) ? "The cab claim changed meanwhile. Refresh and try again." : t });
    } finally {
      setBusy(null);
    }
  };
  const cabTotal = (c) => c.lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const approveCabs = (c) => cabRun(c, "ok", () => approveCabClaim(conn, c.id), `${firstName(c.employeeName || rep?.name)}'s cabs approved — ${inr(cabTotal(c))}, a record for Accounts (not TA/DA, not payroll)`);
  const sendBackCabs = (c, why) =>
    cabRun(
      c,
      "back",
      () => sendBackCabClaim(conn, c.id, why),
      `${firstName(c.employeeName || rep?.name)}'s cabs sent back`
    );
  const cabItems = cabList
    .filter((c) => {
      const st = cabState(c.status);
      return flt === "all" || (flt === "accept" ? st === "sent" : flt === "accepted" ? st === "approved" : flt === "notsent" ? st === "notsent" || st === "rejected" : false);
    })
    .map((c) => {
      const ds = c.lines.map((l) => l.date).filter(Boolean).sort();
      const st = cabState(c.status);
      const canAct = st === "sent" && !!me && c.approver === me;
      return {
        id: `cab:${c.id}`,
        from: ds[0] || `${month}-01`,
        to: ds[ds.length - 1] || ds[0] || `${month}-01`,
        card: {
          state: st,
          label: CAB_LABEL[st],
          title: (
            <>
              <Car className="mr-1 inline h-4 w-4 align-[-3px] text-gray-500" aria-hidden />
              Cabs
            </>
          ),
          sub: `${c.lines.length} bill${c.lines.length === 1 ? "" : "s"} · paid by Accounts`,
          amount: cabTotal(c),
        },
        body: <CabBody conn={conn} claim={c} canAct={canAct} busy={busy?.trip === `cab:${c.id}` ? busy.what : null} onApprove={() => approveCabs(c)} onBack={(why) => sendBackCabs(c, why)} />,
      };
    });
  const approveMonth = () =>
    run(
      null,
      "month",
      async () => {
        for (const c of rep.waiting) await applyAction(conn, c.name, "Approve");
      },
      `${firstName(rep.name)}'s ${monthLabel(month)} approved`
    );

  const trips = rep ? rep.blocks : [];
  const extras = rep ? rep.extras || [] : [];
  const officeOver = (t) => extras.filter((o) => o.car && o.from && o.from <= t.to && o.to >= t.from);
  // no trip actions on them: under All, and Accepted once decided -- never "To accept"
  const fltOk = (st) => flt === "all" || (flt === "accepted" && st === "accepted") || (flt === "notsent" && st === "back");
  const officeItems = extras
    .filter((o) => fltOk(o.state))
    .map((o) => ({
      id: o.id,
      from: o.from,
      to: o.to,
      card: {
        state: o.state === "sent" ? "waiting" : o.state,
        label: o.state === "accepted" ? "Accepted" : o.state === "back" ? "Sent back" : "With the month",
        title: (
          <>
            {o.car ? <Car className="mr-1 inline h-4 w-4 align-[-3px] text-gray-500" aria-hidden /> : null}
            {o.title}
          </>
        ),
        sub: o.sub,
        amount: o.amount,
      },
      body: <OfficeBody conn={conn} group={o} />,
    }));
  const exSt = extras.map((o) => o.state);
  const cabSt = cabList.map((c) => cabState(c.status));
  const counts = {
    all: trips.length + cabSt.length + exSt.length,
    accept: trips.filter((t) => t.state === "sent").length + cabSt.filter((x) => x === "sent").length,
    notsent: trips.filter((t) => t.state === "notsent" || t.state === "back" || t.state === "partial").length + cabSt.filter((x) => x === "notsent" || x === "rejected").length + exSt.filter((x) => x === "back").length,
    accepted: trips.filter((t) => t.state === "accepted").length + cabSt.filter((x) => x === "approved").length + exSt.filter((x) => x === "accepted").length,
  };
  const shown = trips.filter((t) => flt === "all" || (flt === "accept" ? t.state === "sent" : flt === "notsent" ? t.state === "notsent" || t.state === "back" || t.state === "partial" : t.state === "accepted"));
  const canApprove = rep && rep.sent === rep.trips.length && rep.acc === rep.trips.length && rep.waiting.length > 0;

  return (
    <Page title="TA/DA approvals" month={month} onMonth={setMonth}>
      {data.status === "loading" && <Loading />}
      {data.status === "error" && <Err msg={data.error} onRetry={load} />}
      {data.status === "ready" && !reps.length && <Empty>No field TA/DA from your team for {monthLabel(month)}.</Empty>}
      {data.status === "ready" && rep && (
        <>
          <Body
            wide={wide}
            people={reps.map((r) => ({ id: r.employee, name: r.name, badge: r.toAccept, sub: r.done ? "approved" : r.card.sent === r.card.n ? "all sent" : `${r.card.sent}/${r.card.n} days`, subOk: r.done || r.card.sent === r.card.n }))}
            sel={rep.employee}
            onSel={(id) => {
              setSel(id);
              setOpen(null);
              setMsg(null);
            }}
          >
          <div className="mx-4 mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <b className="text-blue-900">
                {rep.card.sent} of {rep.card.n} days sent · {rep.card.acc} accepted
              </b>
              <span className="text-[11.5px] font-semibold text-slate-500">{rep.done ? "Approved" : `Approve once all ${rep.card.n} days are in`}</span>
            </div>
            <div className="mt-1.5 flex h-[5px] overflow-hidden rounded-full bg-blue-100">
              <i className="block bg-green-600" style={{ width: `${(rep.card.acc / rep.card.n) * 100}%` }} />
              <i className="block bg-blue-300" style={{ width: `${((rep.card.sent - rep.card.acc) / rep.card.n) * 100}%` }} />
            </div>
          </div>
          <Filters
            items={[
              { id: "all", label: "All", n: counts.all },
              { id: "accept", label: "To accept", n: counts.accept },
              { id: "notsent", label: "Not sent", n: counts.notsent },
              { id: "accepted", label: "Accepted", n: counts.accepted },
            ]}
            sel={flt}
            onSel={setFlt}
          />
          {msg && <p className={cn("mx-4 mt-2 rounded-lg px-3 py-2 text-[12.5px]", msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}>{msg.text}</p>}
          <Split
            wide={wide}
            open={open}
            setOpen={setOpen}
            items={shown.map((t) => ({
              id: t.id,
              from: t.from,
              to: t.to,
              card: { state: t.state, label: t.state === "partial" ? t.partialLabel : STATE_LABEL[t.state], tag: t.os ? "OS" : "HQ", title: t.title, sub: t.sub, amount: t.amount },
              body: <TripBody conn={conn} trip={t} office={officeOver(t)} busy={busy?.trip === t.id ? busy.what : null} onAccept={() => accept(t)} onBack={(why) => sendBack(t, why)} />,
            })).concat(officeItems).sort((a, b) => String(a.from).localeCompare(String(b.from))).concat(cabItems)}
          />
          {!rep.done && (
            <div className="sticky bottom-0 mt-3 flex items-center gap-2 border-t border-gray-200 bg-white px-4 py-3">
              <span className="flex-1 text-[13px]">
                <b>
                  {rep.card.acc} of {rep.card.n} days accepted
                </b>
                <small className="block text-[11px] text-gray-500">{canApprove ? "Everything is in" : rep.card.sent < rep.card.n ? `${rep.card.n - rep.card.sent} day${rep.card.n - rep.card.sent > 1 ? "s" : ""} not sent yet` : `${rep.card.toAccept} waiting for you`}</small>
              </span>
              <button
                type="button"
                disabled={!canApprove || !!busy}
                onClick={approveMonth}
                className={cn("flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[14px] font-bold", canApprove ? "bg-green-600 text-white" : "bg-gray-200 text-gray-400")}
              >
                {busy?.trip === "month" ? <Loader2 className="h-4 w-4 animate-spin" /> : canApprove ? <Check className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                Approve
              </button>
            </div>
          )}
          </Body>
        </>
      )}
    </Page>
  );
}

/* ---------------------------- non-reported days ---------------------------- */

const nrHq = (hq) => String(hq || "").replace(/^HQ[-\s]*/i, "");
function nrSummary(r) {
  let docs = 0;
  let meet = 0;
  const other = [];
  for (const e of r.entries || []) {
    if (e.type === "doctor_visit") docs += (e.doctors || []).length;
    else if (e.type === "meeting" || e.type === "meeting_hq" || (e.type === "other" && e.other_type === "Meeting")) meet += 1;
    else if (e.type === "leave") other.push(e.leave_type || "Leave");
    else if (e.type === "other") other.push(e.other_type);
  }
  return [docs ? `${docs} visit${docs > 1 ? "s" : ""}` : null, meet ? `${meet > 1 ? meet + " meetings" : "meeting"}` : null, ...other].filter(Boolean).join(" + ") || "Day";
}
const titleCase = (x) => String(x || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
function nrTowns(r) {
  // title case, each town once ("TRISSUR" and "Trissur" are one)
  const t = new Map();
  const add = (x) => x && !t.has(String(x).toLowerCase()) && t.set(String(x).toLowerCase(), titleCase(x));
  for (const e of r.entries || []) for (const d of e.doctors || []) add(d.city || nrHq(e.hq));
  for (const e of r.entries || []) if (e.type !== "doctor_visit" && e.hq) add(nrHq(e.hq));
  return [...t.values()];
}
function NrBody({ r, busy, onApprove, onReject }) {
  return (
    <>
      {(r.entries || []).map((e, i) => {
        if (e.type === "doctor_visit") {
          const byTown = new Map();
          for (const d of e.doctors || []) {
            const k = titleCase(d.city || nrHq(e.hq)) || "—";
            if (!byTown.has(k)) byTown.set(k, []);
            byTown.get(k).push(d.name);
          }
          return [...byTown.entries()].map(([town, names]) => (
            <p key={`${i}-${town}`} className="border-b border-gray-100 py-1 text-[12px] leading-snug text-gray-600">
              <b className="mr-1 text-gray-900">{town}</b>
              {names.join(", ")}
            </p>
          ));
        }
        return (
          <p key={i} className="flex items-start gap-1.5 border-b border-gray-100 py-1 text-[12px]">
            <CalendarDays className="mt-0.5 h-3.5 w-3.5 flex-none text-gray-500" />
            <span>
              <b>{e.type === "leave" ? e.leave_type || "Leave" : e.type === "meeting_hq" ? e.title || "Meeting" : e.type === "other" ? e.other_type : "Meeting"}</b>{" "}
              <span className="text-gray-500">{[e.title && e.type !== "meeting_hq" ? e.title : null, nrHq(e.hq)].filter(Boolean).join(" · ")}</span>
            </span>
          </p>
        );
      })}
      {(r.entries || [])
        .filter((e) => e.note)
        .map((e, i) => (
          <p key={`n${i}`} className="flex items-start gap-1.5 py-1 text-[12px] italic text-gray-600">
            <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-none not-italic text-gray-500" />“{e.note}”
          </p>
        ))}
      {r.status === "waiting" ? (
        <Actions busy={busy} backLabel="Reject" okLabel="Approve day" onOk={onApprove} onBack={onReject} />
      ) : (
        r.note && <p className="mt-1 text-[11.5px] text-gray-500">{r.note}</p>
      )}
    </>
  );
}
function NonRepView({ conn }) {
  const wide = useWide();
  const [data, setData] = useState({ status: "loading" });
  const [sel, setSel] = useState(null);
  const [flt, setFlt] = useState("waiting");
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => {
    fetchNonReportQueue(conn)
      .then((m) => setData({ status: "ready", list: [...(m.pending || []), ...(m.recent || [])] }))
      .catch((e) => setData({ status: "error", error: errText(e) }));
  }, [conn]);
  useEffect(() => load(), [load]);
  const list = data.list || [];
  const people = useMemo(() => {
    const m = new Map();
    for (const r of list) {
      if (!m.has(r.employee)) m.set(r.employee, { id: r.employee, name: r.employeeName, w: 0 });
      if (r.status === "waiting") m.get(r.employee).w += 1;
    }
    return [...m.values()].sort((a, b) => b.w - a.w || a.name.localeCompare(b.name)).map((p) => ({ ...p, badge: p.w, sub: p.w ? `${p.w} day${p.w > 1 ? "s" : ""}` : "done", subOk: !p.w }));
  }, [list]);
  const who = people.find((p) => p.id === sel) || people[0] || null;
  const mine = list.filter((r) => r.employee === who?.id);
  const counts = { waiting: mine.filter((r) => r.status === "waiting").length, approved: mine.filter((r) => r.status === "approved").length, rejected: mine.filter((r) => r.status === "rejected").length };
  const shown = mine.filter((r) => r.status === flt).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const go = async (r, decision, note = "") => {
    setBusy({ id: r.id, what: decision === "Approve" ? "ok" : "back" });
    setMsg(null);
    try {
      await decideNonReport(conn, r.id, decision, note);
      setMsg({ ok: true, text: `${firstName(r.employeeName)} · ${dd(r.date)} ${decision === "Approve" ? "approved — TA/DA updates in a few minutes" : "rejected"}` });
      load();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Page title="Non-reported days">
      {data.status === "loading" && <Loading />}
      {data.status === "error" && <Err msg={data.error} onRetry={load} />}
      {data.status === "ready" && !people.length && <Empty>No non-reported days for you to decide.</Empty>}
      {data.status === "ready" && who && (
        <>
          <Body wide={wide} people={people} sel={who.id} onSel={(id) => (setSel(id), setOpen(null))}>
          <Filters
            items={[
              { id: "waiting", label: "Waiting", n: counts.waiting },
              { id: "approved", label: "Approved", n: counts.approved },
              { id: "rejected", label: "Rejected", n: counts.rejected },
            ]}
            sel={flt}
            onSel={setFlt}
          />
          {msg && <p className={cn("mx-4 mt-2 rounded-lg px-3 py-2 text-[12.5px]", msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}>{msg.text}</p>}
          <Split
            wide={wide}
            bottom={16}
            open={open}
            setOpen={setOpen}
            items={shown.map((r) => ({
              id: r.id,
              from: r.date,
              card: { state: r.status, label: r.status === "waiting" ? null : r.status === "approved" ? "Approved" : "Rejected", title: nrSummary(r), sub: nrTowns(r).join(" · ") },
              body: <NrBody r={r} busy={busy?.id === r.id ? busy.what : null} onApprove={() => go(r, "Approve")} onReject={(why) => go(r, "Reject", why)} />,
            }))}
          />
          </Body>
        </>
      )}
    </Page>
  );
}

/* ------------------------------- car requests ------------------------------ */

function CarBody({ r, busy, onApprove, onDecline }) {
  const [amt, setAmt] = useState(String(Math.round(r.asked || 0)));
  const extra = r.normalFare != null ? (Number(amt) || 0) - r.normalFare : null;
  return (
    <>
      <p className="flex items-center gap-1.5 border-b border-gray-100 pb-1.5 text-[12px]">
        <Car className="h-3.5 w-3.5 text-gray-500" />
        {r.km} km · {r.fuel}
        {r.places ? <span className="text-gray-500">· {r.places}</span> : null}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {[
          ["Fuel est.", inr(r.fuelCost), ""],
          ["No car", r.normalFare != null ? inr(r.normalFare) : "—", ""],
          ["Extra", extra != null ? `${extra >= 0 ? "+" : "−"}${inr(Math.abs(extra))}` : "—", extra > 0 ? "text-amber-700" : ""],
        ].map(([k, v, c]) => (
          <div key={k} className="rounded-lg border border-gray-100 bg-slate-50 px-2 py-1.5">
            <small className="block text-[9.5px] font-semibold text-gray-500">{k}</small>
            <b className={cn("text-[13px]", c)}>{v}</b>
          </div>
        ))}
      </div>
      {r.status === "pending" ? (
        <>
          <label className="mt-2 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5">
            <span className="text-[12px] font-bold text-green-800">Approve up to</span>
            <span className="flex items-center rounded-md border border-green-300 bg-white px-2">
              ₹
              <input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ""))} aria-label="Amount approved" className="w-20 border-0 bg-transparent py-1 text-right text-[14px] font-bold outline-none" />
            </span>
          </label>
          <Actions busy={busy} backLabel="Decline" okLabel="Approve" onOk={() => onApprove(Number(amt) || 0)} onBack={onDecline} />
        </>
      ) : (
        <p className="mt-2 text-[11.5px] text-gray-500">{r.status === "approved" ? `Approved up to ${inr(r.approvedAmount)}` : "Declined"}{r.note ? ` · ${r.note}` : ""}</p>
      )}
    </>
  );
}
function CarsView({ conn }) {
  const wide = useWide();
  const [data, setData] = useState({ status: "loading" });
  const [sel, setSel] = useState(null);
  const [flt, setFlt] = useState("pending");
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => {
    fetchCarQueue(conn)
      .then((m) => setData({ status: "ready", list: [...(m.pending || []), ...(m.recent || [])] }))
      .catch((e) => setData({ status: "error", error: e?.status === 403 ? "Car requests are decided by the GM." : errText(e) }));
  }, [conn]);
  useEffect(() => load(), [load]);
  const list = data.list || [];
  const people = useMemo(() => {
    const m = new Map();
    for (const r of list) {
      if (!m.has(r.employee)) m.set(r.employee, { id: r.employee, name: r.employeeName, w: 0 });
      if (r.status === "pending") m.get(r.employee).w += 1;
    }
    return [...m.values()].sort((a, b) => b.w - a.w || a.name.localeCompare(b.name)).map((p) => ({ ...p, badge: p.w, sub: p.w ? `${p.w} waiting` : "decided", subOk: !p.w }));
  }, [list]);
  const who = people.find((p) => p.id === sel) || people[0] || null;
  const mine = list.filter((r) => r.employee === who?.id);
  const counts = { pending: mine.filter((r) => r.status === "pending").length, approved: mine.filter((r) => r.status === "approved").length, rejected: mine.filter((r) => r.status === "rejected").length };
  const shown = mine.filter((r) => r.status === flt).sort((a, b) => String(a.from).localeCompare(String(b.from)));
  const go = async (r, decision, amount, note = "") => {
    setBusy({ id: r.id, what: decision === "Approve" ? "ok" : "back" });
    setMsg(null);
    try {
      await decideCarRequest(conn, r.id, decision, amount, note);
      setMsg({ ok: true, text: `${firstName(r.employeeName)}'s car ${decision === "Approve" ? `approved up to ${inr(amount)}` : "declined"}` });
      load();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Page title="Car requests">
      {data.status === "loading" && <Loading />}
      {data.status === "error" && <Err msg={data.error} onRetry={load} />}
      {data.status === "ready" && !people.length && <Empty>No car requests.</Empty>}
      {data.status === "ready" && who && (
        <>
          <Body wide={wide} people={people} sel={who.id} onSel={(id) => (setSel(id), setOpen(null))}>
          <Filters
            items={[
              { id: "pending", label: "Waiting", n: counts.pending },
              { id: "approved", label: "Approved", n: counts.approved },
              { id: "rejected", label: "Declined", n: counts.rejected },
            ]}
            sel={flt}
            onSel={setFlt}
          />
          {msg && <p className={cn("mx-4 mt-2 rounded-lg px-3 py-2 text-[12.5px]", msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}>{msg.text}</p>}
          <Split
            wide={wide}
            bottom={16}
            open={open}
            setOpen={setOpen}
            items={shown.map((r) => ({
              id: r.id,
              from: r.from,
              to: r.to,
              card: { state: r.status === "pending" ? "waiting" : r.status, label: r.status === "pending" ? null : r.status === "approved" ? "Approved" : "Declined", title: r.places || "Own car", sub: `${daysBetween(r.from, r.to) + 1} days`, amount: r.status === "approved" ? r.approvedAmount : r.asked },
              body: <CarBody r={r} busy={busy?.id === r.id ? busy.what : null} onApprove={(a) => go(r, "Approve", a)} onDecline={(why) => go(r, "Reject", "", why)} />,
            }))}
          />
          </Body>
        </>
      )}
    </Page>
  );
}

/* --------------------------------- the page -------------------------------- */

/* FULL WIDTH (27 Nov 2026): the page that holds this may be a narrow centred column; on a PC
   the approvals take the app shell's whole content area -- the nearest ancestor wider than
   the column -- measured, and kept in step on resize */
function useFullWidth(wide) {
  const ref = useRef(null);
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    if (!wide || !ref.current) {
      setBox(null);
      return undefined;
    }
    const el = ref.current;
    const measure = () => {
      const parent = el.parentElement;
      if (!parent) return;
      const pr = parent.getBoundingClientRect();
      let a = parent.parentElement;
      let best = null;
      while (a && a !== document.body) {
        const r = a.getBoundingClientRect();
        if (r.width > pr.width + 80) {
          best = r;
          break;
        }
        a = a.parentElement;
      }
      if (!best) return setBox(null);
      // the page column sits centred in the content area: grow by the room on its RIGHT, on both
      // sides -- the left of the wider box may hold the app's own menu (27 Nov 2026)
      const pad = 24;
      const gap = Math.max(0, Math.min(best.right - pr.right, pr.left - best.left) - pad);
      setBox({ width: Math.round(pr.width + gap * 2), marginLeft: Math.round(-gap) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [wide]);
  return [ref, box];
}

export default function ApprovalView({ view, url, token, className }) {
  const wide = useWide();
  const [ref, box] = useFullWidth(wide);
  const conn = useMemo(() => {
    try {
      return url && token ? makeConn({ url, token }) : null;
    } catch {
      return null;
    }
  }, [url, token]);
  if (!conn) return <Err msg="Sign in to see approvals." />;
  return (
    // a phone (27 Nov 2026): edge to edge -- the page's own side padding left gaps both sides
    <div
      ref={ref}
      className={className}
      style={box ? { width: box.width, marginLeft: box.marginLeft, maxWidth: "none" } : !wide ? { width: "100vw", marginLeft: "calc(50% - 50vw)", maxWidth: "none" } : undefined}
    >
      {view === "tada" ? <TaDaView conn={conn} /> : view === "nonrep" ? <NonRepView conn={conn} /> : <CarsView conn={conn} />}
    </div>
  );
}
