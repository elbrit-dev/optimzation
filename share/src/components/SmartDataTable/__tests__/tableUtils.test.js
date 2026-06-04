import { describe, it, expect } from 'vitest';
import { localFilter } from '../tableUtils.js';
import { localSort }   from '../tableUtils.js';
import { filterTestCases } from '@/test/scenarios/filter.scenarios.js';
import { sortTestCases }   from '@/test/scenarios/sort.scenarios.js';

// ─── localFilter ─────────────────────────────────────────────────────────────

describe('localFilter', () => {
  filterTestCases.forEach(tc => {
    it(tc.name, () => {
      const result = localFilter(tc.rows, tc.filters);
      expect(result).toHaveLength(tc.expectedCount);

      if (tc.expectedValues && tc.checkField) {
        tc.expectedValues.forEach((expected, i) => {
          expect(result[i][tc.checkField].value).toBe(expected);
        });
      }
    });
  });
});

// ─── localSort ───────────────────────────────────────────────────────────────

describe('localSort', () => {
  sortTestCases.forEach(tc => {
    it(tc.name, () => {
      if (tc.sameRef) {
        const result = localSort(tc.rows, tc.sortMeta);
        expect(result).toBe(tc.rows);
        return;
      }

      if (tc.checkMutation) {
        const original = tc.rows.map(r => ({ ...r }));
        localSort(tc.rows, tc.sortMeta);
        tc.rows.forEach((row, i) => {
          expect(row).toEqual(original[i]);
        });
        return;
      }

      if (tc.assertFn) {
        tc.assertFn(localSort(tc.rows, tc.sortMeta));
        return;
      }

      const result = localSort(tc.rows, tc.sortMeta);

      if (tc.expectedOrder && tc.checkField) {
        expect(result.map(r => r[tc.checkField].value)).toEqual(tc.expectedOrder);
      }

      if (tc.firstValue !== undefined && tc.checkField) {
        expect(result[0][tc.checkField].value).toBe(tc.firstValue);
      }
    });
  });
});
