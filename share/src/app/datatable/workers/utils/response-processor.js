/**
 * Walk GraphQL AST to find node-producing paths
 * @param {Object} selectionSet - The GraphQL selection set
 * @param {Array} currentPath - Current path array
 * @param {string} graphQLType - Current GraphQL type
 * @param {string} fieldName - Current field name
 * @returns {Array} Array of node path objects
 */
export const walkASTForNodePaths = (selectionSet, currentPath = [], graphQLType = null, fieldName = null) => {
  if (!selectionSet || !selectionSet.selections) return [];

  const nodePaths = [];

  for (const selection of selectionSet.selections) {
    if (selection.kind !== 'Field') continue;

    const selectionFieldName = selection.name.value;
    const aliasName = selection.alias ? selection.alias.value : selectionFieldName;
    const nextPath = [...currentPath, aliasName];

    // If this is a top-level field (no currentPath), capture the GraphQL type
    // The GraphQL type is the field name (e.g., "SalesInvoices"), and the alias/field name is the query field name
    const currentGraphQLType = currentPath.length === 0 ? selectionFieldName : graphQLType;
    const currentFieldName = currentPath.length === 0 ? aliasName : fieldName;

    if (selection.selectionSet) {
      // Check if this is a "node" field (edges → node pattern)
      if (selectionFieldName === 'node') {
        // Extract leaf fields from this node's selection set
        const leafFields = extractLeafFields(selection.selectionSet);
        nodePaths.push({
          nodePath: nextPath,
          fields: leafFields,
          graphQLType: currentGraphQLType,
          fieldName: currentFieldName
        });
      } else {
        // Continue walking deeper
        const nestedPaths = walkASTForNodePaths(selection.selectionSet, nextPath, currentGraphQLType, currentFieldName);
        nodePaths.push(...nestedPaths);
      }
    }
  }

  return nodePaths;
};

/**
 * Extract leaf fields (fields without sub-selections) from a selection set
 * @param {Object} selectionSet - The GraphQL selection set
 * @returns {Array} Array of leaf field names
 */
export const extractLeafFields = (selectionSet) => {
  if (!selectionSet || !selectionSet.selections) return [];

  const fields = [];

  for (const selection of selectionSet.selections) {
    if (selection.kind !== 'Field') continue;

    const aliasName = selection.alias ? selection.alias.value : selection.name.value;

    // If it has a selectionSet, it's not a leaf (skip it)
    if (!selection.selectionSet) {
      fields.push(aliasName);
    }
  }

  return fields;
};

/**
 * Convert node path to JMESPath query
 * @param {Array} nodePath - Array of path segments
 * @returns {string} JMESPath query string
 */
export const nodePathToJMESPath = (nodePath) => {
  // Convert path array to JMESPath string
  // Replace "edges" followed by "node" with "edges[].node"
  let jmespath = '';

  for (let i = 0; i < nodePath.length; i++) {
    const part = nodePath[i];
    const nextPart = nodePath[i + 1];

    if (part === 'edges' && nextPart === 'node') {
      // Add dot before edges if jmespath already has content
      jmespath += (jmespath ? '.' : '') + 'edges[].node';
      i++; // Skip next part since we handled it
    } else {
      jmespath += (jmespath ? '.' : '') + part;
    }
  }

  return jmespath;
};


