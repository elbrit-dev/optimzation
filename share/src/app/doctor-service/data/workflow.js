/* The Doctor Service route as the screens draw it, and everything a row
 * shows that is worked out rather than read.
 *
 * The approval lives on the service's Operational Tracker ("Approval flow",
 * Approval Settings "Doctor Service"); the Doctor Service Guard makes it when
 * MIS saves — SAVING SUBMITS — and starts it at GM:
 *
 *   MIS saves -> GM -> CEO -> Approved
 *   GM may approve as final (CEO not needed); GM / CEO may send it back
 *   (Rework: MIS edits, and that save resubmits) or reject it (final).
 *   The final approval ends it, in "GM Approved and Verified" (GM approved
 *   as final) or "CEO Approved and Verified" (the workflow's "Final
 *   Approve", Doctor Service only); rejections end in "GM / CEO Rejected".
 *   (An older tracker left in "... Approved and Waiting for Verification"
 *   counts as approved too.)
 *
 * The tracker's own states are mapped to the few the screens draw (appState).
 * A row's story is the tracker's Workflow comments — ERP adds one per step —
 * replayed in order, so a sent-back-and-resubmitted service shows only its
 * latest round on the stepper. */

export const NOT_SUBMITTED = 'Not submitted';
export const GM = 'GM Approval';
export const CEO = 'CEO Approval';
export const APPROVED = 'Approved';
export const REJECTED = 'Rejected';
export const REWORK = 'Rework';
export const EDITABLE = [NOT_SUBMITTED, REWORK];

/* The tracker's workflow_state -> the screen's. */
export function appState(s) {
  const st = String(s || '').trim();
  if (!st || st === NOT_SUBMITTED || st === 'Draft') return NOT_SUBMITTED;
  if (st === 'GM Approval Waiting') return GM;
  if (st === 'CEO Approval Waiting') return CEO;
  if (/Approved and (Waiting for Verification|Verified)$/.test(st)) return APPROVED;
  if (/Rejected$/.test(st)) return REJECTED;
  if (st === 'Rework') return REWORK;
  return st;
}

export const CATS = ['Cash', 'EMI', 'Bookings', 'Gift', 'Utilities'];
/* Used until Doctor Service Master carries custom_category. */
export const CAT_OF = {
  Cash: 'Cash', cheque: 'Cash', Check: 'Cash', 'Fund Transfer': 'Cash', 'cash back activity': 'Cash',
  'EMI TAKEOVER': 'EMI', CAR: 'EMI', 'RD 2': 'EMI', 'RD 3': 'EMI', 'RD 4': 'EMI', 'Jewel Chit': 'EMI',
  'EB Bill': 'Utilities', Recharge: 'Utilities',
  cab: 'Bookings', Travel: 'Bookings', Academic: 'Bookings', Dinner: 'Bookings', 'Activity Deck': 'Bookings',
  'GIFT CARD': 'Gift', '10K Voucher': 'Gift', '50K Vocuher': 'Gift', gold: 'Gift', 'I PHONE': 'Gift',
  GADGETS: 'Gift', APPLIANCE: 'Gift', 'GC - Britrova CV, Nero PG, Chlorvix': 'Gift',
};
export const catOf = (service, category) => category || CAT_OF[service] || '';

/* SERVICE DETAILS: what a service type asks for is set on its Doctor Service
   Master (custom_capture_fields: [{key, label, multi, required}] -- EB Bill
   the EB service number, Recharge the mobile number, EMI the loan number...);
   what a service captured is stored as JSON on it (custom_service_details:
   [{key, label, values}]). The form is built from the first and fills in
   this doctor's earlier values (the options answer's `known`). */
export const cleanVals = (list) => [...new Set((list || []).map((s) => String(s ?? '').trim()).filter(Boolean))];
const asList = (raw) => {
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
export const detailsOf = (raw) => asList(raw)
  .filter((d) => d && d.key)
  .map((d) => ({ key: String(d.key), label: String(d.label || d.key), values: cleanVals(d.values) }))
  .filter((d) => d.values.length);

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WDS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const money = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
/* Always the full rupee value -- no lakh / K shorthand. */
export const cmp = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
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

/* Who acted at a step, by the step it left. */
const ROLE_AT = { [GM]: 'GM', [CEO]: 'CEO' };

/* The tracker's Workflow comments, replayed: [{ from, to, by, at }]. */
function transitions(row) {
  let prev = NOT_SUBMITTED;
  const out = [];
  for (const h of row.history || []) {
    if (h.type !== 'Workflow') continue;
    const to = appState(h.content);
    if (!to || (to === prev && to !== GM)) continue;
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
  const state = appState(row.state);
  const raw = String(row.state || '');
  // Who decided is in the tracker's state itself ("GM Approved and Verified",
  // "CEO Rejected" ...): THAT decides the stepper. The history comments only
  // add the names and times (a tracker moved outside the app has none).
  const histGm = round.find((t) => t.from === GM);
  const histCeo = round.find((t) => t.from === CEO);
  const at = row.modified || row.creation;
  const pick = (h, to) => (h && h.to === to ? { name: h.by, at: h.at, to } : { name: h ? h.by : '', at: h ? h.at : at, to });
  let gm = histGm ? { name: histGm.by, at: histGm.at, to: histGm.to } : null;
  let ceo = histCeo ? { name: histCeo.by, at: histCeo.at, to: histCeo.to } : null;
  let skipped = !!histGm && histGm.to === APPROVED;
  let stopRole = '';
  if (/^GM Approved/.test(raw)) { gm = pick(histGm, APPROVED); ceo = null; skipped = true; }
  else if (/^CEO Approved/.test(raw)) { gm = pick(histGm, CEO); ceo = pick(histCeo, APPROVED); skipped = false; }
  else if (raw === 'GM Rejected') { gm = pick(histGm, REJECTED); ceo = null; skipped = false; stopRole = 'GM'; }
  else if (raw === 'CEO Rejected') { gm = pick(histGm, CEO); ceo = pick(histCeo, REJECTED); skipped = false; stopRole = 'CEO'; }
  else if (raw === 'CEO Approval Waiting') { gm = pick(histGm, CEO); ceo = null; skipped = false; }
  else if (raw === 'GM Approval Waiting') { gm = null; ceo = null; skipped = false; }
  else if (raw === 'Rework') {
    // Sent back from the step named in the note: "Revisit (from CEO Approval Waiting): ..."
    stopRole = (/^Revisit \(from (GM|CEO) /.exec(String(row.reason || '')) || [])[1] || '';
    if (stopRole === 'CEO') { gm = pick(histGm, CEO); ceo = pick(histCeo, REWORK); }
    else if (stopRole === 'GM') { gm = pick(histGm, REWORK); ceo = null; }
    skipped = false;
  }
  return {
    id: row.name,
    tracker: row.custom_tracker || null,
    rawState: row.state || '',
    doctorId: row.doctor,
    doctorName: row.doctor_name || row.doctor,
    service: row.service_name,
    category: catOf(row.service_name, row.category),
    date: row.service_date || row.date,
    amount: Number(row.service_amount) || 0,
    remarks: row.remarks || '',
    details: detailsOf(row.custom_service_details),
    att: row.service_attachement || null,
    state,
    by: row.by,
    byName: row.by_name || row.by || '',
    byRole: gradeOf(row.role_profile) || '',
    dept: row.department || '',
    // The department the service is judged on: its seat's (the list script's
    // dept_key), which the support and visits are split by.
    deptKey: row.dept_key || row.department || '',
    hq: row.hq || '',
    enteredBy: row.entered_by_name || row.owner || '',
    created: row.creation,
    modified: row.modified,
    reason: String(row.reason || '').replace(/^Revisit \(from [^)]*\):\s*/, ''),
    waitingOn: row.waiting_on || '',
    submittedAt: lastSubmit >= 0 ? steps[lastSubmit].at : null,
    submittedBy: lastSubmit >= 0 ? steps[lastSubmit].by : null,
    resubmitted: steps.filter((t) => t.to === GM).length > 1,
    gm,
    ceo,
    skipped,
    stopRole,
    history: row.history || [],
    steps,
    doctorAvg: Number(row.doctor_avg) || 0,
    lastAt: row.modified || row.creation,
  };
}

/* Who stopped it, for a Rejected / sent-back row: { name, at, role } or null. */
export function stoppedBy(e) {
  const last = [...e.steps].reverse().find((t) => t.to === e.state);
  if (last) return { name: last.by, at: last.at, role: e.stopRole || ROLE_AT[last.from] || '' };
  // No history (moved outside the app): the state still names who.
  if (e.stopRole) {
    const step = e.stopRole === 'CEO' ? e.ceo : e.gm;
    return { name: step?.name || '', at: step?.at || e.lastAt, role: e.stopRole };
  }
  return null;
}

export function statusOf(e) {
  if (e.state === NOT_SUBMITTED) return { label: 'Not submitted', bg: '#F1F3F6', fg: '#4B5563' };
  if (e.state === GM || e.state === CEO) return { label: e.state, bg: '#EAF1FF', fg: '#1D4ED8' };
  // Who decided, as the final status says: "GM Approved", "CEO Rejected".
  if (e.state === APPROVED) return { label: `${e.skipped ? 'GM' : 'CEO'} Approved`, bg: '#E5F6EC', fg: '#15803D' };
  if (e.state === REJECTED) {
    // "GM / CEO Rejected"; an old "... Approved and Verification Rejected"
    // was rejected at verification, not by GM / CEO.
    const role = /Verification Rejected$/.test(e.rawState) ? '' : e.stopRole || stoppedBy(e)?.role || '';
    return { label: `${role ? role + ' ' : ''}Rejected`, bg: '#FDECEC', fg: '#B91C1C' };
  }
  if (e.state === REWORK) return { label: 'Sent back', bg: '#FEF3E2', fg: '#B45309' };
  return { label: e.state, bg: '#F1F3F6', fg: '#4B5563' };
}

/* The little bars on a card: one per approver step (GM, CEO). */
export function bars(e) {
  const order = e.skipped ? [GM] : [GM, CEO];
  const level = e.state === APPROVED ? order.length : order.indexOf(e.state);
  const stop = e.state === REJECTED || e.state === REWORK ? stoppedBy(e) : null;
  const stopAt = stop ? Math.max(0, order.indexOf(stop.role === 'CEO' ? CEO : GM)) : -1;
  return order.map((_, i) => {
    if (e.state === NOT_SUBMITTED) return '#DDE2E8';
    if (stop) return i < stopAt ? '#22A06B' : i === stopAt ? (e.state === REJECTED ? '#DC2626' : '#F59E0B') : '#DDE2E8';
    return i < level ? '#22A06B' : i === level ? '#2563EB' : '#DDE2E8';
  });
}

export function stageText(e) {
  if (e.state === NOT_SUBMITTED) return 'Not in approval yet';
  if (e.state === GM) return `with GM · ${wait(e.submittedAt || e.lastAt)}`;
  if (e.state === CEO) return `GM ✓ · with CEO · ${wait(e.gm?.at || e.lastAt)}`;
  if (e.state === APPROVED) return e.skipped ? `GM ✓ · final at GM · ${fD(e.gm?.at || e.lastAt)}` : `GM ✓ · CEO ✓ · ${fD(e.ceo?.at || e.lastAt)}`;
  const who = stoppedBy(e);
  // "Rajkumar (GM) · 13 Oct", or "GM · 13 Oct" when the name is not known.
  const who2 = who ? (who.name ? first(who.name) + (who.role ? ` (${who.role})` : '') : who.role) : '';
  const by = who2 ? `${who2} · ${fD(who.at)}` : '';
  if (e.state === REJECTED) return `Rejected${by ? ' by ' + by : ''}`;
  if (e.state === REWORK) return `Sent back${by ? ' by ' + by : ''} · fix and resubmit`;
  return e.state;
}

const KIND = {
  done: ['#22A06B', '#22A06B', '#15803D'],
  current: ['#fff', '#2563EB', '#1D4ED8'],
  x: ['#DC2626', '#DC2626', '#B91C1C'],
  back: ['#F59E0B', '#F59E0B', '#B45309'],
  todo: ['#fff', '#D5DAE1', '#9CA3AF'],
  skip: ['#F4F6F9', '#D5DAE1', '#9CA3AF'],
};

/* MIS -> GM -> CEO, for the detail's stepper. */
export function stepper(e) {
  const nodes = [{
    label: 'MIS',
    sub: e.submittedAt ? first(e.submittedBy || e.enteredBy) + ' · ' + fD(e.submittedAt) : 'Not submitted',
    kind: e.submittedAt ? 'done' : 'current',
  }];
  const node = (label, step, isNow) => {
    if (step) return { label, sub: (step.name ? first(step.name) + ' · ' : '') + fD(step.at), kind: step.to === REJECTED ? 'x' : step.to === REWORK ? 'back' : 'done' };
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
  e.steps.forEach((t, i) => {
    const role = ROLE_AT[t.from] || '';
    let title;
    let dot = '#22A06B';
    let note = '';
    if (t.to === GM) { title = `${i ? 'Resubmitted' : 'Submitted'} · to GM · ${t.by}`; dot = '#2563EB'; }
    else if (t.to === REJECTED) { title = `Rejected · ${t.by}${role ? ' (' + role + ')' : ''}`; dot = '#DC2626'; }
    else if (t.to === REWORK) { title = `Sent back · ${t.by} (${role})`; dot = '#F59E0B'; }
    else if (t.from === GM && t.to === APPROVED) { title = `Approved as final · ${t.by} (GM)`; note = 'CEO approval not needed'; }
    else if (t.from === GM) title = `Approved · ${t.by} (GM) · sent to CEO`;
    else if (t.from === CEO) title = `Approved · ${t.by} (CEO)`;
    else title = `${t.to} · ${t.by}`;
    out.push({ title, when: t.at, dot, note });
  });
  for (const h of e.history) {
    if (h.type === 'Comment' && h.content) out.push({ title: `Comment · ${h.by}`, when: h.at, dot: '#9CA3AF', note: h.content });
  }
  if ((e.state === REJECTED || e.state === REWORK) && e.reason) {
    const last = [...out].reverse().find((o) => o.title.startsWith('Rejected') || o.title.startsWith('Sent back'));
    if (last && !last.note) last.note = e.reason;
  }
  out.sort((a, b) => String(a.when || '').localeCompare(String(b.when || '')));
  return out.reverse().map((o, i, a) => ({ ...o, when: fDT(o.when), hasLine: i < a.length - 1 }));
}

/* The approver roles a viewer holds. A tester (or an admin) may hold both
   GM and CEO: they act at whichever step a service is on. */
export const approverRoles = (viewer) => viewer?.approvers || (viewer?.approver ? [viewer.approver] : []);
/* The role a waiting service needs: GM at the GM step, CEO at the CEO step. */
export const stepRole = (e) => (e.state === GM ? 'GM' : e.state === CEO ? 'CEO' : null);

/* Who may do what — the screen's offer; the ERP's workflow is the judge. */
export function canDecide(e, viewer) {
  const role = stepRole(e);
  return !!e.tracker && !!role && approverRoles(viewer).includes(role);
}
export const canEdit = (e, viewer) => !!viewer?.can_enter && EDITABLE.includes(e.state);

export const QUICK_REJECT = ['Amount above monthly limit', 'Duplicate request', 'Not as per service policy', 'Doctor not eligible'];
export const QUICK_REVISIT = ['Attach the bill / receipt', 'Wrong amount', 'Wrong service type', 'Wrong date'];

export const tierOf = (avg, high = 100000, mid = 25000) => (!avg
  ? ['No sales', '#FDECEC', '#B91C1C']
  : avg >= high ? ['Big doctor', '#E5F6EC', '#15803D']
    : avg >= mid ? ['Medium doctor', '#EAF1FF', '#1D4ED8']
      : ['Small doctor', '#FEF3E2', '#B45309']);
