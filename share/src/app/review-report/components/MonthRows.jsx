'use client';

import { cx } from '@/design-system';
import { lakh, monthShort, pct } from '../data/format';

/* Target vs primary vs secondary — one ROW per month, read like a list.
 *
 * A horizontal bullet per month: the blue bar is primary, the dark tick is
 * the target, the magenta dot is secondary, all on one ₹ scale shared by
 * every row. The numbers sit on the row itself (₹ lakh), so nothing has to
 * be read off an axis; the achievement % leads each row in words and colour
 * (colour is never the only cue). Rows stack, so a phone scrolls down
 * through the year instead of squeezing twelve columns sideways — newest
 * month first, where a review starts.
 *
 * Identity as elsewhere on the page: primary = product blue, secondary = DS
 * magenta (a validated pair), target = neutral ink. Tapping a row selects
 * that month for the whole page. */

function tone(ach) {
  if (ach == null) return 'text-ds-muted';
  if (ach >= 1) return 'text-[var(--status-approved-text)]';
  if (ach >= 0.9) return 'text-[var(--status-pending-text)]';
  return 'text-danger-text';
}

/* Month · % · [the bar, wide only] · three number columns. Narrow, the bar
   drops to a second line under the numbers. Rows and heads share it. */
const ROW = cx(
  'grid grid-cols-[3.25rem_3.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 px-2',
  '@2xl/report:grid-cols-[3.25rem_3.5rem_minmax(0,1fr)_10rem]',
);
const NUMS = 'col-start-3 row-start-1 grid w-[10rem] grid-cols-3 justify-self-end text-right tabular-nums @2xl/report:col-start-4';

export function MonthRows({ data, selected, onSelect, open }) {
  const max = 1.04 * Math.max(1, ...data.flatMap((d) => [d.target ?? 0, d.primary ?? 0, d.secondary ?? 0]));
  const x = (v) => `${Math.max(0, Math.min(1, (v ?? 0) / max)) * 100}%`;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-11 text-ds-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-brand" aria-hidden="true" />
          Primary
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-0.5 rounded bg-heading" aria-hidden="true" />
          Target
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'var(--elbrit-magenta)' }} aria-hidden="true" />
          Secondary
        </span>
        <span className="ml-auto text-ds-muted">₹ lakh</span>
      </div>

      {/* Column heads, on the same grid as the rows. */}
      <div className={cx(ROW, '-mx-2 py-0 text-10 font-medium uppercase tracking-wide text-ds-muted')} aria-hidden="true">
        <span>Month</span>
        <span>Of target</span>
        <span className={NUMS}>
          <span>Primary</span>
          <span>Target</span>
          <span>Sec.</span>
        </span>
      </div>

      <ul className="-mx-2 flex flex-col">
        {[...data].reverse().map((d) => {
          const on = d.i === selected;
          const live = open && d.month >= open;
          return (
            <li key={d.month}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onSelect?.(d.i)}
                aria-label={`${monthShort(d.month)}: primary ${lakh(d.primary)} lakh of ${lakh(d.target)} target, secondary ${d.secondary == null ? 'not entered' : lakh(d.secondary)}`}
                className={cx(ROW, 'w-full rounded-lg py-2 text-left', on ? 'bg-brand-tint-weak' : '[@media(hover:hover)]:hover:bg-sunken')}
              >
                <span className={cx('text-12', on ? 'font-semibold text-heading' : 'text-ds-secondary')}>
                  {monthShort(d.month)}
                  {live ? '*' : ''}
                </span>
                <span className={cx('text-12 font-semibold tabular-nums', tone(d.ach))}>{d.ach == null ? '—' : pct(d.ach)}</span>

                {/* the numbers, one column each: beside the bar when wide, on the first line when narrow */}
                <span className={cx(NUMS, 'text-12')}>
                  <span className="font-semibold text-heading">{lakh(d.primary)}</span>
                  <span className="text-ds-secondary">{lakh(d.target)}</span>
                  <span className="text-heading">{d.secondary == null ? '—' : lakh(d.secondary)}</span>
                </span>

                {/* the bullet */}
                <span
                  className="relative col-span-3 row-start-2 h-4 @2xl/report:col-span-1 @2xl/report:col-start-3 @2xl/report:row-start-1"
                  aria-hidden="true"
                >
                  <span className="absolute inset-y-1 left-0 right-0 rounded-sm bg-sunken" />
                  <span className={cx('absolute inset-y-1 left-0 rounded-sm', on ? 'bg-brand' : 'bg-brand/80')} style={{ width: x(d.primary) }} />
                  {d.target ? (
                    <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded bg-heading" style={{ left: x(d.target) }} />
                  ) : null}
                  {d.secondary != null ? (
                    <span
                      className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--surface-card)]"
                      style={{ left: x(d.secondary), background: 'var(--elbrit-magenta)' }}
                    />
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-10 text-ds-muted">
        ₹ lakh{open ? ' · * still being entered' : ''}
      </p>
    </div>
  );
}
