import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";

/**
 * Makes the Android/PWA back gesture behave like a native app's.
 *
 * Installed as a PWA the app has no browser chrome, so the system back button
 * IS the app's navigation. Three things were wrong with what the browser does
 * on its own:
 *
 *   1. The home screen is the FIRST entry the PWA opens (`start_url: "/"`), so
 *      back there has nothing to pop and the OS closes the app instantly — no
 *      warning, mid-task, no way to undo.
 *   2. When the session started at /login instead, back from home walked into
 *      the login page. That is not a place a signed-in person should ever land:
 *      it re-runs the sign-in flow and, through NovuInbox's
 *      `pathname === "/login"` branch, tears down the push subscription — the
 *      "it logged me out on its own" report.
 *   3. Anywhere else in the app back is already correct, and must stay
 *      untouched.
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
 * Only an INSTALLED app gets the exit prompt.
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
  const [confirmingExit, setConfirmingExit] = useState(false);

  // Refs, not state: the popstate listener is registered once and has to read
  // today's values, not the ones captured when it was attached.
  const routerRef = useRef(router);
  routerRef.current = router;
  const disarmedRef = useRef(false);

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
   * THE reason the first version of this guard did nothing. Chrome ships an
   * intervention — "skip history entries added without user activation" — that
   * marks any entry a page pushes before the user has interacted as skippable,
   * and the back button then walks straight past it. A sentinel pushed on
   * mount is exactly that entry: it existed, it just never got the back press,
   * and the app closed as if the guard were not there.
   *
   * Activation is STICKY, so one tap anywhere arms the guard for the rest of
   * the document's life. That is also why the calendar's overlay guard has
   * always worked — it pushes its entry from a tap handler.
   */
  const gestureRef = useRef(false);
  const hasUserActivation = () => {
    if (typeof navigator !== "undefined" && navigator.userActivation) {
      return navigator.userActivation.hasBeenActive || gestureRef.current;
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
    if (disarmedRef.current) return;
    if (!isInstalledApp()) return;
    if (!isHomeRoute(window.location.pathname)) return;
    // Pushing without activation does not fail, it silently produces an entry
    // the back button ignores — worse than not pushing, because the flag then
    // reads as armed. Wait for the tap instead; the gesture listener below
    // calls back here the moment there is one.
    if (!hasUserActivation()) return;
    if (window.history.state?.[EXIT_FLAG]) return;
    window.history.pushState({ ...window.history.state, [EXIT_FLAG]: true }, "");
  }, []);

  /* Every tap is a chance to arm: the first one lifts Chrome's restriction,
     and each later one is a cheap no-op once the sentinel is in place. Capture
     + passive so nothing in the app can swallow it or be slowed by it. */
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onGesture = () => {
      gestureRef.current = true;
      armSentinel();
    };
    const events = ["pointerdown", "touchstart", "keydown"];
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

      /* 3. The sentinel itself was popped while on home: this back press would
            have closed the app. Hold the position and ask first. */
      if (isHomeRoute(path) && isInstalledApp() && !disarmedRef.current) {
        event.stopImmediatePropagation();
        armSentinel();
        // A second back press with the prompt already up reads as "no".
        setConfirmingExit((open) => !open);
        return;
      }

      // 4. Ordinary in-app back. Untouched.
    };

    window.addEventListener("popstate", handlePop, true);
    return () => window.removeEventListener("popstate", handlePop, true);
  }, [armSentinel]);

  // Arm after every navigation — landing on home by any route (link, redirect,
  // back from a deep page) has to leave the guard up. Both of these no-op
  // until the screen has been touched; the gesture listener above is what
  // actually gets the first sentinel onto the stack.
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
     closes the app. */
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
      arm: armSentinel,
    };
  }, [armSentinel]);

  const cancelExit = useCallback(() => setConfirmingExit(false), []);

  /**
   * Closing an installed PWA is the browser's call, not ours.
   *
   * `window.close()` is honoured for an app window in standalone display mode,
   * which is the case this prompt exists for. A browser that refuses it leaves
   * the user exactly where they were — better than the alternative of walking
   * the history backwards, which in this app can only land on /login.
   */
  const confirmExit = useCallback(() => {
    setConfirmingExit(false);
    disarmedRef.current = true;
    try {
      window.close();
    } catch (e) {
      /* refused — the re-arm below puts the guard back */
    }
    window.setTimeout(() => {
      disarmedRef.current = false;
      armSentinel();
    }, 800);
  }, [armSentinel]);

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
