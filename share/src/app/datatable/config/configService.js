/**
 * Config service - unified async API for listing and loading DataTable configs.
 * Aggregates local provider (now) and can add Firebase provider (future).
 * Callers use listConfigs() and getConfig(id) - source-agnostic.
 */

import { isEqual } from 'lodash';
import { listLocalConfigs, getLocalConfig } from './providers/localConfigProvider';
import { defaultConfigId } from './configRegistry';
import { deserializeJsToConfig } from './configSerializer';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { mergeColumnTypesOverride } from '../utils/columnTypesOverrideUtils';
import { deepMergeWriteForm, normalizeWriteForm } from '../utils/writeFormUtils';

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
  const mergedSlots = (() => {
    const bs = base.slots;
    const us = userConfig.slots;
    if (!us || typeof us !== 'object') return bs;
    if (!bs || typeof bs !== 'object') return us;
    const ids = new Set([...Object.keys(bs), ...Object.keys(us)]);
    const out = {};
    for (const id of ids) {
      const bSlot = bs[id] || {};
      const uSlot = us[id];
      if (!uSlot || typeof uSlot !== 'object') {
        out[id] = bSlot;
        continue;
      }
      out[id] = {
        ...bSlot,
        ...uSlot,
        writeForm: deepMergeWriteForm(
          bSlot.writeForm && typeof bSlot.writeForm === 'object' ? bSlot.writeForm : {},
          uSlot.writeForm && typeof uSlot.writeForm === 'object' ? uSlot.writeForm : {},
        ),
        columnTypesOverride: mergeColumnTypesOverride(bSlot.columnTypesOverride, uSlot.columnTypesOverride),
      };
    }
    return out;
  })();
  return {
    ...base,
    ...userConfig,
    writeForm: deepMergeWriteForm(
      base.writeForm && typeof base.writeForm === 'object' ? base.writeForm : {},
      userConfig.writeForm && typeof userConfig.writeForm === 'object' ? userConfig.writeForm : {},
    ),
    columnTypesOverride: mergeColumnTypesOverride(base.columnTypesOverride, userConfig.columnTypesOverride),
    drawerTabs: userConfig.drawerTabs || base.drawerTabs,
    slots: mergedSlots,
    percentageColumns: userConfig.percentageColumns ?? base.percentageColumns,
    derivedColumns: userConfig.derivedColumns ?? base.derivedColumns,
    derivedRows: userConfig.derivedRows ?? base.derivedRows ?? null,
    rowColumnStyles: userConfig.rowColumnStyles ?? base.rowColumnStyles,
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
          merged.reportGroup = { ...(baseAC?.reportGroup || {}), ...(userAC.reportGroup || {}) };
        }
        return merged;
      }
      return userAC ?? baseAC;
    })(),
  };
}

/**
 * Resolve a config prop to a full config object.
 * @param {string|Object} configProp - Preset name string or config object
 * @returns {Object} Resolved config object
 */
export function resolveConfig(configProp) {
  if (!configProp) return {};
  if (typeof configProp === 'string') {
    const local = getLocalConfig(configProp);
    if (local) return local;
    return {};
  }
  if (typeof configProp === 'object') {
    return configProp;
  }
  return {};
}

/**
 * Fetch and resolve a Firebase preset by name.
 * @param {string} dataSource - Query document ID
 * @param {string} presetName - Preset name
 * @returns {Promise<Object|null>}
 */
export async function resolveFirebaseConfig(dataSource, presetName) {
  if (!dataSource || !presetName) return null;
  const presets = await firestoreService.loadPresetsForQuery(dataSource);
  const preset = presets?.find((p) => p?.name === presetName);
  if (!preset?.config) return null;
  try {
    return deserializeJsToConfig(preset.config);
  } catch {
    return null;
  }
}

/**
 * Extract state values from config (for applying to React state).
 * @param {Object} config - Configuration object
 * @param {Object} [baseConfig] - Optional base config for fallbacks
 * @returns {Object}
 */
export function extractStateFromConfig(config, baseConfig = {}) {
  const base = baseConfig ?? {};
  return {
    enableSort: config.enableSort ?? base.enableSort ?? true,
    enableFilter: config.enableFilter ?? base.enableFilter ?? true,
    enableSummation: config.enableSummation ?? base.enableSummation ?? false,
    enableGrouping: config.enableGrouping ?? base.enableGrouping ?? false,
    enableCellEdit: config.enableCellEdit ?? base.enableCellEdit ?? false,
    enableDivideBy1Lakh: config.enableDivideBy1Lakh ?? base.enableDivideBy1Lakh ?? false,
    rowsPerPageOptions: config.rowsPerPageOptions ?? base.rowsPerPageOptions ?? [10, 25, 50, 100],
    defaultRows: config.defaultRows ?? base.defaultRows ?? 10,
    tableHeight: config.tableHeight ?? base.tableHeight,
    scrollable: config.scrollable ?? base.scrollable ?? true,
    enableFullscreenDialog: config.enableFullscreenDialog ?? base.enableFullscreenDialog ?? true,
    textFilterColumns: config.textFilterColumns ?? base.textFilterColumns ?? [],
    allowedColumns: config.allowedColumns ?? base.allowedColumns ?? [],
    nonEditableColumns: config.nonEditableColumns ?? base.nonEditableColumns ?? [],
    writeForm: normalizeWriteForm(config.writeForm ?? base.writeForm ?? {}),
    columnTypesOverride: config.columnTypesOverride ?? base.columnTypesOverride ?? {},
    percentageColumns: config.percentageColumns ?? base.percentageColumns ?? [],
    derivedColumns: config.derivedColumns ?? base.derivedColumns ?? [],
    derivedRows: config.derivedRows ?? base.derivedRows ?? null,
    redFields: config.redFields ?? base.redFields ?? [],
    greenFields: config.greenFields ?? base.greenFields ?? [],
    rowColumnStyles: config.rowColumnStyles ?? base.rowColumnStyles ?? [],
    groupFields: config.groupFields ?? base.groupFields ?? [],
    drawerTabs: config.drawerTabs ?? base.drawerTabs ?? [],
    enableReport: config.enableReport ?? base.enableReport ?? false,
    showChart: config.showChart ?? base.showChart ?? false,
    breakdownType: config.breakdownType ?? base.breakdownType ?? 'month',
    dateColumn: config.dateColumn ?? base.dateColumn ?? null,
    columnGroupBy: config.columnGroupBy ?? base.columnGroupBy ?? 'values',
    columnsExemptFromBreakdown: config.columnsExemptFromBreakdown ?? base.columnsExemptFromBreakdown ?? [],
    chartColumns: config.chartColumns ?? base.chartColumns ?? [],
    chartHeight: config.chartHeight ?? base.chartHeight ?? 400,
    isAdminMode: config.isAdminMode ?? base.isAdminMode ?? false,
    salesTeamColumn: config.salesTeamColumn ?? base.salesTeamColumn ?? null,
    salesTeamValues: config.salesTeamValues ?? base.salesTeamValues ?? [],
    hqColumn: config.hqColumn ?? base.hqColumn ?? null,
    hqValues: config.hqValues ?? base.hqValues ?? [],
    dataSource: config.dataSource ?? base.dataSource ?? null,
    selectedQueryKey: config.selectedQueryKey ?? base.selectedQueryKey ?? null,
    slots: 'slots' in config ? config.slots : undefined,
    writePermissions: config.writePermissions ?? base.writePermissions,
  };
}

/**
 * Check if config is dirty
 * @param {string} presetJsValue
 * @param {Object|null} appliedConfig
 * @returns {boolean}
 */
export function isConfigDirty(presetJsValue, appliedConfig) {
  const hasPreset = !!(presetJsValue && presetJsValue.trim());
  if (!hasPreset) {
    return false;
  }
  try {
    const parsed = deserializeJsToConfig(presetJsValue);
    const applied = appliedConfig ?? {};
    return !isEqual(parsed, applied);
  } catch {
    return true;
  }
}
