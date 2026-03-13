import { flatten } from 'flat';

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

      return processed;
    });

    return flattened;
  } catch (error) {
    console.error('Error flattening response:', error);
    return [];
  }
}

/**
 * Remove __index__ keys from processed data.
 * Uses a WeakSet to detect circular references and avoid stack overflow.
 * @param {any} data - Data to clean (can be object, array, Map, or primitive)
 * @param {Object} [_ctx] - Internal context for circular reference detection
 * @returns {any} Data with __index__ keys removed, preserving original type (Map or Object)
 */
export function removeIndexKeys(data, _ctx) {
  const ctx = _ctx || { seen: new WeakSet() };

  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    if (ctx.seen.has(data)) return data;
    ctx.seen.add(data);
    return data.map(item => removeIndexKeys(item, ctx));
  }

  if (data instanceof Map) {
    if (ctx.seen.has(data)) return data;
    ctx.seen.add(data);
    const cleaned = new Map();
    for (const [key, value] of data.entries()) {
      if (key !== '__index__') {
        cleaned.set(key, removeIndexKeys(value, ctx));
      }
    }
    return cleaned;
  }

  if (typeof data === 'object') {
    if (ctx.seen.has(data)) return data;
    ctx.seen.add(data);
    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
      if (key !== '__index__') {
        cleaned[key] = removeIndexKeys(value, ctx);
      }
    }
    return cleaned;
  }

  return data;
}

