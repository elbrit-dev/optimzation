'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import primaryData from '@/resource/primary';
import { useMemo } from 'react';
import DataProvider from '../components/DataProvider';
import DataTableNew from '../components/DataTableNew';

function SlotsDemoPage() {
  const offlineData = useMemo(() => primaryData, []);

  const slotsConfig = useMemo(() => ({
    slots: {
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
        writeForm: { layout: {}, fields: {} },
        drawerTabs: [
          {
            id: 'salesTeamHq-tab-1',
            name: 'By HQ',
            outerGroup: 'hq',
            innerGroup: null,
            allowedColumns: ['hq', 'sales_team', 'target', 'qty', 'SALES_RETURN', 'EXPIRED'],
          },
          {
            id: 'salesTeamHq-tab-2',
            name: 'By Customer & Item',
            outerGroup: 'customer_name',
            innerGroup: 'item_name',
            allowedColumns: ['customer_name', 'item_name', 'amount', 'net_primary', 'fsl_mrp'],
          },
        ],
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
        writeForm: { layout: {}, fields: {} },
        drawerTabs: [
          {
            id: 'nameHq-tab-1',
            name: 'By Item',
            outerGroup: 'item_name',
            innerGroup: null,
            allowedColumns: ['item_name', 'brand', 'qty', 'amount', 'net_primary', 'fsl_ptr', 'fsl_mrp', 'SALES_RETURN', 'EXPIRED'],
          },
        ],
      },
    },
    enableReport: false,
    allowedColumns: [],
  }), []);

  return (
    <div className="min-h-screen bg-sunken flex flex-col">
      <main className="flex-1 flex flex-col min-h-0 p-4">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-body">Per-Slot Demo</h1>
          <p className="text-sm text-ds-secondary mt-1">
            Single DataProvider, two slots. Left: sales_team + hq + customer_name. Right: customer_name + item_name. Independent filters/sort/pagination. Click group cells to open the drawer.
          </p>
        </div>

        <DataProvider __internal={{ config: slotsConfig }} offlineData={offlineData}>
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
            <div className="flex flex-col min-h-0 border border-line-subtle rounded-lg overflow-hidden bg-surface">
              <div className="shrink-0 px-4 py-2 bg-info-wash border-b border-info-border font-medium text-brand-active">
                Grouped by: sales_team, hq, customer_name
              </div>
              <div className="flex-1 min-h-0 p-4">
                <DataTableNew slotId="salesTeamHq" tableName="sales_team_hq" />
              </div>
            </div>
            <div className="flex flex-col min-h-0 border border-line-subtle rounded-lg overflow-hidden bg-surface">
              <div className="shrink-0 px-4 py-2 bg-success-wash border-b border-success-border font-medium text-success">
                Grouped by: customer_name, item_name
              </div>
              <div className="flex-1 min-h-0 p-4">
                <DataTableNew slotId="nameHq" tableName="name_hq" />
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
