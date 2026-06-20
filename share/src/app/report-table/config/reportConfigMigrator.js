import { REPORT_CONFIG_MIGRATIONS } from './migrations/index';

export const LATEST_REPORT_CONFIG_VERSION = REPORT_CONFIG_MIGRATIONS.at(-1).version;

export function detectConfigVersion(config) {
  if (typeof config?.configVersion === 'number') return config.configVersion;
  return 0;
}

export function migrateReportConfig(config) {
  if (!config || typeof config !== 'object') return config;

  let current = config;
  let from = detectConfigVersion(current);

  for (const mig of REPORT_CONFIG_MIGRATIONS) {
    if (mig.version > from) {
      current = mig.up(current);
      current = { ...current, configVersion: mig.version };
      from = mig.version;
    }
  }

  return current;
}

export function parseAndMigrateReportConfig(jsString, deserialize) {
  const parsed = deserialize(jsString);
  if (!parsed) return { config: null, fromVersion: null, toVersion: null, migrated: false };
  const fromVersion = detectConfigVersion(parsed);
  const config = migrateReportConfig(parsed);
  const toVersion = config.configVersion ?? LATEST_REPORT_CONFIG_VERSION;
  return {
    config,
    fromVersion,
    toVersion,
    migrated: fromVersion < toVersion,
  };
}
