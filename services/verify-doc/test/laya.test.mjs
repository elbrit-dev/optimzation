import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/config.mjs";
import { verify } from "../lib/verify.mjs";
import { readAnswer } from "../lib/laya.mjs";

const GOA = "TABLE 0004 KOTS 01\nNO-000038  DATE:-18-08-2026\nFISH CURRY RICE  2 200.00  400.00\nCASH  950.00\nC1  15:48:20";

function run(answers, md = GOA) {
  const before = { d: config.doclingKey, l: config.layaKey, o: config.openrouterKey };
  Object.assign(config, { doclingKey: "d", layaKey: "l", openrouterKey: "or-test" });
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url: String(url), body: opts?.body });
    if (String(url).includes("/v1/convert")) return new Response(JSON.stringify({ status: "success", document: { md_content: md } }), { status: 200 });
    if (String(url).includes("/v1/systemone")) return new Response(JSON.stringify({ answers, routing: { model: "english" } }), { status: 200 });
    throw new Error("unexpected call " + url);
  };
  const body = {
    decider: "laya",
    documents: [{ name: "bill.jpg", mimeType: "image/jpeg", data: "AA==" }],
    fields: {
      amount: { type: "number", expected: 950, weight: 80, tolerance: "2%", description: "the final amount paid" },
      date: { type: "date", expected: "2026-08-18", weight: 20, toleranceDays: 0, description: "the bill date" },
    },
    rules: ["It must be a bill, receipt, ticket or invoice", "If the bill names a customer, it should be the employee"],
  };
  return verify(body, { fetchImpl }).finally(() => Object.assign(config, { doclingKey: before.d, layaKey: before.l, openrouterKey: before.o })).then((out) => ({ out, calls }));
}

const yes = (p = 0.97) => ({ noul: p, confidence: 0.95, abstention: "passed" });

test("laya: confident yes on amount and date -> 100, Docling's values as found, no model", async () => {
  const { out, calls } = await run({ field_amount: yes(), field_date: yes(), rule_0: yes(), rule_1: yes() });
  assert.equal(out.score, 100);
  assert.equal(out.fields.amount.ok, true);
  assert.equal(out.fields.amount.found, 950);
  assert.equal(out.fields.date.found, "2026-08-18");
  assert.equal(out.rules[0].pass, true);
  assert.equal(out.meta.provider, "laya");
  assert.equal(out.meta.model, "english");
  // Docling, then Laya -- never OpenRouter.
  assert.deepEqual(calls.map((c) => (c.url.includes("convert") ? "docling" : c.url.includes("systemone") ? "laya" : c.url)), ["docling", "laya"]);
  const sent = JSON.parse(calls[1].body);
  assert.equal(sent.min_confidence, config.layaMinConfidence);
  assert.match(sent.state.bill_text, /CASH {2}950\.00/);
  assert.equal(sent.state.context, undefined);
  assert.equal(sent.questions.field_amount.type, "noul");
  assert.equal(sent.questions.field_amount.instructions, "Does the bill show a total of 950?");
  assert.equal(sent.questions.field_date.instructions, "Is the bill dated 18 August 2026?");
});

test("laya: amount no -> 20, below the bar", async () => {
  const { out } = await run({ field_amount: yes(0.08), field_date: yes(), rule_0: yes(), rule_1: yes() });
  assert.equal(out.score, 20);
  assert.equal(out.fields.amount.ok, false);
});

test("laya: an abstained answer is not a yes -- a person checks it", async () => {
  const { out } = await run({ field_amount: { noul: 0.9, confidence: 0.4, abstention: "abstained" }, field_date: yes(), rule_0: yes(), rule_1: yes() });
  assert.equal(out.score, 20);
  assert.match(out.fields.amount.reason, /not sure/);
});

test("laya: not a bill -> the rule fails", async () => {
  const { out } = await run({ field_amount: yes(), field_date: yes(), rule_0: yes(0.1), rule_1: yes() });
  assert.equal(out.rules[0].pass, false);
});

test("laya: unreadable text never reaches Laya", async () => {
  const { out, calls } = await run({}, " -- ");
  assert.equal(out.document.readable, false);
  assert.equal(out.score, 0);
  assert.equal(calls.filter((c) => c.url.includes("systemone")).length, 0);
});

test("laya: readAnswer", () => {
  assert.equal(readAnswer(yes(0.6)).yes, true);
  assert.equal(readAnswer(yes(0.4)).yes, false);
  assert.equal(readAnswer({ noul: 0.99, abstention: "abstained" }).yes, null);
  assert.equal(readAnswer(null).yes, null);
});
