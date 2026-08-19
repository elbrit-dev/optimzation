/**
 * Invoice item-wise sales — the data core.
 *
 * ONE ROW PER SALES INVOICE LINE, not per invoice: an invoice with 8 products is
 * 8 rows. Sales Invoice joined with its Sales Invoice Item children.
 *
 * ── Why it is built out of aggregates instead of raw rows ──
 * There are 63,816 Sales Invoices. One month of line items is ~14,000 rows and
 * ~5 MB of JSON from ERP; five months hits 100,000 rows and 36 MB. A Netlify
 * function has ten seconds and a six-megabyte response, so "fetch the lines and
 * total them in JavaScript" cannot work for any range worth looking at.
 *
 * So every number on the page comes from a GROUP BY executed inside ERP — each
 * returns tens or hundreds of rows in ~400 ms regardless of range — and only the
 * current page of lines is fetched as rows. A year costs the same as a day.
 *
 * ── The constraint that shapes every query here ──
 * Frappe will only run these aggregates when the FIRST group_by term is a CHILD
 * table field. Group by a parent field (`posting_date`, `customer`) and the
 * child-table permission check runs without a parent doctype and throws
 * PermissionError. Group by `is_free_item` first and then by `posting_date`, and
 * the same query works. So `groupBy: [is_free_item, posting_date]` — the leading
 * child field is load-bearing, not decoration.
 *
 * `parenttype` is used the same way to get a single group: it is always
 * 'Sales Invoice', so grouping by it yields exactly one row of grand totals,
 * including COUNT(DISTINCT parent).
 */

import { erpFetch, cleanDept } from './audit.mjs'
import { therapyForBrand, brandsForTherapy, THERAPIES } from './therapy.mjs'

export { THERAPIES }

const ITEM = 'tabSales Invoice Item'
/** Backtick-qualified child column, the form Frappe's report query understands. */
const child = (f) => '`' + ITEM + '`.' + f

/** Company currency (`base_*`) throughout: this is one company's own reporting. */
const SUMS = [
  `sum(${child('base_net_amount')}) as value`,
  `sum(${child('stock_qty')}) as qty`,
  // NOT `as lines` — `lines` is reserved in MariaDB and the query 1064s.
  `count(${child('name')}) as lines_count`,
]

/**
 * COUNT(DISTINCT parent) costs 35-40% of an aggregate's runtime at scale (item
 * grouping over 17 months: 2297ms with it, 1401ms without). The invoice count is
 * a headline KPI, so it is worth paying for ONCE on the grand-totals query — but
 * not eight times over for per-dimension detail no chart depends on.
 */
const SUMS_WITH_INVOICES = [...SUMS, `count(distinct ${child('parent')}) as invoices`]

/**
 * Columns a caller may sort by, mapped to what ERP has to be told. An allowlist
 * rather than validation-by-regex: `order_by` is interpolated into SQL by Frappe,
 * so anything not on this list must never reach it.
 */
export const SORTABLE = {
  date: 'posting_date',
  // Child columns must carry the backticks here too. Without them Frappe does not
  // error — it returns ZERO rows, which reads as "no data for this filter".
  invoice: child('parent'),
  distributor: 'customer',
  item: child('item_name'),
  brand: child('brand'),
  qty: child('stock_qty'),
  rate: child('base_net_rate'),
  amount: child('base_net_amount'),
  team: child('custom_department'),
  grandTotal: 'base_grand_total',
}

export const PAGE_SIZES = [25, 50, 100, 200]
export const DEFAULT_PAGE_SIZE = 50

export const DOCSTATUS_LABEL = { 0: 'Draft', 1: 'Submitted', 2: 'Cancelled' }

// ── query normalising ───────────────────────────────────────────────

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(str(v))
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/**
 * First of the month TWO months back — a three-month window by default.
 *
 * A single month was the obvious default and it was wrong: "net value by month"
 * and "units by month" both collapse to one column and two lone dots, so half the
 * report says nothing on first load. Three months is a trend, and still only
 * ~1.3s to build.
 */
export function defaultFrom(today, monthsBack = 2) {
  const [y, m] = String(today).slice(0, 7).split('-').map(Number)
  const d = new Date(Date.UTC(y, (m - 1) - monthsBack, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Everything the page can ask for, cleaned. Anything unrecognised is dropped
 * rather than passed through — this object becomes an ERP filter list.
 */
export function parseQuery(raw = {}, { today } = {}) {
  const docstatus = str(raw.docstatus) || (raw.docstatus === 0 ? '0' : '')
  return {
    company: str(raw.company),
    from: isDate(raw.from) ? str(raw.from) : defaultFrom(today),
    to: isDate(raw.to) ? str(raw.to) : today,
    distributor: str(raw.distributor),
    team: str(raw.team),
    hq: str(raw.hq),
    brand: str(raw.brand),
    item: str(raw.item),
    // Matched as a substring, so "CI-" narrows to the claim-invoice series and a
    // full number narrows to one invoice.
    invoice: str(raw.invoice),
    therapy: THERAPIES.includes(str(raw.therapy)) ? str(raw.therapy) : '',
    // 'all' means every docstatus; anything unrecognised falls back to Submitted,
    // which is the only status that represents real sales.
    docstatus: /^[012]$/.test(docstatus) ? Number(docstatus) : (docstatus === 'all' ? '' : 1),
    paidOnly: !(raw.paidOnly === false || raw.paidOnly === 'false' || raw.paidOnly === '0'),
    page: Math.max(1, Math.floor(num(raw.page)) || 1),
    pageSize: PAGE_SIZES.includes(num(raw.pageSize)) ? num(raw.pageSize) : DEFAULT_PAGE_SIZE,
    sort: SORTABLE[str(raw.sort)] ? str(raw.sort) : 'date',
    dir: str(raw.dir) === 'asc' ? 'asc' : 'desc',
  }
}

/**
 * ERP filter list. Child-table filters take the four-part form
 * `["Sales Invoice Item", "brand", "=", x]`; parent fields are plain triples.
 *
 * @param {boolean} forRows include the paid-only filter — it applies to the table
 *   but NOT to the aggregates, which need both sides to report free units at all.
 */
export function buildErpFilters(q, { forRows = false } = {}) {
  const f = [
    ['posting_date', '>=', q.from],
    ['posting_date', '<=', q.to],
  ]
  if (q.docstatus !== '') f.push(['docstatus', '=', q.docstatus])
  if (q.company) f.push(['company', '=', q.company])
  if (q.distributor) f.push(['customer', '=', q.distributor])
  if (q.team) f.push(['Sales Invoice Item', 'custom_department', '=', q.team])
  if (q.hq) f.push(['Sales Invoice Item', 'custom_hq', '=', q.hq])
  if (q.brand) f.push(['Sales Invoice Item', 'brand', '=', q.brand])
  if (q.item) f.push(['Sales Invoice Item', 'item_name', '=', q.item])
  if (q.invoice) f.push(['name', 'like', `%${q.invoice}%`])
  /**
   * Therapy is not a field in ERP — it is a property of the brand (see
   * lib/therapy.mjs) — so a therapy filter becomes the set of brands in it. An
   * unrecognised therapy was already dropped by parseQuery, so this cannot produce
   * an empty IN list and silently return everything.
   */
  if (q.therapy && !q.brand) f.push(['Sales Invoice Item', 'brand', 'in', brandsForTherapy(q.therapy)])
  if (forRows && q.paidOnly) f.push(['Sales Invoice Item', 'is_free_item', '=', 0])
  return f
}

// ── ERP access ──────────────────────────────────────────────────────

/**
 * Runs at most `limit` requests at once.
 *
 * Not premature optimisation in reverse — firing all nine queries at once made
 * ERP drop a connection mid-flight (`UND_ERR_SOCKET: other side closed`), so the
 * whole report failed. Three at a time is comfortably inside whatever the limit
 * is, and still finishes in about a second.
 */
async function mapLimit(tasks, limit, run) {
  const out = new Array(tasks.length)
  let next = 0
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++
      out[i] = await run(tasks[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return out
}

/**
 * ERP appears to serialise concurrent requests on one token, so more parallelism
 * buys little and eventually costs a dropped connection. Overridable while
 * measuring, fixed in production.
 */
const ERP_CONCURRENCY = Number(process.env?.ERP_CONCURRENCY) || 3

async function erpQuery(creds, { fields, filters, groupBy, orderBy, limit, start }) {
  const p = new URLSearchParams({
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: String(limit ?? 0),
  })
  if (groupBy?.length) p.set('group_by', groupBy.join(','))
  if (orderBy) p.set('order_by', orderBy)
  if (start) p.set('limit_start', String(start))
  const path = `/api/resource/Sales%20Invoice?${p}`
  // One retry, for the dropped-connection case only: these are GETs, so a repeat
  // is free, and an ERP-level error (bad filter, no permission) must NOT be
  // retried — it would just fail twice and double the latency.
  try {
    return (await erpFetch(path, creds))?.data || []
  } catch (err) {
    if (err.code || !/fetch failed|socket|network|ECONNRESET|terminated/i.test(String(err.message))) throw err
    await new Promise((r) => setTimeout(r, 250))
    return (await erpFetch(path, creds))?.data || []
  }
}

/**
 * A grouped aggregate. `dimension` is the child field grouped FIRST — the one
 * that makes the query legal — and `also` is an optional second term, which may
 * be a parent field.
 */
const aggregate = (creds, filters, dimension, also = [], { withInvoices = false } = {}) => erpQuery(creds, {
  fields: [...also, child(dimension), ...(withInvoices ? SUMS_WITH_INVOICES : SUMS)],
  filters,
  groupBy: [child(dimension), ...also],
})

// ── shaping ─────────────────────────────────────────────────────────

/** Splits an `is_free_item` aggregate into the paid and free halves. */
export function splitFree(rows) {
  const paid = rows.find((r) => !num(r.is_free_item)) || {}
  const free = rows.find((r) => num(r.is_free_item)) || {}
  return {
    value: num(paid.value),
    unitsBilled: num(paid.qty),
    freeUnits: num(free.qty),
    paidLines: num(paid.lines_count),
    freeLines: num(free.lines_count),
  }
}

export const monthKey = (date) => String(date || '').slice(0, 7)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (key) => {
  const [y, m] = String(key).split('-')
  return `${MONTHS[Number(m) - 1] || m} ${String(y).slice(2)}`
}

/**
 * Per-day rows (split paid/free) rolled up to months. Every month between the
 * first and last is emitted even when empty, so a gap in trading reads as a gap
 * instead of closing up and implying continuity.
 */
export function rollUpByMonth(rows) {
  const map = new Map()
  for (const r of rows) {
    const k = monthKey(r.posting_date)
    if (!k) continue
    const cur = map.get(k) || { key: k, value: 0, unitsBilled: 0, freeUnits: 0 }
    if (num(r.is_free_item)) cur.freeUnits += num(r.qty)
    else {
      cur.value += num(r.value)
      cur.unitsBilled += num(r.qty)
    }
    map.set(k, cur)
  }
  const keys = [...map.keys()].sort()
  if (!keys.length) return []
  const out = []
  const [firstY, firstM] = keys[0].split('-').map(Number)
  const [lastY, lastM] = keys[keys.length - 1].split('-').map(Number)
  for (let y = firstY, m = firstM; (y < lastY || (y === lastY && m <= lastM)) && out.length < 120;) {
    const k = `${y}-${String(m).padStart(2, '0')}`
    out.push(map.get(k) || { key: k, value: 0, unitsBilled: 0, freeUnits: 0 })
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out.map((d) => ({ ...d, label: monthLabel(d.key) }))
}

/**
 * Ranked bar data: the top N by value, with the rest folded into one "Other" bar
 * so the chart still reconciles with the KPI above it.
 */
export function topN(rows, key, n = 8) {
  const clean = rows
    .map((r) => ({
      name: str(r[key]) || '(not set)',
      value: num(r.value),
      qty: num(r.qty),
      invoices: num(r.invoices),
    }))
    .filter((r) => r.value !== 0 || r.qty !== 0)
    .sort((a, b) => b.value - a.value)
  if (clean.length <= n) return clean
  const head = clean.slice(0, n)
  const tail = clean.slice(n)
  return [...head, {
    name: `Other (${tail.length})`,
    value: tail.reduce((s, r) => s + r.value, 0),
    qty: tail.reduce((s, r) => s + r.qty, 0),
    invoices: 0,
    isOther: true,
  }]
}

/**
 * Free goods arrive as their OWN lines (rate 0, `is_free_item`), so a paid line
 * knows nothing about the scheme quantity that shipped with it. This stamps the
 * free quantity onto the paid line for the same item on the same invoice, which
 * is the only relationship the data actually holds.
 *
 * Keyed on `item_code`, not `item_name`: the name is a label, and two codes can
 * share one.
 */
export function stampFreeQty(rows, siblings) {
  const byKey = new Map()
  for (const f of siblings) {
    if (!num(f.is_free_item)) continue
    const k = `${f.parent}||${f.item_code}`
    byKey.set(k, num(byKey.get(k)) + num(f.stock_qty))
  }
  return rows.map((r) => ({ ...r, freeQty: byKey.get(`${r.invoice}||${r.itemCode}`) || 0 }))
}

/**
 * Sales Team, filled in from the rest of the invoice when the line itself has none.
 *
 * An invoice belongs to ONE team, but the Department field is stamped per line, and
 * on live data 10.8% of lines have it empty. A third of those sit on an invoice
 * where another line DOES carry it — so the team is known, just not written on that
 * row. Copying it across is not a guess.
 *
 * The rest (93 invoices in August, mostly `INV-MW` self-transfers and `CN-` credit
 * notes) carry no team on any line and stay blank rather than being attributed to
 * somebody.
 */
export function fillTeamFromInvoice(rows, siblings) {
  const byInvoice = new Map()
  for (const sib of siblings) {
    const d = str(sib.custom_department)
    if (d && !byInvoice.has(sib.parent)) byInvoice.set(sib.parent, d)
  }
  return rows.map((r) => {
    if (r.teamRaw) return r
    const found = byInvoice.get(r.invoice)
    if (!found) return r
    return { ...r, teamRaw: found, team: cleanTeam(found), teamFromInvoice: true }
  })
}

/** "Vasco Coimbatore - ELPL" -> "Vasco Coimbatore"; blank stays blank. */
export const cleanTeam = (v) => (v ? cleanDept(v) : '')

/** One line-item row, as the page wants it. */
function shapeRow(r) {
  const date = String(r.posting_date || '').slice(0, 10)
  return {
    invoice: r.parent || '',
    rowId: r.row_id || '',
    docstatus: num(r.docstatus),
    docstatusLabel: DOCSTATUS_LABEL[num(r.docstatus)] ?? String(r.docstatus ?? ''),
    distributor: r.customer || '',
    grandTotal: num(r.base_grand_total),
    date,
    month: date ? Number(date.slice(5, 7)) : null,
    item: r.item_name || r.item_code || '',
    itemCode: r.item_code || '',
    qty: num(r.stock_qty),
    uom: r.stock_uom || '',
    netRate: num(r.base_net_rate),
    netAmount: num(r.base_net_amount),
    team: cleanTeam(r.custom_department),
    teamRaw: r.custom_department || '',
    teamFromInvoice: false,
    hq: r.custom_hq || '',
    brand: r.brand || '',
    // Not an ERP field — a property of the brand. See lib/therapy.mjs.
    therapy: therapyForBrand(r.brand),
    isFree: Boolean(num(r.is_free_item)),
  }
}

/** Dropdown values, blanks removed and sorted for scanning. */
const optionsFrom = (rows, key) =>
  [...new Set(rows.map((r) => str(r[key])).filter(Boolean))].sort((a, b) => a.localeCompare(b))

// ── aggregate cache ─────────────────────────────────────────────────

const AGG_TTL_MS = 120_000
const AGG_MAX = 24
const aggCache = new Map()

/**
 * Keyed on the filter list, so it is shared by every page and sort order of the
 * same view. Small and time-boxed: this is a report over yesterday's sales, not a
 * live ledger, and two minutes of staleness while someone pages through a table
 * is invisible.
 */
async function cachedAggregates(filters, run) {
  const key = JSON.stringify(filters)
  const hit = aggCache.get(key)
  if (hit && Date.now() - hit.at < AGG_TTL_MS) return hit.data
  const data = await run()
  aggCache.set(key, { at: Date.now(), data })
  // Oldest-out, so a session of filter fiddling cannot grow this without bound.
  if (aggCache.size > AGG_MAX) aggCache.delete(aggCache.keys().next().value)
  return data
}

export function clearSalesCache() {
  aggCache.clear()
}

// ── the report ──────────────────────────────────────────────────────

/**
 * @param {{creds: object, query: object, today: string}} opts
 * @returns the whole page in one response: KPIs, three chart datasets, filter
 *   options, and the current slice of rows.
 */
export async function buildSalesReport({ creds, query, today }) {
  const q = parseQuery(query, { today })
  const filters = buildErpFilters(q)
  const rowFilters = buildErpFilters(q, { forRows: true })

  const rowFields = [
    child('parent'),
    // Aliased because the child's `name` would otherwise collide with the
    // invoice's own `name` and silently win.
    `${child('name')} as row_id`,
    'posting_date', 'customer', 'base_grand_total', 'docstatus',
    child('item_code'), child('item_name'), child('stock_qty'), child('stock_uom'),
    child('base_net_rate'), child('base_net_amount'), child('brand'),
    child('custom_department'), child('custom_hq'), child('is_free_item'),
  ]

  /**
   * Aggregates are cached apart from the rows, keyed on the FILTERS only. Paging
   * and re-sorting change neither the KPIs nor the charts, so turning a page
   * costs one query instead of nine — and a 17-month range drops from ~6.5s to
   * ~0.5s per page after the first.
   */
  const jobs = [
    () => aggregate(creds, filters, 'parenttype', [], { withInvoices: true }),
    () => aggregate(creds, filters, 'is_free_item'),
    () => aggregate(creds, filters, 'is_free_item', ['posting_date']),
    () => aggregate(creds, filters, 'brand'),
    () => aggregate(creds, filters, 'item_name'),
    () => aggregate(creds, filters, 'is_free_item', ['customer']),
    () => aggregate(creds, filters, 'custom_department'),
    () => aggregate(creds, filters, 'custom_hq'),
  ]
  const [aggregates, pageRows] = await Promise.all([
    cachedAggregates(filters, () => mapLimit(jobs, ERP_CONCURRENCY, (job) => job())),
    erpQuery(creds, {
      fields: rowFields,
      filters: rowFilters,
      orderBy: `${SORTABLE[q.sort]} ${q.dir}`,
      limit: q.pageSize,
      start: (q.page - 1) * q.pageSize,
    }),
  ])
  const [grand, freeSplit, byDay, byBrand, byItem, byCustomer, byTeam, byHq] = aggregates

  const rows = pageRows.map(shapeRow)

  /**
   * Every line of the invoices on THIS page — one small query answering two
   * questions: what free quantity shipped with each paid line, and which team the
   * invoice belongs to when the line itself does not say.
   */
  let stamped = rows.map((r) => ({ ...r, freeQty: 0 }))
  const invoices = [...new Set(rows.map((r) => r.invoice).filter(Boolean))]
  if (invoices.length) {
    const siblings = await erpQuery(creds, {
      fields: [
        child('parent'), child('item_code'), child('stock_qty'),
        child('is_free_item'), child('custom_department'),
      ],
      filters: [['name', 'in', invoices]],
    })
    stamped = fillTeamFromInvoice(stampFreeQty(rows, siblings), siblings)
  }

  const totals = splitFree(freeSplit)
  const g = grand[0] || {}
  const totalLines = num(g.lines_count)
  // The table hides free lines by default, so its own total is the paid count,
  // not the line count the KPIs report.
  const tableTotal = q.paidOnly ? totals.paidLines : totalLines

  // Value-ranked charts read paid lines only: a free line is worth zero, so
  // including them would add empty bars to the bottom of every ranking.
  const paidCustomers = byCustomer.filter((r) => !num(r.is_free_item))

  return {
    generatedAt: new Date().toISOString(),
    today,
    query: q,
    kpis: {
      netValue: totals.value,
      unitsBilled: totals.unitsBilled,
      freeUnits: totals.freeUnits,
      invoices: num(g.invoices),
      distributors: optionsFrom(paidCustomers, 'customer').length,
      brands: optionsFrom(byBrand, 'brand').length,
      items: optionsFrom(byItem, 'item_name').length,
      lines: totalLines,
      paidLines: totals.paidLines,
      freeLines: totals.freeLines,
    },
    charts: {
      byMonth: rollUpByMonth(byDay),
      topBrands: topN(byBrand, 'brand'),
      topDistributors: topN(paidCustomers, 'customer'),
    },
    /** Therapy is ours, not ERP's, so the page gets the list from here. */
    therapies: THERAPIES,
    options: {
      distributor: optionsFrom(paidCustomers, 'customer'),
      team: optionsFrom(byTeam, 'custom_department'),
      hq: optionsFrom(byHq, 'custom_hq'),
      brand: optionsFrom(byBrand, 'brand'),
      item: optionsFrom(byItem, 'item_name'),
    },
    paging: {
      page: q.page,
      pageSize: q.pageSize,
      rows: stamped.length,
      total: tableTotal,
      pages: Math.max(1, Math.ceil(tableTotal / q.pageSize)),
    },
    rows: stamped,
  }
}

/** Company list for the filter — a parent field, so it cannot come from a group_by. */
export async function listCompanies(creds) {
  const json = await erpFetch(
    '/api/resource/Company?fields=%5B%22name%22%5D&limit_page_length=0&order_by=name%20asc', creds,
  )
  return (json?.data || []).map((c) => c.name)
}
