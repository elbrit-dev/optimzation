import { getTimePeriodKey, getTimePeriodLabel, getTimePeriods } from '../report/utils/timeBreakdownUtils';
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

  // Group data by outer group -> time period
  const groupedByOuterAndPeriod = {};
  
  data.forEach(row => {
    const outerValue = getDataValue(row, outerGroupField);
    const dateValue = getDataValue(row, dateColumn);
    if (!dateValue) return;

    const outerKey = isNil(outerValue) ? '__null__' : String(outerValue);
    const periodKey = getTimePeriodKey(dateValue, breakdownType);

    if (!groupedByOuterAndPeriod[outerKey]) {
      groupedByOuterAndPeriod[outerKey] = {};
    }
    if (!groupedByOuterAndPeriod[outerKey][periodKey]) {
      groupedByOuterAndPeriod[outerKey][periodKey] = [];
    }
    groupedByOuterAndPeriod[outerKey][periodKey].push(row);
  });

  // Transform to table data (outer group rows)
  const tableData = Object.entries(groupedByOuterAndPeriod).map(([outerKey, periods], index) => {
    const row = {
      id: index + 1,
      [outerGroupField]: outerKey === '__null__' ? null : outerKey
    };

    // Aggregate metrics for each time period
    timePeriods.forEach(period => {
      const periodRows = periods[period] || [];
      
      metrics.forEach(metric => {
        // If no data exists for this period, set to null instead of 0
        if (periodRows.length === 0) {
          row[`${period}_${metric}`] = null;
        } else {
          const sum = sumBy(periodRows, (r) => {
            const val = getDataValue(r, metric);
            if (isNil(val)) return 0;
            const numVal = isNumber(val) ? val : toNumber(val);
            return _isNaN(numVal) ? 0 : numVal;
          });
          row[`${period}_${metric}`] = sum;
        }
      });
    });

    return row;
  });

  // Generate nested table data (inner group breakdown) if innerGroupField is set
  const nestedTableData = {};
  if (innerGroupField) {
    Object.entries(groupedByOuterAndPeriod).forEach(([outerKey, periods]) => {
      const outerValue = outerKey === '__null__' ? null : outerKey;
      
      // Group by inner group within each outer group
      const innerGroups = {};
      
      Object.entries(periods).forEach(([period, rows]) => {
        rows.forEach(row => {
          const innerValue = getDataValue(row, innerGroupField);
          const innerKey = isNil(innerValue) ? '__null__' : String(innerValue);
          
          if (!innerGroups[innerKey]) {
            innerGroups[innerKey] = {};
          }
          if (!innerGroups[innerKey][period]) {
            innerGroups[innerKey][period] = [];
          }
          innerGroups[innerKey][period].push(row);
        });
      });

      // Transform inner groups to rows
      const innerRows = Object.entries(innerGroups).map(([innerKey, innerPeriods], innerIndex) => {
        const row = {
          id: `${outerKey}-${innerIndex + 1}`,
          [outerGroupField]: outerValue,
          [innerGroupField]: innerKey === '__null__' ? null : innerKey
        };

        // Aggregate metrics for each time period
        timePeriods.forEach(period => {
          const periodRows = innerPeriods[period] || [];
          
          metrics.forEach(metric => {
            // If no data exists for this period, set to null instead of 0
            if (periodRows.length === 0) {
              row[`${period}_${metric}`] = null;
            } else {
              const sum = sumBy(periodRows, (r) => {
                const val = getDataValue(r, metric);
                if (isNil(val)) return 0;
                const numVal = isNumber(val) ? val : toNumber(val);
                return _isNaN(numVal) ? 0 : numVal;
              });
              row[`${period}_${metric}`] = sum;
            }
          });
        });

        return row;
      });

      nestedTableData[outerValue] = innerRows;
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
