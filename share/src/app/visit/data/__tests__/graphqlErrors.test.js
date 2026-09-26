import { describe, expect, it, vi, afterEach } from 'vitest';
vi.mock('@/app/graphql-playground/constants', () => ({
  getEndpointConfigFromUrlKeyAsync: async () => ({ endpointUrl: 'https://erp.example.com/api/method/graphql' }),
}));

import { fetchVisitDataset } from '../liveSource';

/* The ERP has THREE failure shapes and only one of them used to be handled.
   A wrong token returns `exception` with no `errors` and no `data`, which the
   screen reported as "Cannot read properties of undefined (reading
   'Employees')" -- naming an internal field instead of the one fact that
   mattered. */

function respondWith(body, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    status,
    json: async () => body,
  }));
}

afterEach(() => { vi.unstubAllGlobals(); });

const run = () => fetchVisitDataset({ anchorDate: '2026-09-22', gqlToken: 'token abc:def' });

describe('graphqlRequest error shapes', () => {
  it('names the auth failure instead of crashing on undefined', async () => {
    respondWith({ exception: 'frappe.exceptions.AuthenticationError', exc_type: 'AuthenticationError' }, 401);
    await expect(run()).rejects.toThrow(/token is missing, expired or wrong/);
  });

  it('does not report a missing property', async () => {
    respondWith({ exception: 'frappe.exceptions.AuthenticationError', exc_type: 'AuthenticationError' }, 401);
    await expect(run()).rejects.not.toThrow(/Cannot read properties/);
  });

  it('still surfaces a normal GraphQL errors array', async () => {
    respondWith({ errors: [{ message: 'Authentication required to access GraphQL schema.' }] }, 403);
    await expect(run()).rejects.toThrow(/Authentication required/);
  });

  it('explains a non-JSON response rather than a parse error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 502,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    }));
    await expect(run()).rejects.toThrow(/non-JSON response \(HTTP 502\)/);
  });

  it('rejects a 200 that carries no data at all', async () => {
    respondWith({}, 200);
    await expect(run()).rejects.toThrow(/returned no data/);
  });
});
