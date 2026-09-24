import React from "react";
import { ChevronDown } from "lucide-react";
import TrendChart from "./TrendChart";

/**
 * TeamCard — the "secondary" variant of SummaryCard.
 *
 * Where the primary variant is about incentive against target, this one is about
 * what a team sold and what it is holding: two figures, SALES and CLOSING, each
 * with its value and its quantity, plus the HQs that make up the team shown as
 * small tiles behind a Show/Hide HQ toggle.
 *
 * It takes the payload as it arrives, either wrapped or not:
 *
 *   { data: { Team, HQ?, distributors, sales: { quantity, value },
 *             closing: { quantity, value }, customer,
 *             total_qty, total_sales_value, total_closing_qty, total_closing_value },
 *     Team }
 *
 * `sales` / `closing` are read first and the `total_*` fields are the fallback,
 * so a payload that only carries the totals still renders. A node with an `HQ`
 * field is an HQ; one without is the team. Missing figures are not zeroes — they
 * render as "—" and "No quantity", because a team with no data is not a team
 * that sold nothing.
 */

const STYLE_ID = "esw-team-card-styles";

/* Field names as the API sends them. */
const K = {
  team: "Team",
  hq: "HQ",
  customer: "customer",
  distributors: "distributors",
  sales: "sales",
  closing: "closing",
  qty: "quantity",
  value: "value",
  totalQty: "total_qty",
  totalValue: "total_sales_value",
  totalClosingQty: "total_closing_qty",
  totalClosingValue: "total_closing_value",
};

const LOCALE = "en-IN";

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

const isNum = (n) => typeof n === "number" && Number.isFinite(n);

/** null / undefined / "" all mean "no data", which is not the same as zero. */
const num = (v) => {
  if (isNum(v)) return v;
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The payload arrives wrapped in { data, Team } — take whichever we were given. */
const unwrap = (node) => (node && typeof node === "object" && node.data ? node.data : node) || null;

/**
 * The amount, always in full and grouped the Indian way (12,34,567). Nothing is
 * shortened to L or Cr here on purpose: the figures are passed in already in
 * whatever unit the caller wants them read in, and a card that silently rescales
 * them would fight that.
 */
const fmtFull = (v, currency) => {
  const n = num(v);
  if (n === null) return null;
  return `${currency ? currency + " " : ""}${n.toLocaleString(LOCALE)}`;
};

const fmtQty = (v) => {
  const n = num(v);
  return n === null ? null : `${n.toLocaleString(LOCALE)} Nos`;
};

const plural = (n, one, many) => `${n.toLocaleString(LOCALE)} ${n === 1 ? one : many}`;

/** "HQ-Bangalore" is shown as "Bangalore" next to an HQ chip. */
const hqName = (raw) => String(raw || "").replace(/^HQ[-\s]*/i, "");

/** Sum that keeps "no data" as null: two nulls stay null, one null counts as nothing. */
const addOrNull = (a, b) => (a === null && b === null ? null : (a || 0) + (b || 0));

/**
 * The three figures of one node. `sales` and `closing` are read first with the
 * `total_*` fields as a fallback; `opening` is not sent by the API at all — what
 * was there to begin with is what went out plus what is still on the shelf, so
 * opening = sales + closing, in quantity and in value.
 */
const readFigures = (d) => {
  const sales = {
    value: num(d?.[K.sales]?.[K.value]) ?? num(d?.[K.totalValue]),
    qty: num(d?.[K.sales]?.[K.qty]) ?? num(d?.[K.totalQty]),
  };
  const closing = {
    value: num(d?.[K.closing]?.[K.value]) ?? num(d?.[K.totalClosingValue]),
    qty: num(d?.[K.closing]?.[K.qty]) ?? num(d?.[K.totalClosingQty]),
  };
  const opening = {
    value: addOrNull(sales.value, closing.value),
    qty: addOrNull(sales.qty, closing.qty),
  };
  return { opening, sales, closing };
};

/** How much of the opening stock went out, by quantity. */
const soldPct = (f) => (f.opening.qty ? ((f.sales.qty || 0) / f.opening.qty) * 100 : null);

/* -------------------------------------------------------------------------- */
/* styles                                                                     */
/* -------------------------------------------------------------------------- */

const CSS = `
.tc-root { width: 100%; box-sizing: border-box; color: #0f172a;
  font-family: inherit; }
.tc-root *, .tc-root *::before, .tc-root *::after { box-sizing: border-box; }

.tc-card[data-clickable="true"] { cursor: pointer; }
.tc-card[data-clickable="true"]:hover { border-color: #cbd5e1; }
.tc-card:focus-visible { outline: 2px solid var(--tc-accent, #2563eb); outline-offset: 2px; }
/* Deliberately NOT clipped. Clipping here did stop the old tooltip from
   stretching the page, but it also cut off the tooltip itself and the chart,
   whose SVG surface draws outside its box on purpose. The tooltip is portalled
   to <body> instead, so there is nothing left to clip against. */
.tc-card { position: relative; width: 100%; background: #fff;
  border: 1px solid var(--tc-border, #e5e7eb); border-radius: 12px;
  container-type: inline-size; container-name: tc; }

/* ---- header ---- */
.tc-head { display: flex; align-items: flex-start; gap: 12px; padding: 18px 20px 0; }
.tc-head__main { flex: 1 1 auto; min-width: 0; }
.tc-eyebrow { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .09em;
  text-transform: uppercase; color: #64748b; }
.tc-title { margin: 4px 0 0; font-size: clamp(17px, 1.7cqi, 21px); font-weight: 700;
  line-height: 1.25; letter-spacing: -.01em; color: #0f172a;
  overflow-wrap: anywhere; }
.tc-sub { display: flex; align-items: center; gap: 6px; margin: 6px 0 0;
  font-size: 12px; color: #64748b; }
.tc-sub__dot { width: 4px; height: 4px; border-radius: 50%; background: #94a3b8; flex: 0 0 auto; }

.tc-toggle { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; font: inherit; font-size: 12.5px; font-weight: 600; color: #334155;
  background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer;
  transition: background .15s ease, border-color .15s ease; }
.tc-toggle:hover { background: #f8fafc; border-color: #94a3b8; }
.tc-toggle:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.tc-toggle__chev { transition: transform .2s ease; }
.tc-toggle[aria-expanded="true"] .tc-toggle__chev { transform: rotate(180deg); }

/* ---- how much of the opening went out, by quantity ---- */
.tc-progress { display: flex; align-items: center; gap: 10px; padding: 14px 20px 0; }
.tc-progress__track { flex: 1 1 auto; height: 8px; border-radius: 999px;
  background: #e2e8f0; overflow: hidden; }
.tc-progress__fill { height: 100%; border-radius: 999px; background: var(--tc-accent, #3b82f6);
  transition: width .45s cubic-bezier(.22,.61,.36,1); }
.tc-progress__pct { flex: 0 0 auto; font-size: 12px; font-weight: 600; color: #475569;
  font-variant-numeric: tabular-nums; }

/* ---- opening / sales / closing ---- */
.tc-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 20px; padding: 16px 20px 18px; }
.tc-stat { border-left: 2px solid var(--tc-accent, #3b82f6); padding-left: 12px; min-width: 0; }
.tc-stat__label { font-size: 10.5px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: #64748b; }
.tc-stat__value { margin-top: 4px; font-size: clamp(18px, 2cqi, 26px); font-weight: 700;
  line-height: 1.15; color: #0f172a; font-variant-numeric: tabular-nums;
  white-space: nowrap; }
.tc-stat__value[data-empty="true"] { color: #94a3b8; }
.tc-stat__money { margin-top: 3px; font-size: 13px; font-weight: 600; color: #334155;
  font-variant-numeric: tabular-nums; white-space: nowrap; }

/* ---- the day-wise trend strip ---- */
.tc-trend { padding: 0 20px 18px; }

/* ---- the HQ shelf ---- */
.tc-hqs { border-top: 1px solid #e5e7eb; background: #f8fafc; padding: 14px 20px 18px;
  border-radius: 0 0 11px 11px;
  animation: tc-in .18s ease-out both; }
.tc-hqs__head { display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px; margin-bottom: 12px; }
.tc-hqs__title { font-size: 10.5px; font-weight: 700; letter-spacing: .09em;
  text-transform: uppercase; color: #64748b; }
.tc-hqs__count { font-size: 11.5px; color: #94a3b8; }
.tc-hqs__grid { display: grid; gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }

.tc-hq { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px;
  min-width: 0; }
.tc-hq[data-clickable="true"] { cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease; }
.tc-hq[data-clickable="true"]:hover { border-color: #bfdbfe; box-shadow: 0 2px 8px rgba(15,23,42,.06); }
.tc-hq[data-clickable="true"]:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.tc-hq__head { display: flex; align-items: center; gap: 8px; }
.tc-hq__chip { flex: 0 0 auto; font-size: 9.5px; font-weight: 700; letter-spacing: .04em;
  color: #1d4ed8; background: #dbeafe; border-radius: 4px; padding: 3px 5px; }
.tc-hq__name { flex: 1 1 auto; min-width: 0; font-size: 13.5px; font-weight: 600;
  color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tc-hq__meta { flex: 0 0 auto; font-size: 11px; color: #94a3b8; }
.tc-hq__bar { height: 4px; border-radius: 999px; background: #e2e8f0; overflow: hidden;
  margin-top: 12px; }
.tc-hq__barFill { height: 100%; border-radius: 999px; background: var(--tc-accent, #3b82f6); }
.tc-hq__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px; margin-top: 10px; }
.tc-hq__stat { border-left: 2px solid #bfdbfe; padding-left: 8px; min-width: 0; }
.tc-hq__statLabel { font-size: 9.5px; font-weight: 700; letter-spacing: .07em;
  text-transform: uppercase; color: #64748b; }
.tc-hq__statValue { margin-top: 3px; font-size: 14px; font-weight: 700; color: #0f172a;
  font-variant-numeric: tabular-nums; white-space: nowrap; }
.tc-hq__statValue[data-empty="true"] { color: #cbd5e1; }
.tc-hq__statQty { margin-top: 2px; font-size: 11px; color: #64748b;
  font-variant-numeric: tabular-nums; }

@keyframes tc-in { from { opacity: 0; } to { opacity: 1; } }

/* ---- responsive, by card width ---- */
@container tc (max-width: 560px) {
  .tc-head { padding: 16px 14px 0; }
  .tc-trend { padding: 0 14px 16px; }
  .tc-stats { padding: 14px 14px 16px; gap: 12px 14px; }
  .tc-hqs { padding: 12px 14px 16px; }
  .tc-hqs__grid { grid-template-columns: minmax(0, 1fr); }
}
@container tc (max-width: 560px) {
  .tc-progress { padding: 12px 14px 0; }
}
@container tc (max-width: 460px) {
  .tc-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container tc (max-width: 380px) {
  .tc-head { flex-direction: column; gap: 10px; }
  .tc-toggle { align-self: flex-start; }
  .tc-stats { grid-template-columns: minmax(0, 1fr); }
}

@media (prefers-reduced-motion: reduce) {
  .tc-hqs { animation: none; }
  .tc-progress__fill { transition: none; }
  .tc-toggle, .tc-toggle__chev, .tc-hq { transition: none; }
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

/**
 * Quantity is the headline here — this variant is about stock moving, so the
 * Nos figure leads and the money sits under it as context.
 */
function Stat({ label, value, qty, currency }) {
  const quantity = fmtQty(qty);
  const money = fmtFull(value, currency);
  return (
    <div className="tc-stat">
      <div className="tc-stat__label">{label}</div>
      <div className="tc-stat__value" data-empty={quantity ? "false" : "true"}>
        {quantity || "—"}
      </div>
      <div className="tc-stat__money">{money || "No value"}</div>
    </div>
  );
}

function HqTile({ node, currency, onClick }) {
  const d = unwrap(node);
  const figures = readFigures(d);
  const pct = soldPct(figures);
  const distributors = num(d?.[K.distributors]);
  const clickable = typeof onClick === "function";

  const handle = (e) => {
    e.stopPropagation();
    onClick(d);
  };

  return (
    <article
      className="tc-hq"
      data-clickable={clickable ? "true" : "false"}
      onClick={clickable ? handle : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              handle(e);
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <div className="tc-hq__head">
        <span className="tc-hq__chip">HQ</span>
        <span className="tc-hq__name">{hqName(d?.[K.hq] ?? d?.[K.customer])}</span>
        {distributors !== null ? (
          <span className="tc-hq__meta">{plural(distributors, "distributor", "distributors")}</span>
        ) : null}
      </div>

      {pct !== null ? (
        <div className="tc-hq__bar">
          <div
            className="tc-hq__barFill"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      ) : null}

      <div className="tc-hq__stats">
        {[
          ["Sales", figures.sales],
          ["Closing", figures.closing],
          ["Opening", figures.opening],
        ].map(([label, f]) => {
          const quantity = fmtQty(f.qty);
          return (
            <div className="tc-hq__stat" key={label}>
              <div className="tc-hq__statLabel">{label}</div>
              <div className="tc-hq__statValue" data-empty={quantity ? "false" : "true"}>
                {quantity || "—"}
              </div>
              <div className="tc-hq__statQty">{fmtFull(f.value, currency) || "No value"}</div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* the card                                                                   */
/* -------------------------------------------------------------------------- */

export default function TeamCard({
  data,
  hq,
  total = false,
  trend,
  trendType = "wave",
  defaultExpanded = true,
  currency = "₹",
  accentColor = "#3b82f6",
  onToggle,
  onHqClick,
  className,
  style,
}) {
  useStyles();

  const node = unwrap(data);
  const [open, setOpen] = React.useState(Boolean(defaultExpanded));

  if (!node) return null;

  // A total sits above the teams, so nothing hangs under it: whatever came in as
  // `hq` is dropped, exactly as it is on the primary variant's total card.
  const isHq = !total && node[K.hq] != null;
  const team = total ? null : node[K.team] ?? data?.[K.team] ?? null;
  const title = total
    ? node[K.team] ?? node[K.customer] ?? "Total Summary"
    : isHq
      ? hqName(node[K.hq])
      : node[K.team] ?? node[K.customer] ?? "";
  const eyebrow = total ? "Total" : isHq ? "Headquarter" : "Team";
  const distributors = num(node[K.distributors]);
  const figures = readFigures(node);
  const pct = soldPct(figures);

  const tiles = total || !(Array.isArray(hq) && hq.length) ? null : hq;

  // Purely local: it shows and hides the shelf. It does not report through
  // `onToggle`, so that event stays unambiguously "the card was clicked".
  const toggle = () => setOpen((v) => !v);

  // Clicking the card REPORTS the click and changes nothing: showing and hiding
  // the HQ shelf belongs to the Show/Hide HQ button, which is the dedicated
  // control for it. `open` tells the handler whether the shelf happens to be
  // showing. The card is only a control when someone is listening - otherwise it
  // carries no cursor, no focus stop and no role.
  const cardClickable = typeof onToggle === "function";
  const reportCardClick = () => {
    onToggle?.(
      open,
      total ? "total" : isHq ? "hq" : "team",
      team,
      isHq ? node[K.hq] : null,
      node
    );
  };
  const onCardKeyDown = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    reportCardClick();
  };

  return (
    <div className={["tc-root", className].filter(Boolean).join(" ")} style={style}>
      <section
        className="tc-card"
        data-clickable={cardClickable ? "true" : "false"}
        style={{ "--tc-accent": accentColor }}
        onClick={cardClickable ? reportCardClick : undefined}
        onKeyDown={cardClickable ? onCardKeyDown : undefined}
        role={cardClickable ? "button" : undefined}
        tabIndex={cardClickable ? 0 : undefined}
      >
        <header className="tc-head">
          <div className="tc-head__main">
            <span className="tc-eyebrow">{eyebrow}</span>
            <h3 className="tc-title">{title}</h3>
            {distributors !== null ? (
              <p className="tc-sub">
                <i className="tc-sub__dot" />
                {plural(distributors, "distributor", "distributors")}
              </p>
            ) : null}
          </div>

          {tiles ? (
            <button
              type="button"
              className="tc-toggle"
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
              aria-expanded={open}
            >
              {open ? "Hide HQ" : "Show HQ"}
              <ChevronDown className="tc-toggle__chev" size={14} />
            </button>
          ) : null}
        </header>

        {pct !== null ? (
          <div className="tc-progress">
            <div className="tc-progress__track">
              <div
                className="tc-progress__fill"
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
              />
            </div>
            <span className="tc-progress__pct">{pct.toFixed(1)}% sold</span>
          </div>
        ) : null}

        <div className="tc-stats">
          <Stat label="Sales" value={figures.sales.value} qty={figures.sales.qty} currency={currency} />
          <Stat label="Closing" value={figures.closing.value} qty={figures.closing.qty} currency={currency} />
          <Stat label="Opening" value={figures.opening.value} qty={figures.opening.qty} currency={currency} />
        </div>

        {Array.isArray(trend) && trend.length ? (
          <div className="tc-trend">
            <TrendChart
              points={trend}
              type={trendType}
              accent={accentColor}
              tipAbove
              formatValue={(v) => fmtQty(v) || String(v)}
            />
          </div>
        ) : null}

        {tiles && open ? (
          <div className="tc-hqs" onClick={(e) => e.stopPropagation()}>
            <div className="tc-hqs__head">
              <span className="tc-hqs__title">Headquarters</span>
              <span className="tc-hqs__count">{tiles.length} in this team</span>
            </div>
            <div className="tc-hqs__grid">
              {tiles.map((child, i) => (
                <HqTile
                  key={`${unwrap(child)?.[K.hq] ?? unwrap(child)?.[K.customer] ?? "hq"}-${i}`}
                  node={child}
                  currency={currency}
                  onClick={
                    onHqClick
                      ? (d) => onHqClick("hq", team, d?.[K.hq] ?? d?.[K.customer] ?? null, d)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
