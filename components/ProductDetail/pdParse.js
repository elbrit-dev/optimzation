/**
 * pdParse — parsing helpers for the product-detail components.
 *
 * The ERP Item stores most detailing content as newline/bullet strings
 * ("• Rapid relief…\n• Effective in…"), amounts as "631Cr" strings, and
 * media/market data as child tables. Every product-detail component accepts
 * those RAW shapes and parses here, so a Studio binding is just the field.
 */

/** "• a\n• b" | "a\nb" | ["a","b"] -> ["a","b"]  (bullets/dashes stripped, empties dropped) */
export function parseBullets(input) {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return input.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(input)
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[•\-–•]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Split a multi-block string on blank lines into sections:
 *   "Adults:\n• 1 tablet…\n\nDuration:\n• Short-term…"
 * -> [{heading:"Adults", items:["1 tablet…"]}, {heading:"Duration", items:["Short-term…"]}]
 * A block whose first line is itself a bullet gets heading "".
 */
export function parseSections(input) {
  if (input == null) return [];
  if (Array.isArray(input)) return input;
  return String(input)
    .split(/\r?\n\s*\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return null;
      const firstIsBullet = /^[•\-•]/.test(lines[0]);
      const heading = firstIsBullet ? "" : lines[0].replace(/:\s*$/, "").trim();
      const rest = firstIsBullet ? lines : lines.slice(1);
      return { heading, items: parseBullets(rest.join("\n")) };
    })
    .filter(Boolean);
}

/** "631Cr" | "469.3 Cr" | 631 -> { num: 631, unit: "Cr" }  (num NaN if unparseable) */
export function parseAmount(input, defaultUnit = "Cr") {
  if (input == null || input === "") return { num: NaN, unit: defaultUnit };
  if (typeof input === "number") return { num: input, unit: defaultUnit };
  const s = String(input).trim();
  const num = Number(s.replace(/[^0-9.\-]/g, ""));
  const unit = (s.replace(/[0-9.,\s\-]/g, "") || defaultUnit).trim();
  return { num: isFinite(num) ? num : NaN, unit };
}

/** number-ish -> "6,000" (Indian grouping); non-numeric returned as-is */
export function fmtNum(v) {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  if (!isFinite(n)) return String(v);
  return n.toLocaleString("en-IN");
}

/** ₹ money text; non-numeric returned as-is */
export function fmtMoney(v, currency = "₹") {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  if (!isFinite(n)) return String(v);
  return (
    currency +
    n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
  );
}

/** images: ["url"] | [{product_url}] | [{url,label}] -> [{url,label}] */
export function parseImages(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((it, i) => {
      if (!it) return null;
      if (typeof it === "string") return { url: it, label: `Image ${i + 1}` };
      const url = it.url || it.product_url || it.image || "";
      return url ? { url, label: it.label || `Image ${i + 1}` } : null;
    })
    .filter(Boolean);
}
