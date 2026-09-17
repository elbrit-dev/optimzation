"use client";

/**
 * Doctor · Filter bar — the one control that moves every other card.
 *
 * "Signed in as …", the note that service is hidden at this level, the Filter
 * button showing the current department and period, and the notices for reads
 * ERP refused (403) or that failed.
 *
 * Changing the department or the period here changes the totals, the coverage
 * rings, the chart and the table at the same instant, wherever on the page
 * those happen to be sitting. They are not children of this component — they
 * subscribe to the same reading, and this is the card that owns the choice.
 */

import React from "react";

import { FilterModal } from "../DoctorDetail/ui/Modals";
import { Icon } from "../DoctorDetail/ui/parts";
import { CardShell, Unbound, useContainerMode } from "./shell";
import useDoctorConsole from "./useDoctorConsole";

export default function DoctorFilterBar(props) {
  const { showViewer = true, showWarnings = true, className, style } = props;

  const c = useDoctorConsole(props);
  const [ref, compact] = useContainerMode(720);

  if (!c) return <Unbound what="The doctor filter bar" innerRef={ref} className={className} style={style} />;

  const { on, ui } = c;

  return (
    <CardShell innerRef={ref} compact={compact} className={className} style={style}>
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
          onClick={() => on.openModal("filter")}
        >
          {Icon.filter({ size: 14, w: c.filterOn ? 2.2 : 2 })}
          Filter<i />
          <b>{c.filterLabel}</b>
          {c.filterOn ? <i className="dx-flag" /> : null}
        </button>
      </div>

      {showWarnings && c.scope === "shared" ? (
        <div className="dx-warn" role="status">
          <span>
            Reading with the shared service credential, not your own — figures are not narrowed to
            what you may see. Bind the signed-in user&apos;s ERP token on this page.
            {c.endpoint ? " Endpoint: " + c.endpoint + "." : null}
          </span>
        </div>
      ) : null}

      {showWarnings && c.refused.length ? (
        <div className="dx-warn" role="status">
          <span>
            Your ERP role cannot read {c.refused.join(", ")} for this doctor, so it is left out.
            Everything else on the page is real. Ask MIS if you should have access — retrying will not help.
          </span>
        </div>
      ) : null}

      {showWarnings && c.failed.length ? (
        <div className="dx-warn" role="status">
          <span>Couldn&#x2019;t load {c.failed.join(", ")}. Everything else on the page is still real.</span>
          <button type="button" onClick={on.refresh}>Retry</button>
        </div>
      ) : null}

      {ui.modal === "filter" ? (
        <FilterModal
          divisions={c.divisions}
          onDiv={on.setDiv}
          numShort={ui.numShort}
          onNum={on.setNumShort}
          range={{ opts: c.rangeOpts, isCustom: ui.rangeMode.mode === "custom" }}
          onRange={on.setRangeMode}
          picker={c.picker}
          label={c.filterLabel}
          onReset={on.resetFilter}
          onClose={on.closeModal}
        />
      ) : null}
    </CardShell>
  );
}
