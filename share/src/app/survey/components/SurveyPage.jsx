'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, cx } from '@/design-system';
import { useUnsavedGuard } from '@/app/secondary-entry/components/useUnsavedGuard';
import { createSurveyApi } from '../api';
import { shortName, surveysFromMyList } from '../data/shape';
import { SurveyScreen } from './SurveyScreen';
import { SubjectForm } from './SubjectForm';
import { DiscardChangesSheet, PageHeader, readDrafts, scroller, writeDrafts } from './parts';

/* ONE SURVEY ON ITS OWN PAGE — /survey/<campaign>, where a survey circle
 * goes when SurveyHome has openInPlace off. No strip: the header (Back +
 * title), the survey (SurveyScreen: tags, progress, its doctors /
 * distributors, Add for Self-tag), and a row's form (SubjectForm).
 *
 *   Back   form → the survey (asking first if answers are unsaved);
 *          survey → onBack (Studio navigates home; unbound, the browser's
 *          back).
 *   Data   the same api.js as SurveyHome — survey_my_list as the signed-in
 *          person (`gqlToken`), on the /tokens row named EXACTLY
 *          `gqlEnvironment` (no fallback to another ERP). Asked on open,
 *          after anything is added or sent, and back in the foreground (at
 *          most once a minute).
 *   Drafts on this device, per user — the same store as SurveyHome's. */

const WAKE_MS = 60 * 1000;

function decodeCampaign(value) {
  const v = String(value ?? '').trim();
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/* A message in place of the survey: what happened, and the way on. */
function Notice({ tone = 'neutral', icon, title, text, children }) {
  const danger = tone === 'danger';
  return (
    <div
      role={danger ? 'alert' : 'status'}
      className={cx('flex items-start gap-3 rounded-xl px-3 py-3', danger ? 'bg-danger-wash' : 'bg-sunken')}
    >
      <Icon name={icon} size="sm" className={cx('mt-px shrink-0', danger ? 'text-danger-text' : 'text-ds-muted')} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cx('text-12 font-semibold', danger ? 'text-danger-text' : 'text-heading')}>{title}</span>
        {text ? <span className="text-11 text-ds-secondary">{text}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function SurveyPage({
  campaign: campaignProp,
  /* Tests and the harness only: a ready api (mock or ERP). */
  api: apiProp,
  source = 'erp',
  gqlEnvironment = 'ERP',
  gqlToken,
  today: todayProp,
  bottomGap = 'var(--space-12)',
  onBack,
  className,
}) {
  const campaign = decodeCampaign(campaignProp);
  const signedIn = Boolean(apiProp) || source !== 'erp' || Boolean(String(gqlToken ?? '').trim());
  const api = useMemo(
    () => apiProp ?? createSurveyApi({ source, gqlEnvironment, gqlToken, strictEnvironment: true }),
    [apiProp, source, gqlEnvironment, gqlToken],
  );
  const rootRef = useRef(null);
  const [list, setList] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [response, setResponse] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [dirty, setDirty] = useState(false);

  const lastLoad = useRef(0);
  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    try {
      const res = await api.getMyList();
      setList(res);
      setLoadError(null);
      setDrafts(readDrafts(res.me?.user));
    } catch (e) {
      setLoadError(e?.message || 'Could not load your surveys.');
    } finally {
      setRetrying(false);
    }
  }, [api]);

  useEffect(() => {
    setList(null);
    setLoadError(null);
    setResponse(null);
    if (!signedIn) return undefined;
    load();
    const wake = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > WAKE_MS) load();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [load, signedIn, campaign]);

  const today = todayProp || list?.today || new Date().toISOString().slice(0, 10);
  const surveys = useMemo(() => (list ? surveysFromMyList(list) : []), [list]);
  const survey = surveys.find((s) => s.campaign === campaign) ?? null;
  const row = survey?.rows.find((r) => r.response === response) ?? null;

  const setDraft = (key, answers) =>
    setDrafts((prev) => {
      const next = { ...prev };
      if (answers) next[key] = answers;
      else delete next[key];
      writeDrafts(list?.me?.user, next);
      return next;
    });

  /* A form or the survey starts at its top, as a page does. */
  const open = useCallback((next) => {
    setResponse(next);
    const sc = scroller(rootRef.current);
    if (sc && rootRef.current) sc.scrollTop = Math.min(sc.scrollTop, rootRef.current.offsetTop);
  }, []);
  const toSurvey = useCallback(() => open(null), [open]);
  const leave = useCallback(() => {
    if (onBack) onBack();
    else if (typeof window !== 'undefined') window.history.back();
  }, [onBack]);
  const guard = useUnsavedGuard({ dirty: dirty && response != null, onBack: toSurvey });

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const title = survey?.title ?? 'Survey';

  let body;
  if (!signedIn) {
    body = <Notice icon="lock" title="Sign in to see your surveys" text="Surveys are read and sent as you — sign in to the app, then open this survey again." />;
  } else if (!list && loadError) {
    body = (
      <Notice
        tone="danger"
        icon={offline ? 'wifi' : 'exclamation-triangle'}
        title={offline ? 'You’re offline — the survey can’t load' : 'Couldn’t load this survey'}
        text={offline ? 'Connect to the internet and try again.' : loadError}
      >
        <Button
          type="default"
          size="sm"
          loading={retrying}
          onClick={() => {
            setRetrying(true);
            load();
          }}
        >
          Try again
        </Button>
      </Notice>
    );
  } else if (!list) {
    body = (
      <div role="status" aria-label="Loading the survey" className="flex flex-col gap-3">
        <div className="h-20 animate-pulse rounded-xl bg-sunken" />
        <div className="h-14 animate-pulse rounded-xl bg-sunken" />
        <div className="h-14 animate-pulse rounded-xl bg-sunken" />
      </div>
    );
  } else if (!survey) {
    body = (
      <Notice icon="info-circle" title="This survey isn’t available" text="It may be closed, or not sent to you.">
        <Button type="default" size="sm" onClick={leave}>
          Back
        </Button>
      </Notice>
    );
  } else if (row) {
    body = (
      <SubjectForm
        key={row.response}
        survey={survey}
        row={row}
        me={list.me?.full_name}
        draft={drafts[row.response] ?? null}
        api={api}
        bottomGap={bottomGap}
        onBack={() => guard.request(toSurvey)}
        onDraft={(answers) => setDraft(row.response, answers)}
        onDirtyChange={setDirty}
        onSubmitted={load}
      />
    );
  } else {
    body = (
      <SurveyScreen
        survey={survey}
        today={today}
        me={list.me}
        drafts={drafts}
        api={api}
        onOpenRow={(next) => open(next)}
        onChanged={load}
      />
    );
  }

  return (
    <section ref={rootRef} className={cx('@container/survey flex w-full scroll-mt-3 flex-col', className)}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pb-4 pt-3">
        {row ? (
          <PageHeader
            onBack={() => guard.request(toSurvey)}
            backLabel={`Back to ${survey.title}`}
            title={row.subject?.label ?? 'Your answers'}
            parent={shortName(survey.title)}
          />
        ) : (
          <PageHeader onBack={leave} backLabel="Back" title={title} />
        )}
        {body}
      </div>
      <DiscardChangesSheet open={guard.confirmOpen} onCancel={guard.cancel} onConfirm={guard.confirm} />
    </section>
  );
}

export default SurveyPage;
