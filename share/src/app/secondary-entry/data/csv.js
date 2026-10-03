/* Bulk entry via a spreadsheet, in either of two LAYOUTS — the upload reads
 * both, whichever comes back:
 *
 *   rows   one row per stockist × product: Entry, Stockist, Product, Sales
 *          Qty, Closing Qty (Doctor Support: Qty).
 *   grid   products down the first column, stockists across the first row
 *          as their ERP ENTRY ("<stockist>-<date>", so a column is never
 *          ambiguous when two stockists share a name) — for Secondary over
 *          two merged cells with Sales and Closing under them; Doctor
 *          Support one column per doctor. A cell a stockist does not take
 *          (another seat carries that product there) holds "-". Downloaded
 *          as .xlsx, so the cells can merge.
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
  const party = task.sheetIdentity ? [task.codeLabel, `${task.Party} name`] : [task.Party];
  return task.closing ? ['Entry', ...party, 'Product', 'Sales Qty', 'Closing Qty'] : ['Entry', ...party, 'Product', 'Qty'];
}

/* Doctor Support's grid names each doctor under its entry: a code row and a
   name row, for the reader only — the upload skips them by their label. */
function identityLabels(task) {
  return task.sheetIdentity ? [task.codeLabel, `${task.Party} name`] : [];
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
    const party = task.sheetIdentity ? [e.ebsCode ?? '', e.stockist] : [e.stockist];
    for (const l of items) {
      rows.push(
        task.closing
          ? [e.name, ...party, l.item, l.salesQty || '', l.closingQty || '']
          : [e.name, ...party, l.item, l.salesQty || ''],
      );
    }
  }
  return rows;
}

/* Products down, stockists across: "Product" over the product column, a
   column per stockist headed by its entry — for Secondary two, the entry
   over both (merged: see gridMerges) with Sales and Closing under.
   EVERY product of the list (the seat's department's, from the server) is
   a row for every stockist — its figures where it has them, "-" where
   another seat carries that product there, else blank to fill — and then
   any a stockist carries that the list does not. */
export const GRID_PRODUCT = 'Product';
const NOT_TAKEN = '-';

export function buildGridRows(entries, products = [], task = SECONDARY) {
  const order = [];
  const seen = new Set();
  const add = (item) => {
    if (item && !seen.has(item)) {
      seen.add(item);
      order.push(item);
    }
  };
  const itemsOf = entries.map((e) => ({ entry: e, taken: new Set(e.otherItems ?? []), byItem: new Map(e.lines.map((l) => [l.item, l])) }));
  products.forEach((p) => add(p.item));
  itemsOf.forEach((x) => [...x.byItem.keys()].forEach(add));

  const header = [GRID_PRODUCT];
  const kinds = [''];
  for (const { entry } of itemsOf) {
    if (task.closing) {
      header.push(entry.name, '');
      kinds.push('Sales', 'Closing');
    } else {
      header.push(entry.name);
    }
  }
  const rows = task.closing ? [header, kinds] : [header];
  if (task.sheetIdentity) {
    rows.push([identityLabels(task)[0], ...itemsOf.map(({ entry }) => entry.ebsCode ?? '')]);
    rows.push([identityLabels(task)[1], ...itemsOf.map(({ entry }) => entry.stockist ?? '')]);
  }
  for (const item of order) {
    const row = [item];
    for (const { taken, byItem } of itemsOf) {
      const l = byItem.get(item);
      const cells = l ? [l.salesQty || '', l.closingQty || ''] : taken.has(item) ? [NOT_TAKEN, NOT_TAKEN] : ['', ''];
      row.push(...(task.closing ? cells : cells.slice(0, 1)));
    }
    rows.push(row);
  }
  return rows;
}

/* The grid's merged cells, as SheetJS ranges: each stockist's name over its
   Sales and Closing columns, and "Product" over the row beneath it
   (Secondary only — Doctor Support has one column per doctor). */
export function gridMerges(entryCount, task = SECONDARY) {
  if (!task.closing) return [];
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }];
  for (let i = 0; i < entryCount; i += 1) merges.push({ s: { r: 0, c: 1 + i * 2 }, e: { r: 0, c: 2 + i * 2 } });
  return merges;
}

/* The sheet as CSV text, in either layout. */
export function buildSheet(entries, products = [], task = SECONDARY, layout = 'rows') {
  return (layout === 'grid' ? buildGridRows(entries, products, task) : buildSheetRows(entries, products, task))
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
  const grid = gridHeader(rows);
  if (grid) return parseGrid(rows, grid, task);

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
    if (isNotTaken(r[iSales]) && (iClosing < 0 || isNotTaken(r[iClosing]))) return;
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

/* The grid layout's header: a row starting "Product" (the rows layout
   starts "Entry"), the entries across it; for Secondary, the Sales /
   Closing row under it. → the Product row's index, or -1. */
export function gridHeaderIndex(rows) {
  return gridHeader(rows)?.at ?? -1;
}

function gridHeader(rows) {
  const first = (r) => String(r?.[0] ?? '').trim().toLowerCase();
  const isKinds = (r) => (r ?? []).some((c) => /^(sales|closing)$/i.test(String(c ?? '').trim()));
  for (let i = 0; i < rows.length; i += 1) {
    if (first(rows[i]) !== GRID_PRODUCT.toLowerCase()) continue;
    return isKinds(rows[i + 1]) ? { at: i, kinds: i + 1, dataAt: i + 2 } : { at: i, kinds: null, dataAt: i + 1 };
  }
  return null;
}

/* A cell that stands for "not this stockist's" — or a dash someone typed. */
function isNotTaken(raw) {
  return ['—', '–', '-', 'n/a', 'na'].includes(String(raw ?? '').trim().toLowerCase());
}

function parseGrid(rows, { at, kinds: kindsAt, dataAt }, task) {
  const header = rows[at];
  const kinds = kindsAt != null ? rows[kindsAt] : null;
  /* Each entry's columns: sales (Doctor Support: qty) and closing, as the
     Sales / Closing row names them. The entry heads its columns — a merged
     cell's value sits in the first of its cells, so a blank header cell
     belongs to the last entry seen. */
  const width = Math.max(header.length, kinds?.length ?? 0);
  const columns = new Map();
  let entry = '';
  for (let j = 1; j < width; j += 1) {
    entry = String(header[j] ?? '').trim() || entry;
    if (!entry) continue;
    if (!columns.has(entry)) columns.set(entry, { entry, sales: -1, closing: -1 });
    const c = columns.get(entry);
    if (task.closing && /^closing$/i.test(String(kinds?.[j] ?? '').trim())) c.closing = j;
    else if (c.sales < 0) c.sales = j;
  }
  if (!columns.size) return { byEntry: new Map(), errors: [`The header row names no ${task.parties} — keep it as downloaded.`] };

  const toQty = (raw) => (raw === '' ? 0 : Number(raw.replace(/[,\s]/g, '')));
  const byEntry = new Map();
  const errors = [];
  const identity = new Set(identityLabels(task).map((l) => l.toLowerCase()));
  rows.slice(dataAt).forEach((r, idx) => {
    const item = String(r[0] ?? '').trim();
    if (!item || identity.has(item.toLowerCase())) return;
    for (const c of columns.values()) {
      const cell = (j) => (j >= 0 ? String(r[j] ?? '').trim() : '');
      let salesRaw = cell(c.sales);
      let closingRaw = cell(c.closing);
      if (isNotTaken(salesRaw)) salesRaw = '';
      if (isNotTaken(closingRaw)) closingRaw = '';
      if (salesRaw === '' && closingRaw === '') continue;
      const salesQty = toQty(salesRaw);
      const closingQty = toQty(closingRaw);
      if (![salesQty, closingQty].every((n) => Number.isInteger(n) && n >= 0)) {
        errors.push(`Row ${dataAt + 1 + idx}, ${c.entry}: quantities must be whole numbers ≥ 0.`);
        continue;
      }
      if (!byEntry.has(c.entry)) byEntry.set(c.entry, []);
      byEntry.get(c.entry).push({ item, salesQty, closingQty });
    }
  });
  return { byEntry, errors };
}
