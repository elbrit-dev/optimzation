/**
 * Config module - barrel export for DataTable config service.
 * Single entry point for all config access and utilities.
 */
export {
  listConfigs,
  getConfigList,
  getConfig,
  getDefaultConfig,
  getDefaultConfigId,
  extractStateFromConfig,
  mergeConfig,
} from './configService';
