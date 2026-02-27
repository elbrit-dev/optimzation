import { buildClientSchema, parse } from 'graphql';
import { GRAPHQL_ENDPOINTS, ENDPOINT_TOKENS } from '@/app/graphql-playground/constants';

/**
 * GraphQL introspection query to fetch schema
 */
const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        ...FullType
      }
      directives {
        name
        description
        locations
        args {
          ...InputValue
        }
      }
    }
  }

  fragment FullType on __Type {
    kind
    name
    description
    fields(includeDeprecated: true) {
      name
      description
      args {
        ...InputValue
      }
      type {
        ...TypeRef
      }
      isDeprecated
      deprecationReason
    }
    inputFields {
      ...InputValue
    }
    interfaces {
      ...TypeRef
    }
    enumValues(includeDeprecated: true) {
      name
      description
      isDeprecated
      deprecationReason
    }
    possibleTypes {
      ...TypeRef
    }
  }

  fragment InputValue on __InputValue {
    name
    description
    type {
      ...TypeRef
    }
    defaultValue
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Cache for schemas per environment
 */
const schemaCache = new Map();

/**
 * Fetches GraphQL schema via introspection query
 * @param {string} environment - Environment name ('UAT' or 'ERP')
 * @returns {Promise<GraphQLSchema>} GraphQL schema object
 */
export async function fetchGraphQLSchema(environment) {
  // Check cache first
  if (schemaCache.has(environment)) {
    return schemaCache.get(environment);
  }

  const endpointUrl = GRAPHQL_ENDPOINTS[environment];
  const authToken = ENDPOINT_TOKENS[environment] || '';

  if (!endpointUrl) {
    throw new Error(`GraphQL endpoint URL is not set for environment: ${environment}`);
  }

  try {
    // Execute introspection query
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { Authorization: authToken }),
      },
      body: JSON.stringify({
        query: INTROSPECTION_QUERY,
      }),
    });

    if (!response.ok) {
      let errorMessage = `Failed to fetch schema: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.text();
        const errorJson = JSON.parse(errorBody);
        if (errorJson.errors && Array.isArray(errorJson.errors)) {
          errorMessage = errorJson.errors.map((e) => e.message || JSON.stringify(e)).join('; ');
        } else if (errorJson.message) {
          errorMessage = errorJson.message;
        }
      } catch {
        // Use default error message if parsing fails
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();

    if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
      const errorMessages = result.errors.map((e) => e.message || JSON.stringify(e)).join('; ');
      throw new Error(`GraphQL introspection errors: ${errorMessages}`);
    }

    if (!result.data || !result.data.__schema) {
      throw new Error('Invalid introspection response: missing __schema');
    }

    // Build GraphQL schema object from introspection result
    const schema = buildClientSchema(result.data);

    // Cache the schema
    schemaCache.set(environment, schema);

    return schema;
  } catch (error) {
    // Re-throw with more context
    if (error.message) {
      throw error;
    }
    throw new Error(`Failed to fetch GraphQL schema: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Clears the schema cache for a specific environment or all environments
 * @param {string|null} environment - Environment name to clear, or null to clear all
 */
export function clearSchemaCache(environment = null) {
  if (environment) {
    schemaCache.delete(environment);
  } else {
    schemaCache.clear();
  }
}

/**
 * Unwraps GraphQL type to get the underlying named type
 * Handles LIST and NON_NULL wrappers
 * @param {GraphQLType} type - GraphQL type to unwrap
 * @returns {GraphQLNamedType} Unwrapped named type
 */
function unwrapType(type) {
  if (!type) return null;
  
  // Handle GraphQLList and GraphQLNonNull wrappers
  if (type.ofType) {
    return unwrapType(type.ofType);
  }
  
  return type;
}

/**
 * Checks if a GraphQL type is an object type (has fields)
 * @param {GraphQLType} type - GraphQL type to check
 * @returns {boolean} True if type is an object type
 */
function isObjectType(type) {
  const unwrapped = unwrapType(type);
  if (!unwrapped) return false;
  
  // Check if it's an object type (has getFields method)
  return unwrapped.getFields && typeof unwrapped.getFields === 'function';
}

/**
 * Recursively builds tree nodes from a GraphQL type's fields
 * @param {GraphQLType} type - GraphQL type to build tree from
 * @param {string} parentKey - Parent key path (e.g., "rootField.childField")
 * @param {Set<string>} visitedTypes - Set of visited type names to prevent infinite recursion
 * @param {number} currentDepth - Current depth in the tree
 * @param {number} maxDepth - Maximum depth to traverse (default: 5)
 * @param {Object} limits - Limits object with maxNodes and currentCount
 * @returns {Array} Array of tree node objects
 */
function buildTreeNodesFromType(type, parentKey = '', visitedTypes = new Set(), currentDepth = 0, maxDepth = 5, limits = { maxNodes: 1000, currentCount: 0 }) {
  // Check depth limit
  if (currentDepth >= maxDepth) {
    return [];
  }

  // Check node count limit to prevent memory issues
  if (limits.currentCount >= limits.maxNodes) {
    console.warn('Schema tree node limit reached, truncating tree');
    return [];
  }

  const unwrapped = unwrapType(type);
  if (!unwrapped || !isObjectType(unwrapped)) {
    return [];
  }

  const typeName = unwrapped.name;
  
  // Prevent infinite recursion on circular types
  if (visitedTypes.has(typeName)) {
    return [];
  }

  visitedTypes.add(typeName);

  try {
    const fields = unwrapped.getFields();
    const children = [];

    // Use Object.keys() to safely iterate over GraphQLFieldMap
    const fieldNames = Object.keys(fields);
    
    for (const fieldName of fieldNames) {
      // Check node count limit before processing each field
      if (limits.currentCount >= limits.maxNodes) {
        break;
      }

      const field = fields[fieldName];
      if (!field) continue;
      
      const fieldType = field.type;
      const currentKey = parentKey ? `${parentKey}.${fieldName}` : fieldName;
      
      // Increment node count
      limits.currentCount++;
      
      // Get nested fields if this is an object type
      // Pass the same visitedTypes Set (not a new one) to properly track visited types
      const nestedChildren = buildTreeNodesFromType(
        fieldType, 
        currentKey, 
        visitedTypes, // Pass same Set reference
        currentDepth + 1, 
        maxDepth,
        limits
      );
      
      children.push({
        key: currentKey,
        label: fieldName,
        data: { name: fieldName },
        children: nestedChildren.length > 0 ? nestedChildren : undefined
      });
    }

    return children;
  } catch (error) {
    console.error(`Error building tree nodes from type ${typeName}:`, error);
    return [];
  } finally {
    visitedTypes.delete(typeName);
  }
}

/**
 * Extracts root field names from a GraphQL query string
 * @param {string} queryString - GraphQL query string
 * @returns {Array<string>} Array of root field names
 */
export function extractRootFieldsFromQuery(queryString) {
  if (!queryString || !queryString.trim()) {
    return [];
  }

  try {
    const document = parse(queryString);
    const operation = document.definitions.find(
      (definition) => definition.kind === 'OperationDefinition' && definition.operation === 'query'
    );

    if (!operation || !operation.selectionSet) {
      return [];
    }

    const fieldNames = operation.selectionSet.selections
      .filter((selection) => selection.kind === 'Field' && selection.name && selection.name.value)
      .map((selection) => selection.name.value);

    return Array.from(new Set(fieldNames.filter(Boolean)));
  } catch (error) {
    console.error('Error extracting root fields from query:', error);
    return [];
  }
}

/**
 * Builds tree nodes from GraphQL schema's query root type
 * @param {GraphQLSchema} schema - GraphQL schema object
 * @param {Array<string>} rootFieldNames - Optional array of root field names to filter (only build trees for these fields)
 * @param {number} maxDepth - Maximum depth to traverse (default: 5)
 * @param {number} maxNodes - Maximum number of nodes to create (default: 1000)
 * @returns {Array} Array of tree node objects compatible with PrimeReact Tree
 */
export function buildSchemaTreeNodes(schema, rootFieldNames = null, maxDepth = 5, maxNodes = 1000) {
  if (!schema) {
    return [];
  }

  try {
    const queryType = schema.getQueryType();
    if (!queryType) {
      return [];
    }

    const queryFields = queryType.getFields();
    const treeNodes = [];

    // If rootFieldNames is provided, only build trees for those fields
    // Otherwise, build for all root fields (but this should be avoided for large schemas)
    const fieldsToProcess = rootFieldNames && rootFieldNames.length > 0
      ? rootFieldNames.filter(fieldName => queryFields[fieldName])
      : Object.keys(queryFields);

    if (fieldsToProcess.length === 0) {
      return [];
    }

    const limits = { maxNodes, currentCount: 0 };

    for (const fieldName of fieldsToProcess) {
      // Check if we've reached the node limit
      if (limits.currentCount >= limits.maxNodes) {
        break;
      }

      const field = queryFields[fieldName];
      if (!field) continue;

      const fieldType = field.type;
      
      // Build tree nodes for this specific root field
      const children = buildTreeNodesFromType(
        fieldType, 
        fieldName, 
        new Set(), 
        1, // Start at depth 1 (root field is depth 0)
        maxDepth, 
        limits
      );

      treeNodes.push({
        key: fieldName,
        label: fieldName,
        data: { name: fieldName },
        children: children.length > 0 ? children : undefined
      });
    }
    
    if (limits.currentCount >= limits.maxNodes) {
      console.warn(`Schema tree truncated at ${limits.maxNodes} nodes. Consider increasing maxNodes or reducing maxDepth.`);
    }
    
    return treeNodes;
  } catch (error) {
    console.error('Error building schema tree nodes:', error);
    return [];
  }
}