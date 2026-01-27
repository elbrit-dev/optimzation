import React from 'react';
import { ColumnGroup } from 'primereact/columngroup';
import { Row } from 'primereact/row';
import { Column } from 'primereact/column';
import { reorganizePeriodsForPeriodOverPeriod, getTimePeriodLabelShort } from '../report/utils/timeBreakdownUtils';

/**
 * Formats metric labels - converts snake_case or camelCase to Title Case
 * @param {string} metricKey - The metric key to format
 * @returns {string} Formatted metric label
 */
export function getMetricLabel(metricKey) {
  // Convert snake_case or camelCase to Title Case
  return metricKey
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

/**
 * Computes report column structure based on report data and column grouping mode
 * @param {Object} reportData - Report data object with timePeriods, metrics, tableData, breakdownType
 * @param {string} columnGroupBy - Column grouping mode: 'values', 'sub-columns', 'period-over-period'
 * @returns {Object|null} Column structure object or null if invalid
 */
export function computeReportColumnsStructure(reportData, columnGroupBy) {
  if (!reportData || !reportData.timePeriods || !reportData.metrics) {
    return null;
  }

  const { timePeriods: rawTimePeriods, metrics, tableData, breakdownType } = reportData;
  
  // Reorganize periods for Period-over-Period mode
  let timePeriods = rawTimePeriods;
  if (columnGroupBy === 'period-over-period') {
    // Get periods that actually have data
    const periodsWithData = new Set();
    if (tableData && tableData.length > 0) {
      tableData.forEach(row => {
        rawTimePeriods.forEach(period => {
          metrics.forEach(metric => {
            const columnName = `${period}_${metric}`;
            const value = row[columnName];
            if (value !== null && value !== undefined) {
              periodsWithData.add(period);
            }
          });
        });
      });
    }
    const periodsArray = Array.from(periodsWithData).sort();
    timePeriods = reorganizePeriodsForPeriodOverPeriod(periodsArray, breakdownType);
  }
  
  // Pre-compute which columns have data (single pass through tableData)
  const columnHasData = new Set();
  if (tableData && tableData.length > 0) {
    tableData.forEach(row => {
      timePeriods.forEach(period => {
        metrics.forEach(metric => {
          const columnName = `${period}_${metric}`;
          const value = row[columnName];
          if (value !== null && value !== undefined) {
            columnHasData.add(columnName);
          }
        });
      });
    });
  }
  
  // Determine order based on columnGroupBy mode
  const isMergedMode = columnGroupBy === 'values' || columnGroupBy === 'period-over-period';
  
  // Build columns with data - order depends on mode
  const columnsWithData = [];
  if (isMergedMode) {
    // Merged mode or Period-over-Period: metrics first, then time periods
    metrics.forEach(metric => {
      timePeriods.forEach(period => {
        const columnName = `${period}_${metric}`;
        if (columnHasData.has(columnName)) {
          columnsWithData.push({ period, metric, columnName });
        }
      });
    });
  } else {
    // Sub-columns mode: time periods first, then metrics
    timePeriods.forEach(period => {
      metrics.forEach(metric => {
        const columnName = `${period}_${metric}`;
        if (columnHasData.has(columnName)) {
          columnsWithData.push({ period, metric, columnName });
        }
      });
    });
  }
  
  // Group by metric for header colSpan calculation (merged mode and period-over-period)
  const metricGroups = {};
  columnsWithData.forEach(({ metric, period }) => {
    if (!metricGroups[metric]) {
      metricGroups[metric] = [];
    }
    metricGroups[metric].push(period);
  });
  
  // Group by period for header colSpan calculation (sub-columns mode)
  const periodGroups = {};
  columnsWithData.forEach(({ period, metric }) => {
    if (!periodGroups[period]) {
      periodGroups[period] = [];
    }
    periodGroups[period].push(metric);
  });
  
  return {
    columnsWithData,
    metricGroups,
    periodGroups,
    metricsWithData: Object.keys(metricGroups),
    timePeriodsWithData: Object.keys(periodGroups).sort(),
    columnNames: columnsWithData.map(c => c.columnName),
    isMergedMode,
    isPeriodOverPeriod: columnGroupBy === 'period-over-period'
  };
}

/**
 * Generates report header group JSX for the DataTable
 * @param {Object} reportColumnsStructure - Column structure from computeReportColumnsStructure
 * @param {Object} reportData - Report data object with breakdownType
 * @param {string} outerGroupField - Outer group field name
 * @param {Function} formatHeaderName - Function to format header names
 * @returns {JSX.Element|null} ColumnGroup element or null
 */
export function generateReportHeaderGroup(reportColumnsStructure, reportData, outerGroupField, formatHeaderName) {
  if (!reportColumnsStructure || !reportData) {
    return null;
  }

  const { breakdownType } = reportData;
  const { metricGroups, periodGroups, metricsWithData, timePeriodsWithData, columnsWithData, isMergedMode } = reportColumnsStructure;
  const totalDataCols = columnsWithData.length;

  if (isMergedMode) {
    // Merged mode or Period-over-Period: metrics first, then time periods
    return (
      <ColumnGroup>
        <Row>
          <Column header="" rowSpan={3} style={{ width: '3rem' }} />
          <Column header={formatHeaderName(outerGroupField)} rowSpan={3} />
          {totalDataCols > 0 && (
            <Column 
              header="" 
              colSpan={totalDataCols} 
            />
          )}
        </Row>
        <Row>
          {metricsWithData.map(metric => {
            const periodCount = metricGroups[metric].length;
            return (
              <Column key={metric} header={getMetricLabel(metric)} colSpan={periodCount} />
            );
          })}
        </Row>
        <Row>
          {metricsWithData.map(metric => 
            metricGroups[metric].map(period => (
              <Column 
                key={`${period}_${metric}`}
                header={getTimePeriodLabelShort(period, breakdownType)}
                sortable
                field={`${period}_${metric}`}
              />
            ))
          )}
        </Row>
      </ColumnGroup>
    );
  } else {
    // Sub-columns mode: time periods first, then metrics
    return (
      <ColumnGroup>
        <Row>
          <Column header="" rowSpan={3} style={{ width: '3rem' }} />
          <Column header={formatHeaderName(outerGroupField)} rowSpan={3} />
          {totalDataCols > 0 && (
            <Column 
              header="" 
              colSpan={totalDataCols} 
            />
          )}
        </Row>
        <Row>
          {timePeriodsWithData.map(period => {
            const metricCount = periodGroups[period].length;
            return (
              <Column 
                key={period} 
                header={getTimePeriodLabelShort(period, breakdownType)} 
                colSpan={metricCount} 
              />
            );
          })}
        </Row>
        <Row>
          {timePeriodsWithData.map(period => 
            periodGroups[period].map(metric => (
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
  }
}

/**
 * Generates report column list from column structure
 * @param {Object} reportColumnsStructure - Column structure from computeReportColumnsStructure
 * @param {string} outerGroupField - Outer group field name
 * @returns {Array} Array of column names
 */
export function getReportColumns(reportColumnsStructure, outerGroupField) {
  if (!reportColumnsStructure) {
    return [];
  }

  const cols = [outerGroupField];
  cols.push(...reportColumnsStructure.columnNames);
  return cols;
}
