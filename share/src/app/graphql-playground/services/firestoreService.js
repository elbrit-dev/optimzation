import { doc, setDoc, getDoc, deleteDoc, updateDoc, deleteField, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
const DEFAULT_COLLECTION = process.env.NEXT_PUBLIC_GQL_COLLECTION || 'gql';
const GLOBAL_DOC_ID = '#__GLOBAL__#';

function sanitizeTokenRows(rows) {
  if (!Array.isArray(rows)) return [];
  const cleaned = rows
    .map((row) => ({
      name: String(row?.name || '').trim().toUpperCase(),
      endpoint: String(row?.endpoint || '').trim(),
      token: String(row?.token || '').trim(),
      isDefault: Boolean(row?.isDefault),
    }))
    .filter((row) => row.name && row.endpoint);

  if (cleaned.length === 0) return [];

  let hasDefault = false;
  const normalized = cleaned.map((row) => {
    if (row.isDefault && !hasDefault) {
      hasDefault = true;
      return row;
    }
    return { ...row, isDefault: false };
  });

  if (!hasDefault) {
    normalized[0] = { ...normalized[0], isDefault: true };
  }

  return normalized;
}

/**
 * Recursively convert Firestore Timestamps and other non-JSON-serializable values to JSON-safe format
 */
function serializeForJson(obj) {
  if (obj && typeof obj.toDate === 'function') {
    return obj.toDate().toISOString();
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = serializeForJson(v);
    }
    return out;
  }
  if (Array.isArray(obj)) return obj.map(serializeForJson);
  return obj;
}

/**
 * Firestore service for GraphQL query operations
 */
export const firestoreService = {
  /**
   * Save a GraphQL query
   * @param {string} operationName - The operation name (document ID)
   * @param {Object} data - The data to save
   * @returns {Promise<void>}
   */
  async saveQuery(operationName, data) {
    const docRef = doc(db, DEFAULT_COLLECTION, operationName);
    await setDoc(docRef, data, { merge: true });
  },

  /**
   * Load a GraphQL query by operation name
   * @param {string} operationName - The operation name (document ID)
   * @returns {Promise<Object|null>} The document data or null if not found
   */
  async loadQuery(operationName) {
    const docRef = doc(db, DEFAULT_COLLECTION, operationName);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...data,
        searchFields: data.searchFields || {},
        sortFields: data.sortFields || {},
        queryKeys: Array.isArray(data.queryKeys) ? data.queryKeys : [],
      };
    }
    return null;
  },

  /**
   * Delete a GraphQL query
   * @param {string} operationName - The operation name (document ID)
   * @returns {Promise<void>}
   */
  async deleteQuery(operationName) {
    const docRef = doc(db, DEFAULT_COLLECTION, operationName);
    await deleteDoc(docRef);
  },

  /**
   * Get all saved queries
   * @returns {Promise<Array>} Array of query objects with id
   */
  async getAllQueries() {
    const querySnapshot = await getDocs(collection(db, DEFAULT_COLLECTION));
    const queries = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const body = data.body || '';
      // Only include queries that have a body
      if (body.trim()) {
        queries.push({
          ...data,
          id: docSnap.id,
          name: docSnap.id,
          searchFields: data.searchFields || {},
          sortFields: data.sortFields || {},
          queryKeys: Array.isArray(data.queryKeys) ? data.queryKeys : [],
        });
      }
    });
    // Sort by name
    queries.sort((a, b) => a.name.localeCompare(b.name));
    return queries;
  },

  /**
   * Save global functions
   * @param {string} functions - The functions code as a string
   * @returns {Promise<void>}
   */
  async saveGlobalFunctions(functions) {
    const docRef = doc(db, DEFAULT_COLLECTION, GLOBAL_DOC_ID);
    await setDoc(docRef, { functions: functions || '' }, { merge: true });
  },

  /**
   * Load global functions
   * @returns {Promise<string>} The functions code as a string, or empty string if not found
   */
  async loadGlobalFunctions() {
    const docRef = doc(db, DEFAULT_COLLECTION, GLOBAL_DOC_ID);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.functions || '';
    }
    return '';
  },

  async loadPresets() {
    const docRef = doc(db, DEFAULT_COLLECTION, GLOBAL_DOC_ID);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().presets || {};
    }
    return {};
  },

  async savePreset(name, jsonString) {
    const docRef = doc(db, DEFAULT_COLLECTION, GLOBAL_DOC_ID);
    await setDoc(docRef, { presets: { [name]: jsonString } }, { merge: true });
  },

  async deletePreset(name) {
    const docRef = doc(db, DEFAULT_COLLECTION, GLOBAL_DOC_ID);
    await updateDoc(docRef, { [`presets.${name}`]: deleteField() });
  },

  async loadGlobalTokens() {
    const docRef = doc(db, DEFAULT_COLLECTION, GLOBAL_DOC_ID);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return [];
    const data = docSnap.data();
    return sanitizeTokenRows(data?.tokens);
  },

  async saveGlobalTokens(tokens) {
    const docRef = doc(db, DEFAULT_COLLECTION, GLOBAL_DOC_ID);
    const sanitized = sanitizeTokenRows(tokens);
    await setDoc(docRef, { tokens: sanitized }, { merge: true });
    return sanitized;
  },

  /**
   * Load presets for a specific query (stored in query doc)
   * @param {string} queryId - The query document ID
   * @returns {Promise<Array<{ name: string, config: string }>>}
   */
  async loadPresetsForQuery(queryId) {
    if (!queryId) return [];
    const docRef = doc(db, DEFAULT_COLLECTION, queryId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const presets = docSnap.data().presets;
      return Array.isArray(presets) ? presets : [];
    }
    return [];
  },

  /**
   * Save a preset for a specific query (append or update by name)
   * @param {string} queryId - The query document ID
   * @param {string} name - Preset name
   * @param {string} config - Serialized config
   * @returns {Promise<void>}
   */
  async savePresetForQuery(queryId, name, config) {
    if (!queryId || !name) return;
    const docRef = doc(db, DEFAULT_COLLECTION, queryId);
    const docSnap = await getDoc(docRef);
    const existing = docSnap.exists() ? docSnap.data() : {};
    const presets = Array.isArray(existing.presets) ? [...existing.presets] : [];
    const idx = presets.findIndex((p) => p.name === name);
    const entry = { name, config };
    if (idx >= 0) {
      presets[idx] = entry;
    } else {
      presets.push(entry);
    }
    await setDoc(docRef, { ...existing, presets }, { merge: true });
  },

  /**
   * Delete a preset from a specific query
   * @param {string} queryId - The query document ID
   * @param {string} name - Preset name
   * @returns {Promise<void>}
   */
  async deletePresetForQuery(queryId, name) {
    if (!queryId || !name) return;
    const docRef = doc(db, DEFAULT_COLLECTION, queryId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;
    const existing = docSnap.data();
    const presets = Array.isArray(existing.presets)
      ? existing.presets.filter((p) => p.name !== name)
      : [];
    await setDoc(docRef, { ...existing, presets }, { merge: true });
  },

  /**
   * Export the entire GQL collection as JSON-serializable object
   * @param {string} [collectionName] - Collection to export (default: from env)
   * @returns {Promise<Object>} { collection, documents, exportedAt }
   */
  async exportCollectionAsJson(collectionName) {
    const coll = collectionName || DEFAULT_COLLECTION;
    const querySnapshot = await getDocs(collection(db, coll));
    const documents = {};
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      documents[docSnap.id] = serializeForJson(data);
    });
    return {
      collection: coll,
      documents,
      exportedAt: new Date().toISOString(),
    };
  },

  /**
   * Import documents from JSON into a Firestore collection
   * @param {string} collectionName - Target collection name
   * @param {Object} data - { collection, documents } from export format
   * @returns {Promise<{ imported: number }>}
   */
  async importCollectionFromJson(collectionName, data) {
    const coll = collectionName || data?.collection || DEFAULT_COLLECTION;
    const documents = data?.documents || {};
    const entries = Object.entries(documents);
    const BATCH_SIZE = 500;
    let imported = 0;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = entries.slice(i, i + BATCH_SIZE);
      for (const [docId, docData] of chunk) {
        batch.set(doc(db, coll, docId), docData);
        imported++;
      }
      await batch.commit();
    }
    return { imported };
  },
};

