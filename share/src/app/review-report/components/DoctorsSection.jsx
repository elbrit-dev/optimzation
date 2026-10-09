'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, ChipRow, Field, Icon, SectionLabel, Sheet, StatusPill } from '@/design-system';
import { BUCKETS, LEVELS, doctorExtra } from '../data/selectors';
import { count, monthShort, rupees } from '../data/format';
import { Delta, Empty, Notice, Roi, Spark } from './bits';

/* Doctor support for the month against each doctor's own recent average —
 * the paper review's SERVICE DETAILS sheet turned around: instead of 587 rows
 * of numbers, the doctors sorted into what happened to them.
 *
 * The baseline is the average of up to 3 earlier months THAT HAVE DATA, so a
 * month that was never entered (Aug-2026 on production) is skipped rather
 * than read as every doctor dropping to zero. */

const PILL = { new: 'info', up: 'approved', stable: 'draft', down: 'pending', dropped: 'rejected' };
const PAGE = 40;

/* One doctor as a card — the SERVICE DETAILS row made readable:
 *   name, speciality · category · HQ, and the bucket pill
 *   this month's support, against the usual, and the ₹ change
 *   a 6-month trend line (a gap = a month nobody entered)
 *   who supports them, last visit by level, service this FY
 * "New this FY" only on doctors first supported this FY; an old doctor
 * says since when in the small print. Tap for the full detail. */
function DoctorCard({ r, extra, months, from, onOpen }) {
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
          <div className="truncate text-14 font-semibold text-heading">{r.name}</div>
          <div className="truncate text-11 text-ds-muted">
            {[r.spec, r.category && `Cat ${r.category}`, r.hq?.replace(/^HQ-/, '')].filter(Boolean).join(' · ')}
          </div>
        </div>
        <StatusPill status={PILL[r.bucket]}>{BUCKETS.find((b) => b.id === r.bucket)?.label}</StatusPill>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-18 font-semibold tabular-nums text-heading">{rupees(r.current)}</div>
          <div className="text-11 text-ds-secondary">
            usual {rupees(r.baseline)} · <Delta value={r.delta} className="text-11" />
          </div>
        </div>
        <div className="flex flex-col items-end">
          <Spark values={r.series} width={96} height={28} />
          <span className="text-10 text-ds-muted">
            {monthShort(months[from]).slice(0, 3)}–{monthShort(months[from + r.series.length - 1]).slice(0, 3)}
          </span>
        </div>
      </div>

      <dl className="mt-auto grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-t border-[var(--border-subtle)] pt-2 text-11">
        <dt className="text-ds-muted">Supported by</dt>
        <dd className="flex min-w-0 items-center gap-1.5 text-ds-secondary">
          <span className="truncate">{r.seats.join(', ') || '—'}</span>
          {extra?.status === 'NEW' ? (
            <span className="shrink-0 rounded bg-brand-tint-weak px-1.5 font-medium text-brand-text">New this FY</span>
          ) : null}
        </dd>
        <dt className="text-ds-muted">Last visit</dt>
        <dd className="truncate text-ds-secondary">{visits == null ? 'loading…' : visits.length ? visits.join(' · ') : 'none since Jan'}</dd>
        <dt className="text-ds-muted">Service</dt>
        <dd className="truncate text-ds-secondary">
          {extra?.serviceTotal ? `${rupees(extra.serviceTotal)} this FY` : 'none this FY'}
          {extra?.cadence ? <span className="text-ds-secondary"> · {extra.cadence.recurring ? 'Recurring' : 'Regular'} ({extra.cadence.label.toLowerCase()})</span> : null}
          {extra?.status === 'OLD' ? <span className="text-ds-muted"> · supported since {monthShort(extra.first)}</span> : null}
        </dd>
        <dt className="text-ds-muted">ROI</dt>
        <dd className="truncate text-ds-secondary">
          {extra?.roi ? (
            <>
              <Roi value={extra.roi.overall} /> overall · <Roi value={extra.roi.latest} /> on the {monthShort(extra.roi.latestMonth).slice(0, 3)} spend
              <span className="text-ds-muted"> ({extra.roi.months} mo)</span>
            </>
          ) : (
            <span className="text-ds-muted">no service to measure against</span>
          )}
        </dd>
      </dl>
    </button>
  );
}

export function DoctorsSection({ ix, scope, buckets, months, mi, open, onMonth, visitsLoading }) {
  const [bucket, setBucket] = useState('down');
  const [q, setQ] = useState('');
  const [doc, setDoc] = useState(null);
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [bucket, q, buckets]);

  const rows = useMemo(() => {
    if (buckets.missing) return [];
    const s = q.trim().toLowerCase();
    const list = buckets.rows.filter((r) => (bucket === 'all' || r.bucket === bucket)
      && (!s || `${r.name} ${r.spec ?? ''} ${r.hq ?? ''} ${r.seats.join(' ')}`.toLowerCase().includes(s)));
    return bucket === 'up' || bucket === 'new' ? [...list].reverse() : list;
  }, [buckets, bucket, q]);

  if (buckets.missing) {
    return (
      <div className="flex flex-col gap-3">
        <Notice>No doctor support has been entered for {monthShort(months[mi])} in this scope.</Notice>
        {buckets.lastWithData != null ? (
          <div>
            <Button type="primary" onClick={() => onMonth(buckets.lastWithData)}>
              Show {monthShort(months[buckets.lastWithData])} instead
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const items = [
    ...BUCKETS.map((b) => ({ key: b.id, label: b.label, count: buckets.summary[b.id].count })),
    { key: 'all', label: 'All', count: buckets.rows.length },
  ];
  const base = buckets.baseline.map((i) => monthShort(months[i])).reverse().join(', ');
  const isOpen = open && months[mi] >= open;

  return (
    <div className="flex flex-col gap-4">
      {isOpen ? (
        <Notice>
          {monthShort(months[mi])} is still being entered — doctors not yet entered show as &ldquo;Dropped&rdquo;. Review a closed month for the final picture.
        </Notice>
      ) : null}
      <div className="grid grid-cols-2 gap-3 @2xl/report:grid-cols-5">
        {BUCKETS.map((b) => (
          <Card key={b.id} padding="app" onClick={() => setBucket(b.id)} selected={bucket === b.id}>
            <div className="text-11 text-ds-secondary">{b.label}</div>
            <div className="text-20 font-semibold text-heading tabular-nums">{buckets.summary[b.id].count}</div>
            <Delta value={buckets.summary[b.id].delta} className="text-12" />
          </Card>
        ))}
      </div>
      <p className="-mt-2 text-11 text-ds-muted">
        {monthShort(months[mi])} against the average of {base || 'no earlier month'} · a move under 10% or ₹2,000 is &ldquo;stable&rdquo;.
      </p>

      <div>
        <SectionLabel>{count(rows.length, 'doctor')}</SectionLabel>
        <div className="mb-2 flex flex-col gap-2 @2xl/report:flex-row @2xl/report:items-center">
          <ChipRow items={items} value={bucket} onChange={setBucket} ariaLabel="Bucket" className="min-w-0 flex-1" />
          <Field
            placeholder="Doctor, speciality, HQ or BE"
            value={q}
            onChange={setQ}
            prefix={<Icon name="search" size="sm" />}
            className="@2xl/report:w-64"
          />
        </div>
        {rows.length ? (
          <>
            <div className="grid gap-3 @2xl/report:grid-cols-2">
              {rows.slice(0, shown).map((r) => (
                <DoctorCard
                  key={r.doctor}
                  r={r}
                  extra={doctorExtra(ix, r.doctor, scope, mi)}
                  months={months}
                  from={buckets.seriesFrom}
                  onOpen={() => setDoc(r)}
                />
              ))}
            </div>
            {rows.length > shown ? (
              <div className="mt-3 text-center">
                <Button onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more of {rows.length - shown}</Button>
              </div>
            ) : null}
          </>
        ) : (
          <Empty>No doctors in this bucket.</Empty>
        )}
      </div>

      <Sheet open={Boolean(doc)} onClose={() => setDoc(null)} title={doc?.name} subtitle={doc ? [doc.code && `#${doc.code}`, doc.spec, doc.category && `Cat ${doc.category}`, doc.hq].filter(Boolean).join(' · ') : ''}>
        {doc ? (
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={PILL[doc.bucket]}>{BUCKETS.find((b) => b.id === doc.bucket)?.label}</StatusPill>
              <span className="text-12 text-ds-secondary">
                {rupees(doc.current)} against {rupees(doc.baseline)} · <Delta value={doc.delta} />
              </span>
            </div>
            {doc.seats.length ? <p className="text-12 text-ds-secondary">Supported through {doc.seats.join(', ')}</p> : null}
            <DoctorExtra extra={doctorExtra(ix, doc.doctor, scope, mi)} visitsLoading={visitsLoading} />
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

/* OLD / NEW, the last visit by each level, and the service spent this FY:
   the other columns of the SERVICE DETAILS sheet, from ERP. */
function FyTable({ rows, visitsLoading }) {
  const tot = rows.reduce((t, r) => ({
    support: t.support + (r.support ?? 0),
    visits: r.visits ? t.visits.map((v, k) => v + r.visits[k]) : t.visits,
    service: t.service + r.service,
  }), { support: 0, visits: [0, 0, 0, 0], service: 0 });
  const vcell = (v) => {
    if (!v) return <span className="text-ds-muted">{visitsLoading ? '…' : '—'}</span>;
    const n = v.reduce((a, b) => a + b, 0);
    if (!n) return <span className="text-ds-muted">0</span>;
    const parts = LEVELS.map((l, k) => (v[k] ? `${l} ${v[k]}` : null)).filter(Boolean).join(' · ');
    return (
      <>
        <span className="font-medium text-heading">{n}</span>
        <span className="block text-10 text-ds-muted">{parts}</span>
      </>
    );
  };
  return (
    <div>
      <div className="mb-1 text-11 font-medium uppercase tracking-wide text-ds-muted">This FY · month by month</div>
      <table className="w-full text-12 tabular-nums">
        <thead>
          <tr className="text-10 uppercase tracking-wide text-ds-muted">
            <th className="py-1 text-left font-medium">Month</th>
            <th className="py-1 text-right font-medium">Support</th>
            <th className="py-1 text-right font-medium">Visits</th>
            <th className="py-1 text-right font-medium">Service</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-t border-[var(--border-subtle)] align-top">
              <td className="py-1.5 text-ds-secondary">{monthShort(r.month)}</td>
              <td className="py-1.5 text-right font-medium text-heading">
                {r.support == null ? <span className="font-normal text-[var(--status-pending-text)]">not entered</span> : r.support ? rupees(r.support) : <span className="text-ds-muted">—</span>}
              </td>
              <td className="py-1.5 text-right">{vcell(r.visits)}</td>
              <td className="py-1.5 text-right">{r.service ? rupees(r.service) : <span className="text-ds-muted">—</span>}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-[var(--border-subtle)] align-top font-semibold text-heading">
            <td className="py-1.5">FY</td>
            <td className="py-1.5 text-right">{rupees(tot.support)}</td>
            <td className="py-1.5 text-right">{rows.some((r) => r.visits) ? vcell(tot.visits) : vcell(null)}</td>
            <td className="py-1.5 text-right">{tot.service ? rupees(tot.service) : '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function DoctorExtra({ extra, visitsLoading }) {
  if (!extra) return null;
  const lv = extra.lastVisit;
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-3 text-13">
      {extra.fy?.length ? <FyTable rows={extra.fy} visitsLoading={visitsLoading} /> : null}
      <div className="flex justify-between">
        <span className="text-ds-secondary">First supported</span>
        <span className="font-medium text-heading">{extra.first ? `${monthShort(extra.first)} · ${extra.status}` : '—'}</span>
      </div>
      <div>
        <div className="mb-1 text-11 font-medium uppercase tracking-wide text-ds-muted">Last visit</div>
        {extra.visitsKnown ? (
          <div className="grid grid-cols-4 gap-2">
            {LEVELS.map((l, k) => (
              <div key={l} className="rounded-md bg-sunken px-2 py-1.5 text-center">
                <div className="text-10 text-ds-muted">{l}</div>
                <div className="text-12 font-medium tabular-nums text-heading">
                  {lv?.[k] ? `${lv[k].slice(8, 10)} ${monthShort(lv[k].slice(0, 7))}` : '—'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-12 text-ds-muted">{visitsLoading ? 'Loading visits…' : 'Visits not loaded.'}</p>
        )}
      </div>
      {extra.roi ? (
        <div>
          <div className="mb-1 text-11 font-medium uppercase tracking-wide text-ds-muted">ROI · support ÷ service</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-sunken px-3 py-2">
              <div className="text-10 text-ds-muted">Overall · this FY</div>
              <Roi value={extra.roi.overall} className="text-18" />
              <div className="text-11 text-ds-secondary">{rupees(extra.supportTotal)} support on {rupees(extra.serviceTotal)}</div>
            </div>
            <div className="rounded-md bg-sunken px-3 py-2">
              <div className="text-10 text-ds-muted">Latest · {monthShort(extra.roi.latestMonth)} spend</div>
              <Roi value={extra.roi.latest} className="text-18" />
              <div className="text-11 text-ds-secondary">
                {rupees(extra.roi.latestSupport)} support on {rupees(extra.roi.latestAmount)} over {extra.roi.months} mo
              </div>
            </div>
          </div>
          {extra.roi.missing ? (
            <p className="mt-1 text-11 text-[var(--status-pending-text)]">
              {extra.roi.missing} of those months had no support entered in ERP, so the ROI reads low.
            </p>
          ) : null}
        </div>
      ) : null}
      <div>
        <div className="mb-1 text-11 font-medium uppercase tracking-wide text-ds-muted">
          Service this FY · {rupees(extra.serviceTotal)}
          {extra.cadence ? ` · ${extra.cadence.recurring ? 'Recurring' : 'Regular'}, ${extra.cadence.label.toLowerCase()}` : ''}
        </div>
        {extra.service.length ? (
          <ul className="text-12">
            {extra.service.map((x, k) => (
              <li key={k} className="flex justify-between py-0.5">
                <span className="text-ds-secondary">{monthShort(x.month)} · {x.name}</span>
                <span className="tabular-nums text-heading">{rupees(x.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-12 text-ds-muted">None this FY.</p>
        )}
      </div>
    </div>
  );
}
