import { describe, it, expect } from 'vitest';
import { GET } from '../route.js';

const PIVOT_FIELDNAME_RE = /^[a-z_]+_\d{4}_\d{2}$/;
const VALID_VIEWS = [
  'department_hq',
  'customer_item',
  'customer_item_breakdown',
  'brand_item',
  'brand_item_breakdown',
  'department_hq_breakdown',
];

function makeRequest(view) {
  return new Request(`http://localhost/api/report-mock${view ? `?view=${view}` : ''}`);
}

async function getView(view) {
  const res  = await GET(makeRequest(view));
  const body = await res.json();
  return { res, body };
}

function getColumns(body) {
  return body.data.customReportV2.report_meta[0].columns;
}

function getRows(body) {
  return body.data.customReportV2.edges.map(e => e.node);
}

// ─── Error cases ──────────────────────────────────────────────────────────────

describe('GET /api/report-mock — error cases', () => {
  it('missing view → 400 with error key', async () => {
    const { res, body } = await getView('');
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('unknown view → 400 with error listing valid views', async () => {
    const { res, body } = await getView('nonexistent_view');
    expect(res.status).toBe(400);
    expect(body.error).toContain('department_hq');
  });
});

// ─── All valid views return 200 ───────────────────────────────────────────────

describe('GET /api/report-mock — all views 200', () => {
  VALID_VIEWS.forEach(view => {
    it(`${view} returns HTTP 200`, async () => {
      const { res } = await getView(view);
      expect(res.status).toBe(200);
    });
  });
});

// ─── GraphQL envelope shape ───────────────────────────────────────────────────

describe('GET /api/report-mock — GraphQL envelope', () => {
  VALID_VIEWS.forEach(view => {
    it(`${view}: response has data.customReportV2 with report_meta, edges, pageInfo`, async () => {
      const { body } = await getView(view);
      const cr = body.data?.customReportV2;
      expect(cr).toBeDefined();
      expect(cr.report_meta).toBeInstanceOf(Array);
      expect(cr.report_meta[0]).toHaveProperty('columns');
      expect(cr.edges).toBeInstanceOf(Array);
      expect(cr.pageInfo).toHaveProperty('hasNextPage');
    });
  });

  // Only views that include a _meta column have meta_pagination injected by the route
  const VIEWS_WITH_META = ['department_hq', 'brand_item'];
  VIEWS_WITH_META.forEach(view => {
    it(`${view}: _meta column has meta_pagination with total_roots matching edges length`, async () => {
      const { body } = await getView(view);
      const cr = body.data.customReportV2;
      const metaCol = cr.report_meta[0].columns.find(c => c.fieldname === '_meta');
      expect(metaCol?.meta_pagination?.total_roots).toBe(cr.edges.length);
    });
  });
});

// ─── Schema invariant: every column has fieldname, label, fieldtype ───────────

describe('GET /api/report-mock — column schema invariant', () => {
  VALID_VIEWS.forEach(view => {
    it(`${view}: every column has fieldname, label, fieldtype`, async () => {
      const { body } = await getView(view);
      const dataCols = getColumns(body).filter(c => c.fieldname !== '_meta');
      dataCols.forEach(col => {
        expect(col).toHaveProperty('fieldname');
        expect(col).toHaveProperty('label');
        expect(col).toHaveProperty('fieldtype');
      });
    });
  });
});

// ─── result is non-empty for all views ───────────────────────────────────────

describe('GET /api/report-mock — result non-empty', () => {
  VALID_VIEWS.forEach(view => {
    it(`${view}: result array is non-empty`, async () => {
      const { body } = await getView(view);
      expect(body.data.customReportV2.edges.length).toBeGreaterThan(0);
    });
  });
});

// ─── View-specific assertions ─────────────────────────────────────────────────

describe('GET /api/report-mock — department_hq', () => {
  it('has label column', async () => {
    const { body } = await getView('department_hq');
    expect(getColumns(body).find(c => c.fieldname === 'label')).toBeDefined();
  });

  it('result rows have indent and is_group fields', async () => {
    const { body } = await getView('department_hq');
    const treeRows = getRows(body).filter(r => r.indent !== undefined);
    expect(treeRows.length).toBeGreaterThan(0);
  });

  it('parent rows appear before child rows', async () => {
    const { body } = await getView('department_hq');
    const rows = getRows(body);
    const firstParent = rows.findIndex(r => r.is_group === true);
    const firstChild  = rows.findIndex(r => r.is_group === false);
    expect(firstParent).toBeLessThan(firstChild);
  });

  it('has _meta column with filter values emptied out', async () => {
    const { body } = await getView('department_hq');
    const metaCol = getColumns(body).find(c => c.fieldname === '_meta');
    expect(metaCol).toBeDefined();
    // Always {} now — dropdown values come from the reportFilterValues query.
    expect(metaCol.meta_filter_values).toEqual({});
    expect(metaCol.meta_filter_values_deprecated).toContain('reportFilterValues');
  });
});

describe('GET /api/report-mock — customer_item', () => {
  it('flat rows — no truthy indent values', async () => {
    const { body } = await getView('customer_item');
    getRows(body).forEach(r => {
      expect(r.indent ?? 0).toBe(0);
    });
  });
});

describe('GET /api/report-mock — customer_item_breakdown', () => {
  it('has pivot columns matching metric_YYYY_MM pattern', async () => {
    const { body } = await getView('customer_item_breakdown');
    const pivotCols = getColumns(body).filter(c => PIVOT_FIELDNAME_RE.test(c.fieldname));
    expect(pivotCols.length).toBeGreaterThan(0);
  });

  it('has total_qty column', async () => {
    const { body } = await getView('customer_item_breakdown');
    expect(getColumns(body).find(c => c.fieldname === 'total_qty')).toBeDefined();
  });

  it('has invoice_count and customer_count columns', async () => {
    const { body } = await getView('customer_item_breakdown');
    expect(getColumns(body).find(c => c.fieldname === 'invoice_count')).toBeDefined();
    expect(getColumns(body).find(c => c.fieldname === 'customer_count')).toBeDefined();
  });

  it('has tax_amount_2026_01 and tax_amount_2026_02 pivot columns', async () => {
    const { body } = await getView('customer_item_breakdown');
    expect(getColumns(body).find(c => c.fieldname === 'tax_amount_2026_01')).toBeDefined();
    expect(getColumns(body).find(c => c.fieldname === 'tax_amount_2026_02')).toBeDefined();
  });

  it('every result row has all pivot fieldnames as own keys', async () => {
    const { body } = await getView('customer_item_breakdown');
    const pivotCols = getColumns(body)
      .filter(c => PIVOT_FIELDNAME_RE.test(c.fieldname))
      .map(c => c.fieldname);
    getRows(body).forEach(row => {
      pivotCols.forEach(fn => {
        expect(row).toHaveProperty(fn);
      });
    });
  });
});

describe('GET /api/report-mock — brand_item', () => {
  it('has _meta column with filter values emptied out', async () => {
    const { body } = await getView('brand_item');
    const metaCol = getColumns(body).find(c => c.fieldname === '_meta');
    expect(metaCol).toBeDefined();
    expect(metaCol.meta_filter_values).toEqual({});
  });
});

describe('GET /api/report-mock — brand_item_breakdown', () => {
  it('has both tree rows (indent) and pivot columns', async () => {
    const { body } = await getView('brand_item_breakdown');
    const treeRows  = getRows(body).filter(r => r.indent !== undefined);
    const pivotCols = getColumns(body).filter(c => PIVOT_FIELDNAME_RE.test(c.fieldname));
    expect(treeRows.length).toBeGreaterThan(0);
    expect(pivotCols.length).toBeGreaterThan(0);
  });
});

describe('GET /api/report-mock — department_hq_breakdown', () => {
  it('has tree + pivot + tax_amount_2026_01 column', async () => {
    const { body } = await getView('department_hq_breakdown');
    const treeRows  = getRows(body).filter(r => r.indent !== undefined);
    const pivotCols = getColumns(body).filter(c => PIVOT_FIELDNAME_RE.test(c.fieldname));
    expect(treeRows.length).toBeGreaterThan(0);
    expect(pivotCols.length).toBeGreaterThan(0);
    expect(getColumns(body).find(c => c.fieldname === 'tax_amount_2026_01')).toBeDefined();
  });

  it('tree view: total row count = sum of parents + children', async () => {
    const { body } = await getView('department_hq_breakdown');
    const rows    = getRows(body);
    const parents  = rows.filter(r => r.is_group).length;
    const children = rows.filter(r => !r.is_group).length;
    expect(parents + children).toBe(rows.length);
  });
});

// ─── reportFilterValues mode ───────────────────────────────────────────────────

describe('GET /api/report-mock?dimension= — reportFilterValues', () => {
  const getGroup = async (qs) => {
    const res = await GET(new Request(`http://localhost/api/report-mock?${qs}`));
    const body = await res.json();
    return { res, body, group: body.data?.reportFilterValues?.groups?.[0] };
  };

  it('returns one group in the reportFilterValues envelope', async () => {
    const { res, body, group } = await getGroup('dimension=hq');
    expect(res.status).toBe(200);
    expect(body.data.reportFilterValues.execution_time).toBeTypeOf('number');
    expect(group.dimension).toBe('HQ');
    expect(group.filter_key).toBe('hq');
    expect(group.values.length).toBeGreaterThan(0);
    expect(group.values[0]).toHaveProperty('line_count');
  });

  it('filters values by search, case-insensitively', async () => {
    const { group } = await getGroup('dimension=hq&search=BAN');
    expect(group.values.map(v => v.value)).toEqual(['HQ-Bangalore']);
  });

  it('truncates at limit and says so', async () => {
    const { group } = await getGroup('dimension=hq&limit=3');
    expect(group.values).toHaveLength(3);
    expect(group.truncated).toBe(true);
  });

  it('nulls both counts when include_counts=false', async () => {
    const { group } = await getGroup('dimension=hq&include_counts=false');
    expect(group.values[0].distinct_count).toBeNull();
    expect(group.values[0].line_count).toBeNull();
  });

  it('400s on an unknown dimension', async () => {
    const { res, body } = await getGroup('dimension=nonsense');
    expect(res.status).toBe(400);
    expect(body.error).toContain('Unknown dimension');
  });
});


// ─── reportDrillDown mode ──────────────────────────────────────────────────────

describe('GET /api/report-mock?parent= — reportDrillDown', () => {
  const getDrill = async (qs) => {
    const res = await GET(new Request(`http://localhost/api/report-mock?${qs}`));
    const body = await res.json();
    return { res, body, payload: body.data?.reportDrillDown };
  };

  it('returns the customReportV2 envelope shape, so one parser handles both', async () => {
    const { res, payload } = await getDrill('parent=Elbrit%20Chennai');
    expect(res.status).toBe(200);
    expect(payload.report_meta[0].columns[0].fieldname).toBe('_meta');
    expect(payload.edges.length).toBeGreaterThan(0);
    expect(payload.edges[0].node).toHaveProperty('label');
  });

  it('echoes the parent path back for the out-of-order guard', async () => {
    const { payload } = await getDrill('parent=Elbrit%20Chennai');
    expect(payload.report_meta[0].columns[0].meta_parent_path).toEqual([
      { dimension: 'DEPARTMENT', value: 'Elbrit Chennai' },
    ]);
  });

  it('reports has_children both ways so leaves are reachable', async () => {
    const { payload } = await getDrill('parent=D1');
    const flags = payload.edges.map(e => e.node.has_children);
    expect(flags).toContain(1);
    expect(flags).toContain(0);
  });

  it('pages, and stops advertising a next page on the last one', async () => {
    const first = await getDrill('parent=D1&page=1');
    expect(first.payload.pageInfo.hasNextPage).toBe(true);
    const second = await getDrill('parent=D1&page=2');
    expect(second.payload.pageInfo.hasNextPage).toBe(false);
    expect(second.payload.edges[0].node.label).not.toBe(first.payload.edges[0].node.label);
  });
});
