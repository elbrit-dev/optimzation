/* Trip claim rules for the planner's Field layer — the Elbrit Claims prototype's
   rules on top of the ERP's day pricing (Field Expense Day).

   The ERP decides each day's type, TA and DA -- an outstation day's DA is
   already 50 % of the outstation rate without a bill (11 Nov 2026: the old
   night allowance on top of it is gone, it paid the stay twice). On top of
   that a trip adds:
     - the stay / food bills for its outstation days, the proof that lets
       those days be paid in full once approved;
     - own car (RBM, ZSM, SM request it per trip; the GM approves): once the
       request is approved, the scanned
       fuel + toll bills replace the trip's fare, up to a cap of
       km ÷ MILEAGE × fuel price + estimated tolls.

   The constants below are the prototype's placeholders, kept in one place so
   policy can change them without touching the screens. */

import { AWAY_TYPES } from "@calendar/lib/field-expenses/field-days";

export const MILEAGE_KM_PER_L = 15; // fixed company assumption
export const FUEL_PRICE = { Petrol: 101, Diesel: 92, EV: 0 }; // ₹ per litre
export const FUEL_TYPES = Object.keys(FUEL_PRICE);
export const TOLL_PER_KM = 0.8; // stand-in for a route toll estimate
export const BILL_AUTO_APPROVE = 5000; // a single bill above this always gets a human look
export const CAR_REASONS = ["Multi-town tour", "No direct train", "Carrying demo kit", "Doctor pickups"];

/* Elbrit's field hierarchy, senior first: GM, ZSM, SM, Sr RBM, RBM, DRBM, ABM,
   KAM, BE … The stay bills (night allowance, 50 % → 100 % with a hotel bill)
   start at RBM. Own car is asked for, trip by trip, by an RBM, ZSM or SM and
   approved by the GM; nobody switches it on themselves, and until the GM
   approves the trip is paid the normal allowance. ABMs and BEs claim neither. */
export const SENIOR_ROLES = ["GM", "ZSM", "SM", "Sr RBM", "RBM"];
export const CAR_ROLES = ["ZSM", "SM", "RBM"];
export const CAR_PREAPPROVED_ROLES = [];
export const CAR_APPROVER = "GM";

// "RBM1-ELBR-CO-COI" or "RBM" -> "RBM"; "Sr RBM" stays as it is
const roleKey = (role) => {
  const r = String(role || "").trim();
  return SENIOR_ROLES.includes(r) ? r : r.split("-")[0].replace(/[0-9]/g, "").trim();
};
export const canUseCar = (role) => CAR_ROLES.includes(roleKey(role));
/* 20 Nov 2026: the month's cab bills, kept apart from TA/DA (lib/field-expenses/cab-claims.js),
   are for SM and ZSM only -- by the rate-card role, or the seat ("SM-ELB_AURA_KA") */
export const CAB_ROLES = ["SM", "ZSM"];
export const canClaimCabs = (role, seat) => [role, seat].some((r) => r && CAB_ROLES.includes(roleKey(r)));
export const carPreapproved = (role) => CAR_PREAPPROVED_ROLES.includes(roleKey(role));
export const claimsStays = (role) => SENIOR_ROLES.includes(roleKey(role));

// 13 Nov 2026: tolls are not paid -- the own car is paid its fuel only
export const tollEstimate = () => 0;
export const fuelCost = (km, fuel = "Petrol") => Math.round((km / MILEAGE_KM_PER_L) * (FUEL_PRICE[fuel] ?? FUEL_PRICE.Petrol));
export const carCap = (km, fuel) => fuelCost(km, fuel);

const sum = (arr) => (arr || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);

/* The own car's TA spread over the trip's days by the km driven each day
   (13 Nov 2026): each day's road legs (a both-ways local run counts twice;
   a flown leg not at all); the last day takes the rounding. -> { date: ₹ } */
export function carDayShares(trip, amount) {
  const days = (trip.days || []).filter((d) => d.payable);
  const kmOf = (d) =>
    (d.legs || []).reduce((s, l) => s + (l.flown ? 0 : (Number(l.rounded_km ?? l.km) || 0) * (l.both_ways ? 2 : 1)), 0);
  const w = days.map(kmOf);
  const all = w.reduce((s, x) => s + x, 0);
  const out = {};
  let left = Math.round(amount || 0);
  days.forEach((d, i) => {
    const share = i === days.length - 1 ? left : all > 0 ? Math.round((amount * w[i]) / all) : Math.round(amount / days.length);
    out[d.date] = { amount: share, km: Math.round(w[i] * 10) / 10 };
    left -= share;
  });
  return out;
}

/* The away days of a trip that a stay / food bill counts for: the worked
   outstation days the ERP gave an outstation rate (osDaFull) -- exactly the
   days it pays at 50 % without a bill. A day trip has none. */
export function tripNights(trip) {
  if (!trip || trip.kind !== "tour") return [];
  // a stay the company paid (dashboard "Stay" mark) has no DA and takes no bill
  return trip.days.filter((d) => d.payable && AWAY_TYPES.has(d.dayType) && d.osDaFull > 0 && d.company !== "Stay").map((d) => d.date);
}

/* An own-car request covering any day of the trip. */
export const requestFor = (trip, requests) => {
  const live = (requests || []).filter((r) => r.status !== "withdrawn");
  const mine = (r) => r.tripId === trip.id || (r.from <= trip.to && r.to >= trip.from);
  // one still waiting or approved wins over an older rejected one
  return live.find((r) => mine(r) && r.status !== "rejected") || live.find(mine) || null;
};

/* A hotel bill split evenly over the nights it covers, the last night taking
   the rounding. -> { date: share } (the screen and the claim lines both use it)
   13 Nov 2026 (the user's rule): only over its WORKING nights -- the trip's
   outstation DA days (`work`) -- a holiday or weekly-off night inside the
   stay takes no share; its rupees go to the working nights. A bill with no
   working night at all is split over all its nights (nothing pays it). */
export function stayShares(b, work = null) {
  const all = (b?.nights || []).length ? b.nights : [b?.date].filter(Boolean);
  const onWork = work ? all.filter((d) => work.has(d)) : [];
  const ns = onWork.length ? onWork : all;
  const amt = Math.round(Number(b?.amount) || 0);
  const each = ns.length ? Math.floor(amt / ns.length) : 0;
  const out = {};
  ns.forEach((date, i) => {
    out[date] = (out[date] || 0) + (i === ns.length - 1 ? amt - each * (ns.length - 1) : each);
  });
  return out;
}

/* Everything a trip's claim is worth, from the console's days and the claim's
   own state (car, bills, stays). */
/* The part of a day's TA a train / bus ticket stands for (23 Nov 2026): on an
   EQ day (out and back, the rail fare above 100 km) and on a day with no
   journey, the day's whole TA; on a day with a journey between HQs, that
   journey's fare -- the local run around the town is paid as it is. */
const ticketBase = (d) => (d.dayType === "EQ" || !d.journey ? d.ta || 0 : Math.min(d.journey.fare || 0, d.ta || 0));
/* An EQ day over eqKm: its run is paid the rail fare (fareBasis) -- the one
   kind of EQ day a ticket is taken on. */
const farEq = (d, eqKm) =>
  d.payable && d.dayType === "EQ" && (d.legs || []).some((l) => l.leg === "Local" && Number(l.fare) > 0 && Number(l.rounded_km ?? l.km) > eqKm);

export function tripClaim(trip, claim, { role, requests, eqKm } = {}) {
  const c = claim || {};
  // away days (and their stay / food bills) only for the roles that claim them
  const billsAllowed = claimsStays(role);
  const nights = billsAllowed ? tripNights(trip) : [];
  const stays = billsAllowed ? c.stays || [] : [];
  const foods = billsAllowed ? c.foods || [] : [];
  /* Each day's bills, to show on the day (12 Nov 2026, the user's rule): a
     hotel bill is split evenly over the nights it covers (the last night takes
     the rounding), a food bill sits on its own date. The money is still the
     trip's pool below -- this is only where each rupee of the bills fell. */
  const billsByDate = {};
  const onDay = (date) => (billsByDate[date] = billsByDate[date] || { stay: 0, food: 0, stays: 0, foods: 0 });
  // the working nights a hotel bill is split over; a holiday / weekly-off
  // night it covers is marked so the day can say where its share went
  const workNights = new Set(nights);
  const stayOff = {};
  for (const b of stays) {
    if ((b.nights || []).some((d) => workNights.has(d))) for (const d of b.nights || []) if (!workNights.has(d)) stayOff[d] = true;
    for (const [date, share] of Object.entries(stayShares(b, workNights))) {
      const d = onDay(date);
      d.stay += share;
      d.stays += 1;
    }
  }
  for (const b of foods) {
    const d = onDay(b.date);
    d.food += Math.round(Number(b.amount) || 0);
    d.foods += 1;
  }
  const nightRows = nights.map((date) => {
    const day = trip.byDate?.get(date) || trip.days.find((d) => d.date === date) || {};
    // a hotel bill covers each night it was checked for (check-in to the day
    // before check-out)
    const bill = stays.find((s) => (s.nights || []).includes(date)) || null;
    // amount: what the ERP pays the day without a bill (50 %); full: its
    // outstation rate; bills: the stay share and the food on this day
    const amount = day.da || 0;
    const full = day.osDaFull || 0;
    const b = billsByDate[date] || null;
    const billSum = b ? b.stay + b.food : 0;
    /* PER DAY (12 Nov 2026, the user's rule): the day's stay share + its own
       food, at least the day's 50 % and at most its 100 %. What one day goes
       over is NOT carried to a cheaper day. */
    const paid = billSum > 0 ? Math.min(full, Math.max(amount, billSum)) : amount;
    return {
      date,
      bill,
      amount,
      full,
      bills: b,
      billSum,
      paid,
      capped: billSum > full ? billSum - full : 0,
      topUp: billSum > 0 && billSum < amount ? amount - billSum : 0,
      // already paid in full with no bill (BE / ABM since 13 Nov 2026: the
      // ERP stores their outstation DA at 100 %) -- no bill is asked for
      fullNoBill: full > 0 && amount >= full,
    };
  });
  // the ERP's DA already holds the stay: nothing on top of it
  const nightDA = 0;

  /* The outstation days added up (each day already held between its own 50 %
     and 100 % above). Bills on a day with no outstation DA (a day off inside
     the trip) pay nothing -- `unpaid`. Never refused on the amount. */
  const half = nightRows.reduce((s, n) => s + n.amount, 0);
  const full = nightRows.reduce((s, n) => s + n.full, 0);
  const nightsPaid = nightRows.reduce((s, n) => s + n.paid, 0);
  const billed = sum(stays) + sum(foods);
  const onNights = nightRows.reduce((s, n) => s + n.billSum, 0);
  const poolOn = nights.length > 0 && stays.length + foods.length > 0;
  const pool = {
    on: poolOn,
    half,
    full,
    bills: billed,
    paid: nightsPaid,
    capped: nightRows.reduce((s, n) => s + n.capped, 0),
    topUp: nightRows.reduce((s, n) => s + n.topUp, 0),
    unpaid: Math.max(0, billed - onNights),
  };

  const req = requestFor(trip, requests);
  // car allowance only once the GM has approved the trip's request; before
  // that (none, or still pending) the trip is paid the normal allowance
  const carAllowed = canUseCar(role);
  const carApproved = carAllowed && req?.status === "approved";
  const carPending = carAllowed && req?.status === "pending";
  const car = carApproved;
  const fuel = sum(c.fuels);
  const tolls = 0; // not paid (13 Nov 2026); old toll scans are ignored
  const fare = trip.ta; // the console's TA for the trip: the fare by rail or per km
  const cap = req?.status === "approved" && req.ask
    ? req.ask
    : carCap(req?.km || trip.km, req?.fuel || "Petrol");

  // 12 Nov 2026: the bills replace the fare only once there are some; an
  // approved car with no fuel / toll bill is paid the ERP's fare as it is.
  // Bills are paid as they are up to the approved amount (no 50 % floor:
  // fuel is money spent, not an allowance), never above it.
  const carBilled = car && fuel + tolls > 0;
  const capped = carBilled && fuel + tolls > cap;
  /* TRAVEL BILLS (23 Nov 2026, the user): RBM and above add their TRAIN / BUS
     tickets -- on an outstation trip with the stay and food bills, and on an
     EQ day over 100 km -- when no own car is approved (the car keeps its fuel
     bills, unchanged). DAY BY DAY, by the ticket's departure date: the day's
     tickets against the fare of that day's journey (ticketBase) -- the larger
     is paid. Fare ₹1,000 and tickets ₹1,500 -> ₹500 on top; tickets ₹800 ->
     the fare ₹1,000 stays. A ticket on a day with nothing paid adds nothing. */
  const eqFar = trip.kind === "day" && (trip.days || []).some((d) => farEq(d, eqKm ?? 100));
  const travelAllowed = billsAllowed && !car && ((nights.length > 0 && !nightRows.every((n) => n.fullNoBill)) || eqFar);
  const travels = travelAllowed ? c.travels || [] : [];
  const travel = sum(travels);
  const travelDays = {};
  for (const b of travels) {
    const t = (travelDays[b.date] = travelDays[b.date] || { date: b.date, tickets: 0, count: 0 });
    t.tickets += Math.round(Number(b.amount) || 0);
    t.count += 1;
  }
  for (const t of Object.values(travelDays)) {
    const d = trip.byDate?.get(t.date) || trip.days.find((x) => x.date === t.date);
    t.paid = !!d?.payable;
    t.base = t.paid ? ticketBase(d) : 0;
    t.extra = t.paid ? Math.max(0, t.tickets - t.base) : 0;
  }
  const travelExtra = carBilled ? 0 : Object.values(travelDays).reduce((s, t) => s + t.extra, 0);
  const travelBilled = travelExtra > 0;
  const ta = carBilled ? Math.min(fuel + tolls, cap) : fare + travelExtra;
  // stay and food come under DA (RBM and SM and above attach the bills): the
  // outstation days' 50 % swapped for what the pool pays
  const food = sum(foods);
  const da = trip.da - half + nightsPaid;
  // with the car billed, the pump bill too (a toll-only claim would pay less
  // than the fare by mistake); every bill here was checked when scanned
  const fuelBills = car ? (c.fuels || []).length : 0;
  const carBlock = null; // fuel only: no toll-without-fuel case any more
  return {
    nights: nightRows,
    nightDA,
    request: req,
    carAllowed,
    carApproved,
    carPending,
    carBlock,
    billsAllowed,
    food,
    foodBills: foods.length,
    stayBills: stays.length,
    pool,
    billsByDate,
    stayOff,
    car,
    carBilled,
    capped,
    travelAllowed,
    travel,
    travelBills: travels.length,
    travelBilled,
    // per departure date: { tickets, count, base (the fare they stand for), extra, paid }
    travelDays,
    eqFar,
    // what the tickets add on top of the fare
    travelExtra,
    fuel,
    tolls,
    fare,
    cap,
    ta,
    da,
    total: ta + da,
    // outstation days paid at 50 % for want of any stay / food bill
    missingStayBills: poolOn ? 0 : nightRows.filter((n) => !n.fullNoBill).length,
    // every outstation day already at 100 % without a bill: no bills to ask for
    fullNoBill: nightRows.length > 0 && nightRows.every((n) => n.fullNoBill),
  };
}

/* The checks the prototype's AI ran, as plain rules on what the rep entered.
   A failed check does not block the claim; it says the trip will go to a
   human reviewer. -> [{ ok, text }] */
export function tripChecks(trip, claim, calc) {
  const out = [];
  if (calc.car) {
    // 12 Nov 2026: the amount is never a reason for review -- bills are paid
    // as they are up to the approved amount, and capped above it
    // short (12 Nov 2026): what is paid, then the limit
    if (!calc.fuel && !calc.tolls) out.push({ ok: true, text: `No car bill yet · fare ₹${fmt(calc.fare)} paid.` });
    else if (calc.capped) out.push({ ok: true, text: `Car bills ₹${fmt(calc.fuel + calc.tolls)} → ₹${fmt(calc.cap)} (approved max).` });
    else out.push({ ok: true, text: `Car bills ₹${fmt(calc.fuel + calc.tolls)} paid · up to ₹${fmt(calc.cap)}.` });
  }
  if (calc.travel > 0) {
    out.push({
      ok: true,
      text: calc.travelBilled
        ? `Train / bus tickets ₹${fmt(calc.travel)} → TA ₹${fmt(calc.ta)} (+₹${fmt(calc.travelExtra)} over the fare).`
        : `Train / bus tickets ₹${fmt(calc.travel)} · the fare is more on each day, so the fare is paid.`,
    });
  }
  const p = calc.pool;
  if (p?.on) {
    out.push({
      ok: true,
      text: `Stay + food ₹${fmt(p.bills)} → DA ₹${fmt(p.paid)}${p.topUp ? ` (+₹${fmt(p.topUp)} to 50 %)` : ""}${p.capped ? ` (−₹${fmt(p.capped)} over 100 %)` : ""}${p.unpaid ? ` · ₹${fmt(p.unpaid)} not on DA days` : ""}.`,
    });
  } else if (calc.missingStayBills) {
    out.push({ ok: false, level: "info", text: `${calc.missingStayBills} outstation day${calc.missingStayBills > 1 ? "s" : ""} at 50 % of DA — scan the stay and food bills to be paid what you spent, up to the full DA.` });
  }
  return out;
}

const fmt = (n) => new Intl.NumberFormat("en-IN").format(Math.round(n || 0));

/* ---------- payroll ---------- */

/* Which payroll a month's field claim lands in (20 Nov 2026). The ERP's
   Finalise (field_expense_claims, action=finalize) makes the Additional Salary
   for the LAST DAY OF THE MONTH AFTER the day it is finalised -- finalised in
   Nov goes into the Dec payroll, whatever month the claim is for. So:
     finalised   -> that payroll, paid on its last day
     not yet     -> the payroll it reaches if finalised this month (never
                    earlier than the month after the claim's own month)
   The old fixed "claim month, by the 28th" was a prototype placeholder: it said
   "Oct payroll (by Wed 28 Oct)" for an October claim finalised into December. */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const lastDayOf = (y, m0) => new Date(y, m0 + 1, 0).getDate();

/* ("2026-10", { finalisedOn: "2026-11-20 11:29" }) -> { name: "Dec payroll", when: "paid 31 Dec", final: true }
   ("2026-10", { today: 20 Nov 2026 })               -> { name: "Dec payroll", when: "if finalised by 30 Nov", final: false } */
export function payrollOf(month, { finalisedOn = null, today = new Date() } = {}) {
  const [y, m] = month.split("-").map(Number);
  const fin = finalisedOn ? new Date(String(finalisedOn).slice(0, 10) + "T00:00:00") : null;
  const base = fin && !isNaN(fin) ? fin : today;
  // months since year 0: the payroll is the month after the base, and after the claim's month
  const idx = Math.max(base.getFullYear() * 12 + base.getMonth() + 1, y * 12 + (m - 1) + 1);
  const py = Math.floor(idx / 12), pm = idx % 12;
  const name = `${MON[pm]} payroll`;
  if (fin && !isNaN(fin)) return { name, when: `paid ${lastDayOf(py, pm)} ${MON[pm]}`, final: true };
  // finalised by the last day of the month before the payroll month
  const by = new Date(py, pm, 0);
  return { name, when: `if finalised by ${by.getDate()} ${MON[by.getMonth()]}`, final: false };
}

/* ---------- planned trips (for an own-car request) ---------- */

const hqName = (t) => String(t || "").replace(/^HQ[-\s]*/i, "").trim();
/* A trip's route from and back to the rep's own HQ, by name (13 Nov 2026):
   "Coimbatore (HQ) → Madurai → Bodi → Coimbatore (HQ)". */
/* A trip's route as it was travelled, for the car request (13 Nov 2026):
   from where it left (the HQ, or the town of the first journey) to where the
   road ended -- a flown leg is the company's ticket, so a trip that flew home
   from Thrissur ends at Thrissur, the flight named after it. */
export function tripRoute(trip, hq) {
  const homeName = hqName(hq);
  const label = (p) => (p && homeName && sameHq(p, homeName) ? `${homeName} (HQ)` : p);
  const paid = (trip.days || []).filter((d) => d.payable);
  const first = paid[0];
  const last = paid[paid.length - 1];
  const firstLeg = (first?.travelLegs || [])[0] || null;
  const lastLeg = (last?.travelLegs || []).slice(-1)[0] || null;
  const flownOut = firstLeg?.flown ? firstLeg : null;
  const flownBack = lastLeg?.flown && lastLeg !== firstLeg ? lastLeg : null;
  const start = (flownOut ? flownOut.to : first?.journey?.from) || homeName || "HQ";
  const end = (flownBack ? flownBack.from : trip.kind === "tour" ? last?.journey?.to : null) || homeName || "HQ";
  const mid = (trip.places || []).filter((p) => !sameHq(p, start) && !sameHq(p, end));
  const stops = [start, ...mid, end].map(label);
  const flights = [flownOut, flownBack].filter(Boolean).map((l) => `flight ${l.from} → ${l.to}`);
  return stops.join(" → ") + (flights.length ? ` · ${flights.join(", ")} (company ticket)` : "");
}

export const routeText = (places, hq) => {
  const home = hqName(hq) ? `${hqName(hq)} (HQ)` : "HQ";
  return [home, ...(places || []), home].join(" → ");
};
const sameHq = (a, b) => hqName(a).toLowerCase().replace(/[^a-z0-9]/g, "") === hqName(b).toLowerCase().replace(/[^a-z0-9]/g, "");
const localISO = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const addDay = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/* The rep's upcoming trips out of HQ, read off their own HQ Tour Plan events:
   each future day planned in another HQ's territory, consecutive days joined
   into one trip ("HQ → Madurai → Dindigul → HQ"). The Planner stores no route
   km, so a trip's km is the rep's own past journeys between the same HQs
   (out and back) where Field expenses has one, else null — the rep types it.
   -> [{ id, from, to, towns, places, km, kmKnown, nights, tolls }] */
export function plannedTrips({ events, me, homeHq, rows, today, hqTourPlanTag }) {
  const days = new Map(); // date -> [towns]
  for (const e of events || []) {
    if (e.tags !== hqTourPlanTag || !e.startDate) continue;
    if (me && e.ownerEmployeeId && e.ownerEmployeeId !== me) continue;
    const town = hqName(e.hqTerritory);
    if (!town || sameHq(town, homeHq)) continue;
    const start = localISO(e.startDate);
    const end = localISO(e.endDate || e.startDate);
    for (let d = start; d <= end; d = addDay(d)) {
      if (d <= today) continue;
      const list = days.get(d) || [];
      if (!list.includes(town)) list.push(town);
      days.set(d, list);
    }
  }

  // one-way km between two HQs, from journeys Field expenses priced
  const leg = new Map();
  for (const r of rows || []) {
    if (!r.journey?.from || !r.journey?.to || r.journey.km == null) continue;
    leg.set(`${hqName(r.journey.from).toLowerCase()}|${hqName(r.journey.to).toLowerCase()}`, r.journey.km);
    leg.set(`${hqName(r.journey.to).toLowerCase()}|${hqName(r.journey.from).toLowerCase()}`, r.journey.km);
  }
  const kmOf = (a, b) => leg.get(`${a.toLowerCase()}|${b.toLowerCase()}`);

  const trips = [];
  let cur = null;
  for (const d of [...days.keys()].sort()) {
    if (cur && addDay(cur.to) === d) {
      cur.to = d;
      days.get(d).forEach((t) => !cur.towns.includes(t) && cur.towns.push(t));
    } else {
      if (cur) trips.push(cur);
      cur = { from: d, to: d, towns: [...days.get(d)] };
    }
  }
  if (cur) trips.push(cur);

  const home = hqName(homeHq) || "HQ";
  return trips.map((t) => {
    const stops = [home, ...t.towns, home];
    let km = 0;
    let known = true;
    for (let i = 1; i < stops.length; i++) {
      const k = kmOf(stops[i - 1], stops[i]);
      if (k == null) known = false;
      else km += k;
    }
    const nights = Math.round((new Date(t.to) - new Date(t.from)) / 86400000);
    const kmVal = known ? Math.round(km) : null;
    return {
      id: `plan_${t.from}_${t.to}`,
      from: t.from,
      to: t.to,
      towns: t.towns,
      places: routeText(t.towns, homeHq),
      name: t.towns.slice(0, 2).join(" · "),
      km: kmVal,
      kmKnown: known,
      nights,
      tolls: kmVal ? tollEstimate(kmVal) : null,
    };
  });
}
