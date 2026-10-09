import { describe, expect, it } from 'vitest';
import {
  attention,
  baselineMonths,
  bucketOf,
  childRows,
  childScopes,
  defaultMonth,
  defaultPicks,
  resolvePicks,
  scopeOfPicks,
  doctorBuckets,
  hqRows,
  indexAnswer,
  scopeOf,
  scorecard,
  sharedAt,
  stockists,
} from '../selectors';

/* Invented data in the server script's shape: FY 2026, LY April .. Sep. */
const months = [];
for (let y = 2025, m = 4; months.length < 18; m += 1) {
  if (m > 12) { m = 1; y += 1; }
  months.push(`${y}-${String(m).padStart(2, '0')}`);
}
const M = (m) => months.indexOf(m);

const answer = {
  fy: '2026',
  months,
  meta: { open: '2026-09' },
  tree: [
    { id: 'SM1', name: 'Sam', tier: 'SM', reportsTo: null, vacant: 0, dept: 'Dept A - ELPL', hq: 'HQ-1' },
    { id: 'ABM1', name: 'Abe', tier: 'ABM', reportsTo: 'SM1', vacant: 0, dept: 'Dept A - ELPL', hq: 'HQ-1' },
    { id: 'BE1', name: 'Bea', tier: 'BE', reportsTo: 'ABM1', vacant: 0, dept: 'Dept A - ELPL', hq: 'HQ-1' },
    { id: 'BE2', name: 'Vacant_BE2', tier: 'BE', reportsTo: 'ABM1', vacant: 1, dept: 'Dept A - ELPL', hq: 'HQ-2' },
    { id: 'BE3', name: 'Cy', tier: 'BE', reportsTo: 'ABM1', vacant: 0, dept: 'Dept A - ELPL', hq: 'HQ-2' },
    { id: 'ABM2', name: 'Ada', tier: 'ABM', reportsTo: 'SM1', vacant: 0, dept: 'Dept B - ELPL', hq: 'HQ-9' },
    { id: 'BE9', name: 'Dee', tier: 'BE', reportsTo: 'ABM2', vacant: 0, dept: 'Dept B - ELPL', hq: 'HQ-9' },
  ],
  sales: {
    pairs: [
      { dept: 'Dept A - ELPL', hq: 'HQ-1', seats: [2], owner: 2 },
      { dept: 'Dept A - ELPL', hq: 'HQ-2', seats: [3, 4], owner: 1 },
      { dept: 'Dept B - ELPL', hq: 'HQ-9', seats: [6], owner: 6 },
    ],
    rows: [
      [0, M('2026-08'), 1000, 900], [1, M('2026-08'), 500, 600], [2, M('2026-08'), 400, 200],
      [0, M('2026-07'), 1000, 1000], [0, M('2025-08'), 0, 750],
    ],
  },
  secondary: {
    distributors: ['Dist X', 'Dist Y', 'Dist Z'],
    rows: [
      [M('2026-06'), 2, 0, 100, 250, 0, 0], [M('2026-07'), 2, 0, 100, 250, 0, 0], [M('2026-08'), 2, 0, 100, 260, 0, 0],
      [M('2026-08'), 4, 1, 50, 40, 0, 0], [M('2026-08'), 4, 2, 0, 30, 0, 0],
      [M('2026-05'), 6, 1, 1000, 900, 0, 0], [M('2026-06'), 6, 1, 1000, 900, 0, 0], [M('2026-07'), 6, 1, 1000, 900, 0, 0],
      [M('2026-08'), 6, 1, 100, 90, 0, 0],
    ],
  },
  doctors: {
    rows: [
      // DR-up: 10k → 20k; DR-down: 30k → 10k; DR-gone: 8k → none; DR-new; DR-flat
      [M('2026-06'), 2, 0, 10000, 1], [M('2026-07'), 2, 0, 10000, 1], [M('2026-09'), 2, 0, 20000, 1],
      [M('2026-06'), 2, 1, 30000, 1], [M('2026-07'), 2, 1, 30000, 1], [M('2026-09'), 2, 1, 10000, 1],
      [M('2026-07'), 4, 2, 8000, 1],
      [M('2026-09'), 4, 3, 5000, 1],
      [M('2026-06'), 2, 4, 50000, 1], [M('2026-07'), 2, 4, 50000, 1], [M('2026-09'), 2, 4, 51000, 1],
    ],
    assigned: {},
  },
  service: { services: ['Cash'], rows: [] },
  doctorIds: ['DR-up', 'DR-down', 'DR-gone', 'DR-new', 'DR-flat'],
  doctorInfo: [['Dr Up', '1', 'CP'], ['Dr Down', '2', 'GP'], ['Dr Gone', '3', null], ['Dr New', '4', null], ['Dr Flat', '5', null]],
};

const ix = indexAnswer(answer);
const all = scopeOf(ix, { kind: 'seat', id: 'SM1' });

describe('scope and sales', () => {
  it('a seat scope is its subtree and the pairs it owns', () => {
    expect([...all.seats].length).toBe(7);
    const abm = scopeOf(ix, { kind: 'seat', id: 'ABM1' });
    expect(abm.pairs).toEqual([0, 1]);
    expect(scorecard(ix, abm, M('2026-08'))).toMatchObject({ target: 1500, primary: 1500, ach: 1, be: 3, beFilled: 2, pcpm: 500 });
  });

  it('picks, as the Visit report: own seat by default, everyone for a seatless (IT) token', () => {
    // a seated caller: their own branch
    const own = indexAnswer({ ...answer, me: 'ABM1' });
    expect(defaultPicks(own)).toEqual([{ id: 'ABM1', includeSubtree: true }]);
    // IT: no seat of its own, every SM on top — all of them, not the first
    const wide = indexAnswer({ ...answer, root: 'Sales', me: 'IT', tree: [...answer.tree, { id: 'SM2', name: 'Zed', tier: 'SM', reportsTo: null, vacant: 0 }] });
    const picks = defaultPicks(wide);
    expect(picks).toEqual([{ id: 'SM1', includeSubtree: true }, { id: 'SM2', includeSubtree: true }]);
    const all = scopeOfPicks(wide, picks);
    expect(all).toMatchObject({ label: 'All teams', sel: { kind: 'picks' } });
    expect(all.seats.size).toBe(8);
    expect(scorecard(wide, all, M('2026-08'))).toMatchObject({ target: 1900, primary: 1700 });
    expect(childScopes(wide, all).map((c) => c.node.id)).toEqual(['SM1', 'SM2']);
    // one seat alone (its own lines, not the branch), and a union of two
    const abmOwn = scopeOfPicks(wide, [{ id: 'ABM1', includeSubtree: false }]);
    expect(abmOwn).toMatchObject({ label: 'Abe · own', sel: { kind: 'seat', id: 'ABM1', alone: true } });
    expect([...abmOwn.seats]).toEqual([1]);
    const two = scopeOfPicks(wide, [{ id: 'BE1', includeSubtree: true }, { id: 'ABM2', includeSubtree: true }]);
    expect(two.label).toBe('Bea +1');
    expect([...two.seats].sort()).toEqual([2, 5, 6]);
    // stale picks fall back to the default; an empty pick list stays empty
    expect(resolvePicks(wide, [{ id: 'GONE', includeSubtree: true }])).toEqual(picks);
    expect(resolvePicks(wide, [])).toEqual([]);
  });

  it('SM total, YTD and growth against last year', () => {
    const sc = scorecard(ix, all, M('2026-08'));
    expect(sc).toMatchObject({ target: 1900, primary: 1700, ytdTarget: 2900, ytdPrimary: 2700, primaryLy: 750 });
    expect(sc.growth).toBeCloseTo(1700 / 750 - 1);
  });

  it('a BE in a shared HQ: target split equally, primary by its share of the secondary', () => {
    // pair 1 = HQ-2 (target 500, primary 600 in Aug), shared by BE2 (seat 3) and BE3 (seat 4),
    // owned by ABM1. In Aug only BE3 sold, so BE3 carries all the primary.
    const be3 = scopeOf(ix, { kind: 'seat', id: 'BE3' });
    const be2 = scopeOf(ix, { kind: 'seat', id: 'BE2' });
    expect(scorecard(ix, be3, M('2026-08'))).toMatchObject({ hasSales: true, allocated: true, target: 250, primary: 600, ach: 2.4 });
    expect(scorecard(ix, be2, M('2026-08'))).toMatchObject({ hasSales: true, allocated: true, target: 250, primary: 0, ach: 0 });
    expect(sharedAt(ix, be3)).toMatchObject({ hq: 'HQ-2', with: 2, owner: { id: 'ABM1' } });
    expect(sharedAt(ix, scopeOf(ix, { kind: 'seat', id: 'BE1' }))).toBeNull();
    // the owner still counts the pair whole: shares add back up
    expect(scorecard(ix, scopeOf(ix, { kind: 'seat', id: 'ABM1' }), M('2026-08'))).toMatchObject({ target: 1500, primary: 1500, allocated: false });
  });

  it('splits equally in a month neither BE entered secondary', () => {
    const jul = indexAnswer({ ...answer, sales: { ...answer.sales, rows: [...answer.sales.rows, [1, M('2026-07'), 200, 100]] } });
    expect(scorecard(jul, scopeOf(jul, { kind: 'seat', id: 'BE2' }), M('2026-07'))).toMatchObject({ target: 100, primary: 50 });
    expect(scorecard(jul, scopeOf(jul, { kind: 'seat', id: 'BE3' }), M('2026-07'))).toMatchObject({ target: 100, primary: 50 });
  });

  it('the department lens takes every seat and pair of that department', () => {
    const d = scopeOf(ix, { kind: 'dept', id: 'Dept A - ELPL' });
    expect(d.pairs).toEqual([0, 1]);
    expect(d.label).toBe('Dept A');
    expect(hqRows(ix, d, M('2026-08')).map((r) => [r.hq, r.scorecard.primary])).toEqual([['HQ-1', 900], ['HQ-2', 600]]);
  });
});

describe('months', () => {
  it('defaults to the last closed month', () => {
    expect(ix.months[defaultMonth(ix)]).toBe('2026-08');
  });
  it('baseline skips months with no data', () => {
    const has = months.map((m) => m !== '2026-08');
    expect(baselineMonths(has, M('2026-09')).map((i) => months[i])).toEqual(['2026-07', '2026-06', '2026-05']);
  });
});

describe('doctor buckets', () => {
  it('rules', () => {
    expect(bucketOf(0, 0)).toBeNull();
    expect(bucketOf(5000, 0)).toBe('new');
    expect(bucketOf(0, 5000)).toBe('dropped');
    expect(bucketOf(51000, 50000)).toBe('stable');
    expect(bucketOf(10500, 10000)).toBe('stable');   // +5 %
    expect(bucketOf(20000, 10000)).toBe('up');
    expect(bucketOf(10000, 30000)).toBe('down');
  });

  it('a month with no support is missing, not every doctor dropped', () => {
    const b = doctorBuckets(ix, all, M('2026-08'));
    expect(b.missing).toBe(true);
    expect(months[b.lastWithData]).toBe('2026-07');
  });

  it('September against Jul and Jun (Aug missing), zeros inside the baseline count', () => {
    const b = doctorBuckets(ix, all, M('2026-09'));
    expect(b.baseline.map((i) => months[i])).toEqual(['2026-07', '2026-06']);
    const by = Object.fromEntries(b.rows.map((r) => [r.doctor, r]));
    expect(by['DR-up'].bucket).toBe('up');
    expect(by['DR-down']).toMatchObject({ bucket: 'down', baseline: 30000, delta: -20000 });
    expect(by['DR-gone']).toMatchObject({ bucket: 'dropped', baseline: 4000 });
    expect(by['DR-new'].bucket).toBe('new');
    expect(by['DR-flat'].bucket).toBe('stable');
  });
});

describe('stockists', () => {
  it('overstock ≥ 2×, dead stock, chronic streak', () => {
    const s = stockists(ix, all, M('2026-08'));
    const by = Object.fromEntries(s.rows.map((r) => [r.name, r]));
    expect(by['Dist X']).toMatchObject({ over: true, streak: 3, chronic: true, excess: 60 });
    expect(by['Dist Z']).toMatchObject({ dead: true, over: false });
    expect(s.summary).toMatchObject({ over: 1, chronic: 1, dead: 1 });
    expect(s.rows[0].name).toBe('Dist X');
  });
});

describe('children and attention', () => {
  it('lists the scope children with their headline numbers', () => {
    const rows = childRows(ix, all, M('2026-08'));
    expect(rows.map((r) => r.node.id)).toEqual(['ABM1', 'ABM2']);
    expect(rows[1].scorecard.ach).toBe(0.5);
    expect(rows[1].gap).toMatchObject({ current: 100, usual: 1000 });
  });

  it('calls out the entry gap and the low achiever', () => {
    const a = attention(ix, all, M('2026-08'));
    expect(a.map((x) => x.kind)).toEqual(['missing', 'gap', 'ach', 'stock']);
    expect(a[1].text).toMatch(/^Ada: secondary/);
  });
});

/* ---- effort, investment, products, doctor status ---- */
import { cadenceOf, doctorExtra, doctorStatus, effortGrid, hqDayTable, investment, productList, workingDays } from '../selectors';

const rich = indexAnswer({
  ...answer,
  effort: {
    employees: [['E1', 0], ['E3', 2], ['E5', 4]],
    hqs: ['HQ-1', 'HQ-2'],
    rows: [
      // [month, emp, planned, visits, coverage, days, joint, new, leave]
      [M('2026-07'), 0, 30, 30, 25, 10, 4, 3, 0],
      [M('2026-08'), 0, 20, 18, 15, 9, 2, 1, 1],
      [M('2026-08'), 1, 100, 90, 60, 20, 0, 5, 2],
      [M('2026-08'), 2, 50, 40, 30, 15, 1, 2, 0.5],
    ],
    hqDays: [[M('2026-08'), 0, 0, 5], [M('2026-08'), 0, 1, 4], [M('2026-08'), 1, 0, 20]],
    jwDays: [[M('2026-08'), 0, 1, 2]],
  },
  service: {
    services: ['Cash', 'EMI TAKEOVER'],
    rows: [[M('2026-07'), 2, 0, 0, 'draft', 5000, 1], [M('2026-08'), 2, 0, 1, 'draft', 3000, 1], [M('2025-07'), 2, 1, 0, 'draft', 4000, 1]],
  },
  products: {
    items: [['A1', 'Item A', 'BRAND A'], ['B1', 'Item B', null]],
    rows: [[M('2026-07'), 2, 0, 20, 2000], [M('2026-08'), 2, 0, 40, 4000], [M('2026-08'), 6, 0, 7, 700], [M('2026-08'), 4, 1, 5, 1000]],
    primary: [[M('2026-08'), 0, 0, 50, 5000]],
  },
  doctorFirst: ['2025-05', '2026-06', null, null, null],
});
const SM = scopeOf(rich, { kind: 'seat', id: 'SM1' });

describe('effort', () => {
  it('own is the seat holder only; team adds up everyone in scope', () => {
    const own = effortGrid(rich, SM, true).rows.find((r) => r.month === '2026-08');
    expect(own).toMatchObject({ visits: 18, days: 9, leave: 1, joint: 2, newDocs: 1, people: 1, working: 26 });
    expect(own.callAvg).toBe(2);
    const team = effortGrid(rich, SM, false).rows.find((r) => r.month === '2026-08');
    expect(team).toMatchObject({ visits: 148, days: 44, people: 3, working: 26 * 3, leave: 3.5 });
  });
  it('working days are Mon–Sat', () => {
    expect(workingDays('2026-08')).toBe(26);
    expect(workingDays('2026-02')).toBe(24);
  });
  it('days by HQ and joint working by HQ', () => {
    expect(hqDayTable(rich, SM, true, 'hqDays').map((r) => [r.hq, r.total])).toEqual([['HQ-1', 5], ['HQ-2', 4]]);
    expect(hqDayTable(rich, SM, false, 'hqDays')[0]).toMatchObject({ hq: 'HQ-1', total: 25 });
    expect(hqDayTable(rich, SM, true, 'jwDays').map((r) => r.hq)).toEqual(['HQ-2']);
  });
});

describe('investment', () => {
  it('service by month and service, per doctor with support ÷ service', () => {
    const inv = investment(rich, SM, M('2026-09'));
    expect(inv.ytd).toBe(8000);
    expect(inv.months.find((m) => m.month === '2026-07')).toMatchObject({ amount: 5000, ly: 4000 });
    expect(inv.byService).toMatchObject([
      { name: 'Cash', value: 5000, count: 1, doctors: 1, recurring: 5000, regular: 0 },
      { name: 'EMI TAKEOVER', value: 3000, count: 1, doctors: 1 },
    ]);
    const up = inv.doctors.find((d) => d.doctor === 'DR-up');
    expect(up).toMatchObject({ service: 8000, support: 40000, months: ['2026-07', '2026-08'] });
    expect(up.roi).toBe(5);
  });
});

describe('products and doctor status', () => {
  it('every product in scope: this month, last month, change, YTD, share, primary', () => {
    const L = productList(rich, scopeOf(rich, { kind: 'seat', id: 'ABM1' }), M('2026-08'));
    const a = L.items.find((x) => x.code === 'A1');
    expect(a).toMatchObject({ name: 'Item A', brand: 'BRAND A', sec: 4000, secQty: 40, prev: 2000, change: 1, secYtd: 6000, pri: 5000, priSec: 1.25 });
    expect(a.series.slice(-2)).toEqual([2000, 4000]);
    expect(L.total).toBe(5000);
    expect(a.share).toBe(0.8);
    expect(L.items.find((x) => x.code === 'B1').share).toBe(0.2);
    expect(L.brands).toEqual(['BRAND A']);
  });
  it('OLD when first supported before April of the FY', () => {
    expect(doctorStatus(rich, 'DR-up')).toBe('OLD');
    expect(doctorStatus(rich, 'DR-down')).toBe('NEW');
    expect(doctorStatus(rich, 'DR-gone')).toBeNull();
  });
  it('flags a month whose visits collapsed against the usual', () => {
    const thin = indexAnswer({ ...answer, effort: { employees: [['E1', 0]], hqs: [], rows: [
      [M('2026-06'), 0, 100, 100, 50, 20, 0, 0, 0], [M('2026-07'), 0, 100, 100, 50, 20, 0, 0, 0], [M('2026-08'), 0, 5, 5, 5, 1, 0, 0, 0],
    ], hqDays: [], jwDays: [] } });
    const a = attention(thin, scopeOf(thin, { kind: 'seat', id: 'SM1' }), M('2026-08'));
    expect(a.some((x) => /Visits for Aug 26 look incomplete/.test(x.text))).toBe(true);
  });
});

describe('doctor ROI', () => {
  it('overall = FY support ÷ FY service; latest = support since the latest service ÷ that service', () => {
    // DR-up: service Jul 5,000 + Aug 3,000 (rich fixture); support Jun 10k, Jul 10k, Sep 20k
    const x = doctorExtra(rich, 'DR-up', SM, M('2026-09'));
    expect(x.supportTotal).toBe(40000);
    expect(x.roi.overall).toBe(5);
    expect(x.roi).toMatchObject({ latestMonth: '2026-08', latestAmount: 3000, latestSupport: 20000, months: 2, missing: 1 });
    expect(x.roi.latest).toBeCloseTo(20000 / 3000);
    expect(doctorExtra(rich, 'DR-down', SM, M('2026-09')).roi).toBeNull();
  });
  it('the Investment list carries the latest ROI too', () => {
    const up = investment(rich, SM, M('2026-09')).doctors.find((d) => d.doctor === 'DR-up');
    expect(up.latest.latestMonth).toBe('2026-08');
  });
});

describe('recurring vs regular (by how often a doctor is serviced)', () => {
  it('cadence from the usual gap between service months', () => {
    expect(cadenceOf([1, 2, 3, 4])).toMatchObject({ label: 'Monthly', recurring: true });
    expect(cadenceOf([1, 2, 4, 5, 6])).toMatchObject({ label: 'Monthly', recurring: true }); // one skipped month
    expect(cadenceOf([0, 3, 6, 9])).toMatchObject({ label: 'Quarterly', recurring: false });
    expect(cadenceOf([0, 6, 12])).toMatchObject({ label: 'Half-yearly', recurring: false });
    expect(cadenceOf([0, 12])).toMatchObject({ label: 'Yearly', recurring: false });
    expect(cadenceOf([5])).toMatchObject({ label: 'Once', recurring: false });
    expect(cadenceOf([3, 3, 4])).toMatchObject({ label: 'Monthly', count: 2 });
    expect(cadenceOf([])).toBeNull();
  });
  it('splits the FY service by each doctor’s cadence', () => {
    // DR-up: Jul + Aug (monthly) → recurring; DR-down: Jul-25 only → regular, outside the FY
    const inv = investment(rich, SM, M('2026-09'));
    expect(inv.split).toMatchObject({ recurring: 8000, regular: 0, recurringDoctors: 1 });
    expect(inv.months.find((m) => m.month === '2026-08')).toMatchObject({ recurring: 3000, regular: 0 });
    expect(inv.doctors[0].cadence).toMatchObject({ label: 'Monthly', recurring: true });
    expect(doctorExtra(rich, 'DR-up', SM, M('2026-09')).cadence.label).toBe('Monthly');
  });
});

describe('by service', () => {
  it('one line per service however it was spelled, named by its most-used spelling', () => {
    const typo = indexAnswer({
      ...answer,
      service: {
        services: ['Cash', 'cash ', 'CASH'],
        rows: [[M('2026-07'), 2, 0, 0, 'draft', 1000, 2], [M('2026-07'), 4, 1, 1, 'draft', 500, 1], [M('2026-08'), 2, 0, 2, 'draft', 100, 1]],
      },
    });
    const by = investment(typo, scopeOf(typo, { kind: 'seat', id: 'SM1' }), M('2026-09')).byService;
    expect(by).toHaveLength(1);
    expect(by[0]).toMatchObject({ name: 'Cash', value: 1600, count: 4, doctors: 2, perDoctor: 800 });
  });
});

describe('doctor drawer: this FY month by month', () => {
  it('support (missing month = null), visits by level, service', () => {
    const withVisits = indexAnswer({
      ...rich.raw,
      doctorVisits: [[0, M('2026-07'), 0, 3], [0, M('2026-07'), 1, 1], [0, M('2026-09'), 3, 2]],
    });
    const fy = doctorExtra(withVisits, 'DR-up', scopeOf(withVisits, { kind: 'seat', id: 'SM1' }), M('2026-09')).fy;
    expect(fy.map((r) => r.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(fy.find((r) => r.month === '2026-07')).toMatchObject({ support: 10000, visits: [3, 1, 0, 0], service: 5000 });
    expect(fy.find((r) => r.month === '2026-08')).toMatchObject({ support: null, service: 3000 });
    expect(fy.find((r) => r.month === '2026-09').visits).toEqual([0, 0, 0, 2]);
    expect(doctorExtra(rich, 'DR-up', SM, M('2026-09')).fy[0].visits).toBeNull();
  });
});

describe('recurring / regular does not depend on the selected month', () => {
  it('April selected: every month still split, cadence from the whole window', () => {
    const apr = investment(rich, SM, M('2026-04'));
    expect(apr.months.find((m) => m.month === '2026-08')).toMatchObject({ recurring: 3000, regular: 0 });
    expect(apr.months.find((m) => m.month === '2026-07')).toMatchObject({ recurring: 5000, regular: 0 });
    expect(apr.split).toMatchObject({ recurring: 0, regular: 0 }); // YTD to April: nothing spent yet
    expect(doctorExtra(rich, 'DR-up', SM, M('2026-04')).cadence.label).toBe('Monthly');
  });
});
