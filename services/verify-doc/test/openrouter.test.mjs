import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/config.mjs";
import { parseJsonAnswer, toJsonSchema } from "../lib/openrouter.mjs";
import { verify } from "../lib/verify.mjs";

test("Gemini-style schema becomes strict-ready JSON Schema", () => {
  const s = toJsonSchema({ type: "OBJECT", properties: { a: { type: "STRING", nullable: true }, b: { type: "ARRAY", items: { type: "NUMBER" } }, c: { type: "STRING" } }, required: ["a", "b"] });
  assert.deepEqual(s, {
    type: "object",
    properties: { a: { type: ["string", "null"] }, b: { type: "array", items: { type: "number" } }, c: { type: ["string", "null"] } },
    required: ["a", "b", "c"],
    additionalProperties: false,
  });
});

test("answers wrapped in a code fence still parse", () => {
  assert.deepEqual(parseJsonAnswer('```json\n{"x": 1}\n```'), { x: 1 });
  assert.deepEqual(parseJsonAnswer('{"x": 2}'), { x: 2 });
  assert.throws(() => parseJsonAnswer("no json here"));
});

test("a verification through OpenRouter: images as data URLs, PDFs as files, same scoring", async () => {
  const before = { provider: config.provider, key: config.openrouterKey, model: config.openrouterModel };
  config.provider = "openrouter";
  config.openrouterKey = "or-test";
  config.openrouterModel = "google/gemini-2.5-flash";
  let sent;
  const fetchImpl = async (url, opts) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(opts.headers.Authorization, "Bearer or-test");
    sent = JSON.parse(opts.body);
    const reading = {
      document: { readable: true, kind: "receipt", language: "en" },
      fields: [
        { key: "amount", value: "Rs. 450.00", confidence: 0.96 },
        { key: "date", value: "20/10/2026", confidence: 0.9 },
      ],
      tables: [],
      rules: [],
      summary: "A fuel receipt.",
    };
    return new Response(JSON.stringify({ choices: [{ message: { content: "```json\n" + JSON.stringify(reading) + "\n```" }, finish_reason: "stop" }], usage: { total_tokens: 2100 } }));
  };
  try {
    const out = await verify(
      {
        documents: [
          { data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64"), mimeType: "image/jpeg", name: "bill.jpg" },
          { data: Buffer.from("%PDF-1.4 x").toString("base64"), mimeType: "application/pdf", name: "bill.pdf" },
        ],
        fields: { amount: { type: "number", expected: 500, weight: 70, tolerance: "2%" }, date: { type: "date", expected: "2026-10-20", weight: 30 } },
      },
      { fetchImpl },
    );
    const parts = sent.messages[0].content;
    assert.equal(sent.response_format.json_schema.strict, true);
    assert.equal(sent.provider.require_parameters, true);
    assert.deepEqual(sent.plugins, [{ id: "response-healing" }]);
    assert.equal(sent.response_format.json_schema.schema.additionalProperties, false);
    assert.equal(sent.model, "google/gemini-2.5-flash");
    assert.ok(!parts[0].text.includes("500"), "the expected amount must not reach the model");
    assert.match(parts[1].image_url.url, /^data:image\/jpeg;base64,/);
    assert.equal(parts[2].type, "file");
    assert.match(parts[2].file.file_data, /^data:application\/pdf;base64,/);
    assert.equal(out.fields.amount.found, 450);
    assert.equal(out.fields.date.ok, true);
    assert.equal(out.risk, "Medium");
    assert.equal(out.meta.provider, "openrouter");
    assert.equal(out.meta.tokens, 2100);
  } finally {
    config.provider = before.provider;
    config.openrouterKey = before.key;
    config.openrouterModel = before.model;
  }
});

test("OCR_MODE=both: Docling's text goes to the model alongside the image; a Docling failure falls back to the image", async () => {
  const { applyOcr } = await import("../lib/ocr.mjs");
  const before = { mode: config.ocrMode, key: config.doclingKey };
  config.ocrMode = "both";
  config.doclingKey = "dk";
  const img = { kind: "media", mimeType: "image/jpeg", data: Buffer.from([0xff, 0xd8]).toString("base64"), name: "bill.jpg" };
  try {
    const ok = await applyOcr([img], { fetchImpl: async (url, opts) => {
      assert.match(url, /\/v1\/convert\/file$/);
      assert.equal(opts.headers["X-Api-Key"], "dk");
      return new Response(JSON.stringify({ status: "success", document: { md_content: "## Bill\nTOTAL 450" } }));
    } });
    assert.equal(ok.documents.length, 2);
    assert.equal(ok.documents[0].kind, "text");
    assert.match(ok.documents[0].text, /TOTAL 450/);
    assert.equal(ok.documents[1], img);
    assert.equal(ok.ocr.text, "## Bill\nTOTAL 450");
    config.ocrMode = "docling";
    const only = await applyOcr([img], { fetchImpl: async () => new Response(JSON.stringify({ status: "success", document: { md_content: "x" } })) });
    assert.deepEqual(only.documents.map((d) => d.kind), ["text"]);
    const down = await applyOcr([img], { fetchImpl: async () => new Response("{}", { status: 503 }) });
    assert.equal(down.documents[0], img, "falls back to the image");
    assert.ok(down.ocr.docling[0].error);
  } finally {
    config.ocrMode = before.mode;
    config.doclingKey = before.key;
  }
});
