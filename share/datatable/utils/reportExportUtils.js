import * as XLSX from 'xlsx';
import { isEmpty, isNil, isNumber } from 'lodash';
import { getDataValue } from './dataAccessUtils';
import { computeReportColumnsStructure } from './reportRenderingUtils';
import { getMetricLabel } from './reportRenderingUtils';
import { getTimePeriodLabelShort } from '../report/utils/timeBreakdownUtils';

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
 * @param {string} outerGroupField - Outer group field name
 * @param {string} innerGroupField - Inner group field name (optional)
 * @param {Function} formatHeaderName - Function to format header names
 * @returns {Object} XLSX workbook ready for XLSX.writeFile
 */
export function exportReportToXLSX(
  reportData,
  columnGroupBy,
  outerGroupField,
  innerGroupField,
  formatHeaderName
) {
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
  const { metricGroups, periodGroups, metricsWithData, timePeriodsWithData, columnsWithData, isMergedMode } = reportColumnsStructure;

  // Prepare data for export
  let dataToExport = [];

  // If innerGroupField is set, flatten nested data similar to grouped mode
  if (innerGroupField && reportData.nestedTableData) {
    reportData.tableData.forEach((outerRow) => {
      const outerValue = getDataValue(outerRow, outerGroupField);
      const nestedRows = reportData.nestedTableData[outerValue];
      
      if (nestedRows && nestedRows.length > 0) {
        // Add nested rows with outer group field value
        nestedRows.forEach((nestedRow) => {
          const rowWithGroup = { ...nestedRow };
          // Ensure outerGroupField is set
          if (!rowWithGroup.hasOwnProperty(outerGroupField)) {
            rowWithGroup[outerGroupField] = outerValue === '__null__' ? null : outerValue;
          }
          dataToExport.push(rowWithGroup);
        });
      } else {
        // If no nested data, still include the outer row
        dataToExport.push({ ...outerRow });
      }
    });
  } else {
    // No inner group, just use outer table data
    dataToExport = reportData.tableData.map(row => ({ ...row }));
  }

  // Build column order matching the report structure
  const exportColumns = [outerGroupField];
  if (innerGroupField) {
    exportColumns.push(innerGroupField);
  }
  exportColumns.push(...reportColumnsStructure.columnNames);

  // Create worksheet - we'll build it manually to have control over headers
  const ws = {};
  
  // Calculate column positions
  let colIndex = 0;
  const outerGroupColIndex = colIndex++;
  const innerGroupColIndex = innerGroupField ? colIndex++ : -1;
  const dataStartColIndex = colIndex;

  // Build header structure
  const merges = [];
  const headerRowIndex = 0;
  const dataStartRow = 3; // Data starts at row 4 (0-indexed row 3)
  
  // Row 1: Outer group field + merged cell for all data columns
  if (outerGroupField) {
    const outerGroupHeader = formatHeaderName(outerGroupField);
    ws[getCellAddress(headerRowIndex, outerGroupColIndex)] = { v: outerGroupHeader, t: 's' };
    
    // Merge outer group field across 3 rows
    merges.push({
      s: { r: headerRowIndex, c: outerGroupColIndex },
      e: { r: headerRowIndex + 2, c: outerGroupColIndex }
    });
  }

  // If inner group field exists, add it to row 1 and merge across 3 rows
  if (innerGroupField) {
    const innerGroupHeader = formatHeaderName(innerGroupField);
    ws[getCellAddress(headerRowIndex, innerGroupColIndex)] = { v: innerGroupHeader, t: 's' };
    
    merges.push({
      s: { r: headerRowIndex, c: innerGroupColIndex },
      e: { r: headerRowIndex + 2, c: innerGroupColIndex }
    });
  }

  // Merge all data columns in row 1
  if (columnsWithData.length > 0) {
    merges.push({
      s: { r: headerRowIndex, c: dataStartColIndex },
      e: { r: headerRowIndex, c: dataStartColIndex + columnsWithData.length - 1 }
    });
  }

  // Row 2: Metric headers (merged mode) or Time period headers (sub-columns mode)
  let currentCol = dataStartColIndex;
  
  if (isMergedMode) {
    // Merged mode: metrics first, then time periods
    metricsWithData.forEach((metric) => {
      const periodCount = metricGroups[metric].length;
      const metricLabel = getMetricLabel(metric);
      
      ws[getCellAddress(headerRowIndex + 1, currentCol)] = { v: metricLabel, t: 's' };
      
      // Merge metric header across its periods
      if (periodCount > 1) {
        merges.push({
          s: { r: headerRowIndex + 1, c: currentCol },
          e: { r: headerRowIndex + 1, c: currentCol + periodCount - 1 }
        });
      }
      
      currentCol += periodCount;
    });
  } else {
    // Sub-columns mode: time periods first, then metrics
    timePeriodsWithData.forEach((period) => {
      const metricCount = periodGroups[period].length;
      const periodLabel = getTimePeriodLabelShort(period, breakdownType);
      
      ws[getCellAddress(headerRowIndex + 1, currentCol)] = { v: periodLabel, t: 's' };
      
      // Merge period header across its metrics
      if (metricCount > 1) {
        merges.push({
          s: { r: headerRowIndex + 1, c: currentCol },
          e: { r: headerRowIndex + 1, c: currentCol + metricCount - 1 }
        });
      }
      
      currentCol += metricCount;
    });
  }

  // Row 3: Time period headers (merged mode) or Metric headers (sub-columns mode)
  currentCol = dataStartColIndex;
  
  if (isMergedMode) {
    // Merged mode: time periods under each metric
    metricsWithData.forEach((metric) => {
      metricGroups[metric].forEach((period) => {
        const periodLabel = getTimePeriodLabelShort(period, breakdownType);
        ws[getCellAddress(headerRowIndex + 2, currentCol)] = { v: periodLabel, t: 's' };
        currentCol++;
      });
    });
  } else {
    // Sub-columns mode: metrics under each period
    timePeriodsWithData.forEach((period) => {
      periodGroups[period].forEach((metric) => {
        const metricLabel = getMetricLabel(metric);
        ws[getCellAddress(headerRowIndex + 2, currentCol)] = { v: metricLabel, t: 's' };
        currentCol++;
      });
    });
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
