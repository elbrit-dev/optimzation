/* Try verify-doc on a real bill from this machine.
 *
 *   node scripts/try.mjs <bill.jpg|.pdf|.xlsx> <amount> <yyyy-mm-dd> "<Type / Sub type>"
 *   node scripts/try.mjs C:\bills\fuel.jpg 500 2026-10-20 "Travel / Fuel"
 *
 * Calls the DEPLOYED service as a server client: the client key is read from
 * Secret Manager (verify-doc-clients) with your own gcloud login and never
 * printed. Prints the score, risk and what was read off the bill. */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

/*   node scripts/try.mjs --openrouter-models   OpenRouter models that read
 *   images, with their price per million tokens (public list, no key). */
if (process.argv[2] === "--openrouter-models") {
  const j = await (await fetch("https://openrouter.ai/api/v1/models")).json();
  const rows = (j.data || [])
    .filter((m) => (m.architecture?.input_modalities || []).includes("image"))
    .filter((m) => !process.argv[3] || m.id.includes(process.argv[3]))
    .map((m) => ({ id: m.id, in: Number(m.pricing?.prompt || 0) * 1e6, out: Number(m.pricing?.completion || 0) * 1e6, pdf: (m.architecture?.input_modalities || []).includes("file") }))
    .sort((a, b) => a.in - b.in);
  for (const m of rows) console.log(m.id.padEnd(48), `$${m.in.toFixed(2)} in / $${m.out.toFixed(2)} out per 1M`, m.pdf ? " pdf" : "");
  process.exit(0);
}

/*   node scripts/try.mjs --models   lists the Gemini models this project's key
 *   can use (names only; the key itself is never printed). */
if (process.argv[2] === "--models") {
  const gkey = execFileSync("gcloud", ["secrets", "versions", "access", "latest", "--secret=verify-doc-gemini-key", "--project=elbrit-sso-d01d9"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  }).trim();
  if (!gkey) throw new Error("verify-doc-gemini-key came back empty.");
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": gkey } });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  for (const m of j.models || []) {
    if ((m.supportedGenerationMethods || []).includes("generateContent")) console.log(m.name.replace("models/", "").padEnd(42), m.displayName || "");
  }
  process.exit(0);
}

const [file, amount, date, kind = "Travel / Fuel"] = process.argv.slice(2);
if (!file || !amount || !date) {
  console.error('usage: node scripts/try.mjs <bill file> <amount> <yyyy-mm-dd> "<Type / Sub type>"');
  process.exit(1);
}
const URL_ = process.env.VERIFY_DOC_URL || "https://verify-doc--elbrit-sso-d01d9.asia-southeast1.hosted.app";

const raw = execFileSync("gcloud", ["secrets", "versions", "access", "latest", "--secret=verify-doc-clients", "--project=elbrit-sso-d01d9"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
const key = Object.values(JSON.parse(raw))[0];
if (!key) throw new Error("verify-doc-clients has no key in it.");

const ext = file.split(".").pop().toLowerCase();
const mime = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv" }[ext] || "application/octet-stream";

const body = {
  documents: [{ data: readFileSync(file).toString("base64"), mimeType: mime, name: basename(file) }],
  context: `Employee expense claim in India, amounts in INR. Expense: ${kind}.`,
  fields: {
    amount: { type: "number", expected: Number(amount), weight: 70, tolerance: "2%", description: "the final total paid on the bill" },
    date: { type: "date", expected: date, weight: 15, toleranceDays: 3, description: "the bill or transaction date" },
    category: { type: "text", expected: kind, match: "meaning", weight: 15, description: "what the bill is for" },
    vendor: { type: "text", description: "the shop, company or person who issued the bill" },
  },
  rules: ["It must be a bill, receipt, ticket or invoice -- not a selfie, a blank page or an unrelated photo"],
  bands: { low: 90, medium: 70 },
};

const res = await fetch(`${URL_}/v1/verify`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
const out = await res.json();
if (!res.ok) {
  console.error(`HTTP ${res.status}:`, out.error);
  process.exit(1);
}
console.log(`\nScore ${out.score} -- ${out.risk} risk   (${out.meta.ms} ms, ${out.meta.tokens} tokens)\n`);
for (const [k, f] of Object.entries(out.fields)) {
  console.log(`  ${k.padEnd(9)} found: ${JSON.stringify(f.found)}${f.expected !== undefined ? `  expected: ${JSON.stringify(f.expected)}` : ""}${f.points !== undefined ? `  ${f.points}/${f.weight} pts` : ""}${f.confidence != null ? `  conf ${f.confidence}` : ""}`);
  if (f.reason) console.log(`            ${f.reason}`);
}
for (const r of out.rules) console.log(`  rule: ${r.pass ? "PASS" : "FAIL"} -- ${r.reason}`);
console.log(`\n  ${out.summary}\n`);
