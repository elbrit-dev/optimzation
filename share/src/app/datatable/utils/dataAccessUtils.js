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

/**
 * Get nested value from row using top-level key and nested path
 * @param {Object} row - Row object
 * @param {string} topLevelKey - Top-level key (e.g., "user")
 * @param {string} nestedPath - Nested path (e.g., "profile.name")
 * @returns {*} Value at nested path or undefined
 */
export function getNestedValue(row, topLevelKey, nestedPath) {
  if (!row || !topLevelKey) return undefined;
  const topLevelValue = getDataValue(row, topLevelKey);
  
  // If top-level key exists and has a value, try nested access
  if (topLevelValue != null && nestedPath) {
    // Split nested path and traverse
    const parts = nestedPath.split('.');
    let current = topLevelValue;
    for (const part of parts) {
      if (current == null) {
        break;
      }
      current = getDataValue(current, part);
    }
    // If we got a value, return it
    if (current != null) {
      return current;
    }
  }
  
  // Fallback: if top-level key doesn't exist or nested access failed,
  // try accessing nestedPath directly on the row (for flat data structures)
  if (nestedPath) {
    const directValue = getDataValue(row, nestedPath);
    if (directValue != null) {
      return directValue;
    }
  }
  
  // If no nestedPath, return top-level value (or undefined if it doesn't exist)
  return topLevelValue;
}

/**
 * Get available query keys from processed data (top-level keys with non-empty arrays)
 * @param {Object|Map} processedData - Processed GraphQL response
 * @param {string|null} dataSource - Current data source (query id or null for offline)
 * @returns {Array<string>} Array of query keys that have data
 */
export function getAvailableQueryKeys(processedData, dataSource) {
  if (!processedData || !dataSource) return [];
  return getDataKeys(processedData).filter((key) => {
    const value = getDataValue(processedData, key);
    return value && value.length > 0;
  });
}
