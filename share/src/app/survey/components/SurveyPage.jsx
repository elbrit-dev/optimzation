'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Router from 'next/router';
import { Button, Icon, cx } from '@/design-system';
import { holdBase } from '@/components/BackGuard';
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
 *   History  a form is its own history entry, /survey/<campaign>?r=<response>,
 *          so the phone's / browser's back does exactly what the in-page ←
 *          does: form → survey → (the page before). The ← on a form IS a
 *          history back. With unsaved answers either back asks "Discard
 *          changes?" first — the browser's back has already left the form's
 *          entry by then, so it is put back while the question is up. A link
 *          straight to ?r=<response> opens that form (with the survey under
 *          it in history); a response that is not in this survey shows the
 *          survey. Entries go through Next's router, shallow — no page data
 *          is fetched again — or the bare History API where there is no
 *          router (tests, Studio).
 *   Data   the same api.js as SurveyHome — survey_my_list as the signed-in
 *          person (`gqlToken`), on the /tokens row named EXACTLY
 *          `gqlEnvironment` (no fallback to another ERP). Asked on open,
 *          after anything is added or sent, and back in the foreground (at
 *          most once a minute).
 *   Drafts on this device, per user — the same store as SurveyHome's. */

const WAKE_MS = 60 * 1000;

/* The form's history entry. */
const ROW_PARAM = 'r';
const ROW_STATE = '__surveyRow';
/* BackGuard's overlay entries (the "Discard changes?" sheet holds one). */
const LAYER_FLAG = '__elbritBackLayer';
/* Next's keys of the entries this page pushed for a form, for this tab. */
const FORM_KEYS = 'elbrit.survey.formEntries';

const nextRouter = () => {
  try {
    return Router.router ?? null;
  } catch {
    return null;
  }
};

const rowInUrl = () => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(ROW_PARAM) || null);

function urlWithRow(response) {
  const url = new URL(window.location.href);
  if (response) url.searchParams.set(ROW_PARAM, response);
  else url.searchParams.delete(ROW_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

function formKeys() {
  try {
    return JSON.parse(window.sessionStorage.getItem(FORM_KEYS) || '[]');
  } catch {
    return [];
  }
}
function rememberFormEntry() {
  const key = window.history.state?.key;
  if (!key) return;
  try {
    window.sessionStorage.setItem(FORM_KEYS, JSON.stringify([...formKeys().slice(-49), key]));
  } catch {
    /* storage off: reopening the entry later adds one survey entry under it */
  }
}
/* Is the entry on screen one this page pushed for a form (so the survey's
   entry is right behind it)? */
function onFormEntry() {
  const state = window.history.state;
  return Boolean(state?.[ROW_STATE]) || Boolean(state?.key && formKeys().includes(state.key));
}

/* The survey's own entry, then the form's on top of it. Next's router when
   the app has one — shallow, and the survey's entry marked shallow too, so
   going back to it re-renders nothing and fetches nothing. */
async function replaceWithSurvey() {
  const router = nextRouter();
  const as = urlWithRow(null);
  if (router) await router.replace(as, undefined, { shallow: true, scroll: false });
  else window.history.replaceState(window.history.state, '', as);
}
async function pushForm(response) {
  const router = nextRouter();
  const as = urlWithRow(response);
  if (router) await router.push(as, undefined, { shallow: true, scroll: false });
  else window.history.pushState({ [ROW_STATE]: response }, '', as);
  rememberFormEntry();
}

/* After the sheet closes, BackGuard takes its own history entry off; wait
   for that before going back, so the two pops do not race. */
function afterOverlayEntries(fn) {
  let tries = 0;
  const tick = () => {
    if (!window.history.state?.[LAYER_FLAG] || tries >= 40) fn();
    else {
      tries += 1;
      window.setTimeout(tick, 25);
    }
  };
  window.setTimeout(tick, 0);
}

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
  /* "Discard changes?" — null, or what is waiting behind it. */
  const [confirm, setConfirm] = useState(null);

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

  const resolvedLink = useRef(false);
  useEffect(() => {
    setList(null);
    setLoadError(null);
    setResponse(null);
    setDirty(false);
    resolvedLink.current = false;
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

  /* Latest values, for the history listeners. */
  const responseRef = useRef(response);
  responseRef.current = response;
  const unsaved = dirty && response != null;
  const unsavedRef = useRef(unsaved);
  unsavedRef.current = unsaved;
  const surveyRef = useRef(survey);
  surveyRef.current = survey;
  const pathRef = useRef(null);

  /* Our own pushes and replaces are not the person navigating. */
  const navigating = useRef(0);
  const navigate = useCallback((steps) => {
    navigating.current += 1;
    return Promise.resolve()
      .then(steps)
      .catch(() => {})
      .finally(() => {
        navigating.current -= 1;
      });
  }, []);

  /* A form or the survey starts at its top, as a page does. */
  const show = useCallback((next) => {
    setResponse(next);
    setDirty(false);
    const sc = scroller(rootRef.current);
    if (sc && rootRef.current) sc.scrollTop = Math.min(sc.scrollTop, rootRef.current.offsetTop);
  }, []);

  /* A row opens its form: on screen at once, then its history entry. */
  const open = useCallback(
    (next) => {
      show(next);
      pathRef.current = window.location.pathname;
      navigate(async () => {
        if (nextRouter()) await replaceWithSurvey();
        await pushForm(next);
      });
    },
    [show, navigate],
  );

  /* A back press may leave a form with unsaved answers only once the person
     has said Discard. */
  const allowLeave = useRef(false);

  /* THE HISTORY MOVED (the phone's / browser's back or forward, or our own
     history.back()): the screen follows the URL's ?r=. */
  const sync = useCallback(() => {
    if (navigating.current) return;
    if (pathRef.current && window.location.pathname !== pathRef.current) return; // left the page
    const r = rowInUrl();
    const current = responseRef.current;
    if (r === current) return;
    if (current && unsavedRef.current && !allowLeave.current) {
      /* The browser has already left the form's entry: put it back, then ask. */
      navigate(async () => {
        await pushForm(current);
        setConfirm({ kind: 'back' });
      });
      return;
    }
    allowLeave.current = false;
    const known = Boolean(r && surveyRef.current?.rows.some((x) => x.response === r));
    show(known ? r : null);
    if (r && !known) navigate(replaceWithSurvey);
  }, [navigate, show]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    /* With Next: after its route change — it rewrites the entry it lands on,
       so acting before it finishes would have that clobber ours. */
    const events = nextRouter()?.events;
    if (events) {
      events.on('routeChangeComplete', sync);
      return () => events.off('routeChangeComplete', sync);
    }
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [sync]);

  /* A LINK STRAIGHT TO A FORM (?r=<response>), once the survey has loaded:
     that form, with the survey's entry under it; a response that is not in
     this survey (or not this person's), the survey. */
  useEffect(() => {
    if (!list || resolvedLink.current || typeof window === 'undefined') return;
    resolvedLink.current = true;
    const r = rowInUrl();
    if (!r) return;
    pathRef.current = window.location.pathname;
    if (survey?.rows.some((x) => x.response === r)) {
      show(r);
      if (!onFormEntry())
        navigate(async () => {
          await replaceWithSurvey();
          await pushForm(r);
        });
    } else {
      navigate(replaceWithSurvey);
    }
  }, [list, survey, show, navigate]);

  /* Back from a form is a history back — exactly what the phone's back does. */
  const goBackFromForm = useCallback(() => {
    if (onFormEntry() && rowInUrl() === responseRef.current) {
      allowLeave.current = true;
      window.history.back();
    } else {
      allowLeave.current = false;
      show(null);
      navigate(replaceWithSurvey);
    }
  }, [show, navigate]);
  const backFromForm = useCallback(() => {
    if (unsavedRef.current) setConfirm({ kind: 'back' });
    else goBackFromForm();
  }, [goBackFromForm]);

  const leave = useCallback(() => {
    if (onBack) onBack();
    else if (typeof window !== 'undefined') window.history.back();
  }, [onBack]);

  /* While a form is open its entry takes the back press — the app's
     "back goes home" watcher stands down. */
  useEffect(() => (response ? holdBase() : undefined), [response]);

  /* Unsaved answers: a link elsewhere asks first; reload / close gets the
     browser's own prompt. */
  const bypassLinks = useRef(false);
  useEffect(() => {
    if (!unsaved || typeof window === 'undefined') return undefined;
    const onClick = (e) => {
      if (bypassLinks.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setConfirm({ kind: 'link', anchor: a });
    };
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [unsaved]);

  const keepEditing = useCallback(() => setConfirm(null), []);
  const discard = useCallback(() => {
    const pending = confirm;
    setConfirm(null);
    if (pending?.kind === 'link') {
      bypassLinks.current = true;
      pending.anchor.click();
      window.setTimeout(() => {
        bypassLinks.current = false;
      }, 0);
      return;
    }
    allowLeave.current = true;
    afterOverlayEntries(goBackFromForm);
  }, [confirm, goBackFromForm]);

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
        onBack={backFromForm}
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
          <PageHeader onBack={backFromForm} backLabel={`Back to ${survey.title}`} title={row.subject?.label ?? 'Your answers'} parent={shortName(survey.title)} />
        ) : (
          <PageHeader onBack={leave} backLabel="Back" title={title} />
        )}
        {body}
      </div>
      <DiscardChangesSheet open={Boolean(confirm)} onCancel={keepEditing} onConfirm={discard} />
    </section>
  );
}

export default SurveyPage;
