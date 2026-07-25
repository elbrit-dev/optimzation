import React from "react";

/**
 * SecondaryDataSummary — a single summary CARD for the Secondary Data Entry page.
 *
 * It sits alongside the distributor (Approval) cards and answers, for whoever entered
 * the data (the BE, or a manager/IT covering seats): "what happened to everything I
 * entered this period?" — total secondary sales & closing, how many customers, and how
 * many seat routes are Approved / Waiting / Rejected. Clicking the card (or the badge,
 * a KPI, or a split card) opens a POPUP with the rejections to fix, a customer-by-customer
 * breakdown (seat routes + item lines), and the top products.
 *
 * DATA (`data` prop) — bind it to the `secondary` result of the page query, e.g.
 *   $queries.writeTest.secondary        (the SecondaryDataEntrys connection)
 * The component is tolerant of shape — it accepts any of:
 *   - the whole query object          { secondary: { edges: [{ node }] }, Index: {...} }
 *   - the connection                  { edges: [{ node }] }
 *   - an array of edges               [{ node }, ...]
 *   - an array of nodes               [ node, ... ]
 * Each `node` is one Secondary Data Entry with:
 *   node.distributor.customer_name, node.distributor__name, node.date, node.name,
 *   node.items[] { sales_qty, sales_value, closing_qty, closing_balance,
 *                  custom_role_profile__name, custom_hq__name, custom_department__name,
 *                  item__name, item { item_name, custom_last_mrp, custom_last_ptr, custom_last_pts },
 *                  custom_role_profile { custom_employee_id { employee_name, employee } } },
 *   node.custom_status_tracker[] { status__name, tracker__name, custom_employee_nmae__name }
 *
 * MODEL — one entry can hold lines from several SEATS (custom_role_profile). Each seat's
 * numbers = the sum of its item lines; each seat's status comes from the status-tracker row
 * whose tracker name ends with that role profile. Approval is SINGLE-LEVEL: the status text
 * itself names the approver (BE-entered → "ABM Approval Waiting"; ABM-entered → "RBM Approval
 * Waiting"; "ABM Rejected"), so we derive the bucket (Waiting / Approved / Rejected) and the
 * approver role straight from that text — no chain.
 */

const STYLE_ID = "elbrit-secondary-summary-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .esum{--esum-good:#12a150;--esum-good-bg:#e6f6ec;--esum-warn:#c67a08;--esum-warn-bg:#fbf1da;
      --esum-bad:#d63a3a;--esum-bad-bg:#fbe7e6;--esum-ink:#1b2540;--esum-ink2:#5c6884;--esum-ink3:#94a0b6;
      --esum-border:#e4e9f1;--esum-surface:#fff;--esum-surface2:#f5f8fc;--esum-inset:#eef2f8;
      box-sizing:border-box;width:100%;background:var(--esum-surface);border:1px solid var(--esum-border);
      border-radius:16px;padding:16px 17px 17px;color:var(--esum-ink);
      font:400 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;}
    .esum *{box-sizing:border-box}
    .esum .num{font-variant-numeric:tabular-nums}
    .esum-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding-bottom:14px;border-bottom:1px solid var(--esum-border)}
    .esum-head .l{display:flex;align-items:flex-start;gap:11px;min-width:0}
    .esum-fold{width:26px;height:26px;color:var(--esum-ink3);flex:none;margin-top:1px}
    .esum-h1{margin:0;font-size:15.5px;font-weight:700;letter-spacing:-.01em;color:var(--esum-ink)}
    .esum-meta{font-size:12px;color:var(--esum-ink2);margin-top:3px}
    .esum-meta b{color:var(--esum-ink);font-weight:600}
    .esum-badge{flex:none;font-size:11px;font-weight:700;letter-spacing:.03em;color:var(--esum-bad);background:var(--esum-bad-bg);
      border:1px solid color-mix(in srgb,var(--esum-bad) 25%,transparent);border-radius:8px;padding:5px 10px;white-space:nowrap;cursor:pointer;font-family:inherit}
    .esum-badge:hover{filter:brightness(.97)}
    .esum-badge.ok{color:var(--esum-good);background:var(--esum-good-bg);border-color:color-mix(in srgb,var(--esum-good) 25%,transparent);cursor:default}

    .esum-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:9px;margin-top:14px}
    .esum-kpi{background:var(--esum-surface2);border:1px solid var(--esum-border);border-radius:11px;padding:11px 12px}
    .esum-kpi .k{font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--esum-ink3);font-weight:700}
    .esum-kpi .v{font-size:21px;font-weight:700;letter-spacing:-.02em;margin-top:7px;line-height:1.05}
    .esum-kpi .v .c{font-size:11px;color:var(--esum-ink2);font-weight:600}
    .esum-kpi .s{font-size:10.5px;color:var(--esum-ink3);margin-top:4px}
    .esum-kpi.g{background:var(--esum-good-bg);border-color:color-mix(in srgb,var(--esum-good) 22%,transparent)} .esum-kpi.g .v{color:var(--esum-good)}
    .esum-kpi.w{background:var(--esum-warn-bg);border-color:color-mix(in srgb,var(--esum-warn) 24%,transparent)} .esum-kpi.w .v{color:var(--esum-warn)}
    .esum-kpi.b{background:var(--esum-bad-bg);border-color:color-mix(in srgb,var(--esum-bad) 24%,transparent)} .esum-kpi.b .v{color:var(--esum-bad)}

    .esum-st{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--esum-ink3);font-weight:700;margin:20px 0 4px}
    .esum-sub{font-size:11.5px;color:var(--esum-ink2);margin-bottom:11px}
    .esum-cards{display:grid;grid-template-columns:repeat(var(--esum-cols,4),1fr);gap:11px}
    .esum-sc{background:var(--esum-surface);border:1px solid var(--esum-border);border-radius:11px;padding:13px 13px 11px;cursor:pointer;transition:border-color .12s,box-shadow .12s,transform .12s;text-align:left;font-family:inherit;color:inherit;width:100%}
    .esum-sc:hover{border-color:var(--esum-accent,#2f43c9);transform:translateY(-1px);box-shadow:0 8px 22px rgba(20,30,60,.12)}
    .esum-sc:focus-visible{outline:2px solid var(--esum-accent,#2f43c9);outline-offset:2px}
    .esum-sc .t{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--esum-ink);font-weight:700}
    .esum-sc .tot{font-size:19px;font-weight:700;letter-spacing:-.02em;margin-top:7px}
    .esum-sc .tot .c{font-size:11px;color:var(--esum-ink2);font-weight:600}
    .esum-bar{display:flex;height:8px;border-radius:5px;overflow:hidden;background:var(--esum-inset);margin-top:11px}
    .esum-bar span{height:100%}
    .esum-g{background:var(--esum-good)} .esum-w{background:var(--esum-warn)} .esum-b{background:var(--esum-bad)}
    .esum-splits{display:flex;flex-direction:column;gap:4px;margin-top:10px}
    .esum-sp{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--esum-ink2)}
    .esum-sp i{width:8px;height:8px;border-radius:2px;flex:none}
    .esum-sp b{margin-left:auto;color:var(--esum-ink);font-weight:640}
    .esum-sp.z{opacity:.45}
    .esum-drill{font-size:10.5px;color:#2f74d0;font-weight:600;margin-top:10px}

    .esum-empty{padding:26px 10px;text-align:center;color:var(--esum-ink3);font-size:12.5px}

    /* modal */
    .esum-ov{position:fixed;inset:0;background:rgba(12,18,30,.55);display:flex;align-items:flex-start;justify-content:center;padding:34px 16px;z-index:1000;overflow-y:auto}
    .esum-modal{background:var(--esum-surface);border:1px solid var(--esum-border);border-radius:16px;box-shadow:0 18px 52px rgba(20,30,60,.28);width:100%;max-width:760px;overflow:hidden}
    .esum-mh{padding:15px 18px;border-bottom:1px solid var(--esum-border);display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .esum-mh h2{margin:0;font-size:15px;font-weight:700}
    .esum-mh .sub{font-size:12px;color:var(--esum-ink2);margin-top:3px}
    .esum-x{border:1px solid var(--esum-border);background:var(--esum-surface);color:var(--esum-ink2);border-radius:9px;width:31px;height:31px;cursor:pointer;font-size:15px;flex:none;line-height:1}
    .esum-x:hover{background:var(--esum-inset)}
    .esum-mb{padding:15px 18px 20px;max-height:calc(100vh - 180px);overflow-y:auto}
    .esum-mt{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:var(--esum-ink2);margin:16px 0 9px;display:flex;align-items:center;gap:8px}
    .esum-mt:first-child{margin-top:0}
    .esum-mt .cnt{background:var(--esum-bad);color:#fff;border-radius:999px;font-size:10px;padding:1px 7px}
    .esum-rej{display:grid;grid-template-columns:1fr auto;gap:6px 14px;align-items:center;padding:11px 12px;border:1px solid color-mix(in srgb,var(--esum-bad) 22%,var(--esum-border));background:var(--esum-bad-bg);border-radius:10px;margin-bottom:8px}
    .esum-rej .rn{font-weight:650;font-size:13px}
    .esum-rej .rs{font-size:11.5px;color:var(--esum-ink2);margin-top:2px}
    .esum-rej .rs code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:var(--esum-bad);background:color-mix(in srgb,var(--esum-bad) 12%,transparent);padding:1px 6px;border-radius:5px}
    .esum-rej .rr{font-size:12px;margin-top:5px}.esum-rej .rr .q{color:var(--esum-bad);font-weight:600}
    .esum-rej .right{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:7px}
    .esum-rej .amt{font-weight:700;font-size:14px}
    .esum-btn{border:1px solid var(--esum-bad);background:var(--esum-bad);color:#fff;border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
    .esum-dhead{display:grid;grid-template-columns:2fr 1.1fr 1.1fr 1.3fr 22px;gap:10px;padding:0 12px 7px;font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:var(--esum-ink3);font-weight:700}
    .esum-dhead .r{text-align:right}
    .esum-grp{border:1px solid var(--esum-border);border-radius:10px;overflow:hidden;margin-bottom:8px}
    .esum-drow{display:grid;grid-template-columns:2fr 1.1fr 1.1fr 1.3fr 22px;gap:10px;align-items:center;padding:11px 12px;cursor:pointer;background:var(--esum-surface)}
    .esum-drow:hover{background:var(--esum-surface2)}
    .esum-drow .nm{font-weight:640;font-size:13px;min-width:0}
    .esum-drow .nm .dt{display:block;font-size:10px;color:var(--esum-ink3);font-weight:500;margin-top:1px}
    .esum-drow .r{text-align:right;font-size:12.5px;font-weight:620}
    .esum-drow .r .q{color:var(--esum-ink3);font-weight:500;font-size:10px;margin-left:2px}
    .esum-tag{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap}
    .esum-tag.g{background:var(--esum-good-bg);color:var(--esum-good)} .esum-tag.w{background:var(--esum-warn-bg);color:var(--esum-warn)} .esum-tag.b{background:var(--esum-bad-bg);color:var(--esum-bad)}
    .esum-chev{color:var(--esum-ink3);transition:transform .16s;justify-self:end}
    .esum-drow[aria-expanded="true"] .esum-chev{transform:rotate(90deg)}
    .esum-det{padding:0 12px 12px;background:var(--esum-surface2);border-top:1px solid var(--esum-border)}
    .esum-seatblock{border:1px solid var(--esum-border);border-radius:10px;overflow:hidden;margin-top:10px;background:var(--esum-surface)}
    .esum-seathd{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;padding:10px 12px;background:var(--esum-surface2);border-bottom:1px solid var(--esum-border);font-size:12px}
    .esum-seathd.nb{border-bottom:none}
    .esum-seathd .who{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
    .esum-seathd .sid{font-weight:660;color:var(--esum-ink);font-size:12.5px}
    .esum-seathd .hq{color:var(--esum-ink3);font-size:11px}
    .esum-seathd .ap{color:var(--esum-ink2);font-size:11.5px}.esum-seathd .ap b{color:var(--esum-ink);font-weight:600}
    .esum-seathd .amt{font-weight:680;margin-left:auto;white-space:nowrap}
    .esum-seathd.clk{cursor:pointer}
    .esum-seathd.clk:hover{background:var(--esum-inset)}
    .esum-seathd .esum-chev{margin-left:4px;flex:none;color:var(--esum-ink3);transition:transform .16s}
    .esum-seathd[aria-expanded="true"] .esum-chev{transform:rotate(90deg)}
    .esum-items{overflow-x:auto}
    .esum-seatblock .esum-items{padding:4px 12px 11px}
    .esum-items table{border-collapse:collapse;width:100%;font-size:11.5px;min-width:540px}
    .esum-items th{text-align:right;font-size:9px;letter-spacing:.03em;text-transform:uppercase;color:var(--esum-ink3);font-weight:700;padding:5px 8px;border-bottom:1px solid var(--esum-border)}
    .esum-items th:first-child,.esum-items td:first-child{text-align:left}
    .esum-items td{padding:6px 8px;border-bottom:1px solid var(--esum-border);text-align:right;color:var(--esum-ink2)}
    .esum-items td:first-child{color:var(--esum-ink);font-weight:600}.esum-items tr:last-child td{border-bottom:none}
    .esum-p{display:grid;grid-template-columns:130px 1fr 84px;gap:10px;align-items:center;font-size:12px;margin-bottom:8px}
    .esum-p .pn{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .esum-p .tr{height:8px;background:var(--esum-inset);border-radius:5px;overflow:hidden}
    .esum-p .fl{height:100%;background:var(--esum-accent,#2f43c9);border-radius:5px}
    .esum-p .pv{text-align:right;font-weight:620}
    @media(max-width:860px){.esum-kpis{grid-template-columns:repeat(3,1fr)}.esum-cards{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:520px){.esum-kpis{grid-template-columns:repeat(2,1fr)}.esum-cards{grid-template-columns:1fr}}
  `;
  document.head.appendChild(el);
}

/* ---------- data helpers ---------- */
const toNum = (x) => {
  if (x === null || x === undefined || x === "") return 0;
  const n = typeof x === "number" ? x : parseFloat(String(x).replace(/,/g, ""));
  return isFinite(n) ? n : 0;
};

// Approval bucket from status text. "reject" wins; a finished "Approved" beats "Approval Waiting".
function bucketOf(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("reject")) return "Rejected";
  if (s.includes("approved")) return "Approved";
  return "Waiting";
}
// The approver role is the leading token of the status ("ABM Approval Waiting" -> "ABM").
function approverOf(status) {
  const t = String(status || "").trim().split(/\s+/)[0];
  return /^[A-Za-z]{2,4}$/.test(t) ? t : "";
}
// Match a status-tracker row to a seat by its tracker name ending with the role profile.
function matchTracker(trackers, roleProfile) {
  if (!Array.isArray(trackers) || !trackers.length) return null;
  if (roleProfile) {
    const hit = trackers.find((t) => String(t.tracker__name || t.tracker || "").endsWith(roleProfile));
    if (hit) return hit;
  }
  return trackers.length === 1 ? trackers[0] : null;
}

// Accept the many shapes Plasmic might hand us and return an array of nodes.
function toNodes(data) {
  if (!data) return [];
  let d = data;
  if (d.secondary) d = d.secondary; // whole query object
  if (Array.isArray(d)) return d.map((x) => (x && x.node ? x.node : x)).filter(Boolean);
  if (d.edges && Array.isArray(d.edges)) return d.edges.map((e) => e && e.node).filter(Boolean);
  if (d.items) return [d]; // a single node
  return [];
}

function buildCustomer(node) {
  const items = Array.isArray(node.items) ? node.items : [];
  const seatMap = {};
  items.forEach((it) => {
    const rp = it.custom_role_profile__name || (it.custom_role_profile && it.custom_role_profile.name) || "—";
    if (!seatMap[rp]) {
      const emp = it.custom_role_profile && it.custom_role_profile.custom_employee_id && it.custom_role_profile.custom_employee_id.employee_name;
      seatMap[rp] = { roleProfile: rp, hq: it.custom_hq__name || "", dept: it.custom_department__name || "", employee: emp || "", sq: 0, sv: 0, cq: 0, cv: 0, items: [] };
    }
    const s = seatMap[rp];
    s.sq += toNum(it.sales_qty); s.sv += toNum(it.sales_value);
    s.cq += toNum(it.closing_qty); s.cv += toNum(it.closing_balance);
    s.items.push(it);
  });
  const trackers = Array.isArray(node.custom_status_tracker) ? node.custom_status_tracker : [];
  const seats = Object.values(seatMap).map((s) => {
    const tr = matchTracker(trackers, s.roleProfile);
    const status = (tr && (tr.status__name || tr.status)) || node.workflow_state || "";
    return {
      ...s,
      status,
      bucket: bucketOf(status),
      approver: approverOf(status),
      reason: (tr && (tr.reason_for_rejection || tr.reason)) || "",
      employee: s.employee || (tr && tr.custom_employee_nmae__name) || "",
    };
  });
  const summed = seats.reduce((a, s) => ({ sq: a.sq + s.sq, sv: a.sv + s.sv, cq: a.cq + s.cq, cv: a.cv + s.cv }), { sq: 0, sv: 0, cq: 0, cv: 0 });
  // Prefer the entry's own HEADER totals when present — `total_*` (the shape in
  // $ctx.data.main.rawData) or `custom_total_*` (the raw doctype fields) — else sum the lines.
  const hv = (a, b) => (node[a] !== undefined && node[a] !== null ? node[a] : node[b]);
  const hSq = hv("total_sales_qty", "custom_total_sales_qty");
  const hSv = hv("total_sales_value", "custom_total_sales_value");
  const hCq = hv("total_closing_qty", "custom_total_closing_qty");
  const hCv = hv("total_closing_balance", "custom_total_closing_value");
  const hasHeader = [hSq, hSv, hCq, hCv].some((v) => v !== undefined && v !== null);
  const tot = hasHeader ? { sq: toNum(hSq), sv: toNum(hSv), cq: toNum(hCq), cv: toNum(hCv) } : summed;
  const rollup = seats.some((s) => s.bucket === "Rejected") ? "Rejected" : seats.length && seats.every((s) => s.bucket === "Approved") ? "Approved" : "Waiting";
  return {
    id: node.name,
    name: (node.distributor && node.distributor.customer_name) || node.distributor_customer_name || node.distributor__name || node.name,
    date: node.date,
    seats,
    items,
    tot,
    rollup,
  };
}

// A line's Last PTS / PTR / MRP live flat on the row in rawData, or nested under `item`.
const lineField = (it, key) => {
  const v = it[key] !== undefined && it[key] !== null ? it[key] : it.item && it.item[key];
  return v;
};
const itemName = (it) => (it.item && it.item.item_name) || it.item__name || "—";

const TAG = { Approved: "g", Waiting: "w", Rejected: "b" };

/* ---------- component ---------- */
export default function SecondaryDataSummary({
  data,
  title = "Secondary summary",
  periodLabel = "",
  currency = "₹",
  locale = "en-IN",
  showClosingCards = true,
  showProducts = true,
  showItems = true,
  openByDefault = false,
  emptyText = "No secondary entries for this period.",
  accentColor = "#2f43c9",
  onCustomerClick,
  onFixRejected,
  className,
  style,
}) {
  ensureStyles();
  const [open, setOpen] = React.useState(Boolean(openByDefault));
  const [expanded, setExpanded] = React.useState(() => ({}));
  const [seatOpen, setSeatOpen] = React.useState(() => ({}));
  const lastFocus = React.useRef(null);

  const fmtMoney = React.useCallback(
    (v) => `${currency}${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(toNum(v))}`,
    [currency, locale]
  );
  const fmtInt = React.useCallback((v) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(toNum(v)), [locale]);

  const model = React.useMemo(() => {
    const customers = toNodes(data).map(buildCustomer);
    const routes = customers.flatMap((c) => c.seats.map((s) => ({ ...s, cust: c })));
    const by = (bucket, key) => routes.filter((r) => r.bucket === bucket).reduce((a, r) => a + r[key], 0);
    const split = (key) => ({ Approved: by("Approved", key), Waiting: by("Waiting", key), Rejected: by("Rejected", key), total: routes.reduce((a, r) => a + r[key], 0) });
    const cnt = (bucket) => routes.filter((r) => r.bucket === bucket).length;
    const hqs = new Set(routes.map((r) => r.hq).filter(Boolean));
    // Headline totals from each entry's header (authoritative), summed across customers.
    const headline = customers.reduce((a, c) => ({ sq: a.sq + c.tot.sq, sv: a.sv + c.tot.sv, cq: a.cq + c.tot.cq, cv: a.cv + c.tot.cv }), { sq: 0, sv: 0, cq: 0, cv: 0 });
    return {
      customers, routes, headline,
      nHq: hqs.size,
      counts: { Approved: cnt("Approved"), Waiting: cnt("Waiting"), Rejected: cnt("Rejected") },
      sv: split("sv"), sq: split("sq"), cv: split("cv"), cq: split("cq"),
    };
  }, [data]);

  const openModal = React.useCallback(() => {
    if (typeof document !== "undefined") lastFocus.current = document.activeElement;
    setOpen(true);
  }, []);
  const closeModal = React.useCallback(() => {
    setOpen(false);
    if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus();
  }, []);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeModal]);

  const { customers, routes, counts, nHq, sv, sq, cv, cq, headline } = model;
  const isEmpty = customers.length === 0;

  const cssVars = { "--esum-accent": accentColor, "--esum-cols": showClosingCards ? 4 : 2, ...style };

  /* --- split card --- */
  const CARD_DEFS = [
    { t: "Secondary Value", d: sv, money: true },
    { t: "Secondary Qty", d: sq, money: false },
    { t: "Closing Value", d: cv, money: true },
    { t: "Closing Qty", d: cq, money: false },
  ].slice(0, showClosingCards ? 4 : 2);
  const fmt = (v, money) => (money ? fmtMoney(v) : fmtInt(v));

  const rejRoutes = routes.filter((r) => r.bucket === "Rejected");

  // top products by secondary value
  const prodMap = {};
  customers.forEach((c) => c.items.forEach((it) => {
    const nm = itemName(it);
    prodMap[nm] = (prodMap[nm] || 0) + toNum(it.sales_value);
  }));
  const prods = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const pMax = prods.length ? prods[0][1] : 1;

  return (
    <div className={`esum${className ? " " + className : ""}`} style={cssVars}>
      <div className="esum-head">
        <div className="l">
          <svg className="esum-fold" viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" strokeWidth="1.6" /></svg>
          <div>
            <h1 className="esum-h1">{periodLabel ? `${periodLabel} · ${title}` : title}</h1>
            <div className="esum-meta">
              <b>{customers.length}</b> customers · <b>{routes.length}</b> seat routes · <b>{nHq}</b> HQs
            </div>
          </div>
        </div>
        {!isEmpty && (
          counts.Rejected > 0 ? (
            <button type="button" className="esum-badge" onClick={openModal}>{counts.Rejected} REJECTED</button>
          ) : (
            <span className="esum-badge ok">ALL CLEAR</span>
          )
        )}
      </div>

      {isEmpty ? (
        <div className="esum-empty">{emptyText}</div>
      ) : (
        <>
          <div className="esum-kpis">
            {[
              ["Customers", fmtInt(customers.length), "", ""],
              ["Secondary sales", `<span class="c">${currency}</span>${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(headline.sv)}`, `${fmtInt(headline.sq)} units`, ""],
              ["Closing stock", `<span class="c">${currency}</span>${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(headline.cv)}`, `${fmtInt(headline.cq)} units`, ""],
              ["Approved", fmtInt(counts.Approved), "routes", "g"],
              ["Waiting", fmtInt(counts.Waiting), "routes", "w"],
              ["Rejected", fmtInt(counts.Rejected), "routes", "b"],
            ].map(([k, v, s, c], i) => (
              <div key={i} className={`esum-kpi${c ? " " + c : ""}`}>
                <div className="k">{k}</div>
                <div className="v num" dangerouslySetInnerHTML={{ __html: v }} />
                {s ? <div className="s num">{s}</div> : null}
              </div>
            ))}
          </div>

          <div className="esum-st">Approval status</div>
          <div className="esum-sub">Everything you entered, split by where it stands — approved, waiting, or rejected. Tap a card for the customer-by-customer detail.</div>
          <div className="esum-cards">
            {CARD_DEFS.map((card, i) => {
              const d = card.d, tt = d.total || 1;
              const row = (cls, lab, val) => (
                <span className={`esum-sp ${cls}${val ? "" : " z"}`}><i style={{ background: cls === "g" ? "var(--esum-good)" : cls === "w" ? "var(--esum-warn)" : "var(--esum-bad)" }} />{lab}<b className="num">{fmt(val, card.money)}</b></span>
              );
              return (
                <button key={i} type="button" className="esum-sc" onClick={openModal} aria-label={`${card.t} breakdown`}>
                  <div className="t">{card.t}</div>
                  <div className="tot num">{fmt(d.total, card.money)}</div>
                  <div className="esum-bar">
                    <span className="esum-g" style={{ width: (d.Approved / tt) * 100 + "%" }} />
                    <span className="esum-w" style={{ width: (d.Waiting / tt) * 100 + "%" }} />
                    <span className="esum-b" style={{ width: (d.Rejected / tt) * 100 + "%" }} />
                  </div>
                  <div className="esum-splits">
                    {row("g", "Approved", d.Approved)}
                    {row("w", "Waiting", d.Waiting)}
                    {row("b", "Rejected", d.Rejected)}
                  </div>
                  <div className="esum-drill">breakdown →</div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {open && (
        <div className="esum-ov" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="esum-modal">
            <div className="esum-mh">
              <div>
                <h2>{periodLabel ? `${periodLabel} · ${title}` : title}</h2>
                <div className="sub">{customers.length} customers · {routes.length} routes</div>
              </div>
              <button type="button" className="esum-x" aria-label="Close" onClick={closeModal}>✕</button>
            </div>
            <div className="esum-mb">
              {rejRoutes.length > 0 && (
                <>
                  <div className="esum-mt">Needs fixing <span className="cnt">{rejRoutes.length}</span></div>
                  {rejRoutes.map((r, i) => (
                    <div key={i} className="esum-rej">
                      <div>
                        <div className="rn">{r.cust.name}</div>
                        <div className="rs"><code>{r.employee || r.roleProfile}</code>{r.approver ? ` · rejected by ${r.approver}` : ""}{r.hq ? ` · ${r.hq}` : ""}</div>
                        {r.reason ? <div className="rr">Reason: <span className="q">“{r.reason}”</span></div> : null}
                      </div>
                      <div className="right">
                        <div className="amt num">{fmtMoney(r.sv)}</div>
                        {onFixRejected ? <button type="button" className="esum-btn" onClick={() => onFixRejected({ customer: r.cust.id, roleProfile: r.roleProfile, hq: r.hq })}>Fix &amp; resubmit</button> : null}
                      </div>
                    </div>
                  ))}
                </>
              )}

              <div className="esum-mt">Customers</div>
              <div className="esum-dhead"><div>Customer</div><div className="r">Sales</div><div className="r">Closing</div><div>Status</div><div /></div>
              {customers.map((c, ci) => {
                const isOpen = !!expanded[c.id];
                return (
                  <div key={ci} className="esum-grp">
                    <div className="esum-drow" role="button" tabIndex={0} aria-expanded={isOpen}
                      onClick={() => { setExpanded((m) => ({ ...m, [c.id]: !m[c.id] })); if (onCustomerClick) onCustomerClick(c.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((m) => ({ ...m, [c.id]: !m[c.id] })); } }}>
                      <div className="nm">{c.name}<span className="dt num">{c.date}</span></div>
                      <div className="r num">{fmtMoney(c.tot.sv)}<span className="q">{fmtInt(c.tot.sq)}u</span></div>
                      <div className="r num">{fmtMoney(c.tot.cv)}<span className="q">{fmtInt(c.tot.cq)}u</span></div>
                      <div><span className={`esum-tag ${TAG[c.rollup]}`}>{c.rollup}{c.seats.length > 1 ? ` · ${c.seats.length}` : ""}</span></div>
                      <svg className="esum-chev" width="14" height="14" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                    {isOpen && (
                      <div className="esum-det">
                        {c.seats.map((s, si) => {
                          const withItems = showItems && s.items.length > 0;
                          const sKey = `${c.id}::${si}`;
                          const sOpen = withItems && (seatOpen[sKey] !== undefined ? seatOpen[sKey] : c.seats.length === 1);
                          const toggleSeat = () => setSeatOpen((m) => ({ ...m, [sKey]: !(m[sKey] !== undefined ? m[sKey] : c.seats.length === 1) }));
                          return (
                            <div key={si} className="esum-seatblock">
                              <div
                                className={`esum-seathd${sOpen ? "" : " nb"}${withItems ? " clk" : ""}`}
                                role={withItems ? "button" : undefined}
                                tabIndex={withItems ? 0 : undefined}
                                aria-expanded={withItems ? sOpen : undefined}
                                onClick={withItems ? toggleSeat : undefined}
                                onKeyDown={withItems ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSeat(); } } : undefined}
                              >
                                <div className="who">
                                  <span className="sid" title={s.roleProfile}>{s.employee || s.roleProfile}</span>
                                  <span className={`esum-tag ${TAG[s.bucket]}`}>{s.bucket}</span>
                                  {s.hq ? <span className="hq">{s.hq}</span> : null}
                                </div>
                                <span className="ap">
                                  {s.bucket === "Rejected" ? <>rejected by <b>{s.approver || "approver"}</b>{s.reason ? ` — “${s.reason}”` : ""}</>
                                    : s.bucket === "Approved" ? <>approved{s.approver ? <> by <b>{s.approver}</b></> : null}</>
                                    : <>waiting for <b>{s.approver || "approver"}</b> approval</>}
                                </span>
                                <span className="amt num">{fmtMoney(s.sv)}</span>
                                {withItems ? (
                                  <svg className="esum-chev" width="13" height="13" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                ) : null}
                              </div>
                              {sOpen && (
                                <div className="esum-items">
                                  <table>
                                    <thead><tr><th>Item</th><th>Sec qty</th><th>Sec val</th><th>Clos qty</th><th>Clos val</th><th>PTS</th><th>PTR</th><th>MRP</th></tr></thead>
                                    <tbody>
                                      {s.items.map((it, ii) => (
                                        <tr key={ii}>
                                          <td>{itemName(it)}</td>
                                          <td className="num">{fmtInt(it.sales_qty)}</td>
                                          <td className="num">{fmtMoney(it.sales_value)}</td>
                                          <td className="num">{fmtInt(it.closing_qty)}</td>
                                          <td className="num">{fmtMoney(it.closing_balance)}</td>
                                          <td className="num">{fmtMoney(lineField(it, "custom_last_pts"))}</td>
                                          <td className="num">{fmtMoney(lineField(it, "custom_last_ptr"))}</td>
                                          <td className="num">{fmtMoney(lineField(it, "custom_last_mrp"))}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {showProducts && prods.length > 0 && (
                <>
                  <div className="esum-mt">Top products · secondary value</div>
                  {prods.map(([n, v], i) => (
                    <div key={i} className="esum-p">
                      <div className="pn" title={n}>{n}</div>
                      <div className="tr"><div className="fl" style={{ width: (v / pMax) * 100 + "%" }} /></div>
                      <div className="pv num">{fmtMoney(v)}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
