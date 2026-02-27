import { parse as parseGraphQL } from 'graphql';
import * as jmespath from 'jmespath';

/**
 * Recursively find the single leaf field in a GraphQL selection set
 * @param {Object} selectionSet - The GraphQL selection set
 * @param {Array} path - Current path array
 * @returns {Object|null} Object with path and fieldName, or null if not found
 */
function findSingleLeafField(selectionSet, path = []) {
    if (!selectionSet || !selectionSet.selections) return null;

    for (const selection of selectionSet.selections) {
        if (selection.kind !== 'Field') continue;

        const fieldName = selection.name.value;
        const aliasName = selection.alias ? selection.alias.value : fieldName;
        const currentPath = [...path, aliasName];

        if (selection.selectionSet) {
            // Has nested fields, continue traversing
            const result = findSingleLeafField(selection.selectionSet, currentPath);
            if (result) return result;
        } else {
            // This is a leaf field - return it
            return {
                path: currentPath,
                fieldName: aliasName
            };
        }
    }

    return null;
}

/**
 * Build JMESPath query from path array
 * @param {Array} path - Array of path segments
 * @returns {string} JMESPath query string
 */
function buildJMESPathFromPath(path) {
    if (!path || path.length === 0) return 'data';

    let jmespath = 'data';
    
    for (let i = 0; i < path.length; i++) {
        const part = path[i];
        const nextPart = path[i + 1];

        if (part === 'edges' && nextPart === 'node') {
            jmespath += '.edges[].node';
            i++; // Skip next part since we handled it
        } else {
            jmespath += '.' + part;
        }
    }

    return jmespath;
}

/**
 * Extract a single value from GraphQL response using the query structure
 * Parses the GraphQL query to find the single leaf field, then extracts the value using JMESPath
 * @param {string} queryString - The GraphQL query string
 * @param {Object} jsonResponse - The JSON response from the GraphQL query
 * @returns {string|null} The extracted value as string, or null if not found
 */
export function extractValueFromGraphQLResponse(queryString, jsonResponse) {
    if (!queryString || !queryString.trim() || !jsonResponse) {
        return null;
    }

    try {
        // Parse the GraphQL query to find the single leaf field
        let leafFieldInfo = null;
        try {
            const ast = parseGraphQL(queryString);
            const operation = ast.definitions.find(
                def => def.kind === 'OperationDefinition'
            );

            if (operation && operation.selectionSet) {
                leafFieldInfo = findSingleLeafField(operation.selectionSet);
            }
        } catch (parseError) {
            console.error('Error parsing GraphQL query:', parseError);
            return null;
        }

        if (!leafFieldInfo) {
            console.warn('Could not find single leaf field in GraphQL query');
            return null;
        }

        // Build JMESPath query to extract the field value
        const jmesPathQuery = buildJMESPathFromPath(leafFieldInfo.path);
        
        // Extract the value using JMESPath
        let value = null;
        try {
            const result = jmespath.search(jsonResponse, jmesPathQuery);
            
            // Handle different result types
            if (Array.isArray(result) && result.length > 0) {
                // If array, get first element
                value = result[0];
            } else if (result !== null && result !== undefined) {
                // If single value
                value = result;
            }
        } catch (jmesError) {
            console.error('Error extracting value with JMESPath:', jmesError);
            return null;
        }

        if (!value) {
            return null;
        }

        // Return the value as string
        if (typeof value === 'string') {
            return value;
        } else if (value instanceof Date) {
            return value.toISOString();
        } else {
            // Try to convert to string
            return String(value);
        }
    } catch (error) {
        console.error('Error extracting value from GraphQL response:', error);
        return null;
    }
}


