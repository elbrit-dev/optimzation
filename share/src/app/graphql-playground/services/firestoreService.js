import { doc, setDoc, getDoc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_GQL_COLLECTION } from '../constants';

const DEFAULT_COLLECTION = DEFAULT_GQL_COLLECTION;

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
    await setDoc(docRef, data);
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
    querySnapshot.forEach((doc) => {
      const body = doc.data().body || '';
      // Only include queries that have a body
      if (body.trim()) {
        queries.push({
          id: doc.id,
          name: doc.id,
          body: body,
          urlKey: doc.data().urlKey || '',
          index: doc.data().index || '',
          clientSave: doc.data().clientSave || false,
          variables: doc.data().variables || '',
          month: doc.data().month || false,
          monthIndex: doc.data().monthIndex || '',
          transformerCode: doc.data().transformerCode || '', // Include transformerCode (legacy)
          readTransformerCode: doc.data().readTransformerCode !== undefined ? (doc.data().readTransformerCode || '') : undefined, // New format
          writeTransformerCode: doc.data().writeTransformerCode !== undefined ? (doc.data().writeTransformerCode || '') : undefined, // New format
          searchFields: doc.data().searchFields || {},
          sortFields: doc.data().sortFields || {},
          queryKeys: Array.isArray(doc.data().queryKeys) ? doc.data().queryKeys : [],
          bodyUpdatedAt: doc.data().bodyUpdatedAt || null,
          variablesUpdatedAt: doc.data().variablesUpdatedAt || null,
          transformerCodeUpdatedAt: doc.data().transformerCodeUpdatedAt || null,
          readTransformerCodeUpdatedAt: doc.data().readTransformerCodeUpdatedAt || null,
          writeTransformerCodeUpdatedAt: doc.data().writeTransformerCodeUpdatedAt || null,
          lastUpdatedBy: doc.data().lastUpdatedBy || null,
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
    const docRef = doc(db, DEFAULT_COLLECTION, '#__GLOBAL__#');
    await setDoc(docRef, { functions: functions || '' }, { merge: true });
  },

  /**
   * Load global functions
   * @returns {Promise<string>} The functions code as a string, or empty string if not found
   */
  async loadGlobalFunctions() {
    const docRef = doc(db, DEFAULT_COLLECTION, '#__GLOBAL__#');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.functions || '';
    }
    return '';
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

