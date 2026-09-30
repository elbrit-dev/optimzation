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

export default function PlasmicLoaderPage(props) {
  const { plasmicData, queryCache } = props;
  const router = useRouter();
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
  const plasmicData = await PLASMIC.maybeFetchComponentData(plasmicPath);
  if (!plasmicData) {
    // non-Plasmic catch-all
    return { props: {} };
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
  // Use revalidate if you want incremental static regeneration
  return { props: { plasmicData, queryCache }, revalidate: 60 };
}

export const getStaticPaths = async () => {
  const pageModules = await PLASMIC.fetchPages();
  return {
    paths: pageModules.map((mod) => ({
      params: {
        catchall: mod.path.substring(1).split("/"),
      },
    })),
    fallback: "blocking",
  };
}
