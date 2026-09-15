"use client";

/**
 * The activity timeline: the same rows as the table, in the order they
 * happened, grouped by month.
 *
 * A visit that was planned but never marked as made still appears — it is a
 * real row in ERP and hiding it would make a rep's month look emptier than it
 * was — but it is flagged, so the count above and the truth underneath are both
 * on the page.
 */

import React from "react";

export default function Activity({ filters, groups, today, foot }) {
  return (
    <div>
      <div className="dx-filters">
        {filters.map((f) => (
          <button
            key={f.k}
            type="button"
            className={"dx-fchip" + (f.on ? " dx-fchip--on" : "")}
            onClick={f.pick}
            aria-pressed={f.on}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="dx-tl">
        <div className="dx-tl-spine" aria-hidden="true" />

        <div className="dx-tl-today">
          <span aria-hidden="true" />
          <div>Today · {today}</div>
        </div>

        {groups.map((g) => (
          <div key={g.label}>
            <div className="dx-tl-month">
              <span aria-hidden="true" />
              <div className="dx-tl-month-in">
                <span>{g.label}</span>
                <span className="dx-tl-count dx-num">{g.count}</span>
              </div>
            </div>

            {g.items.map((e) => (
              <div className="dx-tl-item" key={e.id}>
                <span className="dx-tl-node" style={{ border: "2px solid " + e.fg }} aria-hidden="true" />
                <span className="dx-tl-stub" aria-hidden="true" />
                <article className="dx-ev">
                  <div className="dx-ev-head" style={{ background: e.bg, borderBottom: "1px solid " + e.bd }}>
                    <span className="dx-ev-kind" style={{ color: e.fg }}>{e.kind}</span>
                    <span className="dx-ev-when dx-num">{e.when}</span>
                    <div className="dx-spring" />
                    {e.div ? (
                      <span className="dx-ev-div" style={{ border: "1px solid " + e.bd, color: e.fg }}>{e.div}</span>
                    ) : null}
                  </div>
                  <div className="dx-ev-body">
                    <div className="dx-ev-title">
                      <span className="dx-break">{e.title}</span>
                      {e.amt ? <b className="dx-num">{e.amt}</b> : null}
                    </div>
                    <div className="dx-ev-meta dx-break">{e.meta}</div>
                    {e.flag ? <span className="dx-ev-flag">{e.flag}</span> : null}
                    {e.onSplit ? (
                      <button type="button" className="dx-ev-split" onClick={e.onSplit}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
                        Item-wise split
                      </button>
                    ) : null}
                  </div>
                </article>
              </div>
            ))}
          </div>
        ))}

        <div className="dx-tl-foot">
          <span aria-hidden="true" />
          <div>{foot}</div>
        </div>
      </div>
    </div>
  );
}
