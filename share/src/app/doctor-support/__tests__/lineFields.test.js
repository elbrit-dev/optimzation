import { describe, expect, it } from 'vitest';
import { applySeatLines, lineFields } from '@/app/secondary-entry/data/writes';
import { DOCTOR_SUPPORT, SECONDARY } from '@/app/secondary-entry/data/task';

/* Doctor Support's line fields are role_profile / status / hq / department on
   UAT, custom_* on production: the writer follows the record. */
const uatLine = (over) => ({ doctype: 'Support Items', item: 'A', qty: 0, amount: 0, role_profile: 'BE1', status: 'Draft', hq: 'HQ-1', department: 'D1', ...over });
const prodLine = (over) => ({ doctype: 'Support Items', item: 'A', qty: 0, amount: 0, rate: 0, brand: null, custom_role_profile: 'BE1', custom_status: 'Draft', custom_hq: 'HQ-1', custom_department: 'D1', ...over });

describe('lineFields', () => {
  it("takes the names the record's lines carry", () => {
    expect(lineFields([uatLine()], DOCTOR_SUPPORT).roleProfile).toBe('role_profile');
    expect(lineFields([prodLine()], DOCTOR_SUPPORT)).toMatchObject({ roleProfile: 'custom_role_profile', status: 'custom_status', hq: 'custom_hq', department: 'custom_department', qty: 'qty', value: 'amount' });
  });
  it('keeps the task names without lines, or for a task with one set', () => {
    expect(lineFields([], DOCTOR_SUPPORT).roleProfile).toBe('role_profile');
    expect(lineFields([prodLine()], SECONDARY)).toBe(SECONDARY.fields);
  });
});

describe('applySeatLines on both ERPs', () => {
  const lines = [{ item: 'A', salesQty: 3, price: 10 }, { item: 'B', salesQty: 2, price: 5 }];
  it('UAT names', () => {
    const doc = { item_table: [uatLine(), uatLine({ item: 'Z', role_profile: 'BE2' })] };
    const out = applySeatLines(doc, { roleProfile: 'BE1', lines, submit: true }, DOCTOR_SUPPORT).item_table;
    expect(out[0]).toMatchObject({ item: 'A', qty: 3, amount: 30, status: 'Submitted' });
    expect(out[1]).toBe(doc.item_table[1]); // another seat's line, untouched
    expect(out[2]).toMatchObject({ item: 'B', role_profile: 'BE1', status: 'Submitted', hq: 'HQ-1', department: 'D1', qty: 2, amount: 10 });
  });
  it('production names', () => {
    const doc = { item_table: [prodLine(), prodLine({ item: 'Z', custom_role_profile: 'BE2' })] };
    const out = applySeatLines(doc, { roleProfile: 'BE1', lines, submit: false }, DOCTOR_SUPPORT).item_table;
    expect(out[0]).toMatchObject({ item: 'A', qty: 3, amount: 30, custom_status: 'Draft' });
    expect(out[0]).not.toHaveProperty('status');
    expect(out[1]).toBe(doc.item_table[1]);
    expect(out[2]).toMatchObject({ item: 'B', custom_role_profile: 'BE1', custom_status: 'Draft', custom_hq: 'HQ-1', custom_department: 'D1' });
    expect(out[2]).not.toHaveProperty('role_profile');
  });
});
