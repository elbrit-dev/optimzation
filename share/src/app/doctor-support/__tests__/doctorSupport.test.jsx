import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DOCTOR_SUPPORT, SECONDARY } from '@/app/secondary-entry/data/task';
import { applySeatLines } from '@/app/secondary-entry/data/writes';
import { buildSheetRows, parseSheetRows } from '@/app/secondary-entry/data/csv';
import { normalizeEntry } from '@/app/secondary-entry/data/shape';

vi.mock('@/app/graphql-playground/constants', () => ({
  getEndpointConfigFromUrlKeyAsync: async () => ({ endpointUrl: 'https://erp.test/api/method/graphql' }),
}));

const { DoctorSupportEntry } = await import('../components/DoctorSupportEntry');

describe('Doctor Support writes', () => {
  const doc = {
    name: 'DR-4725-2026-08-28',
    item_table: [
      { item: 'CILNITAB 10', qty: 0, amount: 0, role_profile: 'BE3-X', status: 'Draft', hq: 'HQ-A', department: 'D' },
      { item: 'ELVIX GEL 50GM', qty: 5, amount: 500, role_profile: 'BE13-Y', status: 'Submitted' },
    ],
  };

  it("writes the seat's qty and amount (qty x PTS) to item_table, others untouched", () => {
    const next = applySeatLines(doc, {
      roleProfile: 'BE3-X',
      submit: true,
      lines: [{ item: 'CILNITAB 10', price: 86.78, salesQty: 10 }, { item: 'TELBRIT 40', price: 50, salesQty: 2 }],
    }, DOCTOR_SUPPORT);
    const [mine, other, added] = next.item_table;
    expect(mine).toMatchObject({ item: 'CILNITAB 10', qty: 10, amount: 867.8, status: 'Submitted', role_profile: 'BE3-X' });
    expect(mine).not.toHaveProperty('sales_qty');
    expect(other).toBe(doc.item_table[1]);
    expect(added).toMatchObject({
      doctype: 'Support Items', parentfield: 'item_table', item: 'TELBRIT 40',
      qty: 2, amount: 100, role_profile: 'BE3-X', status: 'Submitted', hq: 'HQ-A', department: 'D',
    });
    expect(next).not.toHaveProperty('items');
  });

  it('keeps writing Secondary as before by default', () => {
    const next = applySeatLines({ items: [] }, { roleProfile: 'BE1', submit: false, lines: [{ item: 'A', price: 10, salesQty: 2, closingQty: 3 }] });
    expect(next.items[0]).toMatchObject({ custom_role_profile: 'BE1', custom_status: 'Draft', sales_qty: 2, sales_value: 20, closing_qty: 3, closing_balance: 30 });
  });
});

describe('Doctor Support sheet', () => {
  const entry = normalizeEntry({ name: 'DR-1-2026-08-01', date: '2026-08-01', distributor: { customer_name: 'Dr A' }, items: [] }, 'BE3-X');

  it('has one Qty column and the Doctor as the party', () => {
    const rows = buildSheetRows([entry], [{ item: 'CILNITAB 10' }], DOCTOR_SUPPORT);
    expect(rows[0]).toEqual(['Entry', 'Doctor', 'Product', 'Qty']);
    expect(rows[1]).toEqual(['DR-1-2026-08-01', 'Dr A', 'CILNITAB 10', '']);
  });

  it('reads a Qty sheet back, and a Secondary sheet still needs both columns', () => {
    const { byEntry, errors } = parseSheetRows([['Entry', 'Doctor', 'Product', 'Qty'], ['DR-1-2026-08-01', 'Dr A', 'CILNITAB 10', '12']], DOCTOR_SUPPORT);
    expect(errors).toEqual([]);
    expect(byEntry.get('DR-1-2026-08-01')).toEqual([{ item: 'CILNITAB 10', salesQty: 12, closingQty: 0 }]);
    expect(parseSheetRows([['Entry', 'Product', 'Qty'], ['E', 'P', '1']], SECONDARY).errors[0]).toMatch(/Missing columns/);
  });
});

describe('DoctorSupportEntry', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads from its own server script and shows doctors, with no closing', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        json: async () => ({
          message: {
            user: 'be@x.org', seat: 'BE3-X', month: '2026-08',
            entries: [{
              name: 'DR-4725-2026-08-28', date: '2026-08-28', distributor__name: 'DR-4725',
              distributor: { name: 'DR-4725', customer_name: 'Dr Prathap', whg_ebs_code: 'DR-4725', territory__name: 'HQ-Chennai', note: 'Diabeto · Maduranthagam' },
              items: [{ name: 'l1', item__name: 'CILNITAB 10', custom_status: 'Draft', sales_qty: 3, closing_qty: 0, custom_last_pts: 100, sales_value: 300, closing_balance: 0, custom_role_profile__name: 'BE3-X' }],
              other_items: [], custom_status_tracker: [],
            }],
            products: [],
          },
        }),
      };
    }));
    render(<DoctorSupportEntry gqlToken="k:s" />);
    expect(await screen.findByText('Dr Prathap')).toBeInTheDocument();
    expect(calls[0]).toContain('/api/method/elbrit_doctor_support_entry');
    expect(screen.getByText('Doctor support')).toBeInTheDocument();
    expect(screen.getByText('Doctors entered')).toBeInTheDocument();
    expect(screen.getByText('Diabeto · Maduranthagam')).toBeInTheDocument();
    expect(screen.queryByText('Closing')).toBeNull();
  });
});
