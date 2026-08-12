#!/usr/bin/env node
/**
 * Does the page actually DO what its numbers say?
 *
 * The other selftests check the report; this one drives the rendered page:
 * clicks every tab, every KPI card, sorts, searches, clears — and asserts the
 * table follows. Two bugs that every other check passed were caught here:
 *
 *   - all six Firebase tabs rendered as the selected one, because counting a
 *     subset assigned to `filters.extra`, which the `on` flag then compared
 *     against on the very next line
 *   - clicking a Firebase tab filtered nothing: `rows.filter(passesExtra)` hands
 *     `filter`'s index argument to the function's second parameter
 *
 * Needs the local server up (node server.mjs) and a Playwright/patchright build.
 * It resolves patchright out of the CodeGPT VS Code extension, which is where
 * this machine has one; with no browser available it SKIPS rather than fails, so
 * it can sit alongside the other selftests without becoming a liability.
 *
 *   node tools/auth-audit-dashboard/selftest-ui.mjs [http://127.0.0.1:4820]
 */
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
function resolveChromium() {
  const base = join(homedir(), '.vscode', 'extensions')
  let dirs = []
  try { dirs = readdirSync(base) } catch { dirs = [] }
  for (const d of dirs.filter((x) => x.startsWith('danielsanmedium.dscodegpt-'))) {
    try { return createRequire(join(base, d, 'standalone', 'package.json'))('patchright') } catch {}
  }
  for (const mod of ['patchright', 'playwright']) {
    try { return createRequire(import.meta.url)(mod) } catch {}
  }
  console.log('SKIP  no patchright/playwright available — UI checks not run')
  process.exit(0)
}
const { chromium } = resolveChromium()
const BASE = process.argv[2] || 'http://127.0.0.1:4820'
try {
  await fetch(`${BASE}/api/status`)
} catch {
  console.log(`SKIP  nothing serving ${BASE} — start it with: node server.mjs`)
  process.exit(0)
}
// `channel: 'chromium'` on purpose: without it patchright looks for a headless
// shell that is not installed here and fails with a confusing message.
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 160)))

const snap = () => page.evaluate(() => ({
  tabs: [...document.querySelectorAll('#tabs button')].map((b) => ({
    label: b.textContent.replace(/\d+$/, '').trim(),
    count: Number(b.querySelector('.cnt')?.textContent || 0),
    on: b.getAttribute('aria-selected') === 'true',
  })),
  rows: document.querySelectorAll('#view tbody tr').length,
  empty: Boolean(document.querySelector('#view .msg')),
  shown: document.querySelector('#shown')?.textContent.trim() || '',
  kpis: [...document.querySelectorAll('#kpis .kpi')].map((k) => k.querySelector('.l').textContent.trim()),
  title: document.querySelector('#page-title')?.textContent.trim(),
}))

const fails = []
const ok = (cond, msg) => { if (!cond) fails.push(msg) }

for (const pageName of ['overview', 'employees', 'firebase']) {
  await page.goto(`${BASE}/#/${pageName}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app:not([hidden])', { timeout: 40000 })
  await page.waitForTimeout(350)
  const s0 = await snap()
  console.log(`\n${pageName}: "${s0.title}" — ${s0.tabs.length} tabs, KPIs: ${s0.kpis.join(' / ')}`)

  for (let i = 0; i < s0.tabs.length; i++) {
    const btns = page.locator('#tabs button')
    await btns.nth(i).click()
    await page.waitForTimeout(250)
    const s = await snap()
    const t = s.tabs[i]
    const selected = s.tabs.filter((x) => x.on)
    ok(selected.length === 1, `${pageName}/${t.label}: ${selected.length} tabs selected`)
    ok(selected[0]?.label === t.label, `${pageName}/${t.label}: wrong tab highlighted (${selected[0]?.label})`)
    // The table must show exactly the tab's advertised count (0 -> empty state).
    const shownRows = s.empty ? 0 : s.rows
    ok(shownRows === t.count, `${pageName}/${t.label}: tab says ${t.count}, table shows ${shownRows}`)
    console.log(`  ${t.on ? '>' : ' '} ${t.label.padEnd(32)} count ${String(t.count).padStart(4)}  rows ${String(shownRows).padStart(4)}  ${s.shown}`)
  }
}

// KPI drill-through: every clickable card must land somewhere with rows.
await page.goto(`${BASE}/#/overview`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#app:not([hidden])'); await page.waitForTimeout(300)
const cards = await page.locator('#kpis .kpi.clickable').count()
console.log(`\noverview: ${cards} clickable KPI cards`)
for (let i = 0; i < cards; i++) {
  await page.goto(`${BASE}/#/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app:not([hidden])'); await page.waitForTimeout(250)
  const label = (await page.locator('#kpis .kpi.clickable .l').nth(i).textContent()).trim()
  const n = Number((await page.locator('#kpis .kpi.clickable .n').nth(i).textContent()).replace(/\D/g, ''))
  await page.locator('#kpis .kpi.clickable').nth(i).click()
  await page.waitForTimeout(350)
  const s = await snap()
  const shownRows = s.empty ? 0 : s.rows
  ok(n === 0 || shownRows > 0, `KPI "${label}" (${n}) landed on an empty table`)
  console.log(`  ${label.padEnd(22)} ${String(n).padStart(4)} -> "${s.title}" ${shownRows} rows`)
}

// Sorting a column must not throw and must reorder.
await page.goto(`${BASE}/#/employees`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#view thead th'); await page.waitForTimeout(300)
const before = await page.locator('#view tbody tr td:nth-child(2)').first().textContent()
await page.locator('#view thead th').nth(1).click(); await page.waitForTimeout(250)
const asc = await page.locator('#view tbody tr td:nth-child(2)').first().textContent()
await page.locator('#view thead th').nth(1).click(); await page.waitForTimeout(250)
const desc = await page.locator('#view tbody tr td:nth-child(2)').first().textContent()
const ariaSort = await page.locator('#view thead th').nth(1).getAttribute('aria-sort')
ok(asc !== desc, `sorting did not reverse (${asc} vs ${desc})`)
ok(ariaSort === 'descending', `aria-sort not updated (${ariaSort})`)
console.log(`\nsort: unsorted ${before} -> asc ${asc} -> desc ${desc} (aria-sort=${ariaSort})`)

// Search must narrow, and Clear must restore.
await page.fill('#q', 'kumar'); await page.waitForTimeout(350)
const narrowed = await snap()
const clearVisible = await page.locator('#clear-filters').isVisible()
await page.locator('#clear-filters').click(); await page.waitForTimeout(300)
const restored = await snap()
ok(narrowed.rows < restored.rows, `search did not narrow (${narrowed.rows} vs ${restored.rows})`)
ok(clearVisible, 'Clear filters button did not appear when a filter was active')
console.log(`search "kumar": ${narrowed.rows} rows -> cleared: ${restored.rows} rows`)

await browser.close()
console.log('\nconsole errors:', errs.length ? [...new Set(errs)] : 'none')
console.log(fails.length ? `\n${fails.length} PROBLEM(S):\n - ${fails.join('\n - ')}` : '\nAll interaction checks passed')
process.exit(fails.length ? 1 : 0)
