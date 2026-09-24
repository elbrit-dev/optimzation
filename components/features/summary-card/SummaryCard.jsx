import React from "react";
import { Trophy } from "lucide-react";
import TeamCard from "./TeamCard";
import TrendChart from "./TrendChart";

/**
 * SummaryCard — one click-to-open achievement card for the incentive dashboard.
 *
 * Two ways to use it, and only one switch between them:
 *
 *   Total card      -> total = true,  data = the whole Total Summary object.
 *                      There is no level under a total, so `hq` is ignored.
 *   Dept / HQ card  -> total = false, data = the department (or HQ) object and
 *                      `hq` = its HQ array. Pass no `hq` and it is simply a
 *                      standalone HQ card.
 *
 * Every level arrives in the same shape, so the same card renders all of them:
 *
 *   { Name (or hq), Target (number, or { value, month } at HQ level), color,
 *     Incentive, Model: [{ Name, tot_title, Total, data: [{ Title, Values }] }] }
 *
 * Collapsed, a card shows the title, the progress bar (Incentive over Target),
 * the incentive figure and the target. Click anywhere on it and the `Model`
 * breakdown opens — Sales / Returns / Offers, which are fixed boxes: they always
 * show their metrics and their total, and they never fold on their own. On a
 * department, opening also reveals its HQ cards; each of those opens on its own
 * click without collapsing the department around it.
 *
 * Every open/close reports through `onToggle`, saying which card it was:
 *
 *   onToggle(open, level, department, hq, node)
 *
 *   level      "total" | "department" | "hq"
 *   department the department name, or null on a total card
 *   hq         the HQ name, or null unless the card is an HQ card
 *   node       the card object that was clicked
 *
 * So HQ-Chennai opened inside its department reports both names, the department
 * card itself reports the department with hq null, and a total card reports
 * neither — each level passes exactly what it knows.
 *
 * The three boxes are interactive in their own right, through one handler each:
 *
 *   onSalesClick(level, department, hq, section, node)
 *   onReturnsClick(level, department, hq, section, node)
 *   onOffersClick(level, department, hq, section, node)
 *
 * `section` is that box's Model entry ({ Name, tot_title, Total, data }), `node`
 * the card it belongs to — so the Returns box of HQ-Chennai reports the
 * department, HQ-Chennai and the Returns figures together. A box is only
 * clickable when its handler was given; the click never reaches the card, so it
 * cannot collapse it. Boxes are matched by kind rather than by position, so the
 * order inside `Model` doesn't matter.
 */

const STYLE_ID = "esw-summary-card-styles";

/* Field names as the dashboard API sends them. Kept here rather than as props:
   they are the contract, not a per-instance choice. */
const K = {
  title: "Name",
  altTitle: "hq",
  target: "Target",
  value: "Incentive",
  color: "color",
  sections: "Model",
  children: "HQ",
  sectionName: "Name",
  sectionTotal: "Total",
  sectionTotalTitle: "tot_title",
  metrics: "data",
  metricTitle: "Title",
  metricValue: "Values",
};

const LOCALE = "en-US";
const DECIMALS = 2; // on money figures
const PCT_DECIMALS = 2; // on the (x%) share under each figure

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

const isNum = (n) => typeof n === "number" && Number.isFinite(n);

const toNum = (v) => (isNum(v) ? v : Number(v) || 0);

/** Target is a plain number at total/department level, but { value, month } at HQ level. */
const readTarget = (raw) => {
  if (isNum(raw)) return raw;
  if (raw && typeof raw === "object") return toNum(raw.value ?? raw.Value ?? raw.target);
  return toNum(raw);
};

/** Share of target, in %. Guarded so an absent/zero target never yields NaN or Infinity. */
const pctOf = (value, target) => (target ? (toNum(value) / target) * 100 : 0);

const fmtNumber = (v, decimals) =>
  toNum(v).toLocaleString(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: decimals });

const fmtPct = (p, decimals) => `${p.toFixed(decimals)}%`;

/**
 * Tone of a Model section: Sales reads green, Returns red, Offers neutral.
 * Driven by the section name so the order inside `Model` doesn't matter — the
 * index is only a fallback for a name we don't recognise.
 */
const toneOf = (name, index) => {
  const n = String(name || "").toLowerCase();
  if (/return|credit|expiry|breakage/.test(n)) return "neg";
  if (/offer|claim|scheme|discount/.test(n)) return "neutral";
  if (/sale|primary|secondary|net|gross/.test(n)) return "pos";
  return ["pos", "neg", "neutral"][index] || "neutral";
};

const asArray = (v) => (Array.isArray(v) && v.length ? v : null);

/** The secondary variant's payload arrives wrapped as { data, Team }. */
const unwrapTeam = (v) => (v && typeof v === "object" && v.data ? v.data : v);

/* One colour per department, picked from this palette by a hash of its name, so
   a department keeps the same colour between renders and between pages, and two
   departments next to each other are never the same. */
const PALETTE = [
  "#2563eb", "#16a34a", "#d946ef", "#f59e0b", "#0891b2",
  "#7c3aed", "#e11d48", "#65a30d", "#ea580c", "#0d9488",
];

const paletteFor = (name) => {
  const text = String(name || "");
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
};

/** The border is the accent at low opacity — present, but not shouting. */
const dim = (color, alpha) => {
  const hex = String(color || "").trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex || "#e5e7eb";
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/* -------------------------------------------------------------------------- */
/* styles                                                                     */
/* -------------------------------------------------------------------------- */

const CSS = `
.esc-root { display: flex; flex-direction: column; gap: var(--esc-gap, 10px); width: 100%;
  font-family: inherit; color: #111827; box-sizing: border-box; }
.esc-root *, .esc-root *::before, .esc-root *::after { box-sizing: border-box; }

/* ---- card shell ---- */
/* Each card sizes itself off ITS OWN width, not the viewport's: the same card
   has to work full-bleed, in a narrow dashboard column, and nested inside a
   department, and only a container query can tell those apart. */
.esc-card { position: relative; width: 100%; background: #fff;
  border: 1px solid var(--esc-border, #e5e7eb); border-radius: 12px;
  padding: 20px 20px 18px; transition: box-shadow .18s ease;
  container-type: inline-size; container-name: esc; }
.esc-card[data-open="true"] { box-shadow: 0 1px 3px rgba(16,24,40,.08); }
.esc-card[data-clickable="true"] { cursor: pointer; }
.esc-card[data-clickable="true"]:hover { box-shadow: 0 2px 10px rgba(16,24,40,.10); }
.esc-card:focus-visible { outline: 2px solid var(--esc-accent, #2798F5); outline-offset: 2px; }

/* fieldset-style label sitting on the card's top border */
.esc-card__legend { position: absolute; top: -9px; left: 22px; padding: 0 7px;
  background: #fff; font-size: clamp(11px, 0.95cqi, 13px); font-weight: 600; line-height: 18px;
  color: #374151; max-width: calc(100% - 56px); overflow: hidden;
  white-space: nowrap; text-overflow: ellipsis; }

.esc-card__head { display: flex; align-items: center; gap: 10px; }
.esc-card__title { margin: 0; font-size: clamp(20px, 2.3cqi, 25px); font-weight: 700;
  line-height: 1.25; letter-spacing: -.01em; flex: 1 1 auto; min-width: 0; }

/* ---- progress ---- */
.esc-progress { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
.esc-progress__track { flex: 1 1 auto; height: 12px; border-radius: 999px;
  background: #e5e7eb; overflow: hidden; }
.esc-progress__fill { height: 100%; border-radius: 999px; background: #16a34a;
  transition: width .45s cubic-bezier(.22,.61,.36,1); }
.esc-progress__fill[data-neg="true"] { background: #dc2626; }
.esc-progress__pct { flex: 0 0 auto; font-size: clamp(13px, 1.15cqi, 15px); font-weight: 600;
  color: #374151; font-variant-numeric: tabular-nums; }
.esc-progress__trophy { flex: 0 0 auto; color: #eab308; }

/* ---- headline figures ---- */
.esc-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-top: 16px; }
.esc-kpi { display: flex; align-items: center; gap: 10px; font-size: clamp(16px, 1.75cqi, 18px);
  min-width: 0; }
.esc-kpi__label, .esc-kpi__num { white-space: nowrap; }
/* On a very narrow card the label is what gives way - the figure itself stays
   whole, and the two stay on one line. */
.esc-kpi__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.esc-kpi__num { flex: 0 0 auto; }
.esc-kpi__dot { flex: 0 0 auto; width: 12px; height: 12px; border-radius: 50%; }
.esc-kpi__dot[data-kind="value"] { background: #16a34a; }
.esc-kpi__dot[data-kind="target"] { background: #d1d5db; }
.esc-kpi__label { color: #374151; }
.esc-kpi__num { font-weight: 600; font-variant-numeric: tabular-nums; }

/* ---- opening ----
   The body used to animate its height (grid-template-rows 0fr -> 1fr). That
   animates a LAYOUT property: every frame relays the card out, and the last
   frame lands on a fractional height that snaps to a whole pixel - which is the
   flicker at the end of the open. Opening is instant now, and only opacity and
   a 2px lift animate. Both are composited, so nothing relays out mid-animation
   and there is no final snap. */
.esc-body { display: none; }
.esc-body[data-open="true"] { display: block; animation: esc-in .18s ease-out both; }
.esc-body__inner { min-height: 0; }

/* Nested HQ cards mount when their department opens - give them the same
   entrance so they arrive with the Model boxes instead of popping in. */
.esc-card[data-depth="1"] { animation: esc-in .18s ease-out both; }

@keyframes esc-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ---- Model sections ---- */
.esc-sections { display: grid; gap: 14px 12px; margin-top: 16px;
  grid-template-columns: repeat(var(--esc-cols, 3), minmax(0, 1fr)); }
.esc-section { position: relative; border: 1px solid #d1d5db; border-radius: 8px;
  padding: 14px 12px 10px; min-width: 0; transition: background .15s ease; }
.esc-section[data-clickable="true"] { cursor: pointer; }
.esc-section[data-clickable="true"]:hover { background: #fafafa; }
.esc-section[data-clickable="true"]:focus-visible { outline: 2px solid currentColor;
  outline-offset: 2px; }

.esc-section[data-tone="pos"] { border-color: #16a34a; }
.esc-section[data-tone="neg"] { border-color: #dc2626; }
.esc-section[data-tone="neutral"] { border-color: #111827; }
.esc-section__legend { position: absolute; top: -9px; left: 16px; padding: 0 7px;
  background: #fff; font-size: clamp(12px, 1.05cqi, 14px); font-weight: 700; line-height: 18px;
  color: #111827; }
.esc-section__grid { display: grid; gap: 8px 10px;
  grid-template-columns: repeat(var(--esc-metrics, 3), minmax(0, 1fr)); }
.esc-metric { min-width: 0; }
/* cqi = 1% of the card's width, so three figures stay on one line as the card
   narrows instead of wrapping into the ragged two-row block. */
.esc-metric__label { font-size: clamp(13px, 1.3cqi, 15px); font-weight: 700; color: #111827; }
.esc-metric__value { font-size: clamp(13px, 1.3cqi, 15px); font-weight: 600;
  font-variant-numeric: tabular-nums; white-space: nowrap; }
.esc-metric__pct { font-size: clamp(11px, 1cqi, 12px); color: #6b7280;
  font-variant-numeric: tabular-nums; }
.esc-section__total { margin-top: 10px; font-size: clamp(13px, 1.2cqi, 15px); color: #111827; }
.esc-section__total b { font-weight: 700; font-variant-numeric: tabular-nums; }
.esc-section__total small { font-size: clamp(11px, 0.95cqi, 12.5px); color: #6b7280;
  margin-left: 4px; }

/* figures follow their section, so a negative number inside Sales still reads green */
.esc-section[data-tone="pos"] .esc-metric__value,
.esc-section[data-tone="pos"] .esc-section__total b { color: #16a34a; }
.esc-section[data-tone="neg"] .esc-metric__value,
.esc-section[data-tone="neg"] .esc-section__total b { color: #dc2626; }
.esc-section[data-tone="neutral"] .esc-metric__value,
.esc-section[data-tone="neutral"] .esc-section__total b { color: #111827; }

/* ---- the day-wise trend strip ---- */
.esc-trend { margin-top: 16px; }
.esc-trend + .esc-sections { margin-top: 18px; }

/* ---- responsive, by card width ---- */
/* The Model boxes step down 3 -> 2 -> 1 rather than falling straight from three
   to one. On the middle rung a third box would otherwise sit half-width beside
   an empty half, so the last box takes the whole row when it is the odd one
   out - :last-child:nth-child(odd) is exactly that condition, and it leaves a
   card with two or four boxes alone. */
@container esc (max-width: 940px) and (min-width: 621px) {
  .esc-sections { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .esc-section:last-child:nth-child(odd) { grid-column: 1 / -1; }
}
@container esc (max-width: 620px) {
  .esc-sections { grid-template-columns: minmax(0, 1fr); }
}

/* Too narrow for three boxes abreast: the type steps down with them, and each
   box has more width back, so its figures stay readable. */
@container esc (max-width: 940px) {
  .esc-card__title { font-size: 20px; }
  .esc-kpi { font-size: 16px; }
  .esc-metric__label, .esc-metric__value { font-size: 13px; }
  .esc-metric__pct { font-size: 11px; }
  .esc-section__total { font-size: 13px; }
  .esc-section__total small { font-size: 11px; }
  .esc-section__legend { font-size: 12px; }
  .esc-progress__pct { font-size: 13px; }
}
@container esc (max-width: 520px) {
  .esc-card__title { font-size: 16px; }
  .esc-kpis { gap: 6px 10px; margin-top: 11px; }
  .esc-kpi { gap: 6px; font-size: clamp(11.5px, 3.1cqi, 13.5px); }
  .esc-kpi__dot { width: 9px; height: 9px; }
  .esc-progress { margin-top: 12px; }
  .esc-progress__track { height: 9px; }
  .esc-metric__label, .esc-metric__value { font-size: clamp(11px, 3.2cqi, 13px); }
  .esc-section__total { font-size: clamp(11.5px, 3.1cqi, 13px); }
}
@container esc (max-width: 400px) {
  .esc-card__title { font-size: 15.5px; }
  .esc-kpi { gap: 4px; font-size: clamp(10.5px, 3.2cqi, 12px); }
  .esc-kpi__dot { width: 8px; height: 8px; }
  .esc-progress__track { height: 8px; }
  /* three figures no longer fit abreast here, so wrap them instead of clipping */
  .esc-section__grid { gap: 8px; grid-template-columns: repeat(auto-fit, minmax(86px, 1fr)); }
  .esc-metric__label, .esc-metric__value { font-size: clamp(10.5px, 3.6cqi, 12.5px); }
}

/* Phone viewports: trim the card's own chrome (padding is not a container thing). */
@media (max-width: 520px) {
  .esc-card { padding: 14px 12px 12px; border-radius: 10px; }
  .esc-sections { gap: 14px 10px; }
  .esc-progress__pct { font-size: 11.5px; }
}

/* Fallback for engines without container queries: fall back to the viewport. */
@supports not (container-type: inline-size) {
  @media (max-width: 860px) {
    .esc-sections { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .esc-section:last-child:nth-child(odd) { grid-column: 1 / -1; }
  }
  @media (max-width: 600px) {
    .esc-sections { grid-template-columns: minmax(0, 1fr); }
  }
  .esc-metric__label, .esc-metric__value { font-size: 13px; }
  .esc-metric__pct { font-size: 11px; }
}

@media (prefers-reduced-motion: reduce) {
  .esc-progress__fill, .esc-card { transition: none; }
  .esc-body[data-open="true"], .esc-card[data-depth="1"] { animation: none; }
}
`;

function useStyles() {
  React.useEffect(() => {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

/* -------------------------------------------------------------------------- */
/* pieces                                                                     */
/* -------------------------------------------------------------------------- */

function Metric({ item, target, currency }) {
  const value = toNum(item?.[K.metricValue]);
  return (
    <div className="esc-metric">
      <div className="esc-metric__label">{item?.[K.metricTitle]}</div>
      <div className="esc-metric__value">
        {currency ? `${currency} ` : ""}
        {fmtNumber(value, DECIMALS)}
      </div>
      <div className="esc-metric__pct">({fmtPct(pctOf(value, target), PCT_DECIMALS)})</div>
    </div>
  );
}

/**
 * A fixed box: it always shows its metrics and its total, and it never folds —
 * opening and closing is the card's job. It is clickable only when a handler was
 * given for it (Sales / Returns / Offers each have their own), and that click
 * stops here so it cannot reach the card behind it.
 */
function Section({ section, index, target, currency, tone, onSectionClick }) {
  const metrics = Array.isArray(section?.[K.metrics]) ? section[K.metrics] : [];
  const total = toNum(section?.[K.sectionTotal]);
  const totalTitle = section?.[K.sectionTotalTitle];

  const clickable = typeof onSectionClick === "function";

  const onClick = (e) => {
    if (!clickable) return;
    e.stopPropagation();
    onSectionClick(section);
  };
  const onKeyDown = (e) => {
    if (!clickable || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    e.stopPropagation();
    onSectionClick(section);
  };

  return (
    <div
      className="esc-section"
      data-tone={tone || toneOf(section?.[K.sectionName], index)}
      data-clickable={clickable ? "true" : "false"}
      style={{ "--esc-metrics": metrics.length || 1 }}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? onKeyDown : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <span className="esc-section__legend">{section?.[K.sectionName]}</span>

      <div className="esc-section__grid">
        {metrics.map((m, i) => (
          <Metric
            key={`${m?.[K.metricTitle] ?? "metric"}-${i}`}
            item={m}
            target={target}
            currency={currency}
          />
        ))}
      </div>

      {totalTitle != null && (
        <div className="esc-section__total">
          {totalTitle} <b>{fmtNumber(total, DECIMALS)}</b>
          <small>({fmtPct(pctOf(total, target), PCT_DECIMALS)})</small>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* one card — recursive, so a department renders its HQ cards with itself      */
/* -------------------------------------------------------------------------- */

function Card({ node, kids, currency, depth, parentLabel, startOpen, isTotal, onToggle, sectionHandlers, autoColor, parentAccent, trend, trendType }) {
  const title = node?.[K.title] ?? node?.[K.altTitle] ?? "";
  const target = readTarget(node?.[K.target]);
  const value = toNum(node?.[K.value]);
  const sections = Array.isArray(node?.[K.sections]) ? node[K.sections] : [];

  // An HQ inherits its department's colour, so a department and the HQ cards
  // that open under it read as one group.
  const accent =
    parentAccent || (autoColor ? paletteFor(title) : node?.[K.color]) || node?.[K.color] || "#94a3b8";

  const pct = pctOf(value, target);
  const barPct = Math.max(0, Math.min(100, pct));
  // The body holds the Model boxes only. `hasBody` is what makes the card a
  // control, and having HQ cards to reveal counts just as much as having a Model.
  const hasSections = sections.length > 0;
  const hasTrend = Array.isArray(trend) && trend.length > 0;
  const hasBody = hasSections || hasTrend || !!kids;

  // Who this card is, so every click it reports can be traced back to a row:
  // a total names neither, a department names itself, an HQ names both (its
  // department comes from the card it is nested in). A standalone HQ card has
  // no department above it, so that stays null.
  const level = isTotal ? "total" : node?.[K.altTitle] != null ? "hq" : "department";
  const department = level === "hq" ? parentLabel || null : level === "department" ? title : null;
  const hqName = level === "hq" ? title : null;

  const fire = (isOpen) => onToggle?.(isOpen, level, department, hqName, node);

  // Sales / Returns / Offers are matched by tone, not by array position, so the
  // right handler fires even if Model comes back in a different order.
  const sectionHandler = (tone) => {
    const handler = sectionHandlers?.[tone];
    if (typeof handler !== "function") return null;
    return (section) => handler(level, department, hqName, section, node);
  };

  const [open, setOpen] = React.useState(Boolean(startOpen));

  const toggle = () => {
    if (!hasBody) return;
    const next = !open;
    setOpen(next);
    fire(next);
  };

  // stopPropagation keeps an HQ card's click from also toggling its department.
  const onClick = (e) => {
    e.stopPropagation();
    toggle();
  };
  const onKeyDown = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    toggle();
  };

  return (
    <>
    <section
      className="esc-card"
      data-depth={depth}
      data-open={open && hasBody ? "true" : "false"}
      data-clickable={hasBody ? "true" : "false"}
      style={{ "--esc-accent": accent, "--esc-border": dim(accent, 0.45) }}
      onClick={onClick}
      onKeyDown={hasBody ? onKeyDown : undefined}
      role={hasBody ? "button" : undefined}
      tabIndex={hasBody ? 0 : undefined}
      aria-expanded={hasBody ? open : undefined}
    >
      {parentLabel ? <span className="esc-card__legend">{parentLabel}</span> : null}

      <div className="esc-card__head">
        <h3 className="esc-card__title">{title}</h3>
      </div>

      <div className="esc-progress">
        <div className="esc-progress__track">
          <div
            className="esc-progress__fill"
            data-neg={pct < 0 ? "true" : "false"}
            style={{ width: `${barPct}%` }}
          />
        </div>
        <span className="esc-progress__pct">{fmtPct(pct, 1)}</span>
        <Trophy className="esc-progress__trophy" size={16} />
      </div>

      <div className="esc-kpis">
        <span className="esc-kpi">
          <i className="esc-kpi__dot" data-kind="value" />
          <span className="esc-kpi__label">Inc.Primary:</span>
          <b className="esc-kpi__num">{fmtNumber(value, DECIMALS)}</b>
        </span>
        <span className="esc-kpi">
          <i className="esc-kpi__dot" data-kind="target" />
          <span className="esc-kpi__label">Target:</span>
          <b className="esc-kpi__num">{fmtNumber(target, 0)}</b>
        </span>
      </div>

      {(hasSections || hasTrend) && (
        <div
          className="esc-body"
          data-open={open ? "true" : "false"}
          aria-hidden={!open}
          // The opened body is not a close button: clicks on the Model boxes, or
          // on the space around them, stop here instead of reaching the card.
          // Only the headline above toggles it shut.
          onClick={(e) => e.stopPropagation()}
        >
          <div className="esc-body__inner">
            {hasTrend && (
              <div className="esc-trend">
                <TrendChart
                  points={trend}
                  type={trendType}
                  accent={accent}
                  locale="en-US"
                  formatValue={(v) => `${currency ? currency + " " : ""}${fmtNumber(v, DECIMALS)}`}
                />
              </div>
            )}

            {sections.length > 0 && (
              <div className="esc-sections" style={{ "--esc-cols": Math.min(sections.length, 3) }}>
                {sections.map((s, i) => {
                  const tone = toneOf(s?.[K.sectionName], i);
                  return (
                    <Section
                      key={`${s?.[K.sectionName] ?? "section"}-${i}`}
                      section={s}
                      index={i}
                      target={target}
                      currency={currency}
                      tone={tone}
                      onSectionClick={sectionHandler(tone)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>

    {/* The HQ cards are NOT drawn inside their department - opening a department
        lays them out underneath it, as separate full-width cards at the same
        level, each carrying its department's name on its top border and opening
        on its own click. */}
    {open && kids
      ? kids.map((child, i) => (
          <Card
            key={`${child?.[K.altTitle] ?? child?.[K.title] ?? "child"}-${i}`}
            node={child}
            kids={asArray(child?.[K.children])}
            currency={currency}
            depth={depth + 1}
            parentLabel={title}
            onToggle={onToggle}
            sectionHandlers={sectionHandlers}
            autoColor={autoColor}
            parentAccent={accent}
          />
        ))
      : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* public component                                                           */
/* -------------------------------------------------------------------------- */

export default function SummaryCard({
  data,
  hq,
  variant = "primary",
  total = false,
  defaultExpanded,
  currency = "₹",
  gap = 10,
  trend,
  trendType = "wave",
  autoColor = true,
  accentColor = "#3b82f6",
  onToggle,
  onSalesClick,
  onReturnsClick,
  onOffersClick,
  onHqClick,
  className,
  style,
}) {
  useStyles();

  // Keyed by tone, which is how a box is identified: the Sales handler fires for
  // the Sales box of whichever card was clicked - department or nested HQ alike.
  const sectionHandlers = {
    pos: onSalesClick,
    neg: onReturnsClick,
    neutral: onOffersClick,
  };

  if (!data) return null;

  // The trend strip belongs to the total card and nowhere else: a department, an
  // HQ or a team card is about that one row, and a day-wise chart of the whole
  // month sitting inside it reads as if it were that row's own history. Plasmic
  // hides the prop unless "Total card" is on; this is the same rule at runtime,
  // so a trend left over from toggling the switch cannot render under a card it
  // does not describe.
  const trendPoints = total ? trend : undefined;

  // The secondary variant is a different card over a different payload - sales
  // and closing rather than incentive against target - so it has its own
  // renderer, and shares only the props that mean the same thing in both.
  if (variant === "secondary") {
    return (
      <TeamCard
        data={data}
        hq={asArray(hq) || asArray(unwrapTeam(data)?.HQ)}
        total={total}
        // The HQ shelf is part of how this variant reads, so it starts open
        // unless asked otherwise; a primary card starts closed unless asked.
        defaultExpanded={defaultExpanded ?? true}
        currency={currency}
        accentColor={accentColor}
        trend={trendPoints}
        trendType={trendType}
        onToggle={onToggle}
        onHqClick={onHqClick}
        className={className}
        style={style}
      />
    );
  }

  // A total has no level beneath it: whatever is passed as `hq` (or sits on the
  // object) is dropped, so the total card can never sprout HQ cards.
  const kids = total ? null : asArray(hq) || asArray(data?.[K.children]);

  return (
    <div
      className={["esc-root", className].filter(Boolean).join(" ")}
      style={{ "--esc-gap": `${toNum(gap)}px`, ...style }}
    >
      <Card
        node={data}
        kids={kids}
        currency={currency}
        depth={0}
        parentLabel={null}
        startOpen={Boolean(defaultExpanded)}
        isTotal={total}
        autoColor={autoColor}
        trend={trendPoints}
        trendType={trendType}
        onToggle={onToggle}
        sectionHandlers={sectionHandlers}
      />
    </div>
  );
}
