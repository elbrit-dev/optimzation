"use client";

/**
 * The doctor page's five BLOCKS, each placeable on its own.
 *
 * One per card in the approved design, and no finer:
 *
 *   1. Hero      identity, clinic chips and the actions — one card
 *   2. Totals    the swipeable totals strip
 *   3. Filter    "Signed in as …" + the Filter button + the permission notices
 *   4. Coverage  the BE / ABM / RBM / ZSM rings
 *   5. Insights  monthly trend + the Data ⇄ Activity switch + the panel
 *
 * The clinic row, the Add POB / Notes buttons, the Rx chip and the Data/Activity
 * switch are deliberately NOT components of their own. They are parts of the
 * card they sit in — the design draws each as one surface, and splitting them
 * would let a page put half a card somewhere the other half is not.
 *
 * Insights is one block for exactly that reason: the trend, the switch and the
 * table share a single `dx-panel` surface, so they are one card, not two.
 *
 * Every block is a THIN wrapper. It reads its slice off the context and hands it
 * to the same `ui/*` part the whole-page component has always used — no
 * fetching, no filtering, no arithmetic. The provider did all of that, which is
 * what stops two blocks disagreeing about what "this period" means.
 */

import React from "react";

import Hero from "../DoctorDetail/ui/Hero";
import Banner from "../DoctorDetail/ui/Banner";
import Coverage from "../DoctorDetail/ui/Coverage";
import { Icon } from "../DoctorDetail/ui/parts";
import { OutsideProvider, useDoctorConsole } from "./context";

/* ------------------------------------------------------------- 1 · hero */

export function DoctorHero({ showRoi = true, showClinics = true, showActions = true, compact: compactProp = "auto" }) {
  const c = useDoctorConsole();
  if (!c) return <OutsideProvider what="Doctor Hero" />;
  const compact = compactProp === "auto" ? c.compact : compactProp === "compact";
  return (
    <Hero
      doctor={c.doctor}
      compact={compact}
      loading={c.loading}
      since={c.heroSince}
      age={c.heroAge}
      roiTill={c.heroRoiTill}
      // `showRoi` can only HIDE it. Whether the reader may see service figures
      // at all is decided by their ERP token, never by a prop — otherwise
      // anyone with Studio access could reveal them.
      canSeeService={c.canSeeService && showRoi}
      stats={showRoi ? c.stats : []}
      clinics={showClinics ? c.clinics : []}
      clinicIndex={c.on.clinicIndex}
      onPickClinic={c.on.pickClinic}
      onAddClinic={showClinics ? c.on.addClinic ?? undefined : undefined}
      onOpenMap={() => c.on.openModal("map")}
      pharmacyCount={c.pharmacies.length}
      onOpenRx={() => c.on.openModal("rx")}
      onAddPob={showActions ? c.on.openPob : undefined}
      onAddNote={showActions ? c.on.noteOpen : undefined}
      onRequestService={showActions ? c.on.requestService ?? undefined : undefined}
    />
  );
}

/* ----------------------------------------------------------- 2 · totals */

const ALL_CARDS = ["visit", "pob", "support", "note", "service"];

export function DoctorTotals({ cards }) {
  const c = useDoctorConsole();
  if (!c) return <OutsideProvider what="Doctor Totals" />;
  const wanted = Array.isArray(cards) && cards.length ? cards : ALL_CARDS;
  // `service` removes itself for a reader who may not see it, whatever the page
  // asked for.
  const order = wanted.filter((k) => ALL_CARDS.includes(k) && (c.canSeeService || k !== "service"));
  return (
    <Banner
      order={order.length ? order : c.bannerOrder}
      cards={c.cards}
      index={c.on.bannerIdx}
      onIndex={c.on.setBannerIdx}
      compact={c.compact}
    />
  );
}

/* ----------------------------------------------------------- 3 · filter */

export function DoctorFilterBar({ showViewer = true, showWarnings = true }) {
  const c = useDoctorConsole();
  if (!c) return <OutsideProvider what="Doctor Filter Bar" />;
  return (
    <>
      <div className="dx-strip">
        {showViewer ? (
          <div className="dx-strip-who">
            <span className="dx-pill">
              Signed in as {c.viewer?.role ?? (c.loading ? "…" : "unknown role")}
            </span>
            {!c.canSeeService ? <span className="dx-strip-note">service figures hidden at this level</span> : null}
          </div>
        ) : null}
        <div className="dx-spring" />
        <button
          type="button"
          className={"dx-filter-btn" + (c.filterOn ? " dx-filter-btn--on" : "")}
          onClick={() => c.on.openModal("filter")}
        >
          {Icon.filter({ size: 14, w: c.filterOn ? 2.2 : 2 })}
          Filter<i />
          <b>{c.filterLabel}</b>
          {c.filterOn ? <i className="dx-flag" /> : null}
        </button>
      </div>

      {showWarnings && c.refused.length ? (
        <div className="dx-warn" role="status">
          <span>
            Your ERP role cannot read {c.refused.join(", ")} for this doctor, so it is left out.
            Everything else on the page is real. Ask MIS if you should have access — retrying will not help.
          </span>
        </div>
      ) : null}
      {showWarnings && c.failed.length ? (
        <div className="dx-warn" role="alert">
          <span>
            Could not load {c.failed.join(", ")}.{" "}
            <button type="button" className="dx-link" onClick={c.on.refresh}>Retry</button>
          </span>
        </div>
      ) : null}
    </>
  );
}

/* --------------------------------------------------------- 4 · coverage */

export function DoctorCoverage({ openable = true }) {
  const c = useDoctorConsole();
  if (!c) return <OutsideProvider what="Doctor Coverage" />;
  const rows = openable ? c.coverageRows : c.coverageRows.map((r) => ({ ...r, open: undefined }));
  return <Coverage rows={rows} note={c.coverageNote} />;
}

/* --------------------------------------------------------- 5 · insights */

/**
 * Trend + switch + panel on ONE surface — the same `<section>` the whole-page
 * component renders, so the card is identical whichever way the page is built.
 */
export function DoctorInsights({ startOn = "table", showSwitch = true }) {
  const c = useDoctorConsole();
  if (!c) return <OutsideProvider what="Doctor Insights" />;
  const view = showSwitch ? c.on.view : startOn;
  return (
    <section ref={c.on.panelRef} className="dx-panel dx-panel--flush">
      {c.trendEl}

      {showSwitch ? (
        <div className="dx-switchbar">
          <div className="dx-switch">
            {view === "table"
              ? <span className="dx-on">{Icon.table({ size: 13 })}Data</span>
              : <button type="button" onClick={() => c.on.setView("table")} aria-label="Show data table">{Icon.table({ size: 13 })}Data</button>}
            {view === "activity"
              ? <span className="dx-on">{Icon.clock({ size: 13 })}Activity</span>
              : <button type="button" onClick={() => c.on.setView("activity")} aria-label="Show activity">{Icon.clock({ size: 13 })}Activity</button>}
          </div>
          <div className="dx-spring" />
          <span className="dx-total">{c.range.label} total</span>
        </div>
      ) : null}

      {view === "table" ? c.tableEl : c.activityEl}
    </section>
  );
}
