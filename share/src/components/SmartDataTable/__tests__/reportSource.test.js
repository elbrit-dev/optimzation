import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  graphqlQueryReportDataSource, graphqlFetchReportFilterValues, buildCustomReportV2Input,
  resolveDrillDown, buildDrillDownInput, graphqlFetchDrillDown, samePathValues, nestStep,
} from '../reportSource.jsx';
import { makeCanExpand } from '../drillDownBranch.jsx';
import { stepCases, pipelineScenarios } from '@/test/scenarios/pipeline.scenarios.js';
import { mockGraphqlFetch, mockGraphqlFetchWithErrors, mockFetchError, restoreFetch } from '@/test/helpers/fetchMocker.js';

// ─── buildCustomReportV2Input translation ─────────────────────────────────────

describe('buildCustomReportV2Input', () => {
  afterEach(() => vi.restoreAllMocks());

  it('translates date_range, group_by and metrics', () => {
    const input = buildCustomReportV2Input({
      filters: {
        from_date: '2026-01-01',
        to_date: '2026-03-31',
        group_by: ['Department', 'HQ'],
        selected_columns: ['net_primary', 'qty'],
      },
      page: 1,
      limit: 20,
    });
    expect(input.report).toBe('SALES');
    expect(input.date_range).toEqual({ from_date: '2026-01-01', to_date: '2026-03-31' });
    expect(input.group_by).toEqual(['DEPARTMENT', 'HQ']);
    expect(input.metrics).toEqual(['NET_PRIMARY', 'QTY']);
    expect(input.page).toBe(1);
    expect(input.limit).toBe(20);
  });

  it('accepts comma-separated strings for group_by and selected_columns', () => {
    const input = buildCustomReportV2Input({
      filters: { group_by: 'Department,HQ', selected_columns: 'net_primary,qty' },
    });
    expect(input.group_by).toEqual(['DEPARTMENT', 'HQ']);
    expect(input.metrics).toEqual(['NET_PRIMARY', 'QTY']);
  });

  it('omits metrics entirely when selected_columns is empty (server defaults to all)', () => {
    const input = buildCustomReportV2Input({ filters: { group_by: ['Department'] } });
    expect(input.metrics).toBeUndefined();
  });

  it('drops unrecognized group_by dimensions with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const input = buildCustomReportV2Input({ filters: { group_by: ['Department', 'NotADimension'] } });
    expect(input.group_by).toEqual(['DEPARTMENT']);
    expect(warn).toHaveBeenCalled();
  });

  it('builds dimension_filters from value-filter keys present in filters', () => {
    const input = buildCustomReportV2Input({
      filters: { group_by: ['HQ'], hq: 'HQ-Bangalore', brand: ['Cipla', 'Lupin'] },
    });
    expect(input.dimension_filters).toEqual(
      expect.arrayContaining([
        { dimension: 'HQ', operator: 'IN', values: ['HQ-Bangalore'] },
        { dimension: 'BRAND', operator: 'IN', values: ['Cipla', 'Lupin'] },
      ])
    );
  });

  it('maps pivot options from pivot_by_month/pivot_period/display_in_lakhs', () => {
    const input = buildCustomReportV2Input({
      filters: { group_by: ['HQ'], pivot_by_month: 1, pivot_period: 'week', display_in_lakhs: 1 },
    });
    expect(input.options.pivot).toBe(true);
    expect(input.options.pivot_period).toBe('WEEK');
    expect(input.options.display_in_lakhs).toBe(true);
  });

  it('does not request inline filter values (deprecated and ignored server-side)', () => {
    const input = buildCustomReportV2Input({ filters: { group_by: ['HQ'] } });
    expect(input.options).not.toHaveProperty('include_filter_values');
  });

  describe('sort translation', () => {
    it('maps "label" to the outermost group_by dimension', () => {
      const input = buildCustomReportV2Input({
        filters: { group_by: ['HQ', 'Customer'] },
        sort_by: 'label:desc',
      });
      expect(input.sort).toEqual([{ dimension: 'HQ', direction: 'DESC' }]);
    });

    it('maps a metric field to a metric sort entry', () => {
      const input = buildCustomReportV2Input({
        filters: { group_by: ['HQ'] },
        sort_by: 'net_primary:asc',
      });
      expect(input.sort).toEqual([{ metric: 'NET_PRIMARY', direction: 'ASC' }]);
    });

    it('drops a dimension sort field that is not in group_by (SORT_DIMENSION_NOT_GROUPED guard)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const input = buildCustomReportV2Input({
        filters: { group_by: ['HQ'] },
        sort_by: 'department:asc',
      });
      expect(input.sort).toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });

    it('keeps a dimension sort field that is in group_by', () => {
      const input = buildCustomReportV2Input({
        filters: { group_by: ['HQ', 'Department'] },
        sort_by: 'department:asc',
      });
      expect(input.sort).toEqual([{ dimension: 'DEPARTMENT', direction: 'ASC' }]);
    });

    it('drops unrecognized sort fields with a warning', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const input = buildCustomReportV2Input({
        filters: { group_by: ['HQ'] },
        sort_by: 'not_a_field:asc',
      });
      expect(input.sort).toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });
  });
});

// ─── Pure pipeline step tests ─────────────────────────────────────────────────

describe('pipeline steps', () => {
  stepCases.forEach(tc => {
    it(tc.name, async () => {
      if (tc.inline) {
        await tc.run();
        return;
      }
      const result = await Promise.resolve(tc.step(tc.inputState, tc.params ?? {}));
      tc.assert(result);
    });
  });
});

// ─── graphqlQueryReportDataSource integration ─────────────────────────────────

describe('graphqlQueryReportDataSource', () => {
  const fixtures = {
    'flat-no-pivot': () => import('@/test/fixtures/frappe-responses/flat-no-pivot.json'),
    'flat-pivot':    () => import('@/test/fixtures/frappe-responses/flat-pivot.json'),
    'tree-no-pivot': () => import('@/test/fixtures/frappe-responses/tree-no-pivot.json'),
    'tree-pivot':    () => import('@/test/fixtures/frappe-responses/tree-pivot.json'),
  };

  const EMPTY_FIXTURE = {
    columns: [{ fieldname: 'label', label: 'Name', fieldtype: 'Data', width: 200 }],
    result: [],
  };

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  pipelineScenarios.forEach(sc => {
    it(sc.name, async () => {
      const ds = graphqlQueryReportDataSource({ endpoint: '/x', token: 't', variables: { report: 'Test', filters: {} }, reportApiVersion: 'v2' });

      // HTTP error
      if (sc.isErrorCase) {
        mockFetchError(sc.httpStatus);
        await expect(ds(sc.params)).rejects.toThrow(String(sc.httpStatus));
        return;
      }

      // GraphQL errors array in body
      if (sc.isGqlErrorCase) {
        mockGraphqlFetchWithErrors(sc.gqlErrors);
        await expect(ds(sc.params)).rejects.toThrow(sc.gqlErrors[0].message);
        return;
      }

      // Empty result set
      if (sc.isEmptyCase) {
        mockGraphqlFetch(EMPTY_FIXTURE);
        const result = await ds(sc.params);
        sc.assert(result);
        return;
      }

      const fixture = await fixtures[sc.fixture]();

      // Spy case: capture the fetch call body for assertion
      if (sc.isFetchSpyCase) {
        const spy = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            data: {
              customReportV2: {
                report_meta: [{ columns: fixture.default.columns }],
                totalCount: fixture.default.result.length,
                edges: fixture.default.result.map(node => ({ node })),
                pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
              },
            },
          }),
        });
        global.fetch = spy;
        const result = await ds(sc.params);
        sc.assert(result, spy);
        return;
      }

      mockGraphqlFetch(fixture.default);
      const result = await ds(sc.params);
      sc.assert(result);
    });
  });
});

// ─── reportApiVersion toggle ───────────────────────────────────────────────────

describe('graphqlQueryReportDataSource — reportApiVersion toggle', () => {
  afterEach(() => vi.restoreAllMocks());

  const EMPTY_COLUMNS = [{ fieldname: 'label', label: 'Name', fieldtype: 'Data' }];
  const params = { filters: {}, sortBy: {}, pagination: { first: 0, rows: 10 }, viewParams: {} };

  it('defaults to v1: calls customReport with flat filters variables', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { customReport: { report_meta: [{ columns: EMPTY_COLUMNS }], edges: [] } } }),
    });
    global.fetch = spy;

    const ds = graphqlQueryReportDataSource({
      endpoint: '/x', token: 't',
      variables: { report: 'Test', filters: { group_by: ['Department'] } },
    });
    await ds(params);

    const body = JSON.parse(spy.mock.calls[0][1].body);
    expect(body.query).toContain('customReport(');
    expect(body.query).not.toContain('customReportV2');
    expect(body.variables.filters.group_by).toEqual(['Department']);
  });

  it('reportApiVersion: "v2" calls customReportV2 with a structured input', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { customReportV2: { report_meta: [{ columns: EMPTY_COLUMNS }], edges: [] } } }),
    });
    global.fetch = spy;

    const ds = graphqlQueryReportDataSource({
      endpoint: '/x', token: 't',
      variables: { report: 'Test', filters: { group_by: ['Department'] } },
      reportApiVersion: 'v2',
    });
    await ds(params);

    const body = JSON.parse(spy.mock.calls[0][1].body);
    expect(body.query).toContain('customReportV2(');
    expect(body.variables.input.group_by).toEqual(['DEPARTMENT']);
  });

  it('an unrecognized reportApiVersion falls back to v1', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { customReport: { report_meta: [{ columns: EMPTY_COLUMNS }], edges: [] } } }),
    });
    global.fetch = spy;

    const ds = graphqlQueryReportDataSource({
      endpoint: '/x', token: 't',
      variables: { report: 'Test', filters: {} },
      reportApiVersion: 'v3',
    });
    await ds(params);

    const body = JSON.parse(spy.mock.calls[0][1].body);
    expect(body.query).toContain('customReport(');
  });
});

// ─── filterDefs source ─────────────────────────────────────────────────────────

describe('graphqlQueryReportDataSource — filterDefs', () => {
  afterEach(() => vi.restoreAllMocks());

  const params = { filters: {}, sortBy: {}, pagination: { first: 0, rows: 10 }, viewParams: {} };

  function mockV2(metaCol) {
    const columns = [{ fieldname: 'label', label: 'Name', fieldtype: 'Data' }, metaCol];
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { customReportV2: { report_meta: [{ columns }], edges: [] } } }),
    });
    global.fetch = spy;
    return spy;
  }

  it('v2: derives the full dimension list even though meta_filter_values is empty', async () => {
    mockV2({ fieldname: '_meta', label: '', fieldtype: 'Data', meta_filter_values: {} });

    const ds = graphqlQueryReportDataSource({
      endpoint: '/x', token: 't',
      variables: { report: 'Test', filters: {} },
      reportApiVersion: 'v2',
    });
    const result = await ds(params);

    expect(result.filterDefs.map(d => d.key)).toEqual([
      'department', 'hq', 'customer', 'item', 'brand',
      'warehouse', 'batch_no', 'item_group', 'territory', 'invoice',
    ]);
    expect(result.filterDefs.find(d => d.key === 'hq').label).toBe('HQ');
  });

  it('v1: still derives filterDefs from the meta_filter_values keys', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { customReport: { report_meta: [{ columns: [
        { fieldname: 'label', label: 'Name', fieldtype: 'Data' },
        { fieldname: '_meta', label: '', fieldtype: 'Data', meta_filter_values: { hq: [{ value: 'HQ-Pune' }] } },
      ] }], edges: [] } } }),
    });
    global.fetch = spy;

    const ds = graphqlQueryReportDataSource({
      endpoint: '/x', token: 't',
      variables: { report: 'Test', filters: {} },
    });
    const result = await ds(params);

    expect(result.filterDefs.map(d => d.key)).toEqual(['hq']);
  });
});

// ─── reportFilterValues ────────────────────────────────────────────────────────

describe('graphqlFetchReportFilterValues', () => {
  afterEach(() => { restoreFetch(); vi.restoreAllMocks(); });

  const apiConfig = {
    endpoint: '/x', token: 't',
    variables: { report: 'Test', filters: { from_date: '2026-01-01', to_date: '2026-03-31' } },
  };

  function mockGroup(values, truncated = false) {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { reportFilterValues: { groups: [
        { filter_key: 'hq', values, truncated },
      ] } } }),
    });
    global.fetch = spy;
    return spy;
  }

  function inputOf(spy) {
    return JSON.parse(spy.mock.calls[0][1].body).variables.input;
  }

  it('queries one dimension, with counts, over the resolved date range', async () => {
    const spy = mockGroup([{ value: 'HQ-Pune', distinct_count: 3, line_count: 9 }]);

    const result = await graphqlFetchReportFilterValues(apiConfig, 'hq', {
      dateRange: { from_date: '2026-02-01', to_date: '2026-02-28' },
    });

    const input = inputOf(spy);
    expect(input.report).toBe('SALES');
    expect(input.dimensions).toEqual(['HQ']);
    expect(input.date_range).toEqual({ from_date: '2026-02-01', to_date: '2026-02-28' });
    expect(input.include_counts).toBe(true);
    expect(input.limit).toBe(20);
    expect(result.items).toEqual([{ value: 'HQ-Pune', label: 'HQ-Pune', count: 9 }]);
    expect(result.hasMore).toBe(false);
  });

  it('falls back to api.variables.filters when no date control is active', async () => {
    const spy = mockGroup([]);
    await graphqlFetchReportFilterValues(apiConfig, 'hq', {});
    expect(inputOf(spy).date_range).toEqual({ from_date: '2026-01-01', to_date: '2026-03-31' });
  });

  it('sends other dimensions as IN filters and leaves out the dimension being fetched', async () => {
    const spy = mockGroup([]);
    await graphqlFetchReportFilterValues(apiConfig, 'hq', {
      currentFilters: { hq: ['HQ-Pune'], department: ['Elbrit'], brand: [] },
    });
    expect(inputOf(spy).dimension_filters).toEqual([
      { dimension: 'DEPARTMENT', operator: 'IN', values: ['Elbrit'] },
    ]);
  });

  it('passes search through and widens limit to cover the requested page', async () => {
    const spy = mockGroup([]);
    await graphqlFetchReportFilterValues(apiConfig, 'hq', { page: 3, pageLength: 20, search: 'ban' });
    expect(inputOf(spy).search).toBe('ban');
    expect(inputOf(spy).limit).toBe(60);
  });

  it('slices the requested page out of the returned values', async () => {
    const values = Array.from({ length: 40 }, (_, i) => ({ value: `HQ-${i}`, line_count: i }));
    mockGroup(values, true);

    const result = await graphqlFetchReportFilterValues(apiConfig, 'hq', { page: 2, pageLength: 20 });

    expect(result.items).toHaveLength(20);
    expect(result.items[0].value).toBe('HQ-20');
    // hasMore comes from the server's truncated flag, not the slice length.
    expect(result.hasMore).toBe(true);
  });

  it('keeps a null count when include_counts is off', async () => {
    mockGroup([{ value: 'HQ-Pune', distinct_count: null, line_count: null }]);
    const result = await graphqlFetchReportFilterValues(apiConfig, 'hq', { includeCounts: false });
    expect(result.items[0].count).toBeNull();
  });

  it('returns nothing for an unknown dimension key instead of calling the API', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spy = vi.fn();
    global.fetch = spy;

    expect(await graphqlFetchReportFilterValues(apiConfig, 'nonsense', {}))
      .toEqual({ items: [], hasMore: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns nothing when no date range can be resolved', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spy = vi.fn();
    global.fetch = spy;

    expect(await graphqlFetchReportFilterValues({ endpoint: '/x', token: 't', variables: {} }, 'hq', {}))
      .toEqual({ items: [], hasMore: false });
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── drill-down gate ───────────────────────────────────────────────────────────

describe('resolveDrillDown', () => {
  afterEach(() => vi.restoreAllMocks());

  const enabled = { drillDown: { enabled: true } };

  it('is off for a v1 view even when drillDown is configured', () => {
    // reportDrillDown is a sibling of customReportV2 and has no v1 equivalent,
    // so a misconfigured v1 view must not start firing it.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveDrillDown({ ...enabled })).toBeNull();
    expect(resolveDrillDown({ ...enabled, reportApiVersion: 'v1' })).toBeNull();
  });

  it('warns when it declines a configured drill-down, so the misconfig is visible', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveDrillDown({ ...enabled, reportApiVersion: 'v1' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not on reportApiVersion'));
  });

  it('is off for a v2 view that did not opt in', () => {
    // Opting into v2 must not opt a view into drill-down.
    expect(resolveDrillDown({ reportApiVersion: 'v2' })).toBeNull();
    expect(resolveDrillDown({ reportApiVersion: 'v2', drillDown: { enabled: false } })).toBeNull();
  });

  it('is on for a v2 view that opted in', () => {
    expect(resolveDrillDown({ reportApiVersion: 'v2', ...enabled }))
      .toEqual({ initialDepth: 2, includeChildCounts: true });
  });

  it('honours an explicit initialDepth and ignores a nonsensical one', () => {
    const at = depth => resolveDrillDown({
      reportApiVersion: 'v2', drillDown: { enabled: true, initialDepth: depth },
    }).initialDepth;
    expect(at(1)).toBe(1);
    expect(at(3)).toBe(3);
    expect(at(0)).toBe(2);
    expect(at(-1)).toBe(2);
    expect(at('two')).toBe(2);
  });

  it('carries includeChildCounts through', () => {
    expect(resolveDrillDown({
      reportApiVersion: 'v2', drillDown: { enabled: true, includeChildCounts: false },
    }).includeChildCounts).toBe(false);
  });
});

// ─── group_by truncation ───────────────────────────────────────────────────────

describe('buildCustomReportV2Input — drill-down truncation', () => {
  afterEach(() => vi.restoreAllMocks());

  const vars = { filters: { group_by: ['Department', 'HQ', 'Customer', 'Invoice', 'Item'] } };

  it('sends the full group_by when drill-down is off', () => {
    expect(buildCustomReportV2Input(vars).group_by).toHaveLength(5);
  });

  it('truncates to initialDepth when drill-down is on', () => {
    const input = buildCustomReportV2Input(vars, { initialDepth: 2 });
    expect(input.group_by).toEqual(['DEPARTMENT', 'HQ']);
  });

  it('resolves sort against the truncated list, not the original', () => {
    // A sort on a level this call no longer groups by would raise
    // SORT_DIMENSION_NOT_GROUPED server-side.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const input = buildCustomReportV2Input(
      { ...vars, sort_by: 'customer:asc' }, { initialDepth: 2 },
    );
    expect(input.sort ?? []).toEqual([]);
  });
});

// ─── drill-down input ──────────────────────────────────────────────────────────

describe('buildDrillDownInput', () => {
  afterEach(() => vi.restoreAllMocks());

  const vars = {
    filters: {
      from_date: '2025-01-01', to_date: '2025-12-31',
      group_by: ['Department', 'HQ', 'Customer'],
      selected_columns: ['qty', 'net_primary'],
    },
    limit: 30,
  };
  const path = [{ dimension: 'DEPARTMENT', value: 'Elbrit Chennai - ELPL' }];

  it('sends the FULL group_by, not the truncated one', () => {
    // The server needs the whole list to know how deep the tree goes and to
    // validate parent_path against it.
    expect(buildDrillDownInput(vars, path).group_by)
      .toEqual(['DEPARTMENT', 'HQ', 'CUSTOMER']);
  });

  it('sends parent_path as dimension/value pairs', () => {
    expect(buildDrillDownInput(vars, path).parent_path).toEqual(path);
  });

  it('strips anything beyond dimension and value from the path', () => {
    const noisy = [{ dimension: 'DEPARTMENT', value: 'D', extra: 1 }];
    expect(buildDrillDownInput(vars, noisy).parent_path).toEqual([{ dimension: 'DEPARTMENT', value: 'D' }]);
  });

  it('turns off the total row and today totals', () => {
    // A grand-total row spliced under an expanded node would read as that
    // node's total.
    const { options } = buildDrillDownInput(vars, path);
    expect(options.include_total_row).toBe(false);
    expect(options.include_today_totals).toBe(false);
  });

  it('forwards date range, metrics and pivot options unchanged', () => {
    const input = buildDrillDownInput(vars, path);
    expect(input.date_range).toEqual({ from_date: '2025-01-01', to_date: '2025-12-31' });
    expect(input.metrics).toEqual(['QTY', 'NET_PRIMARY']);
  });

  it('defaults paging to the first page and the view limit', () => {
    const input = buildDrillDownInput(vars, path);
    expect(input.page).toBe(1);
    expect(input.limit).toBe(30);
  });

  it('omits depth and include_child_counts unless asked', () => {
    const input = buildDrillDownInput(vars, path);
    expect(input).not.toHaveProperty('depth');
    expect(input).not.toHaveProperty('include_child_counts');
  });

  it('sends depth and include_child_counts when asked', () => {
    const input = buildDrillDownInput(vars, path, { depth: 2, includeChildCounts: false });
    expect(input.depth).toBe(2);
    expect(input.include_child_counts).toBe(false);
  });
});

// ─── pipeline under the gate ───────────────────────────────────────────────────

describe('graphqlQueryReportDataSource — drill-down pipeline', () => {
  afterEach(() => { restoreFetch(); vi.restoreAllMocks(); });

  const COLUMNS = [
    { fieldname: 'label', label: 'Department / HQ', fieldtype: 'Data' },
    { fieldname: 'qty',   label: 'Qty',             fieldtype: 'Float' },
  ];
  const ROWS = [
    { label: 'D1', indent: 0, is_group: 1, level: 0, qty: 10 },
    { label: 'H1', indent: 1, is_group: 0, level: 1, qty: 4, has_children: 1 },
    { label: 'H2', indent: 1, is_group: 0, level: 1, qty: 6, has_children: 0 },
  ];
  const params = { filters: {}, sortBy: {}, pagination: { first: 0, rows: 25 }, viewParams: {} };
  const variables = { report: 'X', filters: { group_by: ['Department', 'HQ', 'Customer'] } };

  const source = (extra) => graphqlQueryReportDataSource({
    endpoint: '/x', token: 't', variables, ...extra,
  });

  it('stamps each row with its own ancestor chain', async () => {
    mockGraphqlFetch({ columns: COLUMNS, result: ROWS });
    const result = await source({
      reportApiVersion: 'v2', drillDown: { enabled: true },
    })(params);

    const [root] = result.rows;
    expect(root._path).toEqual([{ dimension: 'DEPARTMENT', value: 'D1' }]);
    expect(root._children[0]._path).toEqual([
      { dimension: 'DEPARTMENT', value: 'D1' },
      { dimension: 'HQ',         value: 'H1' },
    ]);
  });

  it('reports the tree as expandable even though no row has fetched children', async () => {
    // The deepest fetched level has is_group 0 and no _children, so the usual
    // "some row has children" test is false and the expander would vanish.
    mockGraphqlFetch({ columns: COLUMNS, result: ROWS });
    const result = await source({
      reportApiVersion: 'v2', drillDown: { enabled: true, initialDepth: 1 },
    })(params);
    expect(result.expandable).toBe(true);
  });

  it('passes has_children through untouched', async () => {
    mockGraphqlFetch({ columns: COLUMNS, result: ROWS });
    const result = await source({
      reportApiVersion: 'v2', drillDown: { enabled: true },
    })(params);
    const [withKids, without] = result.rows[0]._children;
    expect(withKids.has_children).toBe(1);
    expect(without.has_children).toBe(0);
  });

  it('truncates the group_by it actually requests', async () => {
    mockGraphqlFetch({ columns: COLUMNS, result: ROWS });
    await source({ reportApiVersion: 'v2', drillDown: { enabled: true } })(params);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.variables.input.group_by).toEqual(['DEPARTMENT', 'HQ']);
  });
});

// ─── v1 and un-opted v2 stay exactly as they were ──────────────────────────────

describe('drill-down leaves other views alone', () => {
  afterEach(() => { restoreFetch(); vi.restoreAllMocks(); });

  const COLUMNS = [{ fieldname: 'label', label: 'Name', fieldtype: 'Data' }];
  const ROWS = [
    { label: 'D1', indent: 0, is_group: 1, level: 0 },
    { label: 'H1', indent: 1, is_group: 0, level: 1 },
  ];
  const params = { filters: {}, sortBy: {}, pagination: { first: 0, rows: 25 }, viewParams: {} };
  const variables = { report: 'X', filters: { group_by: ['Department', 'HQ', 'Customer'] } };

  it('a v1 view with drillDown set fires no drill-down and stamps no _path', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { customReport: {
        report_meta: [{ columns: COLUMNS }],
        edges: ROWS.map(node => ({ node })),
      } } }),
    });
    global.fetch = spy;

    const result = await graphqlQueryReportDataSource({
      endpoint: '/x', token: 't', variables, drillDown: { enabled: true },
    })(params);

    const body = JSON.parse(spy.mock.calls[0][1].body);
    expect(body.query).toContain('customReport(');
    expect(body.query).not.toContain('reportDrillDown');
    // Untruncated, and still the V1 flat filters shape.
    expect(body.variables.filters.group_by).toEqual(['Department', 'HQ', 'Customer']);
    expect(result.rows[0]._path).toBeUndefined();
    // expandable still derived from the data, not forced on.
    expect(result.expandable).toBe(true);
  });

  it('a v2 view without drillDown keeps deriving expandable from the data', async () => {
    mockGraphqlFetch({ columns: COLUMNS, result: [{ label: 'A', indent: 0, is_group: 0, level: 0 }] });
    const result = await graphqlQueryReportDataSource({
      endpoint: '/x', token: 't', variables, reportApiVersion: 'v2',
    })(params);
    expect(result.expandable).toBe(false);
    expect(result.rows[0]._path).toBeUndefined();
  });
});

// ─── reportDrillDown fetch ─────────────────────────────────────────────────────

describe('graphqlFetchDrillDown', () => {
  afterEach(() => { restoreFetch(); vi.restoreAllMocks(); });

  const apiConfig = { endpoint: '/x', token: 't' };
  const vars = {
    filters: { from_date: '2025-01-01', to_date: '2025-12-31', group_by: ['Department', 'HQ'] },
    limit: 30,
  };
  const path = [{ dimension: 'DEPARTMENT', value: 'D1' }];

  function mockResponse({ rows = [], meta = {}, columns: extra = [] } = {}) {
    const columns = [
      { fieldname: '_meta', label: '', fieldtype: 'Data',
        meta_parent_path: [{ dimension: 'DEPARTMENT', value: 'D1' }],
        meta_has_more_levels: true,
        meta_pagination: { page: 1, has_next: false },
        ...meta },
      { fieldname: 'label', label: 'HQ', fieldtype: 'Data' },
      ...extra,
    ];
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { reportDrillDown: {
        report_meta: [{ columns }],
        edges: rows.map(node => ({ node })),
      } } }),
    });
    global.fetch = spy;
    return spy;
  }

  it('calls reportDrillDown, not customReportV2', async () => {
    const spy = mockResponse();
    await graphqlFetchDrillDown(apiConfig, vars, path);
    const body = JSON.parse(spy.mock.calls[0][1].body);
    expect(body.query).toContain('reportDrillDown(');
    expect(body.variables.input.parent_path).toEqual(path);
  });

  it('returns the parsed child rows, formatted for rendering', async () => {
    // The table renders every cell as row[field].repr. Raw values here mean a
    // branch that loads successfully and then displays entirely blank rows.
    mockResponse({ rows: [{ label: 'H1', indent: 0, is_group: 0, level: 0 }] });
    const result = await graphqlFetchDrillDown(apiConfig, vars, path);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].label).toEqual({ value: 'H1', repr: 'H1' });
  });

  it('formats numeric cells the same way the main pipeline does', async () => {
    mockResponse({
      rows: [{ label: 'H1', indent: 0, is_group: 0, level: 0, qty: 571 }],
      columns: [{ fieldname: 'qty', label: 'Qty', fieldtype: 'Float' }],
    });
    const result = await graphqlFetchDrillDown(apiConfig, vars, path);
    expect(result.rows[0].qty).toHaveProperty('value', 571);
    expect(result.rows[0].qty.repr).toBeTruthy();
  });

  it('drops the total row if one somehow comes back', async () => {
    mockResponse({ rows: [
      { label: 'H1', indent: 0, is_group: 0, level: 0 },
      { label: 'Total', _is_total_row: 1, indent: 0, level: 0 },
    ] });
    const result = await graphqlFetchDrillDown(apiConfig, vars, path);
    expect(result.rows).toHaveLength(1);
  });

  it('echoes the parent path back so a stale response can be discarded', async () => {
    mockResponse();
    const result = await graphqlFetchDrillDown(apiConfig, vars, path);
    expect(result.parentPath).toEqual([{ dimension: 'DEPARTMENT', value: 'D1' }]);
  });

  it('surfaces pagination and remaining depth', async () => {
    mockResponse({ meta: { meta_pagination: { page: 2, has_next: true } } });
    const result = await graphqlFetchDrillDown(apiConfig, vars, path);
    expect(result.hasNextPage).toBe(true);
    expect(result.page).toBe(2);
    expect(result.hasMoreLevels).toBe(true);
  });

  it('forwards an abort signal so a collapsed node cancels its fetch', async () => {
    const spy = mockResponse();
    const controller = new AbortController();
    await graphqlFetchDrillDown(apiConfig, vars, path, { signal: controller.signal });
    expect(spy.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('raises GraphQL errors rather than returning an empty branch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null, errors: [{ message: 'PARENT_PATH_MISMATCH' }] }),
    });
    await expect(graphqlFetchDrillDown(apiConfig, vars, path)).rejects.toBeTruthy();
  });
});

// ─── the out-of-order guard ────────────────────────────────────────────────────

describe('samePathValues', () => {
  it('matches despite the two sides spelling dimensions differently', () => {
    // This is the real shape: parent_path goes out as ReportDimension enums,
    // _meta.meta_parent_path comes back as registry keys. Comparing names here
    // rejected every successful response and left the branch spinning forever.
    const sent = [
      { dimension: 'DEPARTMENT', value: 'Aura & Proxima Chennai - ELPL' },
      { dimension: 'HQ', value: 'HQ-Chennai' },
    ];
    const echoed = [
      { dimension: 'Department', value: 'Aura & Proxima Chennai - ELPL' },
      { dimension: 'HQ', value: 'HQ-Chennai' },
    ];
    expect(samePathValues(sent, echoed)).toBe(true);
  });

  it('rejects a response for a different node', () => {
    const sent = [{ dimension: 'DEPARTMENT', value: 'D1' }];
    const other = [{ dimension: 'Department', value: 'D2' }];
    expect(samePathValues(sent, other)).toBe(false);
  });

  it('rejects a response for a different depth', () => {
    // A page-1 answer for the parent must not land under a grandchild.
    const sent = [{ dimension: 'DEPARTMENT', value: 'D1' }, { dimension: 'HQ', value: 'H1' }];
    const shallow = [{ dimension: 'Department', value: 'D1' }];
    expect(samePathValues(sent, shallow)).toBe(false);
  });

  it('is order-sensitive, because position is what identifies a level', () => {
    const sent = [{ dimension: 'DEPARTMENT', value: 'A' }, { dimension: 'HQ', value: 'B' }];
    const swapped = [{ dimension: 'Department', value: 'B' }, { dimension: 'HQ', value: 'A' }];
    expect(samePathValues(sent, swapped)).toBe(false);
  });

  it('treats a non-array as no match rather than throwing', () => {
    expect(samePathValues(null, [])).toBe(false);
    expect(samePathValues([], undefined)).toBe(false);
  });

  it('matches two empty paths', () => {
    expect(samePathValues([], [])).toBe(true);
  });

  it('distinguishes values that differ only by whitespace', () => {
    const sent = [{ dimension: 'CUSTOMER', value: 'Palepu Pharma' }];
    const echoed = [{ dimension: 'Customer', value: 'Palepu Pharma ' }];
    expect(samePathValues(sent, echoed)).toBe(false);
  });
});

// ─── drilled rows must themselves be drillable ─────────────────────────────────

describe('graphqlFetchDrillDown — _path stamping', () => {
  afterEach(() => { restoreFetch(); vi.restoreAllMocks(); });

  const apiConfig = { endpoint: '/x', token: 't' };
  const vars = {
    filters: {
      from_date: '2025-01-01', to_date: '2025-12-31',
      group_by: ['Department', 'HQ', 'Customer', 'Invoice', 'Item'],
    },
  };

  function mockRows(rows) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { reportDrillDown: {
        report_meta: [{ columns: [
          { fieldname: '_meta', label: '', fieldtype: 'Data',
            meta_pagination: { page: 1, has_next: false } },
          { fieldname: 'label', label: 'Customer', fieldtype: 'Data' },
        ] }],
        edges: rows.map(node => ({ node })),
      } } }),
    });
  }

  it('stamps children with the parent path plus their own value', async () => {
    // Without this the drilled rows have no _path, makeCanExpand reads their
    // depth as 0, and the tree stops dead at the first drilled level.
    mockRows([{ label: 'Lifecare Pharma', indent: 0, is_group: 0, level: 0 }]);
    const path = [
      { dimension: 'DEPARTMENT', value: 'Aura & Proxima Chennai - ELPL' },
      { dimension: 'HQ', value: 'HQ-Chennai' },
    ];
    const result = await graphqlFetchDrillDown(apiConfig, vars, path);

    expect(result.rows[0]._path).toEqual([
      { dimension: 'DEPARTMENT', value: 'Aura & Proxima Chennai - ELPL' },
      { dimension: 'HQ', value: 'HQ-Chennai' },
      { dimension: 'CUSTOMER', value: 'Lifecare Pharma' },
    ]);
  });

  it('names the child level from the full group_by, not the parent depth', async () => {
    mockRows([{ label: 'INV-1', indent: 0, is_group: 0, level: 0 }]);
    const path = [
      { dimension: 'DEPARTMENT', value: 'D' },
      { dimension: 'HQ', value: 'H' },
      { dimension: 'CUSTOMER', value: 'C' },
    ];
    const result = await graphqlFetchDrillDown(apiConfig, vars, path);
    expect(result.rows[0]._path.at(-1)).toEqual({ dimension: 'INVOICE', value: 'INV-1' });
  });

  it('produces a path deep enough that the row is still expandable', async () => {
    // The end-to-end property: a drilled row must satisfy makeCanExpand so the
    // next level can be opened.
    mockRows([{ label: 'Lifecare Pharma', indent: 0, is_group: 0, level: 0, has_children: 1 }]);
    const path = [{ dimension: 'DEPARTMENT', value: 'D' }];
    const result = await graphqlFetchDrillDown(apiConfig, vars, path);

    const canExpand = makeCanExpand({ fullGroupBy: ['DEPARTMENT', 'HQ', 'CUSTOMER', 'INVOICE', 'ITEM'] });
    expect(canExpand(result.rows[0])).toBe(true);
  });

  it('leaves the deepest level unexpandable', async () => {
    mockRows([{ label: 'Item A', indent: 0, is_group: 0, level: 0 }]);
    const path = [
      { dimension: 'DEPARTMENT', value: 'D' },
      { dimension: 'HQ', value: 'H' },
      { dimension: 'CUSTOMER', value: 'C' },
      { dimension: 'INVOICE', value: 'I' },
    ];
    const result = await graphqlFetchDrillDown(apiConfig, vars, path);

    const canExpand = makeCanExpand({ fullGroupBy: ['DEPARTMENT', 'HQ', 'CUSTOMER', 'INVOICE', 'ITEM'] });
    expect(canExpand(result.rows[0])).toBe(false);
  });
});

// ─── per-depth headers ─────────────────────────────────────────────────────────

describe('nestStep — label headers across the full tree', () => {
  const base = {
    rows: [], columns: [],
    groupByEnums: ['DEPARTMENT', 'HQ'],
  };

  it('pads headers for levels this response did not fetch', () => {
    // Otherwise labelColDefs[depth] misses below the fetched depth and every
    // drilled table reuses the parent's header.
    const state = nestStep({
      ...base,
      labelColDefs: [{ field: 'label', header: 'Department' }, { field: 'label', header: 'HQ' }],
      drillDownMeta: { fullGroupBy: ['DEPARTMENT', 'HQ', 'CUSTOMER', 'INVOICE', 'ITEM'] },
    });
    expect(state.labelColDefs.map(d => d.header)).toEqual([
      'Department', 'HQ', 'Customer', 'Invoice', 'Item',
    ]);
  });

  it('keeps headers the server already named', () => {
    const state = nestStep({
      ...base,
      labelColDefs: [{ field: 'label', header: 'Dept (custom)' }],
      drillDownMeta: { fullGroupBy: ['DEPARTMENT', 'HQ'] },
    });
    expect(state.labelColDefs[0].header).toBe('Dept (custom)');
    expect(state.labelColDefs[1].header).toBe('HQ');
  });

  it('leaves labelColDefs alone when drill-down is off', () => {
    const labelColDefs = [{ field: 'label', header: 'Department' }];
    const state = nestStep({ ...base, labelColDefs, drillDownMeta: null });
    expect(state.labelColDefs).toBe(labelColDefs);
  });
});
