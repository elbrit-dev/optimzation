import { getTimePeriodKey, getTimePeriodLabel, getTimePeriods, groupDataByTimePeriod, transformToTableData, transformToNestedTableData, reorganizePeriodsForPeriodOverPeriod } from './timeBreakdownUtils';
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
 * @param {Array} effectiveGroupFields - Array of fields for multi-level nesting (required for grouping)
 * @param {string} dateColumn - Column containing date values
 * @param {string} breakdownType - Type of breakdown: 'day', 'week', 'month', 'quarter', 'annual'
 * @param {Object} columnTypes - Object mapping column names to their types
 * @param {Object} sortConfig - Optional sort configuration with field and direction
 * @param {Object} sortFieldType - Optional sort field type info with fieldType, topLevelKey, nestedPath
 * @returns {Object} Report data structure with tableData, nestedTableData, timePeriods, and metrics
 */
export function transformToReportData(data, effectiveGroupFields, dateColumn, breakdownType, columnTypes = {}, sortConfig = null, sortFieldType = null) {
  // Ensure effectiveGroupFields is an array
  const groupFields = Array.isArray(effectiveGroupFields) ? effectiveGroupFields : [];
  
  if (!data || isEmpty(data) || groupFields.length === 0 || !dateColumn) {
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
        if (groupFields.includes(col) || col === dateColumn) {
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
  const outerGroupField = groupFields[0];
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

  // Generate nested table data for multi-level nesting using composite keys
  // Structure: nestedTableData['level0|level1|level2'] = [rows]
  const nestedTableData = {};
  
  if (groupFields.length > 1) {
    // Helper function to transform raw data rows to nested table format with time breakdown
    // This works for any level by grouping by time period first, then by nextField
    const transformRowsToNestedTable = (rawRows, currentField, nextField, parentPath = [], currentLevel = 0) => {
      // First, group by time period (rawRows are individual data rows, not grouped by time)
      const timeGroupedData = groupDataByTimePeriod(rawRows, dateColumn, breakdownType, metrics);
      
      // Then use transformToNestedTableData which expects time-grouped data
      const transformedNested = transformToNestedTableData(
        timeGroupedData,
        currentField,
        nextField,
        breakdownType,
        timePeriods,
        metrics
      );
      
      // Build a map of (currentField, nextField) -> deeper level field values from original rows
      // This preserves deeper level field values for hasNestedGroups detection
      const deeperFieldsMap = new Map();
      if (currentLevel + 2 < groupFields.length) {
        rawRows.forEach(originalRow => {
          const currentValue = getDataValue(originalRow, currentField);
          const nextValue = getDataValue(originalRow, nextField);
          const mapKey = `${isNil(currentValue) ? '__null__' : String(currentValue)}|${isNil(nextValue) ? '__null__' : String(nextValue)}`;
          
          if (!deeperFieldsMap.has(mapKey)) {
            deeperFieldsMap.set(mapKey, {});
          }
          
          // Collect deeper level field values
          for (let i = currentLevel + 2; i < groupFields.length; i++) {
            const deeperField = groupFields[i];
            const deeperValue = getDataValue(originalRow, deeperField);
            if (!isNil(deeperValue) && deeperValue !== '') {
              deeperFieldsMap.get(mapKey)[deeperField] = deeperValue;
            }
          }
        });
      }
      
      // Map 'product' and 'category' fields to actual field names and preserve parent path
      return transformedNested.map(row => {
        const { product, category, ...rest } = row;
        const currentValue = product === 'Unknown' ? null : product;
        const nextValue = category === 'Unknown' ? null : category;
        const result = {
          ...rest,
          [currentField]: currentValue,
          [nextField]: nextValue
        };
        // Preserve all parent path values
        parentPath.forEach((pathValue, idx) => {
          if (idx < groupFields.length) {
            result[groupFields[idx]] = pathValue;
          }
        });
        
        // Preserve deeper level field values if they exist
        const mapKey = `${isNil(currentValue) ? '__null__' : String(currentValue)}|${isNil(nextValue) ? '__null__' : String(nextValue)}`;
        if (deeperFieldsMap.has(mapKey)) {
          Object.assign(result, deeperFieldsMap.get(mapKey));
        }
        
        return result;
      });
    };

    // Recursive function to generate nested table data for all levels
    const generateNestedDataRecursive = (data, currentLevel, pathKeys = []) => {
      if (currentLevel >= groupFields.length) {
        return; // Base case: no more levels
      }

      const currentField = groupFields[currentLevel];
      const nextField = currentLevel + 1 < groupFields.length ? groupFields[currentLevel + 1] : null;
      
      if (!nextField) {
        // Final level - no nested data needed
        return;
      }

      // Check if data is already grouped by time period (level 0) or raw rows (deeper levels)
      const isTimeGrouped = currentLevel === 0 && typeof data === 'object' && !Array.isArray(data);
      
      // Extract raw rows from time-grouped data or use data directly if it's already raw rows
      let rawRows = [];
      if (isTimeGrouped) {
        // Level 0: data is time-grouped, extract all rows from all periods
        Object.values(data).forEach(periodData => {
          if (periodData && periodData.data && Array.isArray(periodData.data)) {
            rawRows.push(...periodData.data);
          }
        });
      } else {
        // Deeper levels: data is already raw rows
        rawRows = Array.isArray(data) ? data : [];
      }

      // Group raw rows by current field
      const groups = {};
      rawRows.forEach(row => {
        const groupKey = getDataValue(row, currentField);
        const key = isNil(groupKey) ? '__null__' : String(groupKey);
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(row);
      });

      // Process each group
      Object.entries(groups).forEach(([groupKey, rows]) => {
        const currentPath = [...pathKeys, groupKey === '__null__' ? null : groupKey];
        const compositeKey = currentPath.join('|');
        
        // Transform rows to nested table format with time breakdown
        const transformedNested = transformRowsToNestedTable(
          rows,
          currentField,
          nextField,
          pathKeys, // Pass parent path to preserve values
          currentLevel // Pass current level to preserve deeper fields
        );
        
        // Store with composite key
        if (!nestedTableData[compositeKey]) {
          nestedTableData[compositeKey] = [];
        }
        nestedTableData[compositeKey].push(...transformedNested);
        
        // Recursively process next level with raw rows (not time-grouped)
        if (currentLevel + 1 < groupFields.length) {
          generateNestedDataRecursive(rows, currentLevel + 1, currentPath);
        }
      });
    };

    // Start recursive generation from level 0 (groupedData is time-grouped)
    generateNestedDataRecursive(groupedData, 0);

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
