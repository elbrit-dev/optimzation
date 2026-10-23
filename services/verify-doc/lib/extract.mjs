/* POST /v1/extract -- read a document and say what is on it. No expected
 * values, no score: the way to see that the model really reads the page.
 *
 *   { documents, context?, fields? }    (or form-data: file + optional "request")
 *
 * Without `fields`, a general set for bills and invoices is read (EXTRACT_FIELDS),
 * plus the line items and a line-by-line transcription of every word. With
 * `fields` ({ name: { type, description } }), those are read instead -- e.g.
 * { "pan": { "type": "text", "description": "the PAN printed on the card" } }.
 *
 * -> { fields: { name: { value, confidence } }, items: [ { description, quantity,
 *      amount, confidence } ], text, document, summary, meta } */

import { config } from "./config.mjs";
import { DocError, loadDocuments } from "./documents.mjs";
import { modelName, readDocuments } from "./reader.mjs";
import { applyOcr } from "./ocr.mjs";
import { normalizeValue } from "./score.mjs";

export const EXTRACT_FIELDS = {
  document_type: { type: "text", description: "what kind of document this is (tax invoice, fuel receipt, toll ticket, rent receipt, train ticket...)" },
  vendor: { type: "text", description: "the shop, company or person who issued it" },
  vendor_gstin: { type: "text", description: "the seller's GSTIN, if printed" },
  vendor_address: { type: "text", description: "the seller's address" },
  customer: { type: "text", description: "the customer / bill-to name, if printed" },
  invoice_no: { type: "text", description: "the invoice, bill or receipt number" },
  date: { type: "date", description: "the bill, invoice or transaction date" },
  subtotal: { type: "number", description: "the amount before taxes and fees, if shown" },
  taxes: { type: "number", description: "the total of all taxes (CGST + SGST + IGST + cess), if shown" },
  other_charges: { type: "number", description: "handling, delivery, service or other fees, if shown" },
  total: { type: "number", description: "the final amount paid / payable" },
  currency: { type: "text", description: "the currency (INR unless shown otherwise)" },
  payment_mode: { type: "text", description: "how it was paid (cash, UPI, card, FASTag...), if shown" },
  text: { type: "text", description: "EVERY line of text on the document, top to bottom, exactly as printed, lines separated by \\n" },
  items: {
    type: "table",
    description: "the line items",
    key: "description",
    columns: {
      quantity: { type: "number", description: "quantity" },
      rate: { type: "number", description: "unit price, if shown" },
      amount: { type: "number", description: "the line's total amount" },
    },
  },
};

export async function extract(body, deps = {}) {
  if (!body || typeof body !== "object") throw new DocError("Send a JSON object.");
  const fields = body.fields && Object.keys(body.fields).length ? body.fields : EXTRACT_FIELDS;
  for (const [k, spec] of Object.entries(fields)) {
    if (!spec || typeof spec !== "object") throw new DocError(`Field "${k}" must be an object.`);
    if (spec.expected !== undefined) throw new DocError(`/v1/extract only reads -- drop "expected" from "${k}" (use /v1/verify to compare).`);
  }
  const started = Date.now();
  const loaded = await loadDocuments(body.documents);
  const { documents, ocr } = await applyOcr(loaded, deps);
  const { reading, usage } = await readDocuments({ fields, rules: [], context: body.context, documents }, deps);

  const read = new Map((reading.fields || []).map((f) => [f.key, f]));
  const out = {};
  let text = null;
  for (const [k, spec] of Object.entries(fields)) {
    if (spec.type === "table") continue;
    const f = read.get(k) || {};
    if (k === "text" && fields === EXTRACT_FIELDS) {
      text = f.value ? String(f.value).replace(/\\n/g, "\n") : null;
      continue;
    }
    out[k] = { value: normalizeValue(spec, f.value), raw: f.value ?? null, confidence: f.confidence ?? null };
  }
  const tables = {};
  for (const t of reading.tables || []) {
    const spec = fields[t.key];
    tables[t.key] = (t.rows || []).map((r) => {
      const row = { [spec?.key || "label"]: r.label, confidence: r.confidence ?? null };
      for (const c of r.cells || []) row[c.column] = normalizeValue(spec?.columns?.[c.column] || {}, c.value);
      return row;
    });
  }
  return {
    fields: out,
    ...(fields === EXTRACT_FIELDS ? { items: tables.items || [], text } : { tables }),
    document: reading.document || null,
    ...(ocr ? { ocr: { mode: ocr.mode, text: ocr.text, docling: ocr.docling } } : {}),
    summary: reading.summary || "",
    meta: { provider: config.provider, model: modelName(), ocr: ocr ? ocr.mode : "vision", ms: Date.now() - started, documents: loaded.length, tokens: usage?.totalTokenCount ?? null },
  };
}
