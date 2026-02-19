'use client';

import {
  filter as lodashFilter,
  flatMap,
  includes,
  isArray,
  isEmpty,
  isNil,
  isNumber,
  orderBy,
  sumBy,
  take,
  toNumber,
  uniq,
} from 'lodash';
import { useCallback, useMemo, useRef, useState } from 'react';
import { getDataKeys, getDataValue, getNestedValue } from '../utils/dataAccessUtils';
import { applyRowFilters } from '../utils/filterUtils';
import {
  isJsonArrayOfObjectsString,
  extractJsonNestedTablesRecursive,
} from '../utils/jsonArrayParser';
import { detectColumnTypesLikeProvider, inferColumnType, parseToDate } from '../utils/typeDetectionUtils';
import { applyDerivedColumns, getDerivedColumnNames, getOrderedColumnsWithDerived } from '../utils/derivedColumnsUtils';
import { buildPipelineColumnMeta } from '../utils/perSlotPipelineUtils';

const isNaNNumber = Number.isNaN;

/**
 * Data pipeline: raw → auth → preFilter → tableData → search → sort → filter → group → sort → paginate.
 * Uses shared filter util; does minimal column inference for filter/group/sort so it does not depend on useColumnDerivation.
 *
 * @param {Object} options
 * @param {string|null} [options.dataSource] - Query id or null for offline
 * @param {*} [options.processedData] - Processed query result
 * @param {string|null} [options.selectedQueryKey] - Key path in processedData
 * @param {Array} [options.offlineData] - Offline data when dataSource is null
 * @param {boolean} [options.offlineDataExecuted] - Whether offline data has been "executed"
 * @param {boolean} [options.isAdminMode]
 * @param {string|null} [options.salesTeamColumn]
 * @param {Array} [options.salesTeamValues]
 * @param {string|null} [options.hqColumn]
 * @param {Array} [options.hqValues]
 * @param {Object} [options.preFilterValues]
 * @param {Object|null} [options.currentQueryDoc]
 * @param {string} [options.searchTerm]
 * @param {Object|null} [options.sortConfig]
 * @param {Object} [options.columnTypesOverride]
 * @param {Object} [options.tableFilters]
 * @param {Array} [options.groupFields]
 * @param {Object} [options.tablePagination]
 * @param {Array} [options.tableSortMeta]
 * @param {boolean} [options.enableFilter]
 * @param {boolean} [options.enableSort]
 * @param {boolean} [options.enableBreakdown]
 * @param {Object|null} [options.reportData]
 * @param {Array} [options.allowedColumns]
 * @param {Array} [options.percentageColumns]
 * @param {Array} [options.textFilterColumns]
 * @param {string|null} [options.dateColumn]
 * @param {string} [options.derivedColumnsMode] - 'main' | 'report' | 'nested' - defaults to 'main'
 * @param {string|null} [options.derivedColumnsFieldName] - For mode 'nested', the nested table's field name
 */
export function useDataPipeline(options) {
  const {
    dataSource = null,
    processedData = null,
    selectedQueryKey = null,
    offlineData = [],
    offlineDataExecuted = false,
    isAdminMode = false,
    salesTeamColumn = null,
    salesTeamValues = [],
    hqColumn = null,
    hqValues = [],
    preFilterValues = {},
    currentQueryDoc = null,
    searchTerm = '',
    sortConfig = null,
    columnTypesOverride = {},
    tableFilters = {},
    groupFields = null,
    tablePagination = { first: 0, rows: 10 },
    tableSortMeta = [],
    enableFilter = true,
    enableSort = true,
    enableBreakdown = false,
    reportData = null,
    allowedColumns = [],
    percentageColumns = [],
    derivedColumns = [],
    textFilterColumns = [],
    dateColumn = null,
    derivedColumnsMode = 'main',
    derivedColumnsFieldName = null,
    fallbackColumns = null,
    useOfflineDataAsTableDataSource = false, // When true (nested drawer table), use preFilteredData/offlineData as source of truth so + add row reflects immediately
  } = options;

  const rawTableData = useMemo(() => {
    if (!dataSource && offlineDataExecuted) {
      return offlineData || [];
    }
    if (dataSource && processedData && selectedQueryKey) {
      let value;
      if (selectedQueryKey.includes('.')) {
        value = selectedQueryKey.split('.').reduce((o, k) => (o != null ? o[k] : undefined), processedData);
      } else {
        value = getDataValue(processedData, selectedQueryKey);
      }
      return value ?? [];
    }
    return null;
  }, [dataSource, processedData, selectedQueryKey, offlineData, offlineDataExecuted]);

  const mainTableEditingDataRefEarly = useRef([]);
  const [tableDataUpdateTrigger, setTableDataUpdateTrigger] = useState(0);

  const generateEditingKey = useCallback((index) => {
    return `__editingKey__${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${index}`;
  }, []);

  const addEditingKeysToRows = useCallback(
    (data) => {
      if (!isArray(data)) return data;
      return data.map((row, index) => {
        if (!row || typeof row !== 'object') return row;
        if (!row.__editingKey__) {
          return { ...row, __editingKey__: generateEditingKey(index) };
        }
        return row;
      });
    },
    [generateEditingKey]
  );

  const preFilterSets = useMemo(() => {
    const sets = {};
    Object.keys(preFilterValues).forEach((fieldKey) => {
      const values = preFilterValues[fieldKey];
      if (isArray(values) && values.length > 0) {
        sets[fieldKey] = new Set(values.map((v) => String(v)));
      }
    });
    return sets;
  }, [preFilterValues]);

  const authFilteredData = useMemo(() => {
    if (!rawTableData || !isArray(rawTableData) || isEmpty(rawTableData)) {
      return rawTableData;
    }
    if (isAdminMode) return rawTableData;
    let filtered = [...rawTableData];
    if (salesTeamColumn && salesTeamValues && salesTeamValues.length > 0) {
      filtered = filtered.filter((row) => {
        if (!row || typeof row !== 'object') return false;
        const rowValue = getDataValue(row, salesTeamColumn);
        if (isNil(rowValue)) {
          return salesTeamValues.some(
            (val) => val === null || val === undefined || val === ''
          );
        }
        return salesTeamValues.some((val) => String(val) === String(rowValue));
      });
    }
    if (
      salesTeamValues &&
      salesTeamValues.length === 1 &&
      hqColumn &&
      hqValues &&
      hqValues.length > 0
    ) {
      filtered = filtered.filter((row) => {
        if (!row || typeof row !== 'object') return false;
        const rowValue = getDataValue(row, hqColumn);
        if (isNil(rowValue)) {
          return hqValues.some(
            (val) => val === null || val === undefined || val === ''
          );
        }
        return hqValues.some((val) => String(val) === String(rowValue));
      });
    }
    return filtered;
  }, [
    rawTableData,
    isAdminMode,
    salesTeamColumn,
    salesTeamValues,
    hqColumn,
    hqValues,
  ]);

  const preFilteredData = useMemo(() => {
    if (
      !authFilteredData ||
      !isArray(authFilteredData) ||
      isEmpty(authFilteredData)
    ) {
      return authFilteredData;
    }
    if (isEmpty(preFilterValues) || Object.keys(preFilterSets).length === 0) {
      return authFilteredData;
    }
    const filterKeys = Object.keys(preFilterSets);
    if (filterKeys.length === 0) return authFilteredData;
    return lodashFilter(authFilteredData, (row) => {
      if (!row || typeof row !== 'object') return false;
      for (let i = 0; i < filterKeys.length; i++) {
        const fieldKey = filterKeys[i];
        const filterSet = preFilterSets[fieldKey];
        if (!filterSet || filterSet.size === 0) continue;
        const cellValue = getDataValue(row, fieldKey);
        const cellStr = isNil(cellValue) ? null : String(cellValue);
        if (cellStr === null) {
          if (
            !filterSet.has('null') &&
            !filterSet.has('') &&
            !filterSet.has('undefined')
          ) {
            return false;
          }
          continue;
        }
        if (!filterSet.has(cellStr)) return false;
      }
      return true;
    });
  }, [authFilteredData, preFilterSets, preFilterValues]);

  const tableData = useMemo(() => {
    const editingData = mainTableEditingDataRefEarly.current;
    let base;
    if (useOfflineDataAsTableDataSource) {
      base =
        preFilteredData &&
        isArray(preFilteredData) &&
        !isEmpty(preFilteredData)
          ? addEditingKeysToRows(preFilteredData)
          : preFilteredData;
    } else if (editingData && isArray(editingData) && !isEmpty(editingData)) {
      base = editingData;
    } else {
      base =
        preFilteredData &&
        isArray(preFilteredData) &&
        !isEmpty(preFilteredData)
          ? addEditingKeysToRows(preFilteredData)
          : preFilteredData;
    }
    if (!base || !isArray(base) || isEmpty(base)) return base;
    return applyDerivedColumns(base, derivedColumns, {
      mode: derivedColumnsMode,
      fieldName: derivedColumnsFieldName,
      getDataValue,
    });
  }, [preFilteredData, tableDataUpdateTrigger, addEditingKeysToRows, derivedColumns, derivedColumnsMode, derivedColumnsFieldName, useOfflineDataAsTableDataSource]);

  const searchedData = useMemo(() => {
    if (!tableData || !isArray(tableData) || isEmpty(tableData)) {
      return tableData;
    }
    const queryDoc = currentQueryDoc;
    if (
      !queryDoc ||
      queryDoc.clientSave !== true ||
      !queryDoc.searchFields ||
      !searchTerm ||
      !searchTerm.trim()
    ) {
      return tableData;
    }
    const searchFieldsObj = queryDoc.searchFields;
    const searchLower = searchTerm.toLowerCase().trim();
    const filtered = tableData.filter((row) =>
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
    return filtered;
  }, [tableData, currentQueryDoc, searchTerm]);

  const sortValueCache = useMemo(() => {
    if (
      !searchedData ||
      !isArray(searchedData) ||
      isEmpty(searchedData) ||
      !currentQueryDoc ||
      currentQueryDoc.clientSave !== true ||
      !currentQueryDoc.sortFields ||
      !sortConfig
    ) {
      return null;
    }
    const sortFieldsObj = currentQueryDoc.sortFields;
    const { field } = sortConfig;
    const [topLevelKey, ...nestedParts] = field.split('.');
    const nestedPath = nestedParts.join('.');
    if (
      !sortFieldsObj[topLevelKey] ||
      !sortFieldsObj[topLevelKey].includes(nestedPath)
    ) {
      return null;
    }
    const fieldType =
      columnTypesOverride[field] ||
      inferColumnType(searchedData, field, topLevelKey, nestedPath);
    return searchedData.map((row, rowIndex) => ({
      rowIndex,
      sortValue: getNestedValue(row, topLevelKey, nestedPath),
      originalRow: row,
      fieldType,
    }));
  }, [
    searchedData,
    currentQueryDoc?.sortFields,
    currentQueryDoc?.clientSave,
    sortConfig,
    columnTypesOverride,
  ]);

  const getSortComparator = useCallback(
    (config, fieldType, topLevelKey, nestedPath) => {
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
    },
    []
  );

  const searchSortSortedData = useMemo(() => {
    if (
      !searchedData ||
      !isArray(searchedData) ||
      isEmpty(searchedData)
    ) {
      return searchedData;
    }
    const queryDoc = currentQueryDoc;
    if (
      !queryDoc ||
      queryDoc.clientSave !== true ||
      !queryDoc.sortFields ||
      !sortConfig
    ) {
      return searchedData;
    }
    const { field, direction } = sortConfig;
    const [topLevelKey, ...nestedParts] = field.split('.');
    const nestedPath = nestedParts.join('.');
    const sortFieldsObj = queryDoc.sortFields;
    if (
      !sortFieldsObj[topLevelKey] ||
      !sortFieldsObj[topLevelKey].includes(nestedPath)
    ) {
      return searchedData;
    }
    if (sortValueCache && sortValueCache.length > 0) {
      const fieldType = sortValueCache[0].fieldType;
      let compareFn;
      switch (fieldType) {
        case 'number':
          compareFn = (a, b) =>
            (toNumber(a.sortValue) || 0) - (toNumber(b.sortValue) || 0);
          break;
        case 'date':
          compareFn = (a, b) =>
            (parseToDate(a.sortValue)?.getTime() || 0) -
            (parseToDate(b.sortValue)?.getTime() || 0);
          break;
        case 'boolean':
          compareFn = (a, b) =>
            (a.sortValue ? 1 : 0) - (b.sortValue ? 1 : 0);
          break;
        default:
          compareFn = (a, b) =>
            String(a.sortValue || '').localeCompare(String(b.sortValue || ''));
      }
      const sortedCache = [...sortValueCache].sort((a, b) => {
        const comparison = compareFn(a, b);
        return direction === 'asc' ? comparison : -comparison;
      });
      return sortedCache.map((item) => item.originalRow);
    }
    const fieldType =
      columnTypesOverride[field] ||
      inferColumnType(searchedData, field, topLevelKey, nestedPath);
    const sorted = [...searchedData].sort((a, b) => {
      const aValue = getNestedValue(a, topLevelKey, nestedPath);
      const bValue = getNestedValue(b, topLevelKey, nestedPath);
      let comparison = 0;
      switch (fieldType) {
        case 'number':
          comparison = (toNumber(aValue) || 0) - (toNumber(bValue) || 0);
          break;
        case 'date': {
          const aDate = parseToDate(aValue);
          const bDate = parseToDate(bValue);
          comparison = (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
          break;
        }
        case 'boolean':
          comparison = (aValue ? 1 : 0) - (bValue ? 1 : 0);
          break;
        default:
          comparison = String(aValue || '').localeCompare(String(bValue || ''));
      }
      return direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [
    searchedData,
    currentQueryDoc,
    sortConfig,
    columnTypesOverride,
    sortValueCache,
  ]);

  const pipelineColumnMeta = useMemo(
    () =>
      buildPipelineColumnMeta({
        data: searchSortSortedData,
        allowedColumns,
        columnTypesOverride,
        percentageColumns,
        derivedColumns,
        textFilterColumns,
        enableFilter,
        derivedColumnsMode,
        derivedColumnsFieldName,
        fallbackColumns,
      }),
    [
      searchSortSortedData,
      allowedColumns,
      columnTypesOverride,
      percentageColumns,
      derivedColumns,
      textFilterColumns,
      enableFilter,
      derivedColumnsMode,
      derivedColumnsFieldName,
      fallbackColumns,
    ]
  );

  const filteredData = useMemo(() => {
    const dataSource =
      searchSortSortedData != null ? searchSortSortedData : tableData;
    if (isEmpty(dataSource)) return [];
    if (!enableFilter) return dataSource;
    const columnMeta = {
      ...pipelineColumnMeta,
      columns: pipelineColumnMeta.filteredColumns,
    };
    return lodashFilter(dataSource, (row) =>
      applyRowFilters(row, { filters: tableFilters, columnMeta })
    );
  }, [
    searchSortSortedData,
    tableData,
    tableFilters,
    enableFilter,
    pipelineColumnMeta,
  ]);

  const effectiveGroupFields = useMemo(
    () => (isArray(groupFields) ? groupFields : []),
    [groupFields]
  );

  const derivedColumnNamesSet = useMemo(
    () => new Set(getDerivedColumnNames(derivedColumns || [], derivedColumnsMode, derivedColumnsFieldName)),
    [derivedColumns, derivedColumnsMode, derivedColumnsFieldName]
  );

  const jsonArrayFields = useMemo(() => {
    if (!isArray(searchSortSortedData) || isEmpty(searchSortSortedData)) {
      return new Set();
    }
    const sampleData = take(searchSortSortedData, 100);
    const jsonFields = new Set();
    sampleData.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      for (const [fieldName, value] of Object.entries(row)) {
        if (fieldName.startsWith('__')) continue;
        if (isJsonArrayOfObjectsString(value)) jsonFields.add(fieldName);
      }
    });
    return jsonFields;
  }, [searchSortSortedData]);

  const extractJsonNestedTablesFromData = useCallback((data, maxDepth = 10) => {
    if (!isArray(data) || isEmpty(data)) return data;
    return extractJsonNestedTablesRecursive(data, 0, maxDepth, {
      derivedColumns,
      getDataValue,
    });
  }, [derivedColumns]);

  const sortFieldType = useMemo(() => {
    if (
      !sortConfig ||
      !currentQueryDoc?.clientSave ||
      !currentQueryDoc?.sortFields
    ) {
      return null;
    }
    const { field } = sortConfig;
    const [topLevelKey, ...nestedParts] = field.split('.');
    const nestedPath = nestedParts.join('.');
    const sortFieldsObj = currentQueryDoc.sortFields;
    if (
      !sortFieldsObj[topLevelKey] ||
      !sortFieldsObj[topLevelKey].includes(nestedPath)
    ) {
      return null;
    }
    if (columnTypesOverride[field]) {
      return {
        field,
        topLevelKey,
        nestedPath,
        fieldType: columnTypesOverride[field],
      };
    }
    const fromPipeline =
      pipelineColumnMeta.columnTypes[nestedPath] ||
      pipelineColumnMeta.columnTypes[field];
    if (fromPipeline) {
      return { field, topLevelKey, nestedPath, fieldType: fromPipeline };
    }
    if (!isEmpty(filteredData)) {
      const inferred = inferColumnType(
        filteredData,
        field,
        topLevelKey,
        nestedPath
      );
      return { field, topLevelKey, nestedPath, fieldType: inferred };
    }
    return { field, topLevelKey, nestedPath, fieldType: 'string' };
  }, [
    sortConfig,
    currentQueryDoc?.clientSave,
    currentQueryDoc?.sortFields,
    columnTypesOverride,
    pipelineColumnMeta.columnTypes,
    filteredData,
  ]);

  const groupDataRecursive = useCallback(
    (data, fields, currentLevel = 0, parentPath = []) => {
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
        sortComparator = getSortComparator(
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

      const {
        filteredColumns: cols,
        columnTypes: colTypes,
        hasPercentageColumns: hasPct,
        percentageColumnNames: pctNames,
      } = pipelineColumnMeta;
      const getCell = pipelineColumnMeta.getCellValue;

      return Object.entries(groups).map(([groupKey, rows]) => {
        const currentPath = [
          ...parentPath,
          groupKey === '__null__' ? null : groupKey,
        ];
        const nextLevelData = groupDataRecursive(
          rows,
          fields,
          currentLevel + 1,
          currentPath
        );
        const hasNextLevel = currentLevel + 1 < fields.length;
        const innerData = hasNextLevel ? nextLevelData : rows;
        const summaryRow = {};
        const firstItem =
          isArray(innerData) && innerData.length > 0 ? innerData[0] : null;
        if (!firstItem) return null;

        cols.forEach((col) => {
          const colType = colTypes[col] || 'string';
          const isDerivedCol = derivedColumnNamesSet.has(col);
          if (col === currentField) {
            summaryRow[col] = groupKey === '__null__' ? null : groupKey;
          } else if (
            currentLevel < fields.length - 1 &&
            fields.slice(currentLevel + 1).includes(col)
          ) {
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
              const firstNonNull = isArray(innerData)
                ? innerData.find((row) => !isNil(getCell(row, col)))
                : null;
              summaryRow[col] = firstNonNull
                ? getCell(firstNonNull, col)
                : getCell(firstItem, col);
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
              summaryRow[pc.columnName] =
                sumTarget !== 0 ? (sumValue / sumTarget) * 100 : null;
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
    },
    [
      sortFieldType,
      sortConfig,
      getSortComparator,
      pipelineColumnMeta,
      percentageColumns,
      derivedColumnNamesSet,
    ]
  );

  const groupedData = useMemo(() => {
    if (enableBreakdown) {
      if (reportData && reportData.tableData) {
        let sortedReportData = reportData.tableData;
        if (sortFieldType && sortConfig) {
          const sortComparator = getSortComparator(
            sortConfig,
            sortFieldType.fieldType,
            sortFieldType.topLevelKey,
            sortFieldType.nestedPath
          );
          if (sortComparator && sortedReportData.length > 0) {
            sortedReportData = [...sortedReportData].sort(sortComparator);
          }
        }
        return sortedReportData;
      }
      // Report mode but report not ready: do not pass raw/grouped raw data to the table.
      // Report columns expect period_metric keys; raw rows would show "-" for every cell.
      return [];
    }

    let dataWithJsonTables = filteredData;
    if (jsonArrayFields.size > 0 && !isEmpty(filteredData)) {
      dataWithJsonTables = extractJsonNestedTablesFromData(filteredData);
    }
    if (effectiveGroupFields.length > 0 && !isEmpty(dataWithJsonTables)) {
      // If data is already grouped (from buffer) with same depth as groupFields, pass through.
      // groupDataRecursive skips __isGroupRow__ rows and would return [] on pre-grouped input.
      // Only pass through when structure depth matches - otherwise re-group from flat data.
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
      let result = alreadyGroupedWithSameDepth
        ? dataWithJsonTables
        : groupDataRecursive(dataWithJsonTables, effectiveGroupFields);
      if (sortFieldType && sortConfig) {
        const sortComparator = getSortComparator(
          sortConfig,
          sortFieldType.fieldType,
          sortFieldType.topLevelKey,
          sortFieldType.nestedPath
        );
        if (sortComparator && result.length > 0) {
          result = [...result].sort(sortComparator);
        }
      }
      // Run derived columns on grouped data (including group summary rows)
      return applyDerivedColumns(result, derivedColumns, {
        mode: derivedColumnsMode,
        fieldName: derivedColumnsFieldName,
        getDataValue,
      });
    }
    if (isEmpty(dataWithJsonTables) || !isArray(dataWithJsonTables)) {
      return dataWithJsonTables || [];
    }
    return dataWithJsonTables
      .filter((row) => !row?.__isGroupRow__)
      .map((row) => {
        if (row instanceof Map) {
          const plainObj = {};
          row.forEach((value, key) => {
            plainObj[key] = value;
          });
          return plainObj;
        }
        return row;
      });
  }, [
    enableBreakdown,
    reportData,
    filteredData,
    effectiveGroupFields,
    groupDataRecursive,
    jsonArrayFields,
    extractJsonNestedTablesFromData,
    derivedColumns,
    sortFieldType,
    sortConfig,
    getSortComparator,
    derivedColumnsMode,
    derivedColumnsFieldName,
  ]);

  const filteredDataWithNestedTables = useMemo(() => {
    if (effectiveGroupFields.length > 0) return filteredData;
    if (jsonArrayFields.size > 0 && !isEmpty(filteredData)) {
      return extractJsonNestedTablesFromData(filteredData);
    }
    return filteredData;
  }, [
    filteredData,
    effectiveGroupFields.length,
    jsonArrayFields.size,
    extractJsonNestedTablesFromData,
  ]);

  const dataForSorting = useMemo(() => {
    const data =
      effectiveGroupFields.length > 0 ? groupedData : filteredDataWithNestedTables;
    return isArray(data) ? data : [];
  }, [effectiveGroupFields.length, groupedData, filteredDataWithNestedTables]);

  const isPercentageColumn = useCallback(
    (columnName) =>
      pipelineColumnMeta.hasPercentageColumns &&
      percentageColumns.some((pc) => pc.columnName === columnName),
    [pipelineColumnMeta.hasPercentageColumns, percentageColumns]
  );

  const sortedData = useMemo(() => {
    if (enableBreakdown) {
      if (!isArray(dataForSorting) || isEmpty(dataForSorting)) return [];
      let result = [...dataForSorting];
      if (sortFieldType && sortConfig) {
        const sortComparator = getSortComparator(
          sortConfig,
          sortFieldType.fieldType,
          sortFieldType.topLevelKey,
          sortFieldType.nestedPath
        );
        if (sortComparator && result.length > 0) result.sort(sortComparator);
      }
      return result;
    }
    if (!isArray(dataForSorting)) return [];
    if (isEmpty(dataForSorting)) return dataForSorting;
    let result = [...dataForSorting];
    if (!isEmpty(tableSortMeta) && enableSort) {
      const fields = tableSortMeta.map((s) => {
        const field = s.field;
        if (isPercentageColumn(field)) {
          return (rowData) =>
            pipelineColumnMeta.getCellValue(rowData, field);
        }
        return field;
      });
      const orders = tableSortMeta.map((s) => (s.order === 1 ? 'asc' : 'desc'));
      result = orderBy(result, fields, orders);
    } else if (sortFieldType && sortConfig) {
      const sortComparator = getSortComparator(
        sortConfig,
        sortFieldType.fieldType,
        sortFieldType.topLevelKey,
        sortFieldType.nestedPath
      );
      if (sortComparator) result.sort(sortComparator);
    }
    return result;
  }, [
    enableBreakdown,
    dataForSorting,
    tableSortMeta,
    isPercentageColumn,
    pipelineColumnMeta,
    enableSort,
    sortFieldType,
    sortConfig,
    getSortComparator,
  ]);

  const paginatedData = useMemo(() => {
    if (!isArray(sortedData) || isEmpty(sortedData)) return [];
    return sortedData.slice(
      tablePagination.first,
      tablePagination.first + tablePagination.rows
    );
  }, [sortedData, tablePagination]);

  return {
    rawTableData,
    authFilteredData,
    preFilteredData,
    tableData,
    searchedData,
    searchSortSortedData,
    filteredData,
    groupedData,
    sortedData,
    paginatedData,
    addEditingKeysToRows,
    generateEditingKey,
    mainTableEditingDataRefEarly,
    tableDataUpdateTrigger,
    setTableDataUpdateTrigger,
    preFilterSets,
    pipelineColumnMeta,
    sortFieldType,
    getSortComparator,
    effectiveGroupFields,
    jsonArrayFields,
    extractJsonNestedTablesFromData,
    filteredDataWithNestedTables,
  };
}
