import * as XLSX from 'xlsx';
import { isEmpty, isNil, isNumber } from 'lodash';
import { getDataValue } from './dataAccessUtils';
import { computeReportColumnsStructure, getReportColumns, getMetricLabel } from './reportRenderingUtils';
import { getTimePeriodLabelShort } from './timeBreakdownUtils';

/**
 * Converts column index to Excel column letter (0 -> A, 1 -> B, etc.)
 */
function columnIndexToLetter(colIndex) {
  let result = '';
  colIndex++;
  while (colIndex > 0) {
    colIndex--;
    result = String.fromCharCode(65 + (colIndex % 26)) + result;
    colIndex = Math.floor(colIndex / 26);
  }
  return result;
}

/**
 * Creates a cell address from row and column indices (0-indexed)
 */
function getCellAddress(row, col) {
  return `${columnIndexToLetter(col)}${row + 1}`;
}

/**
 * Flatten nested report rows to leaf level (all group dimensions expanded).
 */
function flattenNestedDataRecursive(tableData, nestedTableData, groupFields, currentLevel = 0, pathValues = []) {
  if (currentLevel >= groupFields.length) {
    return tableData.map((row) => {
      const result = { ...row };
      groupFields.forEach((field, idx) => {
        if (idx < pathValues.length && !Object.prototype.hasOwnProperty.call(result, field)) {
          result[field] = pathValues[idx] === '__null__' ? null : pathValues[idx];
        }
      });
      return result;
    });
  }

  const currentField = groupFields[currentLevel];
  if (!currentField) {
    return tableData.map((row) => ({ ...row }));
  }

  const flattened = [];

  tableData.forEach((row) => {
    const currentValue = getDataValue(row, currentField);
    const currentKey = isNil(currentValue) ? '__null__' : String(currentValue);
    const newPath = [...pathValues, currentKey];

    const compositeKey = newPath.join('|');
    const nestedRows = nestedTableData && nestedTableData[compositeKey];

    if (nestedRows && nestedRows.length > 0 && currentLevel + 1 < groupFields.length) {
      const nestedFlattened = flattenNestedDataRecursive(
        nestedRows,
        nestedTableData,
        groupFields,
        currentLevel + 1,
        newPath
      );
      flattened.push(...nestedFlattened);
    } else {
      const rowWithPath = { ...row };
      groupFields.forEach((field, idx) => {
        if (idx < newPath.length) {
          rowWithPath[field] = newPath[idx] === '__null__' ? null : newPath[idx];
        }
      });
      flattened.push(rowWithPath);
    }
  });

  return flattened;
}

/**
 * Collect report rows rolled up to target group level (0 = outer group only).
 */
function flattenNestedDataUpToLevel(
  tableData,
  nestedTableData,
  fullGroupFields,
  targetLevelIndex,
  currentLevel = 0,
  pathValues = []
) {
  const flattened = [];

  if (currentLevel >= fullGroupFields.length) {
    return tableData.map((row) => {
      const result = { ...row };
      fullGroupFields.forEach((field, idx) => {
        if (idx < pathValues.length && !Object.prototype.hasOwnProperty.call(result, field)) {
          result[field] = pathValues[idx] === '__null__' ? null : pathValues[idx];
        }
      });
      return result;
    });
  }

  const currentField = fullGroupFields[currentLevel];
  if (!currentField) {
    return tableData.map((row) => ({ ...row }));
  }

  tableData.forEach((row) => {
    const currentValue = getDataValue(row, currentField);
    const currentKey = isNil(currentValue) ? '__null__' : String(currentValue);
    const newPath = [...pathValues, currentKey];

    if (currentLevel === targetLevelIndex) {
      const rowWithPath = { ...row };
      fullGroupFields.forEach((field, idx) => {
        if (idx < newPath.length) {
          rowWithPath[field] = newPath[idx] === '__null__' ? null : newPath[idx];
        }
      });
      flattened.push(rowWithPath);
      return;
    }

    const compositeKey = newPath.join('|');
    const nestedRows = nestedTableData && nestedTableData[compositeKey];

    if (nestedRows && nestedRows.length > 0 && currentLevel + 1 < fullGroupFields.length) {
      flattened.push(
        ...flattenNestedDataUpToLevel(
          nestedRows,
          nestedTableData,
          fullGroupFields,
          targetLevelIndex,
          currentLevel + 1,
          newPath
        )
      );
    } else {
      const rowWithPath = { ...row };
      fullGroupFields.forEach((field, idx) => {
        if (idx < newPath.length) {
          rowWithPath[field] = newPath[idx] === '__null__' ? null : newPath[idx];
        }
      });
      flattened.push(rowWithPath);
    }
  });

  return flattened;
}

/**
 * @param {Object} reportData
 * @param {string[]} fullGroupFields
 * @param {number} targetLevelIndex — group field index to roll up to (inclusive)
 * @returns {Array<Object>}
 */
export function collectReportDataForGroupLevel(reportData, fullGroupFields, targetLevelIndex) {
  const groupFields = Array.isArray(fullGroupFields) ? fullGroupFields : [];
  if (!reportData || isEmpty(reportData.tableData)) {
    return [];
  }
  if (groupFields.length === 0) {
    return reportData.tableData.map((row) => ({ ...row }));
  }
  if (!reportData.nestedTableData) {
    return targetLevelIndex <= 0 ? reportData.tableData.map((row) => ({ ...row })) : [];
  }

  const maxLevelIndex = groupFields.length - 1;
  const target = Math.min(Math.max(0, targetLevelIndex), maxLevelIndex);

  if (target >= maxLevelIndex) {
    return flattenNestedDataRecursive(
      reportData.tableData,
      reportData.nestedTableData,
      groupFields
    );
  }

  return flattenNestedDataUpToLevel(
    reportData.tableData,
    reportData.nestedTableData,
    groupFields,
    target,
    0,
    []
  );
}

/**
 * Build one report worksheet (merged headers + data rows).
 * @param {Object} reportData
 * @param {string} columnGroupBy
 * @param {string[]} headerGroupFields — group columns shown on this sheet (prefix of full fields)
 * @param {Array<Object>} dataToExport
 * @param {Function} formatHeaderName
 * @returns {Object} XLSX worksheet
 */
function buildReportWorksheet(
  reportData,
  columnGroupBy,
  headerGroupFields,
  dataToExport,
  formatHeaderName,
  includeGroupColumn = true
) {
  const groupFields = Array.isArray(headerGroupFields) ? headerGroupFields : [];

  const reportColumnsStructure = computeReportColumnsStructure(reportData, columnGroupBy);
  if (!reportColumnsStructure) {
    return XLSX.utils.json_to_sheet(isEmpty(dataToExport) ? [{ 'No Data': 'No data available' }] : dataToExport);
  }

  const { breakdownType } = reportData;
  const outerGroupField = groupFields[0] || '';
  const {
    metricGroups,
    periodGroups,
    metricsWithData,
    timePeriodsWithData,
    columnsWithData,
    exemptColumns = [],
    orderedSegments,
    isMergedMode
  } = reportColumnsStructure;
  const exemptColsArray = Array.isArray(exemptColumns) ? exemptColumns : [];

  const reportCols = getReportColumns(reportColumnsStructure, outerGroupField, includeGroupColumn);
  const exportColumns = [...groupFields, ...reportCols.filter((c) => !groupFields.includes(c))];

  const ws = {};
  const merges = [];
  const headerRowIndex = 0;
  const dataStartRow = 3;

  let colIndex = 0;

  groupFields.forEach((field) => {
    ws[getCellAddress(headerRowIndex, colIndex)] = { v: formatHeaderName(field), t: 's' };
    merges.push({ s: { r: headerRowIndex, c: colIndex }, e: { r: headerRowIndex + 2, c: colIndex } });
    colIndex++;
  });

  if (orderedSegments && orderedSegments.length > 0) {
    orderedSegments.forEach((seg) => {
      if (seg.type === 'exempt') {
        ws[getCellAddress(headerRowIndex, colIndex)] = { v: formatHeaderName(seg.name), t: 's' };
        merges.push({ s: { r: headerRowIndex, c: colIndex }, e: { r: headerRowIndex + 2, c: colIndex } });
        colIndex++;
      } else {
        const count = seg.periods?.length ?? 0;
        if (count > 0) {
          merges.push({ s: { r: headerRowIndex, c: colIndex }, e: { r: headerRowIndex, c: colIndex + count - 1 } });
          if (isMergedMode) {
            ws[getCellAddress(headerRowIndex + 1, colIndex)] = { v: getMetricLabel(seg.metric), t: 's' };
            if (count > 1) {
              merges.push({ s: { r: headerRowIndex + 1, c: colIndex }, e: { r: headerRowIndex + 1, c: colIndex + count - 1 } });
            }
            seg.periods.forEach((period) => {
              ws[getCellAddress(headerRowIndex + 2, colIndex)] = { v: getTimePeriodLabelShort(period, breakdownType), t: 's' };
              colIndex++;
            });
          } else {
            seg.periods.forEach((period) => {
              ws[getCellAddress(headerRowIndex + 1, colIndex)] = { v: getTimePeriodLabelShort(period, breakdownType), t: 's' };
              ws[getCellAddress(headerRowIndex + 2, colIndex)] = { v: getMetricLabel(seg.metric), t: 's' };
              colIndex++;
            });
          }
        }
      }
    });
  } else {
    exemptColsArray.forEach((col) => {
      ws[getCellAddress(headerRowIndex, colIndex)] = { v: formatHeaderName(col), t: 's' };
      merges.push({ s: { r: headerRowIndex, c: colIndex }, e: { r: headerRowIndex + 2, c: colIndex } });
      colIndex++;
    });
    const dataStartColIndex = colIndex;
    if (columnsWithData.length > 0) {
      merges.push({
        s: { r: headerRowIndex, c: dataStartColIndex },
        e: { r: headerRowIndex, c: dataStartColIndex + columnsWithData.length - 1 }
      });
    }
    let currentCol = dataStartColIndex;
    if (isMergedMode) {
      metricsWithData.forEach((metric) => {
        const periodCount = metricGroups[metric].length;
        ws[getCellAddress(headerRowIndex + 1, currentCol)] = { v: getMetricLabel(metric), t: 's' };
        if (periodCount > 1) {
          merges.push({ s: { r: headerRowIndex + 1, c: currentCol }, e: { r: headerRowIndex + 1, c: currentCol + periodCount - 1 } });
        }
        currentCol += periodCount;
      });
      currentCol = dataStartColIndex;
      metricsWithData.forEach((metric) => {
        metricGroups[metric].forEach((period) => {
          ws[getCellAddress(headerRowIndex + 2, currentCol)] = { v: getTimePeriodLabelShort(period, breakdownType), t: 's' };
          currentCol++;
        });
      });
    } else {
      timePeriodsWithData.forEach((period) => {
        const metricCount = periodGroups[period].length;
        ws[getCellAddress(headerRowIndex + 1, currentCol)] = { v: getTimePeriodLabelShort(period, breakdownType), t: 's' };
        if (metricCount > 1) {
          merges.push({ s: { r: headerRowIndex + 1, c: currentCol }, e: { r: headerRowIndex + 1, c: currentCol + metricCount - 1 } });
        }
        currentCol += metricCount;
      });
      currentCol = dataStartColIndex;
      timePeriodsWithData.forEach((period) => {
        periodGroups[period].forEach((metric) => {
          ws[getCellAddress(headerRowIndex + 2, currentCol)] = { v: getMetricLabel(metric), t: 's' };
          currentCol++;
        });
      });
    }
  }

  dataToExport.forEach((row, rowIndex) => {
    exportColumns.forEach((col, colIdx) => {
      const value = getDataValue(row, col);
      const cellAddress = getCellAddress(dataStartRow + rowIndex, colIdx);

      if (isNil(value)) {
        ws[cellAddress] = { v: '', t: 's' };
      } else if (isNumber(value)) {
        ws[cellAddress] = { v: value, t: 'n' };
      } else {
        ws[cellAddress] = { v: String(value), t: 's' };
      }
    });
  });

  const maxRow = dataStartRow + Math.max(0, dataToExport.length) - 1;
  const maxCol = Math.max(0, exportColumns.length - 1);
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxRow, c: maxCol }
  });

  ws['!merges'] = merges;

  const headerStyle = {
    font: { bold: true },
    fill: { fgColor: { rgb: 'E0E0E0' } },
    alignment: { horizontal: 'center', vertical: 'center' }
  };

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < exportColumns.length; col++) {
      const cellAddress = getCellAddress(row, col);
      if (ws[cellAddress]) {
        ws[cellAddress].s = headerStyle;
      }
    }
  }

  return ws;
}

/**
 * Append one report worksheet at a given group rollup level to an existing workbook.
 * @param {Object} wb — XLSX workbook from book_new()
 * @param {string} sheetName — sanitized, unique name
 * @param {Object} reportData
 * @param {string} columnGroupBy
 * @param {Array<string>} fullGroupFields — all report group fields (used for tree walk)
 * @param {number} targetLevelIndex — which group level this sheet represents
 * @param {Function} formatHeaderName
 */
export function appendReportLevelSheet(
  wb,
  sheetName,
  reportData,
  columnGroupBy,
  fullGroupFields,
  targetLevelIndex,
  formatHeaderName,
  includeGroupColumn = true
) {
  if (!reportData || isEmpty(reportData.tableData)) {
    const ws = XLSX.utils.json_to_sheet([{ 'No Data': 'No data available' }]);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return;
  }

  const reportColumnsStructure = computeReportColumnsStructure(reportData, columnGroupBy);
  if (!reportColumnsStructure) {
    const ws = XLSX.utils.json_to_sheet(reportData.tableData);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return;
  }

  const fullGF = Array.isArray(fullGroupFields) ? fullGroupFields : [];
  const safeTarget = fullGF.length === 0
    ? 0
    : Math.min(Math.max(0, targetLevelIndex), fullGF.length - 1);
  const headerGroupFields = fullGF.length === 0 ? [] : fullGF.slice(0, safeTarget + 1);

  const dataToExport = collectReportDataForGroupLevel(reportData, fullGF, safeTarget);
  const ws = buildReportWorksheet(
    reportData,
    columnGroupBy,
    headerGroupFields,
    dataToExport,
    formatHeaderName,
    includeGroupColumn
  );
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

/**
 * Exports report data to Excel with merged headers matching the report structure
 * @param {Object} reportData - Report data with tableData, nestedTableData, timePeriods, metrics, breakdownType
 * @param {string} columnGroupBy - Column grouping mode: 'values', 'sub-columns', 'period-over-period'
 * @param {Array} effectiveGroupFields - Array of group fields for multi-level nesting
 * @param {Function} formatHeaderName - Function to format header names
 * @returns {Object} XLSX workbook ready for XLSX.writeFile
 */
export function exportReportToXLSX(
  reportData,
  columnGroupBy,
  effectiveGroupFields,
  formatHeaderName
) {
  const wb = XLSX.utils.book_new();
  const fullGF = Array.isArray(effectiveGroupFields) ? effectiveGroupFields : [];

  if (!reportData || isEmpty(reportData.tableData)) {
    const ws = XLSX.utils.json_to_sheet([{ 'No Data': 'No data available' }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return wb;
  }

  const deepest = fullGF.length === 0 ? 0 : fullGF.length - 1;
  appendReportLevelSheet(wb, 'Sheet1', reportData, columnGroupBy, fullGF, deepest, formatHeaderName);
  return wb;
}
