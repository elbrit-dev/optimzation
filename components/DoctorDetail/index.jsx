"use client";

/**
 * The doctor page, as approved by management in September 2026 — ONE
 * component, the way the Support Report and Home Overview are one component.
 *
 * It owns its data: `useDoctorDetail` reads ERP once, over GraphQL, with the
 * signed-in user's own `url` + `token`, and every section below renders from
 * that one reading. The sections (hero, totals, filter bar, coverage, trend)
 * are parts of this page, not separately placed Studio components.
 *
 * WHAT IS BOUND: the doctor, and the signed-in user's ERP credential. Who is
 * reading, what they may see, which departments exist, who covers them — all
 * of that is read from ERP with that credential. Several reps share a doctor,
 * and the reader's span in the reporting tree keeps each to their own rows.
 *
 * FAILURE STAYS SMALL. A read ERP refuses empties its own panel and says so;
 * a section that throws while rendering is replaced by a one-line notice with
 * a Retry, and the rest of the page stays up. Nothing here can blank the whole
 * page — which is what "This page could not be displayed" was.
 *
 * EVERY FIGURE IS ATTRIBUTED. Support's department, role profile and product
 * breakdown live on `Doctor Support`'s item child table; service carries its
 * own department and role; POBs and visits get theirs from the employee who
 * raised them. The only thing that ever lands in Unassigned is a month Ecubix
 * sent as a total with no products behind it.
 */

import React from "react";

import DoctorHeroCard from "./sections/Hero";
import DoctorTotalsCard from "./sections/Totals";
import DoctorFilterBar from "./sections/FilterBar";
import DoctorCoverageCard from "./sections/Coverage";
import DoctorInsightsCard from "./sections/Insights";
import useDoctorDetail from "./lib/useDoctorDetail";
import { ConsoleStyles } from "./sections/shell";
import useContainerMode from "./lib/useContainerMode";

/**
 * One section's crash stays in that section. Keyed by the reading, so a fresh
 * answer from ERP (or Retry) gives the section another go.
 */
class Section extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error(`[doctor-detail] ${this.props.name} section crashed:`, error, info?.componentStack);
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="dx-card dx-empty" role="alert">
        The {this.props.name} could not be shown for this doctor.{" "}
        <button
          type="button"
          className="dx-crumb-btn"
          onClick={() => { this.setState({ error: null }); this.props.onRetry?.(); }}
        >
          Retry
        </button>
      </div>
    );
  }
}

function DoctorDetailPage(props) {
  const { onBack, className = "", style } = props;

  // The ONE reading of this doctor. Every section renders from it.
  const c = useDoctorDetail(props);
  const [wrapRef, compact] = useContainerMode(720);

  if (!c) {
    return (
      <div ref={wrapRef} className={"dx-root " + className} style={style}>
        <ConsoleStyles />
        <div className="dx-empty">Bind a doctor — a Lead id such as DR-47718, or the row from the list.</div>
      </div>
    );
  }

  // A new answer from ERP clears any section that crashed on the last one.
  const resetKey = [c.doctorId, c.loading, c.ready, c.fatal].join("|");
  const retry = c.on?.refresh;

  return (
    <div
      ref={wrapRef}
      className={"dx-root" + (compact ? " dx-root--compact" : "") + (className ? " " + className : "")}
      style={style}
    >
      <ConsoleStyles />
      <div className="dx-crumbs">
        {/*
          * "Doctor lists" now always goes somewhere: a plain link to /doctor,
          * which is where the list lives. It used to be inert text unless a
          * page wired onBack, so on a page that had not, the crumb looked like
          * a link and did nothing.
          *
          * A wired onBack still wins -- the page may want to restore a scroll
          * position or filters rather than reload the route -- so the handler
          * runs and the default navigation is cancelled. Unwired, the href is
          * what happens, which also means middle-click and open-in-new-tab
          * work, as they should on something that reads as a link.
          */}
        <a
          className="dx-crumb-btn"
          href="/doctor"
          onClick={onBack ? (e) => { e.preventDefault(); onBack({ doctor: c.doctor, code: c.doctorId }); } : undefined}
        >
          Doctor lists
        </a>
        <span className="dx-sep">▸</span>
        <span className="dx-here">{c.doctor?.name ?? c.doctorId}</span>
      </div>

      <Section name="doctor summary" resetKey={resetKey} onRetry={retry}>
        <DoctorHeroCard {...props} c={c} className="" />
      </Section>
      <Section name="totals" resetKey={resetKey} onRetry={retry}>
        <DoctorTotalsCard {...props} c={c} className="" />
      </Section>
      <Section name="filter bar" resetKey={resetKey} onRetry={retry}>
        <DoctorFilterBar {...props} c={c} className="" />
      </Section>

      <div className="dx-stack">
        <Section name="coverage" resetKey={resetKey} onRetry={retry}>
          <DoctorCoverageCard {...props} c={c} className="" />
        </Section>
        <Section name="trend and activity" resetKey={resetKey} onRetry={retry}>
          <DoctorInsightsCard {...props} c={c} className="" />
        </Section>
      </div>
    </div>
  );
}

/**
 * The outermost guard. The sections guard themselves, but the reading (the
 * hook) runs up here, outside them — so anything that throws at this level is
 * caught too, and the page around this component (the rest of the Plasmic
 * page, the app shell) never falls through to "This page could not be
 * displayed" because of the doctor detail.
 */
class Guard extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error("[doctor-detail] crashed:", error, info?.componentStack);
  }
  componentDidUpdate(prev) {
    if (prev.doctorKey !== this.props.doctorKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={"dx-root " + (this.props.className ?? "")} style={this.props.style} role="alert">
        <ConsoleStyles />
        <div className="dx-empty">
          This doctor could not be shown.{" "}
          <button type="button" className="dx-crumb-btn" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      </div>
    );
  }
}

export default function DoctorDetail(props) {
  const d = props.doctor;
  const doctorKey = typeof d === "string" ? d : d?.name ?? d?.id ?? d?.node?.name ?? "";
  return (
    <Guard doctorKey={doctorKey} className={props.className} style={props.style}>
      <DoctorDetailPage {...props} />
    </Guard>
  );
}
