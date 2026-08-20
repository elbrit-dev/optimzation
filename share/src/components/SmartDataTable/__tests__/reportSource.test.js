import { describe, it, expect, afterEach, vi } from 'vitest';
import { graphqlQueryReportDataSource, buildCustomReportV2Input } from '../reportSource.jsx';
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

  it('requests filter values for all known dimensions (sidebar tab parity)', () => {
    const input = buildCustomReportV2Input({ filters: { group_by: ['HQ'] } });
    expect(input.options.include_filter_values).toEqual(
      expect.arrayContaining(['HQ', 'DEPARTMENT', 'CUSTOMER', 'ITEM', 'BRAND'])
    );
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
