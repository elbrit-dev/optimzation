'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Icon, ProgressBar } from '@/design-system';
import { PinnedBar, PinnedBarSpacer } from '@/app/secondary-entry/components/PinnedBar';
import { formProblems, isEmpty, shortDate, shortName, toPayload } from '../data/shape';
import { filledQuestions } from '../data/view';
import { SubjectCard } from './SubjectCard';
import { QuestionCard } from './QuestionCard';
import { SurveyView } from './SurveyView';

/* the longest the file shows "Checking the file…" (the server finishes and keeps the read anyway) */
const READ_WAIT = 120000;

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
/* 26 Nov 2026 · Survey Studio: a section's title over its questions, with how many are answered */
function SectionHead({ title, done, total }) {
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 truncate text-14 font-semibold text-heading">{title}</h3>
        {total ? (
          <span className="shrink-0 text-11 tabular-nums text-ds-muted">
            <span className="font-semibold text-heading">{done}</span>/{total} answered
          </span>
        ) : null}
      </div>
      {total ? <ProgressBar value={done} max={total} size="sm" tone={done === total ? 'success' : 'brand'} label={`${title}: ${done} of ${total} answered`} /> : null}
    </div>
  );
}

export function SubjectForm({ survey, row, rows, me, draft, api, onBack, onDraft, onSubmitted, onDirtyChange, onAnswersChange, onSwitchRow, bottomGap = 'var(--space-12)' }) {
  /* The questions with this record's values in their {#fields} (data/view.js). */
  const questions = useMemo(() => filledQuestions(survey, row), [survey, row]);
  const rootRef = useRef(null);
  const [barHeight, setBarHeight] = useState(0);
  const editable = row.state === 'todo';
  /* 26 Nov 2026: a returned answer opens with what was sent, to fix and send again */
  const start = useMemo(() => (editable ? (draft ?? (row.returned ? row.answers ?? {} : {})) : (row.answers ?? {})), [editable, draft, row.answers, row.returned]);
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
  /* 26 Nov 2026 · Survey Studio: "Show from ERP" cards are read, not answered — not counted or numbered */
  const answerable = useMemo(() => questions.filter((q) => q.type !== 'erp_info'), [questions]);
  const answered = answerable.filter((q) => !isEmpty(answers[q.id])).length;
  const required = answerable.filter((q) => q.required);
  /* sections: a question with a section title starts one; each shows how many of its questions are answered */
  const sections = useMemo(() => {
    const out = {};
    let cur = null;
    questions.forEach((q) => {
      const t = String(q.section ?? '').trim();
      if (t) {
        cur = { title: t, ids: [] };
        out[q.id] = cur;
      }
      if (cur && q.type !== 'erp_info') cur.ids.push(q.id);
    });
    return out;
  }, [questions]);
  const numberOf = useMemo(() => {
    const m = {};
    answerable.forEach((q, i) => {
      m[q.id] = i;
    });
    return m;
  }, [answerable]);
  const requiredLeft = required.filter((q) => isEmpty(answers[q.id])).length;

  /* Count uploads in flight, so Submit waits for them. */
  /* 23 Nov 2026: a question with an AI schema — the file is read right after it
     is stored (api.readFile; our server keeps what it read for Survey Center).
     The upload stays "in progress" while it is read, at most READ_WAIT; the rep
     only learns whether it could be read (res.read.readable). */
  /* 26 Nov 2026: the file is ready as soon as it is stored — the AI read goes on by itself (`reading`, a promise
     of the read; the server keeps it on the response even after Submit). A PDF can take ~1 minute to read; the rep
     no longer waits on it. */
  const upload = (file, onProgress, q) => {
    setUploading((n) => n + 1);
    return api
      .uploadFile(file, onProgress)
      .then((res) => {
        if (!q?.ai?.schema || typeof api.readFile !== 'function') return res;
        const reading = Promise.race([
          api.readFile({ response: row.response, question: q.id, file_url: res.file_url, file }),
          new Promise((r) => setTimeout(() => r(null), READ_WAIT)),
        ]).catch(() => null);
        return { ...res, reading };
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
      setBaseline(JSON.stringify(answers));
      /* 26 Nov 2026: the page opens the next one still to do (returns true) — no "Submitted" page in between */
      const moved = onSubmitted?.(row);
      if (!moved) {
        setSent(true);
        rootRef.current?.scrollIntoView?.({ block: 'start' });
      }
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
      {/* 26 Nov 2026: the doctors / records strip and the progress are the survey's (SurveyScreen), above this form. */}
      <SubjectCard subject={row.subject} me={me} state={row.state === 'todo' ? (draft ? 'draft' : 'new') : row.state} />
      <SurveyView survey={survey} row={row} />

      <Card className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-12 font-semibold text-heading">{survey.title}</span>
          <span className="shrink-0 text-12 tabular-nums">
            <span className="font-semibold text-heading">{answered}</span>
            <span className="text-ds-muted">/{answerable.length} answered</span>
          </span>
        </div>
        <ProgressBar value={answered} max={answerable.length || 1} size="sm" tone={requiredLeft ? 'brand' : 'success'} label={`${answered} of ${answerable.length} answered`} />
      </Card>

      {editable && row.returned ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-warning-wash px-3 py-2.5 text-12 text-warning-text">
          <Icon name="replay" size="sm" className="mt-px shrink-0" />
          <span>
            <b className="font-semibold">Returned{row.returned.by_name ? ` by ${row.returned.by_name}` : ''}</b>
            {row.returned.note ? ` — “${row.returned.note}”` : ''}. Fix it and send it again.
          </span>
        </p>
      ) : null}
      {row.state === 'done' && row.approval ? (
        <p role="note" className={`flex items-center gap-2 rounded-lg px-3 py-2 text-12 ${row.approval.status === 'Approved' ? 'bg-success-wash text-success' : 'bg-sunken text-ds-secondary'}`}>
          <Icon name={row.approval.status === 'Approved' ? 'verified' : 'clock'} size="sm" className="shrink-0" />
          {row.approval.status === 'Approved' ? `Approved${row.approval.auto ? ' by the AI (Clear)' : row.approval.by_name ? ` by ${row.approval.by_name}` : ''}.` : 'Waiting for approval.'}
        </p>
      ) : null}
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

      {questions.map((q) => (
        <div key={q.id} className="contents">
          {sections[q.id] ? <SectionHead title={sections[q.id].title} done={sections[q.id].ids.filter((id) => !isEmpty(answers[id])).length} total={sections[q.id].ids.length} /> : null}
        <QuestionCard
          q={q}
          index={numberOf[q.id] ?? 0}
          value={answers[q.id]}
          readOnly={!editable}
          disabled={Boolean(busy)}
          error={tried ? problems[q.id] : null}
          onUpload={upload}
          api={api}
          response={row.response}
          answers={answers}
          onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
        />
        </div>
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
