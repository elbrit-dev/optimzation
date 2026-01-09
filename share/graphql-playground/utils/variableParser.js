import { parse as parseJsonc, stripComments } from 'jsonc-parser';

/**
 * Parse GraphQL variables string with support for JSONC (JSON with comments)
 * Uses jsonc-parser first, falls back to stripComments + JSON.parse
 * @param {string} variablesString - Variables string to parse
 * @returns {Object} Parsed variables object (empty object if parsing fails)
 */
export function parseGraphQLVariables(variablesString) {
    if (!variablesString || !variablesString.trim()) {
        return {};
    }

    try {
        // Use jsonc-parser (same as GraphiQL) to handle JSON with comments and lenient syntax
        return parseJsonc(variablesString);
    } catch (e) {
        // If jsonc-parser fails, try to strip comments and parse again
        try {
            const stripped = stripComments(variablesString);
            return JSON.parse(stripped);
        } catch (fallbackError) {
            // Failed to parse variables, return empty object
            console.warn('Failed to parse GraphQL variables:', fallbackError);
            return {};
        }
    }
}

