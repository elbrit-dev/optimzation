'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* FyMonthPicker — the Doctor Support report's month picker
 * (components/features/support-report), ported as a standalone control.
 *
 * Same look and rules: ‹ › step the selection a month at a time, the trigger
 * shows a label + sub line, and the popover offers Month / Quarter / Financial
 * year tabs, an FY stepper and a grid picked From-then-To (no preset chips). Indian FY
 * (April–March).
 *
 * Differences from the original: there is no per-month data here, so every
 * month up to the current one is selectable, cells carry no value line, and
 * the selection is always ONE contiguous run — the output is a [start, end]
 * date pair, so a gap could not be expressed anyway.
 *
 * Months are absolute indices: year * 12 + monthIndex (0 = Jan). */

const MN = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const CAL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fyOf = (i) => { const y = Math.floor(i / 12), m = i % 12; return m >= 3 ? y : y - 1; };
const fb = (fy) => fy * 12 + 3; // first month (April) of an FY
const fyL = (fy) => `FY ${fy}-${String(fy + 1).slice(2)}`;
const fyS = (fy) => `FY${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
const ms = (i) => CAL[i % 12];
const ml = (i) => `${ms(i)} ${Math.floor(i / 12)}`;
const toIdx = (d) => { const x = d instanceof Date ? d : new Date(d); return x.getFullYear() * 12 + x.getMonth(); };
const startOf = (i) => new Date(Math.floor(i / 12), i % 12, 1);
const endOf = (i) => new Date(Math.floor(i / 12), (i % 12) + 1, 0);

const CSS = `
.fymp button{font-family:inherit;margin:0}
@media (hover:hover) and (pointer:fine){
.fymp .fymp-hb:hover{border-color:#1F4FD8!important}
}`;

const navBtn = (op) => ({ width: 36, border: '1px solid #D0D5DD', background: '#fff', borderRadius: 8, cursor: op < 1 ? 'default' : 'pointer', fontSize: 16, color: '#344054', opacity: op, flex: 'none' });
const yrBtn = (op) => ({ width: 32, height: 32, border: '1px solid #EAECF0', background: '#fff', borderRadius: 8, cursor: op < 1 ? 'default' : 'pointer', color: '#344054', opacity: op });
const ell = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

function useIsMobile() {
  const [mob, setMob] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setMob(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return mob;
}

const POP_W = 380;
const GAP = 8;   // between trigger and panel
const EDGE = 12; // min distance from the viewport edge

/* Where the desktop panel goes, from the trigger's box on screen: below it
   when it fits, otherwise on whichever side has more room, with the height
   capped to that room so the grid scrolls instead of running off-screen. */
function placeBelowOrAbove(anchor) {
  const r = anchor.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const below = vh - r.bottom - GAP - EDGE;
  const above = r.top - GAP - EDGE;
  const want = 560; // the month view's natural height
  const down = below >= Math.min(want, 320) || below >= above;
  const left = Math.max(EDGE, Math.min(r.left, vw - POP_W - EDGE));
  return down
    ? { top: r.bottom + GAP, bottom: 'auto', left, maxH: Math.max(200, below) }
    : { top: 'auto', bottom: vh - r.top + GAP, left, maxH: Math.max(200, above) };
}

/* ALWAYS PORTALLED TO <body>. The picker sits inside report providers and
   Plasmic stacks that clip their overflow; an absolutely positioned panel
   inside them got cut off at the container's bottom edge (29 Sep 2026). On
   <body> nothing clips it, and position:fixed can't be demoted by a
   transformed ancestor either. Desktop follows the trigger on scroll/resize. */
function Popover({ mob, anchorRef, onClose, children }) {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (mob || !anchorRef?.current) return undefined;
    const update = () => anchorRef.current && setPos(placeBelowOrAbove(anchorRef.current));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true); // capture: any scrolling ancestor
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [mob, anchorRef]);

  if (typeof document === 'undefined') return null;
  if (!mob && !pos) return null; // first frame, before the trigger is measured

  const P = mob
    ? { sBg: 'rgba(16,24,40,.4)', top: 'auto', right: 0, left: 0, bottom: 0, w: 'auto', maxH: '78vh', rad: '22px 22px 0 0' }
    : { sBg: 'transparent', top: pos.top, right: 'auto', left: pos.left, bottom: pos.bottom, w: POP_W, maxH: pos.maxH, rad: 14 };
  return createPortal(
    <div className="fymp">
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: P.sBg, zIndex: 1000 }} />
      <div role="dialog" aria-label="Select months" style={{ position: 'fixed', top: P.top, right: P.right, left: P.left, bottom: P.bottom, width: P.w, maxHeight: P.maxH, borderRadius: P.rad, background: '#fff', border: '1px solid #EAECF0', boxShadow: '0 16px 40px rgba(16,24,40,.18)', zIndex: 1001, display: 'flex', flexDirection: 'column', padding: '14px 16px 16px', gap: 12, overflow: 'auto', color: '#101828' }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// minFy is the first financial year offered (2024 = FY 2024-25, from Apr 2024).
// min / max (Date or 'YYYY-MM-DD') lock the picker to a range, e.g. the current
// FY: months, quarters, years and the ‹ › steps all stay inside it.
// CUR is the latest selectable month — today, or max when that is earlier.
export default function FyMonthPicker({ value, onChange, minFy = 2024, min, max, className }) {
  const mob = useIsMobile();
  const TODAY = useMemo(() => toIdx(new Date()), []);
  const CUR = max ? Math.min(TODAY, toIdx(max)) : TODAY;
  const fyMax = fyOf(CUR);
  const MIN = Math.min(Math.max(fb(Math.min(Number(minFy) || 2024, fyMax)), min ? toIdx(min) : -Infinity), CUR);
  const fyMin = fyOf(MIN);

  const clamp = (i) => Math.min(CUR, Math.max(MIN, i));
  const [a, b] = useMemo(() => {
    if (Array.isArray(value) && value[0] && value[1]) {
      const x = clamp(toIdx(value[0])), y = clamp(toIdx(value[1]));
      return x <= y ? [x, y] : [y, x];
    }
    return [CUR, CUR];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, CUR, MIN]);

  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const [pmode, setPmodeState] = useState('month');
  const [pfyState, setPfy] = useState(null);
  const pfy = pfyState ?? fyOf(b);
  // The start of a range being picked: [firstMonth, lastMonth] of the tapped cell.
  const [from, setFrom] = useState(null);
  // A start from one tab means nothing on another, so switching tabs drops it.
  const setPmode = (id) => { setPmodeState(id); setFrom(null); };
  const close = () => { setOpen(false); setFrom(null); };
  const done = () => { if (from) emit(from[0], from[1]); close(); };

  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') { setOpen(false); setFrom(null); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  const emit = (x, y) => onChange?.([startOf(x), endOf(y)]);

  /* ── Label ── (same precedence as the Support report: FY, quarter, single, run) */
  const n = b - a + 1;
  const fyRun = (f) => [Math.max(fb(f), MIN), Math.min(fb(f) + 11, CUR)];
  const qRun = (f, k) => [Math.max(fb(f) + k * 3, MIN), Math.min(fb(f) + k * 3 + 2, CUR)];
  const isRun = ([x, y]) => x <= y && x === a && y === b;
  const fyHit = (() => { const f = fyOf(a); const r = fyRun(f); return isRun(r) && n > 3 ? fyL(f) + (r[1] === CUR && n < 12 ? ' · to date' : '') : null; })();
  const qHit = (() => { const f = fyOf(a); for (let k = 0; k < 4; k++) { const r = qRun(f, k); if (isRun(r) && n > 1) return `Q${k + 1} ${fyS(f)}` + (r[1] === CUR && n < 3 ? ' · to date' : ''); } return null; })();
  const label = fyHit || qHit || (n === 1 ? ml(a)
    : Math.floor(a / 12) === Math.floor(b / 12) ? `${ms(a)}–${ml(b)}` : `${ml(a)} – ${ml(b)}`);
  const sub = n === 1 ? `Month · ${fyS(fyOf(a))}` : `${n} months`;

  const prevOk = a - 1 >= MIN;
  const nextOk = b + 1 <= CUR;

  /* FROM, THEN TO. The first tap marks a cell (covering months [c0, c1]) as
     the start and applies nothing -- the picker waits. The second tap is the
     end: the range runs from the earlier of the two to the later, and a
     second tap on the same cell means just that month / quarter / year.
     Done with only a start picked applies that one cell; closing any other
     way (backdrop, Escape) drops it and keeps the previous range. */
  const tap = (c0, c1) => () => {
    if (c0 > c1) return;
    if (!from) { setFrom([c0, c1]); return; }
    emit(Math.min(from[0], c0), Math.max(from[1], c1));
    setFrom(null);
  };
  const cst = (on, ok) => ({ tick: on ? '✓' : '', bg: on ? '#101828' : ok ? '#fff' : '#F9FAFB', fg: on ? '#fff' : ok ? '#101828' : '#98A2B3', bd: on ? '#101828' : ok ? '#EAECF0' : '#F2F4F7', sfg: on ? '#D0D5DD' : '#98A2B3', cur: ok ? 'pointer' : 'default' });
  // While a start is pending only it is highlighted; otherwise the applied range.
  const inSel = (x, y) => x <= y && (from ? x >= from[0] && y <= from[1] : x >= a && y <= b);

  let cells;
  if (pmode === 'quarter') {
    cells = [0, 1, 2, 3].map((k) => {
      const [x, y] = qRun(pfy, k), ok = x <= y;
      return { key: k, label: `Q${k + 1} · ${MN[k * 3]}–${MN[k * 3 + 2]}`, sub: ok ? (y < x + 2 ? 'to date' : '') : x > TODAY ? 'not yet' : 'locked', onClick: ok ? tap(x, y) : undefined, ...cst(ok && inSel(x, y), ok) };
    });
  } else if (pmode === 'fy') {
    cells = [];
    for (let f = fyMin; f <= fyMax; f++) {
      const [x, y] = fyRun(f);
      cells.push({ key: f, label: fyL(f), sub: y < x + 11 ? `${y - x + 1} months to date` : '', onClick: tap(x, y), ...cst(inSel(x, y), true) });
    }
  } else {
    cells = MN.map((m, k) => {
      const i = fb(pfy) + k, ok = i <= CUR && i >= MIN;
      return { key: k, label: m, sub: ok ? '' : i > TODAY ? 'not yet' : 'locked', onClick: ok ? tap(i, i) : undefined, ...cst(ok && inSel(i, i), ok) };
    });
  }

  const modes = [['month', 'Month'], ['quarter', 'Quarter'], ['fy', 'Financial year']];
  const unit = pmode === 'month' ? 'month' : pmode === 'quarter' ? 'quarter' : 'year';
  const hint = from
    ? `From ${ml(from[0])} · now tap the end ${unit} (same one for just it)`
    : `Tap the start ${unit}, then the end ${unit}`;
  const cols = pmode === 'month' ? 4 : pmode === 'quarter' ? 2 : 1;
  const cellH = pmode === 'month' ? 46 : 54;

  return (
    <div ref={rootRef} className={`fymp ${className ?? ''}`} style={{ position: 'relative', display: 'flex', gap: 6, alignItems: 'stretch', minWidth: 0, color: '#101828' }}>
      <style>{CSS}</style>
      <button type="button" onClick={() => prevOk && emit(a - 1, b - 1)} aria-label="Previous month" style={navBtn(prevOk ? 1 : 0.35)}>‹</button>
      <button
        type="button"
        className="fymp-hb"
        onClick={() => { setOpen((o) => !o); setPfy(null); setFrom(null); }}
        style={{ flex: 1, minWidth: mob ? 0 : 180, padding: '0 12px', border: '1px solid #D0D5DD', background: '#fff', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left' }}
      >
        <span style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0, lineHeight: 1.15 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#101828', ...ell }}>{label}</span>
          <span style={{ fontSize: 10.5, color: '#667085', ...ell }}>{sub}</span>
        </span>
        <span style={{ color: '#667085', fontSize: 10, flex: 'none' }}>▼</span>
      </button>
      <button type="button" onClick={() => nextOk && emit(a + 1, b + 1)} aria-label="Next month" style={navBtn(nextOk ? 1 : 0.35)}>›</button>

      {open ? (
        <Popover mob={mob} anchorRef={rootRef} onClose={close}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 15, fontWeight: 650 }}>Select months</span>
              <span style={{ fontSize: 12, color: '#667085' }}>{from ? hint : `${hint} · ${n} selected`}</span>
            </div>
            <button type="button" onClick={done} style={{ height: 30, padding: '0 12px', border: 0, background: '#101828', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Done</button>
          </div>

          <div style={{ display: 'flex', background: '#F2F4F7', borderRadius: 9, padding: 3, gap: 2 }}>
            {modes.map(([id, l]) => (
              <button key={id} type="button" onClick={() => setPmode(id)} style={{ flex: 1, height: 32, border: 0, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: id === pmode ? '#fff' : 'transparent', color: id === pmode ? '#101828' : '#475467', boxShadow: id === pmode ? '0 1px 2px rgba(16,24,40,.12)' : 'none', whiteSpace: 'nowrap' }}>{l}</button>
            ))}
          </div>

          {pmode !== 'fy' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button type="button" onClick={() => pfy > fyMin && setPfy(pfy - 1)} aria-label="Previous year" style={yrBtn(pfy > fyMin ? 1 : 0.35)}>‹</button>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{fyL(pfy)}</span>
              <button type="button" onClick={() => pfy < fyMax && setPfy(pfy + 1)} aria-label="Next year" style={yrBtn(pfy < fyMax ? 1 : 0.35)}>›</button>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gap: 6 }}>
            {cells.map((c) => (
              <button key={c.key} type="button" onClick={c.onClick} style={{ height: cellH, borderRadius: 10, border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, cursor: c.cur, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '0 4px', position: 'relative' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</span>
                {c.sub ? <span style={{ fontSize: 10, color: c.sfg, whiteSpace: 'nowrap' }}>{c.sub}</span> : null}
                <span style={{ position: 'absolute', top: 5, right: 6, fontSize: 10, color: c.tick ? '#fff' : 'transparent' }}>{c.tick}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingTop: 10, borderTop: '1px solid #F2F4F7' }}>
            <button type="button" onClick={() => { setFrom(null); emit(CUR, CUR); }} style={{ height: 28, padding: '0 10px', border: 0, background: 'transparent', color: '#C4262B', fontSize: 12, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>Reset to latest</button>
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
