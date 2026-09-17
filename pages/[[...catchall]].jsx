import * as React from "react";
import {
  PlasmicComponent,
  extractPlasmicQueryData,
  ComponentRenderData,
  PlasmicRootProvider,
} from "@plasmicapp/loader-nextjs";

import Error from "next/error";
import { useRouter } from "next/router";
import { PLASMIC } from "@/plasmic-init";

/**
 * Stops one bad expression from taking the whole app down.
 *
 * Every Plasmic page in this project renders through this file, and Studio
 * expressions are evaluated with `eval` inside the page bundle. A single
 * unguarded property read — `Lead.territory.territory_name` against a doctor
 * with no territory link — throws during render, React unmounts the entire
 * tree, and the user gets a black screen reading "Application error: a
 * client-side exception has occurred". No menu, no back, nothing to do but
 * retype the URL. That is a catastrophic failure for a one-character omission
 * (`?.`) in one binding on one page.
 *
 * A boundary cannot make the broken binding render — only Studio can fix the
 * expression — but it contains the blast radius to the page that failed and
 * says what happened, instead of destroying the session.
 *
 * NOT a class field / hooks component on purpose: `componentDidCatch` has no
 * hook equivalent, so a class is the only way to do this in React.
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
    // Keep the original stack reachable. The message alone ("Cannot read
    // properties of null") never names the page, and the component stack is
    // what points at which binding threw.
    if (typeof console !== "undefined" && console.error) {
      console.error("Plasmic page crashed:", error, info?.componentStack);
    }
  }

  componentDidUpdate(prev) {
    // Clear on navigation, otherwise one broken doctor pins the fallback over
    // every page the user visits afterwards.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "34rem", textAlign: "center", lineHeight: 1.5 }}>
          <h1 style={{ fontSize: "1.25rem", margin: "0 0 .5rem" }}>
            This page could not be displayed
          </h1>
          <p style={{ margin: "0 0 1rem", opacity: 0.8 }}>
            Something on this page expected data that this record does not have.
            The rest of the app is unaffected — go back, or try again.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{ padding: ".5rem 1rem", cursor: "pointer" }}
          >
            Try again
          </button>
          <details style={{ marginTop: "1rem", textAlign: "left", opacity: 0.7 }}>
            <summary style={{ cursor: "pointer" }}>Technical detail</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: ".75rem", margin: ".5rem 0 0" }}>
              {String(error?.message ?? error)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}

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
