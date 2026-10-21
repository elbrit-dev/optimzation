import { firestoreService } from './firestoreService';

/**
 * Query registry - Firebase queries, plus offline docs (saved responses in
 * src/resource/offline) for the ids listed below.
 *
 * Offline docs are loaded only when one of them is asked for by id. A static
 * import put PrimaryStockOffline (21 MB of saved invoice data) into a chunk
 * every page loaded, because every DataProvider imports this registry.
 */
const OFFLINE_IDS = new Set(['PrimaryStockOffline']);

async function loadOfflineDoc(id) {
  if (!OFFLINE_IDS.has(id)) return null;
  const { default: offlineDocs } = await import('@/resource/offline');
  return offlineDocs[id] || null;
}

/**
 * Disabled queries (toggled in graphql-playground-v2) are invisible to every
 * registry consumer: no startup index check, no change watcher, no execution,
 * no nested lookup. The playground reads Firestore directly, so it still lists them.
 */
export function isQueryDisabled(doc) {
  return doc?.disabled === true;
}

/**
 * Get all Firebase queries.
 *
 * Offline docs are not listed: the startup index check skips them (they carry
 * their own json), and the data-source picker filters them out, so listing
 * them only cost loading their data. loadQuery() still serves them by id.
 * @returns {Promise<Array>} Query objects, sorted by name
 */
export async function getAllQueries() {
  const firebaseQueries = await firestoreService.getAllQueries();
  const queries = firebaseQueries.filter((q) => !isQueryDisabled(q));
  queries.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  return queries;
}

/**
 * Load a query by id - checks offline first, then Firebase
 * @param {string} id - Query/operation name
 * @returns {Promise<Object|null>} Query document or null
 */
export async function loadQuery(id) {
  const offline = await loadOfflineDoc(id);
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
