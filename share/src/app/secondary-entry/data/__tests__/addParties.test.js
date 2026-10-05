import { afterEach, describe, expect, it, vi } from 'vitest';
import { createErpWriter } from '../writes';
import { DOCTOR_SUPPORT, SECONDARY } from '../task';

describe('writer.addParties ("Add doctor")', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the chosen doctors (the script picks the previous month) to the task's add script, as the user", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ message: { created: ['DR-1-2026-September'], added: [], skipped: [] } }) }));
    vi.stubGlobal('fetch', fetchImpl);
    const writer = createErpWriter({ endpointUrl: 'https://erp.test/api/method/graphql', gqlToken: 'k:s', task: DOCTOR_SUPPORT });

    await expect(writer.addParties({ parties: ['DR-1'] })).resolves.toEqual({ created: ['DR-1-2026-September'], added: [], skipped: [] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://erp.test/api/method/elbrit_doctor_support_add');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('token k:s');
    expect(JSON.parse(init.body)).toEqual({ doctors: ['DR-1'] });
  });

  it("surfaces the script's refusal", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 417, json: async () => ({ exc_type: 'ValidationError', exception: 'frappe.exceptions.ValidationError: Add at most 20 doctors at a time.' }) })));
    const writer = createErpWriter({ endpointUrl: 'https://erp.test/api/method/graphql', gqlToken: 'k:s', task: DOCTOR_SUPPORT });
    await expect(writer.addParties({ parties: ['DR-1'] })).rejects.toThrow('Add at most 20 doctors at a time.');
  });

  it("posts Secondary's stockists to its own add script", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ message: { created: [], added: ['Medisure-2026-09-01'], skipped: [] } }) }));
    vi.stubGlobal('fetch', fetchImpl);
    const writer = createErpWriter({ endpointUrl: 'https://erp.test/api/method/graphql', gqlToken: 'k:s', task: SECONDARY });

    await writer.addParties({ parties: ['Medisure'] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://erp.test/api/method/elbrit_secondary_add');
    expect(JSON.parse(init.body)).toEqual({ stockists: ['Medisure'] });
  });

  it('is refused for a task with no add', () => {
    const writer = createErpWriter({ endpointUrl: 'https://erp.test/api/method/graphql', gqlToken: 'k:s', task: { ...SECONDARY, addMethod: undefined } });
    expect(() => writer.addParties({ parties: ['X'] })).toThrow('Stockists cannot be added here.');
  });
});
