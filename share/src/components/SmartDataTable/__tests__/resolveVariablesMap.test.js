import { describe, it, expect } from 'vitest';
import { resolveVariablesMap, buildCustomReportV2Input } from '../reportSource.jsx';

/* Regression cover for a silent production bug.
 *
 * With no explicit `variablesMap`, resolveVariablesMap falls back to the
 * default map and then SKIPS `sort` / `pagination.*` unless their target key
 * already exists in `api.variables`. The intent is not to declare GraphQL
 * variables the query never takes.
 *
 * That is right for v1, where sort_by / page / limit really are query
 * variables. It is wrong for customReportV2: that query takes a single `input`
 * object, and buildCustomReportV2Input reads gqlVars.sort_by / .page / .limit
 * to build input.sort / input.page / input.limit. Skipping them meant a v2
 * config without a variablesMap sent no sort at all — clicking a header moved
 * PrimeReact's sort indicator while the rows came back in the original order.
 *
 * Note the input shapes, both of which were got wrong on the first attempt at
 * this test: `pagination` is `{ first, rows }` (page is derived), and `sortBy`
 * is `{ field: 'asc' | 'desc' }`.
 */
describe('resolveVariablesMap — sort/pagination pass-through by api version', () => {
  const ctx = {
    controls: {},
    sortBy: { department: 'desc' },
    pagination: { first: 25, rows: 25 }, // -> page 2, limit 25
    viewParams: {},
  };

  it('v1, no variablesMap: skips sort_by/page/limit the query does not declare', () => {
    const vars = resolveVariablesMap({ report: 'X' }, undefined, { ...ctx, apiVersion: 'v1' });
    expect(vars.sort_by).toBeUndefined();
    expect(vars.page).toBeUndefined();
    expect(vars.limit).toBeUndefined();
  });

  it('v1, no variablesMap: maps them once the query declares them', () => {
    const vars = resolveVariablesMap(
      { report: 'X', sort_by: null, page: null, limit: null },
      undefined,
      { ...ctx, apiVersion: 'v1' },
    );
    expect(vars.sort_by).toBe('department:desc');
    expect(vars.page).toBe(2);
    expect(vars.limit).toBe(25);
  });

  it('v2, no variablesMap: maps them anyway — they feed `input`, not variables', () => {
    const vars = resolveVariablesMap({ report: 'X' }, undefined, { ...ctx, apiVersion: 'v2' });
    expect(vars.sort_by).toBe('department:desc');
    expect(vars.page).toBe(2);
    expect(vars.limit).toBe(25);
  });

  it('defaults to v1 when no apiVersion is passed', () => {
    const vars = resolveVariablesMap({ report: 'X' }, undefined, ctx);
    expect(vars.sort_by).toBeUndefined();
  });

  it('an explicit variablesMap is honoured regardless of version', () => {
    const vars = resolveVariablesMap({ report: 'X' }, { sort: 'sort_by' }, {
      ...ctx,
      apiVersion: 'v1',
    });
    expect(vars.sort_by).toBe('department:desc');
  });

  it('multi-sort serialises every entry, comma separated', () => {
    const vars = resolveVariablesMap({ report: 'X' }, undefined, {
      ...ctx,
      sortBy: { department: 'desc', qty: 'asc' },
      apiVersion: 'v2',
    });
    expect(vars.sort_by).toBe('department:desc,qty:asc');
  });

  it('no sort selected leaves sort_by unset rather than empty', () => {
    const vars = resolveVariablesMap({ report: 'X' }, undefined, {
      ...ctx,
      sortBy: {},
      apiVersion: 'v2',
    });
    expect(vars.sort_by).toBeUndefined();
  });
});

/* The UAT v2 config's real variablesMap, which maps the sort FIELD and the sort
   ORDER to two separate variables. Reproduced from the config verbatim because
   the split shape is precisely what broke. */
describe('customReportV2 — split sort.field / sort.order mapping', () => {
  const UAT_V2_MAP = {
    'controls.dateRange.start': 'filters.from_date',
    'controls.dateRange.end': 'filters.to_date',
    'controls.filterSort.filters': { path: 'filters', merge: true },
    'sort.field': 'sort_by',
    'sort.order': 'sort_order',
    'pagination.limit': 'limit',
    'pagination.page': 'page',
    'viewParam.group_by': { path: 'filters.group_by' },
  };

  const resolve = (sortBy) =>
    resolveVariablesMap(
      { report: 'Sales Summary', filters: { group_by: ['Department', 'HQ'] } },
      UAT_V2_MAP,
      {
        controls: {},
        sortBy,
        pagination: { first: 0, rows: 30 },
        viewParams: {},
        apiVersion: 'v2',
      },
    );

  it('splits the field and the order into their own variables', () => {
    const vars = resolve({ label: 'desc' });
    expect(vars.sort_by).toBe('label');
    expect(vars.sort_order).toBe('desc');
  });

  it('carries the descending order through to input.sort', () => {
    const vars = resolve({ label: 'desc' });
    const input = buildCustomReportV2Input(vars, null);
    // The flat label column holds every level, so it sorts each one.
    expect(input.sort).toEqual([
      { dimension: 'DEPARTMENT', direction: 'DESC' },
      { dimension: 'HQ', direction: 'DESC' },
    ]);
  });

  it('carries the ascending order through too', () => {
    const input = buildCustomReportV2Input(resolve({ label: 'asc' }), null);
    expect(input.sort).toEqual([
      { dimension: 'DEPARTMENT', direction: 'ASC' },
      { dimension: 'HQ', direction: 'ASC' },
    ]);
  });

  it('an inline direction still wins over sort_order', () => {
    const vars = { ...resolve({ label: 'asc' }), sort_by: 'label:desc' };
    const input = buildCustomReportV2Input(vars, null);
    expect(input.sort).toEqual([
      { dimension: 'DEPARTMENT', direction: 'DESC' },
      { dimension: 'HQ', direction: 'DESC' },
    ]);
  });

  it('no sort selected produces no input.sort', () => {
    const input = buildCustomReportV2Input(resolve({}), null);
    expect(input.sort).toBeUndefined();
  });
});

/* Column -> sort entry, per the backend's customReportV2 contract. */
describe('customReportV2 — sort column mapping', () => {
  const vars = (sortBy, filters = {}) => ({
    report: 'SALES',
    filters: { group_by: ['Department', 'HQ', 'Customer'], ...filters },
    sort_by: sortBy,
  });
  const sortOf = (sortBy, filters) => buildCustomReportV2Input(vars(sortBy, filters), null).sort;

  it('metric column -> metric entry', () => {
    expect(sortOf('net_primary:desc')).toEqual([{ metric: 'NET_PRIMARY', direction: 'DESC' }]);
  });

  it('flat label -> one dimension entry per level', () => {
    expect(sortOf('label:asc')).toEqual([
      { dimension: 'DEPARTMENT', direction: 'ASC' },
      { dimension: 'HQ', direction: 'ASC' },
      { dimension: 'CUSTOMER', direction: 'ASC' },
    ]);
  });

  it('flat label under drill-down sorts only the levels this call groups by', () => {
    const input = buildCustomReportV2Input(vars('label:desc'), { initialDepth: 2 });
    expect(input.sort).toEqual([
      { dimension: 'DEPARTMENT', direction: 'DESC' },
      { dimension: 'HQ', direction: 'DESC' },
    ]);
  });

  it('pivot label / labelN -> that level only', () => {
    const pivot = { pivot_by_month: 1 };
    expect(sortOf('label:asc', pivot)).toEqual([{ dimension: 'DEPARTMENT', direction: 'ASC' }]);
    expect(sortOf('label2:desc', pivot)).toEqual([{ dimension: 'HQ', direction: 'DESC' }]);
    expect(sortOf('label3:asc', pivot)).toEqual([{ dimension: 'CUSTOMER', direction: 'ASC' }]);
  });

  it('pivot total column -> TOTAL scope', () => {
    expect(sortOf('total_net_primary:desc', { pivot_by_month: 1 }))
      .toEqual([{ metric: 'NET_PRIMARY', scope: 'TOTAL', direction: 'DESC' }]);
  });

  it('pivot period column -> PERIOD scope with YYYY-MM', () => {
    expect(sortOf('net_primary_2026_08:asc', { pivot_by_month: 1 }))
      .toEqual([{ metric: 'NET_PRIMARY', scope: 'PERIOD', period: '2026-08', direction: 'ASC' }]);
  });

  it('drawer filters become dimension_filters', () => {
    const input = buildCustomReportV2Input(vars(undefined, { department: 'CARDIAC', hq: 'CHENNAI' }), null);
    expect(input.dimension_filters).toEqual([
      { dimension: 'DEPARTMENT', operator: 'IN', values: ['CARDIAC'] },
      { dimension: 'HQ', operator: 'IN', values: ['CHENNAI'] },
    ]);
  });
});
