/* Trip claim rules for the planner's Field layer — the Elbrit Claims prototype's
   rules on top of the Field expenses console's day pricing.

   The console decides each day's type, TA and DA. On top of that a trip adds:
     - a night allowance per night away: the zone/role OS rate from the rate
       card, 50 % without a hotel bill, 100 % with one;
     - own car (RBM, ZSM, SM request it per trip; the GM approves): once the
       request is approved, the scanned
       fuel + toll bills replace the trip's fare, up to a cap of
       km ÷ MILEAGE × fuel price + estimated tolls.

   The constants below are the prototype's placeholders, kept in one place so
   policy can change them without touching the screens. */

import { AWAY_TYPES } from "@calendar/lib/field-expenses/field-days";

export const NIGHT_NO_BILL = 0.5; // share of the DA paid for a night with no hotel bill
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

/* The nights of a trip: every day of a tour but the last (the night of the
   1st is spent away when the 2nd is still on the tour). A day trip has none. */
export function tripNights(trip) {
  if (!trip || trip.kind !== "tour") return [];
  const days = trip.days;
  const last = days[days.length - 1];
  // a tour whose last day is still away (the data ends, or the month does) has
  // a night on that day too
  const endsAway = last.payable && AWAY_TYPES.has(last.dayType) && !last.journey;
  // a holiday, weekly off or leave inside the tour earns no TA and no DA, so
  // no night allowance either: only a worked (payable) day has a night
  return (endsAway ? days : days.slice(0, -1)).filter((d) => d.payable).map((d) => d.date);
}

/* An own-car request covering any day of the trip. */
export const requestFor = (trip, requests) => {
  const live = (requests || []).filter((r) => r.status !== "withdrawn");
  return live.find((r) => r.tripId === trip.id) || live.find((r) => r.from <= trip.to && r.to >= trip.from) || null;
};

/* Everything a trip's claim is worth, from the console's days and the claim's
   own state (car, bills, stays). */
export function tripClaim(trip, claim, { rates, role, requests } = {}) {
  const c = claim || {};
  // nights (and their stay bills) only for the roles that claim them
  const nights = claimsStays(role) ? tripNights(trip) : [];
  // a night is half the day DA an away day is priced at (the console's EQ rate;
  // its "OS" column is the retired flat outstation DA)
  const osRate = Number(rates?.da?.EQ) || 0;
  const nightRows = nights.map((date) => {
    const bill = c.stays?.[date] || null;
    // the bill's own amount when one is uploaded (and its amount known);
    // otherwise half the DA
    const billed = bill && Number(bill.amount) > 0 ? Math.round(Number(bill.amount)) : null;
    return { date, bill, billed, amount: billed ?? Math.round(osRate * NIGHT_NO_BILL) };
  });
  const nightDA = nightRows.reduce((s, n) => s + n.amount, 0);

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

  const ta = car ? fuel + tolls : fare;
  // stay and food come under DA (RBM and SM and above attach the bills): the
  // stay bill lifts the night's DA from 50 % to 100 %; food bills only back it
  const billsAllowed = claimsStays(role);
  const food = billsAllowed ? sum(c.foods) : 0;
  const da = trip.da + nightDA;
  // with the car on, the claim needs the pump bill, and every bill its photo
  const bills = car ? [...(c.fuels || []), ...(c.tolls || [])] : [];
  const fuelBills = car ? (c.fuels || []).length : 0;
  const unphotographed = bills.filter((b) => !b.file).length;
  const unpriced = bills.filter((b) => !(Number(b.amount) > 0)).length;
  const carBlock = !car
    ? null
    : !fuelBills
      ? "Scan the fuel bill to submit with your own car"
      : unphotographed
        ? "Attach a photo to every fuel and toll bill"
        : unpriced
          ? "Enter the amount on every bill"
          : null;
  return {
    nights: nightRows,
    nightDA,
    osRate,
    request: req,
    carAllowed,
    carApproved,
    carPending,
    carBlock,
    billsAllowed,
    food,
    foodBills: billsAllowed ? (c.foods || []).length : 0,
    car,
    fuel,
    tolls,
    fare,
    cap,
    ta,
    da,
    total: ta + da,
    missingStayBills: nightRows.filter((n) => !n.bill).length,
  };
}

/* The checks the prototype's AI ran, as plain rules on what the rep entered.
   A failed check does not block the claim; it says the trip will go to a
   human reviewer. -> [{ ok, text }] */
export function tripChecks(trip, claim, calc) {
  const out = [];
  if (calc.car) {
    const bills = [...(claim?.fuels || []), ...(claim?.tolls || [])];
    // with the car on, the train fare is out of the picture: the checks are
    // against the car's own cap and the route km, never the fare
    if (!calc.fuel && !calc.tolls) out.push({ ok: false, level: "info", text: "Scan the pump bill and every toll receipt — AI reads the amounts." });
    else if (bills.some((b) => Number(b.amount) > 0 && !b.file)) out.push({ ok: false, level: "info", text: "A bill has no photo — tap its chip to attach one." });
    else if (calc.fuel > fuelCost(trip.km) * 1.5) out.push({ ok: false, level: "review", text: `₹${fmt(calc.fuel)} fuel for a ${trip.km} km trip is above the expected range — goes to a reviewer.` });
    else if (calc.tolls > trip.km * 4) out.push({ ok: false, level: "review", text: `₹${fmt(calc.tolls)} in tolls on a ${trip.km} km trip is above the usual range — goes to a reviewer.` });
    else if (calc.fuel + calc.tolls > calc.cap) out.push({ ok: false, level: "review", text: `₹${fmt(calc.fuel + calc.tolls)} is ₹${fmt(calc.fuel + calc.tolls - calc.cap)} over the approved ₹${fmt(calc.cap)} for this trip — goes to a reviewer.` });
    else out.push({ ok: true, text: `Fuel and tolls match the ${trip.km} km trip · ₹${fmt(calc.cap - calc.fuel - calc.tolls)} of the approved ₹${fmt(calc.cap)} unused.` });
    if (bills.some((b) => Number(b.amount) >= BILL_AUTO_APPROVE)) out.push({ ok: false, level: "review", text: `A bill of ₹${fmt(BILL_AUTO_APPROVE)} or more always gets a human look.` });
  }
  if (calc.missingStayBills) {
    out.push({ ok: false, level: "info", text: `${calc.missingStayBills} night${calc.missingStayBills > 1 ? "s" : ""} at 50 % of DA — upload the hotel bill and the night is paid at the bill's amount.` });
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
