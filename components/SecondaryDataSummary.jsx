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
    .esum-tag{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap}
    .esum-tag.g{background:var(--esum-good-bg);color:var(--esum-good)} .esum-tag.w{background:var(--esum-warn-bg);color:var(--esum-warn)} .esum-tag.b{background:var(--esum-bad-bg);color:var(--esum-bad)}
    .esum-chev{color:var(--esum-ink3);transition:transform .16s}
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
    .esum-items th.hi{color:var(--esum-accent,#2f43c9)}
    .esum-items td.hi{color:var(--esum-ink);font-weight:700;background:color-mix(in srgb,var(--esum-accent,#2f43c9) 7%,transparent)}
    .esum-p{display:grid;grid-template-columns:130px 1fr 84px;gap:10px;align-items:center;font-size:12px;margin-bottom:8px}
    .esum-p .pn{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .esum-p .tr{height:8px;background:var(--esum-inset);border-radius:5px;overflow:hidden}
    .esum-p .fl{height:100%;background:var(--esum-accent,#2f43c9);border-radius:5px}
    .esum-p .pv{text-align:right;font-weight:620}
    .esum-kpi.clk{cursor:pointer;transition:border-color .12s,box-shadow .12s}
    .esum-kpi.clk:hover{border-color:color-mix(in srgb,var(--esum-ink3) 60%,transparent);box-shadow:0 3px 10px rgba(20,30,60,.07)}
    .esum-sp[role="button"]{cursor:pointer;padding:2px 5px;margin:0 -5px;border-radius:6px}
    .esum-sp[role="button"]:hover{background:var(--esum-inset)}
    .esum-controls{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;margin-bottom:15px}
    .esum-cgroup{display:flex;align-items:center;gap:7px}
    .esum-lab{font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--esum-ink3);font-weight:700}
    .esum-seg{display:inline-flex;background:var(--esum-inset);border-radius:9px;padding:3px}
    .esum-seg button{border:none;background:transparent;font-family:inherit;font-size:11.5px;font-weight:600;color:var(--esum-ink2);padding:5px 11px;border-radius:7px;cursor:pointer}
    .esum-seg button.on{background:var(--esum-surface);color:var(--esum-ink);box-shadow:0 1px 2px rgba(20,30,60,.12)}
    .esum-chips{display:inline-flex;gap:6px;flex-wrap:wrap}
    .esum-chip{border:1px solid var(--esum-border);background:var(--esum-surface);border-radius:999px;font-family:inherit;font-size:11px;font-weight:600;color:var(--esum-ink2);padding:4px 11px;cursor:pointer}
    .esum-chip .n{opacity:.7;margin-left:4px;font-variant-numeric:tabular-nums}
    .esum-chip.on.all{background:var(--esum-ink);border-color:var(--esum-ink);color:#fff}
    .esum-chip.on.g{background:var(--esum-good-bg);border-color:color-mix(in srgb,var(--esum-good) 32%,transparent);color:var(--esum-good)}
    .esum-chip.on.w{background:var(--esum-warn-bg);border-color:color-mix(in srgb,var(--esum-warn) 32%,transparent);color:var(--esum-warn)}
    .esum-chip.on.b{background:var(--esum-bad-bg);border-color:color-mix(in srgb,var(--esum-bad) 32%,transparent);color:var(--esum-bad)}
    .esum-grpwrap{margin-bottom:15px}
    .esum-grphd{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;padding:7px 2px 8px;border-bottom:1.5px solid var(--esum-border);margin-bottom:3px}
    .esum-grphd .ttl{font-weight:680;font-size:13.5px;color:var(--esum-ink);border:none;background:none;font-family:inherit;padding:0}
    button.esum-grphd .ttl,.esum-grphd button.ttl{cursor:pointer}
    .esum-grphd .ttl .dt{font-weight:500;font-size:11px;color:var(--esum-ink3);margin-left:7px}
    .esum-grphd .tags{display:flex;gap:5px}
    .esum-grphd .tot{margin-left:auto;font-size:11.5px;color:var(--esum-ink2);font-variant-numeric:tabular-nums;white-space:nowrap}
    .esum-grphd .tot b{color:var(--esum-ink);font-weight:640}
    .esum-none{padding:22px 10px;text-align:center;color:var(--esum-ink3);font-size:12.5px}
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
// A line's contribution to a given measure (secVal/secQty/closVal/closQty).
const itemMeasure = (it, mk) =>
  mk === "sv" ? toNum(it.sales_value) : mk === "sq" ? toNum(it.sales_qty) : mk === "cv" ? toNum(it.closing_balance) : toNum(it.closing_qty);

const TAG = { Approved: "g", Waiting: "w", Rejected: "b" };
// Each KPI / card opens the popup focused on ONE measure — highlighted, sorted and titled by it.
const MEAS = {
  secVal: { key: "sv", money: true, label: "Secondary value" },
  secQty: { key: "sq", money: false, label: "Secondary qty" },
  closVal: { key: "cv", money: true, label: "Closing value" },
  closQty: { key: "cq", money: false, label: "Closing qty" },
};

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
  const [modalStatus, setModalStatus] = React.useState("all"); // all | Approved | Waiting | Rejected
  const [groupBy, setGroupBy] = React.useState("customer");     // customer | hq | employee
  const [measure, setMeasure] = React.useState("secVal");       // secVal | secQty | closVal | closQty
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

  const openModal = React.useCallback((status = "all", meas) => {
    if (typeof document !== "undefined") lastFocus.current = document.activeElement;
    setModalStatus(typeof status === "string" ? status : "all");
    if (meas && MEAS[meas]) setMeasure(meas);
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
    { t: "Secondary Value", d: sv, money: true, meas: "secVal" },
    { t: "Secondary Qty", d: sq, money: false, meas: "secQty" },
    { t: "Closing Value", d: cv, money: true, meas: "closVal" },
    { t: "Closing Qty", d: cq, money: false, meas: "closQty" },
  ].slice(0, showClosingCards ? 4 : 2);
  const fmt = (v, money) => (money ? fmtMoney(v) : fmtInt(v));

  const rejRoutes = routes.filter((r) => r.bucket === "Rejected");

  // Active measure the popup is focused on (set by whichever KPI/card was clicked).
  const meas = MEAS[measure] || MEAS.secVal;
  const mk = meas.key;
  const fmMeas = (v) => (meas.money ? fmtMoney(v) : fmtInt(v));

  // Routes in the clicked scope (status filter), then grouped by the chosen dimension.
  const fRoutes = routes.filter((r) => modalStatus === "all" || r.bucket === modalStatus);
  const scopeCustomers = new Set(fRoutes.map((r) => r.cust.id)).size;
  const groupKeyOf = (r) => (groupBy === "hq" ? r.hq || "—" : groupBy === "employee" ? r.employee || r.roleProfile : r.cust.id);
  const gm = new Map();
  fRoutes.forEach((r) => { const k = groupKeyOf(r); if (!gm.has(k)) gm.set(k, []); gm.get(k).push(r); });
  const groups = [...gm.entries()].map(([key, rs]) => {
    const t = rs.reduce((a, r) => ({ sv: a.sv + r.sv, sq: a.sq + r.sq, cv: a.cv + r.cv, cq: a.cq + r.cq }), { sv: 0, sq: 0, cv: 0, cq: 0 });
    const cc = { Approved: 0, Waiting: 0, Rejected: 0 };
    rs.forEach((r) => { cc[r.bucket] += 1; });
    const label = groupBy === "customer" ? rs[0].cust.name : groupBy === "hq" ? rs[0].hq || "—" : rs[0].employee || rs[0].roleProfile;
    const date = groupBy === "customer" ? rs[0].cust.date : "";
    return { key, label, date, routes: rs, t, cc };
  }).sort((a, b) => b.t[mk] - a.t[mk]);
  // Within a group row, show the dimensions NOT used as the group key.
  const primaryOf = (r) => (groupBy === "customer" ? r.employee || r.roleProfile : r.cust.name);
  const secondaryOf = (r) => (groupBy === "customer" ? r.hq : groupBy === "hq" ? r.employee || r.roleProfile : r.hq);

  // top products by the ACTIVE measure — within the current scope
  const prodMap = {};
  fRoutes.forEach((r) => r.items.forEach((it) => {
    const nm = itemName(it);
    prodMap[nm] = (prodMap[nm] || 0) + itemMeasure(it, mk);
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
            <button type="button" className="esum-badge" onClick={() => openModal("Rejected", "secVal")}>{counts.Rejected} REJECTED</button>
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
              ["Customers", fmtInt(customers.length), "", "", "secVal"],
              ["Secondary sales", `<span class="c">${currency}</span>${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(headline.sv)}`, `${fmtInt(headline.sq)} units`, "", "secVal"],
              ["Closing stock", `<span class="c">${currency}</span>${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(headline.cv)}`, `${fmtInt(headline.cq)} units`, "", "closVal"],
              ["Approved", fmtInt(counts.Approved), "routes", "g", "secVal"],
              ["Waiting", fmtInt(counts.Waiting), "routes", "w", "secVal"],
              ["Rejected", fmtInt(counts.Rejected), "routes", "b", "secVal"],
            ].map(([k, v, s, c, m], i) => {
              const st = c === "g" ? "Approved" : c === "w" ? "Waiting" : c === "b" ? "Rejected" : "all";
              return (
                <div key={i} className={`esum-kpi clk${c ? " " + c : ""}`} role="button" tabIndex={0}
                  onClick={() => openModal(st, m)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(st, m); } }}>
                  <div className="k">{k}</div>
                  <div className="v num" dangerouslySetInnerHTML={{ __html: v }} />
                  {s ? <div className="s num">{s}</div> : null}
                </div>
              );
            })}
          </div>

          <div className="esum-st">Approval status</div>
          <div className="esum-sub">Everything you entered, split by where it stands — approved, waiting, or rejected. Tap a card for the customer-by-customer detail.</div>
          <div className="esum-cards">
            {CARD_DEFS.map((card, i) => {
              const d = card.d, tt = d.total || 1;
              const statusFor = { g: "Approved", w: "Waiting", b: "Rejected" };
              const row = (cls, lab, val) => (
                <span className={`esum-sp ${cls}${val ? "" : " z"}`} role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); openModal(statusFor[cls], card.meas); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); openModal(statusFor[cls], card.meas); } }}
                ><i style={{ background: cls === "g" ? "var(--esum-good)" : cls === "w" ? "var(--esum-warn)" : "var(--esum-bad)" }} />{lab}<b className="num">{fmt(val, card.money)}</b></span>
              );
              return (
                <div key={i} className="esum-sc" role="button" tabIndex={0} aria-label={`${card.t} breakdown`}
                  onClick={() => openModal("all", card.meas)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal("all", card.meas); } }}>
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
                </div>
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
                <h2>{meas.label}{modalStatus !== "all" ? ` · ${modalStatus}` : ""}</h2>
                <div className="sub">{scopeCustomers} customers · {fRoutes.length} routes · grouped by {groupBy}</div>
              </div>
              <button type="button" className="esum-x" aria-label="Close" onClick={closeModal}>✕</button>
            </div>
            <div className="esum-mb">
              <div className="esum-controls">
                <div className="esum-cgroup">
                  <span className="esum-lab">Group by</span>
                  <div className="esum-seg">
                    {[["customer", "Customer"], ["hq", "HQ"], ["employee", "Employee"]].map(([v, l]) => (
                      <button key={v} type="button" className={groupBy === v ? "on" : ""} onClick={() => setGroupBy(v)}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className="esum-chips">
                  {[["all", "All", "all"], ["Approved", "Approved", "g"], ["Waiting", "Waiting", "w"], ["Rejected", "Rejected", "b"]].map(([v, l, cls]) => (
                    <button key={v} type="button" className={`esum-chip ${cls}${modalStatus === v ? " on" : ""}`} onClick={() => setModalStatus(v)}>
                      {l}<span className="n">{v === "all" ? routes.length : counts[v]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {modalStatus === "all" && rejRoutes.length > 0 && (
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
                        <div className="amt num">{fmMeas(r[mk])}</div>
                        {onFixRejected ? <button type="button" className="esum-btn" onClick={() => onFixRejected({ customer: r.cust.id, roleProfile: r.roleProfile, hq: r.hq })}>Fix &amp; resubmit</button> : null}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {groups.length === 0 ? (
                <div className="esum-none">Nothing in this view.</div>
              ) : groups.map((g, gi) => (
                <div key={gi} className="esum-grpwrap">
                  <div className="esum-grphd">
                    {groupBy === "customer" && onCustomerClick ? (
                      <button type="button" className="ttl" onClick={() => onCustomerClick(g.key)}>{g.label}{g.date ? <span className="dt">{g.date}</span> : null}</button>
                    ) : (
                      <div className="ttl">{g.label}{g.date ? <span className="dt">{g.date}</span> : null}</div>
                    )}
                    <div className="tags">
                      {g.cc.Approved ? <span className="esum-tag g" title={`${g.cc.Approved} approved`}>{g.cc.Approved}</span> : null}
                      {g.cc.Waiting ? <span className="esum-tag w" title={`${g.cc.Waiting} waiting`}>{g.cc.Waiting}</span> : null}
                      {g.cc.Rejected ? <span className="esum-tag b" title={`${g.cc.Rejected} rejected`}>{g.cc.Rejected}</span> : null}
                    </div>
                    <div className="tot"><b>{fmMeas(g.t[mk])}</b> {meas.label.toLowerCase()}</div>
                  </div>
                  {g.routes.map((r, ri) => {
                    const withItems = showItems && r.items.length > 0;
                    const sKey = `${r.cust.id}::${r.roleProfile}`;
                    const sOpen = withItems && (seatOpen[sKey] !== undefined ? seatOpen[sKey] : g.routes.length === 1);
                    const toggleSeat = () => setSeatOpen((m) => ({ ...m, [sKey]: !(m[sKey] !== undefined ? m[sKey] : g.routes.length === 1) }));
                    const sec = secondaryOf(r);
                    return (
                      <div key={ri} className="esum-seatblock">
                        <div
                          className={`esum-seathd${sOpen ? "" : " nb"}${withItems ? " clk" : ""}`}
                          role={withItems ? "button" : undefined}
                          tabIndex={withItems ? 0 : undefined}
                          aria-expanded={withItems ? sOpen : undefined}
                          onClick={withItems ? toggleSeat : undefined}
                          onKeyDown={withItems ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSeat(); } } : undefined}
                        >
                          <div className="who">
                            <span className="sid" title={r.roleProfile}>{primaryOf(r)}</span>
                            <span className={`esum-tag ${TAG[r.bucket]}`}>{r.bucket}</span>
                            {sec ? <span className="hq">{sec}</span> : null}
                          </div>
                          <span className="ap">
                            {r.bucket === "Rejected" ? <>rejected by <b>{r.approver || "approver"}</b>{r.reason ? ` — “${r.reason}”` : ""}</>
                              : r.bucket === "Approved" ? <>approved{r.approver ? <> by <b>{r.approver}</b></> : null}</>
                              : <>waiting for <b>{r.approver || "approver"}</b> approval</>}
                          </span>
                          <span className="amt num">{fmMeas(r[mk])}</span>
                          {withItems ? (
                            <svg className="esum-chev" width="13" height="13" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          ) : null}
                        </div>
                        {sOpen && (
                          <div className="esum-items">
                            <table>
                              <thead><tr><th>Item</th>
                                <th className={mk === "sq" ? "hi" : undefined}>Sec qty</th>
                                <th className={mk === "sv" ? "hi" : undefined}>Sec val</th>
                                <th className={mk === "cq" ? "hi" : undefined}>Clos qty</th>
                                <th className={mk === "cv" ? "hi" : undefined}>Clos val</th>
                                <th>PTS</th><th>PTR</th><th>MRP</th></tr></thead>
                              <tbody>
                                {r.items.map((it, ii) => (
                                  <tr key={ii}>
                                    <td>{itemName(it)}</td>
                                    <td className={`num${mk === "sq" ? " hi" : ""}`}>{fmtInt(it.sales_qty)}</td>
                                    <td className={`num${mk === "sv" ? " hi" : ""}`}>{fmtMoney(it.sales_value)}</td>
                                    <td className={`num${mk === "cq" ? " hi" : ""}`}>{fmtInt(it.closing_qty)}</td>
                                    <td className={`num${mk === "cv" ? " hi" : ""}`}>{fmtMoney(it.closing_balance)}</td>
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
              ))}

              {showProducts && prods.length > 0 && (
                <>
                  <div className="esum-mt">Top products · {meas.label.toLowerCase()}</div>
                  {prods.map(([n, v], i) => (
                    <div key={i} className="esum-p">
                      <div className="pn" title={n}>{n}</div>
                      <div className="tr"><div className="fl" style={{ width: (v / pMax) * 100 + "%" }} /></div>
                      <div className="pv num">{fmMeas(v)}</div>
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
