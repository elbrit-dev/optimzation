import { useMemo, useSyncExternalStore } from 'react';
import Router from 'next/router';
import * as Sentry from '@sentry/nextjs';
import { DataProvider, GlobalActionsProvider } from '@plasmicapp/host';
import app from '../firebase';

/**
 * IMPERSONATION: signing in as someone else, and getting back.
 *
 * The header's Switch used to show only when the ACTIVE ERP user (`me`) was
 * in IT / MIS / Marketing or the CEO. Impersonating swaps that ERP token, so
 * after switching into someone without those rights the button vanished and
 * the only way back was to log out and in again. This keeps the real person's
 * own token aside for the whole session:
 *
 *   switchTo(id, reason, name)  the FIRST switch saves your own token; a jump
 *                               from A to B keeps it (A's is never saved)
 *   backToSelf()                puts your own token back
 *
 * The Plasmic Login page (/login/<id>/<name>/<reason>) still does the swap: it
 * asks the ERP for the person's token (userToken) and stores it as
 * localStorage "token". Both actions load a whole new page rather than
 * routing client-side, so nothing from the previous person's session stays in
 * memory. Logout's localStorage.clear() drops the saved token too.
 *
 * Every switch and return goes to Sentry ("Impersonation: switch" / "back to
 * self"), and while it lasts every event carries the tags impersonating and
 * impersonator.
 *
 * Used by components/ImpersonateSwitch.jsx (the button and sheet) and by the
 * "Impersonation" global context below ($ctx.impersonation + global actions).
 *
 * WHO MAY SWITCH is decided by the BACKEND (SECURITY_PERM_V2.md, fix 5):
 * isAllowed() below only decides whether the Switch button is SHOWN. The
 * backend's `userToken` must refuse callers who may not impersonate. When it
 * does, the Login page never stores a new token; this file notices (the token
 * did not change), puts the previous state back and shows a clear message
 * instead of silently landing the person back on their own account.
 */

const STORE = 'elbrit.impersonation';
const TOKEN = 'token';
const LOGIN_PREFIX = '/login/';
const PLACEHOLDER_ID = '[id]';
// A switch that has not produced a new token after this long, while still on
// the Login page, is reported as refused (it is still accepted if the token
// turns up later). Generous: field sales are on slow mobile data.
const SWITCH_WAIT_MS = 20_000;
// Per tab, so the message survives the full-page loads around a switch.
const FAILED = 'elbrit.impersonation.failed';

export const DEFAULT_DEPARTMENTS = ['IT - ELPL', 'MIS - ELPL', 'Marketing - ELPL'];
export const DEFAULT_DESIGNATIONS = ['Chief Executive Officer'];

/* ---------------------------------------------
   STORAGE
--------------------------------------------- */

function readRecord() {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRecord(record) {
  try {
    if (record) localStorage.setItem(STORE, JSON.stringify(record));
    else localStorage.removeItem(STORE);
  } catch {
    // Storage blocked: impersonation still works, Back to me won't.
  }
}

function readToken() {
  try {
    return localStorage.getItem(TOKEN);
  } catch {
    return null;
  }
}

/** The person really signed in (Firebase), whoever's ERP token is in use. */
export function currentActor() {
  try {
    const user = app.auth().currentUser;
    if (!user) return null;
    return {
      uid: user.uid,
      name: user.displayName || null,
      email: user.email || null,
      phone: user.phoneNumber || null,
    };
  } catch {
    return null;
  }
}

export function actorLabel(actor) {
  return actor?.email || actor?.phone || actor?.name || actor?.uid || 'unknown';
}

/** The id in /login/<id>/..., or null for any other page or the placeholder. */
function loginTarget(url) {
  const path = String(url || '').split(/[?#]/)[0];
  if (!path.startsWith(LOGIN_PREFIX)) return null;
  let id = path.slice(LOGIN_PREFIX.length).split('/')[0] || '';
  try {
    id = decodeURIComponent(id);
  } catch {
    // keep it raw
  }
  return id && id !== PLACEHOLDER_ID ? id : null;
}

/** Signed in as someone else: a saved own token that isn't the one in use. */
function isActive(record) {
  const token = readToken();
  return Boolean(record?.originalToken && token && token !== record.originalToken);
}

/**
 * Save the own token before the Login page swaps it. Only the FIRST switch
 * saves: during a jump from A to B the token in use is A's, not yours.
 */
function rememberSelf(target, reason) {
  const existing = readRecord();
  let record = existing?.originalToken ? existing : null;
  const tokenBefore = readToken();
  if (!record) {
    if (!tokenBefore) return null; // not signed in to the ERP: nothing to come back to
    record = { originalToken: tokenBefore, actor: currentActor(), startedAt: new Date().toISOString(), switches: 0 };
  }
  // What to put back if the backend refuses: the token in use now, and (for a
  // jump from A to B) who we were impersonating before.
  record.pending = {
    target: String(target),
    tokenBefore,
    previousTarget: existing?.originalToken ? existing.target ?? null : null,
    previousReason: existing?.originalToken ? existing.reason ?? null : null,
    at: Date.now(),
  };
  clearFailure();
  record.target = String(target);
  record.reason = reason || '';
  record.switchedAt = new Date().toISOString();
  record.switches = (record.switches || 0) + 1;
  writeRecord(record);
  return record;
}

/* ---------------------------------------------
   REFUSED SWITCHES
--------------------------------------------- */

function readFailure() {
  try {
    const raw = sessionStorage.getItem(FAILED);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearFailure() {
  try {
    sessionStorage.removeItem(FAILED);
  } catch {
    // nothing to clear
  }
}

/** Record a refused switch once (keyed by when it started), even if dismissed. */
function noteFailure(record) {
  const pending = record?.pending;
  if (!pending) return;
  if (readFailure()?.at === pending.at) return;
  try {
    sessionStorage.setItem(FAILED, JSON.stringify({ target: pending.target, at: pending.at }));
  } catch {
    // storage blocked: no message, but nothing else breaks
  }
  report('switch refused', record, { waitedMs: Date.now() - pending.at });
}

/**
 * The switch did not take (the Login page left, or never wrote a new token):
 * put back what was there before it. For a first switch the record goes; for a
 * jump from A to B we are still A, so the record goes back to naming A.
 */
function undoPendingSwitch(record) {
  const pending = record.pending;
  noteFailure(record);
  if (pending.previousTarget) {
    record.target = pending.previousTarget;
    record.reason = pending.previousReason;
    record.switches = Math.max(1, (record.switches || 1) - 1);
    delete record.pending;
    writeRecord(record);
    return record;
  }
  writeRecord(null);
  return null;
}

/* ---------------------------------------------
   SENTRY
--------------------------------------------- */

function report(kind, record, extra = {}) {
  try {
    Sentry.captureEvent({
      message: `Impersonation: ${kind}`,
      level: 'info',
      fingerprint: ['impersonation', kind],
      tags: {
        'impersonation.kind': kind,
        'impersonation.target': record?.target || 'unknown',
        'impersonation.actor': actorLabel(record?.actor),
      },
      contexts: {
        impersonation: {
          target: record?.target ?? null,
          reason: record?.reason ?? null,
          actor: record?.actor ?? null,
          startedAt: record?.startedAt ?? null,
          switches: record?.switches ?? null,
          ...extra,
        },
      },
    });
  } catch {
    // Telemetry must never block a switch.
  }
}

function tagScope(record, active) {
  try {
    Sentry.setTag('impersonating', active ? record.target : undefined);
    Sentry.setTag('impersonator', active ? actorLabel(record.actor) : undefined);
  } catch {
    // no Sentry
  }
}

/* ---------------------------------------------
   STORE (one per page, shared by every reader)
--------------------------------------------- */

const IDLE = Object.freeze({
  active: false,
  target: null,
  reason: null,
  actor: null,
  startedAt: null,
  switches: 0,
  // Set when the backend refused a switch: who it was to, until dismissed.
  failedTarget: null,
  failedAt: null,
});

let snapshot = IDLE;
const listeners = new Set();
let uninstall = null;

function compute() {
  let record = readRecord();
  const onLoginPage = Boolean(loginTarget(window.location.pathname));

  if (record?.pending) {
    if (readToken() !== record.pending.tokenBefore) {
      // The Login page stored the new person's token: the switch took.
      delete record.pending;
      writeRecord(record);
      clearFailure();
    } else if (!onLoginPage) {
      // Left the Login page without a new token: refused / failed.
      record = undoPendingSwitch(record);
    } else if (Date.now() - record.pending.at > SWITCH_WAIT_MS) {
      // Still on the Login page and nothing yet: say so now.
      noteFailure(record);
    }
  }

  // A switch that never took (unknown person, ERP error) leaves our own token
  // in place: forget it once we're off the Login page.
  if (record && !isActive(record) && !onLoginPage) {
    writeRecord(null);
    record = null;
  }
  const active = isActive(record);
  tagScope(record, active);
  const failure = readFailure();
  const failed = failure?.target && !failure.dismissed
    ? { failedTarget: String(failure.target), failedAt: Number(failure.at) || null }
    : { failedTarget: null, failedAt: null };
  return active
    ? {
        active: true,
        target: record.target ?? null,
        reason: record.reason ?? null,
        actor: record.actor ?? null,
        startedAt: record.startedAt ?? null,
        switches: record.switches ?? 1,
        ...failed,
      }
    : failed.failedTarget
      ? { ...IDLE, ...failed }
      : IDLE;
}

function refresh() {
  const next = compute();
  const same = Object.keys(IDLE).every((k) => Object.is(next[k], snapshot[k]));
  if (same) return;
  snapshot = next;
  listeners.forEach((fn) => fn());
}

function install() {
  // Studio's canvas (/plasmic-host) has no session to act on.
  if (window.location.pathname.startsWith('/plasmic-host')) return () => {};

  // A switch that didn't come through switchTo (an old modal, a typed URL):
  // still save the own token before the Login page replaces it. The Login
  // page only writes the token after its ERP call returns, so this is first.
  const onRouteStart = (url) => {
    const target = loginTarget(url);
    if (target && !readRecord()) rememberSelf(target, null);
  };
  const opened = loginTarget(window.location.pathname);
  if (opened && !readRecord()) rememberSelf(opened, null);

  const onVisible = () => document.visibilityState === 'visible' && refresh();
  Router.events.on('routeChangeStart', onRouteStart);
  Router.events.on('routeChangeComplete', refresh);
  window.addEventListener('storage', refresh);
  document.addEventListener('visibilitychange', onVisible);
  // The Login page writes the token in THIS tab, which fires no 'storage'
  // event: while a switch is pending there, look once a second.
  const poll = window.setInterval(() => {
    if (readRecord()?.pending && loginTarget(window.location.pathname)) refresh();
  }, 1000);
  refresh();
  return () => {
    Router.events.off('routeChangeStart', onRouteStart);
    Router.events.off('routeChangeComplete', refresh);
    window.removeEventListener('storage', refresh);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(poll);
  };
}

function subscribe(fn) {
  listeners.add(fn);
  if (!uninstall) uninstall = install();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && uninstall) {
      uninstall();
      uninstall = null;
    }
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => IDLE;

/* ---------------------------------------------
   ACTIONS
--------------------------------------------- */

/** Sign in as `id` (phone or email). Returns false if there was nothing to do. */
export function switchTo(id, reason, name) {
  const target = id == null ? '' : String(id).trim();
  if (!target) {
    console.warn('Impersonation: Switch to person needs a phone number or email.');
    return false;
  }
  const record = rememberSelf(target, reason);
  if (!record) {
    console.warn('Impersonation: not signed in to the ERP, nothing to switch from.');
    return false;
  }
  report('switch', record, { jump: record.switches > 1 });
  const who = name || actorLabel(record.actor);
  const seg = (v) => encodeURIComponent(v == null || v === '' ? '-' : String(v));
  window.location.assign(`${LOGIN_PREFIX}${seg(target)}/${seg(who)}/${seg(reason)}`);
  return true;
}

/**
 * Hide the "switch refused" message. Kept (as dismissed) rather than removed,
 * so the same refused switch is not reported or shown a second time.
 */
export function dismissSwitchError() {
  const failure = readFailure();
  if (failure) {
    try {
      sessionStorage.setItem(FAILED, JSON.stringify({ ...failure, dismissed: true }));
    } catch {
      // storage blocked
    }
  }
  refresh();
}

/** Give up on a switch the backend refused and go home as before. */
function abandonSwitch() {
  const record = readRecord();
  if (record?.pending) undoPendingSwitch(record);
  dismissSwitchError();
  window.location.replace('/');
}

/** Back to the account you signed in with, on the home page. */
export function backToSelf() {
  const record = readRecord();
  if (record?.originalToken) {
    try {
      localStorage.setItem(TOKEN, record.originalToken);
    } catch {
      return;
    }
    report('back to self', record);
  }
  writeRecord(null);
  window.location.replace('/');
}

/** May `me` see Switch? Allowed department/designation, or impersonating now. */
export function isAllowed(me, { active, departments = DEFAULT_DEPARTMENTS, designations = DEFAULT_DESIGNATIONS } = {}) {
  if (active) return true;
  const department = me?.department__name || me?.department?.name || me?.department;
  const designation = me?.designation__name || me?.designation?.name || me?.designation;
  return departments.includes(department) || designations.includes(designation);
}

/** { active, target, reason, actor, startedAt, switches } — re-renders on change. */
export function useImpersonation() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ---------------------------------------------
   PLASMIC GLOBAL CONTEXT
--------------------------------------------- */

function asList(value, fallback) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.trim()) return value.split(',').map((s) => s.trim());
  return fallback;
}

/**
 * $ctx.impersonation for any page (.active, .target, .reason, .actor,
 * .isAllowed(me)) and the global actions "Switch to person" / "Back to me",
 * for building something the ImpersonateSwitch component doesn't cover.
 */
export function Impersonation({ children, allowedDepartments, allowedDesignations }) {
  const state = useImpersonation();
  const departments = asList(allowedDepartments, DEFAULT_DEPARTMENTS);
  const designations = asList(allowedDesignations, DEFAULT_DESIGNATIONS);
  const rulesKey = `${departments.join('|')}#${designations.join('|')}`;

  const data = useMemo(
    () => ({
      ...state,
      isAllowed: (me) => isAllowed(me, { active: state.active, departments, designations }),
    }),
    // departments/designations are rebuilt each render; rulesKey is their content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, rulesKey]
  );
  const actions = useMemo(() => ({ switchTo, backToSelf, dismissSwitchError }), []);

  return (
    <GlobalActionsProvider contextName="Impersonation" actions={actions}>
      <DataProvider name="impersonation" data={data}>
        {children}
        <SwitchRefusedBanner target={state.failedTarget} />
      </DataProvider>
    </GlobalActionsProvider>
  );
}

/**
 * Shown when the backend refused (or never answered) a switch. The person is
 * still on their previous account; this says so instead of leaving them on a
 * Login page that did nothing.
 */
function SwitchRefusedBanner({ target }) {
  if (!target) return null;
  const onLoginPage = typeof window !== 'undefined' && Boolean(loginTarget(window.location.pathname));
  const button = {
    border: 0,
    borderRadius: 6,
    padding: '6px 12px',
    font: '600 13px/1.2 inherit',
    cursor: 'pointer',
  };
  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        zIndex: 2147483000,
        maxWidth: 520,
        margin: '0 auto',
        padding: '12px 14px',
        borderRadius: 10,
        background: '#fff1f0',
        border: '1px solid #f5c2bd',
        color: '#7a1c12',
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
        font: '500 14px/1.4 system-ui, sans-serif',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Could not switch to {target}</div>
      <div>
        The ERP refused it or did not answer: you may not have permission to sign in as this person, or they
        were not found. You are still signed in as before.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
        {onLoginPage ? (
          <button
            type="button"
            style={{ ...button, background: '#7a1c12', color: '#fff' }}
            onClick={abandonSwitch}
          >
            Go back
          </button>
        ) : null}
        <button type="button" style={{ ...button, background: '#f5c2bd', color: '#7a1c12' }} onClick={dismissSwitchError}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default Impersonation;
