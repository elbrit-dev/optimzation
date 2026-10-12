'use client';

/* "Is this doctor worth it?" — the prototype's block on the detail pane:
 * totals (tap for the last 3 services, each with the support after it and
 * its ROI), what this request is in weeks of sales, the monthly
 * support / service bars (tap a month), and the last 3 visits by role. */

import { useMemo, useState } from 'react';
import { bizView, ROLE_C } from '../data/insight';

export function Biz({ insight, request, loading }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(null);
  const b = useMemo(() => bizView(insight, request, sel), [insight, request, sel]);

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
      <div className="hd"><b>Is this doctor worth it?</b><span>{b.window}</span></div>

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

      <div className="dsv-chart">
        <div className="bars">
          {b.months.map((mo, i) => (
            <button key={mo.key} type="button" className="col" title={mo.tip} style={{ background: mo.colBg }} onClick={() => setSel(sel === i ? null : i)}>
              <i style={{ width: '55%', maxWidth: 12, height: mo.bh, background: mo.bc }} />
              <i style={{ width: '30%', maxWidth: 6, height: mo.sh, background: mo.sc }} />
            </button>
          ))}
        </div>
        <div className="labs">{b.months.map((mo) => <span key={mo.key} style={{ color: mo.lc, fontWeight: mo.lw }}>{mo.label}</span>)}</div>
        <div className="dsv-legend">
          <span><i style={{ background: '#3B82F6' }} />Support each month</span>
          <span><i style={{ background: '#F59E0B' }} />Service given</span>
          <span className="tap">Tap a month</span>
        </div>
        {b.sel ? (
          <div className="dsv-selbox">
            <div className="h"><span>{b.sel.head}</span><button type="button" onClick={() => setSel(null)}>Clear ✕</button></div>
            <div className="g">
              <div><span>{b.sel.supL}</span><b style={{ color: '#1E3A8A' }}>{b.sel.sup}</b></div>
              <div><span>{b.sel.svcL}</span><b>{b.sel.svc}</b></div>
              <div><span>ROI</span><b style={{ color: '#B91C1C' }}>{b.sel.roi}</b></div>
            </div>
            <div className="l"><span>{b.sel.lastLbl}</span><b>{b.sel.lastTxt}</b></div>
          </div>
        ) : null}
      </div>

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
