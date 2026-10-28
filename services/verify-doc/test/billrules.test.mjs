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

test("bill rules: GSTIN, bill number, payment mode", () => {
  const b = billFromText(GOA);
  assert.match(b.vendor_gstin || "", /^30AGTPB9519J/);
  assert.equal(b.invoice_no, "000038");
  assert.equal(b.payment_mode, "Cash");
  const t = billFromText("Hotel Saravana\nInvoice No: INV-2026/114\nCustomer Name: Sanjay S P\nPaid via GPay\nTotal ₹ 420.00");
  assert.equal(t.invoice_no, "INV-2026/114");
  assert.equal(t.customer, "Sanjay S P");
  assert.equal(t.payment_mode, "UPI");
  assert.equal(t.amount, 420);
});

test("bill rules: receipt split by columns -- the till line is not the amount", () => {
  // Docling can put the left column ("CASH", "C 1 15:48:20") before the right one.
  const md = "TABLE 0004 KOTS 01 CVR 01 WAITER 00\nNO.000038 DATE:-18-08-2026\nFISH CURRY RICE 2 200.00 400.00\nSPL.FISH C.RICE 1 400.00 400.00\nLIME SODA 3 50.00 150.00\nCASH\nC 1 15:48:20\n₹ 950.00\n+20\n= 970";
  assert.equal(billFromText(md).amount, 950);
  assert.equal(billFromText("CASH\nC 1\n").amount, null);
});

test("bill rules: unsure -> blank, never a guess", () => {
  // An address line is not the shop; the blessing line is not the shop either.
  assert.equal(billFromText(GOA).vendor, null);
  const sw = billFromText("II Sri Veerabhadreshwara Swamy Prasanna II\nSWARNAGOWRI BOOK STORE\nDealers in : Stationery & School Supplies\nDate 3/8/26\nPrint Oat 25 75.c0\nEmvelope 1 10.40\nTOTAL 85.c0");
  assert.equal(sw.vendor, "SWARNAGOWRI BOOK STORE");
  // A handwritten total Docling half-reads ("85.c0") is no amount.
  assert.equal(sw.amount, null);
  // A total below an item line is a misread -> blank.
  assert.equal(billFromText("Laxmi Restaurant\nKing fry 1 320.00 320.00\nBangda masala fry 2 230.00 460.00\nTOTAL ₹ 300.00").amount, null);
  // No line naming the total: no "largest number" guess.
  assert.equal(billFromText("Hotel Saravana\nMeals 120.00\nTea 20.00").amount, null);
  // Two different dates and none labelled: blank.
  assert.equal(billFromText("Hotel Saravana\n12/08/2026\n14/08/2026\nTotal ₹ 420.00").date, null);
  // A bare number beside "Grand Total" is trusted; beside "Total" alone it is not.
  assert.equal(billFromText("Hotel Saravana\nGrand Total 420").amount, 420);
  assert.equal(billFromText("Hotel Saravana\nTotal Qty 3").amount, null);
});

test("Docling rows: positions put CASH and 950.00 on one row (real Docling JSON, Goa slip)", async () => {
  const { rowsFromDocling } = await import("../lib/ocr.mjs");
  const at = (text, l, t, b) => ({ text, prov: [{ page_no: 1, bbox: { l, t, b, r: l + 100, coord_origin: "BOTTOMLEFT" } }] });
  const js = { texts: [
    at("DATE:-18-08-2026", 495, 914, 865), at("LIME SODA", 23, 591, 532), at("3 50.00", 480, 601, 536), at("150.00", 708, 601, 540),
    at("CASH", 15, 473, 414), at("C1", 0, 359, 296), at("950.00", 503, 485, 415), at("15:48:20", 341, 357, 298), at("+20", 566, 426, 367),
  ] };
  const rows = rowsFromDocling(js);
  assert.match(rows, /^CASH {2}950\.00$/m);
  assert.match(rows, /^C1 {2}15:48:20$/m);
  assert.equal(billFromText(rows).amount, 950);
  // A total Docling filed under a picture is still read (md_content drops it).
  assert.equal(rowsFromDocling({ texts: [{ ...at("TOTAL", 547, 553, 515), parent: { $ref: "#/pictures/0" } }] }), "TOTAL");
});
