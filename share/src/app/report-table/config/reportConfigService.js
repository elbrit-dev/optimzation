import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { deserializeReportConfig } from './reportConfigParser';
import {
  detectConfigVersion,
  LATEST_REPORT_CONFIG_VERSION,
  migrateReportConfig,
  parseAndMigrateReportConfig,
} from './reportConfigMigrator';
import { serializeReportConfigToJs } from './reportConfigSerializer';

export { parseAndMigrateReportConfig, migrateReportConfig, detectConfigVersion, LATEST_REPORT_CONFIG_VERSION };

/** Parse and re-serialize a config editor string with consistent indentation. */
export function formatReportConfigJs(jsString, deserialize) {
  const { config } = parseAndMigrateReportConfig(jsString, deserialize);
  if (!config) return null;
  return serializeReportConfigToJs(config);
}

/**
 * Load a report config from Firestore, run migrations, optionally persist upgrades.
 * @param {string} name
 * @param {{ autoMigrate?: boolean }} [options]
 */
export async function loadReportConfig(name, { autoMigrate = true } = {}) {
  const raw = await firestoreService.loadReport(name);
  if (!raw.trim()) {
    return { configString: '', config: null, migrated: false, fromVersion: null, toVersion: null };
  }

  const parsed = deserializeReportConfig(raw);
  if (!parsed) {
    return {
      configString: raw,
      config: null,
      migrated: false,
      fromVersion: null,
      toVersion: null,
      error: 'parse_failed',
    };
  }

  const fromVersion = detectConfigVersion(parsed);
  const migratedConfig = migrateReportConfig(parsed);
  const toVersion = migratedConfig.configVersion ?? LATEST_REPORT_CONFIG_VERSION;
  const needsUpgrade = fromVersion < toVersion;

  if (needsUpgrade) {
    const configString = serializeReportConfigToJs(migratedConfig);
    if (autoMigrate) {
      await firestoreService.saveReport(name, configString, {
        configVersion: toVersion,
        migratedAt: new Date().toISOString(),
      });
    }
    return {
      configString,
      config: migratedConfig,
      migrated: true,
      fromVersion,
      toVersion,
    };
  }

  return {
    configString: raw,
    config: migratedConfig,
    migrated: false,
    fromVersion,
    toVersion,
  };
}

/**
 * Parse editor string, migrate, serialize, and save to Firestore.
 * @param {string} name
 * @param {string} jsString
 */
export async function saveReportConfig(name, jsString) {
  const { config, toVersion } = parseAndMigrateReportConfig(jsString, deserializeReportConfig);
  if (!config) {
    throw new Error('Invalid report config');
  }

  const configString = serializeReportConfigToJs(config);
  await firestoreService.saveReport(name, configString, {
    configVersion: toVersion ?? LATEST_REPORT_CONFIG_VERSION,
    updatedAt: new Date().toISOString(),
  });

  return { configString, config, toVersion: toVersion ?? LATEST_REPORT_CONFIG_VERSION };
}
