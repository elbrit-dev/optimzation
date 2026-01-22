import { getTimePeriodKey, getTimePeriodLabel, getTimePeriods, groupDataByTimePeriod, transformToTableData, transformToNestedTableData } from '../report/utils/timeBreakdownUtils';
import { getDataValue } from './dataAccessUtils';
import { sumBy, isNil, isNumber, toNumber, isNaN as _isNaN, isEmpty } from 'lodash';
import dayjs from 'dayjs';

/**
 * Transform data to report format with time-based breakdown
 * @param {Array} data - Raw data array
 * @param {string} outerGroupField - Field to group by (outer group)
 * @param {string} innerGroupField - Field to group by within outer group (inner group, optional)
 * @param {string} dateColumn - Column containing date values
 * @param {string} breakdownType - Type of breakdown: 'day', 'week', 'month', 'quarter', 'annual'
 * @param {Object} columnTypes - Object mapping column names to their types
 * @returns {Object} Report data structure with tableData, nestedTableData, timePeriods, and metrics
 */
export function transformToReportData(data, outerGroupField, innerGroupField, dateColumn, breakdownType, columnTypes = {}) {
  if (!data || isEmpty(data) || !outerGroupField || !dateColumn) {
    return {
      tableData: [],
      nestedTableData: {},
      timePeriods: [],
      metrics: [],
      dateRange: { start: null, end: null }
    };
  }

  // Detect numeric columns (metrics to aggregate)
  const metrics = [];
  if (!isEmpty(data)) {
    // Collect ALL columns from ALL rows, not just first row
    // This is critical because grouped/aggregated data may have different columns in different rows
    const allColumnsSet = new Set();
    data.forEach(row => {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach(col => allColumnsSet.add(col));
      }
    });
    const allColumns = Array.from(allColumnsSet);
    const firstRow = data[0];

    allColumns.forEach(col => {
      // Skip grouping fields and date column
      if (col === outerGroupField || col === innerGroupField || col === dateColumn) {
        return;
      }
      // Check if column is numeric based on columnTypes or data
      const colType = columnTypes[col];
      if (colType === 'number') {
        metrics.push(col);
      } else {
        // Try to detect from data - check multiple rows, not just first row
        // This is important because first row might not have all columns
        let numericCount = 0;
        let checkedCount = 0;
        const sampleSize = Math.min(data.length, 100);
        
        for (let i = 0; i < sampleSize; i++) {
          const value = getDataValue(data[i], col);
          if (value !== null && value !== undefined && value !== '') {
            checkedCount++;
            if (typeof value === 'number') {
              numericCount++;
            } else {
              const numVal = toNumber(value);
              if (!_isNaN(numVal)) {
                numericCount++;
              }
            }
          }
        }
        
        // If >50% of checked values are numeric, consider it a numeric column
        // This is more lenient than the 80% threshold in columnTypes detection
        if (checkedCount > 0 && numericCount / checkedCount > 0.5) {
          metrics.push(col);
        }
      }
    });
  }

  // Get date range from data
  const dates = data
    .map(row => {
      const dateValue = getDataValue(row, dateColumn);
      if (!dateValue) return null;
      // Try to parse as date
      const parsed = dayjs(dateValue);
      return parsed.isValid() ? parsed : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.valueOf() - b.valueOf());

  if (dates.length === 0) {
    return {
      tableData: [],
      nestedTableData: {},
      timePeriods: [],
      metrics: [],
      dateRange: { start: null, end: null }
    };
  }

  const dateRange = {
    start: dates[0].format('YYYY-MM-DD'),
    end: dates[dates.length - 1].format('YYYY-MM-DD')
  };

  // Get all time periods
  const timePeriods = getTimePeriods(dateRange.start, dateRange.end, breakdownType);

  // Group data by time period first (matching reference implementation in report/page.jsx)
  const groupedData = groupDataByTimePeriod(data, dateColumn, breakdownType, metrics);

  // Transform to table data (outer group rows) using transformToTableData
  // This matches the reference implementation approach
  const transformedTableData = transformToTableData(groupedData, outerGroupField, breakdownType, true, metrics);
  
  // Map 'product' field to the actual outerGroupField since transformToTableData hardcodes 'product'
  const tableData = transformedTableData.map(row => {
    const { product, ...rest } = row;
    return {
      ...rest,
      [outerGroupField]: product === 'Unknown' ? null : product
    };
  });

  // Generate nested table data (inner group breakdown) if innerGroupField is set
  // This matches the reference implementation approach
  const nestedTableData = {};
  if (innerGroupField) {
    const transformedNested = transformToNestedTableData(groupedData, outerGroupField, innerGroupField, breakdownType, timePeriods, metrics);
    
    // Map 'product' and 'category' fields to outerGroupField and innerGroupField
    // since transformToNestedTableData hardcodes these field names
    const mappedNested = transformedNested.map(row => {
      const { product, category, ...rest } = row;
      return {
        ...rest,
        [outerGroupField]: product === 'Unknown' ? null : product,
        [innerGroupField]: category === 'Unknown' ? null : category
      };
    });
    
    // Group by outer group value for easy lookup (matching reference implementation)
    mappedNested.forEach(row => {
      const outerValue = row[outerGroupField];
      // Handle null values consistently (use null as key, JavaScript handles this)
      const key = isNil(outerValue) ? null : outerValue;
      if (!nestedTableData[key]) {
        nestedTableData[key] = [];
      }
      nestedTableData[key].push(row);
    });
  }

  return {
    tableData,
    nestedTableData,
    timePeriods,
    metrics,
    dateRange,
    breakdownType
  };
}
