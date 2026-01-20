/**
 * Web Worker for executing index queries, pipeline execution, and IndexedDB caching
 * Uses Comlink to expose API to main thread
 */

import * as Comlink from 'comlink';
import dayjs from 'dayjs';
import * as jmespath from 'jmespath';
import jsonata from 'jsonata';
import _ from 'lodash';
import jmespath_plus from '@metrichor/jmespath-plus'

// Import worker utilities (we'll create these)
import { extractYearMonthFromDate, generateMonthRangeArray } from './utils/dateUtils';
import { IndexedDBServiceWorker } from './utils/indexedDBServiceWorker';
import { applyMonthRangeToVariables, cleanProcessedData, createExecutionContext, executeGraphQLQuery, fetchGraphQLRequest } from './utils/query-pipeline';
import { extractValueFromGraphQLResponse } from './utils/queryExtractor';
import { parseGraphQLVariables } from './utils/variableParser';

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
 * @param {string} queryId - Query ID
 * @param {Object} queryDoc - Query document
 * @param {string} endpointUrl - Endpoint URL
 * @param {string} authToken - Auth token
 * @param {Object} monthRangeVariables - Optional object with startDate/endDate for month filtering
 */
async function executeIndexQuery(queryId, queryDoc, endpointUrl, authToken, monthRangeVariables = null) {
    // Always require index query for both month and non-month cases
    if (!queryDoc.index || !queryDoc.index.trim()) {
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
        let parsedVariables = parseGraphQLVariables(queryDoc.variables || '');
        
        // Merge monthRangeVariables if provided (takes precedence)
        if (monthRangeVariables && typeof monthRangeVariables === 'object') {
            parsedVariables = { ...parsedVariables, ...monthRangeVariables };
        }

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

        if (!fullDate) {
            await indexedDBService.saveQueryIndexResult(queryId, null, queryDoc);
            return null;
        }

        // Handle saving based on month flag:
        // 1. month == false: save full date string directly
        // 2. month == true: extract YYYY-MM from startDate (from monthRangeVariables or parsedVariables), save as { "YYYY-MM": "full date string" }
        let resultToSave = null;

        if (queryDoc.month === true) {
            // For month queries, extract YYYY-MM from startDate
            // Check monthRangeVariables first (if provided), then fall back to parsedVariables
            const startDate = (monthRangeVariables && monthRangeVariables.startDate) 
                ? monthRangeVariables.startDate 
                : parsedVariables.startDate;
            
            if (startDate) {
                const yearMonth = extractYearMonthFromDate(startDate);
                
                if (yearMonth) {
                    resultToSave = {
                        [yearMonth]: fullDate
                    };
                    console.log(`Saved index result for ${queryId} as { "${yearMonth}": "${fullDate}" }`);
                } else {
                    console.warn(`Could not extract YYYY-MM from startDate for ${queryId}:`, startDate);
                    resultToSave = null;
                }
            } else {
                console.warn(`Skipping index query for ${queryId}: month == true but startDate not provided in monthRangeVariables or query variables`);
                resultToSave = null;
            }
        } else {
            // For non-month queries, save full date string directly
            resultToSave = fullDate;
            console.log(`Saved index result for ${queryId} as: ${fullDate}`);
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
 * Calculate startDate and endDate for a given month (YYYY-MM format or Date objects)
 * @param {string|Date} monthValue - Month value in YYYY-MM format or Date object
 * @returns {Object|null} Object with startDate and endDate strings in YYYY-MM-DD format, or null if invalid
 */
function calculateMonthDateRange(monthValue) {
    if (!monthValue) {
        return null;
    }

    try {
        let monthDate;
        if (typeof monthValue === 'string') {
            // Parse YYYY-MM format
            const [year, month] = monthValue.split('-').map(Number);
            if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
                return null;
            }
            monthDate = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
        } else if (monthValue instanceof Date) {
            monthDate = dayjs(monthValue);
        } else {
            return null;
        }

        if (!monthDate.isValid()) {
            return null;
        }

        // Get first day of month
        const startDate = monthDate.startOf('month').format('YYYY-MM-DD');
        // Get last day of month
        const endDate = monthDate.endOf('month').format('YYYY-MM-DD');

        return { startDate, endDate };
    } catch (error) {
        console.error('Error calculating month date range:', error);
        return null;
    }
}

/**
 * Execute index query for a specific month with known yearMonth (for monthRange execution)
 * This is a helper function that executes the index query with date variables and saves with a known yearMonth
 * @param {string} queryId - Query ID
 * @param {Object} queryDoc - Query document
 * @param {string} endpointUrl - Endpoint URL
 * @param {string} authToken - Auth token
 * @param {Object} monthRangeVariables - Object with startDate/endDate for the month
 * @param {string} yearMonth - Known YYYY-MM format (e.g., "2025-10")
 * @returns {Promise<Object|null>} Result object with { yearMonth: fullDate } or null
 */
async function executeIndexQueryForSingleMonth(queryId, queryDoc, endpointUrl, authToken, monthRangeVariables, yearMonth) {
    // Always require index query for both month and non-month cases
    if (!queryDoc.index || !queryDoc.index.trim()) {
        console.warn(`Skipping index query for ${queryId} (${yearMonth}): no index query provided`);
        return null;
    }

    if (queryDoc.clientSave !== true) {
        return null;
    }

    try {
        // Get endpoint/auth
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
            return null;
        }

        // Parse variables and merge monthRangeVariables
        let parsedVariables = parseGraphQLVariables(queryDoc.variables || '');
        if (monthRangeVariables && typeof monthRangeVariables === 'object') {
            parsedVariables = { ...parsedVariables, ...monthRangeVariables };
        }

        // Execute the index query
        let response;
        try {
            response = await fetchGraphQLRequest(queryDoc.index, parsedVariables, {
                endpointUrl: finalEndpointUrl,
                authToken: finalAuthToken
            });
        } catch (fetchError) {
            console.error(`Failed to fetch index query for ${queryId} (${yearMonth}):`, fetchError.message || fetchError);
            return null;
        }

        // Parse JSON response
        let jsonResponse;
        try {
            jsonResponse = await response.json();
        } catch (parseError) {
            console.error(`Failed to parse response for index query ${queryId} (${yearMonth}):`, parseError);
            return null;
        }

        if (jsonResponse.errors) {
            console.error(`GraphQL errors for index query ${queryId} (${yearMonth}):`, jsonResponse.errors);
            return null;
        }

        // Extract full date/timestamp from index query response
        const fullDate = extractValueFromGraphQLResponse(queryDoc.index, jsonResponse);

        if (!fullDate) {
            return null;
        }

        // Return result with known yearMonth (already in YYYY-MM format)
        return {
            [yearMonth]: fullDate
        };
    } catch (error) {
        console.error(`Error executing index query for ${queryId} (${yearMonth}):`, error);
        return null;
    }
}

/**
 * Execute monthIndex query and extract YYYY-MM
 * @param {string} monthIndexQuery - The monthIndex query string
 * @param {Object} queryDoc - Query document
 * @param {string} endpointUrl - Endpoint URL
 * @param {string} authToken - Auth token
 * @param {Object} monthRangeVariables - Optional object with startDate/endDate for month filtering
 * @returns {Promise<string|null>} YYYY-MM format string or null
 */
async function executeMonthIndexQueryAndExtractYearMonth(monthIndexQuery, queryDoc, endpointUrl, authToken, monthRangeVariables = null) {
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
        let parsedVariables = parseGraphQLVariables(queryDoc.variables || '');
        
        // Merge monthRangeVariables if provided (takes precedence)
        if (monthRangeVariables && typeof monthRangeVariables === 'object') {
            parsedVariables = { ...parsedVariables, ...monthRangeVariables };
        }

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
 * Execute monthIndex query with date range and return full date/timestamp
 * @param {string} monthIndexQuery - The monthIndex query string
 * @param {Object} queryDoc - Query document
 * @param {string} endpointUrl - Endpoint URL
 * @param {string} authToken - Auth token
 * @param {Object} monthRangeVariables - Object with startDate/endDate for month filtering
 * @returns {Promise<string|null>} Full date/timestamp string or null
 */
async function executeMonthIndexQueryWithDateRange(monthIndexQuery, queryDoc, endpointUrl, authToken, monthRangeVariables) {
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
            finalAuthToken = defaultEndpoint?.authToken || null;
        }

        if (!finalEndpointUrl) {
            console.warn('No endpoint available for monthIndex query execution');
            return null;
        }

        // Parse variables if provided
        let parsedVariables = parseGraphQLVariables(queryDoc.variables || '');
        
        // Merge monthRangeVariables if provided (takes precedence)
        if (monthRangeVariables && typeof monthRangeVariables === 'object') {
            parsedVariables = { ...parsedVariables, ...monthRangeVariables };
        }

        // Execute the monthIndex query
        const response = await fetchGraphQLRequest(monthIndexQuery, parsedVariables, {
            endpointUrl: finalEndpointUrl,
            authToken: finalAuthToken
        });

        // Parse JSON response
        let jsonResponse;
        try {
            jsonResponse = await response.json();
        } catch (parseError) {
            console.error('Failed to parse response for monthIndex query:', parseError);
            return null;
        }

        if (jsonResponse.errors) {
            console.error('GraphQL errors for monthIndex query:', jsonResponse.errors);
            return null;
        }

        // Extract the full date/timestamp from monthIndex query response
        const fullDate = extractValueFromGraphQLResponse(monthIndexQuery, jsonResponse);

        return fullDate || null;
    } catch (error) {
        console.error('Error executing monthIndex query with date range:', error);
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

    // Reconstruct Date objects from serialized format (Comlink corrupts Date objects)
    let monthRangeDates = undefined;
    if (monthRange && Array.isArray(monthRange) && monthRange.length === 2) {
        // Check if it's already Date objects (backward compatibility) or serialized format
        if (monthRange[0] instanceof Date) {
            monthRangeDates = monthRange;
        } else if (monthRange[0] && typeof monthRange[0] === 'object' && 'year' in monthRange[0]) {
            // Reconstruct from serialized format
            monthRangeDates = [
                new Date(monthRange[0].year, monthRange[0].month, monthRange[0].day),
                new Date(monthRange[1].year, monthRange[1].month, monthRange[1].day)
            ];
        }
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

    // For month == true, extract YYYY-MM from monthRange dates
    let yearMonthPrefix = null;
    
    // Extract YYYY-MM from monthRange if it represents a single month
    if (queryDoc.month === true && monthRangeDates && Array.isArray(monthRangeDates) && monthRangeDates.length === 2) {
        const startDate = monthRangeDates[0];
        const endDate = monthRangeDates[1];
        
        // Check if the range represents a single month (start and end are in the same month)
        const startYearMonth = extractYearMonthFromDate(startDate);
        const endYearMonth = extractYearMonthFromDate(endDate);
        
        if (startYearMonth && endYearMonth && startYearMonth === endYearMonth) {
            // Single month range - use the month from the range
            yearMonthPrefix = startYearMonth;
            console.log(`Extracted YYYY-MM from monthRange for ${queryId}: ${yearMonthPrefix}`);
        } else {
            console.warn(`Could not extract YYYY-MM from monthRange for ${queryId}: range spans multiple months`);
            if (queryDoc.month === true) {
                throw new Error(`Could not extract YYYY-MM for month query ${queryId}: monthRange spans multiple months`);
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
    } else if (monthRangeDates && Array.isArray(monthRangeDates) && monthRangeDates.length === 2) {
        monthRangeForPipeline = monthRangeDates;
    }

    // Execute pipeline using worker pipeline executor
    const pipelineResult = await executePipelineWorkerInternal(queryId, queryDoc, context, {
        endpointUrl: finalEndpointUrl,
        authToken: finalAuthToken,
        monthRange: monthRangeDates || monthRangeForPipeline,
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
        const inFlightInfo = context.inFlight.get(queryId);
        throw new Error(`Query "${queryId}" is already being executed.${inFlightInfo ? ` (endpoint: ${inFlightInfo.endpointUrl})` : ''}`);
    }

    // Get endpoint and token before marking as in-flight
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

    // Mark as in-flight with endpoint URL
    context.inFlight.set(queryId, { endpointUrl: finalEndpointUrl });
    context.dependencyStack.push(queryId);

    try {

        const { transformerCode, body, variables } = queryDoc;
        const hasTransformer = transformerCode && transformerCode.trim();

        // Merge variable overrides in priority order:
        // 1. Base variables from queryDoc (parsed in executeGraphQLQuery)
        // 2. External variable overrides (user-provided, can override base)
        // 3. Month range derived startDate/endDate (takes priority over user overrides)
        let variableOverrides = { ...externalOverrides };
        if (monthRange) {
            const monthOverrides = applyMonthRangeToVariables(monthRange);
            variableOverrides = { ...variableOverrides, ...monthOverrides };
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
        if (context.inFlight.has(queryId)) {
            context.inFlight.delete(queryId);
        }
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
        "jmespath_plus",
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
        evalResult = await fn(jmespath, jsonata, jmespath_plus, _, dataCopy, queryFunction, elbrit);
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
 * Execute index queries for each month in a monthRange
 * @param {string} queryId - Query ID
 * @param {Object} queryDoc - Query document
 * @param {string} endpointUrl - Endpoint URL
 * @param {string} authToken - Auth token
 * @param {Array} monthRange - Array of [startDate, endDate] Date objects or serialized format
 * @returns {Promise<void>}
 */
async function executeIndexQueryForMonthRange(queryId, queryDoc, endpointUrl, authToken, monthRange) {
    // Always require index query for both month and non-month cases
    if (!queryDoc.index || !queryDoc.index.trim()) {
        console.warn(`Skipping index query for monthRange for ${queryId}: no index query provided`);
        return;
    }

    if (queryDoc.clientSave !== true) {
        console.log(`Skipping index query for monthRange for ${queryId}: clientSave is not true`);
        return;
    }

    if (!monthRange || !Array.isArray(monthRange) || monthRange.length !== 2) {
        console.warn(`Skipping index query for monthRange for ${queryId}: invalid monthRange`);
        return;
    }

    try {
        // Reconstruct Date objects from serialized format if needed (Comlink corrupts Date objects)
        let monthRangeDates;
        if (monthRange[0] instanceof Date) {
            monthRangeDates = monthRange;
        } else if (monthRange[0] && typeof monthRange[0] === 'object' && 'year' in monthRange[0]) {
            monthRangeDates = [
                new Date(monthRange[0].year, monthRange[0].month, monthRange[0].day),
                new Date(monthRange[1].year, monthRange[1].month, monthRange[1].day)
            ];
        } else {
            console.warn(`Skipping index query for monthRange for ${queryId}: invalid monthRange format`);
            return;
        }

        // Generate month prefixes from the range
        const monthPrefixes = generateMonthRangeArray(monthRangeDates[0], monthRangeDates[1]);
        
        if (monthPrefixes.length === 0) {
            console.warn(`Skipping index query for monthRange for ${queryId}: no months in range`);
            return;
        }

        // Get endpoint/auth
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
            console.warn(`No endpoint available for index query monthRange for ${queryId}`);
            return;
        }

        // For month == true queries, we need to merge results
        if (queryDoc.month === true) {
            // Get existing result to merge with
            const existingResult = await indexedDBService.getQueryIndexResult(queryId);
            const existingResultData = existingResult?.result || null;
            const mergedResult = existingResultData && typeof existingResultData === 'object' && !Array.isArray(existingResultData)
                ? { ...existingResultData }
                : {};

            // Execute index query for each month
            for (const monthPrefix of monthPrefixes) {
                try {
                    // Calculate startDate/endDate for this month
                    const monthDateRange = calculateMonthDateRange(monthPrefix);
                    if (!monthDateRange) {
                        console.warn(`Could not calculate date range for month ${monthPrefix}`);
                        continue;
                    }

                    // Execute index query for this month
                    const monthResult = await executeIndexQueryForSingleMonth(
                        queryId,
                        queryDoc,
                        finalEndpointUrl,
                        finalAuthToken,
                        monthDateRange,
                        monthPrefix
                    );

                    if (monthResult && typeof monthResult === 'object') {
                        // Merge into combined result
                        Object.assign(mergedResult, monthResult);
                    }
                } catch (error) {
                    console.error(`Error executing index query for month ${monthPrefix} for ${queryId}:`, error);
                    // Continue with other months even if one fails
                }
            }

            // Save merged result once for all months
            if (Object.keys(mergedResult).length > 0) {
                await indexedDBService.saveQueryIndexResult(queryId, mergedResult, queryDoc);
                console.log(`Saved index results for ${queryId} for months: ${monthPrefixes.join(', ')}`);
            }
        } else {
            // For month == false queries, execute index query with the full monthRange variables
            // (This is less common, but handle it for completeness)
            const startDate = dayjs(monthRangeDates[0]).startOf('month').format('YYYY-MM-DD');
            const endDate = dayjs(monthRangeDates[1]).endOf('month').format('YYYY-MM-DD');
            const monthRangeVariables = { startDate, endDate };
            
            await executeIndexQuery(queryId, queryDoc, finalEndpointUrl, finalAuthToken, monthRangeVariables);
        }
    } catch (error) {
        console.error(`Error executing index queries for monthRange for ${queryId}:`, error);
    }
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
    // For both month == true and month == false queries, require index query
    // The executeIndexQuery function will use the endpoint config getter that was set during initialization
    const indexQueryPromises = queries
        .filter(query => {
            if (query.clientSave !== true) {
                return false;
            }
            // For both month == true and month == false, require index query
            return query.index && query.index.trim();
        })
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
    executeIndexQueryForMonthRange,
    executePipeline,
    executeAndCacheIndexQueries,
    setNestedQueryCallback,
    setEndpointConfigGetter,
    setGlobalFunctionsGetter,
    // Expose indexedDBService methods for main thread access if needed
    indexedDBService: indexedDBService
};

Comlink.expose(workerAPI);

