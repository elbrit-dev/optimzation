/**
 * Per-slot pipeline utilities - pure functions for computing slot-specific pipeline output.
 * Used by useMultiSlotPipeline when slotIds.length > 1.
 */

import {
  every,
  filter as lodashFilter,
  flatMap,
  get,
  includes,
  isArray,
  isEmpty,
  isNil,
  isNumber,
  orderBy,
  some,
  sumBy,
  take,
  toLower,
  toNumber,
  uniq,
} from 'lodash';
import { getDataKeys, getDataValue, getNestedValue } from './dataAccessUtils';
import { applyRowFilters, applyDateFilter, applyNumericFilter, parseNumericFilter } from './filterUtils';
import {
  isJsonArrayOfObjectsString,
  extractJsonNestedTablesRecursive,
} from './jsonArrayParser';
import { detectColumnTypesLikeProvider, inferColumnType, parseToDate } from './typeDetectionUtils';
import { applyDerivedColumns, getDerivedColumnNames, getOrderedColumnsWithDerived } from './derivedColumnsUtils';

const isNaNNumber = Number.isNaN;

/**
 * Build minimal column meta from data for filter application.
 * @param {Object} options
 * @returns {Object} pipelineColumnMeta
 */
export function buildPipelineColumnMeta(options) {
  const data = options.data;
  const {
    allowedColumns,
    columnTypesOverride,
    percentageColumns,
    derivedColumns,
    textFilterColumns,
    enableFilter,
    fallbackColumns,
  } = options;
  if (!isArray(data) || isEmpty(data)) {
    const cols = (fallbackColumns && isArray(fallbackColumns) && fallbackColumns.length > 0)
      ? fallbackColumns.filter((c) => c && typeof c === 'string' && !String(c).startsWith('__'))
      : [];
    if (cols.length === 0) {
      return {
        columns: [],
        filteredColumns: [],
        columnTypes: {},
        multiselectColumns: [],
        hasPercentageColumns: false,
        percentageColumnNames: [],
        getCellValue: (row, col) => getDataValue(row, col),
      };
    }
    const filteredColumns = getOrderedColumnsWithDerived(cols, derivedColumns || [], options.derivedColumnsMode || 'main', options.derivedColumnsFieldName || null);
    const columnTypes = {};
    filteredColumns.forEach((col) => {
      columnTypes[col] = columnTypesOverride?.[col] || 'string';
    });
    return {
      columns: cols,
      filteredColumns,
      columnTypes: { ...columnTypes, ...columnTypesOverride },
      multiselectColumns: enableFilter ? filteredColumns.filter((c) => (columnTypes[c] || 'string') === 'string' && !(textFilterColumns || []).includes(c)) : [],
      hasPercentageColumns: isArray(percentageColumns) && percentageColumns.length > 0 && percentageColumns.some((pc) => pc?.columnName),
      percentageColumnNames: (percentageColumns || []).map((pc) => pc.columnName).filter(Boolean),
      getCellValue: (row, col) => getDataValue(row, col),
    };
  }

  const columns = uniq(
    flatMap(data, (item) =>
      item && typeof item === 'object'
        ? getDataKeys(item).filter((key) => key !== '__nestedTables__')
        : []
    )
  );

  const arrayFields = new Set();
  take(data, 10).forEach((row) => {
    if (!row || typeof row !== 'object') return;
    for (const [fieldName, value] of Object.entries(row)) {
      if (fieldName.startsWith('__')) continue;
      if (isJsonArrayOfObjectsString(value)) arrayFields.add(fieldName);
    }
  });

  let filteredColumns = columns;
  if (allowedColumns && isArray(allowedColumns) && allowedColumns.length > 0) {
    const allowedSet = new Set(allowedColumns);
    filteredColumns = filteredColumns.filter((col) => allowedSet.has(col));
  }
  if (arrayFields.size > 0) {
    filteredColumns = filteredColumns.filter((col) => !arrayFields.has(col));
  }
  const { derivedColumnsMode = 'main', derivedColumnsFieldName = null } = options;
  filteredColumns = getOrderedColumnsWithDerived(filteredColumns, derivedColumns || [], derivedColumnsMode, derivedColumnsFieldName);
  const derivedColumnNames = getDerivedColumnNames(derivedColumns || [], derivedColumnsMode, derivedColumnsFieldName);

  const sampleData = take(data, 100);
  const detectedTypes = detectColumnTypesLikeProvider(sampleData, filteredColumns, getDataValue);
  const columnTypes = {};
  filteredColumns.forEach((col) => {
    columnTypes[col] = columnTypesOverride[col] || detectedTypes[col] || 'string';
  });
  const mergedTypes = { ...columnTypes, ...columnTypesOverride };
  derivedColumnNames.forEach((col) => {
    const dc = (derivedColumns || []).find((d) => d.columnName === col);
    if (dc?.columnType) mergedTypes[col] = dc.columnType;
  });

  const hasPercentageColumns =
    isArray(percentageColumns) &&
    percentageColumns.length > 0 &&
    percentageColumns.some((pc) => pc.columnName && pc.columnName.trim() !== '');
  const percentageColumnNames = hasPercentageColumns
    ? percentageColumns.map((pc) => pc.columnName).filter(Boolean)
    : [];

  const getPercentageColumnValue = (rowData, columnName) => {
    const config = percentageColumns.find((pc) => pc.columnName === columnName);
    if (!config || !config.targetField || !config.valueField) return null;
    const targetValue = getDataValue(rowData, config.targetField);
    const actualValue = getDataValue(rowData, config.valueField);
    const targetNum = isNumber(targetValue) ? targetValue : isNil(targetValue) ? null : toNumber(targetValue);
    const actualNum = isNumber(actualValue) ? actualValue : isNil(actualValue) ? null : toNumber(actualValue);
    if (!isNil(targetNum) && !isNil(actualNum) && !isNaNNumber(targetNum) && !isNaNNumber(actualNum) && targetNum !== 0) {
      return (actualNum / targetNum) * 100;
    }
    return null;
  };

  const getCellValue = (row, col) =>
    includes(percentageColumnNames, col) ? getPercentageColumnValue(row, col) : getDataValue(row, col);

  let multiselectColumns = [];
  if (enableFilter) {
    const stringColumns = filteredColumns.filter((col) => (mergedTypes[col] || 'string') === 'string');
    const textFilterSet = new Set(textFilterColumns || []);
    multiselectColumns = stringColumns.filter((col) => !textFilterSet.has(col));
  }

  return {
    columns,
    filteredColumns,
    columnTypes: mergedTypes,
    multiselectColumns,
    hasPercentageColumns,
    percentageColumnNames,
    getCellValue,
  };
}

function getSortComparatorForQuery(config, fieldType, topLevelKey, nestedPath) {
  if (!config) return null;
  const { direction } = config;
  return (a, b) => {
    const aVal = getNestedValue(a, topLevelKey, nestedPath);
    const bVal = getNestedValue(b, topLevelKey, nestedPath);
    let comparison = 0;
    switch (fieldType) {
      case 'number':
        comparison = (toNumber(aVal) || 0) - (toNumber(bVal) || 0);
        break;
      case 'date': {
        const aDate = parseToDate(aVal);
        const bDate = parseToDate(bVal);
        comparison = (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
        break;
      }
      case 'boolean':
        comparison = (aVal ? 1 : 0) - (bVal ? 1 : 0);
        break;
      default:
        comparison = String(aVal || '').localeCompare(String(bVal || ''));
    }
    return direction === 'asc' ? comparison : -comparison;
  };
}

/**
 * Flatten grouped data to leaf data rows. When data contains __isGroupRow__ rows (e.g. from
 * another slot's pipeline output or shared ref), groupDataRecursive skips them, producing empty
 * groups. Extract leaf rows from __groupRows__ so grouping works for this slot.
 */
function flattenToLeafRows(data) {
  if (!isArray(data) || isEmpty(data)) return data;
  const first = data[0];
  if (!first?.__isGroupRow__ || !isArray(first?.__groupRows__)) return data;
  return flatMap(data, (row) =>
    row?.__isGroupRow__ && isArray(row.__groupRows__) ? flattenToLeafRows(row.__groupRows__) : [row]
  ).filter((r) => r && !r.__isGroupRow__);
}

/**
 * Recursively group data by fields. Pure function.
 */
function groupDataRecursive(data, fields, currentLevel, parentPath, options) {
  const {
    pipelineColumnMeta,
    sortFieldType,
    sortConfig,
    percentageColumns,
    derivedColumnNamesSet,
  } = options;
  if (currentLevel >= fields.length || isEmpty(data)) return data;
  const currentField = fields[currentLevel];
  const groups = {};
  data.forEach((row) => {
      if (row.__isGroupRow__) return;
      const groupKey = getDataValue(row, currentField);
      const key = isNil(groupKey) ? '__null__' : String(groupKey);
      if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });

  let sortComparator = null;
  if (sortFieldType && sortConfig) {
    sortComparator = getSortComparatorForQuery(
      sortConfig,
      sortFieldType.fieldType,
      sortFieldType.topLevelKey,
      sortFieldType.nestedPath
    );
  }
  if (sortComparator) {
    Object.keys(groups).forEach((key) => {
      groups[key].sort(sortComparator);
    });
  }

  const { filteredColumns: cols, columnTypes: colTypes, getCellValue: getCell } = pipelineColumnMeta;

  return Object.entries(groups).map(([groupKey, rows]) => {
    const currentPath = [...parentPath, groupKey === '__null__' ? null : groupKey];
    const nextLevelData = groupDataRecursive(rows, fields, currentLevel + 1, currentPath, options);
    const hasNextLevel = currentLevel + 1 < fields.length;
    const innerData = hasNextLevel ? nextLevelData : rows;
    const summaryRow = {};
    const firstItem = isArray(innerData) && innerData.length > 0 ? innerData[0] : null;
    if (!firstItem) return null;

    cols.forEach((col) => {
      const colType = colTypes[col] || 'string';
      const isDerivedCol = derivedColumnNamesSet.has(col);
      if (col === currentField) {
        summaryRow[col] = groupKey === '__null__' ? null : groupKey;
      } else if (currentLevel < fields.length - 1 && fields.slice(currentLevel + 1).includes(col)) {
        summaryRow[col] = null;
      } else if (!isDerivedCol && colType === 'number') {
        const sum = sumBy(innerData, (row) => {
            const val = getCell(row, col);
            if (isNil(val)) return 0;
            const numVal = isNumber(val) ? val : toNumber(val);
          return isNaNNumber(numVal) ? 0 : numVal;
        });
        summaryRow[col] = sum;
      } else {
        const canSum = !isDerivedCol && (() => {
            if (!isArray(innerData) || innerData.length === 0) return false;
            let numeric = 0;
            let meaningful = 0;
            for (const row of innerData) {
              const val = getCell(row, col);
              if (val == null || val === '') continue;
              meaningful++;
              const n = isNumber(val) ? val : toNumber(val);
              if (!isNaNNumber(n) && Number.isFinite(n)) numeric++;
            }
          return meaningful > 0 && numeric / meaningful >= 0.8;
        })();
        if (canSum) {
          summaryRow[col] = sumBy(innerData, (row) => {
              const val = getCell(row, col);
              if (isNil(val)) return 0;
              const numVal = isNumber(val) ? val : toNumber(val);
            return isNaNNumber(numVal) ? 0 : numVal;
          });
        } else {
          const firstNonNull = isArray(innerData) ? innerData.find((row) => !isNil(getCell(row, col))) : null;
          summaryRow[col] = firstNonNull ? getCell(firstNonNull, col) : getCell(firstItem, col);
        }
    }
    });

    if (pipelineColumnMeta.hasPercentageColumns && percentageColumns.length) {
      percentageColumns.forEach((pc) => {
          if (pc.columnName && pc.targetField && pc.valueField) {
            const sumTarget = sumBy(rows, (row) => {
              const val = getDataValue(row, pc.targetField);
              if (isNil(val)) return 0;
              const numVal = isNumber(val) ? val : toNumber(val);
              return isNaNNumber(numVal) ? 0 : numVal;
            });
            const sumValue = sumBy(rows, (row) => {
              const val = getDataValue(row, pc.valueField);
              if (isNil(val)) return 0;
              const numVal = isNumber(val) ? val : toNumber(val);
              return isNaNNumber(numVal) ? 0 : numVal;
            });
          summaryRow[pc.columnName] = sumTarget !== 0 ? (sumValue / sumTarget) * 100 : null;
        }
      });
    }

    summaryRow.__groupKey__ = groupKey === '__null__' ? null : groupKey;
    summaryRow.__groupRows__ = innerData;
    summaryRow.__groupLevel__ = currentLevel;
    summaryRow.__groupField__ = currentField;
    summaryRow.__isGroupRow__ = true;
    summaryRow.__groupPath__ = currentPath;
    if (firstItem && firstItem.__nestedTables__) {
      summaryRow.__nestedTables__ = firstItem.__nestedTables__;
    }
    return summaryRow;
  }).filter(Boolean);
}

/**
 * Compute searchSortSortedData from tableData (query-level search + sort).
 * Used by useMultiSlotPipeline for per-slot tableData -> searchSortSortedData.
 */
export function computeSearchSortSortedData(tableData, sharedOptions) {
  const { currentQueryDoc = null, searchTerm = '', sortConfig = null, columnTypesOverride = {} } = sharedOptions;
  if (!isArray(tableData) || isEmpty(tableData)) return tableData;

  let searched = tableData;
  if (currentQueryDoc?.clientSave && currentQueryDoc?.searchFields && searchTerm?.trim()) {
    const searchFieldsObj = currentQueryDoc.searchFields;
    const searchLower = searchTerm.toLowerCase().trim();
    searched = tableData.filter((row) =>
      Object.keys(searchFieldsObj).some((topLevelKey) => {
        const nestedPaths = searchFieldsObj[topLevelKey];
        if (!isArray(nestedPaths) || nestedPaths.length === 0) return false;
        return nestedPaths.some((nestedPath) => {
          const value = getNestedValue(row, topLevelKey, nestedPath);
          if (value == null) return false;
          return String(value).toLowerCase().includes(searchLower);
        });
      })
    );
  }

  if (
    !currentQueryDoc?.clientSave ||
    !currentQueryDoc?.sortFields ||
    !sortConfig ||
    !isArray(searched) ||
    isEmpty(searched)
  ) {
    return searched;
  }
  const { field, direction } = sortConfig;
  const [topLevelKey, ...nestedParts] = field.split('.');
  const nestedPath = nestedParts.join('.');
  const sortFieldsObj = currentQueryDoc.sortFields;
  if (!sortFieldsObj[topLevelKey] || !sortFieldsObj[topLevelKey].includes(nestedPath)) {
    return searched;
  }
  const fieldType = columnTypesOverride[field] || inferColumnType(searched, field, topLevelKey, nestedPath);
  const sorted = [...searched].sort((a, b) => {
    const aVal = getNestedValue(a, topLevelKey, nestedPath);
    const bVal = getNestedValue(b, topLevelKey, nestedPath);
    let comparison = 0;
    switch (fieldType) {
      case 'number':
        comparison = (toNumber(aVal) || 0) - (toNumber(bVal) || 0);
        break;
      case 'date': {
        const aDate = parseToDate(aVal);
        const bDate = parseToDate(bVal);
        comparison = (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
        break;
      }
      case 'boolean':
        comparison = (aVal ? 1 : 0) - (bVal ? 1 : 0);
        break;
      default:
        comparison = String(aVal || '').localeCompare(String(bVal || ''));
    }
    return direction === 'asc' ? comparison : -comparison;
  });
  return sorted;
}

/**
 * Compute filter options (unique values per column) for multiselect dropdowns.
 * Uses baseData and tableFilters - for each column, returns unique values from rows passing other columns' filters.
 */
function computeOptionColumnValues(baseData, tableFilters, pipelineColumnMeta, enableFilter) {
  if (!enableFilter || !isArray(baseData) || isEmpty(baseData)) return {};
  const { filteredColumns, columnTypes, multiselectColumns, getCellValue } = pipelineColumnMeta;
  const filters = tableFilters || {};
  const values = {};
  filteredColumns.forEach((col) => {
    const filteredForColumn = lodashFilter(baseData, (row) => {
      if (!row || typeof row !== 'object') return false;
      return every(filteredColumns, (otherCol) => {
        if (otherCol === col) return true;
        const filterObj = get(filters, otherCol);
        if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;
        if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;
        const cellValue = getCellValue(row, otherCol);
        const filterValue = filterObj.value;
        const colType = columnTypes[otherCol] || 'string';
        const isMultiselectColumn = includes(multiselectColumns, otherCol);
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
          if (filterValue === true) return cellIsTruthy;
          if (filterValue === false) return cellIsFalsy;
          return true;
        }
        if (colType === 'date') return applyDateFilter(cellValue, filterValue);
        if (colType === 'number') {
          const parsedFilter = parseNumericFilter(filterValue);
          return applyNumericFilter(cellValue, parsedFilter);
        }
        const strCell = toLower(String(cellValue ?? ''));
        const strFilter = toLower(String(filterValue ?? ''));
        return includes(strCell, strFilter);
      });
    });
    const uniqueVals = uniq(filteredForColumn.map((row) => getCellValue(row, col)));
    const hasNull = some(uniqueVals, (val) => isNil(val));
    const nonNullVals = lodashFilter(uniqueVals, (val) => !isNil(val));
    const sortedNonNull = orderBy(nonNullVals);
    const options = [];
    if (hasNull) options.push({ label: '(null)', value: null });
    options.push(...sortedNonNull.map((val) => ({ label: String(val), value: val })));
    values[col] = options;
  });
  return values;
}

/**
 * Compute per-slot pipeline output (filteredData -> groupedData -> sortedData -> paginatedData).
 * @param {Array} baseData - searchSortSortedData for this slot (after derivedColumns + query search/sort)
 * @param {Object} slotConfig - slots[slotId] config (groupFields, derivedColumns, percentageColumns, etc.)
 * @param {Object} slotState - { tableFilters, tableSortMeta, tablePagination } for this slot
 * @param {Object} sharedOptions - columnTypesOverride, allowedColumns, currentQueryDoc, sortConfig, fallbackColumns, derivedColumnsMode, derivedColumnsFieldName
 * @returns {Object} { filteredData, groupedData, sortedData, paginatedData, pipelineColumnMeta, effectiveGroupFields, optionColumnValues, ... }
 */
export function computeSlotPipeline(baseData, slotConfig, slotState, sharedOptions) {
  const {
    columnTypesOverride = {},
    allowedColumns = [],
    currentQueryDoc = null,
    sortConfig = null,
    fallbackColumns = null,
    derivedColumnsMode = 'main',
    derivedColumnsFieldName = null,
  } = sharedOptions;

  const {
    tableFilters = {},
    tableSortMeta = [],
    tablePagination = { first: 0, rows: 10 },
  } = slotState || {};

  const {
    groupFields = null,
    derivedColumns = [],
    percentageColumns = [],
    textFilterColumns = [],
    enableFilter = true,
    enableSort = true,
  } = slotConfig || {};

  const effectiveGroupFields = isArray(groupFields) ? groupFields : [];
  const dataSource = baseData != null ? baseData : [];
  const isEmptyData = !isArray(dataSource) || isEmpty(dataSource);

  const pipelineColumnMeta = buildPipelineColumnMeta({
    data: dataSource,
    allowedColumns,
    columnTypesOverride,
    percentageColumns,
    derivedColumns,
    textFilterColumns,
    enableFilter,
    derivedColumnsMode,
    derivedColumnsFieldName,
    fallbackColumns,
  });

  let filteredData = isEmptyData ? [] : dataSource;
  if (!isEmptyData && enableFilter) {
    const columnMeta = { ...pipelineColumnMeta, columns: pipelineColumnMeta.filteredColumns };
    filteredData = lodashFilter(dataSource, (row) =>
      applyRowFilters(row, { filters: tableFilters, columnMeta })
    );
  }

  const jsonArrayFields = new Set();
  if (!isEmptyData && isArray(dataSource)) {
    take(dataSource, 100).forEach((row) => {
      if (!row || typeof row !== 'object') return;
      for (const [fieldName, value] of Object.entries(row)) {
        if (fieldName.startsWith('__')) continue;
        if (isJsonArrayOfObjectsString(value)) jsonArrayFields.add(fieldName);
      }
    });
  }

  const extractJsonNestedTablesFromData = (data, maxDepth = 10) => {
    if (!isArray(data) || isEmpty(data)) return data;
    return extractJsonNestedTablesRecursive(data, 0, maxDepth, { derivedColumns, getDataValue });
  };

  let dataWithJsonTables = filteredData;
  if (jsonArrayFields.size > 0 && !isEmpty(filteredData)) {
    dataWithJsonTables = extractJsonNestedTablesFromData(filteredData);
  }

  const derivedColumnNamesSet = new Set(getDerivedColumnNames(derivedColumns || [], derivedColumnsMode, derivedColumnsFieldName));

  let sortFieldType = null;
  if (sortConfig && currentQueryDoc?.clientSave && currentQueryDoc?.sortFields) {
    const { field } = sortConfig;
    const [topLevelKey, ...nestedParts] = field.split('.');
    const nestedPath = nestedParts.join('.');
    const sortFieldsObj = currentQueryDoc.sortFields;
    if (sortFieldsObj[topLevelKey]?.includes(nestedPath)) {
      sortFieldType = {
        field,
        topLevelKey,
        nestedPath,
        fieldType: columnTypesOverride[field] || pipelineColumnMeta.columnTypes[nestedPath] || pipelineColumnMeta.columnTypes[field] || 'string',
      };
    }
  }

  let groupedData;
  if (effectiveGroupFields.length > 0 && !isEmpty(dataWithJsonTables)) {
    const firstRow = dataWithJsonTables[0];
    const getDepth = (rows) => {
      if (!isArray(rows) || rows.length === 0) return 0;
      const r = rows[0];
      if (!r?.__groupRows__) return 0;
      const child = r.__groupRows__[0];
      if (!child) return 1;
      return child.__isGroupRow__ ? 1 + getDepth(r.__groupRows__) : 1;
    };
    const existingDepth = getDepth(dataWithJsonTables);
    const alreadyGroupedWithSameDepth = firstRow?.__isGroupRow__ && existingDepth === effectiveGroupFields.length;
    const dataToGroup = alreadyGroupedWithSameDepth ? dataWithJsonTables : flattenToLeafRows(dataWithJsonTables);
    const groupOptions = {
      pipelineColumnMeta,
      sortFieldType,
      sortConfig,
      percentageColumns: percentageColumns || [],
      derivedColumnNamesSet,
    };
    let result = alreadyGroupedWithSameDepth
      ? dataWithJsonTables
      : groupDataRecursive(dataToGroup, effectiveGroupFields, 0, [], groupOptions);
    if (sortFieldType && sortConfig) {
      const sortComparator = getSortComparatorForQuery(
        sortConfig,
        sortFieldType.fieldType,
        sortFieldType.topLevelKey,
        sortFieldType.nestedPath
      );
      if (sortComparator && result.length > 0) {
        result = [...result].sort(sortComparator);
      }
    }
    groupedData = applyDerivedColumns(result, derivedColumns, {
      mode: derivedColumnsMode,
      fieldName: derivedColumnsFieldName,
      getDataValue,
    });
  } else {
    groupedData = isEmpty(dataWithJsonTables) || !isArray(dataWithJsonTables)
      ? (dataWithJsonTables || [])
      : (dataWithJsonTables || [])
          .filter((row) => !row?.__isGroupRow__)
          .map((row) => (row instanceof Map ? Object.fromEntries(row) : row));
  }

  const filteredDataWithNestedTables = effectiveGroupFields.length > 0
    ? filteredData
    : jsonArrayFields.size > 0 && !isEmpty(filteredData)
      ? extractJsonNestedTablesFromData(filteredData)
      : filteredData;

  const dataForSorting = effectiveGroupFields.length > 0 ? groupedData : filteredDataWithNestedTables;
  const dataForSortingArr = isArray(dataForSorting) ? dataForSorting : [];

  const isPercentageColumn = (columnName) =>
    pipelineColumnMeta.hasPercentageColumns && (percentageColumns || []).some((pc) => pc.columnName === columnName);

  let sortedData = dataForSortingArr;
  if (!isEmpty(dataForSortingArr) && !isEmpty(tableSortMeta) && enableSort) {
    const fields = tableSortMeta.map((s) => {
      const field = s.field;
      if (isPercentageColumn(field)) {
        return (rowData) => pipelineColumnMeta.getCellValue(rowData, field);
      }
      return field;
    });
    const orders = tableSortMeta.map((s) => (s.order === 1 ? 'asc' : 'desc'));
    sortedData = orderBy(dataForSortingArr, fields, orders);
  } else if (sortFieldType && sortConfig && !isEmpty(dataForSortingArr)) {
    const sortComparator = getSortComparatorForQuery(
      sortConfig,
      sortFieldType.fieldType,
      sortFieldType.topLevelKey,
      sortFieldType.nestedPath
    );
    if (sortComparator) {
      sortedData = [...dataForSortingArr].sort(sortComparator);
    }
  }

  const paginatedData = !isArray(sortedData) || isEmpty(sortedData)
    ? []
    : sortedData.slice(tablePagination.first, tablePagination.first + (tablePagination.rows || 10));

  const optionColumnValues = computeOptionColumnValues(
    dataSource,
    tableFilters,
    pipelineColumnMeta,
    enableFilter
  );

  return {
    filteredData,
    groupedData,
    sortedData,
    paginatedData,
    pipelineColumnMeta,
    effectiveGroupFields,
    filteredDataWithNestedTables,
    optionColumnValues,
  };
}
