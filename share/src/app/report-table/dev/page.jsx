'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { SmartDataProvider } from '@/components/SmartDataTable/SmartDataProvider';
import { SmartDataTable } from '@/components/SmartDataTable/SmartDataTable';
import {
  buildPipeline,
  formatStep,
  filterStep,
  nestStep,
  sortStep,
  paginateStep,
} from '@/components/SmartDataTable/reportSource.jsx';

const FRAPPE_TYPE_MAP = {
  Int:      { type: 'number',  filterType: 'numeric' },
  Float:    { type: 'number',  filterType: 'numeric' },
  Currency: { type: 'number',  filterType: 'numeric' },
  Percent:  { type: 'number',  filterType: 'numeric' },
  Date:     { type: 'date',    filterType: 'date'    },
  Datetime: { type: 'date',    filterType: 'date'    },
  Check:    { type: 'boolean', filterType: 'boolean' },
};

// Converts a UniGrid report shape into flat pipeline-compatible { columns, rows, columnGroups }.
// Rows are flattened with indent/is_group so nestStep can build the tree for expandable tables.
// columnGroups is non-null only when meta.column_group === true, and carries group metadata
// for SmartDataTable to build a PrimeReact headerColumnGroup with spanning headers.
function _uniGridToShape(uniGrid) {
  const { title, meta, columns: colGroups, rows: uniRows } = uniGrid;

  const columns = [
    { field: 'label', header: title ?? 'Name', sortable: true, filterable: true, type: 'string', filterType: 'text', _fieldtype: 'Data' },
    ...colGroups.flatMap(group =>
      group.children.map(child => {
        const { type, filterType } = FRAPPE_TYPE_MAP[child.type] ?? { type: 'string', filterType: 'text' };
        return {
          field:      group.id === 'default' ? child.field : `${group.id}__${child.field}`,
          header:     child.label,
          sortable:   true,
          filterable: true,
          type,
          filterType,
          _fieldtype: child.type ?? 'Data',
        };
      })
    ),
  ];

  // columnGroups shape: { id, label, fields[] } where fields are the flat field names
  // used in the columns array above — avoids re-deriving the naming in the renderer.
  let columnGroups = null;
  if (meta?.column_group) {
    columnGroups = colGroups.map(group => ({
      id:     group.id,
      label:  group.label,
      fields: group.children.map(child =>
        group.id === 'default' ? child.field : `${group.id}__${child.field}`
      ),
    }));
  }

  const flatRows = [];

  function flattenRow(row, depth) {
    const out = { label: row.label, indent: depth, is_group: row.children?.length ? 1 : 0 };
    for (const group of colGroups) {
      const vals = row.values?.[group.id] ?? {};
      for (const child of group.children) {
        const field = group.id === 'default' ? child.field : `${group.id}__${child.field}`;
        out[field] = vals[child.field] ?? null;
      }
    }
    flatRows.push(out);
    for (const child of (row.children ?? [])) flattenRow(child, depth + 1);
  }

  for (const row of uniRows) flattenRow(row, 0);

  return { columns, rows: flatRows, columnGroups };
}

function devFetchStep(view) {
  let cache = null;
  const step = async (state) => {
    if (!cache) {
      const res = await fetch(`/api/report-table-dev?view=${view}`);
      if (!res.ok) throw new Error(`Dev report fetch failed for view "${view}": HTTP ${res.status}`);
      const { message } = await res.json();
      cache = _uniGridToShape(message.data);
    }
    return { ...state, rows: cache.rows, columns: cache.columns, columnGroups: cache.columnGroups };
  };
  step.refresh = () => { cache = null; };
  return step;
}

function makeFlat(mockKey) {
  return buildPipeline([devFetchStep(mockKey), formatStep(), filterStep, sortStep, paginateStep]);
}

function makeGrouped(mockKey) {
  return buildPipeline([devFetchStep(mockKey), formatStep(), filterStep, nestStep, sortStep, paginateStep], { expandable: true });
}

const DEV_VIEWS = [
  {
    key:       'cust-item',
    title:     'Customer / Item',
    flat:      makeFlat('customer_item'),
    grouped:   makeGrouped('customer_item'),
    breakdown: makeFlat('customer_item_breakdown'),
  },
  {
    key:       'dept-hq',
    title:     'Department / HQ',
    flat:      makeFlat('department_hq'),
    grouped:   makeGrouped('department_hq'),
    breakdown: makeGrouped('department_hq_breakdown'),
  },
  {
    key:       'brand-item',
    title:     'Brand / Item',
    flat:      makeFlat('brand_item'),
    grouped:   makeGrouped('brand_item'),
    breakdown: makeGrouped('brand_item_breakdown'),
  },
];

function ReportTableDev() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-[1600px] mx-auto px-4 py-8 flex flex-col gap-8">
        <SmartDataProvider>
          {DEV_VIEWS.map(({ key, title, flat, grouped, breakdown }) => (
            <section key={key} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-medium text-gray-800 mb-1">{title}</h2>
              <p className="text-xs text-gray-400 mb-4">data from <code>/api/report-table-dev</code></p>
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-600 mb-2">Flat</h3>
                  <SmartDataTable viewId={`dev-${key}-flat`} dataSource={flat} loadingMessage="Loading…" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-600 mb-2">Grouped</h3>
                  <SmartDataTable viewId={`dev-${key}-grouped`} dataSource={grouped} loadingMessage="Loading…" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-600 mb-2">Breakdown (by Month)</h3>
                  <SmartDataTable viewId={`dev-${key}-breakdown`} dataSource={breakdown} loadingMessage="Loading…" />
                </div>
              </div>
            </section>
          ))}
        </SmartDataProvider>
      </main>
    </div>
  );
}

export default function ReportTableDevPage() {
  return (
    <ProtectedRoute>
      <ReportTableDev />
    </ProtectedRoute>
  );
}
