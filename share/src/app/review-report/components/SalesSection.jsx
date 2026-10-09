'use client';

import { Card, SectionLabel, cx } from '@/design-system';
import { count, lakh, monthShort, pct, ratio, rupees } from '../data/format';
import { Notice } from './bits';

/* The paper review's SALES sheet as COMPARISON CARDS for the selected month.
 *
 * Each card answers one question a review asks, in one plain sentence, and
 * shows it as two labelled bars side by side — the reference (grey) against
 * the actual — so the answer is seen before it is read:
 *
 *   this month     target vs primary
 *   year to date   YTD target vs YTD primary
 *   vs last year   same month last year vs this year
 *   sell-out       primary (billed) vs secondary (sold by stockists)
 *   per BE         PCPM this month vs the YTD average
 *
 * Every bar carries its number; the two bars of a card share one scale
 * (the larger of the two), never across cards. Identity as on the rest of
 * the page: primary = product blue, secondary = DS magenta, a reference
 * (target, last year, YTD average) = neutral grey. The month-by-month view is
 * the Overview's month rows; every value comes from data/selectors.js
 * scorecard (docs/sm-review-plan.md §3).
 *
 * In the Department view it is followed by the department's HQs. */

const hqName = (h) => String(h ?? '').replace(/^HQ-/, '');
const BLUE = 'var(--brand-primary)';
const MAGENTA = 'var(--elbrit-magenta)';
const GREY = 'var(--status-draft)';

function achTone(v) {
  if (v == null) return 'text-heading';
  if (v >= 1) return 'text-[var(--status-approved-text)]';
  if (v < 0.9) return 'text-danger-text';
  return 'text-[var(--status-pending-text)]';
}
const signTone = (v) => (v == null ? 'text-heading' : v < 0 ? 'text-danger-text' : 'text-[var(--status-approved-text)]');

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value ?? 0)));
  return (
    <div className="mt-3 flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-2">
          <span className="truncate text-12 text-ds-secondary">{r.label}</span>
          <span className="h-3 rounded-sm bg-sunken">
            <span
              className="block h-full rounded-sm"
              style={{ width: `${Math.max(0, Math.min(1, (r.value ?? 0) / max)) * 100}%`, background: r.color }}
            />
          </span>
          <span className="text-right text-12 font-semibold tabular-nums text-heading">{r.value == null ? '—' : rupees(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Compare({ title, big, tone, sentence, rows, foot }) {
  return (
    <Card padding="app">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-11 font-medium uppercase tracking-wide text-ds-muted">{title}</span>
        <span className={cx('text-20 font-semibold tabular-nums', tone ?? 'text-heading')}>{big}</span>
      </div>
      <p className="mt-0.5 text-13 text-heading">{sentence}</p>
      {rows ? <Bars rows={rows} /> : null}
      {foot ? <p className="mt-2 text-11 text-ds-muted">{foot}</p> : null}
    </Card>
  );
}

function gapSentence(actual, ref, { ahead, behind, even = 'Exactly on target' }) {
  if (actual == null || ref == null) return '';
  const d = actual - ref;
  if (Math.abs(d) < 1) return even;
  return d > 0 ? `${ahead} ${rupees(d)}` : `${behind} ${rupees(-d)}`;
}

export function SalesSection({ grid, mi, open, shared, hqs }) {
  const sel = grid.find((g) => g.i === mi);
  if (!sel) return null;
  const sc = sel.sc;
  const m = monthShort(sel.month);
  const lyMonth = `${monthShort(sel.month).slice(0, 3)} ${String(Number(sel.month.slice(2, 4)) - 1).padStart(2, '0')}`;
  const nMonths = grid.filter((g) => g.i <= mi).length;
  const live = open && sel.month >= open;

  return (
    <div className="flex flex-col gap-4">
      {shared ? (
        <Notice tone="info">
          {shared.hq} is shared by {shared.with} BEs: target here is split equally between them, primary by each BE&apos;s share of the month&apos;s secondary. The whole HQ is counted at {shared.owner?.name}.
        </Notice>
      ) : null}
      {live ? <Notice>{m} is still being entered — secondary counts only what has been sent.</Notice> : null}

      <div className="grid gap-3 @2xl/report:grid-cols-2">
        {sc.hasSales ? (
          <>
            <Compare
              title={`This month · ${m}`}
              big={pct(sc.ach)}
              tone={achTone(sc.ach)}
              sentence={gapSentence(sc.primary, sc.target, { ahead: 'Ahead of target by', behind: 'Short of target by' })}
              rows={[
                { label: 'Target', value: sc.target, color: GREY },
                { label: 'Primary', value: sc.primary, color: BLUE },
              ]}
            />
            <Compare
              title={`Year to date · ${count(nMonths, 'month')}`}
              big={pct(sc.ytdAch)}
              tone={achTone(sc.ytdAch)}
              sentence={gapSentence(sc.ytdPrimary, sc.ytdTarget, { ahead: 'Ahead of the year’s target by', behind: 'Behind the year’s target by' })}
              rows={[
                { label: 'Target', value: sc.ytdTarget, color: GREY },
                { label: 'Primary', value: sc.ytdPrimary, color: BLUE },
              ]}
            />
            <Compare
              title="Against last year"
              big={sc.growth == null ? '—' : pct(sc.growth, { sign: true })}
              tone={signTone(sc.growth)}
              sentence={sc.primaryLy ? gapSentence(sc.primary, sc.primaryLy, { ahead: `Up on ${lyMonth} by`, behind: `Down on ${lyMonth} by`, even: `Same as ${lyMonth}` }) : 'No sales last year to compare'}
              rows={[
                { label: lyMonth, value: sc.primaryLy, color: GREY },
                { label: m, value: sc.primary, color: BLUE },
              ]}
            />
          </>
        ) : null}

        <Compare
          title="Sell-out"
          big={sc.secondary == null ? 'Not entered' : sc.priSec == null ? '—' : ratio(sc.priSec)}
          sentence={
            sc.secondary == null
              ? `No secondary entered for ${m}`
              : !sc.hasSales
                ? `Stockists sold ${rupees(sc.secondary)}`
                : sc.secondary < sc.primary
                  ? `Stockists sold ${rupees(sc.primary - sc.secondary)} less than was billed`
                  : `Stockists sold ${rupees(sc.secondary - sc.primary)} more than was billed`
          }
          rows={sc.secondary == null ? null : [
            ...(sc.hasSales ? [{ label: 'Primary', value: sc.primary, color: BLUE }] : []),
            { label: 'Secondary', value: sc.secondary, color: MAGENTA },
          ]}
          foot={sc.secGrowth != null ? `Secondary ${pct(sc.secGrowth, { sign: true })} on ${lyMonth} (${rupees(sc.secondaryLy)})` : null}
        />

        {sc.hasSales ? (
          <Compare
            title={`Per BE · ${count(sc.be, 'BE')}, ${sc.beFilled} filled`}
            big={rupees(sc.pcpm)}
            sentence={sc.ytdPcpm ? (sc.pcpm >= sc.ytdPcpm ? `Above the year’s average of ${rupees(sc.ytdPcpm)}` : `Below the year’s average of ${rupees(sc.ytdPcpm)}`) : ''}
            rows={[
              { label: 'YTD avg', value: sc.ytdPcpm, color: GREY },
              { label: m, value: sc.pcpm, color: BLUE },
            ]}
            foot="Primary per BE, vacant seats included (the paper sheet's PCPM)"
          />
        ) : null}
      </div>

      {hqs.length ? (
        <div>
          <SectionLabel>{count(hqs.length, 'HQ')} · {m}</SectionLabel>
          <Card padding="none">
            <ul className="divide-y divide-[var(--border-subtle)]">
              {hqs.map((h) => (
                <li key={h.hq} className="flex items-center gap-3 px-4 py-2.5 text-13">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-heading">{hqName(h.hq)}</div>
                    <div className="truncate text-11 text-ds-muted">counted at {h.owner?.name}</div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className={cx('font-semibold', achTone(h.scorecard.ach))}>{pct(h.scorecard.ach)}</div>
                    <div className="text-11 text-ds-muted">
                      {lakh(h.scorecard.primary)} / {lakh(h.scorecard.target)} L
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
