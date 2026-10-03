import { describe, expect, it, vi } from 'vitest';
import { sendSheet, sheetBaseName } from '../writes';
import { DOCTOR_SUPPORT, SECONDARY } from '../task';

const file = () => new File(['Product,DR-1\nA,4\n'], 'doctor-support-2026-09-grid.xlsx');
const ok = (docnames) => ({ ok: true, status: 200, json: async () => ({ message: { file_url: '/private/files/x.xlsx', docnames } }) });
const fail = (status, body = {}) => ({ ok: false, status, json: async () => body });
const send = (fetchImpl, extra = {}) =>
  sendSheet({ origin: 'https://erp', token: 'token k:s', task: DOCTOR_SUPPORT, file: file(), names: ['DR-1', 'DR-2'], fetchImpl, wait: async () => {}, ...extra });

describe('keeping the uploaded sheet on every entry it fills', () => {
  it('sends the file once with every record and the Transformed Data field', async () => {
    const fetchImpl = vi.fn(async () => ok(['DR-1', 'DR-2']));
    await expect(send(fetchImpl)).resolves.toMatchObject({ docnames: ['DR-1', 'DR-2'] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://erp/api/method/upload_to_field');
    expect(init.headers).toEqual({ Authorization: 'token k:s' });
    const form = init.body;
    expect(form.get('doctype')).toBe('Doctor Support');
    expect(form.get('fieldname')).toBe('custom_transformed_data');
    expect(JSON.parse(form.get('docnames'))).toEqual(['DR-1', 'DR-2']);
    expect(form.get('docname')).toBe('DR-1');
    expect(form.get('file').name).toBe('doctor-support-2026-09-grid.xlsx');
  });

  it('sends each record once', async () => {
    const fetchImpl = vi.fn(async () => ok(['DR-1', 'DR-2']));
    await send(fetchImpl, { names: ['DR-1', 'DR-2', 'DR-1', ''] });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body.get('docnames'))).toEqual(['DR-1', 'DR-2']);
  });

  it('retries a dropped connection and a 5xx, then keeps the file', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(fail(502))
      .mockResolvedValueOnce(ok(['DR-1', 'DR-2']));
    await expect(send(fetchImpl)).resolves.toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('gives up after three tries, saying so', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(send(fetchImpl)).rejects.toThrow(/Could not reach ERP/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not retry a refusal, and passes on ERP’s reason', async () => {
    const fetchImpl = vi.fn(async () => fail(417, { exc_type: 'ValidationError', exception: 'frappe.exceptions.ValidationError: Not permitted to update Doctor Support DR-2' }));
    await expect(send(fetchImpl)).rejects.toThrow('Not permitted to update Doctor Support DR-2');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('treats a script that kept only some records as a failure, not a save', async () => {
    const fetchImpl = vi.fn(async () => ok(undefined));
    await expect(send(fetchImpl)).rejects.toThrow(/kept the file on 0 of 2 records/);
    const partial = vi.fn(async () => ok(['DR-1']));
    await expect(send(partial)).rejects.toThrow(/1 of 2 records/);
  });

  it('refuses an empty file without calling ERP', async () => {
    const fetchImpl = vi.fn();
    await expect(send(fetchImpl, { file: new File([], 'empty.xlsx') })).rejects.toThrow(/empty/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('names a nameless file after the task, and reads a non-File in', async () => {
    const fetchImpl = vi.fn(async () => ok(['E-1']));
    const bytes = new TextEncoder().encode('x');
    await sendSheet({
      origin: 'https://erp', token: 't', task: SECONDARY, names: ['E-1'], fetchImpl, wait: async () => {},
      file: { arrayBuffer: async () => bytes.buffer },
    });
    expect(fetchImpl.mock.calls[0][1].body.get('file').name).toBe('secondary-entry.xlsx');
  });

  it('sends each record’s file name — "<seat>-<party>-<month>" — for ERP to number', async () => {
    const fetchImpl = vi.fn(async () => ok(['DR-1', 'DR-2']));
    await send(fetchImpl, {
      names: [
        { name: 'DR-1', base: sheetBaseName({ seat: 'BE4-CHE', party: 'Dr A', month: '2026-09' }) },
        { name: 'DR-2', base: sheetBaseName({ seat: 'BE4-CHE', party: 'Dr B', month: '2026-09' }) },
      ],
    });
    const form = fetchImpl.mock.calls[0][1].body;
    expect(JSON.parse(form.get('docnames'))).toEqual(['DR-1', 'DR-2']);
    expect(JSON.parse(form.get('filenames'))).toEqual({ 'DR-1': 'BE4-CHE-Dr A-2026-09', 'DR-2': 'BE4-CHE-Dr B-2026-09' });
  });

  it('builds the name without what a file name or URL cannot carry', () => {
    expect(sheetBaseName({ seat: 'BE4-CHE', party: 'Sri Ram Medicals / Agencies #2', month: '2026-09' })).toBe('BE4-CHE-Sri Ram Medicals Agencies 2-2026-09');
    expect(sheetBaseName({ seat: null, party: 'Dr A', month: '2026-09' })).toBe('Dr A-2026-09');
  });

  it('does nothing when there is no record to keep it on', async () => {
    const fetchImpl = vi.fn();
    await expect(send(fetchImpl, { names: [] })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
