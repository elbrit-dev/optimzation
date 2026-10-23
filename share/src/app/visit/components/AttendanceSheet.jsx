'use client';

import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Sheet, toneFill, useRetained } from '@/design-system';
import { attendanceExportFilename, attendanceExportRows } from '../data/attendanceExport';
import { repsInAttendanceState } from '../data/selectors';
import { ATTENDANCE, ATTENDANCE_LABEL, ATTENDANCE_TONE } from '../data/shape';
import { hqLabel } from '../data/format';
import { Chevron } from './icons';
import { PersonDays, PersonLeave } from './PersonCard';
import { PersonTrend } from './PersonTrend';

/* The rows behind an attendance chip: who, specifically, is in this state.
 *
 * "46 not reporting" is a number a manager can do nothing with. The forty-six
 * NAMES are the actual work of the morning, and this is the shortest path
 * from the one to the other — the chip that reports the count is the control
 * that opens the list.
 *
 * THE HOME OVERVIEW'S "REPS REPORTING" PANEL, the same panel the reader meets
 * on the home screen: a kicker and a title, the seven counts as grey tiles
 * (Filled seats the seventh), a Territories box with one bar and a sentence
 * on where the gap is, pills to switch the list without closing the panel,
 * and the people grouped by DEPARTMENT — each with its own bar, "N of M
 * reported · away · vacant" and its count in this list, the biggest first
 * and open. Person rows are the overview's too: avatar, name, rung · HQ, and
 * the state on the right.
 *
 * THE ROWS OPEN ONTO THEIR DAYS over a range — the silent ones listed on the
 * Not reported list, the whole run charted on the Reported one, the leave,
 * other work or holidays on theirs. Since the states went day based the same
 * person is on several lists, and "when" is the question neither the chip
 * nor the count can answer. See canOpen.
 */

const PER_GROUP = 20;
const NO_DEPARTMENT = 'No department';

export function AttendanceSheet({
  state: openState, team, rows, overRange = false, calendar = [], monthDays = [], today = null,
  counts = null, periodWord = 'today', kicker = 'Visit · live today', loadContacts = null, onClose,
}) {
  /* Open on the chip that was pressed, then the reader's to switch with the
     pills. Rendered from the retained value, so the list does not empty
     while the sheet slides away. */
  const opened = useRetained(openState);
  const [picked, setPicked] = useState(null);
  useEffect(() => setPicked(null), [openState]);
  const state = picked ?? opened;
  /* One open row at a time: two open day-tables push the third off the
     screen, and the reader is comparing people, not reading two at once. */
  const [openId, setOpenId] = useState(null);

  /* EVERY state's list, not just the open one: each department's bar splits
     it across all six, and the pills switch between them. Only while the
     sheet is open — six passes over the roster is not free. */
  const lists = useMemo(() => {
    if (!opened) return null;
    const out = {};
    for (const k of ATTENDANCE) out[k] = repsInAttendanceState(team, rows, k, overRange, calendar, monthDays, today);
    return out;
  }, [opened, team, rows, overRange, calendar, monthDays, today]);
  const people = useMemo(() => (state && lists?.[state]) || [], [state, lists]);
  /* The card's own counts when given, so the tiles say what the chip said. */
  const total = (k) => counts?.[k] ?? lists?.[k]?.length ?? 0;
  const deptOf = useMemo(() => new Map(team.map((m) => [m.id, m.department || ''])), [team]);

  /* People by department, with each department's split across the states. */
  const groups = useMemo(() => {
    if (!lists) return [];
    const by = new Map();
    const at = (id) => {
      const key = deptOf.get(id) || NO_DEPARTMENT;
      if (!by.has(key)) by.set(key, { key, of: Object.fromEntries(ATTENDANCE.map((k) => [k, 0])), people: [] });
      return by.get(key);
    };
    for (const k of ATTENDANCE) for (const p of lists[k]) at(p.id).of[k] += 1;
    for (const p of people) at(p.id).people.push(p);
    return [...by.values()]
      .filter((g) => g.people.length > 0)
      .sort((a, b) => b.people.length - a.people.length || a.key.localeCompare(b.key));
  }, [lists, people, deptOf]);
  const deptCount = useMemo(
    () => new Set(team.map((m) => m.department).filter(Boolean)).size,
    [team],
  );

  /* The biggest group opens on its own; the reader's toggles override it. */
  const [openGroups, setOpenGroups] = useState(null);
  const [limits, setLimits] = useState({});
  useEffect(() => { setOpenGroups(null); setLimits({}); setOpenId(null); }, [state]);
  const groupOpen = (key) => (openGroups ? openGroups.has(key) : groups[0]?.key === key);
  const toggleGroup = (key) => setOpenGroups((prev) => {
    const next = new Set(prev ?? (groups[0] ? [groups[0].key] : []));
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  /* FILLED SEATS are every state but Vacant; the sentence is the share of
     them that reported, and where the most of the open list sits. */
  const filled = ATTENDANCE.filter((k) => k !== 'vacant').reduce((n, k) => n + total(k), 0);
  const note = [
    filled ? `${Math.round((total('working') / filled) * 1000) / 10}% of filled seats have reported.` : null,
    state === 'notReporting' && groups[0]?.people.length ? `${groups[0].key} has the most pending.` : null,
  ].filter(Boolean).join(' ');

  /* WHICH ROWS OPEN, and onto what — only over a range, where "which days"
   * is a real question:
   *   Not reported → the silent days, listed.
   *   Reported     → the run of days, as a chart.
   *   Absent / Other work / Holiday → which days, and what kind.
   * Vacant never opens — an empty seat has no days to show. */
  const canOpen = (person) => {
    if (!overRange) return false;
    if (state === 'onLeave') return (person.leaveDays?.length ?? 0) > 0;
    if (state === 'otherWork') return (person.otherWorkDays?.length ?? 0) > 0;
    if (state === 'holiday') return (person.holidayDays?.length ?? 0) > 0;
    if (state === 'working' || state === 'notReporting') return person.days.length > 0;
    return false;
  };

  /* xlsx is loaded on the click, not with the screen: it is a large library
     that only the reader who asks for a file should pay for. */
  const [exporting, setExporting] = useState(false);
  const exportList = async () => {
    setExporting(true);
    try {
      /* Contacts are a nicety, not the list: if ERP will not give them, the
         file still goes out with the names and the days. */
      const [XLSX, contacts] = await Promise.all([
        import('xlsx'),
        loadContacts ? loadContacts().catch(() => null) : null,
      ]);
      const sheet = XLSX.utils.json_to_sheet(
        attendanceExportRows(people, team, state, overRange, calendar, contacts ?? undefined),
      );
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'People');
      XLSX.writeFile(book, attendanceExportFilename(state, calendar));
    } finally {
      setExporting(false);
    }
  };

  const tiles = [
    ...ATTENDANCE.map((k) => ({ key: k, label: ATTENDANCE_LABEL[k], value: total(k), color: toneFill(ATTENDANCE_TONE[k]) })),
    { key: 'filled', label: 'Filled seats', value: filled, color: 'var(--border-default)' },
  ];

  return (
    <Sheet.Root open={openState != null} onOpenChange={(open) => !open && onClose?.()}>
      <Sheet.Popup surface="app">
        <Sheet.Header>
          <div className="flex items-center gap-1.5 text-11 font-semibold uppercase tracking-widest text-ds-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: toneFill('success') }} />
            {kicker}
          </div>
          <Sheet.Title className="!text-20 !font-bold tracking-tight">Reps reporting · {periodWord}</Sheet.Title>
          <Sheet.Description>
            {deptCount ? `${deptCount} ${deptCount === 1 ? 'department' : 'departments'}` : `${people.length} people`}
          </Sheet.Description>
          <Sheet.Close />
        </Sheet.Header>

        <Sheet.Body>
          <div className="flex flex-col gap-4 py-2">
            {/* THE COUNTS, as the overview shows them: grey tiles, two across. */}
            <div className="grid grid-cols-2 gap-2.5">
              {tiles.map((t) => (
                <div key={t.key} className="flex flex-col gap-1 rounded-xl bg-sunken px-4 py-3">
                  <span className="flex items-center gap-2 text-12 text-ds-secondary">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: t.color }} />
                    {t.label}
                  </span>
                  <span className="text-20 font-bold tabular-nums text-heading">{t.value}</span>
                </div>
              ))}
            </div>

            {/* Territories: the whole scope in one bar, and the sentence. */}
            <div className="flex flex-col gap-2.5 rounded-xl border border-line-subtle px-4 py-3.5">
              <span className="text-14 font-semibold text-heading">Territories</span>
              <StateBar of={Object.fromEntries(ATTENDANCE.map((k) => [k, total(k)]))} height="h-2.5" />
              {note ? <span className="text-13 text-ds-secondary">{note}</span> : null}
            </div>

            {/* The lists, as pills. */}
            <div className="ds-scroll-x flex gap-2" role="radiogroup" aria-label="Which list">
              {ATTENDANCE.map((k) => {
                const on = k === state;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPicked(k)}
                    className={`h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-13 font-semibold transition-colors ${
                      on ? 'bg-heading text-white' : 'border border-line bg-surface text-body hover:bg-sunken'
                    }`}
                  >
                    {ATTENDANCE_LABEL[k]} · {total(k)}
                  </button>
                );
              })}
            </div>

            {people.length > 0 ? (
              <div className="flex justify-end">
                {/* Exports the whole list, not the departments on screen. */}
                <Button type="default" size="sm" loading={exporting} onClick={exportList}>
                  Export
                </Button>
              </div>
            ) : (
              <p className="py-6 text-center text-13 text-ds-muted">No one in this list.</p>
            )}

            {groups.map((g) => {
              const open = groupOpen(g.key);
              const away = g.of.onLeave + g.of.otherWork + g.of.holiday;
              const tot = g.of.working + g.of.notReporting + away;
              const limit = limits[g.key] ?? PER_GROUP;
              return (
                <div key={g.key} className="overflow-hidden rounded-xl border border-line-subtle">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleGroup(g.key)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-3 bg-surface px-4 py-3 text-left hover:bg-sunken"
                  >
                    <span className="flex min-w-0 flex-col gap-1.5">
                      <span className="truncate text-14 font-semibold text-heading">{g.key}</span>
                      <StateBar of={g.of} height="h-1.5" />
                      <span className="text-12 text-ds-secondary">
                        {g.of.working} of {tot} reported{away ? ` · ${away} away` : ''} · {g.of.vacant} vacant
                      </span>
                    </span>
                    <span className="text-18 font-bold tabular-nums" style={{ color: toneFill(ATTENDANCE_TONE[state]) }}>
                      {g.people.length}
                    </span>
                    <span className="grid place-items-center text-ds-muted"><Chevron open={open} /></span>
                  </button>
                  {open ? (
                    <div className="flex flex-col bg-surface px-4 pb-2">
                      {g.people.slice(0, limit).map((p) => (
                        <PersonRow
                          key={p.id}
                          person={p}
                          state={state}
                          overRange={overRange}
                          expandable={canOpen(p)}
                          expanded={openId === p.id}
                          onToggle={() => setOpenId(openId === p.id ? null : p.id)}
                        />
                      ))}
                      {g.people.length > limit ? (
                        <button
                          type="button"
                          onClick={() => setLimits({ ...limits, [g.key]: limit + PER_GROUP })}
                          className="border-t border-line-subtle py-2.5 text-left text-12 font-semibold text-brand-text"
                        >
                          + {g.people.length - limit} more in {g.key}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Sheet.Body>
      </Sheet.Popup>
    </Sheet.Root>
  );
}

/* What the right-hand side of a person's row says, in the list's colour. */
function statusOf(p, state, overRange) {
  if (state === 'working') {
    return overRange ? `${p.reportedDays} ${p.reportedDays === 1 ? 'day' : 'days'} · ${p.happened} visits` : `${p.happened} ${p.happened === 1 ? 'visit' : 'visits'}`;
  }
  if (state === 'notReporting') return overRange ? `${p.silentDays} ${p.silentDays === 1 ? 'day' : 'days'} silent` : 'Not reported';
  if (state === 'onLeave') return overRange ? `${p.leaveDays?.length ?? 0} days away` : p.leaveDays?.[0]?.type || 'On leave';
  if (state === 'otherWork') return overRange ? `${p.otherWorkDays?.length ?? 0} days` : p.otherWorkToday?.type || 'Other work';
  if (state === 'holiday') return overRange ? `${p.holidayDays?.length ?? 0} days` : p.holidayToday || 'Holiday';
  return 'Unfilled';
}

/* The overview's person row: avatar, name, rung · HQ, the state. Opens onto
   the days behind it when there are some to show. */
function PersonRow({ person: p, state, overRange, expandable, expanded, onToggle }) {
  const vacant = state === 'vacant';
  const Tag = expandable ? 'button' : 'div';
  return (
    <div className="border-t border-line-subtle first:border-t-0">
      <Tag
        {...(expandable ? { type: 'button', onClick: onToggle, 'aria-expanded': expanded } : {})}
        className={`grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left ${expandable ? 'hover:bg-sunken' : ''}`}
      >
        {vacant ? (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-line text-12 font-bold text-white">—</span>
        ) : (
          <Avatar name={p.name} size="sm" aria-hidden="true" />
        )}
        <span className="min-w-0">
          <span className="block truncate text-14 font-medium text-heading">{p.name}</span>
          <span className="block truncate text-12 text-ds-muted">
            {[p.short, p.hq ? `HQ-${hqLabel(p.hq)}` : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap text-13 font-semibold" style={{ color: toneFill(ATTENDANCE_TONE[state]) }}>
          {statusOf(p, state, overRange)}
          {expandable ? <span className="text-ds-muted"><Chevron open={expanded} /></span> : null}
        </span>
      </Tag>
      {expandable && expanded ? (
        <div className="pb-3">
          {state === 'working' ? <PersonTrend days={p.days} /> : null}
          {state === 'notReporting' ? <PersonDays days={p.days} /> : null}
          {state === 'onLeave' ? <PersonLeave days={p.leaveDays} /> : null}
          {state === 'otherWork' ? <PersonLeave days={p.otherWorkDays} fallback="Other work" /> : null}
          {state === 'holiday'
            ? <PersonLeave days={(p.holidayDays ?? []).map((h) => ({ date: h.date, type: h.name }))} fallback="Holiday" />
            : null}
        </div>
      ) : null}
    </div>
  );
}

/* One bar split across the six states, in the card's own colours. */
function StateBar({ of, height }) {
  const sum = ATTENDANCE.reduce((n, k) => n + (of[k] ?? 0), 0) || 1;
  return (
    <span className={`flex ${height} gap-0.5 overflow-hidden rounded-full bg-sunken`} aria-hidden="true">
      {ATTENDANCE.map((k) => (of[k] ? (
        <span key={k} style={{ width: `${(of[k] / sum) * 100}%`, backgroundColor: toneFill(ATTENDANCE_TONE[k]) }} />
      ) : null))}
    </span>
  );
}
