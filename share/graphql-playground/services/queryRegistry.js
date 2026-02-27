import { firestoreService } from './firestoreService';
import offlineDocs from '@/resource/offline';

/**
 * Query registry - merges offline docs (from JS files) with Firebase queries.
 * Offline docs have json + body; Firebase docs have body (GQL). Both appear in dropdown.
 */

/**
 * Convert offline doc to getAllQueries array format
 */
function offlineDocToQuery(doc) {
  return {
    id: doc.id,
    name: doc.name || doc.id,
    body: doc.body || '',
    json: doc.json,
    transformerCode: doc.transformerCode || '',
    index: doc.index || '',
    queryKeys: Array.isArray(doc.queryKeys) ? doc.queryKeys : [],
    searchFields: doc.searchFields || {},
    sortFields: doc.sortFields || {},
    _offline: true,
  };
}

/**
 * Get all queries (Firebase + offline merged)
 * @returns {Promise<Array>} Combined list of query objects
 */
export async function getAllQueries() {
  const firebaseQueries = await firestoreService.getAllQueries();
  const offlineQueries = Object.values(offlineDocs)
    .filter((doc) => doc.json != null && doc.body)
    .map(offlineDocToQuery);
  const merged = [...offlineQueries, ...firebaseQueries];
  merged.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  return merged;
}

/**
 * Load a query by id - checks offline first, then Firebase
 * @param {string} id - Query/operation name
 * @returns {Promise<Object|null>} Query document or null
 */
export async function loadQuery(id) {
  const offline = offlineDocs[id];
  if (offline && offline.json != null && offline.body) {
    return { ...offline, _offline: true };
  }
  return firestoreService.loadQuery(id);
}

export const queryRegistry = {
  getAllQueries,
  loadQuery,
};
