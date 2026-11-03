/* The decision by Laya (IT's question answerer, project elbrit-services) in
 * place of a reading model: Docling extracts the document's text, Laya answers
 * fixed yes/no questions about that text -- does the amount / date the
 * request expects match, does each rule hold -- and this file turns the
 * answers into the same response /v1/verify always gave (score, fields,
 * rules, document). Request: "decider": "laya".
 *
 * Laya never sees the image and never writes free text: an answer is the
 * yes-probability with a confidence. One below LAYA_MIN_CONFIDENCE comes back
 * "abstained" and counts as not confirmed -- the score drops below the bar and
 * a person looks. A yes counts only when it passed: p >= 0.5, not abstained.
 *
 * Fields: number and date (as the app sends); others are asked as "matches".
 * Each field's weight adds to the score when confirmed; total weight = 100. */

import { config } from "./config.mjs";
import { DocError } from "./documents.mjs";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// 2026-08-18 -> "18 August 2026"
const longDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso);
};
const plain = (n) => String(Math.round(Number(n) * 100) / 100);

/* SHORT, plain questions: on a real bill (Goa slip, 3 Nov 2026) long
   instructions ("the FINAL amount actually paid ... within 2% ...") got
   0.53 / 0.46 and abstained; "Does the bill show a total of 950?" got 0.9999,
   "... of 700?" 0.16, "Is the bill dated 18 August 2026?" 0.92, "... 3 March
   2025?" 0.00. Keep them this short. */
function fieldQuestion(key, spec) {
  if ((spec.type || "text") === "number") return `Does the bill show a total of ${plain(spec.expected)}?`;
  if (spec.type === "date") return `Is the bill dated ${longDate(spec.expected)}?`;
  return `Does the bill show ${spec.description || key} as ${spec.expected}?`;
}
// A rule is asked as written when it is a question, else as "Is it true that ...?"
const ruleQuestion = (r) => {
  const t = String(typeof r === "string" ? r : r.text).trim();
  return t.endsWith("?") ? t : `Is it true that ${t.replace(/\.$/, "")}?`;
};

/* One Laya call: the questions about one document's text. */
export async function askLaya(state, questions, { fetchImpl = fetch } = {}) {
  if (!config.layaKey) throw new DocError("Laya is not set up on this service.", 503);
  const res = await fetchImpl(`${config.layaUrl}/v1/systemone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.layaKey}` },
    body: JSON.stringify({ state, questions, min_confidence: config.layaMinConfidence }),
    signal: AbortSignal.timeout(config.layaTimeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new DocError("Laya refused the key.", 503);
  if (!res.ok) throw new DocError(`Laya answered ${res.status} ${json.detail || json.error || ""}`.trim(), res.status === 429 ? 503 : 502);
  return json;
}

/* Wake Laya ahead of a check (a bill form opened): its first call after an
   idle spell takes ~62 s. A one-question call; nothing waits on it. */
export function wakeLaya({ fetchImpl = fetch } = {}) {
  if (!config.layaKey) return false;
  askLaya({ document_text: "warm-up" }, { warm: { type: "noul", instructions: "Is this text a warm-up?" } }, { fetchImpl }).catch(() => {});
  return true;
}

/* An answer as { yes, p, sure, reason }: yes only when p >= 0.5 and not abstained. */
export function readAnswer(a) {
  if (!a || typeof a !== "object") return { yes: null, p: null, sure: false, reason: "Laya gave no answer" };
  const p = typeof a.noul === "number" ? a.noul : typeof a.probabilities?.yes === "number" ? a.probabilities.yes : null;
  const abstained = a.abstention === "abstained";
  const conf = typeof a.confidence === "number" ? a.confidence : a.answer_confidence ?? null;
  if (p == null) return { yes: null, p, sure: false, reason: "Laya gave no answer" };
  if (abstained) return { yes: null, p, sure: false, reason: `Laya was not sure (confidence ${conf != null ? conf.toFixed(2) : "low"}) -- a person checks it` };
  return { yes: p >= 0.5, p, sure: true, reason: null };
}

/* text: Docling's rows. Returns what verify() returns, minus ocr/meta. */
export async function decideWithLaya({ fields, rules = [], text, found = {} }, deps = {}) {
  const questions = {};
  for (const [key, spec] of Object.entries(fields)) questions[`field_${key}`] = { type: "noul", instructions: fieldQuestion(key, spec) };
  rules.forEach((r, i) => { questions[`rule_${i}`] = { type: "noul", instructions: ruleQuestion(r) }; });
  // Only the bill's text: no context line (the request's context is not sent).
  const state = { bill_text: String(text || "").slice(0, 8000) };
  const out = await askLaya(state, questions, deps);
  const answers = out.answers || {};

  let total = 0, got = 0;
  const scoredFields = {};
  for (const [key, spec] of Object.entries(fields)) {
    const w = Number(spec.weight) || 0;
    total += w;
    const a = readAnswer(answers[`field_${key}`]);
    if (a.yes) got += w;
    const label = spec.type === "date" ? "date" : "amount";
    scoredFields[key] = {
      expected: spec.expected,
      // What is on the bill comes from Docling's extraction (Laya reads no values).
      found: found[key] ?? null,
      ok: a.yes === true,
      confidence: a.p,
      reason: a.yes ? null : a.reason || (found[key] != null ? `${found[key]} on the bill, ${spec.expected} entered` : `The ${label} on the bill does not match what was entered`),
    };
  }
  const score = total ? Math.round((got / total) * 100) : 0;
  const scoredRules = rules.map((r, i) => {
    const a = readAnswer(answers[`rule_${i}`]);
    return { rule: typeof r === "string" ? r : r.text, pass: a.yes, reason: a.yes ? "Yes" : a.reason || "No" };
  });
  const issues = [...Object.entries(scoredFields).filter(([, f]) => !f.ok).map(([k, f]) => `${k}: ${f.reason}`), ...scoredRules.filter((r) => r.pass === false).map((r) => r.reason)];
  return {
    score,
    risk: score >= 90 ? "Low" : score >= 70 ? "Medium" : "High",
    fields: scoredFields,
    rules: scoredRules,
    summary: issues.length ? `Laya: ${issues.join("; ")}.` : "Laya: everything checked matches.",
    model: out.routing?.model || null,
  };
}
