/**
 * Config service - unified async API for listing and loading DataTable configs.
 * Aggregates local provider (now) and can add Firebase provider (future).
 * Callers use listConfigs() and getConfig(id) - source-agnostic.
 */

import { isEqual } from 'lodash';
import { listLocalConfigs, getLocalConfig } from './providers/localConfigProvider';
import { defaultConfigId } from './configRegistry';
import { deserializeJsToConfig } from './configSerializer';
// Future: import { listFirebaseConfigs, getFirebaseConfig } from './providers/firebaseConfigProvider';

/**
 * List all available configs (sync - from registry)
 * @returns {Array<{ id: string, displayName: string, source: string }>}
 */
export function getConfigList() {
  return listLocalConfigs();
}

/**
 * List all available configs from all providers (async for future Firebase)
 * @returns {Promise<Array<{ id: string, displayName: string, source: string }>>}
 */
export async function listConfigs() {
  const local = listLocalConfigs();
  // const remote = await listFirebaseConfigs?.() ?? [];
  // return [...local, ...remote].sort((a, b) => a.displayName.localeCompare(b.displayName));
  return local;
}

/**
 * Get config object by id (tries local first, then remote when Firebase is added)
 * @param {string} id - Config id (e.g. 'defaultConfig')
 * @returns {Promise<Object|null>} - The config object or null
 */
export async function getConfig(id) {
  const local = getLocalConfig(id);
  if (local) return local;
  // return await getFirebaseConfig?.(id) ?? null;
  return null;
}

/**
 * Get the config id that is selected by default (from registry).
 * @returns {string}
 */
export function getDefaultConfigId() {
  return defaultConfigId;
}

/**
 * Get default config synchronously (for initial state, default props).
 * Uses defaultConfigId from registry - change it to switch which config loads on page init.
 * @returns {Object|null} - The default config object or null
 */
export function getDefaultConfig() {
  return getLocalConfig(defaultConfigId);
}

/**
 * Merge user config with base config
 * @param {Object} userConfig - User-provided configuration
 * @param {Object} [baseConfig] - Base config (defaults to getDefaultConfig())
 * @returns {Object} Merged configuration
 */
export function mergeConfig(userConfig = {}, baseConfig = getDefaultConfig()) {
  const base = baseConfig ?? {};
  return {
    ...base,
    ...userConfig,
    columnTypesOverride: {
      ...(base.columnTypesOverride || {}),
      ...(userConfig.columnTypesOverride || {}),
    },
    formInputOverride: {
      main: {
        ...(base.formInputOverride?.main || {}),
        ...(userConfig.formInputOverride?.main || {}),
      },
      nested: (() => {
        const defaultNested = base.formInputOverride?.nested || {};
        const userNested = userConfig.formInputOverride?.nested || {};
        const tableNames = new Set([...Object.keys(defaultNested), ...Object.keys(userNested)]);
        const merged = {};
        for (const tableName of tableNames) {
          merged[tableName] = {
            ...(defaultNested[tableName] || {}),
            ...(userNested[tableName] || {}),
          };
        }
        return merged;
      })(),
      object: (() => {
        const defaultObject = base.formInputOverride?.object || {};
        const userObject = userConfig.formInputOverride?.object || {};
        const objectColumns = new Set([...Object.keys(defaultObject), ...Object.keys(userObject)]);
        const merged = {};
        for (const columnName of objectColumns) {
          merged[columnName] = {
            ...(defaultObject[columnName] || {}),
            ...(userObject[columnName] || {}),
          };
        }
        return merged;
      })(),
    },
    drawerTabs: userConfig.drawerTabs || base.drawerTabs,
    slots: userConfig.slots || base.slots,
    percentageColumns: userConfig.percentageColumns ?? base.percentageColumns,
    derivedColumns: userConfig.derivedColumns ?? base.derivedColumns,
    derivedRows: userConfig.derivedRows ?? base.derivedRows ?? null,
    rowColumnStyles: userConfig.rowColumnStyles ?? base.rowColumnStyles,
    // allowedColumns: array = use as-is; object = deep-merge group key
    allowedColumns: (() => {
      const baseAC = base.allowedColumns;
      const userAC = userConfig.allowedColumns;
      if (Array.isArray(userAC)) return userAC;
      if (Array.isArray(baseAC) && !userAC) return baseAC;
      if (userAC && typeof userAC === 'object' && !Array.isArray(userAC)) {
        const merged = { ...(baseAC && typeof baseAC === 'object' && !Array.isArray(baseAC) ? baseAC : {}), ...userAC };
        if (merged.group && (baseAC?.group || userAC.group)) {
          merged.group = { ...(baseAC?.group || {}), ...(userAC.group || {}) };
        }
        if (merged.reportGroup || baseAC?.reportGroup || userAC?.reportGroup) {
          merged.reportGroup = { ...(baseAC?.reportGroup || {}), ...(userAC?.reportGroup || {}) };
        }
        return merged;
      }
      return userAC ?? baseAC;
    })(),
  };
}

/**
 * Extract state values from config (for applying to React state)
 * @param {Object} config - Configuration object
 * @param {Object} [baseConfig] - Base config for fallbacks (defaults to getDefaultConfig())
 * @returns {Object} Object with state values extracted from config
 */
export function extractStateFromConfig(config, baseConfig = getDefaultConfig()) {
  const base = baseConfig ?? {};
  return {
    useOrchestrationLayer: config.useOrchestrationLayer ?? base.useOrchestrationLayer,
    enableSort: config.enableSort ?? base.enableSort,
    enableFilter: config.enableFilter ?? base.enableFilter,
    enableSummation: config.enableSummation ?? base.enableSummation,
    enableCellEdit: config.enableCellEdit ?? base.enableCellEdit,
    enableDivideBy1Lakh: config.enableDivideBy1Lakh ?? base.enableDivideBy1Lakh,
    rowsPerPageOptions: config.rowsPerPageOptions ?? base.rowsPerPageOptions,
    defaultRows: config.defaultRows ?? base.defaultRows,
    tableHeight: config.tableHeight ?? base.tableHeight,
    textFilterColumns: config.textFilterColumns ?? base.textFilterColumns,
    allowedColumns: config.allowedColumns ?? base.allowedColumns,
    nonEditableColumns: config.nonEditableColumns ?? base.nonEditableColumns,
    editableColumns: config.editableColumns ?? base.editableColumns,
    percentageColumns: config.percentageColumns ?? base.percentageColumns,
    derivedColumns: config.derivedColumns ?? base.derivedColumns,
    derivedRows: config.derivedRows ?? base.derivedRows ?? null,
    redFields: config.redFields ?? base.redFields,
    greenFields: config.greenFields ?? base.greenFields,
    rowColumnStyles: config.rowColumnStyles ?? base.rowColumnStyles,
    outerGroupField: config.outerGroupField ?? base.outerGroupField,
    innerGroupField: config.innerGroupField ?? base.innerGroupField,
    groupFields: config.groupFields ?? base.groupFields ?? [],
    columnTypesOverride: config.columnTypesOverride ?? base.columnTypesOverride,
    formInputOverride: config.formInputOverride ?? base.formInputOverride,
    drawerTabs: config.drawerTabs ?? base.drawerTabs,
    enableReport: config.enableReport ?? base.enableReport,
    showChart: config.showChart ?? base.showChart,
    breakdownType: config.breakdownType ?? base.breakdownType,
    dateColumn: config.dateColumn ?? base.dateColumn,
    columnGroupBy: config.columnGroupBy ?? base.columnGroupBy,
    columnsExemptFromBreakdown: config.columnsExemptFromBreakdown ?? base.columnsExemptFromBreakdown,
    isAdminMode: config.isAdminMode ?? base.isAdminMode,
    salesTeamColumn: config.salesTeamColumn ?? base.salesTeamColumn,
    salesTeamValues: config.salesTeamValues ?? base.salesTeamValues,
    hqColumn: config.hqColumn ?? base.hqColumn,
    hqValues: config.hqValues ?? base.hqValues,
    dataSource: config.dataSource ?? base.dataSource,
    selectedQueryKey: config.selectedQueryKey ?? base.selectedQueryKey,
    // Only use config.slots when config defines slots; otherwise undefined so page uses buildSingleSlotFromFlat (no tabs)
    slots: 'slots' in config ? config.slots : undefined,
  };
}

/**
 * Check if config is dirty: in-memory preset (parsed from JS) differs from applied config.
 * Config-level check - compares config objects only.
 * @param {string} presetJsValue - Serialized config (JS string from editor or preset)
 * @param {Object|null} appliedConfig - The config object currently applied
 * @returns {boolean} True if dirty (preset differs from applied, or parse error)
 */
export function isConfigDirty(presetJsValue, appliedConfig) {
  const hasPreset = !!(presetJsValue && presetJsValue.trim());
  if (!hasPreset) {
    return false;
  }
  try {
    const parsed = deserializeJsToConfig(presetJsValue);
    const applied = appliedConfig ?? {};
    const equal = isEqual(parsed, applied);
    const dirty = !equal;
    return dirty;
  } catch (err) {
    return true; // Invalid parse = treat as dirty (user has edits)
  }
}
