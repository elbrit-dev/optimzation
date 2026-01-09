import Dexie from "dexie";
import { isYearMonthFormat, hasYearMonthPrefix } from "./dateUtils";

// Initialize client index database
const clientIndexDb = new Dexie("elbrit-client-index-db");

// Define client index database schema
clientIndexDb.version(1).stores({
    "elbrit-client-index-store": "queryId, updatedAt",
});

/**
 * Service for managing query index results in IndexedDB
 */
class IndexedDBService {
    constructor() {
        this.callbacks = new Map(); // Map<queryId, callback>
        this.queryDatabases = new Map(); // Map<queryId, Dexie instance> - cache for query databases
    }

    /**
     * Initialize and return the client index database instance
     * @returns {Dexie} Client index database instance
     */
    initDatabase() {
        return clientIndexDb;
    }

    /**
     * Get or create a database for a specific queryId
     * Creates the database if it doesn't exist
     * Note: This method should only be called for queries with clientSave === true
     * @param {string} queryId - The query identifier
     * @param {Object|null} queryDoc - Optional query document to check clientSave
     * @returns {Promise<Dexie>} Database instance for the query
     */
    async getQueryDatabase(queryId, queryDoc = null) {
        if (!queryId) {
            throw new Error("queryId is required");
        }

        // Only create database if clientSave is true (if queryDoc is provided)
        if (queryDoc && queryDoc.clientSave !== true) {
            throw new Error(`Cannot create database for ${queryId}: clientSave is not true`);
        }

        // Return cached database if exists
        if (this.queryDatabases.has(queryId)) {
            const cachedDb = this.queryDatabases.get(queryId);
            // Ensure it's open
            if (!cachedDb.isOpen()) {
                await cachedDb.open();
            }
            return cachedDb;
        }

        // Create new database for this queryId
        const dbName = `elbrit-${queryId}-db`;
        const queryDb = new Dexie(dbName);

        // Define schema (version 1) with empty stores initially
        // Stores will be created dynamically based on pipeline result keys
        queryDb.version(1).stores({});

        // Open the database to actually create it
        try {
            await queryDb.open();
            console.log(`Created database: ${dbName}`);
        } catch (error) {
            console.error(`Error opening database ${dbName}:`, error);
            throw error;
        }

        // Cache it
        this.queryDatabases.set(queryId, queryDb);

        return queryDb;
    }

    /**
     * Ensure stores exist for each key in the pipeline result
     * Creates stores dynamically if they don't exist
     * @param {string} queryId - The query identifier
     * @param {Object} pipelineResult - The pipeline result object with keys as store names
     * @param {string|null} yearMonthPrefix - Optional YYYY-MM prefix for month == true queries (e.g., "2026-01")
     * @param {Object|null} queryDoc - Optional query document to check clientSave
     * @returns {Promise<void>}
     */
    async ensureStoresForPipelineResult(queryId, pipelineResult, yearMonthPrefix = null, queryDoc = null) {
        if (!queryId || !pipelineResult || typeof pipelineResult !== "object") {
            return;
        }

        // Only create stores if clientSave is true (if queryDoc is provided)
        if (queryDoc && queryDoc.clientSave !== true) {
            console.log(`Skipping store creation for ${queryId}: clientSave is not true`);
            return;
        }

        const queryDb = await this.getQueryDatabase(queryId, queryDoc);
        const storeKeys = Object.keys(pipelineResult).filter(
            (key) =>
                pipelineResult[key] !== null && pipelineResult[key] !== undefined && Array.isArray(pipelineResult[key]),
        );

        if (storeKeys.length === 0) {
            return;
        }

        // Get current version and existing stores
        const currentVersion = queryDb.verno;
        const existingStores = queryDb.tables.map((table) => table.name);

        // For month == true, prefix store names with YYYY-MM
        const prefixedStoreKeys = yearMonthPrefix 
            ? storeKeys.map(key => `${yearMonthPrefix}_${key}`)
            : storeKeys;

        // Find stores that need to be created
        const storesToCreate = prefixedStoreKeys.filter((prefixedKey) => !existingStores.includes(prefixedKey));

        if (storesToCreate.length === 0) {
            // All stores already exist
            return;
        }

        // Close the database before schema change
        queryDb.close();

        // Create new version with additional stores
        const newStores = {};

        // Add existing stores (empty string means keep them)
        existingStores.forEach((storeName) => {
            newStores[storeName] = "";
        });

        // Add new stores (use ++ for auto-increment primary key, or specify a key)
        storesToCreate.forEach((storeName) => {
            newStores[storeName] = "++id, index"; // Using auto-increment id as primary key, index as indexed field for sorting
        });

        // Define new version with all stores
        queryDb.version(currentVersion + 1).stores(newStores);

        // Open the database again
        try {
            await queryDb.open();
            console.log(`Added stores to database Elbrit-${queryId}-DB:`, storesToCreate);
        } catch (error) {
            console.error(`Error updating database schema for ${queryId}:`, error);
            throw error;
        }
    }

    /**
     * Register a callback for a specific queryId
     * @param {string} queryId - The query identifier
     * @param {Function} callback - Async callback function: (queryId, oldResult, newResult, updatedAt, queryDoc) => Promise<void>
     */
    setOnChangeCallback(queryId, callback) {
        if (!queryId || typeof callback !== "function") {
            console.warn("Invalid callback registration: queryId and callback function are required");
            return;
        }
        this.callbacks.set(queryId, callback);
    }

    /**
     * Remove callback for a specific queryId
     * @param {string} queryId - The query identifier
     */
    removeOnChangeCallback(queryId) {
        this.callbacks.delete(queryId);
    }

    /**
     * Execute callback in background using backburner pattern
     * @param {string} queryId - The query identifier
     * @param {Object|null} oldResult - Previous result (parsed object)
     * @param {Object|null} newResult - New result (parsed object)
     * @param {number} updatedAt - Timestamp when saved
     * @param {Object|null} queryDoc - The query document used to get index query
     */
    _executeCallback(queryId, oldResult, newResult, updatedAt, queryDoc = null) {
        const callback = this.callbacks.get(queryId);
        if (!callback) {
            return;
        }

        // Use backburner pattern: execute in background without blocking
        const executeAsync = () => {
            Promise.resolve(callback(queryId, oldResult, newResult, updatedAt, queryDoc)).catch((error) => {
                // Log errors silently to console
                console.error(`Callback error for queryId ${queryId}:`, error);
            });
        };

        // Use requestIdleCallback if available, otherwise fallback to setTimeout
        if (typeof requestIdleCallback !== "undefined") {
            requestIdleCallback(executeAsync, { timeout: 5000 });
        } else {
            setTimeout(executeAsync, 0);
        }
    }

    /**
     * Save query index result only if it has changed
     * Preserves existing data on failures (null results) to maintain last known good state
     * @param {string} queryId - The query identifier
     * @param {Object|null} result - The result data object (stored as JSON object, not string)
     * @param {Object|null} queryDoc - The query document used to get index query (optional)
     * @returns {Promise<boolean>} True if saved (changed), false if unchanged
     */
    async saveQueryIndexResult(queryId, result, queryDoc = null) {
        if (!queryId) {
            console.warn("Cannot save: queryId is required");
            return false;
        }

        // Only save if clientSave is true
        if (!queryDoc || queryDoc.clientSave !== true) {
            console.log(`Skipping save for ${queryId}: clientSave is not true`);
            return false;
        }

        try {
            // Get existing result first
            const existing = await clientIndexDb["elbrit-client-index-store"].get(queryId);
            const existingResult = existing?.result || null;

            // If result is null (failure), don't override existing data
            // Preserve last known good data for resilience
            if (result === null || result === undefined) {
                if (existing) {
                    // Keep existing data, don't override with null
                    return false;
                }
                // Only save null if there's no existing data (first time failure)
            }

            // For month == true queries, result is { "YYYY-MM": "full date string" }
            // For month == false queries, result is the full date string directly
            // Compare JSON objects by converting to strings (for deep equality check)
            const existingResultString =
                existingResult !== null && existingResult !== undefined ? JSON.stringify(existingResult) : null;
            const resultString = result !== null && result !== undefined ? JSON.stringify(result) : null;

            // Check if result has changed
            if (resultString === existingResultString) {
                // No change, don't save
                return false;
            }

            // Result has changed, save it
            const updatedAt = Date.now();
            await clientIndexDb["elbrit-client-index-store"].put({
                queryId,
                result: result, // Store as string for month == false, or { "YYYY-MM": "string" } for month == true
                updatedAt,
            });

            // Results for callback: pass the full date string value
            // For month == false: result is already the string
            // For month == true: unwrap to get the string value from { "YYYY-MM": "string" }
            let oldResult = existingResult;
            let newResult = result;
            
            // If result is wrapped (month == true), unwrap it for callback
            if (result && typeof result === 'object' && !Array.isArray(result)) {
                const keys = Object.keys(result);
                // Check if it's a wrapped result (single key that looks like YYYY-MM)
                if (keys.length === 1 && isYearMonthFormat(keys[0])) {
                    // This is a wrapped result, unwrap for callback (get the string value)
                    newResult = result[keys[0]];
                    if (existingResult && typeof existingResult === 'object' && !Array.isArray(existingResult)) {
                        const existingKeys = Object.keys(existingResult);
                        if (existingKeys.length === 1 && isYearMonthFormat(existingKeys[0])) {
                            oldResult = existingResult[existingKeys[0]];
                        }
                    }
                }
            }
            // For month == false, result is already a string, so no unwrapping needed

            // Execute callback in background if registered (pass queryDoc)
            this._executeCallback(queryId, oldResult, newResult, updatedAt, queryDoc);

            return true;
        } catch (error) {
            console.error(`Error saving query index result for ${queryId}:`, error);
            throw error;
        }
    }

    /**
     * Get query index result
     * @param {string} queryId - The query identifier
     * @returns {Promise<Object|null>} Result object with { result, updatedAt } or null if not found
     */
    async getQueryIndexResult(queryId) {
        if (!queryId) {
            return null;
        }

        try {
            const entry = await clientIndexDb["elbrit-client-index-store"].get(queryId);
            if (!entry) {
                return null;
            }

            // Result is already a JSON object, no parsing needed
            return {
                result: entry.result,
                updatedAt: entry.updatedAt,
            };
        } catch (error) {
            console.error(`Error getting query index result for ${queryId}:`, error);
            return null;
        }
    }

    /**
     * Get all query index results
     * @returns {Promise<Array>} Array of { queryId, result, updatedAt }
     */
    async getAllQueryIndexResults() {
        try {
            const entries = await clientIndexDb["elbrit-client-index-store"].toArray();
            return entries.map((entry) => ({
                queryId: entry.queryId,
                result: entry.result, // Result is already a JSON object
                updatedAt: entry.updatedAt,
            }));
        } catch (error) {
            console.error("Error getting all query index results:", error);
            return [];
        }
    }

    /**
     * Clear a specific query index result
     * @param {string} queryId - The query identifier
     * @returns {Promise<boolean>} True if cleared, false if not found
     */
    async clearQueryIndexResult(queryId) {
        if (!queryId) {
            return false;
        }

        try {
            // Check if entry exists before deleting
            const existing = await clientIndexDb["elbrit-client-index-store"].get(queryId);
            if (!existing) {
                return false;
            }

            await clientIndexDb["elbrit-client-index-store"].delete(queryId);
            return true;
        } catch (error) {
            console.error(`Error clearing query index result for ${queryId}:`, error);
            throw error;
        }
    }

    /**
     * Clear all query index results
     * @returns {Promise<void>}
     */
    async clearQueryIndexResults() {
        try {
            await clientIndexDb["elbrit-client-index-store"].clear();
        } catch (error) {
            console.error("Error clearing query index results:", error);
            throw error;
        }
    }

    /**
     * Save pipeline result entries to IndexedDB tables
     * Stores each object from pipeline result arrays as individual entries
     * @param {string} queryId - The query identifier
     * @param {Object} pipelineResult - The pipeline result object with keys as store names and arrays as values
     * @returns {Promise<void>}
     */
    /**
     * Save pipeline result entries to IndexedDB stores
     * @param {string} queryId - The query identifier
     * @param {Object} pipelineResult - The pipeline result object with keys as store names
     * @param {string|null} yearMonthPrefix - Optional YYYY-MM prefix for month == true queries (e.g., "2026-01")
     * @param {Object|null} queryDoc - Optional query document to check clientSave
     * @returns {Promise<void>}
     */
    async savePipelineResultEntries(queryId, pipelineResult, yearMonthPrefix = null, queryDoc = null) {
        if (!queryId || !pipelineResult || typeof pipelineResult !== "object") {
            return;
        }

        // Only save entries if clientSave is true (if queryDoc is provided)
        if (queryDoc && queryDoc.clientSave !== true) {
            console.log(`Skipping pipeline result entries save for ${queryId}: clientSave is not true`);
            return;
        }

        const queryDb = await this.getQueryDatabase(queryId, queryDoc);
        const storeKeys = Object.keys(pipelineResult).filter(
            (key) =>
                pipelineResult[key] !== null && pipelineResult[key] !== undefined && Array.isArray(pipelineResult[key]),
        );

        if (storeKeys.length === 0) {
            return;
        }

        // Get existing stores
        const existingStores = queryDb.tables.map((table) => table.name);

        // Process each store/key
        for (const key of storeKeys) {
            const arrayData = pipelineResult[key];
            if (!Array.isArray(arrayData) || arrayData.length === 0) {
                continue;
            }

            // For month == true, prefix store name with YYYY-MM
            const storeName = yearMonthPrefix ? `${yearMonthPrefix}_${key}` : key;

            // Check if store exists
            if (!existingStores.includes(storeName)) {
                console.warn(`Store "${storeName}" does not exist for queryId ${queryId}, skipping`);
                continue;
            }

            try {
                // Clear existing entries for this store
                await queryDb.table(storeName).clear();

                // Prepare entries for bulk insert
                const entries = arrayData.map((dataItem, index) => ({
                    index: index,
                    data: dataItem, // Store as JSON object (not stringified)
                }));

                // Bulk insert entries
                await queryDb.table(storeName).bulkAdd(entries);
            } catch (error) {
                console.error(`Error saving pipeline result entries for key "${storeName}" in queryId ${queryId}:`, error);
                throw error;
            }
        }
    }

    /**
     * Load pipeline result entries from a specific table/key
     * @param {string} queryId - The query identifier
     * @param {string} key - The store/key name
     * @returns {Promise<Array>} Array of objects sorted by index field
     */
    async loadPipelineResultEntries(queryId, key) {
        if (!queryId || !key) {
            return [];
        }

        try {
            const queryDb = await this.getQueryDatabase(queryId);

            // Check if store exists
            const existingStores = queryDb.tables.map((table) => table.name);
            if (!existingStores.includes(key)) {
                console.warn(`Store "${key}" does not exist for queryId ${queryId}`);
                return [];
            }

            // Load all entries and sort by index
            const entries = await queryDb.table(key).orderBy("index").toArray();

            // Extract data field from each entry (objects are already deserialized by Dexie)
            return entries.map((entry) => entry.data);
        } catch (error) {
            console.error(`Error loading pipeline result entries for key "${key}" in queryId ${queryId}:`, error);
            return [];
        }
    }

    /**
     * Reconstruct pipeline result object structure from stored entries
     * @param {string} queryId - The query identifier
     * @param {Array<string>} keys - Optional array of keys to reconstruct. If not provided, reconstructs all keys
     * @param {string|null} yearMonthPrefix - Optional YYYY-MM prefix for month == true queries (e.g., "2026-01")
     * @returns {Promise<Object>} Reconstructed pipeline result object: { key1: [obj1, obj2, ...], key2: [obj3, ...] }
     */
    async reconstructPipelineResult(queryId, keys = null, yearMonthPrefix = null) {
        if (!queryId) {
            return {};
        }

        try {
            const queryDb = await this.getQueryDatabase(queryId);
            const reconstructed = {};

            // Get list of keys to reconstruct
            let keysToReconstruct = keys;
            if (!keysToReconstruct) {
                // Reconstruct all stores in the database
                keysToReconstruct = queryDb.tables.map((table) => table.name);
                
                // If yearMonthPrefix is provided, filter to only stores with that prefix
                if (yearMonthPrefix) {
                    keysToReconstruct = keysToReconstruct.filter(storeName => 
                        storeName.startsWith(`${yearMonthPrefix}_`)
                    );
                } else {
                    // For month == false, exclude stores that have YYYY-MM prefix pattern
                    keysToReconstruct = keysToReconstruct.filter(storeName => 
                        !hasYearMonthPrefix(storeName)
                    );
                }
            }

            // Get existing stores
            const existingStores = queryDb.tables.map((table) => table.name);

            // Reconstruct each key
            for (const storeName of keysToReconstruct) {
                if (!existingStores.includes(storeName)) {
                    continue;
                }

                // Load entries for this store (already sorted by index)
                const dataArray = await this.loadPipelineResultEntries(queryId, storeName);
                if (dataArray.length > 0) {
                    // For month == true, remove the prefix from the key in the reconstructed object
                    const key = yearMonthPrefix && storeName.startsWith(`${yearMonthPrefix}_`)
                        ? storeName.substring(yearMonthPrefix.length + 1)
                        : storeName;
                    reconstructed[key] = dataArray;
                }
            }

            return reconstructed;
        } catch (error) {
            console.error(`Error reconstructing pipeline result for queryId ${queryId}:`, error);
            return {};
        }
    }
}

// Export singleton instance
export const indexedDBService = new IndexedDBService();
