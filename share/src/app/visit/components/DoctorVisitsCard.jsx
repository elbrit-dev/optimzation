'use client';

import { useMemo, useState } from 'react';
import { Avatar, Button, Card, DisclosureRow, Field, SegmentedControl } from '@/design-system';
import { formatCurrency, formatPlanDay, hqLabel } from '../data/format';
import { NO_DEPARTMENT, doctorCoverage } from '../data/selectors';
import { Chevron } from './icons';
import { DoctorFilters, GroupByMenu } from './DoctorFilters';

const PAGE = 15;

/* The doctor filters, as the Support report's: which facets, and how each
   reads a doctor. A doctor can sit in several departments, so every facet
   returns a LIST and a doctor matches when any of its values is picked. */
const FACETS = [
  { id: 'specialty', title: 'Speciality', of: (d) => (d.specialty ? [d.specialty] : []), name: (v) => v },
  { id: 'category', title: 'Category', of: (d) => (d.categories?.length ? d.categories : []), name: (v) => v },
  { id: 'hq', title: 'HQ', of: (d) => (d.hq ? [d.hq] : []), name: hqLabel },
  {
    id: 'department',
    title: 'Department',
    of: (d) => [...new Set([
      ...(d.departments ?? []).map((g) => g.department),
      ...d.people.map((p) => p.department).filter(Boolean),
    ])],
    name: (v) => v,
  },
];
const NO_FILTERS = { specialty: [], category: [], hq: [], department: [] };

/* GROUP BY: the top level of the list. HQ is the territory the visit was
   logged under; City is the doctor's own clinic city; Speciality the
   doctor's. City and speciality are typed by hand on the doctor and come in
   every case ("CHENNAI", "Chennai "), so they group on a folded key. Cities
   show in title case; specialities are codes (CP, GP, CARDIO) and show in
   capitals, as the doctor rows print them. An empty one gets its own "No city" / "No speciality"
   group rather than vanishing. */
const titleCase = (v) => String(v).trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const fold = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const GROUPINGS = [
  { id: 'hq', label: 'HQ', key: (d) => d.hq || '', name: (d) => (d.hq ? hqLabel(d.hq) : 'No HQ') },
  { id: 'city', label: 'City', key: (d) => fold(d.city), name: (d) => (fold(d.city) ? titleCase(d.city) : 'No city') },
  { id: 'specialty', label: 'Speciality', key: (d) => fold(d.specialty), name: (d) => (fold(d.specialty) ? fold(d.specialty).toUpperCase() : 'No speciality') },
];

/* Sort applies to the doctors inside each group; the groups keep busiest first. */
const SORTS = [
  ['visits', 'Most visits', (a, b) => b.visits - a.visits || a.doctorName.localeCompare(b.doctorName)],
  ['fewest', 'Fewest visits', (a, b) => a.visits - b.visits || a.doctorName.localeCompare(b.doctorName)],
  ['recent', 'Last visited', (a, b) => (b.lastDate || '').localeCompare(a.lastDate || '') || b.visits - a.visits],
  ['name', 'Name A–Z', (a, b) => a.doctorName.localeCompare(b.doctorName)],
];

/* DOCTOR-WISE VISITS: the scope's done visits read HQ › doctor › department.
 *
 * A doctor's visit count is DEPARTMENT-DAYS (see doctorsVisited): the CND
 * ABM, RBM and BE seeing a doctor together on the 23rd is one CND visit, and
 * the list says who was on it and that it was joint rather than counting
 * each of them. Opening a doctor lists its departments, and under each the
 * days it was seen and by whom.
 *
 * The original note, still true of the data underneath:
 *
 * DOCTOR-WISE VISITS: the scope's done visits read by doctor, the Visit
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
  /* HQ groups the reader has toggled, against a default worked out below:
     one HQ opens on its own, several start closed. A Set of flips rather
     than of open ids, so the default can follow the data without this
     having to be reset. */
  const [flipped, setFlipped] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [limits, setLimits] = useState({});
  const [show, setShow] = useState('all');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [sort, setSort] = useState('visits');
  const [groupBy, setGroupBy] = useState('hq');
  const grouping = GROUPINGS.find((g) => g.id === groupBy) ?? GROUPINGS[0];
  const filterCount = FACETS.reduce((n, f) => n + filters[f.id].length, 0) + (sort === 'visits' ? 0 : 1);
  const changeGrouping = (id) => {
    setGroupBy(id);
    /* Open and paged groups belong to the old grouping's keys. */
    setFlipped(new Set());
    setLimits({});
  };

  const all = useMemo(() => doctorCoverage(rows, mapped, scope, team, support), [rows, mapped, scope, team, support]);
  const visitedCount = all.filter((d) => d.visits > 0).length;
  const notVisitedCount = all.length - visitedCount;
  const doctors = useMemo(
    () => (show === 'visited' ? all.filter((d) => d.visits > 0) : show === 'not' ? all.filter((d) => d.visits === 0) : all),
    [all, show],
  );
  /* Every value each facet can take among the doctors on the current tab,
     with how many doctors carry it — the options the filter panel offers,
     busiest first. */
  const facetOptions = useMemo(() => {
    const out = {};
    for (const f of FACETS) {
      const counts = new Map();
      for (const d of doctors) for (const v of f.of(d)) counts.set(v, (counts.get(v) ?? 0) + 1);
      out[f.id] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || f.name(a.value).localeCompare(f.name(b.value)));
    }
    return out;
  }, [doctors]);
  const shownDoctors = useMemo(() => {
    const q = query.trim().toLowerCase();
    const by = SORTS.find(([id]) => id === sort)?.[2] ?? SORTS[0][2];
    return doctors.filter((d) =>
      FACETS.every((f) => !filters[f.id].length || f.of(d).some((v) => filters[f.id].includes(v)))
      && (!q || [d.doctorName, d.doctorId, d.city, d.specialty, ...d.people.map((p) => p.name)]
        .some((v) => String(v ?? '').toLowerCase().includes(q))))
      .sort(by);
  }, [doctors, query, filters, sort]);
  const toggleFilter = (facet, value) => {
    if (facet === 'sort') setSort(value);
    else {
      setFilters((prev) => {
        const on = prev[facet].includes(value);
        return { ...prev, [facet]: on ? prev[facet].filter((v) => v !== value) : [...prev[facet], value] };
      });
    }
    setLimits({});
  };
  const clearGroup = (facet) => {
    setFilters((prev) => ({ ...prev, [facet]: [] }));
    setLimits({});
  };
  const clearAll = () => {
    setFilters(NO_FILTERS);
    setSort('visits');
    setLimits({});
  };
  const filterGroups = [
    {
      id: 'sort', title: 'Sort by', single: true,
      opts: SORTS.map(([id, label]) => ({ key: id, label, n: '', on: sort === id })),
    },
    ...FACETS.map((f) => ({
      id: f.id,
      title: f.title,
      opts: facetOptions[f.id].map((o) => ({
        key: o.value, label: f.name(o.value), n: String(o.count), on: filters[f.id].includes(o.value),
      })),
    })),
  ];
  /* The picks as removable chips under the search, as on the Support report. */
  const chips = [
    ...(sort === 'visits' ? [] : [{ key: 'sort', label: SORTS.find(([id]) => id === sort)?.[1], onClick: () => setSort('visits') }]),
    ...FACETS.flatMap((f) => filters[f.id].map((v) => ({
      key: `${f.id}:${v}`, label: f.name(v), onClick: () => toggleFilter(f.id, v),
    }))),
  ];

  const visits = all.reduce((n, d) => n + d.visits, 0);

  /* Group › doctors, busiest group first; the doctors keep their own order.
     `hq` on a group is its KEY, whichever grouping made it — the name is
     what the header prints. The empty group goes last. */
  const hqs = useMemo(() => {
    const by = new Map();
    for (const d of shownDoctors) {
      const key = grouping.key(d);
      if (!by.has(key)) by.set(key, { hq: key, name: grouping.name(d), doctors: [], visits: 0, cities: new Set(), hqSet: new Set() });
      const g = by.get(key);
      g.doctors.push(d);
      g.visits += d.visits;
      if (fold(d.city)) g.cities.add(fold(d.city));
      if (d.hq) g.hqSet.add(hqLabel(d.hq));
    }
    return [...by.values()].sort((a, b) =>
      (a.hq === '') - (b.hq === '')
      || b.visits - a.visits || b.doctors.length - a.doctors.length || a.name.localeCompare(b.name));
  }, [shownDoctors, grouping]);
  /* A search opens every HQ it matched in: the reader asked for a doctor,
     not for a list of territories to open one by one. */
  const searching = query.trim() !== '' || FACETS.some((f) => filters[f.id].length > 0);
  const isOpen = (hq) => searching || (hqs.length === 1) !== flipped.has(hq);
  const toggleHq = (hq) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(hq)) next.delete(hq);
      else next.add(hq);
      return next;
    });
  const limitOf = (hq) => limits[hq] ?? PAGE;

  return (
    /* Fills the height the report gives it on a desktop: the controls stay
       put and only the HQ list scrolls. */
    <Card className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-16 font-semibold text-heading">Doctor-wise visits</h3>
            <span className="text-12 text-ds-muted">
              {[periodLabel, scopeLabel].filter(Boolean).join(' · ')}
              {isMine ? ' · your doctors' : " · your team's doctors, who visited and when"}
            </span>
          </div>
          {!loading && !error ? (
            <span className="shrink-0 text-right text-20 font-bold tabular-nums text-heading">
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
              setLimits({});
              setOpenId(null);
            }}
          />
        ) : null}
        {mappedNote && !loading ? <p className="text-11 text-ds-muted">{mappedNote}</p> : null}

        {all.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <Field
                size="sm"
                value={query}
                onChange={(next) => {
                  setQuery(next ?? '');
                  setLimits({});
                }}
                placeholder="Search doctor, code or person…"
                aria-label="Search doctors"
                prefix={<i className="pi pi-search" />}
                className="w-full"
              />
            </div>
            {/* Group by beside Filters — see GroupByMenu. */}
            <GroupByMenu
              options={GROUPINGS.map((g) => ({ id: g.id, label: g.label }))}
              value={groupBy}
              onChange={changeGrouping}
            />
            <DoctorFilters
              groups={filterGroups}
              count={filterCount}
              result={shownDoctors.length}
              onToggle={toggleFilter}
              onClearGroup={clearGroup}
              onClearAll={clearAll}
            />
          </div>
        ) : null}

        {chips.length ? (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.onClick}
                className="flex h-[26px] items-center gap-1.5 rounded-full bg-brand-tint-weak pl-2.5 pr-2 text-12 font-medium text-brand-text"
              >
                {c.label}
                <span className="text-11" aria-hidden="true">✕</span>
                <span className="ds-visually-hidden">Remove</span>
              </button>
            ))}
          </div>
        ) : null}

        {loading ? (
          <p className="py-2 text-12 text-ds-secondary">Loading visits…</p>
        ) : error ? (
          <p className="py-2 text-12 text-danger">Could not load the visits. Try again in a moment.</p>
        ) : shownDoctors.length === 0 ? (
          <p className="py-2 text-12 text-ds-secondary">
            {query.trim() || chips.length
              ? 'No doctors match these filters.'
              : show === 'not'
                ? mappedLoading ? 'Loading the mapped doctors…' : 'Every mapped doctor has been visited.'
                : 'No visits in this period.'}
          </p>
        ) : (
          <div className="flex flex-col gap-2 min-h-0 @5xl/report:flex-1 @5xl/report:overflow-y-auto @5xl/report:pr-1">
            {hqs.map((g) => {
              const open = isOpen(g.hq);
              const limit = limitOf(g.hq);
              return (
                <section key={g.hq || '—'} className="rounded-xl border border-line-subtle">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleHq(g.hq)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-brand-tint-weak"
                  >
                    <GroupHeading group={g} groupBy={groupBy} />
                    <span className="shrink-0 text-14 font-bold tabular-nums text-heading">
                      {g.visits} <span className="text-11 font-normal text-ds-muted">{g.visits === 1 ? 'visit' : 'visits'}</span>
                    </span>
                    <Chevron open={open} />
                  </button>
                  {open ? (
                    <div className="flex flex-col border-t border-line-subtle p-2">
                      {g.doctors.slice(0, limit).map((d) => (
                        <DisclosureRow
                          key={d.doctorId}
                          className="ds-card-row"
                          expandable
                          expanded={openId === d.doctorId}
                          onToggle={() => setOpenId(openId === d.doctorId ? null : d.doctorId)}
                          header={<DoctorHeader doctor={d} expanded={openId === d.doctorId} groupBy={groupBy} />}
                        >
                          <DoctorDepartments doctor={d} />
                        </DisclosureRow>
                      ))}
                      {g.doctors.length > limit ? (
                        <div className="pt-2">
                          <Button type="default" size="sm" onClick={() => setLimits({ ...limits, [g.hq]: limit + PAGE })}>
                            Show more ({g.doctors.length - limit} left)
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

/* A group's heading, drawn for what it groups by. An HQ is a territory, so
   it carries the territory glyph and how many cities its doctors are in; a
   city carries a pin and the HQs its doctors fall under; a speciality is a
   badge, the way the doctor rows print it, with how many HQs see it. */
function GroupHeading({ group: g, groupBy }) {
  const doctors = `${g.doctors.length} ${g.doctors.length === 1 ? 'doctor' : 'doctors'}`;
  const empty = g.hq === '';
  if (groupBy === 'specialty') {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className={`shrink-0 rounded-chip px-2.5 py-1 text-12 font-bold uppercase tracking-wide ${
          empty ? 'bg-sunken text-ds-muted' : 'bg-brand-tint-weak text-brand-text'
        }`}>
          {g.name}
        </span>
        <span className="min-w-0 truncate text-11 text-ds-muted">
          {doctors}{g.hqSet.size ? ` · ${g.hqSet.size} ${g.hqSet.size === 1 ? 'HQ' : 'HQs'}` : ''}
        </span>
      </span>
    );
  }
  const hqs = [...g.hqSet];
  const meta = groupBy === 'city'
    ? [doctors, hqs.length ? `HQ ${hqs.slice(0, 2).join(', ')}${hqs.length > 2 ? ` +${hqs.length - 2}` : ''}` : null]
    : [doctors, g.cities.size ? `${g.cities.size} ${g.cities.size === 1 ? 'city' : 'cities'}` : null];
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
        empty ? 'bg-sunken text-ds-muted' : 'bg-brand-tint-weak text-brand-text'
      }`}>
        <i className={`pi ${groupBy === 'city' ? 'pi-map-marker' : 'pi-building'} text-14`} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-14 font-semibold text-heading">{g.name}</span>
        <span className="truncate text-11 text-ds-muted">{meta.filter(Boolean).join(' · ')}</span>
      </span>
    </span>
  );
}

/* What the row repeats is what the group above it already says: grouped by
   city, the city is dropped from each row, and the speciality likewise. */
function DoctorHeader({ doctor, expanded, groupBy = 'hq' }) {
  const sub = [
    doctor.doctorId,
    groupBy === 'specialty' ? null : doctor.specialty,
    groupBy === 'city' ? null : doctor.city,
    doctor.departments?.length
      ? `${doctor.departments.length} ${doctor.departments.length === 1 ? 'department' : 'departments'}`
      : null,
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
          <span className="rounded-full bg-sunken px-2.5 py-0.5 text-12 font-semibold tabular-nums text-heading">
            {doctor.visits} <span className="text-11 font-normal text-ds-muted">{doctor.visits === 1 ? 'visit' : 'visits'}</span>
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

/* DEPARTMENT › DAY › WHO. One block per department, its visit count being
   the days it was seen; under it one line per day with everyone who went,
   and a Joint tag when that was more than one person. People in scope whose
   seat holds the doctor and who did not go close their department as "No
   visit", so the block still says whose doctor it is. Support, where a seat
   books some, is summed onto its department. */
function DoctorDepartments({ doctor }) {
  const blocks = new Map(
    (doctor.departments ?? []).map((g) => [g.department, { ...g, missing: [], support: 0 }]),
  );
  for (const p of doctor.people) {
    /* Someone who went is already listed under the department of the call
       they were on — a ZSM with no department of their own shows under CND
       when they joined CND. Only a no-show or a seat's support opens a block
       here, or that ZSM would add an empty "No department" to every doctor
       they visited. */
    if (p.visits > 0 && !p.support) continue;
    const dept = p.department || NO_DEPARTMENT;
    if (!blocks.has(dept)) blocks.set(dept, { department: dept, visits: 0, days: [], missing: [], support: 0 });
    const b = blocks.get(dept);
    if (p.visits === 0) b.missing.push(p);
    if (p.support) b.support += p.support;
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      {[...blocks.values()].map((b) => (
        <div key={b.department} className="rounded-lg bg-sunken px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-12 font-semibold text-heading">{b.department}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              {b.support ? (
                <span className="text-10 tabular-nums text-status-info-text">{formatCurrency(b.support)} support</span>
              ) : null}
              {b.visits > 0 ? (
                <span className="text-12 font-semibold tabular-nums text-heading">
                  {b.visits} <span className="text-10 font-normal text-ds-muted">{b.visits === 1 ? 'visit' : 'visits'}</span>
                </span>
              ) : (
                <span className="text-11 font-semibold text-danger">Not visited</span>
              )}
            </span>
          </div>
          {b.days.length || b.missing.length ? (
            <div className="mt-1.5 flex flex-col divide-y divide-line-subtle text-11">
              {b.days.map((day) => (
                <div key={day.date} className="flex items-start gap-2 py-1.5">
                  <span className="w-12 shrink-0 tabular-nums text-ds-secondary">{formatPlanDay(day.date)}</span>
                  <span className="min-w-0 flex-1">
                    {day.people.map((p, i) => (
                      <span key={p.employeeId}>
                        {i > 0 ? ', ' : ''}
                        <span className="font-semibold text-heading">{p.name}</span>
                        {p.short ? <span className="text-10 text-ds-muted"> ({p.short})</span> : null}
                      </span>
                    ))}
                  </span>
                  {day.joint ? (
                    <span className="shrink-0 rounded-full bg-brand-tint-weak px-2 py-0.5 text-10 font-semibold text-brand-text">
                      Joint
                    </span>
                  ) : null}
                </div>
              ))}
              {b.missing.map((p) => (
                <div key={p.employeeId} className="flex items-center gap-2 py-1.5">
                  <span className="w-12 shrink-0 text-ds-muted">—</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-heading">{p.name}</span>
                    {p.short ? <span className="text-10 text-ds-muted"> ({p.short})</span> : null}
                  </span>
                  <span className="shrink-0 font-semibold text-danger">No visit</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
