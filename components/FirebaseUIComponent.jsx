import React, { useCallback, useEffect, useRef, useState } from "react";
import app from "../firebase"; // now using compat app
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { Toaster, toast } from 'sonner';

/**
 * FirebaseUIComponent — native Firebase Auth UI (Google & Phone) with a busy
 * overlay and result toasts.
 *
 * Why the overlay exists:
 *   FirebaseUI hands control back the instant Firebase resolves, but signing in
 *   isn't finished at that point — the host page still has to run its own
 *   `onSuccess` work (ERP login, profile fetch, redirect). During that window the
 *   widget showed a blank box and nothing else, so the page looked frozen and
 *   people clicked "Sign in" again. The overlay covers the WHOLE attempt: from the
 *   moment an attempt starts until we know it succeeded or failed, including the
 *   host's own async `onSuccess` handler.
 *
 * How "busy" is decided (this is the important part):
 *   Two signals, OR'd together, because neither alone is trustworthy.
 *     1. DOM-derived (`domBusy`) — FirebaseUI names each screen it renders
 *        `firebaseui-id-page-<key>` and shows `.firebaseui-id-busy-indicator`
 *        while it waits on the network. When it is parked on blank/spinner/callback
 *        it IS waiting (Google popup open, SMS being sent, code being checked).
 *        This signal is self-correcting: we never have to guess when an attempt
 *        ended, so the overlay cannot wedge on a path we didn't anticipate
 *        (popup dismissed, reCAPTCHA refused, an error FirebaseUI swallows itself
 *        without ever calling `signInFailure`).
 *     2. Click-derived (`clickBusy`) — FirebaseUI delays its own busy indicator by
 *        ~half a second, which is long enough to feel unresponsive. A click on a
 *        provider button or a submit shows the overlay immediately, then hands off
 *        to signal 1. Every way it can end is bounded: FirebaseUI paints a
 *        different screen, signal 1 goes busy and comes back, signal 1 never
 *        shows up at all (a click that started nothing — client-side validation),
 *        or the hard backstop fires. A wrong guess costs a moment of spinner,
 *        never a stuck page.
 *
 * Toasts:
 *   Rendered with a LOCAL <Toaster/> because the host Plasmic app doesn't render
 *   one (same reason CalendarPage does it). Set `renderToaster` false if the page
 *   already has a Toaster, or Sonner will stack two of them.
 */

const STYLE_ID = "ebfu-firebaseui-styles";

// FirebaseUI screens that mean "waiting on Firebase", not "waiting on the user".
const BUSY_PAGES = new Set(["blank", "spinner", "callback"]);

// A click that never makes FirebaseUI busy started nothing at all — a submit the
// widget rejected on client-side validation, say. FirebaseUI takes ~500ms to raise
// its own indicator, so wait comfortably past that before assuming so.
const NO_START_TIMEOUT_MS = 2_000;

// Hard backstop on the click-derived overlay. Should never be reached: the checks
// above end it, and once FirebaseUI is visibly busy signal 1 owns the overlay.
const CLICK_BUSY_TIMEOUT_MS = 25_000;

// After the host's onSuccess resolves we keep the overlay up briefly, because the
// usual next step is a redirect and flashing the login form first looks broken.
// Bounded so a page that never navigates still ends in a readable state.
const SUCCESS_GRACE_MS = 6_000;

// Firebase error codes people actually hit here, in words they can act on.
// Anything unmapped falls through to the raw Firebase message.
const ERROR_MESSAGES = {
  "auth/timeout": "Phone verification timed out. Please try again.",
  "auth/network-request-failed": "Network problem. Check your connection and try again.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/quota-exceeded": "SMS limit reached for now. Try Google sign-in or try again later.",
  "auth/invalid-phone-number": "That phone number doesn't look right.",
  "auth/missing-phone-number": "Please enter your phone number.",
  "auth/invalid-verification-code": "That verification code isn't correct.",
  "auth/code-expired": "The code expired. Please request a new one.",
  "auth/user-disabled": "This account has been disabled. Please contact support.",
  "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups and try again.",
  "auth/operation-not-allowed": "This sign-in method isn't enabled for the app.",
  "auth/unauthorized-domain": "This site isn't authorised for sign-in. Please contact support.",
  "auth/account-exists-with-different-credential":
    "You already have an account with a different sign-in method.",
  "auth/web-storage-unsupported":
    "Sign-in needs cookies/storage. Turn off private browsing or allow cookies.",
};

// The user backed out — a choice, not a failure, so it shouldn't read as an error.
const CANCELLED_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);

function describeError(error) {
  const code = error?.code || "";
  return ERROR_MESSAGES[code] || error?.message || "Sign-in failed. Please try again.";
}

function identifyUser(user) {
  return user?.displayName || user?.email || user?.phoneNumber || "";
}

/** Which FirebaseUI screen is on show right now, e.g. "provider-sign-in" | "blank". */
function readPageKey(container) {
  if (!container) return null;
  const pages = container.querySelectorAll('[class*="firebaseui-id-page-"]');
  const last = pages[pages.length - 1];
  if (!last) return null;
  const match = /firebaseui-id-page-([a-z0-9-]+)/.exec(last.className || "");
  return match ? match[1] : null;
}

/** True while FirebaseUI itself is waiting on Firebase. See the header comment. */
function readDomBusy(container) {
  if (!container) return false;
  if (container.querySelector(".firebaseui-id-busy-indicator")) return true;
  const pageKey = readPageKey(container);
  return Boolean(pageKey && BUSY_PAGES.has(pageKey));
}

/**
 * Does FirebaseUI currently occupy real space?
 *
 * The overlay is sized by `inset: 0`, so it is only ever as big as this component's
 * box — and that box is sized by its content. While FirebaseUI has painted nothing
 * (still booting) or nothing but its spent blank screen (after a successful sign-in)
 * there is no content, the box shrinks to almost nothing, and the overlay's text
 * wraps to a sliver and spills out over whatever sits above and below. So when there
 * is no card to measure against, we reserve a box for the loader to sit in.
 *
 * Measured on the card's HEIGHT deliberately: the reserve lands on the outer box, and
 * a block child's height does not follow its parent's min-height, so this cannot feed
 * back into itself and oscillate. Measuring width would.
 */
function readHasContent(container) {
  const card = container?.querySelector('.firebaseui-container, [class*="firebaseui-id-page-"]');
  return Boolean(card && card.offsetHeight > 40);
}

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    /* position:relative also lives inline on the root so a Plasmic layout class
       can't knock the overlay out of its container. */
    .ebfu-root { position: relative; }
    /* No FirebaseUI card to sit on top of — see readHasContent(). The reserve is a
       little UNDER FirebaseUI's own 360px card so it can never widen the component:
       whenever there is a card, the card is what sets the size, exactly as before. */
    .ebfu-root--reserve { min-width: min(320px, 100%); min-height: 220px; }
    .ebfu-overlay {
      position: absolute; inset: 0; z-index: 20; overflow: hidden;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 10px; padding: 16px; box-sizing: border-box; text-align: center;
      background: rgba(255,255,255,0.92);
      backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
      border-radius: 12px;
      animation: ebfu-fade-in .16s ease-out;
    }
    .ebfu-spin { color: #0F87F9; animation: ebfu-spin 1s linear infinite; }
    /* max-width keeps the copy inside the box even if the host slot is narrower
       than the reserve; overflow:hidden above is the hard stop. */
    .ebfu-label { font: 600 14px/1.35 inherit; color: #18265c; max-width: 100%; }
    .ebfu-hint { font: 500 12px/1.4 inherit; color: #64748b; max-width: min(30ch, 100%); }
    @keyframes ebfu-spin { to { transform: rotate(360deg); } }
    @keyframes ebfu-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .ebfu-spin, .ebfu-overlay { animation: none; }
    }
  `;
  document.head.appendChild(el);
}

const FirebaseUIComponent = ({
  onSuccess,
  onError,
  onLoadingChange,
  className,
  style,
  showToasts = true,
  renderToaster = true,
  toastPosition = "top-right",
  finishingLabel = "Setting up your account…",
}) => {
  const uiRef = useRef(null);
  const containerRef = useRef(null);
  const [isClient, setIsClient] = useState(false);
  const [uiReady, setUiReady] = useState(false);

  // Overlay inputs, kept as separate pieces of truth so one can't mask another.
  const [domBusy, setDomBusy] = useState(false);
  const [clickBusy, setClickBusy] = useState(null);   // { label } | null
  const [finishing, setFinishing] = useState(false);  // host onSuccess in flight
  const [settled, setSettled] = useState(null);       // "success" — attempt is over
  const [hasContent, setHasContent] = useState(false); // is there a card to overlay?

  // Plasmic hands us a fresh function identity on every render. Holding the
  // handlers in refs is what stops the init effect below from tearing FirebaseUI
  // down and rebuilding it mid-sign-in (the old `[isClient, onSuccess, onError]`
  // dependency list did exactly that).
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onLoadingChangeRef = useRef(onLoadingChange);
  const showToastsRef = useRef(showToasts);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    onLoadingChangeRef.current = onLoadingChange;
    showToastsRef.current = showToasts;
  }, [onSuccess, onError, onLoadingChange, showToasts]);

  const mountedRef = useRef(true);
  const clickTimerRef = useRef(null);
  const noStartTimerRef = useRef(null);
  const graceTimerRef = useRef(null);
  const clickPageKeyRef = useRef(null); // screen showing when the click happened
  const sawDomBusyRef = useRef(false);  // did FirebaseUI actually go busy after it?
  const uiConfigRef = useRef(null);

  const clearClickBusy = useCallback(() => {
    clearTimeout(clickTimerRef.current);
    clearTimeout(noStartTimerRef.current);
    clickTimerRef.current = null;
    noStartTimerRef.current = null;
    clickPageKeyRef.current = null;
    sawDomBusyRef.current = false;
    setClickBusy(null);
  }, []);

  // ---- lifecycle -----------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;
    ensureStyles();
    setIsClient(true);
    return () => {
      mountedRef.current = false;
      clearTimeout(clickTimerRef.current);
      clearTimeout(noStartTimerRef.current);
      clearTimeout(graceTimerRef.current);
    };
  }, []);

  // ---- FirebaseUI boot -----------------------------------------------------
  useEffect(() => {
    if (!isClient) return;
    let cancelled = false;

    const restartUi = () => {
      if (!mountedRef.current || !uiRef.current || !containerRef.current) return;
      try {
        uiRef.current.reset();
        uiRef.current.start(containerRef.current, uiConfigRef.current);
      } catch (error) {
        console.error("Could not restart the sign-in widget:", error);
      }
    };

    /**
     * The host's onSuccess is where the real work happens (ERP login, redirect),
     * so the overlay has to outlive Firebase's own callback. FirebaseUI needs a
     * synchronous boolean back, hence the fire-and-forget shape: we return false
     * immediately and keep the overlay up from in here.
     */
    const finishSignIn = async (user) => {
      setFinishing(true);
      clearClickBusy();
      try {
        // Awaiting covers a Plasmic interaction that returns a promise; a plain
        // handler resolves at once and we fall straight through to the toast.
        await Promise.resolve(onSuccessRef.current?.({ firebaseUser: user }));
        if (!mountedRef.current) return;
        if (showToastsRef.current) {
          const who = identifyUser(user);
          toast.success(who ? `Signed in as ${who}` : "Signed in successfully");
        }
        // Hold the overlay through the redirect the host almost always starts here,
        // then fall back to a static "signed in" state so it can't sit spinning.
        setSettled("success");
        graceTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setFinishing(false);
        }, SUCCESS_GRACE_MS);
      } catch (error) {
        // Firebase said yes but the host's own step failed. Report it and put the
        // widget back, otherwise the user is left staring at FirebaseUI's spent
        // blank screen with no way to retry.
        console.error("Post-login step failed:", error);
        if (!mountedRef.current) return;
        setFinishing(false);
        if (showToastsRef.current) toast.error(describeError(error));
        onErrorRef.current?.(error);
        restartUi();
      }
    };

    const initializeFirebaseUI = async () => {
      const auth = app.auth(); // using compat auth

      const firebaseui = await import('firebaseui');
      await import('firebaseui/dist/firebaseui.css');
      if (cancelled || !containerRef.current) return;

      uiRef.current = firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(auth);

      uiConfigRef.current = {
        signInOptions: [
          {
            provider: firebase.auth.GoogleAuthProvider.PROVIDER_ID
          },
          {
            provider: 'phone',
            recaptchaParameters: {
              type: 'image',
              size: 'normal',
              badge: 'bottomleft'
            },
            defaultCountry: 'IN'
          }
        ],
        signInFlow: 'popup',
        callbacks: {
          signInSuccessWithAuthResult: (authResult) => {
            console.log('Login successful:', authResult.user.phoneNumber || authResult.user.email);
            finishSignIn(authResult.user);
            return false; // Prevent redirect — we drive the overlay/toast ourselves
          },
          signInFailure: (error) => {
            console.error('Login failed:', error.code, error.message);
            clearClickBusy();
            setFinishing(false);
            if (showToastsRef.current) {
              if (CANCELLED_CODES.has(error?.code)) toast.info("Sign-in was cancelled.");
              else toast.error(describeError(error));
            }
            onErrorRef.current?.(error);
            return Promise.resolve();
          },
          uiShown: () => {
            console.log('FirebaseUI is ready');
            if (mountedRef.current) setUiReady(true);
          }
        }
      };

      uiRef.current.start(containerRef.current, uiConfigRef.current);
    };

    initializeFirebaseUI().catch((error) => {
      console.error('Could not load the sign-in widget:', error);
      if (cancelled || !mountedRef.current) return;
      setUiReady(true); // stop the boot spinner; there's nothing more coming
      if (showToastsRef.current) {
        toast.error("Couldn't load sign-in. Please reload the page.");
      }
      onErrorRef.current?.(error);
    });

    return () => {
      cancelled = true;
      try {
        uiRef.current?.reset();
      } catch {
        /* reset on an already-torn-down instance is not worth reporting */
      }
    };
  }, [isClient, clearClickBusy]);

  // ---- signal 1: FirebaseUI's own DOM --------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!isClient || !container) return;

    const sync = () => {
      if (!mountedRef.current) return;
      const nowBusy = readDomBusy(container);
      setDomBusy(nowBusy);
      setHasContent(readHasContent(container));

      if (clickPageKeyRef.current === null) return; // no optimistic overlay to retire

      const pageKey = readPageKey(container);
      if (nowBusy) {
        sawDomBusyRef.current = true; // signal 1 has the overlay now
      } else if (sawDomBusyRef.current) {
        clearClickBusy();             // ...and it just finished
      } else if (pageKey && !BUSY_PAGES.has(pageKey) && pageKey !== clickPageKeyRef.current) {
        clearClickBusy();             // FirebaseUI moved to another screen instead
      }
    };

    const observer = new MutationObserver(sync);
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    // The card can also change size without any mutation we'd see — the reCAPTCHA
    // widget settling, a webfont landing — and readHasContent() measures height.
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    resizeObserver?.observe(container);

    sync();
    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
    };
  }, [isClient, clearClickBusy]);

  // ---- signal 2: the click that started an attempt -------------------------
  // Capture phase, so we see the click even though FirebaseUI stops propagation.
  const handleCapturedClick = useCallback((event) => {
    const container = containerRef.current;
    if (!container || settled) return;

    const idp = event.target.closest?.(".firebaseui-idp-button");
    const submit = event.target.closest?.(".firebaseui-id-submit");
    if (!idp && !submit) return;

    // "Sign in with phone" only swaps FirebaseUI to the number-entry screen —
    // nothing is in flight yet, so an overlay there would just block typing.
    // Checked two ways because a false positive here covers a form the user is
    // trying to fill in; FirebaseUI marks that button both with the attribute and
    // with a per-provider class.
    if (
      idp &&
      (idp.getAttribute("data-provider-id") === "phone" ||
        idp.classList.contains("firebaseui-idp-phone"))
    ) {
      return;
    }

    const pageKey = readPageKey(container);
    let label = "Signing you in…";
    if (submit && pageKey === "phone-sign-in-start") label = "Sending verification code…";
    else if (submit && pageKey === "phone-sign-in-finish") label = "Verifying your code…";

    clickPageKeyRef.current = pageKey;
    sawDomBusyRef.current = false;
    setClickBusy({ label });

    clearTimeout(noStartTimerRef.current);
    noStartTimerRef.current = setTimeout(() => {
      if (mountedRef.current && !sawDomBusyRef.current) clearClickBusy();
    }, NO_START_TIMEOUT_MS);

    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      if (mountedRef.current) clearClickBusy();
    }, CLICK_BUSY_TIMEOUT_MS);
  }, [settled, clearClickBusy]);

  // ---- report the overlay state outward ------------------------------------
  const booting = isClient && !uiReady;
  const busy = booting || finishing || Boolean(clickBusy) || (domBusy && !settled);

  useEffect(() => {
    onLoadingChangeRef.current?.(busy);
  }, [busy]);

  if (!isClient) {
    return null;
  }

  let label = null;
  let hint = null;
  if (booting) {
    label = "Loading sign-in…";
  } else if (finishing) {
    label = settled === "success" ? "Taking you in…" : finishingLabel;
    hint = settled === "success" ? null : "Please don't close this page.";
  } else if (clickBusy) {
    label = clickBusy.label;
  } else if (domBusy) {
    label = "Signing you in…";
    hint = "Finish signing in the popup window, if it's open.";
  }

  const overlay = busy ? (
    <div className="ebfu-overlay" role="status" aria-live="polite">
      <Loader2 className="ebfu-spin" size={28} strokeWidth={2.5} aria-hidden="true" />
      <span className="ebfu-label">{label}</span>
      {hint ? <span className="ebfu-hint">{hint}</span> : null}
    </div>
  ) : settled === "success" ? (
    // Signed in, and the host never navigated away. Say so instead of leaving
    // FirebaseUI's spent blank screen sitting there.
    <div className="ebfu-overlay">
      <span className="ebfu-label">You&rsquo;re signed in.</span>
      <span className="ebfu-hint">If this page doesn&rsquo;t move on, please reload it.</span>
    </div>
  ) : null;

  // Reserve a box for the loader ONLY when there's no FirebaseUI card to cover.
  // With a card, the card sizes the component exactly as it did before the overlay
  // existed — the shape the host laid out is untouched.
  const reserve = Boolean(overlay) && !hasContent;

  return (
    <div
      className={`ebfu-root${reserve ? " ebfu-root--reserve" : ""}${className ? ` ${className}` : ""}`}
      style={{ position: "relative", ...style }}
      aria-busy={busy || undefined}
      onClickCapture={handleCapturedClick}
    >
      {renderToaster ? <Toaster richColors position={toastPosition} /> : null}
      <div ref={containerRef} />
      {overlay}
    </div>
  );
};

export default dynamic(() => Promise.resolve(FirebaseUIComponent), {
  ssr: false,
  loading: () => <div>Loading authentication...</div>
});
