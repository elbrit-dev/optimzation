'use client';

import { Card, cx } from '@/design-system';
import { monthShort } from '../data/format';

/* A measure × month table — the paper sheets' shape: one column per FY month,
 * one row per measure, names pinned while it scrolls sideways, the selected
 * month washed. Every sheet tab uses it, so they all read the same way.
 *
 *   months  [{ i, month }]
 *   rows    [{ key, label, value: (i) => any, fmt?: (v) => string,
 *              strong?, tone?: (v) => className, sub? }]
 *   total   optional (row) => string — a last "FY" column */
export function MonthGrid({ months, rows, mi, open, onMonth, first = 'Measure', total, dense = false }) {
  const pad = dense ? 'py-1' : 'py-1.5';
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-12 tabular-nums">
          <thead>
            <tr className="text-11 text-ds-muted">
              <th className="sticky left-0 z-10 bg-[var(--surface-card)] px-3 py-2 text-left font-medium">{first}</th>
              {months.map((g) => (
                <th key={g.month} className="px-2 py-2 text-right font-medium">
                  {onMonth ? (
                    <button
                      type="button"
                      onClick={() => onMonth(g.i)}
                      className={cx(
                        'rounded px-1.5 py-0.5',
                        g.i === mi ? 'bg-brand text-on-brand' : '[@media(hover:hover)]:hover:bg-brand-tint-weak',
                      )}
                    >
                      {monthShort(g.month)}
                      {open && g.month >= open ? '*' : ''}
                    </button>
                  ) : (
                    monthShort(g.month)
                  )}
                </th>
              ))}
              {total ? <th className="px-3 py-2 text-right font-medium">FY</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-[var(--border-subtle)]">
                <th
                  scope="row"
                  className={cx(
                    'sticky left-0 z-10 max-w-[12rem] bg-[var(--surface-card)] px-3 text-left font-normal text-ds-secondary',
                    pad,
                    r.strong && 'font-semibold text-heading',
                  )}
                >
                  <span className="block truncate">{r.label}</span>
                  {r.sub ? <span className="block truncate text-10 text-ds-muted">{r.sub}</span> : null}
                </th>
                {months.map((g) => {
                  const v = r.value(g.i);
                  return (
                    <td
                      key={g.month}
                      className={cx(
                        'whitespace-nowrap px-2 text-right',
                        pad,
                        g.i === mi && 'bg-brand-tint-weak',
                        r.strong && 'font-semibold text-heading',
                        r.tone?.(v),
                      )}
                    >
                      {v == null || v === '' ? <span className="text-ds-muted">—</span> : r.fmt ? r.fmt(v) : String(v)}
                    </td>
                  );
                })}
                {total ? <td className={cx('whitespace-nowrap px-3 text-right font-semibold text-heading', pad)}>{total(r)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
