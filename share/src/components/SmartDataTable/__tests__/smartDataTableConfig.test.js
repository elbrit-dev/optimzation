import { describe, it, expect } from 'vitest';
import {
  __INTERNAL_CONFIG,
  DEFAULT_CONFIG,
  resolveConfig,
  isRowClickEnabledAtDepth,
} from '../smartDataTableConfig.js';

describe('smartDataTableConfig', () => {
  it('resolveConfig merges internal → default → common → perView', () => {
    const cfg = resolveConfig(
      { scrollHeight: '500px', defaultPageSize: 100 },
      { scrollHeight: '400px', enableExport: false }
    );
    expect(cfg.scrollHeight).toBe('400px');
    expect(cfg.defaultPageSize).toBe(100);
    expect(cfg.enableExport).toBe(false);
    expect(cfg.enableMultiSort).toBe(__INTERNAL_CONFIG.enableMultiSort);
  });

  it('does not expose virtual scroll options (uses native scrollable table only)', () => {
    const cfg = resolveConfig();
    expect(cfg).not.toHaveProperty('enableVirtualScroll');
    expect(cfg).not.toHaveProperty('virtualScrollItemSize');
    expect(cfg).not.toHaveProperty('virtualScrollNumToleratedItems');
  });

  it('keeps scrollHeight for fixed-height scrollable body', () => {
    expect(DEFAULT_CONFIG.scrollHeight).toBe('600px');
    expect(resolveConfig().scrollHeight).toBe('600px');
  });

  it('logging is off by default', () => {
    expect(DEFAULT_CONFIG.loggingEnabled).toBe(false);
    expect(resolveConfig().loggingEnabled).toBe(false);
  });

  describe('isRowClickEnabledAtDepth', () => {
    it('defaults to the top two levels', () => {
      expect(DEFAULT_CONFIG.rowClickLevels).toBe(2);
      const levels = resolveConfig().rowClickLevels;
      expect([0, 1].map(d => isRowClickEnabledAtDepth(levels, d))).toEqual([true, true]);
      expect([2, 3, 9].map(d => isRowClickEnabledAtDepth(levels, d))).toEqual([false, false, false]);
    });

    it('treats a number as "top N levels"', () => {
      expect(isRowClickEnabledAtDepth(1, 0)).toBe(true);
      expect(isRowClickEnabledAtDepth(1, 1)).toBe(false);
      expect(isRowClickEnabledAtDepth(3, 2)).toBe(true);
      expect(isRowClickEnabledAtDepth(0, 0)).toBe(false);
    });

    it('supports true / false / nullish', () => {
      expect(isRowClickEnabledAtDepth(true, 7)).toBe(true);
      expect(isRowClickEnabledAtDepth(false, 0)).toBe(false);
      expect(isRowClickEnabledAtDepth(undefined, 7)).toBe(true);
      expect(isRowClickEnabledAtDepth(null, 7)).toBe(true);
    });

    it('supports a predicate for per-level control', () => {
      const onlySecondLevel = d => d === 1;
      expect([0, 1, 2].map(d => isRowClickEnabledAtDepth(onlySecondLevel, d))).toEqual([false, true, false]);
    });

    it('rejects non-numeric junk rather than enabling every level', () => {
      expect(isRowClickEnabledAtDepth('abc', 0)).toBe(false);
    });
  });
});
