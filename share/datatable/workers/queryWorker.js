/**
 * Web Worker for executing index queries, pipeline execution, and IndexedDB caching
 * Uses Comlink to expose API to main thread
 */

import * as Comlink from 'comlink';
import * as jmespath from 'jmespath';
import jsonata from 'jsonata';
import _ from 'lodash';
import { parse as parseJsonc, stripComments } from 'jsonc-parser';
import { parse as parseGraphQL } from 'graphql';
import Dexie from 'dexie';
import dayjs from 'dayjs';
import { flatten } from 'flat';

// Import worker utilities (we'll create these)
import { extractDataFromResponse } from './utils/data-extractor';
import { removeIndexKeys } from './utils/data-flattener';
import { extractValueFromGraphQLResponse } from './utils/queryExtractor';
import { extractYearMonthFromDate, generateMonthRangeArray, isYearMonthFormat, hasYearMonthPrefix } from './utils/dateUtils';
import { parseGraphQLVariables } from './utils/variableParser';
import { createExecutionContext, fetchGraphQLRequest, executeGraphQLQuery, applyMonthRangeToVariables, cleanProcessedData } from './utils/query-pipeline';
import { IndexedDBServiceWorker } from './utils/indexedDBServiceWorker';

// Constants (passed from main thread or defined here)
const DEFAULT_AUTH_TOKEN = '';

/**
 * Simple hash function for data structures (for logging/comparison)
 * Creates a deterministic hash from object/array structure
 */
function hashData(data) {
    if (data === null || data === undefined) return 'null';
    if (typeof data !== 'object') return String(data);
    
    try {
        // Create a normalized representation: keys sorted, arrays as arrays, objects as objects
        const normalized = JSON.stringify(data, Object.keys(data || {}).sort());
        // Simple hash: sum of char codes (not cryptographically secure, but fast and deterministic)
        let hash = 0;
        for (let i = 0; i < normalized.length; i++) {
            const char = normalized.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    } catch (e) {
        return 'error';
    }
}

// Worker state
let nestedQueryCallback = null; // Callback to request nested queries from main thread
let endpointConfigGetter = null; // Callback to get endpoint config from main thread
let globalFunctionsGetter = null; // Callback to get global functions code from main thread

// Initialize IndexedDB service
const indexedDBService = new IndexedDBServiceWorker();

/**
 * Set callback for requesting nested queries from main thread
 */
function setNestedQueryCallback(callback) {
    nestedQueryCallback = callback;
}

/**
 * Set callback for getting endpoint config
 */
function setEndpointConfigGetter(getter) {
    endpointConfigGetter = getter;
}

/**
 * Set callback for getting global functions code
 */
function setGlobalFunctionsGetter(getter) {
    globalFunctionsGetter = getter;
}

/**
 * Get endpoint config from urlKey
 */
async function getEndpointConfigFromUrlKey(urlKey) {
    if (endpointConfigGetter) {
        return await endpointConfigGetter(urlKey);
    }
    return { endpointUrl: null, authToken: null };
}

/**
 * Get initial endpoint
 */
async function getInitialEndpoint() {
    if (endpointConfigGetter) {
        return await endpointConfigGetter(null);
    }
    return null;
}

/**
 * Request nested query document from main thread
 */
async function requestNestedQuery(queryId) {
    if (!nestedQueryCallback) {
        throw new Error('Nested query callback not set');
    }
    return await nestedQueryCallback(queryId);
}

/**
 * Execute index query and cache result to IndexedDB
 */
async function executeIndexQuery(queryId, queryDoc, endpointUrl, authToken) {
    if (!queryId || !queryDoc || !queryDoc.index || !queryDoc.index.trim()) {
        console.warn(`Skipping index query for ${queryId}: no index query provided`);
        return null;
    }

    if (queryDoc.clientSave !== true) {
        console.log(`Skipping index query for ${queryId}: clientSave is not true`);
        return null;
    }

    try {
        // Get endpoint/auth from query's urlKey or provided params
        let finalEndpointUrl = endpointUrl;
        let finalAuthToken = authToken;

        if (queryDoc.urlKey) {
            const config = await getEndpointConfigFromUrlKey(queryDoc.urlKey);
            if (config.endpointUrl) {
                finalEndpointUrl = config.endpointUrl;
                finalAuthToken = config.authToken;
            }
        }

        if (!finalEndpointUrl) {
            const defaultEndpoint = await getInitialEndpoint();
            finalEndpointUrl = defaultEndpoint?.endpointUrl || null;
            finalAuthToken = defaultEndpoint?.authToken || null;
        }

        if (!finalEndpointUrl) {
            console.warn(`No endpoint available for index query ${queryId}`);
            await indexedDBService.saveQueryIndexResult(queryId, null, queryDoc);
            return null;
        }

        // Parse variables if provided
        const parsedVariables = parseGraphQLVariables(queryDoc.variables || '');

        // Execute the index query
        let response;
        try {
            response = await fetchGraphQLRequest(queryDoc.index, parsedVariables, {
                endpointUrl: finalEndpointUrl,
                authToken: finalAuthToken
            });
        } catch (fetchError) {
            console.error(`Failed to fetch index query for ${queryId}:`, fetchError.message || fetchError);
            await indexedDBService.saveQueryIndexResult(queryId, null, queryDoc);
            return null;
        }

        // Parse JSON response
        let jsonResponse;
        try {
            jsonResponse = await response.json();
        } catch (parseError) {
            console.error(`Failed to parse response for index query ${queryId}:`, parseError);
            await indexedDBService.saveQueryIndexResult(queryId, null, queryDoc);
            return null;
        }

        if (jsonResponse.errors) {
            console.error(`GraphQL errors for index query ${queryId}:`, jsonResponse.errors);
            await indexedDBService.saveQueryIndexResult(queryId, null, queryDoc);
            return null;
        }

        // Extract full date/timestamp from index query response
        const fullDate = extractValueFromGraphQLResponse(queryDoc.index, jsonResponse);

        // Handle two paths for saving:
        // 1. month == false: save full date string directly
        // 2. month == true: extract YYYY-MM from monthIndex query and save as { "YYYY-MM": "full date string" }
        let resultToSave = null;

        if (queryDoc.month === true && queryDoc.monthIndex && queryDoc.monthIndex.trim()) {
            // Extract YYYY-MM from monthIndex query
            const yearMonth = await executeMonthIndexQueryAndExtractYearMonth(
                queryDoc.monthIndex,
                queryDoc,
                finalEndpointUrl,
                finalAuthToken
            );

            if (yearMonth && fullDate) {
                resultToSave = {
                    [yearMonth]: fullDate
                };
                console.log(`Saved index result for ${queryId} as { "${yearMonth}": "${fullDate}" }`);
            } else {
                resultToSave = null;
            }
        } else {
            // month == false: save full date string directly
            if (fullDate) {
                resultToSave = fullDate;
                console.log(`Saved index result for ${queryId} as: ${fullDate}`);
            } else {
                resultToSave = null;
            }
        }

        // Store result in IndexedDB
        await indexedDBService.saveQueryIndexResult(queryId, resultToSave, queryDoc);
        return resultToSave;
    } catch (error) {
        console.error(`Error executing index query for ${queryId}:`, error);
        try {
            await indexedDBService.saveQueryIndexResult(queryId, null, queryDoc);
        } catch (saveError) {
            console.error(`Error saving null result for ${queryId}:`, saveError);
        }
        return null;
    }
}

/**
 * Execute monthIndex query and extract YYYY-MM
 */
async function executeMonthIndexQueryAndExtractYearMonth(monthIndexQuery, queryDoc, endpointUrl, authToken) {
    if (!monthIndexQuery || !monthIndexQuery.trim()) {
        return null;
    }

    try {
        // Get endpoint/auth
        let finalEndpointUrl = endpointUrl;
        let finalAuthToken = authToken;

        if (queryDoc?.urlKey) {
            const config = await getEndpointConfigFromUrlKey(queryDoc.urlKey);
            if (config.endpointUrl) {
                finalEndpointUrl = config.endpointUrl;
                finalAuthToken = config.authToken;
            }
        }

        if (!finalEndpointUrl) {
            const defaultEndpoint = await getInitialEndpoint();
            finalEndpointUrl = defaultEndpoint?.endpointUrl || null;
        }

        if (!finalEndpointUrl) {
            console.warn('No endpoint available for monthIndex query execution');
            return null;
        }

        // Parse variables if provided
        const parsedVariables = parseGraphQLVariables(queryDoc.variables || '');

        // Execute the monthIndex query
        const response = await fetchGraphQLRequest(monthIndexQuery, parsedVariables, {
            endpointUrl: finalEndpointUrl,
            authToken: finalAuthToken
        });

        // Parse JSON response
        const jsonResponse = await response.json();

        if (jsonResponse.errors) {
            console.error('GraphQL errors for monthIndex query:', jsonResponse.errors);
            return null;
        }

        // Extract the date value
        const dateValue = extractValueFromGraphQLResponse(monthIndexQuery, jsonResponse);

        if (!dateValue) {
            return null;
        }

        // Extract YYYY-MM from the date value
        return extractYearMonthFromDate(dateValue);
    } catch (error) {
        console.error('Error executing monthIndex query:', error);
        return null;
    }
}

/**
 * Execute full pipeline and cache result to IndexedDB
 */
async function executePipeline(queryId, queryDoc, endpointUrl, authToken, monthRange, variableOverrides = {}, allQueryDocs = {}) {
    if (!queryId || !queryDoc) {
        throw new Error('queryId and queryDoc are required');
    }

    if (queryDoc.clientSave !== true) {
        console.log(`Skipping pipeline execution for ${queryId}: clientSave is not true`);
        // Still execute pipeline but don't cache
    }

    // Create execution context
    const context = createExecutionContext();

    // Get endpoint/auth from query's urlKey or provided params
    let finalEndpointUrl = endpointUrl;
    let finalAuthToken = authToken;

    if (queryDoc.urlKey) {
        const config = await getEndpointConfigFromUrlKey(queryDoc.urlKey);
        if (config.endpointUrl) {
            finalEndpointUrl = config.endpointUrl;
            finalAuthToken = config.authToken;
        }
    }

    if (!finalEndpointUrl) {
        const defaultEndpoint = await getInitialEndpoint();
        finalEndpointUrl = defaultEndpoint?.endpointUrl || null;
        finalAuthToken = defaultEndpoint?.authToken || null;
    }

    if (!finalEndpointUrl) {
        throw new Error('GraphQL endpoint URL is not set');
    }

    // For month == true, extract YYYY-MM from monthIndex query first
    let yearMonthPrefix = null;
    if (queryDoc.month === true && queryDoc.monthIndex && queryDoc.monthIndex.trim()) {
        const yearMonth = await executeMonthIndexQueryAndExtractYearMonth(
            queryDoc.monthIndex,
            queryDoc,
            finalEndpointUrl,
            finalAuthToken
        );

        if (yearMonth) {
            yearMonthPrefix = yearMonth;
            console.log(`Extracted YYYY-MM from monthIndex query for ${queryId}: ${yearMonthPrefix}`);
        } else {
            console.warn(`Could not extract YYYY-MM for ${queryId}`);
            if (queryDoc.month === true) {
                throw new Error(`Could not extract YYYY-MM for month query ${queryId}`);
            }
        }
    }

    // Prepare monthRange for pipeline
    let monthRangeForPipeline = undefined;
    if (queryDoc.month === true && yearMonthPrefix) {
        // Parse YYYY-MM to create month range (first day to last day of month)
        const [year, month] = yearMonthPrefix.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = new Date(year, month - 1, lastDay);
        monthRangeForPipeline = [startDate, endDate];
    } else if (monthRange && Array.isArray(monthRange) && monthRange.length === 2) {
        monthRangeForPipeline = monthRange;
    }

    // Execute pipeline using worker pipeline executor
    const pipelineResult = await executePipelineWorkerInternal(queryId, queryDoc, context, {
        endpointUrl: finalEndpointUrl,
        authToken: finalAuthToken,
        monthRange: monthRangeForPipeline,
        variableOverrides,
        allQueryDocs
    });

    // Cache result if clientSave is true
    if (queryDoc.clientSave === true && pipelineResult && typeof pipelineResult === 'object') {
        await indexedDBService.ensureStoresForPipelineResult(queryId, pipelineResult, yearMonthPrefix, queryDoc);
        await indexedDBService.savePipelineResultEntries(queryId, pipelineResult, yearMonthPrefix, queryDoc);
        console.log(`Pipeline executed and cached for ${queryId}${yearMonthPrefix ? ` with prefix ${yearMonthPrefix}` : ''}`);
    }

    return pipelineResult;
}

/**
 * Execute pipeline worker (internal function with query doc provided)
 */
async function executePipelineWorkerInternal(queryId, queryDoc, context, options = {}) {
    const { endpointUrl, authToken, monthRange, variableOverrides: externalOverrides = {}, allQueryDocs = {} } = options;

    // Guardrail: Check for circular dependencies
    if (context.dependencyStack.includes(queryId)) {
        const cycle = [...context.dependencyStack, queryId].join(" → ");
        throw new Error(`Circular dependency detected: ${cycle}`);
    }

    // Guardrail: Check maximum depth
    if (context.dependencyStack.length >= context.maxDepth) {
        const chain = context.dependencyStack.join(" → ");
        throw new Error(`Maximum dependency depth (${context.maxDepth}) exceeded. Dependency chain: ${chain} → ${queryId}`);
    }

    // Guardrail: Check if already in flight
    if (context.inFlight.has(queryId)) {
        throw new Error(`Query "${queryId}" is already being executed.`);
    }

    // Mark as in-flight
    context.inFlight.add(queryId);
    context.dependencyStack.push(queryId);

    try {
        // Get endpoint and token
        let finalEndpointUrl = endpointUrl;
        let finalAuthToken = authToken;

        if (queryDoc.urlKey) {
            const urlKeyConfig = await getEndpointConfigFromUrlKey(queryDoc.urlKey);
            if (urlKeyConfig.endpointUrl) {
                finalEndpointUrl = urlKeyConfig.endpointUrl;
                finalAuthToken = urlKeyConfig.authToken;
            }
        }

        if (!finalEndpointUrl) {
            const defaultEndpoint = await getInitialEndpoint();
            finalEndpointUrl = endpointUrl || defaultEndpoint?.endpointUrl || null;
            finalAuthToken = authToken || defaultEndpoint?.authToken || DEFAULT_AUTH_TOKEN;
            if (!finalEndpointUrl) {
                throw new Error("GraphQL endpoint URL is not set");
            }
        }

        const { transformerCode, body, variables } = queryDoc;
        const hasTransformer = transformerCode && transformerCode.trim();

        // Prepare variable overrides for month range if needed
        let variableOverrides = {};
        if (monthRange) {
            const monthOverrides = applyMonthRangeToVariables(monthRange);
            variableOverrides = { ...monthOverrides };
        }

        // Merge external variable overrides
        if (Object.keys(externalOverrides).length > 0) {
            variableOverrides = { ...variableOverrides, ...externalOverrides };
        }

        // Execute GraphQL query
        let rawData = await executeGraphQLQuery(queryDoc, {
            endpointUrl: finalEndpointUrl,
            authToken: finalAuthToken,
            variableOverrides,
        });

        if (!rawData) {
            console.warn(`No data returned from GraphQL query: ${queryId}`);
            rawData = {};
        }

        // Create query function for transformer (handles nested queries)
        const queryFunction = async (nestedQueryId) => {
            if (!nestedQueryId || !nestedQueryId.trim()) {
                throw new Error("Query key is required");
            }

            // Check if query doc is in allQueryDocs cache
            let nestedQueryDoc = allQueryDocs[nestedQueryId];

            // If not in cache, request from main thread
            if (!nestedQueryDoc && nestedQueryCallback) {
                nestedQueryDoc = await requestNestedQuery(nestedQueryId);
                // Cache it for future use in this execution
                if (nestedQueryDoc) {
                    allQueryDocs[nestedQueryId] = nestedQueryDoc;
                }
            }

            if (!nestedQueryDoc) {
                throw new Error(`Query "${nestedQueryId}" not found`);
            }

            // Reuse the same execution context and options
            // Pass parent endpoint as fallback, but nested query's urlKey will take precedence (matches non-worker behavior)
            // Note: Don't pass monthRange - nested queries should use their own monthRange logic if they have it
            return executePipelineWorkerInternal(nestedQueryId, nestedQueryDoc, context, {
                endpointUrl: finalEndpointUrl,  // Fallback to parent endpoint
                authToken: finalAuthToken,      // Fallback to parent auth token
                allQueryDocs                    // Nested query's urlKey will override if present
            });
        };

        // Apply transformer if present
        let transformedData;
        if (hasTransformer) {
            // Global functions are loaded automatically in executeTransformerWorker via globalFunctionsGetter
            // Pass null to use getter (same behavior as main thread)
            const globalFunctionsCode = null;
            transformedData = await executeTransformerWorker(transformerCode, rawData, queryFunction, globalFunctionsCode);
        } else {
            transformedData = rawData;
        }

        // Clean processed data (remove __index__ keys)
        const cleanedData = cleanProcessedData(transformedData);

        return cleanedData;
    } catch (error) {
        console.error(`Pipeline failed: ${queryId}`, error);
        throw error;
    } finally {
        // Remove from in-flight and dependency stack
        context.inFlight.delete(queryId);
        context.dependencyStack.pop();
    }
}

/**
 * Execute transformer in worker context (override executeTransformer from utils)
 */
async function executeTransformerWorker(transformerCode, rawData, queryFunction, globalFunctionsCode = null) {
    if (!transformerCode || transformerCode.trim() === "") {
        return rawData;
    }

    const inputKeys = Object.keys(rawData).filter((key) => rawData[key] && rawData[key].length > 0);
    const inputRowCounts = inputKeys.reduce((acc, key) => {
        const arr = rawData[key];
        acc[key] = Array.isArray(arr) ? arr.length : 0;
        return acc;
    }, {});

    // Load global functions and create elbrit object
    let elbrit = {};
    let objectUrl = null;
    
    // Load global functions code if getter is available (same approach as main thread)
    let functionsCodeToUse = globalFunctionsCode;
    if (!functionsCodeToUse && globalFunctionsGetter) {
        try {
            functionsCodeToUse = await globalFunctionsGetter();
        } catch (error) {
            console.warn("Failed to get global functions from getter, continuing without elbrit:", error);
            functionsCodeToUse = null;
        }
    }
    
    if (functionsCodeToUse && functionsCodeToUse.trim()) {
        try {
            const blob = new Blob([functionsCodeToUse], { type: "text/javascript" });
            objectUrl = URL.createObjectURL(blob);
            try {
                elbrit = await import(/* webpackIgnore: true */ objectUrl);
            } finally {
                if (objectUrl) {
                    URL.revokeObjectURL(objectUrl);
                    objectUrl = null;
                }
            }
        } catch (error) {
            console.warn("Failed to load global functions in worker, continuing without elbrit:", error);
            elbrit = {};
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
                objectUrl = null;
            }
        }
    }

    // Wrap transformer code
    const transformerWrapper = `
    (async () => {
      ${transformerCode || ""}
    })()
  `;

    // Create function with imports and context
    const fn = new Function(
        "jmespath",
        "jsonata",
        "_",
        "data",
        "query",
        "elbrit",
        `
      const transformerResult = ${transformerWrapper};
      return transformerResult;
    `,
    );

    // Execute with provided context
    const dataCopy = rawData ? JSON.parse(JSON.stringify(rawData)) : {};

    let evalResult;
    try {
        evalResult = await fn(jmespath, jsonata, _, dataCopy, queryFunction, elbrit);
    } catch (error) {
        console.error("Transformer execution failed:", error);
        throw error;
    }

    // If result is valid, use it
    if (evalResult !== null && evalResult !== undefined) {
        const isObject = typeof evalResult === "object" && !Array.isArray(evalResult) && !(evalResult instanceof Map);
        const isMap = evalResult instanceof Map;

        if (isObject || isMap) {
            return evalResult;
        } else {
            console.warn("Transformer result is not an object or Map, returning original data");
            return rawData;
        }
    }

    // Fallback: if transformer didn't return anything
    console.warn("Transformer did not return a value, using original data");
    return rawData;
}

/**
 * Batch execute and cache index queries
 * Note: Endpoint config getter should be set via setEndpointConfigGetter before calling this
 */
async function executeAndCacheIndexQueries(queries) {
    if (!queries || queries.length === 0) {
        return;
    }

    // Execute index queries for each query that has an index field and clientSave === true
    // The executeIndexQuery function will use the endpoint config getter that was set during initialization
    const indexQueryPromises = queries
        .filter(query => query.index && query.index.trim() && query.clientSave === true)
        .map(async (query) => {
            // Get endpoint/auth from query's urlKey using the already-set getter
            let endpointUrl = null;
            let authToken = null;

            if (query.urlKey) {
                const config = await getEndpointConfigFromUrlKey(query.urlKey);
                endpointUrl = config.endpointUrl;
                authToken = config.authToken;
            }

            if (!endpointUrl) {
                const defaultEndpoint = await getInitialEndpoint();
                endpointUrl = defaultEndpoint?.endpointUrl || null;
                authToken = defaultEndpoint?.authToken || null;
            }

            return executeIndexQuery(query.id, query, endpointUrl, authToken);
        });

    await Promise.all(indexQueryPromises);
}

// Expose API via Comlink
const workerAPI = {
    executeIndexQuery,
    executePipeline,
    executeAndCacheIndexQueries,
    setNestedQueryCallback,
    setEndpointConfigGetter,
    setGlobalFunctionsGetter,
    // Expose indexedDBService methods for main thread access if needed
    indexedDBService: indexedDBService
};

Comlink.expose(workerAPI);

