// lib/fieldExpensesConsole.js — SERVER ONLY.
//
// The Field expenses console is the source of the planner's Field layer: it
// classifies every day (HQ / EQ / OS / OS-HQ / OS-EQ), counts the visits and
// prices TA and DA. Nothing is recomputed here — this module only reads the
// console's month and hands back one employee's share of it, as the console
// has it.
//
// The console's /api/dataset/<month> is one file for every employee (several
// MB), so it is read here on the server, kept 15 minutes, and only the
// caller's own rows ever leave.

const SOURCE = (process.env.FIELD_EXPENSES_URL || "https://field-expenses--elbrit-sso-d01d9.asia-southeast1.hosted.app").replace(/\/+$/, "");
const TTL_MS = 15 * 60 * 1000;
const datasets = new Map(); // month -> { at, promise }

export function loadDataset(month) {
  const hit = datasets.get(month);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = fetch(`${SOURCE}/api/dataset/${month}`, { headers: { Accept: "application/json" } })
    .then(async (r) => {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Field expenses console answered HTTP ${r.status}`);
      return r.json();
    })
    .catch((error) => {
      datasets.delete(month);
      throw error;
    });
  datasets.set(month, { at: Date.now(), promise });
  return promise;
}

/* A day as the planner shows it: the console's classification, money and
   places, without the GPS points and doctor ids it keeps for its own map. */
function shapeRow(r) {
  return {
    date: r.date,
    day: r.day,
    kind: r.kind, // working | off | holiday | leave | absent | unknown
    label: r.label || null,
    visits: r.n || 0,
    dayType: r.dayType || null, // HQ | EQ | OS | OS-HQ | OS-EQ, or the kind's label
    payable: !!r.payable,
    km: r.km ?? null,
    ta: Math.round(r.taA || 0),
    da: Math.round(r.daA || 0),
    journey: r.taOut
      ? { fare: Math.round(r.taOut), from: r.outFrom || null, to: r.outTo || null, via: r.outVia || null, km: r.outKm ?? null }
      : null,
    awayHq: r.osHq || null,
    farthest: r.osFar || (r.sfc && r.sfc.town) || null,
    chart: r.sfc ? { town: r.sfc.town || null, km: r.sfc.km ?? null, hq: r.sfc.otherHq || r.sfc.hq || null } : null,
    route: (r.route || []).map((s) => ({ place: s.place, km: s.km ?? null, visits: s.visits || 1, from: s.from || null })),
    routeKm: r.routeKm ?? null,
    fieldType: r.ftype || null,
  };
}

/* One employee's month, exactly as the console has it. null = the console has
   not built this month. { employee: null } = the month exists but this person
   is not in it (office staff, or not on the field). */
export async function consoleMonth(month, empCode) {
  const ds = await loadDataset(month);
  if (!ds) return null;
  const e = (ds.employees || []).find((x) => x.code === empCode);
  if (!e) return { month, pulledAt: ds.meta?.pulledAt || null, employee: null, rows: [] };

  const zone = ds.policy?.daPolicy?.[e.zone] || {};
  const pick = (table) => (table && table[e.role] !== undefined ? table[e.role] : null);
  return {
    month,
    pulledAt: ds.meta?.pulledAt || null,
    period: ds.meta?.period || null,
    employee: { code: e.code, name: e.name, role: e.role, designation: e.designation || null, zone: e.zone, hq: e.hq, department: e.department },
    rates: {
      da: { HQ: pick(zone.HQ), EQ: pick(zone.EQ), OS: pick(zone.OS) },
      perKm: pick(zone.perKm),
      railClass: pick(zone.railClass) || "3 TIER AC",
      mobile: pick(zone.mobile),
    },
    bands: {
      hqKm: ds.defaults?.hqKm ?? 25,
      eqKm: ds.defaults?.eqKm ?? 100,
      roadFactor: ds.defaults?.roadFactor ?? 1.3,
      season: ds.defaults?.season || "Peak",
    },
    totals: { ta: Math.round(e.taCal || 0), da: Math.round(e.daCal || 0), km: Math.round(e.kmTotal || 0) },
    rows: (ds.rows || []).filter((r) => r.emp === e.code).map(shapeRow).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
