'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import primaryData from '@/resource/primary';
import { useMemo, useState } from 'react';
import DataProvider from '../components/DataProvider';
import DataTableNew from '../components/DataTableNew';
import { defaultDataTableConfig } from '../config/defaultConfig';

/**
 * Slots Demo Page - Demonstrates per-slot capability
 * Single DataProvider with two slots sharing the same base data (primary):
 * - Slot salesTeamHq: grouped by sales_team, hq, customer_name
 * - Slot nameHq: grouped by customer_name, item_name
 * Each table has independent filters, sort, pagination, expansion, and drawer.
 */
function SlotsDemoPage() {
  const [tableHeight] = useState(defaultDataTableConfig.tableHeight || '400px');

  const offlineData = useMemo(() => primaryData, []);

  const slots = useMemo(() => ({
    salesTeamHq: {
      enableSort: true,
      enableFilter: true,
      enableSummation: true,
      textFilterColumns: [],
      percentageColumns: [],
      derivedColumns: [],
      groupFields: ['sales_team', 'hq', 'customer_name'],
      redFields: [],
      greenFields: [],
      enableCellEdit: false,
      editableColumns: { main: [], nested: {} },
      drawerTabs: [],
    },
    nameHq: {
      enableSort: true,
      enableFilter: true,
      enableSummation: true,
      textFilterColumns: [],
      percentageColumns: [],
      derivedColumns: [],
      groupFields: ['customer_name', 'item_name'],
      redFields: [],
      greenFields: [],
      enableCellEdit: false,
      editableColumns: { main: [], nested: {} },
      drawerTabs: [],
    },
  }), []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <main className="flex-1 flex flex-col min-h-0 p-4">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-gray-800">Per-Slot Demo</h1>
          <p className="text-sm text-gray-500 mt-1">
            Single DataProvider, two slots. Left: sales_team + hq. Right: name + hq. Independent filters/sort/pagination.
          </p>
        </div>

        <DataProvider
          useOrchestrationLayer={true}
          offlineData={offlineData}
          dataSource={null}
          selectedQueryKey={null}
          slots={slots}
          allowedColumns={[]}
          enableReport={false}
        >
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
            <div className="flex flex-col min-h-0 border border-gray-200 rounded-lg overflow-hidden bg-white">
              <div className="shrink-0 px-4 py-2 bg-blue-50 border-b border-blue-100 font-medium text-blue-800">
                Grouped by: sales_team, hq
              </div>
              <div className="flex-1 min-h-0 p-4">
                <DataTableNew
                  slotId="salesTeamHq"
                  scrollHeight={tableHeight}
                  rowsPerPageOptions={[5, 10, 25, 50]}
                  defaultRows={10}
                  scrollable={true}
                  tableName="sales_team_hq"
                  useOrchestrationLayer={true}
                />
              </div>
            </div>
            <div className="flex flex-col min-h-0 border border-gray-200 rounded-lg overflow-hidden bg-white">
              <div className="shrink-0 px-4 py-2 bg-green-50 border-b border-green-100 font-medium text-green-800">
                Grouped by: name, hq
              </div>
              <div className="flex-1 min-h-0 p-4">
                <DataTableNew
                  slotId="nameHq"
                  scrollHeight={tableHeight}
                  rowsPerPageOptions={[5, 10, 25, 50]}
                  defaultRows={10}
                  scrollable={true}
                  tableName="name_hq"
                  useOrchestrationLayer={true}
                />
              </div>
            </div>
          </div>
        </DataProvider>
      </main>
    </div>
  );
}

export default function SlotsDemoRoute() {
  return (
    <ProtectedRoute>
      <SlotsDemoPage />
    </ProtectedRoute>
  );
}
