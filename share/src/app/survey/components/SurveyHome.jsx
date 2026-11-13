'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, cx } from '@/design-system';
import RingNav from '@/app/ring-nav/components/RingNav';
import { useUnsavedGuard } from '@/app/secondary-entry/components/useUnsavedGuard';
import { createSurveyApi } from '../api';
import { shortName, surveysFromMyList } from '../data/shape';
import { SURVEY_TILE_PREFIX, surveyTiles, withSurveyTiles } from '../data/tiles';
import { DEFAULT_REFRESH_MS, useErpTiles } from '@/app/ring-nav/data/useErpTiles';
import { SurveyScreen } from './SurveyScreen';
import { DiscardChangesSheet, PageHeader, readDrafts, scroller, writeDrafts } from './parts';
import { SubjectForm } from './SubjectForm';

/* Surveys in the Elbrit app — the rep side of the ERP's Survey system
 * (SURVEYS_CONTEXT.md; Survey Center stays on the ERP).
 *
 *   home      the home strip (Ring Nav) with ONE CIRCLE PER SURVEY sent to
 *             the person, right after the entry tiles (data/tiles.js), and
 *             the home page below it (`homeContent`). No survey, no circle.
 *   survey    a circle opens THAT survey as its OWN PAGE (SurveyScreen):
 *             no strip, a top bar with Back and the title — as every task
 *             page (Secondary Entry's header). Back returns home, scrolled
 *             to where it was, the strip as it was left.
 *   form      a row opens its form (SubjectForm), "S2 › D1", also its own
 *             page; Back returns to the survey.
 * Every way out of a form with unsaved answers asks first — the Back arrow,
 * the phone's back, a link (Secondary's useUnsavedGuard). Like the other
 * task pages, the pages add no history entries of their own: in the app the
 * survey is its own route, /survey/<campaign>, so the phone's back leaves
 * it as it leaves any page; here (the harness) it is drawn in place.
 *
 * DATA comes only through `api` (../api.js) — the ERP's shapes, mocked or
 * real; by default the real ERP as the signed-in person (`gqlToken`, on the
 * /tokens row `gqlEnvironment` names). survey_my_list is asked on mount
 * (for the circles), whenever a survey is opened (§4: "call it whenever the
 * surveys screen opens"), after anything is added or sent, when the app
 * comes back to the foreground (at most once a minute) and every
 * `refreshEvery` ms (5 minutes) — Ring Nav's rhythm. A failed refresh keeps
 * what was on screen.
 *
 * DRAFTS live on this device, per user (the ERP has none — its own page
 * does the same), in localStorage when the browser allows it. */

export function SurveyHome({
  api: apiProp,
  source = 'erp',
  gqlEnvironment = 'ERP',
  gqlToken,
  refreshEvery = DEFAULT_REFRESH_MS,
  tiles,
  today: todayProp,
  hrefBase = '/survey',
  bottomGap = 'var(--space-12)',
  /* The home page under the strip — in the app, the home screen itself. */
  homeContent = null,
  /* Passed to the strip — Ring Nav's own props, same meaning. */
  stickyBar = true,
  inset = true,
  ariaLabel = 'Shortcuts',
  /* true (default): a survey circle opens the survey here, in place.
     false: the circle is an ordinary link, like every other tile — it goes
     to <hrefBase>/<campaign>, the page with SurveyPage on it. */
  openInPlace = true,
  className,
}) {
  const api = useMemo(() => apiProp ?? createSurveyApi({ source, gqlEnvironment, gqlToken }), [apiProp, source, gqlEnvironment, gqlToken]);
  const rootRef = useRef(null);
  const [list, setList] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [view, setView] = useState({ campaign: null, response: null });
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
    setView({ campaign: null, response: null });
    load();
  }, [load]);

  /* Every refreshEvery, and back in the foreground (at most once a minute). */
  useEffect(() => {
    const every = Number(refreshEvery) > 0 ? Math.max(Number(refreshEvery), 10000) : DEFAULT_REFRESH_MS;
    const id = setInterval(load, every);
    const wake = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 60000) load();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [load, refreshEvery]);

  const today = todayProp || list?.today || new Date().toISOString().slice(0, 10);
  const surveys = useMemo(() => (list ? surveysFromMyList(list) : []), [list]);
  const survey = surveys.find((s) => s.campaign === view.campaign) ?? null;
  const row = survey?.rows.find((r) => r.response === view.response) ?? null;
  /* No `tiles` given (the app's page): the usual ERP tiles, loaded as Ring
     Nav loads them — the same hook, as the signed-in person. */
  const erpTiles = useErpTiles({ enabled: tiles == null && source === 'erp' && !apiProp, gqlEnvironment, gqlToken, today: todayProp, refreshEvery });
  const stripTiles = tiles ?? erpTiles.items;
  const ringItems = useMemo(() => withSurveyTiles(stripTiles, list ? surveyTiles(list, today, { hrefBase }) : []), [stripTiles, list, today, hrefBase]);

  const setDraft = (response, answers) =>
    setDrafts((prev) => {
      const next = { ...prev };
      if (answers) next[response] = answers;
      else delete next[response];
      writeDrafts(list?.me?.user, next);
      return next;
    });

  /* WHERE HOME WAS LEFT — the page's scroll and the strip's — so Back puts
     the person exactly there. A survey or form page starts at its top. */
  const homeAt = useRef(null);
  const leaveHome = () => {
    const sc = scroller(rootRef.current);
    homeAt.current = { top: sc?.scrollTop ?? 0, left: rootRef.current?.querySelector('nav')?.scrollLeft ?? 0 };
  };
  const go = useCallback((next) => {
    setView(next);
    const sc = scroller(rootRef.current);
    if (next.campaign && sc && rootRef.current) sc.scrollTop = Math.min(sc.scrollTop, rootRef.current.offsetTop);
  }, []);
  const toSurvey = useCallback(() => go({ campaign: view.campaign, response: null }), [go, view.campaign]);
  const toHome = useCallback(() => setView({ campaign: null, response: null }), []);
  const onHome = !view.campaign;
  useLayoutEffect(() => {
    if (!onHome || !homeAt.current) return;
    const at = homeAt.current;
    homeAt.current = null;
    const sc = scroller(rootRef.current);
    if (sc) sc.scrollTop = at.top;
    const strip = rootRef.current?.querySelector('nav');
    if (strip) strip.scrollLeft = at.left;
  }, [onHome]);
  const guard = useUnsavedGuard({ dirty: dirty && view.response != null, onBack: toSurvey });
  /* The open form's answers as they are now: "Leave this form?" → Save for
     later keeps them on this device, then leaves as Discard does. */
  const answersRef = useRef(null);
  const saveForLater = () => {
    if (view.response && answersRef.current) setDraft(view.response, answersRef.current);
    guard.confirm();
  };

  /* A survey's circle opens that survey, wherever the person is — or, with
     openInPlace off, is left to navigate to its own page like any tile. */
  const onTile = (id, href, event) => {
    if (!id.startsWith(SURVEY_TILE_PREFIX) || !openInPlace) return;
    event?.preventDefault();
    const campaign = decodeURIComponent(href.split('/').pop());
    guard.request(() => {
      if (!view.campaign) leaveHome();
      go({ campaign, response: null });
      load();
    });
  };

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  return (
    <section ref={rootRef} className={cx('@container/survey flex w-full scroll-mt-3 flex-col', className)}>
      {/* The strip is home's alone: a survey or form is its own page. */}
      {survey ? null : <RingNav items={ringItems} onItemClick={onTile} stickyBar={stickyBar} inset={inset} ariaLabel={ariaLabel} />}

      {survey ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pb-4 pt-3">
          {row ? (
            <PageHeader
              onBack={() => guard.request(toSurvey)}
              backLabel={`Back to ${survey.title}`}
              title={row.subject?.label ?? 'Your answers'}
              parent={shortName(survey.title)}
            />
          ) : (
            <PageHeader onBack={toHome} backLabel="Back to home" title={survey.title} />
          )}
          {row ? (
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
              onAnswersChange={(answers) => {
                answersRef.current = answers;
              }}
              onSubmitted={load}
            />
          ) : (
            <SurveyScreen
              survey={survey}
              today={today}
              me={list.me}
              drafts={drafts}
              api={api}
              onOpenRow={(response) => go({ campaign: survey.campaign, response })}
              onChanged={load}
            />
          )}
        </div>
      ) : (
        <>
          {/* The circles could not be fetched: said once, at the top of home,
              with a way to try again — the rest of home is unaffected. */}
          {loadError && !list ? (
            <div className="px-4 pt-3">
              <div role="alert" className="flex items-start gap-3 rounded-xl bg-danger-wash px-3 py-3">
                <Icon name={offline ? 'wifi' : 'exclamation-triangle'} size="sm" className="mt-px shrink-0 text-danger-text" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-12 font-semibold text-danger-text">{offline ? 'You’re offline — surveys can’t load' : 'Couldn’t load your surveys'}</span>
                  <span className="text-11 text-ds-secondary">{offline ? 'Connect to the internet and try again.' : loadError}</span>
                </div>
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
              </div>
            </div>
          ) : null}
          {homeContent}
        </>
      )}

      <DiscardChangesSheet open={guard.confirmOpen} onCancel={guard.cancel} onConfirm={guard.confirm} onSave={saveForLater} />
    </section>
  );
}

export default SurveyHome;
