'use client';

/* "Is this doctor worth it?" — the prototype's block on the detail pane:
 * totals (tap for the last 3 services, each with the support after it and
 * its ROI), what this request is in weeks of sales, the monthly
 * support / service bars (tap a month), and the last 3 visits by role. */

import { useMemo, useState } from 'react';
import { bizView, ROLE_C } from '../data/insight';
import { MON, money } from '../data/workflow';

/* Support and service, month by month — a small table, 6 months at a time:
 *   Month | Service | Support, newest first, with the 6 months' total.
 * Presets (Last 6 / Previous 6 / Earlier 6) and an "Ending" month picker
 * move the 6-month window over the insight's months (18, to last month).
 * The DEPARTMENT the figures are for is the service's own; the approvers
 * (GM / CEO / IT, on the approval page) may switch it to any department
 * the doctor has support or services in, for this table only.
 * Service = services GIVEN (paid / finally approved) dated in the month. */
const GIVEN = ['Paid', 'Approved'];
const PAGE = 6;
const mLabel = (k) => `${MON[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;

function MonthTable({ insight, department, canSwitchDept }) {
  const months = useMemo(() => insight?.months || [], [insight]);
  const keys = months.map((m) => m.month);
  const depts = useMemo(() => {
    const out = new Set();
    months.forEach((m) => Object.keys(m.by_dept || {}).forEach((d) => d && out.add(d)));
    (insight?.services || []).forEach((s) => s.department && out.add(s.department));
    if (department) out.add(department);
    return [...out].sort();
  }, [insight, months, department]);
  const [dept, setDept] = useState(department || '');
  const [end, setEnd] = useState(keys.length - 1);
  const hasSplit = months.some((m) => m.by_dept && typeof m.by_dept === 'object');
  const d = hasSplit ? dept : '';

  if (!keys.length) return null;
  const last = keys.length - 1;
  const e = Math.min(Math.max(end, Math.min(PAGE - 1, last)), last);
  const from = Math.max(0, e - PAGE + 1);
  const rows = [];
  for (let i = e; i >= from; i -= 1) {
    const k = keys[i];
    const m = months[i];
    const support = d ? Number((m.by_dept || {})[d]) || 0 : Number(m.support) || 0;
    const service = (insight.services || [])
      .filter((s) => GIVEN.includes(s.status) && String(s.date || '').slice(0, 7) === k && (!d || s.department === d))
      .reduce((a, s) => a + (Number(s.amount) || 0), 0);
    rows.push({ k, support, service });
  }
  const tot = rows.reduce((a, r) => ({ s: a.s + r.service, p: a.p + r.support }), { s: 0, p: 0 });
  const presets = [['Last 6 months', last], ['Previous 6', last - PAGE], ['Earlier 6', last - 2 * PAGE]].filter(([, i]) => i >= 0);
  const chip = (on) => ({
    height: 28, padding: '0 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: '1px solid ' + (on ? '#111827' : '#E1E5EB'), background: on ? '#111827' : '#fff', color: on ? '#fff' : '#374151',
  });
  const sel = { height: 30, border: '1px solid #E1E5EB', borderRadius: 8, padding: '0 8px', fontSize: 12.5, background: '#fff', maxWidth: '100%' };
  const cell = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid #F1F3F6' };
  const num = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {presets.map(([l, i]) => (
          <button key={l} type="button" style={chip(e === i)} onClick={() => setEnd(i)}>{l}</button>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6B7280' }}>
          Ending
          <select style={sel} aria-label="Show 6 months ending" value={keys[e]} onChange={(ev) => setEnd(keys.indexOf(ev.target.value))}>
            {[...keys].reverse().map((k) => <option key={k} value={k}>{mLabel(k)}</option>)}
          </select>
        </label>
        {canSwitchDept && hasSplit && depts.length > 1 ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6B7280' }}>
            Department
            <select style={sel} aria-label="Department" value={dept} onChange={(ev) => setDept(ev.target.value)}>
              {depts.map((x) => <option key={x} value={x}>{x.replace(/\s*-\s*[A-Z]{2,6}\s*$/, '')}{x === department ? ' (this service)' : ''}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <div style={{ border: '1px solid #E6E9EF', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8F9FB' }}>
              <th style={{ ...cell, textAlign: 'left', fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Month</th>
              <th style={{ ...num, fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Service</th>
              <th style={{ ...num, fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Support</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k}>
                <td style={cell}>{mLabel(r.k)}</td>
                <td style={{ ...num, color: r.service ? '#B45309' : '#9CA3AF' }}>{r.service ? money(r.service) : '—'}</td>
                <td style={{ ...num, color: r.support ? '#1E3A8A' : '#9CA3AF' }}>{r.support ? money(r.support) : '—'}</td>
              </tr>
            ))}
            <tr style={{ background: '#F8F9FB' }}>
              <td style={{ ...cell, fontWeight: 700, borderBottom: 0 }}>{rows.length} months</td>
              <td style={{ ...num, fontWeight: 700, borderBottom: 0 }}>{money(tot.s)}</td>
              <td style={{ ...num, fontWeight: 700, borderBottom: 0, color: '#1E3A8A' }}>{money(tot.p)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {d && d !== department ? (
        <span style={{ fontSize: 11.5, color: '#6B7280' }}>Showing {d.replace(/\s*-\s*[A-Z]{2,6}\s*$/, '')} — this service is for {String(department || '').replace(/\s*-\s*[A-Z]{2,6}\s*$/, '')}.</span>
      ) : null}
    </div>
  );
}

export function Biz({ insight, request, department, loading, canSwitchDept = false }) {
  const [open, setOpen] = useState(false);
  // Judged on the service's own department: its support and its services only.
  const b = useMemo(() => bizView(insight, request, null, department || null), [insight, request, department]);

  if (loading && !b) {
    return (
      <div className="dsv-biz" aria-busy="true">
        <div className="dsv-skel" style={{ width: '45%' }} />
        <div className="dsv-skel" style={{ height: 64 }} />
        <div className="dsv-skel" style={{ height: 52 }} />
      </div>
    );
  }
  if (!b) return null;

  return (
    <div className="dsv-biz">
      <div className="hd"><b>Is this doctor worth it?</b><span>{b.scope} · {b.window}</span></div>

      <div className="dsv-tot" role="button" tabIndex={0} title="Tap to see the last 3 services"
        onClick={() => setOpen((o) => !o)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen((o) => !o); }}>
        <div className="g">
          {b.totals.map((k) => (
            <div key={k.l} className="c" title={k.full}>
              <span className="l">{k.l}</span>
              <span className="v" style={{ color: k.c }}>{k.v}</span>
              <span className="s">{k.s}</span>
            </div>
          ))}
        </div>
        <div className="f"><span>Support after each of the last 3 services</span><b>{open ? 'Hide ▴' : 'Show ▾'}</b></div>
      </div>

      {open && b.top3.length ? (
        <div className="dsv-top3">
          {b.top3.map((p) => (
            <div key={p.tag} className="dsv-svcc">
              <div className="a"><span className="tag" style={{ color: p.tagC, background: p.tagBg }}>{p.tag}</span><span className="dt">{p.date}</span></div>
              <div className="b"><span>{p.svc}</span><span className="num">{p.amt}</span></div>
              <div className="c"><span>Support till date</span><b>{p.since}</b><i>{p.span}</i></div>
              <div className="dsv-roi"><span>ROI</span><b>{p.roi}</b></div>
            </div>
          ))}
        </div>
      ) : null}

      {!open && b.last ? (
        <div className="dsv-last">
          <div className="r"><span className="cap">Last service</span><span style={{ fontSize: 12, color: '#6B7280' }}>{b.last.date}</span></div>
          <div className="r"><b>{b.last.svc}</b><b className="num">{b.last.amt}</b></div>
          <div className="after">
            <div className="x"><span>Support we got after this service</span><b>{b.last.since}</b><i>{b.last.span}</i></div>
            <div className="dsv-roi" style={{ alignSelf: 'center', padding: '6px 12px' }}><span>ROI</span><b style={{ fontSize: 18 }}>{b.last.roi}</b></div>
          </div>
        </div>
      ) : null}
      {!b.last ? <div className="dsv-last" style={{ fontSize: 13, color: '#4B5563' }}>No earlier service to this doctor since {b.from} — this would be the first.</div> : null}

      {request ? (
        <div className="dsv-plan"><span>This request {b.request}</span><span style={{ color: b.planC }}>{b.planSub}</span></div>
      ) : null}

      <MonthTable insight={insight} department={department} canSwitchDept={canSwitchDept} />

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ paddingBottom: 4 }}><b style={{ fontSize: 13, fontWeight: 700 }}>Last 3 visits by role</b></div>
        {b.visits.map((v) => (
          <div key={v.role} className="dsv-visit">
            <span className="rl" style={{ background: ROLE_C[v.role]?.[0], color: ROLE_C[v.role]?.[1] }}>{v.role}</span>
            <div className="vx">
              <b>{v.name || '—'}</b>
              <div className="ds">
                {v.dates.map((d) => <span key={d}>{d}</span>)}
                {v.none ? <em>No visit since {b.from}</em> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
