'use client';

import { useMemo, useState } from 'react';
import { Button, Card, Icon, cx, toneFill } from '@/design-system';
import { daysLeft, dueText, rowState, shortDate, targetOf } from '../data/shape';
import { AddSubjectsSheet } from './AddSubjectsSheet';
import { AnnouncementScreen } from './AnnouncementScreen';
import { RecordTabs, StateBar, rowsOfTab } from './RecordTabs';

/* One survey — ONE PAGE for every survey in the app (26 Nov 2026):
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
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const rows = useMemo(() => survey.rows.map((r) => ({ ...r, view: rowState(r, drafts) })), [survey.rows, drafts]);
  const done = rows.filter((r) => r.view === 'done').length;
  const tabRows = useMemo(() => rowsOfTab(rows, tab), [rows, tab]);
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

  /* To do (red) · Submitted (green) · All */
  const tabs = [
    { key: 'todo', label: 'To do', count: rows.length - done, tone: 'danger' },
    { key: 'done', label: 'Submitted', count: done, tone: 'success' },
    { key: 'all', label: 'All', count: rows.length, tone: 'neutral' },
  ];
  const shownNotice = outerNotice || notice;

  /* An announcement: the message to read, not rows to answer. */
  if (survey.kind === 'announcement') return <AnnouncementScreen survey={survey} api={api} onChanged={onChanged} />;

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-11 text-ds-muted">
          <span>from {survey.from || 'Head office'}</span>
          <span aria-hidden="true">·</span>
          <span className={cx(late && 'font-semibold text-danger-text')}>
            {survey.state === 'missed' ? `Closed ${shortDate(survey.due_date)}` : dueText(today, survey.due_date)}
          </span>
        </p>
        {rows.length ? (
          <div className="flex flex-col gap-1.5 border-t border-line-subtle pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-12 text-ds-secondary">Progress</span>
              <span className="tabular-nums text-12">
                <span className="text-16 font-semibold text-heading">{done}</span>
                <span className="text-ds-muted"> of {rows.length} submitted</span>
              </span>
            </div>
            {/* one sorted bar: submitted, in progress, missed, to do */}
            <StateBar rows={rows} />
          </div>
        ) : null}
      </Card>

      {multi || canAdd ? (
        <div className="flex items-center justify-between gap-3">
          {multi ? (
            <div role="tablist" aria-label={`${t.Many}: to do, submitted or all`} className="ds-scroll-x -mx-1 flex gap-1.5 px-1 py-0.5">
              {tabs.map((x) => {
                const on = tab === x.key;
                return (
                  <button
                    key={x.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => onTab?.(x.key)}
                    className={cx('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-12 font-semibold transition-colors', TAB_TONE[x.key][on ? 1 : 0])}
                  >
                    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: toneFill(x.tone) }} />
                    {x.label}
                    <span className="font-medium opacity-80"> · {x.count}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <span />
          )}
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
      {survey.state === 'missed' ? (
        <p role="note" className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-12 text-ds-secondary">
          <Icon name="lock" size="sm" className="shrink-0" />
          This survey has closed. What was sent is shown; the rest can’t be answered now.
        </p>
      ) : null}

      {/* the tab's doctors / records as tags — a tag shows that one's questions below */}
      <RecordTabs rows={tabRows} value={openResponse} ariaLabel={t.Many} showBar={false} onChange={(r) => r !== openResponse && onOpenRow?.(r)} />

      {form ||
        (rows.length ? (
          <p className="py-8 text-center text-12 text-ds-muted">
            {tab === 'done' ? 'Nothing submitted yet.' : tab === 'todo' ? `Nothing left to do — every one is submitted${canAdd ? `. Add more ${t.many} if you met others.` : '. Thank you.'}` : 'Nothing here.'}
          </p>
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
        ))}

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
