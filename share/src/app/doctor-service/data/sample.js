/* A sample client: the same methods as makeClient, answered from memory,
 * so the form and both pages render in Studio and the dev harness with no
 * ERP. The figures are real (CND Coimbatore, Apr 2025 – Aug 2026, from the
 * approved prototype); the people are the ones in that line.
 *
 * `role` picks who is looking: MIS (enters), GM, CEO (approve), IT (views). */

import { APPROVED, CEO, DRAFT, GM, REJECTED } from './workflow';

const CND = 'CND Coimbatore - ELPL';
const DOCTORS = {
  'DR-1': 'Dr Yuvaraj', 'DR-308': 'Dr Nirmala', 'DR-4509': 'Dr Suresh Kumar', 'DR-30': 'Dr V.Saravanan',
  'DR-51': 'Dr Thirumurugan', 'DR-1992': 'Dr C.S.Karthik', 'DR-1975': 'Dr Karthik Kumar Dass', 'DR-52225': 'Dr Kannan.V',
  'DR-3757': 'Dr L.L.Divya Senthil', 'DR-43': 'Dr V.Govindaraj', 'DR-10649': 'Dr Sujatha', 'DR-46036': 'Dr Vinitha Priya',
};
const HQ = { 'DR-308': 'HQ-Erode', 'DR-30': 'HQ-Salem', 'DR-43': 'HQ-Salem' };
const PEOPLE = {
  E01053: { name: 'Balamurugan Eswaran', seat: 'RBM1-CND-CBE' },
  E00006: { name: 'Suresh R', seat: 'SM1-CND' },
};
const MIS = { user: 'vishnu.mis@elbrit.org', name: 'Vishnu' };
const GM_P = { user: 'rajkumar@elbrit.org', name: 'Rajkumar N' };
const CEO_P = { user: 'prakash@elbrit.org', name: 'Prakash Senthilkumar' };

const SUPPORT = {
  'DR-1': [33751, 30866, 41531, 27885, 13972, 20348, 29982, 28242, 27152, 22264, 25922, 14978, 26399, 31470, 35218, 15906, 17733.5],
  'DR-308': [347334, 356899, 308214, 387976, 384466, 276313, 366670, 290565, 369507, 389823, 360209, 348984, 405555, 400284, 411676, 411589, 473853.41],
  'DR-4509': [390593, 181701, 125696, 263293, 177016, 116873, 162977, 89611, 241653, 171853, 109644, 117384, 240165, 65942, 403668, 12203, 35559.15],
  'DR-30': [253139, 251976, 237265, 234047, 243641, 242203, 257078, 275496, 279057, 261542, 243722, 263369, 267970, 261055, 264665, 260445, 280472.4],
  'DR-51': [251564, 277589, 236909, 280189, 239490, 246343, 223709, 206824, 290959, 224769, 224658, 229289, 236779, 214404, 259429, 236070, 277147.2],
  'DR-1992': [183579, 180385, 176308, 177918, 191293, 172182, 177174, 175573, 180315, 193352, 191363, 194714, 199540, 193319, 160386, 168461, 175672.08],
  'DR-1975': [68455, 44763, 90876, 113217, 76354, 94231, 66807, 88118, 87997, 86472, 83071, 89327, 91197, 89777, 80378, 84313, 77064.8],
  'DR-52225': [0, 4629, 0, 0, 2893, 8679, 4050, 3472, 4629, 5786, 0, 11263, 93922, 122205, 97972, 86592, 146745],
  'DR-3757': [57731, 60494, 58816, 41234, 38424, 56211, 50828, 43233, 51612, 47481, 60134, 45799, 54543, 39771, 58424, 59536, 58781.6],
  'DR-43': [45294, 31308, 49687, 37390, 40183, 43056, 41281, 30093, 22510, 31416, 39386, 26456, 43561, 27992, 62821, 49215, 55839],
  'DR-10649': [17088, 19222, 17219, 15819, 10638, 12326, 11109, 23503, 13508, 8557, 9705, 19282, 18945, 9359, 9561, 5817, 8571.5],
  'DR-46036': [4501, 7779, 7329, 7329, 6750, 8872, 8358, 9386, 8936, 9515, 9130, 6044, 15108, 10736, 15975, 8358, 18207],
};
const MK = ['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
const SVC_RAW = {
  'DR-1': '2026-06-30|Cash|2220;2026-01-28|Cash|43302;2026-01-23|Dinner|6905;2025-11-05|Travel|6000',
  'DR-4509': '2026-07-15|cash back activity|51000;2026-06-17|cash back activity|4600;2026-05-16|cash back activity|32000;2026-04-20|cash back activity|14600;2026-03-18|cash back activity|16200;2026-02-23|cash back activity|30350;2026-01-13|cash back activity|75000;2025-08-16|cab|4485;2025-06-26|cab|4626;2025-05-30|cash back activity|9600',
  'DR-51': '2026-07-05|CAR|35883;2026-06-05|CAR|40440;2026-05-22|CAR|41040.98;2026-04-05|CAR|38233;2026-03-05|CAR|37252.77;2026-02-05|CAR|34097;2026-01-05|CAR|39173;2025-12-11|Travel|16896;2025-11-05|CAR|36520.71;2025-10-05|CAR|38351.69;2025-09-05|CAR|41643;2025-08-05|CAR|44775.49;2025-07-05|CAR|41890;2025-06-05|CAR|37983;2025-05-05|CAR|34811.54;2025-04-05|CAR|39692',
  'DR-1992': '2026-06-17|Cash|100000;2026-05-17|EMI TAKEOVER|32500;2026-04-21|RD 3|32500;2026-03-13|EMI TAKEOVER|32500;2026-02-12|EMI TAKEOVER|32500;2026-01-12|EMI TAKEOVER|32500;2025-12-19|EMI TAKEOVER|32500;2025-11-15|EMI TAKEOVER|32500;2025-10-23|EMI TAKEOVER|32500;2025-09-19|EMI TAKEOVER|32500',
  'DR-52225': '2026-07-15|EMI TAKEOVER|35000;2026-06-15|EMI TAKEOVER|35000;2026-05-16|EMI TAKEOVER|30000;2026-04-29|RD 3|25000',
  'DR-30': '2026-07-08|CAR|35492;2026-06-09|CAR|29669;2026-05-15|CAR|31814.24;2026-04-10|CAR|33780;2026-03-10|CAR|36531.81;2026-02-10|CAR|35569;2026-01-07|CAR|35701;2025-12-10|CAR|36193.72;2025-11-10|CAR|38578.88;2025-10-15|CAR|35115',
  'DR-308': '2026-07-11|Cash|100000;2026-05-08|Cash|100000;2026-03-17|Cash|100000;2026-02-06|Cash|100000;2026-01-17|Cash|100000;2025-12-03|Cash|100000;2025-11-27|Cash|150000;2025-07-08|gold|72000',
  'DR-10649': '2026-06-02|EB Bill|920;2026-05-16|EB Bill|1742;2026-03-20|EB Bill|3038;2025-09-25|EB Bill|2615',
  'DR-46036': '2026-06-20|EB Bill|3394;2026-05-02|EB Bill|3036;2026-03-05|EB Bill|2486;2025-12-26|EB Bill|2789',
  'DR-3757': '2026-05-26|Cash|10000;2026-02-21|Fund Transfer|8800;2026-01-12|EMI TAKEOVER|10000;2025-12-04|Cash|21650',
  'DR-43': '2026-07-24|EB Bill|15215;2026-05-16|EB Bill|16221;2026-03-24|EB Bill|10882;2026-01-13|Cash|10000',
  'DR-1975': '2026-05-26|Cash|50000;2026-04-16|RD 3|20000;2026-03-13|EMI TAKEOVER|18000;2026-02-12|Cash|10000',
};
const SERVICES = ['EMI TAKEOVER', 'Cash', 'cab', 'CAR', 'RD 3', 'Travel', 'Fund Transfer', 'cheque', 'Check', 'RD 2', 'RD 4', 'Academic', 'Dinner', 'GIFT CARD', '10K Voucher', '50K Vocuher', 'gold', 'Jewel Chit', 'I PHONE', 'GADGETS', 'APPLIANCE', 'EB Bill', 'Activity Deck', 'cash back activity', 'GC - Britrova CV, Nero PG, Chlorvix'];

const DAY = 864e5;
const at = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 19).replace('T', ' ');

function seed() {
  const rows = [];
  let n = 0;
  const mk = (by, doctor, service, date, amount, remarks, state, ago, reason) => {
    n += 1;
    const P = PEOPLE[by];
    const history = [];
    const wf = (content, who, d) => history.push({ type: 'Workflow', content, by: who, user: who, at: at(d) });
    if (state !== DRAFT) {
      wf(GM, MIS.name, ago);
      if (state === CEO || state === APPROVED) wf(CEO, GM_P.name, ago * 0.6);
      if (state === APPROVED) wf(APPROVED, CEO_P.name, ago * 0.3);
      if (state === 'final') wf(APPROVED, GM_P.name, ago * 0.4);
      if (state === REJECTED) wf(REJECTED, GM_P.name, ago * 0.3);
    }
    rows.push({
      name: `DSV-${String(1000 + n)}`, doctor, doctor_name: DOCTORS[doctor], service_name: service, service_amount: amount,
      service_date: date, date: date, by, by_name: P.name, department: CND, hq: HQ[doctor] || 'HQ-Coimbatore',
      role_profile: P.seat, remarks, workflow_state: state === 'final' ? APPROVED : state, service_attachement: null,
      owner: MIS.user, creation: at(ago + 0.5), modified: at(state === DRAFT ? ago : ago * 0.3),
      custom_rejection_reason: reason || '', entered_by_name: MIS.name,
      custom_ceo_skipped: state === 'final' ? 1 : 0, category: '', history,
    });
  };
  mk('E01053', 'DR-4509', 'cash back activity', '2026-07-15', 51000, 'CASH BACK', DRAFT, 1);
  mk('E01053', 'DR-52225', 'EMI TAKEOVER', '2026-07-15', 35000, '1 MONTH EMI', DRAFT, 1);
  mk('E01053', 'DR-1992', 'Cash', '2026-06-17', 100000, 'CASH', GM, 2);
  mk('E01053', 'DR-51', 'CAR', '2026-07-05', 35883, 'CAR EMI', GM, 1);
  mk('E01053', 'DR-10649', 'EB Bill', '2026-06-02', 920, 'EB - 031280011630 (A. V. THIRUNAVUKKARASU AND A. V. MARUTHAGIRI)', GM, 3);
  mk('E00006', 'DR-3757', 'Fund Transfer', '2026-02-21', 8800, 'HBA1C', GM, 2);
  mk('E01053', 'DR-308', 'Cash', '2026-07-11', 100000, 'CASH', CEO, 3);
  mk('E01053', 'DR-30', 'CAR', '2026-07-08', 35492, 'CAR EMI', CEO, 4);
  mk('E01053', 'DR-1975', 'Cash', '2026-05-26', 50000, 'CASH', APPROVED, 12);
  mk('E01053', 'DR-46036', 'EB Bill', '2026-06-20', 3394, 'EB - 030100062678 (K.RAMAKRISHNAN R.SENBAGAVALLI)', 'final', 10);
  mk('E01053', 'DR-1', 'Cash', '2026-06-30', 2220, 'Mango Purchase (RE - IMBURSEMENT)', APPROVED, 9);
  mk('E01053', 'DR-43', 'Cash', '2026-05-26', 10000, 'CASH - GPAY', REJECTED, 8, 'Duplicate request');
  return rows;
}

const VIEWERS = {
  MIS: { user: MIS.user, employee: 'E01400', employee_name: MIS.name, can_enter: true, can_view: true, approver: null },
  GM: { user: GM_P.user, employee: 'E00003', employee_name: GM_P.name, can_enter: false, can_view: true, approver: 'GM' },
  CEO: { user: CEO_P.user, employee: 'E00001', employee_name: CEO_P.name, can_enter: false, can_view: true, approver: 'CEO' },
  IT: { user: 'it@elbrit.org', employee: 'E00900', employee_name: 'IT Team', can_enter: false, can_view: true, approver: null },
};

/* Last-3 visits by role, deterministic per doctor. */
function visitsFor(id) {
  let sd = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7);
  const rnd = () => (sd = (sd * 48271) % 2147483647) / 2147483647;
  const end = new Date('2026-08-31T00:00:00').getTime();
  const start = new Date('2025-04-01T00:00:00').getTime();
  const run = (gMin, gMax, off) => {
    const out = [];
    let t = end - off * DAY;
    while (out.length < 3 && t >= start) { out.push(new Date(t).toISOString().slice(0, 10)); t -= (gMin + rnd() * (gMax - gMin)) * DAY; }
    return out;
  };
  return [
    { role: 'BE', name: 'Bala Sankar K', dates: run(6, 16, Math.floor(rnd() * 8)) },
    { role: 'ABM', name: 'R Senthil Kumar', dates: run(25, 60, Math.floor(rnd() * 25)) },
    { role: 'RBM', name: 'Balamurugan Eswaran', dates: run(60, 140, Math.floor(rnd() * 45)) },
    { role: 'SM', name: 'Suresh R', dates: rnd() < 0.55 ? run(150, 260, Math.floor(rnd() * 90)) : [] },
  ];
}

const TRANS = {
  [`${DRAFT}|Submit`]: [GM, 'MIS'], [`${REJECTED}|Submit`]: [GM, 'MIS'],
  [`${GM}|Approve`]: [CEO, 'GM'], [`${GM}|Approve as final`]: [APPROVED, 'GM'], [`${GM}|Reject`]: [REJECTED, 'GM'],
  [`${CEO}|Approve`]: [APPROVED, 'CEO'], [`${CEO}|Reject`]: [REJECTED, 'CEO'],
};

export function makeSampleClient(role = 'MIS') {
  let rows = seed();
  const viewer = VIEWERS[role] || VIEWERS.MIS;
  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 180));
  const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
  const find = (name) => {
    const r = rows.find((x) => x.name === name);
    if (!r) throw new Error('Not found: ' + name);
    return r;
  };
  const checkEnter = () => { if (!viewer.can_enter) throw new Error('Only the MIS team can add or edit a doctor service.'); };

  return {
    live: false,
    options: (doctor) => delay({
      viewer,
      ...(doctor ? {
        doctor: { id: doctor, name: DOCTORS[doctor] || doctor },
        ...(viewer.can_enter ? {
          employees: [
            { employee: 'E01053', employee_name: PEOPLE.E01053.name, seat: PEOPLE.E01053.seat, grade: 'RBM', pairs: [{ department: CND, hq: HQ[doctor] || 'HQ-Coimbatore' }] },
            { employee: 'E00006', employee_name: PEOPLE.E00006.name, seat: PEOPLE.E00006.seat, grade: 'SM', pairs: [{ department: CND, hq: HQ[doctor] || 'HQ-Coimbatore' }, { department: 'Elbrit Coimbatore - ELPL', hq: 'HQ-Coimbatore' }] },
          ],
          services: SERVICES.map((name) => ({ name, category: '' })),
        } : {}),
      } : {}),
    }),
    list: () => delay({ viewer, setup: { missing: [] }, rows: rows.map((r) => ({ ...r, doctor_avg: avg(r.doctor) })) }),
    insight: (doctor, exclude) => delay({
      doctor: { id: doctor, name: DOCTORS[doctor] || doctor },
      months: MK.map((month, i) => ({ month, support: (SUPPORT[doctor] || [])[i] || 0 })),
      services: [
        ...rows.filter((r) => r.doctor === doctor && r.name !== exclude).map((r) => ({ name: r.name, date: r.service_date, service: r.service_name, amount: r.service_amount, department: r.department, by_name: r.by_name, status: r.workflow_state, via_app: true })),
        // The seeded app rows ARE some of these payments: drop the copy, as live ERP holds each once.
        ...(SVC_RAW[doctor] || '').split(';').filter(Boolean).map((x, i) => { const p = x.split('|'); return { name: `${doctor}-h${i}`, date: p[0], service: p[1], amount: Number(p[2]), department: CND, by_name: 'ERP record', status: 'Paid', via_app: false }; })
          .filter((h) => !rows.some((r) => r.doctor === doctor && r.service_date === h.date && Math.round(r.service_amount) === Math.round(h.amount))),
      ].sort((a, b) => String(b.date).localeCompare(String(a.date))),
      visits: visitsFor(doctor),
    }),
    async create(fields) {
      checkEnter();
      const P = PEOPLE[fields.by] || { name: fields.by, seat: '' };
      const row = {
        ...fields, name: `DSV-${1000 + rows.length + 1}`, doctor_name: DOCTORS[fields.doctor] || fields.doctor,
        by_name: P.name, role_profile: P.seat, workflow_state: DRAFT, owner: viewer.user, creation: now(), modified: now(),
        entered_by_name: viewer.employee_name, custom_rejection_reason: '', history: [], service_attachement: null,
      };
      rows = [row, ...rows];
      return delay(row);
    },
    async update(name, fields) {
      checkEnter();
      const r = find(name);
      if (![DRAFT, REJECTED].includes(r.workflow_state)) throw new Error(`This service is in ${r.workflow_state} and can no longer be edited.`);
      Object.assign(r, fields, { modified: now(), by_name: (PEOPLE[fields.by] || {}).name || r.by_name });
      return delay(r);
    },
    async remove(name) { checkEnter(); rows = rows.filter((r) => r.name !== name); return delay(true); },
    async apply(name, action, extra) {
      const r = find(name);
      const t = TRANS[`${r.workflow_state}|${action}`];
      const may = t && ((t[1] === 'MIS' && viewer.can_enter) || t[1] === viewer.approver);
      if (!may) throw new Error(`You cannot ${action.toLowerCase()} a service in ${r.workflow_state}.`);
      if (t[0] === REJECTED && String(extra?.custom_rejection_reason || '').trim().length < 3) throw new Error('Add a short reason for the rejection.');
      if (r.workflow_state === REJECTED && r.custom_rejection_reason) r.history.push({ type: 'Comment', content: 'Earlier rejection: ' + r.custom_rejection_reason, by: viewer.employee_name, at: now() });
      r.custom_rejection_reason = t[0] === REJECTED ? extra.custom_rejection_reason : '';
      r.history.push({ type: 'Workflow', content: t[0], by: viewer.employee_name, at: now() });
      if (action === 'Approve as final') r.custom_ceo_skipped = 1;
      if (t[0] === GM) r.custom_ceo_skipped = 0;
      r.workflow_state = t[0];
      r.modified = now();
      return delay(r);
    },
    async comment(name, text) { find(name).history.push({ type: 'Comment', content: text, by: viewer.employee_name, at: now() }); return delay(true); },
    async upload(name, file) { find(name).service_attachement = '/private/files/' + file.name; return delay({ file_url: '/private/files/' + file.name }); },
    fileUrl: (u) => u,
  };
}

function avg(doctor) {
  const s = (SUPPORT[doctor] || []).slice(-12).filter((v) => v > 0);
  return s.length ? s.reduce((a, v) => a + v, 0) / s.length : 0;
}
