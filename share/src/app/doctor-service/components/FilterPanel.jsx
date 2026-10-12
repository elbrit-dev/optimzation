'use client';

/* Filter & sort — the prototype's two-column panel: sections on the left
 * (Sort, Group, Team, On behalf of, Service, Doctor), options on the right.
 * Choices are a DRAFT until "Show N services"; Clear all resets the draft. */

import { useEffect, useState } from 'react';
import { Icon } from './parts';

export function FilterPanel({ sections, initial, countFor, onApply, onClose }) {
  const [draft, setDraft] = useState(initial);
  const [sec, setSec] = useState(sections[0].key);
  const [q, setQ] = useState('');
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const cur = sections.find((s) => s.key === sec) || sections[0];
  const value = draft[cur.key];
  const opts = cur.options(draft).filter((o) => !cur.search || !q || (o.label + ' ' + (o.sub || '')).toLowerCase().includes(q.toLowerCase()));
  const pick = (v) => {
    if (cur.multi) {
      const arr = value || [];
      setDraft({ ...draft, [cur.key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] });
    } else setDraft({ ...draft, [cur.key]: v });
  };
  const n = countFor(draft);
  const clear = () => {
    const next = { ...draft };
    for (const s of sections) next[s.key] = s.multi ? [] : s.reset;
    setDraft(next);
  };

  return (
    <div className="dsv dsv-ovc" onClick={onClose}>
      <div className="dsv-fp" role="dialog" aria-modal="true" aria-label="Filter and sort" onClick={(e) => e.stopPropagation()}>
        <div className="h">
          <b>Filter &amp; sort</b>
          <button type="button" className="dsv-clear" onClick={clear}>Clear all</button>
          <button type="button" className="ap" onClick={() => onApply(draft)}>Show {n} service{n === 1 ? '' : 's'}</button>
        </div>
        <div className="bd">
          <div className="nv">
            {sections.map((s) => {
              const c = s.multi ? (draft[s.key] || []).length : draft[s.key] !== s.reset ? 1 : 0;
              return (
                <button key={s.key} type="button" className={s.key === sec ? 'on' : ''} onClick={() => { setSec(s.key); setQ(''); }}>
                  <span>{s.label}</span>
                  {c ? <span className="dsv-badge" style={{ flex: 'none', minWidth: 18, height: 18, fontSize: 10 }}>{c}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="op">
            <span className="cap">{cur.label}</span>
            {cur.search ? (
              <label className="dsv-search" style={{ height: 40, marginBottom: 6, background: '#F4F6F9', border: 'none' }}>
                <Icon name="search" size={15} color="#6B7280" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={cur.search} aria-label={cur.search} />
              </label>
            ) : null}
            {opts.map((o) => {
              const on = cur.multi ? (value || []).includes(o.value) : value === o.value;
              return (
                <button key={o.value} type="button" role={cur.multi ? 'checkbox' : 'radio'} aria-checked={on} className={'dsv-fopt' + (on ? ' on' : '')} onClick={() => pick(o.value)}>
                  {cur.multi ? (
                    <span className="ck">{on ? <Icon name="check" size={11} color="#fff" width={4} /> : null}</span>
                  ) : (
                    <span className="rd">{on ? <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2563EB' }} /> : null}</span>
                  )}
                  <span className="x"><b>{o.label}</b>{o.sub ? <span>{o.sub}</span> : null}</span>
                  {o.count != null ? <span className="n">{o.count}</span> : null}
                </button>
              );
            })}
            {!opts.length ? <span style={{ padding: '20px 6px', fontSize: 13, color: '#6B7280' }}>Nothing to filter here.</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
