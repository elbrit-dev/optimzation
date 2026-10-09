/* Pure aggregation over the elbrit_sm_review answer (server/elbrit_sm_review.py).
 *
 * Every number on the Review Report comes from a function here. None of them
 * touch React, the network or the clock, so the page and the tests share one
 * code path. If a component is summing something, it belongs here.
 *
 * THE ANSWER (indexes, not names, to stay small):
 *   months            ["2025-04", …, upto] — LY April first, so month i's
 *                     same-month-last-year is i − 12
 *   tree[s]           seats under root; every block's `s` indexes this
 *   sales.pairs[p]    a (department, HQ) target/primary unit and its `owner`
 *                     seat — a pair BEs share is owned by their manager
 *   sales.rows        [p, month, target, primary]
 *   secondary.rows    [month, s, distributor, sold₹, closing₹, soldQty, closingQty]
 *   doctors.rows      [month, s, doctor, amount, qty]
 *   service.rows      [month, s, doctor, service, state, amount, count]
 *
 * A SCOPE is a set of seats plus the target/primary pairs they own — a
 * seat's whole subtree, or every seat and pair of one department (the way
 * the paper review groups RBMs). Every selector takes one.
 *
 * A MONTH WITH NO ROWS IS MISSING, NOT ZERO. Doctor support for Aug-2026 is
 * absent on production; reading it as 0 turns every doctor into "dropped".
 * Each series therefore carries `has[i]`, and the buckets baseline on the
 * months that have data. */

import { monthShort } from './format';

export const THRESHOLDS = {
  overstock: 2,        // closing ≥ 2 × sold
  bucketPct: 0.1,      // a doctor moved if |Δ| ≥ 10 % of baseline …
  bucketMin: 2000,     // … and ≥ ₹2,000
  baselineMonths: 3,   // average of up to 3 earlier months that have data
  lookback: 6,         // … found within the 6 months before
  entryGap: 0.3,       // a seat's month below 30 % of its own average = entry gap
  lowAch: 0.9,         // children under 90 % of target are called out
  chronic: 3,          // overstocked this many months running
};

/* ---- index -------------------------------------------------------------- */

export function indexAnswer(a) {
  const months = a?.months ?? [];
  const tree = a?.tree ?? [];
  const byId = new Map(tree.map((t, i) => [t.id, i]));
  const kids = new Map();
  tree.forEach((t, i) => {
    if (t.reportsTo == null) return;
    const p = byId.get(t.reportsTo);
    if (p == null) return;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(i);
  });
  const pairs = a?.sales?.pairs ?? [];
  const depts = [...new Set([...tree.map((t) => t.dept), ...pairs.map((p) => p.dept)].filter(Boolean))].sort();
  const fyStart = Math.max(0, months.indexOf(`${a?.fy}-04`));
  return {
    raw: a,
    months,
    fyStart,
    open: a?.meta?.open ?? null,
    tree,
    byId,
    kids,
    pairs,
    depts,
    salesRows: a?.sales?.rows ?? [],
    unmapped: a?.sales?.unmapped ?? [],
    secRows: a?.secondary?.rows ?? [],
    distributors: a?.secondary?.distributors ?? [],
    supRows: a?.doctors?.rows ?? [],
    assigned: a?.doctors?.assigned ?? {},
    svcRows: a?.service?.rows ?? [],
    services: a?.service?.services ?? [],
    doctorIds: a?.doctorIds ?? [],
    docIndex: new Map((a?.doctorIds ?? []).map((d, i) => [d, i])),
    doctorInfo: a?.doctorInfo ?? [],
    draftLines: a?.meta?.draftLines ?? {},
  };
}

export function subtreeOf(ix, i) {
  const out = new Set();
  const stack = [i];
  while (stack.length) {
    const n = stack.pop();
    if (out.has(n)) continue;
    out.add(n);
    for (const k of ix.kids.get(n) ?? []) stack.push(k);
  }
  return out;
}

/* sel: { kind: 'seat', id } | { kind: 'dept', id } */
export function scopeOf(ix, sel) {
  if (sel?.kind === 'dept') {
    const seats = new Set();
    ix.tree.forEach((t, i) => { if (t.dept === sel.id) seats.add(i); });
    const pairs = [];
    ix.pairs.forEach((p, i) => { if (p.dept === sel.id) pairs.push(i); });
    return { sel, seats, pairs, node: null, label: deptShort(sel.id) };
  }
  const at = ix.byId.get(sel?.id);
  const i = at ?? 0;
  const seats = ix.tree.length ? subtreeOf(ix, i) : new Set();
  const pairs = [];
  ix.pairs.forEach((p, k) => { if (seats.has(p.owner)) pairs.push(k); });
  const node = ix.tree[i] ?? null;
  return { sel: { kind: 'seat', id: node?.id }, seats, pairs, node, label: node?.name ?? '' };
}

export function deptShort(d) {
  return String(d ?? '').replace(/\s*-\s*ELPL$/, '');
}

/* Root → … → this seat, for breadcrumbs. */
export function chainOf(ix, id) {
  const out = [];
  let i = ix.byId.get(id);
  let hops = 0;
  while (i != null && hops < 20) {
    out.unshift(ix.tree[i]);
    const p = ix.tree[i].reportsTo;
    i = p == null ? null : ix.byId.get(p);
    hops += 1;
  }
  return out;
}

/* ---- series (one value per month of ix.months) -------------------------- */

const zeros = (n) => Array.from({ length: n }, () => 0);

/* TARGET AND PRIMARY FOR A SHARED (department, HQ), ALLOCATED.
 *
 * The ERP keeps target and primary per department + HQ, not per seat. Where
 * two or more BEs share a pair, its owner is their nearest common manager and
 * any scope holding that manager counts the pair whole. A scope holding only
 * SOME of the pair's BEs (one BE; an ABM whose BEs share an HQ with another
 * ABM's) gets those BEs' SHARE of it:
 *   target   split EQUALLY between the BEs of the pair (the same job there)
 *   primary  by each BE's share of the secondary sold that month (their
 *            lines carry their seat); equally when none entered any
 * — so a BE's achievement follows their own sell-out. (Splitting both by
 * the same share made every BE of an HQ show the HQ's achievement.) Shares
 * of a pair add up to the pair, so every manager's and department's total
 * is unchanged.
 *
 * pair → month → seat → weight, worked out once per answer. */
const ALLOC = new WeakMap();
function allocation(ix) {
  if (ALLOC.has(ix)) return ALLOC.get(ix);
  const sold = new Map(); // "seat|month" → secondary ₹
  for (const [m, s2, , sv] of ix.secRows) sold.set(`${s2}|${m}`, (sold.get(`${s2}|${m}`) ?? 0) + sv);
  const out = new Map();
  ix.pairs.forEach((p, k) => {
    if (p.seats.length < 2) return;
    const byMonth = new Map();
    for (let m = 0; m < ix.months.length; m += 1) {
      const w = p.seats.map((st) => Math.max(0, sold.get(`${st}|${m}`) ?? 0));
      const total = w.reduce((a, b) => a + b, 0);
      byMonth.set(m, new Map(p.seats.map((st, j) => [st, total ? w[j] / total : 1 / p.seats.length])));
    }
    out.set(k, byMonth);
  });
  ALLOC.set(ix, out);
  return out;
}

export function salesSeries(ix, scope) {
  const n = ix.months.length;
  const target = zeros(n);
  const primary = zeros(n);
  const want = new Set(scope.pairs);
  /* Shared pairs this scope holds part of, without their owner. */
  const partial = new Map();
  if (scope.sel?.kind !== 'dept') {
    ix.pairs.forEach((p, k) => {
      if (want.has(k) || p.seats.length < 2) return;
      const mine = p.seats.filter((st) => scope.seats.has(st));
      if (mine.length) partial.set(k, mine);
    });
  }
  const alloc = partial.size ? allocation(ix) : null;
  for (const [p, m, t, v] of ix.salesRows) {
    if (want.has(p)) {
      target[m] += t;
      primary[m] += v;
    } else if (partial.has(p)) {
      const mine = partial.get(p);
      const w = alloc.get(p)?.get(m);
      target[m] += t * (mine.length / ix.pairs[p].seats.length);
      primary[m] += v * mine.reduce((a, st) => a + (w?.get(st) ?? 0), 0);
    }
  }
  return { target, primary, hasPairs: scope.pairs.length > 0 || partial.size > 0, allocated: partial.size > 0 };
}

export function secondarySeries(ix, scope) {
  const n = ix.months.length;
  const sold = zeros(n);
  const closing = zeros(n);
  const has = Array(n).fill(false);
  for (const [m, s, , sv, cv] of ix.secRows) {
    if (!scope.seats.has(s)) continue;
    sold[m] += sv;
    closing[m] += cv;
    has[m] = true;
  }
  return { sold, closing, has };
}

export function supportSeries(ix, scope) {
  const n = ix.months.length;
  const amount = zeros(n);
  const has = Array(n).fill(false);
  for (const [m, s, , a] of ix.supRows) {
    if (!scope.seats.has(s)) continue;
    amount[m] += a;
    has[m] = true;
  }
  return { amount, has };
}

export function serviceSeries(ix, scope) {
  const n = ix.months.length;
  const amount = zeros(n);
  const has = Array(n).fill(false);
  for (const [m, s, , , , a] of ix.svcRows) {
    if (!scope.seats.has(s)) continue;
    amount[m] += a;
    has[m] = true;
  }
  return { amount, has };
}

const sum = (arr, a, b) => {
  let t = 0;
  for (let i = a; i <= b; i += 1) t += arr[i] ?? 0;
  return t;
};
const div = (a, b) => (b ? a / b : null);

/* ---- the scorecard ------------------------------------------------------ */

export function beCount(ix, scope) {
  let all = 0;
  let filled = 0;
  for (const s of scope.seats) {
    if (ix.tree[s]?.tier !== 'BE') continue;
    all += 1;
    if (!ix.tree[s].vacant) filled += 1;
  }
  return { all, filled };
}

export function scorecard(ix, scope, mi) {
  const S = salesSeries(ix, scope);
  const X = secondarySeries(ix, scope);
  const be = beCount(ix, scope);
  const ly = mi - 12;
  const months = mi - ix.fyStart + 1;
  const ytdT = sum(S.target, ix.fyStart, mi);
  const ytdP = sum(S.primary, ix.fyStart, mi);
  const p = S.primary[mi] ?? 0;
  const sec = X.has[mi] ? X.sold[mi] : null;
  const secLy = ly >= 0 && X.has[ly] ? X.sold[ly] : null;
  return {
    hasSales: S.hasPairs,
    allocated: S.allocated,
    target: S.target[mi] ?? 0,
    primary: p,
    ach: div(p, S.target[mi]),
    ytdTarget: ytdT,
    ytdPrimary: ytdP,
    ytdAch: div(ytdP, ytdT),
    primaryLy: ly >= 0 ? S.primary[ly] : null,
    growth: ly >= 0 && S.primary[ly] ? p / S.primary[ly] - 1 : null,
    be: be.all,
    beFilled: be.filled,
    pcpm: div(p, be.all),
    ytdPcpm: div(ytdP, be.all * months),
    secondary: sec,
    secondaryLy: secLy,
    secGrowth: sec != null && secLy ? sec / secLy - 1 : null,
    closing: X.has[mi] ? X.closing[mi] : null,
    priSec: sec ? p / sec : null,
  };
}

/* A BE whose (department, HQ) another BE shares has no pair of its own: its
   target and primary are counted at the manager who owns the pair. */
/* The shared HQ(s) whose target and primary this scope holds only a share
   of — for the "allocated by secondary share" note. */
export function sharedAt(ix, scope) {
  if (scope.sel?.kind !== 'seat') return null;
  const want = new Set(scope.pairs);
  const p = ix.pairs.find((x, k) => !want.has(k) && x.seats.length > 1 && x.seats.some((st) => scope.seats.has(st)));
  if (!p) return null;
  return { owner: ix.tree[p.owner], hq: p.hq, with: p.seats.length };
}

/* The SALES sheet: one scorecard per FY month. */
export function salesGrid(ix, scope) {
  const out = [];
  for (let i = ix.fyStart; i < ix.months.length; i += 1) out.push({ i, month: ix.months[i], sc: scorecard(ix, scope, i) });
  return out;
}

/* ---- trend -------------------------------------------------------------- */

export function trend(ix, scope) {
  const S = salesSeries(ix, scope);
  const X = secondarySeries(ix, scope);
  const out = [];
  for (let i = ix.fyStart; i < ix.months.length; i += 1) {
    out.push({
      i,
      month: ix.months[i],
      target: S.target[i],
      primary: S.primary[i],
      primaryLy: i >= 12 ? S.primary[i - 12] : null,
      secondary: X.has[i] ? X.sold[i] : null,
      ach: div(S.primary[i], S.target[i]),
    });
  }
  return out;
}

/* ---- months ------------------------------------------------------------- */

/* The last month whose entries have closed (before meta.open), inside the
   FY — the month a review is held on. */
export function defaultMonth(ix) {
  let i = ix.months.length - 1;
  if (ix.open) {
    const o = ix.months.indexOf(ix.open);
    if (o > 0) i = o - 1;
  }
  return Math.max(ix.fyStart, Math.min(i, ix.months.length - 1));
}

export function isOpen(ix, mi) {
  return Boolean(ix.open && ix.months[mi] >= ix.open);
}

/* Up to `baselineMonths` earlier months that HAVE data, newest first, within
   the lookback — so a missing August makes September compare with Jul, Jun, May. */
export function baselineMonths(has, mi, T = THRESHOLDS) {
  const out = [];
  for (let j = mi - 1; j >= 0 && j >= mi - T.lookback && out.length < T.baselineMonths; j -= 1) {
    if (has[j]) out.push(j);
  }
  return out;
}

/* ---- doctors: increase / decrease buckets -------------------------------- */

export const BUCKETS = [
  { id: 'new', label: 'New', tone: 'brand' },
  { id: 'up', label: 'Increased', tone: 'success' },
  { id: 'stable', label: 'Stable', tone: 'neutral' },
  { id: 'down', label: 'Decreased', tone: 'warning' },
  { id: 'dropped', label: 'Dropped', tone: 'danger' },
];

export function bucketOf(cur, base, T = THRESHOLDS) {
  if (!base && !cur) return null;
  if (!base) return 'new';
  if (!cur) return 'dropped';
  const d = cur - base;
  if (Math.abs(d) < T.bucketMin || Math.abs(d) / base < T.bucketPct) return 'stable';
  return d > 0 ? 'up' : 'down';
}

export function doctorBuckets(ix, scope, mi, T = THRESHOLDS) {
  const { has } = supportSeries(ix, scope);
  const base = baselineMonths(has, mi, T);
  const empty = Object.fromEntries(BUCKETS.map((b) => [b.id, { count: 0, delta: 0 }]));
  if (!has[mi]) return { missing: true, baseline: base, summary: empty, rows: [], lastWithData: lastWith(has, mi) };
  const window = new Set([mi, ...base]);
  const from = Math.max(0, mi - 5);
  const per = new Map();
  for (const [m, s, d, a] of ix.supRows) {
    if (!scope.seats.has(s) || m < from || m > mi) continue;
    let r = per.get(d);
    if (!r) {
      r = { amounts: new Map(), seats: new Set() };
      per.set(d, r);
    }
    r.amounts.set(m, (r.amounts.get(m) ?? 0) + a);
    if (window.has(m)) r.seats.add(s);
  }
  const rows = [];
  const summary = structuredClone(empty);
  for (const [d, r] of per) {
    const cur = r.amounts.get(mi) ?? 0;
    const avg = base.length ? base.reduce((t, j) => t + (r.amounts.get(j) ?? 0), 0) / base.length : 0;
    const b = bucketOf(cur, avg, T);
    if (!b) continue;
    const info = ix.doctorInfo[d] ?? [];
    const row = {
      doctor: ix.doctorIds[d],
      name: info[0] ?? ix.doctorIds[d],
      code: info[1] ?? null,
      spec: info[2] ?? null,
      category: info[3] ?? null,
      hq: info[4] ?? null,
      current: cur,
      baseline: avg,
      delta: cur - avg,
      bucket: b,
      series: Array.from({ length: mi - from + 1 }, (_, k) => (has[from + k] ? r.amounts.get(from + k) ?? 0 : null)),
      seats: [...r.seats].map((s) => ix.tree[s]?.name).filter(Boolean),
    };
    rows.push(row);
    summary[b].count += 1;
    summary[b].delta += row.delta;
  }
  rows.sort((x, y) => x.delta - y.delta);
  return { missing: false, baseline: base, summary, rows, seriesFrom: from };
}

function lastWith(has, mi) {
  for (let j = mi; j >= 0; j -= 1) if (has[j]) return j;
  return null;
}

/* ---- stockists: overstock ------------------------------------------------ */

export function stockists(ix, scope, mi, T = THRESHOLDS) {
  const from = Math.max(0, mi - 5);
  const per = new Map();
  for (const [m, s, c, sv, cv] of ix.secRows) {
    if (!scope.seats.has(s) || m < from || m > mi) continue;
    let r = per.get(c);
    if (!r) {
      r = { sold: new Map(), closing: new Map(), seats: new Set() };
      per.set(c, r);
    }
    r.sold.set(m, (r.sold.get(m) ?? 0) + sv);
    r.closing.set(m, (r.closing.get(m) ?? 0) + cv);
    if (m === mi) r.seats.add(s);
  }
  const over = (s, c) => s > 0 && c >= T.overstock * s;
  const rows = [];
  for (const [c, r] of per) {
    if (!r.sold.has(mi)) continue;
    const sold = r.sold.get(mi);
    const closing = r.closing.get(mi);
    let streak = 0;
    for (let j = mi; j >= from && r.sold.has(j) && over(r.sold.get(j), r.closing.get(j)); j -= 1) streak += 1;
    rows.push({
      name: ix.distributors[c] ?? String(c),
      sold,
      closing,
      ratio: sold > 0 ? closing / sold : null,
      excess: over(sold, closing) ? closing - T.overstock * sold : 0,
      over: over(sold, closing),
      dead: sold <= 0 && closing > 0,
      streak,
      chronic: streak >= T.chronic,
      seats: [...r.seats].map((s) => ix.tree[s]?.name).filter(Boolean),
      series: Array.from({ length: mi - from + 1 }, (_, k) => ({
        sold: r.sold.get(from + k) ?? null,
        closing: r.closing.get(from + k) ?? null,
      })),
    });
  }
  rows.sort((a, b) => b.excess - a.excess || (b.ratio ?? 0) - (a.ratio ?? 0));
  const tot = rows.reduce((t, r) => ({ s: t.s + r.sold, c: t.c + r.closing }), { s: 0, c: 0 });
  return {
    missing: rows.length === 0,
    rows,
    summary: {
      stockists: rows.length,
      over: rows.filter((r) => r.over).length,
      excess: rows.reduce((t, r) => t + r.excess, 0),
      dead: rows.filter((r) => r.dead).length,
      chronic: rows.filter((r) => r.chronic).length,
      cover: tot.s ? tot.c / tot.s : null,
    },
  };
}

/* ---- children: the team (or HQ) list under the scope -------------------- */

export function childScopes(ix, scope) {
  if (scope.sel?.kind === 'dept') return [];
  const i = ix.byId.get(scope.sel?.id);
  return (ix.kids.get(i) ?? []).map((k) => scopeOf(ix, { kind: 'seat', id: ix.tree[k].id }));
}

/* One row per child seat: the headline of each tab, so the list can sort by
   whatever the page is looking at. */
export function childRows(ix, scope, mi) {
  return childScopes(ix, scope).map((c) => scopeRow(ix, c, mi));
}

/* The headline numbers of one scope — a tree node, a child, a department. */
export function scopeRow(ix, c, mi) {
  const db = doctorBuckets(ix, c, mi);
  const st = stockists(ix, c, mi);
  return {
    sel: c.sel,
    node: c.node,
    label: c.label,
    scorecard: scorecard(ix, c, mi),
    shared: sharedAt(ix, c),
    doctors: db.missing ? null : db.summary,
    stock: st.missing ? null : st.summary,
    gap: entryGap(ix, c, mi),
    leaf: c.sel?.kind === 'dept' || !(ix.kids.get(ix.byId.get(c.sel.id)) ?? []).length,
  };
}

/* A department's HQs — the department lens has no seats to drill into, but
   the paper review lists its HQs. */
export function hqRows(ix, scope, mi) {
  if (scope.sel?.kind !== 'dept') return [];
  return scope.pairs.map((p) => {
    const pair = ix.pairs[p];
    const sc = { sel: null, seats: new Set(), pairs: [p] };
    ix.tree.forEach((t, i) => { if (t.dept === pair.dept && t.hq === pair.hq) sc.seats.add(i); });
    return { hq: pair.hq, owner: ix.tree[pair.owner], scorecard: scorecard(ix, sc, mi) };
  });
}

/* A month far below the seat's own recent average — most often an entry
   that has not been made, not a market that vanished. */
export function entryGap(ix, scope, mi, T = THRESHOLDS) {
  const X = secondarySeries(ix, scope);
  const base = baselineMonths(X.has, mi, T);
  if (!base.length) return null;
  const avg = base.reduce((t, j) => t + X.sold[j], 0) / base.length;
  if (avg <= 0) return null;
  const cur = X.has[mi] ? X.sold[mi] : 0;
  return cur < T.entryGap * avg ? { current: cur, usual: avg } : null;
}

/* ---- attention: the overview's "look here first" list -------------------- */

export function attention(ix, scope, mi, T = THRESHOLDS) {
  const out = [];
  const month = ix.months[mi];
  const sup = supportSeries(ix, scope);
  if (!sup.has[mi] && sup.has.some(Boolean)) {
    out.push({ kind: 'missing', tone: 'warning', text: `No doctor support entered for ${monthShort(month)} in this scope` });
  }
  /* Visits far below the scope's own recent months: on production all of
     Sep-2026 holds ~2,000 visits against ~60,000 a month before — data that
     never arrived, not a team that stopped working. */
  const eg = ix.raw?.effort ? effortGrid(ix, scope, false) : null;
  if (eg) {
    const at = (i) => eg.rows.find((r) => r.i === i)?.visits ?? 0;
    const prev = [mi - 1, mi - 2, mi - 3].filter((i) => i >= ix.fyStart).map(at).filter((v) => v > 0);
    const usual = prev.length ? prev.reduce((t, v) => t + v, 0) / prev.length : 0;
    if (usual > 0 && at(mi) < T.entryGap * usual) {
      out.push({ kind: 'missing', tone: 'warning',
        text: `Visits for ${monthShort(month)} look incomplete in ERP: ${at(mi).toLocaleString('en-IN')} against a usual ${Math.round(usual).toLocaleString('en-IN')}` });
    }
  }
  for (const c of childRows(ix, scope, mi)) {
    const name = c.node?.vacant ? `Vacant ${c.node.id}` : c.node?.name;
    const sc = c.scorecard;
    if (c.gap) {
      out.push({ kind: 'gap', tone: 'warning', sel: c.sel, value: c.gap.current - c.gap.usual,
        text: `${name}: secondary ${fmtL(c.gap.current)} against a usual ${fmtL(c.gap.usual)} — entry missing?` });
    }
    if (sc.hasSales && sc.ach != null && sc.ach < T.lowAch) {
      out.push({ kind: 'ach', tone: 'danger', sel: c.sel, value: sc.ach,
        text: `${name}: ${(sc.ach * 100).toFixed(1)}% of target (${fmtL(sc.primary)} of ${fmtL(sc.target)})` });
    }
    if (c.stock?.chronic) {
      out.push({ kind: 'stock', tone: 'warning', sel: c.sel, value: -c.stock.excess,
        text: `${name}: ${c.stock.chronic} stockist${c.stock.chronic === 1 ? '' : 's'} overstocked ${T.chronic}+ months running` });
    }
    if (c.doctors && c.doctors.down.delta + c.doctors.dropped.delta < -1e5) {
      out.push({ kind: 'doctors', tone: 'warning', sel: c.sel, value: c.doctors.down.delta + c.doctors.dropped.delta,
        text: `${name}: doctor support down ${fmtL(-(c.doctors.down.delta + c.doctors.dropped.delta))} (${c.doctors.down.count + c.doctors.dropped.count} doctors)` });
    }
  }
  const order = { missing: 0, gap: 1, ach: 2, stock: 3, doctors: 4 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || (a.value ?? 0) - (b.value ?? 0));
}

function fmtL(v) {
  return `₹${(v / 1e5).toFixed(1)} L`;
}

/* ---- effort (the EFFORT ANALYSIS sheets) -------------------------------- */

/* Mon–Sat in a month, as the Visit report counts working days. */
export function workingDays(month) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;
  let n = 0;
  for (let d = new Date(y, m, 1); d.getMonth() === m; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n += 1;
  return n;
}

/* Whose effort: `own` — the people holding the scope's own seat (the paper
   sheet is the SM's / RBM's own effort); otherwise everyone in scope. */
function effortPeople(ix, scope, own) {
  const E = ix.raw?.effort;
  if (!E) return null;
  const at = scope.sel?.kind === 'seat' ? ix.byId.get(scope.sel.id) : null;
  const want = new Set();
  E.employees.forEach(([, s], e) => {
    if (own ? s === at : scope.seats.has(s)) want.add(e);
  });
  return { E, want };
}

export function effortGrid(ix, scope, own) {
  const P = effortPeople(ix, scope, own);
  if (!P) return null;
  const { E, want } = P;
  const n = ix.months.length;
  const z = () => Array(n).fill(0);
  const acc = { planned: z(), visits: z(), coverage: z(), days: z(), joint: z(), newDocs: z(), leave: z(), people: z() };
  for (const [m, e, planned, visits, coverage, days, joint, newDocs, leave] of E.rows) {
    if (!want.has(e)) continue;
    acc.planned[m] += planned;
    acc.visits[m] += visits;
    acc.coverage[m] += coverage;
    acc.days[m] += days;
    acc.joint[m] += joint;
    acc.newDocs[m] += newDocs;
    acc.leave[m] += leave;
    if (planned) acc.people[m] += 1;
  }
  const out = [];
  for (let i = ix.fyStart; i < n; i += 1) {
    const people = own ? 1 : Math.max(acc.people[i], 0);
    out.push({
      i,
      month: ix.months[i],
      people,
      working: workingDays(ix.months[i]) * (own ? 1 : Math.max(people, 1)),
      days: acc.days[i],
      leave: acc.leave[i],
      planned: acc.planned[i],
      visits: acc.visits[i],
      callAvg: acc.days[i] ? acc.visits[i] / acc.days[i] : null,
      coverage: acc.coverage[i],
      newDocs: acc.newDocs[i],
      joint: acc.joint[i],
    });
  }
  return { people: want.size, rows: out };
}

/* HQ × month day counts — `hqDays` (days visiting in each HQ: the SM sheet's
   REGIONS COVERED DAYS) or `jwDays` (joint-visit days: the RBM sheet's JW
   DETAILS). */
export function hqDayTable(ix, scope, own, kind) {
  const P = effortPeople(ix, scope, own);
  if (!P) return null;
  const { E, want } = P;
  const cells = new Map();
  for (const [m, e, h, d] of E[kind] ?? []) {
    if (!want.has(e) || m < ix.fyStart) continue;
    const name = E.hqs[h] || 'No HQ';
    if (!cells.has(name)) cells.set(name, new Map());
    cells.get(name).set(m, (cells.get(name).get(m) ?? 0) + d);
  }
  const rows = [...cells.entries()]
    .map(([hq, by]) => ({ hq, by, total: [...by.values()].reduce((t, v) => t + v, 0) }))
    .sort((a, b) => b.total - a.total);
  return rows;
}

/* ---- investment (Doctor Service) ---------------------------------------- */

/* RECURRING vs REGULAR — by how often a doctor is serviced, as the business
 * defines it: serviced EVERY MONTH is recurring; every 3 months, 6 months,
 * once a year (or just once) is regular. Read from the doctor's service
 * months in scope over the WHOLE window (LY April to the last month loaded),
 * not just up to the selected month: it is a property of the doctor, so
 * picking April must not make every later month unclassifiable. The usual
 * (median) gap between consecutive service months decides.
 *   gap 1 → Monthly (recurring) · 2 → Every 2 months · 3–4 → Quarterly
 *   5–8 → Half-yearly · 9+ → Yearly · one service → Once  (all regular) */
export function cadenceOf(monthIdx) {
  const ms = [...new Set(monthIdx)].sort((a, b) => a - b);
  if (!ms.length) return null;
  if (ms.length === 1) return { label: 'Once', recurring: false, gap: null, count: 1 };
  const gaps = ms.slice(1).map((m, k) => m - ms[k]).sort((a, b) => a - b);
  const gap = gaps[Math.floor((gaps.length - 1) / 2)];
  const label = gap <= 1 ? 'Monthly' : gap === 2 ? 'Every 2 months' : gap <= 4 ? 'Quarterly' : gap <= 8 ? 'Half-yearly' : 'Yearly';
  return { label, recurring: gap <= 1, gap, count: ms.length };
}

/* Each doctor's service months in scope, over the whole window. */
function serviceMonthsByDoctor(ix, scope) {
  const by = new Map();
  for (const [m, s, d] of ix.svcRows) {
    if (!scope.seats.has(s)) continue;
    if (!by.has(d)) by.set(d, []);
    by.get(d).push(m);
  }
  return by;
}

export function investment(ix, scope, mi) {
  const n = ix.months.length;
  const amount = Array(n).fill(0);
  const count = Array(n).fill(0);
  const recurring = Array(n).fill(0);
  const byService = new Map();
  const byDoctor = new Map();
  const cadence = new Map();
  for (const [d, ms] of serviceMonthsByDoctor(ix, scope)) cadence.set(d, cadenceOf(ms));
  for (const [m, s, d, sv, , a, c] of ix.svcRows) {
    if (!scope.seats.has(s)) continue;
    amount[m] += a;
    count[m] += c;
    if (cadence.get(d)?.recurring) recurring[m] += a;
    if (m >= ix.fyStart && m <= mi) {
      /* One service however it was typed: "Cash" / "cash", "cheque" /
         "Cheque" are the same line. Shown as its most-used spelling. */
      const raw = (ix.services[sv] || 'Unnamed').trim();
      const key = raw.toLowerCase().replace(/\s+/g, ' ');
      const t = byService.get(key) ?? { value: 0, count: 0, doctors: new Set(), recurring: 0, spellings: new Map() };
      t.value += a;
      t.count += c;
      t.doctors.add(d);
      if (cadence.get(d)?.recurring) t.recurring += a;
      t.spellings.set(raw, (t.spellings.get(raw) ?? 0) + c);
      byService.set(key, t);
      const r = byDoctor.get(d) ?? { service: 0, months: new Set(), support: 0, rows: [], by: new Map(), svcBy: new Map(), seats: new Set(), count: 0 };
      r.service += a;
      r.count += c;
      r.months.add(m);
      r.rows.push({ month: ix.months[m], amount: a });
      r.svcBy.set(m, (r.svcBy.get(m) ?? 0) + a);
      r.seats.add(s);
      byDoctor.set(d, r);
    }
  }
  for (const [m, s, d, a] of ix.supRows) {
    if (!scope.seats.has(s) || m < ix.fyStart || m > mi) continue;
    const r = byDoctor.get(d);
    if (r) {
      r.support += a;
      r.by.set(m, (r.by.get(m) ?? 0) + a);
    }
  }
  const doctors = [...byDoctor.entries()].map(([d, r]) => ({
    doctor: ix.doctorIds[d],
    name: ix.doctorInfo[d]?.[0] ?? ix.doctorIds[d],
    spec: ix.doctorInfo[d]?.[2] ?? null,
    hq: ix.doctorInfo[d]?.[4] ?? null,
    service: r.service,
    support: r.support,
    roi: r.service ? r.support / r.service : null,
    latest: doctorRoi(ix, [...r.rows].sort((a, b) => a.month.localeCompare(b.month)), r.by, mi),
    months: [...r.months].sort((a, b) => a - b).map((m) => ix.months[m]),
    cadence: cadence.get(d) ?? null,
    category: ix.doctorInfo[d]?.[3] ?? null,
    count: r.count,
    seats: [...r.seats].map((x) => ix.tree[x]?.name).filter(Boolean),
    /* FY month by month to the selected month: what was spent, what came back */
    series: Array.from({ length: mi - ix.fyStart + 1 }, (_, k) => ({
      month: ix.months[ix.fyStart + k],
      service: r.svcBy.get(ix.fyStart + k) ?? 0,
      support: r.by.get(ix.fyStart + k) ?? 0,
    })),
  })).sort((a, b) => b.service - a.service);
  const ytd = (arr, from, to) => arr.slice(from, to + 1).reduce((t, v) => t + v, 0);
  return {
    months: ix.months.slice(ix.fyStart).map((m, k) => {
      const i = ix.fyStart + k;
      return {
        i, month: m, amount: amount[i], count: count[i], ly: i >= 12 ? amount[i - 12] : null,
        recurring: recurring[i], regular: amount[i] - recurring[i],
      };
    }),
    ytd: ytd(amount, ix.fyStart, mi),
    ytdLy: mi >= 12 ? ytd(amount, ix.fyStart - 12, mi - 12) : null,
    byService: [...byService.values()].map((t) => ({
      name: [...t.spellings.entries()].sort((x, y) => y[1] - x[1])[0][0],
      value: t.value,
      count: t.count,
      doctors: t.doctors.size,
      recurring: t.recurring,
      regular: t.value - t.recurring,
      perDoctor: t.doctors.size ? t.value / t.doctors.size : null,
    })).sort((a, b) => b.value - a.value),
    doctors,
    supportYtd: doctors.reduce((t, r) => t + r.support, 0),
    split: {
      recurring: ytd(recurring, ix.fyStart, mi),
      regular: ytd(amount, ix.fyStart, mi) - ytd(recurring, ix.fyStart, mi),
      recurringDoctors: doctors.filter((x) => x.cadence?.recurring).length,
      regularDoctors: doctors.filter((x) => x.cadence && !x.cadence.recurring).length,
    },
  };
}

/* ---- doctor extras: OLD/NEW, last visit by level, service ---------------- */

export const LEVELS = ['BE', 'ABM', 'RBM', 'SM'];

/* OLD when first supported before this FY began, NEW otherwise. */
export function doctorStatus(ix, doctorId) {
  const d = ix.docIndex?.get(doctorId);
  const first = d == null ? null : ix.raw?.doctorFirst?.[d];
  if (!first) return null;
  return first < ix.months[ix.fyStart] ? 'OLD' : 'NEW';
}

export function doctorExtra(ix, doctorId, scope, mi) {
  const d = ix.docIndex?.get(doctorId) ?? -1;
  if (d < 0) return null;
  const first = ix.raw?.doctorFirst?.[d] ?? null;
  const fyFirst = ix.months[ix.fyStart];
  const service = [];
  for (const [m, s, dd, sv, , a] of ix.svcRows) {
    if (dd !== d || !scope.seats.has(s) || m < ix.fyStart || m > mi) continue;
    service.push({ month: ix.months[m], name: ix.services[sv], amount: a });
  }
  service.sort((a, b) => a.month.localeCompare(b.month));
  const serviceTotal = service.reduce((t, x) => t + x.amount, 0);

  /* Support this doctor gave in scope, per month, FY to the selected month. */
  const support = new Map();
  for (const [m, s, dd, a] of ix.supRows) {
    if (dd !== d || !scope.seats.has(s) || m < ix.fyStart || m > mi) continue;
    support.set(m, (support.get(m) ?? 0) + a);
  }
  const supportTotal = [...support.values()].reduce((t, v) => t + v, 0);
  const allMonths = [];
  for (const [m, s, dd] of ix.svcRows) if (dd === d && scope.seats.has(s)) allMonths.push(m);

  /* This FY, month by month to the selected month: support (null = a month
     nobody entered), done visits by level [BE, ABM, RBM, SM] (null = visits
     not loaded yet), service. */
  const has = supportMonths(ix);
  const visits = visitsByDoctor(ix).get(d);
  const svcBy = new Map();
  for (const x of service) {
    const m = ix.months.indexOf(x.month);
    svcBy.set(m, (svcBy.get(m) ?? 0) + x.amount);
  }
  const fy = [];
  for (let i = ix.fyStart; i <= mi; i += 1) {
    fy.push({
      month: ix.months[i],
      support: has[i] ? support.get(i) ?? 0 : null,
      visits: ix.raw?.doctorVisits ? visits?.get(i) ?? [0, 0, 0, 0] : null,
      service: svcBy.get(i) ?? 0,
    });
  }
  return {
    first,
    cadence: cadenceOf(allMonths),
    status: first == null ? null : first < fyFirst ? 'OLD' : 'NEW',
    lastVisit: ix.raw?.doctorLastVisit?.[d] ?? null,
    visitsKnown: Array.isArray(ix.raw?.doctorLastVisit),
    service,
    serviceTotal,
    supportTotal,
    roi: doctorRoi(ix, service, support, mi),
    fy,
  };
}

/* doctorVisits [doctor, month, level, n] → doctor → month → [BE, ABM, RBM, SM],
   once per answer. */
const VISITS = new WeakMap();
function visitsByDoctor(ix) {
  if (!VISITS.has(ix)) {
    const by = new Map();
    for (const [d, m, t, n] of ix.raw?.doctorVisits ?? []) {
      if (!by.has(d)) by.set(d, new Map());
      const mm = by.get(d);
      if (!mm.has(m)) mm.set(m, [0, 0, 0, 0]);
      mm.get(m)[t] += n;
    }
    VISITS.set(ix, by);
  }
  return VISITS.get(ix);
}

/* ROI = the doctor's support (₹ of product) ÷ the service (₹) spent on them.
 *   overall  FY to the month: all support ÷ all service
 *   latest   the latest service month L: support from L to the month ÷ the
 *            service given in L, over `months` months (L counted) — "what
 *            has the last spend brought back so far"
 * A month whose support was never entered (Aug-2026 on production) adds
 * nothing, so a ROI spanning it reads low; `missing` counts such months. */
/* Which months have ANY doctor support in the answer — cached per answer. */
const SUPPORT_MONTHS = new WeakMap();
function supportMonths(ix) {
  if (!SUPPORT_MONTHS.has(ix)) {
    const has = Array(ix.months.length).fill(false);
    for (const r of ix.supRows) has[r[0]] = true;
    SUPPORT_MONTHS.set(ix, has);
  }
  return SUPPORT_MONTHS.get(ix);
}

export function doctorRoi(ix, service, support, mi) {
  if (!service.length) return null;
  const serviceTotal = service.reduce((t, x) => t + x.amount, 0);
  const supportTotal = [...support.values()].reduce((t, v) => t + v, 0);
  const lastMonth = service[service.length - 1].month;
  const L = ix.months.indexOf(lastMonth);
  const lastAmount = service.filter((x) => x.month === lastMonth).reduce((t, x) => t + x.amount, 0);
  let since = 0;
  for (let i = L; i <= mi; i += 1) since += support.get(i) ?? 0;
  const has = supportMonths(ix);
  let missing = 0;
  for (let i = L; i <= mi; i += 1) if (!has[i]) missing += 1;
  return {
    overall: serviceTotal ? supportTotal / serviceTotal : null,
    latest: lastAmount ? since / lastAmount : null,
    latestMonth: lastMonth,
    latestAmount: lastAmount,
    latestSupport: since,
    months: mi - L + 1,
    missing,
  };
}

/* ---- products: every product the scope moved this FY -------------------- */

/* One entry per product with any secondary or primary in scope this FY:
   this month's secondary ₹ and strips, last month, the change, YTD, share of
   the scope's secondary this month, primary ₹ and strips, primary ÷
   secondary, and a month-by-month secondary series (FY to the month). */
export function productList(ix, scope, mi) {
  const P = ix.raw?.products;
  if (!P) return null;
  const pairs = new Set(scope.pairs);
  const by = new Map();
  const get = (k) => {
    if (!by.has(k)) by.set(k, { sec: new Map(), secQ: new Map(), pri: new Map(), priQ: new Map() });
    return by.get(k);
  };
  for (const [m, s, k, q, v] of P.rows) {
    if (m < ix.fyStart || m > mi || !scope.seats.has(s)) continue;
    const r = get(k);
    r.sec.set(m, (r.sec.get(m) ?? 0) + v);
    r.secQ.set(m, (r.secQ.get(m) ?? 0) + q);
  }
  for (const [m, p, k, q, v] of P.primary) {
    if (m < ix.fyStart || m > mi || !pairs.has(p)) continue;
    const r = get(k);
    r.pri.set(m, (r.pri.get(m) ?? 0) + v);
    r.priQ.set(m, (r.priQ.get(m) ?? 0) + q);
  }
  const sumOf = (map) => [...map.values()].reduce((t, v) => t + v, 0);
  const items = [...by.entries()].map(([k, r]) => {
    const [code, name, brand] = P.items[k] ?? [String(k), String(k), null];
    const sec = r.sec.get(mi) ?? 0;
    const prev = r.sec.get(mi - 1) ?? 0;
    const pri = r.pri.get(mi) ?? 0;
    return {
      code,
      name,
      brand,
      sec,
      secQty: r.secQ.get(mi) ?? 0,
      prev,
      change: prev ? sec / prev - 1 : null,
      secYtd: sumOf(r.sec),
      pri,
      priQty: r.priQ.get(mi) ?? 0,
      priYtd: sumOf(r.pri),
      priSec: sec ? pri / sec : null,
      series: Array.from({ length: mi - ix.fyStart + 1 }, (_, j) => r.sec.get(ix.fyStart + j) ?? 0),
    };
  });
  const total = items.reduce((t, x) => t + x.sec, 0);
  for (const x of items) x.share = total ? x.sec / total : 0;
  return {
    items,
    total,
    totalPri: items.reduce((t, x) => t + x.pri, 0),
    brands: [...new Set(items.map((x) => x.brand).filter(Boolean))].sort(),
  };
}
