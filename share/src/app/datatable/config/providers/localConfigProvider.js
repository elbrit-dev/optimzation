/**
 * Local config provider - uses manually registered configs from configRegistry.
 * Add new configs in config/configRegistry.js (like offline resources).
 */
import configRegistry from '../configRegistry';

/**
 * List all registered configs as { id, displayName, source }
 * @returns {Array<{ id: string, displayName: string, source: string }>}
 */
export function listLocalConfigs() {
  const raw = Object.values(configRegistry);
  return raw
    .map(({ id, displayName, source }) => ({ id, displayName, source }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Get config object by id
 * @param {string} id - Config id (e.g. 'defaultConfig')
 * @returns {Object|null} - The config object or null
 */
export function getLocalConfig(id) {
  const entry = configRegistry[id];
  return entry?.config ?? null;
}
