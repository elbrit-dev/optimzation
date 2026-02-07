/**
 * Web Worker for filter and sort computation
 * Uses Comlink to expose API to main thread
 */

import * as Comlink from 'comlink';
import {
  isArray,
  isEmpty,
  isNil,
  isNumber,
  isBoolean,
  isString,
  toNumber,
  toLower,
  includes,
  every,
  some,
  filter,
  orderBy,
  get,
  isNaN as _isNaN,
} from 'lodash';
import dayjs from 'dayjs';

/**
 * Get data value from object (handles nested paths)
 */
function getDataValue(data, key) {
  if (!data || !key) return undefined;
  if (data instanceof Map) {
    return data.get(key);
  }
  // Handle nested paths like "user.profile.name"
  if (key.includes('.')) {
    const parts = key.split('.');
    let current = data;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  }
  return data[key];
}

/**
 * Get nested value for sorting
 */
function getNestedValue(row, topLevelKey, nestedPath) {
  if (!topLevelKey) return undefined;
  if (!nestedPath) {
    return getDataValue(row, topLevelKey);
  }
  const topLevelData = getDataValue(row, topLevelKey);
  if (!topLevelData || typeof topLevelData !== 'object') return undefined;
  return getDataValue(topLevelData, nestedPath);
}

/**
 * Parse numeric filter
 */
function parseNumericFilter(filterValue) {
  if (isNil(filterValue) || filterValue === '') return null;
  const str = String(filterValue).trim();
  const numPattern = '([+-]?\\s*\\d+\\.?\\d*)';
  const rangePattern = new RegExp(`^${numPattern}\\s*-\\s*${numPattern}$`);
  const gtPattern = new RegExp(`^>\\s*${numPattern}$`);
  const ltPattern = new RegExp(`^<\\s*${numPattern}$`);
  const gtePattern = new RegExp(`^>=\\s*${numPattern}$`);
  const ltePattern = new RegExp(`^<=\\s*${numPattern}$`);

  const rangeMatch = str.match(rangePattern);
  if (rangeMatch) {
    return {
      type: 'range',
      min: toNumber(rangeMatch[1].replace(/\s+/g, '')),
      max: toNumber(rangeMatch[2].replace(/\s+/g, '')),
    };
  }

  const gtMatch = str.match(gtPattern);
  if (gtMatch) {
    return {
      type: 'gt',
      value: toNumber(gtMatch[1].replace(/\s+/g, '')),
    };
  }

  const ltMatch = str.match(ltPattern);
  if (ltMatch) {
    return {
      type: 'lt',
      value: toNumber(ltMatch[1].replace(/\s+/g, '')),
    };
  }

  const gteMatch = str.match(gtePattern);
  if (gteMatch) {
    return {
      type: 'gte',
      value: toNumber(gteMatch[1].replace(/\s+/g, '')),
    };
  }

  const lteMatch = str.match(ltePattern);
  if (lteMatch) {
    return {
      type: 'lte',
      value: toNumber(lteMatch[1].replace(/\s+/g, '')),
    };
  }

  return { type: 'text', value: str };
}

/**
 * Apply numeric filter
 */
function applyNumericFilter(cellValue, parsedFilter) {
  if (!parsedFilter) return true;
  const numCell = isNumber(cellValue) ? cellValue : toNumber(cellValue);
  switch (parsedFilter.type) {
    case 'range':
      return numCell >= parsedFilter.min && numCell <= parsedFilter.max;
    case 'gt':
      return numCell > parsedFilter.value;
    case 'lt':
      return numCell < parsedFilter.value;
    case 'gte':
      return numCell >= parsedFilter.value;
    case 'lte':
      return numCell <= parsedFilter.value;
    default:
      return true;
  }
}

/**
 * Parse date value
 */
function parseToDate(value) {
  if (isNil(value)) return null;
  if (value === '' || value === 0 || value === '0') return null;
  if (value instanceof Date) return value;
  if (isNumber(value)) {
    if (value <= 0) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.toDate() : null;
}

/**
 * Apply date filter
 */
function applyDateFilter(cellValue, dateRange) {
  if (!dateRange || (!dateRange[0] && !dateRange[1])) return true;
  const cellDate = parseToDate(cellValue);
  if (!cellDate) return false;
  const [startDate, endDate] = dateRange;
  const cellTime = cellDate.getTime();
  if (startDate && endDate) {
    const startTime = parseToDate(startDate)?.getTime();
    const endTime = parseToDate(endDate)?.getTime();
    if (startTime && endTime) {
      return cellTime >= startTime && cellTime <= endTime;
    }
    return cellTime <= endTime;
  }
  return true;
}

/**
 * Get sort comparator
 */
function getSortComparator(sortConfig, fieldType, topLevelKey, nestedPath) {
  if (!sortConfig) return null;

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
 * Check if column is percentage column
 */
function isPercentageColumn(columnName, percentageColumns) {
  if (!percentageColumns || !Array.isArray(percentageColumns)) return false;
  return percentageColumns.some(pc => pc.columnName === columnName);
}

/**
 * Get percentage column value
 */
function getPercentageColumnValue(row, columnName, percentageColumns) {
  const pc = percentageColumns?.find(p => p.columnName === columnName);
  if (!pc || !pc.targetField || !pc.valueField) return null;
  
  const targetValue = getDataValue(row, pc.targetField);
  const value = getDataValue(row, pc.valueField);
  
  if (targetValue == null || value == null) return null;
  const targetNum = toNumber(targetValue);
  const valueNum = toNumber(value);
  
  if (targetNum === 0 || !isFinite(targetNum) || !isFinite(valueNum)) return null;
  return (valueNum / targetNum) * 100;
}

/**
 * Compute filtered, sorted, and grouped data
 */
async function computeFilterSortGrouped(
  data,
  options
) {
  const {
    tableFilters = {},
    columns = [],
    columnTypes = {},
    multiselectColumns = [],
    hasPercentageColumns = false,
    percentageColumns = [],
    percentageColumnNames = [],
    enableFilter = true,
    searchTerm = '',
    searchFields = {},
    sortConfig = null,
    sortFieldType = null,
    tableSortMeta = [],
    enableSort = true,
    effectiveGroupFields = [],
  } = options;

  if (!isArray(data) || isEmpty(data)) {
    return {
      filteredData: [],
      sortedData: [],
      groupedData: [],
    };
  }

  // Helper to check if percentage column (using worker's own function)
  const isPctCol = (col) => isPercentageColumn(col, percentageColumns);

  // Step 1: Apply search filter if searchTerm exists
  let searchFilteredData = data;
  if (searchTerm && searchTerm.trim() && searchFields && Object.keys(searchFields).length > 0) {
    const searchLower = toLower(searchTerm.trim());
    searchFilteredData = filter(data, (row) => {
      if (!row || typeof row !== 'object') return false;
      return some(Object.keys(searchFields), (topLevelKey) => {
        const nestedPaths = searchFields[topLevelKey];
        if (!isArray(nestedPaths) || isEmpty(nestedPaths)) {
          // Search in top-level key directly
          const value = getDataValue(row, topLevelKey);
          return includes(toLower(String(value ?? '')), searchLower);
        }
        // Search in nested paths
        const topLevelData = getDataValue(row, topLevelKey);
        if (!topLevelData || typeof topLevelData !== 'object') return false;
        return some(nestedPaths, (nestedPath) => {
          const value = getDataValue(topLevelData, nestedPath);
          return includes(toLower(String(value ?? '')), searchLower);
        });
      });
    });
  }

  // Step 2: Apply sortConfig if it exists (before filtering)
  let searchSortSortedData = searchFilteredData;
  if (sortConfig && sortFieldType) {
    const sortComparator = getSortComparator(
      sortConfig,
      sortFieldType.fieldType,
      sortFieldType.topLevelKey,
      sortFieldType.nestedPath
    );
    if (sortComparator) {
      searchSortSortedData = [...searchFilteredData];
      searchSortSortedData.sort(sortComparator);
    }
  }

  // Step 3: Apply table filters
  let filteredData = searchSortSortedData;
  if (enableFilter) {
    filteredData = filter(searchSortSortedData, (row) => {
      if (!row || typeof row !== 'object') return false;
      
      // Regular column filters
      const regularColumnsPass = every(columns, (col) => {
        const filterObj = get(tableFilters, col);
        if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;
        if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;
        
        const cellValue = getDataValue(row, col);
        const filterValue = filterObj.value;
        const colType = columnTypes[col] || 'string';
        const isMultiselectColumn = includes(multiselectColumns, col);
        
        if (isMultiselectColumn && isArray(filterValue)) {
          return some(filterValue, (v) => {
            if (isNil(v) && isNil(cellValue)) return true;
            if (isNil(v) || isNil(cellValue)) return false;
            return v === cellValue || String(v) === String(cellValue);
          });
        }
        
        if (colType === 'boolean') {
          const cellIsTruthy = cellValue === true || cellValue === 1 || cellValue === '1';
          const cellIsFalsy = cellValue === false || cellValue === 0 || cellValue === '0';
          if (filterValue === true) {
            return cellIsTruthy;
          } else if (filterValue === false) {
            return cellIsFalsy;
          }
          return true;
        }
        
        if (colType === 'date') {
          return applyDateFilter(cellValue, filterValue);
        }
        
        if (colType === 'number') {
          const parsedFilter = parseNumericFilter(filterValue);
          return applyNumericFilter(cellValue, parsedFilter);
        }
        
        const strCell = toLower(String(cellValue ?? ''));
        const strFilter = toLower(String(filterValue));
        return includes(strCell, strFilter);
      });
      
      if (!regularColumnsPass) return false;
      
      // Percentage column filters
      if (hasPercentageColumns) {
        return every(percentageColumnNames, (col) => {
          const filterObj = get(tableFilters, col);
          if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;
          if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;
          const cellValue = getPercentageColumnValue(row, col, percentageColumns);
          const filterValue = filterObj.value;
          const parsedFilter = parseNumericFilter(filterValue);
          return applyNumericFilter(cellValue, parsedFilter);
        });
      }
      
      return true;
    });
  }

  // Step 4: Apply sorting
  let sortedData = filteredData;
  if (!isEmpty(sortedData) && enableSort) {
    sortedData = [...filteredData];
    
    // Apply tableSortMeta if it exists (overrides sortConfig)
    if (!isEmpty(tableSortMeta)) {
      const fields = tableSortMeta.map(s => {
        const field = s.field;
        if (isPctCol(field)) {
          return (rowData) => getPercentageColumnValue(rowData, field, percentageColumns);
        }
        return field;
      });
      const orders = tableSortMeta.map(s => s.order === 1 ? 'asc' : 'desc');
      sortedData = orderBy(sortedData, fields, orders);
    } else if (sortConfig && sortFieldType) {
      // Apply sortConfig only if tableSortMeta doesn't exist
      const sortComparator = getSortComparator(
        sortConfig,
        sortFieldType.fieldType,
        sortFieldType.topLevelKey,
        sortFieldType.nestedPath
      );
      if (sortComparator) {
        sortedData.sort(sortComparator);
      }
    }
  }

  // Step 5: Apply grouping using recursive grouping function
  let groupedData = sortedData;
  
  // Recursive grouping function for multi-level nesting
  function groupDataRecursive(data, groupFields, currentLevel = 0, currentPath = []) {
    if (!isArray(groupFields) || groupFields.length === 0 || currentLevel >= groupFields.length) {
      return data;
    }
    
    const currentField = groupFields[currentLevel];
    if (!currentField) return data;
    
    const groups = {};
    data.forEach((row) => {
      if (row.__isGroupRow__) return;
      const groupKey = getDataValue(row, currentField);
      const key = isNil(groupKey) ? '__null__' : String(groupKey);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(row);
    });

    // Apply sortConfig to rows within groups if sortConfig exists
    let sortComparator = null;
    if (sortConfig && sortFieldType) {
      sortComparator = getSortComparator(
        sortConfig,
        sortFieldType.fieldType,
        sortFieldType.topLevelKey,
        sortFieldType.nestedPath
      );
    }

    // Sort rows within each group
    Object.keys(groups).forEach((key) => {
      if (sortComparator) {
        groups[key].sort(sortComparator);
      }
    });

    // Aggregate groups
    const aggregatedGroups = Object.keys(groups).map((key) => {
      const rows = groups[key];
      const firstRow = rows[0];
      const groupValue = getDataValue(firstRow, currentField);
      const newPath = [...currentPath, key === '__null__' ? null : key];

      // Create summary row
      const summaryRow = {
        __isGroupRow__: true,
        __groupLevel__: currentLevel,
        __groupField__: currentField,
        [currentField]: groupValue,
        __groupKey__: newPath.join('|'),
        __rowCount__: rows.length,
      };

      // Aggregate numeric columns
      columns.forEach((col) => {
        const colType = columnTypes[col] || 'string';
        if (colType === 'number' || isPctCol(col)) {
          const sum = rows.reduce((acc, row) => {
            const value = isPctCol(col)
              ? getPercentageColumnValue(row, col, percentageColumns)
              : getDataValue(row, col);
            const numValue = toNumber(value);
            return acc + (isFinite(numValue) ? numValue : 0);
          }, 0);
          summaryRow[col] = sum;
        }
      });

      // Recursively group inner levels
      if (currentLevel + 1 < groupFields.length) {
        const innerGrouped = groupDataRecursive(rows, groupFields, currentLevel + 1, newPath);
        summaryRow.__groupRows__ = innerGrouped;
      } else {
        // Final level - store actual rows
        summaryRow.__groupRows__ = rows;
      }

      return summaryRow;
    });

    // Sort groups themselves by sortConfig if it exists
    if (sortComparator) {
      const groupComparator = (a, b) => {
        const aValue = getDataValue(a, currentField);
        const bValue = getDataValue(b, currentField);
        return sortComparator({ [currentField]: aValue }, { [currentField]: bValue });
      };
      aggregatedGroups.sort(groupComparator);
    }

    return aggregatedGroups;
  }
  
  if (effectiveGroupFields.length > 0 && !isEmpty(sortedData)) {
    groupedData = groupDataRecursive(sortedData, effectiveGroupFields);
  }

  return {
    filteredData,
    sortedData,
    groupedData,
  };
}

// Expose API using Comlink
Comlink.expose({
  computeFilterSortGrouped,
});
