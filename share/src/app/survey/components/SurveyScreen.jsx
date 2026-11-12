'use client';

import { useMemo, useState } from 'react';
import { Button, Card, ChipRow, Eyebrow, Icon, ProgressBar, cx } from '@/design-system';
import { daysLeft, dueText, rowState, shortDate, targetOf } from '../data/shape';
import { SubjectCard } from './SubjectCard';
import { AddSubjectsSheet } from './AddSubjectsSheet';

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

const TAGGING = { 'Self-tag': 'Self-tag', 'Pre-tag': 'Pre-tag' };

function Tag({ icon, children }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-chip bg-sunken px-2.5 text-11 font-medium text-ds-secondary">
      <Icon name={icon} size="var(--fs-10)" />
      {children}
    </span>
  );
}

export function SurveyScreen({ survey, today, me, drafts, api, onOpenRow, onChanged }) {
  const t = targetOf(survey.target);
  const [filter, setFilter] = useState('all');
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
  const shown = filter === 'all' ? rows : rows.filter((r) => r.view === filter);
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

  const chips = [
    { key: 'all', label: 'All', count: counts.all },
    ...(['new', 'draft', 'done', 'missed']
      .filter((k) => counts[k])
      .map((k) => ({ key: k, label: { new: 'Not started', draft: 'Draft', done: 'Submitted', missed: 'Missed' }[k], count: counts[k] }))),
  ];

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
        {survey.description ? <p className="text-12 text-ds-secondary">{survey.description}</p> : null}
        <div className="flex flex-wrap gap-1.5">
          <Tag icon={survey.target === 'Employees' ? 'users' : survey.target === 'Distributor' ? 'building' : 'user'}>{t.Many}</Tag>
          {TAGGING[survey.tagging] ? <Tag icon={survey.selfTag ? 'user-plus' : 'list'}>{survey.tagging}</Tag> : null}
          {survey.survey_type ? <Tag icon={survey.survey_type === 'Promotion' ? 'megaphone' : 'chart-bar'}>{survey.survey_type === 'Data Collection' ? 'Data collection' : survey.survey_type}</Tag> : null}
        </div>
        {rows.length ? (
          <div className="flex flex-col gap-1.5 border-t border-line-subtle pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-12 text-ds-secondary">Progress</span>
              <span className="tabular-nums text-12">
                <span className="text-16 font-semibold text-heading">{counts.done}</span>
                <span className="text-ds-muted"> of {rows.length} submitted</span>
              </span>
            </div>
            <ProgressBar value={counts.done} max={rows.length} size="sm" tone={counts.done === rows.length ? 'success' : 'brand'} label={`${counts.done} of ${rows.length} submitted`} />
          </div>
        ) : null}
      </Card>

      {survey.state === 'done' && rows.length ? (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success-wash px-3 py-2 text-12 font-medium text-success">
          <Icon name="check-circle" size="sm" />
          All submitted{canAdd ? ` — add more ${t.many} if you met others.` : '. Thank you.'}
        </p>
      ) : null}
      {survey.state === 'missed' ? (
        <p role="note" className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-12 text-ds-secondary">
          <Icon name="lock" size="sm" className="shrink-0" />
          This survey has closed. What was sent is shown; the rest can’t be answered now.
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success-wash px-3 py-2 text-12 font-medium text-success">
          <Icon name="check-circle" size="sm" />
          {notice}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 pt-1">
        <Eyebrow as="h2">{survey.target === 'Employees' ? 'Your survey' : t.Many}</Eyebrow>
        {canAdd ? (
          <Button type="primary" size="sm" icon={<Icon name="plus" size="sm" />} onClick={() => setAdding(true)}>
            Add {t.one}
          </Button>
        ) : null}
      </div>
      {rows.length > 3 ? <ChipRow items={chips} value={filter} onChange={setFilter} ariaLabel={`Filter ${t.many}`} /> : null}

      {rows.length ? (
        <div className="grid gap-2 @2xl/survey:grid-cols-2">
          {shown.map((r) => (
            <SubjectCard key={r.response} subject={r.subject ? { ...r.subject, extra: r.subject.extra } : null} me={me?.full_name} state={r.view} onOpen={() => onOpenRow(r.response)} />
          ))}
        </div>
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
