import React from "react";

/**
 * SecondaryApprovalSummary — the summary card for the Secondary APPROVAL page.
 * It sits above the per-employee approval groups and gives the approver
 * (ABM / RBM / SM) the whole queue at a glance, with a scoped drill-down.
 *
 * FACE (summary):
 *   1. COUNTS row — Employees, Customers (submissions), Waiting / Approved /
 *      Rejected. Each status tile also shows SQ (Secondary Qty) and CQ
 *      (Closing Qty) for that bucket.
 *   2. VALUE TRACKING — Secondary Value/Qty and Closing Value/Qty, each split
 *      by approval bucket with a proportion bar.
 *
 * DRILL-DOWN (scoped): every tile and every value card is clickable. Clicking
 *   opens a popup showing ONLY the related detail (e.g. Waiting → only waiting
 *   submissions; Closing Value → the closing-value view), broken down BY HQ /
 *   BY CUSTOMER / BY EMPLOYEE (toggle). It's read-only — no approve/reject here.
 *
 * DATA (`data` prop) — bind to the grouped-by-employee array the approval page
 * builds from the Operational Tracker query (Object.values(byEmp)):
 *   [{ employee_name, role_profile, hq,
 *      customers: [{ distributor, status,
 *                    sales_qty, sales_value, closing_qty, closing_value,
 *                    items:[{ custom_hq__name, ... }] }] }]
 * Each customer's HQ falls back to the employee's hq or the item's custom_hq__name.
 * Shape-tolerant — also accepts { edges:[{node}] } / { employees } / a single
 * employee, or a flat array of Operational-Tracker nodes (grouped automatically).
 * Bucket = status text: "reject" → Rejected, "approved" → Approved, else Waiting.
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

    /* counts row */
    .eapr-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-top:14px}
    .eapr-kpi{border:1px solid var(--eapr-border);border-radius:11px;padding:11px 13px;background:var(--eapr-surface2);
      text-align:left;font-family:inherit;color:inherit;width:100%;cursor:pointer;transition:border-color .12s,box-shadow .12s,transform .12s}
    .eapr-kpi:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(20,30,60,.1)}
    .eapr-kpi:focus-visible{outline:2px solid var(--eapr-accent,#2f43c9);outline-offset:2px}
    .eapr-kpi .k{font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--eapr-ink3);font-weight:700}
    .eapr-kpi .v{font-size:23px;font-weight:800;letter-spacing:-.02em;margin-top:6px;line-height:1;color:var(--eapr-ink)}
    .eapr-kpi .qt{font-size:10.5px;font-weight:600;margin-top:7px;color:var(--eapr-ink2);white-space:nowrap}
    .eapr-kpi .qt b{font-weight:700}
    .eapr-kpi.w{background:var(--eapr-warn-bg);border-color:color-mix(in srgb,var(--eapr-warn) 24%,transparent)} .eapr-kpi.w .v,.eapr-kpi.w .k{color:var(--eapr-warn)}
    .eapr-kpi.g{background:var(--eapr-good-bg);border-color:color-mix(in srgb,var(--eapr-good) 22%,transparent)} .eapr-kpi.g .v,.eapr-kpi.g .k{color:var(--eapr-good)}
    .eapr-kpi.b{background:var(--eapr-bad-bg);border-color:color-mix(in srgb,var(--eapr-bad) 24%,transparent)} .eapr-kpi.b .v,.eapr-kpi.b .k{color:var(--eapr-bad)}

    .eapr-legend{font-size:10.5px;color:var(--eapr-ink3);margin-top:10px}
    .eapr-legend b{color:var(--eapr-ink2);font-weight:700}

    /* value tracking */
    .eapr-vt{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--eapr-ink3);font-weight:700;margin:18px 0 10px}
    .eapr-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:11px}
    .eapr-sc{background:var(--eapr-surface);border:1px solid var(--eapr-border);border-radius:12px;padding:13px 14px 12px;
      text-align:left;font-family:inherit;color:inherit;width:100%;cursor:pointer;transition:border-color .12s,box-shadow .12s,transform .12s}
    .eapr-sc:hover{border-color:var(--eapr-accent,#2f43c9);transform:translateY(-1px);box-shadow:0 8px 22px rgba(20,30,60,.12)}
    .eapr-sc:focus-visible{outline:2px solid var(--eapr-accent,#2f43c9);outline-offset:2px}
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
    .eapr-drill{font-size:10px;color:var(--eapr-accent,#2f43c9);font-weight:600;margin-top:10px}

    .eapr-empty{padding:26px 10px;text-align:center;color:var(--eapr-ink3);font-size:12.5px}

    /* drill-down modal */
    .eapr-ov{position:fixed;inset:0;background:rgba(12,18,30,.6);display:flex;align-items:flex-start;justify-content:center;padding:34px 16px;z-index:1000;overflow-y:auto}
    .eapr-modal{background:var(--eapr-surface);border:1px solid var(--eapr-border);border-radius:16px;box-shadow:0 18px 52px rgba(20,30,60,.28);width:100%;max-width:720px;overflow:hidden}
    .eapr-mh{padding:15px 18px;border-bottom:1px solid var(--eapr-border);display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .eapr-mh h2{margin:0;font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px}
    .eapr-mh .dot{width:9px;height:9px;border-radius:3px;flex:none}
    .eapr-mh .sub{font-size:12px;color:var(--eapr-ink2);margin-top:4px}
    .eapr-x{border:1px solid var(--eapr-border);background:var(--eapr-surface);color:var(--eapr-ink2);border-radius:9px;width:31px;height:31px;cursor:pointer;font-size:15px;flex:none;line-height:1}
    .eapr-x:hover{background:var(--eapr-inset)}
    .eapr-mb{padding:14px 18px 18px;max-height:calc(100vh - 170px);overflow-y:auto}
    .eapr-seg{display:inline-flex;gap:2px;background:var(--eapr-inset);border-radius:9px;padding:3px;margin-bottom:13px}
    .eapr-seg button{border:none;background:transparent;color:var(--eapr-ink2);font:600 11.5px/1 inherit;padding:7px 13px;border-radius:7px;cursor:pointer}
    .eapr-seg button.on{background:var(--eapr-surface);color:var(--eapr-ink);box-shadow:0 1px 3px rgba(20,30,60,.14)}
    .eapr-dt-wrap{overflow-x:auto}
    .eapr-dt{width:100%;border-collapse:collapse;font-size:12px;min-width:520px}
    .eapr-dt th{text-align:right;font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:var(--eapr-ink3);font-weight:700;padding:6px 8px;border-bottom:1px solid var(--eapr-border);white-space:nowrap}
    .eapr-dt th:first-child,.eapr-dt td:first-child{text-align:left}
    .eapr-dt th.hl,.eapr-dt td.hl{color:var(--eapr-accent,#2f43c9)}
    .eapr-dt td{padding:8px;border-bottom:1px solid var(--eapr-border);text-align:right;color:var(--eapr-ink2);white-space:nowrap}
    .eapr-dt td.g{color:var(--eapr-ink);font-weight:600;white-space:normal}
    .eapr-dt tbody tr:hover td{background:var(--eapr-surface2)}
    .eapr-dt tfoot td{font-weight:700;color:var(--eapr-ink);border-top:2px solid var(--eapr-border);border-bottom:none}
    .eapr-none{padding:18px 4px;text-align:center;color:var(--eapr-ink3);font-size:12px}

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
const has = (v) => v !== undefined && v !== null && v !== "";

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

const distOf = (c) =>
  c.distributor ||
  c.distributor__name ||
  (c.distributor && c.distributor.customer_name) ||
  c.customer ||
  c.entry ||
  "—";

// one approval line → bucket, its four figures, and where it belongs (hq / customer / employee).
function normCustomer(c, emp) {
  const items = Array.isArray(c.items) ? c.items : [];
  const status = c.status || c.workflow_state || "";
  return {
    bucket: bucketOf(status),
    sv: has(c.sales_value) ? toNum(c.sales_value) : has(c.data) ? toNum(c.data) : sumBy(items, "sales_value"),
    sq: has(c.sales_qty) ? toNum(c.sales_qty) : sumBy(items, "sales_qty"),
    cv: has(c.closing_value) ? toNum(c.closing_value) : has(c.closing_balance) ? toNum(c.closing_balance) : sumBy(items, "closing_balance"),
    cq: has(c.closing_qty) ? toNum(c.closing_qty) : sumBy(items, "closing_qty"),
    distributor: distOf(c),
    hq: c.hq || c.custom_hq__name || (items[0] && items[0].custom_hq__name) || (emp && emp.hq) || "—",
    employee: (emp && emp.name) || "—",
  };
}

function normEmployee(e) {
  if (!e || typeof e !== "object") return null;
  const meta = { name: e.employee_name || e.role_profile || "—", hq: e.hq || "" };
  return { customers: (Array.isArray(e.customers) ? e.customers : []).map((c) => normCustomer(c, meta)) };
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
    const emp = (byEmp[rp] = byEmp[rp] || {
      employee_name: node.employee_name || rp,
      role_profile: rp,
      hq: node.hq__name || node.hq || (items[0] && items[0].custom_hq__name) || "",
      customers: [],
    });
    emp.customers.push({
      status: node.status__name || node.status || node.workflow_state__name || node.workflow_state || "",
      sales_value: node.data,
      distributor: (entry.distributor__name) || (entry.distributor && entry.distributor.customer_name) || node.reference || "—",
      items,
    });
  });
  return Object.values(byEmp);
}

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

const DIM_LABEL = { hq: "HQ", customer: "Customer", employee: "Employee" };
const dimKey = { hq: "hq", customer: "distributor", employee: "employee" };

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
  const [detail, setDetail] = React.useState(null); // { title, filter, cls, dim, sortKey }
  const lastFocus = React.useRef(null);

  const fmtMoney = React.useCallback((v) => `${currency}${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(toNum(v))}`, [currency, locale]);
  const fmtInt = React.useCallback((v) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(toNum(v)), [locale]);

  const model = React.useMemo(() => {
    const employees = toEmployees(data);
    const subs = employees.flatMap((e) => e.customers);
    const counts = { Approved: 0, Waiting: 0, Rejected: 0 };
    const mk = () => ({ Waiting: 0, Approved: 0, Rejected: 0, total: 0 });
    const sv = mk(), sq = mk(), cv = mk(), cq = mk();
    subs.forEach((c) => {
      counts[c.bucket] += 1;
      [["sv", sv], ["sq", sq], ["cv", cv], ["cq", cq]].forEach(([k, o]) => { o[c.bucket] += c[k]; o.total += c[k]; });
    });
    return { nEmployees: employees.length, subs, counts, sv, sq, cv, cq };
  }, [data]);

  const { nEmployees, subs, counts, sv, sq, cv, cq } = model;
  const isEmpty = subs.length === 0 && nEmployees === 0;

  const openDetail = React.useCallback((cfg) => {
    if (typeof document !== "undefined") lastFocus.current = document.activeElement;
    setDetail(cfg);
  }, []);
  const closeDetail = React.useCallback(() => {
    setDetail(null);
    if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus();
  }, []);
  React.useEffect(() => {
    if (!detail) return;
    const onKey = (e) => { if (e.key === "Escape") closeDetail(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detail, closeDetail]);

  const cssVars = { "--eapr-accent": accentColor, ...style };

  const KPIS = [
    { k: "Employees", v: nEmployees, cfg: { title: "Employees", dim: "employee", sortKey: "sv" } },
    { k: "Customers", v: subs.length, cfg: { title: "Customers", dim: "customer", sortKey: "sv" } },
    { k: "Waiting", v: counts.Waiting, cls: "w", sq: sq.Waiting, cq: cq.Waiting, cfg: { title: "Waiting", filter: "Waiting", cls: "w", dim: "hq", sortKey: "sq" } },
    { k: "Approved", v: counts.Approved, cls: "g", sq: sq.Approved, cq: cq.Approved, cfg: { title: "Approved", filter: "Approved", cls: "g", dim: "hq", sortKey: "sq" } },
    { k: "Rejected", v: counts.Rejected, cls: "b", sq: sq.Rejected, cq: cq.Rejected, cfg: { title: "Rejected", filter: "Rejected", cls: "b", dim: "hq", sortKey: "sq" } },
  ];

  const CARD_DEFS = [
    { t: "Secondary Value", d: sv, money: true, sortKey: "sv" },
    { t: "Secondary Qty", d: sq, money: false, sortKey: "sq" },
    { t: "Closing Value", d: cv, money: true, sortKey: "cv" },
    { t: "Closing Qty", d: cq, money: false, sortKey: "cq" },
  ].slice(0, showClosingCards ? 4 : 2);
  const fmt = (v, money) => (money ? fmtMoney(v) : fmtInt(v));

  // ----- detail groups for the popup -----
  const groups = React.useMemo(() => {
    if (!detail) return [];
    const flt = detail.filter ? subs.filter((s) => s.bucket === detail.filter) : subs;
    const key = dimKey[detail.dim] || "hq";
    const map = {};
    flt.forEach((s) => {
      const gk = s[key] || "—";
      const g = map[gk] || (map[gk] = { key: gk, n: 0, sv: 0, sq: 0, cv: 0, cq: 0 });
      g.n += 1; g.sv += s.sv; g.sq += s.sq; g.cv += s.cv; g.cq += s.cq;
    });
    return Object.values(map).sort((a, b) => b[detail.sortKey] - a[detail.sortKey]);
  }, [detail, subs]);
  const tot = groups.reduce((a, g) => ({ n: a.n + g.n, sv: a.sv + g.sv, sq: a.sq + g.sq, cv: a.cv + g.cv, cq: a.cq + g.cq }), { n: 0, sv: 0, sq: 0, cv: 0, cq: 0 });
  const dotColor = detail && detail.cls ? (detail.cls === "g" ? "var(--eapr-good)" : detail.cls === "w" ? "var(--eapr-warn)" : "var(--eapr-bad)") : "var(--eapr-accent)";

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
            {KPIS.map((t, i) => (
              <button key={i} type="button" className={`eapr-kpi${t.cls ? " " + t.cls : ""}`} onClick={() => openDetail(t.cfg)} aria-label={`${t.k} detail`}>
                <div className="k">{t.k}</div>
                <div className="v num">{fmtInt(t.v)}</div>
                {t.cls ? <div className="qt">SQ <b className="num">{fmtInt(t.sq)}</b> · CQ <b className="num">{fmtInt(t.cq)}</b></div> : null}
              </button>
            ))}
          </div>
          <div className="eapr-legend"><b>SQ</b> = Secondary Qty · <b>CQ</b> = Closing Qty · tap any tile or card for the HQ / customer breakdown</div>

          <div className="eapr-vt">Value tracking</div>
          <div className="eapr-cards">
            {CARD_DEFS.map((card, i) => {
              const d = card.d, tt = d.total || 1;
              const row = (cls, lab, val) => (
                <span className={`eapr-sp${val ? "" : " z"}`}><i style={{ background: cls === "g" ? "var(--eapr-good)" : cls === "w" ? "var(--eapr-warn)" : "var(--eapr-bad)" }} />{lab}<b className="num">{fmt(val, card.money)}</b></span>
              );
              return (
                <button key={i} type="button" className="eapr-sc" onClick={() => openDetail({ title: card.t, dim: "hq", sortKey: card.sortKey })} aria-label={`${card.t} breakdown`}>
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
                  <div className="eapr-drill">breakdown →</div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {detail && (
        <div className="eapr-ov" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}>
          <div className="eapr-modal">
            <div className="eapr-mh">
              <div>
                <h2><span className="dot" style={{ background: dotColor }} />{periodLabel ? `${periodLabel} · ${detail.title}` : detail.title}</h2>
                <div className="sub">{fmtInt(tot.n)} submissions · SQ {fmtInt(tot.sq)} · CQ {fmtInt(tot.cq)} · {fmtMoney(tot.sv)} sec · {fmtMoney(tot.cv)} clos</div>
              </div>
              <button type="button" className="eapr-x" aria-label="Close" onClick={closeDetail}>✕</button>
            </div>
            <div className="eapr-mb">
              <div className="eapr-seg" role="tablist" aria-label="Group by">
                {["hq", "customer", "employee"].map((dm) => (
                  <button key={dm} type="button" role="tab" aria-selected={detail.dim === dm} className={detail.dim === dm ? "on" : ""} onClick={() => setDetail((s) => ({ ...s, dim: dm }))}>By {DIM_LABEL[dm]}</button>
                ))}
              </div>
              {groups.length === 0 ? (
                <div className="eapr-none">No submissions in this view.</div>
              ) : (
                <div className="eapr-dt-wrap">
                  <table className="eapr-dt">
                    <thead>
                      <tr>
                        <th>{DIM_LABEL[detail.dim]}</th>
                        <th>Subs</th>
                        <th className={detail.sortKey === "sq" ? "hl" : ""}>SQ</th>
                        <th className={detail.sortKey === "cq" ? "hl" : ""}>CQ</th>
                        <th className={detail.sortKey === "sv" ? "hl" : ""}>Sec {currency}</th>
                        <th className={detail.sortKey === "cv" ? "hl" : ""}>Clos {currency}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g, i) => (
                        <tr key={i}>
                          <td className="g">{g.key}</td>
                          <td className="num">{fmtInt(g.n)}</td>
                          <td className={`num${detail.sortKey === "sq" ? " hl" : ""}`}>{fmtInt(g.sq)}</td>
                          <td className={`num${detail.sortKey === "cq" ? " hl" : ""}`}>{fmtInt(g.cq)}</td>
                          <td className={`num${detail.sortKey === "sv" ? " hl" : ""}`}>{fmtMoney(g.sv)}</td>
                          <td className={`num${detail.sortKey === "cv" ? " hl" : ""}`}>{fmtMoney(g.cv)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="g">Total</td>
                        <td className="num">{fmtInt(tot.n)}</td>
                        <td className="num">{fmtInt(tot.sq)}</td>
                        <td className="num">{fmtInt(tot.cq)}</td>
                        <td className="num">{fmtMoney(tot.sv)}</td>
                        <td className="num">{fmtMoney(tot.cv)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
