/* Which model reads our bills best for the money?
 *
 *   OPENROUTER_API_KEY=… node bench/run.mjs                 the default candidates
 *   OPENROUTER_API_KEY=… node bench/run.mjs a/model b/model   your own list
 *
 * Every bill in bills.json goes through verify-doc's real verify() (same
 * prompt, structured outputs, scoring) with each model. A model is right on a
 * bill when it reads the exact amount, the exact date, and judges the type
 * correctly. Prints a table: accuracy, time, and cost (from OpenRouter's live
 * price list). Bills and answers are fictional. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
if (!process.env.OPENROUTER_API_KEY) {
  console.error("Set OPENROUTER_API_KEY first.");
  process.exit(1);
}
process.env.MODEL_PROVIDER = "openrouter";
const { config } = await import(pathToFileURL(join(here, "../lib/config.mjs")).href);
const { verify } = await import(pathToFileURL(join(here, "../lib/verify.mjs")).href);

const MODELS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["anthropic/claude-haiku-5.5", "openai/gpt-6-luna", "google/gemini-3.5-flash-lite", "google/gemini-3.8-flash"];
// BENCH_BILLS=<path to a bills.json> adds bills kept outside the repo (real
// ones); their "file" is an absolute path.
const bills = JSON.parse(readFileSync(join(here, "bills.json"), "utf8")).map((b) => ({ ...b, path: join(here, "bills", b.file) }));
if (process.env.BENCH_BILLS) for (const b of JSON.parse(readFileSync(process.env.BENCH_BILLS, "utf8"))) bills.push({ ...b, path: b.file });
let prices = {};
try {
  prices = Object.fromEntries(
    ((await (await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(30000) })).json()).data || []).map((m) => [m.id, { in: Number(m.pricing?.prompt || 0), out: Number(m.pricing?.completion || 0) }]),
  );
} catch (e) {
  console.warn("price list unavailable (" + e.message + ") -- cost column will read 0");
}
const USD_INR = 88;

const rows = [];
for (const model of MODELS) {
  config.openrouterModel = model;
  const r = { model, amount: 0, date: 0, type: 0, all: 0, ms: 0, tokens: 0, misses: [], errors: 0 };
  for (const b of bills) {
    const ext = b.file.split(".").pop().toLowerCase();
    const mime = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";
    try {
      const out = await verify({
        documents: [{ data: readFileSync(b.path).toString("base64"), mimeType: mime, name: b.file.split(/[\/]/).pop() }],
        context: `Employee expense claim in India, amounts in INR. Expense: ${b.kind}.`,
        fields: {
          // the app's exact wording (pages/api/claims/check.js)
          amount: { type: "number", expected: b.amount, weight: 70, tolerance: "2%", description: "the FINAL amount actually paid: the grand / total amount, INCLUDING any handwritten additions or corrections (e.g. '950 +20 = 970' means 970) and any handling or delivery fee -- never a sub-total, a tax line or a single item" },
          date: { type: "date", expected: b.date, weight: 15, toleranceDays: 3, description: "the bill or transaction date" },
          category: { type: "text", expected: b.kind, match: "meaning", weight: 15, description: "what the bill is for" },
          vendor: { type: "text", description: "the shop or company that issued the bill" },
        },
      });
      const f = out.fields;
      const okA = f.amount.found === b.amount;
      const okD = f.date.found === b.date;
      const okT = f.category.ok === true;
      r.amount += okA;
      r.date += okD;
      r.type += okT;
      r.all += okA && okD && okT;
      r.ms += out.meta.ms;
      r.tokens += out.meta.tokens || 0;
      if (!(okA && okD && okT)) r.misses.push(`${b.file}: amount ${JSON.stringify(f.amount.found)}${okA ? "" : "✗"} date ${JSON.stringify(f.date.found)}${okD ? "" : "✗"} type ${okT ? "ok" : "✗ " + JSON.stringify(f.category.found)}`);
      process.stdout.write(okA && okD && okT ? "." : "x");
    } catch (e) {
      r.errors += 1;
      r.misses.push(`${b.file}: ERROR ${e.message}`);
      process.stdout.write("E");
    }
  }
  const p = prices[model] || { in: 0, out: 0 };
  // tokens are in+out together; price the split as ~80% input, 20% output
  r.perBillInr = ((r.tokens * 0.8 * p.in + r.tokens * 0.2 * p.out) / bills.length) * USD_INR;
  rows.push(r);
  console.log(`  ${model}  (OCR: ${config.ocrMode})`);
}

const n = bills.length;
console.log(`\n${"model".padEnd(32)} all-right  amount  date  type  errors  avg time   ~₹/bill`);
for (const r of rows.sort((a, b) => b.all - a.all || a.perBillInr - b.perBillInr)) {
  console.log(`${r.model.padEnd(32)} ${String(r.all + "/" + n).padEnd(10)} ${String(r.amount).padEnd(7)} ${String(r.date).padEnd(5)} ${String(r.type).padEnd(5)} ${String(r.errors).padEnd(7)} ${(r.ms / n / 1000).toFixed(1).padStart(5)} s   ${r.perBillInr.toFixed(2)}`);
}
for (const r of rows) if (r.misses.length) console.log(`\n${r.model} missed:\n  ${r.misses.join("\n  ")}`);
