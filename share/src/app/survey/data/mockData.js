/* Seeded surveys for the harness's Mock mode and the tests — shaped like
 * the ERP's records (SURVEYS_CONTEXT.md §3), served by mockApi.js in the
 * shapes of §4. Names of people, doctors and distributors are invented.
 *
 *   rx-audit      Doctors · Pre-tag · Data Collection    BE, ABM   to do
 *   secondary     Distributors · Self-tag · Data Coll.   BE, ABM   to do, due today (the whiteboard's S2)
 *   footfall      Doctors · Pre-tag · Data Collection    BE        all done
 *   cme-invite    Doctors · Pre-tag · Promotion          BE, RBM   missed (closed)
 *   app-feedback  Employees · Data Collection            ABM, RBM  to do */

export const MOCK_TODAY = '2026-11-11';

export const ROLES = {
  BE: { user: 'ravikumar.s@elbrit.org', employee: 'HR-EMP-00412', full_name: 'Ravikumar S', designation: 'Business Executive', rep_code: 'BE7-VASC-CO-NAG' },
  ABM: { user: 'nandhakumar.abm@elbrit.org', employee: 'HR-EMP-00218', full_name: 'Nandhakumar K', designation: 'Area Business Manager', rep_code: 'ABM3-VASC-CO-TVL' },
  RBM: { user: 'kamesh.rbm@elbrit.org', employee: 'HR-EMP-00107', full_name: 'Kamesh R', designation: 'Regional Business Manager', rep_code: 'RBM1-VASC-CO-MDU' },
};

const FROM = 'Priya Sundaram';

export const CAMPAIGNS = [
  {
    name: 'SC-2026-0031',
    key: 'rx-audit',
    title: 'Rx audit — vascular range',
    description: 'What each of your doctors prescribes in the vascular range, and where Elbrit fits.',
    status: 'Active',
    due_date: '2026-11-18',
    from: FROM,
    roles: ['BE', 'ABM'],
    settings: { target: 'Doctor', survey_type: 'Data Collection', tagging: 'Pre-tag' },
    questions: [
      { id: 'q_rx1', type: 'multiple_choice', label: 'Which antiplatelet does the doctor prescribe most?', required: 1, options: ['Clopidogrel', 'Ticagrelor', 'Prasugrel', 'Aspirin alone'] },
      { id: 'q_rx2', type: 'linear_scale', label: 'How familiar is the doctor with Elbrit Cilnidipine?', required: 1, min: 1, max: 5, min_label: 'Never heard of it', max_label: 'Prescribes it' },
      { id: 'q_rx3', type: 'number', label: 'New patients started on a statin, per week', required: 1, description: 'The doctor’s own estimate is fine.' },
      { id: 'q_rx4', type: 'checkboxes', label: 'Molecules prescribed for hypertension', required: 0, options: ['Amlodipine', 'Cilnidipine', 'Telmisartan', 'Olmesartan', 'Metoprolol'] },
      { id: 'q_rx5', type: 'dropdown', label: 'Preferred time for calls', required: 0, options: ['Morning OPD', 'Afternoon', 'Evening OPD', 'After 8 pm'] },
      { id: 'q_rx6', type: 'rating', label: 'How was the doctor’s response to the detailing?', required: 1, max: 5 },
      { id: 'q_rx7', type: 'date', label: 'Date of the visit', required: 1 },
      { id: 'q_rx8', type: 'paragraph', label: 'Anything else the doctor said', required: 0, description: 'Objections, requests, samples asked for.' },
    ],
  },
  {
    name: 'SC-2026-0034',
    key: 'secondary',
    title: 'Secondary statement — October',
    description: 'Upload each distributor’s October secondary statement. Add the distributors you collected one from.',
    status: 'Active',
    due_date: MOCK_TODAY,
    from: FROM,
    roles: ['BE', 'ABM'],
    settings: { target: 'Distributor', survey_type: 'Data Collection', tagging: 'Self-tag' },
    questions: [
      { id: 'q_st1', type: 'file_upload', label: 'Upload secondary statement', required: 1, accept: 'pdf_image', max_mb: 5, max_files: 1, description: 'The statement as the distributor gave it — a PDF or a clear photo.' },
    ],
  },
  {
    name: 'SC-2026-0027',
    key: 'footfall',
    title: 'Clinic footfall check',
    description: 'How busy each clinic is, to plan next quarter’s calls.',
    status: 'Active',
    due_date: '2026-11-20',
    from: FROM,
    roles: ['BE'],
    settings: { target: 'Doctor', survey_type: 'Data Collection', tagging: 'Pre-tag' },
    questions: [
      { id: 'q_ff1', type: 'number', label: 'Patients seen on a typical day', required: 1 },
      { id: 'q_ff2', type: 'multiple_choice', label: 'When is the clinic open?', required: 1, options: ['Morning', 'Evening', 'Both'] },
    ],
  },
  {
    name: 'SC-2026-0022',
    key: 'cme-invite',
    title: 'Diwali CME invitation',
    description: 'Invite each doctor to the hypertension CME and note whether they will come.',
    status: 'Closed',
    due_date: '2026-11-08',
    from: 'Arun Prakash',
    roles: ['BE', 'RBM'],
    settings: { target: 'Doctor', survey_type: 'Promotion', tagging: 'Pre-tag' },
    questions: [
      { id: 'q_cm1', type: 'multiple_choice', label: 'Will the doctor attend?', required: 1, options: ['Yes', 'Maybe', 'No'] },
      { id: 'q_cm2', type: 'short_text', label: 'Who will attend with the doctor?', required: 0 },
    ],
  },
  {
    name: 'SC-2026-0035',
    key: 'app-feedback',
    title: 'Field app feedback',
    description: 'Two minutes on how the new field app is working for you.',
    status: 'Active',
    due_date: '2026-11-25',
    from: 'IT Elbrit',
    roles: ['ABM', 'RBM'],
    settings: { target: 'Employees', survey_type: 'Data Collection', tagging: '' },
    questions: [
      { id: 'q_af1', type: 'rating', label: 'How easy is the app to use?', required: 1, max: 5 },
      { id: 'q_af2', type: 'dropdown', label: 'Which screen do you use most?', required: 1, options: ['Secondary entry', 'Approvals', 'Visit', 'Planner'] },
      { id: 'q_af3', type: 'short_text', label: 'One thing you would change', required: 0 },
    ],
  },
];

/* The distributors a rep covers (Customer, customer_group under
   Distributor) — D1…D10 on the whiteboard. */
export const DISTRIBUTORS = [
  ['CUST-00911', 'Sri Murugan Pharma Distributors', 'EBS10231', 'HQ-Nagercoil'],
  ['CUST-00912', 'Kanyakumari Medical Agencies', 'EBS10244', 'HQ-Nagercoil'],
  ['CUST-00915', 'Thiruvalluvar Drug House', 'EBS10257', 'HQ-Nagercoil'],
  ['CUST-00921', 'Cape Pharma & Surgicals', 'EBS10263', 'HQ-Nagercoil'],
  ['CUST-00930', 'Lakshmi Medical Distributors', 'EBS10279', 'HQ-Marthandam'],
  ['CUST-00934', 'Annai Pharma Agencies', 'EBS10282', 'HQ-Marthandam'],
  ['CUST-00940', 'Velan Healthcare Distributors', 'EBS10296', 'HQ-Kuzhithurai'],
  ['CUST-00947', 'Sathya Medicals Wholesale', 'EBS10301', 'HQ-Kuzhithurai'],
  ['CUST-00952', 'Ganesh Pharma Traders', 'EBS10318', 'HQ-Colachel'],
  ['CUST-00958', 'Royal Drug Distributors', 'EBS10325', 'HQ-Colachel'],
].map(([name, label, code, hq]) => ({ doctype: 'Customer', name, label, code, hq, extra: 'Distributor' }));

export const DOCTORS = [
  ['LEAD-04410', 'Dr. Anitha Rajan', 'DR41000', 'HQ-Nagercoil', 'Cardiologist'],
  ['LEAD-04411', 'Dr. Joseph Prabhu', 'DR41001', 'HQ-Nagercoil', 'Physician'],
  ['LEAD-04412', 'Dr. Meenakshi Sundar', 'DR41002', 'HQ-Nagercoil', 'Diabetologist'],
  ['LEAD-04413', 'Dr. Arul Selvan', 'DR41003', 'HQ-Marthandam', 'Cardiologist'],
  ['LEAD-04414', 'Dr. Kavitha Nair', 'DR41004', 'HQ-Marthandam', 'Physician'],
  ['LEAD-04415', 'Dr. Suresh Babu', 'DR41005', 'HQ-Colachel', 'Nephrologist'],
].map(([name, label, code, hq, extra]) => ({ doctype: 'Lead', name, label, code, hq, extra }));

/* Responses at the start of a session: Pre-tag ones are created by the
   ERP at launch (one per doctor × the rep covering them); Self-tag ones
   only when the rep starts a distributor. `answers` only on Submitted. */
export function seedResponses(role, scenario = 'normal') {
  if (scenario === 'empty') return [];
  const me = ROLES[role];
  const out = [];
  let n = 1;
  const add = (campaign, subject, status, answers) =>
    out.push({
      name: `SR-${role}-${String(n++).padStart(4, '0')}`,
      campaign,
      user: me.user,
      status,
      subject,
      answers: answers ?? null,
      submitted_on: status === 'Submitted' ? '2026-11-07 16:42' : null,
    });
  const allDone = scenario === 'done';
  for (const c of CAMPAIGNS.filter((x) => x.roles.includes(role))) {
    if (c.key === 'rx-audit') {
      DOCTORS.slice(0, 4).forEach((d, i) =>
        add(c.name, d, allDone || i === 0 ? 'Submitted' : 'Pending', allDone || i === 0 ? RX_DONE : null),
      );
    }
    if (c.key === 'secondary' && allDone) {
      DISTRIBUTORS.slice(0, 2).forEach((d) => add(c.name, d, 'Submitted', { q_st1: [{ url: `/private/files/${d.code}-oct.pdf`, name: `${d.code}-oct.pdf`, size: 248113 }] }));
    }
    if (c.key === 'footfall') DOCTORS.slice(0, 3).forEach((d, i) => add(c.name, d, 'Submitted', { q_ff1: 30 + i * 12, q_ff2: ['Morning', 'Evening', 'Both'][i] }));
    if (c.key === 'cme-invite') DOCTORS.slice(2, 5).forEach((d, i) => add(c.name, d, allDone || i === 0 ? 'Submitted' : 'Expired', allDone || i === 0 ? { q_cm1: 'Yes' } : null));
    if (c.key === 'app-feedback') add(c.name, null, allDone ? 'Submitted' : 'Pending', allDone ? { q_af1: 4, q_af2: 'Approvals' } : null);
  }
  return out;
}

const RX_DONE = { q_rx1: 'Clopidogrel', q_rx2: 4, q_rx3: 12, q_rx4: ['Amlodipine', 'Telmisartan'], q_rx6: 4, q_rx7: '2026-11-06', q_rx8: 'Asked for Cilnidipine samples.' };
