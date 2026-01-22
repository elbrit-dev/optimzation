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
import { InputSwitch } from 'primereact/inputswitch';
import ProtectedRoute from '@/components/ProtectedRoute';
import testData from '@/resource/test';
import {
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

// Transform test data - keep all fields, just map posting_date to date for compatibility
const transformTestData = (data) => {
  return data.map(item => ({
    ...item,
    date: item.posting_date // Add date field for time breakdown utilities
  }));
};

export default function ReportPage() {
  const [breakdownType, setBreakdownType] = useState('month');
  const [columnLayoutMode, setColumnLayoutMode] = useState('merged'); // 'merged' | 'sub-columns'
  const [expandedRows, setExpandedRows] = useState(null);
  const toast = useRef(null);
  
  // Transform and use test data
  const rawData = useMemo(() => transformTestData(testData), []);
  
  // Get date range from data
  const dateRange = useMemo(() => {
    if (!rawData || rawData.length === 0) return { start: null, end: null };
    
    const dates = rawData.map(d => d.date).sort();
    return {
      start: dates[0],
      end: dates[dates.length - 1]
    };
  }, [rawData]);
  
  // Detect numeric fields (metrics) from the data
  const metrics = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    const firstRow = rawData[0];
    const numericFields = [];
    // Fields to exclude from metrics (grouping fields and date)
    const excludeFields = ['team', 'hq', 'item_name', 'customer_name', 'posting_date', 'date'];
    
    Object.keys(firstRow).forEach(key => {
      if (!excludeFields.includes(key)) {
        const value = firstRow[key];
        if (typeof value === 'number') {
          numericFields.push(key);
        }
      }
    });
    return numericFields; // Returns: ['qty', 'amount', 'sales', 'target']
  }, [rawData]);

  // Group data by time period with all numeric fields as metrics
  const groupedData = useMemo(() => {
    if (!rawData || rawData.length === 0) return {};
    return groupDataByTimePeriod(rawData, 'date', breakdownType, metrics);
  }, [rawData, breakdownType, metrics]);
  
  // Get all time periods
  const timePeriods = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return [];
    return getTimePeriods(dateRange.start, dateRange.end, breakdownType);
  }, [dateRange, breakdownType]);
  
  // Transform to table data (include details for nested table)
  const tableData = useMemo(() => {
    if (!groupedData || Object.keys(groupedData).length === 0) return [];
    const transformed = transformToTableData(groupedData, 'team', breakdownType, true, metrics);
    // Map 'product' field to 'team' since the utility function hardcodes 'product'
    return transformed.map(row => ({
      ...row,
      team: row.product,
      product: undefined
    })).map(({ product, ...rest }) => rest);
  }, [groupedData, breakdownType, metrics]);

  // Generate nested table data (grouped by hq)
  const nestedTableData = useMemo(() => {
    if (!groupedData || Object.keys(groupedData).length === 0 || timePeriods.length === 0) return {};
    const nested = transformToNestedTableData(groupedData, 'team', 'hq', breakdownType, timePeriods, metrics);
    
    // Map 'product' and 'category' fields to 'team' and 'hq' since the utility function hardcodes them
    const mappedNested = nested.map(row => {
      const { product, category, ...rest } = row;
      return {
        ...rest,
        team: product,
        hq: category
      };
    });
    
    // Group by team for easy lookup
    const byTeam = {};
    mappedNested.forEach(row => {
      if (!byTeam[row.team]) {
        byTeam[row.team] = [];
      }
      byTeam[row.team].push(row);
    });
    return byTeam;
  }, [groupedData, breakdownType, timePeriods]);
  
  // Helper function to get metric label - capitalize and format field names
  const getMetricLabel = (metricKey) => {
    // Convert snake_case or camelCase to Title Case
    return metricKey
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
  };

  // Generate merged columns header group (metrics first, then time periods)
  const generateMergedHeaderGroup = () => {
    if (timePeriods.length === 0) return null;
    
    const metricLabels = metrics.map(m => getMetricLabel(m));
    const totalCols = timePeriods.length * metrics.length;
    
    return (
      <ColumnGroup>
        <Row>
          <Column header="" rowSpan={3} style={{ width: '5rem' }} />
          <Column header="Team" rowSpan={3} />
          <Column 
            header="" 
            colSpan={totalCols} 
          />
        </Row>
        <Row>
          {metricLabels.map((label, idx) => (
            <Column key={metrics[idx]} header={label} colSpan={timePeriods.length} />
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
  };

  // Generate sub-columns header group (time periods first, then metrics)
  const generateSubColumnsHeaderGroup = () => {
    if (timePeriods.length === 0) return null;
    
    const totalCols = timePeriods.length * metrics.length;
    
    return (
      <ColumnGroup>
        <Row>
          <Column header="" rowSpan={3} style={{ width: '5rem' }} />
          <Column header="Team" rowSpan={3} />
          <Column 
            header="" 
            colSpan={totalCols} 
          />
        </Row>
        <Row>
          {timePeriods.map(period => (
            <Column 
              key={period} 
              header={getTimePeriodLabel(period, breakdownType)} 
              colSpan={metrics.length} 
            />
          ))}
        </Row>
        <Row>
          {timePeriods.map(period => 
            metrics.map(metric => (
              <Column 
                key={`${period}_${metric}`}
                header={getMetricLabel(metric, 'sub-columns')}
                sortable
                field={`${period}_${metric}`}
              />
            ))
          )}
        </Row>
      </ColumnGroup>
    );
  };

  // Generate column groups
  const headerGroup = useMemo(() => {
    if (timePeriods.length === 0) return null;
    
    return columnLayoutMode === 'merged' 
      ? generateMergedHeaderGroup()
      : generateSubColumnsHeaderGroup();
  }, [timePeriods, breakdownType, columnLayoutMode]);
  
  // Dynamic body template based on metric type
  const getBodyTemplate = (metric) => {
    return (rowData, { field }) => {
      const value = rowData[field];
      if (value === undefined || value === null) return '-';
      
      // Format based on metric name patterns
      if (metric === 'amount' || metric.includes('amount') || metric.includes('sales')) {
        // Format as currency for amount/sales
        return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
      } else if (metric === 'qty' || metric === 'count' || metric.includes('qty') || metric.includes('count')) {
        // Format as number for quantities
        return value.toLocaleString('en-US');
      } else {
        // Default: format as number
        return value.toLocaleString('en-US');
      }
    };
  };
  
  // Row expansion handlers
  const onRowExpand = (event) => {
    toast.current?.show({ 
      severity: 'info', 
      summary: 'Team Expanded', 
      detail: event.data.team, 
      life: 3000 
    });
  };

  const onRowCollapse = (event) => {
    toast.current?.show({ 
      severity: 'success', 
      summary: 'Team Collapsed', 
      detail: event.data.team, 
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
    const hqRows = nestedTableData[rowData.team];
    return hqRows && hqRows.length > 0;
  };

  // Generate merged nested header group
  const generateMergedNestedHeaderGroup = () => {
    const metricLabels = metrics.map(m => getMetricLabel(m));
    return (
      <ColumnGroup>
        <Row>
          <Column header="HQ" rowSpan={3} />
          <Column 
            header="" 
            colSpan={timePeriods.length * metrics.length} 
          />
        </Row>
        <Row>
          {metricLabels.map((label, idx) => (
            <Column key={metrics[idx]} header={label} colSpan={timePeriods.length} />
          ))}
        </Row>
        <Row>
          {metrics.map(metric => 
            timePeriods.map(period => (
              <Column 
                key={`${period}_${metric}`}
                header={getTimePeriodLabel(period, breakdownType)}
                sortable
                field={`${period}_${metric}`}
              />
            ))
          )}
        </Row>
      </ColumnGroup>
    );
  };

  // Generate sub-columns nested header group
  const generateSubColumnsNestedHeaderGroup = () => {
    return (
      <ColumnGroup>
        <Row>
          <Column header="HQ" rowSpan={3} />
          <Column 
            header="" 
            colSpan={timePeriods.length * metrics.length} 
          />
        </Row>
        <Row>
          {timePeriods.map(period => (
            <Column 
              key={period} 
              header={getTimePeriodLabel(period, breakdownType)} 
              colSpan={metrics.length} 
            />
          ))}
        </Row>
        <Row>
          {timePeriods.map(period => 
            metrics.map(metric => (
              <Column 
                key={`${period}_${metric}`}
                header={getMetricLabel(metric)}
                sortable
                field={`${period}_${metric}`}
              />
            ))
          )}
        </Row>
      </ColumnGroup>
    );
  };

  // Row expansion template with nested table (grouped by hq)
  const rowExpansionTemplate = (data) => {
    const hqRows = nestedTableData[data.team];
    
    if (!hqRows || hqRows.length === 0) {
      return <div className="p-3">No HQ data available</div>;
    }

    // Generate nested table columns with same structure as main table
    const nestedColumns = [];
    
    // HQ column
    nestedColumns.push(
      <Column key="hq" field="hq" header="HQ" />
    );
    
    if (columnLayoutMode === 'merged') {
      // Merged mode: metrics first, then time periods
      metrics.forEach(metric => {
        timePeriods.forEach(period => {
          nestedColumns.push(
            <Column
              key={`${period}_${metric}`}
              field={`${period}_${metric}`}
              body={getBodyTemplate(metric)}
            />
          );
        });
      });
    } else {
      // Sub-columns mode: time periods first, then metrics
      timePeriods.forEach(period => {
        metrics.forEach(metric => {
          nestedColumns.push(
            <Column
              key={`${period}_${metric}`}
              field={`${period}_${metric}`}
              body={getBodyTemplate(metric)}
            />
          );
        });
      });
    }

    // Generate nested column group (same structure as main table)
    const nestedHeaderGroup = columnLayoutMode === 'merged'
      ? generateMergedNestedHeaderGroup()
      : generateSubColumnsNestedHeaderGroup();

    return (
      <div className="p-3">
        <h5 className="mb-3">HQ Breakdown for {data.team}</h5>
        <DataTable 
          value={hqRows} 
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
    
    // Team column
    cols.push(
      <Column key="team" field="team" />
    );
    
    if (columnLayoutMode === 'merged') {
      // Merged mode: metrics first, then time periods
      metrics.forEach(metric => {
        timePeriods.forEach(period => {
          cols.push(
            <Column
              key={`${period}_${metric}`}
              field={`${period}_${metric}`}
              body={getBodyTemplate(metric)}
            />
          );
        });
      });
    } else {
      // Sub-columns mode: time periods first, then metrics
      timePeriods.forEach(period => {
        metrics.forEach(metric => {
          cols.push(
            <Column
              key={`${period}_${metric}`}
              field={`${period}_${metric}`}
              body={getBodyTemplate(metric)}
            />
          );
        });
      });
    }
    
    return cols;
  }, [timePeriods, columnLayoutMode, metrics]);
  
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-4 md:p-6">
        <Toast ref={toast} />
        <Card className="w-full">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Report Dashboard</h1>
            <p className="text-gray-600 mb-4">Time-based breakdown analysis</p>
            
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">
                  {columnLayoutMode === 'merged' ? 'Merged Columns' : 'Sub-Columns'}
                </label>
                <InputSwitch
                  checked={columnLayoutMode === 'sub-columns'}
                  onChange={(e) => setColumnLayoutMode(e.value ? 'sub-columns' : 'merged')}
                />
              </div>
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
