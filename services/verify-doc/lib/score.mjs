/* The score. Deterministic and ours: the model only says what it read off
 * the document (fields[].value, tables[].rows); this file compares that with
 * what the caller expected and hands out each field's weight in points.
 *
 *   number  full points within `tolerance` ("2%" or an absolute amount),
 *           then falling linearly to 0 at 50% off
 *   date    full within `toleranceDays`, falling to 0 at 30 days off
 *   month   all or nothing
 *   text    "exact": same words, ignoring case and punctuation;
 *           "meaning": the model's yes/no on whether it is the same thing
 *   table   each expected row is matched to a document row by its key; the
 *           row's share is split across its columns by column weight;
 *           expected rows the document lacks score 0, and document rows the
 *           caller did not expect count against the table too
 *
 * A field with no `expected` (and no table rows) is read only, never scored.
 * score = points / total weight * 100; risk from `bands`. */

import { daysBetween, normText, parseDate, parseMonth, parseNumber, parseTolerance } from "./parse.mjs";

const NUMBER_FALLOFF = 0.5;
const DATE_FALLOFF_DAYS = 30;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const round2 = (x) => Math.round(x * 100) / 100;

export const DEFAULT_BANDS = { low: 90, medium: 70 };

export function riskOf(score, bands = DEFAULT_BANDS) {
  if (score == null) return null;
  if (score >= (bands.low ?? DEFAULT_BANDS.low)) return "Low";
  if (score >= (bands.medium ?? DEFAULT_BANDS.medium)) return "Medium";
  return "High";
}

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/* One value against its expectation -> { found, ok, fraction, reason }. */
export function compareValue(spec, raw, extra = {}) {
  const type = spec.type || "text";
  if (raw == null || raw === "") return { found: null, ok: false, fraction: 0, reason: "Not found on the document" };

  if (type === "number") {
    const found = parseNumber(raw);
    const expected = parseNumber(spec.expected);
    if (found == null) return { found: raw, ok: false, fraction: 0, reason: `Could not read a number from "${raw}"` };
    const tol = parseTolerance(spec.tolerance);
    const diff = Math.abs(found - expected);
    const base = Math.abs(expected) || 1;
    const allowed = Math.max(tol.abs, tol.rel * base);
    if (diff <= allowed + 1e-9) {
      return { found, ok: true, fraction: 1, reason: diff ? `${fmt(found)} vs ${fmt(expected)}, within tolerance` : `Matches (${fmt(found)})` };
    }
    const fraction = clamp01(1 - (diff - allowed) / (NUMBER_FALLOFF * base));
    const pct = Math.round((diff / base) * 100);
    return { found, ok: false, fraction, reason: `Document shows ${fmt(found)}, expected ${fmt(expected)} (${found < expected ? "" : "+"}${fmt(round2(found - expected))}, ${pct}% off)` };
  }

  if (type === "date") {
    const found = parseDate(raw);
    const expected = parseDate(spec.expected);
    if (!found) return { found: raw, ok: false, fraction: 0, reason: `Could not read a date from "${raw}"` };
    if (!expected) return { found, ok: false, fraction: 0, reason: "Expected date is not a valid date" };
    const days = daysBetween(found, expected);
    const tol = Math.abs(Number(spec.toleranceDays) || 0);
    if (days <= tol) return { found, ok: true, fraction: 1, reason: days ? `${days} day(s) apart, within tolerance` : "Matches" };
    return { found, ok: false, fraction: clamp01(1 - (days - tol) / DATE_FALLOFF_DAYS), reason: `Document date ${found}, expected ${expected} (${days} days apart)` };
  }

  if (type === "month") {
    const found = parseMonth(raw);
    const expected = parseMonth(spec.expected);
    if (!found) return { found: raw, ok: false, fraction: 0, reason: `Could not read a month from "${raw}"` };
    const ok = found === expected;
    return { found, ok, fraction: ok ? 1 : 0, reason: ok ? "Matches" : `Document is for ${found}, expected ${expected}` };
  }

  // text
  if (spec.match === "meaning" && typeof extra.matchesExpected === "boolean") {
    const ok = extra.matchesExpected;
    return { found: raw, ok, fraction: ok ? 1 : 0, reason: ok ? `"${raw}" fits "${spec.expected}"` : `"${raw}" does not fit "${spec.expected}"` };
  }
  const ok = normText(raw) === normText(spec.expected);
  return { found: raw, ok, fraction: ok ? 1 : 0, reason: ok ? "Matches" : `Document shows "${raw}", expected "${spec.expected}"` };
}

const hasExpectation = (spec) =>
  spec.type === "table" ? Array.isArray(spec.expected) : spec.expected !== undefined && spec.expected !== null && spec.expected !== "";

function weightOf(spec) {
  if (!hasExpectation(spec)) return 0;
  const w = Number(spec.weight);
  return Number.isFinite(w) && w >= 0 ? w : 1;
}

function scoreTable(spec, table) {
  const keyCol = spec.key || "item";
  const columns = Object.entries(spec.columns || {});
  const colWeight = columns.reduce((s, [, c]) => s + (Number.isFinite(Number(c.weight)) ? Number(c.weight) : 1), 0) || 1;
  const docRows = (table?.rows || []).map((r) => ({ ...r, used: false }));
  const expected = spec.expected || [];

  const findRow = (want) => {
    const n = normText(want);
    return (
      docRows.find((r) => !r.used && r.mappedTo != null && normText(r.mappedTo) === n) ||
      (spec.keyMatch !== "meaning" ? docRows.find((r) => !r.used && normText(r.label) === n) : null)
    );
  };

  const rows = [];
  const missing = [];
  let earned = 0;
  for (const exp of expected) {
    const want = exp[keyCol];
    const doc = findRow(want);
    if (!doc) {
      missing.push({ [keyCol]: want, reason: "Expected but not found on the document" });
      rows.push({ [keyCol]: want, foundAs: null, ok: false, fraction: 0 });
      continue;
    }
    doc.used = true;
    const cells = {};
    for (const c of doc.cells || []) cells[c.column] = c.value;
    const out = { [keyCol]: want, foundAs: doc.label, confidence: doc.confidence ?? null };
    let rowFraction = 0;
    let rowOk = true;
    const reasons = [];
    for (const [name, col] of columns) {
      const cmp = compareValue({ ...col, expected: exp[name] }, cells[name]);
      const w = (Number.isFinite(Number(col.weight)) ? Number(col.weight) : 1) / colWeight;
      rowFraction += w * cmp.fraction;
      if (!cmp.ok) {
        rowOk = false;
        reasons.push(`${name}: ${cmp.reason}`);
      }
      out[name] = { found: cmp.found, expected: exp[name], ok: cmp.ok };
    }
    out.ok = rowOk;
    out.fraction = round2(rowFraction);
    if (reasons.length) out.reason = reasons.join("; ");
    earned += rowFraction;
    rows.push(out);
  }
  const extra = docRows
    .filter((r) => !r.used)
    .map((r) => {
      const cells = {};
      for (const c of r.cells || []) cells[c.column] = c.value;
      return { foundAs: r.label, ...cells, reason: "On the document but not expected" };
    });
  const denominator = expected.length + extra.length;
  const fraction = denominator ? earned / denominator : 1;
  return { fraction, rows, missing, extra };
}

/* fields: the caller's spec; reading: the model's answer (see gemini.mjs). */
export function scoreReading(fields, reading, bands) {
  const out = {};
  let points = 0;
  let total = 0;
  const readFields = new Map((reading?.fields || []).map((f) => [f.key, f]));
  const readTables = new Map((reading?.tables || []).map((t) => [t.key, t]));

  for (const [key, spec] of Object.entries(fields)) {
    const weight = weightOf(spec);
    total += weight;
    if (spec.type === "table") {
      const t = scoreTable(spec, readTables.get(key));
      const earned = weight * t.fraction;
      points += earned;
      out[key] = { points: round2(earned), weight, ok: t.missing.length === 0 && t.extra.length === 0 && t.rows.every((r) => r.ok), rows: t.rows, missing: t.missing, extra: t.extra };
      continue;
    }
    const r = readFields.get(key) || {};
    if (!weight) {
      out[key] = { found: r.value ?? null, confidence: r.confidence ?? null, ...(r.note ? { note: r.note } : {}) };
      continue;
    }
    const cmp = compareValue(spec, r.value, { matchesExpected: r.matchesExpected });
    const earned = weight * cmp.fraction;
    points += earned;
    out[key] = { found: cmp.found, expected: spec.expected, ok: cmp.ok, points: round2(earned), weight, confidence: r.confidence ?? null, reason: cmp.reason };
  }

  const unreadable = reading?.document && reading.document.readable === false;
  const score = total ? (unreadable ? 0 : Math.round((points / total) * 100)) : null;
  return { score, risk: riskOf(score, bands), fields: out };
}
