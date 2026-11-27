/**
 * 28 Nov 2026 · Elbrit's own products in every AI read of a table (prescriptions, distributor statements, bills …).
 *
 * The ERP sends the live list of Elbrit products (Item group "Products", not disabled) with the question's schema,
 * so a product added in the ERP is in the very next read. Here:
 *   withElbrit(schema)      every table (a list of rows) gets one more column, elbrit_product
 *   elbritPrompt(products)  the list, for the AI's instructions
 *   tagElbrit(fields, products)
 *                           after the read, each row is checked in plain code: elbrit_product is set to the exact ERP
 *                           name (or the product family when the strength can't be read) or null, and a summary is
 *                           kept as fields._elbrit = { lines, elbrit, items, qty, value, … } — only Elbrit lines count.
 * Server-only (no secrets, but only the AI reader uses it).
 */

/* words that say how a medicine is given, not which one it is */
const FORM = new Set(["TAB", "TABS", "TABLET", "TABLETS", "CAP", "CAPS", "CAPSULE", "CAPSULES", "SYP", "SYRUP", "INJ", "INJECTION"]);
const UNIT = /^(\d+(?:\.\d+)?)(MG|MCG|ML|GM|G)$/;

/* "Tab. Telbrit-40mg" -> ["TELBRIT", "40"]; "GLIMIBRIT M1" -> ["GLIMIBRIT", "M", "1"]; the same on both sides */
export function elbritTokens(s) {
  const up = String(s ?? "")
    .toUpperCase()
    .replace(/(\d)\s*\/\s*(\d)/g, "$1/$2")
    .replace(/[^A-Z0-9./+]+/g, " ")
    .replace(/([A-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Z])/g, "$1 $2");
  const out = [];
  for (let w of up.split(/\s+/)) {
    w = w.replace(/^\.+|\.+$/g, "");
    if (!w || FORM.has(w)) continue;
    const u = w.match(UNIT);
    if (u) w = u[1];
    if (["MG", "MCG", "ML", "GM", "G"].includes(w)) continue;
    out.push(w);
  }
  return out;
}

/* edit distance of two short words, stopping past 1 */
function near(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}

/* the list -> [{ name, tokens }] (once per list) */
const prepared = new WeakMap();
function prep(products) {
  if (prepared.has(products)) return prepared.get(products);
  const list = (products || []).map((name) => ({ name: String(name), tokens: elbritTokens(name) })).filter((p) => p.tokens.length);
  prepared.set(products, list);
  return list;
}

/* one line of text -> { item, family } | null.
   item: the exact ERP name when every word of it is on the line (the most specific one wins);
   family: the product's first word (TELBRIT) when only that could be read (5+ letters, so "MY" or "C" never match alone). */
export function matchElbrit(text, products) {
  const list = prep(products);
  const t = elbritTokens(text);
  if (!t.length) return null;
  const has = (w) => t.includes(w);
  const headAt = (h) => t.findIndex((w) => w === h || (h.length >= 6 && w.length >= 5 && /^[A-Z]+$/.test(w) && near(w, h)));
  let best = null;
  let family = null;
  for (const p of list) {
    const [head, ...rest] = p.tokens;
    const at = headAt(head);
    if (at < 0) continue;
    if (rest.every(has)) {
      if (!best || p.tokens.length > best.tokens.length) best = p;
    } else if (head.length >= 5 && /^[A-Z]+$/.test(head)) family = family || head;
  }
  if (best) return { item: best.name, family: best.tokens[0] };
  return family ? { item: null, family } : null;
}

/* the schema: one more column on every table */
export function withElbrit(schema) {
  if (!schema || typeof schema !== "object") return schema;
  const out = JSON.parse(JSON.stringify(schema));
  for (const v of Object.values(out.properties || {})) {
    if (v && v.type === "array" && v.items && v.items.properties && !v.items.properties.elbrit_product) {
      v.items.properties.elbrit_product = {
        type: "string",
        description: "The exact name from the Elbrit product list when this line is an Elbrit product; only the brand word (e.g. TELBRIT) when it is an Elbrit brand but the strength can't be read; null when it is not Elbrit's",
      };
    }
  }
  return out;
}

export function elbritPrompt(products) {
  const names = (products || []).map(String).filter(Boolean);
  if (!names.length) return "";
  return [
    "",
    `ELBRIT PRODUCTS. The company is Elbrit Life Sciences. These ${names.length} names are its own products (brand and strength):`,
    names.join(", "),
    "For every line of a table, fill elbrit_product: the exact name from this list when the line is that product (same brand and strength; ignore Tab./Cap./mg); only the brand word when it is an Elbrit brand but the strength can't be read; null when the line is not an Elbrit product. Still copy every line, Elbrit or not.",
  ].join("\n");
}

const num = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};
const QTY = /^(qty|quantity|units?|sale_?qty|sold|sales)$/i;
const RATE = /^(rate|price|ptr|pts|unit_price)$/i;
const AMOUNT = /^(amount|value|total|net_?amount|line_total|sales_value)$/i;

/* after the read: each row tagged in plain code, and the summary kept as fields._elbrit */
export function tagElbrit(fields, products) {
  if (!fields || typeof fields !== "object" || !Array.isArray(products) || !products.length) return fields;
  const names = new Map(prep(products).map((p) => [p.tokens.join(" "), p.name]));
  let lines = 0, elbrit = 0, unclear = 0, qty = 0, value = 0, hasQty = false, hasValue = false;
  const items = [];
  for (const [k, rows] of Object.entries(fields)) {
    if (k.startsWith("_") || !Array.isArray(rows) || !rows.every((r) => r && typeof r === "object" && !Array.isArray(r))) continue;
    for (const row of rows) {
      lines++;
      const ai = row.elbrit_product == null ? "" : String(row.elbrit_product);
      const text = Object.entries(row)
        .filter(([c, v]) => c !== "elbrit_product" && typeof v === "string" && /[A-Za-z]/.test(v))
        .map(([, v]) => v)
        .join(" ");
      // what is written on the line decides; the AI's pick only fills in the strength when the line shows just the
      // brand (same brand), or when the line has no text at all
      const exact = names.get(elbritTokens(ai).join(" "));
      const fromLine = matchElbrit(text, products);
      let m = null;
      if (fromLine && fromLine.item) m = fromLine;
      else if (exact && (!text || (fromLine && fromLine.family === elbritTokens(exact)[0]))) m = { item: exact, family: elbritTokens(exact)[0] };
      else if (fromLine) m = fromLine;
      else if (!text && ai) m = matchElbrit(ai, products);
      row.elbrit_product = m ? m.item || m.family : null;
      if (!m) continue;
      elbrit++;
      if (!m.item) unclear++;
      if (!items.includes(row.elbrit_product)) items.push(row.elbrit_product);
      const cols = Object.keys(row);
      const q = cols.find((c) => QTY.test(c)), r = cols.find((c) => RATE.test(c)), a = cols.find((c) => AMOUNT.test(c));
      const qn = q ? num(row[q]) : null, rn = r ? num(row[r]) : null, an = a ? num(row[a]) : null;
      if (qn != null) { qty += qn; hasQty = true; }
      if (an != null) { value += an; hasValue = true; }
      else if (qn != null && rn != null) { value += qn * rn; hasValue = true; }
    }
  }
  if (!lines) return fields;
  fields._elbrit = {
    in_erp: products.length,
    lines,
    elbrit,
    others: lines - elbrit,
    unclear,
    found: elbrit > 0,
    items,
    ...(hasQty ? { qty: Math.round(qty * 100) / 100 } : {}),
    ...(hasValue ? { value: Math.round(value * 100) / 100 } : {}),
  };
  return fields;
}
