/* ERPNext reads for the Support Report. Every query here was run against
 * erp.elbrit.org before being written down:
 *
 *   - One "Doctor Support" document per doctor per month, dated the LAST day
 *     of the month (DR-16722-2025-October -> 2025-10-31). The header totals
 *     equal the sum of `item_table`, so the lines are the only source used.
 *   - Each line carries the role profile, department and HQ it was booked
 *     against. The role profile is what ties a line to a person.
 *   - Field aliases work and roughly halve the payload; `sortBy` does not
 *     accept `date`, so months on file are found with per-month counts.
 *   - Every document of a month shares one date, so a month cannot be split
 *     into smaller date windows. MAX_DOCS is set far above today's ~5k/month
 *     and a short page is reported, never silently dropped.
 *
 * GraphQL has no block comments -- `#` only -- and these are JS template
 * literals, so no backticks inside them. */

import { cached, evictCached, gql, loggedUser } from "./erpClient";

const MAX_DOCS = 20000;

export const ymOf = (y, m) => `${y}-${String(m).padStart(2, "0")}`;

function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

const dateFilter = (ym) => {
  const { from, to } = monthRange(ym);
  return [
    { fieldname: "date", operator: "GTE", value: from },
    { fieldname: "date", operator: "LTE", value: to },
  ];
};

const COUNT_QUERY = `
  query SupportCount($f: [DBFilterInput], $first: Int) {
    DoctorSupports(filter: $f, first: $first) { totalCount edges { node { name date } } }
  }
`;

const MONTH_QUERY = `
  query SupportMonth($f: [DBFilterInput], $first: Int) {
    DoctorSupports(filter: $f, first: $first) {
      totalCount
      edges { node {
        n: name
        dt: date
        m: modified
        d: doctor__name
        # A doctor is a CRM Lead. HQ is the Lead territory, e.g. HQ-Gulbarga.
        dr: doctor {
          l: lead_name
          c: city
          s: custom_specialty__name
          k: custom_category__name
          h: territory__name
          q: custom_qualification__name
        }
        t: item_table {
          i: item__name
          b: brand
          q: qty
          r: rate
          a: amount
          p: custom_role_profile__name
          dp: custom_department__name
          h: custom_hq__name
        }
      } }
    }
  }
`;

/* THE ERP CAN ANSWER THE WRONG QUESTION. Seen live, 25 Sep 2026: with a few
   month queries in flight at once, the July request came back with July's
   totalCount (5,018) but FEBRUARY's 4,433 documents. Frappe's GraphQL layer
   leaks results between concurrent requests. A short answer is easy to spot;
   a swapped answer between two months of equal size would not be. So every
   answer is checked against the month it was asked for -- each document's
   own date must fall inside the window -- and asked again if it doesn't. */
const ASK_ATTEMPTS = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function askForMonth(conn, query, first, ym) {
  const { from, to } = monthRange(ym);
  for (let attempt = 1; ; attempt++) {
    const data = await gql(conn, query, { first, f: dateFilter(ym) });
    const edges = data.DoctorSupports.edges;
    const foreign = edges.filter(({ node }) => {
      const d = String(node.dt ?? node.date ?? "").slice(0, 10);
      return d && (d < from || d > to);
    }).length;
    if (!foreign) return data;
    console.warn(`[support] ${ym}: ERP returned ${foreign} of ${edges.length} documents from another month (attempt ${attempt}) -- asking again`);
    if (attempt >= ASK_ATTEMPTS) {
      throw new Error(`The ERP kept returning another month's records for ${ym}. Try again in a moment.`);
    }
    await sleep(400 * attempt);
  }
}

export function fetchMonthCount(conn, ym) {
  return cached(conn, `count:${ym}`, async () => {
    const data = await askForMonth(conn, COUNT_QUERY, 1, ym);
    return data.DoctorSupports.totalCount ?? 0;
  });
}

const clean = (s) => (s == null ? "" : String(s).trim());

/* Compact rows, so a year of months held in memory is the numbers and not
   the JSON they arrived in. */
export function fetchMonth(conn, ym) {
  return cached(conn, `month:${ym}`, async () => {
    const data = await askForMonth(conn, MONTH_QUERY, MAX_DOCS, ym);
    const { totalCount, edges } = data.DoctorSupports;
    const doctors = {};
    const lines = [];
    let lastModified = "";
    for (const { node } of edges) {
      const id = clean(node.d);
      if (!id) continue;
      if (node.m && node.m > lastModified) lastModified = node.m;
      if (!doctors[id]) {
        const dr = node.dr || {};
        doctors[id] = {
          id,
          name: clean(dr.l) || id,
          city: clean(dr.c),
          spec: clean(dr.s) || "—",
          cat: clean(dr.k) || "—",
          qual: clean(dr.q) || "—",
          hq: clean(dr.h),
        };
      }
      for (const t of node.t || []) {
        const q = Number(t.q) || 0;
        const a = Number(t.a) || 0;
        if (!q && !a) continue;
        lines.push({
          d: id,
          doc: node.n,
          item: clean(t.i) || "—",
          brand: clean(t.b) || clean(t.i) || "—",
          q,
          a,
          rate: Number(t.r) || 0,
          rp: clean(t.p) || null,
          dept: clean(t.dp),
          hq: clean(t.h),
        });
      }
    }
    const truncated = totalCount > edges.length;
    /* A short answer is not cached: the ERP counts and lists in separate
       queries, so the two can disagree (a write in progress, or the
       cross-request leak askForMonth guards against). Keeping it would pin
       the wrong totals for the whole TTL; useSupportData asks again. */
    if (truncated) queueMicrotask(() => evictCached(conn, `month:${ym}`));
    return { ym, docs: totalCount ?? edges.length, fetched: edges.length, truncated, lines, doctors, lastModified };
  });
}

const EMPLOYEES_QUERY = `
  query SupportEmployees($f: [DBFilterInput], $first: Int) {
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
        status
      } }
    }
  }
`;

/* `parent_role_profile { name }`: the __name shadow does not exist for this
   field, and asking for it fails the whole query. */
const ROLE_PROFILES_QUERY = `
  query SupportRoleProfiles($first: Int) {
    RoleProfiles(first: $first) { edges { node { name parent_role_profile { name } } } }
  }
`;

/* The roster and role-profile tree are best-effort: a restricted token may
   not be allowed to read them. The report still works without them -- lines
   then group by role profile instead of by person.

   EVERY status, not just Active. Only Active people become rows, but the
   others are links in the reporting chain: Hashim M H (RBM) reports to
   V01863, an INACTIVE vacant RBM seat, which reports to Janardhanan A. With
   Active only, the chain broke at the vacancy and he surfaced at the top. */
export function fetchOrg(conn) {
  return cached(conn, "org", async () => {
    const [employees, roleParents, email] = await Promise.all([
      gql(conn, EMPLOYEES_QUERY, { first: MAX_DOCS, f: [] })
        .then((d) =>
          d.Employees.edges.map(({ node }) => ({
            id: node.name,
            name: clean(node.employee_name) || node.name,
            designation: node.designation?.name ?? "",
            reportsTo: node.reports_to?.name ?? null,
            hq: clean(node.custom_territory?.name),
            dept: clean(node.department?.name),
            userId: node.user_id?.name ?? null,
            rp: node.custom_role_profile__name || null,
            // Select fields come back as GraphQL enums: "ACTIVE", not "Active".
            active: !node.status || String(node.status).toUpperCase() === "ACTIVE",
          })),
        )
        .catch(() => []),
      gql(conn, ROLE_PROFILES_QUERY, { first: MAX_DOCS })
        .then((d) => Object.fromEntries(d.RoleProfiles.edges.map(({ node }) => [node.name, node.parent_role_profile?.name ?? null])))
        .catch(() => ({})),
      loggedUser(conn),
    ]);
    return { employees, roleParents, email };
  });
}
