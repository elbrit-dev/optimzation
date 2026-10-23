import test from "node:test";
import assert from "node:assert/strict";
import { parseDate, parseMonth, parseNumber } from "../lib/parse.mjs";
import { riskOf, scoreReading } from "../lib/score.mjs";

test("numbers as printed on Indian bills", () => {
  assert.equal(parseNumber("₹1,23,456.50"), 123456.5);
  assert.equal(parseNumber("Rs. 450/-"), 450);
  assert.equal(parseNumber("INR 1,250.00"), 1250);
  assert.equal(parseNumber("(200)"), -200);
  assert.equal(parseNumber("nil"), null);
});

test("dates read day-first", () => {
  assert.equal(parseDate("03/04/2026"), "2026-04-03");
  assert.equal(parseDate("21-10-26"), "2026-10-21");
  assert.equal(parseDate("21 Oct 2026"), "2026-10-21");
  assert.equal(parseDate("Oct 21, 2026"), "2026-10-21");
  assert.equal(parseDate("2026-10-21"), "2026-10-21");
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(parseDate("46316"), "2026-10-21"); // Excel serial
  assert.equal(parseDate("19-OCT-2026 07:12"), "2026-10-19"); // with a time
  assert.equal(parseDate("20/10/2026, 6:42 PM"), "2026-10-20");
  assert.equal(parseDate("2026-10-20T18:42:00"), "2026-10-20");
  assert.equal(parseMonth("Sep-2026"), "2026-09");
  assert.equal(parseMonth("09/2026"), "2026-09");
});

const CLAIM = {
  amount: { type: "number", expected: 500, weight: 70, tolerance: "2%" },
  date: { type: "date", expected: "2026-10-21", weight: 15, toleranceDays: 3 },
  category: { type: "text", expected: "Fuel", match: "meaning", weight: 15 },
  vendor: { type: "text" },
};

test("a matching bill scores 100 / Low", () => {
  const r = scoreReading(CLAIM, {
    fields: [
      { key: "amount", value: "₹500.00", confidence: 0.98 },
      { key: "date", value: "20/10/2026", confidence: 0.9 },
      { key: "category", value: "Petrol", confidence: 0.95, matchesExpected: true },
      { key: "vendor", value: "HP Petrol Pump", confidence: 0.9 },
    ],
  });
  assert.equal(r.score, 100);
  assert.equal(r.risk, "Low");
  assert.equal(r.fields.vendor.found, "HP Petrol Pump");
  assert.equal(r.fields.vendor.points, undefined); // read only
});

test("amount drives the score: 10% short costs 14 of 70", () => {
  const r = scoreReading(CLAIM, {
    fields: [
      { key: "amount", value: "450", confidence: 0.98 },
      { key: "date", value: "21/10/2026", confidence: 0.9 },
      { key: "category", value: "Petrol", confidence: 0.95, matchesExpected: true },
    ],
  });
  // 10% off, 2% allowed -> 8% over / 50% falloff -> 0.84 of 70 = 58.8
  assert.equal(r.fields.amount.points, 58.8);
  assert.equal(r.score, 89);
  assert.equal(r.risk, "Medium");
  assert.match(r.fields.amount.reason, /450.*500/);
});

test("nothing found and unreadable documents score 0 / High", () => {
  const r = scoreReading(CLAIM, { document: { readable: false }, fields: [] });
  assert.equal(r.score, 0);
  assert.equal(r.risk, "High");
  assert.equal(r.fields.amount.reason, "Not found on the document");
});

test("read-only fields come back typed, with the printed text kept", () => {
  const r = scoreReading({ d: { type: "date" }, n: { type: "number" }, t: { type: "text" } }, { fields: [{ key: "d", value: "07 Aug, 2026", confidence: 1 }, { key: "n", value: "Rs. 65/-", confidence: 1 }, { key: "t", value: "Ola", confidence: 1 }] });
  assert.equal(r.fields.d.found, "2026-08-07");
  assert.equal(r.fields.d.raw, "07 Aug, 2026");
  assert.equal(r.fields.n.found, 65);
  assert.equal(r.fields.t.found, "Ola");
  assert.equal(r.fields.t.raw, undefined);
});

test("read-only requests have no score", () => {
  const r = scoreReading({ vendor: { type: "text" } }, { fields: [{ key: "vendor", value: "X", confidence: 1 }] });
  assert.equal(r.score, null);
  assert.equal(r.risk, null);
});

test("tables: rows by key, missing and extra rows count against it", () => {
  const fields = {
    items: {
      type: "table",
      key: "item",
      keyMatch: "meaning",
      weight: 80,
      columns: { sales_qty: { type: "number", weight: 60 }, closing_qty: { type: "number", weight: 40 } },
      expected: [
        { item: "Aura 10mg Tablet", sales_qty: 120, closing_qty: 40 },
        { item: "Aura 20mg Tablet", sales_qty: 60, closing_qty: 15 },
      ],
    },
    month: { type: "month", expected: "2026-09", weight: 20 },
  };
  const reading = {
    fields: [{ key: "month", value: "Sep-26", confidence: 0.9 }],
    tables: [
      {
        key: "items",
        rows: [
          { label: "AURA 10 TAB", mappedTo: "Aura 10mg Tablet", confidence: 0.9, cells: [{ column: "sales_qty", value: "120" }, { column: "closing_qty", value: "40" }] },
          { label: "AURA-20", mappedTo: "Aura 20mg Tablet", confidence: 0.9, cells: [{ column: "sales_qty", value: "50" }, { column: "closing_qty", value: "15" }] },
          { label: "ZEFRA 500", mappedTo: null, confidence: 0.9, cells: [{ column: "sales_qty", value: "30" }, { column: "closing_qty", value: "0" }] },
        ],
      },
    ],
  };
  const r = scoreReading(fields, reading, { low: 95, medium: 80 });
  const t = r.fields.items;
  assert.equal(t.rows[0].ok, true);
  assert.equal(t.rows[1].ok, false);
  assert.equal(t.rows[1].sales_qty.found, 50);
  assert.equal(t.extra.length, 1);
  assert.equal(t.extra[0].foundAs, "ZEFRA 500");
  assert.equal(t.ok, false);
  assert.equal(r.fields.month.ok, true);
  // row 1 = 1, row 2 = 0.6*(1-(10/60)/0.5)... + 0.4 = 0.6*0.6667+0.4 = 0.8; extra row -> /3
  assert.equal(r.risk, "High");
});

test("risk bands", () => {
  assert.equal(riskOf(90), "Low");
  assert.equal(riskOf(89), "Medium");
  assert.equal(riskOf(69), "High");
  assert.equal(riskOf(96, { low: 95, medium: 80 }), "Low");
});
