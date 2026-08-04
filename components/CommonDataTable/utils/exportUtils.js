/**
 * XLSX / CSV export.
 *
 * `xlsx` is imported dynamically so the ~400kB writer only loads when someone
 * actually clicks Export.
 */

import { isNil } from 'lodash';
import { formatDateValue, isTruthyBoolean } from './typeUtils';
import { formatHeaderName, getDataValue, ONE_LAKH, toFiniteNumber } from './valueUtils';

/**
 * Convert a cell for the sheet: numbers stay numeric so Excel can total them,
 * dates become the same string the table shows.
 */
function toExportValue(value, colType, { divideBy1Lakh }) {
  if (isNil(value) || value === '') return '';
  if (colType === 'number') {
    const num = toFiniteNumber(value);
    if (num == null) return String(value);
    return divideBy1Lakh ? num / ONE_LAKH : num;
  }
  if (colType === 'date') return formatDateValue(value);
  if (colType === 'boolean') return isTruthyBoolean(value) ? 'Yes' : 'No';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/**
 * Build the sheet matrix: one header row of labels, then one array per row.
 *
 * @param {Object} params
 * @param {Array<Object>} params.rows
 * @param {Array<string>} params.columns visible columns, in display order
 * @param {Object} [params.columnLabels]
 * @param {Object} [params.columnTypes]
 * @param {Function} [params.isDivided] (col) => boolean — which columns are shown in lakhs
 * @param {Function} [params.getCell]
 * @returns {Array<Array<*>>}
 */
export function buildExportMatrix({
  rows,
  columns,
  columnLabels = {},
  columnTypes = {},
  isDivided = () => false,
  getCell = getDataValue,
}) {
  const header = columns.map((col) => columnLabels[col] || formatHeaderName(col));
  const body = (Array.isArray(rows) ? rows : []).map((row) =>
    columns.map((col) =>
      toExportValue(getCell(row, col), columnTypes[col] || 'string', { divideBy1Lakh: isDivided(col) })));
  return [header, ...body];
}

/** Column widths sized to the longest cell, capped so one long text column can't dominate. */
function computeSheetColumnWidths(matrix) {
  if (matrix.length === 0) return [];
  return matrix[0].map((_, colIndex) => {
    let widest = 10;
    for (const row of matrix) {
      const length = String(row[colIndex] ?? '').length;
      if (length > widest) widest = length;
    }
    return { wch: Math.min(widest + 2, 50) };
  });
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Write the given rows to a file and download it.
 *
 * @param {Object} params see {@link buildExportMatrix}, plus:
 * @param {'xlsx'|'csv'} [params.format='xlsx']
 * @param {string} [params.fileName='table-export']
 * @param {string} [params.sheetName='Sheet1']
 * @returns {Promise<{rowCount: number, fileName: string}>}
 */
export async function exportRows({
  rows,
  columns,
  columnLabels,
  columnTypes,
  isDivided,
  getCell,
  format = 'xlsx',
  fileName = 'table-export',
  sheetName = 'Sheet1',
}) {
  const matrix = buildExportMatrix({ rows, columns, columnLabels, columnTypes, isDivided, getCell });
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet['!cols'] = computeSheetColumnWidths(matrix);

  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(sheet);
    const outName = `${fileName}.csv`;
    triggerDownload(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' }), outName);
    return { rowCount: matrix.length - 1, fileName: outName };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31) || 'Sheet1');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const outName = `${fileName}.xlsx`;
  triggerDownload(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    outName,
  );
  return { rowCount: matrix.length - 1, fileName: outName };
}
