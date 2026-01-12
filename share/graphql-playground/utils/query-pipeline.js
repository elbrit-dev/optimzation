import * as jmespath from "jmespath";
import jsonata from "jsonata";
import jmespath_plus from '@metrichor/jmespath-plus'
import _ from "lodash";
import { parse as parseJsonc, stripComments } from "jsonc-parser";
import { firestoreService } from "../services/firestoreService";
import { extractDataFromResponse } from "./data-extractor";
import { removeIndexKeys } from "./data-flattener";
import { DEFAULT_AUTH_TOKEN, getInitialEndpoint, getEndpointConfigFromUrlKey } from "../constants";

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

/**
 * Creates a new execution context for a query pipeline run
 * @param {Object} options - Configuration options
 * @param {number} options.maxDepth - Maximum dependency depth (default: 10)
 * @returns {Object} Execution context
 */
export function createExecutionContext(options = {}) {
    const { maxDepth = 10 } = options;
    return {
        inFlight: new Map(), // Prevents concurrent execution: queryId -> { endpointUrl }
        dependencyStack: [], // Detects circular dependencies: [queryId, ...]
        maxDepth,
    };
}

/**
 * Core function to execute a GraphQL HTTP request
 * Shared between pipeline and Playground
 * @param {string} query - GraphQL query string
 * @param {Object} variables - GraphQL variables object
 * @param {Object} options - Execution options
 * @param {string} options.endpointUrl - GraphQL endpoint URL
 * @param {string} options.authToken - Authorization token
 * @returns {Promise<Response>} Fetch Response object
 */
export async function fetchGraphQLRequest(query, variables = {}, options = {}) {
    const { endpointUrl, authToken } = options;

    const finalEndpointUrl = endpointUrl || getInitialEndpoint()?.code;
    const finalAuthToken = authToken || DEFAULT_AUTH_TOKEN;

    if (!finalEndpointUrl) {
        throw new Error("GraphQL endpoint URL is not set");
    }

    if (!query || !query.trim()) {
        throw new Error("Query body is empty");
    }

    const requestBody = {
        query,
        variables,
    };
    const startTime = performance.now();

    let response;
    try {
        // Execute GraphQL query
        response = await fetch(finalEndpointUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(finalAuthToken && { "Authorization": finalAuthToken }),
            },
            body: JSON.stringify(requestBody),
        });
    } catch (networkError) {
        // Handle network errors (connection refused, timeout, CORS, etc.)
        console.error("Network error during GraphQL request:", networkError);
        throw new Error(
            `Network error: ${networkError.message || "Failed to connect to GraphQL endpoint"}. ` +
                `Please check your connection and endpoint URL.`,
        );
    }

    // Handle HTTP errors (500, 404, etc.)
    if (!response.ok) {
        let errorMessage = `GraphQL request failed: ${response.status} ${response.statusText}`;

        // Try to extract error details from response body
        // Clone the response before reading to avoid "already read" errors
        try {
            const responseClone = response.clone();
            const errorBody = await responseClone.text();
            if (errorBody) {
                try {
                    const errorJson = JSON.parse(errorBody);
                    if (errorJson.message) {
                        errorMessage = errorJson.message;
                    } else if (errorJson.error) {
                        errorMessage = errorJson.error;
                    } else if (Array.isArray(errorJson.errors) && errorJson.errors.length > 0) {
                        errorMessage = errorJson.errors.map((e) => e.message || JSON.stringify(e)).join("; ");
                    } else {
                        errorMessage = errorBody.substring(0, 200); // Use first 200 chars of response
                    }
                } catch {
                    // If JSON parsing fails, use the text response (truncated)
                    errorMessage = errorBody.substring(0, 200);
                }
            }
        } catch (parseError) {
            // If we can't read the response body, use the status text
            console.warn("Could not parse error response body:", parseError);
        }

        console.error(`GraphQL request failed: ${response.status} ${response.statusText}`, errorMessage);

        // Throw a meaningful error that can be caught upstream
        const httpError = new Error(`HTTP ${response.status}: ${errorMessage}`);
        httpError.status = response.status;
        httpError.statusText = response.statusText;
        throw httpError;
    }

    return response;
}

/**
 * Pure function to execute a GraphQL query and extract data
 * @param {Object} queryDoc - Query document from Firestore
 * @param {Object} options - Execution options
 * @param {string} options.endpointUrl - GraphQL endpoint URL
 * @param {string} options.authToken - Authorization token
 * @param {Object} options.variableOverrides - Additional variables to merge
 * @returns {Promise<Object>} Extracted data from response
 */
export async function executeGraphQLQuery(queryDoc, options = {}) {
    const { variableOverrides = {} } = options;

    const { body, variables: rawVariables } = queryDoc;
    if (!body || !body.trim()) {
        throw new Error("Query body is empty");
    }

    // Parse variables if provided
    // Use jsonc-parser (same as GraphiQL) to handle JSON with comments and lenient syntax
    let parsedVariables = {};
    if (rawVariables && rawVariables.trim()) {
        try {
            // Use jsonc-parser to parse (handles comments, trailing commas, etc. like GraphiQL)
            parsedVariables = parseJsonc(rawVariables);
        } catch (e) {
            // If jsonc-parser fails, try to strip comments and parse again
            try {
                const stripped = stripComments(rawVariables);
                parsedVariables = JSON.parse(stripped);
            } catch (fallbackError) {
                // Failed to parse variables, using empty object
            }
        }
    }

    // Merge with overrides (e.g., month range variables)
    parsedVariables = { ...parsedVariables, ...variableOverrides };

    // Execute GraphQL query using shared function
    let response;
    try {
        response = await fetchGraphQLRequest(body, parsedVariables, options);
    } catch (error) {
        // Re-throw network/HTTP errors from fetchGraphQLRequest
        throw error;
    }

    const parseStartTime = performance.now();
    let jsonResponse;
    try {
        jsonResponse = await response.json();
    } catch (parseError) {
        console.error("Failed to parse GraphQL response as JSON:", parseError);
        // Try to get response text for better error message
        try {
            const responseText = await response.text();
            throw new Error(`Invalid JSON response from GraphQL endpoint: ${responseText.substring(0, 200)}`);
        } catch (textError) {
            throw new Error(`Failed to parse GraphQL response: ${parseError.message}`);
        }
    }
    const parseDuration = ((performance.now() - parseStartTime) / 1000).toFixed(3);

    if (jsonResponse.errors) {
        console.error("GraphQL errors:", jsonResponse.errors);
        const errorMessages = jsonResponse.errors.map((err) => err.message || JSON.stringify(err)).join("; ");
        throw new Error(`GraphQL errors: ${errorMessages}`);
    }

    // Extract data using the abstracted utility function
    const extractedData = extractDataFromResponse(jsonResponse, body);

    return extractedData;
}

/**
 * Applies month range filter to variables
 * @param {Array} monthRange - Array of [startMonth, endMonth] Date objects
 * @returns {Object} Variables object with startDate and endDate
 */
export function applyMonthRangeToVariables(monthRange) {
    if (!monthRange || !Array.isArray(monthRange) || monthRange.length !== 2) {
        return {};
    }

    const [startMonth, endMonth] = monthRange;
    if (!startMonth || !endMonth) {
        return {};
    }

    // Ensure startMonth is before or equal to endMonth
    const sorted = [startMonth, endMonth].sort((a, b) => a - b);
    const start = sorted[0];
    const end = sorted[1];

    // Calculate startDate: first day of the earliest month
    const startYear = start.getFullYear();
    const startMonthIndex = start.getMonth();
    const startDate = `${startYear}-${String(startMonthIndex + 1).padStart(2, "0")}-01`;

    // Calculate endDate: last day of the latest month
    const endYear = end.getFullYear();
    const endMonthIndex = end.getMonth();
    const lastDay = new Date(endYear, endMonthIndex + 1, 0).getDate();
    const endDate = `${endYear}-${String(endMonthIndex + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;


    return { startDate, endDate };
}

/**
 * Executes transformer code with provided context
 * @param {string} transformerCode - JavaScript transformer code
 * @param {Object} rawData - Raw extracted data from GraphQL query
 * @param {Function} queryFunction - Function to execute nested queries
 * @returns {Promise<Object|Map>} Transformed data (preserves type returned by transformer - Object or Map)
 */
export async function executeTransformer(transformerCode, rawData, queryFunction) {
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
    try {
        const globalFunctionsCode = await firestoreService.loadGlobalFunctions();
        if (globalFunctionsCode && globalFunctionsCode.trim()) {
            const blob = new Blob([globalFunctionsCode], { type: "text/javascript" });
            objectUrl = URL.createObjectURL(blob);

            elbrit = await import(
                /* webpackIgnore: true */
                objectUrl
            );
        }
    } catch (error) {
        console.warn("Failed to load global functions, continuing without elbrit:", error);
        elbrit = {};
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
        }
    }

    const cleanup = () => {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
        }
    };

    // Wrap transformer code to ensure it always returns a value
    // If transformer doesn't explicitly return, we'll detect and return data
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
    // Always use raw data as source, not processed data
    const dataCopy = rawData ? JSON.parse(JSON.stringify(rawData)) : {};

    console.log("elbrit", elbrit);
    const transformStartTime = performance.now();
    let evalResult;
    try {
        evalResult = await fn(jmespath, jsonata, jmespath_plus, _, dataCopy, queryFunction, elbrit);
    } catch (error) {
        console.error("Transformer execution failed:", error);
        cleanup();
        throw error;
    } finally {
        cleanup();
    }

    // If result is valid, use it
    if (evalResult !== null && evalResult !== undefined) {
        // Ensure result is in the correct format (object or Map with queryKeys)
        // Check for both Object and Map types
        const isObject = typeof evalResult === "object" && !Array.isArray(evalResult) && !(evalResult instanceof Map);
        const isMap = evalResult instanceof Map;
        
        if (isObject || isMap) {
            // For validation, get keys appropriately
            let outputKeys;
            if (isMap) {
                outputKeys = Array.from(evalResult.keys()).filter((key) => {
                    const value = evalResult.get(key);
                    return value && value.length > 0;
                });
            } else {
                outputKeys = Object.keys(evalResult).filter((key) => evalResult[key] && evalResult[key].length > 0);
            }
            
            return evalResult; // Return as-is, preserving Map or Object type
        } else {
            console.warn("Transformer result is not an object or Map, returning original data");
            return rawData;
        }
    }

    // Fallback: if transformer didn't return anything (undefined), use original data
    // This handles cases where transformer code doesn't have an explicit return
    console.warn("Transformer did not return a value, using original data");
    return rawData;
}

/**
 * Cleans processed data by removing __index__ keys
 * @param {Object|Map} data - Data to clean (can be Object or Map)
 * @returns {Object|Map} Cleaned data, preserving original type
 */
export function cleanProcessedData(data) {
    if (!data) return null;

    // Preserve Map type if input is Map
    if (data instanceof Map) {
        const cleaned = new Map();
        for (const [key, value] of data.entries()) {
            cleaned.set(key, removeIndexKeys(value));
        }
        return cleaned;
    }

    // Handle Object type
    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
        cleaned[key] = removeIndexKeys(value);
    }
    return cleaned;
}

/**
 * Unified query execution pipeline
 * Handles query loading, GraphQL execution, and transformer application
 * @param {string} queryId - Query ID from Firestore
 * @param {Object} context - Execution context (from createExecutionContext)
 * @param {Object} options - Execution options
 * @param {string} options.endpointUrl - GraphQL endpoint URL (optional)
 * @param {string} options.authToken - Authorization token (optional)
 * @param {Array} options.monthRange - Month range for date filtering (optional)
 * @returns {Promise<Object|Map>} Final transformed data (preserves type from transformer - Object or Map)
 */
export async function executePipeline(queryId, context, options = {}) {
    const { endpointUrl, authToken, monthRange, variableOverrides: externalOverrides = {} } = options;
    const depth = context.dependencyStack.length;
    const indent = "  ".repeat(depth);
    const chain = context.dependencyStack.length > 0 ? `${context.dependencyStack.join(" → ")} → ${queryId}` : queryId;

    const pipelineStartTime = performance.now();

    // Guardrail: Check for circular dependencies
    if (context.dependencyStack.includes(queryId)) {
        const cycle = [...context.dependencyStack, queryId].join(" → ");
        console.error(`Circular dependency detected: ${cycle}`);
        throw new Error(
            `Circular dependency detected: ${cycle}\n` + `Query "${queryId}" is already in the dependency chain.`,
        );
    }

    // Guardrail: Check maximum depth
    if (context.dependencyStack.length >= context.maxDepth) {
        const chain = context.dependencyStack.join(" → ");
        console.error(`Max depth exceeded: ${chain} → ${queryId}`);
        throw new Error(
            `Maximum dependency depth (${context.maxDepth}) exceeded.\n` + `Dependency chain: ${chain} → ${queryId}`,
        );
    }

    // Guardrail: Check if already in flight (prevent concurrent execution)
    if (context.inFlight.has(queryId)) {
        const inFlightInfo = context.inFlight.get(queryId);
        console.error(`Query already in flight: ${queryId}`, inFlightInfo ? `(endpoint: ${inFlightInfo.endpointUrl})` : '');
        throw new Error(
            `Query "${queryId}" is already being executed. ` +
                `This may indicate a concurrent execution issue or circular dependency.`,
        );
    }

    // Get endpoint and token from urlKey if available, otherwise use provided options
    // We need to determine the endpoint before marking as in-flight
    let queryDoc = null;
    let finalEndpointUrl = endpointUrl;
    let finalAuthToken = authToken;

    try {
        // Load query document from Firestore
        queryDoc = await firestoreService.loadQuery(queryId);

        if (!queryDoc) {
            console.error(`Query not found: ${queryId}`);
            throw new Error(`Query "${queryId}" not found`);
        }

        // Get endpoint and token from urlKey if available, otherwise use provided options
        if (queryDoc.urlKey) {
            const urlKeyConfig = getEndpointConfigFromUrlKey(queryDoc.urlKey);
            if (urlKeyConfig.endpointUrl) {
                finalEndpointUrl = urlKeyConfig.endpointUrl;
                finalAuthToken = urlKeyConfig.authToken;
            }
        }

        // Fallback to provided options or defaults if urlKey didn't provide endpoint
        if (!finalEndpointUrl) {
            finalEndpointUrl = endpointUrl || getInitialEndpoint()?.code;
            finalAuthToken = authToken || DEFAULT_AUTH_TOKEN;
            if (!finalEndpointUrl) {
                console.error("No endpoint URL available");
                throw new Error("GraphQL endpoint URL is not set");
            }
        }

        // Mark as in-flight with endpoint URL
        context.inFlight.set(queryId, { endpointUrl: finalEndpointUrl });
        context.dependencyStack.push(queryId);

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
            // Return empty object to allow pipeline to continue gracefully
            rawData = {};
        }

        // Create query function for transformer (reuses the pipeline)
        const queryFunction = async (nestedQueryId) => {
            if (!nestedQueryId || !nestedQueryId.trim()) {
                throw new Error("Query key is required");
            }
            // Reuse the same execution context and options (nested queries will get their own urlKey from their queryDoc)
            return executePipeline(nestedQueryId, context, {
                endpointUrl: finalEndpointUrl,
                authToken: finalAuthToken,
            });
        };

        // Apply transformer if present
        let transformedData;
        if (hasTransformer) {
            transformedData = await executeTransformer(transformerCode, rawData, queryFunction);
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
