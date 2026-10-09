'use client';

import { cx } from '@/design-system';
import { rupees } from '../data/format';

/* Small shared pieces of the review: a sparkline, a signed delta, a notice. */

/* A 6-month sparkline. `null` is a month with no data — the line breaks
   there rather than diving to zero. Single series, so no legend: the row
   it sits in names it. */
export function Spark({ values, width = 64, height = 20, tone = 'var(--brand-primary)' }) {
  const nums = values.filter((v) => v != null);
  if (nums.length < 2) return <span className="inline-block" style={{ width, height }} aria-hidden="true" />;
  const max = Math.max(...nums, 1);
  const step = values.length > 1 ? (width - 4) / (values.length - 1) : 0;
  const y = (v) => height - 2 - (v / max) * (height - 4);
  const parts = [];
  let cur = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (cur.length) parts.push(cur);
      cur = [];
    } else cur.push(`${2 + i * step},${y(v)}`);
  });
  if (cur.length) parts.push(cur);
  const last = values.length - 1;
  return (
    <svg width={width} height={height} aria-hidden="true" className="shrink-0 overflow-visible">
      {parts.map((p) => (
        <polyline key={p[0]} points={p.join(' ')} fill="none" stroke={tone} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {values[last] != null ? <circle cx={2 + last * step} cy={y(values[last])} r="2.5" fill={tone} /> : null}
    </svg>
  );
}

/* +₹1.2 L in green, −₹3.4 L in red: the word carries the sign, so colour is
   never the only cue. */
export function Delta({ value, className }) {
  if (value == null || Number.isNaN(value)) return <span className={cx('text-ds-muted', className)}>—</span>;
  const tone = value > 0 ? 'text-[var(--status-approved-text)]' : value < 0 ? 'text-danger-text' : 'text-ds-secondary';
  return <span className={cx('tabular-nums font-medium', tone, className)}>{rupees(value, { sign: true })}</span>;
}

export function Notice({ tone = 'warning', children }) {
  const cls = tone === 'danger'
    ? 'border-danger/30 bg-danger/5 text-danger-text'
    : tone === 'info'
      ? 'border-brand/30 bg-brand-tint-weak text-brand-text'
      : 'border-warning/40 bg-warning/5 text-[var(--status-pending-text)]';
  return <p className={cx('rounded-lg border p-3 text-12', cls)}>{children}</p>;
}

export function Empty({ children }) {
  return <p className="rounded-lg bg-[var(--surface-card)] p-6 text-center text-12 text-ds-muted">{children}</p>;
}

/* MOCK — on every block whose numbers are not from ERP. Loud on purpose:
   the label must survive a screenshot pasted into a review deck. `needs`
   says what wiring replaces it (data/mocks.js). */
export function MockBanner({ what, needs }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-warning bg-warning/5 p-3">
      <span className="shrink-0 rounded bg-[var(--status-pending)] px-1.5 py-0.5 text-10 font-bold uppercase tracking-wider text-heading">
        Mock
      </span>
      <p className="text-12 text-[var(--status-pending-text)]">
        <strong>{what}: sample data, not from ERP.</strong> {needs}
      </p>
    </div>
  );
}

/* A small inline MOCK tag, for one value inside an otherwise real block. */
export function MockTag() {
  return (
    <span className="ml-1 rounded bg-[var(--status-pending)] px-1 py-px align-middle text-[0.625rem] font-bold uppercase tracking-wider text-heading">
      Mock
    </span>
  );
}

/* A ROI (support ÷ service) as "3.5×" — red under 1×, where the doctor's
   support has not yet paid back what was spent on them. */
export function Roi({ value, className }) {
  if (value == null || !Number.isFinite(value)) return <span className={cx('text-ds-muted', className)}>—</span>;
  return (
    <span className={cx('font-semibold tabular-nums', value < 1 ? 'text-danger-text' : 'text-heading', className)}>
      {value >= 10 ? Math.round(value) : value.toFixed(1)}×
    </span>
  );
}
