import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/config.mjs";
import { EXTRACT_FIELDS, extract } from "../lib/extract.mjs";

test("extract: no expected values, returns what was read -- typed, with items and full text", async () => {
  const before = { provider: config.provider, key: config.openrouterKey };
  config.provider = "openrouter";
  config.openrouterKey = "or-test";
  let prompt;
  const fetchImpl = async (url, opts) => {
    prompt = JSON.parse(opts.body).messages[0].content[0].text;
    const reading = {
      document: { readable: true, kind: "Tax invoice", language: "English" },
      fields: [
        { key: "vendor", value: "Rajidi Retail Private Limited", confidence: 1 },
        { key: "date", value: "21-10-2026", confidence: 1 },
        { key: "total", value: "₹301.99", confidence: 0.99 },
        { key: "text", value: "TAX INVOICE\nInvoice To: Bharanidharan", confidence: 0.95 },
      ],
      tables: [{ key: "items", rows: [{ label: "Yoga Bar Protein Minis", mappedTo: null, confidence: 0.9, cells: [{ column: "quantity", value: "1" }, { column: "amount", value: "147" }] }] }],
      rules: [],
      summary: "A grocery tax invoice.",
    };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reading) } }], usage: { total_tokens: 900 } }));
  };
  try {
    const out = await extract({ documents: [{ data: Buffer.from("%PDF-1.4 x").toString("base64"), mimeType: "application/pdf" }] }, { fetchImpl });
    assert.ok(prompt.includes('"total"') && prompt.includes('"text"'), "asks for the general fields");
    assert.equal(out.fields.vendor.value, "Rajidi Retail Private Limited");
    assert.equal(out.fields.date.value, "2026-10-21");
    assert.equal(out.fields.total.value, 301.99);
    assert.equal(out.fields.total.raw, "₹301.99");
    assert.equal(out.items[0].description, "Yoga Bar Protein Minis");
    assert.equal(out.items[0].amount, 147);
    assert.equal(out.text, "TAX INVOICE\nInvoice To: Bharanidharan");
    assert.equal(out.score, undefined);
    assert.ok(Object.keys(EXTRACT_FIELDS).length > 10);
    await assert.rejects(extract({ documents: [{ data: "eA==", mimeType: "application/pdf" }], fields: { a: { type: "number", expected: 5 } } }, { fetchImpl }), /only reads/);
  } finally {
    config.provider = before.provider;
    config.openrouterKey = before.key;
  }
});

test("extract: a judge field is asked for as the model's own reading, never null", async () => {
  const { buildPrompt } = await import("../lib/gemini.mjs");
  const p = buildPrompt({ fields: { kind: { type: "text", description: "PRINTED or HANDWRITTEN", judge: true }, amount: { type: "number" } } });
  assert.match(p, /"kind" \(text\) -- PRINTED or HANDWRITTEN\. JUDGEMENT: .*never null/);
  assert.doesNotMatch(p, /"amount" \(number\)\. JUDGEMENT/);
  assert.match(p, /A field marked JUDGEMENT is the one exception/);
});

test("extract: ocr \"vision\" skips Docling for that request", async () => {
  const { applyOcr } = await import("../lib/ocr.mjs");
  const before = { mode: config.ocrMode, key: config.doclingKey };
  config.ocrMode = "both";
  config.doclingKey = "k";
  let called = false;
  const docs = [{ kind: "media", name: "bill.jpg", mimeType: "image/jpeg", data: "AA==" }];
  const r = await applyOcr(docs, { fetchImpl: async () => { called = true; throw new Error("no"); } }, "vision");
  Object.assign(config, { ocrMode: before.mode, doclingKey: before.key });
  assert.equal(called, false);
  assert.equal(r.ocr, null);
  assert.deepEqual(r.documents, docs);
});
