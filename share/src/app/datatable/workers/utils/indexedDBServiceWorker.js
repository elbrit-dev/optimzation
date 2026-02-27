import Dexie from "dexie";
import { isYearMonthFormat, hasYearMonthPrefix } from "./dateUtils";

// Initialize client index database
const clientIndexDb = new Dexie("elbrit-client-index-db");

// Define client index database schema
clientIndexDb.version(1).stores({
    "elbrit-client-index-store": "queryId, updatedAt",
});

/**
 * Service for managing query index results and pipeline results in IndexedDB (Worker context)
 */
export class IndexedDBServiceWorker {
    constructor() {
        this.callbacks = new Map(); // Map<queryId, callback>
        this.queryDatabases = new Map(); // Map<queryId, Dexie instance> - cache for query databases
        this._cacheLockByQuery = new Map(); // Per-queryId lock to serialize cache operations
    }

    /**
     * Run a function with exclusive cache lock for the given queryId.
     * Serializes ensureStores + save so only one runs at a time per query.
     * @param {string} queryId - The query identifier
     * @param {Function} fn - Async function to run
     * @returns {Promise<*>} Result of fn
     */
    async _withCacheLock(queryId, fn) {
        const prev = this._cacheLockByQuery.get(queryId) ?? Promise.resolve();
        const next = prev.then(() => fn(), () => fn());
        this._cacheLockByQuery.set(queryId, next);
        return next;
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
        
        // Check if database already exists using native IndexedDB API to detect existing stores
        let existingStores = {};
        try {
            const dbExists = await new Promise((resolve, reject) => {
                const request = indexedDB.open(dbName);
                request.onsuccess = () => {
                    const db = request.result;
                    if (db.objectStoreNames && db.objectStoreNames.length > 0) {
                        // Database exists with stores - include them in schema
                        for (let i = 0; i < db.objectStoreNames.length; i++) {
                            const storeName = db.objectStoreNames[i];
                            existingStores[storeName] = "++id, index"; // Use same structure as we use for new stores
                        }
                    }
                    db.close();
                    resolve(existingStores);
                };
                request.onerror = () => {
                    // Database doesn't exist or can't be opened - will create new one
                    resolve({}); // Return empty stores - will create new database
                };
                request.onblocked = () => {
                    // Database is blocked - try again later or use empty stores
                    resolve({});
                };
            });
        } catch (error) {
            // Error checking - will create new database
        }
        
        const queryDb = new Dexie(dbName);

        // Define schema with existing stores (or empty if new database)
        // Stores will be created dynamically based on pipeline result keys for new ones
        queryDb.version(1).stores(existingStores);

        // Open the database
        try {
            await queryDb.open();
            console.log(`Opened database: ${dbName} with stores:`, Object.keys(existingStores));
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

        // Retry logic for version upgrade (handles race conditions)
        const maxRetries = 5;
        const retryDelay = 100; // ms
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Close the database before schema change
                if (queryDb.isOpen()) {
                    queryDb.close();
                }
                this.queryDatabases.delete(queryId);

                // Small delay to let other operations complete
                if (attempt > 0) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
                }

                // Re-check existing stores (they might have been created by another thread)
                const freshDb = await this.getQueryDatabase(queryId, queryDoc);
                const freshStores = freshDb.tables.map((table) => table.name);
                const stillNeedToCreate = storesToCreate.filter(store => !freshStores.includes(store));
                
                if (stillNeedToCreate.length === 0) {
                    // Another thread already created the stores
                    return;
                }

                // Close fresh connection and remove from cache before creating new version
                if (freshDb.isOpen()) {
                    freshDb.close();
                }
                this.queryDatabases.delete(queryId);

                // Create new version with additional stores
                const newStores = {};

                // Add existing stores with their original schema
                freshStores.forEach((storeName) => {
                    newStores[storeName] = "++id, index";
                });

                // Add new stores
                stillNeedToCreate.forEach((storeName) => {
                    newStores[storeName] = "++id, index";
                });

                // Define new version with all stores
                const newVersionDb = new Dexie(freshDb.name);
                newVersionDb.version(freshDb.verno + 1).stores(newStores);

                // Open the database again
                await newVersionDb.open();
                
                // Update cache with new database instance
                this.queryDatabases.set(queryId, newVersionDb);
                
                console.log(`Added stores to database Elbrit-${queryId}-DB:`, stillNeedToCreate);
                return; // Success!
                
            } catch (error) {
                // Check for retryable Dexie errors using instanceof
                const isRetryableError = 
                    error instanceof Dexie.DatabaseClosedError ||
                    error instanceof Dexie.VersionChangeError ||
                    error instanceof Dexie.VersionError ||
                    (error?.name === 'DatabaseClosedError') ||
                    (error?.name === 'VersionChangeError') ||
                    (error?.name === 'VersionError');
                
                if (isRetryableError && attempt < maxRetries - 1) {
                    const errorMessage = error?.message || String(error);
                    console.warn(`Retry ${attempt + 1}/${maxRetries} for database upgrade on ${queryId}:`, errorMessage);
                    continue; // Retry
                }
                
                // Not retryable or max retries reached
                console.error(`Error updating database schema for ${queryId}:`, error);
                throw error;
            }
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

        const storeKeys = Object.keys(pipelineResult).filter(
            (key) =>
                pipelineResult[key] !== null && pipelineResult[key] !== undefined && Array.isArray(pipelineResult[key]),
        );

        if (storeKeys.length === 0) {
            return;
        }

        const maxRetries = 3;
        const isRetryableError = (err) =>
            err?.name === 'DatabaseClosedError' ||
            err?.name === 'NotFoundError' ||
            err?.message?.includes('object store') ||
            (err?.inner?.name === 'NotFoundError');

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const queryDb = await this.getQueryDatabase(queryId, queryDoc);
                const existingStores = queryDb.tables.map((table) => table.name);

                for (const key of storeKeys) {
                    const arrayData = pipelineResult[key];
                    if (!Array.isArray(arrayData) || arrayData.length === 0) {
                        continue;
                    }

                    const storeName = yearMonthPrefix ? `${yearMonthPrefix}_${key}` : key;

                    if (!existingStores.includes(storeName)) {
                        console.warn(`Store "${storeName}" does not exist for queryId ${queryId}, skipping`);
                        continue;
                    }

                    const entries = arrayData.map((dataItem, index) => ({
                        index: index,
                        data: dataItem,
                    }));

                    await queryDb.transaction('rw', storeName, async () => {
                        await queryDb.table(storeName).clear();
                        await queryDb.table(storeName).bulkAdd(entries);
                    });
                }
                return;
            } catch (error) {
                if (isRetryableError(error) && attempt < maxRetries - 1) {
                    this.queryDatabases.delete(queryId);
                    console.warn(`Retry ${attempt + 1}/${maxRetries} for savePipelineResultEntries on ${queryId}:`, error?.message || error);
                    await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
                    continue;
                }
                console.error(`Error saving pipeline result entries for queryId ${queryId}:`, error);
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
     * Check which month prefixes have cached data for a query
     * @param {string} queryId - The query identifier
     * @param {Array<string>} monthPrefixes - Array of YYYY-MM prefixes to check
     * @returns {Promise<Array<string>>} Array of month prefixes that have cached data
     */
    async getCachedMonthPrefixes(queryId, monthPrefixes) {
        if (!queryId || !monthPrefixes || !Array.isArray(monthPrefixes) || monthPrefixes.length === 0) {
            return [];
        }

        try {
            const queryDb = await this.getQueryDatabase(queryId);
            const existingStores = queryDb.tables.map((table) => table.name);
            const cachedPrefixes = [];

            // Check each month prefix to see if it has any stores
            for (const prefix of monthPrefixes) {
                // Check if there are any stores that start with this prefix
                const hasStores = existingStores.some(storeName => 
                    storeName.startsWith(`${prefix}_`)
                );
                if (hasStores) {
                    cachedPrefixes.push(prefix);
                }
            }

            return cachedPrefixes;
        } catch (error) {
            console.error(`Error checking cached month prefixes for queryId ${queryId}:`, error);
            return [];
        }
    }

    /**
     * Reconstruct pipeline result object structure from stored entries
     * @param {string} queryId - The query identifier
     * @param {Array<string>} keys - Optional array of keys to reconstruct. If not provided, reconstructs all keys
     * @param {string|Array<string>|null} yearMonthPrefix - Optional YYYY-MM prefix(es) for month == true queries (e.g., "2026-01" or ["2026-01", "2026-02"])
     * @returns {Promise<Object>} Reconstructed pipeline result object: { key1: [obj1, obj2, ...], key2: [obj3, ...] }
     */
    async reconstructPipelineResult(queryId, keys = null, yearMonthPrefix = null) {
        if (!queryId) {
            return {};
        }

        try {
            const queryDb = await this.getQueryDatabase(queryId);
            const reconstructed = {};

            // Check if yearMonthPrefix is an array (multi-month range)
            const isMultiMonth = Array.isArray(yearMonthPrefix) && yearMonthPrefix.length > 0;
            const isSingleMonth = !isMultiMonth && yearMonthPrefix && typeof yearMonthPrefix === 'string';

            // Get list of keys to reconstruct
            let keysToReconstruct = keys;
            if (!keysToReconstruct) {
                // Reconstruct all stores in the database
                keysToReconstruct = queryDb.tables.map((table) => table.name);
                
                // If yearMonthPrefix is provided, filter to only stores with that prefix(es)
                if (isMultiMonth) {
                    // Filter to stores that start with any of the prefixes
                    keysToReconstruct = keysToReconstruct.filter(storeName => 
                        yearMonthPrefix.some(prefix => storeName.startsWith(`${prefix}_`))
                    );
                } else if (isSingleMonth) {
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

            if (isMultiMonth) {
                // Multi-month reconstruction: merge data from multiple months
                // First, collect all stores grouped by their base key (without prefix)
                const storesByKey = new Map();

                for (const storeName of keysToReconstruct) {
                    if (!existingStores.includes(storeName)) {
                        continue;
                    }

                    // Extract the base key by removing the prefix
                    for (const prefix of yearMonthPrefix) {
                        if (storeName.startsWith(`${prefix}_`)) {
                            const baseKey = storeName.substring(prefix.length + 1);
                            if (!storesByKey.has(baseKey)) {
                                storesByKey.set(baseKey, []);
                            }
                            storesByKey.get(baseKey).push(storeName);
                            break; // Only match once
                        }
                    }
                }

                // Load and merge data for each key
                for (const [baseKey, storeNames] of storesByKey.entries()) {
                    const mergedArray = [];
                    // Process stores in prefix order (chronological order)
                    for (const prefix of yearMonthPrefix) {
                        const storeName = `${prefix}_${baseKey}`;
                        if (storeNames.includes(storeName)) {
                            const dataArray = await this.loadPipelineResultEntries(queryId, storeName);
                            if (dataArray && dataArray.length > 0) {
                                mergedArray.push(...dataArray);
                            }
                        }
                    }
                    if (mergedArray.length > 0) {
                        reconstructed[baseKey] = mergedArray;
                    }
                }
            } else {
                // Single month or no month prefix: original logic
                for (const storeName of keysToReconstruct) {
                    if (!existingStores.includes(storeName)) {
                        continue;
                    }

                    // Load entries for this store (already sorted by index)
                    const dataArray = await this.loadPipelineResultEntries(queryId, storeName);
                    if (dataArray.length > 0) {
                        // For month == true, remove the prefix from the key in the reconstructed object
                        const key = isSingleMonth && storeName.startsWith(`${yearMonthPrefix}_`)
                            ? storeName.substring(yearMonthPrefix.length + 1)
                            : storeName;
                        reconstructed[key] = dataArray;
                    }
                }
            }

            return reconstructed;
        } catch (error) {
            console.error(`Error reconstructing pipeline result for ${queryId}:`, error);
            return {};
        }
    }
}

