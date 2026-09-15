/**
 * Everything the page computes, transcribed from the approved design's
 * renderVals().
 *
 * Every metric is attributed: support, POB and visits all carry a department
 * and a role by the time they reach here, so the department filter, the chart's
 * pager and the table's rows all mean the same thing whichever row they are
 * counting.
 */

import { MONTHS, T, monthLabel, monthsSince, now, plural } from "./format";

export const UNATTRIBUTED_NOTE =
  "Rows Ecubix sent as a monthly total with no product breakdown are grouped under Unassigned.";

/* ---------------------------------------------------------------- ranges */

export function financialYearStart(at = now()) {
  const y = at.getFullYear();
  return at.getMonth() >= 3 ? new Date(y, 3, 1) : new Date(y - 1, 3, 1);
}

const mStart = (y, m) => new Date(y, m, 1).getTime();
const mEnd = (y, m) => new Date(y, m + 1, 0, 23, 59, 59).getTime();

/**
 * Resolve the period control to a window.
 *
 * The bounds are LOCAL midnight and are handed to the formatters as-is. Routing
 * them through toISOString() first renders 1 April as 31 March, because ISO
 * restates a local midnight in UTC.
 */
export function resolveRange(range, at = now()) {
  const ny = at.getFullYear();
  const nm = at.getMonth();
  const fy = financialYearStart(at);
  const fyLabel = "FY " + String(fy.getFullYear()).slice(2) + "-" + String(fy.getFullYear() + 1).slice(2);
  const mode = range?.mode ?? "fy";

  let from = mStart(fy.getFullYear(), 3);
  let to = Infinity;
  let label = fyLabel;

  if (mode === "all") {
    from = -Infinity; to = Infinity; label = "All time";
  } else if (mode === "cur") {
    from = mStart(ny, nm); to = mEnd(ny, nm); label = monthLabel(ny, nm);
  } else if (mode === "last") {
    const p = new Date(ny, nm - 1, 1);
    from = mStart(p.getFullYear(), p.getMonth());
    to = mEnd(p.getFullYear(), p.getMonth());
    label = monthLabel(p.getFullYear(), p.getMonth());
  } else if (mode === "m3") {
    const p = new Date(ny, nm - 2, 1);
    from = mStart(p.getFullYear(), p.getMonth());
    to = mEnd(ny, nm);
    label = monthLabel(p.getFullYear(), p.getMonth()) + " – " + monthLabel(ny, nm);
  } else if (mode === "custom" && range?.from && range?.to) {
    const a = String(range.from).split("-").map(Number);
    const b = String(range.to).split("-").map(Number);
    from = mStart(a[0], a[1] - 1);
    to = mEnd(b[0], b[1] - 1);
    label = monthLabel(a[0], a[1] - 1) + " – " + monthLabel(b[0], b[1] - 1);
  }

  return { mode, from, to, label, fyLabel, bounded: from > -Infinity };
}

/* ------------------------------------------------------------ the window */

/**
 * Every month this doctor has anything on record, capped at the last 12.
 *
 * Capped at 36 while walking forward so a single row with a mangled date
 * cannot spin the loop out to the year 3000.
 */
export function monthWindow(pools, at = now()) {
  const all = pools.flat().filter(Boolean);
  const firstT = all.length ? Math.min(...all.map((r) => r.t)) : at.getTime();
  const first = new Date(firstT);
  const win = [];
  const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  const end = new Date(at.getFullYear(), at.getMonth(), 1);
  let guard = 0;
  while (cursor <= end && guard < 36) {
    win.push({ y: cursor.getFullYear(), m: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() + 1);
    guard += 1;
  }
  return { window: win.slice(-12), firstT, first };
}

/* ------------------------------------------------------------------- ROI */

/**
 * ROI is support earned from a service onward over every rupee of service from
 * that point — not a simple ratio of the two totals in the window.
 */
export function computeRoi(support, service) {
  const supTotal = sum(support);
  const svcTotal = sum(service);
  const tillDate = svcTotal > 0 ? supTotal / svcTotal : null;

  let latest = null;
  let latestSub = "No service in this view";
  if (service.length) {
    const s = service[0];
    const f = new Date(s.t);
    const start = new Date(f.getFullYear(), f.getMonth(), 1).getTime();
    const earned = support.filter((r) => r.t >= start).reduce((a, r) => a + r.amt, 0);
    const spent = service.filter((r) => r.t >= s.t).reduce((a, r) => a + r.amt, 0);
    latest = spent > 0 ? earned / spent : null;
    latestSub = null; // the caller formats this with its own date helper
  }
  return { tillDate, latest, latestService: service[0] ?? null, latestSub, supTotal, svcTotal };
}

export function sum(rows) {
  return (rows ?? []).reduce((a, r) => a + (r.amt ?? 0), 0);
}

/* ----------------------------------------------------------------- chart */

/**
 * One point per column centre, joined with symmetric beziers.
 *
 * Transcribed from the design. The control points sit on the midpoint X of each
 * pair, which is what keeps the curve from overshooting into negative money on
 * a spiky series.
 */
export function flow(vals, peak, W, H) {
  const n = vals.length;
  if (!n) return { line: "", pts: [] };
  const px = (i) => (i + 0.5) * (W / n);
  const py = (v) => H - (v / peak) * (H * 0.9);
  const p = vals.map((v, i) => ({ x: px(i), y: py(v) }));
  let d = "M" + p[0].x.toFixed(1) + "," + p[0].y.toFixed(1);
  for (let i = 0; i < p.length - 1; i += 1) {
    const a = p[i];
    const b = p[i + 1];
    const cx = (a.x + b.x) / 2;
    d += " C" + cx.toFixed(1) + "," + a.y.toFixed(1) + " " + cx.toFixed(1) + "," + b.y.toFixed(1)
      + " " + b.x.toFixed(1) + "," + b.y.toFixed(1);
  }
  return { line: d, pts: p };
}

/**
 * The monthly series for one department page. `dv` null means all of them.
 */
export function monthSeries(window, { support, service, pob, visits }, dv) {
  const inMonth = (r, y, m) => {
    const x = new Date(r.t);
    return x.getFullYear() === y && x.getMonth() === m;
  };
  const ofDiv = (rows) => (dv ? rows.filter((r) => r.div === dv) : rows);
  return window.map(({ y, m }) => {
    const hit = (r) => inMonth(r, y, m);
    return {
      y,
      m,
      label: monthLabel(y, m),
      short: MONTHS[m],
      sup: ofDiv(support).filter(hit).reduce((a, r) => a + r.amt, 0),
      svc: ofDiv(service).filter(hit).reduce((a, r) => a + r.amt, 0),
      pob: ofDiv(pob).filter(hit).reduce((a, r) => a + r.amt, 0),
      vis: ofDiv(visits).filter(hit).length,
    };
  });
}

/* ------------------------------------------------------- role  coverage */

/**
 * Who touched this doctor, by role rather than by name.
 *
 * Visits and services both count as a touch. A role with neither is still
 * rendered — an empty BE circle says "nobody has called" where a missing
 * circle says nothing at all.
 */
export function coverageByRole(ladder, { visits, service }) {
  const blank = (role) => ({
    role, visits: 0, svc: 0, svcAmt: 0, last: 0, lastD: null,
    divs: new Set(), heads: new Set(), byDiv: new Map(),
  });
  const map = new Map(ladder.map((k) => [k, blank(k)]));
  const touch = (k) => {
    const key = k || "Unassigned";
    if (!map.has(key)) map.set(key, blank(key));
    return map.get(key);
  };
  const stampLast = (e, r) => { if (r.t > e.last) { e.last = r.t; e.lastD = r.d; } };
  const div = (e, v) => {
    const key = v || "Unassigned";
    if (!e.byDiv.has(key)) e.byDiv.set(key, { v: key, vis: 0, svc: 0, amt: 0, last: 0, lastD: null, heads: new Set() });
    return e.byDiv.get(key);
  };

  visits.forEach((v) => {
    const e = touch(v.role);
    e.visits += 1; e.divs.add(v.div); e.heads.add(v.who); stampLast(e, v);
    const d = div(e, v.div); d.vis += 1; d.heads.add(v.who); stampLast(d, v);
  });
  service.forEach((s) => {
    const e = touch(s.role);
    e.svc += 1; e.svcAmt += s.amt; e.divs.add(s.div); e.heads.add(s.by); stampLast(e, s);
    const d = div(e, s.div); d.svc += 1; d.amt += s.amt; d.heads.add(s.by); stampLast(d, s);
  });

  const rank = (k) => { const i = ladder.indexOf(k); return i < 0 ? ladder.length : i; };
  return [...map.values()].sort((a, b) => rank(a.role) - rank(b.role));
}

/* -------------------------------------------------------- the data table */

/**
 * The department table, with an optional month pivot.
 *
 * Columns are built once as a flat list and the grid template is derived from
 * its length, because a CSS grid is the only way to keep the first column
 * sticky while an arbitrary number of month blocks scroll under the header.
 *
 * Every column is real, support included — its department comes off the Support
 * Items child rows, not off the parent.
 */
export function buildTable({
  divisions, support, service, pob, visits, months, range,
  canSeeService, pivotOn, ladder, money, count,
}) {
  const inMonth = (r, y, m) => {
    const x = new Date(r.t);
    return x.getFullYear() === y && x.getMonth() === m;
  };
  const windowMonths = months.filter((r) => mEnd(r.y, r.m) >= range.from && mStart(r.y, r.m) <= range.to);
  const pivotMonths = windowMonths.length ? windowMonths : months.slice(-6);
  const blocks = pivotOn ? pivotMonths.map((mo) => ({ mo })).concat([{ mo: null }]) : [{ mo: null }];

  const num = (v) => ({ v: v ? money(v) : "—", n: v ?? 0 });
  const cnt = (v) => ({ v: v ? String(v) : "—", n: v ?? 0 });

  const cellsFor = (dv) => {
    const pick = (rows) => rows.filter((r) => r.div === dv);
    const out = [];
    blocks.forEach(({ mo }) => {
      const inB = (r) => !mo || inMonth(r, mo.y, mo.m);
      out.push(num(sum(pick(support).filter(inB))));
      if (canSeeService) out.push(num(sum(pick(service).filter(inB))));
      if (pivotOn) {
        out.push(num(sum(pick(pob).filter(inB))));
        ladder.forEach((k) => out.push(cnt(pick(visits).filter(inB).filter((r) => r.role === k).length)));
      } else {
        ladder.forEach((k) => out.push(num(sum(pick(pob).filter((r) => r.role === k)))));
        ladder.forEach((k) => out.push(cnt(pick(visits).filter((r) => r.role === k).length)));
      }
    });
    return out;
  };

  const rows = divisions.map((dv) => ({
    key: "dt-" + dv,
    label: dv,
    cells: cellsFor(dv),
  }));

  const groups = [];
  const subs = [];
  // Every column is tagged with the metric it belongs to. Matching on the
  // LABEL instead looks fine until the non-pivot layout, where "BE" is both a
  // POB column and a visits column and an item row quietly fills both.
  if (pivotOn) {
    const heads = [{ label: "Support", metric: "support" }]
      .concat(canSeeService ? [{ label: "Service", metric: "service" }] : [])
      .concat([{ label: "POB", metric: "pob" }])
      .concat(ladder.map((k) => ({ label: "Visits " + k, metric: "visit", role: k })));
    pivotMonths.concat([{ label: "Total" }]).forEach((mo) => {
      groups.push({ label: mo.label, span: heads.length, total: mo.label === "Total" });
      heads.forEach((h) => subs.push({ ...h }));
    });
  } else {
    groups.push({ label: "Support", span: 1, total: false });
    subs.push({ label: "Amount", metric: "support" });
    if (canSeeService) {
      groups.push({ label: "Service", span: 1, total: false });
      subs.push({ label: "Amount", metric: "service" });
    }
    groups.push({ label: "POB by role", span: ladder.length, total: false });
    ladder.forEach((k) => subs.push({ label: k, metric: "pob", role: k }));
    groups.push({ label: "Visits by role", span: ladder.length, total: false });
    ladder.forEach((k) => subs.push({ label: k, metric: "visit", role: k }));
  }

  // Zero reads as an em dash here too. A column of dashes with a hard "₹0" at
  // the bottom says the total is a different KIND of nothing, which it is not.
  const cash = (v) => (v ? money(v) : "—");
  const totals = [];
  blocks.forEach(({ mo }) => {
    const inB = (r) => !mo || inMonth(r, mo.y, mo.m);
    totals.push({ v: cash(sum(support.filter(inB))) });
    if (canSeeService) totals.push({ v: cash(sum(service.filter(inB))) });
    if (pivotOn) {
      totals.push({ v: cash(sum(pob.filter(inB))) });
      ladder.forEach((k) => totals.push({ v: count(visits.filter(inB).filter((r) => r.role === k).length) }));
    } else {
      ladder.forEach((k) => totals.push({ v: cash(sum(pob.filter((r) => r.role === k))) }));
      ladder.forEach((k) => totals.push({ v: count(visits.filter((r) => r.role === k).length) }));
    }
  });

  const firstW = 178;
  const colW = 112;
  return {
    rows, groups, subs, totals,
    firstW,
    template: firstW + "px repeat(" + subs.length + "," + colW + "px)",
    minWidth: firstW + subs.length * colW + "px",
    firstCol: pivotOn ? "Department · month pivot" : "Department",
    pivotMonths,
  };
}

/* ---------------------------------------------------------------- pieces */

export function monthsSinceLabel(t) {
  const n = monthsSince(t);
  return n == null ? "" : plural(n, "mo", "mo");
}

export { mStart, mEnd, T };
