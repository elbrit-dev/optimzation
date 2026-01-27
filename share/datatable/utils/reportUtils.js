import { getTimePeriodKey, getTimePeriodLabel, getTimePeriods, groupDataByTimePeriod, transformToTableData, transformToNestedTableData, reorganizePeriodsForPeriodOverPeriod } from '../report/utils/timeBreakdownUtils';
import { getDataValue, getNestedValue } from './dataAccessUtils';
import { sumBy, isNil, isNumber, toNumber, isNaN as _isNaN, isEmpty, isDate, isString, trim } from 'lodash';
import dayjs from 'dayjs';

/**
 * Parse a value to a Date object
 */
function parseToDate(value) {
  if (isNil(value)) return null;
  if (value === '' || value === 0 || value === '0') return null;
  if (isDate(value)) return value;
  if (isNumber(value)) {
    if (value <= 0) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  if (isString(value)) {
    const trimmed = trim(value);
    if (trimmed === '') return null;
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Create a sort comparator function based on sortConfig and fieldType
 * @param {Object} sortConfig - Sort configuration with field and direction
 * @param {string} fieldType - Type of field: 'number', 'date', 'boolean', 'string'
 * @param {string} topLevelKey - Top-level key (e.g., "user")
 * @param {string} nestedPath - Nested path (e.g., "profile.name")
 * @returns {Function|null} Comparator function or null if sortConfig is invalid
 */
function createSortComparator(sortConfig, fieldType, topLevelKey, nestedPath) {
  if (!sortConfig || !fieldType) return null;
  
  const { field, direction } = sortConfig;
  return (a, b) => {
    const aValue = getNestedValue(a, topLevelKey, nestedPath);
    const bValue = getNestedValue(b, topLevelKey, nestedPath);

    let comparison = 0;
    switch (fieldType) {
      case 'number':
        comparison = (toNumber(aValue) || 0) - (toNumber(bValue) || 0);
        break;
      case 'date':
        const aDate = parseToDate(aValue);
        const bDate = parseToDate(bValue);
        comparison = (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
        break;
      case 'boolean':
        comparison = (aValue ? 1 : 0) - (bValue ? 1 : 0);
        break;
      default: // string
        comparison = String(aValue || '').localeCompare(String(bValue || ''));
    }

    return direction === 'asc' ? comparison : -comparison;
  };
}

/**
 * Transform data to report format with time-based breakdown
 * @param {Array} data - Raw data array
 * @param {string} outerGroupField - Field to group by (outer group)
 * @param {string} innerGroupField - Field to group by within outer group (inner group, optional)
 * @param {string} dateColumn - Column containing date values
 * @param {string} breakdownType - Type of breakdown: 'day', 'week', 'month', 'quarter', 'annual'
 * @param {Object} columnTypes - Object mapping column names to their types
 * @param {Object} sortConfig - Optional sort configuration with field and direction
 * @param {Object} sortFieldType - Optional sort field type info with fieldType, topLevelKey, nestedPath
 * @returns {Object} Report data structure with tableData, nestedTableData, timePeriods, and metrics
 */
export function transformToReportData(data, outerGroupField, innerGroupField, dateColumn, breakdownType, columnTypes = {}, sortConfig = null, sortFieldType = null) {
  if (!data || isEmpty(data) || !outerGroupField || !dateColumn) {
    return {
      tableData: [],
      nestedTableData: {},
      timePeriods: [],
      metrics: [],
      dateRange: { start: null, end: null }
    };
  }

  // Detect numeric columns (metrics to aggregate) - optimized single pass
  const metrics = [];
  const allColumnsSet = new Set();
  const columnNumericCount = new Map();
  const columnCheckedCount = new Map();
  const sampleSize = Math.min(data.length, 100);

  // Single pass to collect columns and detect metrics
  if (!isEmpty(data)) {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row || typeof row !== 'object') continue;

      Object.keys(row).forEach(col => {
        allColumnsSet.add(col);
        
        // Skip grouping fields and date column
        if (col === outerGroupField || col === innerGroupField || col === dateColumn) {
          return;
        }

        // Check column type
        const colType = columnTypes[col];
        if (colType === 'number') {
          if (!metrics.includes(col)) {
            metrics.push(col);
          }
        } else if (i < sampleSize) {
          // Sample rows for numeric detection
          const value = getDataValue(row, col);
          if (value !== null && value !== undefined && value !== '') {
            columnCheckedCount.set(col, (columnCheckedCount.get(col) || 0) + 1);
            if (typeof value === 'number') {
              columnNumericCount.set(col, (columnNumericCount.get(col) || 0) + 1);
            } else {
              const numVal = toNumber(value);
              if (!_isNaN(numVal) && isFinite(numVal)) {
                columnNumericCount.set(col, (columnNumericCount.get(col) || 0) + 1);
              }
            }
          }
        }
      });
    }

    // Process sampled columns
    columnCheckedCount.forEach((checkedCount, col) => {
      if (!metrics.includes(col)) {
        const numericCount = columnNumericCount.get(col) || 0;
        if (checkedCount > 0 && numericCount / checkedCount > 0.5) {
          metrics.push(col);
        }
      }
    });
  }

  // Get date range from data - optimized with single pass and caching
  const dates = [];
  const dateCache = new Map();
  
  for (let i = 0; i < data.length; i++) {
    const dateValue = getDataValue(data[i], dateColumn);
    if (!dateValue) continue;
    
    let parsed = dateCache.get(dateValue);
    if (!parsed) {
      parsed = dayjs(dateValue);
      if (parsed.isValid()) {
        dateCache.set(dateValue, parsed);
        dates.push(parsed);
      }
    } else {
      dates.push(parsed);
    }
  }
  
  // Sort dates
  dates.sort((a, b) => a.valueOf() - b.valueOf());

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
  let tableData = transformedTableData.map(row => {
    const { product, ...rest } = row;
    return {
      ...rest,
      [outerGroupField]: product === 'Unknown' ? null : product
    };
  });

  // Apply sorting to tableData if sortConfig is provided
  if (sortConfig && sortFieldType) {
    const sortComparator = createSortComparator(
      sortConfig,
      sortFieldType.fieldType,
      sortFieldType.topLevelKey,
      sortFieldType.nestedPath
    );
    if (sortComparator && tableData.length > 0) {
      tableData.sort(sortComparator);
    }
  }

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

    // Apply sorting to nested table data if sortConfig is provided
    if (sortConfig && sortFieldType) {
      const sortComparator = createSortComparator(
        sortConfig,
        sortFieldType.fieldType,
        sortFieldType.topLevelKey,
        sortFieldType.nestedPath
      );
      if (sortComparator) {
        // Sort each nested table array
        Object.keys(nestedTableData).forEach(key => {
          if (nestedTableData[key] && nestedTableData[key].length > 0) {
            nestedTableData[key].sort(sortComparator);
          }
        });
      }
    }
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
