'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Field, Icon, ListRow, Metric, SectionLabel, Sheet, StatusPill } from '@/design-system';
import { LEVELS, doctorExtra, investment } from '../data/selectors';
import { count, monthShort, pct, ratio, rupees } from '../data/format';
import { Empty, Roi } from './bits';
import { DoctorExtra } from './DoctorsSection';
import { MonthGrid } from './MonthGrid';

/* The Tot. Invest. sheet and the investment side of SERVICE DETAILS, from
 * ERP Doctor Service: ₹ by month against last year, by service, and per
 * doctor against the support that doctor gave (support ÷ service).
 *
 * Every FY 26-27 service on production is still Draft, so Drafts count here
 * (the script drops only Rejected). Recurring / Regular is by how often the
 * doctor is serviced (selectors.cadenceOf): every month = recurring; every
 * 3 / 6 / 12 months or once = regular. */

const PAGE = 40;

/* Service (grey) and the support that came back (blue), one pair of bars per
   FY month — the spend and its return side by side. Both on one scale per
   card (the larger of the two). */
function SpendBars({ series }) {
  const max = Math.max(1, ...series.flatMap((p) => [p.service, p.support]));
  return (
    <div className="flex items-end gap-1.5" aria-hidden="true">
      {series.map((p) => (
        <div key={p.month} className="flex flex-col items-center gap-0.5">
          <div className="flex h-8 items-end gap-px">
            <span className="w-1.5 rounded-t-sm" style={{ height: `${(p.service / max) * 100}%`, background: 'var(--status-draft)' }} />
            <span className="w-1.5 rounded-t-sm" style={{ height: `${(p.support / max) * 100}%`, background: 'var(--brand-primary)' }} />
          </div>
          <span className="text-[0.5625rem] leading-none text-ds-muted">{monthShort(p.month).slice(0, 1)}</span>
        </div>
      ))}
    </div>
  );
}

/* One serviced doctor as a card — the Doctors tab card, turned to spend:
 *   name, speciality · category · HQ, and Recurring / Regular (cadence)
 *   service this FY and how many services; ROI overall and on the latest spend
 *   service vs support by month
 *   who serviced them, support this FY, last visit by level
 * Tap for the doctor's full detail. */
function SpendCard({ d, extra, onOpen }) {
  const lv = extra?.lastVisit;
  const visits = extra?.visitsKnown
    ? LEVELS.map((l, k) => (lv?.[k] ? `${l} ${Number(lv[k].slice(8, 10))} ${monthShort(lv[k].slice(0, 7)).slice(0, 3)}` : null)).filter(Boolean)
    : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full w-full flex-col gap-2 rounded-lg bg-[var(--surface-card)] p-3 text-left shadow-[var(--ds-shadow-card)] [@media(hover:hover)]:hover:bg-brand-tint-weak"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-14 font-semibold text-heading">{d.name}</div>
          <div className="truncate text-11 text-ds-muted">
            {[d.spec, d.category && `Cat ${d.category}`, d.hq?.replace(/^HQ-/, '')].filter(Boolean).join(' · ')}
          </div>
        </div>
        {d.cadence ? (
          <StatusPill status={d.cadence.recurring ? 'info' : 'draft'}>
            {d.cadence.recurring ? 'Recurring' : 'Regular'} · {d.cadence.label.toLowerCase()}
          </StatusPill>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-18 font-semibold tabular-nums text-heading">{rupees(d.service)}</div>
          <div className="text-11 text-ds-secondary">{count(d.count, 'service')} this FY</div>
        </div>
        <div className="text-right">
          <div className="text-11 text-ds-muted">ROI</div>
          <div className="text-14"><Roi value={d.roi} /> <span className="text-11 text-ds-muted">overall</span></div>
          {d.latest ? (
            <div className="text-11 text-ds-secondary">
              <Roi value={d.latest.latest} className="text-11" /> on the {monthShort(d.latest.latestMonth).slice(0, 3)} spend
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <SpendBars series={d.series} />
        <span className="text-10 text-ds-muted">
          <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: 'var(--status-draft)' }} />service
          <span className="ml-2 mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: 'var(--brand-primary)' }} />support
        </span>
      </div>

      <dl className="mt-auto grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-t border-[var(--border-subtle)] pt-2 text-11">
        <dt className="text-ds-muted">Serviced by</dt>
        <dd className="truncate text-ds-secondary">{d.seats.join(', ') || '—'}</dd>
        <dt className="text-ds-muted">Support</dt>
        <dd className="truncate text-ds-secondary">{rupees(d.support)} this FY</dd>
        <dt className="text-ds-muted">Last visit</dt>
        <dd className="truncate text-ds-secondary">{visits == null ? 'loading…' : visits.length ? visits.join(' · ') : 'none since Jan'}</dd>
      </dl>
    </button>
  );
}

export function InvestmentSection({ ix, scope, mi, open, onMonth, visitsLoading }) {
  const inv = useMemo(() => investment(ix, scope, mi), [ix, scope, mi]);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [pick, setPick] = useState(null);
  const [allServices, setAllServices] = useState(false);
  const split = inv.split;
  const doctors = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? inv.doctors.filter((d) => `${d.name} ${d.spec ?? ''} ${d.hq ?? ''}`.toLowerCase().includes(s)) : inv.doctors;
  }, [inv, q]);

  const months = inv.months.map((m) => ({ i: m.i, month: m.month }));
  useEffect(() => setShown(PAGE), [q, inv]);
  const at = (i) => inv.months.find((m) => m.i === i);
  const roi = inv.ytd ? inv.supportYtd / inv.ytd : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 @2xl/report:grid-cols-4">
        <Card padding="app">
          <Metric label="Service YTD" value={rupees(inv.ytd)} caption={inv.ytdLy ? `LY ${rupees(inv.ytdLy)} · ${pct(inv.ytd / inv.ytdLy - 1, { sign: true })}` : ''} tone="neutral" />
        </Card>
        <Card padding="app">
          <Metric label={`Service · ${monthShort(ix.months[mi])}`} value={at(mi)?.amount ? rupees(at(mi).amount) : 'Not entered'} caption={at(mi)?.count ? count(at(mi).count, 'service') : ''} tone="neutral" />
        </Card>
        <Card padding="app">
          <Metric label="Support ÷ service" value={ratio(roi)} caption={`${rupees(inv.supportYtd)} support from serviced doctors`} tone="neutral" />
        </Card>
        <Card padding="app">
          <Metric label="Doctors serviced" value={String(inv.doctors.length)} caption="this FY to the month" tone="neutral" />
        </Card>
      </div>

      <div>
        <SectionLabel>Investment by month · ₹</SectionLabel>
        <MonthGrid
          months={months}
          mi={mi}
          open={open}
          onMonth={onMonth}
          rows={[
            { key: 'amt', label: 'Service', value: (i) => at(i)?.amount || null, fmt: (v) => rupees(v), strong: true },
            { key: 'rec', label: 'Recurring', sub: 'monthly doctors', value: (i) => at(i)?.recurring || null, fmt: (v) => rupees(v) },
            { key: 'reg', label: 'Regular', sub: '3M / 6M / yearly / once', value: (i) => at(i)?.regular || null, fmt: (v) => rupees(v) },
            { key: 'n', label: 'Services', value: (i) => at(i)?.count || null },
            { key: 'ly', label: 'Last year', value: (i) => at(i)?.ly || null, fmt: (v) => rupees(v) },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Recurring vs regular · FY to {monthShort(ix.months[mi])}</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Card padding="app">
            <Metric
              label="Recurring"
              value={rupees(split.recurring)}
              caption={`${split.recurringDoctors} doctors serviced every month${inv.ytd ? ` · ${pct(split.recurring / inv.ytd)}` : ''}`}
              tone="neutral"
            />
          </Card>
          <Card padding="app">
            <Metric
              label="Regular"
              value={rupees(split.regular)}
              caption={`${split.regularDoctors} doctors every 3M / 6M / yearly / once${inv.ytd ? ` · ${pct(split.regular / inv.ytd)}` : ''}`}
              tone="neutral"
            />
          </Card>
        </div>
        <p className="text-11 text-ds-muted">
          By each doctor&apos;s usual gap between services since Apr 25: every month = recurring; any longer gap, or a single service = regular.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-end justify-between gap-3">
          <SectionLabel className="mb-0">By service · FY to {monthShort(ix.months[mi])}</SectionLabel>
          <span className="text-11 text-ds-secondary">
            <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle bg-brand" />recurring
            <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: 'var(--status-draft)' }} />regular
          </span>
        </div>
        <Card padding="none">
          {inv.byService.length ? (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {inv.byService.slice(0, allServices ? undefined : 8).map((x) => {
                const top = inv.byService[0].value || 1;
                return (
                  <li key={x.name} className="flex flex-col gap-1.5 px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-13 font-semibold text-heading">{x.name}</span>
                      <span className="shrink-0 text-13 font-semibold tabular-nums text-heading">
                        {rupees(x.value)} <span className="text-11 font-normal text-ds-muted">{inv.ytd ? pct(x.value / inv.ytd) : ''}</span>
                      </span>
                    </div>
                    {/* the service's spend, split by who it went to: monthly (recurring) doctors vs the rest */}
                    <div className="flex h-2 overflow-hidden rounded-sm bg-sunken" style={{ width: `${Math.max(2, (x.value / top) * 100)}%` }} aria-hidden="true">
                      <span className="h-full bg-brand" style={{ width: `${(x.recurring / x.value) * 100}%` }} />
                      <span className="h-full" style={{ width: `${(x.regular / x.value) * 100}%`, background: 'var(--status-draft)' }} />
                    </div>
                    <div className="flex justify-between gap-3 text-11 tabular-nums text-ds-muted">
                      <span>{count(x.count, 'service')} · {count(x.doctors, 'doctor')} · avg {rupees(x.perDoctor)} a doctor</span>
                      <span>{x.recurring ? `${pct(x.recurring / x.value)} recurring` : 'all regular'}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>No services.</Empty>
          )}
          {inv.byService.length > 8 ? (
            <div className="border-t border-[var(--border-subtle)] p-2 text-center">
              <Button onClick={() => setAllServices((v) => !v)}>
                {allServices ? 'Show top 8' : `Show all ${inv.byService.length} services`}
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      <div>
        <SectionLabel>Doctors by service · FY to {monthShort(ix.months[mi])}</SectionLabel>
        <div className="mb-2">
          <Field placeholder="Doctor, speciality or HQ" value={q} onChange={setQ} prefix={<Icon name="search" size="sm" />} />
        </div>
        {doctors.length ? (
          <>
            <div className="grid gap-3 @2xl/report:grid-cols-2">
              {doctors.slice(0, shown).map((d) => (
                <SpendCard key={d.doctor} d={d} extra={doctorExtra(ix, d.doctor, scope, mi)} onOpen={() => setPick(d)} />
              ))}
            </div>
            {doctors.length > shown ? (
              <div className="mt-3 text-center">
                <Button onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, doctors.length - shown)} more of {doctors.length - shown}</Button>
              </div>
            ) : null}
          </>
        ) : (
          <Empty>No doctors serviced.</Empty>
        )}
        <p className="mt-1.5 text-11 text-ds-muted">
          From ERP Doctor Service (Drafts counted — every FY 26-27 service is still Draft). ROI = support ÷ service: overall over the FY; latest = support since the doctor&apos;s latest service ÷ that service.
        </p>
      </div>

      <Sheet
        open={Boolean(pick)}
        onClose={() => setPick(null)}
        title={pick?.name}
        subtitle={pick ? [pick.spec, pick.category && `Cat ${pick.category}`, pick.hq].filter(Boolean).join(' · ') : ''}
      >
        {pick ? (
          <div className="flex flex-col gap-4 p-4">
            <DoctorExtra extra={doctorExtra(ix, pick.doctor, scope, mi)} visitsLoading={visitsLoading} />
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
