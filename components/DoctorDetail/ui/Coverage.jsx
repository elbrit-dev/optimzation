"use client";

/**
 * Coverage by role.
 *
 * Roles, not names: a doctor covered by three BEs across three divisions is one
 * BE circle reading 3, because the question the row answers is "has this level
 * been in the room", not "who went".
 *
 * A role with no touch keeps its place as a dashed circle. Dropping it would
 * make a doctor nobody senior has visited look identical to one where the
 * ladder simply has fewer rungs.
 */

import React from "react";

export default function Coverage({ rows, note }) {
  return (
    <section className="dx-panel dx-panel-pad">
      <div className="dx-panel-head">
        <h2>Coverage by role</h2>
        <i className="dx-hr" />
        <span className="dx-note">{note}</span>
      </div>
      <div className="dx-cov">
        <i className="dx-cov-rail" aria-hidden="true" />
        <div className="dx-cov-grid">
          {rows.map((r) => (
            r.has ? (
              <button key={r.role} type="button" className="dx-cov-cell" aria-label={r.aria} onClick={r.open}>
                <span className="dx-cov-ring">
                  <b className="dx-num">{r.n}</b>
                  <i aria-hidden="true">›</i>
                </span>
                <span className="dx-cov-role">{r.role}</span>
                <span className="dx-cov-unit">{r.unit}</span>
              </button>
            ) : (
              <div key={r.role} className="dx-cov-cell">
                <span className="dx-cov-ring dx-cov-ring--off"><span>—</span></span>
                <span className="dx-cov-role dx-cov-role--off">{r.role}</span>
                <span className="dx-cov-unit">no touch</span>
              </div>
            )
          ))}
        </div>
      </div>
    </section>
  );
}
