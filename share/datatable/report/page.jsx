'use client';

import React, { useState, useMemo, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ColumnGroup } from 'primereact/columngroup';
import { Row } from 'primereact/row';
import { Dropdown } from 'primereact/dropdown';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import ProtectedRoute from '@/components/ProtectedRoute';
import {
  generateMockTimeSeriesData,
  getTimePeriods,
  groupDataByTimePeriod,
  transformToTableData,
  transformToNestedTableData,
  getTimePeriodLabel
} from './utils/timeBreakdownUtils';

const BREAKDOWN_OPTIONS = [
  { label: 'Month-wise', value: 'month' },
  { label: 'Week-wise', value: 'week' },
  { label: 'Day-wise', value: 'day' },
  { label: 'Quarter-wise', value: 'quarter' },
  { label: 'Annual-wise', value: 'annual' }
];

export default function ReportPage() {
  const [breakdownType, setBreakdownType] = useState('month');
  const [expandedRows, setExpandedRows] = useState(null);
  const toast = useRef(null);
  
  // Generate mock data
  const rawData = useMemo(() => generateMockTimeSeriesData(10, 90), []);
  
  // Get date range from data
  const dateRange = useMemo(() => {
    if (!rawData || rawData.length === 0) return { start: null, end: null };
    
    const dates = rawData.map(d => d.date).sort();
    return {
      start: dates[0],
      end: dates[dates.length - 1]
    };
  }, [rawData]);
  
  // Group data by time period
  const groupedData = useMemo(() => {
    if (!rawData || rawData.length === 0) return {};
    return groupDataByTimePeriod(rawData, 'date', breakdownType, ['sales', 'profits', 'count']);
  }, [rawData, breakdownType]);
  
  // Get all time periods
  const timePeriods = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return [];
    return getTimePeriods(dateRange.start, dateRange.end, breakdownType);
  }, [dateRange, breakdownType]);
  
  // Transform to table data (include details for nested table)
  const tableData = useMemo(() => {
    if (!groupedData || Object.keys(groupedData).length === 0) return [];
    return transformToTableData(groupedData, 'product', breakdownType, true);
  }, [groupedData, breakdownType]);

  // Generate nested table data (grouped by category)
  const nestedTableData = useMemo(() => {
    if (!groupedData || Object.keys(groupedData).length === 0 || timePeriods.length === 0) return {};
    const nested = transformToNestedTableData(groupedData, 'product', 'category', breakdownType, timePeriods);
    
    // Group by product for easy lookup
    const byProduct = {};
    nested.forEach(row => {
      if (!byProduct[row.product]) {
        byProduct[row.product] = [];
      }
      byProduct[row.product].push(row);
    });
    return byProduct;
  }, [groupedData, breakdownType, timePeriods]);
  
  // Generate column groups
  const headerGroup = useMemo(() => {
    if (timePeriods.length === 0) return null;
    
    const metrics = ['Sales', 'Profits', 'Count'];
    const totalCols = timePeriods.length * metrics.length;
    
    return (
      <ColumnGroup>
        <Row>
          <Column header="" rowSpan={3} style={{ width: '5rem' }} />
          <Column header="Product" rowSpan={3} />
          <Column 
            header="" 
            colSpan={totalCols} 
          />
        </Row>
        <Row>
          {metrics.map(metric => (
            <Column key={metric} header={metric} colSpan={timePeriods.length} />
          ))}
        </Row>
        <Row>
          {metrics.map(metric => 
            timePeriods.map(period => (
              <Column 
                key={`${period}_${metric}`}
                header={getTimePeriodLabel(period, breakdownType)}
                sortable
                field={`${period}_${metric.toLowerCase()}`}
              />
            ))
          )}
        </Row>
      </ColumnGroup>
    );
  }, [timePeriods, breakdownType]);
  
  // Body templates for formatting
  const salesBodyTemplate = (rowData, { field }) => {
    const value = rowData[field];
    if (value === undefined || value === null) return '-';
    return `${value}%`;
  };
  
  const profitsBodyTemplate = (rowData, { field }) => {
    const value = rowData[field];
    if (value === undefined || value === null) return '-';
    return formatCurrency(value);
  };
  
  const countBodyTemplate = (rowData, { field }) => {
    const value = rowData[field];
    if (value === undefined || value === null) return '-';
    return value;
  };
  
  const formatCurrency = (value) => {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  };
  
  // Row expansion handlers
  const onRowExpand = (event) => {
    toast.current?.show({ 
      severity: 'info', 
      summary: 'Product Expanded', 
      detail: event.data.product, 
      life: 3000 
    });
  };

  const onRowCollapse = (event) => {
    toast.current?.show({ 
      severity: 'success', 
      summary: 'Product Collapsed', 
      detail: event.data.product, 
      life: 3000 
    });
  };

  const expandAll = () => {
    let _expandedRows = {};
    tableData.forEach((row) => {
      if (row.details && row.details.length > 0) {
        _expandedRows[`${row.id}`] = true;
      }
    });
    setExpandedRows(_expandedRows);
  };

  const collapseAll = () => {
    setExpandedRows(null);
  };

  const allowExpansion = (rowData) => {
    const categoryRows = nestedTableData[rowData.product];
    return categoryRows && categoryRows.length > 0;
  };

  // Row expansion template with nested table (grouped by category)
  const rowExpansionTemplate = (data) => {
    const categoryRows = nestedTableData[data.product];
    
    if (!categoryRows || categoryRows.length === 0) {
      return <div className="p-3">No category data available</div>;
    }

    // Generate nested table columns with same structure as main table
    const nestedColumns = [];
    
    // Category column
    nestedColumns.push(
      <Column key="category" field="category" header="Category" />
    );
    
    // Time period columns for each metric (same structure as main table)
    timePeriods.forEach(period => {
      // Sales column
      nestedColumns.push(
        <Column
          key={`${period}_sales`}
          field={`${period}_sales`}
          body={salesBodyTemplate}
        />
      );
      
      // Profits column
      nestedColumns.push(
        <Column
          key={`${period}_profits`}
          field={`${period}_profits`}
          body={profitsBodyTemplate}
        />
      );
      
      // Count column
      nestedColumns.push(
        <Column
          key={`${period}_count`}
          field={`${period}_count`}
          body={countBodyTemplate}
        />
      );
    });

    // Generate nested column group (same structure as main table)
    const nestedHeaderGroup = (
      <ColumnGroup>
        <Row>
          <Column header="Category" rowSpan={3} />
          <Column 
            header="" 
            colSpan={timePeriods.length * 3} 
          />
        </Row>
        <Row>
          {['Sales', 'Profits', 'Count'].map(metric => (
            <Column key={metric} header={metric} colSpan={timePeriods.length} />
          ))}
        </Row>
        <Row>
          {['Sales', 'Profits', 'Count'].map(metric => 
            timePeriods.map(period => (
              <Column 
                key={`${period}_${metric}`}
                header={getTimePeriodLabel(period, breakdownType)}
                sortable
                field={`${period}_${metric.toLowerCase()}`}
              />
            ))
          )}
        </Row>
      </ColumnGroup>
    );

    return (
      <div className="p-3">
        <h5 className="mb-3">Category Breakdown for {data.product}</h5>
        <DataTable 
          value={categoryRows} 
          headerColumnGroup={nestedHeaderGroup}
          tableStyle={{ minWidth: '50rem' }}
          size="small"
          dataKey="id"
        >
          {nestedColumns}
        </DataTable>
      </div>
    );
  };

  // Header with expand/collapse buttons
  const header = (
    <div className="flex flex-wrap justify-end gap-2">
      <Button 
        icon="pi pi-plus" 
        label="Expand All" 
        onClick={expandAll} 
        text 
        size="small"
      />
      <Button 
        icon="pi pi-minus" 
        label="Collapse All" 
        onClick={collapseAll} 
        text 
        size="small"
      />
    </div>
  );
  
  // Generate column definitions
  const columns = useMemo(() => {
    if (timePeriods.length === 0) return [];
    
    const cols = [];
    
    // Product column
    cols.push(
      <Column key="product" field="product" />
    );
    
    // Time period columns for each metric
    timePeriods.forEach(period => {
      // Sales column
      cols.push(
        <Column
          key={`${period}_sales`}
          field={`${period}_sales`}
          body={salesBodyTemplate}
        />
      );
      
      // Profits column
      cols.push(
        <Column
          key={`${period}_profits`}
          field={`${period}_profits`}
          body={profitsBodyTemplate}
        />
      );
      
      // Count column
      cols.push(
        <Column
          key={`${period}_count`}
          field={`${period}_count`}
          body={countBodyTemplate}
        />
      );
    });
    
    return cols;
  }, [timePeriods]);
  
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-4 md:p-6">
        <Toast ref={toast} />
        <Card className="w-full">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Report Dashboard</h1>
            <p className="text-gray-600 mb-4">Time-based breakdown analysis</p>
            
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">Breakdown Type:</label>
              <Dropdown
                value={breakdownType}
                onChange={(e) => setBreakdownType(e.value)}
                options={BREAKDOWN_OPTIONS}
                optionLabel="label"
                optionValue="value"
                className="w-48"
              />
            </div>
          </div>
          
          <DataTable
            value={tableData}
            expandedRows={expandedRows}
            onRowToggle={(e) => setExpandedRows(e.data)}
            onRowExpand={onRowExpand}
            onRowCollapse={onRowCollapse}
            rowExpansionTemplate={rowExpansionTemplate}
            dataKey="id"
            header={header}
            headerColumnGroup={headerGroup}
            tableStyle={{ minWidth: '50rem' }}
            scrollable
            scrollHeight="60vh"
            className="p-datatable-sm"
          >
            <Column expander={allowExpansion} style={{ width: '5rem' }} />
            {columns}
          </DataTable>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
