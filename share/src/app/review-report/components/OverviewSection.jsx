'use client';

import { Card, Metric, SectionLabel } from '@/design-system';
import { count, monthShort, pct, ratio, rupees } from '../data/format';
import { MonthRows } from './MonthRows';
import { Notice } from './bits';

/* The page a review opens on: the month in eight numbers, the year in one
   chart, and what to look at first. Every number is also in a tab — this
   only picks the headlines. */
export function OverviewSection({ sc, shared, doctors, stock, trendData, month, mi, open, onMonth, attention, onPick }) {
  const net = doctors && !doctors.missing
    ? Object.values(doctors.summary).reduce((t, b) => t + b.delta, 0)
    : null;
  const lost = doctors && !doctors.missing ? doctors.summary.down.count + doctors.summary.dropped.count : null;
  return (
    <div className="flex flex-col gap-4">
      {shared ? (
        <Notice tone="info">
          {shared.hq} is shared by {shared.with} BEs: its target is split equally between them and its primary by each BE&apos;s share of the month&apos;s secondary.
          Secondary, doctors and stockists below are this seat&apos;s own.
        </Notice>
      ) : null}
      <div className="grid grid-cols-2 gap-3 @2xl/report:grid-cols-4">
        <Card padding="app">
          <Metric
            label="Achievement"
            value={sc.hasSales ? pct(sc.ach) : '—'}
            caption={sc.hasSales ? `${rupees(sc.primary)} of ${rupees(sc.target)}` : 'Shown at the manager'}
            tone={sc.ach == null ? 'neutral' : sc.ach >= 1 ? 'success' : sc.ach >= 0.9 ? 'warning' : 'danger'}
            progress={sc.hasSales && sc.target ? { value: Math.round(Math.min(sc.primary, sc.target)), max: Math.round(sc.target) } : undefined}
          />
        </Card>
        <Card padding="app">
          <Metric label="YTD achievement" value={sc.hasSales ? pct(sc.ytdAch) : '—'} caption={`${rupees(sc.ytdPrimary)} of ${rupees(sc.ytdTarget)}`} tone="neutral" />
        </Card>
        <Card padding="app">
          <Metric label="Growth vs last year" value={pct(sc.growth, { sign: true })} caption={`LY ${rupees(sc.primaryLy)}`} tone="neutral" />
        </Card>
        <Card padding="app">
          <Metric label="PCPM" value={rupees(sc.pcpm)} caption={`${count(sc.be, 'BE')} · ${sc.beFilled} filled`} tone="neutral" />
        </Card>
        <Card padding="app">
          <Metric
            label="Secondary"
            value={sc.secondary == null ? 'Not entered' : rupees(sc.secondary)}
            caption={sc.secGrowth != null ? `${pct(sc.secGrowth, { sign: true })} vs last year` : sc.secondaryLy != null ? `LY ${rupees(sc.secondaryLy)}` : ''}
            tone="neutral"
          />
        </Card>
        <Card padding="app">
          <Metric
            label="Primary : secondary"
            value={ratio(sc.priSec)}
            caption={sc.priSec == null ? '' : sc.priSec > 1.15 ? 'Billing ahead of sell-out' : sc.priSec < 0.85 ? 'Sell-out ahead of billing' : 'In step'}
            tone="neutral"
          />
        </Card>
        <Card padding="app">
          <Metric
            label="Doctor support"
            value={doctors?.missing ? 'Not entered' : net == null ? '—' : rupees(net, { sign: true })}
            caption={doctors?.missing ? `No entries for ${monthShort(month)}` : lost != null ? `${lost} doctors down or dropped` : ''}
            tone="neutral"
          />
        </Card>
        <Card padding="app">
          <Metric
            label="Overstocked"
            value={stock?.missing ? '—' : `${stock.summary.over} of ${stock.summary.stockists}`}
            caption={stock?.missing ? 'No secondary entered' : `${rupees(stock.summary.excess)} above 2× · ${stock.summary.chronic} chronic`}
            tone="neutral"
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Target, primary and secondary</SectionLabel>
        <Card padding="app">
          <MonthRows data={trendData} selected={mi} onSelect={onMonth} open={open} />
        </Card>
      </div>

      <div>
        <SectionLabel>Look at first</SectionLabel>
        <Card padding="none">
          {attention.length ? (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {attention.slice(0, 12).map((a) => (
                <li key={a.text}>
                  <button
                    type="button"
                    disabled={!a.sel}
                    onClick={() => a.sel && onPick(a.sel)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left text-13 enabled:cursor-pointer [@media(hover:hover)]:enabled:hover:bg-brand-tint-weak"
                  >
                    <span
                      className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: a.tone === 'danger' ? 'var(--status-rejected)' : 'var(--status-pending)' }}
                      aria-hidden="true"
                    />
                    <span className="text-heading">{a.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-12 text-ds-muted">Nothing stands out for {monthShort(month)}.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
