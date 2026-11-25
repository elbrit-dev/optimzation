/* The rep-side survey API, played in memory — the shapes of
 * SURVEYS_CONTEXT.md §4, the rules of the ERP's server scripts:
 *
 *   getMyList()                    survey_my_list
 *   getMySubjects(campaign, q)     survey_my_subjects
 *   startSubject(campaign, name)   survey_start_subject
 *   uploadFile(file, onProgress)   upload_file (is_private = 1)
 *   submitResponse(response, a)    survey_submit_response
 *
 * State lives for the session: adding distributors and submitting really
 * change what the next call returns. Small delays so loading states show.
 * `scenario: 'error'` makes every call fail, as an unreachable ERP would. */

import { CAMPAIGNS, DISTRIBUTORS, DOCTORS, MOCK_TODAY, ROLES, seedResponses } from './mockData';
import { answerProblem, fileProblem, toPayload } from './shape';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createMockApi({ role = 'BE', scenario = 'normal', today = MOCK_TODAY, delay = 400 } = {}) {
  const reviews = [
    {
      response: 'SR-MOCK-R1', question: 'qclinic', label: 'Choose Dr. Anand’s hospital or clinic', title: 'Clinic locations', rep: 'Ravi Kumar', submitted_on: '2026-11-25 10:30:00',
      subject: { doctype: 'Lead', name: 'DR-1', label: 'Dr. Anand', code: 'DR-1', hq: 'Chennai' },
      answer: { lat: 13.0612, lng: 80.2505, how: 'place', place_id: 'mock-h1', name: 'City Care Hospital', kind: 'Hospital', address: '12 Anna Salai, Chennai 600002', url: '', was: { lat: 13.0604, lng: 80.2496 } },
      review: { status: 'Pending' },
    },
  ];
  const me = ROLES[role] ?? ROLES.BE;
  let responses = seedResponses(role, scenario);
  let seq = responses.length + 1;
  const mine = () => (scenario === 'empty' ? [] : CAMPAIGNS.filter((c) => c.roles.includes(role)));
  const campaign = (name) => {
    const c = mine().find((x) => x.name === name);
    if (!c) throw new Error('Survey not found.');
    return c;
  };
  const isOpen = (c) => c.status === 'Active' && c.due_date >= today;
  const pool = (c) => (c.settings.target === 'Distributor' ? DISTRIBUTORS : DOCTORS);

  async function call(ms = delay) {
    await wait(ms);
    if (scenario === 'error') throw new Error('Could not reach the ERP. Check your connection and try again.');
  }

  return {
    source: 'mock',

    async getMyList() {
      await call();
      const surveys = [];
      for (const r of responses) {
        const c = campaign(r.campaign);
        const state = r.status === 'Submitted' ? 'done' : r.status === 'Pending' && isOpen(c) ? 'todo' : 'missed';
        surveys.push({
          response: r.name,
          campaign: c.name,
          state,
          title: c.title,
          description: c.description,
          due_date: c.due_date,
          from: c.from,
          questions: c.questions,
          answers: state === 'done' ? r.answers : null,
          subject: r.subject,
          target: c.settings.target,
          survey_type: c.settings.survey_type,
          tagging: c.settings.tagging,
          submitted_on: r.submitted_on,
          closed_on: state === 'missed' ? c.due_date : null,
          reminded_on: null,
        });
      }
      const selftag = mine()
        .filter((c) => c.settings.tagging === 'Self-tag' && isOpen(c))
        .map((c) => ({
          campaign: c.name,
          title: c.title,
          description: c.description,
          due_date: c.due_date,
          from: c.from,
          questions: c.questions,
          target: c.settings.target,
          survey_type: c.settings.survey_type,
          done: responses.filter((r) => r.campaign === c.name && r.status === 'Submitted').length,
        }));
      return {
        today,
        me: { user: me.user, full_name: me.full_name, department: 'Sales', designation: me.designation, rep_code: me.rep_code },
        surveys,
        selftag,
      };
    },

    async getMySubjects(name, q = '') {
      await call(250);
      const c = campaign(name);
      if (!isOpen(c)) throw new Error('This survey is not open.');
      const needle = q.trim().toLowerCase();
      const all = pool(c);
      const rows = all
        .filter((s) => !needle || [s.label, s.code, s.name].some((x) => x.toLowerCase().includes(needle)))
        .map((s) => {
          const prev = responses.find((r) => r.campaign === name && r.subject?.name === s.name);
          return {
            doctype: s.doctype,
            name: s.name,
            label: s.label,
            code: s.code,
            hq: s.hq,
            extra: s.extra,
            state: prev ? (prev.status === 'Submitted' ? 'done' : 'started') : 'new',
            response: prev?.name ?? null,
          };
        });
      return {
        campaign: name,
        target: c.settings.target,
        doctype: c.settings.target === 'Distributor' ? 'Customer' : 'Lead',
        rep_code: me.rep_code,
        total: rows.length,
        covered: all.length,
        done: responses.filter((r) => r.campaign === name && r.status === 'Submitted').length,
        rows,
      };
    },

    async startSubject(name, subjectName) {
      await call(200);
      const c = campaign(name);
      if (!isOpen(c)) throw new Error('This survey is closed.');
      if (c.settings.tagging !== 'Self-tag') throw new Error('In this survey Head Office chose who you survey. Open it from My Surveys.');
      const s = pool(c).find((x) => x.name === subjectName);
      if (!s) throw new Error(`This ${c.settings.target.toLowerCase()} is not in your list.`);
      const subject = { doctype: s.doctype, name: s.name, label: s.label, code: s.code, hq: s.hq };
      const prev = responses.find((r) => r.campaign === name && r.subject?.name === s.name);
      if (prev) {
        if (prev.status === 'Submitted') throw new Error(`You already sent this survey for ${s.label}.`);
        return { response: prev.name, existing: 1, subject };
      }
      const r = { name: `SR-${role}-${String(seq++).padStart(4, '0')}`, campaign: name, user: me.user, status: 'Pending', subject, answers: null, submitted_on: null };
      responses = [...responses, r];
      return { response: r.name, existing: 0, subject };
    },

    /* The AI read of an uploaded file (erpApi.readFile): the mock reads
       everything fine, except a file named "blurry…" (to see the rep's warning). */
    /* Map location question: no key in the mock (the map says so); the
       search finds two places near Chennai. */
    async mapsKey() {
      return { key: '' };
    },
    async searchPlaces({ q }) {
      await wait(300);
      return {
        places: [
          { id: 'mock-1', title: `${q} Clinic`, address: '12 Anna Salai, Chennai 600002', lat: 13.0604, lng: 80.2496, url: '' },
          { id: 'mock-2', title: `${q} Hospital`, address: '4 Poonamallee High Rd, Chennai 600084', lat: 13.0827, lng: 80.2707, url: '' },
        ],
      };
    },

    /* hospitals / clinics (survey_places): three around any point, two by name */
    async places({ mode, lat, lng, q, id }) {
      await wait(300);
      const c = { lat: +lat || 13.0604, lng: +lng || 80.2496 };
      const at = (dl, dg) => ({ lat: c.lat + dl, lng: c.lng + dg });
      const all = [
        { id: 'mock-h1', title: 'City Care Hospital', kind: 'Hospital', address: '12 Anna Salai, Chennai 600002', ...at(0.0004, 0.0003), url: '' },
        { id: 'mock-c1', title: 'Lakshmi Skin & Hair Clinic', kind: 'Clinic', address: '4 Poonamallee High Rd, Chennai 600084', ...at(-0.0006, 0.0008), url: '' },
        { id: 'mock-d1', title: 'Smile Dental Care', kind: 'Dental clinic', address: '9 Mount Rd, Chennai 600006', ...at(0.0011, -0.0009), url: '' },
      ];
      if (mode === 'details') return { places: all.filter((p) => p.id === id) };
      if (mode === 'text') return { places: all.filter((p) => p.title.toLowerCase().includes(String(q || '').toLowerCase().split(' ')[0])) };
      return { places: all };
    },

    /* the ABM review: one location to check, decided in memory */
    async mapReview({ action, which, response, question, decision, note }) {
      await wait(250);
      if (action === 'decide') {
        const x = reviews.find((r) => r.response === response && r.question === question);
        if (x) x.review = { status: decision === 'accept' ? 'Accepted' : 'Rejected', by_name: 'You', at: new Date().toISOString(), note, applied: { done: decision === 'accept' } };
        return { applied: { done: decision === 'accept' } };
      }
      return { items: reviews.filter((r) => (which === 'done' ? r.review.status !== 'Pending' : r.review.status === 'Pending')), all: 0, writes: 'erp-uat' };
    },

    async readFile({ file }) {
      await wait(400);
      return /blurr?y/i.test(file?.name || '') ? { readable: false, reason: 'The photo is blurry.' } : { readable: true };
    },

    /* Frappe's upload_file answers { file_url, file_name, file_size }.
       Progress is reported 0…1 as the XHR's upload.onprogress would. */
    async uploadFile(file, onProgress) {
      if (scenario === 'error') {
        await wait(300);
        throw new Error('Upload failed — could not reach the ERP.');
      }
      const steps = 8;
      for (let i = 1; i <= steps; i += 1) {
        await wait(Math.max(60, Math.min(220, file.size / 40000)));
        onProgress?.(i / steps);
      }
      const safe = String(file.name).replace(/[^\w.\-]+/g, '-');
      return { file_url: `/private/files/${safe}`, file_name: file.name, file_size: file.size };
    },

    async submitResponse(responseName, answers) {
      await call(500);
      const r = responses.find((x) => x.name === responseName);
      if (!r) throw new Error('This survey is not assigned to you.');
      if (r.status !== 'Pending') throw new Error(`This survey is already ${r.status}.`);
      const c = campaign(r.campaign);
      if (!isOpen(c)) throw new Error('This survey is closed.');
      const missing = [];
      for (const q of c.questions) {
        const v = answers?.[q.id];
        const p = answerProblem(q, v);
        if (p && (v == null || (Array.isArray(v) && !v.length) || v === '')) missing.push(q.label);
        else if (p) throw new Error(`Invalid answer for: ${q.label}`);
        if (q.type === 'file_upload' && Array.isArray(v)) {
          for (const f of v) {
            if (!String(f.url).startsWith('/private/files/')) throw new Error(`Please upload the file again for: ${q.label}`);
            const bad = fileProblem(q, { name: f.name, size: f.size || 0 });
            if (bad) throw new Error(bad);
          }
        }
      }
      if (missing.length) throw new Error(`Please answer: ${missing.join(', ')}`);
      responses = responses.map((x) =>
        x.name === responseName ? { ...x, status: 'Submitted', answers: toPayload(c.questions, answers), submitted_on: `${today} 12:00` } : x,
      );
      return { ok: true, response: responseName, status: 'Submitted' };
    },

    /* survey_mark_read — an announcement read. */
    async markRead(responseName, ack = 0) {
      await call(300);
      const r = responses.find((x) => x.name === responseName);
      if (!r) throw new Error('This announcement is not assigned to you.');
      const read_on = `${today} 12:00`;
      responses = responses.map((x) => (x.name === responseName ? { ...x, status: 'Submitted', submitted_on: read_on } : x));
      return { response: responseName, status: 'Submitted', read_on, acknowledged: ack ? 1 : 0, already: r.status === 'Submitted' ? 1 : 0 };
    },

    /* An announcement's attachment: nothing to fetch in memory. */
    async openFile(url, name) {
      await call(100);
      return { name: name || 'Attachment' };
    },
  };
}
