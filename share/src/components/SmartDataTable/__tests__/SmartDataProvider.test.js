import { describe, it, expect } from 'vitest';
import {
  deserializeReportConfig,
  deepMerge,
  resolveViewConfig,
} from '../SmartDataProvider.jsx';

// ─── deserializeReportConfig ─────────────────────────────────────────────────

describe('deserializeReportConfig', () => {
  it('parses a valid JS object string', () => {
    const result = deserializeReportConfig('({ a: 1, b: "hello" })');
    expect(result).toEqual({ a: 1, b: 'hello' });
  });

  it('strips trailing semicolon', () => {
    const result = deserializeReportConfig('({ x: 42 });');
    expect(result).toEqual({ x: 42 });
  });

  it('returns null for empty string', () => {
    expect(deserializeReportConfig('')).toBeNull();
    expect(deserializeReportConfig('   ')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(deserializeReportConfig(null)).toBeNull();
    expect(deserializeReportConfig(undefined)).toBeNull();
  });

  it('returns null for syntactically invalid JS', () => {
    expect(deserializeReportConfig('not valid js {{ ')).toBeNull();
  });

  it('handles nested objects and arrays', () => {
    const result = deserializeReportConfig('({ api: { endpoint: "/x" }, views: ["a","b"] })');
    expect(result.api.endpoint).toBe('/x');
    expect(result.views).toEqual(['a', 'b']);
  });
});

// ─── deepMerge ───────────────────────────────────────────────────────────────

describe('deepMerge', () => {
  it('overrides primitive values from override', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 99 })).toEqual({ a: 1, b: 99 });
  });

  it('preserves base keys not in override', () => {
    const result = deepMerge({ a: 1, b: 2 }, { c: 3 });
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
    expect(result.c).toBe(3);
  });

  it('recursively merges nested plain objects', () => {
    const base     = { api: { endpoint: '/old', token: 'tok' } };
    const override = { api: { endpoint: '/new' } };
    const result   = deepMerge(base, override);
    expect(result.api.endpoint).toBe('/new');
    expect(result.api.token).toBe('tok');
  });

  it('arrays in override replace, not concatenate', () => {
    const base     = { items: [1, 2, 3] };
    const override = { items: [4, 5] };
    const result   = deepMerge(base, override);
    expect(result.items).toEqual([4, 5]);
  });

  it('override=null returns base unchanged', () => {
    const base = { a: 1 };
    expect(deepMerge(base, null)).toEqual({ a: 1 });
  });

  it('override=undefined returns base unchanged', () => {
    const base = { a: 1 };
    expect(deepMerge(base, undefined)).toEqual({ a: 1 });
  });

  it('does not mutate the base object', () => {
    const base = { a: { x: 1 } };
    deepMerge(base, { a: { x: 99 } });
    expect(base.a.x).toBe(1);
  });

  it('result is a new object (not same ref as base)', () => {
    const base = { a: 1 };
    const result = deepMerge(base, { b: 2 });
    expect(result).not.toBe(base);
  });
});

// ─── resolveViewConfig ────────────────────────────────────────────────────────

describe('resolveViewConfig', () => {
  const ROOT = {
    api:      { endpoint: '/root', token: 'root-tok' },
    table:    { enablePaginator: true, defaultPageSize: 25 },
    controls: [{ key: 'dateRange', type: 'daterange' }],
  };

  it('with no override: returns root api and table unchanged, controls=null', () => {
    const { resolvedApi, resolvedTable, resolvedControls } = resolveViewConfig(ROOT);
    expect(resolvedApi).toEqual(ROOT.api);
    expect(resolvedTable).toEqual(ROOT.table);
    expect(resolvedControls).toBeNull();
  });

  it('api override deep-merges into root api', () => {
    const { resolvedApi } = resolveViewConfig(ROOT, { api: { endpoint: '/view' } });
    expect(resolvedApi.endpoint).toBe('/view');
    expect(resolvedApi.token).toBe('root-tok');
  });

  it('table override deep-merges into root table', () => {
    const { resolvedTable } = resolveViewConfig(ROOT, { table: { defaultPageSize: 50 } });
    expect(resolvedTable.defaultPageSize).toBe(50);
    expect(resolvedTable.enablePaginator).toBe(true);
  });

  it('controls array in viewOverride replaces root controls', () => {
    const viewControls = [{ key: 'breakdown', type: 'toggle' }];
    const { resolvedControls } = resolveViewConfig(ROOT, { controls: viewControls });
    expect(resolvedControls).toEqual(viewControls);
  });

  it('partial override (only api): controls still null, table unchanged', () => {
    const { resolvedControls, resolvedTable } = resolveViewConfig(ROOT, { api: { endpoint: '/x' } });
    expect(resolvedControls).toBeNull();
    expect(resolvedTable).toEqual(ROOT.table);
  });
});
