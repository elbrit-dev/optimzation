// node --test lib/__tests__/billDates.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { billDate } from "../billDates.js";

const cases = {
  // day/month/year, as Indian bills print it
  "01/10/2026": "2026-10-01",
  "1/10/2026": "2026-10-01",
  "3/10/26": "2026-10-03", // was read as 3 August (Clairic's "3/8/26" example)
  "10/03/2026": "2026-03-10",
  "01-10-2026": "2026-10-01",
  "01.10.2026": "2026-10-01",
  "01/10/2026  19:40": "2026-10-01",
  "01/10/2026 07:42:18 PM": "2026-10-01",
  "Date: 03/10/2026": "2026-10-03",
  // month names
  "01-Oct-2026": "2026-10-01",
  "1 Oct 2026": "2026-10-01",
  "1 October 2026": "2026-10-01",
  "1st Oct '26": "2026-10-01",
  "01Oct2026": "2026-10-01",
  "01-OCT-26": "2026-10-01",
  "Oct 1, 2026": "2026-10-01",
  "Oct-05-2026": "2026-10-05",
  "5th of October, 2026": "2026-10-05",
  "September 30, 2026": "2026-09-30",
  "30 Sept 2026": "2026-09-30",
  // year first
  "2026-10-01": "2026-10-01",
  "2026/10/01": "2026-10-01",
  // a leading weekday, as cab receipts print it (21 Nov 2026)
  "Wednesday, 7 October 2026": "2026-10-07",
  "Wed, 7 Oct 2026": "2026-10-07",
  "Sat, Oct 3, 2026": "2026-10-03",
  "Tuesday, 13/10/2026": "2026-10-13",
  // leap years
  "29/02/2028": "2028-02-29",
};
const nulls = [null, undefined, "", "null", "31/02/2026", "29/02/2026", "13/13/2026", "01/10", "Oct 2026", "1 Foo 2026", "12345", "01/10/1999", "today", "40712"];

test("dates as printed -> ISO", () => {
  for (const [s, want] of Object.entries(cases)) assert.equal(billDate(s), want, s);
});
test("no date, or not a real one -> null", () => {
  for (const s of nulls) assert.equal(billDate(s), null, String(s));
});
