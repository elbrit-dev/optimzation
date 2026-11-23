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
const PDF_TEXT_MAX = 20000;
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
export async function readFile({ schema, label = "", jpegs = [], text = "" }) {
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
  if (text) intro += `\n\nThe file is a PDF; its text, copied out of it, is below.\n--- the file's text ---\n${String(text).slice(0, PDF_TEXT_MAX)}`;
  else if (jpegs.length > 1) intro += `\nThe ${jpegs.length} pictures are the pages of one file, in order.`;
  const out = await cf(`/ai/run/${FILE_MODEL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: [
        { type: "text", text: intro },
        ...jpegs.slice(0, PDF_PAGES).map((j) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${j.toString("base64")}` } })),
      ] }],
      max_tokens: 2000,
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
