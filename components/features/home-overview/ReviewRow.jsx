"use client";

import { Row, SkeletonRow, Tile, tabNum, track } from "./HomeOverview";

/* "Report" — one Review Report card on the Home Overview: the person's last
 * full month of Target, Primary and Secondary from the Review Report page,
 * with achievement, YTD, growth and primary : secondary. The card opens the
 * Review Report page (`open("review")`); the row has no See all.
 *
 * Drawn in the overview's own vocabulary (Row, Tile, track) so it sits with
 * Field activity and Team ranking as one page. Three bars on ONE scale (the
 * largest of the three): target is the reference (grey), primary blue,
 * secondary magenta — the Review Report page's own identity. */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m) => (m ? `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : "");
const cr = (v) => {
  if (v == null || Number.isNaN(v)) return "—";
  const s = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1)} L`;
  return `${s}₹${Math.round(a).toLocaleString("en-IN")}`;
};
const pc = (v, sign) => (v == null || !Number.isFinite(v) ? "—" : `${sign && v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(1)}%`);
const x = (v) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 10 ? Math.round(v) : v.toFixed(1)}×`);
const achColor = (a) => (a == null ? "#0b1220" : a >= 1 ? "#067d28" : a >= 0.9 ? "#b54708" : "#b42318");
const signColor = (v) => (v == null ? "#0b1220" : v < 0 ? "#b42318" : "#067d28");

const COLORS = { target: "#c5ccd6", primary: "#2563eb", secondary: "#9e2692" };

function Bar({ label, value, max, color }) {
  const w = max ? `${Math.max(0, Math.min(1, (value ?? 0) / max)) * 100}%` : "0%";
  return (
    <span style={{ display: "grid", gridTemplateColumns: "84px minmax(0,1fr) 96px", gap: 10, alignItems: "center", fontSize: 13 }}>
      <span style={{ color: "#5b6576" }}>{label}</span>
      <span style={track(10)}><span style={{ display: "block", height: "100%", width: w, background: color, borderRadius: 99 }} /></span>
      <span style={{ textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", ...tabNum }}>{value == null ? "—" : cr(value)}</span>
    </span>
  );
}

function Fact({ k, v, c }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: "#8a93a3", whiteSpace: "nowrap" }}>{k}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: c ?? "#0b1220", whiteSpace: "nowrap", ...tabNum }}>{v}</span>
    </span>
  );
}

export function ReviewRow({ L, state, open }) {
  if (state.status === "loading") return <SkeletonRow L={L} />;
  if (state.status !== "ready" || !state.data) return null;
  const d = state.data;
  const { sc } = d;
  const go = () => open("review");
  const max = Math.max(sc.target || 0, sc.primary || 0, sc.secondary || 0);
  const gap = sc.hasSales ? sc.primary - sc.target : null;

  return (
    <Row L={L} kicker={`Review · ${monthLabel(d.month)}${d.whole ? " · all teams" : ""}`} dot="#2563eb" title="Report">
      <Tile width={L.isDesk ? "min(640px, 100%)" : "100%"} onClick={go} label="Review Report">
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Review Report</span>
          <span style={{ fontSize: 12, color: "#8a93a3", whiteSpace: "nowrap" }}>
            {monthLabel(d.month)}{d.open ? " · being entered" : ""}
          </span>
        </span>

        {sc.hasSales ? (
          <span style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px 10px" }}>
            <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: achColor(sc.ach), ...tabNum }}>{pc(sc.ach)}</span>
            <span style={{ fontSize: 14, color: "#5b6576" }}>
              of target · {gap >= 0 ? "ahead by " : "short by "}<b style={{ color: "#0b1220", ...tabNum }}>{cr(Math.abs(gap))}</b>
            </span>
          </span>
        ) : (
          <span style={{ fontSize: 13, color: "#5b6576" }}>{d.name}&apos;s HQ is shared, so target and primary are counted at the manager.</span>
        )}

        <span style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sc.hasSales ? <Bar label="Target" value={sc.target} max={max} color={COLORS.target} /> : null}
          {sc.hasSales ? <Bar label="Primary" value={sc.primary} max={max} color={COLORS.primary} /> : null}
          <Bar label="Secondary" value={sc.secondary} max={max} color={COLORS.secondary} />
        </span>

        {sc.allocated ? (
          <span style={{ fontSize: 12, color: "#8a93a3" }}>
            Shared HQ — target split equally between its BEs; primary by your share of the month&apos;s secondary.
          </span>
        ) : null}

        <span style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 12, paddingTop: 12, borderTop: "1px solid #f2f4f7" }}>
          {sc.hasSales ? <Fact k="Year to date" v={pc(sc.ytdAch)} c={achColor(sc.ytdAch)} /> : null}
          {sc.hasSales ? <Fact k="Primary vs last year" v={pc(sc.growth, true)} c={signColor(sc.growth)} /> : null}
          <Fact k="Secondary vs last year" v={pc(sc.secGrowth, true)} c={signColor(sc.secGrowth)} />
          {sc.hasSales ? <Fact k="Primary : secondary" v={x(sc.priSec)} /> : null}
        </span>
      </Tile>
    </Row>
  );
}
