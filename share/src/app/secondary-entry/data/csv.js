/* Bulk entry via a spreadsheet: one row per stockist × product.
 *
 * FORMAT-FREE HERE. This module works on a table — an array of rows, each an
 * array of cells — which is what every format becomes once read: data/
 * sheetFile.js turns .xlsx / .xls / .xlsm / .xlsb / .ods / .csv into one and
 * back. The CSV text helpers below remain for the plain-text path and tests.
 *
 * The Entry column (the ERP docname) is what makes the upload unambiguous
 * when two stockists share a display name. */

import { SECONDARY } from './task';

/* The columns, per task: Secondary keys sales and closing, Doctor Support
   one qty. The party column is named for the task (Stockist / Doctor). */
export function sheetColumns(task = SECONDARY) {
  return task.closing ? ['Entry', task.Party, 'Product', 'Sales Qty', 'Closing Qty'] : ['Entry', task.Party, 'Product', 'Qty'];
}
export const SHEET_COLUMNS = sheetColumns(SECONDARY);

/* The columns an upload must carry (lower-cased) — the party column is only
   for the reader. */
export function requiredColumns(task = SECONDARY) {
  return task.closing ? ['entry', 'product', 'sales qty', 'closing qty'] : ['entry', 'product', 'qty'];
}

function escapeCell(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* The sheet as a table, header first. Pending stockists only; a stockist
   with no lines yet gets one row per offered product so the sheet has
   something to fill. */
export function buildSheetRows(entries, products = [], task = SECONDARY) {
  const rows = [sheetColumns(task)];
  for (const e of entries) {
    /* No lines yet: every product — except those another seat carries on
       this stockist, which are theirs to fill, not this seat's. */
    const taken = new Set(e.otherItems ?? []);
    const items = e.lines.length
      ? e.lines
      : products.filter((p) => !taken.has(p.item)).map((p) => ({ item: p.item, salesQty: '', closingQty: '' }));
    for (const l of items) {
      rows.push(
        task.closing
          ? [e.name, e.stockist, l.item, l.salesQty || '', l.closingQty || '']
          : [e.name, e.stockist, l.item, l.salesQty || ''],
      );
    }
  }
  return rows;
}

/* The same table as CSV text. */
export function buildSheet(entries, products = [], task = SECONDARY) {
  return buildSheetRows(entries, products, task)
    .map((r) => r.map(escapeCell).join(','))
    .join('\r\n');
}

/* RFC-4180-ish: quoted cells, doubled quotes, CRLF or LF. */
function parseRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/* CSV text → { byEntry, errors }. */
export function parseSheet(text, task = SECONDARY) {
  return parseSheetRows(parseRows(String(text ?? '').replace(/^﻿/, '')), task);
}

/* A table from any format → { byEntry: Map<entryName, [{ item, salesQty,
   closingQty }]>, errors }. Cells may arrive as strings (CSV) or as numbers
   (a spreadsheet stores 40 as a number), so everything is stringified first.
   The header can sit below a title row someone added: the first row that
   carries all four required columns is taken as the header. */
export function parseSheetRows(input, task = SECONDARY) {
  /* Blank rows are KEPT (the loop below skips them) so the row numbers in
     error messages match the file. */
  const rows = (Array.isArray(input) ? input : []).map((r) =>
    Array.isArray(r) ? r.map((c) => (c == null ? '' : String(c))) : [],
  );
  const errors = [];
  if (!rows.some((r) => r.some((c) => c.trim() !== ''))) return { byEntry: new Map(), errors: ['The file is empty.'] };

  const required = requiredColumns(task);
  const headerIndex = rows.findIndex((r) => {
    const cells = r.map((h) => h.trim().toLowerCase());
    return required.every((c) => cells.includes(c));
  });
  if (headerIndex > 0) rows.splice(0, headerIndex);

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name.toLowerCase());
  const iEntry = col('Entry');
  const iProduct = col('Product');
  const iSales = col(task.closing ? 'Sales Qty' : 'Qty');
  const iClosing = task.closing ? col('Closing Qty') : -1;
  if (iEntry < 0 || iProduct < 0 || iSales < 0 || (task.closing && iClosing < 0)) {
    return { byEntry: new Map(), errors: [`Missing columns — expected ${sheetColumns(task).join(', ')}.`] };
  }

  /* "1,200" is how Excel users type a thousand-and-two-hundred. */
  const toQty = (raw) => (raw === '' ? 0 : Number(raw.replace(/[,\s]/g, '')));
  /* Row numbers as the file shows them, header and any title rows counted. */
  const firstDataRow = Math.max(headerIndex, 0) + 2;

  const byEntry = new Map();
  rows.slice(1).forEach((r, idx) => {
    const entry = r[iEntry]?.trim();
    const item = r[iProduct]?.trim();
    const salesRaw = r[iSales]?.trim() ?? '';
    const closingRaw = iClosing >= 0 ? (r[iClosing]?.trim() ?? '') : '';
    if (!entry || !item) return;
    if (salesRaw === '' && closingRaw === '') return;
    const salesQty = toQty(salesRaw);
    const closingQty = toQty(closingRaw);
    if (![salesQty, closingQty].every((n) => Number.isInteger(n) && n >= 0)) {
      errors.push(`Row ${idx + firstDataRow}: quantities must be whole numbers ≥ 0.`);
      return;
    }
    if (!byEntry.has(entry)) byEntry.set(entry, []);
    byEntry.get(entry).push({ item, salesQty, closingQty });
  });
  return { byEntry, errors };
}
