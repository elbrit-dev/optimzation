import { describe, it, expect } from 'vitest';
import {
  __INTERNAL_CONFIG,
  DEFAULT_CONFIG,
  resolveConfig,
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
});
