// Run: node scripts/preview-doctor-detail.cjs [outDir]
//
// Renders components/DoctorDetail/ to a standalone HTML file so the page can be
// looked at (and screenshotted) without a browser session against ERP.
//
// The rows come from scripts/fixtures/doctor-erp-rows.json — RAW payloads copied
// verbatim off live erp.elbrit.org — and they go through the component's own
// derive layer, not a hand-shaped stand-in. So this exercises normalisation on
// the shapes ERP actually returns.
//
// ONE input is not real: visits. The read-only credential used to collect the
// fixture cannot see the Event doctype at all, so the visit rows below are
// written by hand and every frame that uses them says so. Nothing else is.
//
// This is a LOOKING tool. scripts/test-doctor-detail.cjs is what asserts.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const swc = require('next/dist/build/swc');

const root = path.resolve(__dirname, '..');
const outDir = process.argv[2] || path.join(root, '.preview');
const RAW = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/doctor-erp-rows.json'), 'utf8'));

// Hand-written, because Event is unreadable to the fixture credential. Shaped
// the way the GraphQL visit read returns it, participants included.
const HAND_VISITS = [
  {
    name: 'EV00077', subject: 'Detailing call', starts_on: '2026-08-04 10:30:00',
    status: 'Closed', event_type: 'Public', custom_hq: 'HQ-Erode',
    custom_employee_id: { employee: 'E00717', employee_name: 'Rangarajan R' },
    event_participants: [{ attending: 'Yes', custom_visit_time: '2026-08-04 11:05:00' }],
  },
  {
    name: 'EV00078', subject: 'Follow-up call', starts_on: '2026-06-12 09:00:00',
    status: 'Open', event_type: 'Public', custom_hq: 'HQ-Erode',
    custom_employee_id: { employee: 'E00717', employee_name: 'Rangarajan R' },
    event_participants: [{ attending: '' }],
  },
];

const EMPLOYEES = new Map([
  ['E00717', {
    employee: 'E00717', name: 'Rangarajan R', role: 'BE', roleId: 'BE4-AURA-CO-ERO',
    division: 'Aura & Proxima', department: 'Aura & Proxima Coimbatore', hq: 'HQ-Erode',
  }],
]);

async function main() {
  await swc.loadBindings();

  const files = [
    'components/DoctorDetail/lib/format.js',
    'components/DoctorDetail/lib/erp.js',
    'components/DoctorDetail/lib/queries.js',
    'components/DoctorDetail/lib/derive.js',
    'components/DoctorDetail/lib/analytics.js',
    'components/DoctorDetail/lib/grade.js',
    'components/DoctorDetail/lib/scope.js',
    'components/DoctorDetail/lib/loadDoctor.js',
    'components/DoctorDetail/lib/console.js',
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
    'components/DoctorConsole/session.js',
    'components/DoctorConsole/useDoctorConsole.js',
    'components/DoctorConsole/shell.jsx',
    'components/DoctorConsole/DoctorHeroCard.jsx',
    'components/DoctorConsole/DoctorTotalsCard.jsx',
    'components/DoctorConsole/DoctorFilterBar.jsx',
    'components/DoctorConsole/DoctorCoverageCard.jsx',
    'components/DoctorConsole/DoctorInsightsCard.jsx',
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

  let forceCompact = false;
  const cache = new Map();
  // __esModule matters: swc's interop wraps a plain object as { default: obj }
  // otherwise, and the default export stops being callable.
  cache.set(path.normalize('components/DoctorDetail/lib/useContainerMode.js'), {
    __esModule: true,
    default: () => [{ current: null }, forceCompact],
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

  const derive = loadSync('components/DoctorDetail/lib/derive.js');
  const sessions = loadSync('components/DoctorConsole/session.js');

  /** Raw ERP payloads -> exactly what the ERP read would hand the session. */
  function build(id, { role, withVisits, errors = {}, denied = {}, blankLead = false }) {
    const raw = RAW[id];
    const canSeeService = ['SM', 'ZSM', 'Admin'].includes(role);
    const lead = blankLead ? null : raw.lead;
    const doctor = derive.deriveDoctor(lead, null, id);
    const visits = derive.deriveVisits(withVisits ? HAND_VISITS : [], { byId: EMPLOYEES });
    const pobs = derive.derivePobs(errors.pobs ? [] : raw.pobs, derive.eventOwnerIndex(visits));
    const supportRaw = errors.support || denied.support
      ? { totals: [], items: [] }
      : { totals: raw.supportTotals, items: raw.supportItems };
    return {
      doctorId: id,
      loading: false,
      ready: true,
      fatal: null,
      scope: 'user',
      viewer: { role, employee: 'E00717', email: 'rep@elbrit.org', canSeeService, resolved: true },
      canSeeService,
      doctor,
      support: derive.deriveSupport(supportRaw),
      service: canSeeService ? derive.deriveServices(raw.services) : [],
      pobs,
      visits,
      notes: derive.deriveNotes(lead),
      clinics: derive.deriveClinics(raw.addresses, doctor),
      pharmacies: derive.derivePharmacies(pobs),
      errors,
      denied,
      scoped: true,
      endpoint: null,
      span: null,
    };
  }

  const FRAMES = [
    ['DR-47718', 1120, 'DR-47718 - SM - real ERP rows (14 support item rows + 9 services, no POBs)',
      { role: 'SM', withVisits: false }, 'table'],
    ['DR-49059', 1120, 'DR-49059 - ABM - real ERP rows (11 POB lines, 1 support month) + hand-written visits',
      { role: 'ABM', withVisits: true }, 'table'],
    ['DR-49059', 1120, 'DR-49059 - activity timeline',
      { role: 'ABM', withVisits: true }, 'activity'],
    ['DR-49059', 392, 'DR-49059 - mobile 392',
      { role: 'ABM', withVisits: true }, 'table'],
    ['DR-49059', 1120, 'FAILURE STATE - profile and POBs failed, support refused 403. Does the hero still render?',
      { role: 'BE', withVisits: true, blankLead: true, errors: { lead: true, pobs: true }, denied: { support: true } }, 'table'],
    ['DR-47718', 1120, 'DR-47718 - SM - FILTER SHEET open, showing the multi-select department chips',
      { role: 'SM', withVisits: false }, 'table', { modal: 'filter', divs: ['CND'] }],
  ];

  // The reading now lives in a module-level session rather than in the page's
  // own state, which makes a static preview simpler rather than harder: seed the
  // session with fixture rows and flip its view, and every card draws from it.
  // No surgery on compiled output any more.
  const Page = loadSync('components/DoctorDetail/index.jsx').default;

  const frames = [];
  for (const [id, width, label, opts, view, ui] of FRAMES) {
    forceCompact = width < 720;
    sessions.clearSessions();
    const session = sessions.getSession(sessions.sessionKey({ doctorId: id }), { doctor: id });
    // `started` is set so nothing tries to reach ERP if an effect ever does run.
    session.started = true;
    session.setData(build(id, opts));
    session.patch({ view, ...(ui || {}) });
    const html = renderToStaticMarkup(React.createElement(Page, {
      doctor: id,
      onAddClinic: () => {},
      onRequestService: () => {},
    }));
    frames.push({ label, width, html });
  }

  const page = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>
  body { margin:0; background:#e7ebf2; font-family:Inter,system-ui,sans-serif; padding:28px 32px 40px; }
  .frames { display:flex; gap:28px; align-items:flex-start; flex-wrap:wrap; }
  .frame-label { font-size:11px; font-weight:700; letter-spacing:.04em; color:#6b7280; margin-bottom:8px; }
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
      <div class="bar"><i></i><i></i><i></i><span>elbrit.app / doctors</span></div>
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
