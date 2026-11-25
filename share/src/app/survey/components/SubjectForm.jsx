'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Icon, ProgressBar } from '@/design-system';
import { PinnedBar, PinnedBarSpacer } from '@/app/secondary-entry/components/PinnedBar';
import { formProblems, isEmpty, shortDate, shortName, targetOf, toPayload } from '../data/shape';
import { filledQuestions } from '../data/view';
import { SubjectCard } from './SubjectCard';
import { QuestionCard } from './QuestionCard';
import { RecordTabs } from './RecordTabs';
import { SurveyView } from './SurveyView';

/* the longest a rep waits for the AI read of a file (the server finishes it anyway) */
const READ_WAIT = 25000;

/* One response — "S2 › D1" (the page's top bar, SurveyHome's): the survey's questions for one distributor,
 * doctor, or the person themself. Secondary Entry's EntryForm, with
 * questions where it has products.
 *
 * TODO rows are answered; DONE and MISSED rows are read-only (the answers
 * sent, or what was never sent).
 *
 * Save for later keeps the answers ON THIS DEVICE (`onDraft`) — the ERP has no
 * draft; its own my-surveys page keeps them locally too. Submit checks every
 * question first (shape.formProblems — the server checks again) and shows
 * each problem under its question, scrolling to the first. It waits for any
 * file still uploading. The server's refusal, if any, is shown as it says it
 * (SURVEYS_CONTEXT.md §4). `onAnswersChange` hears the answers as they are
 * now, so the page's "Leave this form?" can save them for later. */
export function SubjectForm({ survey, row, rows, me, draft, api, onBack, onDraft, onSubmitted, onDirtyChange, onAnswersChange, onSwitchRow, bottomGap = 'var(--space-12)' }) {
  /* The questions with this record's values in their {#fields} (data/view.js). */
  const questions = useMemo(() => filledQuestions(survey, row), [survey, row]);
  const rootRef = useRef(null);
  const [barHeight, setBarHeight] = useState(0);
  const editable = row.state === 'todo';
  const start = useMemo(() => (editable ? (draft ?? {}) : (row.answers ?? {})), [editable, draft, row.answers]);
  const [answers, setAnswers] = useState(start);
  /* What is kept: the opening answers, then the last ones saved for later. */
  const [baseline, setBaseline] = useState(() => JSON.stringify(start));
  const dirty = editable && JSON.stringify(answers) !== baseline;
  const [tried, setTried] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [sent, setSent] = useState(false);

  const onDirtyRef = useRef(onDirtyChange);
  onDirtyRef.current = onDirtyChange;
  useEffect(() => onDirtyRef.current?.(dirty && !sent), [dirty, sent]);
  useEffect(() => () => onDirtyRef.current?.(false), []);
  const onAnswersRef = useRef(onAnswersChange);
  onAnswersRef.current = onAnswersChange;
  useEffect(() => {
    if (editable) onAnswersRef.current?.(answers);
  }, [editable, answers]);

  const problems = useMemo(() => formProblems(questions, answers), [questions, answers]);
  const answered = questions.filter((q) => !isEmpty(answers[q.id])).length;
  const required = questions.filter((q) => q.required);
  const requiredLeft = required.filter((q) => isEmpty(answers[q.id])).length;

  /* Count uploads in flight, so Submit waits for them. */
  /* 23 Nov 2026: a question with an AI schema — the file is read right after it
     is stored (api.readFile; our server keeps what it read for Survey Center).
     The upload stays "in progress" while it is read, at most READ_WAIT; the rep
     only learns whether it could be read (res.read.readable). */
  const upload = (file, onProgress, q) => {
    setUploading((n) => n + 1);
    return api
      .uploadFile(file, onProgress)
      .then(async (res) => {
        if (!q?.ai?.schema || typeof api.readFile !== 'function') return res;
        const read = await Promise.race([
          api.readFile({ response: row.response, question: q.id, file_url: res.file_url, file }),
          new Promise((r) => setTimeout(() => r(null), READ_WAIT)),
        ]).catch(() => null);
        return { ...res, read };
      })
      .finally(() => setUploading((n) => n - 1));
  };

  const saveDraft = () => {
    onDraft(answers);
    setBaseline(JSON.stringify(answers));
    setNotice('Saved on this device — tap Submit when you’re ready to send.');
    setTimeout(() => setNotice(null), 2500);
  };

  const submit = async () => {
    setTried(true);
    setError(null);
    const first = questions.find((q) => problems[q.id]);
    if (first) {
      rootRef.current?.querySelector(`[data-question="${first.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setBusy('submit');
    try {
      await api.submitResponse(row.response, toPayload(questions, answers));
      onDraft(null);
      setSent(true);
      onSubmitted?.(row);
      rootRef.current?.scrollIntoView?.({ block: 'start' });
    } catch (e) {
      setError(e?.message || 'Could not send. Try again.');
    } finally {
      setBusy(null);
    }
  };

  if (sent) {
    return (
      <div ref={rootRef} className="flex flex-col gap-3">
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-success-wash text-success" aria-hidden="true">
            <Icon name="check" size="var(--fs-24)" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-16 font-semibold text-heading">Submitted</h2>
            <p className="text-12 text-ds-secondary">
              {row.subject ? `Your answers for ${row.subject.label} were sent.` : 'Your answers were sent.'} Thank you.
            </p>
          </div>
          <Button type="primary" size="lg" onClick={onBack}>
            Back to {shortName(survey.title)}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      {/* The survey's doctors / records as tabs (Support Approval's strip): a chip opens that one's form. */}
      <RecordTabs
        rows={rows}
        value={row.response}
        ariaLabel={targetOf(survey.target, survey.about).Many}
        noun={((o) => o.charAt(0).toUpperCase() + o.slice(1))(targetOf(survey.target, survey.about).one)}
        onChange={(next) => {
          if (next !== row.response) onSwitchRow?.(next, dirty ? answers : null);
        }}
      />
      <SubjectCard subject={row.subject} me={me} state={row.state === 'todo' ? (draft ? 'draft' : 'new') : row.state} />
      <SurveyView survey={survey} row={row} />

      <Card className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-12 font-semibold text-heading">{survey.title}</span>
          <span className="shrink-0 text-12 tabular-nums">
            <span className="font-semibold text-heading">{answered}</span>
            <span className="text-ds-muted">/{questions.length} answered</span>
          </span>
        </div>
        <ProgressBar value={answered} max={questions.length || 1} size="sm" tone={requiredLeft ? 'brand' : 'success'} label={`${answered} of ${questions.length} answered`} />
      </Card>

      {row.state === 'done' ? (
        <p role="note" className="flex items-center gap-2 rounded-lg bg-success-wash px-3 py-2 text-12 text-success">
          <Icon name="check-circle" size="sm" className="shrink-0" />
          Submitted{row.submitted_on ? ` on ${shortDate(row.submitted_on)}` : ''} — these are the answers you sent.
        </p>
      ) : null}
      {row.state === 'missed' ? (
        <p role="note" className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-12 text-ds-secondary">
          <Icon name="lock" size="sm" className="shrink-0" />
          This survey closed{row.closed_on ? ` on ${shortDate(row.closed_on)}` : ''} before it was sent. It can’t be answered now.
        </p>
      ) : null}

      {questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          q={q}
          index={i}
          value={answers[q.id]}
          readOnly={!editable}
          disabled={Boolean(busy)}
          error={tried ? problems[q.id] : null}
          onUpload={upload}
          api={api}
          response={row.response}
          onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
        />
      ))}

      {editable ? (
        <>
          <PinnedBarSpacer height={barHeight} bottomGap={bottomGap} />
          <PinnedBar anchorRef={rootRef} bottomGap={bottomGap} onHeight={setBarHeight}>
            <Card className="flex flex-col gap-2 shadow-pop" role="region" aria-label="Send this survey">
              {error ? (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-wash px-3 py-2 text-11 text-danger-text">
                  <Icon name="exclamation-circle" size="sm" className="mt-px shrink-0" />
                  <span>{error}</span>
                </p>
              ) : null}
              {notice ? (
                <p role="status" className="flex items-center gap-2 text-11 font-medium text-success">
                  <Icon name="check-circle" size="sm" />
                  {notice}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button type="default" size="lg" block disabled={Boolean(busy) || !dirty} onClick={saveDraft}>
                  Save for later
                </Button>
                <Button type="primary" size="lg" block loading={busy === 'submit'} disabled={Boolean(busy) || uploading > 0} onClick={submit}>
                  {uploading ? 'Uploading…' : 'Submit'}
                </Button>
              </div>
              <p className="text-10 text-ds-muted">
                {tried && Object.keys(problems).length
                  ? `${Object.keys(problems).length} question${Object.keys(problems).length === 1 ? ' needs' : 's need'} an answer — see the red notes above.`
                  : requiredLeft
                    ? `${requiredLeft} required question${requiredLeft === 1 ? '' : 's'} left.`
                    : 'Ready to send. You can’t change it after.'}
              </p>
            </Card>
          </PinnedBar>
        </>
      ) : null}
    </div>
  );
}
