/**
 * Helpers for columnTypesOverride shape: legacy flat object vs new { main, nested } structure.
 * Used for backward compatibility and per-level override lookup for nested JSON tables.
 */

const VALID_TYPES = new Set(['string', 'number', 'date', 'boolean', 'object']);

function isTypeString(value) {
  return typeof value === 'string' && VALID_TYPES.has(value);
}

/**
 * @param {Object} obj - columnTypesOverride value
 * @returns {boolean} True if obj is legacy flat override (no main/nested, values are type strings)
 */
export function isLegacyColumnTypesOverride(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }
  if ('main' in obj || 'nested' in obj) {
    return false;
  }
  return Object.values(obj).every(isTypeString);
}

/**
 * @param {Object} columnTypesOverride - Full override (legacy or new shape)
 * @returns {Record<string, string>} Main table overrides: legacy object as-is, or columnTypesOverride.main
 */
export function getMainOverrides(columnTypesOverride) {
  if (!columnTypesOverride || typeof columnTypesOverride !== 'object') {
    return {};
  }
  if (isLegacyColumnTypesOverride(columnTypesOverride)) {
    return { ...columnTypesOverride };
  }
  if (columnTypesOverride.main && typeof columnTypesOverride.main === 'object') {
    return { ...columnTypesOverride.main };
  }
  return {};
}

/**
 * @param {Object} columnTypesOverride - Full override (new shape with nested)
 * @param {string[]} path - Field name path e.g. ["order_items"] or ["order_items", "line_items"]
 * @returns {Record<string, string>} Overrides for that level's columns (main slice at path)
 */
export function getNestedOverridesAtPath(columnTypesOverride, path) {
  if (!columnTypesOverride || typeof columnTypesOverride !== 'object' || !Array.isArray(path) || path.length === 0) {
    return {};
  }
  if (isLegacyColumnTypesOverride(columnTypesOverride)) {
    return {};
  }
  const nested = columnTypesOverride.nested;
  if (!nested || typeof nested !== 'object') {
    return {};
  }
  let current = nested[path[0]];
  for (let i = 1; i < path.length; i++) {
    if (!current || typeof current !== 'object') return {};
    current = current.nested && current.nested[path[i]];
  }
  if (!current || typeof current !== 'object') return {};
  const main = current.main;
  return main && typeof main === 'object' ? { ...main } : {};
}

/**
 * Set or clear a single column type override at a path. Returns new override object (immutable).
 * @param {Object} columnTypesOverride - Current full override
 * @param {string[]} path - [] for main table, or e.g. ["order_items"] or ["order_items", "line_items"]
 * @param {string} columnName - Column name at that level
 * @param {string|null|undefined} typeValue - "string"|"number"|"date"|"boolean"|"object", or null/undefined to clear (Auto)
 * @returns {Object} New columnTypesOverride (new shape with main/nested if path is nested)
 */
export function setOverrideAtPath(columnTypesOverride, path, columnName, typeValue) {
  const next = typeValue && VALID_TYPES.has(typeValue) ? typeValue : null;
  if (!Array.isArray(path) || path.length === 0) {
    const main = getMainOverrides(columnTypesOverride);
    if (isLegacyColumnTypesOverride(columnTypesOverride)) {
      const flat = { ...columnTypesOverride };
      if (next) flat[columnName] = next;
      else delete flat[columnName];
      return flat;
    }
    const mainNew = { ...main };
    if (next) mainNew[columnName] = next;
    else delete mainNew[columnName];
    return { ...columnTypesOverride, main: mainNew };
  }
  const path0 = path[0];
  const rest = path.slice(1);
  const base = columnTypesOverride && !isLegacyColumnTypesOverride(columnTypesOverride)
    ? { main: columnTypesOverride.main || {}, nested: { ...(columnTypesOverride.nested || {}) } }
    : { main: {}, nested: {} };
  const currentLevel = base.nested[path0] || { main: {}, nested: {} };
  base.nested[path0] = setOverrideAtPathInLevel(currentLevel, rest, columnName, typeValue);
  return base;
}

function setOverrideAtPathInLevel(level, path, columnName, typeValue) {
  const next = typeValue && VALID_TYPES.has(typeValue) ? typeValue : null;
  if (!path || path.length === 0) {
    const main = { ...(level.main || {}) };
    if (next) main[columnName] = next;
    else delete main[columnName];
    return { ...level, main };
  }
  const path0 = path[0];
  const rest = path.slice(1);
  const child = level.nested && level.nested[path0] ? { ...level.nested[path0] } : { main: {}, nested: {} };
  const updatedChild = setOverrideAtPathInLevel(child, rest, columnName, typeValue);
  const nested = { ...(level.nested || {}) };
  nested[path0] = updatedChild;
  return { ...level, nested };
}
