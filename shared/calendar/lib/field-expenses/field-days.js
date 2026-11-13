/* Field layer data — the signed-in rep's TA/DA per day, as the ERP's Field
   Expense build priced it (Field Expense Day, the same figures as the
   /field-expenses dashboard), read straight from the ERP with the rep's own
   token: field_expense_month answers with the caller's own days only.

   Nothing here prices a day. The ERP owns the rules (day types from GPS and
   the fare chart, the TA DA Rate card, IRCTC above eqKm, outstation DA at 50 %
   without a bill); this file maps its days onto the shape the screens use and
   groups them into trips. */

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

const erpBase = (url) => String(url || "").replace(/(\/api(?:\/method)?\/graphql|\/graphql)\/?$/i, "").replace(/\/$/, "");
const authHeader = (t) => (/^(token|bearer)\s/i.test(t) ? t : `token ${t}`);

/* One month for the signed-in user. Cached per month for the session; a
   failure is not cached, so moving away and back asks again.
   -> { month, pulledAt, employee, bands, rows } -- employee null = the ERP
      has no field days for this person (office staff). */
export function fetchFieldMonth(month) {
  const hit = cache.get(month);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const { erpUrl, authToken } = AUTH_CONFIG;
  if (!erpUrl || !authToken) return Promise.reject(new FieldDaysError("Not signed in", { status: 401 }));

  // no employee= : the ERP answers with the caller's own days, whoever they are
  const promise = fetch(`${erpBase(erpUrl)}/api/method/field_expense_month?${new URLSearchParams({ month })}`, {
    headers: { Authorization: authHeader(authToken) },
  })
    .then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        let msg = body.exception || `HTTP ${r.status}`;
        try {
          msg = JSON.parse(JSON.parse(body._server_messages)[0]).message || msg;
        } catch {
          /* keep msg */
        }
        throw new FieldDaysError(String(msg).replace(/<[^>]*>/g, "").replace(/^[\w.]+Error:\s*/, ""), { status: r.status });
      }
      return shapeMonth(month, body.message || {});
    })
    .catch((error) => {
      cache.delete(month);
      throw error;
    });
  cache.set(month, { at: Date.now(), promise });
  return promise;
}

function shapeMonth(month, m) {
  const days = m.days || [];
  // a month after the last one the ERP has built has no days for anyone yet
  if (!days.length && m.built_month && month > m.built_month) {
    throw new FieldDaysError(`TA/DA for ${month} is not built in the ERP yet.`, { status: 404, code: "no-month" });
  }
  return {
    month,
    pulledAt: m.built_on || null,
    // nobody's days, nobody to show: the layer stays off
    employee: days.length ? m.employee || { code: days[0].employee, name: days[0].employee_name } : null,
    bands: { hqKm: m.hq_km ?? 25, eqKm: m.eq_km ?? 100 },
    rows: days.map(shapeDay).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/* The build's names for a day that was not worked -> the planner's kind. */
const KIND_OF = { "Weekly off": "off", Holiday: "holiday", Leave: "leave", Absent: "absent", Unknown: "unknown", "—": "unknown" };
const strip = (p) => String(p || "").replace(/^HQ[-\s]*/i, "").trim();

/* "HQ Salem → Namakkal (60 km) → HQ Coimbatore" -> stops. */
function routeStops(text) {
  return String(text || "")
    .split("→")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^(.*?)\s*\((\d+(?:\.\d+)?)\s*km\)$/.exec(s);
      return { place: strip(m ? m[1] : s), km: m ? Number(m[2]) : null, visits: 1, from: null };
    });
}

/* A Field Expense Day -> the row the planner's screens read. */
export function shapeDay(d) {
  const x = d.detail || {};
  const raw = x.dayType || d.day_type || "";
  const payable = !!x.payable;
  // an HQ day that went ex-station (HQ-EQ), or a day in another HQ for a role
  // without outstation pay (EQ-HQ / EQ-EQ), is paid as an ex-HQ day out and back
  const dayType = x.hqEq || raw === "EQ-HQ" || raw === "EQ-EQ" ? "EQ" : raw;
  const legs = x.legs || [];
  const local = legs.find((l) => l.leg === "Local") || null;
  const travel = legs.filter((l) => l.leg !== "Local");
  const away = AWAY_TYPES.has(dayType);
  const journey = travel.length
    ? {
        fare: Math.round(x.taOut ?? travel.reduce((s, l) => s + (Number(l.fare) || 0), 0)),
        from: strip(travel[0].from_place) || null,
        to: strip(travel[travel.length - 1].to_place) || null,
        via: null,
        km: travel.reduce((s, l) => s + (Number(l.km) || 0), 0) || null,
      }
    : null;
  return {
    date: String(d.date).slice(0, 10),
    kind: KIND_OF[raw] || (payable || TRAVEL_TYPES.has(dayType) || dayType === "HQ" ? "working" : "unknown"),
    label: KIND_OF[raw] ? raw : null,
    visits: d.visits || 0,
    dayType: dayType || null,
    payable,
    km: x.km ?? (d.reach_km || null),
    ta: Math.round(d.ta || 0),
    da: Math.round(d.da || 0),
    journey,
    awayHq: away && local ? strip(local.from_place) || null : null,
    farthest: local && strip(local.to_place) !== strip(local.from_place) ? strip(local.to_place) : null,
    chart: local ? { town: strip(local.to_place) || null, km: local.rounded_km ?? local.km ?? null, hq: null } : null,
    route: routeStops(x.route_text || d.route),
    routeKm: x.localKm ?? null,
    fieldType: null,
    // the ERP's own: outstation DA in full (paid at 50 % without a bill), the
    // bill it holds, and whether the day is already claimed (never re-priced)
    osDaFull: Math.round(d.os_da_full || x.osDaFull || 0),
    bill: Math.round(d.bill || 0),
    status: d.status || "Draft",
    legs,
    flags: x.flags || [],
  };
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
  // a travel day with no local run: where the journey went
  if (row.journey?.to) return row.journey.to;
  const far = [...(row.route || [])].sort((a, b) => (b.km || 0) - (a.km || 0))[0];
  return far?.place || null;
}

/* How the TA on a day was reached, in words, from the ERP's own fare legs: a
   local run up to eqKm at the per-km rate (the leg's fare over its km), above
   it the IRCTC fare; a journey between HQs (Trip / Home / out-and-back legs)
   is the rail fare whatever its km. A leg paid out and back says so. */
export function fareBasis(row, data) {
  if (!row || !row.ta) return null;
  const eqKm = data?.bands?.eqKm ?? 100;
  const paid = (row.legs || []).filter((l) => Number(l.fare) > 0);
  if (!paid.length) return null;
  return paid
    .map((l) => {
      const km = l.rounded_km ?? l.km;
      const ways = l.both_ways ? 2 : 1;
      const legs = ways > 1 ? " × 2 legs" : "";
      if (l.leg === "Local" && km > 0 && km <= eqKm) return `${km} km × ₹${Math.round((l.fare / (km * ways)) * 100) / 100}${legs}`;
      return `${km} km · rail fare${legs}`;
    })
    .join(" + ");
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
     - outstation days (OS / OS-HQ / OS-EQ) on consecutive dates are one trip
       while the rep stays in one town; a journey on to ANOTHER town starts a
       new trip (12 Nov 2026: Chennai -> Bangalore -> Coimbatore -> Erode is
       three stays, three trips), and the journey home to the rep's HQ joins
       the trip it closes;
     - a weekly off or holiday between two outstation days stays in the trip
       of the town the rep was in (they stayed there), and adds nothing to it;
     - every HQ day is a card of its own ("hq"): no travel, its DA claimed
       on its own. */
/* home: the rep's HQ town, only a fallback -- the town a tour LEFT FROM is
   home for that tour (the ERP's build says so: "HQ Chennai -> HQ Bangalore"),
   which tells the journey home from a move on to another town. */
export function buildTrips(rows, home = null) {
  const homeTown = strip(home).toLowerCase();
  let origin = null; // the town the current run of stays left from
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
    if (prevDate && nextDate(prevDate) !== r.date) {
      close();
      origin = null;
    }
    prevDate = r.date;

    const away = r.payable && AWAY_TYPES.has(r.dayType);
    const eq = r.payable && r.dayType === "EQ";
    const homeLeg = r.payable && !away && !eq && !!r.journey && !!cur;
    const hqDay = r.payable && !away && !eq && !homeLeg;

    if (hqDay) {
      close();
      origin = null;
      trips.push(finish({ days: [r] }));
    } else if (away) {
      const to = strip(r.journey?.to).toLowerCase();
      // a run of stays starts: it left from its first journey's town
      if (!cur) origin = origin || strip(r.journey?.from).toLowerCase() || homeTown || null;
      const goingHome = !!r.journey && !!to && to === (origin || homeTown);
      // a journey on to another town ends the stay before it: a new trip
      // (the days off before it stay with the town the rep was in)
      if (cur && r.journey && !goingHome && to && to !== cur.base) {
        cur.days.push(...pending);
        close();
      }
      if (!cur) cur = { days: [], base: to || strip(r.awayHq || dayPlace(r)).toLowerCase(), home: origin };
      cur.days.push(...pending, r);
      pending = [];
      // the journey home closes the trip, and the run of stays
      if (goingHome) {
        close();
        origin = null;
      }
    } else if (homeLeg) {
      cur.days.push(...pending, r);
      close();
      origin = null;
    } else if (eq) {
      close();
      origin = null;
      trips.push(finish({ days: [r] }));
    } else if (cur && !r.payable && r.kind !== "working") {
      pending.push(r); // a day off in the middle of a tour
    } else {
      close();
      origin = null;
    }
  }
  close();
  return trips;

  function finish(t) {
    const days = t.days;
    const paid = days.filter((d) => d.payable);
    // named by where the rep stayed and worked -- never the town the trip
    // came from or home
    const home = String(t.home || "").toLowerCase();
    const places = [];
    for (const d of paid) {
      for (const p of [d.journey?.to, dayPlace(d)]) if (p && !places.includes(p) && p.toLowerCase() !== home) places.push(p);
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
