import React from "react";

/**
 * SecondaryApprovalSummary — a single summary CARD for the Secondary APPROVAL page.
 *
 * Where SecondaryDataSummary is entrant-facing ("what happened to everything *I*
 * entered?"), this one is APPROVER-facing (ABM / RBM): "what is waiting for me to
 * approve across my whole team, and what did I bounce back?". It sits ABOVE the
 * per-employee approval groups on the page and summarises the entire queue.
 *
 * DATA (`data` prop) — bind it to the GROUPED-BY-EMPLOYEE array the approval page
 * already builds from the Operational Tracker query (the `Object.values(byEmp)`
 * result). Each element is one employee/seat:
 *   {
 *     avatar, employee_name, role_profile, department, hq,
 *     customers: [{
 *       distributor, entry, role_profile, tracker, date,
 *       status, workflow_state, next_role,
 *       transformed, ecubix, summary,
 *       items: [{ item__name, sales_qty, sales_value, opening_qty,
 *                 closing_qty, closing_balance, rate,
 *                 custom_hq__name, custom_department__name }],
 *       sales_qty, sales_value, closing_qty, closing_value
 *     }]
 *   }
 * The component is tolerant of shape — it also accepts the array wrapped in
 * { edges:[{node}] } / { employees } / a single employee object, and (as a
 * fallback) a flat array of Operational-Tracker nodes, which it groups by
 * role_profile itself using the same rule as the page IIFE.
 *
 * MODEL — an Operational Tracker is ONE seat's slice of a Secondary Data Entry.
 * Approval is SINGLE-LEVEL: the status text itself names the approver
 * ("ABM Approval Waiting" → ABM, "RBM Approval Waiting" → RBM, "ABM Rejected",
 * "ABM Approved and Waiting for Verification"). We derive the bucket
 * (Waiting / Approved / Rejected) straight from that text — reject wins, then
 * a finished "approved" beats "approval waiting".
 *
 * NOTE: rejection reason lives on the Operational Tracker (`reason_for_rejection`),
 * not the grouped customer object the page IIFE currently emits — add it to the
 * IIFE (`reason: node.reason_for_rejection`) to populate the reason in the popup.
 */

const STYLE_ID = "elbrit-approval-summary-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .eapr{--eapr-good:#12a150;--eapr-good-bg:#e6f6ec;--eapr-warn:#c67a08;--eapr-warn-bg:#fbf1da;
      --eapr-bad:#d63a3a;--eapr-bad-bg:#fbe7e6;--eapr-ink:#1b2540;--eapr-ink2:#5c6884;--eapr-ink3:#94a0b6;
      --eapr-border:#e4e9f1;--eapr-surface:#fff;--eapr-surface2:#f5f8fc;--eapr-inset:#eef2f8;
      box-sizing:border-box;width:100%;background:var(--eapr-surface);border:1px solid var(--eapr-border);
      border-radius:16px;padding:16px 17px 17px;color:var(--eapr-ink);
      font:400 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;}
    .eapr *{box-sizing:border-box}
    .eapr .num{font-variant-numeric:tabular-nums}

    .eapr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding-bottom:14px;border-bottom:1px solid var(--eapr-border)}
    .eapr-head .l{display:flex;align-items:flex-start;gap:11px;min-width:0}
    .eapr-fold{width:26px;height:26px;color:var(--eapr-ink3);flex:none;margin-top:1px}
    .eapr-h1{margin:0;font-size:15.5px;font-weight:700;letter-spacing:-.01em;color:var(--eapr-ink)}
    .eapr-meta{font-size:12px;color:var(--eapr-ink2);margin-top:3px}
    .eapr-meta b{color:var(--eapr-ink);font-weight:600}
    .eapr-badges{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:none}
    .eapr-badge{font-size:11px;font-weight:700;letter-spacing:.03em;border-radius:8px;padding:5px 10px;white-space:nowrap;cursor:pointer;font-family:inherit;border:1px solid transparent}
    .eapr-badge:hover{filter:brightness(.97)}
    .eapr-badge.w{color:var(--eapr-warn);background:var(--eapr-warn-bg);border-color:color-mix(in srgb,var(--eapr-warn) 25%,transparent)}
    .eapr-badge.b{color:var(--eapr-bad);background:var(--eapr-bad-bg);border-color:color-mix(in srgb,var(--eapr-bad) 25%,transparent)}
    .eapr-badge.ok{color:var(--eapr-good);background:var(--eapr-good-bg);border-color:color-mix(in srgb,var(--eapr-good) 25%,transparent);cursor:default}

    .eapr-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:9px;margin-top:14px}
    .eapr-kpi{background:var(--eapr-surface2);border:1px solid var(--eapr-border);border-radius:11px;padding:11px 12px}
    .eapr-kpi .k{font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--eapr-ink3);font-weight:700}
    .eapr-kpi .v{font-size:21px;font-weight:700;letter-spacing:-.02em;margin-top:7px;line-height:1.05}
    .eapr-kpi .v .c{font-size:11px;color:var(--eapr-ink2);font-weight:600}
    .eapr-kpi .s{font-size:10.5px;color:var(--eapr-ink3);margin-top:4px}
    .eapr-kpi.g{background:var(--eapr-good-bg);border-color:color-mix(in srgb,var(--eapr-good) 22%,transparent)} .eapr-kpi.g .v{color:var(--eapr-good)}
    .eapr-kpi.w{background:var(--eapr-warn-bg);border-color:color-mix(in srgb,var(--eapr-warn) 24%,transparent)} .eapr-kpi.w .v{color:var(--eapr-warn)}
    .eapr-kpi.b{background:var(--eapr-bad-bg);border-color:color-mix(in srgb,var(--eapr-bad) 24%,transparent)} .eapr-kpi.b .v{color:var(--eapr-bad)}

    .eapr-st{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--eapr-ink3);font-weight:700;margin:20px 0 4px}
    .eapr-sub{font-size:11.5px;color:var(--eapr-ink2);margin-bottom:11px}

    /* per-employee roster (card face) */
    .eapr-roster{display:flex;flex-direction:column;gap:9px}
    .eapr-emp{display:block;width:100%;text-align:left;font-family:inherit;color:inherit;cursor:pointer;
      background:var(--eapr-surface);border:1px solid var(--eapr-border);border-radius:12px;padding:12px 13px;
      transition:border-color .12s,box-shadow .12s,transform .12s}
    .eapr-emp:hover{border-color:var(--eapr-accent,#2f43c9);transform:translateY(-1px);box-shadow:0 8px 22px rgba(20,30,60,.1)}
    .eapr-emp:focus-visible{outline:2px solid var(--eapr-accent,#2f43c9);outline-offset:2px}
    .eapr-emptop{display:flex;align-items:center;gap:11px}
    .eapr-av{flex:none;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-size:14px;font-weight:700;color:#fff;background:var(--eapr-accent,#2f43c9);letter-spacing:.01em}
    .eapr-who{min-width:0;flex:1 1 auto}
    .eapr-who .nm{font-size:14px;font-weight:700;color:var(--eapr-ink);letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .eapr-who .mt{font-size:11px;color:var(--eapr-ink2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .eapr-who .mt code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10.5px;color:var(--eapr-ink2)}
    .eapr-emptot{flex:none;text-align:right}
    .eapr-emptot .tv{font-size:15px;font-weight:700;letter-spacing:-.02em;color:var(--eapr-ink)}
    .eapr-emptot .tc{font-size:10px;color:var(--eapr-ink3);font-weight:600;margin-top:2px}
    .eapr-emptot .arw{color:var(--eapr-ink3);margin-left:6px}
    .eapr-bar{display:flex;height:7px;border-radius:5px;overflow:hidden;background:var(--eapr-inset);margin-top:11px}
    .eapr-bar span{height:100%}
    .eapr-g{background:var(--eapr-good)} .eapr-w{background:var(--eapr-warn)} .eapr-b{background:var(--eapr-bad)}
    .eapr-mini{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px}
    .eapr-mini span{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--eapr-ink2)}
    .eapr-mini i{width:8px;height:8px;border-radius:2px;flex:none}
    .eapr-mini b{color:var(--eapr-ink);font-weight:640}
    .eapr-mini span.z{opacity:.4}

    .eapr-empty{padding:26px 10px;text-align:center;color:var(--eapr-ink3);font-size:12.5px}

    /* modal */
    .eapr-ov{position:fixed;inset:0;background:rgba(12,18,30,.55);display:flex;align-items:flex-start;justify-content:center;padding:34px 16px;z-index:1000;overflow-y:auto}
    .eapr-modal{background:var(--eapr-surface);border:1px solid var(--eapr-border);border-radius:16px;box-shadow:0 18px 52px rgba(20,30,60,.28);width:100%;max-width:820px;overflow:hidden}
    .eapr-mh{padding:15px 18px;border-bottom:1px solid var(--eapr-border);display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .eapr-mh h2{margin:0;font-size:15px;font-weight:700}
    .eapr-mh .sub{font-size:12px;color:var(--eapr-ink2);margin-top:3px}
    .eapr-x{border:1px solid var(--eapr-border);background:var(--eapr-surface);color:var(--eapr-ink2);border-radius:9px;width:31px;height:31px;cursor:pointer;font-size:15px;flex:none;line-height:1}
    .eapr-x:hover{background:var(--eapr-inset)}
    .eapr-mb{padding:15px 18px 20px;max-height:calc(100vh - 180px);overflow-y:auto}
    .eapr-mt{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:var(--eapr-ink2);margin:18px 0 9px;display:flex;align-items:center;gap:8px}
    .eapr-mt:first-child{margin-top:0}
    .eapr-mt .cnt{background:var(--eapr-bad);color:#fff;border-radius:999px;font-size:10px;padding:1px 7px}

    .eapr-rej{display:grid;grid-template-columns:1fr auto;gap:6px 14px;align-items:center;padding:11px 12px;border:1px solid color-mix(in srgb,var(--eapr-bad) 22%,var(--eapr-border));background:var(--eapr-bad-bg);border-radius:10px;margin-bottom:8px}
    .eapr-rej .rn{font-weight:650;font-size:13px}
    .eapr-rej .rs{font-size:11.5px;color:var(--eapr-ink2);margin-top:2px}
    .eapr-rej .rs code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:var(--eapr-bad);background:color-mix(in srgb,var(--eapr-bad) 12%,transparent);padding:1px 6px;border-radius:5px}
    .eapr-rej .rr{font-size:12px;margin-top:5px}.eapr-rej .rr .q{color:var(--eapr-bad);font-weight:600}
    .eapr-rej .right{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:7px}
    .eapr-rej .amt{font-weight:700;font-size:14px}
    .eapr-btn{border:1px solid var(--eapr-accent,#2f43c9);background:var(--eapr-accent,#2f43c9);color:#fff;border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
    .eapr-btn:hover{filter:brightness(.96)}

    /* employee groups in modal */
    .eapr-grp{border:1px solid var(--eapr-border);border-radius:11px;overflow:hidden;margin-bottom:9px}
    .eapr-ghd{display:flex;align-items:center;gap:11px;padding:11px 12px;cursor:pointer;background:var(--eapr-surface)}
    .eapr-ghd:hover{background:var(--eapr-surface2)}
    .eapr-ghd .eapr-av{width:30px;height:30px;font-size:12.5px}
    .eapr-ghd .gn{min-width:0;flex:1 1 auto}
    .eapr-ghd .gn .n{font-weight:660;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .eapr-ghd .gn .m{font-size:10.5px;color:var(--eapr-ink3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .eapr-ghd .gtags{display:flex;gap:5px;flex:none}
    .eapr-ghd .gamt{font-weight:680;font-size:13px;flex:none;white-space:nowrap;margin-left:2px}
    .eapr-chev{color:var(--eapr-ink3);transition:transform .16s;flex:none}
    .eapr-ghd[aria-expanded="true"] .eapr-chev,.eapr-crow[aria-expanded="true"] .eapr-chev{transform:rotate(90deg)}
    .eapr-tag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;white-space:nowrap}
    .eapr-tag.g{background:var(--eapr-good-bg);color:var(--eapr-good)} .eapr-tag.w{background:var(--eapr-warn-bg);color:var(--eapr-warn)} .eapr-tag.b{background:var(--eapr-bad-bg);color:var(--eapr-bad)}

    .eapr-glist{background:var(--eapr-surface2);border-top:1px solid var(--eapr-border);padding:8px}
    .eapr-cust{border:1px solid var(--eapr-border);border-radius:9px;overflow:hidden;margin-bottom:7px;background:var(--eapr-surface)}
    .eapr-cust:last-child{margin-bottom:0}
    .eapr-crow{display:grid;grid-template-columns:1.7fr auto auto auto 18px;gap:10px;align-items:center;padding:10px 12px;cursor:pointer}
    .eapr-crow:hover{background:var(--eapr-surface2)}
    .eapr-crow .cn{min-width:0}
    .eapr-crow .cn .d{font-weight:640;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .eapr-crow .cn .dt{font-size:10px;color:var(--eapr-ink3);margin-top:1px}
    .eapr-crow .r{text-align:right;font-size:12px;font-weight:620;white-space:nowrap}
    .eapr-crow .r .q{color:var(--eapr-ink3);font-weight:500;font-size:10px;margin-left:2px}
    .eapr-crow .r .rl{display:block;font-size:8.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--eapr-ink3);font-weight:700}
    .eapr-note{padding:0 12px 10px;font-size:11px;color:var(--eapr-ink2)}
    .eapr-note b{color:var(--eapr-ink);font-weight:600}
    .eapr-note .q{color:var(--eapr-bad)}
    .eapr-links{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 10px}
    .eapr-lk{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:var(--eapr-accent,#2f43c9);background:color-mix(in srgb,var(--eapr-accent,#2f43c9) 9%,transparent);border:1px solid color-mix(in srgb,var(--eapr-accent,#2f43c9) 22%,transparent);border-radius:7px;padding:4px 9px;text-decoration:none;cursor:pointer}
    .eapr-lk:hover{filter:brightness(.97)}
    .eapr-items{overflow-x:auto;padding:0 12px 11px}
    .eapr-items table{border-collapse:collapse;width:100%;font-size:11.5px;min-width:560px}
    .eapr-items th{text-align:right;font-size:9px;letter-spacing:.03em;text-transform:uppercase;color:var(--eapr-ink3);font-weight:700;padding:5px 8px;border-bottom:1px solid var(--eapr-border)}
    .eapr-items th:first-child,.eapr-items td:first-child{text-align:left}
    .eapr-items td{padding:6px 8px;border-bottom:1px solid var(--eapr-border);text-align:right;color:var(--eapr-ink2)}
    .eapr-items td:first-child{color:var(--eapr-ink);font-weight:600}.eapr-items tr:last-child td{border-bottom:none}

    .eapr-p{display:grid;grid-template-columns:150px 1fr 92px;gap:10px;align-items:center;font-size:12px;margin-bottom:8px}
    .eapr-p .pn{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .eapr-p .tr{height:8px;background:var(--eapr-inset);border-radius:5px;overflow:hidden}
    .eapr-p .fl{height:100%;background:var(--eapr-accent,#2f43c9);border-radius:5px}
    .eapr-p .pv{text-align:right;font-weight:620}

    @media(max-width:860px){.eapr-kpis{grid-template-columns:repeat(3,1fr)}}
    @media(max-width:520px){.eapr-kpis{grid-template-columns:repeat(2,1fr)}.eapr-crow{grid-template-columns:1.4fr auto 18px}.eapr-crow .r.clos{display:none}}
  `;
  document.head.appendChild(el);
}

/* ---------- data helpers ---------- */
const toNum = (x) => {
  if (x === null || x === undefined || x === "") return 0;
  const n = typeof x === "number" ? x : parseFloat(String(x).replace(/,/g, ""));
  return isFinite(n) ? n : 0;
};
const sumBy = (arr, key) => (Array.isArray(arr) ? arr.reduce((a, x) => a + toNum(x[key]), 0) : 0);
const initial = (s) => String(s || "").trim().charAt(0).toUpperCase() || "?";

// Approval bucket from status text. "reject" wins; a finished "approved" beats "approval waiting".
function bucketOf(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("reject")) return "Rejected";
  if (s.includes("approved")) return "Approved";
  return "Waiting";
}
// The pending approver role — prefer an explicit next_role, else the leading token of the status.
function approverOf(status, nextRole) {
  const nr = String(nextRole || "").trim();
  if (nr && nr !== "—") return nr;
  const t = String(status || "").trim().split(/\s+/)[0];
  return /^[A-Za-z]{2,4}$/.test(t) ? t : "";
}

const itemName = (it) => (it.item && it.item.item_name) || it.item__name || it.item || "—";
// A grouped customer's role_profile match, whether custom_role_profile is a string or an object.
const rpOf = (it) =>
  it.custom_role_profile__name ||
  (it.custom_role_profile && (it.custom_role_profile.role_profile || it.custom_role_profile.name || it.custom_role_profile)) ||
  "";

/* ---------- normalisation ---------- */
// One approval line (an Operational Tracker), normalised. Numbers prefer the
// pre-computed grouped fields, then fall back to summing the item lines.
function normCustomer(c) {
  const items = Array.isArray(c.items) ? c.items : [];
  const status = c.status || c.workflow_state || "";
  const has = (v) => v !== undefined && v !== null && v !== "";
  const sv = has(c.sales_value) ? toNum(c.sales_value) : has(c.data) ? toNum(c.data) : sumBy(items, "sales_value");
  const sq = has(c.sales_qty) ? toNum(c.sales_qty) : sumBy(items, "sales_qty");
  const cv = has(c.closing_value) ? toNum(c.closing_value) : has(c.closing_balance) ? toNum(c.closing_balance) : sumBy(items, "closing_balance");
  const cq = has(c.closing_qty) ? toNum(c.closing_qty) : sumBy(items, "closing_qty");
  return {
    distributor: c.distributor || c.distributor__name || c.entry || c.tracker || "—",
    entry: c.entry,
    tracker: c.tracker,
    roleProfile: c.role_profile,
    date: c.date || "",
    status,
    bucket: bucketOf(status),
    approver: approverOf(status, c.next_role),
    reason: c.reason || c.reason_for_rejection || "",
    transformed: c.transformed,
    ecubix: c.ecubix,
    summary: c.summary,
    items,
    sv, sq, cv, cq,
  };
}

function aggregate(customers) {
  const agg = { n: customers.length, sv: 0, sq: 0, cv: 0, cq: 0, counts: { Approved: 0, Waiting: 0, Rejected: 0 }, byVal: { Approved: 0, Waiting: 0, Rejected: 0 } };
  customers.forEach((c) => {
    agg.sv += c.sv; agg.sq += c.sq; agg.cv += c.cv; agg.cq += c.cq;
    agg.counts[c.bucket] += 1;
    agg.byVal[c.bucket] += c.sv;
  });
  return agg;
}

function normEmployee(e) {
  if (!e || typeof e !== "object") return null;
  const customers = (Array.isArray(e.customers) ? e.customers : []).map(normCustomer);
  const employee_name = e.employee_name || e.role_profile || "—";
  return {
    roleProfile: e.role_profile || employee_name,
    name: employee_name,
    avatar: e.avatar || initial(employee_name),
    department: e.department || "",
    hq: e.hq || "",
    customers,
    agg: aggregate(customers),
  };
}

// Fallback: group a flat array of Operational-Tracker NODES by role_profile,
// mirroring the approval page's IIFE — so the card also works bound straight to
// the tracker connection (no pre-grouping step).
function groupTrackers(nodes) {
  const byEmp = {};
  nodes.forEach((node) => {
    const rp = node.role_profile__name || node.role_profile || "—";
    const entry = node.custom_ref_secondary_data_entry && typeof node.custom_ref_secondary_data_entry === "object" ? node.custom_ref_secondary_data_entry : {};
    const all = Array.isArray(entry.items) ? entry.items : Array.isArray(node.items) ? node.items : [];
    let items = all.filter((it) => rpOf(it) === rp);
    if (!items.length) items = all;
    const employee_name =
      (items[0] && items[0].custom_role_profile && items[0].custom_role_profile.custom_employee_id && items[0].custom_role_profile.custom_employee_id.employee_name) ||
      node.employee_name || rp;
    const department = node.department__name || node.department || (items[0] && items[0].custom_department__name) || "";
    const hq = node.hq__name || node.hq || (items[0] && items[0].custom_hq__name) || "";
    const emp = (byEmp[rp] = byEmp[rp] || { avatar: initial(employee_name !== "—" ? employee_name : rp), employee_name, role_profile: rp, department, hq, customers: [] });
    emp.customers.push({
      distributor: entry.distributor__name || node.distributor__name || node.distributor || node.reference || "",
      entry: entry.name || (typeof node.custom_ref_secondary_data_entry === "string" ? node.custom_ref_secondary_data_entry : node.reference),
      role_profile: rp,
      tracker: node.name,
      date: entry.date || node.date,
      status: node.status__name || node.status || node.workflow_state__name || node.workflow_state || (entry.custom_status_tracker && entry.custom_status_tracker[0] && entry.custom_status_tracker[0].status__name) || "",
      workflow_state: node.workflow_state__name || node.workflow_state || "",
      next_role: node.next_role__name || node.next_role || "",
      reason: node.reason_for_rejection || "",
      transformed: entry.custom_transformed_data,
      ecubix: entry.custom_ecubix_data,
      summary: entry.custom_summary,
      items,
      sales_value: node.data,
    });
  });
  return Object.values(byEmp);
}

// Accept the many shapes and return an array of normalised employees.
function toEmployees(data) {
  if (!data) return [];
  let d = data;
  if (d.employees) d = d.employees;
  if (d.edges && Array.isArray(d.edges)) d = d.edges.map((x) => (x && x.node ? x.node : x));
  if (!Array.isArray(d)) {
    if (Array.isArray(d.customers)) return [normEmployee(d)].filter(Boolean); // single employee
    if (d.data && Array.isArray(d.data)) d = d.data;
    else return [];
  }
  const arr = d.map((x) => (x && x.node ? x.node : x)).filter(Boolean);
  const looksGrouped = arr.some((e) => e && Array.isArray(e.customers));
  const src = looksGrouped ? arr : groupTrackers(arr);
  return src.map(normEmployee).filter(Boolean);
}

// Resolve an ERP file path into an openable URL (mirrors ApprovalCard).
function resolveFileUrl(path, baseUrl) {
  if (path === null || path === undefined) return null;
  const p = String(path).trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return encodeURI(p);
  const base = (baseUrl || "").replace(/\/+$/, "");
  return encodeURI(`${base}${p.startsWith("/") ? "" : "/"}${p}`);
}

const TAG = { Approved: "g", Waiting: "w", Rejected: "b" };

/* ---------- component ---------- */
export default function SecondaryApprovalSummary({
  data,
  title = "Approval queue",
  periodLabel = "",
  currency = "₹",
  locale = "en-IN",
  showProducts = true,
  showItems = true,
  openByDefault = false,
  emptyText = "Nothing is waiting for your approval.",
  accentColor = "#2f43c9",
  fileBaseUrl = "",
  onEmployeeClick,
  onCustomerClick,
  onOpenEntry,
  className,
  style,
}) {
  ensureStyles();
  const [open, setOpen] = React.useState(Boolean(openByDefault));
  const [empOpen, setEmpOpen] = React.useState(() => ({}));
  const [custOpen, setCustOpen] = React.useState(() => ({}));
  const lastFocus = React.useRef(null);

  const fmtMoney = React.useCallback(
    (v) => `${currency}${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(toNum(v))}`,
    [currency, locale]
  );
  const fmtInt = React.useCallback((v) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(toNum(v)), [locale]);

  const model = React.useMemo(() => {
    const employees = toEmployees(data);
    const customers = employees.flatMap((e) => e.customers.map((c) => ({ ...c, emp: e })));
    const counts = { Approved: 0, Waiting: 0, Rejected: 0 };
    const headline = { sv: 0, sq: 0, cv: 0, cq: 0 };
    customers.forEach((c) => {
      counts[c.bucket] += 1;
      headline.sv += c.sv; headline.sq += c.sq; headline.cv += c.cv; headline.cq += c.cq;
    });
    const hqs = new Set(employees.map((e) => e.hq).filter(Boolean));
    return { employees, customers, counts, headline, nHq: hqs.size };
  }, [data]);

  const { employees, customers, counts, headline, nHq } = model;
  const isEmpty = employees.length === 0;

  const openModal = React.useCallback((focusRp) => {
    if (typeof document !== "undefined") lastFocus.current = document.activeElement;
    if (focusRp) setEmpOpen((m) => ({ ...m, [focusRp]: true }));
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

  const cssVars = { "--eapr-accent": accentColor, ...style };

  // top products across the whole queue, by secondary value
  const prodMap = {};
  customers.forEach((c) => c.items.forEach((it) => {
    const nm = itemName(it);
    prodMap[nm] = (prodMap[nm] || 0) + toNum(it.sales_value);
  }));
  const prods = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const pMax = prods.length ? prods[0][1] : 1;

  const rejCustomers = customers.filter((c) => c.bucket === "Rejected");

  const miniSplit = (agg) => {
    const rows = [
      ["w", "Waiting", agg.counts.Waiting],
      ["g", "Approved", agg.counts.Approved],
      ["b", "Rejected", agg.counts.Rejected],
    ];
    return rows.map(([cls, lab, n]) => (
      <span key={cls} className={n ? "" : "z"}>
        <i style={{ background: cls === "g" ? "var(--eapr-good)" : cls === "w" ? "var(--eapr-warn)" : "var(--eapr-bad)" }} />
        {lab} <b className="num">{fmtInt(n)}</b>
      </span>
    ));
  };
  const statusBar = (agg) => {
    const tt = agg.n || 1;
    return (
      <div className="eapr-bar">
        <span className="eapr-g" style={{ width: (agg.counts.Approved / tt) * 100 + "%" }} />
        <span className="eapr-w" style={{ width: (agg.counts.Waiting / tt) * 100 + "%" }} />
        <span className="eapr-b" style={{ width: (agg.counts.Rejected / tt) * 100 + "%" }} />
      </div>
    );
  };

  return (
    <div className={`eapr${className ? " " + className : ""}`} style={cssVars}>
      <div className="eapr-head">
        <div className="l">
          <svg className="eapr-fold" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4M7.8 21h8.4c1.6 0 2.9-1.3 2.9-2.9V8.5L14 3.2H7.8C6.2 3.2 4.9 4.5 4.9 6.1v12c0 1.6 1.3 2.9 2.9 2.9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          <div>
            <h1 className="eapr-h1">{periodLabel ? `${periodLabel} · ${title}` : title}</h1>
            <div className="eapr-meta">
              <b>{employees.length}</b> team members · <b>{customers.length}</b> submissions · <b>{nHq}</b> HQs
            </div>
          </div>
        </div>
        {!isEmpty && (
          <div className="eapr-badges">
            {counts.Waiting > 0 && <button type="button" className="eapr-badge w" onClick={() => openModal()}>{counts.Waiting} TO REVIEW</button>}
            {counts.Rejected > 0 && <button type="button" className="eapr-badge b" onClick={() => openModal()}>{counts.Rejected} REJECTED</button>}
            {counts.Waiting === 0 && counts.Rejected === 0 && <span className="eapr-badge ok">ALL CLEAR</span>}
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="eapr-empty">{emptyText}</div>
      ) : (
        <>
          <div className="eapr-kpis">
            {[
              ["Team members", fmtInt(employees.length), "", ""],
              ["Submissions", fmtInt(customers.length), `${nHq} HQs`, ""],
              ["Secondary sales", `<span class="c">${currency}</span>${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(headline.sv)}`, `${fmtInt(headline.sq)} units`, ""],
              ["Closing stock", `<span class="c">${currency}</span>${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(headline.cv)}`, `${fmtInt(headline.cq)} units`, ""],
              ["Waiting", fmtInt(counts.Waiting), "to review", "w"],
              ["Rejected", fmtInt(counts.Rejected), "sent back", "b"],
            ].map(([k, v, s, c], i) => (
              <div key={i} className={`eapr-kpi${c ? " " + c : ""}`}>
                <div className="k">{k}</div>
                <div className="v num" dangerouslySetInnerHTML={{ __html: v }} />
                {s ? <div className="s num">{s}</div> : null}
              </div>
            ))}
          </div>

          <div className="eapr-st">Who’s waiting on you</div>
          <div className="eapr-sub">Each team member’s submissions, split by where they stand. Tap anyone for the customer-by-customer detail.</div>
          <div className="eapr-roster">
            {employees.map((e, i) => (
              <button
                key={i}
                type="button"
                className="eapr-emp"
                onClick={() => { if (onEmployeeClick) onEmployeeClick(e.roleProfile); openModal(e.roleProfile); }}
                aria-label={`${e.name} — ${e.agg.n} submissions`}
              >
                <div className="eapr-emptop">
                  <span className="eapr-av">{e.avatar}</span>
                  <div className="eapr-who">
                    <div className="nm">{e.name}</div>
                    <div className="mt"><code>{e.roleProfile}</code>{e.hq ? ` · ${e.hq}` : ""} · {e.agg.n} submission{e.agg.n === 1 ? "" : "s"}</div>
                  </div>
                  <div className="eapr-emptot">
                    <div className="tv num">{fmtMoney(e.agg.sv)}</div>
                    <div className="tc">secondary<span className="arw">→</span></div>
                  </div>
                </div>
                {statusBar(e.agg)}
                <div className="eapr-mini">{miniSplit(e.agg)}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {open && (
        <div className="eapr-ov" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="eapr-modal">
            <div className="eapr-mh">
              <div>
                <h2>{periodLabel ? `${periodLabel} · ${title}` : title}</h2>
                <div className="sub">{employees.length} team members · {customers.length} submissions · {counts.Waiting} to review</div>
              </div>
              <button type="button" className="eapr-x" aria-label="Close" onClick={closeModal}>✕</button>
            </div>
            <div className="eapr-mb">
              {rejCustomers.length > 0 && (
                <>
                  <div className="eapr-mt">Rejected · sent back to entrant <span className="cnt">{rejCustomers.length}</span></div>
                  {rejCustomers.map((c, i) => (
                    <div key={i} className="eapr-rej">
                      <div>
                        <div className="rn">{c.distributor}</div>
                        <div className="rs"><code>{c.emp.name}</code>{c.approver ? ` · rejected by ${c.approver}` : ""}{c.emp.hq ? ` · ${c.emp.hq}` : ""}{c.date ? ` · ${c.date}` : ""}</div>
                        {c.reason ? <div className="rr">Reason: <span className="q">“{c.reason}”</span></div> : null}
                      </div>
                      <div className="right">
                        <div className="amt num">{fmtMoney(c.sv)}</div>
                        {onOpenEntry ? <button type="button" className="eapr-btn" onClick={() => onOpenEntry({ entry: c.entry, tracker: c.tracker, roleProfile: c.roleProfile })}>Open entry</button> : null}
                      </div>
                    </div>
                  ))}
                </>
              )}

              <div className="eapr-mt">Team submissions</div>
              {employees.map((e, ei) => {
                const eOpen = empOpen[e.roleProfile] !== undefined ? empOpen[e.roleProfile] : false;
                return (
                  <div key={ei} className="eapr-grp">
                    <div className="eapr-ghd" role="button" tabIndex={0} aria-expanded={eOpen}
                      onClick={() => setEmpOpen((m) => ({ ...m, [e.roleProfile]: !eOpen }))}
                      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setEmpOpen((m) => ({ ...m, [e.roleProfile]: !eOpen })); } }}>
                      <span className="eapr-av">{e.avatar}</span>
                      <div className="gn">
                        <div className="n">{e.name}</div>
                        <div className="m">{e.roleProfile}{e.hq ? ` · ${e.hq}` : ""} · {e.agg.n} submission{e.agg.n === 1 ? "" : "s"}</div>
                      </div>
                      <div className="gtags">
                        {e.agg.counts.Waiting > 0 && <span className="eapr-tag w">{e.agg.counts.Waiting} waiting</span>}
                        {e.agg.counts.Rejected > 0 && <span className="eapr-tag b">{e.agg.counts.Rejected} rej</span>}
                        {e.agg.counts.Approved > 0 && <span className="eapr-tag g">{e.agg.counts.Approved} appr</span>}
                      </div>
                      <span className="gamt num">{fmtMoney(e.agg.sv)}</span>
                      <svg className="eapr-chev" width="14" height="14" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                    {eOpen && (
                      <div className="eapr-glist">
                        {e.customers.map((c, ci) => {
                          const cKey = `${e.roleProfile}::${ci}`;
                          const withItems = showItems && c.items.length > 0;
                          const cOpen = withItems && !!custOpen[cKey];
                          const links = [
                            c.transformed && { label: "Transformed", url: resolveFileUrl(c.transformed, fileBaseUrl) },
                            c.ecubix && { label: "Ecubix", url: resolveFileUrl(c.ecubix, fileBaseUrl) },
                            c.summary && { label: "Summary", url: resolveFileUrl(c.summary, fileBaseUrl) },
                          ].filter((l) => l && l.url);
                          return (
                            <div key={ci} className="eapr-cust">
                              <div className="eapr-crow" role="button" tabIndex={0} aria-expanded={cOpen}
                                onClick={() => { if (onCustomerClick) onCustomerClick({ entry: c.entry, tracker: c.tracker, roleProfile: c.roleProfile }); if (withItems) setCustOpen((m) => ({ ...m, [cKey]: !cOpen })); }}
                                onKeyDown={(ev) => { if ((ev.key === "Enter" || ev.key === " ") && withItems) { ev.preventDefault(); setCustOpen((m) => ({ ...m, [cKey]: !cOpen })); } }}>
                                <div className="cn">
                                  <div className="d">{c.distributor}</div>
                                  {c.date ? <div className="dt num">{c.date}</div> : null}
                                </div>
                                <span className={`eapr-tag ${TAG[c.bucket]}`}>{c.bucket}</span>
                                <div className="r"><span className="rl">Sales</span>{fmtMoney(c.sv)}<span className="q">{fmtInt(c.sq)}u</span></div>
                                <div className="r clos"><span className="rl">Closing</span>{fmtMoney(c.cv)}<span className="q">{fmtInt(c.cq)}u</span></div>
                                {withItems
                                  ? <svg className="eapr-chev" width="13" height="13" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                  : <span />}
                              </div>
                              <div className="eapr-note">
                                {c.bucket === "Rejected" ? <>Rejected{c.approver ? <> by <b>{c.approver}</b></> : null}{c.reason ? <> — <span className="q">“{c.reason}”</span></> : ""}</>
                                  : c.bucket === "Approved" ? <>Approved{c.approver ? <> by <b>{c.approver}</b></> : null} — moving up the chain</>
                                  : <>Waiting for <b>{c.approver || "approver"}</b> to review</>}
                              </div>
                              {links.length > 0 && (
                                <div className="eapr-links">
                                  {links.map((l, li) => (
                                    <a key={li} className="eapr-lk" href={l.url} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}>{l.label}</a>
                                  ))}
                                </div>
                              )}
                              {cOpen && (
                                <div className="eapr-items">
                                  <table>
                                    <thead><tr><th>Item</th><th>Opening</th><th>Sec qty</th><th>Sec val</th><th>Closing qty</th><th>Clos val</th><th>Rate</th></tr></thead>
                                    <tbody>
                                      {c.items.map((it, ii) => (
                                        <tr key={ii}>
                                          <td>{itemName(it)}</td>
                                          <td className="num">{fmtInt(it.opening_qty)}</td>
                                          <td className="num">{fmtInt(it.sales_qty)}</td>
                                          <td className="num">{fmtMoney(it.sales_value)}</td>
                                          <td className="num">{fmtInt(it.closing_qty)}</td>
                                          <td className="num">{fmtMoney(it.closing_balance)}</td>
                                          <td className="num">{fmtMoney(it.rate)}</td>
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
                  <div className="eapr-mt">Top products · secondary value</div>
                  {prods.map(([n, v], i) => (
                    <div key={i} className="eapr-p">
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
