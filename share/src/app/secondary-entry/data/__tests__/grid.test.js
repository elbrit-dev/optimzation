import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildGridRows, buildSheet, gridMerges, parseSheet, parseSheetRows } from '../csv';
import { buildGridWorkbook, readSheetFile } from '../sheetFile';
import { DOCTOR_SUPPORT } from '../task';

const A = { name: 'Annai Medicals-2026-08-01', stockist: 'Annai Medicals', lines: [{ item: 'ELBRIT CV', salesQty: 4, closingQty: 1 }], otherItems: ['TELBRIT 40'] };
const B = { name: 'Annai Medicals-2026-08-02', stockist: 'Annai Medicals', lines: [], otherItems: [] };
const PRODUCTS = [{ item: 'TELBRIT 40' }, { item: 'ELBRIT CV' }, { item: 'RABELBRIT' }];

const fileOf = (name, bytes) => ({ name, type: '', size: bytes.byteLength, arrayBuffer: async () => bytes.buffer, text: async () => '' });

describe('the grid layout: products down, stockists across', () => {
  it('heads each stockist by its entry over two merged cells, Sales and Closing under', () => {
    const rows = buildGridRows([A, B], PRODUCTS);
    expect(rows[0]).toEqual(['Product', A.name, '', B.name, '']);
    expect(rows[1]).toEqual(['', 'Sales', 'Closing', 'Sales', 'Closing']);
    /* In the product list's order; A takes only its own line, B (no lines
       yet) every product; TELBRIT 40 is another seat's on A. */
    expect(rows.slice(2)).toEqual([
      ['TELBRIT 40', '-', '-', '', ''],
      ['ELBRIT CV', 4, 1, '', ''],
      ['RABELBRIT', '', '', '', ''],
    ]);
    expect(gridMerges(2)).toEqual([
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 0, c: 2 } },
      { s: { r: 0, c: 3 }, e: { r: 0, c: 4 } },
    ]);
  });

  it('has one column per doctor for Doctor Support, its code and name under the entry, and nothing merged', () => {
    const rows = buildGridRows([{ ...A, ebsCode: 'CRM-LEAD-1', otherItems: [] }], PRODUCTS, DOCTOR_SUPPORT);
    expect(rows[0]).toEqual(['Product', A.name]);
    expect(rows.slice(1, 3)).toEqual([['Doctor code', 'CRM-LEAD-1'], ['Doctor name', A.stockist]]);
    expect(rows.slice(3)).toEqual([['TELBRIT 40', ''], ['ELBRIT CV', 4], ['RABELBRIT', '']]);
    expect(gridMerges(1, DOCTOR_SUPPORT)).toEqual([]);
    expect(parseSheetRows(rows, DOCTOR_SUPPORT).byEntry.get(A.name)).toEqual([{ item: 'ELBRIT CV', salesQty: 4, closingQty: 0 }]);
  });

  it('lists every product of the list for every stockist, entered or not', () => {
    const rows = buildGridRows([A], PRODUCTS);
    expect(rows.slice(2).map((r) => r[0])).toEqual(['TELBRIT 40', 'ELBRIT CV', 'RABELBRIT']);
    expect(rows[4]).toEqual(['RABELBRIT', '', '']);
  });

  it('reads a filled grid back per entry — same-named stockists apart by their entry — and skips blanks and dashes', () => {
    const rows = buildGridRows([A, B], PRODUCTS);
    rows[3][1] = '40';
    rows[3][2] = '7';
    rows[4][3] = '1,200';
    rows[2][3] = '-';
    const { byEntry, errors } = parseSheetRows(rows);
    expect(errors).toEqual([]);
    expect(byEntry).toEqual(
      new Map([
        [A.name, [{ item: 'ELBRIT CV', salesQty: 40, closingQty: 7 }]],
        [B.name, [{ item: 'RABELBRIT', salesQty: 1200, closingQty: 0 }]],
      ]),
    );
  });

  it('names the row and entry of a bad quantity', () => {
    const rows = buildGridRows([A], PRODUCTS);
    rows[2][1] = '2.5';
    expect(parseSheetRows(rows).errors).toEqual([`Row 3, ${A.name}: quantities must be whole numbers ≥ 0.`]);
  });

  it('downloads as an .xlsx with the entries merged, and reads it back', async () => {
    const bytes = await buildGridWorkbook([A, B], PRODUCTS);
    const ws = XLSX.read(bytes, { type: 'array' }).Sheets.Secondary;
    expect(ws['!merges'].map((m) => XLSX.utils.encode_range(m))).toEqual(['A1:A2', 'B1:C1', 'D1:E1']);
    expect([ws.B1.v, ws.B2.v, ws.C2.v]).toEqual([A.name, 'Sales', 'Closing']);

    const { byEntry, errors } = await readSheetFile(fileOf('grid.xlsx', bytes));
    expect(errors).toEqual([]);
    expect(byEntry.get(A.name)).toEqual([{ item: 'ELBRIT CV', salesQty: 4, closingQty: 1 }]);
  });

  it('a CSV copy of the grid reads too, and the rows layout still does', () => {
    expect(parseSheet(buildSheet([A, B], PRODUCTS, undefined, 'grid')).byEntry.get(A.name)).toEqual([{ item: 'ELBRIT CV', salesQty: 4, closingQty: 1 }]);
    expect(parseSheet(buildSheet([A], PRODUCTS)).byEntry.get(A.name)).toEqual([{ item: 'ELBRIT CV', salesQty: 4, closingQty: 1 }]);
  });
});
