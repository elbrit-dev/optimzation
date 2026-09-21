import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/router";

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
 * There was an "Exit Elbrit One?" prompt here and it has been removed on
 * purpose. A prompt is only worth showing if its Exit button can exit, and on
 * the web it cannot be made to, reliably: Chromium refuses window.close()
 * unless the window has an opener or its session history holds fewer than two
 * entries, and every attempt to manufacture that condition — walking the
 * history back to entry 0 and replacing it — ran aground on real handsets.
 * Safari ignores close() outright whatever the history looks like. People
 * leave through the app switcher, as they do with any native app. Do not
 * re-add the button without a mechanism proven on a device.
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

export default function PwaBackGuard() {
  const router = useRouter();

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

      /* 3. The sentinel itself was popped while on home. Home is the root:
            absorb the press, put the sentinel back, and stay put. */
      if (isHomeRoute(path) && isInstalledApp()) {
        event.stopImmediatePropagation();
        armSentinel();
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
      get entries() {
        return window.history.length;
      },
      arm: armSentinel,
    };
  }, [armSentinel]);

  return null;
}
