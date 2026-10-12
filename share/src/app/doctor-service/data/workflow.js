/* The Doctor Service route as the screens draw it, and everything a row
 * shows that is worked out rather than read.
 *
 *   MIS (enters, on behalf of an RBM / SM) -> GM Approval -> CEO Approval
 *   GM may approve as final (CEO not needed); GM / CEO may reject.
 *
 * A row's story comes from its own record: the workflow state, the
 * GM / CEO stamps the guard writes, and the Workflow comments ERP adds on
 * every transition (history) — replayed in order, so a rejected-and-
 * resubmitted service shows only its latest round on the stepper. */

export const DRAFT = 'Draft';
export const GM = 'GM Approval';
export const CEO = 'CEO Approval';
export const APPROVED = 'Approved';
export const REJECTED = 'Rejected';
export const EDITABLE = [DRAFT, REJECTED];

export const CATS = ['Cash', 'EMI', 'Bookings', 'Gift'];
/* Used until Doctor Service Master carries custom_category. */
export const CAT_OF = {
  Cash: 'Cash', cheque: 'Cash', Check: 'Cash', 'Fund Transfer': 'Cash', 'cash back activity': 'Cash',
  'EMI TAKEOVER': 'EMI', CAR: 'EMI', 'RD 2': 'EMI', 'RD 3': 'EMI', 'RD 4': 'EMI', 'Jewel Chit': 'EMI', 'EB Bill': 'EMI',
  cab: 'Bookings', Travel: 'Bookings', Academic: 'Bookings', Dinner: 'Bookings', 'Activity Deck': 'Bookings',
  'GIFT CARD': 'Gift', '10K Voucher': 'Gift', '50K Vocuher': 'Gift', gold: 'Gift', 'I PHONE': 'Gift',
  GADGETS: 'Gift', APPLIANCE: 'Gift', 'GC - Britrova CV, Nero PG, Chlorvix': 'Gift',
};
export const catOf = (service, category) => category || CAT_OF[service] || '';

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WDS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const money = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const cmp = (n) => {
  n = Number(n) || 0;
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
  if (n >= 1e3) return '₹' + (n / 1e3).toFixed(1) + ' K';
  return '₹' + Math.round(n);
};
export const roiTxt = (x) => (x == null || !isFinite(x) ? '—' : x.toFixed(2) + 'x');

const toD = (s) => new Date(String(s).length === 10 ? s + 'T00:00:00' : String(s).replace(' ', 'T'));
export const fD = (s) => { if (!s) return '—'; const d = toD(s); return d.getDate() + ' ' + MON[d.getMonth()]; };
export const fDY = (s) => { if (!s) return '—'; const d = toD(s); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); };
export const fDT = (s) => {
  if (!s) return '';
  const d = toD(s);
  return `${d.getDate()} ${MON[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export const wait = (s) => {
  if (!s) return '';
  const h = Math.floor((Date.now() - toD(s).getTime()) / 36e5);
  if (h < 1) return 'just now';
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
};
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const short = (d) => String(d || '').replace(/\s*-\s*[A-Z]{2,6}\s*$/, '');
export const first = (n) => String(n || '').trim().split(/\s+/)[0] || '';
export const gradeOf = (seat) => String(seat || '').split('-')[0].replace(/[0-9]/g, '').toUpperCase();

/* The workflow comments, replayed: [{ from, to, by, at }]. */
function transitions(row) {
  let prev = DRAFT;
  const out = [];
  for (const h of row.history || []) {
    if (h.type !== 'Workflow') continue;
    const to = String(h.content || '').trim();
    if (!to || to === prev) continue;
    out.push({ from: prev, to, by: h.by, at: h.at });
    prev = to;
  }
  return out;
}

/* A list API row → the shape every screen draws. */
export function normalize(row) {
  const steps = transitions(row);
  let lastSubmit = -1;
  steps.forEach((t, i) => { if (t.to === GM) lastSubmit = i; });
  const round = lastSubmit >= 0 ? steps.slice(lastSubmit + 1) : [];
  const gmStep = round.find((t) => t.from === GM);
  const ceoStep = round.find((t) => t.from === CEO);
  const state = row.workflow_state || DRAFT;
  const skipped = !!Number(row.custom_ceo_skipped) || (gmStep && gmStep.to === APPROVED);
  return {
    id: row.name,
    doctorId: row.doctor,
    doctorName: row.doctor_name || row.doctor,
    service: row.service_name,
    category: catOf(row.service_name, row.category),
    date: row.service_date || row.date,
    amount: Number(row.service_amount) || 0,
    remarks: row.remarks || '',
    att: row.service_attachement || null,
    state,
    by: row.by,
    byName: row.by_name || row.by || '',
    byRole: gradeOf(row.role_profile) || '',
    dept: row.department || '',
    hq: row.hq || '',
    enteredBy: row.entered_by_name || row.owner || '',
    created: row.creation,
    modified: row.modified,
    reason: row.custom_rejection_reason || '',
    submittedAt: lastSubmit >= 0 ? steps[lastSubmit].at : null,
    submittedBy: lastSubmit >= 0 ? steps[lastSubmit].by : null,
    gm: gmStep ? { name: row.gm_name || gmStep.by, at: row.custom_gm_action_on || gmStep.at, to: gmStep.to } : null,
    ceo: ceoStep ? { name: row.ceo_name || ceoStep.by, at: row.custom_ceo_action_on || ceoStep.at, to: ceoStep.to } : null,
    skipped,
    history: row.history || [],
    steps,
    doctorAvg: Number(row.doctor_avg) || 0,
    lastAt: row.modified || row.creation,
  };
}

export function statusOf(e) {
  if (e.state === DRAFT) return { label: 'Draft', bg: '#F1F3F6', fg: '#4B5563' };
  if (e.state === GM || e.state === CEO) return { label: e.state, bg: '#EAF1FF', fg: '#1D4ED8' };
  if (e.state === APPROVED) return { label: 'Approved', bg: '#E5F6EC', fg: '#15803D' };
  if (e.state === REJECTED) return { label: 'Rejected', bg: '#FDECEC', fg: '#B91C1C' };
  return { label: e.state, bg: '#F1F3F6', fg: '#4B5563' };
}

/* The little bars on a card: one per approver step (GM, CEO). */
export function bars(e) {
  const n = e.skipped ? 1 : 2;
  const level = e.state === GM ? 0 : e.state === CEO ? 1 : 2;
  return Array.from({ length: n }, (_, i) => {
    if (e.state === APPROVED) return '#22A06B';
    if (e.state === DRAFT) return '#DDE2E8';
    if (e.state === REJECTED) {
      const at = e.ceo ? 1 : 0;
      return i < at ? '#22A06B' : i === at ? '#DC2626' : '#DDE2E8';
    }
    return i < level ? '#22A06B' : i === level ? '#2563EB' : '#DDE2E8';
  });
}

export function stageText(e) {
  if (e.state === DRAFT) return 'Not submitted';
  if (e.state === GM) return `with GM · ${wait(e.submittedAt || e.lastAt)}`;
  if (e.state === CEO) return `GM ✓ · with CEO · ${wait(e.gm?.at || e.lastAt)}`;
  if (e.state === APPROVED) return e.skipped ? `GM ✓ · final at GM · ${fD(e.gm?.at || e.lastAt)}` : `GM ✓ · CEO ✓ · ${fD(e.ceo?.at || e.lastAt)}`;
  if (e.state === REJECTED) {
    const who = e.ceo?.to === REJECTED ? e.ceo : e.gm;
    return `Rejected by ${who?.name || (e.ceo ? 'CEO' : 'GM')} (${e.ceo?.to === REJECTED ? 'CEO' : 'GM'}) · ${fD(who?.at || e.lastAt)}`;
  }
  return e.state;
}

const KIND = {
  done: ['#22A06B', '#22A06B', '#15803D'],
  current: ['#fff', '#2563EB', '#1D4ED8'],
  x: ['#DC2626', '#DC2626', '#B91C1C'],
  todo: ['#fff', '#D5DAE1', '#9CA3AF'],
  skip: ['#F4F6F9', '#D5DAE1', '#9CA3AF'],
};

/* MIS -> GM -> CEO, for the detail's stepper. */
export function stepper(e) {
  const nodes = [{
    label: 'MIS',
    sub: e.submittedAt ? first(e.submittedBy || e.enteredBy) + ' · ' + fD(e.submittedAt) : 'Draft',
    kind: e.submittedAt && e.state !== DRAFT ? 'done' : 'current',
  }];
  const node = (label, step, isNow) => {
    if (step) return { label, sub: first(step.name) + ' · ' + fD(step.at), kind: step.to === REJECTED ? 'x' : 'done' };
    if (isNow) return { label, sub: 'now', kind: 'current' };
    return { label, sub: '', kind: 'todo' };
  };
  nodes.push(node('GM', e.gm, e.state === GM));
  if (e.skipped) nodes.push({ label: 'CEO', sub: 'Not needed', kind: 'skip' });
  else nodes.push(node('CEO', e.ceo, e.state === CEO));
  return nodes.map((n, i) => ({
    ...n,
    bg: KIND[n.kind][0], border: KIND[n.kind][1], fg: KIND[n.kind][2],
    lineL: i === 0 ? 'transparent' : nodes[i - 1].kind === 'done' ? '#22A06B' : '#E3E7EC',
    lineR: i === nodes.length - 1 ? 'transparent' : n.kind === 'done' ? '#22A06B' : '#E3E7EC',
  }));
}

/* The activity list, newest first. */
export function activity(e) {
  const out = [{ title: `Created · ${e.enteredBy} (MIS) for ${e.byName}${e.byRole ? ' (' + e.byRole + ')' : ''}`, when: e.created, dot: '#9CA3AF', note: '' }];
  for (const t of e.steps) {
    let title;
    let dot = '#22A06B';
    let note = '';
    if (t.to === GM) { title = `Submitted · moved to GM Approval · ${t.by}`; dot = '#2563EB'; }
    else if (t.to === REJECTED) { title = `Rejected · ${t.by} (${t.from === CEO ? 'CEO' : 'GM'})`; dot = '#DC2626'; }
    else if (t.from === GM && t.to === APPROVED) { title = `Approved as final · ${t.by} (GM)`; note = 'CEO approval not needed'; }
    else if (t.from === GM) title = `Approved · ${t.by} (GM) · sent to CEO`;
    else if (t.from === CEO) title = `Approved · ${t.by} (CEO)`;
    else title = `${t.to} · ${t.by}`;
    out.push({ title, when: t.at, dot, note });
  }
  for (const h of e.history) {
    if (h.type === 'Comment' && h.content) out.push({ title: `Comment · ${h.by}`, when: h.at, dot: '#9CA3AF', note: h.content });
  }
  if (e.state === REJECTED && e.reason) {
    const rej = [...out].reverse().find((o) => o.title.startsWith('Rejected'));
    if (rej && !rej.note) rej.note = e.reason;
  }
  out.sort((a, b) => String(a.when || '').localeCompare(String(b.when || '')));
  return out.reverse().map((o, i, a) => ({ ...o, when: fDT(o.when), hasLine: i < a.length - 1 }));
}

/* Who may do what — the screen's offer; the ERP's workflow is the judge. */
export function canDecide(e, viewer) {
  return !!viewer?.approver && ((viewer.approver === 'GM' && e.state === GM) || (viewer.approver === 'CEO' && e.state === CEO));
}
export const canEdit = (e, viewer) => !!viewer?.can_enter && EDITABLE.includes(e.state);

export const QUICK_REJECT = ['Amount above monthly limit', 'Duplicate request', 'Bill / receipt not attached', 'Not as per service policy'];

export const tierOf = (avg, high = 100000, mid = 25000) => (!avg
  ? ['No sales', '#FDECEC', '#B91C1C']
  : avg >= high ? ['Big doctor', '#E5F6EC', '#15803D']
    : avg >= mid ? ['Medium doctor', '#EAF1FF', '#1D4ED8']
      : ['Small doctor', '#FEF3E2', '#B45309']);
