import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { AppExitGuard, setFallback } from "@/components/BackGuard";

/**
 * Makes the back gesture behave like a native app's: home is the root, and
 * leaving the app takes a second, deliberate press.
 *
 * THE MECHANISM NOW LIVES IN share/src/components/BackGuard. This file used to
 * own a sentinel history entry, a capture-phase popstate listener and a set of
 * gesture listeners of its own — and so did three other modules, two of them
 * under the SAME history-state key. Back is a single, serial gesture; it has a
 * single, serial owner now, and this is just the app-level policy on top of it:
 *
 *   1. Which route is the root        -> useExitGuard({ isRoot })
 *   2. Where back must never go       -> setFallback, below
 *
 * WHY "PRESS BACK AGAIN" AND NOT A PROMPT WITH AN EXIT BUTTON. There was an
 * "Exit Elbrit One?" dialog here once and it was removed because its Exit
 * button could not exit: Chromium refuses window.close() unless the window has
 * an opener, and walking the history back to entry 0 ran aground on real
 * handsets. That finding still stands and is the reason the shape is what it
 * is — the OS closes a PWA on a back press THE PAGE DOES NOT CONSUME, so the
 * second press is left unconsumed and does the closing itself. A button still
 * cannot do this. Do not re-add one without a mechanism proven on a device.
 *
 * Anywhere but the root, back is ordinary and untouched.
 */

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
 * Reported by the diagnostics below, and nothing else depends on it any more.
 *
 * The guard used to run ONLY here, on the theory that hijacking back in an
 * ordinary browser tab would be wrong. It is on everywhere now, deliberately:
 * the display-mode sniffing was never reliable across handsets, and "it
 * sometimes just closed" is a worse answer than one extra press in a tab.
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
  // A ref, not state: the fallback is registered once and has to read today's
  // router, not the one captured when it was attached.
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

  /* The login page is off limits while someone is signed in: landing there
     re-runs the sign-in flow and, through NovuInbox's `pathname === "/login"`
     branch, tears down the push subscription — the "it logged me out on its
     own" report.

     Swallowing the event means Next never routes and the page the user was
     looking at stays mounted; all that is left is to put its URL back onto the
     entry the browser just moved us to. */
  useEffect(() => {
    return setFallback((event) => {
      if (!isLoginRoute(window.location.pathname) || !isAuthed()) return false;
      event.stopImmediatePropagation();
      const current = routerRef.current;
      const safe = current?.asPath && !isLoginRoute(current.asPath) ? current.asPath : "/";
      Promise.resolve(current?.replace(safe, undefined, { shallow: true })).catch(() => {});
      return true;
    });
  }, []);

  /* A way to answer "is the guard even on?" from a phone over chrome://inspect
     without adding logging to a screen people use all day. Read
     `__elbritBackGuard` in the console. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__elbritBackGuard = {
      get installed() {
        return isInstalledApp();
      },
      get onHome() {
        return isHomeRoute(window.location.pathname);
      },
      get entries() {
        return window.history.length;
      },
    };
  }, []);

  /* The root policy itself. The path is passed in rather than read inside,
     because the same component serves the App Router app next door, where
     this router does not exist. */
  return <AppExitGuard pathname={router.asPath ?? router.pathname} rootPaths={HOME_ROUTES} />;
}
