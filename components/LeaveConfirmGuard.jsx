import { useEffect, useRef, useState } from "react";
import Router from "next/router";
import { BACK_LAYER_FLAG, backLeavesApp, isUnderPath, pushLayer } from "@/components/BackGuard";
import { confirm } from "@/design-system";

/**
 * "Leave Planner?" before leaving a full-screen page on a phone.
 *
 * Planner and Chat take the whole screen on a phone — no bottom bar — so the
 * way out is the back gesture or a link in the page, and both are easy to hit
 * by accident in the middle of work. On these pages either one asks first:
 *
 *   - BACK holds a layer on the back stack (share/src/components/BackGuard),
 *     so the press reaches this guard after any sheet or popover on the page
 *     has closed, and only then asks. Stay keeps the layer; Leave does what
 *     the press would have done — the page behind, or home when nothing in the
 *     app is behind it (AppExitGuard's rule).
 *   - LINKS go through the router's push/replace, which this wraps: leaving
 *     for another page asks; staying on the same page (a query change) does
 *     not, and neither does a redirect to the login page.
 *
 * Phones only (under 1024px, where the bottom bar is the navigation): on a
 * desktop the sidebar is always there and a prompt on every click would be
 * noise. Mounted once, by PwaBackGuard.
 *
 * ONE HISTORY STEP AT A TIME. confirm() answers before its own sheet has
 * given back its history entry (that happens as the sheet closes, a moment
 * later, with an async back()). Re-arming or navigating inside that moment
 * would collide with it — a re-arm lands under the sheet's entry and is taken
 * off with it, a navigation is eaten as "the sheet's back press". So both
 * wait until the only back-stack entry left on screen is this guard's own.
 */

/** Full-screen pages on a phone. `label` is what the question calls them. */
export const LEAVE_CONFIRM_PAGES = [
  { path: "/planner", label: "Planner" },
  { path: "/chat", label: "Chat" },
];

const LOGIN_ROUTES = ["/login"];
const PHONE_QUERY = "(max-width: 1023px)";

const pageFor = (pathname) => LEAVE_CONFIRM_PAGES.find((page) => isUnderPath(pathname ?? "", page.path)) ?? null;

/* The path a push/replace goes to. A bare "?query" or "#hash" stays on this
   page, and an absolute URL is reduced to its path. */
const targetOf = (url, as) => {
  const raw = typeof as === "string" ? as : typeof url === "string" ? url : url?.pathname;
  if (!raw) return "";
  if (raw.startsWith("?") || raw.startsWith("#")) return window.location.pathname;
  if (!raw.includes("://")) return raw;
  try {
    return new URL(raw).pathname;
  } catch {
    return raw;
  }
};

/* Resolves once `ok(current back-stack entry id)` holds, or after a short cap
   — a sheet closing without ever having armed never moves the history. */
function historySettles(ok, capMs = 800) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (ok(window.history.state?.[BACK_LAYER_FLAG]) || Date.now() - started > capMs) resolve();
      else window.setTimeout(tick, 30);
    };
    tick();
  });
}

const ask = (page) =>
  confirm({
    title: `Leave ${page.label}?`,
    confirmLabel: "Leave",
    cancelLabel: "Stay",
  });

export default function LeaveConfirmGuard({ router, pathname }) {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.(PHONE_QUERY);
    if (!query) return undefined;
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  const page = phone ? pageFor(pathname) : null;
  const pageRef = useRef(page);
  pageRef.current = page;

  const routerRef = useRef(router);
  routerRef.current = router;
  const layerRef = useRef(null);
  /* Set while this guard is doing the leaving, so its own navigation is not
     asked about a second time. */
  const leavingRef = useRef(false);
  /* Bumped when a Leave did not actually leave (the navigation was refused),
     so the layer goes back up. */
  const [retry, setRetry] = useState(0);

  /* Give up the page: drop this guard's layer (taking its entry with it when
     it is still the current one), wait for the history to stop moving, then
     navigate. */
  const leaveRef = useRef(null);
  leaveRef.current = async (go) => {
    const own = layerRef.current?.id;
    await historySettles((current) => !current || current === own);
    leavingRef.current = true;
    layerRef.current?.release();
    layerRef.current = null;
    await historySettles((current) => !current);
    const from = window.location.pathname;
    try {
      await go();
    } finally {
      leavingRef.current = false;
    }
    window.setTimeout(() => {
      if (window.location.pathname === from && pageFor(from)) setRetry((n) => n + 1);
    }, 600);
  };

  const key = page?.path ?? null;

  /* Back. */
  useEffect(() => {
    if (!key) return undefined;
    const layer = pushLayer({
      name: "leave-page",
      onBack: ({ rearm }) => {
        const current = pageRef.current;
        if (!current) return;
        ask(current).then(async (leave) => {
          if (!leave) {
            await historySettles((entry) => !entry || entry === layer.id);
            if (layerRef.current === layer) rearm();
            return;
          }
          await leaveRef.current(async () => {
            if (backLeavesApp(LOGIN_ROUTES) === true) return routerRef.current?.replace("/");
            /* Without the Navigation API nobody can tell what is behind the
               page; if back went nowhere, home is where it would have gone. */
            const from = window.location.pathname;
            window.history.back();
            await new Promise((resolve) => window.setTimeout(resolve, 400));
            if (window.location.pathname === from) await routerRef.current?.replace("/");
            return undefined;
          });
        });
      },
    });
    layerRef.current = layer;
    return () => {
      if (layerRef.current === layer) layerRef.current = null;
      layer.release();
    };
  }, [key, retry]);

  /* Links. Wraps the router once; reads the page from the ref each time.

     THE CORE ROUTER, NOT useRouter()'s. Next (pages) hands out a fresh public
     copy of the router on every render — next/link calls whichever copy is
     current — and each copy forwards to one core instance (Router.router).
     Wrapping a copy works until the first navigation; wrapping the core
     catches every push and replace. */
  useEffect(() => {
    const current = Router.router;
    if (!current?.push || !current?.replace) return undefined;
    const originalPush = current.push;
    const originalReplace = current.replace;
    const guard = (original) =>
      function navigate(url, as, options) {
        const here = pageRef.current;
        const to = targetOf(url, as);
        const leaves =
          here &&
          !leavingRef.current &&
          to &&
          !isUnderPath(to, here.path) &&
          !LOGIN_ROUTES.some((route) => isUnderPath(to, route));
        if (!leaves) return original.call(this, url, as, options);
        return ask(here).then(async (leave) => {
          if (!leave) return false;
          let result = false;
          await leaveRef.current(async () => {
            result = await original.call(this, url, as, options);
          });
          return result;
        });
      };
    current.push = guard(originalPush);
    current.replace = guard(originalReplace);
    return () => {
      current.push = originalPush;
      current.replace = originalReplace;
    };
  }, []);

  return null;
}
