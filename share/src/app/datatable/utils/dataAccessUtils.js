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
 * Walk a path through an object, transparently iterating over arrays.
 * When the current value is an Array, the SAME remaining parts are applied
 * to every item (this also handles arrays-of-arrays, since re-entering this
 * function on an array item hits the Array branch again).
 * @param {*} current - Current value being walked
 * @param {Array<string>} parts - Remaining path segments to resolve
 * @returns {Array<*>} Flat array of resolved leaf values (null/undefined items skipped)
 */
function walkPath(current, parts) {
  if (current == null) return [];
  if (parts.length === 0) return [current];
  if (Array.isArray(current)) {
    return current.flatMap((item) => walkPath(item, parts));
  }
  const [part, ...rest] = parts;
  const next = getDataValue(current, part);
  return next == null ? [] : walkPath(next, rest);
}

/**
 * Resolve a nested path against a row, returning ALL matching leaf values.
 * Unlike getNestedValue (which returns a single value), this is array-aware:
 * if the path passes through a list field (e.g. custom_department_details),
 * it resolves the remaining path against every item in that list.
 * @param {Object} row - Row object
 * @param {string} topLevelKey - Top-level key (e.g., "custom_department_details")
 * @param {string} [nestedPath] - Nested path (e.g., "elbrit_department__name")
 * @returns {Array<*>} Array of resolved values (may be empty, or have more than 1 entry)
 */
export function resolveNestedValues(row, topLevelKey, nestedPath) {
  if (!row || !topLevelKey) return [];
  const top = getDataValue(row, topLevelKey);

  if (!nestedPath) {
    if (top == null) return [];
    return Array.isArray(top) ? top.filter((v) => v != null) : [top];
  }

  if (top != null) {
    const results = walkPath(top, nestedPath.split('.'));
    if (results.length > 0) return results;
  }

  // Fallback: topLevelKey doesn't exist on this row (e.g. rows are already
  // flat/unwrapped items rather than nested under the query root key) -
  // resolve nestedPath directly against the row itself. This also handles
  // array-typed fields reached this way (e.g. "custom_department_details.x").
  const directResults = walkPath(row, nestedPath.split('.'));
  if (directResults.length > 0) return directResults;

  // Last resort: match getNestedValue's original behavior of returning the
  // top-level value itself when nested access fully fails.
  return top != null ? [top] : [];
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
  const [first] = resolveNestedValues(row, topLevelKey, nestedPath);
  return first;
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

/**
 * Stable identity for row matching / change detection (ignores volatile __editingKey__).
 */
export function getStableRowIdentity(row, index = 0) {
  if (!row || typeof row !== 'object') return `__idx_${index}`;
  const id = row.id ?? row.key ?? row.__id__;
  if (id != null && id !== '') return String(id);
  if (row.name != null && row.name !== '') return `name:${String(row.name)}`;
  return `__idx_${index}`;
}

/**
 * Overlay cell edits from the editing buffer onto pipeline rows (matched by __editingKey__).
 * Pipeline input stays preFilteredData; display uses merged pipeline output + edits.
 */
export function applyEditingBufferToRows(baseRows, editRows) {
  if (!baseRows || !Array.isArray(baseRows) || baseRows.length === 0) return baseRows;
  if (!editRows || !Array.isArray(editRows) || editRows.length === 0) return baseRows;

  const editByKey = new Map();
  for (let i = 0; i < editRows.length; i++) {
    const row = editRows[i];
    if (row && row.__editingKey__ != null) {
      editByKey.set(row.__editingKey__, row);
    }
  }
  if (editByKey.size === 0) return baseRows;

  return baseRows.map((row) => {
    if (!row) return row;
    const edit = editByKey.get(row.__editingKey__);
    return edit ? { ...row, ...edit } : row;
  });
}
