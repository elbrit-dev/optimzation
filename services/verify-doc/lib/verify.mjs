/* One verification: check the request, load the documents, have the model
 * read them, score the reading. Returns the response body for /v1/verify. */

import { config } from "./config.mjs";
import { DocError, loadDocuments } from "./documents.mjs";
import { modelName, readDocuments } from "./reader.mjs";
import { applyOcr } from "./ocr.mjs";
import { DEFAULT_BANDS, scoreReading } from "./score.mjs";

const TYPES = new Set(["text", "number", "date", "month", "table"]);

export function validateRequest(body) {
  if (!body || typeof body !== "object") throw new DocError("Send a JSON object.");
  const { fields, rules = [], bands } = body;
  if (!fields || typeof fields !== "object" || !Object.keys(fields).length) throw new DocError("`fields` must name at least one field.");
  for (const [key, spec] of Object.entries(fields)) {
    if (!spec || typeof spec !== "object") throw new DocError(`Field "${key}" must be an object.`);
    const type = spec.type || "text";
    if (!TYPES.has(type)) throw new DocError(`Field "${key}": type must be one of ${[...TYPES].join(", ")}.`);
    if (type === "table") {
      if (!spec.columns || typeof spec.columns !== "object" || !Object.keys(spec.columns).length)
        throw new DocError(`Table "${key}" needs \`columns\`.`);
      if (spec.expected != null && !Array.isArray(spec.expected)) throw new DocError(`Table "${key}": \`expected\` must be a list of rows.`);
      for (const [c, cs] of Object.entries(spec.columns)) {
        if (!TYPES.has(cs.type || "text") || cs.type === "table") throw new DocError(`Table "${key}", column "${c}": unsupported type.`);
      }
    }
  }
  if (!Array.isArray(rules)) throw new DocError("`rules` must be a list.");
  if (bands && (typeof bands !== "object" || !(Number(bands.low) >= Number(bands.medium)))) throw new DocError("`bands` needs low >= medium.");
}

function summarize(reading, scored) {
  const problems = [];
  for (const [key, f] of Object.entries(scored.fields)) {
    if (f.ok === false && f.reason) problems.push(`${key}: ${f.reason}`);
    if (f.rows) {
      for (const r of f.rows) if (r.ok === false) problems.push(`${key}: ${r.reason || Object.values(r).find((v) => v?.reason) || "not matched"}`);
      for (const x of f.extra || []) problems.push(`${key}: ${x.foundAs} ${x.reason.toLowerCase()}`);
    }
  }
  const failed = (reading.rules || []).filter((r) => r.pass === false).map((r) => `rule ${r.index + 1}: ${r.reason}`);
  const head = reading.summary || "";
  const tail = [...problems, ...failed];
  const clean = (t) => String(t).trim().replace(/[.s]+$/, "");
  return tail.length ? `${head} Differences: ${tail.slice(0, 8).map(clean).join("; ")}${tail.length > 8 ? "; …" : ""}.` : `${head} Everything checked matches.`;
}

export async function verify(body, deps = {}) {
  validateRequest(body);
  const started = Date.now();
  const loaded = await loadDocuments(body.documents);
  const { documents, ocr } = await applyOcr(loaded, deps);
  const { reading, usage } = await readDocuments({ fields: body.fields, rules: body.rules || [], context: body.context, documents }, deps);
  const bands = body.bands ? { low: Number(body.bands.low), medium: Number(body.bands.medium) } : DEFAULT_BANDS;
  const scored = scoreReading(body.fields, reading, bands);
  const rules = (body.rules || []).map((r, i) => {
    const got = (reading.rules || []).find((x) => x.index === i);
    return { rule: typeof r === "string" ? r : r.text, pass: got ? got.pass : null, reason: got?.reason || "Not evaluated" };
  });
  return {
    score: scored.score,
    risk: scored.risk,
    fields: scored.fields,
    rules,
    summary: summarize(reading, scored).trim(),
    document: reading.document || null,
    ...(ocr ? { ocr: { mode: ocr.mode, text: ocr.text, docling: ocr.docling } } : {}),
    meta: { provider: config.provider, model: modelName(), ocr: ocr ? ocr.mode : "vision", ms: Date.now() - started, documents: loaded.length, tokens: usage?.totalTokenCount ?? null },
  };
}
