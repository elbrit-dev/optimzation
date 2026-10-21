'use client';

/* The two Doctor Service pages from the approved prototype, one component:
 *
 *   mode "entry"     SERVICES — the MIS team's services: Sent back / In
 *                    approval / Approved / Rejected / All; edit and resubmit
 *                    what was sent back — one or many at once. Status only
 *                    otherwise: no approving here.
 *   mode "approval"  SERVICE APPROVAL — GM and CEO: Awaiting you / In
 *                    approval / Approved / Rejected / All, a team strip,
 *                    group by team / on behalf of / entered by, bulk approve,
 *                    send back or reject; GM can send on to CEO or approve as
 *                    final. Every approval asks for a confirmation first.
 *
 * Both: search, Filter & sort, a list beside the detail on a wide screen
 * (detail as a bottom sheet on a narrow one), "Is this doctor worth it?" on
 * the detail, keyboard on wide screens (J/K move, X select, A approve,
 * R reject).
 *
 * WHO: from the ERP (the list script's `viewer`): IT, MIS, GM, CEO may look;
 * MIS may add / edit / resubmit and verifies; GM and CEO decide. Saving
 * submits (the Doctor Service Guard); decisions are the "Approval flow"
 * workflow's own actions on the service's Operational Tracker, as the
 * signed-in user — the ERP decides. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { each } from '../data/api';
import { useServiceClient } from '../data/useClient';
import {
  APPROVED, CEO, GM, NOT_SUBMITTED, QUICK_REJECT, QUICK_REVISIT, REJECTED, REWORK,
  approverRoles, bars, canDecide, canEdit, cmp, executed, fDY, money, normalize, short, stageText, statusOf, tierOf, wait,
} from '../data/workflow';
import { Detail } from './Detail';
import { FilterPanel } from './FilterPanel';
import { Box, Icon, Modal, Toast, useToast } from './parts';
import { ServiceForm } from './ServiceForm';
import { ensureStyles } from './styles';

const sum = (a) => a.reduce((s, e) => s + e.amount, 0);
const inFlow = (e) => e.state === GM || e.state === CEO;

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(1200);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([en]) => setW(en.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function ServiceWorkspace({
  mode = 'approval',
  gqlToken,
  gqlEnvironment = 'ERP',
  sampleData = false,
  sampleRole,
  title,
  highValue = 100000,
  midValue = 25000,
  bottomGap = '12px',
  onBack,
  onOpenDoctor,
  onFindDoctor,
  className = '',
  style,
}) {
  ensureStyles();
  const approval = mode === 'approval';
  const { client, error: clientErr } = useServiceClient({ gqlToken, gqlEnvironment, sampleData, sampleRole: sampleRole || (approval ? 'GM' : 'MIS') });
  const [ref, width] = useWidth();
  const wide = width >= 900;

  const [data, setData] = useState({ loading: true, error: null, viewer: null, setup: null, rows: [] });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  useEffect(() => {
    if (!client) return undefined;
    let live = true;
    setData((d) => ({ ...d, loading: true, error: null }));
    client.list()
      .then((r) => { if (live) setData({ loading: false, error: null, viewer: r.viewer, setup: r.setup, rows: (r.rows || []).map(normalize) }); })
      .catch((error) => { if (live) setData((d) => ({ ...d, loading: false, error })); });
    return () => { live = false; };
  }, [client, attempt]);

  const viewer = data.viewer;
  const E = data.rows;
  const [toast, showToast] = useToast();

  /* ---- reader's choices */
  const [tab, setTab] = useState(null);
  const [search, setSearch] = useState('');
  const [f, setF] = useState({ sort: null, group: null, team: [], by: [], svc: [], doc: [] });
  const [fpOpen, setFpOpen] = useState(false);
  const [sel, setSel] = useState({});
  const [focusId, setFocusId] = useState(null);
  const [sheetId, setSheetId] = useState(null);
  const [comment, setComment] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(null);

  const scope = E;
  const roles = approverRoles(viewer);
  const queue = approval && roles.length ? E.filter((e) => canDecide(e, viewer)) : [];

  const tabs = approval
    ? [
      ...(roles.length ? [['pending', 'Awaiting you', (e) => canDecide(e, viewer)]] : []),
      ['flow', 'In approval', inFlow],
      ['approved', 'Approved', (e) => e.state === APPROVED],
      ['rejected', 'Rejected', (e) => e.state === REJECTED],
      ['all', 'All', (e) => e.state !== NOT_SUBMITTED],
    ]
    : [
      ['back', 'Sent back', (e) => e.state === REWORK || e.state === NOT_SUBMITTED],
      ['flow', 'In approval', inFlow],
      // Approved = still to carry out; Executed = its MIS ToDo is closed.
      ['approved', 'Approved', (e) => e.state === APPROVED && !executed(e)],
      ['executed', 'Executed', executed],
      ['rejected', 'Rejected', (e) => e.state === REJECTED],
      ['all', 'All', () => true],
    ];
  const defaultTab = approval
    ? (roles.length ? 'pending' : 'flow')
    : E.some((e) => e.state === REWORK || e.state === NOT_SUBMITTED) ? 'back' : 'all';
  const tabKey = tabs.some((t) => t[0] === tab) ? tab : defaultTab;
  const tabFn = (k) => (tabs.find((t) => t[0] === k) || tabs[0])[2];

  const sortOpts = approval
    ? [['wait', 'Oldest waiting first'], ['roi', 'Biggest doctors first'], ['amount', 'Amount — high to low'], ['amountAsc', 'Amount — low to high'], ['date', 'Service date — newest'], ['doctor', 'Doctor — A to Z']]
    : [['recent', 'Most recent'], ['amount', 'Amount — high to low'], ['amountAsc', 'Amount — low to high'], ['date', 'Service date — newest'], ['doctor', 'Doctor — A to Z']];
  const groupOpts = approval
    ? [['team', 'Team'], ['by', 'On behalf of'], ['enteredBy', 'Entered by'], ['none', 'No grouping']]
    : [['none', 'No grouping'], ['by', 'On behalf of']];
  const sortKey = sortOpts.some((o) => o[0] === f.sort) ? f.sort : sortOpts[0][0];
  const groupKey = groupOpts.some((o) => o[0] === f.group) ? f.group : groupOpts[0][0];
  const sorters = {
    recent: (a, b) => String(b.lastAt).localeCompare(String(a.lastAt)),
    wait: (a, b) => String(a.lastAt).localeCompare(String(b.lastAt)),
    roi: (a, b) => b.doctorAvg - a.doctorAvg,
    amount: (a, b) => b.amount - a.amount,
    amountAsc: (a, b) => a.amount - b.amount,
    date: (a, b) => String(b.date).localeCompare(String(a.date)),
    doctor: (a, b) => a.doctorName.localeCompare(b.doctorName),
  };
  const match = (e) => !search || [e.doctorName, e.doctorId, e.service, e.remarks, e.byName, e.enteredBy, e.dept, e.hq, e.id].join(' ').toLowerCase().includes(search.toLowerCase());
  const listFor = (p) => scope.filter(tabFn(p.tab)).filter(match)
    .filter((e) => (!p.team.length || p.team.includes(e.dept)) && (!p.by.length || p.by.includes(e.by)) && (!p.svc.length || p.svc.includes(e.service)) && (!p.doc.length || p.doc.includes(e.doctorId)))
    .sort(sorters[sortOpts.some((o) => o[0] === p.sort) ? p.sort : sortOpts[0][0]]);
  const applied = { ...f, tab: tabKey, sort: sortKey, group: groupKey };
  const flat = listFor(applied);

  const gInfo = (g, e) => (g === 'team'
    ? { k: e.dept, label: short(e.dept) || 'No department', sub: e.hq }
    : g === 'by' ? { k: e.by, label: e.byName, sub: `${e.byRole} · ${short(e.dept)}` }
      : { k: e.enteredBy, label: e.enteredBy, sub: 'MIS' });
  let groups = [];
  if (groupKey !== 'none') {
    const m = new Map();
    flat.forEach((e) => { const gi = gInfo(groupKey, e); if (!m.has(gi.k)) m.set(gi.k, { ...gi, items: [] }); m.get(gi.k).items.push(e); });
    groups = [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
    // A team spans HQs: name them all, not the first card's.
    if (groupKey === 'team') groups.forEach((g) => { g.sub = [...new Set(g.items.map((e) => e.hq).filter(Boolean))].join(', '); });
  }
  const items = groupKey === 'none' ? flat : groups.flatMap((g) => g.items);

  const selectable = (e) => (approval ? tabKey === 'pending' && canDecide(e, viewer)
    : canEdit(e, viewer));
  const selIds = items.filter(selectable).map((e) => e.id);
  const chosen = items.filter((e) => sel[e.id] && selIds.includes(e.id));
  const allSel = selIds.length > 0 && selIds.every((id) => sel[id]);

  const focus = wide ? items.find((e) => e.id === focusId) || items[0] || null : null;
  const sheet = !wide && sheetId ? E.find((e) => e.id === sheetId) : null;
  const shown = focus || sheet;

  /* ---- insight for the shown row, cached by doctor */
  const cache = useRef(new Map());
  const [ins, setIns] = useState({ key: null, data: null, loading: false });
  useEffect(() => {
    if (!client || !shown) return undefined;
    const key = shown.doctorId + '|' + shown.id;
    if (cache.current.has(key)) { setIns({ key, data: cache.current.get(key), loading: false }); return undefined; }
    let live = true;
    setIns({ key, data: null, loading: true });
    client.insight(shown.doctorId, shown.id)
      .then((x) => { cache.current.set(key, x); if (live) setIns({ key, data: x, loading: false }); })
      .catch(() => { if (live) setIns({ key, data: null, loading: false }); });
    return () => { live = false; };
  }, [client, shown?.doctorId, shown?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- writes */
  const after = async (results, okMsg, verbFail) => {
    const bad = results.filter((r) => !r.ok);
    cache.current.clear();
    setSel({});
    reload();
    if (!bad.length) showToast(okMsg);
    else showToast(`${results.length - bad.length} done · ${bad.length} ${verbFail}: ${bad[0].error}`, true);
  };
  const nextFocus = (removed) => {
    const ids = items.map((e) => e.id);
    const cur = focus?.id;
    if (!removed.includes(cur)) return cur;
    const rest = ids.filter((id) => !removed.includes(id));
    const i = Math.max(0, ids.indexOf(cur));
    return rest.length ? rest[Math.min(i, rest.length - 1)] : null;
  };
  /* A sent-back service: saving it again resubmits it (the guard). */
  async function submit(ids) {
    setBusy('submit');
    const res = await each(ids, (n) => client.resubmit(n));
    setBusy(null);
    setFocusId(nextFocus(ids));
    if (sheet && ids.includes(sheet.id)) setSheetId(null);
    after(res, ids.length === 1 ? `${E.find((e) => e.id === ids[0])?.doctorName} resubmitted · now with GM` : `${ids.length} resubmitted · now with GM`, 'not resubmitted');
  }
  /* kind: approve (GM, on to CEO) | final (GM as final; CEO approves) |
     reject | revisit (send back). The note is the
     reason for reject / send back, else a comment on the service. */
  const NEEDS_REASON = ['reject', 'revisit'];
  async function decide(ids, kind, note) {
    setBusy(kind);
    const rowOf = (id) => E.find((e) => e.id === id);
    const reasoned = NEEDS_REASON.includes(kind);
    // "approve" is the step's own approval: on to CEO at the GM step, the
    // final approval at the CEO step.
    const kindFor = (row) => (kind === 'approve' && row?.state === CEO ? 'final' : kind);
    const allGm = ids.every((id) => rowOf(id)?.state === GM);
    const res = await each(ids, async (n) => {
      const row = rowOf(n);
      // THE CEO'S APPROVE (kind "ceo") is always the CEO's final approval. At
      // the GM step it first passes the GM step (the CEO holds GM too), so the
      // service ends "CEO Approved and Verified", in the CEO's name — never a
      // GM approval taken by the CEO, and never "Send to CEO" from the CEO.
      if (kind === 'ceo') {
        if (row?.state === GM) await client.decide(row?.tracker, 'approve', '');
        await client.decide(row?.tracker, 'final', '');
      } else {
        await client.decide(row?.tracker, kindFor(row), reasoned ? note : '');
      }
      if (note && !reasoned) await client.comment(n, note).catch(() => {});
    });
    setBusy(null);
    setComment('');
    setModal(null);
    setFocusId(nextFocus(ids));
    if (sheet && ids.includes(sheet.id)) setSheetId(null);
    const one = ids.length === 1 ? E.find((e) => e.id === ids[0]) : null;
    const label = one ? one.doctorName : `${ids.length} services`;
    const msg = {
      reject: `Rejected ${label}`,
      revisit: `Sent ${label} back to the MIS team`,
      approve: allGm ? `Sent ${label} to CEO` : `Approved ${label}`,
      final: allGm ? `Approved ${label} as final · CEO not needed` : `Approved ${label}`,
      ceo: `Approved ${label}`,
    }[kind];
    const fail = { reject: 'not rejected', revisit: 'not sent back' }[kind] || 'not approved';
    after(res, msg, fail);
  }
  // The CEO (role) always approves as the CEO: Approve / Send back / Reject.
  const isCeo = approverRoles(viewer).includes('CEO');
  const approveKind = () => (isCeo ? 'ceo' : 'approve');
  /* Every approval asks first: approve (GM: send to CEO; CEO: approve) and
     approve as final. */
  const confirmApprove = (ids, kind, note) => setModal({ kind: 'confirm', action: kind, ids, note: note || '' });

  /* ---- keyboard (wide only) */
  const keys = useRef({});
  keys.current = { items, focus, selectable, decideable: approval && focus && canDecide(focus, viewer), comment, busy, open: !!(modal || form || fpOpen) };
  useEffect(() => {
    if (!wide) return undefined;
    const k = (ev) => {
      const t = ev.target;
      const s = keys.current;
      if ((t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) || ev.metaKey || ev.ctrlKey || ev.altKey || s.open || s.busy) return;
      const ids = s.items.map((e) => e.id);
      if (!ids.length) return;
      const i = Math.max(0, ids.indexOf(s.focus?.id));
      const key = ev.key.toLowerCase();
      if (key === 'j' || ev.key === 'ArrowDown') { ev.preventDefault(); setFocusId(ids[Math.min(ids.length - 1, i + 1)]); setComment(''); }
      else if (key === 'k' || ev.key === 'ArrowUp') { ev.preventDefault(); setFocusId(ids[Math.max(0, i - 1)]); setComment(''); }
      else if (key === 'x' && s.focus && s.selectable(s.focus)) setSel((p) => { const n = { ...p }; if (n[s.focus.id]) delete n[s.focus.id]; else n[s.focus.id] = true; return n; });
      else if (key === 'a' && s.decideable) confirmApprove([s.focus.id], approveKind(), s.comment.trim());
      else if (key === 'r' && s.decideable) setModal({ kind: 'reject', ids: [s.focus.id], note: s.comment });
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the focused card in view as J/K move it.
  const listRef = useRef(null);
  useEffect(() => {
    const c = listRef.current;
    const el = c && focus && c.querySelector(`[data-row="${CSS.escape(focus.id)}"]`);
    if (!el || c.scrollHeight <= c.clientHeight) return;
    const top = el.offsetTop;
    const bot = top + el.offsetHeight;
    if (top < c.scrollTop) c.scrollTop = top - 6;
    else if (bot > c.scrollTop + c.clientHeight) c.scrollTop = bot - c.clientHeight + 6;
  }, [focus?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- header pieces */
  const heading = title || (approval ? 'Service approval' : 'Services');
  const eyebrow = viewer
    ? approval
      ? roles.length ? `${roles.join(' & ')} Approval · ${viewer.employee_name}` : `Doctor Service · ${viewer.employee_name}`
      : `${viewer.employee_name} · MIS`
    : 'Doctor Service';
  const headStats = approval && wide && roles.length
    ? [[String(queue.length), 'awaiting', queue.length ? '#DC2626' : '#111827'], [money(sum(queue)), 'value', '#111827'], [queue.length ? wait([...queue].sort(sorters.wait)[0].lastAt) : '—', 'oldest', '#111827']]
    : [];

  /* team strip (approval): departments in the current tab */
  let teams = [];
  if (approval) {
    const pool = scope.filter(tabFn(tabKey)).filter(match);
    const m = new Map();
    pool.forEach((e) => { if (!m.has(e.dept)) m.set(e.dept, { k: e.dept, n: 0, v: 0, hq: new Set() }); const g = m.get(e.dept); g.n += 1; g.v += e.amount; g.hq.add(e.hq); });
    if (m.size > 1) {
      teams = [{ k: '', label: 'All teams', sub: `${m.size} teams`, n: pool.length, v: sum(pool), on: !f.team.length }]
        .concat([...m.values()].sort((a, b) => b.n - a.n).map((g) => ({ k: g.k, label: short(g.k) || 'No department', sub: [...g.hq].join(', '), n: g.n, v: g.v, on: f.team.length === 1 && f.team[0] === g.k })));
    }
  }

  const chips = [
    ...f.team.map((v) => ['Team', short(v), () => setF({ ...f, team: f.team.filter((x) => x !== v) })]),
    ...f.by.map((v) => ['For', E.find((e) => e.by === v)?.byName || v, () => setF({ ...f, by: f.by.filter((x) => x !== v) })]),
    ...f.svc.map((v) => ['Service', v, () => setF({ ...f, svc: f.svc.filter((x) => x !== v) })]),
    ...f.doc.map((v) => ['Doctor', E.find((e) => e.doctorId === v)?.doctorName || v, () => setF({ ...f, doc: f.doc.filter((x) => x !== v) })]),
  ];
  const activeN = f.team.length + f.by.length + f.svc.length + f.doc.length + (sortKey !== sortOpts[0][0] ? 1 : 0) + (groupKey !== groupOpts[0][0] ? 1 : 0);
  const filtersOn = !!(chips.length || search);

  /* filter panel sections */
  const counted = (pool, fn) => { const m = {}; pool.forEach((e) => { const k = fn(e); m[k] = (m[k] || 0) + 1; }); return m; };
  const uniq = (fn) => [...new Set(scope.map(fn))].filter(Boolean);
  const sections = [
    { key: 'sort', label: 'Sort by', reset: sortOpts[0][0], options: () => sortOpts.map(([v, l]) => ({ value: v, label: l })) },
    ...(groupOpts.length > 1 ? [{ key: 'group', label: 'Group by', reset: groupOpts[0][0], options: () => groupOpts.map(([v, l]) => ({ value: v, label: l })) }] : []),
    { key: 'tab', label: 'Status', reset: defaultTab, options: (d) => tabs.map(([v, l]) => ({ value: v, label: l, count: listFor({ ...d, tab: v }).length })) },
    ...(approval ? [{ key: 'team', label: 'Team', multi: true, options: (d) => { const c = counted(scope.filter(tabFn(d.tab)), (e) => e.dept); return uniq((e) => e.dept).sort().map((v) => ({ value: v, label: short(v), count: c[v] || 0 })); } }] : []),
    { key: 'by', label: 'On behalf of', multi: true, options: (d) => { const c = counted(scope.filter(tabFn(d.tab)), (e) => e.by); return uniq((e) => e.by).map((v) => { const x = E.find((e) => e.by === v); return { value: v, label: x.byName, sub: `${x.byRole} · ${short(x.dept)}`, count: c[v] || 0 }; }).sort((a, b) => a.label.localeCompare(b.label)); } },
    { key: 'svc', label: 'Service', multi: true, options: (d) => { const c = counted(scope.filter(tabFn(d.tab)), (e) => e.service); return uniq((e) => e.service).sort((a, b) => (c[b] || 0) - (c[a] || 0) || a.localeCompare(b)).map((v) => ({ value: v, label: v, count: c[v] || 0 })); } },
    { key: 'doc', label: 'Doctor', multi: true, search: 'Search doctor', options: (d) => { const c = counted(scope.filter(tabFn(d.tab)), (e) => e.doctorId); return uniq((e) => e.doctorId).map((v) => { const x = E.find((e) => e.doctorId === v); return { value: v, label: x.doctorName, sub: v, count: c[v] || 0 }; }).sort((a, b) => a.label.localeCompare(b.label)); } },
  ];

  const empty = (() => {
    if (filtersOn) return ['No services match', 'Remove a filter or change the search.', false];
    if (approval) {
      if (tabKey === 'pending') return ['You’re all caught up', roles.includes('GM') ? 'Services reach you when the MIS team submits them.' : 'Services reach you once GM sends them on.', false];
      return ['No services in this tab', 'Services from every team show here by stage.', false];
    }
    return ({
      back: ['Nothing sent back', 'Services GM or CEO send back for a fix show here.', true],
      flow: ['Nothing in approval', 'Add a service from a doctor page — it goes straight to GM.', true],
      approved: ['No approvals yet', 'Services appear here once they are approved.', false],
      rejected: ['Nothing rejected', 'Rejected services and the reason show here.', false],
      all: ['No services yet', 'Open a doctor and tap Add service — the doctor is filled in for you.', true],
    })[tabKey] || ['', '', false];
  })();

  const bulkLabel = `${chosen.length} selected · ${money(sum(chosen))}${approval && new Set(chosen.map((e) => e.dept)).size > 1 ? ` · ${new Set(chosen.map((e) => e.dept)).size} teams` : ''}`;
  const findDoctor = () => (onFindDoctor ? onFindDoctor() : (typeof window !== 'undefined' ? (window.location.href = '/doctor') : null));

  /* ---- render */
  const card = (e) => {
    const st = statusOf(e);
    const s = selectable(e);
    const c = !!sel[e.id] && s;
    const fo = wide && focus?.id === e.id;
    const tier = approval ? tierOf(e.doctorAvg, highValue, midValue) : null;
    return (
      <div key={e.id} data-row={e.id} className={'dsv-card' + (fo ? ' focus' : c ? ' sel' : '')}
        onClick={() => { if (wide) { setFocusId(e.id); setComment(''); } else setSheetId(e.id); }}>
        {s ? (
          <button type="button" className="cb" aria-label={`Select ${e.doctorName}`} onClick={(ev) => { ev.stopPropagation(); setSel((p) => { const n = { ...p }; if (n[e.id]) delete n[e.id]; else n[e.id] = true; return n; }); }}>
            <Box on={c} />
          </button>
        ) : null}
        <div className="body">
          <div className="r1"><span className="doc">{e.doctorName}</span><span className="amt">{money(e.amount)}</span></div>
          <div className="r2">
            <span className="dsv-svc">{e.service}</span>
            <span style={{ whiteSpace: 'nowrap' }}>{fDY(e.date)}</span>
            <span className="who">for {e.byName}{e.byRole ? ' · ' + e.byRole : ''}{groupKey === 'team' ? '' : ' · ' + short(e.dept)}</span>
            {e.att ? <span aria-label="Has attachment" style={{ display: 'flex' }}><Icon name="clip" size={13} color="#6B7280" /></span> : null}
          </div>
          <div className="r3">
            <span className="dsv-pill" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
            {tier ? <span className="dsv-pill dsv-tier" style={{ background: tier[1], color: tier[2] }}>{e.doctorAvg ? `Sales ${cmp(e.doctorAvg)}/mo` : tier[0]}</span> : null}
            <span className="dsv-bars" aria-hidden="true">{bars(e).map((b, i) => <span key={i} style={{ background: b }} />)}</span>
            <span className="dsv-stage">{stageText(e)}</span>
          </div>
        </div>
      </div>
    );
  };

  const rows = groupKey === 'none' ? items.map(card) : groups.flatMap((g) => {
    const ids = g.items.filter(selectable).map((e) => e.id);
    const all = ids.length > 0 && ids.every((id) => sel[id]);
    return [
      <div key={'g' + g.k} className="dsv-group">
        {ids.length ? (
          <button type="button" className="dsv-cb" style={{ width: 32, height: 32, margin: '-6px -4px -6px -2px' }} aria-label="Select group"
            onClick={() => setSel((p) => { const n = { ...p }; ids.forEach((id) => { if (all) delete n[id]; else n[id] = true; }); return n; })}>
            <Box on={all} small />
          </button>
        ) : null}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}><span className="gl">{g.label}</span><span className="gs">{g.sub}</span></div>
        <span className="rule" />
        <span className="gt">{g.items.length} · {money(sum(g.items))}</span>
      </div>,
      ...g.items.map(card),
    ];
  });

  const idx = shown ? items.findIndex((e) => e.id === shown.id) : -1;
  const pos = idx >= 0 ? {
    idx, total: items.length,
    onPrev: () => { const n = items[(idx - 1 + items.length) % items.length]; if (wide) setFocusId(n.id); else setSheetId(n.id); setComment(''); },
    onNext: () => { const n = items[(idx + 1) % items.length]; if (wide) setFocusId(n.id); else setSheetId(n.id); setComment(''); },
  } : null;

  const detail = shown ? (
    <Detail
      e={shown}
      viewer={viewer}
      sheet={!wide}
      pos={pos}
      insight={ins.key === shown.doctorId + '|' + shown.id ? ins.data : null}
      insightLoading={ins.loading}
      comment={comment}
      setComment={setComment}
      busy={busy}
      fileUrl={client?.fileUrl}
      onClose={() => setSheetId(null)}
      onOpenDoctor={onOpenDoctor}
      mayDecide={approval}
      mayEnter={!approval}
      onEdit={() => setForm({ entry: shown })}
      onResubmit={() => submit([shown.id])}
      onApprove={() => confirmApprove([shown.id], 'approve', comment.trim())}
      onFinal={() => confirmApprove([shown.id], 'final', comment.trim())}
      onCeoApprove={() => confirmApprove([shown.id], 'ceo', comment.trim())}
      onReject={() => setModal({ kind: 'reject', ids: [shown.id], note: comment })}
      onRevisit={() => setModal({ kind: 'revisit', ids: [shown.id], note: comment })}
    />
  ) : null;

  const err = clientErr || data.error;
  return (
    <div ref={ref} className={'dsv dsv-page' + (wide ? ' dsv-wide' : ' dsv-narrow') + (className ? ' ' + className : '')} style={style}>
      <div className="dsv-head">
        {onBack ? <button type="button" className="dsv-iconbtn" onClick={onBack} aria-label="Back"><Icon name="back" size={20} /></button> : null}
        <div style={{ flex: 1, minWidth: 170, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="dsv-eyebrow">{eyebrow}</span>
          <h1 className="dsv-h1">{heading}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {headStats.map(([v, l, c]) => <div key={l} className="dsv-headstat"><b style={{ color: c }}>{v}</b>{l}</div>)}
        </div>
      </div>

      {err ? <div className="dsv-err" role="alert"><span>{err.message || String(err)}</span><button type="button" onClick={reload}>Retry</button></div> : null}
      {data.setup?.missing?.includes('custom_via_app') ? (
        <div className="dsv-note">ERP setup pending: Doctor Service needs the custom fields from the setup spec (custom_via_app first). Nothing can be listed until then.</div>
      ) : null}
      {viewer && !viewer.can_view ? <div className="dsv-note">Doctor services are open to IT, the MIS team, GM and CEO only.</div> : null}

      <div className="dsv-tabs" role="tablist" aria-label="Status">
        {tabs.map(([k, l]) => {
          const n = listFor({ ...applied, tab: k }).length;
          const on = k === tabKey;
          return (
            <button key={k} type="button" role="tab" aria-selected={on} className={'dsv-tab' + (on ? ' on' : '')} onClick={() => { setTab(k); setFocusId(null); setSel({}); }}>
              {l}<span className={'dsv-count' + (k === 'pending' && n ? ' hot' : '')}>{n}</span>
            </button>
          );
        })}
      </div>

      {teams.length ? (
        <div className="dsv-strip">
          {teams.map((t) => (
            <button key={t.k || 'all'} type="button" className={'dsv-team' + (t.on ? ' on' : '')} onClick={() => { setF({ ...f, team: t.k && !t.on ? [t.k] : [] }); setFocusId(null); setSel({}); }}>
              <span className="t">{t.label}</span>
              <span className="s">{t.sub}</span>
              <span className="v"><b style={{ color: t.n ? '#111827' : '#9CA3AF' }}>{t.n}</b><span>{money(t.v)}</span></span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="dsv-tools">
        <div className="dsv-searchrow">
          <label className="dsv-search">
            <Icon name="search" size={18} color="#6B7280" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setFocusId(null); }} placeholder="Search doctor, service, remarks" aria-label="Search" />
            {search ? <button type="button" className="dsv-x" onClick={() => setSearch('')} aria-label="Clear search"><Icon name="x" size={12} color="#4B5563" width={3} /></button> : null}
          </label>
          <button type="button" className="dsv-filterbtn" onClick={() => setFpOpen(true)} aria-label="Filter and sort">
            <Icon name="filter" size={18} />{wide ? 'Filter & sort' : 'Filter'}
            {activeN ? <span className="dsv-badge">{activeN}</span> : null}
          </button>
        </div>
        {filtersOn ? (
          <div className="dsv-chips">
            {chips.map(([k, v, rm]) => (
              <button key={k + v} type="button" className="dsv-chip" onClick={rm}><span className="k">{k}</span>{v}<Icon name="x" size={12} color="#1D4ED8" width={3} /></button>
            ))}
            <button type="button" className="dsv-clear" onClick={() => { setSearch(''); setF({ sort: f.sort, group: f.group, team: [], by: [], svc: [], doc: [] }); }}>Clear all</button>
          </div>
        ) : null}
      </div>

      <div className="dsv-split">
        <div className="dsv-listpane">
          <div className="dsv-listhead">
            {selIds.length ? (
              <>
                <button type="button" className="dsv-cb" aria-label="Select all" onClick={() => setSel(allSel ? {} : Object.fromEntries(selIds.map((id) => [id, true])))}><Box on={allSel} /></button>
                <span style={{ fontWeight: 500 }}>{chosen.length ? `${chosen.length} of ${selIds.length} selected` : `Select all (${selIds.length})`}</span>
              </>
            ) : null}
            <span style={{ flex: 1 }} />
            <span className="sum">{(tabs.find((t) => t[0] === tabKey) || tabs[0])[1]} · {items.length} · {money(sum(items))}</span>
          </div>

          <div ref={listRef} className="dsv-list">
            {data.loading && !E.length ? [0, 1, 2, 3].map((i) => <div key={i} className="dsv-card" style={{ cursor: 'default' }}><div className="body"><div className="dsv-skel" style={{ width: '60%' }} /><div className="dsv-skel" style={{ width: '80%' }} /><div className="dsv-skel" style={{ width: '40%' }} /></div></div>) : rows}
            {!data.loading && !items.length && !err ? (
              <div className="dsv-empty">
                <span className="ic"><Icon name="check" size={24} color="#2563EB" width={1.8} /></span>
                <span className="t">{empty[0]}</span>
                <span className="s">{empty[1]}</span>
                {empty[2] && viewer?.can_enter ? <button type="button" onClick={findDoctor}>Find a doctor</button> : null}
              </div>
            ) : null}
          </div>

          {chosen.length ? (
            <div className="dsv-bulk" style={{ bottom: bottomGap }}>
              <span className="lab">{bulkLabel}</span>
              <button type="button" className="ghost" onClick={() => setSel({})}>Clear</button>
              {approval ? (
                <button type="button" className="rej" disabled={!!busy} onClick={() => setModal({ kind: 'reject', ids: chosen.map((e) => e.id), note: '' })}>Reject</button>
              ) : null}
              {approval ? <button type="button" className="ghost" disabled={!!busy} onClick={() => setModal({ kind: 'revisit', ids: chosen.map((e) => e.id), note: '' })}>Send back</button> : null}
              {approval && !isCeo && chosen.every((e) => e.state === GM) ? <button type="button" className="fin" disabled={!!busy} onClick={() => confirmApprove(chosen.map((e) => e.id), 'final', '')}>Approve as final</button> : null}
              <button type="button" className="pri" disabled={!!busy}
                onClick={() => (approval ? confirmApprove(chosen.map((e) => e.id), approveKind(), '') : submit(chosen.map((e) => e.id)))}>
                {busy ? 'Working…' : approval ? (!isCeo && chosen.every((e) => e.state === GM) ? `Send ${chosen.length} to CEO` : `Approve ${chosen.length}`) : `Resubmit ${chosen.length}`}
              </button>
            </div>
          ) : null}
          {wide && items.length ? (
            <div className="dsv-kbd">
              <span><i>J</i><i>K</i>move</span>
              {selIds.length ? <span><i>X</i>select</span> : null}
              {approval && focus && canDecide(focus, viewer) ? <><span><i>A</i>approve</span><span><i>R</i>reject</span></> : null}
            </div>
          ) : null}
        </div>

        {wide ? (
          <div className="dsv-detailwrap">
            {detail || (
              <div className="dsv-detail"><div className="dsv-nodetail"><b>Nothing selected</b><span>Pick a service from the list to see its details here.</span></div></div>
            )}
          </div>
        ) : detail}
      </div>

      {fpOpen ? (
        <FilterPanel
          sections={sections}
          initial={applied}
          countFor={(d) => listFor(d).length}
          onClose={() => setFpOpen(false)}
          onApply={(d) => { setTab(d.tab); setF({ sort: d.sort, group: d.group, team: d.team, by: d.by, svc: d.svc, doc: d.doc }); setFpOpen(false); setFocusId(null); setSel({}); }}
        />
      ) : null}

      {modal && REASON_MODAL[modal.kind] ? (() => {
        const m = REASON_MODAL[modal.kind];
        return (
          <Modal
            title={m.title + (modal.ids.length > 1 ? ` · ${modal.ids.length}` : '')}
            desc={m.desc}
            confirm={m.confirm}
            danger={m.danger}
            busy={busy === (modal.kind === 'revisit' ? 'revisit' : 'reject')}
            onClose={() => setModal(null)}
            onConfirm={() => {
              if (String(modal.note || '').trim().length < 3) { setModal({ ...modal, error: 'Add a short reason — the MIS team sees this.' }); return; }
              decide(modal.ids, modal.kind, modal.note.trim());
            }}
          >
            <div className="q">{m.quick.map((t) => <button key={t} type="button" onClick={() => setModal({ ...modal, note: t, error: '' })}>{t}</button>)}</div>
            <textarea className="dsv-ta" rows={3} value={modal.note || ''} onChange={(e) => setModal({ ...modal, note: e.target.value, error: '' })} placeholder={m.placeholder} aria-label="Reason" style={modal.error ? { borderColor: '#E5484D' } : undefined} />
            {modal.error ? <span role="alert" style={{ fontSize: 12, color: '#DC2626', marginTop: -6 }}>{modal.error}</span> : null}
          </Modal>
        );
      })() : null}

      {modal?.kind === 'confirm' ? (() => {
        const rows = modal.ids.map((id) => E.find((e) => e.id === id)).filter(Boolean);
        const one = rows.length === 1 ? rows[0] : null;
        const atGm = rows.every((e) => e.state === GM);
        // The final approval — GM "Approve as final", or the CEO's approve —
        // ends it and hands it to MIS to carry out: "Ready to execute?".
        // Send to CEO is only a step on.
        const isFinal = !(atGm && modal.action === 'approve');
        const asCeo = modal.action === 'ceo';
        const what = one ? `${one.doctorName} · ${one.service} · ${money(one.amount)}` : `${rows.length} services · ${money(sum(rows))}`;
        const by = asCeo ? 'CEO' : atGm ? 'GM' : 'CEO';
        const title = isFinal ? 'Ready to execute?' : 'Send to CEO?';
        const desc = isFinal
          ? `${what}. This is the final approval (${by} Approved and Verified)${atGm && !asCeo ? ' — CEO approval is not needed' : ''}. The MIS team then carries it out.`
          : `${what}. It goes on to the CEO for the final approval.`;
        return (
          <Modal
            title={title}
            desc={desc}
            confirm={isFinal ? 'Execute' : 'Send to CEO'}
            busy={busy === 'approve' || busy === 'final'}
            onClose={() => setModal(null)}
            onConfirm={() => decide(modal.ids, modal.action, modal.note)}
          />
        );
      })() : null}
      {form ? (
        <ServiceForm
          client={client}
          doctor={{ id: form.entry.doctorId, name: form.entry.doctorName }}
          entry={form.entry}
          viewer={viewer}
          onClose={() => setForm(null)}
          onSaved={(r) => { setForm(null); cache.current.clear(); reload(); if (!r.quiet) showToast(r.message); }}
        />
      ) : null}
      <Toast toast={toast} />
    </div>
  );
}

/* The three decisions that need a reason. */
const REASON_MODAL = {
  reject: {
    title: 'Reject service', confirm: 'Reject', danger: true, quick: QUICK_REJECT, placeholder: 'Reason for rejection',
    desc: 'Moves it to Rejected — final. The MIS team sees the reason. To have it fixed instead, send it back.',
  },
  revisit: {
    title: 'Send back to MIS', confirm: 'Send back', danger: false, quick: QUICK_REVISIT, placeholder: 'What needs fixing',
    desc: 'The MIS team fixes it and resubmits; it comes back to GM.',
  },
};

export function DoctorServiceEntry(props) {
  return <ServiceWorkspace {...props} mode="entry" />;
}
export function DoctorServiceApproval(props) {
  return <ServiceWorkspace {...props} mode="approval" />;
}

export default ServiceWorkspace;
