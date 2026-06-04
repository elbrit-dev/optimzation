// ─── Filter test case registry ────────────────────────────────────────────────
//
// Each entry drives one it() in tableUtils.test.js.
// rows use { fieldName: { value, repr } } shape (post-formatStep).
//
// To add a new case: append an object to the array.

function row(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, { value: v, repr: String(v ?? '') }])
  );
}

const ROWS = [
  row({ name: 'HQ-Bangalore',  qty: 710,  grand_total: 3338816, active: true,  joined: '2024-01-15' }),
  row({ name: 'HQ-Hyderabad',  qty: 400,  grand_total:  383347, active: false, joined: '2024-03-10' }),
  row({ name: 'HQ-Mumbai',     qty: 300,  grand_total: 1085670, active: true,  joined: '2023-11-05' }),
  row({ name: 'HQ-Delhi',      qty: 220,  grand_total: 1378284, active: null,  joined: '2024-06-20' }),
  row({ name: 'HQ-Jaipur',     qty: 290,  grand_total:  537516, active: true,  joined: '2025-02-28' }),
];

export const filterTestCases = [
  // ── text ─────────────────────────────────────────────────────────────────────
  {
    name: 'text: case-insensitive substring match',
    rows: ROWS,
    filters: { name: { type: 'text', value: 'bangalore' } },
    expectedCount: 1,
    checkField: 'name', expectedValues: ['HQ-Bangalore'],
  },
  {
    name: 'text: partial match multiple rows',
    rows: ROWS,
    filters: { name: { type: 'text', value: 'HQ-' } },
    expectedCount: 5,
  },
  {
    name: 'text: no match returns empty',
    rows: ROWS,
    filters: { name: { type: 'text', value: 'zzznomatch' } },
    expectedCount: 0,
  },
  {
    name: 'text: null cell treated as empty string',
    rows: [row({ name: null })],
    filters: { name: { type: 'text', value: 'anything' } },
    expectedCount: 0,
  },
  {
    name: 'text: empty filter value skips filtering',
    rows: ROWS,
    filters: { name: { type: 'text', value: '' } },
    expectedCount: ROWS.length,
  },

  // ── numeric ───────────────────────────────────────────────────────────────────
  {
    name: 'numeric: exact match',
    rows: ROWS,
    filters: { qty: { type: 'numeric', value: '300' } },
    expectedCount: 1,
    checkField: 'qty', expectedValues: [300],
  },
  {
    name: 'numeric: less-than operator',
    rows: ROWS,
    filters: { qty: { type: 'numeric', value: '<300' } },
    expectedCount: 2,
  },
  {
    name: 'numeric: greater-than operator',
    rows: ROWS,
    filters: { qty: { type: 'numeric', value: '>400' } },
    expectedCount: 1,
    checkField: 'qty', expectedValues: [710],
  },
  {
    name: 'numeric: less-than-or-equal operator',
    rows: ROWS,
    filters: { qty: { type: 'numeric', value: '<=300' } },
    expectedCount: 3,
  },
  {
    name: 'numeric: greater-than-or-equal operator',
    rows: ROWS,
    filters: { qty: { type: 'numeric', value: '>=400' } },
    expectedCount: 2,
  },
  {
    name: 'numeric: equals operator',
    rows: ROWS,
    filters: { qty: { type: 'numeric', value: '=220' } },
    expectedCount: 1,
  },
  {
    name: 'numeric: range A<>B inclusive',
    rows: ROWS,
    filters: { qty: { type: 'numeric', value: '290<>400' } },
    expectedCount: 3,
  },
  {
    name: 'numeric: non-numeric cell excluded',
    rows: [row({ qty: 'not-a-number' })],
    filters: { qty: { type: 'numeric', value: '>0' } },
    expectedCount: 0,
  },

  // ── multiselect ───────────────────────────────────────────────────────────────
  {
    name: 'multiselect: value in set',
    rows: ROWS,
    filters: { name: { type: 'multiselect', value: ['HQ-Bangalore', 'HQ-Delhi'] } },
    expectedCount: 2,
  },
  {
    name: 'multiselect: value not in set',
    rows: ROWS,
    filters: { name: { type: 'multiselect', value: ['HQ-London'] } },
    expectedCount: 0,
  },
  {
    name: 'multiselect: empty array skips filter',
    rows: ROWS,
    filters: { name: { type: 'multiselect', value: [] } },
    expectedCount: ROWS.length,
  },

  // ── date ──────────────────────────────────────────────────────────────────────
  {
    name: 'date: within range',
    rows: ROWS,
    filters: { joined: { type: 'date', value: { start: '2024-01-01', end: '2024-12-31' } } },
    expectedCount: 3,
  },
  {
    name: 'date: before start excluded',
    rows: ROWS,
    filters: { joined: { type: 'date', value: { start: '2024-01-16', end: null } } },
    expectedCount: 3,
  },
  {
    name: 'date: after end excluded',
    rows: ROWS,
    filters: { joined: { type: 'date', value: { start: null, end: '2024-01-01' } } },
    expectedCount: 1,
  },

  // ── boolean ───────────────────────────────────────────────────────────────────
  {
    name: 'boolean: filter true',
    rows: ROWS,
    filters: { active: { type: 'boolean', value: true } },
    expectedCount: 3,
  },
  {
    name: 'boolean: filter false (includes null cells which coerce to false)',
    rows: ROWS,
    filters: { active: { type: 'boolean', value: false } },
    expectedCount: 2,
  },
  {
    name: 'boolean: null value skips filter',
    rows: ROWS,
    filters: { active: { type: 'boolean', value: null } },
    expectedCount: ROWS.length,
  },

  // ── multi-field AND ────────────────────────────────────────────────────────────
  {
    name: 'multi-field: AND combination',
    rows: ROWS,
    filters: {
      qty:    { type: 'numeric', value: '>200' },
      active: { type: 'boolean', value: true },
    },
    expectedCount: 3,
  },

  // ── edge cases ────────────────────────────────────────────────────────────────
  {
    name: 'empty filters object returns all rows',
    rows: ROWS,
    filters: {},
    expectedCount: ROWS.length,
  },
  {
    name: 'null filter map returns all rows',
    rows: ROWS,
    filters: null,
    expectedCount: ROWS.length,
  },
  {
    name: 'filter on missing field (no cell) treats as null',
    rows: ROWS,
    filters: { nonexistent: { type: 'text', value: 'x' } },
    expectedCount: 0,
  },
];
