import React from "react";
import { createPortal } from "react-dom";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  Rectangle,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * TrendChart — the day-wise trend strip inside a card, drawn with recharts.
 *
 * Five shapes, chosen with `type`. The first four plot ONE series (the day's
 * total) in the card's own accent colour; the fifth splits each day by
 * department and is the only one that needs a palette and a legend:
 *
 *   "wave"      smooth filled area — the shape of the month at a glance
 *   "line"      the same curve without the fill — best when the days sit close
 *               together and you are comparing small differences
 *   "bars"      one bar per day on a zero baseline — each day as its own fact
 *   "lollipop"  a hairline stem with a dot at the value — the lightest of the
 *               discrete forms, good when 30 bars read as a wall of ink
 *   "stacked"   each day split into its departments — the only form that shows
 *               the breakdown in the plot rather than only in the tooltip
 *
 * Points arrive as:
 *
 *   [{ date: "2026-09-01", value: 235000,
 *      breakdown: [{ name: "Aura & Proxima Chennai - ELPL", value: 45000 }, …] }, …]
 *
 * with the usual aliases accepted (`day`/`label` for date, `total`/`Incentive`
 * for value, `departments`/`items` for breakdown).
 *
 * With nothing to plot the component renders null — no empty frame, no baseline,
 * no "no data" box. A card with no trend simply has no trend strip.
 *
 * Note that recharts measures its container before it draws, so the plot appears
 * on the client; the heading and the date range render either way.
 */

const STYLE_ID = "esw-trend-chart-styles";

/**
 * Categorical hues for the stacked form, in fixed order — a series keeps its
 * colour whatever else is on screen, and a 7th department is never given a
 * generated hue; it folds into "Other". Validated on the light surface:
 * lightness band, chroma floor, CVD separation and normal-vision floor all pass.
 */
const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"];
const OTHER_COLOR = "#94a3b8";
const MAX_SERIES = SERIES_COLORS.length;
const OTHER = "Other";

/**
 * The primary card's three measures, when a day carries them. The card's own
 * green/red/grey is deliberately NOT reused here: as two lines, green and red
 * are 5.0 ΔE apart under deuteranopia — indistinguishable to a red-green
 * colourblind reader. Blue / orange / violet carries the same three ideas and
 * validates clean (worst CVD pair 24.7 ΔE, contrast all above 3:1).
 */
const MEASURE_COLORS = {
  sales: "#2a78d6",
  returns: "#eb6834",
  offers: "#4a3aa7",
};
const MEASURE_ORDER = ["Sales", "Returns", "Offers"];

/** Which measure a key is talking about, whatever the API called it. */
const measureKind = (name) => {
  const n = String(name).toLowerCase();
  if (/credit|return/.test(n)) return "returns";
  if (/offer|claim|scheme/.test(n)) return "offers";
  if (/sale|primary|net|gross/.test(n)) return "sales";
  return null;
};

/* A day that sold a little did not sell nothing. Against a month whose peak is
   in the millions, a few thousand rounds to a zero-height bar and the day reads
   as empty - the one thing the chart must never say about a day that has data.
   Two pixels is enough to see and too small to misread as a quantity; a true zero
   still draws nothing, so the difference between none and a little survives. */
const MIN_BAR_PX = 2;

/**
 * Every bar is drawn through here, because two things have to be decided from
 * the segment itself and recharts' own props cannot see either.
 *
 * A zero draws nothing. `minPointSize` could not be used for this: its callback
 * is handed value[1], which on a stacked bar is the top of the running stack,
 * not the segment's own size - so a Returns segment of exactly 0 sitting on top
 * of 1,673 of Sales looked non-zero and got the minimum height, painting an
 * orange bar for a day with no returns. The segment's extent is value[1] minus
 * value[0], and that is what decides here.
 *
 * A day that sold a little did not sell nothing, so anything non-zero is given
 * MIN_BAR_PX: against a month peaking in the millions a few thousand would
 * otherwise round to nothing and read as an empty day. It grows from the
 * baseline end, so the bar keeps the edge it is measured from.
 *
 * The radius is then clamped to the bar's own half-height, because a 4px corner
 * on a 2px bar rounds into a capsule and reads as a curve rather than a value.
 */
const ClampedBar = (props) => {
  const { radius, width, height, y, value } = props;

  const own = Array.isArray(value)
    ? (Number(value[1]) || 0) - (Number(value[0]) || 0)
    : Number(value) || 0;
  if (!own) return null;

  let h = Math.abs(Number(height) || 0);
  let top = Number(y) || 0;
  if (h < MIN_BAR_PX) {
    // Keep the baseline edge: upward bars grow up, downward bars grow down.
    if (own >= 0) top = top + h - MIN_BAR_PX;
    h = MIN_BAR_PX;
  }

  const corners = Array.isArray(radius)
    ? radius
    : [radius || 0, radius || 0, radius || 0, radius || 0];
  const cap = Math.max(0, Math.min(h / 2, Math.abs(Number(width) || 0) / 2));

  return <Rectangle {...props} y={top} height={h} radius={corners.map((v) => Math.min(v || 0, cap))} />;
};

const isNum = (n) => typeof n === "number" && Number.isFinite(n);

const num = (v) => {
  if (isNum(v)) return v;
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pick = (obj, keys) => {
  for (const k of keys) if (obj?.[k] !== undefined && obj?.[k] !== null) return obj[k];
  return undefined;
};

const VALUE_KEYS = ["value", "Value", "total", "Total", "Incentive", "amount", "qty", "quantity"];
const NAME_KEYS = ["name", "Name", "department", "Department", "Team", "team", "hq", "HQ"];

/**
 * The measures - Sales / Returns / Offers - carried either as a `series` object
 * or as plain keys. Read the same way for a day and for one department within
 * that day, so that filtering to a measure can follow all the way down into the
 * breakdown instead of stopping at the headline.
 */
const readMeasures = (o) => {
  const bag = pick(o, ["series", "Series", "measures", "Measures"]);
  const measures = {};
  if (bag && typeof bag === "object" && !Array.isArray(bag)) {
    Object.entries(bag).forEach(([k, v]) => {
      const n = num(v);
      if (n !== null) measures[k] = n;
    });
  } else {
    [
      ["Sales", ["sales", "Sales", "sale", "primary", "Primary"]],
      ["Returns", ["returns", "Returns", "credit", "Credit", "creditNote", "credit_note"]],
      ["Offers", ["offers", "Offers", "offer", "Offer"]],
    ].forEach(([label, keys]) => {
      const n = num(pick(o, keys));
      if (n !== null) measures[label] = n;
    });
  }
  return measures;
};

/** Normalise one point, whatever the API called its fields. */
const readPoint = (p) => {
  const raw = pick(p, ["date", "Date", "day", "Day", "label", "Label", "name"]);
  const value = num(pick(p, VALUE_KEYS));
  const list = pick(p, ["breakdown", "Breakdown", "departments", "Departments", "items", "teams", "data"]);
  const breakdown = Array.isArray(list)
    ? list
        .map((d) => ({
          name: String(pick(d, NAME_KEYS) ?? ""),
          value: num(pick(d, VALUE_KEYS)),
          measures: readMeasures(d),
        }))
        .filter((d) => d.name || d.value !== null)
    : [];

  return { raw, value, breakdown, measures: readMeasures(p) };
};

const shortDate = (raw, locale) => {
  if (raw === undefined || raw === null) return "";
  const s = String(raw);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
};

const longDate = (raw, locale) => {
  if (raw === undefined || raw === null) return "";
  const s = String(raw);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
};

/**
 * The department series for the stacked form: every name that appears, ordered
 * by how much it carries, the top six keeping a hue of their own and the rest
 * folded into a single "Other" — a generated 7th hue would be a colour nobody
 * can name.
 */
const buildSeries = (rows) => {
  const totals = new Map();
  rows.forEach((d) =>
    d.breakdown.forEach((r) => totals.set(r.name, (totals.get(r.name) || 0) + Math.abs(r.value || 0)))
  );
  const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const named = ordered.slice(0, MAX_SERIES);
  const rest = new Set(ordered.slice(MAX_SERIES));
  const series = named.map((name, i) => ({ name, color: SERIES_COLORS[i] }));
  if (rest.size) series.push({ name: OTHER, color: OTHER_COLOR });
  return { series, rest };
};

/* -------------------------------------------------------------------------- */
/* styles — the chrome around the plot, and the tooltip                        */
/* -------------------------------------------------------------------------- */

const CSS = `
.tr { position: relative; width: 100%; box-sizing: border-box; }
.tr *, .tr *::before, .tr *::after { box-sizing: border-box; }

.tr__head { display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px; margin-bottom: 8px; }
.tr__title { font-size: 11px; font-weight: 700; letter-spacing: .07em;
  text-transform: uppercase; color: #64748b; }
.tr__range { font-size: 11.5px; color: #94a3b8; font-variant-numeric: tabular-nums; }

.tr__plot { width: 100%; }
/* curves are geometry, not glyphs - render them precisely rather than snapped */
.tr__plot svg { shape-rendering: geometricPrecision; }
.tr__plot .recharts-surface { overflow: visible; }
.tr .recharts-cartesian-axis-tick text { fill: #94a3b8; font-size: 10.5px; }
.tr .recharts-cartesian-grid line { stroke: #eef2f7; }
.tr .recharts-tooltip-cursor { fill: rgba(15,23,42,.05); }

/* ---- small multiples: one measure per row, each on its own scale ---- */
.tr__multiple + .tr__multiple { margin-top: 8px; }
.tr__multipleHead { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.tr__multipleName { font-size: 11px; font-weight: 600; color: #475569; }
.tr__multipleAxis { display: flex; justify-content: space-between; margin-top: 4px;
  font-size: 10.5px; color: #94a3b8; }

/* ---- legend (identity is never colour alone) ---- */
.tr__legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; }
.tr__legendItem { display: flex; align-items: center; gap: 6px; font-size: 11px;
  color: #475569; min-width: 0; }
.tr__swatch { width: 9px; height: 9px; border-radius: 2px; flex: 0 0 auto; }
.tr__legendName { overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 190px; }
.tr__legendValue { font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
/* The measures legend doubles as the filter, so it is a real button: reachable
   by keyboard, and it says which measure is isolated rather than only showing
   it. The department legend of a stacked chart stays a plain key. */
.tr__legendItem[data-interactive="true"] { cursor: pointer; border: 0; background: none;
  font-family: inherit; font-size: 11px; color: #475569; text-align: left;
  padding: 3px 7px; margin: -3px -7px; border-radius: 7px;
  transition: background .12s ease, opacity .12s ease; }
.tr__legendItem[data-interactive="true"]:hover { background: #f1f5f9; }
.tr__legendItem[data-interactive="true"]:focus-visible { outline: 2px solid #2a78d6;
  outline-offset: 1px; }
.tr__legendItem[data-dim="true"] { opacity: .4; }

/* ---- tooltip ---- */
.tr__tip { min-width: 170px; max-width: 270px; padding: 9px 10px; border-radius: 8px;
  background: #0f172a; color: #e2e8f0; box-shadow: 0 6px 20px rgba(15,23,42,.22); }
/* The tooltip is portalled to <body> and placed against the pointer in viewport
   coordinates. Fixed rather than absolute for three reasons at once: it is
   clipped by no ancestor, it outranks whatever card comes next, and a fixed box
   is outside the document's scrollable overflow, so a tall tooltip can no
   longer stretch the page the way the old transform-shifted one did. */
.tr__tipLayer { position: fixed; z-index: 2147483000; pointer-events: none;
  max-width: min(300px, calc(100vw - 16px)); }
.tr__tipLayer[data-y="above"] { transform: translateY(calc(-100% - 18px)); }
.tr__tipLayer[data-y="below"] { transform: translateY(18px); }
.tr__tipLayer[data-x="center"] { translate: -50%; }
.tr__tipLayer[data-x="end"] { translate: -100%; }
.tr__tipDate { font-size: 11px; color: #94a3b8; }
.tr__tipTotal { margin-top: 2px; font-size: 14px; font-weight: 700; color: #fff;
  font-variant-numeric: tabular-nums; }
.tr__tipRows { margin-top: 8px; display: grid; gap: 4px;
  border-top: 1px solid rgba(255,255,255,.12); padding-top: 7px; }
.tr__tipRow { display: flex; align-items: baseline; gap: 8px; font-size: 11.5px; }
.tr__tipSwatch { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 auto;
  align-self: center; }
.tr__tipName { flex: 1 1 auto; color: #cbd5e1; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.tr__tipValue { flex: 0 0 auto; font-weight: 600; color: #fff;
  font-variant-numeric: tabular-nums; }
.tr__tipMore { font-size: 11px; color: #94a3b8; }
.tr__tipCaption { font-size: 10px; font-weight: 700; letter-spacing: .06em;
  text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
`;

/* Where the pointer is, in viewport coordinates. The portalled tooltip is no
   longer inside the chart, so it cannot be placed from recharts' chart-relative
   coordinate - it is placed against the cursor instead. Module-level because
   every chart on the page wants the same one value. */
const POINTER = { x: 0, y: 0 };

function useStyles() {
  React.useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!document.getElementById(STYLE_ID)) {
      const el = document.createElement("style");
      el.id = STYLE_ID;
      el.textContent = CSS;
      document.head.appendChild(el);
    }
    const onMove = (e) => {
      POINTER.x = e.clientX;
      POINTER.y = e.clientY;
    };
    window.addEventListener("pointermove", onMove, { passive: true, capture: true });
    return () => window.removeEventListener("pointermove", onMove, { capture: true });
  }, []);
}

/* -------------------------------------------------------------------------- */

/** The day's total on top, then the departments behind it, biggest first. */
function TrendTooltip({ active, payload, locale, formatValue, maxRows, colorOf, measures, tipAbove, only }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  /* With a measure isolated in the legend, the whole tooltip is about that
     measure: the headline is its figure for the day and the departments are its
     split, not the day's overall one. Showing Offers on the chart while the
     rows underneath still added up to Sales was the tooltip disagreeing with
     the chart it belongs to. */
  const headline = only ? point.measures?.[only] ?? null : point.value;

  // Unfiltered, the day is told as two stories: what it was made of (Sales /
  // Returns / Offers), then who made it. Filtered, the first story is already
  // the headline, so it is not repeated.
  const measureRows =
    !only && measures
      ? measures
          .map((m) => ({ name: m.name, value: point.measures?.[m.name] ?? null }))
          .filter((r) => r.value !== null)
      : [];

  const deptRows = (point.breakdown || [])
    .map((r) => ({
      name: r.name,
      value: only ? r.measures?.[only] ?? null : r.value,
    }))
    .filter((r) => r.value !== null)
    .sort((a, b) => Math.abs(b.value || 0) - Math.abs(a.value || 0));

  const deptCaption = only
    ? `${only} by department`
    : measureRows.length
      ? "By department"
      : null;

  const body = (
    <div className="tr__tip">
      <div className="tr__tipDate">{longDate(point.raw, locale)}</div>
      <div className="tr__tipTotal">
        {headline === null || headline === undefined ? "No data" : formatValue(headline)}
      </div>
      {measureRows.length ? (
        <div className="tr__tipRows">
          {measureRows.map((row, j) => (
            <div className="tr__tipRow" key={`m-${row.name}-${j}`}>
              {colorOf ? (
                <span className="tr__tipSwatch" style={{ background: colorOf(row.name) }} />
              ) : null}
              <span className="tr__tipName">{row.name}</span>
              <span className="tr__tipValue">{formatValue(row.value)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {deptRows.length ? (
        <div className="tr__tipRows">
          {deptCaption ? <div className="tr__tipCaption">{deptCaption}</div> : null}
          {deptRows.slice(0, maxRows).map((row, j) => (
            <div className="tr__tipRow" key={`d-${row.name}-${j}`}>
              {/* Departments are only colour-coded when they ARE the series;
                  under a measure they share that measure's one colour, so a
                  swatch per row would say nothing. */}
              {colorOf && !measureRows.length && !only ? (
                <span className="tr__tipSwatch" style={{ background: colorOf(row.name) }} />
              ) : null}
              <span className="tr__tipName">{row.name}</span>
              <span className="tr__tipValue">
                {row.value === null ? "—" : formatValue(row.value)}
              </span>
            </div>
          ))}
          {deptRows.length > maxRows ? (
            <div className="tr__tipMore">+{deptRows.length - maxRows} more</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  // Rendered in place on the server; in the browser it goes to <body>, where no
  // card can clip it and nothing painted later can cover it.
  if (typeof document === "undefined" || typeof window === "undefined") return body;

  const pad = 12;
  const { x, y } = POINTER;
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  // Above the cursor by default - it keeps the tooltip off the row it describes
  // - but near the top of the screen there is no room, and a tooltip running off
  // the top is worse than one sitting under the cursor.
  const placeY = tipAbove !== false && y > vh * 0.38 ? "above" : "below";
  // Centred on the cursor, except near an edge, where it anchors to that edge
  // instead of hanging off the screen.
  const placeX = x < 170 ? "start" : x > vw - 170 ? "end" : "center";

  return createPortal(
    <div
      className="tr__tipLayer"
      data-x={placeX}
      data-y={placeY}
      style={{ left: Math.min(Math.max(x, pad), Math.max(vw - pad, pad)), top: y }}
    >
      {body}
    </div>,
    document.body
  );
}

export default function TrendChart({
  points,
  type = "wave",
  title = "Daily trend",
  accent = "#334155",
  negativeColor = "#dc2626",
  height = 84,
  locale = "en-IN",
  formatValue = (v) => String(v),
  maxRows = 6,
  tipAbove = false,
}) {
  useStyles();
  const gradientId = React.useId().replace(/:/g, "");

  const rows = React.useMemo(
    () => (Array.isArray(points) ? points.map(readPoint) : []),
    [points]
  );

  // Measures win over departments: if the days carry Sales / Returns / Offers,
  // those are the lines, and the department split stays in the tooltip.
  const measures = React.useMemo(() => {
    const names = new Set();
    rows.forEach((d) => Object.keys(d.measures || {}).forEach((k) => names.add(k)));
    const known = MEASURE_ORDER.filter((m) => names.has(m));
    const extra = [...names].filter((n) => !MEASURE_ORDER.includes(n));
    return [...known, ...extra].map((name, i) => ({
      name,
      color: MEASURE_COLORS[measureKind(name)] || SERIES_COLORS[i % SERIES_COLORS.length],
    }));
  }, [rows]);
  const multi = measures.length > 1;

  const { series, rest } = React.useMemo(
    () => (type === "stacked" && !multi ? buildSeries(rows) : { series: [], rest: new Set() }),
    [rows, type, multi]
  );

  // recharts wants one flat object per row, so each department becomes a key on
  // the day it belongs to; `breakdown` rides along for the tooltip.
  const data = React.useMemo(
    () =>
      rows.map((d) => {
        const flat = {
          raw: d.raw,
          label: shortDate(d.raw, locale),
          value: d.value,
          breakdown: d.breakdown,
          measures: d.measures,
        };
        /* Plotted as magnitudes. Returns and credits arrive negative because
           they are deductions, and drawn as-is they hang below the baseline,
           which makes the chart about sign rather than size and squashes every
           other series into the top half. The bar says how much; the label
           says which way. The tooltip keeps the real signed figure, so nothing
           is hidden - only the direction is normalised. */
        if (multi) measures.forEach((m) => (flat[m.name] = Math.abs(d.measures?.[m.name] ?? 0)));
        if (type === "stacked" && !multi) {
          series.forEach((s) => (flat[s.name] = 0));
          d.breakdown.forEach((r) => {
            const key = rest.has(r.name) ? OTHER : r.name;
            if (key in flat) flat[key] += Math.abs(r.value || 0);
          });
        }
        return flat;
      }),
    [rows, series, rest, type, locale, multi, measures]
  );

  // Nothing to plot is not an empty chart - it is no chart.
  if (!rows.some((d) => d.value !== null)) return null;

  // Measures and stacked departments are plotted as magnitudes now, so only the
  // single headline series can still cross the baseline.
  const hasNegative = !multi && type !== "stacked" && rows.some((d) => (d.value || 0) < 0);
  const legendItems = multi ? measures : type === "stacked" ? series : [];

  /* Clicking a measure in the legend isolates it; clicking it again brings the
     others back. Only the measures legend is interactive - the department
     legend of a stacked chart is a key, not a control. The isolated name is
     kept rather than a list of hidden ones so that a click always means the
     same thing: "show me this one". */
  const [only, setOnly] = React.useState(null);
  const shown = only ? measures.filter((m) => m.name === only) : measures;

  /* The legend carries each measure's total for the period, so the numbers are
     readable without hovering a single day. */
  const measureTotals = React.useMemo(() => {
    const t = {};
    measures.forEach((m) => {
      t[m.name] = rows.reduce((sum, d) => sum + (d.measures?.[m.name] ?? 0), 0);
    });
    return t;
  }, [measures, rows]);

  /* A measure that disappears from the data should not stay latched as the
     filter, or the chart would render empty with no way back. */
  React.useEffect(() => {
    if (only && !measures.some((m) => m.name === only)) setOnly(null);
  }, [measures, only]);
  const colorOf = legendItems.length
    ? (name) =>
        (legendItems.find((s) => s.name === name) ||
          legendItems.find((s) => s.name === OTHER) ||
          {}).color
    : null;

  const tooltip = (
    <Tooltip
      cursor={{ fill: "rgba(15,23,42,.05)" }}
      wrapperStyle={{ outline: "none" }}
      content={
        <TrendTooltip
          locale={locale}
          formatValue={formatValue}
          maxRows={maxRows}
          colorOf={colorOf}
          measures={multi ? shown : null}
          only={only}
          tipAbove={tipAbove}
        />
      }
    />
  );

  // Only the ends and the middle carry a date, so the axis stays recessive.
  const tickAt = new Set([0, Math.floor(data.length / 2), data.length - 1]);
  const axis = (
    <XAxis
      dataKey="label"
      axisLine={false}
      tickLine={false}
      interval={0}
      tickMargin={6}
      tick={({ x, y, payload, index }) =>
        tickAt.has(index) ? (
          <text
            x={x}
            y={y + 10}
            textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
            fill="#94a3b8"
            fontSize={10.5}
          >
            {payload.value}
          </text>
        ) : (
          <g />
        )
      }
    />
  );

  /* One legend, used by both the single plot and the small multiples - it is
     the only way back once a measure has been isolated, so every layout that
     can filter has to render it. */
  const legend =
    legendItems.length > 1 ? (
      <div className="tr__legend">
        {legendItems.map((item) =>
          multi ? (
            <button
              type="button"
              className="tr__legendItem"
              key={item.name}
              data-interactive="true"
              data-dim={!only || only === item.name ? undefined : "true"}
              aria-pressed={only === item.name}
              onClick={(e) => {
                // The card underneath is clickable; isolating a measure is not
                // also a request to open or close it.
                e.stopPropagation();
                setOnly((v) => (v === item.name ? null : item.name));
              }}
            >
              <span className="tr__swatch" style={{ background: item.color }} />
              <span className="tr__legendName">{item.name}</span>
              <span className="tr__legendValue">{formatValue(measureTotals[item.name])}</span>
            </button>
          ) : (
            /* A stacked chart's department legend is a key, not a control. */
            <span className="tr__legendItem" key={item.name}>
              <span className="tr__swatch" style={{ background: item.color }} />
              <span className="tr__legendName">{item.name}</span>
            </span>
          )
        )}
      </div>
    ) : null;

  const common = {
    data,
    margin: { top: 6, right: 2, bottom: 0, left: 2 },
  };

  /**
   * Sales is an order of magnitude bigger than Returns and Offers, so on one
   * scale the small two flatten into straight lines - which is exactly what
   * "the chart is not clear" looks like. Small multiples give each measure its
   * own scale and keep the shared day axis, which is the honest fix; a second
   * y-axis would be the dishonest one.
   */
  if (multi && type === "multiples") {
    return (
      <div className={tipAbove ? "tr tr--tipAbove" : "tr"}>
        <div className="tr__head">
          <span className="tr__title">{title}</span>
          <span className="tr__range">
            {shortDate(rows[0]?.raw, locale)} – {shortDate(rows[rows.length - 1]?.raw, locale)}
          </span>
        </div>

        {shown.map((m, mi) => (
          <div className="tr__multiple" key={m.name}>
            <div className="tr__multipleHead">
              <span className="tr__swatch" style={{ background: m.color }} />
              <span className="tr__multipleName">{m.name}</span>
            </div>
            <div className="tr__plot" style={{ height: Math.max(46, Math.round(height / 1.6)) }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                  <XAxis dataKey="label" hide />
                  <YAxis hide domain={["auto", "auto"]} />
                  <ReferenceLine y={0} stroke="#eef2f7" />
                  <Tooltip
                    cursor={{ stroke: "rgba(15,23,42,.18)", strokeWidth: 1 }}
                    wrapperStyle={{ outline: "none" }}
                    content={
                      <TrendTooltip
                        locale={locale}
                        formatValue={formatValue}
                        maxRows={maxRows}
                        colorOf={colorOf}
                        measures={shown}
                        only={only}
                        tipAbove={tipAbove}
                      />
                    }
                  />
                  <Area
                    type="natural"
                    dataKey={m.name}
                    stroke={m.color}
                    strokeWidth={2}
                    fill={m.color}
                    fillOpacity={0.12}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {mi === shown.length - 1 ? (
              <div className="tr__multipleAxis">
                <span>{shortDate(rows[0]?.raw, locale)}</span>
                <span>{shortDate(rows[rows.length - 1]?.raw, locale)}</span>
              </div>
            ) : null}
          </div>
        ))}
        {legend}
      </div>
    );
  }

  return (
    <div className={tipAbove ? "tr tr--tipAbove" : "tr"}>
      <div className="tr__head">
        <span className="tr__title">{title}</span>
        <span className="tr__range">
          {shortDate(rows[0]?.raw, locale)} – {shortDate(rows[rows.length - 1]?.raw, locale)}
        </span>
      </div>

      <div
        className="tr__plot"
        style={{ height: (multi ? Math.max(120, Math.round(height * 1.35)) : height) + 22 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart {...common}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
                <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {type === "stacked" || multi ? <CartesianGrid vertical={false} strokeDasharray="0" /> : null}
            {axis}
            <YAxis hide domain={["auto", "auto"]} />
            {hasNegative ? <ReferenceLine y={0} stroke="#e2e8f0" /> : null}
            {tooltip}

            {!multi && type === "wave" ? (
              <Area
                type="natural"
                dataKey="value"
                stroke={accent}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                activeDot={{ r: 4.5, strokeWidth: 2, stroke: "#fff" }}
                dot={false}
                isAnimationActive={false}
              />
            ) : null}

            {!multi && type === "line" ? (
              <Line
                type="natural"
                dataKey="value"
                stroke={accent}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4.5, strokeWidth: 2, stroke: "#fff" }}
                isAnimationActive={false}
              />
            ) : null}

            {!multi && type === "bars" ? (
              <Bar
                dataKey="value"
                radius={[4, 4, 0, 0]}
                shape={<ClampedBar />}
                isAnimationActive={false}
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={(d.value || 0) < 0 ? negativeColor : accent} />
                ))}
              </Bar>
            ) : null}

            {!multi && type === "lollipop" ? (
              <>
                <Bar dataKey="value" barSize={1.5} shape={<ClampedBar />} isAnimationActive={false}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={(d.value || 0) < 0 ? negativeColor : accent} fillOpacity={0.4} />
                  ))}
                </Bar>
                <Scatter dataKey="value" isAnimationActive={false}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={(d.value || 0) < 0 ? negativeColor : accent} />
                  ))}
                </Scatter>
              </>
            ) : null}

            {type === "stacked" && !multi
              ? series.map((s, i) => (
                  <Bar
                    key={s.name}
                    dataKey={s.name}
                    stackId="day"
                    fill={s.color}
                    shape={<ClampedBar />}
                    isAnimationActive={false}
                    radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                    // a hairline of the surface between segments, so touching
                    // colours read as two bands rather than one muddled block
                    stroke="#fff"
                    strokeWidth={1}
                  />
                ))
              : null}

            {multi && type === "wave"
              ? shown.map((m) => (
                  <Area
                    key={m.name}
                    type="natural"
                    dataKey={m.name}
                    stroke={m.color}
                    strokeWidth={2}
                    fill={m.color}
                    fillOpacity={0.12}
                    dot={false}
                    activeDot={{ r: 4.5, strokeWidth: 2, stroke: "#fff" }}
                    isAnimationActive={false}
                  />
                ))
              : null}

            {multi && type === "line"
              ? shown.map((m) => (
                  <Line
                    key={m.name}
                    type="natural"
                    dataKey={m.name}
                    stroke={m.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4.5, strokeWidth: 2, stroke: "#fff" }}
                    isAnimationActive={false}
                  />
                ))
              : null}

            {multi && (type === "bars" || type === "lollipop")
              ? shown.map((m) => (
                  <Bar
                    key={m.name}
                    dataKey={m.name}
                    fill={m.color}
                    radius={[3, 3, 0, 0]}
                    shape={<ClampedBar />}
                    isAnimationActive={false}
                  />
                ))
              : null}

            {multi && type === "stacked"
              ? shown.map((m, i) => (
                  <Bar
                    key={m.name}
                    dataKey={m.name}
                    stackId="day"
                    fill={m.color}
                    shape={<ClampedBar />}
                    isAnimationActive={false}
                    radius={i === shown.length - 1 ? [4, 4, 0, 0] : 0}
                    stroke="#fff"
                    strokeWidth={1}
                  />
                ))
              : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {legend}
    </div>
  );
}
