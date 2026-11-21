'use client';

import { cx, toneFill } from '@/design-system';
import { ROW_TONE } from '../data/shape';

/* A survey's doctors / records as TABS — Support Approval's SubmissionStrip
 * (secondary-approval/components/SubmissionCard.jsx): a bar with a segment
 * per row in its state's colour, then one chip per row, "1 · Ravi", the open
 * one in the heading navy, the dot its state. A chip opens that row's form;
 * a missed row can't be answered, so its chip is disabled. Shown only when
 * the survey has two rows or more. `rows` are the screen's rows with their
 * display state in `view` (shape.rowState). */

const SEGMENT = {
  done: 'bg-success',
  draft: 'bg-warning',
  missed: 'bg-sunken',
  new: 'bg-danger-wash',
};

const firstName = (s) => {
  const t = String(s ?? '').replace(/^Dr\.?\s+/i, '').trim();
  return t.split(/\s+/)[0] || t || '—';
};

export function RecordTabs({ rows, value, onChange, ariaLabel = 'Records', className }) {
  if (!rows || rows.length < 2) return null;
  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div className="flex gap-1" aria-hidden="true">
        {rows.map((r) => (
          <span key={r.response} className={cx('h-1.5 flex-1 rounded-full', r.response === value ? 'bg-heading' : SEGMENT[r.view] ?? SEGMENT.new)} />
        ))}
      </div>
      <div role="tablist" aria-label={ariaLabel} className="ds-scroll-x -mx-1 flex gap-1.5 px-1 py-0.5">
        {rows.map((r, i) => {
          const active = r.response === value;
          const label = r.subject?.label ?? 'Your answers';
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
                'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-11 font-medium transition-colors disabled:opacity-50',
                active ? 'bg-heading text-on-brand' : 'border border-line bg-surface text-ds-secondary hover:border-line-strong',
              )}
            >
              <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: toneFill(ROW_TONE[r.view] ?? 'neutral') }} />
              <span className="whitespace-nowrap">
                {i + 1} · {firstName(label)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
