'use client';

import { cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Icon, StatusPill, cx } from '@/design-system';
import { daysLeft, dueText, isAnswered, rowState, shortDate, targetOf } from '../data/shape';
import { AddSubjectsSheet } from './AddSubjectsSheet';
import { AnnouncementScreen } from './AnnouncementScreen';
import { CircleBadge, RecordTabs, StateBar, initialsOf, rowsOfTab } from './RecordTabs';
import { useBottomNavGap } from './SubjectForm';

/* 26 Nov 2026 (later) · SURVEY STUDIO layout (the artifact the user designed): the progress says "N of M doctors
 * done" with a "History · N" button and "X to do · next: Dr …"; the strip shows the ones still TO DO (unfilled
 * first), then a "Done · N" chip; History shows the submitted ones (green) with a "To do" chip to go back; a
 * Self-tag survey's "+ Add doctor" is the last chip. The page's top bar says "Survey › Dr name".
 *
 * Before (same day): One survey — ONE PAGE for every survey in the app (26 Nov 2026):
 *
 *   ← <the survey's title>            (the page's top bar — SurveyPage / SurveyHome)
 *   from … · due …  /  Progress  2 of 146 submitted  ▓▓░░░░
 *   [To do · 144]  [Submitted · 2]  [All · 146]          (red / green / grey)
 *   [1 · A K Jaiswal] [2 · A K Rai] …                    (that tab's doctors / records as tags)
 *   the picked one: its card and its questions            (`form`)
 *
 * A tag shows that doctor's questions right here (no page of its own); a tab shows its doctors as tags and opens
 * the first. Back (the page's) leaves the survey. The page owns `tab`, the picked row (`openResponse`) and `form`.
 *
 * SELF-TAG, still open: "Add distributor" opens the sheet of the ones this rep covers; Done starts each
 * (survey_start_subject) and they join the list as Not started. PRE-TAG: head office filled the list — no Add.
 * EMPLOYEES: one row, the person's own answers (no tabs). MISSED: read-only. */

/* the tabs' colours: [not picked, picked] */
const TAB_TONE = {
  todo: ['border-danger-border bg-surface text-danger-text', 'border-danger-text bg-danger-wash text-danger-text'],
  done: ['border-success bg-surface text-success', 'border-success bg-success-wash text-success'],
  all: ['border-line bg-surface text-ds-secondary hover:border-line-strong', 'border-heading bg-heading text-on-brand'],
};

export function SurveyScreen({ survey, today, drafts, api, onOpenRow, onChanged, tab = 'todo', onTab, form = null, openResponse = null, notice: outerNotice = null }) {
  const t = targetOf(survey.target, survey.about);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [near, setNear] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  /* 28 Nov 2026 · History as a list: the open doctor's answers show under its row; a tap on it again closes them */
  const [shut, setShut] = useState(false);
  /* 28 Nov 2026 · "All": every one still to do as a list; a card opens its questions to answer right there */
  const [allMode, setAllMode] = useState(false);
  useEffect(() => {
    if (tab !== 'todo') setAllMode(false);
  }, [tab]);
  /* a card tapped in the list comes to the top; opening "All" itself keeps the circles in view */
  const seenRef = useRef(null);
  useEffect(() => {
    const was = seenRef.current;
    seenRef.current = allMode ? openResponse : null;
    if (!allMode || !openResponse || shut || !was || was === openResponse) return;
    const el = typeof document !== 'undefined' ? document.querySelector(`[data-row="${openResponse}"]`) : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [allMode, openResponse, shut]);
  /* 28 Nov 2026 · room under the last thing on every view (To do, History) for the app's fixed bottom navigation */
  const navGap = useBottomNavGap('var(--space-8)');

  const rows = useMemo(() => survey.rows.map((r) => ({ ...r, view: rowState(r, drafts) })), [survey.rows, drafts]);
  const done = rows.filter((r) => r.view === 'done').length;
  const tabRows = useMemo(() => rowsOfTab(rows, tab), [rows, tab]);
  /* 28 Nov 2026 · each one's questions still to answer (its draft on this phone, or what was sent back), for the circles */
  const counts = useMemo(() => {
    const qs = (survey.questions ?? []).filter((q) => q.type !== 'erp_info');
    const out = {};
    rows.forEach((r) => {
      if (r.view === 'done' || r.view === 'missed') return;
      const a = drafts?.[r.response] ?? (r.returned ? r.answers : null) ?? {};
      out[r.response] = qs.filter((q) => !isAnswered(q, a?.[q.id])).length;
    });
    return out;
  }, [rows, drafts, survey.questions]);
  const multi = rows.length >= 2;
  const days = daysLeft(today, survey.due_date);
  const late = survey.state === 'todo' && days != null && days <= 0;
  /* Survey Studio: Self-tag (they add their own) and Both (the mapping, and they can add more) */
  const studio = survey.studio || null;
  const canAdd = (survey.selfTag && survey.open) || (studio?.mode === 'both' && survey.state !== 'missed');
  const minN = studio?.selfMin || 0;
  const maxN = studio?.selfMax || 0;
  const selfEmpty = canAdd && !rows.length;

  const add = async (names) => {
    setBusy(true);
    setError(null);
    const failed = [];
    for (const n of names) {
      try {
        await api.startSubject(survey.campaign, n);
      } catch (e) {
        failed.push(e?.message || n);
      }
    }
    setBusy(false);
    await onChanged();
    if (failed.length) {
      setError(failed.join(' '));
      return;
    }
    setAdding(false);
    setNotice(`${names.length} ${names.length === 1 ? t.one : t.many} added.`);
    setTimeout(() => setNotice(null), 3000);
  };

  const shownNotice = outerNotice || notice;
  const history = tab === 'done';
  const left = rows.length - done;
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;
  const chip = 'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-13 font-medium transition-colors';
  const leading = multi && history ? (
    <button type="button" onClick={() => onTab?.('todo')} className={cx(chip, history ? 'border-line-strong bg-surface text-heading hover:bg-sunken' : TAB_TONE.todo[0])}>
      <Icon name="arrow-left" size="var(--fs-10)" />
      To do · {left}
    </button>
  ) : null;
  const allCircle =
    multi && !history ? (
      <button
        type="button"
        aria-pressed={allMode}
        aria-label={`All ${t.many} as a list, ${left} to do`}
        onClick={() => {
          setShut(false);
          setAllMode((x) => !x);
        }}
        className="group flex w-[4.25rem] shrink-0 flex-col items-center gap-1 pt-1.5"
      >
        <span className="relative">
          <span
            className={cx(
              'flex size-12 items-center justify-center rounded-full transition-colors',
              allMode ? 'bg-heading text-on-brand outline outline-2 outline-offset-2 outline-heading' : 'border border-line-strong bg-surface text-heading group-hover:bg-sunken',
            )}
          >
            <Icon name="list" size="var(--fs-18)" />
          </span>
          <CircleBadge n={left} />
        </span>
        <span className={cx('w-full truncate text-center text-11 leading-4', allMode ? 'font-semibold text-heading' : 'text-ds-secondary')}>All</span>
      </button>
    ) : null;
  const trailing = canAdd ? (
    <button type="button" onClick={() => setAdding(true)} aria-label={`Add a ${t.one}`} className="group flex w-[4.25rem] shrink-0 flex-col items-center gap-1 pt-1.5">
      <span className="flex size-12 items-center justify-center rounded-full border border-dashed border-brand text-brand-text group-hover:bg-brand-tint-weak">
        <Icon name="plus" size="var(--fs-16)" />
      </span>
      <span className="w-full truncate text-center text-11 leading-4 text-brand-text">Add</span>
    </button>
  ) : null;

  const duePill = (
    <StatusPill status={survey.state === 'missed' ? 'neutral' : late ? 'danger' : 'warning'} className="shrink-0">
      {survey.state === 'missed' ? `Closed ${shortDate(survey.due_date)}` : survey.due_date ? `Due ${shortDate(survey.due_date)}` : 'Open'}
    </StatusPill>
  );

  /* An announcement: the message to read, not rows to answer. */
  if (survey.kind === 'announcement') {
    return (
      <div style={{ paddingBottom: navGap }}>
        <AnnouncementScreen survey={survey} api={api} onChanged={onChanged} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" style={{ paddingBottom: navGap }}>
      {/* 28 Nov 2026 · no second big title: the top bar already names the survey. The due date sits in the progress line. */}
      {survey.description ? <p className="text-13 leading-5 text-ds-secondary">{survey.description}</p> : null}
      {selfEmpty || rows.length ? null : <div className="flex justify-end">{duePill}</div>}
      {selfEmpty ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-13 font-medium text-ds-secondary">
            <span className="tabular-nums">
              <span className="text-16 font-semibold text-heading">0</span> of {minN || 1} {t.many} added
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {minN ? <StatusPill status="warning" className="shrink-0">At least {minN}</StatusPill> : null}
              {duePill}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} />
          <p className="text-12 text-ds-muted">Add who you will report on{studio?.approval ? ' · your manager approves each one' : ''}</p>
        </div>
      ) : rows.length ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-13 font-medium text-ds-secondary">
            <span className="whitespace-nowrap tabular-nums">
              <span className="text-16 font-semibold text-heading">{done}</span> of {rows.length} done
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
            {duePill}
            {multi ? (
              <button
                type="button"
                aria-pressed={history}
                aria-label={`History, ${done} done`}
                onClick={() => onTab?.(history ? 'todo' : 'done')}
                className={cx('inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-13 font-medium transition-colors', history ? 'bg-success text-on-brand' : 'bg-success-wash text-success')}
              >
                <Icon name="check" size="var(--fs-14)" />
                History · {done}
              </button>
            ) : null}
            </span>
          </div>
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={done} aria-label={`${done} of ${rows.length} done`}>
            <span className="h-full rounded-full bg-success" style={{ width: `${pct}%`, minWidth: done ? 6 : 0 }} />
          </div>
          {/* 28 Nov 2026 · no "N to do · next: … · N%" line: the count above and the tags below say it */}
        </div>
      ) : null}

      {shownNotice ? (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success-wash px-3 py-2 text-12 font-medium text-success">
          <Icon name="check-circle" size="sm" />
          {shownNotice}
        </p>
      ) : null}
      {survey.state === 'missed' ? (
        <p role="note" className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-12 text-ds-secondary">
          <Icon name="lock" size="sm" className="shrink-0" />
          This survey has closed. What was sent is shown; the rest can’t be answered now.
        </p>
      ) : null}

      {/* the doctors / records still to do as tabs (History: the submitted ones) — a tab shows that one's questions below */}
      {/* 28 Nov 2026 · History is a list (below), not tags */}
      {(multi || canAdd) && !(history && multi) ? (
        <RecordTabs
          rows={tabRows}
          ariaLabel={history ? `${t.Many}: submitted` : `${t.Many}: to do`}
          showBar={false}
          minRows={1}
          leading={history ? leading : allCircle}
          trailing={trailing}
          circles
          counts={counts}
          value={allMode ? null : openResponse}
          onChange={(r) => {
            setAllMode(false);
            setShut(false);
            if (r !== openResponse) onOpenRow?.(r);
          }}
        />
      ) : null}

      {allMode && !history && multi ? (
        <div className="flex flex-col gap-3">
          <p className="text-13 font-medium text-ds-muted">
            {tabRows.length} to do · tap one to answer it here
          </p>
          {tabRows.length ? (
            <ul aria-label={`${t.Many}: to do`} className="flex flex-col gap-3">
              {tabRows.map((r) => {
                const on = r.response === openResponse && !shut;
                const n = counts[r.response];
                const state = r.view === 'missed' ? ['neutral', 'Missed'] : r.returned ? ['danger', 'Sent back'] : r.view === 'draft' ? ['warning', 'Saved'] : ['neutral', 'Not started'];
                return (
                  <li key={r.response} data-row={r.response} className={cx('flex scroll-mt-2 flex-col overflow-hidden rounded-xl border bg-surface shadow-sm', on ? 'border-line-strong' : 'border-line')}>
                    <button
                      type="button"
                      aria-expanded={on}
                      disabled={r.view === 'missed'}
                      onClick={() => {
                        if (r.response === openResponse) setShut((x) => !x);
                        else {
                          setShut(false);
                          onOpenRow?.(r.response);
                        }
                      }}
                      className={cx('flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-sunken disabled:opacity-50', on && 'bg-sunken')}
                    >
                      {/* 28 Nov 2026 · the count is on the circles at the top only; here it is the line under the name */}
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-13 font-semibold text-heading">{initialsOf(r.subject?.label)}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-14 font-semibold text-heading">{r.subject?.label || 'Your answers'}</span>
                        <span className="truncate text-12 tabular-nums text-ds-muted">
                          {[r.subject?.code, n == null ? '' : n ? `${n} question${n === 1 ? '' : 's'} left` : 'Ready to submit'].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <StatusPill status={state[0]} className="shrink-0">
                        {state[1]}
                      </StatusPill>
                      <Icon name="chevron-down" size="var(--fs-12)" className={cx('shrink-0 text-ds-muted transition-transform', on && 'rotate-180')} />
                    </button>
                    {on && form ? <div className="border-t border-line px-3 pb-3.5 pt-3">{cloneElement(form, { inList: true })}</div> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-12 text-ds-muted">Nothing left to do — every one is submitted.</p>
          )}
        </div>
      ) : history && multi ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            {leading}
            <span className="text-13 font-medium text-ds-muted">{tabRows.length} submitted</span>
          </div>
          {tabRows.length ? (
            <ul aria-label={`${t.Many}: submitted`} className="flex flex-col gap-3">
              {tabRows.map((r) => {
                const on = r.response === openResponse && !shut;
                const ap = r.approval?.status;
                const pill = ap === 'Approved' ? ['success', r.approval?.auto ? 'Approved · AI' : 'Approved'] : r.approval ? ['warning', 'Waiting approval'] : ['neutral', 'Submitted'];
                return (
                  /* 28 Nov 2026 · each doctor its own card, with room between them */
                  <li key={r.response} className={cx('flex flex-col overflow-hidden rounded-xl border bg-surface shadow-sm', on ? 'border-line-strong' : 'border-line')}>
                    <button
                      type="button"
                      aria-expanded={on}
                      onClick={() => {
                        if (r.response === openResponse) setShut((x) => !x);
                        else {
                          setShut(false);
                          onOpenRow?.(r.response);
                        }
                      }}
                      className={cx('flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-sunken', on && 'bg-sunken')}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-14 font-semibold text-heading">{r.subject?.label || 'Your answers'}</span>
                        <span className="truncate text-12 tabular-nums text-ds-muted">
                          {[r.subject?.code, r.submitted_on ? `Sent ${shortDate(r.submitted_on)}` : ''].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <StatusPill status={pill[0]} className="shrink-0">
                        {pill[1]}
                      </StatusPill>
                      <Icon name="chevron-down" size="var(--fs-12)" className={cx('shrink-0 text-ds-muted transition-transform', on && 'rotate-180')} />
                    </button>
                    {on && form ? <div className="border-t border-line px-3 pb-3.5 pt-3">{cloneElement(form, { inList: true })}</div> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-12 text-ds-muted">Nothing submitted yet.</p>
          )}
        </div>
      ) : form ||
        (rows.length ? (
          <p className="py-8 text-center text-12 text-ds-muted">
            {tab === 'done' ? 'Nothing submitted yet.' : tab === 'todo' ? `Nothing left to do — every one is submitted${canAdd ? `. Add more ${t.many} if you met others.` : '. Thank you.'}` : 'Nothing here.'}
          </p>
        ) : canAdd ? (
          /* Survey Studio, self-tag: the row starts empty — add from the ERP */
          <div className="flex flex-col gap-3">
            <Card variant="hairline" className="flex flex-col gap-2.5 rounded-xl p-4">
              <p className="text-16 font-semibold leading-[22px] text-heading">{`Add your first ${t.one}`}</p>
              <p className="text-14 text-ds-secondary">{`Each one you add becomes a tab up here.${minN ? ` You need at least ${minN}${maxN ? `, at most ${maxN}` : ''}.` : ''}`}</p>
              <button type="button" onClick={() => { setNear(false); setAdding(true); }} className="flex w-full items-start gap-3 rounded-[10px] border border-line px-3.5 py-3 text-left hover:bg-sunken">
                <Icon name="database" size="md" className="mt-0.5 text-heading" />
                <span className="flex flex-col">
                  <span className="text-15 font-semibold text-heading">Search the ERP</span>
                  <span className="text-14 text-ds-muted">{`By name, code or city. Only ${t.many} already in the ERP can be added.`}</span>
                </span>
              </button>
              {survey.target === 'Doctor' ? (
                <button type="button" onClick={() => { setNear(true); setAdding(true); }} className="flex w-full items-start gap-3 rounded-[10px] border border-line px-3.5 py-3 text-left hover:bg-sunken">
                  <Icon name="map-marker" size="md" className="mt-0.5 text-heading" />
                  <span className="flex flex-col">
                    <span className="text-15 font-semibold text-heading">{`${t.Many} near me`}</span>
                    <span className="text-14 text-ds-muted">From your saved location, 5 km around.</span>
                  </span>
                </button>
              ) : null}
            </Card>
            <button type="button" onClick={() => { setNear(false); setAdding(true); }} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface text-15 font-medium text-brand-text">
              <Icon name="plus" size="sm" />
              {`Add a ${t.one}`}
            </button>
          </div>
        ) : (
          <p className="py-8 text-center text-12 text-ds-muted">Nothing to answer here.</p>
        ))}

      <AddSubjectsSheet
        open={adding}
        onClose={() => {
          setAdding(false);
          setError(null);
        }}
        survey={survey}
        near={near}
        api={api}
        busy={busy}
        error={error}
        onDone={add}
      />
    </div>
  );
}
