import test from "node:test";
import assert from "node:assert/strict";
import { billFromText } from "../lib/billrules.mjs";
import { config } from "../lib/config.mjs";
import { extract } from "../lib/extract.mjs";

const GOA = `ITGTSHA BLDG VV ROAD MARGAO GOA
GSTIN.30AGTPB9519JIZ7
MOB 9763822983
TABLE 0004 KOTS 01 CVR 01 WAITER 00
NO.000038 DATE:-18-08-2026
| DESCRIPTION | QTY | RATE | AMOUNT |
|---|---|---|---|
| FISH CURRY RICE | 2 | 200.00 | 400.00 |
| SPL.FISH C.RICE | 1 | 400.00 | 400.00 |
| LIME SODA | 3 | 50.00 | 150.00 |
CASH ₹ 950.00
C 1 15:48:20`;

const OLA = `## Ola
Thanks for travelling with us, Sanjay
Ride Details  07 Aug 2026, 09:12 AM
Total Fare ₹ 65
Ride Fare 61.90
Taxes 3.10
Paid by Cash`;

test("bill rules: thermal restaurant slip", () => {
  const b = billFromText(GOA);
  assert.equal(b.amount, 950);
  assert.equal(b.date, "2026-08-18");
  assert.equal(b.title, "Food bill");
  assert.equal(b.readable, true);
});

test("bill rules: cab receipt", () => {
  const b = billFromText(OLA);
  assert.equal(b.amount, 65);
  assert.equal(b.date, "2026-08-07");
  assert.equal(b.title, "Cab bill");
  assert.equal(b.vendor, "Ola");
});

test("bill rules: blank page is not readable", () => {
  assert.equal(billFromText("  \n -- \n").readable, false);
});

test("extract: reader docling never calls the model", async () => {
  const before = { key: config.doclingKey, or: config.openrouterKey };
  config.doclingKey = "k";
  config.openrouterKey = "or-test";
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ status: "success", document: { md_content: GOA } }), { status: 200 });
  };
  const r = await extract(
    { reader: "docling", documents: [{ name: "bill.jpg", mimeType: "image/jpeg", data: "AA==" }], fields: { amount: { type: "number" }, date: { type: "date" }, title: { type: "text" }, kind: { type: "text" } } },
    { fetchImpl },
  );
  Object.assign(config, { doclingKey: before.key, openrouterKey: before.or });
  assert.deepEqual(calls.map((u) => u.includes("/v1/convert")), [true]);
  assert.equal(r.fields.amount.value, 950);
  assert.equal(r.fields.title.value, "Food bill");
  assert.equal(r.fields.kind.value, null);
  assert.equal(r.meta.model, null);
});
