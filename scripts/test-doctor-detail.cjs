// Run: node scripts/test-doctor-detail.cjs
// Uses the project's own compiler and React renderer; no live ERP reads/writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { parse } = require('graphql');
const swc = require('next/dist/build/swc');

async function main() {
  await swc.loadBindings();
  const root = path.resolve(__dirname, '..');
  async function compile(file, extra = '') {
    return (await swc.transform(fs.readFileSync(path.join(root, file), 'utf8') + extra, {
      filename: file, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' },
    })).code;
  }
  const authConfig = {};
  const fetchCalls = [];
  const styleModule = { exports: {} };
  vm.runInNewContext(await compile('components/DoctorDetail.styles.js'), { module: styleModule, exports: styleModule.exports });
  const mod = { exports: {} };
  let request = async () => { throw new Error('Tests must not contact ERP'); };
  const context = {
    module: mod, exports: mod.exports, console, setTimeout,
    URLSearchParams,
    fetch: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return { ok: true, status: 200, json: async () => ({ data: [{ name: 'ADDR-1', address_title: 'Example Clinic' }] }) };
    },
    require: (name) => {
      if (name === './DoctorDetail.styles') return styleModule.exports;
      if (name === 'next/dynamic') return () => () => null;
      if (name === '@calendar/components/auth/calendar-users') return { AUTH_CONFIG: authConfig };
      if (name === '@calendar/lib/graphql-client') return { graphqlRequest: (...args) => request(...args) };
      if (name === '@/app/graphql-playground/constants') return { getEndpointConfigFromUrlKeyAsync: async () => null };
      return require(name);
    },
  };
  vm.runInNewContext(await compile('components/DoctorDetail.jsx', '\nexport { analysePobs, readNotes, readRoleRows, readVisitAttendance, realPhone, itemValue, firstSuccessful, fetchDoctorAddresses, ADDRESS_FIELDS, LEAD_QUERIES, POB_QUERIES, VISIT_QUERY };'), context);
  const api = mod.exports;
  const checks = [];
  const check = (name, fn) => { fn(); checks.push(name); };
  const doctor = {
    name: 'DR-TEST', lead_name: 'Dr Example', custom_specialty__name: 'NEURO', custom_category__name: 'C', custom_category1__name: 'HILR', city: 'Trichy',
    mobile_no: '0', phone: '0', email_id: '',
    notes: [{ name: 'N-1', added_on: '2026-01-21 12:15:20.123456', added_by__name: 'Example Rep', note: '<p>Follow up &amp; review</p>' }],
    custom_role_profile: [{ department__name: 'Example Division - ELPL', hq__name: 'HQ-Trichy', role_profile_list__name: 'BEAT-1', role_profile_list: { custom_employee_id: { employee_name: 'Example Rep', employee: 'EMP-1' } } }],
  };
  const quotation = { name: 'Q-1', transaction_date: '2026-09-09', customer_name: 'Example Agency', custom_event__name: 'EV-1', items: [{ item_name: 'PRODUCT A', qty: 1, rate: 275.85, net_amount: 275.85 }, { item_name: 'PRODUCT B', qty: 1, net_amount: 87.19 }] };
  const connection = (nodes) => ({ edges: nodes.map((node) => ({ node })) });
  const visit = { name: 'EV-1', starts_on: '2026-09-09 10:00:00', subject: 'Routine visit', status: 'Closed', custom_employee_id: { employee_name: 'Example Rep' }, event_participants: [{ reference_doctype__name: 'Employee', attending: 'Yes', custom_visit_time: '2026-09-09 10:20:00' }] };
  const data = { Lead: doctor, Quotations: connection([quotation]), Addresses: connection([{ name: 'ADDR-1', address_title: 'Example Clinic', address_type: 'Office', address_line1: '12 Example Road', city: 'Trichy', phone: '04312345678', email_id: 'clinic@example.com' }]), Events: connection([{ name: 'EV-1', starts_on: '2026-09-09 10:00:00', subject: 'Routine visit', status: 'Closed', custom_employee_id: { employee_name: 'Example Rep' } }]) };
  const render = (props = {}) => renderToStaticMarkup(React.createElement(api.default, { doctor, ...props }));
  check('confirmed item net amounts total correctly without grand_total', () => assert.equal(api.analysePobs([quotation]).total, 363.04));
  check('grand total retains its priority', () => assert.equal(api.analysePobs([{ ...quotation, grand_total: 400 }]).total, 400));
  check('zero net amount does not fall through to rate', () => assert.equal(api.itemValue({ net_amount: 0, qty: 2, rate: 300 }), 0));
  check('rate and quantity fallback', () => assert.equal(api.itemValue({ qty: 2, rate: 75 }), 150));
  check('unknown monetary values do not become zero', () => assert.ok(Number.isNaN(api.analysePobs([{ name: 'No value', grand_total: 'unavailable' }]).total)));
  check('notes use added_on, decode HTML and retain author', () => { const [note] = api.readNotes(doctor); assert.equal(note.text, 'Follow up & review'); assert.equal(note.author, 'Example Rep'); assert.equal(note.at, doctor.notes[0].added_on); });
  check('coverage retains nested employee assignment', () => { const [role] = api.readRoleRows(doctor, 'custom_role_profile'); assert.equal(role.employee, 'Example Rep'); assert.equal(role.department, 'Example Division'); });
  check('placeholder phones are unusable', () => assert.equal(api.realPhone('00000000'), ''));
  check('long history charts the latest twelve months', () => { const result = api.analysePobs([{ ...quotation, transaction_date: '2015-01-01' }, quotation]); assert.equal(result.months.length, 12); assert.equal(result.months.at(-1).year, 2026); });
  check('all GraphQL queries parse', () => [...api.LEAD_QUERIES, ...api.POB_QUERIES, api.VISIT_QUERY].forEach((query) => parse(query)));
  // Field-level guards. Each of these was verified absent or unwritten against
  // the live ERP, and asking for one of them fails the WHOLE request in
  // frappe_graphql — so they are asserted gone, not merely unused.
  check('no query asks for a field the ERP does not expose', () => {
    const all = [...api.LEAD_QUERIES, ...api.POB_QUERIES, api.VISIT_QUERY].join('\n');
    for (const dead of ['parent__name', 'owner__name', 'customer__name', 'party_name__name', 'link_name__name']) {
      assert.ok(!all.includes(dead), dead);
    }
  });
  check('visits ask for participants, not the unwritten parent fields', () => {
    assert.ok(api.VISIT_QUERY.includes('event_participants'));
    assert.ok(api.VISIT_QUERY.includes('custom_visit_time'));
    // custom_department exists on Event but the app never populates it.
    assert.ok(!api.VISIT_QUERY.includes('custom_department'));
    // `attending` belongs to the participant rows, never the Event parent.
    assert.ok(!/\battending\b[^{]*$/m.test(api.VISIT_QUERY.split('event_participants')[0]));
  });
  check('notes keep a date fallback for bulk-imported rows', () => {
    assert.ok(api.LEAD_QUERIES.every((query) => /notes\s*{[^}]*creation/.test(query)));
    const [note] = api.readNotes({ notes: [{ name: 'N', note: 'Registration', creation: '2026-01-21 15:01:41.256931' }] });
    assert.equal(note.at, '2026-01-21 15:01:41.256931');
  });
  check('a visit only counts as made when a participant stamped a visit time', () => {
    assert.equal(api.readVisitAttendance({ event_participants: [] }).made, false);
    // The Event parent's own attending is never the signal.
    assert.equal(api.readVisitAttendance({ attending: 'Yes', event_participants: [] }).made, false);
    // Attending with no timestamp is a plan, not a call.
    assert.equal(api.readVisitAttendance({ event_participants: [{ reference_doctype__name: 'Employee', attending: 'Yes' }] }).made, false);
    const joint = api.readVisitAttendance({ event_participants: [
      { reference_doctype__name: 'Employee', attending: 'Yes', custom_visit_time: '2026-09-09 10:00:00' },
      { reference_doctype__name: 'Employee', attending: 'Yes', custom_visit_time: '2026-09-09 11:30:00', custom_is_force_visit: 1 },
      { reference_doctype__name: 'User', attending: 'Yes', custom_visit_time: '2026-09-09 18:00:00' },
    ] });
    assert.equal(joint.made, true);
    assert.equal(joint.forced, true);
    // The latest EMPLOYEE stamp wins; the User invitee copy is ignored.
    assert.equal(new Date(joint.at).getHours(), 11);
  });
  check('the bound row paints immediately, before any fetch returns', () => {
    const html = render();
    for (const text of ['Dr Example', 'NEURO', 'DR-TEST']) assert.ok(html.includes(text), text);
    // ERP writes a literal 0 into the phone columns of imported doctors.
    assert.ok(!html.includes('href="tel:0"'));
    // The 2x2 locator stays hidden while the axis names are placeholders.
    assert.ok(!html.includes('class="dtx-matrix-figure"'));
  });
  check('the grade and the tab panels are always present', () => {
    const html = render();
    assert.ok(html.includes('dtx-grade-value'));
    assert.equal((html.match(/role="tabpanel"/g) || []).length, 3);
  });
  check('the doctor input takes an id, a row or an edge', () => {
    for (const input of [doctor.name, doctor, { node: doctor }]) {
      assert.ok(renderToStaticMarkup(React.createElement(api.default, { doctor: input })).includes('DR-TEST'));
    }
  });
  check('a pending fetch never reads as an empty record', () => {
    const html = render();
    // At first paint the fetch is still in flight, so the panel shows a
    // skeleton. What it must NOT do is claim the doctor has no POBs —
    // "not loaded yet" and "none on record" are different statements.
    assert.ok(html.includes('dtx-skel'), 'expected a loading skeleton');
    assert.ok(!html.includes('Your next opportunity starts here'));
    assert.ok(!html.includes('No visits on file'));
  });
  check('the sections prop still picks and orders panels', () => {
    const html = render({ sections: ['visits'] });
    assert.ok(html.includes('Visits'));
    assert.ok(!/>Coverage</.test(html));
  });
  // This is a component inside a page's layout stack, not a page. Both of
  // these regressed once already and neither is visible in a normal preview.
  check('behaves as a child of a layout stack, not a page', () => {
    const html = render();
    // One scroll port, so auto height grows and a set height scrolls inside.
    // Match the attribute, not the name — the inlined <style> mentions it too.
    assert.equal((html.match(/class="dtx-scrollport"/g) || []).length, 1);
    const css = styleModule.exports.default ?? styleModule.exports.doctorDetailStyles ?? Object.values(styleModule.exports)[0];
    assert.ok(/\.dtx-scrollport\s*{[^}]*overflow-y:\s*auto/.test(css), 'scroll port must scroll');
    assert.ok(/\.dtx-scrollport\s*{[^}]*min-height:\s*0/.test(css), 'min-height:0 or a flex child will not shrink');
    assert.ok(/\.dtx-root\s*{[^}]*min-height:\s*0/.test(css), 'root must be squeezable by its parent');
    // A vw/vh size tracks the browser window instead of the component's box.
    assert.ok(!/\d(vw|vh|dvh|svh)/.test(css), 'no viewport-relative sizes');
  });
  check('notes escape active markup', () => {
    const html = render({ doctor: { ...doctor, notes: [{ note: '<img src=x onerror=alert(1)><p>Safe</p>' }] } });
    assert.ok(!html.includes('onerror='));
    assert.ok(html.includes('Safe'));
  });
  authConfig.erpUrl = 'https://erp.example.org/api/method/graphql';
  authConfig.authToken = 'key:secret';
  const addresses = await api.fetchDoctorAddresses('DR-36661');
  assert.equal(addresses[0].address_title, 'Example Clinic');
  const [addressCall] = fetchCalls;
  assert.ok(addressCall.url.startsWith('https://erp.example.org/api/resource/Address?'), addressCall.url);
  const query = new URLSearchParams(addressCall.url.split('?')[1]);
  assert.equal(query.get('filters'), JSON.stringify([['Dynamic Link', 'link_doctype', '=', 'Lead'], ['Dynamic Link', 'link_name', '=', 'DR-36661']]));
  assert.ok(query.get('order_by').includes('tabAddress'), 'order_by must name the parent table or Frappe answers 500');
  assert.equal(addressCall.init.headers.Authorization, 'token key:secret');
  assert.equal(query.get('fields'), JSON.stringify([...api.ADDRESS_FIELDS]));
  checks.push('addresses join through Dynamic Link over REST, which GraphQL cannot express');

  let calls = 0;
  request = async () => { if (++calls === 1) throw new Error('Optional field unavailable'); return { Lead: doctor }; };
  assert.equal((await api.firstSuccessful(api.LEAD_QUERIES, { name: doctor.name }, (value) => value.Lead)).name, doctor.name);
  assert.equal(calls, 2);
  checks.push('optional query failure falls back to confirmed fields');
  request = async () => { throw new Error('Unavailable'); };
  await assert.rejects(api.firstSuccessful(api.POB_QUERIES, {}, (value) => value.Quotations), /Unavailable/);
  checks.push('failed collection fetch stays a failure rather than empty data');
  check('the prop surface stays small', () => {
    const src = fs.readFileSync(path.join(root, 'components/DoctorDetail.jsx'), 'utf8');
    const sig = src.slice(src.indexOf('export default function DoctorDetail({'));
    const head = sig.slice(0, sig.indexOf('}) {')).replace(/\/\*[\s\S]*?\*\//g, '');
    const props = [...new Set(head.match(/[a-zA-Z]\w*(?=\s*[,:}])/g) || [])];
    assert.ok(props.length <= 9, `prop surface grew to ${props.length}: ${props.join(', ')}`);
    for (const gone of ['fieldMap', 'pobLimit', 'currency', 'accent', 'matrixAxisY', 'linkPobToDoctor', 'authToken', 'enrich', 'pobs'])
      assert.ok(!props.includes(gone), `${gone} came back as a prop`);
  });
  await compile('plasmic-init.js');
  checks.push('Plasmic registration compiles');
  console.log(`${checks.length} checks passed:\n${checks.map((name) => `  - ${name}`).join('\n')}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
