/**
 * Optional async resolution of { mainFields, childTables } from DocType metadata.
 * Returns null until a GraphQL/meta endpoint is wired; callers fall back to writeForm.
 */

const cache = new Map();

/**
 * @param {{ writeDocTypeName?: string, graphqlToken?: string|null }} _ctx
 * @returns {Promise<{ mainFields: string[], childTables: Record<string, string[]> }|null>}
 */
export async function tryResolveWriteSchemaFromDoctype(_ctx) {
  void _ctx;
  return null;
}

/**
 * @param {string} key
 * @param {{ mainFields: string[], childTables: Record<string, string[]> }} structure
 */
export function cacheWriteSchemaStructure(key, structure) {
  if (!key || !structure) return;
  cache.set(String(key).trim(), structure);
}

/**
 * @param {string} key
 * @returns {{ mainFields: string[], childTables: Record<string, string[]> }|undefined}
 */
export function getCachedWriteSchemaStructure(key) {
  if (!key) return undefined;
  return cache.get(String(key).trim());
}
