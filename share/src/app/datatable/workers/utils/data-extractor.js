import { parse } from 'graphql';
import * as jmespath from 'jmespath';
import { walkASTForNodePaths, nodePathToJMESPath } from './response-processor';
import { flattenResponse, removeIndexKeys } from './data-flattener';

/**
 * Extract and process data from GraphQL response
 * @param {Object} jsonData - The GraphQL JSON response
 * @param {string} queryString - The GraphQL query string
 * @returns {Object|null} Extracted and processed data grouped by query keys, or null if no data
 */
export function extractDataFromResponse(jsonData, queryString) {
  if (!jsonData || !queryString) return null;

  // Step 1: Parse GraphQL query to AST
  let queries = [];
  try {
    if (queryString.trim()) {
      const ast = parse(queryString);

      // Find the operation definition
      const operation = ast.definitions.find(
        def => def.kind === 'OperationDefinition'
      );

      if (operation && operation.selectionSet) {
        // Step 2: Walk AST to find node-producing paths
        const nodePaths = walkASTForNodePaths(operation.selectionSet, []);

        // Step 3: Convert node paths to JMESPath queries
        queries = nodePaths.map(np => {
          const pathWithRootData = np.nodePath[0] === 'data'
            ? ['data', ...np.nodePath]
            : ['data', ...np.nodePath];

          return {
            jmespath: nodePathToJMESPath(pathWithRootData),
            fields: np.fields,
            originalPath: np.nodePath,
            graphQLType: np.graphQLType,
            fieldName: np.fieldName
          };
        });
      }
    }
  } catch (e) {
    console.error('Error parsing GraphQL query:', e);
  }

  // Step 4: Execute JMESPath queries and group by query/field
  const nodesByQuery = {};
  const fieldMetadata = {};

  if (queries.length > 0) {
    for (const q of queries) {
      try {
        const result = jmespath.search(jsonData, q.jmespath);

        const pathParts = q.jmespath.split('.');
        const fieldName = pathParts.length > 1 ? pathParts[1] : 'default';

        if (!fieldMetadata[fieldName]) {
          fieldMetadata[fieldName] = {
            graphQLType: q.graphQLType || null,
            fieldName: q.fieldName || fieldName
          };
        }

        if (Array.isArray(result) && result.length > 0) {
          const validNodes = result.filter(node => node && typeof node === 'object');

          if (!nodesByQuery[fieldName]) {
            nodesByQuery[fieldName] = [];
          }

          validNodes.forEach(node => {
            nodesByQuery[fieldName].push(node);
          });
        } else {
          if (!nodesByQuery[fieldName]) {
            nodesByQuery[fieldName] = [];
          }
        }
      } catch (e) {
        console.error(`Error executing JMESPath query "${q.jmespath}":`, e);
      }
    }
  } else {
    // Fallback: Use simple patterns if AST parsing failed
    const fallbackQueries = [
      { query: 'data.data.*.edges[].node', field: 'data' },
      { query: 'data.edges[].node', field: 'default' }
    ];

    for (const { query, field } of fallbackQueries) {
      try {
        const result = jmespath.search(jsonData, query);
        if (Array.isArray(result) && result.length > 0) {
          const validNodes = result.filter(node => node && typeof node === 'object');
          if (!nodesByQuery[field]) {
            nodesByQuery[field] = [];
          }
          validNodes.forEach(node => {
            nodesByQuery[field].push(node);
          });
        }
      } catch (e) {
        // Continue
      }
    }
  }

  // Step 5 & 6: Flatten nodes for each query separately
  const flattenedByQuery = {};
  let hasAnyData = false;

  for (const [fieldName, nodes] of Object.entries(nodesByQuery)) {
    if (nodes.length > 0) {
      flattenedByQuery[fieldName] = flattenResponse(nodes);
      hasAnyData = true;
    } else {
      flattenedByQuery[fieldName] = [];
    }
  }

  // Step 7: Merge queries of the same GraphQL type (concat same kinds)
  const indexFields = new Set();
  
  for (const [fieldName, metadata] of Object.entries(fieldMetadata)) {
    const lowerFieldName = fieldName.toLowerCase();
    if (lowerFieldName.includes('index') || 
        lowerFieldName === 'postingdetails' ||
        lowerFieldName.includes('postingdetails') ||
        lowerFieldName.includes('lookup') ||
        lowerFieldName.includes('reference') ||
        lowerFieldName.includes('detail') && (lowerFieldName.includes('posting') || lowerFieldName.includes('index'))) {
      indexFields.add(fieldName);
    }
  }

  const fieldsByType = {};
  for (const [fieldName, metadata] of Object.entries(fieldMetadata)) {
    const graphQLType = metadata.graphQLType;
    if (graphQLType && !indexFields.has(fieldName)) {
      if (!fieldsByType[graphQLType]) {
        fieldsByType[graphQLType] = [];
      }
      fieldsByType[graphQLType].push(fieldName);
    }
  }

  const finalFlattened = {};
  
  for (const fieldName of indexFields) {
    if (flattenedByQuery[fieldName]) {
      finalFlattened[fieldName] = flattenedByQuery[fieldName];
    }
  }

  for (const [graphQLType, fieldNames] of Object.entries(fieldsByType)) {
    if (fieldNames.length > 1) {
      const mergedData = [];
      for (const fieldName of fieldNames) {
        if (flattenedByQuery[fieldName] && Array.isArray(flattenedByQuery[fieldName])) {
          mergedData.push(...flattenedByQuery[fieldName]);
        }
      }
      finalFlattened[graphQLType] = mergedData;
    } else if (fieldNames.length === 1) {
      const fieldName = fieldNames[0];
      if (flattenedByQuery[fieldName]) {
        finalFlattened[fieldName] = flattenedByQuery[fieldName];
      }
    }
  }

  for (const [fieldName, data] of Object.entries(flattenedByQuery)) {
    if (!finalFlattened[fieldName] && !indexFields.has(fieldName)) {
      const metadata = fieldMetadata[fieldName];
      if (!metadata || !metadata.graphQLType || !fieldsByType[metadata.graphQLType]) {
        finalFlattened[fieldName] = data;
      }
    }
  }

  if (hasAnyData) {
    const cleanedData = {};
    for (const [key, value] of Object.entries(finalFlattened)) {
      cleanedData[key] = removeIndexKeys(value);
    }
    return cleanedData;
  }

  return null;
}


