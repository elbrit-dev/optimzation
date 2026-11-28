/**
 * Server-only reader for survey File upload questions (23 Nov 2026).
 *
 * Any document or photo (prescription, bill, report, certificate, a shop
 * photo…) is read by Gemma 4 on Cloudflare Workers AI -- the model the bill
 * reader uses (lib/billReader.js) -- against the question's own schema, the
 * one the Survey Manager wrote in Survey Center. Cloudflare holds the answer
 * to that schema (response_format json_schema, strict), wrapped as
 *   { readable, reason, fields: <the question's schema, every value nullable> }
 * so the AI only copies what it sees: a value it cannot find is null, never
 * a guess. Deciding (Approve / Reject) is never the AI's: Survey Center runs
 * the question's rules on these fields in plain code.
 *
 * ⚠️ Never import from a component: it reads CLOUDFLARE_AI_TOKEN.
 */

const env = (name) => (process.env[name] || "").trim();
const ACCOUNT = () => env("CLOUDFLARE_ACCOUNT_ID") || "8f9bef7f528cdc6f7ddb49283821c82a";
const TOKEN = () => env("CLOUDFLARE_AI_TOKEN");

export const fileReaderOn = () => !!TOKEN();
export const FILE_MODEL = "@cf/google/gemma-4-26b-a4b-it";

const PDF_PAGES = 5;
const PDF_TEXT_MAX = 30000; /* one part's text (a long file is read part by part: readFileParts) */
const TYPES = ["string", "number", "integer", "boolean", "object", "array"];

/* The question's schema (JSON Schema as Survey Center keeps it) -> the strict
   form Cloudflare holds Gemma to: every object closed and every key required,
   every plain value nullable (null = "not on the file"). Unknown bits are
   dropped rather than sent. */
export function strictSchema(sc, depth = 0) {
  if (!sc || typeof sc !== "object" || depth > 6) return { type: ["string", "null"] };
  const t = [].concat(sc.type).find((x) => TYPES.includes(x)) || "string";
  const out = {};
  if (typeof sc.description === "string" && sc.description.trim()) out.description = sc.description.trim().slice(0, 300);
  if (t === "object") {
    const props = {};
    for (const [k, v] of Object.entries(sc.properties || {}).slice(0, 60)) {
      if (/^[A-Za-z_][\w]{0,60}$/.test(k)) props[k] = strictSchema(v, depth + 1);
    }
    return { ...out, type: depth ? ["object", "null"] : "object", additionalProperties: false, properties: props, required: Object.keys(props) };
  }
  if (t === "array") return { ...out, type: "array", items: strictSchema(sc.items || { type: "string" }, depth + 1) };
  if (Array.isArray(sc.enum) && sc.enum.length) {
    const vals = sc.enum.filter((x) => ["string", "number", "boolean"].includes(typeof x)).slice(0, 50);
    if (vals.length) return { ...out, type: [t, "null"], enum: [...vals, null] };
  }
  return { ...out, type: [t, "null"] };
}

function describe(sc, pre = "", depth = 0) {
  if (!sc?.properties || depth > 4) return [];
  return Object.entries(sc.properties).flatMap(([k, v]) => {
    const t = [].concat(v?.type)[0] || "string";
    const line = `- ${pre}${k} (${t === "array" ? "a list" : t})${v?.description ? `: ${v.description}` : ""}`;
    if (t === "object") return [line, ...describe(v, `${pre}${k}.`, depth + 1)];
    if (t === "array" && v.items?.properties) return [line, ...describe(v.items, `${pre}${k}[].`, depth + 1)];
    return [line];
  });
}

const PROMPT = (label, sc) => [
  "A field employee uploaded this file for a company survey question" + (label ? `: "${label}"` : "") + ".",
  "It can be any document or photo: a prescription, bill, report, certificate, visiting card, shop or product photo, and so on.",
  "Read it and fill this JSON: readable, reason, and fields.",
  "fields -- copy each value exactly as it appears on the file. When a value is not on the file, or you cannot read it with certainty, use null. Never guess, calculate or invent a value. A list with nothing in it is [].",
  "The fields:",
  ...describe(sc),
  "readable -- false ONLY when the file itself cannot be read: too blurry, too dark, cut off, upside down beyond reading, or blank. A clear file that simply does not show some fields is still readable: true.",
  "reason -- when readable is false, one short sentence saying why (e.g. \"The photo is blurry.\"); otherwise null.",
  "Dates as printed (Indian day/month/year order when ambiguous).",
].join("\n");

async function cf(path, init) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN()}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(90000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const msg = (json.errors || []).map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    throw new Error(`Cloudflare: ${msg}`);
  }
  return json.result;
}

/* An image (any size, any orientation) -> the small upright JPEG Gemma is sent. */
export async function toJpeg(bytes) {
  const sharp = (await import("sharp")).default;
  return sharp(bytes).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}

/* Read one file. Give ONE of: jpegs (a photo, or a scanned PDF's pages in
   order) or text (a PDF's own text).
   -> { readable, reason, fields, model, ms } -- throws when the AI failed
   (that is our problem, never the rep's photo). */
export async function readFile({ schema, label = "", jpegs = [], text = "", part = null, sheet = false, extra = "" }) {
  const t0 = Date.now();
  const strict = strictSchema(schema || { type: "object", properties: {} });
  const format = {
    type: "json_schema",
    json_schema: {
      name: "survey_file",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { readable: { type: "boolean" }, reason: { type: ["string", "null"] }, fields: strict },
        required: ["readable", "reason", "fields"],
      },
    },
  };
  let intro = PROMPT(String(label).slice(0, 300), schema);
  if (extra) intro += "\n" + String(extra).slice(0, 12000); // 28 Nov 2026: e.g. the Elbrit product list
  if (part && part.n > 1) intro += `\nThis is PART ${part.i} of ${part.n} of one longer file (one page, or one block of rows). Fill only what is on THIS part and use null for the rest — the parts are joined afterwards. List every row on this part; never skip one.`;
  if (text && sheet) intro += `\n\nThe file is a SPREADSHEET (Excel / CSV); its rows are below as CSV. A spreadsheet has no pages: leave any page-number or page-count field null. Copy every data row; do not invent totals that are not in it.\n--- the rows ---\n${String(text).slice(0, PDF_TEXT_MAX)}`;
  else if (text) intro += `\n\nThe file is a PDF; its text, copied out of it, is below.\n--- the file's text ---\n${String(text).slice(0, PDF_TEXT_MAX)}`;
  else if (jpegs.length > 1) intro += `\nThe ${jpegs.length} pictures are the pages of one file, in order.`;
  const out = await cf(`/ai/run/${FILE_MODEL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: [
        { type: "text", text: intro },
        ...jpegs.slice(0, PDF_PAGES).map((j) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${j.toString("base64")}` } })),
      ] }],
      max_tokens: 6000,
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
      response_format: format,
    }),
  });
  const choice = out?.choices?.[0] || {};
  const raw = choice.message?.content ?? out?.response ?? "";
  if (choice.message?.reasoning_content) throw new Error("the AI answered with thinking on");
  if (choice.finish_reason && choice.finish_reason !== "stop") throw new Error(`the AI's answer was cut short (${choice.finish_reason})`);
  let j = raw;
  if (typeof raw === "string") {
    const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try {
      j = JSON.parse(s);
    } catch {
      throw new Error("the AI's answer was not JSON");
    }
  }
  if (!j || typeof j !== "object" || typeof j.readable !== "boolean") throw new Error("the AI's answer had no readable flag");
  return {
    readable: j.readable,
    reason: j.readable ? null : String(j.reason || "The file could not be read.").slice(0, 300),
    fields: j.fields && typeof j.fields === "object" ? j.fields : {},
    model: FILE_MODEL,
    ms: Date.now() - t0,
  };
}


/* 26 Nov 2026 · LONG FILES, PART BY PART. A statement with 150 rows over 10 pages does not fit one answer (the
   AI's answer is capped), so each part — a PDF page's text, a page picture, or a block of spreadsheet rows — is read
   on its own (a few at a time) and the answers are joined:
     lists (e.g. rows)                 → every part's items, in order; an item repeated across a page break is kept once
     totals / counts / pages fields    → the LAST part that has one (totals are printed at the end)
     anything else (name, period …)    → the FIRST part that has one
   readable = any part could be read. A part that fails is skipped (noted in fields.parts_failed); all failing → throws.
   parts: [{ text } | { jpeg }] -> { readable, reason, fields, model, ms, parts } */
const PART_PARALLEL = 4;
const LAST_WINS = /total|printed|count|pages|grand|sum/i;
function joinValues(key, vals) {
  const got = vals.filter((v) => v !== null && v !== undefined && !(typeof v === "string" && !v.trim()));
  if (!got.length) return null;
  if (Array.isArray(got[0])) {
    const out = [];
    for (const list of got) {
      if (!Array.isArray(list)) continue;
      list.forEach((item, i) => {
        if (i === 0 && out.length && JSON.stringify(out[out.length - 1]) === JSON.stringify(item)) return;
        out.push(item);
      });
    }
    return out;
  }
  return LAST_WINS.test(key) ? got[got.length - 1] : got[0];
}
export async function readFileParts({ schema, label = "", parts = [], extra = "" }) {
  const t0 = Date.now();
  if (parts.length === 1) return { ...(await readFile({ schema, label, extra, sheet: !!parts[0].sheet, ...(parts[0].text ? { text: parts[0].text } : { jpegs: [parts[0].jpeg] }) })), parts: 1 };
  const results = new Array(parts.length);
  let next = 0;
  async function worker() {
    while (next < parts.length) {
      const i = next++;
      const p = parts[i];
      const one = () => readFile({ schema, label, extra, sheet: !!p.sheet, part: { i: i + 1, n: parts.length }, ...(p.text ? { text: p.text } : { jpegs: [p.jpeg] }) });
      try {
        results[i] = await one();
      } catch {
        try {
          results[i] = await one(); // 26 Nov 2026: one more go before a part is given up (a dropped part loses its rows)
        } catch (e) {
          results[i] = { failed: String(e?.message || e).slice(0, 200) };
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PART_PARALLEL, parts.length) }, worker));
  const ok = results.filter((r) => r && !r.failed);
  if (!ok.length) throw new Error(`no part could be read (${(results[0] && results[0].failed) || "unknown"})`);
  const readable = ok.filter((r) => r.readable);
  const keys = new Set(readable.flatMap((r) => Object.keys(r.fields || {})));
  const fields = {};
  for (const k of keys) fields[k] = joinValues(k, readable.map((r) => (r.fields || {})[k]));
  const failed = results.map((r, i) => (r && r.failed ? i + 1 : 0)).filter(Boolean);
  if (failed.length) fields.parts_failed = failed;
  return {
    readable: readable.length > 0,
    reason: readable.length ? null : ok[0].reason || "The file could not be read.",
    fields,
    model: FILE_MODEL,
    ms: Date.now() - t0,
    parts: parts.length,
  };
}
