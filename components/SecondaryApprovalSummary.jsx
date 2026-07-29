import React from "react";

/**
 * SecondaryApprovalSummary — a compact, self-contained SUMMARY card for the
 * Secondary APPROVAL page. It sits above the per-employee approval groups and
 * gives the approver (ABM / RBM / SM) the whole queue at a glance. It is a
 * summary ONLY — no click-through, no employee-by-employee drill-down (that
 * would defeat the purpose of a summary).
 *
 * It shows:
 *   1. COUNTS — Employees, Customers (submissions), and how many are
 *      Waiting / Approved / Rejected.
 *   2. VALUE TRACKING — Secondary Value/Qty and Closing Value/Qty, each split
 *      by approval bucket (Waiting / Approved / Rejected) with a proportion bar.
 *
 * DATA (`data` prop) — bind to the grouped-by-employee array the approval page
 * already builds from the Operational Tracker query (Object.values(byEmp)):
 *   [{ employee_name, role_profile, hq,
 *      customers: [{ status (or workflow_state),
 *                    sales_qty, sales_value, closing_qty, closing_value }] }]
 * Shape-tolerant — also accepts { edges:[{node}] } / { employees } / a single
 * employee, or a flat array of Operational-Tracker nodes (grouped by role_profile
 * automatically). Bucket comes from the status text: contains "reject" → Rejected,
 * else contains "approved" → Approved, else Waiting.
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

    .eapr-head{display:flex;align-items:flex-start;gap:11px;margin-bottom:2px}
    .eapr-fold{width:26px;height:26px;color:var(--eapr-ink3);flex:none;margin-top:1px}
    .eapr-h1{margin:0;font-size:15.5px;font-weight:700;letter-spacing:-.01em;color:var(--eapr-ink)}
    .eapr-meta{font-size:12px;color:var(--eapr-ink2);margin-top:3px}
    .eapr-meta b{color:var(--eapr-ink);font-weight:600}

    /* counts row */
    .eapr-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-top:14px}
    .eapr-kpi{border:1px solid var(--eapr-border);border-radius:11px;padding:11px 13px;background:var(--eapr-surface2)}
    .eapr-kpi .k{font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--eapr-ink3);font-weight:700}
    .eapr-kpi .v{font-size:23px;font-weight:800;letter-spacing:-.02em;margin-top:6px;line-height:1;color:var(--eapr-ink)}
    .eapr-kpi .v .q{font-size:12px;font-weight:600;letter-spacing:0;opacity:.72;margin-left:2px}
    .eapr-kpi.w{background:var(--eapr-warn-bg);border-color:color-mix(in srgb,var(--eapr-warn) 24%,transparent)} .eapr-kpi.w .v,.eapr-kpi.w .k{color:var(--eapr-warn)}
    .eapr-kpi.g{background:var(--eapr-good-bg);border-color:color-mix(in srgb,var(--eapr-good) 22%,transparent)} .eapr-kpi.g .v,.eapr-kpi.g .k{color:var(--eapr-good)}
    .eapr-kpi.b{background:var(--eapr-bad-bg);border-color:color-mix(in srgb,var(--eapr-bad) 24%,transparent)} .eapr-kpi.b .v,.eapr-kpi.b .k{color:var(--eapr-bad)}

    /* value tracking */
    .eapr-vt{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--eapr-ink3);font-weight:700;margin:20px 0 10px}
    .eapr-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:11px}
    .eapr-sc{background:var(--eapr-surface);border:1px solid var(--eapr-border);border-radius:12px;padding:13px 14px 12px}
    .eapr-sc .t{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--eapr-ink);font-weight:700}
    .eapr-sc .tot{font-size:22px;font-weight:800;letter-spacing:-.02em;margin-top:6px;line-height:1}
    .eapr-bar{display:flex;height:8px;border-radius:5px;overflow:hidden;background:var(--eapr-inset);margin-top:11px}
    .eapr-bar span{height:100%}
    .eapr-g{background:var(--eapr-good)} .eapr-w{background:var(--eapr-warn)} .eapr-b{background:var(--eapr-bad)}
    .eapr-splits{display:flex;flex-direction:column;gap:5px;margin-top:11px}
    .eapr-sp{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--eapr-ink2)}
    .eapr-sp i{width:9px;height:9px;border-radius:2px;flex:none}
    .eapr-sp b{margin-left:auto;color:var(--eapr-ink);font-weight:650}
    .eapr-sp.z{opacity:.42}

    .eapr-empty{padding:26px 10px;text-align:center;color:var(--eapr-ink3);font-size:12.5px}

    @media(max-width:680px){.eapr-kpis{grid-template-columns:repeat(3,1fr)}.eapr-cards{grid-template-columns:1fr}}
    @media(max-width:420px){.eapr-kpis{grid-template-columns:repeat(2,1fr)}}
  `;
  document.head.appendChild(el);
}

/* ---------- helpers ---------- */
const toNum = (x) => {
  if (x === null || x === undefined || x === "") return 0;
  const n = typeof x === "number" ? x : parseFloat(String(x).replace(/,/g, ""));
  return isFinite(n) ? n : 0;
};
const sumBy = (arr, key) => (Array.isArray(arr) ? arr.reduce((a, x) => a + toNum(x[key]), 0) : 0);
const initial = (s) => String(s || "").trim().charAt(0).toUpperCase() || "?";

// bucket from status text: "reject" wins, then a finished "approved", else Waiting.
function bucketOf(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("reject")) return "Rejected";
  if (s.includes("approved")) return "Approved";
  return "Waiting";
}

const rpOf = (it) =>
  it.custom_role_profile__name ||
  (it.custom_role_profile && (it.custom_role_profile.role_profile || it.custom_role_profile.name || it.custom_role_profile)) ||
  "";

// one approval line → its bucket and its four figures.
function normCustomer(c) {
  const items = Array.isArray(c.items) ? c.items : [];
  const status = c.status || c.workflow_state || "";
  const has = (v) => v !== undefined && v !== null && v !== "";
  return {
    bucket: bucketOf(status),
    sv: has(c.sales_value) ? toNum(c.sales_value) : has(c.data) ? toNum(c.data) : sumBy(items, "sales_value"),
    sq: has(c.sales_qty) ? toNum(c.sales_qty) : sumBy(items, "sales_qty"),
    cv: has(c.closing_value) ? toNum(c.closing_value) : has(c.closing_balance) ? toNum(c.closing_balance) : sumBy(items, "closing_balance"),
    cq: has(c.closing_qty) ? toNum(c.closing_qty) : sumBy(items, "closing_qty"),
  };
}

function normEmployee(e) {
  if (!e || typeof e !== "object") return null;
  return { customers: (Array.isArray(e.customers) ? e.customers : []).map(normCustomer) };
}

// Fallback: group a flat array of Operational-Tracker NODES by role_profile.
function groupTrackers(nodes) {
  const byEmp = {};
  nodes.forEach((node) => {
    const rp = node.role_profile__name || node.role_profile || "—";
    const entry = node.custom_ref_secondary_data_entry && typeof node.custom_ref_secondary_data_entry === "object" ? node.custom_ref_secondary_data_entry : {};
    const all = Array.isArray(entry.items) ? entry.items : Array.isArray(node.items) ? node.items : [];
    let items = all.filter((it) => rpOf(it) === rp);
    if (!items.length) items = all;
    const emp = (byEmp[rp] = byEmp[rp] || { role_profile: rp, customers: [] });
    emp.customers.push({
      status: node.status__name || node.status || node.workflow_state__name || node.workflow_state || "",
      sales_value: node.data,
      items,
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
    if (Array.isArray(d.customers)) return [normEmployee(d)].filter(Boolean);
    if (d.data && Array.isArray(d.data)) d = d.data;
    else return [];
  }
  const arr = d.map((x) => (x && x.node ? x.node : x)).filter(Boolean);
  const looksGrouped = arr.some((e) => e && Array.isArray(e.customers));
  const src = looksGrouped ? arr : groupTrackers(arr);
  return src.map(normEmployee).filter(Boolean);
}

/* ---------- component ---------- */
export default function SecondaryApprovalSummary({
  data,
  title = "Approval summary",
  periodLabel = "",
  currency = "₹",
  locale = "en-IN",
  showClosingCards = true,
  emptyText = "Nothing is waiting for your approval.",
  accentColor = "#2f43c9",
  className,
  style,
}) {
  ensureStyles();

  const fmtMoney = React.useCallback(
    (v) => `${currency}${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(toNum(v))}`,
    [currency, locale]
  );
  const fmtInt = React.useCallback((v) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(toNum(v)), [locale]);

  const model = React.useMemo(() => {
    const employees = toEmployees(data);
    const customers = employees.flatMap((e) => e.customers);
    const counts = { Approved: 0, Waiting: 0, Rejected: 0 };
    const split = () => ({ Waiting: 0, Approved: 0, Rejected: 0, total: 0 });
    const sv = split(), sq = split(), cv = split(), cq = split();
    customers.forEach((c) => {
      counts[c.bucket] += 1;
      [["sv", sv], ["sq", sq], ["cv", cv], ["cq", cq]].forEach(([k, o]) => { o[c.bucket] += c[k]; o.total += c[k]; });
    });
    return { nEmployees: employees.length, nCustomers: customers.length, counts, sv, sq, cv, cq };
  }, [data]);

  const { nEmployees, nCustomers, counts, sv, sq, cv, cq } = model;
  const isEmpty = nCustomers === 0 && nEmployees === 0;

  const cssVars = { "--eapr-accent": accentColor, ...style };

  const CARD_DEFS = [
    { t: "Secondary Value", d: sv, money: true },
    { t: "Secondary Qty", d: sq, money: false },
    { t: "Closing Value", d: cv, money: true },
    { t: "Closing Qty", d: cq, money: false },
  ].slice(0, showClosingCards ? 4 : 2);
  const fmt = (v, money) => (money ? fmtMoney(v) : fmtInt(v));

  return (
    <div className={`eapr${className ? " " + className : ""}`} style={cssVars}>
      <div className="eapr-head">
        <svg className="eapr-fold" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4M7.8 21h8.4c1.6 0 2.9-1.3 2.9-2.9V8.5L14 3.2H7.8C6.2 3.2 4.9 4.5 4.9 6.1v12c0 1.6 1.3 2.9 2.9 2.9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        <h1 className="eapr-h1">{periodLabel ? `${periodLabel} · ${title}` : title}</h1>
      </div>

      {isEmpty ? (
        <div className="eapr-empty">{emptyText}</div>
      ) : (
        <>
          <div className="eapr-kpis">
            {[
              ["Employees", fmtInt(nEmployees), null, ""],
              ["Customers", fmtInt(nCustomers), null, ""],
              ["Waiting", fmtInt(counts.Waiting), fmtInt(sq.Waiting), "w"],
              ["Approved", fmtInt(counts.Approved), fmtInt(sq.Approved), "g"],
              ["Rejected", fmtInt(counts.Rejected), fmtInt(sq.Rejected), "b"],
            ].map(([k, v, qty, c], i) => (
              <div key={i} className={`eapr-kpi${c ? " " + c : ""}`}>
                <div className="k">{k}</div>
                <div className="v num">{v}{qty != null ? <span className="q">({qty})</span> : null}</div>
              </div>
            ))}
          </div>

          <div className="eapr-vt">Value tracking</div>
          <div className="eapr-cards">
            {CARD_DEFS.map((card, i) => {
              const d = card.d, tt = d.total || 1;
              const row = (cls, lab, val) => (
                <span className={`eapr-sp${val ? "" : " z"}`}><i style={{ background: cls === "g" ? "var(--eapr-good)" : cls === "w" ? "var(--eapr-warn)" : "var(--eapr-bad)" }} />{lab}<b className="num">{fmt(val, card.money)}</b></span>
              );
              return (
                <div key={i} className="eapr-sc">
                  <div className="t">{card.t}</div>
                  <div className="tot num">{fmt(d.total, card.money)}</div>
                  <div className="eapr-bar">
                    <span className="eapr-w" style={{ width: (d.Waiting / tt) * 100 + "%" }} />
                    <span className="eapr-g" style={{ width: (d.Approved / tt) * 100 + "%" }} />
                    <span className="eapr-b" style={{ width: (d.Rejected / tt) * 100 + "%" }} />
                  </div>
                  <div className="eapr-splits">
                    {row("w", "Waiting", d.Waiting)}
                    {row("g", "Approved", d.Approved)}
                    {row("b", "Rejected", d.Rejected)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
