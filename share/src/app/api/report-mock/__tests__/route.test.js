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
  return body.data.customReport.report_meta[0].columns;
}

function getRows(body) {
  return body.data.customReport.edges.map(e => e.node);
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
    it(`${view}: response has data.customReport with report_meta, edges, pageInfo`, async () => {
      const { body } = await getView(view);
      const cr = body.data?.customReport;
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
      const cr = body.data.customReport;
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
      expect(body.data.customReport.edges.length).toBeGreaterThan(0);
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

  it('has _meta column with meta_filter_values.hq', async () => {
    const { body } = await getView('department_hq');
    const metaCol = getColumns(body).find(c => c.fieldname === '_meta');
    expect(metaCol).toBeDefined();
    expect(metaCol.meta_filter_values.hq).toBeInstanceOf(Array);
    expect(metaCol.meta_filter_values.hq.length).toBeGreaterThan(0);
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
  it('has _meta column with brand filter values', async () => {
    const { body } = await getView('brand_item');
    const metaCol = getColumns(body).find(c => c.fieldname === '_meta');
    expect(metaCol).toBeDefined();
    expect(metaCol.meta_filter_values.brand).toBeInstanceOf(Array);
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
