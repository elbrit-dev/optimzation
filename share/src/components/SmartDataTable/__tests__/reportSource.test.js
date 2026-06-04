import { describe, it, expect, afterEach, vi } from 'vitest';
import { graphqlQueryReportDataSource } from '../reportSource.jsx';
import { stepCases, pipelineScenarios } from '@/test/scenarios/pipeline.scenarios.js';
import { mockGraphqlFetch, mockGraphqlFetchWithErrors, mockFetchError, restoreFetch } from '@/test/helpers/fetchMocker.js';

// ─── Pure pipeline step tests ─────────────────────────────────────────────────

describe('pipeline steps', () => {
  stepCases.forEach(tc => {
    it(tc.name, async () => {
      if (tc.inline) {
        await tc.run();
        return;
      }
      const result = await Promise.resolve(tc.step(tc.inputState, tc.params ?? {}));
      tc.assert(result);
    });
  });
});

// ─── graphqlQueryReportDataSource integration ─────────────────────────────────

describe('graphqlQueryReportDataSource', () => {
  const fixtures = {
    'flat-no-pivot': () => import('@/test/fixtures/frappe-responses/flat-no-pivot.json'),
    'flat-pivot':    () => import('@/test/fixtures/frappe-responses/flat-pivot.json'),
    'tree-no-pivot': () => import('@/test/fixtures/frappe-responses/tree-no-pivot.json'),
    'tree-pivot':    () => import('@/test/fixtures/frappe-responses/tree-pivot.json'),
  };

  const EMPTY_FIXTURE = {
    columns: [{ fieldname: 'label', label: 'Name', fieldtype: 'Data', width: 200 }],
    result: [],
  };

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  pipelineScenarios.forEach(sc => {
    it(sc.name, async () => {
      const ds = graphqlQueryReportDataSource({ endpoint: '/x', token: 't', variables: { report: 'Test', filters: {} } });

      // HTTP error
      if (sc.isErrorCase) {
        mockFetchError(sc.httpStatus);
        await expect(ds(sc.params)).rejects.toThrow(String(sc.httpStatus));
        return;
      }

      // GraphQL errors array in body
      if (sc.isGqlErrorCase) {
        mockGraphqlFetchWithErrors(sc.gqlErrors);
        await expect(ds(sc.params)).rejects.toThrow(sc.gqlErrors[0].message);
        return;
      }

      // Empty result set
      if (sc.isEmptyCase) {
        mockGraphqlFetch(EMPTY_FIXTURE);
        const result = await ds(sc.params);
        sc.assert(result);
        return;
      }

      const fixture = await fixtures[sc.fixture]();

      // Spy case: capture the fetch call body for assertion
      if (sc.isFetchSpyCase) {
        const spy = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            data: {
              customReport: {
                report_meta: [{ columns: fixture.default.columns }],
                totalCount: fixture.default.result.length,
                edges: fixture.default.result.map(node => ({ node })),
                pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
              },
            },
          }),
        });
        global.fetch = spy;
        const result = await ds(sc.params);
        sc.assert(result, spy);
        return;
      }

      mockGraphqlFetch(fixture.default);
      const result = await ds(sc.params);
      sc.assert(result);
    });
  });
});
