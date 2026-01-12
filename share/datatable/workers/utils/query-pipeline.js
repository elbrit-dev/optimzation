import * as jmespath from "jmespath";
import jsonata from "jsonata";
import _ from "lodash";
import { parse as parseJsonc, stripComments } from "jsonc-parser";
import { extractDataFromResponse } from "./data-extractor";
import { removeIndexKeys } from "./data-flattener";

const DEFAULT_AUTH_TOKEN = '';

// These will be set from the worker main file
let endpointConfigGetter = null;

/**
 * Set endpoint config getter
 */
export function setEndpointConfigGetter(getter) {
    endpointConfigGetter = getter;
}

/**
 * Get endpoint config from urlKey
 */
function getEndpointConfigFromUrlKey(urlKey) {
    if (endpointConfigGetter && urlKey) {
        return endpointConfigGetter(urlKey);
    }
    return { endpointUrl: null, authToken: null };
}

/**
 * Get initial endpoint
 */
function getInitialEndpoint() {
    if (endpointConfigGetter) {
        return endpointConfigGetter(null);
    }
    return null;
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
        inFlight: new Set(), // Prevents concurrent execution: queryId -> true
        dependencyStack: [], // Detects circular dependencies: [queryId, ...]
        maxDepth,
    };
}

/**
 * Core function to execute a GraphQL HTTP request
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
 * @param {Object} queryDoc - Query document
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

    // Global functions will be passed separately in worker context
    const elbrit = {};

    // Wrap transformer code to ensure it always returns a value
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
    // Always use raw data as source, not processed data
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


