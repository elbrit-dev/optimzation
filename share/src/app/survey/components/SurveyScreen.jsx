'use client';

import { useMemo, useState } from 'react';
import { Button, Card, ChipRow, Icon, cx } from '@/design-system';
import { daysLeft, dueText, rowState, shortDate, targetOf } from '../data/shape';
import { SubjectCard } from './SubjectCard';
import { AddSubjectsSheet } from './AddSubjectsSheet';
import { AnnouncementScreen } from './AnnouncementScreen';
import { RecordTabs, StateBar, stripOrder } from './RecordTabs';

/* One survey — its own page, opened from its circle on the home strip (the
 * page's top bar, with Back and the title, is SurveyHome's). The header says what it is and who it
 * is from; the tags say who it is for, who picks them (Self-tag / Pre-tag),
 * and why (Data collection / Promotion); then how far ("2 of 4 submitted")
 * and the rows, each opening its form.
 *
 * SELF-TAG, still open: "Add distributor" opens the sheet of the ones this
 * rep covers; Done starts each (survey_start_subject) and they join the
 * list as Not started. PRE-TAG: head office filled the list — no Add.
 * EMPLOYEES: one row, the person's own answers. MISSED: read-only. */

/* 26 Nov 2026 · ONE PLACE TO WORK (all surveys): no Doctors / Pre-tag tags; the progress (with a History
 * button for the submitted ones); two tabs, To do then Submitted; the doctors / records as a strip (to do
 * first, submitted last); then EITHER the open form (`form`, the first one still to do when the survey opens)
 * OR, once a tab is picked, that tab's list of cards. `tab` / `onTab` are the page's; with a form open no
 * tab is picked and picking one leaves the form (the page asks first if answers are unsaved). */
export function SurveyScreen({ survey, today, me, drafts, api, onOpenRow, onChanged, tab = 'todo', onTab, form = null, openResponse = null, notice: outerNotice = null }) {
  const t = targetOf(survey.target, survey.about);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const rows = useMemo(() => survey.rows.map((r) => ({ ...r, view: rowState(r, drafts) })), [survey.rows, drafts]);
  const counts = useMemo(() => {
    const c = { all: rows.length, new: 0, draft: 0, done: 0, missed: 0 };
    for (const r of rows) c[r.view] += 1;
    return c;
  }, [rows]);
  const ordered = useMemo(() => stripOrder(rows), [rows]);
  const todoRows = ordered.filter((r) => r.view !== 'done');
  const doneRows = ordered.filter((r) => r.view === 'done');
  const shown = tab === 'done' ? doneRows : todoRows;
  const multi = rows.length >= 2;
  const days = daysLeft(today, survey.due_date);
  const late = survey.state === 'todo' && days != null && days <= 0;
  const canAdd = survey.selfTag && survey.open;

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

  const tabs = [
    { key: 'todo', label: 'To do', count: todoRows.length },
    { key: 'done', label: 'Submitted', count: doneRows.length },
  ];
  const shownNotice = outerNotice || notice;

  /* An announcement: the message to read, not rows to answer. */
  if (survey.kind === 'announcement') return <AnnouncementScreen survey={survey} api={api} onChanged={onChanged} />;

  return (
    <div className="flex flex-col gap-3">
      {/* The title and Back are the page's top bar (SurveyHome's PageHeader). */}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-11 text-ds-muted">
            <span>from {survey.from || 'Head office'}</span>
            <span aria-hidden="true">·</span>
            <span className={cx(late && 'font-semibold text-danger-text')}>
              {survey.state === 'missed' ? `Closed ${shortDate(survey.due_date)}` : dueText(today, survey.due_date)}
            </span>
          </p>
        </div>
        {survey.description && !form ? <p className="text-12 text-ds-secondary">{survey.description}</p> : null}
        {rows.length ? (
          <div className="flex flex-col gap-1.5 border-t border-line-subtle pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-12 text-ds-secondary">Progress</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-12">
                  <span className="text-16 font-semibold text-heading">{counts.done}</span>
                  <span className="text-ds-muted"> of {rows.length} submitted</span>
                </span>
                {multi ? (
                  <button
                    type="button"
                    onClick={() => onTab?.('done')}
                    aria-label={`History — the ${counts.done} submitted`}
                    title="Submitted"
                    className={cx(
                      'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-11 font-medium transition-colors',
                      !form && tab === 'done' ? 'border-success bg-success-wash text-success' : 'border-line bg-surface text-ds-secondary hover:border-line-strong',
                    )}
                  >
                    <Icon name="history" size="var(--fs-10)" />
                    History
                  </button>
                ) : null}
              </span>
            </div>
            {/* one sorted bar: submitted, in progress, missed, to do — not one dot per row in list order */}
            <StateBar rows={rows} />
          </div>
        ) : null}
      </Card>

      {multi || canAdd ? (
        <div className="flex items-center justify-between gap-3">
          {multi ? <ChipRow items={tabs} value={form ? null : tab} onChange={(k) => onTab?.(k)} ariaLabel={`${t.Many}: to do or submitted`} /> : <span />}
          {canAdd ? (
            <Button type="primary" size="sm" icon={<Icon name="plus" size="sm" />} onClick={() => setAdding(true)}>
              Add {t.one}
            </Button>
          ) : null}
        </div>
      ) : null}

      {shownNotice ? (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success-wash px-3 py-2 text-12 font-medium text-success">
          <Icon name="check-circle" size="sm" />
          {shownNotice}
        </p>
      ) : null}

      {form ? (
        <>
          {/* The doctors / records as tabs: still to do first, the submitted (green) ones at the end. */}
          <RecordTabs rows={ordered} value={openResponse} ariaLabel={t.Many} showBar={false} onChange={(r) => r !== openResponse && onOpenRow?.(r)} />
          {form}
        </>
      ) : null}

      {!form && survey.state === 'done' && rows.length ? (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success-wash px-3 py-2 text-12 font-medium text-success">
          <Icon name="check-circle" size="sm" />
          All submitted{canAdd ? ` — add more ${t.many} if you met others.` : '. Thank you.'}
        </p>
      ) : null}
      {!form && survey.state === 'missed' ? (
        <p role="note" className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-12 text-ds-secondary">
          <Icon name="lock" size="sm" className="shrink-0" />
          This survey has closed. What was sent is shown; the rest can’t be answered now.
        </p>
      ) : null}

      {form ? null : rows.length ? (
        shown.length ? (
          <div className="grid gap-2 @2xl/survey:grid-cols-2 @5xl/survey:grid-cols-3 @7xl/survey:grid-cols-4">
            {shown.map((r) => (
              <SubjectCard key={r.response} subject={r.subject ? { ...r.subject, extra: r.subject.extra } : null} me={me?.full_name} state={r.view} onOpen={() => onOpenRow(r.response)} />
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-12 text-ds-muted">{tab === 'done' ? 'Nothing submitted yet.' : 'Nothing left to do — every one is submitted.'}</p>
        )
      ) : canAdd ? (
        <Card variant="hairline" className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-tint-weak text-brand-text" aria-hidden="true">
            <Icon name="user-plus" size="md" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-13 font-semibold text-heading">{`No ${t.many} added yet`}</p>
            <p className="text-12 text-ds-muted">{`Add the ${t.many} you collected from, then fill the survey for each.`}</p>
          </div>
          <Button type="primary" size="app" icon={<Icon name="plus" size="sm" />} onClick={() => setAdding(true)}>
            Add {t.one}
          </Button>
        </Card>
      ) : (
        <p className="py-8 text-center text-12 text-ds-muted">Nothing to answer here.</p>
      )}

      <AddSubjectsSheet
        open={adding}
        onClose={() => {
          setAdding(false);
          setError(null);
        }}
        survey={survey}
        api={api}
        busy={busy}
        error={error}
        onDone={add}
      />
    </div>
  );
}
