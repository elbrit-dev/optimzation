/* Field layer data — the signed-in rep's TA/DA per day, as priced by the Field
   expenses console, read through /api/field-expenses/my-days (which confirms
   who the caller is with the ERP and returns only their rows).

   Nothing here prices a day. The console owns the rules (day types from GPS
   and the Standard Fare Chart, the zone rate card, IRCTC slabs above 100 km);
   this file only fetches its answer and groups the days into trips. */

import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";

const TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // month -> { at, promise }

export class FieldDaysError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* One month for the signed-in user. Cached per month for the session; a
   failure is not cached, so moving away and back asks again. */
export function fetchFieldMonth(month) {
  const hit = cache.get(month);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const { erpUrl, authToken } = AUTH_CONFIG;
  if (!erpUrl || !authToken) return Promise.reject(new FieldDaysError("Not signed in", { status: 401 }));

  const params = new URLSearchParams({ month, endpoint: erpUrl });
  const promise = fetch(`/api/field-expenses/my-days?${params}`, { headers: { "x-erp-token": authToken } })
    .then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new FieldDaysError(body.error || `HTTP ${r.status}`, { status: r.status, code: body.code });
      return body;
    })
    .catch((error) => {
      cache.delete(month);
      throw error;
    });
  cache.set(month, { at: Date.now(), promise });
  return promise;
}

/* ---------- labels ---------- */

export const AWAY_TYPES = new Set(["OS", "OS-HQ", "OS-EQ"]);
export const TRAVEL_TYPES = new Set(["EQ", "OS", "OS-HQ", "OS-EQ"]);

export const DAY_TYPE_LABEL = {
  HQ: "HQ day",
  EQ: "Ex-HQ",
  OS: "Outstation",
  "OS-HQ": "Outstation · in town",
  "OS-EQ": "Outstation · ex-HQ",
};

export const DAY_TYPE_HINT = {
  HQ: "Worked inside the HQ town — DA only, no TA",
  EQ: "Worked out from HQ and back — TA both ways plus the ex-HQ allowance",
  OS: "Outside your patch — paid as an ex-HQ day",
  "OS-HQ": "Worked inside another HQ town — no DA; the journey there is paid as TA",
  "OS-EQ": "Worked out from another HQ town — TA for the local leg, no DA",
};

const fmt = new Intl.NumberFormat("en-IN");
export const inr = (n) => "₹" + fmt.format(Math.round(n || 0));

/* The place a day is known by: where the farthest work was, else the other HQ,
   else the farthest stop on the route. */
export function dayPlace(row) {
  if (!row) return null;
  if (row.farthest) return row.farthest;
  if (row.awayHq) return row.awayHq;
  const far = [...(row.route || [])].sort((a, b) => (b.km || 0) - (a.km || 0))[0];
  return far?.place || null;
}

/* How the TA on a day was reached, in words. The console's own rule: up to
   eqKm the per-km rate, above it the IRCTC fare for the role's rail class; an
   ex-HQ day is paid out and back. */
export function fareBasis(row, data) {
  if (!row || !data || !row.ta) return null;
  const km = row.chart?.km ?? row.km;
  if (km == null) return null;
  const { perKm, railClass } = data.rates || {};
  const eqKm = data.bands?.eqKm ?? 100;
  const legs = row.dayType === "EQ" ? " × 2 legs" : "";
  if (km <= eqKm) return `${km} km × ₹${perKm ?? "?"}${legs}`;
  return `${km} km · IRCTC ${railClass || "3 TIER AC"}${legs}`;
}

/* ---------- trips ---------- */

// in UTC on both sides: local midnight in IST is the previous day in UTC
const nextDate = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/* A trip is what the prototype calls a tour: leaving HQ until back at HQ.
   The console has no tour record, so it is read off the days:
     - an ex-HQ (EQ) day out and back is a trip of its own;
     - outstation days (OS / OS-HQ / OS-EQ) on consecutive dates are one trip,
       and the day the journey home is charged joins the trip it closes;
     - a weekly off or holiday between two outstation days stays in the trip
       (the rep stayed away), and adds nothing to it;
     - every HQ day is a card of its own ("hq"): no travel, its DA claimed
       on its own. */
export function buildTrips(rows) {
  const trips = [];
  const byDate = new Map((rows || []).map((r) => [r.date, r]));
  let cur = null;
  let pending = [];
  let prevDate = null;
  const close = () => {
    if (cur) trips.push(finish(cur));
    cur = null;
    pending = [];
  };

  for (const r of rows || []) {
    if (prevDate && nextDate(prevDate) !== r.date) close();
    prevDate = r.date;

    const away = r.payable && AWAY_TYPES.has(r.dayType);
    const eq = r.payable && r.dayType === "EQ";
    const homeLeg = r.payable && !away && !eq && !!r.journey && !!cur;
    const hqDay = r.payable && !away && !eq && !homeLeg;

    if (hqDay) {
      close();
      trips.push(finish({ days: [r] }));
    } else if (away) {
      // a journey charged mid-tour is a move between towns, not a new trip
      if (!cur) cur = { days: [] };
      cur.days.push(...pending, r);
      pending = [];
    } else if (homeLeg) {
      cur.days.push(...pending, r);
      close();
    } else if (eq) {
      close();
      trips.push(finish({ days: [r] }));
    } else if (cur && !r.payable && r.kind !== "working") {
      pending.push(r); // a day off in the middle of a tour
    } else {
      close();
    }
  }
  close();
  return trips;

  function finish(t) {
    const days = t.days;
    const paid = days.filter((d) => d.payable);
    const places = [];
    for (const d of paid) {
      for (const p of [d.journey?.to, dayPlace(d)]) if (p && !places.includes(p)) places.push(p);
    }
    const ta = paid.reduce((s, d) => s + d.ta, 0);
    const da = paid.reduce((s, d) => s + d.da, 0);
    const km = paid.reduce((s, d) => s + (d.km || 0) + (d.journey?.km || 0), 0);
    const kind = paid.some((d) => AWAY_TYPES.has(d.dayType)) ? "tour" : paid.some((d) => d.dayType === "EQ") ? "day" : "hq";
    return {
      id: `${days[0].date}_${days[days.length - 1].date}`,
      from: days[0].date,
      to: days[days.length - 1].date,
      days,
      kind,
      name: kind === "hq" ? `HQ${places.length ? ` · ${places.slice(0, 2).join(" · ")}` : ""}` : places.slice(0, 2).join(" · ") || (kind === "tour" ? "Outstation" : "Ex-HQ"),
      places,
      ta,
      da,
      total: ta + da,
      km: Math.round(km),
      nights: kind === "tour" ? Math.max(0, days.length - 1) : 0,
      visits: paid.reduce((s, d) => s + d.visits, 0),
      byDate,
    };
  }
}

/* The month in numbers, for the summary card. */
export function monthStats(rows, trips) {
  const paid = (rows || []).filter((r) => r.payable);
  const count = (t) => paid.filter((r) => r.dayType === t).length;
  return {
    ta: paid.reduce((s, r) => s + r.ta, 0),
    da: paid.reduce((s, r) => s + r.da, 0),
    km: Math.round(paid.reduce((s, r) => s + (r.km || 0) + (r.journey?.km || 0), 0)),
    days: paid.length,
    visits: paid.reduce((s, r) => s + r.visits, 0),
    hq: count("HQ"),
    eq: count("EQ"),
    away: paid.filter((r) => AWAY_TYPES.has(r.dayType)).length,
    // HQ cards hold no travel: a "trip" is a day out or a tour
    trips: trips.filter((t) => t.kind !== "hq").length,
    tours: trips.filter((t) => t.kind === "tour").length,
    noVisitDays: (rows || []).filter((r) => r.kind === "working" && !r.visits).length,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function dayLabel(iso, withDow = true) {
  const d = new Date(iso + "T00:00:00");
  return `${withDow ? DOW[d.getDay()] + " " : ""}${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function rangeLabel(from, to) {
  return from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`;
}
