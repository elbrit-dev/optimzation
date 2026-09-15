// Run: node scripts/preview-doctor-detail.cjs [outDir]
//
// Renders components/DoctorDetail/ to a standalone HTML file with the data
// layer stubbed, so the page can be looked at (and screenshotted) without ERP.
// This is a LOOKING tool, not a test — scripts/test-doctor-detail.cjs asserts.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const swc = require('next/dist/build/swc');

const root = path.resolve(__dirname, '..');
const outDir = process.argv[2] || path.join(root, '.preview');

const T = (d) => new Date(d + 'T00:00:00').getTime();

// Shaped exactly as lib/derive.js emits, using DR-54980's real profile (two
// departments) with plausible rows hung off it.
const DOCTOR = {
  id: 'DR-54980',
  name: 'Dr Arpith M N',
  initials: 'AM',
  spec: 'Orthopaedics',
  qual: 'MD',
  city: 'Mysore',
  state: 'Karnataka',
  hq: 'HQ-Mysore',
  code: '54980',
  cats: ['SC'],
  catLine: 'SC',
  divisions: [
    { key: 'Elbrit', label: 'Elbrit', division: 'Elbrit', region: 'Mysore' },
    { key: 'Vasco', label: 'Vasco', division: 'Vasco', region: 'Karnataka' },
  ],
  divs: ['Elbrit', 'Vasco'],
  covering: [],
  lat: 12.3224983,
  lon: 76.6738433,
};

// Real DR-54980 Ecubix lines: every one carries its own department, HQ, role
// profile and brand, and they sum to the parent month totals.
const supportItem = (name, date, period, item, qty, rate, amount) => ({
  k: 'support', id: name + '-' + item, parent: name,
  d: date, t: T(date), p: period,
  div: 'Vasco', role: 'BE', roleId: 'BE15-VASC-KA-MYS', hq: 'HQ-Mysore',
  item, brand: 'OLMETOP', qty, rate, amt: amount, state: 'Submitted',
});

const support = [
  supportItem('DR-54980-2026-July', '2026-07-31', '2026 July', 'OLMETOP 20 AM', 15, 120.21, 1803),
  supportItem('DR-54980-2026-July', '2026-07-31', '2026 July', 'OLMETOP 40 CT', 5, 183.22, 916),
  supportItem('DR-54980-2026-July', '2026-07-31', '2026 July', 'OLMETOP 20', 15, 90, 1350),
  supportItem('DR-54980-2026-July', '2026-07-31', '2026 July', 'OLMETOP 40', 9, 155.57, 1400),
  supportItem('DR-54980-2026-June', '2026-06-30', '2026 June', 'OLMETOP 40 CT', 5, 183.22, 916),
  supportItem('DR-54980-2026-May', '2026-05-31', '2026 May', 'OLMETOP 20 AM', 28, 120.21, 3366),
  supportItem('DR-54980-2026-May', '2026-05-31', '2026 May', 'OLMETOP 20', 12, 90, 1080),
  supportItem('DR-54980-2026-May', '2026-05-31', '2026 May', 'OLMETOP 20 CT', 7, 115.71, 810),
  supportItem('DR-54980-2026-May', '2026-05-31', '2026 May', 'OLMETOP 40', 2, 155.57, 311),
  supportItem('DR-54980-2026-April', '2026-04-30', '2026 April', 'OLMETOP 20 AM', 26, 120.21, 3125),
  supportItem('DR-54980-2026-April', '2026-04-30', '2026 April', 'OLMETOP 40 CT', 9, 183.22, 1649),
  supportItem('DR-54980-2026-April', '2026-04-30', '2026 April', 'OLMETOP 20 CT', 11, 115.71, 1273),
];

const service = [
  { k: 'service', id: 'V2', d: '2026-04-28', t: T('2026-04-28'), kind: 'Cash', amt: 10000, by: 'E01153', role: 'BE', div: 'Elbrit', hq: 'HQ-Mysore', ref: 'GPAY 99864xxx53' },
  { k: 'service', id: 'V1', d: '2025-07-19', t: T('2025-07-19'), kind: 'Cash', amt: 10000, by: 'E01153', role: 'BE', div: 'Vasco', hq: 'HQ-Mysore', ref: 'CASHFREE 99864xxx53' },
];

const pobs = [
  { k: 'pob', id: 'Q1#0', quotation: 'SAL-QTN-1', d: '2026-08-13', t: T('2026-08-13'), div: 'Elbrit', role: 'BE', by: 'Chandrashekar V', chemist: 'Mysore City Pharma', item: 'TRIGLIMIBRIT 1.3', qty: 20, amt: 2391, address: 'Kuvempunagar, Mysore' },
  { k: 'pob', id: 'Q1#1', quotation: 'SAL-QTN-1', d: '2026-08-13', t: T('2026-08-13'), div: 'Elbrit', role: 'BE', by: 'Chandrashekar V', chemist: 'Mysore City Pharma', item: 'GLIMIBRIT M 0.5', qty: 2, amt: 125, address: 'Kuvempunagar, Mysore' },
  { k: 'pob', id: 'Q2#0', quotation: 'SAL-QTN-2', d: '2026-06-18', t: T('2026-06-18'), div: 'Vasco', role: 'ABM', by: 'Arunkumar M', chemist: 'Vasco KA Distributors', item: 'BRITVIT', qty: 9, amt: 1736, address: 'Sayyaji Rao Road, Mysore' },
  { k: 'pob', id: 'Q3#0', quotation: 'SAL-QTN-3', d: '2026-05-04', t: T('2026-05-04'), div: 'Elbrit', role: 'BE', by: 'Chandrashekar V', chemist: 'Mysore City Pharma', item: 'TRIGLIMIBRIT 1.3', qty: 5, amt: 598, address: 'Kuvempunagar, Mysore' },
];

const visits = [
  { k: 'visit', id: 'EV1', d: '2026-07-30', t: T('2026-07-30'), who: 'Chandrashekar V', role: 'BE', div: 'Elbrit', hq: 'HQ-Mysore', subject: 'Cab service discussion', made: true, forced: false },
  { k: 'visit', id: 'EV2', d: '2026-05-14', t: T('2026-05-14'), who: 'Arunkumar M', role: 'ABM', div: 'Vasco', hq: 'HQ-Mysore', subject: 'Detailing call', made: true, forced: true },
  { k: 'visit', id: 'EV3', d: '2026-04-11', t: T('2026-04-11'), who: 'Chandrashekar V', role: 'BE', div: 'Elbrit', hq: 'HQ-Mysore', subject: 'Follow-up call', made: false, forced: false },
];

const notes = [
  { k: 'note', id: 'N1', d: '2026-07-30', t: T('2026-07-30'), tag: 'Note', title: 'Cab service asked for two OP days', body: 'Needs pickup on Wed and Sat', by: 'Chandrashekar V' },
  { k: 'note', id: 'N2', d: '2026-05-14', t: T('2026-05-14'), tag: 'Follow-up', title: 'Wants Vasco calcium sample', body: 'Promised on the next visit', by: 'Arunkumar M' },
];

const clinics = [
  { id: 'A1', hue: '#1e3a8a', name: 'Arpith Ortho Clinic', tag: 'Office', addr: '34, Kalidasa Road, V V Mohalla, Mysore, 570002', days: null, lat: 12.3224983, lon: 76.6738433 },
  { id: 'A2', hue: '#047857', name: 'Columbia Asia OPD', tag: 'Billing', addr: 'Ring Road, Kuvempunagar, Mysore, 570023', days: null, lat: null, lon: null },
];

const pharmacies = [
  { name: 'Mysore City Pharma', addr: 'Kuvempunagar, Mysore', code: null, last: '2026-08-13', lastT: T('2026-08-13'), pob: 3114, lines: 3 },
  { name: 'Vasco KA Distributors', addr: 'Sayyaji Rao Road, Mysore', code: null, last: '2026-06-18', lastT: T('2026-06-18'), pob: 1736, lines: 1 },
];

function makeStub(role) {
  const canSeeService = ['SM', 'ZSM', 'Admin'].includes(role);
  return {
    doctorId: 'DR-54980',
    loading: false,
    ready: true,
    fatal: null,
    scope: 'user',
    viewer: { role, employee: 'E01153', email: 'rep@elbrit.org', canSeeService, resolved: true },
    canSeeService,
    doctor: DOCTOR,
    support,
    service: canSeeService ? service : [],
    pobs,
    visits,
    notes,
    clinics,
    pharmacies,
    errors: {},
    refresh: () => {},
  };
}

async function main() {
  await swc.loadBindings();

  const files = [
    'components/DoctorDetail/lib/format.js',
    'components/DoctorDetail/lib/erp.js',
    'components/DoctorDetail/lib/queries.js',
    'components/DoctorDetail/lib/derive.js',
    'components/DoctorDetail/lib/analytics.js',
    'components/DoctorDetail/lib/useContainerMode.js',
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
  for (const f of files) {
    compiled.set(path.normalize(f), (await swc.transform(fs.readFileSync(path.join(root, f), 'utf8'), {
      filename: f,
      jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } },
      module: { type: 'commonjs' },
    })).code);
  }

  let stub = makeStub('ABM');
  let forceCompact = false;
  const cache = new Map();
  // useContainerMode reads a ResizeObserver, which does not exist in a static
  // render — so the narrow frame would otherwise draw the WIDE layout inside a
  // 392px box and prove nothing.
  // __esModule matters: swc's interop wraps a plain object as { default: obj }
  // otherwise, and the default export stops being callable.
  cache.set(path.normalize('components/DoctorDetail/lib/useContainerMode.js'), {
    __esModule: true,
    default: () => [{ current: null }, forceCompact],
  });
  // The data layer is swapped for a fixed answer; everything above it is real.
  cache.set(path.normalize('components/DoctorDetail/lib/useDoctorData.js'), {
    __esModule: true,
    useDoctorData: () => stub,
  });

  function loadSync(file) {
    const key = path.normalize(file);
    if (cache.has(key)) return cache.get(key);
    const mod = { exports: {} };
    cache.set(key, mod.exports);
    const dir = path.dirname(key);
    const ctx = {
      module: mod, exports: mod.exports, console, setTimeout, clearTimeout, URLSearchParams,
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }),
      require: (name) => {
        if (name === 'react') return React;
        if (name === 'next/dynamic') return () => () => null;
        if (name === '@calendar/components/auth/calendar-users') return { AUTH_CONFIG: {} };
        if (name === '@calendar/lib/graphql-client') return { graphqlRequest: async () => ({}) };
        if (name === '@/app/graphql-playground/constants') return { getEndpointConfigFromUrlKeyAsync: async () => null };
        if (name.startsWith('.')) {
          const target = path.normalize(path.join(dir, name));
          for (const c of [target, target + '.js', target + '.jsx', path.join(target, 'index.jsx')]) {
            if (cache.has(c) || compiled.has(c)) return loadSync(c);
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

  const FRAMES = [
    ['ABM', 1120, 'Desktop 1120 · signed in as ABM (no service)', 'table'],
    ['SM', 1120, 'Desktop 1120 · signed in as SM (service visible)', 'table'],
    ['SM', 392, 'Mobile 392 · signed in as SM', 'table'],
    ['SM', 1120, 'Desktop 1120 · activity timeline', 'activity'],
  ];
  // A static render cannot click the Data/Activity switch, so the timeline
  // frame is produced by seeding that one useState. Preview-only surgery on the
  // COMPILED text — the component itself is untouched.
  const pageKey = path.normalize('components/DoctorDetail/index.jsx');
  const pristine = compiled.get(pageKey);
  const seedView = (view) => {
    // swc emits (0, _react.useState)("table"), so the source spelling does not
    // appear verbatim in the compiled text.
    const seeded = pristine.replace(/useState\)\("table"\)/, 'useState)("activity")');
    if (view === 'activity' && seeded === pristine) {
      throw new Error('preview: could not seed the activity view — the compiled shape changed');
    }
    compiled.set(pageKey, view === 'activity' ? seeded : pristine);
    cache.delete(pageKey);
  };
  const frames = [];
  for (const [role, width, label, view] of FRAMES) {
    stub = makeStub(role);
    forceCompact = width < 720;
    seedView(view);
    const Page = loadSync('components/DoctorDetail/index.jsx').default;
    const html = renderToStaticMarkup(React.createElement(Page, {
      doctor: 'DR-54980',
      onAddClinic: () => {},
      onRequestService: () => {},
    }));
    frames.push({ label, width, html });
  }

  // The compact layout is chosen by ResizeObserver at runtime, which does not
  // run in a static render — the narrow frame is forced with the same class.
  const page = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>
  body { margin:0; background:#e7ebf2; font-family:Inter,system-ui,sans-serif; padding:28px 32px 40px; }
  .frames { display:flex; gap:28px; align-items:flex-start; flex-wrap:wrap; }
  .frame-label { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#6b7280; margin-bottom:8px; }
  .chrome { border:1px solid #d7dde7; border-radius:14px; overflow:hidden; background:#fff; box-shadow:0 8px 24px rgba(16,24,40,.07); }
  .bar { display:flex; align-items:center; gap:7px; padding:9px 12px; border-bottom:1px solid #e5e7eb; background:#f6f8fb; }
  .bar i { width:9px; height:9px; border-radius:50%; background:#e5e7eb; }
  .bar span { margin-left:8px; font-size:11px; color:#6b7280; }
  .port { background:#f6f8fb; }
</style></head><body>
<div class="frames">
${frames.map((f) => `  <div style="flex:none;width:${f.width}px;max-width:100%">
    <div class="frame-label">${f.label}</div>
    <div class="chrome">
      <div class="bar"><i></i><i></i><i></i><span>elbrit.app / doctors / DR-54980</span></div>
      <div class="port">${f.html}</div>
    </div>
  </div>`).join('\n')}
</div>
</body></html>`;

  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'doctor-detail.html');
  fs.writeFileSync(file, page);
  console.log('wrote ' + file);
}

main().catch((e) => { console.error(e); process.exit(1); });
