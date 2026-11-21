// Field Expense engine service (Cloud Run, 2026-11-21).
//
// Re-runs the TA/DA engine for a month and saves the days whose figures changed
// to Field Expense Day -- the same engine, the same save, as the /field-expenses
// dashboard: it opens that page headless with ?fxsave=1, as the ERP user
// fx-engine@elbrit.org (role "Field Expense Engine"). The page sends only days whose
// calc_hash changed and never touches claimed days (field_expense_days_save).
//
//   POST /recalc   {month: "2026-10", reason?: "..."}   header x-fx-key   -> 202 queued
//   GET  /status                                         header x-fx-key   -> queue, running, recent runs
//   GET  /                                                                 -> ok
//
// Callers: the ERP (non-reported day approved, ...) and Cloud Scheduler (nightly).
// One month runs at a time; a month asked for again while it runs is run once more
// after (the data changed after the page read it). DRY=1 blocks the writes (local test).
const http = require('http');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { chromium = require('@playwright/test').chromium; }

const ERP = (process.env.ERP_URL || 'https://erp.elbrit.org').replace(/\/$/, '');
const TOKEN = (process.env.ERP_TOKEN || '').trim();
const KEY = (process.env.CALL_KEY || '').trim();
const DRY = process.env.DRY === '1';
const RUN_MS = 15 * 60 * 1000;

const queue = [];            // months waiting, in order
const reasons = {};          // month -> [reason, ...] collected while waiting
let running = null;          // { month, reasons, started }
let again = {};              // month -> true: asked again while running
const recent = [];           // last runs

const log = (o) => console.log(JSON.stringify(Object.assign({ at: new Date().toISOString() }, o)));
const okMonth = (m) => /^20\d\d-(0[1-9]|1[0-2])$/.test(String(m || ''));

function enqueue(month, reason) {
  (reasons[month] = reasons[month] || []).push(String(reason || 'unspecified').slice(0, 200));
  if (running && running.month === month) { again[month] = true; return 'running, will run again after'; }
  if (queue.indexOf(month) < 0) queue.push(month);
  setImmediate(pump);
  return 'queued (' + queue.length + ' waiting)';
}

async function pump() {
  if (running || !queue.length) return;
  const month = queue.shift();
  running = { month, reasons: reasons[month] || [], started: new Date().toISOString() };
  delete reasons[month];
  let res;
  try { res = await runMonth(month); } catch (e) { res = { ok: false, note: 'error: ' + String(e && e.message || e).slice(0, 300) }; }
  const done = Object.assign({ month, reasons: running.reasons, started: running.started, finished: new Date().toISOString() }, res);
  recent.unshift(done); recent.length = Math.min(recent.length, 30);
  log(Object.assign({ event: 'run' }, done));
  running = null;
  if (again[month]) { delete again[month]; if (queue.indexOf(month) < 0) queue.push(month); }
  setImmediate(pump);
}

async function runMonth(month) {
  const opts = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  const browser = await chromium.launch(opts).catch(() => chromium.launch(Object.assign({ channel: 'chrome' }, opts)));   // local: the installed Chrome
  const errors = [], saves = [];
  try {
    const ctx = await browser.newContext({ extraHTTPHeaders: { Authorization: 'token ' + TOKEN } });
    // nothing to look at: no pictures, fonts or map tiles
    await ctx.route(/\.(png|jpe?g|gif|webp|svg|woff2?|ttf)(\?|$)|api\.mapbox\.com|tile/i, (r) => r.abort());
    if (DRY) await ctx.route(/\/api\/method\/field_expense_days_(save|prune)/, (r) => {
      let n = 0; try { n = (JSON.parse(r.request().postData() || '{}').days || []).length; } catch (e) { /* prune */ }
      saves.push(n);
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: { saved: n, removed: 0, dry: true } }) });
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    page.on('response', async (r) => {
      if (!DRY && /field_expense_days_save/.test(r.url())) { try { const j = await r.json(); saves.push((j.message && j.message.saved) || 0); } catch (e) { saves.push('?' + r.status()); } }
    });
    await page.goto(ERP + '/field-expenses?month=' + month + '&fxsave=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
    const t0 = Date.now();
    let note = '';
    while (Date.now() - t0 < RUN_MS) {
      await page.waitForTimeout(3000);
      note = await page.evaluate(() => (document.getElementById('fx-erp-save') || {}).textContent || '').catch(() => note);
      if (/^(Saved |Field Expense Day up to date|Field Expense Day not saved)/.test(note)) break;
    }
    const ok = /^(Saved |Field Expense Day up to date)/.test(note);
    return { ok, note: note || 'timed out with no save note', saved: saves, errors: errors.slice(0, 5), secs: Math.round((Date.now() - t0) / 1000), dry: DRY || undefined };
  } finally {
    await browser.close().catch(() => {});
  }
}

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/healthz')) return send(res, 200, { ok: true });
  if (!KEY || req.headers['x-fx-key'] !== KEY) return send(res, 401, { error: 'bad key' });
  if (req.method === 'GET' && req.url.startsWith('/status')) return send(res, 200, { running, queue, recent });
  if (req.method === 'POST' && req.url.startsWith('/recalc')) {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let j = {}; try { j = JSON.parse(body || '{}'); } catch (e) { return send(res, 400, { error: 'json' }); }
      // "auto" (the nightly sweep): this month in India, and last month in its first 7 days
      if (j.months === 'auto') {
        const ist = new Date(Date.now() + 330 * 60000), y = ist.getUTCFullYear(), m = ist.getUTCMonth();
        const ym = (yy, mm) => yy + '-' + String(mm + 1).padStart(2, '0');
        j.months = [ym(y, m)].concat(ist.getUTCDate() <= 7 ? [m ? ym(y, m - 1) : ym(y - 1, 11)] : []);
      }
      const months = (Array.isArray(j.months) ? j.months : [j.month]).filter(okMonth);
      if (!months.length) return send(res, 400, { error: 'month like 2026-10' });
      const out = months.map((m) => ({ month: m, status: enqueue(m, j.reason) }));
      log({ event: 'asked', months, reason: j.reason || null });
      return send(res, 202, { queued: out });
    });
    return;
  }
  send(res, 404, { error: 'not found' });
}).listen(Number(process.env.PORT || 8080), () => log({ event: 'listening', dry: DRY }));

// local one-off: node server.js --once 2026-10
if (process.argv[2] === '--once') runMonth(process.argv[3]).then((r) => { console.log(JSON.stringify(r, null, 1)); process.exit(0); });
