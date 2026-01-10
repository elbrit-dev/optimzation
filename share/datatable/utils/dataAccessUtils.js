/**
 * Utility functions to work with both Object and Map for data access
 * These functions provide a unified interface for accessing data regardless of structure
 */

/**
 * Get keys from either Object or Map
 * @param {Object|Map} data - Data structure (Object or Map)
 * @returns {Array<string>} Array of keys
 */
export function getDataKeys(data) {
  if (!data) return [];
  if (data instanceof Map) {
    return Array.from(data.keys());
  }
  return Object.keys(data);
}

/**
 * Get value from either Object or Map
 * @param {Object|Map} data - Data structure (Object or Map)
 * @param {string} key - Key to retrieve
 * @returns {*} Value associated with the key, or undefined if not found
 */
export function getDataValue(data, key) {
  if (!data || !key) return undefined;
  if (data instanceof Map) {
    return data.get(key);
  }
  return data[key];
}
