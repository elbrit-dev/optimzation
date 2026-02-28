'use client';

import React, { useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnGroup } from 'primereact/columngroup';
import { Row } from 'primereact/row';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function ColumnGroupDemoPage() {
  const [sales] = useState([
    { product: 'Bamboo Watch', lastYearSale: 51, thisYearSale: 40, newValue: 120, lastYearProfit: 54406, thisYearProfit: 43342 },
    { product: 'Black Watch', lastYearSale: 83, thisYearSale: 9, newValue: 245, lastYearProfit: 423132, thisYearProfit: 312122 },
    { product: 'Blue Band', lastYearSale: 38, thisYearSale: 5, newValue: 89, lastYearProfit: 12321, thisYearProfit: 8500 },
    { product: 'Blue T-Shirt', lastYearSale: 49, thisYearSale: 22, newValue: 312, lastYearProfit: 745232, thisYearProfit: 65323 },
    { product: 'Brown Purse', lastYearSale: 17, thisYearSale: 79, newValue: 156, lastYearProfit: 643242, thisYearProfit: 500332 },
    { product: 'Chakra Bracelet', lastYearSale: 52, thisYearSale: 65, newValue: 278, lastYearProfit: 421132, thisYearProfit: 150005 },
    { product: 'Galaxy Earrings', lastYearSale: 82, thisYearSale: 12, newValue: 91, lastYearProfit: 131211, thisYearProfit: 100214 },
    { product: 'Game Controller', lastYearSale: 44, thisYearSale: 45, newValue: 203, lastYearProfit: 66442, thisYearProfit: 53322 },
    { product: 'Gaming Set', lastYearSale: 90, thisYearSale: 56, newValue: 445, lastYearProfit: 765442, thisYearProfit: 296232 },
    { product: 'Gold Phone Case', lastYearSale: 75, thisYearSale: 54, newValue: 167, lastYearProfit: 21212, thisYearProfit: 12533 },
  ]);

  const formatCurrency = (value) => {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  const lastYearSaleBodyTemplate = (rowData) => `${rowData.lastYearSale}%`;
  const thisYearSaleBodyTemplate = (rowData) => `${rowData.thisYearSale}%`;
  const newValueBodyTemplate = (rowData) => rowData.newValue;
  const lastYearProfitBodyTemplate = (rowData) => formatCurrency(rowData.lastYearProfit);
  const thisYearProfitBodyTemplate = (rowData) => formatCurrency(rowData.thisYearProfit);

  const newValueTotal = () => {
    let total = 0;
    for (let sale of sales) total += sale.newValue;
    return total;
  };

  const lastYearTotal = () => {
    let total = 0;
    for (let sale of sales) total += sale.lastYearProfit;
    return formatCurrency(total);
  };

  const thisYearTotal = () => {
    let total = 0;
    for (let sale of sales) total += sale.thisYearProfit;
    return formatCurrency(total);
  };

  const headerGroup = (
    <ColumnGroup>
      <Row>
        <Column header="Product" rowSpan={3} />
        <Column header="Sale Rate" colSpan={5} />
      </Row>
      <Row>
        <Column header="Sales" colSpan={2} />
        <Column header="New" rowSpan={2} sortable field="newValue" />
        <Column header="Profits" colSpan={2} />
      </Row>
      <Row>
        <Column header="Last Year" sortable field="lastYearSale" />
        <Column header="This Year" sortable field="thisYearSale" />
        <Column header="Last Year" sortable field="lastYearProfit" />
        <Column header="This Year" sortable field="thisYearProfit" />
      </Row>
    </ColumnGroup>
  );

  const footerGroup = (
    <ColumnGroup>
      <Row>
        <Column footer="Totals:" colSpan={3} footerStyle={{ textAlign: 'right' }} />
        <Column footer={newValueTotal} />
        <Column footer={lastYearTotal} />
        <Column footer={thisYearTotal} />
      </Row>
    </ColumnGroup>
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <main className="flex-1 flex flex-col min-h-0 p-4">
          <div className="mb-4">
            <h1 className="text-xl font-semibold text-gray-800">Column Group Demo</h1>
            <p className="text-sm text-gray-500 mt-1">
              Mixed headers: Product has no sub-headers (rowSpan); Sale Rate has nested sub-headers (Sales/Profits, Last Year/This Year).
            </p>
          </div>
          <div className="card">
            <DataTable
              value={sales}
              headerColumnGroup={headerGroup}
              footerColumnGroup={footerGroup}
              tableStyle={{ minWidth: '50rem' }}
            >
              <Column field="product" />
              <Column field="lastYearSale" body={lastYearSaleBodyTemplate} />
              <Column field="thisYearSale" body={thisYearSaleBodyTemplate} />
              <Column field="newValue" body={newValueBodyTemplate} />
              <Column field="lastYearProfit" body={lastYearProfitBodyTemplate} />
              <Column field="thisYearProfit" body={thisYearProfitBodyTemplate} />
            </DataTable>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
