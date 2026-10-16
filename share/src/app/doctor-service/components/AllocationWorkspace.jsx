'use client';

/* SERVICE ALLOCATION — one page, two views by who is looking (the ERP's
 * elbrit_service_allocation script says which):
 *
 *   GM / CEO   every SM and ZSM for the month: type one amount each and save;
 *              see who has split it across their departments — Not split /
 *              Partly split / Split — and how, so they know whom to chase.
 *   SM / ZSM   their own allocation for the month and their departments: type
 *              any amount per department (their call, not a fixed share) up
 *              to the allocation — over is shown red but allowed — and save.
 *              The split becomes each department's Service Budget for the
 *              month, which the service approval shows against what is used.
 *
 * Both can change a month until its 20th; then it is locked. Saving goes
 * through elbrit_service_allocation_save, which checks who is asking. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { makeAllocationSample } from '../data/allocationSample';
import { useServiceClient } from '../data/useClient';
import { fD, money, short } from '../data/workflow';
import { Icon, Toast, useToast } from './parts';
import { ensureStyles } from './styles';

const CSS = `
.dsa{display:flex;flex-direction:column;gap:14px}
.dsa-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.dsa-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.dsa-stat{flex:1 1 140px;min-width:0;border:1px solid var(--line2);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}
.dsa-stat span{font-size:11px;color:var(--mute);text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.dsa-stat b{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}
.dsa-person{border:1px solid var(--line2);border-radius:14px;overflow:hidden}
.dsa-ph{display:flex;align-items:center;gap:12px;padding:12px 14px;flex-wrap:wrap}
.dsa-name{flex:1 1 180px;min-width:0;display:flex;flex-direction:column;gap:2px}
.dsa-name b{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsa-name span{font-size:12px;color:var(--mute)}
.dsa-in{width:150px;height:38px;border:1px solid #D5DAE1;border-radius:10px;padding:0 10px;font-size:14px;font-variant-numeric:tabular-nums;text-align:right;background:#fff}
.dsa-in:disabled{background:#F4F6F9;color:var(--mute)}
.dsa-in.over{border-color:var(--red);color:var(--red)}
.dsa-pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap}
.dsa-bar{height:6px;border-radius:99px;background:#EEF1F5;overflow:hidden;display:flex}
.dsa-bar i{display:block;height:100%}
.dsa-depts{border-top:1px solid var(--line2);padding:8px 14px 12px;display:flex;flex-direction:column}
.dsa-dept{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #F2F4F7;font-size:13px}
.dsa-dept:last-child{border-bottom:0}
.dsa-dept .d{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsa-dept .v{font-variant-numeric:tabular-nums;font-weight:600}
.dsa-tabs{display:flex;gap:6px;flex-wrap:wrap}
.dsa-tab{height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:#fff;font-size:12.5px;font-weight:600;color:var(--ink3);cursor:pointer}
.dsa-tab.on{background:var(--ink);border-color:var(--ink);color:#fff}
.dsa-btn{height:40px;padding:0 18px;border-radius:11px;border:0;background:var(--blue);color:#fff;font-weight:600;font-size:14px;cursor:pointer}
.dsa-btn:disabled{background:#B9C5DA;cursor:default}
.dsa-ghost{height:32px;padding:0 10px;border-radius:9px;border:1px solid var(--line);background:#fff;font-size:12px;cursor:pointer;color:var(--ink3)}
.dsa-note{font-size:12.5px;color:var(--mute)}
.dsa-lock{font-size:12px;font-weight:600;padding:5px 10px;border-radius:999px}
.dsa-sel{height:42px;border:1px solid #E1E5EB;border-radius:12px;padding:0 12px;background:#fff;font-size:14px}
`;
let injected = false;
function ensureAllocStyles() {
  ensureStyles();
  if (injected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.setAttribute('data-dsa', '');
  el.textContent = CSS;
  document.head.appendChild(el);
  injected = true;
}

const TONE = {
  Split: ['#E5F6EC', '#15803D'],
  'Partly split': ['#FEF3E2', '#B45309'],
  'Not split': ['#FDECEC', '#B91C1C'],
  'Not allocated': ['#F1F3F6', '#4B5563'],
};
const statusOf = (p) => (p.allocation ? p.allocation.status || 'Not split' : 'Not allocated');
const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (months, key) => months.find((m) => m.key === key)?.label || key;

function Pill({ status }) {
  const [bg, fg] = TONE[status] || TONE['Not allocated'];
  return <span className="dsa-pill" style={{ background: bg, color: fg }}>{status}</span>;
}

function Bar({ split, of }) {
  const w = of > 0 ? Math.min(100, (split / of) * 100) : 0;
  const over = of > 0 && split > of;
  return (
    <div className="dsa-bar" aria-hidden="true">
      <i style={{ width: `${w}%`, background: over ? '#DC2626' : w >= 100 ? '#22A06B' : '#F59E0B' }} />
    </div>
  );
}

/* ---- GM / CEO: allocate to every SM / ZSM, and track their splits */
function GmView({ data, editable, months, month, onSave, saving }) {
  const [draft, setDraft] = useState({});
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(null);
  useEffect(() => { setDraft({}); setOpen(null); }, [month, data]);

  const people = useMemo(() => data.people || [], [data.people]);
  const counts = useMemo(() => {
    const c = { all: people.length, 'Not allocated': 0, 'Not split': 0, 'Partly split': 0, Split: 0 };
    people.forEach((p) => { c[statusOf(p)] += 1; });
    return c;
  }, [people]);
  const shown = tab === 'all' ? people
    : tab === 'pending' ? people.filter((p) => statusOf(p) !== 'Split')
      : people.filter((p) => statusOf(p) === tab);
  const totalAlloc = people.reduce((s, p) => s + (p.allocation?.amount || 0), 0);
  const totalSplit = people.reduce((s, p) => s + (p.allocation?.split_total || 0), 0);
  const changed = Object.entries(draft).filter(([eid, v]) => {
    const p = people.find((x) => x.employee === eid);
    return num(v) !== (p?.allocation?.amount || 0);
  });

  return (
    <div className="dsa-card">
      <div className="dsa-row" style={{ justifyContent: 'space-between' }}>
        <span className="dsv-eyebrow">Allocate · {monthLabel(months, month)}</span>
        <button className="dsa-btn" type="button" disabled={!editable || !changed.length || saving}
          onClick={() => onSave('allocate', changed.map(([employee, v]) => ({ employee, amount: num(v) })))}>
          {saving ? 'Saving…' : changed.length ? `Save ${changed.length} allocation${changed.length === 1 ? '' : 's'}` : 'Save'}
        </button>
      </div>
      <div className="dsa-row">
        <div className="dsa-stat"><span>Allocated</span><b>{money(totalAlloc)}</b></div>
        <div className="dsa-stat"><span>Split by SMs</span><b>{money(totalSplit)}</b></div>
        <div className="dsa-stat"><span>Fully split</span><b>{counts.Split} / {people.length}</b></div>
      </div>
      <div className="dsa-tabs" role="tablist" aria-label="Filter">
        {[['all', 'All'], ['pending', 'Not done'], ['Not allocated', 'Not allocated'], ['Not split', 'Not split'], ['Partly split', 'Partly split'], ['Split', 'Split']].map(([k, l]) => (
          <button key={k} type="button" className={`dsa-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
            {l} · {k === 'pending' ? people.length - counts.Split : counts[k]}
          </button>
        ))}
      </div>
      {shown.length === 0 ? <p className="dsa-note">No one in this list.</p> : null}
      {shown.map((p) => {
        const a = p.allocation;
        const st = statusOf(p);
        const value = draft[p.employee] ?? (a ? String(a.amount) : '');
        const isOpen = open === p.employee;
        return (
          <div key={p.employee} className="dsa-person">
            <div className="dsa-ph">
              <div className="dsa-name">
                <b>{p.name}</b>
                <span>{p.designation || 'Sales Manager'} · {p.departments.length} department{p.departments.length === 1 ? '' : 's'}</span>
              </div>
              <input className="dsa-in" inputMode="numeric" aria-label={`Allocation for ${p.name}`} placeholder="₹0"
                value={value} disabled={!editable}
                onChange={(e) => setDraft({ ...draft, [p.employee]: e.target.value })} />
              <Pill status={st} />
              <button type="button" className="dsa-ghost" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.employee)}>
                {isOpen ? 'Hide split' : 'See split'}
              </button>
            </div>
            {a ? (
              <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Bar split={a.split_total} of={a.amount} />
                <span className="dsa-note">
                  {money(a.split_total)} of {money(a.amount)} split
                  {a.split_at ? ` · last split ${fD(a.split_at)}` : ''}
                  {a.allocated_by ? ` · allocated by ${a.allocated_by}` : ''}
                </span>
              </div>
            ) : null}
            {isOpen ? (
              <div className="dsa-depts">
                {p.departments.length === 0 ? <span className="dsa-note">No departments found under this person.</span> : null}
                {p.departments.map((d) => (
                  <div key={d.department} className="dsa-dept">
                    <span className="d">{short(d.department)}</span>
                    <span className="v" style={{ color: d.amount ? 'var(--ink)' : 'var(--faint)' }}>{d.amount ? money(d.amount) : 'not split'}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ---- SM / ZSM: split their own allocation across their departments */
function SmView({ mine, editable, months, month, onSave, saving }) {
  const [draft, setDraft] = useState({});
  useEffect(() => { setDraft({}); }, [month, mine]);
  if (!mine) return null;
  const a = mine.allocation;
  const valueOf = (d) => draft[d.department] ?? (d.amount ? String(d.amount) : '');
  const total = mine.departments.reduce((s, d) => s + num(valueOf(d)), 0);
  const left = (a?.amount || 0) - total;
  const over = a && total > a.amount;
  const dirty = mine.departments.some((d) => num(valueOf(d)) !== (d.amount || 0));

  return (
    <div className="dsa-card">
      <div className="dsa-row" style={{ justifyContent: 'space-between' }}>
        <span className="dsv-eyebrow">Your split · {monthLabel(months, month)}</span>
        {a ? (
          <button className="dsa-btn" type="button" disabled={!editable || !dirty || saving}
            onClick={() => onSave('split', mine.departments.map((d) => ({ department: d.department, amount: num(valueOf(d)) })))}>
            {saving ? 'Saving…' : 'Save split'}
          </button>
        ) : null}
      </div>
      {!a ? (
        <p className="dsa-note">The GM has not allocated an amount to you for {monthLabel(months, month)} yet.</p>
      ) : (
        <>
          <div className="dsa-row">
            <div className="dsa-stat"><span>From GM</span><b>{money(a.amount)}</b></div>
            <div className="dsa-stat"><span>Split</span><b style={{ color: over ? 'var(--red)' : undefined }}>{money(total)}</b></div>
            <div className="dsa-stat"><span>{over ? 'Over by' : 'Left'}</span><b style={{ color: over ? 'var(--red)' : left === 0 ? 'var(--green)' : undefined }}>{money(Math.abs(left))}</b></div>
          </div>
          <Bar split={total} of={a.amount} />
          {over ? <p className="dsa-note" style={{ color: 'var(--red)' }}>The split is more than the allocation. You can still save it.</p> : null}
          <div className="dsa-depts" style={{ borderTop: 0, padding: 0 }}>
            {mine.departments.length === 0 ? <span className="dsa-note">No departments were found under you. Ask MIS to check your team in ERP.</span> : null}
            {mine.departments.map((d) => (
              <div key={d.department} className="dsa-dept">
                <span className="d">{short(d.department)}</span>
                <input className={`dsa-in${over ? ' over' : ''}`} inputMode="numeric" placeholder="₹0" aria-label={`Amount for ${d.department}`}
                  value={valueOf(d)} disabled={!editable}
                  onChange={(e) => setDraft({ ...draft, [d.department]: e.target.value })} />
              </div>
            ))}
          </div>
          <span className="dsa-note">
            Split it however your departments need — it does not have to be equal. It becomes each department&apos;s service budget for the month.
          </span>
        </>
      )}
    </div>
  );
}

export function AllocationWorkspace({
  gqlToken,
  gqlEnvironment = 'ERP',
  sampleData = false,
  sampleRole = 'GM',
  title = 'Service allocation',
  onBack,
  className = '',
  style,
}) {
  ensureAllocStyles();
  const sample = useMemo(() => (sampleData ? makeAllocationSample(sampleRole) : null), [sampleData, sampleRole]);
  const live = useServiceClient({ gqlToken, gqlEnvironment, sampleData: false });
  const client = sample || live.client;
  const clientErr = sample ? null : live.error;

  const [month, setMonth] = useState(thisMonth());
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [toast, show] = useToast();

  useEffect(() => {
    if (!client) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    client.allocation(month)
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((error) => alive && setState({ loading: false, error, data: null }));
    return () => { alive = false; };
  }, [client, month, attempt]);

  const save = useCallback(async (kind, rows) => {
    setSaving(true);
    try {
      await client.saveAllocation(month, kind, rows);
      show(kind === 'allocate' ? 'Allocation saved' : 'Split saved — department budgets updated');
      setAttempt((a) => a + 1);
    } catch (err) {
      show(err.message || 'Could not save', true);
    } finally {
      setSaving(false);
    }
  }, [client, month, show]);

  const data = state.data;
  const months = data?.months || [];
  const editable = !!data?.editable;
  const cutoff = data ? `${data.cutoff_day} ${monthLabel(months, month).split(' ')[0]}` : '';

  return (
    <div className={`dsv dsa ${className}`} style={style}>
      <div className="dsv-head">
        {onBack ? (
          <button type="button" className="dsv-iconbtn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dsv-eyebrow">Doctor service</div>
          <h1 className="dsv-h1">{title}</h1>
        </div>
        {months.length ? (
          <select className="dsa-sel" aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        ) : null}
      </div>

      {data ? (
        <div className="dsa-row">
          <span className="dsa-lock" style={editable ? { background: '#E5F6EC', color: '#15803D' } : { background: '#F1F3F6', color: '#4B5563' }}>
            {editable ? `Open for changes till ${cutoff}` : `Locked — changes closed after ${cutoff}`}
          </span>
        </div>
      ) : null}

      {clientErr ? <p className="dsv-err">{clientErr.message}</p> : null}
      {state.loading && !data ? <p className="dsa-note">Loading…</p> : null}
      {state.error ? (
        <p className="dsv-err">
          {state.error.message || 'Could not load the allocation.'}{' '}
          <button type="button" className="dsa-ghost" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
        </p>
      ) : null}

      {data?.viewer?.can_allocate ? (
        <GmView data={data} editable={editable} months={months} month={month} onSave={save} saving={saving} />
      ) : null}
      {data?.viewer?.is_sm ? (
        <SmView mine={data.mine} editable={editable} months={months} month={month} onSave={save} saving={saving} />
      ) : null}

      <Toast toast={toast} />
    </div>
  );
}

export const DoctorServiceAllocation = AllocationWorkspace;
