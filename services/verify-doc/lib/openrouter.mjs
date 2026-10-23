/* The same reading as gemini.mjs, through OpenRouter (openrouter.ai): one key
 * and one bill for many models -- Gemini, Claude, GPT -- picked by name in
 * OPENROUTER_MODEL (e.g. "google/gemini-2.5-flash"). Same prompt, same
 * answer shape, same rule: the model only reads, never sees the expected
 * numbers or dates; score.mjs scores.
 *
 * OpenRouter speaks the OpenAI chat format: photos go as image_url data URLs,
 * PDFs as `file` parts, spreadsheets as text. The answer is asked for as JSON
 * (json_schema where the model supports it) and parsed tolerantly -- some
 * models wrap JSON in a code fence. */

import { config } from "./config.mjs";
import { ModelError, RESPONSE_SCHEMA, buildPrompt } from "./gemini.mjs";

/* Gemini's schema dialect ("OBJECT", nullable) -> plain JSON Schema, in the
   form strict structured outputs accept: every object lists ALL its keys as
   required and allows no others; a value that may be missing is nullable
   (["string", "null"]) rather than optional. */
export function toJsonSchema(s) {
  if (!s || typeof s !== "object") return s;
  const type = String(s.type || "").toLowerCase();
  const out = { type: s.nullable ? [type, "null"] : type };
  if (s.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(s.properties)) {
      const optional = !(s.required || []).includes(k);
      const child = toJsonSchema(v);
      // optional in Gemini's schema -> required-but-nullable in strict mode
      if (optional && typeof child.type === "string") child.type = [child.type, "null"];
      out.properties[k] = child;
    }
    out.required = Object.keys(s.properties);
    out.additionalProperties = false;
  }
  if (s.items) out.items = toJsonSchema(s.items);
  return out;
}

export function parseJsonAnswer(text) {
  const t = String(text || "").trim();
  try {
    return JSON.parse(t);
  } catch {
    // ```json ... ``` or prose around the object: take the outermost {...}
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("no JSON");
  }
}

const RETRY = new Set([429, 500, 502, 503, 504]);

export async function readDocuments({ fields, rules, context, documents }, { fetchImpl = fetch } = {}) {
  if (!config.openrouterKey) throw new ModelError("The service has no OpenRouter key configured.", 503);
  const schema = toJsonSchema(RESPONSE_SCHEMA);
  const prompt =
    buildPrompt({ fields, rules, context }) +
    "\n\nAnswer with ONE JSON object only, no prose, matching this JSON Schema:\n" +
    JSON.stringify(schema);
  const content = [{ type: "text", text: prompt }];
  for (const d of documents) {
    if (d.kind === "media" && d.mimeType === "application/pdf") {
      content.push({ type: "file", file: { filename: d.name || "document.pdf", file_data: `data:application/pdf;base64,${d.data}` } });
    } else if (d.kind === "media") {
      content.push({ type: "image_url", image_url: { url: `data:${d.mimeType};base64,${d.data}` } });
    } else {
      content.push({ type: "text", text: `### Document: ${d.name}\n${d.text}` });
    }
  }
  const request = { model: config.openrouterModel, temperature: 0, messages: [{ role: "user", content }] };
  // Structured outputs (openrouter.ai/docs/guides/features/structured-outputs):
  // strict json_schema, routed ONLY to provider endpoints that honour it
  // (require_parameters), plus Response Healing for small JSON slips.
  const structured = {
    response_format: { type: "json_schema", json_schema: { name: "reading", strict: true, schema } },
    provider: { require_parameters: true },
    plugins: [{ id: "response-healing" }],
  };
  const call = async (withFormat) => {
    const body = JSON.stringify(withFormat ? { ...request, ...structured } : request);
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.openrouterKey}`,
          "HTTP-Referer": "https://app.elbrit.org",
          "X-Title": "Elbrit verify-doc",
        },
        body,
        signal: AbortSignal.timeout(config.modelTimeoutMs),
      });
      if (!RETRY.has(res.status)) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    return { res, json: await res.json().catch(() => ({})) };
  };

  // Ask for structured JSON. A model with no endpoint that supports it
  // refuses -- then ask again plainly (the prompt carries the schema, and the
  // answer is parsed tolerantly). Not for auth / credit errors.
  let { res, json } = await call(true);
  if ((!res.ok || json.error) && res.status !== 401 && res.status !== 402) ({ res, json } = await call(false));
  if (!res.ok || json.error) {
    const msg = json.error?.message || `HTTP ${res.status}`;
    throw new ModelError(`OpenRouter (${config.openrouterModel}) refused: ${msg}`, res.status === 402 ? 503 : 502);
  }
  const choice = json.choices?.[0];
  const text = choice?.message?.content;
  if (!text) throw new ModelError(`OpenRouter returned no answer (finish reason ${choice?.finish_reason || "unknown"}).`);
  let reading;
  try {
    reading = parseJsonAnswer(Array.isArray(text) ? text.map((p) => p.text || "").join("") : text);
  } catch {
    throw new ModelError(`The model's answer was not valid JSON (finish reason ${choice?.finish_reason || "unknown"}).`);
  }
  const u = json.usage || {};
  return { reading, usage: { totalTokenCount: u.total_tokens ?? null } };
}
