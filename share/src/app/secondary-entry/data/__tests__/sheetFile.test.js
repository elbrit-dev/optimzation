import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { SHEET_COLUMNS, parseSheetRows } from '../csv';
import { readSheetFile } from '../sheetFile';

const E1 = 'Annai Medicals-2026-07-01';
const E2 = 'Sri, Medical-2026-07-01';

const FILLED = [
  SHEET_COLUMNS,
  [E1, 'Annai Medicals', 'Elbrit-CV', 40, 7],
  [E1, 'Annai Medicals', 'Rabelbrit', '', 3],
  [E2, 'Sri, Medical', 'Elbrit-D3', 12, ''],
  [E2, 'Sri, Medical', 'Telbrit 40', '', ''],
];

/* A File stand-in: the reader only uses name, size, type, text(), arrayBuffer(). */
function fileOf(name, bytes, type = '') {
  const buf = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(bytes);
  return {
    name,
    type,
    size: buf.byteLength,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    text: async () => new TextDecoder().decode(buf),
  };
}

function workbookBytes(bookType, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType }));
}

const EXPECTED = new Map([
  [E1, [{ item: 'Elbrit-CV', salesQty: 40, closingQty: 7 }, { item: 'Rabelbrit', salesQty: 0, closingQty: 3 }]],
  [E2, [{ item: 'Elbrit-D3', salesQty: 12, closingQty: 0 }]],
]);

describe('readSheetFile — every format the sheet comes back as', () => {
  it.each([
    ['xlsx', 'fill.xlsx'],
    ['xlsm', 'fill.xlsm'],
    ['xlsb', 'fill.xlsb'],
    ['biff8', 'fill.xls'],
    ['ods', 'fill.ods'],
  ])('%s', async (bookType, name) => {
    const { byEntry, errors } = await readSheetFile(fileOf(name, workbookBytes(bookType, [['Sheet1', FILLED]])));
    expect(errors).toEqual([]);
    expect(byEntry).toEqual(EXPECTED);
  });

  it('csv stays on the text parser', async () => {
    const csv = FILLED.map((r) => r.map((c) => (String(c).includes(',') ? `"${c}"` : c)).join(',')).join('\r\n');
    const { byEntry, errors } = await readSheetFile(fileOf('fill.csv', csv, 'text/csv'));
    expect(errors).toEqual([]);
    expect(byEntry).toEqual(EXPECTED);
  });

  it('tsv', async () => {
    const tsv = FILLED.map((r) => r.join('\t')).join('\n');
    const { byEntry, errors } = await readSheetFile(fileOf('fill.tsv', tsv));
    expect(errors).toEqual([]);
    expect(byEntry).toEqual(EXPECTED);
  });

  it('skips a notes tab in front and finds the sheet with the header', async () => {
    const bytes = workbookBytes('xlsx', [['Read me', [['Fill Sales and Closing, keep Entry.']]], ['Entries', FILLED]]);
    const { byEntry, errors } = await readSheetFile(fileOf('fill.xlsx', bytes));
    expect(errors).toEqual([]);
    expect(byEntry.get(E1)).toHaveLength(2);
  });

  it('says so when no sheet has the columns', async () => {
    const bytes = workbookBytes('xlsx', [['Sheet1', [['Name', 'Qty'], ['x', 1]]]]);
    const { errors } = await readSheetFile(fileOf('other.xlsx', bytes));
    expect(errors[0]).toMatch(/No sheet in this file has the columns/);
  });

  it('refuses a file that is not a spreadsheet', async () => {
    const { errors } = await readSheetFile(fileOf('photo.jpg', 'not a sheet'));
    expect(errors[0]).toMatch(/not a spreadsheet/);
  });

  it('does not throw on a damaged workbook', async () => {
    const { errors } = await readSheetFile(fileOf('broken.xlsx', new Uint8Array([80, 75, 3, 4, 1, 2, 3])));
    expect(errors).toHaveLength(1);
  });
});

describe('parseSheetRows — the structure check shared by every format', () => {
  it('takes numeric cells and "1,200"-style quantities', () => {
    const { byEntry, errors } = parseSheetRows([SHEET_COLUMNS, [E1, 'A', 'Elbrit-CV', 1200, '1,350']]);
    expect(errors).toEqual([]);
    expect(byEntry.get(E1)).toEqual([{ item: 'Elbrit-CV', salesQty: 1200, closingQty: 1350 }]);
  });

  it('finds the header under a title row, and numbers errors as the file shows them', () => {
    const rows = [['July secondary — Nagercoil'], [], SHEET_COLUMNS, [E1, 'A', 'Elbrit-CV', 2.5, 1]];
    const { byEntry, errors } = parseSheetRows(rows);
    expect(byEntry.size).toBe(0);
    expect(errors).toEqual(['Row 4: quantities must be whole numbers ≥ 0.']);
  });

  it('matches column names case-insensitively, in any order', () => {
    const { byEntry } = parseSheetRows([
      ['closing qty', 'PRODUCT', 'Sales Qty', 'entry'],
      [4, 'Elbrit-CV', 9, E1],
    ]);
    expect(byEntry.get(E1)).toEqual([{ item: 'Elbrit-CV', salesQty: 9, closingQty: 4 }]);
  });
});
