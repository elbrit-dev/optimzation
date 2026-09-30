/* Live ERP reads for the Home overview, as the viewer's own token.
 *
 * Nothing here re-derives a business rule. Each section asks the ERP for the
 * number the matching report already computes:
 *
 *   Primary    customReportV2 SALES -- the Sales Summary engine. INC_PRIMARY
 *              and TARGET_VALUE come back with its base conditions (no
 *              samples, no internal customers, no ignored invoices, claims and
 *              breakage out) and its Target Invest overlay already applied, and
 *              it scopes Department / HQ by the token's User Permissions.
 *   Secondary  customReportV2 SECONDARY -- the Secondary Data Entry summary on
 *              the same engine.
 *   Support    the Support Report's own month reads and team tree.
 *   Visit      the Visit Report's roster, attribution, scope and selectors,
 *              read through this component's own URL -- see fetchVisit.
 *
 * There is no period picker: each section shows this month to date, or last
 * month when this one has nothing yet (see monthsToTry). Every read is
 * best-effort per section: one that fails (a token without rights to it,
 * SECONDARY missing from an ERP's ReportName enum) takes only its own section
 * off the page. */

import { gql, makeConn } from "../../support-report/data/erpClient";
import { isHqTerritory, shortDesignation } from "@/app/visit/data/shape";
import { attendance, visitsByHour } from "@/app/visit/data/selectors";
import { fetchMonth, fetchMonthCount, fetchOrg } from "../../support-report/data/supportSource";
import { NO_RP, buildTree, divOf, subtreeIds } from "../../support-report/data/model";
import { FY_MON, MON, describePeriod, fyOfIdx, fyStart, idxOf, monOf, ymOfIdx } from "../period";

export { makeConn };

const REPORT_QUERY = `
  query HomeOverviewReport($input: CustomReportV2Input!) {
    customReportV2(input: $input) { report_meta edges { node } }
  }
`;

const pad = (n) => String(n).padStart(2, "0");
/* LOCAL date: toISOString() is still yesterday before 05:30 IST. */
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* A report cell is a number, or { value, repr } once something upstream has
   formatted it. */
const val = (v) => (v && typeof v === "object" ? Number(v.value) || 0 : Number(v) || 0);
const text = (v) => String(v && typeof v === "object" ? v.value ?? v.repr ?? "" : v ?? "").trim();
const depth = (n) => Number(n.indent ?? n.level ?? 0);

async function runReport(conn, input) {
  const data = await gql(conn, REPORT_QUERY, {
    input: { ...input, limit: 0, options: { include_total_row: true, include_today_totals: false, ...input.options } },
  });
  const r = data.customReportV2 || {};
  const columns = r.report_meta?.[0]?.columns ?? [];
  const meta = columns.find((c) => c.fieldname === "_meta") || {};
  const rows = (r.edges || []).map((e) => e.node).filter((n) => n && !n._is_total_row);
  return { rows, totals: meta.meta_totals || {}, today: meta.meta_today_totals || {} };
}

/* Rows come back flattened, a parent followed by its children. */
function groups(rows) {
  const out = [];
  for (const n of rows) {
    if (depth(n) === 0) out.push({ node: n, kids: [] });
    else if (out.length) out[out.length - 1].kids.push(n);
  }
  return out;
}

const known = (label) => label && label !== "Unknown";

/* THE PERIOD. No picker any more: this month, to date -- and when this month
   has nothing yet (the 1st, or entries not filed), last month in full. Each
   section decides for itself, so a filed Primary and an unfiled Secondary do
   not drag each other back. */
function monthsToTry(today, n = 2) {
  const now = idxOf(today);
  return Array.from({ length: n }, (_, k) => describePeriod({ from: now - k, to: now - k }, today));
}

/* All the Sales Summary metrics the overview shows, straight from the engine:
   the Sales / Returns / Offers split is its own columns, never re-derived. */
const SALES_METRICS = ["TARGET_VALUE", "INC_PRIMARY", "NET_PRIMARY", "GROSS_PRIMARY", "CREDIT_NOTE", "EXPIRED", "BREAKAGE", "SALES_RETURN", "PROD_OFFER", "INV_OFFER", "CLAIM"];
const salesFigures = (n) => ({
  target: val(n.target_value), inc: val(n.inc_primary), net: val(n.net_primary), gross: val(n.gross_primary),
  credit: val(n.credit_note), expired: val(n.expired), breakage: val(n.breakage), ret: val(n.sales_return),
  prod: val(n.prod_offer), inv: val(n.inv_offer), claim: val(n.claim),
});

/* Units are departments for a token that sees more than one of them (an
   admin, an SM), and the HQs of its one department otherwise (an RBM, a BE)
   -- the design's "Team ranking" becomes an HQ ranking one level down. */
export async function fetchPrimary(conn, today) {
  for (const P of monthsToTry(today)) {
    const { rows, totals } = await runReport(conn, {
      report: "SALES", date_range: { from_date: P.fromDate, to_date: P.toDate }, group_by: ["DEPARTMENT", "HQ"], metrics: SALES_METRICS,
    });
    const depts = groups(rows).filter((g) => known(text(g.node.label))).map((g) => ({
      name: text(g.node.label), ...salesFigures(g.node),
      hqs: g.kids.filter((k) => known(text(k.label))).map((k) => ({ name: text(k.label), ...salesFigures(k) })),
    }));
    if (!depts.some((d) => d.inc || d.target)) continue;
    const level = depts.filter((d) => d.target > 0).length > 1 ? "dept" : "hq";
    const units = (level === "dept" ? depts : depts.flatMap((d) => d.hqs.map((h) => ({ ...h, dept: d.name, hqs: [] })))).filter((u) => u.target > 0);
    // Sales but no targets yet is nothing to rank: try the month before.
    if (!units.length) continue;
    return { period: P, level, units, depts, totals: salesFigures(totals) };
  }
  return null;
}

const INV_COUNT_QUERY = `
  query HomeOverviewInvoiceCount($f: [DBFilterInput]) { SalesInvoices(filter: $f, first: 1) { totalCount } }
`;
const INV_LOOKBACK = 7;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* "Invoiced today", by department and HQ, on the latest day that has
   invoices -- a Saturday morning or a holiday has none yet, and a card that
   vanishes then reads as a broken one. The values are the engine's
   INC_PRIMARY for that day, so they follow Primary's rules; the invoice
   count is the invoices under each unit. */
export async function fetchInvoiced(conn, today) {
  for (let back = 0; back < INV_LOOKBACK; back++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
    const d = isoDay(day);
    const count = (await gql(conn, INV_COUNT_QUERY, { f: [{ fieldname: "posting_date", operator: "EQ", value: d }, { fieldname: "docstatus", operator: "EQ", value: "1" }] })).SalesInvoices.totalCount;
    if (!count) continue;
    const { rows } = await runReport(conn, { report: "SALES", date_range: { from_date: d, to_date: d }, group_by: ["DEPARTMENT", "HQ", "INVOICE"], metrics: ["INC_PRIMARY"] });
    const dept = {}, hq = {};
    let cur = null, curHq = null, total = 0, n = 0;
    for (const r of rows) {
      const lv = depth(r), label = text(r.label);
      if (lv === 0) { cur = label; dept[cur] = { v: val(r.inc_primary), n: 0 }; total += val(r.inc_primary); }
      else if (lv === 1) { curHq = label; hq[curHq] = hq[curHq] || { v: 0, n: 0, dept: cur }; hq[curHq].v += val(r.inc_primary); }
      else { if (cur) dept[cur].n += 1; if (curHq) hq[curHq].n += 1; n += 1; }
    }
    if (!n) continue;
    const label = back === 0 ? "today" : back === 1 ? "yesterday" : `${DOW[day.getDay()]}, ${day.getDate()} ${MON[day.getMonth()]}`;
    return { back, label, dateLabel: `${DOW[day.getDay()]}, ${day.getDate()} ${MON[day.getMonth()]} ${day.getFullYear()}`, total, count: n, dept, hq };
  }
  return null;
}

/* Top distributors for one unit, read when its detail opens -- a month of
   invoices for every unit up front would be the whole ledger for a card
   nobody may open. */
export async function fetchPrimaryDistributors(conn, period, unit, level) {
  const { rows } = await runReport(conn, {
    report: "SALES", date_range: { from_date: period.fromDate, to_date: period.toDate },
    group_by: ["HQ", "CUSTOMER", "INVOICE"], metrics: ["INC_PRIMARY"],
    dimension_filters: [{ dimension: level === "dept" ? "DEPARTMENT" : "HQ", operator: "IN", values: [unit] }],
  });
  const out = [];
  let hq = "", cust = null;
  for (const r of rows) {
    const lv = depth(r);
    if (lv === 0) hq = text(r.label);
    else if (lv === 1) { cust = { name: text(r.label), hq, value: val(r.inc_primary), invoices: 0 }; out.push(cust); }
    else if (cust) cust.invoices += 1;
  }
  return out.filter((c) => known(c.name)).sort((a, b) => b.value - a.value).slice(0, 6);
}

async function secondaryFor(conn, P) {
  const { rows } = await runReport(conn, {
    report: "SECONDARY", date_range: { from_date: P.fromDate, to_date: P.endDate },
    group_by: ["DEPARTMENT", "HQ", "CUSTOMER"], metrics: ["SALES_QTY", "SALES_VALUE", "CLOSING_QTY", "CLOSING_BALANCE"],
  });
  /* What was on hand is what went out plus what is left. */
  const fig = (n) => { const s = val(n.sales_qty), c = val(n.closing_qty); return { s, c, o: s + c, sv: val(n.sales_value), cv: val(n.closing_balance) }; };
  const depts = [];
  let d = null, h = null;
  for (const r of rows) {
    const lv = depth(r), label = text(r.label);
    if (lv === 0) { d = { name: label, ...fig(r), hqs: [], customers: [] }; depts.push(d); }
    else if (lv === 1 && d) { h = { name: label, ...fig(r), customers: [] }; d.hqs.push(h); }
    else if (lv === 2 && d) { const c = { name: label, hq: h?.name || "", ...fig(r) }; d.customers.push(c); if (h) h.customers.push(c); }
  }
  return depts.filter((x) => known(x.name) && x.o > 0).map((x) => ({
    ...x, dist: new Set(x.customers.map((c) => c.name)).size,
    hqs: x.hqs.filter((y) => known(y.name) && y.o > 0).map((y) => ({ ...y, dist: new Set(y.customers.map((c) => c.name)).size })),
  }));
}

/* Secondary entries for a month are filed after it ends, and often late, so
   this month, last month and the one before are tried in turn -- the most
   recent with entries wins. */
export const SECONDARY_MONTHS = 3;
export async function fetchSecondary(conn, today) {
  for (const P of monthsToTry(today, SECONDARY_MONTHS)) {
    const depts = await secondaryFor(conn, P);
    if (!depts.length) continue;
    const hqs = depts.flatMap((x) => x.hqs.map((y) => ({ ...y, dept: x.name, hqs: [] })));
    return { period: P, level: depts.length > 1 ? "dept" : "hq", units: depts, depts, hqs };
  }
  return null;
}

const MONTH_CONCURRENCY = 3;
async function inPool(items, limit, run) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await run(items[i]); }
  }));
  return out;
}

const lineStats = (lines) => ({
  value: lines.reduce((s, l) => s + l.a, 0),
  qty: lines.reduce((s, l) => s + l.q, 0),
  doctors: new Set(lines.map((l) => l.d)).size,
});

function topDoctors(lines, doctors, n = 7) {
  const by = new Map();
  for (const l of lines) { const x = by.get(l.d) || { v: 0, q: 0 }; x.v += l.a; x.q += l.q; by.set(l.d, x); }
  return [...by].sort((a, b) => b[1].v - a[1].v).slice(0, n).map(([id, x]) => {
    const d = doctors[id] || {};
    return { name: d.name || id, spec: d.spec && d.spec !== "—" ? d.spec : "", hq: d.hq || "", qty: x.q, value: x.v };
  });
}
function brandSplit(lines, n = 6) {
  const by = new Map();
  for (const l of lines) by.set(l.brand, (by.get(l.brand) || 0) + l.a);
  return [...by].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, value]) => ({ name, value }));
}

/* Doctor Support, the Support Report's own reads and team tree, opened at
   the viewer's own place in it. The month shown is the latest one on file --
   support is imported a month or two behind, which is why the design shows
   July in September -- with the FY's months beside it for the trend. */
export async function fetchSupport(conn, today) {
  const now = idxOf(today);
  const fy = fyOfIdx(now);
  const idxs = [];
  for (let i = fyStart(fy) - 1; i <= Math.min(fyStart(fy) + 11, now); i++) idxs.push(i);

  const [org, counts] = await Promise.all([fetchOrg(conn), inPool(idxs, 6, (i) => fetchMonthCount(conn, ymOfIdx(i)))]);
  const onFile = idxs.filter((_, k) => counts[k] > 0);
  if (!onFile.length) return null;
  const fetched = await inPool(onFile, MONTH_CONCURRENCY, (i) => fetchMonth(conn, ymOfIdx(i)));

  // A Set, as the Support Report passes it: buildTree calls lineRps.has().
  const rpOf = (l) => l.rp || NO_RP;
  const tree = buildTree(org, new Set(fetched.flatMap((m) => m.lines.map(rpOf))));
  const mine = subtreeIds(tree.viewer);
  const nodeOf = (l) => tree.rpNode.get(rpOf(l)) || tree.seatFor(rpOf(l));
  const doctors = Object.assign({}, ...fetched.map((m) => m.doctors));
  const byIdx = new Map(onFile.map((i, k) => [i, { lines: fetched[k].lines.filter((l) => mine.has(nodeOf(l).id)), lastModified: fetched[k].lastModified }]));

  const latest = [...byIdx.keys()].filter((i) => byIdx.get(i).lines.length).sort((a, b) => b - a)[0];
  if (latest == null) return null;
  const cur = byIdx.get(latest).lines, prev = byIdx.get(latest - 1)?.lines || [];
  const fyL = fyOfIdx(latest);
  const monthIdxs = Array.from({ length: 12 }, (_, k) => fyStart(fyL) + k).filter((i) => byIdx.get(i)?.lines.length);

  /* Each line credited to the viewer's direct report it sits under. */
  const topOf = (node) => { let n = node; while (n.parent && n.parent !== tree.viewer) n = n.parent; return n.parent === tree.viewer ? n : null; };
  const underOf = (lines) => { const m = new Map(); for (const l of lines) { const t = topOf(nodeOf(l)); if (t && !t.pseudo) { if (!m.has(t)) m.set(t, []); m.get(t).push(l); } } return m; };
  const curBy = underOf(cur);
  const monthBy = new Map(monthIdxs.map((i) => [i, underOf(byIdx.get(i).lines)]));
  const managers = [...curBy].map(([n, lines]) => ({
    name: n.name, role: n.role, ...lineStats(lines),
    months: monthIdxs.map((i) => ({ label: MON[monOf(i)], value: (monthBy.get(i).get(n) || []).reduce((s, l) => s + l.a, 0), on: i === latest })),
    topDoctors: topDoctors(lines, doctors), brands: brandSplit(lines),
  }));

  /* Data health is an admin's view of the whole import, so only the widest
     scope gets it. */
  let health;
  const me = meOf(org);
  const salesLogin = me && (tree.N.has(me.id) || /general manager/i.test(me.designation || ""));
  if (tree.viewer === tree.root && !salesLogin) {
    const zero = cur.filter((l) => l.a > 0 && !l.rate).length;
    const vacant = cur.filter((l) => { const n = nodeOf(l); return n.vac || n.pseudo; }).reduce((s, l) => s + l.a, 0);
    const lm = [...byIdx.values()].reduce((m, x) => (x.lastModified > m ? x.lastModified : m), "");
    const d = lm ? new Date(lm.replace(" ", "T")) : null;
    health = {
      issues: (zero ? 1 : 0) + (vacant ? 1 : 0), zeroRateLines: zero, vacantValue: vacant,
      lastImport: d && !isNaN(d) ? `${d.getDate()} ${MON[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}` : "",
    };
  }

  const s = lineStats(cur);
  return {
    fy: fyL,
    months: monthIdxs.map((i) => ({ label: FY_MON[(monOf(i) + 9) % 12], ...lineStats(byIdx.get(i).lines) })),
    selected: {
      label: MON[monOf(latest)] + " " + Math.floor(latest / 12), labels: [FY_MON[(monOf(latest) + 9) % 12]], ...s,
      prevValue: prev.length ? lineStats(prev).value : null, prevLabel: MON[monOf(latest - 1)],
    },
    scope: tree.viewer === tree.root ? "All India" : tree.viewer.name,
    managers, health,
    topDoctors: topDoctors(cur, doctors), brands: brandSplit(cur),
  };
}

const hourLabel = (h) => (h % 12 || 12) + (h < 12 ? "AM" : "PM");

/* FIELD ACTIVITY IS THE VISIT REPORT'S NUMBERS (share/src/app/visit).
 *
 * Same roster (active employees, Sales only by inSales), same vacancy rule,
 * same attribution (a visit belongs to the participant who went, the plan
 * owner only when that cannot be resolved), and the report's own selectors -- byHq, visitsByHour, attendance --
 * imported, not rewritten. The one thing done differently is WHERE it reads
 * from: the report's loader takes its ERP host from the /tokens registry by
 * row name, and that pointed at a different ERP from this component's URL.
 * So the same queries are sent here, through this component's own URL and
 * token.
 *
 * VOLUME: a day is ~2,000 events (1.2 s), a week ~11,000 (2.1 s, 3 MB), July
 * 56,237 (measured 26 Sep 2026). A period is read a week per request, a few
 * at a time, each answer checked against its own dates. */
/* Copied verbatim from share/src/app/visit/data/liveSource.js (VISITS_QUERY),
   so this reads exactly what the Visit Report reads. */
const VISITS_QUERY = `
  query VisitsInWindow($f: [DBFilterInput], $first: Int) {
    Events(filter: $f, first: $first) {
      totalCount
      edges { node {
        name
        subject
        starts_on
        custom_employee_id { name }
        # A doctor is a CRM Lead. city is a plain scalar; the category is a
        # link to Category List, so it takes the __name shadow like every
        # other link here. NO BACKTICKS IN THIS DOCUMENT -- it is a JS
        # template literal, and a backtick ends it mid-query.
        custom_doctor {
          name
          lead_name
          city
          custom_specialty__name
          # FOUR separate category links, not a child table. A doctor carries a
          # commercial grade (C / SC / E), a value-vs-reach band (LILR / HIHR),
          # a focus bucket (EC10 / C20) and sometimes a campaign (A&P FOCUS 20).
          # Any of them can be empty; the card joins whatever is set.
          custom_category__name
          custom_category1__name
          custom_category2__name
          custom_category3__name
        }
        custom_hq { name }
        custom_department { name }
        custom_pob_given
        event_participants {
          # Scalars. The object forms of these two cannot be resolved -- see above.
          reference_doctype__name
          reference_docname__name
          custom_visit_time
          custom_distance
          custom_is_force_visit
          custom_force_visit_reason
        }
      } }
    }
  }
`;
const VISIT_PAGE = 20000;
const VISIT_CATEGORY = "Doctor Visit plan"; // the calendar's DOCTOR_VISIT_PLAN
const VISIT_CONCURRENCY = 3;

/* The Visit Report's roster and role-profile queries, verbatim in shape. */
const EMPLOYEES_QUERY = `
  query HomeOverviewEmployees($f: [DBFilterInput], $first: Int) {
    Employees(filter: $f, first: $first) {
      edges { node {
        name
        employee_name
        designation { name }
        reports_to { name }
        custom_territory { name }
        department { name }
        user_id { name }
        custom_role_profile__name
      } }
    }
  }
`;
const ROLE_PROFILES_QUERY = `
  query HomeOverviewRoleProfiles($first: Int) {
    RoleProfiles(first: $first) { edges { node { name parent_role_profile { name } } } }
  }
`;
/* The Visit Report's inSales (share/src/app/visit/data/liveSource.js), kept
   in step with it by hand: importing it would pull that loader's Firebase
   registry into this bundle. Either signal is enough -- the ladder re-admits
   the GM, whose role profile is IT. */
const SALES_SHORTS = new Set(["BE", "ABM", "RBM", "SM", "ZSM", "GM"]);
const inSales = (m, profiles) => SALES_SHORTS.has(m.short) || (Boolean(m.roleProfile) && profiles.has(m.roleProfile));
const isVacantId = (id, name) => /^v\d/i.test(id ?? "") || /^vacant\s*_/i.test((name ?? "").trim());

async function visitTeam(conn) {
  const [emp, rp] = await Promise.all([
    gql(conn, EMPLOYEES_QUERY, { first: VISIT_PAGE, f: [{ fieldname: "status", operator: "EQ", value: "Active" }] }),
    gql(conn, ROLE_PROFILES_QUERY, { first: VISIT_PAGE }),
  ]);
  const childrenOf = new Map();
  for (const { node } of rp.RoleProfiles.edges) {
    const parent = node.parent_role_profile?.name;
    if (!parent) continue;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(node.name);
  }
  const sales = new Set();
  const stack = ["Sales"];
  while (stack.length) { const c = stack.pop(); if (sales.has(c)) continue; sales.add(c); for (const k of childrenOf.get(c) ?? []) stack.push(k); }

  const team = emp.Employees.edges.map(({ node }) => {
    const designation = node.designation?.name ?? "";
    return {
      id: node.name, name: node.employee_name, designation, short: shortDesignation(designation),
      reportsTo: node.reports_to?.name ?? null, hq: node.custom_territory?.name ?? "", dept: node.department?.name ?? "",
      vacant: isVacantId(node.name, node.employee_name), onLeave: false,
      userId: node.user_id?.name || null, roleProfile: node.custom_role_profile__name || null,
    };
  }).filter((m) => inSales(m, sales));
  return { team };
}

const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return isoDay(new Date(y, m - 1, d + n)); };

/* One window, checked the way the Support Report checks a month: this ERP
   can hand one request another request's answer when several are in flight,
   so every event must fall inside the window it was asked for. A week still
   over the page size is split into days. */
async function visitsIn(conn, from, to, attempt = 1) {
  const data = await gql(conn, VISITS_QUERY, {
    first: VISIT_PAGE,
    f: [
      { fieldname: "event_category", operator: "EQ", value: VISIT_CATEGORY },
      { fieldname: "starts_on", operator: "GTE", value: `${from} 00:00:00` },
      { fieldname: "starts_on", operator: "LTE", value: `${to} 23:59:59` },
    ],
  });
  const { totalCount, edges } = data.Events;
  const foreign = edges.some(({ node }) => { const d = String(node.starts_on || "").slice(0, 10); return d && (d < from || d > to); });
  if (foreign) {
    if (attempt >= 4) throw new Error(`The ERP kept returning visits from outside ${from} – ${to}. Try again in a moment.`);
    await new Promise((r) => setTimeout(r, 400 * attempt));
    return visitsIn(conn, from, to, attempt + 1);
  }
  if (totalCount > edges.length && from < to) {
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    return (await inPool(days, VISIT_CONCURRENCY, (d) => visitsIn(conn, d, d))).flat();
  }
  /* A single day that comes back short is the same fault as a foreign one
     (seen: 0 of 1,936 events for 3 Aug), not a page-size limit -- a day is
     ~2,000 events against a 20,000 page. Asked again, never kept short. */
  if (totalCount > edges.length) {
    if (totalCount > VISIT_PAGE) { console.warn(`[home-overview] ${from}: ${totalCount} visits, over the page size`); return edges.map((e) => e.node); }
    if (attempt >= 4) throw new Error(`The ERP returned ${edges.length} of ${totalCount} visits for ${from}. Try again in a moment.`);
    await new Promise((res) => setTimeout(res, 400 * attempt));
    return visitsIn(conn, from, to, attempt + 1);
  }
  return edges.map((e) => e.node);
}

function weeks(from, to) {
  const out = [];
  for (let a = from; a <= to; a = addDays(a, 7)) { const b = addDays(a, 6); out.push([a, b < to ? b : to]); }
  return out;
}

/* One row per participant, attributed as the Visit Report's attributeRows
   does: an Employee reference checked against the roster, a User login
   through the email index, and the plan owner when neither resolves. */
function visitRows(events, team) {
  const known = new Set(team.map((m) => m.id));
  const byEmail = new Map(team.filter((m) => m.userId).map((m) => [m.userId.toLowerCase(), m.id]));
  const rows = [];
  for (const ev of events) {
    const ps = ev.event_participants?.length ? ev.event_participants : [null];
    const count = Math.max(new Set(ps.filter(Boolean).map((p) => `${p.reference_doctype__name}:${p.reference_docname__name}`)).size, 1);
    for (const p of ps) {
      const ref = (p?.reference_docname__name ?? "").trim(), type = p?.reference_doctype__name ?? "";
      const participantId = type === "Employee" ? (known.has(ref) ? ref : null) : type === "User" ? byEmail.get(ref.toLowerCase()) ?? null : null;
      rows.push({
        plannedDate: String(ev.starts_on || "").slice(0, 10),
        hq: ev.custom_hq?.name || "",
        dept: ev.custom_department?.name || "",
        visitTime: p?.custom_visit_time ?? null,
        forceVisit: Boolean(p?.custom_is_force_visit),
        employeeId: participantId ?? ev.custom_employee_id?.name ?? "",
        participantCount: count,
      });
    }
  }
  return rows;
}

/* THE VIEWER'S OWN TEAM. The token decides what the ERP hands over -- for
   a BE or an ABM that is the whole HQ, their GM's calls included -- so the
   overview narrows it to the person signed in and everyone under them: a BE
   sees their own calls, an ABM their BEs', and the tree starts at them.

   The team is the SUPPORT REPORT'S TREE (buildTree), so both sections always
   cover the same people. It climbs reports_to through every record -- an
   inactive vacant seat no longer cuts a branch off (Hashim M H's 16 people
   under V01863 went missing for Janardhanan A and the GM) -- and re-parents
   anyone reporting to a stale "Vacant_" placeholder onto the seat's real
   holder. Each member's reportsTo is re-pointed at their tree parent.

   A login that matches no Sales employee (an admin, IT) keeps the token's
   full scope, as does the single GM, whom the tree folds into its root. */
function ownTeam(roster, org) {
  // No roster read means no way to tell who is looking -- never widen to the token's scope for it.
  if (!org?.employees?.length) throw new Error("Could not read the team from the ERP. Try again in a moment.");
  const { N, root, viewer } = buildTree(org, new Set());
  const gm = roster.find((m) => m.short === "GM" && !N.has(m.id));
  const team = roster.filter((m) => N.has(m.id) || m === gm).map((m) => {
    const n = N.get(m.id);
    if (!n) return { ...m, reportsTo: null };
    return { ...m, reportsTo: n.parent && n.parent !== root ? n.parent.id : gm ? gm.id : null };
  });
  if (viewer === root) return { team, ids: null };
  const ids = subtreeIds(viewer);
  return { team: team.filter((m) => ids.has(m.id)), ids };
}

/* Today, live -- unless nothing is planned today (just after midnight, a
   Sunday), in which case this month so far, and last month when this one has
   nothing yet. */
export async function fetchVisit(conn, today) {
  const t = isoDay(today);
  const [{ team: roster }, todays, org] = await Promise.all([visitTeam(conn), visitsIn(conn, t, t), fetchOrg(conn)]);
  const { team, ids } = ownTeam(roster, org);
  const mine = (rs) => (ids ? rs.filter((r) => ids.has(r.employeeId)) : rs);
  /* Attribution runs over the whole roster (a call owned by someone outside
     the team still resolves to the right participant), then keeps the
     viewer's team only. The reps denominator is that team's filled seats.

     THE WINDOW IS THE FIELD'S, NOT THE VIEWER'S. It is chosen by whether
     anyone has calls in it, and only then narrowed: a BE who filed nothing
     this month sees this month at 0 of 1, not last month's closed "On
     track" standing in for a month of silence. */
  let all = visitRows(todays, roster), mode = "today", P = monthsToTry(today)[0], read = todays.length;
  if (!all.length) {
    mode = "window";
    for (const Q of monthsToTry(today)) {
      const parts = await inPool(weeks(Q.fromDate, Q.toDate), VISIT_CONCURRENCY, ([a, b]) => visitsIn(conn, a, b));
      read = parts.reduce((n, x) => n + x.length, 0);
      all = visitRows(parts.flat(), roster);
      P = Q;
      if (all.length) break;
    }
  }
  if (!all.length) return null;
  const rows = mine(all);
  console.info(`[home-overview] visit: ${read} Doctor Visit plan events read for ${mode === "today" ? t : P.fromDate + ".." + P.toDate}, ${rows.length} participant rows, team ${team.length} of ${roster.length}`);
  return shapeVisit(rows, team, P, mode, Boolean(ids));
}

const hhmm = (ts) => { const h = Number(String(ts).slice(11, 13)), m = String(ts).slice(14, 16); return Number.isFinite(h) ? `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}` : ""; };

/* A visit with no department (or no HQ) on the Event still counts: it lands
   in a "No department" / "No HQ" group rather than vanishing. Seen 26 Sep
   2026: 1,307 of August's 54,326 visit events carry no department -- 94 of
   them SM Suresh R's own, which his ERP login lists and the overview used to
   drop. The group also puts the missing field in front of whoever can fix it. */
export const NO_DEPT = "No department", NO_HQ = "No HQ";

function shapeVisit(rows, team, P, mode, scoped) {
  // A narrowed viewer with nothing in the window still gets their section, at zero.
  if (!rows.length && !(scoped && team.length)) return null;

  /* The design's 10 AM - 4 PM, widened to take in any earlier or later call. */
  const seen = visitsByHour(rows).filter((b) => b.verified + b.force > 0).map((b) => b.hour);
  const lo = Math.min(10, ...seen), hi = Math.max(16, ...seen);
  const span = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const hourly = (rs) => { const b = visitsByHour(rs); return { geo: span.map((x) => b[x].verified), force: span.map((x) => b[x].force) }; };

  const byId = new Map(team.map((m) => [m.id, m]));
  const kidsOf = new Map();
  for (const m of team) { if (!kidsOf.has(m.reportsTo)) kidsOf.set(m.reportsTo, []); kidsOf.get(m.reportsTo).push(m); }

  /* Per person, from the rows given -- one unit's rows, so a manager on a
     joint call in CND Coimbatore shows those calls there, not the month. */
  const statsOf = (rs) => {
    const stat = new Map();
    for (const r of rs) {
      const s = stat.get(r.employeeId) || { plan: 0, geo: 0, force: 0, joint: 0, first: null };
      s.plan += 1;
      if (r.visitTime) {
        if (r.forceVisit) s.force += 1; else s.geo += 1;
        if ((r.participantCount ?? 1) > 1) s.joint += 1;
        if (!s.first || r.visitTime < s.first) s.first = r.visitTime;
      }
      stat.set(r.employeeId, s);
    }
    return stat;
  };

  /* Whether someone reported is one fact about the person, across every unit:
     Pawan Maurya's 135 calls in Elbrit Uttar Pradesh made him "Not reported"
     under Bangalore when it was decided from one unit's rows. */
  const firstOf = new Map();
  for (const r of rows) if (r.visitTime && (!firstOf.has(r.employeeId) || r.visitTime < firstOf.get(r.employeeId))) firstOf.set(r.employeeId, r.visitTime);
  const didReport = (id) => firstOf.has(id);

  /* A unit's people: its own members and everyone who logged a call in it,
     with the managers above them up to the top of the ladder so the tree
     reads SM > RBM > ABM > BE. A manager's figures are their branch within
     the unit. */
  function peopleOf(members, stat) {
    const keep = new Set(members.map((m) => m.id));
    for (const id of stat.keys()) if (byId.has(id)) keep.add(id);
    for (const id of [...keep]) { let p = byId.get(byId.get(id)?.reportsTo), guard = 0; while (p && guard++ < 8) { keep.add(p.id); p = byId.get(p.reportsTo); } }
    const roots = [...keep].map((id) => byId.get(id)).filter((m) => m && !keep.has(m.reportsTo));
    const out = [];
    const walk = (m, lvl) => {
      const idx = out.length;
      out.push(null);
      const kids = (kidsOf.get(m.id) || []).filter((k) => keep.has(k.id)).sort((a, b) => a.name.localeCompare(b.name));
      let agg = { ...(stat.get(m.id) || { plan: 0, geo: 0, force: 0, joint: 0 }) }, seats = 0, rep = 0;
      for (const k of kids) {
        const r = walk(k, lvl + 1);
        agg = { plan: agg.plan + r.agg.plan, geo: agg.geo + r.agg.geo, force: agg.force + r.agg.force, joint: agg.joint + r.agg.joint };
        seats += r.seats; rep += r.rep;
      }
      const leaf = !kids.length;
      // Every filled seat counts, managers too -- the same rule as the headline's attendance.
      if (!m.vacant) { seats += 1; if (didReport(m.id)) rep += 1; }
      out[idx] = { id: m.id, name: m.name, role: m.short || "—", hq: String(m.hq || "").replace(/^HQ-\s*/, ""), lvl, vac: m.vacant, leaf, ...agg, seats, rep };
      return { agg, seats, rep };
    };
    roots.sort((a, b) => a.name.localeCompare(b.name)).forEach((r) => walk(r, 0));
    return out;
  }

  /* Reporting per unit: filled seats that logged a call (with their first
     call time), those that have not, and the vacant seats. Each person is
     listed ONCE across all units -- in their own unit, or, with no unit of
     their own, the first one they logged calls in -- so the groups add up to
     the headline. */
  const listed = new Set();
  function repsOf(people) {
    const reported = [], notYet = [], vacant = [];
    for (const m of people) {
      if (!m || listed.has(m.id)) continue;
      listed.add(m.id);
      const who = { name: m.name, role: m.short || "—", hq: String(m.hq || "").replace(/^HQ-\s*/, "") };
      if (m.vacant) vacant.push(who);
      else if (didReport(m.id)) reported.push({ ...who, time: hhmm(firstOf.get(m.id)) });
      else notYet.push(who);
    }
    reported.sort((a, b) => a.time.localeCompare(b.time));
    return { reported, notYet, vacant };
  }

  /* Both groupings -- departments and HQs -- are built; the view picks one
     for every section at once, from the viewer's scope (see the model).
     A unit is any department / HQ with calls in it OR a member in it, so a
     team with no plan today still shows its people as not reported (the
     reps popup used to list 27 of 324). Units with no plan stay off the
     tiles (see the model); they are there for the reps groups. */
  const unitsBy = (lvl) => {
    listed.clear();
    const unitOfRow = (r) => (lvl === "dept" ? r.dept || NO_DEPT : isHqTerritory(r.hq) ? r.hq : NO_HQ);
    const unitOfMember = (m) => (lvl === "dept" ? m.dept || NO_DEPT : isHqTerritory(m.hq) ? m.hq : NO_HQ);
    const names = [...new Set([...rows.map(unitOfRow), ...team.map(unitOfMember).filter(Boolean)])];
    const units = names.map((name) => {
      const rs = rows.filter((r) => unitOfRow(r) === name);
      const stat = statsOf(rs);
      const members = team.filter((m) => unitOfMember(m) === name);
      return { name, plan: rs.length, ...hourly(rs), people: peopleOf(members, stat), members, extra: [...stat.keys()].map((id) => byId.get(id)).filter(Boolean) };
    }).sort((a, b) => (a.name === NO_DEPT || a.name === NO_HQ) - (b.name === NO_DEPT || b.name === NO_HQ) || b.plan - a.plan);
    // Members first, everywhere; then the people seen only through their calls.
    const own = units.map((u) => repsOf(u.members));
    units.forEach((u, i) => {
      const x = repsOf(u.extra);
      u.reps = { reported: own[i].reported.concat(x.reported), notYet: own[i].notYet.concat(x.notYet), vacant: own[i].vacant.concat(x.vacant) };
      delete u.members; delete u.extra;
    });
    return units;
  };
  const byDept = unitsBy("dept"), byHq = unitsBy("hq");
  const depts = new Set((rows.length ? rows : team).map((r) => r.dept).filter(Boolean));

  const isToday = mode === "today";
  const att = attendance(rows, team, !isToday);
  const vacant = team.filter((m) => m.vacant).length;
  return {
    live: isToday,
    period: isToday ? null : P.live ? P.label + " so far" : P.label,
    level: depts.size > 1 ? "dept" : "hq",
    hours: span.map(hourLabel),
    hqs: byHq, byDept, byHq,
    /* As the report's attendance card counts it: filled seats are the
       denominator, vacant seats are listed beside it, never inside it. */
    reps: { reported: att.working, total: att.inScope, vacant },
  };
}

const DIV_SHORT = { ELBR: "Elbrit", VASC: "Vasco", AURA: "Aura & Proxima", CND: "CND", ITF: "ITF" };

/* The signed-in person's Employee record: an Active one first, so an old
   "Left" record on the same login can never answer for them. */
export function meOf(org) {
  const email = String(org?.email || "").toLowerCase();
  if (!email) return null;
  return (org.employees || []).filter((e) => (e.userId || "").toLowerCase() === email).sort((a, b) => (b.active !== false) - (a.active !== false))[0] || null;
}

/* Who is looking, for the greeting: "Zonal Sales Manager - CND". The
   division is the Employee's department's; a department that is not a
   division ("Sales - ELPL", a ZSM's or the GM's) takes the divisions of the
   team under them instead -- one or two named, more than that left off. */
export async function fetchViewer(conn) {
  const org = await fetchOrg(conn);
  const email = String(org.email || "").toLowerCase();
  const me = meOf(org);
  if (!me) return { name: email === "administrator" ? "Administrator" : "", scope: "All India" };
  let div = DIV_SHORT[divOf(me.dept)] || "";
  if (!div) {
    const { N } = buildTree(org, new Set());
    const node = N.get(me.id);
    const divs = node ? [...new Set([...subtreeIds(node)].map((id) => N.get(id)?.div).filter(Boolean))].map((d) => DIV_SHORT[d]) : [];
    div = divs.length && divs.length <= 2 ? divs.join(" · ") : "";
  }
  return { name: String(me.name).split(/\s+/)[0], scope: [me.designation, div].filter(Boolean).join(" - ") };
}
