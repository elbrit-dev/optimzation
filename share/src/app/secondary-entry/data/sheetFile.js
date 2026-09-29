/* Reading an uploaded bulk-entry sheet, whatever it was saved as.
 *
 * The download is always CSV (csv.buildSheet), in either layout. What comes
 * BACK is whatever the user's spreadsheet app saved: Excel re-saves as .xlsx
 * by default, older installs as .xls, some as .xlsm / .xlsb, LibreOffice as
 * .ods, and some keep CSV or TSV. All of them are accepted as long as the table inside has the
 * same columns — this module only turns the file into rows; csv.parseSheetRows
 * checks the structure, identically for every format.
 *
 * CSV stays on our own parser, not the library's: it keeps every cell as the
 * exact text written, where a spreadsheet reader would coerce "0012" to 12
 * or a date-looking string to a date.
 *
 * SheetJS (`xlsx`, already a dependency) is loaded ONLY when a binary sheet
 * is uploaded, so it adds nothing to the page until then. It is 0.18.5, the
 * last npm release, which carries two advisories triggered by crafted files
 * (prototype pollution, CVE-2023-30533; ReDoS, CVE-2024-22363). Exposure here
 * is kept to the minimum: values only — no formulas, styles, HTML or VBA read
 * (`cellFormula/cellHTML/cellStyles/bookVBA: false`), and only the first
 * worksheet that carries the expected header is converted. */

import { buildGridRows, gridHeaderIndex, gridMerges, parseSheet, parseSheetRows, requiredColumns, sheetColumns } from './csv';
import { SECONDARY } from './task';

export const ACCEPTED_EXTENSIONS = ['.csv', '.tsv', '.txt', '.xlsx', '.xlsm', '.xlsb', '.xls', '.ods'];

/* For the file input's `accept`: extensions AND the MIME types some mobile
   pickers filter on instead. */
export const ACCEPT_ATTR = [
  ...ACCEPTED_EXTENSIONS,
  'text/csv',
  'text/tab-separated-values',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  'application/vnd.oasis.opendocument.spreadsheet',
].join(',');

const MAX_BYTES = 10 * 1024 * 1024;

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/* The grid layout as an .xlsx — a spreadsheet, not CSV, because a stockist's
   name sits over its Sales and Closing columns as one merged cell, which
   CSV cannot hold. Values only, as the reader expects them back. SheetJS is
   loaded here, on the download, as it is on an upload. → Uint8Array. */
export async function buildGridWorkbook(entries, products = [], task = SECONDARY) {
  const XLSX = await import('xlsx');
  const rows = buildGridRows(entries, products, task);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = gridMerges(entries.length, task);
  const width = (cells) => Math.min(40, Math.max(10, ...cells.map((c) => String(c ?? '').length + 2)));
  ws['!cols'] = [
    { wch: width(rows.map((r) => r[0])) },
    ...rows[0].slice(1).map((_, j) => ({ wch: task.closing ? 12 : width([rows[0][j + 1]]) })),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, task.closing ? 'Secondary' : 'Doctor Support');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

function extensionOf(name) {
  const m = /\.[^.]+$/.exec(String(name ?? '').toLowerCase());
  return m ? m[0] : '';
}

/* Either layout's header: the rows one, or the grid's Product + Entry rows. */
function hasHeader(rows, task) {
  const required = requiredColumns(task);
  if (gridHeaderIndex(rows.map((r) => (r ?? []).map((c) => String(c ?? '')))) >= 0) return true;
  return rows.some((r) => {
    const cells = (r ?? []).map((c) => String(c ?? '').trim().toLowerCase());
    return required.every((c) => cells.includes(c));
  });
}

/* → { byEntry, errors }, the same shape as csv.parseSheet, for any format. */
export async function readSheetFile(file, task = SECONDARY) {
  if (!file) return { byEntry: new Map(), errors: ['No file chosen.'] };
  if (file.size > MAX_BYTES) {
    return { byEntry: new Map(), errors: ['That file is over 10 MB — a bulk entry sheet is a few KB.'] };
  }
  const ext = extensionOf(file.name);

  if (ext === '.csv' || ext === '.txt' || (!ext && /csv|text/.test(file.type))) {
    return parseSheet(await file.text(), task);
  }
  if (ext && !ACCEPTED_EXTENSIONS.includes(ext)) {
    return { byEntry: new Map(), errors: [`"${file.name}" is not a spreadsheet. Upload CSV, Excel (.xlsx, .xls, .xlsm, .xlsb) or .ods.`] };
  }

  let XLSX;
  try {
    XLSX = await import('xlsx');
  } catch {
    return { byEntry: new Map(), errors: ['Could not load the spreadsheet reader. Save the sheet as CSV and upload that.'] };
  }

  let workbook;
  try {
    workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
      type: 'array',
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: false,
      /* Dates as their text, so nothing reaches the parser as a Date. */
      cellDates: false,
    });
  } catch {
    return { byEntry: new Map(), errors: [`Could not read "${file.name}" — it may be damaged or password protected.`] };
  }

  /* The first sheet that has the expected header: a user may have added a
     notes tab in front of it. Values as the cell shows them (`raw: false`),
     so a qty formatted "1,200" arrives as the text the user sees. */
  for (const name of workbook.SheetNames ?? []) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });
    if (hasHeader(rows, task)) return parseSheetRows(rows, task);
  }
  return {
    byEntry: new Map(),
    errors: [`No sheet in this file has the columns ${sheetColumns(task).join(', ')}, or products down and ${task.parties} across with an Entry row.`],
  };
}
