import * as React from "react";
import {
  PlasmicComponent,
  extractPlasmicQueryData,
  ComponentRenderData,
  PlasmicRootProvider,
} from "@plasmicapp/loader-nextjs";

import Error from "next/error";
import Router, { useRouter } from "next/router";
import { PLASMIC } from "@/plasmic-init";

/**
 * Stops one bad expression from taking the whole app down — WITHOUT an error
 * page.
 *
 * Every Plasmic page renders through this file, and a single unguarded Studio
 * binding (`query.data.response.data.Lead.lead_name` when that query failed)
 * throws during render and unmounts the whole tree. There is nothing on that
 * page left to show, so instead of a dead-end "could not be displayed" screen
 * the reader is taken back to the app's main page, where they can carry on.
 * The error and the component stack still go to the console, which is where
 * the broken binding gets found.
 *
 * The main page itself cannot be redirected to itself, so a crash THERE shows
 * a single line with a reload — the only case left with nowhere else to go.
 *
 * A class on purpose: `componentDidCatch` has no hook equivalent.
 */
class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof console !== "undefined" && console.error) {
      console.error("Plasmic page crashed:", error, info?.componentStack);
    }
    if (!this.isHome()) Router.replace(HOME);
  }

  componentDidUpdate(prev) {
    // Clear on navigation — including the redirect home — so the next page renders.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  isHome() {
    return (this.props.resetKey ?? "").split(/[?#]/)[0] === HOME;
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (!this.isHome()) return null; // on its way to the main page
    return (
      <div role="alert" style={{ padding: "24px", textAlign: "center" }}>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: ".5rem 1rem", cursor: "pointer" }}>
          Reload
        </button>
      </div>
    );
  }
}

const HOME = "/";

/* Shown only when Plasmic could not be reached at all for a URL this server has
   never built (see getStaticProps). Instead of a 500, wait a moment and reload:
   by then the page has usually been rebuilt in the background. Capped so a
   long Plasmic outage does not reload forever. */
function PlasmicRetryScreen() {
  const [gaveUp, setGaveUp] = React.useState(false);
  React.useEffect(() => {
    const key = `plasmic-retry:${window.location.pathname}`;
    let tries = 0;
    try { tries = Number(sessionStorage.getItem(key) || 0); } catch {}
    if (tries >= 6) {
      setGaveUp(true);
      try { sessionStorage.removeItem(key); } catch {}
      return undefined;
    }
    try { sessionStorage.setItem(key, String(tries + 1)); } catch {}
    const t = setTimeout(() => window.location.reload(), 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" style={{ padding: "48px 24px", textAlign: "center", fontFamily: "system-ui, sans-serif", color: "#444" }}>
      {gaveUp ? (
        <button type="button" onClick={() => window.location.reload()} style={{ padding: ".5rem 1rem", cursor: "pointer" }}>
          Reload
        </button>
      ) : (
        "Loading…"
      )}
    </div>
  );
}

export default function PlasmicLoaderPage(props) {
  const { plasmicData, queryCache, plasmicUnavailable } = props;
  const router = useRouter();
  React.useEffect(() => {
    // the page loaded: forget any reload count left by PlasmicRetryScreen
    if (plasmicData) {
      try { sessionStorage.removeItem(`plasmic-retry:${window.location.pathname}`); } catch {}
    }
  }, [plasmicData]);
  if (plasmicUnavailable) return <PlasmicRetryScreen />;
  if (!plasmicData || plasmicData.entryCompMetas.length === 0) {
    return <Error statusCode={404} />;
  }
  const pageMeta = plasmicData.entryCompMetas[0];
  return (
    <PlasmicRootProvider
      loader={PLASMIC}
      prefetchedData={plasmicData}
      prefetchedQueryData={queryCache}
      pageRoute={pageMeta.path}
      pageParams={pageMeta.params}
      pageQuery={router.query}
    >
      <PageErrorBoundary resetKey={router.asPath}>
        <PlasmicComponent component={pageMeta.displayName} />
      </PageErrorBoundary>
    </PlasmicRootProvider>
  );
}

export const getStaticProps = async (context) => {
  const { catchall } = context.params ?? {};
  const plasmicPath = typeof catchall === 'string' ? catchall : Array.isArray(catchall) ? `/${catchall.join('/')}` : '/';
  const known = reuseLastGood(plasmicPath);
  let plasmicData;
  try {
    // With a known-good copy to fall back on, do not keep the person waiting.
    plasmicData = await retryPlasmicHiccup(() => PLASMIC.maybeFetchComponentData(plasmicPath), known ? 2 : undefined);
  } catch (err) {
    if (!isPlasmicHiccup(err)) throw err;
    if (known) {
      console.warn(`Plasmic unavailable for ${plasmicPath}; serving the last good copy of ${known.plasmicData.entryCompMetas[0].path}`);
      return { props: known, revalidate: 60 };
    }
    console.warn(`Plasmic unavailable for ${plasmicPath}; sending the retry screen`);
    return { props: { plasmicUnavailable: true }, revalidate: 5 };
  }
  if (!plasmicData) {
    // non-Plasmic catch-all. Re-checked every minute: without a revalidate
    // this "not found" was cached FOREVER, so a page opened before it was
    // published in Studio stayed a 404 until the next deploy
    // (/service/allocation, 16 Oct 2026).
    return { props: {}, revalidate: 60 };
  }
  const pageMeta = plasmicData.entryCompMetas[0];
  // Cache the necessary data fetched for the page
  const queryCache = await extractPlasmicQueryData(
    <PlasmicRootProvider
      loader={PLASMIC}
      prefetchedData={plasmicData}
      pageRoute={pageMeta.path}
      pageParams={pageMeta.params}
    >
      <PlasmicComponent component={pageMeta.displayName} />
    </PlasmicRootProvider>
  );
  rememberLastGood(pageMeta, plasmicData, queryCache);
  // Rebuild at most every 10 minutes: each rebuild runs as a Netlify function,
  // and at 60s every page regenerated almost every minute of the working day.
  // User data is fetched client-side, so this only delays Plasmic publishes.
  return { props: { plasmicData, queryCache }, revalidate: 600 };
}

/* Plasmic's CDN keeps failing for a few seconds to a few minutes at a time:
   "status: 499; response: Upstream responded with 412" (Nov 2026), then from
   15 Nov 2026 "Error fetching loader data: Please upgrade your @plasmicapp/*
   packages" (hundreds a day on app-prod; the same URL loads fine a minute
   later, so it is not really about our version). A page already built just
   keeps its old copy, but a URL seen for the first time is built on the
   request — every /login/<who>/… impersonation and /doctor-detail/<id> — so
   the person got a 500 and had to reload 4-5 times. Wait it out here; an
   error that is not Plasmic's still throws at once. Total wait (~30s) stays
   inside the 60s request limit. */
function isPlasmicHiccup(err) {
  return /Error fetching loader data|Upstream responded with|status: (4\d\d|5\d\d)|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(
    String(err?.message || err) + String(err?.cause?.code || "")
  );
}

async function retryPlasmicHiccup(fetchOnce, maxRetries) {
  const waits = [1500, 3000, 5000, 8000, 12000].slice(0, maxRetries);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchOnce();
    } catch (err) {
      if (!isPlasmicHiccup(err) || attempt >= waits.length) throw err;
      console.warn(`Plasmic hiccup, retry ${attempt + 1}/${waits.length}:`, err?.message || err);
      await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
    }
  }
}

/* Every /doctor-detail/<id> (and /login/<who>/<name>/<reason>) is the SAME
   Plasmic page: the id lives only in entryCompMetas[0].params. So the last
   copy this server built for a route pattern serves any other URL of that
   pattern while Plasmic is down — with this URL's params swapped in. Kept per
   server instance (in memory); a fresh instance has none until its first
   good build. */
const lastGoodByRoute = new Map();

function routeMatcher(pattern) {
  const names = [];
  const source = pattern
    .split("/")
    .map((seg) => {
      const catchAll = seg.match(/^\[\[?\.\.\.(.+?)\]?\]$/);
      if (catchAll) { names.push([catchAll[1], true]); return "(.+)"; }
      const param = seg.match(/^\[(.+)\]$/);
      if (param) { names.push([param[1], false]); return "([^/]+)"; }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  const re = new RegExp(`^${source}$`);
  return (path) => {
    const m = path.match(re);
    if (!m) return null;
    const params = {};
    names.forEach(([name, many], i) => {
      const value = m[i + 1]; // Next has already decoded the catch-all segments
      params[name] = many ? value.split("/") : value;
    });
    return params;
  };
}

function rememberLastGood(pageMeta, plasmicData, queryCache) {
  const pattern = pageMeta?.path;
  if (!pattern || !pattern.includes("[")) return; // fixed pages keep their own ISR copy
  lastGoodByRoute.set(pattern, { match: routeMatcher(pattern), plasmicData, queryCache });
}

function reuseLastGood(plasmicPath) {
  for (const entry of lastGoodByRoute.values()) {
    const params = entry.match(plasmicPath);
    if (!params) continue;
    const [meta, ...rest] = entry.plasmicData.entryCompMetas;
    return {
      plasmicData: { ...entry.plasmicData, entryCompMetas: [{ ...meta, params }, ...rest] },
      queryCache: entry.queryCache,
    };
  }
  return null;
}

/* A Plasmic hiccup must not fail the whole build. Three builds in a row (16 Oct
   2026) died here on "Upstream responded with 412" — Plasmic still preparing
   a version published minutes earlier. Retry briefly; failing that, build with
   no pre-listed pages: `fallback: "blocking"` renders each on its first visit,
   exactly as a page published after the build already is. */
async function fetchPagesForBuild() {
  const waits = [5000, 15000, 30000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await PLASMIC.fetchPages();
    } catch (err) {
      if (attempt >= waits.length) {
        console.warn("Plasmic page list unavailable; building without pre-listed pages:", err?.message || err);
        return [];
      }
      await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
    }
  }
}

export const getStaticPaths = async () => {
  const pageModules = await fetchPagesForBuild();
  return {
    paths: pageModules.map((mod) => ({
      params: {
        catchall: mod.path.substring(1).split("/"),
      },
    })),
    fallback: "blocking",
  };
}
