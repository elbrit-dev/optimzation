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
 * Both can change a month until its 20th; then it is locked.
 *
 * NEED MORE? An SM / ZSM can ask the GM for more any time in the month (one
 * request waiting at a time). The GM / CEO / IT approve the amount asked or a
 * revised one — it is added to the allocation — or reject, with a note. An
 * approval after the 20th reopens that SM's split so they can split the extra.
 *
 * Saving goes through elbrit_service_allocation_save, which checks who is
 * asking. */

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
.dsa-ask{border:1px solid #F5D9A8;background:#FFFAF0;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.dsa-ask p{margin:0;font-size:13px;color:var(--ink2)}
.dsa-ask .why{color:var(--ink3);font-size:12.5px;white-space:pre-wrap;overflow-wrap:anywhere}
.dsa-txt{width:100%;min-height:64px;border:1px solid #D5DAE1;border-radius:10px;padding:8px 10px;font:inherit;font-size:14px;resize:vertical;box-sizing:border-box}
.dsa-line{flex:1 1 160px;min-width:0;height:38px;border:1px solid #D5DAE1;border-radius:10px;padding:0 10px;font-size:14px;box-sizing:border-box}
.dsa-ok{height:36px;padding:0 14px;border-radius:10px;border:0;background:#15803D;color:#fff;font-weight:600;font-size:13px;cursor:pointer}
.dsa-no{height:36px;padding:0 14px;border-radius:10px;border:1px solid #F3C2C2;background:#fff;color:#B91C1C;font-weight:600;font-size:13px;cursor:pointer}
.dsa-ok:disabled,.dsa-no:disabled{opacity:.5;cursor:default}
.dsa-hist{display:flex;flex-direction:column}
.dsa-hrow{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid #F2F4F7;font-size:12.5px}
.dsa-hrow:last-child{border-bottom:0}
.dsa-hrow .t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;color:var(--ink3);overflow-wrap:anywhere}
.dsa-hrow .t b{color:var(--ink);font-weight:600}
@media (max-width:520px){.dsa-in{width:120px}}
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
  Pending: ['#FEF3E2', '#B45309'],
  Approved: ['#E5F6EC', '#15803D'],
  Rejected: ['#FDECEC', '#B91C1C'],
};
const pendingOf = (p) => (p?.requests || []).find((r) => r.status === 'Pending') || null;
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

/* Requests for more, newest first: what was asked, why, and what the GM did. */
function RequestHistory({ requests }) {
  if (!requests?.length) return null;
  return (
    <div className="dsa-hist">
      {requests.map((r) => (
        <div key={r.name} className="dsa-hrow">
          <div className="t">
            <span>
              <b>{money(r.amount_requested)}</b> asked {fD(r.requested_at)}
              {r.status === 'Approved' ? <> · <b style={{ color: '#15803D' }}>{money(r.amount_approved)}</b> approved</> : null}
              {r.decided_by ? ` by ${r.decided_by}` : ''}
            </span>
            {r.reason ? <span>{r.reason}</span> : null}
            {r.decision_note ? <span>GM: {r.decision_note}</span> : null}
          </div>
          <Pill status={r.status} />
        </div>
      ))}
    </div>
  );
}

/* GM / CEO / IT on one waiting request: approve as asked, approve a revised
   amount, or reject — with an optional note the SM sees. */
function DecideRequest({ person, request, busy, onDecide }) {
  const [amount, setAmount] = useState(String(request.amount_requested));
  const [note, setNote] = useState('');
  const n = num(amount);
  const revised = n !== request.amount_requested;
  return (
    <div className="dsa-ask" role="group" aria-label={`Request from ${person.name}`}>
      <p>
        <b>Asks for {money(request.amount_requested)} more</b> · {fD(request.requested_at)}
        {request.requested_by && request.requested_by !== person.name ? ` · sent by ${request.requested_by}` : ''}
      </p>
      {request.reason ? <p className="why">{request.reason}</p> : null}
      <div className="dsa-row">
        <input className="dsa-in" inputMode="numeric" aria-label={`Amount to approve for ${person.name}`}
          value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="dsa-line" placeholder="Note to the SM (optional)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="dsa-row">
        <button type="button" className="dsa-ok" disabled={busy || n <= 0}
          onClick={() => onDecide({ employee: person.employee, request: request.name, action: 'approve', amount: n, note })}>
          {revised && n > 0 ? `Approve ${money(n)}` : 'Approve as asked'}
        </button>
        <button type="button" className="dsa-no" disabled={busy}
          onClick={() => onDecide({ employee: person.employee, request: request.name, action: 'reject', note })}>
          Reject
        </button>
        <span className="dsa-note">Approved amount is added to the allocation{person.allocation ? ` (now ${money(person.allocation.amount)})` : ''}.</span>
      </div>
    </div>
  );
}

/* ---- GM / CEO: allocate to every SM / ZSM, and track their splits */
function GmView({ data, editable, months, month, onSave, saving, onDecide }) {
  const [draft, setDraft] = useState({});
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(null);
  useEffect(() => { setDraft({}); setOpen(null); }, [month, data]);

  const people = useMemo(() => data.people || [], [data.people]);
  const counts = useMemo(() => {
    const c = { all: people.length, requests: 0, 'Not allocated': 0, 'Not split': 0, 'Partly split': 0, Split: 0 };
    people.forEach((p) => { c[statusOf(p)] += 1; if (pendingOf(p)) c.requests += 1; });
    return c;
  }, [people]);
  // The Requests tab goes once the last one is decided: fall back to All.
  useEffect(() => { if (tab === 'requests' && !counts.requests) setTab('all'); }, [tab, counts.requests]);
  const shown = tab === 'all' ? people
    : tab === 'requests' ? people.filter((p) => pendingOf(p))
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
        <div className="dsa-stat"><span>Asking for more</span><b style={{ color: counts.requests ? '#B45309' : undefined }}>{counts.requests}</b></div>
      </div>
      <div className="dsa-tabs" role="tablist" aria-label="Filter">
        {[['all', 'All'], ...(counts.requests ? [['requests', 'Requests']] : []), ['pending', 'Not done'], ['Not allocated', 'Not allocated'], ['Not split', 'Not split'], ['Partly split', 'Partly split'], ['Split', 'Split']].map(([k, l]) => (
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
        const ask = pendingOf(p);
        const history = (p.requests || []).filter((r) => r.status !== 'Pending');
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
            {ask ? (
              <div style={{ padding: '0 14px 10px' }}>
                <DecideRequest key={ask.name} person={p} request={ask} busy={saving} onDecide={onDecide} />
              </div>
            ) : null}
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
                {history.length ? (
                  <>
                    <span className="dsv-eyebrow" style={{ marginTop: 10 }}>Requests for more</span>
                    <RequestHistory requests={history} />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ---- SM / ZSM: split their own allocation across their departments.
   `asName`: IT looking at (and saving for) someone else's split. */
function SmView({ mine, editable, canRequest, months, month, onSave, onRequest, saving, asName }) {
  const [draft, setDraft] = useState({});
  const [asking, setAsking] = useState(false);
  const [askAmount, setAskAmount] = useState('');
  const [askWhy, setAskWhy] = useState('');
  useEffect(() => { setDraft({}); }, [month, mine]);
  useEffect(() => { setAsking(false); setAskAmount(''); setAskWhy(''); }, [month, mine]);
  if (!mine) return null;
  const a = mine.allocation;
  // A late approval reopens the split after the 20th.
  const canSplit = mine.can_split ?? editable;
  const waiting = pendingOf(mine);
  // A record made only by a request (nothing allocated, nothing split yet).
  const nothingYet = !a || (!a.amount && !mine.departments.some((d) => d.amount));
  const valueOf = (d) => draft[d.department] ?? (d.amount ? String(d.amount) : '');
  const total = mine.departments.reduce((s, d) => s + num(valueOf(d)), 0);
  const left = (a?.amount || 0) - total;
  const over = a && total > a.amount;
  const dirty = mine.departments.some((d) => num(valueOf(d)) !== (d.amount || 0));

  return (
    <div className="dsa-card">
      <div className="dsa-row" style={{ justifyContent: 'space-between' }}>
        <span className="dsv-eyebrow">{asName ? `${asName}'s split` : 'Your split'} · {monthLabel(months, month)}</span>
        {!nothingYet ? (
          <button className="dsa-btn" type="button" disabled={!canSplit || !dirty || saving}
            onClick={() => onSave('split', mine.departments.map((d) => ({ department: d.department, amount: num(valueOf(d)) })))}>
            {saving ? 'Saving…' : 'Save split'}
          </button>
        ) : null}
      </div>
      {a?.reopened && !editable ? (
        <p className="dsa-note" style={{ color: '#15803D', fontWeight: 600 }}>Extra amount approved after the 20th — split it now. This closes once it is fully split.</p>
      ) : null}
      {nothingYet ? (
        <p className="dsa-note">The GM has not allocated an amount to {asName || 'you'} for {monthLabel(months, month)} yet.</p>
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
                  value={valueOf(d)} disabled={!canSplit}
                  onChange={(e) => setDraft({ ...draft, [d.department]: e.target.value })} />
              </div>
            ))}
          </div>
          <span className="dsa-note">
            Split it however your departments need — it does not have to be equal. It becomes each department&apos;s service budget for the month.
          </span>
        </>
      )}

      {/* Need more than the GM gave? Ask — any time in the month. */}
      <div style={{ borderTop: '1px solid var(--line2)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="dsa-row" style={{ justifyContent: 'space-between' }}>
          <span className="dsv-eyebrow">Need more?</span>
          {canRequest && !waiting && !asking ? (
            <button type="button" className="dsa-ghost" onClick={() => setAsking(true)}>Request more</button>
          ) : null}
        </div>
        {waiting ? (
          <div className="dsa-ask">
            <p><b>{money(waiting.amount_requested)}</b> asked {fD(waiting.requested_at)} — waiting for the GM.</p>
            {waiting.reason ? <p className="why">{waiting.reason}</p> : null}
          </div>
        ) : null}
        {asking ? (
          <div className="dsa-ask">
            <div className="dsa-row">
              <input className="dsa-in" inputMode="numeric" placeholder="₹ extra" aria-label="Extra amount needed"
                value={askAmount} onChange={(e) => setAskAmount(e.target.value)} />
              <span className="dsa-note">on top of {money(a?.amount || 0)}</span>
            </div>
            <textarea className="dsa-txt" placeholder="Why is more needed? (the GM sees this)" aria-label="Reason"
              value={askWhy} onChange={(e) => setAskWhy(e.target.value)} />
            <div className="dsa-row">
              <button type="button" className="dsa-btn" disabled={saving || num(askAmount) <= 0 || !askWhy.trim()}
                onClick={() => onRequest({ amount: num(askAmount), reason: askWhy.trim() })}>
                {saving ? 'Sending…' : 'Send request'}
              </button>
              <button type="button" className="dsa-ghost" onClick={() => setAsking(false)}>Cancel</button>
            </div>
          </div>
        ) : null}
        {!canRequest && !waiting ? <span className="dsa-note">Requests are closed for {monthLabel(months, month)}.</span> : null}
        {canRequest && !waiting && !asking && !(mine.requests || []).length ? (
          <span className="dsa-note">Need more than the allocation? Ask the GM here — any time in the month.</span>
        ) : null}
        <RequestHistory requests={(mine.requests || []).filter((r) => r.status !== 'Pending')} />
      </div>
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
  /* IT only: which view, and whose split in the SM view. */
  const [itView, setItView] = useState('gm');
  const [asSm, setAsSm] = useState('');

  useEffect(() => {
    if (!client) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    client.allocation(month)
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((error) => alive && setState({ loading: false, error, data: null }));
    return () => { alive = false; };
  }, [client, month, attempt]);

  const save = useCallback(async (kind, rows, employee) => {
    setSaving(true);
    try {
      await client.saveAllocation(month, kind, rows, employee);
      show(kind === 'allocate' ? 'Allocation saved' : 'Split saved — department budgets updated');
      setAttempt((a) => a + 1);
    } catch (err) {
      show(err.message || 'Could not save', true);
    } finally {
      setSaving(false);
    }
  }, [client, month, show]);

  const request = useCallback(async (payload, employee) => {
    setSaving(true);
    try {
      await client.requestAllocation(month, { ...payload, employee });
      show('Request sent to the GM');
      setAttempt((a) => a + 1);
    } catch (err) {
      show(err.message || 'Could not send the request', true);
    } finally {
      setSaving(false);
    }
  }, [client, month, show]);

  const decide = useCallback(async (payload) => {
    setSaving(true);
    try {
      await client.decideRequest(month, payload);
      show(payload.action === 'approve' ? `Approved ${money(payload.amount)} — added to the allocation` : 'Request rejected');
      setAttempt((a) => a + 1);
    } catch (err) {
      show(err.message || 'Could not save the decision', true);
    } finally {
      setSaving(false);
    }
  }, [client, month, show]);

  const data = state.data;
  const months = data?.months || [];
  const isIt = !!data?.viewer?.is_it;
  const people = data?.people || [];
  // IT's SM view: the picked SM (default the first), from the list IT already has.
  const picked = isIt ? people.find((p) => p.employee === asSm) || people[0] || null : null;
  const editable = !!data?.editable;
  const canRequest = !!data?.can_request;
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
          {!editable && canRequest ? <span className="dsa-note">Requests for more stay open all month.</span> : null}
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

      {isIt ? (
        /* IT only: switch between the GM's view and any SM's view. */
        <div className="dsa-row" role="group" aria-label="View as">
          <div className="dsa-tabs">
            <button type="button" className={`dsa-tab${itView === 'gm' ? ' on' : ''}`} onClick={() => setItView('gm')}>Allocate (GM view)</button>
            <button type="button" className={`dsa-tab${itView === 'sm' ? ' on' : ''}`} onClick={() => setItView('sm')}>Split (SM view)</button>
          </div>
          {itView === 'sm' && people.length ? (
            <select className="dsa-sel" aria-label="Sales Manager" value={picked?.employee || ''} onChange={(e) => setAsSm(e.target.value)}>
              {people.map((p) => <option key={p.employee} value={p.employee}>{p.name} · {p.designation || 'Sales Manager'}</option>)}
            </select>
          ) : null}
        </div>
      ) : null}

      {data?.viewer?.can_allocate && (!isIt || itView === 'gm') ? (
        <GmView data={data} editable={editable} months={months} month={month} onSave={save} saving={saving} onDecide={decide} />
      ) : null}
      {isIt && itView === 'sm' ? (
        <SmView key={picked?.employee || 'none'} mine={picked} editable={editable} canRequest={canRequest} months={months} month={month} saving={saving}
          asName={picked?.name} onSave={(kind, rows) => save(kind, rows, picked?.employee)}
          onRequest={(payload) => request(payload, picked?.employee)} />
      ) : null}
      {data?.viewer?.is_sm && !isIt ? (
        <SmView mine={data.mine} editable={editable} canRequest={canRequest} months={months} month={month} onSave={save} saving={saving}
          onRequest={(payload) => request(payload)} />
      ) : null}

      <Toast toast={toast} />
    </div>
  );
}

export const DoctorServiceAllocation = AllocationWorkspace;
