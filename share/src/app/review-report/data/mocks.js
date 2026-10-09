/* MOCK DATA — every export here stands in for something the ERP does not
 * have yet. Nothing in this file is real: the screen badges each use as MOCK
 * and says what wiring it needs (`mock.needs`). Delete an export the day its
 * source exists, and the badge goes with it.
 *
 * Names are deliberately "Sample …" so a mock row can never be mistaken for
 * a real hospital, doctor or stockist; only the HQs are the scope's own, so
 * the layout can be judged against real geography. Deterministic (seeded),
 * so a screenshot today matches one tomorrow. */

import { deptShort } from './selectors';

function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const between = (r, a, b) => Math.round(a + r() * (b - a));

function scopeHqs(ix, scope) {
  const out = [...new Set([...scope.seats].map((s) => ix.tree[s]?.hq).filter(Boolean))];
  return out.length ? out : ['HQ-Sample'];
}

function fyMonths(ix, mi) {
  return ix.months.slice(ix.fyStart, mi + 1);
}

/* ---- Institutions (INSTITUTION EFFORTS sheet) --------------------------- */
export function mockInstitutions(ix, scope, mi) {
  const r = rng(`inst|${scope.sel?.id}`);
  const rows = [];
  scopeHqs(ix, scope).slice(0, 6).forEach((hq, h) => {
    const n = between(r, 1, 3);
    for (let k = 0; k < n; k += 1) {
      rows.push({
        hq,
        name: `Sample Hospital ${String.fromCharCode(65 + h)}${k + 1}`,
        pharmacist: `Sample In-charge ${h + 1}.${k + 1}`,
        phone: '98xxxxxx' + String(between(r, 10, 99)),
        doctors: between(r, 2, 15),
        smDays: between(r, 0, 4),
        scheme: pick(r, ['Nil', '10%', '20%', '30%']),
        supplier: `Sample Stockist ${between(r, 1, 9)}`,
        terms: pick(r, ['30 days', '60 days', '90 days', 'Advance']),
        products: pick(r, ['CALBRIT 60K / PREGABRIT', 'ONLY Q PLUS', 'NEURONZ D / LARGIX', 'TENLITAB M']),
      });
    }
  });
  return {
    mock: {
      what: 'Institutions',
      needs: 'No institution record in ERP. Needs an Institution doctype (hospital, pharmacy in-charge, supplier, scheme, terms) linked to Leads and HQ.',
    },
    months: fyMonths(ix, mi),
    rows,
  };
}

/* ---- Institution doctor visits (INSTITUTION DR VISIT sheet) -------------- */
export function mockInstitutionVisits(ix, scope, mi) {
  const r = rng(`instv|${scope.sel?.id}`);
  const months = fyMonths(ix, mi);
  const rows = Array.from({ length: 8 }, (_, k) => ({
    doctor: `Dr Sample ${k + 1}`,
    hospital: `Sample Hospital ${String.fromCharCode(65 + (k % 4))}1`,
    hq: pick(r, scopeHqs(ix, scope)),
    visits: months.map(() => ({
      SM: r() < 0.25 ? between(r, 1, 28) : null,
      RBM: r() < 0.4 ? between(r, 1, 28) : null,
      ABM: r() < 0.55 ? between(r, 1, 28) : null,
    })),
  }));
  return {
    mock: {
      what: 'Institution doctor visits',
      needs: 'Visits are real in ERP, but nothing marks a doctor as an institution / hospital doctor. Needs the Lead → Institution link; then this reads the real visit dates.',
    },
    months,
    rows,
  };
}

/* ---- International trip doctors (TRIP DR DETAILS sheet) ------------------ */
export function mockTrips(ix, scope, mi) {
  const r = rng(`trip|${scope.sel?.id}`);
  const months = fyMonths(ix, mi);
  const rows = Array.from({ length: 5 }, (_, k) => {
    const amount = pick(r, [60000, 75000, 90000, 120000]);
    const expected = Math.round(amount / pick(r, [6, 8, 10]));
    const roi = months.map(() => between(r, Math.round(expected * 0.3), Math.round(expected * 1.4)));
    return {
      doctor: `Dr Sample Trip ${k + 1}`,
      hq: pick(r, scopeHqs(ix, scope)),
      activity: pick(r, ['Dubai CME', 'Bangkok conference', 'Singapore symposium']),
      amount,
      expected,
      roi,
      times: roi.reduce((t, v) => t + v, 0) / amount,
    };
  });
  return {
    mock: {
      what: 'International trip doctors',
      needs: 'Trip activities are not marked in ERP. Needs Doctor Service tagged as a trip (service type + expected monthly ROI); the monthly ROI can then be the doctor\'s real support.',
    },
    months,
    rows,
  };
}

/* ---- Default stockists (DEFAULT STOCKIST sheet) -------------------------- */
export function mockDefaults(ix, scope) {
  const r = rng(`def|${scope.sel?.id}`);
  const rows = Array.from({ length: 4 }, (_, k) => ({
    region: deptShort(pick(r, ix.depts.length ? ix.depts : ['Sample region'])),
    hq: pick(r, scopeHqs(ix, scope)),
    stockist: `Sample Stockist ${k + 1}`,
    mode: pick(r, ['NEFT', 'Cheque']),
    overdue: between(r, 40, 400) * 1000,
    days: between(r, 45, 180),
    continueWhy: pick(r, ['Only stockist in town', 'Part-payment plan agreed', '']),
    stopWhy: pick(r, ['', 'Cheque bounced twice', 'No payment in 120 days']),
  }));
  return {
    mock: {
      what: 'Default stockists',
      needs: 'Overdue amounts exist in ERP (receivables ageing per Customer) and can be wired; the reasons to continue / discontinue need a field or a small doctype.',
    },
    rows,
  };
}
