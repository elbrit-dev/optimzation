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
export const carPreapproved = (role) => CAR_PREAPPROVED_ROLES.includes(roleKey(role));
export const claimsStays = (role) => SENIOR_ROLES.includes(roleKey(role));

export const tollEstimate = (km) => Math.round((km * TOLL_PER_KM) / 10) * 10;
export const fuelCost = (km, fuel = "Petrol") => Math.round((km / MILEAGE_KM_PER_L) * (FUEL_PRICE[fuel] ?? FUEL_PRICE.Petrol));
export const carCap = (km, fuel, tolls) => fuelCost(km, fuel) + (tolls ?? tollEstimate(km));

const sum = (arr) => (arr || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);

/* The away days of a trip that a stay / food bill counts for: the worked
   outstation days the ERP gave an outstation rate (osDaFull) -- exactly the
   days it pays at 50 % without a bill. A day trip has none. */
export function tripNights(trip) {
  if (!trip || trip.kind !== "tour") return [];
  return trip.days.filter((d) => d.payable && AWAY_TYPES.has(d.dayType) && d.osDaFull > 0).map((d) => d.date);
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
export function tripClaim(trip, claim, { role, requests } = {}) {
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
  const tolls = sum(c.tolls);
  const fare = trip.ta; // the console's TA for the trip: the fare by rail or per km
  const cap = req?.status === "approved" && req.ask
    ? req.ask
    : carCap(req?.km || trip.km, req?.fuel || "Petrol", req?.tolls);

  // 12 Nov 2026: the bills replace the fare only once there are some; an
  // approved car with no fuel / toll bill is paid the ERP's fare as it is.
  // Bills are paid as they are up to the approved amount (no 50 % floor:
  // fuel is money spent, not an allowance), never above it.
  const carBilled = car && fuel + tolls > 0;
  const capped = carBilled && fuel + tolls > cap;
  const ta = carBilled ? Math.min(fuel + tolls, cap) : fare;
  // stay and food come under DA (RBM and SM and above attach the bills): the
  // outstation days' 50 % swapped for what the pool pays
  const food = sum(foods);
  const da = trip.da - half + nightsPaid;
  // with the car billed, the pump bill too (a toll-only claim would pay less
  // than the fare by mistake); every bill here was checked when scanned
  const fuelBills = car ? (c.fuels || []).length : 0;
  const carBlock = !carBilled ? null : !fuelBills ? "Scan the fuel bill too — or remove the toll bills to be paid the fare" : null;
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
    fuel,
    tolls,
    fare,
    cap,
    ta,
    da,
    total: ta + da,
    // outstation days paid at 50 % for want of any stay / food bill
    missingStayBills: poolOn ? 0 : nightRows.length,
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

/* Field claims ride the monthly payroll; a month's claims must be in by this
   day of that month (prototype: Wed 28 Oct). Placeholder until HR confirms. */
export const PAYROLL_CUTOFF_DAY = 28;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* "2026-10" -> { name: "Oct payroll", cutoff: "Wed 28 Oct", cutoffDate: "2026-10-28" } */
export function payrollOf(month) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, PAYROLL_CUTOFF_DAY);
  return {
    name: `${MON[m - 1]} payroll`,
    cutoff: `${DOW[d.getDay()]} ${PAYROLL_CUTOFF_DAY} ${MON[m - 1]}`,
    cutoffDate: `${month}-${String(PAYROLL_CUTOFF_DAY).padStart(2, "0")}`,
  };
}

/* ---------- planned trips (for an own-car request) ---------- */

const hqName = (t) => String(t || "").replace(/^HQ[-\s]*/i, "").trim();
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
      places: ["HQ", ...t.towns, "HQ"].join(" → "),
      name: t.towns.slice(0, 2).join(" · "),
      km: kmVal,
      kmKnown: known,
      nights,
      tolls: kmVal ? tollEstimate(kmVal) : null,
    };
  });
}
