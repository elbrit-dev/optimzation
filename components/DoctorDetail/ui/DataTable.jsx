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
  table, openRow, onToggleRow, pivotOn, onTogglePivot, sortIdx, sortDir, onSort, compact,
}) {
  const { rows, groups, subs, totals, firstCol } = table;

  /*
   * COMPACT GETS NARROWER COLUMNS, not the same ones scrolled.
   *
   * buildTable sizes for a desk: a 178px department column and 112px per
   * figure. On a phone that is 290px before the second column starts, so the
   * reader saw a department name, one half-column, and had to scroll sideways
   * for every number -- the table looked empty when the data was there.
   *
   * 96 + 66 puts three figures beside the name at 390px. The widths stay in
   * the grid template rather than in CSS because the header, the sub-header,
   * every row and the totals row all have to agree on them, and they are one
   * string shared between those five places.
   */
  const firstW = compact ? 96 : table.firstW;
  const colW = compact ? 66 : 112;
  const template = compact
    ? firstW + "px repeat(" + subs.length + "," + colW + "px)"
    : table.template;
  const minWidth = compact ? firstW + subs.length * colW + "px" : table.minWidth;

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

    </div>
  );
}
