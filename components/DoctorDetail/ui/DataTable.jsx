"use client";

/**
 * The department table.
 *
 * A CSS grid rather than a real table, because the first column has to stay
 * stuck to the left while an arbitrary number of month blocks scroll under two
 * stacked sticky header rows — which a table with colspans cannot do without
 * fighting the browser.
 *
 * Expanding a department shows its POB PRODUCT LINES. The design expanded into
 * an item-wise split of support and service too; ERP holds neither at item
 * level, so those cells read as an em dash instead of an apportionment that
 * would look recorded.
 */

import React from "react";
import { Icon } from "./parts";

export default function DataTable({
  table, openRow, onToggleRow, pivotOn, onTogglePivot, sortIdx, sortDir, onSort, footnote,
}) {
  const { rows, groups, subs, totals, template, minWidth, firstCol } = table;

  return (
    <div className="dx-tablewrap">
      <div className="dx-tablebar">
        <span className="dx-eyebrow">{firstCol}</span>
        <span className="dx-hint">· tap a row for its product lines</span>
        <div className="dx-spring" />
        <button
          type="button"
          className={"dx-pivot" + (pivotOn ? " dx-pivot--on" : "")}
          onClick={onTogglePivot}
          aria-pressed={pivotOn}
        >
          {Icon.pivot({ size: 12, w: pivotOn ? 2.2 : 2 })}
          {pivotOn ? "Pivot on" : "Pivot by month"}
          {pivotOn ? <i className="dx-flag" /> : null}
        </button>
      </div>

      <div className="dx-scroll">
        <div style={{ minWidth }}>
          <div className="dx-grp" style={{ gridTemplateColumns: template }}>
            <div className="dx-grp-first">{table.scope}</div>
            {groups.map((g, i) => (
              <div
                key={i}
                className={"dx-grp-cell" + (g.total ? " dx-grp-cell--tot" : "")}
                style={{ gridColumn: "span " + g.span }}
              >
                {g.label}
              </div>
            ))}
          </div>

          <div className="dx-sub" style={{ gridTemplateColumns: template }}>
            <div className="dx-sub-first">{firstCol}</div>
            {subs.map((h, i) => (
              <button
                key={i}
                type="button"
                className={"dx-sub-cell" + (i === sortIdx ? " dx-sub-cell--on" : "")}
                onClick={() => onSort(i)}
                aria-label={"Sort by " + h.label}
              >
                {h.label}
                <span>{i === sortIdx ? (sortDir === "asc" ? "↑" : "↓") : "↑↓"}</span>
              </button>
            ))}
          </div>

          {rows.map((r) => {
            const open = openRow === r.key;
            return (
              <div key={r.key}>
                <button
                  type="button"
                  className="dx-row"
                  style={{ gridTemplateColumns: template }}
                  onClick={() => onToggleRow(r.key)}
                  aria-expanded={open}
                  aria-label={(open ? "Collapse " : "Expand ") + r.label + " product lines"}
                >
                  <span className="dx-row-first">
                    <i className={open ? "dx-open" : undefined}>{open ? "▾" : "▸"}</i>
                    <span className="dx-clip">{r.label}</span>
                  </span>
                  {r.cells.map((c, i) => (
                    <span key={i} className={"dx-cell dx-num" + (c.muted ? " dx-cell--muted" : "")}>{c.v}</span>
                  ))}
                </button>

                {open ? (
                  r.items.length ? (
                    r.items.map((it) => (
                      <div key={it.label} className="dx-subrow" style={{ gridTemplateColumns: template }}>
                        <span className="dx-subrow-first dx-clip">{it.label}</span>
                        {it.cells.map((c, i) => (
                          <span key={i} className="dx-subcell dx-num">{c.v}</span>
                        ))}
                      </div>
                    ))
                  ) : (
                    <div className="dx-subrow" style={{ gridTemplateColumns: template }}>
                      <span className="dx-subrow-first dx-clip">No POB lines in this period</span>
                      {subs.map((_, i) => <span key={i} className="dx-subcell" />)}
                    </div>
                  )
                ) : null}
              </div>
            );
          })}

          {!rows.length ? (
            <div className="dx-subrow" style={{ gridTemplateColumns: template }}>
              <span className="dx-subrow-first">No department on file</span>
              {subs.map((_, i) => <span key={i} className="dx-subcell" />)}
            </div>
          ) : null}

          <div className="dx-totrow" style={{ gridTemplateColumns: template }}>
            <span className="dx-totrow-first">Total</span>
            {totals.map((c, i) => <span key={i} className="dx-totcell dx-num">{c.v}</span>)}
          </div>
        </div>
      </div>

      <p className="dx-tablefoot">{footnote}</p>
    </div>
  );
}
