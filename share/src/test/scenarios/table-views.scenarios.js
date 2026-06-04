// ─── Table view scenario registry ────────────────────────────────────────────
//
// Single source of truth for all 6 mock views.
// Used by BOTH Vitest (component/integration tests) and Playwright (E2E specs).
//
// To add view 7: append one object here — tests in both layers pick it up.

export const tableViewScenarios = [
  // ── Flat / Non-pivot ──────────────────────────────────────────────────────────
  {
    id:               'customer_item',
    label:            'Flat / Non-pivot (Customer Item)',
    view:             'customer_item',
    hasColumnGroups:  false,
    hasTreeRows:      false,
    hasSidebarFilter: false,
    expectedRowCount: 10,
    expectedColumns:  ['Name', 'Invoice Count', 'Customer Count', 'Total Qty', 'Total Amount', 'Grand Total'],
    filterTests: [
      { column: 'Name',          value: 'Bangalore',  expectedCount: 1 },
      { column: 'Name',          value: 'HQ-',        expectedCount: 10 },
      { column: 'Invoice Count', value: '>2',         expectedCount: 1 },
    ],
    sortTests: [
      { column: 'Invoice Count', order: 'asc',  expectFirstValue: '1' },
      { column: 'Total Qty',     order: 'desc', expectFirstValue: '710' },
    ],
    hiddenColumnTest: { column: 'Customer Count', assertGone: true },
  },

  // ── Tree / Non-pivot ──────────────────────────────────────────────────────────
  {
    id:               'department_hq',
    label:            'Tree / Non-pivot (Department HQ)',
    view:             'department_hq',
    hasColumnGroups:  false,
    hasTreeRows:      true,
    hasSidebarFilter: true,
    expectedRowCount: 10,
    expectedColumns:  ['Name', 'Invoice Count', 'Total Qty', 'Net Amount', 'Tax Amount', 'Grand Total'],
    filterTests: [
      { column: 'Name',      value: 'Cipla',      expectedCount: 1 },
      { column: 'Total Qty', value: '>400',        expectedCount: 2 },
    ],
    sortTests: [
      { column: 'Grand Total', order: 'desc', expectFirstValue: null },
    ],
    expandTest: {
      parentLabel:        'Cipla Maharashtra - ELPL',
      expectedChildCount: 2,
    },
    hiddenColumnTest: { column: 'Tax Amount', assertGone: true },
    sidebarFilterTest: {
      filterKey:      'hq',
      selectValue:    'HQ-Bangalore',
      expectedMin:    1,
    },
  },

  // ── Flat / Pivot ──────────────────────────────────────────────────────────────
  {
    id:               'customer_item_breakdown',
    label:            'Flat / Pivot (Customer Item Breakdown)',
    view:             'customer_item_breakdown',
    hasColumnGroups:  true,
    hasTreeRows:      false,
    hasSidebarFilter: false,
    expectedRowCount: 10,
    expectedGroupLabels: ['Jan 2026', 'Feb 2026', 'Total'],
    identityGroupColumns: ['Invoice Count', 'Customer Count'],
    filterTests: [
      { column: 'Name', value: 'Bangalore', expectedCount: 1 },
    ],
    sortTests: [
      { column: 'Total Qty', order: 'desc', expectFirstValue: null },
    ],
    hiddenColumnTest: { column: 'Invoice Count', assertGone: true },
  },

  // ── Tree / Pivot ──────────────────────────────────────────────────────────────
  {
    id:               'brand_item_breakdown',
    label:            'Tree / Pivot (Brand Item Breakdown)',
    view:             'brand_item_breakdown',
    hasColumnGroups:  true,
    hasTreeRows:      true,
    hasSidebarFilter: false,
    expectedRowCount: 5,
    expectedGroupLabels: ['Jan 2026', 'Feb 2026', 'Total'],
    identityGroupColumns: ['Invoice Count', 'Customer Count'],
    filterTests: [
      { column: 'Name', value: 'Cipla', expectedCount: 1 },
    ],
    sortTests: [
      { column: 'Total Qty', order: 'asc', expectFirstValue: null },
    ],
    expandTest: {
      parentLabel:        'Cipla',
      expectedChildCount: 2,
    },
  },

  // ── Tree / Non-pivot (Brand) ───────────────────────────────────────────────────
  {
    id:               'brand_item',
    label:            'Tree / Non-pivot (Brand Item)',
    view:             'brand_item',
    hasColumnGroups:  false,
    hasTreeRows:      true,
    hasSidebarFilter: true,
    expectedRowCount: 5,
    expectedColumns:  ['Name', 'Invoice Count', 'Total Qty', 'Net Amount', 'Grand Total'],
    filterTests: [
      { column: 'Name', value: 'Abbott', expectedCount: 1 },
    ],
    sortTests: [
      { column: 'Total Qty', order: 'desc', expectFirstValue: null },
    ],
    expandTest: {
      parentLabel:        'Abbott',
      expectedChildCount: 2,
    },
    hiddenColumnTest: { column: 'Net Amount', assertGone: true },
  },

  // ── Tree / Pivot (Department Breakdown) ──────────────────────────────────────
  {
    id:               'department_hq_breakdown',
    label:            'Tree / Pivot (Department HQ Breakdown)',
    view:             'department_hq_breakdown',
    hasColumnGroups:  true,
    hasTreeRows:      true,
    hasSidebarFilter: false,
    expectedRowCount: 10,
    expectedGroupLabels: ['Jan 2026', 'Feb 2026', 'Total'],
    identityGroupColumns: ['Invoice Count', 'Customer Count'],
    filterTests: [
      { column: 'Name', value: 'Cipla', expectedCount: 1 },
    ],
    expandTest: {
      parentLabel:        'Cipla Maharashtra - ELPL',
      expectedChildCount: 2,
    },
    sortTests: [],
  },
];

// Convenience accessors used by Playwright spec filters
export const flatViews     = tableViewScenarios.filter(s => !s.hasColumnGroups && !s.hasTreeRows);
export const treeViews     = tableViewScenarios.filter(s => !s.hasColumnGroups &&  s.hasTreeRows);
export const pivotViews    = tableViewScenarios.filter(s =>  s.hasColumnGroups && !s.hasTreeRows);
export const treePivotViews = tableViewScenarios.filter(s =>  s.hasColumnGroups &&  s.hasTreeRows);
