'use client';

import { useMemo, useState } from 'react';
import { Avatar, Button, Card, DisclosureRow, Eyebrow, Field } from '@/design-system';
import { formatDayHeading, hqLabel } from '../data/format';
import { doctorsVisited } from '../data/selectors';
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
export function DoctorVisitsCard({ rows = [], team = [], loading = false, error = null, isMine = false, periodLabel, scopeLabel }) {
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const doctors = useMemo(() => doctorsVisited(rows, team), [rows, team]);
  const shownDoctors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter((d) =>
      [d.doctorName, d.doctorId, d.city, d.specialty, ...d.people.map((p) => p.name)]
        .some((v) => String(v ?? '').toLowerCase().includes(q)),
    );
  }, [doctors, query]);

  const visits = doctors.reduce((n, d) => n + d.visits, 0);
  const visible = shownDoctors.slice(0, limit);

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <Eyebrow as="h3">Doctor-wise visits</Eyebrow>
            <span className="text-12 text-ds-secondary">
              {[periodLabel, scopeLabel].filter(Boolean).join(' · ')}
              {isMine ? ' · the doctors you visited' : ' · who visited each doctor'}
            </span>
          </div>
          {!loading && !error ? (
            <span className="shrink-0 text-right text-13 font-semibold tabular-nums text-heading">
              {doctors.length} <span className="text-11 font-normal text-ds-muted">{doctors.length === 1 ? 'doctor' : 'doctors'}</span>
              <span className="block text-11 font-normal text-ds-muted">{visits} {visits === 1 ? 'visit' : 'visits'}</span>
            </span>
          ) : null}
        </div>

        {doctors.length > 0 ? (
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
            {doctors.length ? 'No doctor matches this search.' : 'No visits in this period.'}
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
  const sub = [doctor.specialty, doctor.city, doctor.hq ? hqLabel(doctor.hq) : null].filter(Boolean).join(' · ');
  return (
    <span className="flex w-full items-start gap-2.5">
      <Avatar name={doctor.doctorName} size="sm" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-13 font-semibold text-heading">{doctor.doctorName}</span>
        <span className="truncate text-10 text-ds-secondary">
          {[doctor.doctorId, sub].filter(Boolean).join(' · ')}
        </span>
        <span className="text-10 text-ds-muted">
          {doctor.people.length} {doctor.people.length === 1 ? 'person' : 'people'} · last {formatDayHeading(doctor.lastDate)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums">
          <span className="text-13 font-semibold text-heading">{doctor.visits}</span>
          <span className="text-11 text-ds-muted"> {doctor.visits === 1 ? 'visit' : 'visits'}</span>
        </span>
        <Chevron open={expanded} />
      </span>
    </span>
  );
}

/* Who went, and when: one line per person, their count and the days. */
function DoctorPeople({ people }) {
  return (
    <table className="w-full table-fixed border-collapse text-11">
      <tbody>
        {people.map((p) => (
          <tr key={p.employeeId} className="align-top">
            <td className="w-2/5 py-1 pr-2">
              <span className="block truncate font-semibold text-heading">{p.name}</span>
              {p.short ? <span className="text-10 text-ds-muted">{p.short}</span> : null}
            </td>
            <td className="py-1 text-right text-ds-secondary">
              <span className="font-semibold text-heading tabular-nums">
                {p.visits} {p.visits === 1 ? 'visit' : 'visits'}
              </span>
              <span className="block text-10 text-ds-muted">{p.dates.map(formatDayHeading).join(', ')}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
