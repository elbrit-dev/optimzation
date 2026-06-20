import { describe, it, expect } from 'vitest';
import { deserializeReportConfig } from '@/app/report-table/config/reportConfigParser';
import {
  detectConfigVersion,
  LATEST_REPORT_CONFIG_VERSION,
  migrateReportConfig,
  parseAndMigrateReportConfig,
} from '@/app/report-table/config/reportConfigMigrator';
import { serializeReportConfigToJs } from '@/app/report-table/config/reportConfigSerializer';
import { formatReportConfigJs } from '@/app/report-table/config/reportConfigService';

describe('detectConfigVersion', () => {
  it('returns 0 when configVersion is missing', () => {
    expect(detectConfigVersion({ api: {} })).toBe(0);
  });

  it('returns configVersion when present', () => {
    expect(detectConfigVersion({ configVersion: 1 })).toBe(1);
  });
});

describe('migrateReportConfig', () => {
  it('adds configVersion 1 to legacy configs', () => {
    const legacy = { api: { urlKey: 'X' }, views: {} };
    const result = migrateReportConfig(legacy);
    expect(result.configVersion).toBe(1);
    expect(result.api.urlKey).toBe('X');
  });

  it('is a no-op when already at latest version', () => {
    const current = { api: {}, configVersion: LATEST_REPORT_CONFIG_VERSION };
    const result = migrateReportConfig(current);
    expect(result).toEqual(current);
  });

  it('does not re-run when configVersion is already 1', () => {
    const current = { api: { endpoint: '/x' }, configVersion: 1 };
    const result = migrateReportConfig(current);
    expect(result).toEqual(current);
  });
});

describe('parseAndMigrateReportConfig', () => {
  it('returns migrated true for version 0 configs', () => {
    const js = '({ api: { urlKey: "TEST" }, views: {} })';
    const result = parseAndMigrateReportConfig(js, deserializeReportConfig);
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe(0);
    expect(result.toVersion).toBe(1);
    expect(result.config?.configVersion).toBe(1);
  });

  it('returns null config for invalid JS', () => {
    const result = parseAndMigrateReportConfig('not valid {{', deserializeReportConfig);
    expect(result.config).toBeNull();
    expect(result.migrated).toBe(false);
  });
});

describe('serializeReportConfigToJs round-trip', () => {
  it('preserves configVersion through serialize and deserialize', () => {
    const original = { api: { urlKey: 'X' }, views: {}, configVersion: 1 };
    const js = serializeReportConfigToJs(original);
    const parsed = deserializeReportConfig(js);
    expect(parsed.configVersion).toBe(1);
    expect(parsed.api.urlKey).toBe('X');
  });

  it('produces a raw object literal without export wrapper', () => {
    const js = serializeReportConfigToJs({ configVersion: 1 });
    expect(js).not.toContain('export const');
    expect(deserializeReportConfig(js)).toEqual({ configVersion: 1 });
  });

  it('uses consistent 4-space indentation without compounding nested depth', () => {
    const js = serializeReportConfigToJs({
      api: {
        urlKey: 'ERP',
        variables: {
          report: 'Sales Summary',
          filters: {
            from_date: '2026-06-01',
            selected_columns: ['qty', 'net_primary'],
          },
        },
      },
      configVersion: 1,
    });
    expect(js).toContain('    api: {');
    expect(js).toContain('        urlKey: "ERP"');
    expect(js).toContain('        variables: {');
    expect(js).toContain('            report: "Sales Summary"');
    expect(js).toContain('            filters: {');
    expect(js).toContain('                from_date: "2026-06-01"');
    expect(js).toContain('                selected_columns: [');
    expect(js).toContain('                    "qty",');
    expect(js).not.toMatch(/ {16}urlKey:/);
  });
});

describe('formatReportConfigJs', () => {
  it('reformats nested objects with consistent indentation', () => {
    const messy = `{
    api: {
        urlKey: "ERP",
            variables: {
            report: "Sales Summary",
        },
    },
}`;
    const formatted = formatReportConfigJs(messy, deserializeReportConfig);
    expect(formatted).toContain('        urlKey: "ERP"');
    expect(formatted).toContain('        variables: {');
    expect(formatted).toContain('            report: "Sales Summary"');
    expect(formatted).not.toMatch(/ {12}variables:/);
  });
});

describe('LATEST_REPORT_CONFIG_VERSION', () => {
  it('is 1 with only the baseline migration', () => {
    expect(LATEST_REPORT_CONFIG_VERSION).toBe(1);
  });
});
