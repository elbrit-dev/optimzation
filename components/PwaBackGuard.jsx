import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { AppExitGuard, claimPop, isUnderPath, setFallback } from "@/components/BackGuard";

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
 *   1. Which route is the root        -> AppExitGuard rootPaths
 *   2. Where back must never go       -> AppExitGuard blockedPaths, and
 *                                        setFallback / the pageshow check below
 *   3. Where back goes instead of out -> home (AppExitGuard onLeave), so the
 *                                        app is only ever left through the hint
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
 * Anywhere but the root, back is ordinary — except where it would leave the
 * app (a page opened from a notification, after a reload) or land on /login:
 * there it goes home, and home's hint is what leaves.
 */

/** Routes the back gesture treats as the app's root. */
const HOME_ROUTES = ["/"];

/** Routes a signed-in person must never be able to reach by going back —
    and every page under them: the login page is /login/[id]/[name]/[reason]. */
const LOGIN_ROUTES = ["/login"];

const normalise = (pathname) => {
  if (!pathname) return "/";
  const path = String(pathname).split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
};

const isHomeRoute = (pathname) => HOME_ROUTES.includes(normalise(pathname));
const isLoginRoute = (pathname) => LOGIN_ROUTES.some((route) => isUnderPath(pathname, route));

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
     re-runs the sign-in flow — the "it logged me out on its own" report
     (the old notification bell also tore down push there).

     Most of that is now prevented before the press: AppExitGuard sends back
     home from any page with /login right behind it (`blockedPaths`). This is
     the net for the rest (no Navigation API to look behind the page): the
     event is swallowed so Next never routes to /login, and the entry the
     browser moved us to becomes home — the one place back leaves from. */
  /* THE LOGIN PAGE NEVER TAKES A HISTORY ENTRY. Sign-in ends in a client-side
     push to home (Plasmic's onSuccess), which left /login/[id]/[name]/[reason]
     right behind home — the entry every "back from home" walked onto. A page
     cannot delete an entry, but it can decline to make one: any push TO a
     login page, or FROM one, becomes a replace. Full page loads (Plasmic's
     logout) are not router pushes; those have to replace in Plasmic itself. */
  useEffect(() => {
    const current = routerRef.current;
    if (!current?.push || !current?.replace) return undefined;
    const originalPush = current.push;
    const target = (url, as) => {
      const path = typeof as === "string" ? as : typeof url === "string" ? url : url?.pathname;
      return path ?? "";
    };
    current.push = function push(url, as, options) {
      if (isLoginRoute(window.location.pathname) || isLoginRoute(target(url, as))) {
        return current.replace(url, as, options);
      }
      return originalPush.call(this, url, as, options);
    };
    return () => {
      current.push = originalPush;
    };
  }, []);

  /* NEXT HEARS A BACK PRESS BEFORE THE BACK STACK DOES. Its popstate listener
     is registered first and, on Chrome, runs first, so the stack stopping the
     event came too late: Next had already routed to the entry the press landed
     on. Seen on a handset (16 Oct 2026): the root's fold back over the login
     entry, and Next rendered /login/[id]/[name]/[reason] under a "/" URL.
     beforePopState runs inside Next's handler, ahead of the route; the stack
     decides the press there and Next skips the ones it took. */
  useEffect(() => {
    const current = routerRef.current;
    if (!current?.beforePopState) return undefined;
    current.beforePopState(() => !claimPop());
    return () => current.beforePopState(() => true);
  }, []);

  useEffect(() => {
    return setFallback((event) => {
      if (!isLoginRoute(window.location.pathname) || !isAuthed()) return false;
      event.stopImmediatePropagation();
      Promise.resolve(routerRef.current?.replace("/")).catch(() => {});
      return true;
    });
  }, []);

  /* The same refusal for a back press that crossed into an OLDER document
     (the login happened before a reload or a full-page sign-in redirect): the
     login page then loads for real, and no popstate ever reaches us. Arriving
     on /login by back/forward is never the sign-in flow — that arrives by
     navigation — so once the session is known to be live, go home. */
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let pending = false;
    const cameBack = (persisted) => {
      if (persisted) return true;
      const entry = window.performance?.getEntriesByType?.("navigation")?.[0];
      return entry?.type === "back_forward";
    };
    const check = (persisted) => {
      if (!isLoginRoute(window.location.pathname) || !cameBack(persisted)) return;
      pending = true;
    };
    const leaveIfSignedIn = () => {
      if (!pending || !authResolvedRef.current || !authedRef.current) return;
      if (!isLoginRoute(window.location.pathname)) return;
      pending = false;
      Promise.resolve(routerRef.current?.replace("/")).catch(() => {});
    };
    const onPageShow = (event) => {
      check(event.persisted);
      leaveIfSignedIn();
    };
    check(false);
    const auth = window.firebaseAuth;
    const stopAuth = auth?.onAuthStateChanged?.(() => leaveIfSignedIn());
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      if (typeof stopAuth === "function") stopAuth();
    };
  }, []);

  /* Back that would leave the app from anywhere but home goes home instead,
     so leaving always passes the "press back again" hint. */
  const goHome = useCallback(() => {
    Promise.resolve(routerRef.current?.replace("/")).catch(() => {});
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
  return (
    <AppExitGuard
      pathname={router.asPath ?? router.pathname}
      rootPaths={HOME_ROUTES}
      onLeave={goHome}
      blockedPaths={LOGIN_ROUTES}
    />
  );
}
