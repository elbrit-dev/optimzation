import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { exitApp, isExiting, resumeExitIfPending } from "../lib/appExit";

/**
 * Makes the back gesture behave like a native app's: home is the root, and the
 * root does not fall out of the app.
 *
 * Installed as a PWA there is no browser chrome, so the system back button IS
 * the app's navigation. Two things were wrong with what the browser does on
 * its own:
 *
 *   1. The home screen is the FIRST entry the PWA opens (`start_url: "/"`), so
 *      back there had nothing to pop and the OS closed the app instantly — no
 *      warning, mid-task, no way to undo.
 *   2. When the session started at /login instead, back from home walked into
 *      the login page. That is not a place a signed-in person should ever
 *      land: it re-runs the sign-in flow and, through NovuInbox's
 *      `pathname === "/login"` branch, tears down the push subscription — the
 *      "it logged me out on its own" report.
 *
 * Anywhere else in the app back is already correct and is left untouched.
 *
 * The mechanism is the one shared/calendar/components/calendar/hooks.js already
 * uses for overlays: a throwaway history entry, plus a CAPTURE-phase popstate
 * listener that can stop the event before Next's router (a bubble-phase
 * listener on the same window) ever sees it. Capture at the target runs first,
 * so swallowing here means the route does not change and nothing re-renders.
 *
 * Deliberately layered UNDER that overlay hook: an open dialog's back press
 * must still close the dialog. See rule 2 in `handlePop` — when a layer above
 * our sentinel is what got popped, the event is left alone and the calendar's
 * own handler takes it.
 *
 * Back at home raises the "Exit Elbrit One?" prompt. Actually closing the app
 * is a job in itself — the browser only permits it under a condition that has
 * to be manufactured — and lives in lib/appExit.js.
 *
 * iOS is the exception, and not by choice: Safari never honours close(), and a
 * home-screen web app has no back button anyway — its left-edge swipe just
 * stops at the root. There the sentinel simply absorbs the swipe and no prompt
 * is shown, because an Exit button that cannot exit is worse than none.
 */

/** Marks the throwaway entry that stands between home and leaving the app. */
const EXIT_FLAG = "__elbritExitGuard";

/** Routes the back gesture treats as the app's root. */
const HOME_ROUTES = ["/"];

/** Routes a signed-in person must never be able to reach by going back. */
const LOGIN_ROUTES = ["/login"];

const normalise = (pathname) => {
  if (!pathname) return "/";
  const path = String(pathname).split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
};

const isHomeRoute = (pathname) => HOME_ROUTES.includes(normalise(pathname));
const isLoginRoute = (pathname) => LOGIN_ROUTES.includes(normalise(pathname));

/**
 * Only an INSTALLED app gets the root treatment.
 *
 * In an ordinary browser tab, back from home means "the page I was on before
 * this site" and hijacking it would be wrong — there the browser is already
 * doing the right thing. `window.__ELBRIT_FORCE_EXIT_GUARD = true` in the
 * console forces it on, which is the only way to exercise this on a desktop.
 */
const isInstalledApp = () => {
  if (typeof window === "undefined") return false;
  if (window.__ELBRIT_FORCE_EXIT_GUARD) return true;
  if (window.navigator?.standalone) return true; // iOS home-screen app
  if (typeof document !== "undefined" && document.referrer?.startsWith("android-app://")) {
    return true;
  }
  /* Asked the other way round on purpose. Testing FOR "standalone" misses
     fullscreen, minimal-ui, window-controls-overlay and whatever display mode
     ships next; "browser" is the single mode that means a real tab, and
     everything else is an app window. */
  const tab = window.matchMedia?.("(display-mode: browser)");
  return tab ? !tab.matches : false;
};

/** iPhone and iPad, including iPadOS, which reports itself as a Mac. */
const isIOS = () => {
  if (typeof navigator === "undefined") return false;
  if (/iPad|iPhone|iPod/.test(navigator.platform || "")) return true;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent || "")) return true;
  return /Macintosh/.test(navigator.userAgent || "") && navigator.maxTouchPoints > 1;
};

/** Safari ignores window.close() outright, so iOS gets no prompt. */
const canCloseApp = () => !isIOS();

export default function PwaBackGuard() {
  const router = useRouter();
  const [confirmingExit, setConfirmingExit] = useState(false);

  // A ref, not state: the popstate listener is registered once and has to read
  // today's router, not the one captured when it was attached.
  const routerRef = useRef(router);
  routerRef.current = router;

  /* Firebase restores the session from IndexedDB asynchronously, so
     `currentUser` is null for the first moments after a cold start. Treating
     "not resolved yet" as signed IN is the safe default here: this flag only
     ever BLOCKS a jump to the login page, and someone already inside the app
     is by definition signed in. Erring the other way would let exactly the bug
     we are fixing through during the window it is most likely to happen. */
  const authedRef = useRef(true);
  const authResolvedRef = useRef(false);
  const isAuthed = () => (authResolvedRef.current ? authedRef.current : true);

  useEffect(() => {
    const auth = typeof window !== "undefined" ? window.firebaseAuth : null;
    if (!auth?.onAuthStateChanged) return undefined;
    return auth.onAuthStateChanged((user) => {
      authedRef.current = !!user;
      authResolvedRef.current = true;
    });
  }, []);

  /**
   * Has this document ever been touched?
   *
   * Reported by the diagnostics below, because on Chromium it is the single
   * fact that decides whether the sentinel is honoured at all.
   *
   * Chrome's history-manipulation intervention exists to stop a page trapping
   * the back button, and its rule is: when a document adds a history entry
   * with no user activation behind it, EVERY same-document entry of that
   * document is flagged for the back button to skip. Arm on mount with nobody
   * having touched the screen and the flag lands on home itself — back skips
   * home, and home being the first entry of a launched PWA, the app closes
   * with the sentinel sitting there unused. That was the intermittent case:
   * reaching home through a tap-driven navigation armed it correctly, a cold
   * start did not.
   *
   * The part that makes this tractable: the flag is not permanent. Chromium
   * clears it for every same-document entry the moment the document receives
   * a gesture. So arming early costs nothing — the first touch of any kind,
   * including the one that starts a scroll, makes an already-pushed sentinel
   * real. Which is why there is no activation gate on `armSentinel` below.
   */
  const gestureRef = useRef(false);
  const hasUserActivation = () => {
    // The API is authoritative where it exists; our own flag is the fallback
    // for the browsers (WebKit, Gecko) that do not implement it — and that do
    // not have the intervention either, so it only ever reads as diagnostics.
    if (typeof navigator !== "undefined" && navigator.userActivation) {
      return navigator.userActivation.hasBeenActive;
    }
    return gestureRef.current;
  };

  /**
   * Keeps exactly one throwaway entry sitting on top of home.
   *
   * The state is SPREAD from Next's own, so the entry keeps `__N` and Next
   * treats a pop onto it as a normal navigation back to home — which is what
   * keeps "back from a deep page returns to home" working even with the
   * sentinel in the way. Without the spread Next ignores the pop and the URL
   * and the rendered page drift apart.
   */
  const armSentinel = useCallback(() => {
    if (typeof window === "undefined") return;
    // An exit is unwinding the history; adding to it would fight the walk.
    if (isExiting()) return;
    if (!isInstalledApp()) return;
    if (!isHomeRoute(window.location.pathname)) return;
    if (window.history.state?.[EXIT_FLAG]) return;
    window.history.pushState({ ...window.history.state, [EXIT_FLAG]: true }, "");
  }, []);

  /* Every touch is a chance to arm, and a cheap no-op once the sentinel is in
     place. The list is wide on purpose — browsers disagree about which event
     grants activation, and this only has to catch whichever comes first.
     Capture + passive, so nothing in the app can swallow it or be slowed by
     it, and `touchstart` so the touch that merely BEGINS a scroll counts. */
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onGesture = () => {
      gestureRef.current = true;
      armSentinel();
    };
    const events = [
      "pointerdown",
      "pointerup",
      "touchstart",
      "touchend",
      "click",
      "keydown",
    ];
    const opts = { capture: true, passive: true };
    events.forEach((name) => window.addEventListener(name, onGesture, opts));
    return () => events.forEach((name) => window.removeEventListener(name, onGesture, opts));
  }, [armSentinel]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handlePop = (event) => {
      /* 0. An exit is in flight. lib/appExit.js is walking the history back
            and swallowing its own pops; every rule below would fight it —
            rule 1 especially, since the walk passes straight through /login
            on its way to entry 0. */
      if (isExiting()) return;

      const path = window.location.pathname;

      /* 1. The login page is off limits while someone is signed in.
            The event is swallowed, so Next never routes and the page the user
            was looking at stays mounted; all that is left is to put its URL
            back onto the entry the browser just moved us to. */
      if (isLoginRoute(path) && isAuthed()) {
        event.stopImmediatePropagation();
        const current = routerRef.current;
        const safe =
          current?.asPath && !isLoginRoute(current.asPath) ? current.asPath : "/";
        Promise.resolve(current?.replace(safe, undefined, { shallow: true }))
          .then(armSentinel)
          .catch(() => {});
        return;
      }

      /* 2. Our sentinel is still the current entry, so what got popped was a
            layer stacked ON TOP of it — an open dialog, a date popover. That
            belongs to whoever pushed it (useBackToClose); leave the event
            alone so their handler can close their layer. */
      if (window.history.state?.[EXIT_FLAG]) return;

      /* 3. The sentinel itself was popped while on home: this back press would
            have closed the app. Hold the position and ask first. */
      if (isHomeRoute(path) && isInstalledApp()) {
        event.stopImmediatePropagation();
        armSentinel();
        // iOS cannot close the app and back does not try to, so there the
        // press is simply absorbed: home is the root and back at the root
        // goes nowhere.
        if (canCloseApp()) {
          // A second back press with the prompt already up reads as "no".
          setConfirmingExit((open) => !open);
        }
        return;
      }

      // 4. Ordinary in-app back. Untouched.
    };

    window.addEventListener("popstate", handlePop, true);
    return () => window.removeEventListener("popstate", handlePop, true);
  }, [armSentinel]);

  // Arm on arrival and after every navigation — landing on home by any route
  // (link, redirect, back from a deep page) has to leave the guard up. On iOS
  // and Firefox this is live immediately; on Chromium the entry is in place
  // but the back button ignores it until the first touch clears the skip flag.
  //
  // The first attempt waits a tick on purpose: Next registers the initial
  // route with its own `replaceState` from a promise callback in the Router
  // constructor, and that write lands on whatever entry is current. Arming
  // before it would have Next overwrite the sentinel's marker.
  useEffect(() => {
    // An exit already under way landed on this document mid-walk: carry it on
    // rather than arming anything. Must come first, since armSentinel below
    // defers to the same flag.
    resumeExitIfPending();

    const firstArm = window.setTimeout(armSentinel, 0);
    router.events?.on("routeChangeComplete", armSentinel);
    return () => {
      window.clearTimeout(firstArm);
      router.events?.off("routeChangeComplete", armSentinel);
    };
  }, [armSentinel, router.events]);

  /* A way to answer "is the guard even on?" from a phone over chrome://inspect
     without adding logging to a screen people use all day. Read
     `__elbritBackGuard` in the console: `armed` false with `gesture` false
     means nothing has been tapped yet, which is the one state where back still
     closes the app on Chromium. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__elbritBackGuard = {
      get installed() {
        return isInstalledApp();
      },
      get gesture() {
        return hasUserActivation();
      },
      get armed() {
        return !!window.history.state?.[EXIT_FLAG];
      },
      get onHome() {
        return isHomeRoute(window.location.pathname);
      },
      get canClose() {
        return canCloseApp();
      },
      get exiting() {
        return isExiting();
      },
      get entries() {
        return window.history.length;
      },
      arm: armSentinel,
    };
  }, [armSentinel]);

  const cancelExit = useCallback(() => setConfirmingExit(false), []);

  const confirmExit = useCallback(() => {
    setConfirmingExit(false);
    exitApp();
  }, []);

  useEffect(() => {
    if (!confirmingExit) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") cancelExit();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmingExit, cancelExit]);

  if (!confirmingExit) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-exit-title"
      onClick={cancelExit}
      style={{
        position: "fixed",
        inset: 0,
        // Above every sheet, drawer and Plasmic overlay in the app.
        zIndex: 2147483000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--surface-overlay, rgb(0 0 0 / 0.45))",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "20rem",
          borderRadius: "14px",
          background: "var(--surface-card, #fff)",
          boxShadow: "0 12px 40px rgb(0 0 0 / 0.24)",
          padding: "20px",
          fontFamily: "var(--font-roboto, system-ui, sans-serif)",
        }}
      >
        <h2
          id="pwa-exit-title"
          style={{
            margin: "0 0 6px",
            fontSize: "1rem",
            fontWeight: 600,
            color: "var(--ds-text-heading, rgb(23, 37, 84))",
          }}
        >
          Exit Elbrit One?
        </h2>
        <p
          style={{
            margin: "0 0 18px",
            fontSize: "0.8125rem",
            lineHeight: 1.5,
            color: "var(--ds-text-secondary, rgb(0 0 0 / 0.65))",
          }}
        >
          Are you sure you want to close the app? You will stay signed in.
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={cancelExit}
            autoFocus
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid var(--border-default, rgb(0 0 0 / 0.15))",
              background: "transparent",
              color: "var(--ds-text-body, rgb(0 0 0 / 0.88))",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Stay
          </button>
          <button
            type="button"
            onClick={confirmExit}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid transparent",
              /* Red is the identity colour and this project reserves it for
                 destructive intent — leaving the app is the one back action
                 that throws something away. */
              background: "var(--elbrit-red, rgb(220, 38, 39))",
              color: "var(--ds-text-on-brand, #fff)",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}
