import { doc, setDoc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FIRESTORE_COLLECTIONS } from '../constants';

const COLLECTION_NAME = FIRESTORE_COLLECTIONS.GQL;

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
    const docRef = doc(db, COLLECTION_NAME, operationName);
    await setDoc(docRef, data);
  },

  /**
   * Load a GraphQL query by operation name
   * @param {string} operationName - The operation name (document ID)
   * @returns {Promise<Object|null>} The document data or null if not found
   */
  async loadQuery(operationName) {
    const docRef = doc(db, COLLECTION_NAME, operationName);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  },

  /**
   * Delete a GraphQL query
   * @param {string} operationName - The operation name (document ID)
   * @returns {Promise<void>}
   */
  async deleteQuery(operationName) {
    const docRef = doc(db, COLLECTION_NAME, operationName);
    await deleteDoc(docRef);
  },

  /**
   * Get all saved queries
   * @returns {Promise<Array>} Array of query objects with id
   */
  async getAllQueries() {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
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
          transformerCode: doc.data().transformerCode || '', // Include transformerCode
          bodyUpdatedAt: doc.data().bodyUpdatedAt || null,
          variablesUpdatedAt: doc.data().variablesUpdatedAt || null,
          transformerCodeUpdatedAt: doc.data().transformerCodeUpdatedAt || null,
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
    const docRef = doc(db, COLLECTION_NAME, '#__GLOBAL__#');
    await setDoc(docRef, { functions: functions || '' }, { merge: true });
  },

  /**
   * Load global functions
   * @returns {Promise<string>} The functions code as a string, or empty string if not found
   */
  async loadGlobalFunctions() {
    const docRef = doc(db, COLLECTION_NAME, '#__GLOBAL__#');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.functions || '';
    }
    return '';
  },
};

