'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Icon, ProgressRing, StatusPill, cx } from '@/design-system';
import { CHECKS, isBlocking, isDesktopSite, readEnv, runAllChecks } from '../lib/checks';
import { instructionsFor } from '../lib/instructions';

/* DeviceCheck — a checklist that confirms this browser can run Elbrit One
   (mobile view, location not blocked, cookies / localStorage /
   sessionStorage / IndexedDB allowed, enough free space) before letting the
   person continue. Whatever fails first is opened with step-by-step fix-it
   instructions for their phone and browser; the rest wait their turn.

   It re-checks by itself when the person comes back from the browser's
   settings (tab visible again) and when the location permission changes, so
   "fix it, come back" usually needs no tap at all. A re-check keeps the last
   answers on screen and swaps each one as it lands — no flash to empty.

   Nothing here prompts for anything: location is read through the
   Permissions API, never requested.

    Look: the field app's — Leave Approval / Survey cards. The heading IS the
   progress: a ProgressRing (green passed, amber warnings, red to fix) beside
   the state ("1 setting to fix"). Then one hairline card listing every check:
   a passing row is one quiet line (grey tile, green tick); a failing one goes
   red with its reason and a Fix pill. The open fix sits in a sunken panel
   under its row, with numbered steps. */

const TONE = {
  // A passing row stays quiet — grey tile, green tick — so red is what draws the eye.
  pass: { tile: 'bg-sunken text-ds-secondary', text: 'text-ds-muted' },
  warn: { tile: 'bg-warning-wash text-pending-text', text: 'text-pending-text' },
  fail: { tile: 'bg-danger-wash text-danger-text', text: 'text-danger-text' },
  idle: { tile: 'bg-sunken text-ds-muted', text: 'text-ds-muted' },
};

const GLYPH = { dots: 'ellipsis-v', bars: 'bars', more: 'ellipsis-h', tune: 'sliders-h', lock: 'lock' };
const GLYPH_LABEL = { dots: 'menu', bars: 'menu', more: 'more', tune: 'site settings', lock: 'lock' };

/* A step's markup → nodes: {glyph} becomes the browser button as an icon in a
   small chip, "Quoted" a bold label, → a chevron between menu levels. */
function StepText({ text }) {
  const parts = String(text).split(/(\{[a-z]+\}|"[^"]+"|\s→\s)/g).filter(Boolean);
  return parts.map((p, i) => {
    const glyph = /^\{([a-z]+)\}$/.exec(p);
    if (glyph && GLYPH[glyph[1]]) {
      return (
        <span
          key={i}
          className="mx-0.5 inline-flex size-5 items-center justify-center rounded-md bg-surface align-[-4px] text-heading shadow-[var(--ds-shadow-hairline)]"
        >
          <Icon name={GLYPH[glyph[1]]} size="var(--fs-11)" label={GLYPH_LABEL[glyph[1]]} />
        </span>
      );
    }
    if (/^".+"$/.test(p)) {
      return (
        <span key={i} className="font-semibold text-heading">
          {p.slice(1, -1)}
        </span>
      );
    }
    if (/^\s→\s$/.test(p)) {
      return (
        <span key={i} className="mx-1 inline-flex align-middle text-ds-muted">
          <Icon name="chevron-right" size="var(--fs-8)" label="then" />
        </span>
      );
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

function FixPanel({ fix }) {
  if (!fix) return null;
  return (
    <div className="mt-3 rounded-lg bg-sunken px-3 py-3">
      <div className="mb-2.5 flex items-center gap-1.5 text-12 font-semibold text-heading">
        <span className="flex text-brand-text">
          <Icon name="wrench" size="sm" />
        </span>
        {fix.title}
      </div>
      <ol className="flex flex-col gap-2.5">
        {fix.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-pill bg-brand-tint text-10 font-semibold tabular-nums text-brand-text">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 pt-px text-12 leading-5 text-body">
              <StepText text={s} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Trailing({ status, expandable, expanded }) {
  // Colour on a wrapper: .ds-icon sets its own colour and beats a utility on it.
  if (status === 'running') return <span className="flex text-brand-text"><Icon name="spinner" size="sm" className="pi-spin" label="Checking" /></span>;
  if (status === 'pass') return <span className="flex text-approved-text"><Icon name="check" size="sm" label="OK" /></span>;
  if (status === 'idle') return null;
  return (
    <span className="flex items-center gap-1.5">
      <StatusPill status={status === 'fail' ? 'rejected' : 'pending'} className="shrink-0">
        {status === 'fail' ? 'Fix' : 'Check'}
      </StatusPill>
      {expandable ? <span className="flex text-ds-muted"><Icon name={expanded ? 'chevron-up' : 'chevron-down'} size="var(--fs-10)" /></span> : null}
    </span>
  );
}

/* With "Desktop site" on, Chrome ignores the viewport meta and lays the page
   out ~980px wide, then shrinks it onto the phone: this screen — the one
   telling them to fix exactly that — came out at a third of its size. Scale
   it back by the same factor (layout width ÷ screen width). 1 everywhere else. */
export function desktopSiteZoom(env, innerWidth) {
  if (!isDesktopSite(env) || !env.screenW || !innerWidth) return 1;
  const ratio = innerWidth / env.screenW;
  return ratio < 1.2 ? 1 : Math.min(ratio, 4);
}

function useDesktopSiteZoom() {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const update = () => setZoom(desktopSiteZoom(readEnv(), window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return zoom;
}

function Summary({ list, running, done, failing, warnings }) {
  const total = list.length;
  const passed = list.filter((c) => c.r?.status === 'pass').length;
  const warned = list.filter((c) => c.r?.status === 'warn').length;
  const failed = failing.length;
  const pending = total - passed - warned - failed;
  const ok = done && failed === 0;

  const title = !done && !list.some((c) => c.r)
    ? 'Checking your phone…'
    : running
      ? 'Checking again…'
      : ok
        ? 'Your phone is ready'
        : `${failed} setting${failed === 1 ? '' : 's'} to fix`;
  const line = running
    ? 'This takes a few seconds.'
    : ok
      ? warnings
        ? 'You can continue. One thing below is worth a look.'
        : 'Everything Elbrit One needs is turned on.'
      : 'Fix the red one, then come back here.';

  // The page's heading: the ring is the progress, the title is the state.
  return (
    <header className="flex items-center gap-4 px-1 pb-1 pt-2">
      <ProgressRing
        aria-hidden
        segments={[
          { value: passed, tone: 'success', label: 'OK' },
          { value: warned, tone: 'warning', label: 'Check' },
          { value: failed, tone: 'danger', label: 'Fix' },
          { value: pending, tone: 'neutral', label: 'Waiting', style: { opacity: 0.25 } },
        ]}
      >
        <span className="text-14 font-semibold tabular-nums text-heading">
          {passed + warned}
          <span className="text-11 font-medium text-ds-muted">/{total}</span>
        </span>
      </ProgressRing>
      <div role="status" aria-live="polite" className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h1 className={cx('text-18 font-semibold', ok ? 'text-approved-text' : 'text-heading')}>{title}</h1>
        <span className="text-12 text-ds-secondary">{line}</span>
      </div>
    </header>
  );
}

export function DeviceCheck({
  continueLabel = 'Continue',
  continueUrl,
  autoContinue = false,
  onPass,
  onResult,
  // Code-only (not in Studio): results the launch gate already has, so the
  // screen opens on the problem instead of checking again, and its time limits.
  initialResults,
  initialPlatform,
  timeouts,
  className,
  style,
}) {
  const seeded = Array.isArray(initialResults) && initialResults.length > 0;
  const [results, setResults] = useState(() => (seeded ? Object.fromEntries(initialResults.map((r) => [r.id, r])) : {}));
  const [platform, setPlatform] = useState(initialPlatform ?? null);
  const [current, setCurrent] = useState(null);
  const [done, setDone] = useState(seeded);
  const [open, setOpen] = useState(() => (seeded ? initialResults.find(isBlocking)?.id ?? null : null));
  const skipFirstRun = useRef(seeded);
  const runningRef = useRef(false);
  const passedRef = useRef(false);
  const site = typeof window !== 'undefined' ? window.location.host : 'this site';
  const running = current !== null;
  const zoom = useDesktopSiteZoom();

  const proceed = useCallback(
    (all) => {
      onPass?.(all);
      if (continueUrl && typeof window !== 'undefined') window.location.assign(continueUrl);
    },
    [onPass, continueUrl],
  );

  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setCurrent(CHECKS[0].id);
    const { results: all, platform: p } = await runAllChecks({
      timeouts,
      onEach: (r) => {
        setResults((prev) => ({ ...prev, [r.id]: r }));
        const next = CHECKS[CHECKS.findIndex((c) => c.id === r.id) + 1];
        setCurrent(next ? next.id : null);
      },
    });
    setPlatform(p);
    const firstFail = all.find(isBlocking);
    setOpen(firstFail ? firstFail.id : null);
    setCurrent(null);
    setDone(true);
    runningRef.current = false;
    onResult?.({ ok: !firstFail, results: all, platform: p });
    if (!firstFail && autoContinue && !passedRef.current) {
      passedRef.current = true;
      proceed(all);
    }
  }, [autoContinue, onResult, proceed, timeouts]);

  useEffect(() => {
    if (skipFirstRun.current) skipFirstRun.current = false;
    else run();
    // Coming back from the browser's settings: check again on its own.
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);

    let perm;
    const onPerm = () => run();
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((s) => {
        perm = s;
        s.addEventListener?.('change', onPerm);
      })
      .catch(() => {});

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      perm?.removeEventListener?.('change', onPerm);
    };
  }, [run]);

  const list = CHECKS.map((c) => ({ ...c, r: results[c.id] }));
  const failing = list.filter((c) => isBlocking(c.r));
  const warnings = list.some((c) => c.r?.status === 'warn');
  const firstFailId = failing[0]?.id;
  const allOk = done && failing.length === 0;
  const canContinue = Boolean(onPass || continueUrl);

  return (
    <section
      className={cx('mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-6 pt-5', className)}
      style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', ...(zoom !== 1 ? { zoom } : null), ...style }}
    >
      <Summary list={list} running={running} done={done} failing={failing} warnings={warnings} />

      <Card variant="hairline" padding="none" className="overflow-hidden">
        <ul>
          {list.map((c, i) => {
            const status = current === c.id ? 'running' : c.r ? c.r.status : 'idle';
            const tone = TONE[c.r?.status] ?? TONE.idle;
            const expandable = Boolean(c.r && c.r.status !== 'pass');
            const expanded = expandable && open === c.id;
            // One thing at a time: later problems point back to the first.
            const waiting = c.r?.status === 'fail' && c.id !== firstFailId && !expanded;
            const fix = expanded ? instructionsFor(c.id, c.r.code, platform, site) : null;
            return (
              <li key={c.id} className={cx('px-3 py-2.5', i > 0 && 'border-t border-line-subtle', expanded && 'bg-surface')}>
                <button
                  type="button"
                  disabled={!expandable}
                  onClick={() => setOpen(expanded ? null : c.id)}
                  aria-expanded={expandable ? expanded : undefined}
                  className={cx(
                    'flex w-full items-center gap-3 text-left',
                    expandable ? 'cursor-pointer' : 'cursor-default',
                  )}
                >
                  <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors', tone.tile)}>
                    <Icon name={c.icon} size="md" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-13 font-semibold text-heading">{c.label}</span>
                    {c.r && c.r.status !== 'pass' ? (
                      <span className={cx('text-11 leading-4', tone.text)}>{waiting ? 'Fix the one above first.' : c.r.detail}</span>
                    ) : null}
                  </span>
                  <Trailing status={status} expandable={expandable} expanded={expanded} />
                </button>
                {expanded ? <FixPanel fix={fix} /> : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex flex-col gap-2 pt-1">
        {allOk && canContinue ? (
          <Button type="primary" size="app" block icon={<Icon name="arrow-right" />} iconPosition="end" onClick={() => proceed(list.map((c) => c.r))}>
            {continueLabel}
          </Button>
        ) : null}
        {!allOk ? (
          <Button type="default" size="app" block loading={running} icon={running ? null : <Icon name="refresh" />} onClick={run}>
            {running ? 'Checking…' : 'Check again'}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export default DeviceCheck;
