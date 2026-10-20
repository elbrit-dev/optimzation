'use client';

/* Small pieces both the form and the pages draw: icons, the searchable
 * dropdown, the date picker, the confirm / reject modal and the toast. */

import { useEffect, useRef, useState } from 'react';
import { MONF, WDS, fDY, localToday } from '../data/workflow';

const P = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.5-3.5',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  back: 'm12 19-7-7 7-7M19 12H5',
  left: 'm15 18-6-6 6-6',
  right: 'm9 18 6-6-6-6',
  down: 'm6 9 6 6 6-6',
  plus: 'M5 12h14M12 5v14',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  clip: 'm21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48',
  pencil: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z',
  cal: 'M3 9.5h18M8 2.5v4M16 2.5v4M6 4.5h12a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7.5a3 3 0 0 1 3-3Z',
  filter: 'M3 6h11M18 6h3M3 12h3M10 12h11M3 18h13M20 18h1M16 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM8 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM18 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
};

export function Icon({ name, size = 16, color = '#111827', width = 2, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      style={{ flex: 'none', fill: 'none', stroke: color, strokeWidth: width, strokeLinecap: 'round', strokeLinejoin: 'round', ...style }}>
      <path d={P[name]} />
    </svg>
  );
}

export const initials = (n) => String(n || '').replace(/^Dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export function Box({ on, small }) {
  return (
    <span className={'dsv-box' + (on ? ' on' : '')} style={small ? { width: 18, height: 18, borderRadius: 5 } : undefined}>
      {on ? <Icon name="check" size={small ? 11 : 12} color="#fff" width={3.5} /> : null}
    </span>
  );
}

/* A searchable single-select. `items`: [{ value, label, sub?, uses?, header? }] */
export function Combo({ value, label, placeholder, items, open, onOpen, onClose, onPick, bad, searchHint, count, avatar }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const input = useRef(null);
  useEffect(() => {
    if (!open) return;
    setQ('');
    setHi(0);
    const t = setTimeout(() => input.current?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(t);
  }, [open]);
  const shown = items.filter((o) => o.header || !q || (o.label + ' ' + (o.sub || '')).toLowerCase().includes(q.toLowerCase()));
  const pickable = shown.filter((o) => !o.header);
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, pickable.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (pickable[hi]) onPick(pickable[hi].value); }
    else if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  };
  let n = -1;
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className={'dsv-trig' + (open ? ' open' : '') + (bad ? ' bad' : '')} onClick={open ? onClose : onOpen} aria-haspopup="listbox" aria-expanded={open}>
        <Icon name="search" size={18} color="#9CA3AF" />
        <span className={'dsv-v v ' + (value ? 'set' : 'ph')}>{value ? label : placeholder}</span>
        <Icon name="down" size={16} color="#6B7280" width={2.2} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }} />
      </button>
      {open ? (
        <>
          <div className="dsv-catch" onClick={onClose} />
          <div className="dsv-pop" role="listbox">
            <div className="sr">
              <label>
                <Icon name="search" size={16} color="#6B7280" />
                <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={key} placeholder={searchHint} aria-label={searchHint} />
                <em>{count ?? pickable.length}</em>
              </label>
            </div>
            <div className="ls">
              {shown.map((o) => {
                if (o.header) return <div key={'h' + o.label} style={{ padding: '10px 10px 4px', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: '#9CA3AF', textTransform: 'uppercase' }}>{o.label}</div>;
                n += 1;
                const i = n;
                const sel = o.value === value;
                return (
                  <button key={o.value} type="button" role="option" aria-selected={sel} className={'dsv-opt' + (i === hi ? ' hi' : '')}
                    onClick={() => onPick(o.value)} onMouseEnter={() => setHi(i)}>
                    {avatar ? <span className="dsv-av" style={{ background: sel ? '#2563EB' : '#EAF1FF', color: sel ? '#fff' : '#1D4ED8' }}>{initials(o.label)}</span> : null}
                    <span className="x"><b>{o.label}</b>{o.sub ? <span>{o.sub}</span> : null}</span>
                    {o.uses ? <span className="u">{o.uses}</span> : null}
                    {sel ? <Icon name="check" size={16} color="#2563EB" width={3} /> : null}
                  </button>
                );
              })}
              {!pickable.length ? <div className="dsv-none">{q ? `Nothing matches “${q}”` : 'Nothing to choose'}</div> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const shift = (s, days) => {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() - days);
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
};

/* The service date: a month grid with Today / Yesterday / 1 week ago. No
   future date — the guard refuses one. */
export function DatePicker({ value, onChange, bad }) {
  const today = localToday();
  const base = new Date((value || today) + 'T00:00:00');
  const [view, setView] = useState(null);
  const y = view ? view.y : base.getFullYear();
  const m = view ? view.m : base.getMonth();
  const open = !!view;
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const dim = new Date(y, m + 1, 0).getDate();
  const diff = value ? Math.round((new Date(today + 'T00:00:00') - new Date(value + 'T00:00:00')) / 864e5) : null;
  const rel = diff == null ? '' : diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff > 0 ? diff + ' days ago' : 'In ' + -diff + ' days';
  const mv = (k) => { const d = new Date(y, m + k, 1); setView({ y: d.getFullYear(), m: d.getMonth() }); };
  const pick = (v) => { setView(null); onChange(v); };
  return (
    <>
      <button type="button" className={'dsv-trig' + (open ? ' open' : '') + (bad ? ' bad' : '')} onClick={() => setView(open ? null : { y: base.getFullYear(), m: base.getMonth() })} aria-haspopup="dialog" aria-expanded={open}>
        <Icon name="cal" size={18} color="#1E3A8A" width={1.8} />
        <span className="v set" title={value ? `${WDS[base.getDay()]}, ${fDY(value)}` : undefined}>{value ? fDY(value) : 'Pick a date'}</span>
        <span className="rel">{rel}</span>
      </button>
      {open ? (
        <>
          <div className="dsv-catch" onClick={() => setView(null)} />
          <div className="dsv-cal" role="dialog" aria-label="Choose service date">
            <div className="mh">
              <button type="button" onClick={() => mv(-1)} aria-label="Previous month"><Icon name="left" size={14} width={2.4} /></button>
              <b>{MONF[m]} {y}</b>
              <button type="button" onClick={() => mv(1)} aria-label="Next month"><Icon name="right" size={14} width={2.4} /></button>
            </div>
            <div className="gr">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((w) => <span key={w} className="wk">{w}</span>)}
              {Array.from({ length: startDow }, (_, i) => <span key={'b' + i} />)}
              {Array.from({ length: dim }, (_, i) => {
                const v = iso(y, m, i + 1);
                return (
                  <button key={v} type="button" disabled={v > today}
                    className={'dy' + (v === value ? ' on' : '') + (v === today && v !== value ? ' today' : '')}
                    onClick={() => pick(v)}>{i + 1}</button>
                );
              })}
            </div>
            <div className="qk">
              {[['Today', 0], ['Yesterday', 1], ['1 week ago', 7]].map(([l, n]) => {
                const v = shift(today, n);
                return <button key={l} type="button" className={v === value ? 'on' : ''} onClick={() => pick(v)}>{l}</button>;
              })}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

export function Modal({ title, desc, confirm, danger, onConfirm, onClose, busy, children }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="dsv-ovc dsv" onClick={onClose}>
      <div className="dsv-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="t">{title}</span>
          {desc ? <span className="d">{desc}</span> : null}
        </div>
        {children}
        <div className="b">
          <button type="button" className="dsv-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="dsv-btn pri" disabled={busy} style={danger ? { background: '#DC2626' } : undefined} onClick={onConfirm}>{busy ? 'Working…' : confirm}</button>
        </div>
      </div>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return <div className={'dsv dsv-toast' + (toast.bad ? ' bad' : '')} role="status" aria-live="polite">{toast.msg}</div>;
}

export function useToast() {
  const [toast, setToast] = useState(null);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const show = (msg, bad) => {
    clearTimeout(t.current);
    setToast({ msg, bad });
    t.current = setTimeout(() => setToast(null), bad ? 6000 : 3200);
  };
  return [toast, show];
}

export const extOf = (n) => {
  const x = (String(n || '').split('?')[0].split('.').pop() || '').toUpperCase().slice(0, 4);
  const img = ['PNG', 'JPG', 'JPEG', 'HEIC', 'WEBP'].includes(x);
  return { ext: x || 'FILE', bg: img ? '#EAF1FF' : x === 'PDF' ? '#FDECEC' : '#F1F3F6', fg: img ? '#1D4ED8' : x === 'PDF' ? '#B91C1C' : '#4B5563' };
};
