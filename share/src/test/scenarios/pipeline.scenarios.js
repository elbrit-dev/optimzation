// ─── Pipeline step test cases ─────────────────────────────────────────────────
//
// stepCases: drives one it() per entry in reportSource.test.js (pure step tests)
// pipelineScenarios: full graphqlQueryReportDataSource integration tests (fetch mocked)

import {
  formatStep,
  captureAllRowsStep,
  sidebarFilterStep,
  sidebarSortStep,
  filterStep,
  sortStep,
  nestStep,
  paginateStep,
  buildPipeline,
} from '@/components/SmartDataTable/reportSource.jsx';

function cell(v) { return { value: v, repr: String(v ?? '') }; }
function row(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, cell(v)]));
}

// ─── Pure step cases ──────────────────────────────────────────────────────────

export const stepCases = [
  // ── formatStep ───────────────────────────────────────────────────────────────
  {
    name: 'formatStep: Currency → INR formatted repr',
    step: formatStep(),
    inputState: {
      columns: [{ field: 'amount', header: 'Amount', _fieldtype: 'Currency' }],
      rows: [{ amount: 1000 }],
    },
    params: {},
    assert(result) {
      expect(result.rows[0].amount.value).toBe(1000);
      expect(result.rows[0].amount.repr).toBeDefined();
    },
  },
  {
    name: 'formatStep: Int → right-aligned repr',
    step: formatStep(),
    inputState: {
      columns: [{ field: 'qty', header: 'Qty', _fieldtype: 'Int' }],
      rows: [{ qty: 42 }],
    },
    params: {},
    assert(result) {
      expect(result.rows[0].qty.value).toBe(42);
    },
  },
  {
    name: 'formatStep: null cell → { value: null, repr: null }',
    step: formatStep(),
    inputState: {
      columns: [{ field: 'amount', header: 'Amount', _fieldtype: 'Currency' }],
      rows: [{ amount: null }],
    },
    params: {},
    assert(result) {
      expect(result.rows[0].amount).toEqual({ value: null, repr: null });
    },
  },
  {
    name: 'formatStep: Data fieldtype → identity { value, repr }',
    step: formatStep(),
    inputState: {
      columns: [{ field: 'label', header: 'Name', _fieldtype: 'Data' }],
      rows: [{ label: 'Hello' }],
    },
    params: {},
    assert(result) {
      expect(result.rows[0].label.value).toBe('Hello');
      expect(result.rows[0].label.repr).toBe('Hello');
    },
  },
  {
    name: 'formatStep: column with footer wraps footer value',
    step: formatStep(),
    inputState: {
      columns: [{ field: 'qty', header: 'Qty', _fieldtype: 'Float', footer: 999 }],
      rows: [],
    },
    params: {},
    assert(result) {
      expect(result.columns[0].footer.value).toBe(999);
    },
  },

  // ── captureAllRowsStep ────────────────────────────────────────────────────────
  {
    name: 'captureAllRowsStep: allRows equals rows before filtering',
    step: captureAllRowsStep,
    inputState: { rows: [row({ label: 'A' }), row({ label: 'B' })] },
    params: {},
    assert(result) {
      expect(result.allRows).toHaveLength(2);
      expect(result.allRows).toBe(result.rows);
    },
  },

  // ── filterStep ────────────────────────────────────────────────────────────────
  {
    name: 'filterStep: applies column filters from params',
    step: filterStep,
    inputState: { rows: [row({ label: 'Bangalore' }), row({ label: 'Mumbai' })] },
    params: { filters: { label: { type: 'text', value: 'bang' } } },
    assert(result) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].label.value).toBe('Bangalore');
    },
  },
  {
    name: 'filterStep: empty filters returns all rows',
    step: filterStep,
    inputState: { rows: [row({ label: 'A' }), row({ label: 'B' })] },
    params: { filters: {} },
    assert(result) {
      expect(result.rows).toHaveLength(2);
    },
  },

  // ── sortStep ──────────────────────────────────────────────────────────────────
  {
    name: 'sortStep: sorts by sortMeta from params',
    step: sortStep,
    inputState: {
      rows: [row({ qty: 300 }), row({ qty: 100 }), row({ qty: 200 })],
    },
    params: { sortMeta: [{ field: 'qty', order: 1 }] },
    assert(result) {
      expect(result.rows.map(r => r.qty.value)).toEqual([100, 200, 300]);
    },
  },

  // ── sidebarFilterStep ─────────────────────────────────────────────────────────
  {
    name: 'sidebarFilterStep: returns unchanged when no sidebar filters',
    step: sidebarFilterStep,
    inputState: { rows: [row({ label: 'A' })] },
    params: { viewParams: {} },
    assert(result) {
      expect(result.rows).toHaveLength(1);
    },
  },
  {
    name: 'sidebarFilterStep: filters by sidebar values',
    step: sidebarFilterStep,
    inputState: {
      rows: [row({ hq: 'HQ-Bangalore' }), row({ hq: 'HQ-Mumbai' })],
    },
    params: { viewParams: { _sidebar: { filters: { hq: ['HQ-Bangalore'] } } } },
    assert(result) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].hq.value).toBe('HQ-Bangalore');
    },
  },
  {
    name: 'sidebarFilterStep: empty values array skips that key',
    step: sidebarFilterStep,
    inputState: { rows: [row({ hq: 'A' }), row({ hq: 'B' })] },
    params: { viewParams: { _sidebar: { filters: { hq: [] } } } },
    assert(result) {
      expect(result.rows).toHaveLength(2);
    },
  },

  // ── sidebarSortStep ───────────────────────────────────────────────────────────
  {
    name: 'sidebarSortStep: returns unchanged when no sidebar sort',
    step: sidebarSortStep,
    inputState: { rows: [row({ qty: 200 }), row({ qty: 100 })] },
    params: { viewParams: {} },
    assert(result) {
      expect(result.rows[0].qty.value).toBe(200);
    },
  },
  {
    name: 'sidebarSortStep: sorts ascending by field',
    step: sidebarSortStep,
    inputState: { rows: [row({ qty: 200 }), row({ qty: 100 }), row({ qty: 300 })] },
    params: { viewParams: { _sidebar: { sort: { field: 'qty', direction: 'asc' } } } },
    assert(result) {
      expect(result.rows.map(r => r.qty.value)).toEqual([100, 200, 300]);
    },
  },
  {
    name: 'sidebarSortStep: sorts descending by field',
    step: sidebarSortStep,
    inputState: { rows: [row({ qty: 200 }), row({ qty: 100 }), row({ qty: 300 })] },
    params: { viewParams: { _sidebar: { sort: { field: 'qty', direction: 'desc' } } } },
    assert(result) {
      expect(result.rows.map(r => r.qty.value)).toEqual([300, 200, 100]);
    },
  },

  // ── nestStep ──────────────────────────────────────────────────────────────────
  {
    name: 'nestStep: builds two-level tree from indent rows',
    step: nestStep,
    inputState: {
      rows: [
        { label: cell('Parent A'), indent: 0, is_group: true },
        { label: cell('Child A1'), indent: 1, is_group: false },
        { label: cell('Parent B'), indent: 0, is_group: true },
        { label: cell('Child B1'), indent: 1, is_group: false },
        { label: cell('Child B2'), indent: 1, is_group: false },
      ],
    },
    params: {},
    assert(result) {
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]._children).toHaveLength(1);
      expect(result.rows[1]._children).toHaveLength(2);
      expect(result.rows[0]._children[0].label.value).toBe('Child A1');
    },
  },
  {
    name: 'nestStep: empty input produces empty roots',
    step: nestStep,
    inputState: { rows: [] },
    params: {},
    assert(result) {
      expect(result.rows).toEqual([]);
    },
  },
  {
    name: 'nestStep: depth > 1 — grandparent contains parent contains leaf',
    step: nestStep,
    inputState: {
      rows: [
        { label: cell('Grandparent'), indent: 0, is_group: true  },
        { label: cell('Parent'),      indent: 1, is_group: true  },
        { label: cell('Leaf'),        indent: 2, is_group: false },
      ],
    },
    params: {},
    assert(result) {
      expect(result.rows).toHaveLength(1);
      const gp = result.rows[0];
      expect(gp._children).toHaveLength(1);
      expect(gp._children[0]._children).toHaveLength(1);
      expect(gp._children[0]._children[0].label.value).toBe('Leaf');
    },
  },
  {
    name: 'nestStep: flat rows (no is_group) treated as leaves',
    step: nestStep,
    inputState: {
      rows: [
        { label: cell('A'), indent: 0, is_group: false },
        { label: cell('B'), indent: 0, is_group: false },
      ],
    },
    params: {},
    assert(result) {
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]._children).toBeUndefined();
    },
  },

  // ── paginateStep ──────────────────────────────────────────────────────────────
  {
    name: 'paginateStep: slices first page',
    step: paginateStep,
    inputState: { rows: Array.from({ length: 10 }, (_, i) => row({ idx: i })) },
    params: { pagination: { first: 0, rows: 5 } },
    assert(result) {
      expect(result.rows).toHaveLength(5);
      expect(result.totalRecords).toBe(10);
      expect(result.rows[0].idx.value).toBe(0);
    },
  },
  {
    name: 'paginateStep: slices second page',
    step: paginateStep,
    inputState: { rows: Array.from({ length: 10 }, (_, i) => row({ idx: i })) },
    params: { pagination: { first: 5, rows: 5 } },
    assert(result) {
      expect(result.rows).toHaveLength(5);
      expect(result.rows[0].idx.value).toBe(5);
    },
  },
  {
    name: 'paginateStep: totalRecords equals full row count before slice',
    step: paginateStep,
    inputState: { rows: Array.from({ length: 7 }, (_, i) => row({ idx: i })) },
    params: { pagination: { first: 0, rows: 3 } },
    assert(result) {
      expect(result.totalRecords).toBe(7);
    },
  },
  {
    name: 'paginateStep: first beyond length returns empty rows',
    step: paginateStep,
    inputState: { rows: [row({ idx: 0 })] },
    params: { pagination: { first: 10, rows: 5 } },
    assert(result) {
      expect(result.rows).toHaveLength(0);
      expect(result.totalRecords).toBe(1);
    },
  },

  // ── buildPipeline ─────────────────────────────────────────────────────────────
  {
    name: 'buildPipeline: runs steps in order',
    step: null, // special — tested inline
    inputState: null,
    params: null,
    inline: true,
    async run() {
      const order = [];
      const s1 = (state) => { order.push(1); return { ...state, a: 1 }; };
      const s2 = (state) => { order.push(2); return { ...state, b: 2 }; };
      const ds = buildPipeline([s1, s2]);
      const result = await ds({ filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {} });
      expect(order).toEqual([1, 2]);
      expect(result.a).toBe(1);
      expect(result.b).toBe(2);
    },
  },
  {
    name: 'buildPipeline: calls _debugCapture with step names',
    step: null,
    inline: true,
    async run() {
      const captured = {};
      const s = (state) => state;
      s.stepName = 'myStep';
      const ds = buildPipeline([s]);
      await ds({
        filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {},
        _debugCapture: (name, st) => { captured[name] = st; },
      });
      expect(captured.myStep).toBeDefined();
    },
  },
];

// ─── Integration scenarios (graphqlQueryReportDataSource + fetch mock) ─────────

export const pipelineScenarios = [
  {
    name: 'flat non-pivot: columns parsed, no columnGroups, rows formatted',
    fixture: 'flat-no-pivot',
    params: { filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {} },
    assert(result) {
      expect(result.columnGroups).toBeNull();
      expect(result.columns.find(c => c.field === 'label')).toBeDefined();
      expect(result.columns.find(c => c.field === 'qty')).toBeDefined();
      expect(result.rows[0].qty.value).toBeTypeOf('number');
      expect(result.totalRecords).toBe(10);
    },
  },
  {
    name: 'flat pivot: columnGroups built with identity, months, totals',
    fixture: 'flat-pivot',
    params: { filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {} },
    assert(result) {
      expect(result.columnGroups).not.toBeNull();
      const ids = result.columnGroups.map(g => g.id);
      expect(ids[0]).toBe('identity');
      expect(ids).toContain('2026-01');
      expect(ids).toContain('2026-02');
      expect(ids[ids.length - 1]).toBe('totals');
    },
  },
  {
    name: 'flat pivot: identity group includes flatChildren (invoice_count, customer_count)',
    fixture: 'flat-pivot',
    params: { filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {} },
    assert(result) {
      const identity = result.columnGroups.find(g => g.id === 'identity');
      expect(identity.fields).toContain('invoice_count');
      expect(identity.fields).toContain('customer_count');
      expect(result.columns.find(c => c.field === 'invoice_count')).toBeDefined();
    },
  },
  {
    name: 'flat pivot: totals group has total_qty and total_amount columns',
    fixture: 'flat-pivot',
    params: { filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {} },
    assert(result) {
      const totals = result.columnGroups.find(g => g.id === 'totals');
      expect(totals.fields).toContain('total_qty');
      expect(totals.fields).toContain('total_amount');
    },
  },
  {
    name: 'tree non-pivot: _nestRows builds _children tree, expandable=true',
    fixture: 'tree-no-pivot',
    params: { filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {} },
    assert(result) {
      expect(result.expandable).toBe(true);
      const parents = result.rows.filter(r => r._children);
      expect(parents.length).toBeGreaterThan(0);
    },
  },
  {
    name: 'tree non-pivot: filterValues extracted from _meta',
    fixture: 'tree-no-pivot',
    params: { filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {} },
    assert(result) {
      expect(result.filterValues).toBeDefined();
      expect(result.filterValues.hq).toBeInstanceOf(Array);
      expect(result.filterValues.hq.length).toBeGreaterThan(0);
    },
  },
  {
    name: 'tree non-pivot: filterDefs auto-derived from filterValues keys',
    fixture: 'tree-no-pivot',
    params: { filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {} },
    assert(result) {
      expect(result.filterDefs).toBeInstanceOf(Array);
      const hqDef = result.filterDefs.find(d => d.key === 'hq');
      expect(hqDef).toBeDefined();
      expect(hqDef.label).toBe('HQ');
    },
  },
  {
    name: 'tree non-pivot: meta_totals attached as footer on columns',
    fixture: 'tree-no-pivot',
    params: { filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {} },
    assert(result) {
      const qtyCol = result.columns.find(c => c.field === 'qty');
      expect(qtyCol.footer).toBeDefined();
      expect(qtyCol.footer.value).toBe(2165);
    },
  },
  {
    name: 'tree pivot: pivot columns grouped, children nested',
    fixture: 'tree-pivot',
    params: { filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {} },
    assert(result) {
      expect(result.columnGroups).not.toBeNull();
      expect(result.expandable).toBe(true);
      const parents = result.rows.filter(r => r._children);
      expect(parents.length).toBeGreaterThan(0);
    },
  },
  {
    name: 'HTTP error throws descriptive error',
    fixture: null,
    isErrorCase: true,
    httpStatus: 500,
    params: { filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {} },
    assert(error) {
      expect(error.message).toContain('500');
    },
  },
  {
    name: 'column filter applied end-to-end',
    fixture: 'flat-no-pivot',
    params: {
      filters: { label: { type: 'text', value: 'Bangalore' } },
      sortMeta: [],
      pagination: { first: 0, rows: 25 },
      viewParams: {},
    },
    assert(result) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].label.value).toBe('HQ-Bangalore');
    },
  },
  {
    name: 'sort applied end-to-end',
    fixture: 'flat-no-pivot',
    params: {
      filters: {},
      sortMeta: [{ field: 'qty', order: -1 }],
      pagination: { first: 0, rows: 25 },
      viewParams: {},
    },
    assert(result) {
      const qtys = result.rows.map(r => r.qty.value);
      expect(qtys[0]).toBeGreaterThanOrEqual(qtys[1]);
    },
  },
  {
    name: 'GraphQL errors in response body → throws with error message',
    fixture: null,
    isGqlErrorCase: true,
    gqlErrors: [{ message: 'Report not found' }],
    params: { filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {} },
  },
  {
    name: 'empty edges → 0 rows and 0 totalRecords',
    fixture: null,
    isEmptyCase: true,
    params: { filters: {}, sortMeta: [], pagination: { first: 0, rows: 25 }, viewParams: {} },
    assert(result) {
      expect(result.rows).toHaveLength(0);
      expect(result.totalRecords).toBe(0);
    },
  },
  {
    name: 'viewParams.dateRange → from_date and to_date in fetch body',
    fixture: 'flat-no-pivot',
    isFetchSpyCase: true,
    params: {
      filters: {},
      sortMeta: [],
      pagination: { first: 0, rows: 25 },
      viewParams: { dateRange: ['2026-01-01', '2026-03-31'] },
    },
    assert(_result, spy) {
      const body = JSON.parse(spy.mock.calls[0][1].body);
      expect(body.variables.filters.from_date).toBe('2026-01-01');
      expect(body.variables.filters.to_date).toBe('2026-03-31');
    },
  },
  {
    name: 'viewParams.breakdown → pivot_by_month in fetch body',
    fixture: 'flat-no-pivot',
    isFetchSpyCase: true,
    params: {
      filters: {},
      sortMeta: [],
      pagination: { first: 0, rows: 25 },
      viewParams: { breakdown: true },
    },
    assert(_result, spy) {
      const body = JSON.parse(spy.mock.calls[0][1].body);
      expect(body.variables.filters.pivot_by_month).toBe(1);
    },
  },
  {
    name: 'viewParams._sidebar.filters → dimension filter sent in fetch body',
    fixture: 'flat-no-pivot',
    isFetchSpyCase: true,
    params: {
      filters: {},
      sortMeta: [],
      pagination: { first: 0, rows: 25 },
      viewParams: { _sidebar: { filters: { hq: ['HQ-Bangalore'] } } },
    },
    assert(_result, spy) {
      const body = JSON.parse(spy.mock.calls[0][1].body);
      expect(body.variables.filters.hq).toBe('HQ-Bangalore');
    },
  },
];
