'use client';

import { useMemo, useState } from 'react';
import { Avatar, Button, Card, DisclosureRow, Eyebrow, Field, SegmentedControl } from '@/design-system';
import { formatCurrency, formatPlanDay } from '../data/format';
import { doctorCoverage } from '../data/selectors';
import { Chevron } from './icons';

const PAGE = 15;

/* DOCTOR-WISE VISITS: the scope's done visits read by doctor, the Visit
 * report's answer to the Support report's doctor-wise view. A card in the
 * report's left column, under the HQ chart.
 *
 * The doctors visited in the period and scope the report is showing,
 * most-visited first. Opening one says who went and when — "Ravi (BE) · 3
 * visits · 14 Oct, 9 Oct, 2 Oct" — so a BE reads their own visits to each
 * doctor, and an ABM reads which of their BEs covered which doctor how often.
 * Rows come from the same ERP list as the hourly sheet (elbrit_visit_rows,
 * `visits` mode). */
/* `mapped` (loadMappedDoctors) adds every doctor mapped to the scope's seats,
 * so the ones nobody visited show at 0; `scope` is the team members in scope,
 * whose seats those are. `mappedNote` says why there are none when the scope
 * was too wide to ask for them. */
export function DoctorVisitsCard({
  rows = [], mapped = [], support = [], scope = [], team = [], loading = false, mappedLoading = false, error = null,
  mappedNote = null, isMine = false, periodLabel, scopeLabel,
}) {
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [show, setShow] = useState('all');

  const all = useMemo(() => doctorCoverage(rows, mapped, scope, team, support), [rows, mapped, scope, team, support]);
  const visitedCount = all.filter((d) => d.visits > 0).length;
  const notVisitedCount = all.length - visitedCount;
  const doctors = useMemo(
    () => (show === 'visited' ? all.filter((d) => d.visits > 0) : show === 'not' ? all.filter((d) => d.visits === 0) : all),
    [all, show],
  );
  const shownDoctors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter((d) =>
      [d.doctorName, d.doctorId, d.city, d.specialty, ...d.people.map((p) => p.name)]
        .some((v) => String(v ?? '').toLowerCase().includes(q)),
    );
  }, [doctors, query]);

  const visits = all.reduce((n, d) => n + d.visits, 0);
  const visible = shownDoctors.slice(0, limit);

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <Eyebrow as="h3">Doctor-wise visits</Eyebrow>
            <span className="text-12 text-ds-secondary">
              {[periodLabel, scopeLabel].filter(Boolean).join(' · ')}
              {isMine ? ' · your doctors' : " · your team's doctors, who visited and when"}
            </span>
          </div>
          {!loading && !error ? (
            <span className="shrink-0 text-right text-13 font-semibold tabular-nums text-heading">
              {visitedCount}
              {mapped.length ? <span className="text-11 font-normal text-ds-muted">/{all.length}</span> : null}
              <span className="text-11 font-normal text-ds-muted"> visited</span>
              <span className="block text-11 font-normal text-ds-muted">{visits} {visits === 1 ? 'visit' : 'visits'}</span>
            </span>
          ) : null}
        </div>

        {/* All / Done / Not visited — the not-visited are the mapped
            doctors nobody in scope has seen in this period. */}
        {!loading && !error && all.length > 0 ? (
          <SegmentedControl
            block
            shape="pill"
            ariaLabel="Which doctors"
            items={[
              { id: 'all', label: `All · ${all.length}` },
              { id: 'visited', label: `Done · ${visitedCount}` },
              { id: 'not', label: `Not visited · ${mappedLoading ? '…' : notVisitedCount}` },
            ]}
            value={show}
            onChange={(next) => {
              setShow(next);
              setLimit(PAGE);
              setOpenId(null);
            }}
          />
        ) : null}
        {mappedNote && !loading ? <p className="text-11 text-ds-muted">{mappedNote}</p> : null}

        {all.length > 0 ? (
          <Field
            size="sm"
            value={query}
            onChange={(next) => {
              setQuery(next ?? '');
              setLimit(PAGE);
            }}
            placeholder="Search doctor, code or person…"
            aria-label="Search doctors"
            prefix={<i className="pi pi-search" />}
            className="w-full"
          />
        ) : null}

        {loading ? (
          <p className="py-2 text-12 text-ds-secondary">Loading visits…</p>
        ) : error ? (
          <p className="py-2 text-12 text-danger">Could not load the visits. Try again in a moment.</p>
        ) : shownDoctors.length === 0 ? (
          <p className="py-2 text-12 text-ds-secondary">
            {query.trim()
              ? 'No doctor matches this search.'
              : show === 'not'
                ? mappedLoading ? 'Loading the mapped doctors…' : 'Every mapped doctor has been visited.'
                : 'No visits in this period.'}
          </p>
        ) : (
          <div className="flex flex-col">
            {visible.map((d) => (
              <DisclosureRow
                key={d.doctorId}
                className="ds-card-row"
                expandable
                expanded={openId === d.doctorId}
                onToggle={() => setOpenId(openId === d.doctorId ? null : d.doctorId)}
                header={<DoctorHeader doctor={d} expanded={openId === d.doctorId} />}
              >
                <DoctorPeople people={d.people} />
              </DisclosureRow>
            ))}
            {shownDoctors.length > limit ? (
              <div className="pt-2">
                <Button type="default" size="sm" onClick={() => setLimit(limit + PAGE)}>
                  Show more ({shownDoctors.length - limit} left)
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}

function DoctorHeader({ doctor, expanded }) {
  const sub = [
    doctor.doctorId,
    doctor.specialty,
    doctor.city,
    `${doctor.people.length} ${doctor.people.length === 1 ? 'person' : 'people'}`,
    doctor.lastDate ? `last ${formatPlanDay(doctor.lastDate)}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <span className="flex w-full items-center gap-2">
      <Avatar name={doctor.doctorName} size="sm" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-13 font-semibold text-heading">{doctor.doctorName}</span>
        <span className="truncate text-10 text-ds-secondary">{sub}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        {doctor.visits > 0 ? (
          <span className="text-12 font-semibold tabular-nums text-heading">
            {doctor.visits} <span className="text-10 font-normal text-ds-muted">{doctor.visits === 1 ? 'visit' : 'visits'}</span>
          </span>
        ) : (
          <span className="text-11 font-semibold text-danger">Not visited</span>
        )}
        {doctor.support ? (
          <span className="text-10 tabular-nums text-status-info-text">{formatCurrency(doctor.support)} support</span>
        ) : null}
      </span>
      <Chevron open={expanded} />
    </span>
  );
}

/* Who went, and when — one tight row per person, for a phone: name, role and
   department on the left; visits with their days, and the month's support
   when their seat has some, on the right. No support line, no figure. */
function DoctorPeople({ people }) {
  return (
    <div className="flex flex-col divide-y divide-line-subtle text-11">
      {people.map((p) => (
        <div key={p.employeeId} className="flex items-center gap-2 py-1">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold text-heading">{p.name}</span>
            {p.short || p.department ? (
              <span className="text-10 text-ds-muted"> · {[p.short, p.department].filter(Boolean).join(' · ')}</span>
            ) : null}
          </span>
          <span className="flex shrink-0 flex-col items-end leading-tight">
            {p.visits > 0 ? (
              <span className="tabular-nums text-heading">
                <span className="font-semibold">{p.visits}</span>
                <span className="text-10 text-ds-muted"> · {p.dates.map(formatPlanDay).join(', ')}</span>
              </span>
            ) : (
              <span className="font-semibold text-danger">No visit</span>
            )}
            {p.support ? (
              <span className="text-10 tabular-nums text-status-info-text">{formatCurrency(p.support)} support</span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}
