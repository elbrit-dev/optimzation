/**
 * Service to save and load table settings per data source
 */

const APP_PREFIX = 'elbrit:';
const SETTINGS_PREFIX = `${APP_PREFIX}datatable-settings-`;

/**
 * Save all current settings for a specific data source
 * @param {string} dataSource - The data source ID (query ID or 'offline')
 * @param {Object} settings - All current settings to save
 */
export function saveSettingsForDataSource(dataSource, settings) {
  if (!dataSource) {
    console.warn('Cannot save settings: data source is required');
    return;
  }

  try {
    const key = `${SETTINGS_PREFIX}${dataSource}`;
    const serialized = JSON.stringify(settings);
    localStorage.setItem(key, serialized);
    console.log(`Settings saved for data source: ${dataSource}`);
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
}

/**
 * Load saved settings for a specific data source
 * @param {string} dataSource - The data source ID (query ID or 'offline')
 * @returns {Object|null} Saved settings or null if not found
 */
export function loadSettingsForDataSource(dataSource) {
  if (!dataSource) {
    return null;
  }

  try {
    const key = `${SETTINGS_PREFIX}${dataSource}`;
    const item = localStorage.getItem(key);
    if (!item) {
      return null;
    }
    const settings = JSON.parse(item);
    console.log(`Settings loaded for data source: ${dataSource}`);
    return settings;
  } catch (error) {
    console.error('Error loading settings:', error);
    return null;
  }
}

/**
 * Get all saved data sources that have settings
 * @returns {Array<string>} Array of data source IDs
 */
export function getDataSourcesWithSettings() {
  const dataSources = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SETTINGS_PREFIX)) {
        const dataSource = key.replace(SETTINGS_PREFIX, '');
        dataSources.push(dataSource);
      }
    }
  } catch (error) {
    console.error('Error getting data sources with settings:', error);
  }
  return dataSources;
}

/**
 * Delete settings for a specific data source
 * @param {string} dataSource - The data source ID
 */
export function deleteSettingsForDataSource(dataSource) {
  if (!dataSource) {
    return;
  }

  try {
    const key = `${SETTINGS_PREFIX}${dataSource}`;
    localStorage.removeItem(key);
    console.log(`Settings deleted for data source: ${dataSource}`);
  } catch (error) {
    console.error('Error deleting settings:', error);
  }
}

