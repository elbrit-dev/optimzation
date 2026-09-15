// Run: node scripts/test-doctor-detail.cjs
// Uses the project's own compiler and React renderer; no live ERP reads/writes.
//
// Covers components/DoctorDetail/ — the page rebuilt to the September 2026
// approved design. The point of these tests is the reconciliation layer: the
// design was drawn against sample rows that already carried a department and a
// role on every line, and real ERP puts those in four different places (and on
// Doctor Support, nowhere at all). Everything below pins that behaviour down.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { parse } = require('graphql');
const swc = require('next/dist/build/swc');

const root = path.resolve(__dirname, '..');

async function main() {
  await swc.loadBindings();

  async function compile(file, extra = '') {
    return (await swc.transform(fs.readFileSync(path.join(root, file), 'utf8') + extra, {
      filename: file,
      jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } },
      module: { type: 'commonjs' },
    })).code;
  }

  const authConfig = {};
  const fetchCalls = [];
  const cache = new Map();

  // A tiny module loader so the folder's internal imports resolve without a
  // bundler. Anything outside the folder is stubbed — these tests must never
  // reach ERP.
  async function load(file) {
    const key = path.normalize(file);
    if (cache.has(key)) return cache.get(key);
    const mod = { exports: {} };
    cache.set(key, mod.exports);
    const dir = path.dirname(key);
    const ctx = {
      module: mod, exports: mod.exports, console, setTimeout, clearTimeout,
      URLSearchParams, Map, Set, Date, Math, JSON, Intl, ResizeObserver: undefined,
      fetch: async (url, init) => {
        fetchCalls.push({ url: String(url), init });
        return { ok: true, status: 200, json: async () => ({ data: [] }) };
      },
      require: (name) => {
        if (name === 'react') return React;
        if (name === 'next/dynamic') return () => () => null;
        if (name === '@calendar/components/auth/calendar-users') return { AUTH_CONFIG: authConfig };
        if (name === '@calendar/lib/graphql-client') {
          return { graphqlRequest: async () => { throw new Error('Tests must not contact ERP'); } };
        }
        if (name === '@/app/graphql-playground/constants') {
          return { getEndpointConfigFromUrlKeyAsync: async () => null };
        }
        if (name.startsWith('.')) {
          const target = path.normalize(path.join(dir, name));
          for (const candidate of [target, target + '.js', target + '.jsx', path.join(target, 'index.jsx')]) {
            if (cache.has(candidate)) return cache.get(candidate);
            if (fs.existsSync(path.join(root, candidate)) && fs.statSync(path.join(root, candidate)).isFile()) {
              return loadSync(candidate);
            }
          }
          throw new Error('Cannot resolve ' + name + ' from ' + dir);
        }
        return require(name);
      },
    };
    vm.runInNewContext(compiled.get(key), ctx);
    cache.set(key, mod.exports);
    return mod.exports;
  }

  // Everything is compiled up front so require() can stay synchronous.
  const files = [
    'components/DoctorDetail/lib/format.js',
    'components/DoctorDetail/lib/erp.js',
    'components/DoctorDetail/lib/queries.js',
    'components/DoctorDetail/lib/derive.js',
    'components/DoctorDetail/lib/analytics.js',
    'components/DoctorDetail/lib/useContainerMode.js',
    'components/DoctorDetail/lib/useDoctorData.js',
    'components/DoctorDetail/styles.js',
    'components/DoctorDetail/ui/parts.jsx',
    'components/DoctorDetail/ui/Hero.jsx',
    'components/DoctorDetail/ui/Banner.jsx',
    'components/DoctorDetail/ui/Coverage.jsx',
    'components/DoctorDetail/ui/Trend.jsx',
    'components/DoctorDetail/ui/DataTable.jsx',
    'components/DoctorDetail/ui/Activity.jsx',
    'components/DoctorDetail/ui/Modals.jsx',
    'components/DoctorDetail/index.jsx',
  ];
  const compiled = new Map();
  for (const f of files) compiled.set(path.normalize(f), await compile(f));

  function loadSync(file) {
    const key = path.normalize(file);
    if (cache.has(key)) return cache.get(key);
    const mod = { exports: {} };
    cache.set(key, mod.exports);
    const dir = path.dirname(key);
    const ctx = {
      module: mod, exports: mod.exports, console, setTimeout, clearTimeout, URLSearchParams,
      fetch: async (url, init) => {
        fetchCalls.push({ url: String(url), init });
        return { ok: true, status: 200, json: async () => ({ data: [] }) };
      },
      require: (name) => {
        if (name === 'react') return React;
        if (name === 'next/dynamic') return () => () => null;
        if (name === '@calendar/components/auth/calendar-users') return { AUTH_CONFIG: authConfig };
        if (name === '@calendar/lib/graphql-client') {
          return { graphqlRequest: async () => { throw new Error('Tests must not contact ERP'); } };
        }
        if (name === '@/app/graphql-playground/constants') {
          return { getEndpointConfigFromUrlKeyAsync: async () => null };
        }
        if (name.startsWith('.')) {
          const target = path.normalize(path.join(dir, name));
          for (const c of [target, target + '.js', target + '.jsx', path.join(target, 'index.jsx')]) {
            if (compiled.has(c)) return loadSync(c);
          }
          throw new Error('Cannot resolve ' + name + ' from ' + dir);
        }
        return require(name);
      },
    };
    vm.runInNewContext(compiled.get(key), ctx);
    cache.set(key, mod.exports);
    return mod.exports;
  }

  const fmt = loadSync('components/DoctorDetail/lib/format.js');
  const erp = loadSync('components/DoctorDetail/lib/erp.js');
  const queries = loadSync('components/DoctorDetail/lib/queries.js');
  const derive = loadSync('components/DoctorDetail/lib/derive.js');
  const an = loadSync('components/DoctorDetail/lib/analytics.js');
  const page = loadSync('components/DoctorDetail/index.jsx');

  const checks = [];
  const check = (name, fn) => { fn(); checks.push(name); };

  /* ------------------------------------------------------------- queries */

  check('every GraphQL shape parses', () => {
    [...queries.LEAD_QUERIES, ...queries.POB_QUERIES, ...queries.VISIT_QUERIES]
      .forEach((q) => parse(q));
  });

  check('POB reads join on the Lead id, not an event', () => {
    assert.ok(queries.POB_QUERIES.every((q) => q.includes('custom_doctorvisit')));
    // owner is what later becomes the department and the role; losing it
    // silently drops every POB into Unassigned.
    assert.ok(queries.POB_QUERIES.every((q) => /\bowner\b/.test(q)));
  });

  check('visits ask for participants, not the parent attending flag', () => {
    assert.ok(queries.VISIT_QUERIES.every((q) => q.includes('event_participants')));
    assert.ok(queries.VISIT_QUERIES.every((q) => q.includes('custom_visit_time')));
  });

  /* ------------------------------------------------------------ ERP bits */

  check('role prefix strips the beat number', () => {
    assert.equal(erp.rolePrefix('BE12-CND-CH-CHE'), 'BE');
    assert.equal(erp.rolePrefix('ABM3-ELBR-TN-TRI'), 'ABM');
    assert.equal(erp.rolePrefix(null), null);
  });

  check('a two-word division keeps both words', () => {
    const a = erp.parseDepartment('CND Chennai - ELPL');
    assert.equal(a.division, 'CND');
    assert.equal(a.region, 'Chennai');
    assert.equal(a.label, 'CND Chennai');
    // The trap: "Aura & Proxima Kerala" is the A&P division in Kerala, not a
    // division called "Aura & Proxima Kerala".
    const b = erp.parseDepartment('Aura & Proxima Kerala - ELPL');
    assert.equal(b.division, 'Aura & Proxima');
    assert.equal(b.region, 'Kerala');
    assert.equal(erp.shortDivision('Aura & Proxima'), 'A&P');
  });

  check('service is visible only from SM upward', () => {
    assert.equal(erp.ROLE_LADDER.includes('RBM'), true, 'ERP says RBM, not RSM');
  });

  /* ------------------------------------------------------------- derive */

  const lead = {
    name: 'DR-54980',
    lead_name: 'Dr Arpith M N',
    custom_specialty__name: 'Orthopaedics',
    city: 'Mysore',
    territory: { name: 'HQ-Mysore' },
    custom_category__name: 'SC',
    custom_latitude: 12.3224983,
    custom_longitude: 76.6738433,
    notes: [{ name: 'N-1', added_on: '2026-05-14 09:00:00', added_by__name: 'Rep', note: '<p>Wants Vasco calcium &amp; sample</p>' }],
    custom_role_profile: [
      { department__name: 'Elbrit Mysore - ELPL', hq__name: 'HQ-Mysore', role_profile_list__name: 'BE8-ELBR-MY-MYS' },
      { department__name: 'Vasco Karnataka - ELPL', hq__name: 'HQ-Mysore', role_profile_list__name: 'BE15-VASC-KA-MYS' },
      // ERP really does duplicate these rows.
      { department__name: 'Elbrit Mysore - ELPL', hq__name: 'HQ-Mysore', role_profile_list__name: 'BE8-ELBR-MY-MYS' },
    ],
  };

  check('duplicate role-profile rows collapse to one department each', () => {
    const doc = derive.deriveDoctor(lead, null, 'DR-54980');
    assert.equal(doc.divs.join(','), 'Elbrit,Vasco');
    assert.equal(doc.initials, 'AM');
    assert.equal(doc.hq, 'HQ-Mysore');
  });

  // Doctor Support's parent row looks bare; everything that matters is in its
  // item child table. A list read returns only the parent, which is exactly how
  // the department and the product split got missed the first time round.
  const SUPPORT = {
    totals: [
      { name: 'DR-54980-2026-July', date: '2026-07-31', custom_period: '2026-July', custom_total_qty: 44, custom_total_amount: 5469 },
    ],
    items: [
      { name: 'DR-54980-2026-July', date: '2026-07-31', custom_period: '2026-July', item: 'OLMETOP 20 AM', brand: 'OLMETOP', qty: 15, rate: 120.21, amount: 1803, department: 'Vasco Karnataka - ELPL', hq: 'HQ-Mysore', role_profile: 'BE15-VASC-KA-MYS', item_status: 'Submitted' },
      { name: 'DR-54980-2026-July', date: '2026-07-31', custom_period: '2026-July', item: 'OLMETOP 40 CT', brand: 'OLMETOP', qty: 5, rate: 183.22, amount: 916, department: 'Vasco Karnataka - ELPL', hq: 'HQ-Mysore', role_profile: 'BE15-VASC-KA-MYS', item_status: 'Submitted' },
      { name: 'DR-54980-2026-July', date: '2026-07-31', custom_period: '2026-July', item: 'OLMETOP 20', brand: 'OLMETOP', qty: 15, rate: 90, amount: 1350, department: 'Vasco Karnataka - ELPL', hq: 'HQ-Mysore', role_profile: 'BE15-VASC-KA-MYS', item_status: 'Submitted' },
      { name: 'DR-54980-2026-July', date: '2026-07-31', custom_period: '2026-July', item: 'OLMETOP 40', brand: 'OLMETOP', qty: 9, rate: 155.57, amount: 1400, department: 'Vasco Karnataka - ELPL', hq: 'HQ-Mysore', role_profile: 'BE15-VASC-KA-MYS', item_status: 'Submitted' },
    ],
  };

  check('support is one row per product, attributed from the item table', () => {
    const rows = derive.deriveSupport(SUPPORT);
    assert.equal(rows.length, 4, 'one row per Ecubix line, not one per month');
    assert.equal(rows.reduce((a, r) => a + r.amt, 0), 5469, 'items must sum to the parent total');
    assert.ok(rows.every((r) => r.div === 'Vasco'));
    assert.ok(rows.every((r) => r.role === 'BE'));
    assert.equal(rows[0].p, '2026 July');
    assert.ok(rows.every((r) => r.brand === 'OLMETOP'));
  });

  check('a support month with no items keeps its money as Unassigned', () => {
    const rows = derive.deriveSupport({
      totals: [{ name: 'M1', date: '2026-06-30', custom_period: '2026-June', custom_total_qty: 5, custom_total_amount: 916 }],
      items: [],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amt, 916, 'the total must survive an empty item table');
    assert.equal(rows[0].div, 'Unassigned');
    assert.equal(rows[0].unattributed, true);
  });

  check('a partial item table is balanced, not silently short', () => {
    const rows = derive.deriveSupport({
      totals: [{ name: 'M1', date: '2026-06-30', custom_period: '2026-June', custom_total_amount: 1000 }],
      items: [{ name: 'M1', date: '2026-06-30', custom_period: '2026-June', item: 'X', qty: 1, amount: 600, department: 'Elbrit Mysore - ELPL', role_profile: 'BE8-ELBR-MY-MYS' }],
    });
    assert.equal(rows.length, 2);
    assert.equal(rows.reduce((a, r) => a + r.amt, 0), 1000);
    const rest = rows.find((r) => r.unattributed);
    assert.equal(rest.amt, 400);
  });

  check('a rupee of Ecubix rounding is not a phantom product', () => {
    const rows = derive.deriveSupport({
      totals: [{ name: 'M1', date: '2026-06-30', custom_total_amount: 1001 }],
      items: [{ name: 'M1', date: '2026-06-30', item: 'X', qty: 1, amount: 1000, department: 'Elbrit Mysore - ELPL' }],
    });
    assert.equal(rows.length, 1, 'a 1 rupee gap must not spawn an Unassigned row');
  });

  check('the same service filed under two employees counts once', () => {
    const rows = derive.deriveServices([
      { name: 'A', service_date: '2025-07-19', service_amount: 10000, by: 'E01153', department: 'Vasco Karnataka - ELPL', role_profile: 'BE15-VASC-KA-MYS' },
      { name: 'B', service_date: '2025-07-19', service_amount: 10000, by: 'E00817', department: 'Vasco Karnataka - ELPL', role_profile: 'ABM2-VASC-KA-MYS' },
      { name: 'C', service_date: '2026-04-28', service_amount: 40000, by: 'E01153', department: 'Elbrit Mysore - ELPL', role_profile: 'BE8-ELBR-MY-MYS' },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].div, 'Elbrit');
    assert.equal(rows[0].role, 'BE');
  });

  check('a service with no date is dropped rather than dated today', () => {
    assert.equal(derive.deriveServices([{ name: 'X', service_amount: 100 }]).length, 0);
  });

  check('a POB becomes one row per product line, attributed via its owner', () => {
    const index = {
      byUser: new Map([['rep@elbrit.org', { role: 'BE', division: 'Elbrit', name: 'Rep' }]]),
      byId: new Map(),
    };
    const rows = derive.derivePobs([{
      name: 'SAL-QTN-1', owner: 'rep@elbrit.org', transaction_date: '2026-09-02',
      customer_name: 'Power Pharmaceuticals', total_qty: 50, grand_total: 4000,
      items: [
        { item_name: 'TRIGLIMIBRIT 1.3', qty: 30, net_amount: 3587 },
        { item_name: 'GLIMIBRIT M 0.5', qty: 20, net_amount: 413 },
      ],
    }], index);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].div, 'Elbrit');
    assert.equal(rows[0].role, 'BE');
    assert.equal(rows[0].chemist, 'Power Pharmaceuticals');
  });

  check('a POB whose author cannot be resolved keeps its money', () => {
    const rows = derive.derivePobs([{
      name: 'Q', owner: 'gone@elbrit.org', transaction_date: '2026-09-02',
      customer_name: 'Chemist', items: [{ item_name: 'X', qty: 1, net_amount: 500 }],
    }], { byUser: new Map(), byId: new Map() });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].div, 'Unassigned');
    assert.equal(rows[0].amt, 500);
  });

  check('a visit is only MADE when a participant was stamped', () => {
    const index = { byUser: new Map(), byId: new Map([['E1', { role: 'BE', division: 'Elbrit', name: 'Rep' }]]) };
    const [made, planned] = derive.deriveVisits([
      {
        name: 'EV1', starts_on: '2026-08-22 10:00:00', subject: 'Detailing call',
        custom_employee_id: { employee: 'E1', employee_name: 'Rep' },
        event_participants: [{ attending: 'Yes', custom_visit_time: '2026-08-22 10:30:00' }],
      },
      {
        name: 'EV2', starts_on: '2026-08-20 10:00:00', subject: 'Planned call',
        custom_employee_id: { employee: 'E1', employee_name: 'Rep' },
        // The parent's own attending is never written; this must not count.
        event_participants: [{ attending: '' }],
      },
    ], index);
    assert.equal(made.made, true);
    assert.equal(planned.made, false);
    assert.equal(made.div, 'Elbrit');
  });

  check('a Lead note is flattened, never carried as HTML', () => {
    const notes = derive.deriveNotes(lead);
    assert.equal(notes.length, 1);
    assert.ok(!notes[0].body.includes('<'));
    assert.ok(notes[0].body.includes('&'), 'the entity should decode, not vanish');
  });

  check('a doctor with coordinates but no Address still has a pin', () => {
    const doc = derive.deriveDoctor(lead, null, 'DR-54980');
    const clinics = derive.deriveClinics([], doc);
    assert.equal(clinics.length, 1);
    assert.equal(clinics[0].lat, 12.3224983);
    assert.equal(clinics[0].days, null, 'ERP has no visiting days to show');
  });

  check('pharmacies are reconstructed from the POB ledger', () => {
    const pharms = derive.derivePharmacies([
      { chemist: 'A', amt: 100, t: 2, d: '2026-08-13', address: null },
      { chemist: 'A', amt: 200, t: 3, d: '2026-09-02', address: 'Street' },
      { chemist: 'B', amt: 50, t: 1, d: '2026-05-04', address: null },
    ]);
    assert.equal(pharms.length, 2);
    assert.equal(pharms[0].name, 'A');
    assert.equal(pharms[0].pob, 300);
    assert.equal(pharms[0].last, '2026-09-02');
  });

  /* ---------------------------------------------------------- analytics */

  check('the financial year turns on 1 April, in local time', () => {
    assert.equal(an.financialYearStart(new Date(2026, 2, 31)).getFullYear(), 2025);
    assert.equal(an.financialYearStart(new Date(2026, 3, 1)).getFullYear(), 2026);
    const r = an.resolveRange({ mode: 'fy' }, new Date(2026, 8, 15));
    assert.equal(r.label, 'FY 26-27');
    assert.equal(new Date(r.from).getMonth(), 3, '1 April must not drift to 31 March');
    assert.equal(new Date(r.from).getDate(), 1);
  });

  check('a custom range covers whole months at both ends', () => {
    const r = an.resolveRange({ mode: 'custom', from: '2026-04', to: '2026-06' }, new Date(2026, 8, 15));
    assert.equal(new Date(r.from).getMonth(), 3);
    assert.equal(new Date(r.to).getMonth(), 5);
    assert.equal(new Date(r.to).getDate(), 30);
  });

  check('ROI measures support from a service onward, not the raw ratio', () => {
    const support = [
      { t: new Date(2026, 5, 30).getTime(), amt: 100 },
      { t: new Date(2026, 3, 30).getTime(), amt: 900 },
    ];
    const service = [{ t: new Date(2026, 5, 15).getTime(), d: '2026-06-15', amt: 50 }];
    const roi = an.computeRoi(support, service);
    assert.equal(roi.tillDate, 1000 / 50, 'till date is every rupee over every rupee');
    assert.equal(roi.latest, 100 / 50, 'latest only counts support from that service on');
  });

  check('no service means no ROI, not a division by zero', () => {
    const roi = an.computeRoi([{ t: 1, amt: 500 }], []);
    assert.equal(roi.tillDate, null);
    assert.equal(fmt.roiText(roi.tillDate), '—');
  });

  check('support follows the department pager like every other series', () => {
    const win = [{ y: 2026, m: 6 }];
    const rows = [
      { t: new Date(2026, 6, 31).getTime(), amt: 5469, div: 'Vasco' },
      { t: new Date(2026, 6, 31).getTime(), amt: 1000, div: 'Elbrit' },
    ];
    const all = an.monthSeries(win, { support: rows, service: [], pob: [], visits: [] }, null);
    const vasco = an.monthSeries(win, { support: rows, service: [], pob: [], visits: [] }, 'Vasco');
    assert.equal(all[0].sup, 6469);
    assert.equal(vasco[0].sup, 5469);
  });

  check('the table carries real support per department', () => {
    const t = an.buildTable({
      divisions: ['Elbrit', 'Vasco'],
      support: [
        { t: new Date(2026, 6, 31).getTime(), amt: 5469, div: 'Vasco' },
        { t: new Date(2026, 6, 31).getTime(), amt: 1000, div: 'Elbrit' },
      ],
      service: [], pob: [], visits: [],
      months: [{ y: 2026, m: 6, label: 'Jul 26' }],
      range: an.resolveRange({ mode: 'fy' }, new Date(2026, 8, 15)),
      canSeeService: true, pivotOn: false, ladder: erp.ROLE_LADDER,
      money: fmt.inrFull, count: (n) => (n ? String(n) : '—'),
    });
    assert.equal(t.rows.length, 2);
    assert.equal(t.rows[0].label, 'Elbrit');
    assert.equal(t.rows[0].cells[0].v, fmt.inrFull(1000));
    assert.equal(t.rows[1].cells[0].v, fmt.inrFull(5469));
    assert.equal(t.totals[0].v, fmt.inrFull(6469));
  });

  check('the pivot adds a month block plus a Total block', () => {
    const t = an.buildTable({
      divisions: ['Elbrit'], support: [], service: [], pob: [], visits: [],
      months: [{ y: 2026, m: 5, label: 'Jun 26' }, { y: 2026, m: 6, label: 'Jul 26' }],
      range: an.resolveRange({ mode: 'all' }, new Date(2026, 8, 15)),
      canSeeService: false, pivotOn: true, ladder: erp.ROLE_LADDER,
      money: fmt.inrFull, count: (n) => (n ? String(n) : '—'),
    });
    assert.equal(t.groups[t.groups.length - 1].label, 'Total');
    assert.equal(t.groups[t.groups.length - 1].total, true);
    assert.ok(t.template.startsWith('178px repeat('));
  });

  check('a POB role column is never confused with a visits role column', () => {
    const t = an.buildTable({
      divisions: ['Elbrit'], support: [], service: [], pob: [], visits: [],
      months: [{ y: 2026, m: 6, label: 'Jul 26' }],
      range: an.resolveRange({ mode: 'all' }, new Date(2026, 8, 15)),
      canSeeService: true, pivotOn: false, ladder: erp.ROLE_LADDER,
      money: fmt.inrFull, count: (n) => (n ? String(n) : '—'),
    });
    // Both blocks are labelled BE/ABM/RBM/ZSM; only the metric tag tells them
    // apart, and an item row that filled both would double-count POB money.
    const be = t.subs.filter((h) => h.label === 'BE');
    assert.equal(be.length, 2);
    assert.equal(be[0].metric, 'pob');
    assert.equal(be[1].metric, 'visit');
    assert.equal(t.subs[0].metric, 'support');
    assert.equal(t.subs[1].metric, 'service');
  });

  check('coverage keeps a role nobody has used', () => {
    const rows = an.coverageByRole(erp.ROLE_LADDER, {
      visits: [{ role: 'BE', div: 'Elbrit', who: 'Rep', t: 5, d: '2026-08-22' }],
      service: [],
    });
    assert.equal(rows.length, 4);
    assert.equal(rows[0].role, 'BE');
    assert.equal(rows[0].visits, 1);
    assert.equal(rows[1].visits, 0, 'ABM must still have a circle');
  });

  check('the smoothed line never leaves the plot', () => {
    const f = an.flow([0, 100, 50], 100, 600, 184);
    assert.ok(f.line.startsWith('M'));
    const ys = [...f.line.matchAll(/[-\d.]+,([-\d.]+)/g)].map((m) => Number(m[1]));
    assert.ok(ys.every((y) => y >= -1 && y <= 185), 'a control point escaped the box');
  });

  /* ------------------------------------------------------------ formats */

  check('money formats both ways without rounding to nothing', () => {
    assert.equal(fmt.inrFull(92430), '₹92,430');
    assert.equal(fmt.inrShort(9243000), '₹92.43L');
    assert.equal(fmt.inrShort(4700000000), '₹470.00Cr');
    assert.equal(fmt.makeMoney(true)(92430), '₹92k');
  });

  check('a bulk-imported zero phone is not a phone', () => {
    assert.equal(fmt.realPhone('0'), null);
    assert.equal(fmt.realPhone('0000000000'), null);
    assert.equal(fmt.realPhone('9094139307'), '9094139307');
  });

  check('an ERP datetime and an ERP date land on the same day', () => {
    assert.equal(fmt.fdate('2026-04-30'), '30 Apr 2026');
    assert.equal(fmt.fdate('2026-04-30 23:59:59.000000'), '30 Apr 2026');
  });

  /* -------------------------------------------------------------- render */

  check('the page renders without a doctor and asks for one', () => {
    const html = renderToStaticMarkup(React.createElement(page.default, {}));
    assert.ok(html.includes('Bind a doctor'));
  });

  check('the page renders from a bare id without touching ERP', () => {
    const html = renderToStaticMarkup(React.createElement(page.default, { doctor: 'DR-47718' }));
    assert.ok(html.includes('DR-47718'));
    assert.ok(html.includes('Coverage by role'));
    assert.ok(html.includes('Monthly trend'));
    assert.equal(fetchCalls.length, 0, 'a server render must not read ERP');
  });

  check('service figures are absent until a role earns them', () => {
    const html = renderToStaticMarkup(React.createElement(page.default, { doctor: 'DR-47718' }));
    assert.ok(html.includes('service figures hidden at this level'));
    assert.ok(!html.includes('ROI till date'), 'ROI leaks the service total');
  });

  check('unwired actions render no button at all', () => {
    const html = renderToStaticMarkup(React.createElement(page.default, { doctor: 'DR-47718' }));
    assert.ok(html.includes('Add POB'));
    assert.ok(!html.includes('Request service'), 'a dead control is worse than a missing one');
    assert.ok(!html.includes('Add clinic'));
  });

  check('the stylesheet survived the template-literal traps', () => {
    const css = loadSync('components/DoctorDetail/styles.js').default;
    assert.ok(css.length > 10000);
    assert.ok(css.includes('.dx-root'));
    assert.ok(!css.includes('undefined'));
  });

  console.log(checks.map((c) => '  ok  ' + c).join('\n'));
  console.log('\n' + checks.length + ' checks passed');
}

main().catch((error) => {
  console.error('\nFAILED:', error && error.message);
  console.error(error && error.stack);
  process.exit(1);
});
