// ─── Sort test case registry ──────────────────────────────────────────────────
//
// Each entry drives one it() in tableUtils.test.js.
// rows use { fieldName: { value, repr } } shape.

function row(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, { value: v, repr: String(v ?? '') }])
  );
}

const NUM_ROWS = [
  row({ qty: 300, name: 'Mumbai'   }),
  row({ qty: 710, name: 'Bangalore'}),
  row({ qty: 100, name: 'Mysore'   }),
  row({ qty: 400, name: 'Hyderabad'}),
  row({ qty: 220, name: 'Delhi'    }),
];

const NULL_ROWS = [
  row({ qty: 100  }),
  row({ qty: null }),
  row({ qty: 50   }),
  row({ qty: null }),
  row({ qty: 200  }),
];

const BOOL_ROWS = [
  row({ active: true  }),
  row({ active: false }),
  row({ active: true  }),
];

const DATE_ROWS = [
  row({ joined: '2024-06-01' }),
  row({ joined: '2023-01-15' }),
  row({ joined: '2025-03-10' }),
];

export const sortTestCases = [
  // ── numeric ───────────────────────────────────────────────────────────────────
  {
    name: 'numeric ascending',
    rows: NUM_ROWS,
    sortMeta: [{ field: 'qty', order: 1 }],
    expectedOrder: [100, 220, 300, 400, 710],
    checkField: 'qty',
  },
  {
    name: 'numeric descending',
    rows: NUM_ROWS,
    sortMeta: [{ field: 'qty', order: -1 }],
    expectedOrder: [710, 400, 300, 220, 100],
    checkField: 'qty',
  },

  // ── string ────────────────────────────────────────────────────────────────────
  {
    name: 'string ascending (locale)',
    rows: NUM_ROWS,
    sortMeta: [{ field: 'name', order: 1 }],
    expectedOrder: ['Bangalore', 'Delhi', 'Hyderabad', 'Mumbai', 'Mysore'],
    checkField: 'name',
  },
  {
    name: 'string descending (locale)',
    rows: NUM_ROWS,
    sortMeta: [{ field: 'name', order: -1 }],
    expectedOrder: ['Mysore', 'Mumbai', 'Hyderabad', 'Delhi', 'Bangalore'],
    checkField: 'name',
  },

  // ── null handling ─────────────────────────────────────────────────────────────
  {
    name: 'nulls sort first (ascending)',
    rows: NULL_ROWS,
    sortMeta: [{ field: 'qty', order: 1 }],
    expectedOrder: [null, null, 50, 100, 200],
    checkField: 'qty',
  },
  {
    name: 'nulls sort last (descending)',
    rows: NULL_ROWS,
    sortMeta: [{ field: 'qty', order: -1 }],
    expectedOrder: [200, 100, 50, null, null],
    checkField: 'qty',
  },

  // ── boolean ───────────────────────────────────────────────────────────────────
  {
    name: 'boolean ascending (false before true)',
    rows: BOOL_ROWS,
    sortMeta: [{ field: 'active', order: 1 }],
    checkField: 'active',
    firstValue: false,
  },

  // ── date string ───────────────────────────────────────────────────────────────
  {
    name: 'date string ascending',
    rows: DATE_ROWS,
    sortMeta: [{ field: 'joined', order: 1 }],
    expectedOrder: ['2023-01-15', '2024-06-01', '2025-03-10'],
    checkField: 'joined',
  },

  // ── multi-sort ────────────────────────────────────────────────────────────────
  {
    name: 'multi-sort: primary + tiebreaker',
    rows: [
      row({ group: 'A', qty: 200 }),
      row({ group: 'B', qty: 100 }),
      row({ group: 'A', qty: 100 }),
      row({ group: 'B', qty: 200 }),
    ],
    sortMeta: [{ field: 'group', order: 1 }, { field: 'qty', order: 1 }],
    // expected: A-100, A-200, B-100, B-200
    assertFn(result) {
      expect(result[0].group.value).toBe('A');
      expect(result[0].qty.value).toBe(100);
      expect(result[2].group.value).toBe('B');
      expect(result[2].qty.value).toBe(100);
    },
  },

  // ── immutability ─────────────────────────────────────────────────────────────
  {
    name: 'does not mutate original array',
    rows: NUM_ROWS,
    sortMeta: [{ field: 'qty', order: 1 }],
    checkMutation: true,
  },

  // ── empty sortMeta ────────────────────────────────────────────────────────────
  {
    name: 'empty sortMeta returns input unchanged',
    rows: NUM_ROWS,
    sortMeta: [],
    sameRef: true,
  },
];
