import { describe, it, expect } from 'vitest';
import { normalDataSource } from '../dataSources.js';

function makeRows(count) {
  return Array.from({ length: count }, (_, i) => ({
    id:    i + 1,
    name:  `Item ${i + 1}`,
    qty:   (i + 1) * 10,
    active: i % 2 === 0,
  }));
}

describe('normalDataSource', () => {
  it('wraps scalar values as { value, repr }', async () => {
    const ds = normalDataSource([{ name: 'Test', qty: 5 }]);
    const { rows } = await ds({ filters: {}, sortBy: {}, pagination: { first: 0, rows: 25 }, viewParams: {} });
    expect(rows[0].name).toEqual({ value: 'Test', repr: 'Test' });
    expect(rows[0].qty).toEqual({ value: 5, repr: 5 });
  });

  it('handles null and undefined cell values', async () => {
    const ds = normalDataSource([{ name: null, qty: undefined }]);
    const { rows } = await ds({ filters: {}, sortBy: {}, pagination: { first: 0, rows: 25 }, viewParams: {} });
    expect(rows[0].name.value).toBeNull();
  });

  it('applies text filter', async () => {
    const ds = normalDataSource(makeRows(5));
    const { rows, totalRecords } = await ds({
      filters: { name: { type: 'text', value: 'Item 3' } },
      sortBy: {},
      pagination: { first: 0, rows: 25 },
      viewParams: {},
    });
    expect(rows).toHaveLength(1);
    expect(totalRecords).toBe(1);
    expect(rows[0].name.value).toBe('Item 3');
  });

  it('applies sort', async () => {
    const ds = normalDataSource(makeRows(5));
    const { rows } = await ds({
      filters: {},
      sortBy: { qty: 'desc' },
      pagination: { first: 0, rows: 25 },
      viewParams: {},
    });
    expect(rows[0].qty.value).toBeGreaterThan(rows[1].qty.value);
  });

  it('paginates correctly', async () => {
    const ds = normalDataSource(makeRows(10));
    const { rows, totalRecords } = await ds({
      filters: {},
      sortBy: {},
      pagination: { first: 5, rows: 3 },
      viewParams: {},
    });
    expect(rows).toHaveLength(3);
    expect(totalRecords).toBe(10);
    expect(rows[0].id.value).toBe(6);
  });

  it('returns correct totalRecords', async () => {
    const ds = normalDataSource(makeRows(7));
    const { totalRecords } = await ds({
      filters: {},
      sortBy: {},
      pagination: { first: 0, rows: 3 },
      viewParams: {},
    });
    expect(totalRecords).toBe(7);
  });

  it('empty data returns empty rows and totalRecords=0', async () => {
    const ds = normalDataSource([]);
    const { rows, totalRecords } = await ds({
      filters: {},
      sortBy: {},
      pagination: { first: 0, rows: 25 },
      viewParams: {},
    });
    expect(rows).toHaveLength(0);
    expect(totalRecords).toBe(0);
  });
});
