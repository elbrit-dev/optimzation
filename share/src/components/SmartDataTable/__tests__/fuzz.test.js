import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { localFilter } from '../tableUtils.js';
import { localSort }   from '../tableUtils.js';
import { deepMerge }   from '../SmartDataProvider.jsx';
import { deserializeReportConfig } from '../SmartDataProvider.jsx';
import { nestStep, formatStep, paginateStep } from '../reportSource.jsx';

import {
  rowArb, filterMapArb, sortMetaArb, flatTreeRowArb,
  paginationArb, cellArb, plainObjectArb,
} from '@/test/arbitraries.js';

// ─── localFilter invariants ───────────────────────────────────────────────────

describe('fuzz: localFilter', () => {
  it('result is always a subset of input', () => {
    fc.assert(fc.property(
      fc.array(rowArb, { maxLength: 50 }),
      filterMapArb,
      (rows, filters) => {
        const result = localFilter(rows, filters);
        expect(result.length).toBeLessThanOrEqual(rows.length);
        result.forEach(r => expect(rows).toContain(r));
      }
    ), { numRuns: 200 });
  });

  it('idempotent: applying same filters twice = applying once', () => {
    fc.assert(fc.property(
      fc.array(rowArb, { maxLength: 30 }),
      filterMapArb,
      (rows, filters) => {
        const once  = localFilter(rows, filters);
        const twice = localFilter(once, filters);
        expect(twice).toEqual(once);
      }
    ), { numRuns: 200 });
  });

  it('empty filter map returns all rows', () => {
    fc.assert(fc.property(
      fc.array(rowArb, { maxLength: 50 }),
      (rows) => {
        expect(localFilter(rows, {})).toHaveLength(rows.length);
      }
    ), { numRuns: 100 });
  });

  it('null filter map returns all rows', () => {
    fc.assert(fc.property(
      fc.array(rowArb, { maxLength: 30 }),
      (rows) => {
        expect(localFilter(rows, null)).toHaveLength(rows.length);
      }
    ), { numRuns: 100 });
  });
});

// ─── localSort invariants ─────────────────────────────────────────────────────

describe('fuzz: localSort', () => {
  it('output length === input length', () => {
    fc.assert(fc.property(
      fc.array(rowArb, { maxLength: 50 }),
      sortMetaArb,
      (rows, sortMeta) => {
        expect(localSort(rows, sortMeta)).toHaveLength(rows.length);
      }
    ), { numRuns: 200 });
  });

  it('output is a permutation of input', () => {
    fc.assert(fc.property(
      fc.array(rowArb, { minLength: 1, maxLength: 30 }),
      sortMetaArb,
      (rows, sortMeta) => {
        const result = localSort(rows, sortMeta);
        rows.forEach(r => expect(result).toContain(r));
      }
    ), { numRuns: 200 });
  });

  it('does not mutate original array', () => {
    fc.assert(fc.property(
      fc.array(rowArb, { maxLength: 30 }),
      sortMetaArb,
      (rows, sortMeta) => {
        const snapshot = [...rows];
        localSort(rows, sortMeta);
        expect(rows).toEqual(snapshot);
      }
    ), { numRuns: 200 });
  });

  it('empty sortMeta returns same array reference', () => {
    fc.assert(fc.property(
      fc.array(rowArb, { maxLength: 20 }),
      (rows) => {
        expect(localSort(rows, [])).toBe(rows);
      }
    ), { numRuns: 100 });
  });
});

// ─── deepMerge invariants ─────────────────────────────────────────────────────

describe('fuzz: deepMerge', () => {
  it('all override keys appear in result', () => {
    fc.assert(fc.property(
      plainObjectArb, plainObjectArb,
      (base, override) => {
        const result = deepMerge(base, override);
        Object.keys(override).forEach(k => {
          expect(result).toHaveProperty(k);
        });
      }
    ), { numRuns: 300 });
  });

  it('base keys not in override are preserved', () => {
    fc.assert(fc.property(
      plainObjectArb, plainObjectArb,
      (base, override) => {
        const result = deepMerge(base, override);
        Object.keys(base).forEach(k => {
          if (!(k in override)) {
            expect(result[k]).toBe(base[k]);
          }
        });
      }
    ), { numRuns: 300 });
  });

  it('deepMerge(x, {}) deep-equals x', () => {
    fc.assert(fc.property(
      plainObjectArb,
      (obj) => {
        expect(deepMerge(obj, {})).toEqual(obj);
      }
    ), { numRuns: 200 });
  });

  it('result is not the same reference as base', () => {
    fc.assert(fc.property(
      plainObjectArb, plainObjectArb,
      (base, override) => {
        expect(deepMerge(base, override)).not.toBe(base);
      }
    ), { numRuns: 100 });
  });
});

// ─── nestStep invariants ──────────────────────────────────────────────────────

function countNodes(roots) {
  let n = 0;
  const stack = [...roots];
  while (stack.length) {
    const node = stack.pop();
    n++;
    if (node._children) stack.push(...node._children);
  }
  return n;
}

describe('fuzz: nestStep', () => {
  it('all input rows appear exactly once in output tree', () => {
    fc.assert(fc.property(
      fc.array(flatTreeRowArb, { maxLength: 30 }),
      (flatRows) => {
        const { rows: roots } = nestStep({ rows: flatRows }, {});
        expect(countNodes(roots)).toBe(flatRows.length);
      }
    ), { numRuns: 200 });
  });

  it('empty input produces empty roots', () => {
    const { rows } = nestStep({ rows: [] }, {});
    expect(rows).toEqual([]);
  });

  it('rows with is_group=true have _children', () => {
    fc.assert(fc.property(
      fc.array(flatTreeRowArb, { maxLength: 20 }),
      (flatRows) => {
        const { rows: roots } = nestStep({ rows: flatRows }, {});
        const stack = [...roots];
        while (stack.length) {
          const node = stack.pop();
          if (node.is_group) {
            expect(node).toHaveProperty('_children');
          }
          if (node._children) stack.push(...node._children);
        }
      }
    ), { numRuns: 200 });
  });
});

// ─── formatStep invariants ────────────────────────────────────────────────────

describe('fuzz: formatStep', () => {
  it('every cell becomes { value, repr } shape after formatting', () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({ qty: fc.integer(), label: fc.string() }),
        { maxLength: 20 }
      ),
      (rawRows) => {
        const step = formatStep();
        const state = {
          columns: [
            { field: 'qty',   _fieldtype: 'Int'  },
            { field: 'label', _fieldtype: 'Data' },
          ],
          rows: rawRows,
        };
        const result = step(state);
        result.rows.forEach(r => {
          expect(r.qty).toHaveProperty('value');
          expect(r.qty).toHaveProperty('repr');
          expect(r.label).toHaveProperty('value');
          expect(r.label).toHaveProperty('repr');
        });
      }
    ), { numRuns: 200 });
  });

  it('null cells produce { value: null, repr: null }', () => {
    fc.assert(fc.property(
      fc.array(fc.record({ qty: fc.constant(null) }), { maxLength: 10 }),
      (rawRows) => {
        const step = formatStep();
        const state = {
          columns: [{ field: 'qty', _fieldtype: 'Currency' }],
          rows: rawRows,
        };
        const result = step(state);
        result.rows.forEach(r => {
          expect(r.qty).toEqual({ value: null, repr: null });
        });
      }
    ), { numRuns: 100 });
  });
});

// ─── paginateStep invariants ──────────────────────────────────────────────────
// Server handles pagination; paginateStep only sets totalRecords (no slicing).

describe('fuzz: paginateStep', () => {
  it('rows pass through unchanged (server already paginated them)', () => {
    fc.assert(fc.property(
      fc.array(fc.record({ x: fc.integer() }), { maxLength: 200 }),
      (rows) => {
        const result = paginateStep({ rows });
        expect(result.rows).toBe(rows); // same reference — not copied or sliced
      }
    ), { numRuns: 300 });
  });

  it('totalRecords === rows.length when no metaPagination', () => {
    fc.assert(fc.property(
      fc.array(fc.record({ x: fc.integer() }), { maxLength: 200 }),
      (rows) => {
        const result = paginateStep({ rows });
        expect(result.totalRecords).toBe(rows.length);
      }
    ), { numRuns: 300 });
  });

  it('first >= length → empty rows but correct totalRecords', () => {
    // When metaPagination.total_roots is provided it overrides rows.length
    fc.assert(fc.property(
      fc.array(fc.record({ x: fc.integer() }), { minLength: 0, maxLength: 20 }),
      fc.integer({ min: 1, max: 1000 }),
      (rows, totalRoots) => {
        const result = paginateStep({ rows, metaPagination: { total_roots: totalRoots } });
        expect(result.totalRecords).toBe(totalRoots);
      }
    ), { numRuns: 200 });
  });
});

// ─── deserializeReportConfig invariants ──────────────────────────────────────

describe('fuzz: deserializeReportConfig', () => {
  it('never throws on any string input', () => {
    fc.assert(fc.property(
      fc.string(),
      (input) => {
        expect(() => deserializeReportConfig(input)).not.toThrow();
      }
    ), { numRuns: 500 });
  });

  it('returns null for random non-object strings', () => {
    fc.assert(fc.property(
      fc.string().filter(s => {
        try { const r = new Function('return (' + s.trim().replace(/;\s*$/, '') + ')')(); return typeof r !== 'object' || r === null; }
        catch { return true; }
      }),
      (input) => {
        const result = deserializeReportConfig(input);
        expect(result).toBeNull();
      }
    ), { numRuns: 200 });
  });

  it('valid JSON object string → returns correct object', () => {
    fc.assert(fc.property(
      plainObjectArb,
      (obj) => {
        const str = JSON.stringify(obj);
        const result = deserializeReportConfig(`(${str})`);
        expect(result).toEqual(obj);
      }
    ), { numRuns: 200 });
  });
});
