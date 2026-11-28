'use client';

import { useEffect, useRef } from 'react';
import { Icon, cx, toneFill } from '@/design-system';
import { ROW_TONE } from '../data/shape';

/* A survey's doctors / records as TABS — Support Approval's SubmissionStrip
 * (secondary-approval/components/SubmissionCard.jsx): one chip per row,
 * "1 · A Upadhyay", the open one in the heading navy, the dot its state. A
 * chip opens that row's form; a missed row can't be answered, so its chip is
 * disabled. Shown only when the survey has two rows or more. `rows` are the
 * screen's rows with their display state in `view` (shape.rowState).
 *
 * Progress is ONE bar, sorted — submitted (green) from the left, then in
 * progress (amber), then missed (grey), the rest left to do (light red) —
 * with a short legend. It used to be a dot per row in list order, so the
 * green ones looked scattered (and with 100+ rows they were specks). On a
 * form the bar also says which one is open: "Doctor 12 of 146". */

const BAR = [
  ['done', 'bg-success', 'success', 'submitted'],
  ['draft', 'bg-warning', 'warning', 'in progress'],
  ['missed', 'bg-line-strong', 'neutral', 'missed'],
  ['new', 'bg-danger-wash', 'danger', 'to do'],
];

export function countStates(rows) {
  const c = { done: 0, draft: 0, missed: 0, new: 0 };
  (rows ?? []).forEach((r) => { c[r.view in c ? r.view : 'new'] += 1; });
  return c;
}

/* The sorted progress bar + legend (also used by the survey's summary card). */
export function StateBar({ rows, size = 'md', position, className }) {
  const c = countStates(rows);
  const total = (rows ?? []).length || 1;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <div
        className={cx('flex w-full overflow-hidden rounded-full bg-sunken', size === 'sm' ? 'h-1.5' : 'h-2')}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={c.done}
        aria-label={`${c.done} of ${total} submitted`}
      >
        {BAR.map(([k, bg]) => (c[k] ? <span key={k} className={cx('h-full', bg)} style={{ width: `${(c[k] / total) * 100}%` }} /> : null))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-11 text-ds-secondary">
        {BAR.map(([k, , tone, word]) =>
          c[k] ? (
            <span key={k} className="inline-flex items-center gap-1 tabular-nums">
              <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: toneFill(tone) }} />
              {c[k]} {word}
            </span>
          ) : null,
        )}
        {position ? <span className="ml-auto font-medium text-heading tabular-nums">{position}</span> : null}
      </div>
    </div>
  );
}

/* 26 Nov 2026 · the strip's order: what is left to do first (as head office listed it), then the missed
   ones, the submitted (green) ones last. Each row keeps its place in its group. */
const ORDER = { new: 0, draft: 0, missed: 1, done: 2 };
export function stripOrder(rows) {
  return (rows ?? []).map((r, i) => [r, i]).sort((a, b) => (ORDER[a[0].view] ?? 0) - (ORDER[b[0].view] ?? 0) || a[1] - b[1]).map((x) => x[0]);
}
/* The doctors / records a tab shows: To do (not sent yet), Submitted, All — in the strip's order. */
export function rowsOfTab(rows, tab) {
  const o = stripOrder(rows);
  if (tab === 'done') return o.filter((r) => r.view === 'done');
  if (tab === 'all') return o;
  return o.filter((r) => r.view !== 'done');
}
/* The first one still to answer (in the strip's order), other than `except`; after `after` when it can. */
export function nextToDo(rows, { except, after } = {}) {
  const todo = stripOrder(rows).filter((r) => (r.view === 'new' || r.view === 'draft') && r.response !== except);
  if (!todo.length) return null;
  const all = stripOrder(rows);
  const at = after ? all.findIndex((r) => r.response === after) : -1;
  return (at >= 0 ? todo.find((r) => all.indexOf(r) > at) : null) ?? todo[0];
}

/* A chip's name: "Dr A Upadhyay" → "A Upadhyay" (initials alone say nothing); "Dr Arvind Kumar" → "Arvind",
   or "Arvind K" when another row starts with the same first name. */
function chipNames(rows) {
  const parts = rows.map((r) => String(r.subject?.label ?? 'Your answers').replace(/^Dr\.?\s+/i, '').trim().split(/\s+/).filter(Boolean));
  const firsts = parts.map((w) => (w[0] && w[0].length <= 2 ? w.join(' ') : w[0] || '—'));
  return parts.map((w, i) => {
    let n = firsts[i];
    if (!(w[0] && w[0].length <= 2) && w.length > 1 && firsts.filter((x) => x === n).length > 1) n += ` ${w[w.length - 1][0]}`;
    return n.length > 18 ? `${n.slice(0, 17)}…` : n;
  });
}

/* 28 Nov 2026 · a record as a circle: its initials, its short name under it, how many questions are left as a badge */
export const initialsOf = (label) => {
  const w = String(label ?? '').replace(/^Dr\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '·';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase();
};
export function CircleBadge({ n }) {
  if (n == null) return null;
  return n > 0 ? (
    <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-page bg-brand px-1 text-10 font-bold tabular-nums leading-none text-on-brand">
      {n > 99 ? '99+' : n}
    </span>
  ) : (
    <span aria-hidden="true" className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border-2 border-page bg-success text-on-brand">
      <Icon name="check" size="var(--fs-8)" />
    </span>
  );
}

export function RecordTabs({ rows, value, onChange, ariaLabel = 'Records', noun = 'Record', showBar = true, className, minRows = 2, leading = null, trailing = null, circles = false, counts = null }) {
  const listRef = useRef(null);
  /* the open one is always in view in the strip */
  useEffect(() => {
    const el = listRef.current?.querySelector('[aria-selected="true"]');
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [value]);
  if (!rows || (rows.length < minRows && !leading && !trailing)) return null;
  const names = chipNames(rows);
  const at = rows.findIndex((r) => r.response === value);
  return (
    <div className={cx('flex flex-col gap-3', className)}>
      {showBar ? <StateBar rows={rows} size="sm" position={at >= 0 ? `${noun} ${at + 1} of ${rows.length}` : null} /> : null}
      <div ref={listRef} className={cx('ds-scroll-x -mx-1 flex px-1', circles ? 'gap-1 py-1' : 'gap-1.5 py-0.5')}>
        {leading}
        <div role="tablist" aria-label={ariaLabel} className={cx('flex', circles ? 'gap-1' : 'gap-1.5')}>
        {rows.map((r, i) => {
          const active = r.response === value;
          const label = r.subject?.label ?? 'Your answers';
          if (circles) {
            const n = counts ? counts[r.response] : null;
            return (
              <button
                key={r.response}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`${label}${n != null ? (n ? `, ${n} question${n === 1 ? '' : 's'} left` : ', all answered') : ''}`}
                title={label}
                disabled={r.view === 'missed'}
                onClick={() => onChange?.(r.response)}
                className="group flex w-[4.25rem] shrink-0 flex-col items-center gap-1 pt-1.5 disabled:opacity-50"
              >
                <span className="relative">
                  <span
                    className={cx(
                      'flex size-12 items-center justify-center rounded-full text-14 font-semibold transition-colors',
                      active
                        ? 'bg-heading text-on-brand outline outline-2 outline-offset-2 outline-heading'
                        : r.view === 'draft'
                          ? 'border border-warning bg-warning-wash text-warning-text'
                          : r.returned
                            ? 'border border-danger-border bg-danger-wash text-danger-text'
                            : 'border border-line-strong bg-surface text-heading group-hover:bg-sunken',
                    )}
                  >
                    {initialsOf(label)}
                  </span>
                  <CircleBadge n={n} />
                </span>
                <span className={cx('w-full truncate text-center text-11 leading-4', active ? 'font-semibold text-heading' : 'text-ds-secondary')}>{names[i]}</span>
              </button>
            );
          }
          return (
            <button
              key={r.response}
              type="button"
              role="tab"
              aria-selected={active}
              title={label}
              disabled={r.view === 'missed'}
              onClick={() => onChange?.(r.response)}
              className={cx(
                'flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-13 font-medium transition-colors disabled:opacity-50',
                active
                  ? 'border-heading bg-heading text-on-brand'
                  : r.view === 'done'
                    ? 'border-transparent bg-success-wash text-success' /* 26 Nov 2026: submitted = green */
                    : 'border-line-strong bg-surface text-ds-secondary hover:bg-sunken',
              )}
            >
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: toneFill(ROW_TONE[r.view] ?? 'neutral') }} />
              <span className="whitespace-nowrap">
                {i + 1} · {names[i]}
              </span>
            </button>
          );
        })}
        </div>
        {trailing}
      </div>
    </div>
  );
}
