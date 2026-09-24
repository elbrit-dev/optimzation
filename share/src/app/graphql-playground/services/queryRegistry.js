import { firestoreService } from './firestoreService';
import offlineDocs from '@/resource/offline';

/**
 * Query registry - merges offline docs (from JS files) with Firebase queries.
 * Offline docs have json + body; Firebase docs have body (GQL). Both appear in dropdown.
 */

/**
 * Disabled queries (toggled in graphql-playground-v2) are invisible to every
 * registry consumer: no startup index check, no change watcher, no execution,
 * no nested lookup. The playground reads Firestore directly, so it still lists them.
 */
export function isQueryDisabled(doc) {
  return doc?.disabled === true;
}

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
  const merged = [...offlineQueries, ...firebaseQueries.filter((q) => !isQueryDisabled(q))];
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
  const doc = await firestoreService.loadQuery(id);
  if (isQueryDisabled(doc)) {
    console.warn(`Query "${id}" is disabled — skipping`);
    return null;
  }
  return doc;
}

export const queryRegistry = {
  getAllQueries,
  loadQuery,
};
