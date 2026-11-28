'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Router from 'next/router';
import { Button, Icon, cx } from '@/design-system';
import { createSurveyApi } from '../api';
import { rowState, surveysFromMyList } from '../data/shape';
import { SurveyScreen } from './SurveyScreen';
import { nextToDo, rowsOfTab } from './RecordTabs';
import { SubjectForm } from './SubjectForm';
import { DiscardChangesSheet, PageHeader, readDrafts, scroller, writeDrafts } from './parts';
import { ApprovalQueue } from './ApprovalQueue';

/* A survey page scrolls INSIDE the Elbrit frame (under its header, beside its menu) — not the whole browser page,
   which pushed the list of doctors out below the site. Where the frame has no set height it is as before. */
const INSIDE_FRAME = 'h-full min-h-0 overflow-y-auto overscroll-contain';

/* ONE SURVEY ON ITS OWN PAGE — /survey/<campaign> (26 Nov 2026: one page for every survey):
 *
 *   ← <survey title>  ·  progress  ·  [To do] [Submitted] [All]  ·  that tab's doctors as tags  ·  the picked
 *   one's card and questions (SubjectForm). The survey opens on To do with its first doctor. A tag shows that
 *   doctor's questions right here; a tab shows its doctors and opens the first. Submit goes straight on to the
 *   next one still to do.
 *
 *   Back   (the ← and the phone's back) leaves the survey — onBack (Studio navigates home; unbound, the
 *          browser's back). With unsaved answers the ← asks first (Save for later / Discard / Keep editing);
 *          the phone's back keeps them on this device as a draft. Moving to another doctor or tab keeps the
 *          unsent answers as a draft too ("Saved for later").
 *   URL    ?r=<response> follows the doctor on screen (replaced, never a new history entry), so a link or a
 *          reload opens that doctor; one that is not in this survey opens the first to do.
 *   Data   the same api.js as SurveyHome — survey_my_list as the signed-in person (`gqlToken`), on the /tokens row
 *          named EXACTLY `gqlEnvironment` (no fallback to another ERP). Asked on open, after anything is added
 *          or sent, and back in the foreground (at most once a minute).
 *   Drafts on this device, per user — the same store as SurveyHome's. */

const WAKE_MS = 60 * 1000;
const ROW_PARAM = 'r';
/* BackGuard's overlay entries (the "Leave this form?" sheet holds one). */
const LAYER_FLAG = '__elbritBackLayer';

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
/* the doctor on screen, in the URL — replaced, so Back still leaves the survey */
function replaceRowInUrl(response) {
  const as = urlWithRow(response);
  const router = nextRouter();
  if (router) router.replace(as, undefined, { shallow: true, scroll: false }).catch(() => {});
  else window.history.replaceState(window.history.state, '', as);
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

/* 26 Nov 2026 · /survey/approve — the approver's "To approve" (Survey Studio approvals) */
function ApprovePage({ api: apiProp, source = 'erp', gqlEnvironment = 'ERP', gqlToken, onBack, className }) {
  const api = useMemo(() => apiProp ?? createSurveyApi({ source, gqlEnvironment, gqlToken, strictEnvironment: true }), [apiProp, source, gqlEnvironment, gqlToken]);
  const signedIn = Boolean(apiProp) || source !== 'erp' || Boolean(String(gqlToken ?? '').trim());
  const leave = () => (onBack ? onBack() : window.history.back());
  return (
    <section className={cx('@container/survey flex w-full scroll-mt-3 flex-col', INSIDE_FRAME, className)}>
      <div className="flex w-full flex-col gap-3 px-4 pb-4 pt-3 @2xl/survey:gap-4">
        <PageHeader onBack={leave} backLabel="Back" title="To approve" />
        {signedIn ? <ApprovalQueue api={api} /> : <Notice icon="lock" title="Sign in to approve" text="Approvals are read and sent as you — sign in to the app, then open this page again." />}
      </div>
    </section>
  );
}

export function SurveyPage(props) {
  const c = decodeCampaign(props.campaign);
  return c === 'approve' ? <ApprovePage {...props} /> : <OneSurveyPage {...props} />;
}

function OneSurveyPage({
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
  const [tab, setTab] = useState('todo');
  /* the doctor / record picked (null: the tab's first) */
  const [picked, setPicked] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);
  const say = useCallback((text) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

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
    setPicked(null);
    setTab('todo');
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
  const rowsView = useMemo(() => (survey ? survey.rows.map((r) => ({ ...r, view: rowState(r, drafts) })) : []), [survey, drafts]);
  /* 28 Nov 2026 · a survey of one record (one distributor) has no History button: once it is sent, it opens as sent
     (it showed "Nothing left to do" and the answers could not be seen) */
  const tabNow = tab === 'todo' && rowsView.length === 1 && rowsView[0].view === 'done' ? 'done' : tab;
  const tabRows = useMemo(() => rowsOfTab(rowsView, tabNow), [rowsView, tabNow]);
  const pickedRow = tabRows.find((r) => r.response === picked) ?? tabRows[0] ?? null;
  const row = pickedRow ? survey.rows.find((r) => r.response === pickedRow.response) ?? null : null;

  const setDraft = (key, answers) =>
    setDrafts((prev) => {
      const next = { ...prev };
      if (answers) next[key] = answers;
      else delete next[key];
      writeDrafts(list?.me?.user, next);
      return next;
    });

  /* A LINK STRAIGHT TO A DOCTOR (?r=<response>), once the survey has loaded: that one, on its tab. */
  useEffect(() => {
    if (!list || resolvedLink.current || typeof window === 'undefined') return;
    resolvedLink.current = true;
    const r = rowInUrl();
    const hit = r ? rowsView.find((x) => x.response === r) : null;
    if (hit) {
      setTab(hit.view === 'done' ? 'done' : 'todo');
      setPicked(r);
    }
  }, [list, rowsView]);

  /* the URL follows the doctor on screen */
  useEffect(() => {
    if (!list || typeof window === 'undefined') return;
    const want = row?.response ?? null;
    if (rowInUrl() !== want) replaceRowInUrl(want);
  }, [list, row?.response]);

  /* The open form's answers as they are now — kept as a draft when moving on with them unsent. */
  const answersRef = useRef(null);
  const keepUnsent = () => {
    if (row && dirty && answersRef.current) {
      setDraft(row.response, answersRef.current);
      say('Your unsent answers were saved for later on this device.');
    }
    setDirty(false);
  };
  const toTop = () => {
    const sc = scroller(rootRef.current);
    if (sc && rootRef.current) sc.scrollTop = Math.min(sc.scrollTop, rootRef.current.offsetTop);
  };
  /* a tag: that doctor's questions, right here */
  const pick = (next) => {
    if (row && next === row.response) return;
    keepUnsent();
    setPicked(next);
  };
  /* a tab: its doctors, the first one open */
  const changeTab = (k) => {
    if (k === tab) return;
    keepUnsent();
    setTab(k);
    setPicked(null);
    toTop();
  };

  /* the phone's back (or any way out) with unsent answers: keep them on this device */
  const leftRef = useRef({});
  leftRef.current = { row, dirty, user: list?.me?.user };
  useEffect(
    () => () => {
      const L = leftRef.current;
      if (L.row && L.dirty && answersRef.current) writeDrafts(L.user, { ...readDrafts(L.user), [L.row.response]: answersRef.current });
    },
    [],
  );

  const goBack = useCallback(() => {
    if (onBack) onBack();
    else if (typeof window !== 'undefined') window.history.back();
  }, [onBack]);
  /* Back leaves the survey — asking first when answers are unsaved */
  const leave = () => {
    if (dirty && row) setConfirm(true);
    else goBack();
  };
  const leaveNow = () => {
    setConfirm(false);
    setDirty(false);
    leftRef.current = { ...leftRef.current, dirty: false };
    afterOverlayEntries(goBack);
  };

  /* Unsaved answers: a link elsewhere asks first; reload / close gets the browser's own prompt. */
  const bypassLinks = useRef(false);
  const pendingLink = useRef(null);
  useEffect(() => {
    if (!dirty || typeof window === 'undefined') return undefined;
    const onClick = (e) => {
      if (bypassLinks.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      pendingLink.current = a;
      setConfirm(true);
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
  }, [dirty]);
  /* the sheet's answer, for a link as for Back */
  const followOrLeave = (save) => {
    if (save && row && answersRef.current) setDraft(row.response, answersRef.current);
    const a = pendingLink.current;
    pendingLink.current = null;
    if (!a) return leaveNow();
    setConfirm(false);
    setDirty(false);
    bypassLinks.current = true;
    a.click();
    window.setTimeout(() => {
      bypassLinks.current = false;
    }, 0);
    return undefined;
  };

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
        <Button type="default" size="sm" onClick={goBack}>
          Back
        </Button>
      </Notice>
    );
  } else {
    body = (
      <SurveyScreen
        survey={survey}
        today={today}
        drafts={drafts}
        api={api}
        tab={tabNow}
        onTab={changeTab}
        notice={notice}
        openResponse={row?.response ?? null}
        onOpenRow={pick}
        onChanged={load}
        form={
          row ? (
            <SubjectForm
              key={row.response}
              survey={survey}
              row={row}
              me={list.me?.full_name}
              draft={drafts[row.response] ?? null}
              api={api}
              bottomGap={bottomGap}
              onBack={leave}
              onDraft={(answers) => setDraft(row.response, answers)}
              onDirtyChange={setDirty}
              onAnswersChange={(answers) => {
                answersRef.current = answers;
              }}
              onSubmitted={(sent) => {
                /* straight on to the next one still to do; none left → the Submitted tab */
                const next = nextToDo(rowsView, { except: sent.response, after: sent.response });
                const who = sent.subject?.label;
                setDirty(false);
                load();
                if (next) {
                  say(`${who ? `Sent for ${who}` : 'Sent'}. Next: ${next.subject?.label ?? 'the next one'}.`);
                  setTab('todo');
                  setPicked(next.response);
                } else {
                  say(`${who ? `Sent for ${who}. ` : ''}All submitted — thank you.`);
                  setTab('done');
                  setPicked(sent.response);
                }
                toTop();
                return true;
              }}
            />
          ) : null
        }
      />
    );
  }

  return (
    <section ref={rootRef} className={cx('@container/survey flex w-full scroll-mt-3 flex-col', INSIDE_FRAME, className)}>
      <div className="flex w-full flex-col gap-3 px-4 pb-4 pt-3 @2xl/survey:gap-4">
        {/* 26 Nov 2026 · Survey Studio: "Survey › Dr name" when a doctor / record of several is open */}
        <PageHeader onBack={leave} backLabel="Back" parent={row?.subject && survey?.rows?.length >= 2 ? title : undefined} title={row?.subject && survey?.rows?.length >= 2 ? row.subject.label : title} />
        {body}
      </div>
      <DiscardChangesSheet open={confirm} onCancel={() => { pendingLink.current = null; setConfirm(false); }} onConfirm={() => followOrLeave(false)} onSave={() => followOrLeave(true)} />
    </section>
  );
}

export default SurveyPage;
