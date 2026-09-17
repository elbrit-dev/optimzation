"use client";

/**
 * The doctor page, as approved by management in September 2026 — now just the
 * five cards in their approved order.
 *
 * Every card is a component in its own right (`components/DoctorConsole`), and
 * a Studio page is expected to place them itself. This exists only as the
 * one-drop version: the same five, in the order the design put them, with the
 * breadcrumb and the footnote around them. It is NOT a container and takes no
 * children — the cards were never really inside it, they only shared a reading
 * with it, and they still do.
 *
 * WHAT IS BOUND: the doctor, and the signed-in user's ERP credential. Nothing
 * else. Who is reading, what they may see, which departments exist, who covers
 * them — all of that is read from ERP with that credential, which is the point:
 * several reps share a doctor, and ERP's own permissions are what keep one of
 * them out of another's rows.
 *
 * EVERY FIGURE IS ATTRIBUTED. Support's department, role profile and product
 * breakdown live on `Doctor Support`'s item child table (not on the parent row,
 * which is what makes a list read look bare); service carries its own
 * department and role; POBs and visits get theirs from the employee who raised
 * them. So the department filter, the chart's pager and the table's rows all
 * count the same way. The only thing that ever lands in Unassigned is a month
 * Ecubix sent as a total with no products behind it.
 */

import React from "react";

import DoctorHeroCard from "../DoctorConsole/DoctorHeroCard";
import DoctorTotalsCard from "../DoctorConsole/DoctorTotalsCard";
import DoctorFilterBar from "../DoctorConsole/DoctorFilterBar";
import DoctorCoverageCard from "../DoctorConsole/DoctorCoverageCard";
import DoctorInsightsCard from "../DoctorConsole/DoctorInsightsCard";
import useDoctorConsole from "../DoctorConsole/useDoctorConsole";
import { ConsoleStyles } from "../DoctorConsole/shell";
import useContainerMode from "./lib/useContainerMode";

export default function DoctorDetail(props) {
  const { onBack, className = "", style } = props;

  // The page and all five cards resolve the SAME session — same doctor, same
  // credential, same key — so this hook costs one subscription, not one read.
  const c = useDoctorConsole(props);
  const [wrapRef, compact] = useContainerMode(720);

  if (!c) {
    return (
      <div ref={wrapRef} className={"dx-root " + className} style={style}>
        <ConsoleStyles />
        <div className="dx-empty">Bind a doctor — a Lead id such as DR-47718, or the row from the list.</div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={"dx-root" + (compact ? " dx-root--compact" : "") + (className ? " " + className : "")}
      style={style}
    >
      <ConsoleStyles />
      <div className="dx-crumbs">
        {onBack ? (
          <button type="button" className="dx-crumb-btn" onClick={() => onBack({ doctor: c.doctor, code: c.doctorId })}>
            Doctor lists
          </button>
        ) : <span>Doctor lists</span>}
        <span className="dx-sep">▸</span>
        <span className="dx-here">{c.doctor?.name ?? c.doctorId}</span>
      </div>

      <DoctorHeroCard {...props} className="" />
      <DoctorTotalsCard {...props} className="" />
      <DoctorFilterBar {...props} className="" />

      <div className="dx-stack">
        <DoctorCoverageCard {...props} className="" />
        <DoctorInsightsCard {...props} className="" />
        <p className="dx-foot">{c.footNote}</p>
      </div>
    </div>
  );
}
