/**
 * Replaces global.fetch with a stub that returns a GraphQL-shaped customReport payload.
 *
 * Usage:
 *   import { mockGraphqlFetch, restoreFetch } from '@/test/helpers/fetchMocker';
 *
 *   beforeEach(() => mockGraphqlFetch(myPayload));
 *   afterEach(() => restoreFetch());
 *
 * Fixture files (src/test/fixtures/frappe-responses/<name>.json) contain { columns, result }.
 * mockGraphqlFetch wraps them into the customReport GraphQL envelope automatically.
 */

let _original = global.fetch;

export function mockGraphqlFetch(payload) {
  _original = global.fetch;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: {
        customReport: {
          report_meta: [{ columns: payload.columns }],
          totalCount:  payload.result.length,
          edges:       payload.result.map(node => ({ node })),
          pageInfo:    { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
        },
      },
    }),
  });
}

export function mockFetchError(status = 500) {
  _original = global.fetch;
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
  });
}

export function mockGraphqlFetchWithErrors(errors) {
  _original = global.fetch;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: null, errors }),
  });
}

export function restoreFetch() {
  global.fetch = _original;
}
