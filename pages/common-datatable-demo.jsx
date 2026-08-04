/**
 * Playground for the standalone CommonDataTable — /common-datatable-demo
 *
 * Not part of the app's navigation; it exists so the table can be exercised without a
 * Plasmic page or a provider. Safe to delete.
 */

import { useMemo, useState } from 'react';
import CommonDataTable from '../components/CommonDataTable/CommonDataTable';

const REGIONS = ['South', 'West', 'North', 'East'];
const HQS = {
  South: ['Chennai', 'Madurai', 'Coimbatore'],
  West: ['Mumbai', 'Pune', 'Ahmedabad'],
  North: ['Delhi', 'Jaipur'],
  East: ['Kolkata', 'Bhubaneswar'],
};

/** Deterministic pseudo-random so the page renders identically on every reload. */
function seeded(index, salt) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function buildRows(count) {
  return Array.from({ length: count }, (_, index) => {
    const region = REGIONS[Math.floor(seeded(index, 1) * REGIONS.length)];
    const hqList = HQS[region];
    const target = Math.round((5 + seeded(index, 4) * 20) * 10000);
    const sales = Math.round(target * (0.4 + seeded(index, 5) * 1.1));
    const day = 1 + Math.floor(seeded(index, 6) * 28);
    return {
      doctor_code: `DOC-${String(1000 + index)}`,
      doctor: `Dr. ${['Anand', 'Bhaskar', 'Chitra', 'Deshmukh', 'Elena', 'Farhan', 'Gita', 'Harish'][index % 8]} ${index + 1}`,
      region,
      hq: hqList[Math.floor(seeded(index, 2) * hqList.length)],
      visits: Math.floor(seeded(index, 3) * 24),
      target,
      sales,
      shortfall: Math.max(0, target - sales),
      last_visit: `2026-07-${String(day).padStart(2, '0')}`,
    };
  });
}

const COLUMNS = ['doctor', 'doctor_code', 'region', 'hq', 'visits', 'target', 'sales', 'shortfall', 'last_visit'];
const LABELS = { hq: 'Headquarters', doctor_code: 'Code', last_visit: 'Last visit' };

/** Data that arrives already grouped — the parent is the header row, `batches` are its rows. */
const NESTED = [
  {
    warehouse: 'Chennai',
    total_qty: 7219,
    batch_count: 3,
    batches: [
      { item_name: 'ROZULA CV 10', batch_no: 'RZ2401', qty: 2362, manufacturing_date: '2025-03', expiry_date: '2026-08' },
      { item_name: 'BRITVIT', batch_no: 'BV2312', qty: 3916, manufacturing_date: '2025-01', expiry_date: '2026-11' },
      { item_name: 'ELBRIT CV 40', batch_no: 'EC2405', qty: 941, manufacturing_date: '2025-05', expiry_date: '2027-02' },
    ],
  },
  {
    warehouse: 'Kolkata',
    total_qty: 4180,
    batch_count: 2,
    batches: [
      { item_name: 'ROZULA ASP 10', batch_no: 'RA2409', qty: 1265, manufacturing_date: '2024-09', expiry_date: '2026-08' },
      { item_name: 'DAPAZONE M 500', batch_no: 'DM2411', qty: 2915, manufacturing_date: '2024-11', expiry_date: '2026-10' },
    ],
  },
];

export default function CommonDataTableDemo() {
  const [rowCount, setRowCount] = useState(120);
  const [groupBy, setGroupBy] = useState('none');

  const data = useMemo(() => buildRows(rowCount), [rowCount]);
  const groupFields = useMemo(() => {
    if (groupBy === 'none') return [];
    if (groupBy === 'region-hq') return ['region', 'hq'];
    return [groupBy];
  }, [groupBy]);

  return (
    <div className="p-6 space-y-4 bg-gray-50 min-h-screen">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-gray-900">CommonDataTable</h1>
        <p className="text-sm text-gray-600">
          Standalone table — no DataProvider anywhere in this tree.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Rows:
          <select
            value={rowCount}
            onChange={(event) => setRowCount(Number(event.target.value))}
            className="border rounded px-2 py-1"
          >
            {[20, 120, 600].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Group by:
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="none">nothing</option>
            <option value="region">region</option>
            <option value="region-hq">region → HQ</option>
          </select>
        </label>
      </div>

      <div id="main">
        <CommonDataTable
          data={data}
          title="Doctor performance"
          columns={COLUMNS}
          columnLabels={LABELS}
          groupFields={groupFields}
          enableSummation
          initialSort={{ field: 'sales', order: -1 }}
          exportFileName="doctor-performance"
          tableHeight="460px"
        />
      </div>

      <h2 className="text-sm font-semibold text-gray-700 pt-4">
        Already-nested data — <code>childField=&quot;batches&quot;</code>
      </h2>
      <div id="nested">
        <CommonDataTable
          data={NESTED}
          title="Stock by warehouse"
          childField="batches"
          columnLabels={{
            warehouse: 'Warehouse',
            total_qty: 'Total qty',
            batch_count: 'Batches',
            item_name: 'Item',
            batch_no: 'Batch',
            qty: 'Qty',
            manufacturing_date: 'Mfg',
            expiry_date: 'Expiry',
          }}
          columnTypes={{ manufacturing_date: 'string', expiry_date: 'string' }}
          enableSummation
          scrollable={false}
        />
      </div>

      <h2 className="text-sm font-semibold text-gray-700 pt-4">Stripped down — no header bar, no sorting</h2>
      <div id="minimal">
        <CommonDataTable
          data={data.slice(0, 5)}
          columns={['doctor', 'hq', 'sales']}
          enableSort={false}
          enableFilter={false}
          enableExport={false}
          scrollable={false}
        />
      </div>

      <h2 className="text-sm font-semibold text-gray-700 pt-4">Empty and loading states</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div id="empty"><CommonDataTable data={[]} title="No rows" /></div>
        <div id="loading"><CommonDataTable data={[]} loading title="Loading" /></div>
      </div>
    </div>
  );
}
