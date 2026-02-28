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
  // Ensure effectiveGroupFields is an array
  const groupFields = Array.isArray(effectiveGroupFields) ? effectiveGroupFields : [];
  
  if (!reportData || !reportData.tableData || isEmpty(reportData.tableData)) {
    // Return empty workbook if no data
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ 'No Data': 'No data available' }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return wb;
  }

  // Compute column structure
  const reportColumnsStructure = computeReportColumnsStructure(reportData, columnGroupBy);
  if (!reportColumnsStructure) {
    // Fallback to simple export
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(reportData.tableData);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return wb;
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

  // Build export column order (preserves original position when orderedSegments is present)
  const reportCols = getReportColumns(reportColumnsStructure, outerGroupField);
  const exportColumns = [...groupFields, ...reportCols.filter((c) => !groupFields.includes(c))];

  // Prepare data for export - flatten nested data recursively for all levels
  let dataToExport = [];

  // Recursive function to flatten nested data for all group levels
  function flattenNestedDataRecursive(tableData, nestedTableData, groupFields, currentLevel = 0, pathValues = []) {
    if (currentLevel >= groupFields.length) {
      // Final level - return the data as-is
      return tableData.map(row => {
        const result = { ...row };
        // Ensure all group field values are set from path
        groupFields.forEach((field, idx) => {
          if (idx < pathValues.length && !result.hasOwnProperty(field)) {
            result[field] = pathValues[idx] === '__null__' ? null : pathValues[idx];
          }
        });
        return result;
      });
    }

    const currentField = groupFields[currentLevel];
    if (!currentField) {
      return tableData.map(row => ({ ...row }));
    }

    const flattened = [];
    
    tableData.forEach((row) => {
      const currentValue = getDataValue(row, currentField);
      const currentKey = isNil(currentValue) ? '__null__' : String(currentValue);
      const newPath = [...pathValues, currentKey];
      
      // Check if there's nested data for this path
      const compositeKey = newPath.join('|');
      const nestedRows = nestedTableData && nestedTableData[compositeKey];
      
      if (nestedRows && nestedRows.length > 0 && currentLevel + 1 < groupFields.length) {
        // Recursively flatten nested data
        const nestedFlattened = flattenNestedDataRecursive(
          nestedRows,
          nestedTableData,
          groupFields,
          currentLevel + 1,
          newPath
        );
        flattened.push(...nestedFlattened);
      } else {
        // No nested data or final level - add current row with all path values
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

  if (groupFields.length > 0 && reportData.nestedTableData) {
    dataToExport = flattenNestedDataRecursive(
      reportData.tableData,
      reportData.nestedTableData,
      groupFields
    );
  } else {
    // No grouping, just use table data
    dataToExport = reportData.tableData.map(row => ({ ...row }));
  }

  // Create worksheet - we'll build it manually to have control over headers
  const ws = {};
  const merges = [];
  const headerRowIndex = 0;
  const dataStartRow = 3; // Data starts at row 4 (0-indexed row 3)

  let colIndex = 0;

  // Row 1: Group fields
  groupFields.forEach((field) => {
    ws[getCellAddress(headerRowIndex, colIndex)] = { v: formatHeaderName(field), t: 's' };
    merges.push({ s: { r: headerRowIndex, c: colIndex }, e: { r: headerRowIndex + 2, c: colIndex } });
    colIndex++;
  });

  if (orderedSegments && orderedSegments.length > 0) {
    // Interleaved structure: exempt + breakdown segments in original order
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
    // Legacy: exempt block, then breakdown block
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

  // Add data rows starting from row 4 (index 3)
  dataToExport.forEach((row, rowIndex) => {
    exportColumns.forEach((col, colIndex) => {
      let value = getDataValue(row, col);
      const cellAddress = getCellAddress(dataStartRow + rowIndex, colIndex);
      
      if (isNil(value)) {
        ws[cellAddress] = { v: '', t: 's' };
      } else if (isNumber(value)) {
        ws[cellAddress] = { v: value, t: 'n' };
      } else {
        ws[cellAddress] = { v: String(value), t: 's' };
      }
    });
  });

  // Set worksheet range
  const maxRow = dataStartRow + dataToExport.length - 1;
  const maxCol = exportColumns.length - 1;
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxRow, c: maxCol }
  });

  // Apply merges
  ws['!merges'] = merges;

  // Apply header styling (bold, background color)
  const headerStyle = {
    font: { bold: true },
    fill: { fgColor: { rgb: 'E0E0E0' } },
    alignment: { horizontal: 'center', vertical: 'center' }
  };

  // Style all header cells (rows 0, 1, 2)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < exportColumns.length; col++) {
      const cellAddress = getCellAddress(row, col);
      if (ws[cellAddress]) {
        ws[cellAddress].s = headerStyle;
      }
    }
  }

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  return wb;
}
