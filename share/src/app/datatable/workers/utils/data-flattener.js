import { flatten } from 'flat';

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * Flatten array of node objects to 1D using flat library
 * @param {Array} nodes - Array of node objects
 * @returns {Array} Array of flattened objects
 */
export function flattenResponse(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];

  try {
    // Flatten each node object to 1D
    const flattened = nodes.map((node, index) => {
      if (!node || typeof node !== 'object') {
        return { __index__: index, value: node };
      }

      // Use flat library to flatten nested objects to 1D with underscore separator
      const flattenedNode = flatten(node, {
        delimiter: '_',  // Use underscore as separator
        safe: true,       // Don't flatten arrays (keep them as-is)
        maxDepth: 10,     // Maximum depth to flatten
      });

      // Process the flattened object - keep arrays as arrays
      const processed = { __index__: index };
      for (const key in flattenedNode) {
        if (flattenedNode.hasOwnProperty(key)) {
          processed[key] = flattenedNode[key];
        }
      }

      // Preserve original top-level object fields as objects so object-typed columns remain available.
      // Flattened child fields (e.g. issue_type_name) are still kept for backward compatibility.
      for (const [key, value] of Object.entries(node)) {
        if (isPlainObject(value)) {
          processed[key] = value;
        }
      }

      return processed;
    });

    return flattened;
  } catch (error) {
    console.error('Error flattening response:', error);
    return [];
  }
}

/**
 * Remove __index__ keys from processed data
 * @param {any} data - Data to clean (can be object, array, Map, or primitive)
 * @returns {any} Data with __index__ keys removed, preserving original type (Map or Object)
 */
export function removeIndexKeys(data) {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => removeIndexKeys(item));
  }

  // Handle Map before general object check
  if (data instanceof Map) {
    const cleaned = new Map();
    for (const [key, value] of data.entries()) {
      if (key !== '__index__') {
        cleaned.set(key, removeIndexKeys(value));
      }
    }
    return cleaned;
  }

  if (typeof data === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
      if (key !== '__index__') {
        cleaned[key] = removeIndexKeys(value);
      }
    }
    return cleaned;
  }

  return data;
}


