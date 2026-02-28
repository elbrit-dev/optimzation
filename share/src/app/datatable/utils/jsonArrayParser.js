/**
 * Utility functions to detect and parse JSON string arrays of objects
 */

import { isString, isArray, trim } from 'lodash';
import { applyDerivedColumns } from './derivedColumnsUtils';

function isPlainObjectValue(value) {
  return value != null && typeof value === 'object' && !isArray(value) && !(value instanceof Date);
}

/**
 * Check if a value looks like a JSON array of objects (string or actual array)
 * Pattern: [{ (with optional spaces) for strings, or actual array of objects
 * @param {*} value - Value to check
 * @returns {boolean} True if value matches pattern or is an array of objects
 */
export function isJsonArrayOfObjectsString(value) {
  // Check if it's already an array of objects
  if (isArray(value)) {
    if (value.length === 0) return true; // Empty array is valid
    return value.every(item => typeof item === 'object' && item !== null && !isArray(item));
  }
  
  // Check if it's a JSON string
  if (!isString(value) || !value.trim()) return false;
  const trimmed = trim(value);
  // Match pattern: optional whitespace, [, optional whitespace, {
  return /^\s*\[\s*\{/.test(trimmed);
}

/**
 * Parse a string as JSON array of objects
 * Returns array if successful, null otherwise
 * @param {string} value - String value to parse
 * @returns {Array<Object>|null} Parsed array of objects or null
 */
export function parseJsonArrayOfObjects(value) {
  if (!isJsonArrayOfObjectsString(value)) return null;
  
  try {
    const parsed = JSON.parse(value);
    // Verify it's an array of objects
    if (isArray(parsed) && parsed.length > 0 && parsed.every(item => typeof item === 'object' && item !== null && !isArray(item))) {
      return parsed;
    }
    // Empty array is also valid
    if (isArray(parsed) && parsed.length === 0) {
      return parsed;
    }
  } catch (e) {
    // Parsing failed, return null
    console.warn('Failed to parse JSON array:', e);
  }
  return null;
}

/**
 * Check if a value looks like a JSON object (string or actual plain object)
 * @param {*} value - Value to check
 * @returns {boolean} True if value is/contains a plain JSON object
 */
export function isJsonObjectLike(value) {
  if (isPlainObjectValue(value)) return true;
  if (!isString(value) || !value.trim()) return false;
  const trimmed = trim(value);
  if (!/^\s*\{/.test(trimmed)) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return isPlainObjectValue(parsed);
  } catch (e) {
    return false;
  }
}

/**
 * Parse a value as JSON object.
 * Returns plain object if successful, null otherwise.
 * @param {*} value - Value to parse
 * @returns {Object|null}
 */
export function parseJsonObject(value) {
  if (isPlainObjectValue(value)) return value;
  if (!isString(value) || !value.trim()) return null;
  const trimmed = trim(value);
  if (!/^\s*\{/.test(trimmed)) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return isPlainObjectValue(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

/**
 * Extract all nested tables from a row object
 * Scans all fields and parses any that match the JSON array pattern or are already arrays
 * @param {Object} row - Row object to scan
 * @param {number} depth - Current depth level (for recursive extraction)
 * @returns {Array<{fieldName: string, data: Array<Object>, title: string, depth: number}>} Array of nested table configs
 */
export function extractNestedTablesFromRow(row, depth = 0) {
  if (!row || typeof row !== 'object') return [];
  
  const nestedTables = [];
  
  // Iterate through all fields in the row
  for (const [fieldName, value] of Object.entries(row)) {
    // Skip special fields
    if (fieldName.startsWith('__')) continue;
    
    let parsed = null;
    
    // Check if value is already an array of objects
    if (isArray(value) && value.length > 0 && value.every(item => typeof item === 'object' && item !== null && !isArray(item))) {
      parsed = value;
    } else if (isArray(value) && value.length === 0) {
      // Empty array is also valid
      parsed = value;
    } else {
      // Check if value is a JSON array string
      parsed = parseJsonArrayOfObjects(value);
    }
    
    if (parsed !== null) {
      nestedTables.push({
        fieldName,
        data: parsed,
        title: fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Format title
        depth
      });
    }
  }
  
  return nestedTables;
}

/**
 * Recursively extract nested tables from data array
 * If a nested table's data contains JSON arrays, extract those too
 * @param {Array<Object>} data - Data array to process
 * @param {number} depth - Current depth level
 * @param {number} maxDepth - Maximum recursion depth (default: 10)
 * @param {Object} [options] - Optional { derivedColumns, getDataValue }
 * @returns {Array<Object>} Processed data with __nestedTables__ property
 */
export function extractJsonNestedTablesRecursive(data, depth = 0, maxDepth = 10, options = {}) {
  if (!isArray(data) || depth >= maxDepth) {
    return data;
  }

  const { derivedColumns, getDataValue } = options;

  return data.map(row => {
    if (!row || typeof row !== 'object' || row.__isGroupRow__) {
      return row;
    }

    // Extract nested tables from this row
    const nestedTables = extractNestedTablesFromRow(row, depth);

    // If we found nested tables, recursively process their data
    const processedNestedTables = nestedTables.map(nestedTable => {
      let processedData = extractJsonNestedTablesRecursive(nestedTable.data, depth + 1, maxDepth, options);
      if (derivedColumns?.length) {
        processedData = applyDerivedColumns(processedData, derivedColumns, {
          mode: 'nested',
          fieldName: nestedTable.fieldName,
          parentRow: row,
          getDataValue,
        });
      }
      return {
        ...nestedTable,
        data: processedData
      };
    });

    // Add __nestedTables__ property if we found any
    if (processedNestedTables.length > 0) {
      return {
        ...row,
        __nestedTables__: processedNestedTables
      };
    }

    return row;
  });
}
