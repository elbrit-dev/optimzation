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
const SPECIALITIES = ['Cardiology', 'Diabetology', 'General Medicine', 'Paediatrics', 'Ortho'];

/** Deterministic pseudo-random so the page renders identically on every reload. */
function seeded(index, salt) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function buildRows(count) {
  return Array.from({ length: count }, (_, index) => {
    const region = REGIONS[Math.floor(seeded(index, 1) * REGIONS.length)];
    const hqList = HQS[region];
    const hq = hqList[Math.floor(seeded(index, 2) * hqList.length)];
    const visits = Math.floor(seeded(index, 3) * 24);
    const target = Math.round((5 + seeded(index, 4) * 20) * 10000);
    const sales = Math.round(target * (0.4 + seeded(index, 5) * 1.1));
    const day = 1 + Math.floor(seeded(index, 6) * 28);
    return {
      doctor_code: `DOC-${String(1000 + index)}`,
      doctor: `Dr. ${['Anand', 'Bhaskar', 'Chitra', 'Deshmukh', 'Elena', 'Farhan', 'Gita', 'Harish'][index % 8]} ${index + 1}`,
      region,
      hq,
      speciality: SPECIALITIES[Math.floor(seeded(index, 7) * SPECIALITIES.length)],
      visits,
      target,
      sales,
      shortfall: Math.max(0, target - sales),
      active: seeded(index, 8) > 0.25,
      last_visit: `2026-07-${String(day).padStart(2, '0')}`,
    };
  });
}

export default function CommonDataTableDemo() {
  const [rowCount, setRowCount] = useState(120);
  const [grouped, setGrouped] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);

  const data = useMemo(() => buildRows(rowCount), [rowCount]);

  const rowColumnStyles = useMemo(() => [
    {
      mode: 'cell',
      columns: ['sales'],
      compute: (value, row) => (value < row.target ? { color: '#dc2626', fontWeight: 600 } : null),
    },
    {
      mode: 'row',
      compute: (row) => (row.active === false && !row.__isGroupRow__ ? { opacity: 0.6 } : null),
    },
  ], []);

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
            {[20, 120, 1000, 5000].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} />
          Group by region → HQ
        </label>
        {lastEvent && <span className="text-xs text-gray-500">last event: {lastEvent}</span>}
      </div>

      <CommonDataTable
        data={data}
        title="Doctor performance"
        columns={['doctor', 'doctor_code', 'region', 'hq', 'speciality', 'visits', 'target', 'sales', 'shortfall', 'active', 'last_visit']}
        columnLabels={{ hq: 'Headquarters', doctor_code: 'Code', last_visit: 'Last visit' }}
        enableGrouping={grouped}
        groupFields={['region', 'hq']}
        nonAggregatableColumns={['doctor_code']}
        enableSummation
        enableCellEdit
        editableColumns={['visits', 'sales', 'active', 'last_visit']}
        onCellEditComplete={(payload) => setLastEvent(`edit ${payload.field} → ${payload.newValue}`)}
        redFields={['shortfall']}
        greenFields={['sales']}
        rowColumnStyles={rowColumnStyles}
        showUnitToggle
        lakhColumns={['target', 'sales', 'shortfall']}
        selectionMode="checkbox"
        dataKey="doctor_code"
        onSelectionChange={(selection) => setLastEvent(`selected ${Array.isArray(selection) ? selection.length : 0} rows`)}
        onRowClick={(row) => setLastEvent(`clicked ${row.doctor}`)}
        onRefresh={() => setLastEvent('refresh requested')}
        initialSortMeta={[{ field: 'sales', order: -1 }]}
        exportFileName="doctor-performance"
        tableHeight="460px"
      />

      <h2 className="text-sm font-semibold text-gray-700 pt-4">Stripped down — no toolbar, no filters, no pager</h2>
      <div id="minimal">
        <CommonDataTable
          data={data.slice(0, 5)}
          columns={['doctor', 'hq', 'sales']}
          showToolbar={false}
          enableFilter={false}
          enablePagination={false}
          enableSort={false}
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
