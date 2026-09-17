"use client";

/**
 * Doctor · Trend & data — the monthly chart and the panel under it.
 *
 * One card, because the design draws one surface: the smoothed support /
 * service / POB lines over a single rupee axis with visits on their own rail
 * and a pager through the doctor's departments, the Data ⇄ Activity switch, and
 * whichever panel is showing — the department table, expandable to real product
 * lines, or the activity timeline.
 *
 * Splitting the chart from the table would let a page put half a card
 * somewhere the other half is not, so it does not split.
 *
 * The chart's label step is decided HERE and not in `buildConsole`, because it
 * depends on how wide THIS card is — a figure no shared reading can know.
 */

import React, { useCallback } from "react";

import Trend from "../DoctorDetail/ui/Trend";
import DataTable from "../DoctorDetail/ui/DataTable";
import Activity from "../DoctorDetail/ui/Activity";
import { SupportItemsModal } from "../DoctorDetail/ui/Modals";
import { Icon } from "../DoctorDetail/ui/parts";
import { UNATTRIBUTED_NOTE } from "../DoctorDetail/lib/console";
import { fdate, plural } from "../DoctorDetail/lib/format";
import { CardShell, Unbound, useContainerMode } from "./shell";
import useDoctorConsole from "./useDoctorConsole";

const FOOTNOTE = "Expanding a department shows its product lines — support items from Ecubix and "
  + "POB lines from the quotation ledger. Service is a payment, so it has no products. "
  + UNATTRIBUTED_NOTE;

export default function DoctorInsightsCard(props) {
  const { startOn = "table", showSwitch = true, showTrend = true, className, style } = props;

  const c = useDoctorConsole(props);
  const [ref, compact] = useContainerMode(720);

  // The totals strip scrolls to this panel when one of its cards is opened, and
  // it may be nowhere near it in the tree — so the node is handed to the
  // session rather than passed down.
  const register = c?.on.registerPanel;
  const panelRef = useCallback((node) => { register?.(node); }, [register]);

  if (!c) return <Unbound what="The doctor trend card" innerRef={ref} className={className} style={style} />;

  const { on, ui, chart, money } = c;
  const view = showSwitch ? ui.view : startOn;

  const lblStep = compact ? 2 : 1;
  const cols = c.months.map((r, i) => ({
    short: r.short,
    on: i === chart.selIdx,
    showLabel: i % lblStep === 0 || i === chart.selIdx,
    visOn: chart.visOn && r.vis > 0,
    visSize: (r.vis >= 3 ? 11 : r.vis === 2 ? 9 : 7) + "px",
    aria: r.label + " — support " + (r.sup ? money(r.sup) : "none")
      + (c.canSeeService ? ", service " + (r.svc ? money(r.svc) : "none") : "")
      + ", POB " + (r.pob ? money(r.pob) : "none")
      + ", " + plural(r.vis, "visit", "visits"),
  }));

  return (
    <CardShell innerRef={ref} compact={compact} className={className} style={style}>
      <section ref={panelRef} className="dx-panel dx-panel--flush">
        {showTrend ? (
          <Trend
            readLabel={chart.selMonth.label}
            page={{
              label: chart.pages[chart.pIdx]?.label ?? "All departments",
              many: chart.pages.length > 1,
              prev: () => on.setChartPage((p) => (p - 1 + chart.pages.length) % chart.pages.length),
              next: () => on.setChartPage((p) => (p + 1) % chart.pages.length),
            }}
            cols={cols}
            // Always short form: the axis column is 44px and ₹1,24,300 does not fit.
            yLabels={chart.yLabels}
            lines={chart.lines}
            markers={chart.lines.map((l) => ({ k: l.k, hue: l.hue, top: l.tops[chart.crossIdx] ?? 0 }))}
            crossLeft={chart.crossLeft}
            series={chart.SERIES.map((x) => ({
              k: x.k,
              label: x.label,
              hue: x.hue,
              on: !ui.hidden[x.k],
              value: x.k === "vis"
                ? String(chart.selMonth.vis)
                : (chart.selMonth[x.k] ? money(chart.selMonth[x.k]) : "—"),
              toggle: () => on.setHidden(x.k),
            }))}
            tip={chart.hovIdx != null ? {
              left: chart.hovPct.toFixed(2),
              shift: chart.hovPct < 22 ? "-8px" : chart.hovPct > 78 ? "calc(-100% + 8px)" : "-50%",
              label: c.months[chart.hovIdx]?.label ?? "",
              rows: [
                ...chart.lines.map((l) => {
                  const s = chart.SERIES.find((x) => x.k === l.k);
                  const v = c.months[chart.hovIdx]?.[l.k] ?? 0;
                  return { label: s.label, hue: l.hue, value: v ? money(v) : "—" };
                }),
                ...(chart.visOn
                  ? [{ label: "Visits", hue: "#047857", value: String(c.months[chart.hovIdx]?.vis ?? 0) }]
                  : []),
              ],
            } : null}
            onHover={on.hover}
            onLeave={on.leave}
          />
        ) : null}

        {showSwitch ? (
          <div className="dx-switchbar">
            <div className="dx-switch">
              {view === "table"
                ? <span className="dx-on">{Icon.table({ size: 13 })}Data</span>
                : <button type="button" onClick={() => on.setView("table")} aria-label="Show data table">{Icon.table({ size: 13 })}Data</button>}
              {view === "activity"
                ? <span className="dx-on">{Icon.clock({ size: 13 })}Activity</span>
                : <button type="button" onClick={() => on.setView("activity")} aria-label="Show activity">{Icon.clock({ size: 13 })}Activity</button>}
            </div>
            <div className="dx-spring" />
            <span className="dx-total">{c.range.label} total</span>
          </div>
        ) : null}

        {view === "table" ? (
          <DataTable
            table={c.table}
            openRow={ui.openRow}
            onToggleRow={on.toggleRow}
            pivotOn={ui.pivotOn}
            onTogglePivot={on.togglePivot}
            sortIdx={ui.sortIdx}
            sortDir={ui.sortDir}
            onSort={on.sort}
            footnote={FOOTNOTE}
          />
        ) : (
          <Activity
            filters={c.filters}
            groups={c.feedGroups}
            today={fdate(new Date().toISOString().slice(0, 10))}
            foot={c.feedShown.length
              ? "Earlier than " + c.feedGroups[c.feedGroups.length - 1].label + " is outside the selected period"
              : "Nothing recorded for this filter"}
          />
        )}
      </section>

      {ui.supportSplit ? (
        <SupportItemsModal entry={ui.supportSplit} money={money} onClose={on.closeSupportSplit} />
      ) : null}
    </CardShell>
  );
}
