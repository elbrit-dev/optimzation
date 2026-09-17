"use client";

/**
 * The page's dialogs. All of them share Sheet, so all of them trap focus,
 * close on Escape and hand focus back — behaviour the design draws but does
 * not describe.
 */

import React from "react";
import { Icon, Sheet, SheetHead } from "./parts";

/* ------------------------------------------------------- role  coverage */

export function RoleDetailModal({ detail, onClose, compact }) {
  return (
    <Sheet label="Role coverage detail" maxWidth={480} onClose={onClose}>
      <div
        className="dx-sheet-head"
        style={{ background: "linear-gradient(180deg,#f7f9fe,#eef3fc)", borderBottom: "1px solid #d7e0f5", padding: "12px 14px" }}
      >
        <span style={{
          display: "grid", placeItems: "center", minWidth: 38, height: 34, padding: "0 8px",
          borderRadius: 9, background: "#1e3a8a", fontSize: 13, fontWeight: 800, color: "#fff",
        }}>
          {detail.role}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{detail.name}</h3>
          <div style={{ fontSize: 10.5, color: "#6b7280" }}>
            {detail.scope} · {detail.heads} {detail.headUnit} · last {detail.last}
          </div>
        </div>
        <button type="button" className="dx-x" aria-label="Close" onClick={onClose}>✕</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ padding: "9px 12px" }}>
          <div className="dx-eyebrow" style={{ fontSize: 9.5 }}>Visits</div>
          <b className="dx-num" style={{ fontSize: 17, fontWeight: 800, color: "#1e3a8a" }}>{detail.visits}</b>
        </div>
        <div style={{ padding: "9px 12px", borderLeft: "1px solid #f3f4f6" }}>
          <div className="dx-eyebrow" style={{ fontSize: 9.5 }}>Services</div>
          <b className="dx-num" style={{ fontSize: 17, fontWeight: 800 }}>{detail.svc}</b>
        </div>
        <div style={{ padding: "9px 12px", borderLeft: "1px solid #f3f4f6" }}>
          <div className="dx-eyebrow" style={{ fontSize: 9.5 }}>Service ₹</div>
          <b className="dx-num" style={{ fontSize: 17, fontWeight: 800, color: "#a02019" }}>{detail.svcAmt}</b>
        </div>
      </div>

      <div style={{ maxHeight: compact ? "40vh" : 290, overflow: "auto" }}>
        {detail.rows.map((d) => (
          <div key={d.v} style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700 }}>{d.v}</span>
              <span className="dx-num" style={{ fontSize: 11, fontWeight: 700, color: "#1e3a8a", whiteSpace: "nowrap" }}>{d.vis} vis</span>
              <span className="dx-num" style={{ fontSize: 11, fontWeight: 700, color: "#a02019", whiteSpace: "nowrap" }}>{d.amt}</span>
            </div>
            <div className="dx-meter" style={{ height: 3 }}>
              <i style={{ height: 3, background: "#8296c0", width: d.pct + "%" }} />
            </div>
            <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 10.5, color: "#6b7280" }}>
              <span className="dx-break">{d.heads}</span>
              <span style={{ color: "#d7dde7" }}>|</span>
              <span>{d.svc} · last {d.last}</span>
            </div>
          </div>
        ))}
        {!detail.rows.length ? <div className="dx-empty" style={{ margin: 14 }}>Nothing recorded for this role in the period.</div> : null}
      </div>

      <div className="dx-sheet-foot">
        <span className="dx-note">Split follows the filter above</span>
        <button type="button" className="dx-btn" onClick={onClose}>Close</button>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- filter */

export function FilterModal({
  divisions, onDiv, numShort, onNum, range, onRange,
  picker, onClose, onReset, label,
}) {
  return (
    <Sheet label="Filter" maxWidth={380} onClose={onClose}>
      <div className="dx-sheet-head" style={{ padding: "12px 14px", borderBottom: "1px solid #f3f4f6" }}>
        <span style={{ color: "#1e3a8a", display: "flex" }}>{Icon.filter({ size: 15, w: 2.2 })}</span>
        <h3>Filter</h3>
        <button type="button" className="dx-x" aria-label="Close" onClick={onClose}>✕</button>
      </div>

      <div style={{ padding: "13px 14px 14px", display: "flex", flexDirection: "column", gap: 13 }}>
        <div>
          <div className="dx-eyebrow">Department</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
            {divisions.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => onDiv(v.key)}
                aria-pressed={v.on}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  minHeight: 34, padding: "0 13px", borderRadius: 999,
                  border: "1px solid " + (v.on ? "#a02019" : "#e5e7eb"),
                  background: v.on ? "#fcedec" : "#fff",
                  fontSize: 12, fontWeight: v.on ? 700 : 600,
                  color: v.on ? "#a02019" : "#4b5563",
                }}
              >
                {/* A tick only on the named departments. "All" is the absence of
                    a choice, not a sixth thing that can be ticked alongside. */}
                {v.on && v.key !== "all" ? <span aria-hidden="true">✓</span> : null}
                {v.label}
              </button>
            ))}
          </div>
          <div className="dx-hint" style={{ marginTop: 6 }}>
            Tap more than one to combine them — an SM or ZSM covering several divisions
            sees them added together, with the chart pager walking each in turn.
          </div>
        </div>

        <div>
          <div className="dx-eyebrow">Value format</div>
          <div className="dx-seg" style={{ marginTop: 7 }}>
            <button type="button" className={numShort ? undefined : "dx-on"} onClick={() => onNum(false)}>Actual</button>
            <button type="button" className={numShort ? "dx-on" : undefined} onClick={() => onNum(true)}>Lacks</button>
          </div>
        </div>

        <div>
          <div className="dx-eyebrow">Period</div>
          <div className="dx-opts">
            {range.opts.map((o) => (
              <button
                key={o.k}
                type="button"
                className={"dx-opt" + (o.on ? " dx-opt--on" : "")}
                onClick={() => onRange(o.k)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="dx-eyebrow dx-spring">Custom range</span>
            {range.isCustom ? (
              <span style={{ padding: "1px 7px", borderRadius: 999, background: "#1e3a8a", fontSize: 10, fontWeight: 700, color: "#fff" }}>on</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={picker.toggle}
            aria-expanded={picker.open}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8, minHeight: 38,
              marginTop: 7, padding: "0 11px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff",
            }}
          >
            <span style={{ color: "#1e3a8a", display: "flex" }}>{Icon.calendar({ size: 14 })}</span>
            <span className="dx-clip" style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 12.5, fontWeight: 700 }}>
              {picker.label}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "#6b7280", whiteSpace: "nowrap" }}>{picker.count}</span>
            <span style={{ fontSize: 9, color: "#6b7280" }}>▾</span>
          </button>

          {picker.open ? (
            <div className="dx-picker">
              <div className="dx-picker-head">
                <button type="button" aria-label="Previous year" onClick={picker.prevYear}>‹</button>
                <span className="dx-num">{picker.year}</span>
                <button type="button" aria-label="Next year" onClick={picker.nextYear}>›</button>
              </div>
              <div className="dx-picker-grid">
                {picker.cells.map((c) => (
                  c.off ? (
                    <span key={c.k} className="dx-mcell dx-mcell--off">{c.label}</span>
                  ) : (
                    <button
                      key={c.k}
                      type="button"
                      onClick={() => picker.pick(c.k)}
                      className={"dx-mcell" + (c.edge ? " dx-mcell--edge" : c.band ? " dx-mcell--band" : "")}
                    >
                      {c.label}
                    </button>
                  )
                ))}
              </div>
              <div className="dx-picker-foot">
                <span>{picker.hint}</span>
                <button type="button" className="dx-btn dx-btn--blue" style={{ minHeight: 30, padding: "0 12px", fontSize: 11.5 }} onClick={picker.toggle}>
                  Done
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="dx-sheet-foot">
        <button type="button" className="dx-btn" onClick={onReset}>Reset</button>
        <button type="button" className="dx-btn dx-btn--blue" style={{ padding: "0 18px" }} onClick={onClose}>
          Show {label}
        </button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------- map */

export function MapModal({ clinics, index, onPick, onClose, onAdd }) {
  const c = clinics[index] ?? clinics[0] ?? null;
  const box = c?.lat && c?.lon
    ? [(c.lon - 0.012).toFixed(4), (c.lat - 0.008).toFixed(4), (c.lon + 0.012).toFixed(4), (c.lat + 0.008).toFixed(4)].join(",")
    : null;

  return (
    <Sheet label="Clinic locations" maxWidth={520} onClose={onClose}>
      <SheetHead title="Clinic locations" count={clinics.length + " on file"} onClose={onClose} />
      {box ? (
        <iframe
          className="dx-map"
          src={"https://www.openstreetmap.org/export/embed.html?bbox=" + box + "&layer=mapnik&marker=" + c.lat + "," + c.lon}
          title="Clinic location map"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div className="dx-empty" style={{ margin: 16 }}>
          No coordinates recorded for this doctor, so there is nothing to pin.
        </div>
      )}
      <div className="dx-sheet-list" style={{ maxHeight: 250 }}>
        {clinics.map((row, i) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onPick(i)}
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "11px 16px",
              border: 0, borderBottom: "1px solid #f3f4f6", background: i === index ? "#f4f7fd" : "#fff",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: i === index ? 700 : 600, color: i === index ? "#1e3a8a" : "#111827" }}>
                {row.name}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: i === index ? "#a02019" : "#6b7280" }}>{row.tag}</span>
            </div>
            <div style={{ marginTop: 3, fontSize: 11.5, color: i === index ? "#4b5563" : "#6b7280" }}>{row.addr}</div>
            <div style={{ marginTop: 2, fontSize: 10.5, color: "#6b7280" }}>{row.days ?? "Timings not on file"}</div>
          </button>
        ))}
      </div>
      <div className="dx-sheet-foot">
        {/* Same shape as PharmacyModal's footer: the add action sits on the
            left and only exists once the page has wired a handler for it. */}
        {onAdd ? (
          <button type="button" className="dx-chip dx-chip--add" onClick={onAdd}>
            <i>+</i>Add clinic
          </button>
        ) : null}
        {c?.lat && c?.lon ? (
          <a href={"https://www.openstreetmap.org/?mlat=" + c.lat + "&mlon=" + c.lon + "#map=16/" + c.lat + "/" + c.lon}
            target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700 }}>
            Open in maps
          </a>
        ) : <span />}
        <button type="button" className="dx-btn" onClick={onClose}>Close</button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------ pharmacies */

export function PharmacyModal({ rows, money, onClose, onAdd }) {
  return (
    <Sheet label="Linked pharmacies" maxWidth={460} onClose={onClose}>
      <SheetHead title="Linked pharmacies" onClose={onClose} />
      <div className="dx-sheet-list" style={{ maxHeight: 340 }}>
        {rows.map((p) => (
          <div className="dx-sheet-row" key={p.name}>
            <div className="dx-sheet-row-t">
              <span className="dx-break">{p.name}</span>
              <span className="dx-num" style={{ fontSize: 11, fontWeight: 600, color: "#4b5563", whiteSpace: "nowrap" }}>
                {p.pob ? money(p.pob) : "—"}
              </span>
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }} className="dx-break">
              {p.addr ?? "Address not captured"}
            </div>
            <div style={{ marginTop: 3, fontSize: 10.5, color: "#4b5563" }}>
              {p.lines} {p.lines === 1 ? "line" : "lines"} · last order {p.last ?? "—"}
            </div>
          </div>
        ))}
        {!rows.length ? (
          <div className="dx-empty" style={{ margin: 16 }}>
            No pharmacy has ordered against this doctor yet. This list is built from the POB ledger — ERP has no
            doctor-to-pharmacy link of its own.
          </div>
        ) : null}
      </div>
      <div className="dx-sheet-foot">
        {onAdd ? (
          <button type="button" className="dx-chip dx-chip--add" onClick={onAdd}>
            <i>+</i>Add pharmacy
          </button>
        ) : <span className="dx-note">Value is the tagged order value till date</span>}
        <button type="button" className="dx-btn" onClick={onClose}>Close</button>
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------------------------- notes */

export function NoteModal({ form, setForm, saving, error, onSave, onClose }) {
  return (
    <Sheet label="Add note" maxWidth={440} onClose={onClose}>
      <SheetHead title="Add note" onClose={onClose} />
      <div className="dx-sheet-body">
        <div className="dx-fieldrow">
          <label className="dx-field" style={{ flex: "2 1 180px" }}>
            <span>Subject</span>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm("subject", e.target.value)}
              placeholder="e.g. Asked for sample stock"
            />
          </label>
          <label className="dx-field" style={{ flex: "1 1 120px" }}>
            <span>Tag</span>
            <select value={form.tag} onChange={(e) => setForm("tag", e.target.value)}>
              <option value="Note">Note</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Complaint">Complaint</option>
            </select>
          </label>
        </div>
        <label className="dx-field">
          <span>Note</span>
          <textarea
            rows={4}
            value={form.body}
            onChange={(e) => setForm("body", e.target.value)}
            placeholder="What happened, what was promised, what is next"
          />
        </label>
        {error ? <div className="dx-warn" role="alert"><span>{error}</span></div> : null}
      </div>
      <div className="dx-sheet-foot dx-sheet-foot--end">
        <button type="button" className="dx-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="dx-btn dx-btn--blue" disabled={saving || !form.body.trim()} onClick={onSave}>
          {saving ? "Saving…" : "Save note"}
        </button>
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------- item-wise support */

/**
 * The month's support, product by product.
 *
 * The design called this "a sample apportionment" because it was drawn before
 * anyone had looked inside `Doctor Support`'s item table. It is not a sample:
 * every row here is an Ecubix line with its own quantity, rate and department.
 */
export function SupportItemsModal({ entry, money, onClose }) {
  const rows = [...entry.items].sort((a, b) => b.amt - a.amt);
  const top = Math.max(...rows.map((r) => r.amt), 1);
  const departments = [...new Set(rows.map((r) => r.div).filter(Boolean))];

  return (
    <Sheet label="Item-wise support" maxWidth={440} onClose={onClose}>
      <div className="dx-sheet-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Item-wise support</h3>
          <div style={{ fontSize: 10.5, color: "#6b7280" }}>
            {entry.period} · {entry.qty.toLocaleString("en-IN")} units
            {departments.length ? " · " + departments.join(", ") : ""}
          </div>
        </div>
        <b className="dx-num" style={{ fontSize: 15, fontWeight: 800, color: "#1e3a8a" }}>{money(entry.amt)}</b>
        <button type="button" className="dx-x" aria-label="Close" onClick={onClose}>✕</button>
      </div>

      <div className="dx-sheet-list" style={{ maxHeight: 360 }}>
        {rows.map((r) => (
          <div className="dx-sheet-row" key={r.id} style={{ padding: "10px 16px" }}>
            <div className="dx-sheet-row-t">
              <span className="dx-break" style={{ fontWeight: 600 }}>{r.item}</span>
              <span style={{ fontSize: 10.5, color: "#6b7280", whiteSpace: "nowrap" }}>
                {r.qty.toLocaleString("en-IN")} units
              </span>
              <b className="dx-num" style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>{money(r.amt)}</b>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
              <span className="dx-meter dx-spring" style={{ marginTop: 0 }}>
                <i style={{ background: r.unattributed ? "#9aa3b2" : "#1e3a8a", width: Math.round((r.amt / top) * 100) + "%" }} />
              </span>
              <span className="dx-num" style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", whiteSpace: "nowrap" }}>
                {Math.round((r.amt / entry.amt) * 100)}%
              </span>
            </div>
            <div style={{ marginTop: 4, fontSize: 10.5, color: "#6b7280" }} className="dx-break">
              {[r.brand, r.div, r.role, r.rate ? "at " + money(r.rate) : null]
                .filter(Boolean).join(" · ")}
            </div>
          </div>
        ))}
      </div>

      <div className="dx-sheet-foot">
        <span className="dx-note">Ecubix lines, summing to the month total</span>
        <button type="button" className="dx-btn" onClick={onClose}>Close</button>
      </div>
    </Sheet>
  );
}
