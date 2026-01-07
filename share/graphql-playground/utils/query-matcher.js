import { parse, getOperationAST } from 'graphql';

/**
 * Finds a node in the tree by its key
 * @param {Array} nodes - Array of tree nodes
 * @param {string} key - The key to search for
 * @returns {Object|null} The found node or null
 */
export const findNodeByKey = (nodes, key) => {
  for (const node of nodes) {
    if (node.key === key) return node;
    if (node.children) {
      const found = findNodeByKey(node.children, key);
      if (found) return found;
    }
  }
  return null;
};

/**
 * Finds the parent node key for a given key
 * @param {Array} nodes - Array of tree nodes (unused but kept for API consistency)
 * @param {string} key - The key to find parent for
 * @returns {string|null} The parent key or null
 */
export const findParentNodeKey = (nodes, key) => {
  if (!key || !key.includes('.')) return null;
  const parts = key.split('.');
  const parentKey = parts.slice(0, -1).join('.');
  return parentKey;
};

/**
 * Finds a node key from an index query by matching the query structure to tree nodes
 * This function reverses the process done by stripUnwantedSelections - it takes a stripped query
 * and reconstructs the node key path by matching the query structure to the tree nodes.
 * @param {string} indexQuery - The GraphQL query string to match (built by stripUnwantedSelections)
 * @param {Array} nodes - Array of tree nodes to search in
 * @returns {string|null} The matching node key or null
 */
export const findNodeKeyFromIndexQuery = (indexQuery, nodes) => {
  if (!indexQuery || !indexQuery.trim() || !nodes || nodes.length === 0) {
    return null;
  }

  try {
    const ast = parse(indexQuery);
    const operation = getOperationAST(ast);
    if (!operation || !operation.selectionSet || !operation.selectionSet.selections || operation.selectionSet.selections.length === 0) {
      return null;
    }

    const selection = operation.selectionSet.selections[0];
    if (selection.kind !== 'Field') {
      return null;
    }

    /**
     * Recursively matches a field selection from the query AST to tree nodes
     * This mirrors the logic in stripUnwantedSelections but in reverse - building a path
     * from the query structure instead of stripping a path from the query.
     * 
     * @param {Object} fieldSelection - The GraphQL field selection AST node
     * @param {Array} currentNodeNodes - The current level of tree nodes to match against
     * @param {string} currentPath - The path built so far (e.g., "field1.field2")
     * @returns {string|null} The matching node key path or null
     */
    const findMatchingNode = (fieldSelection, currentNodeNodes, currentPath = '') => {
      if (!fieldSelection || fieldSelection.kind !== 'Field') {
        return null;
      }

      // Get the field name from query (alias takes precedence, then name) - matches stripUnwantedSelections logic
      const aliasName = fieldSelection.alias?.value;
      const fieldName = fieldSelection.name.value;

      // Find matching node - check both alias and name (matching stripUnwantedSelections logic)
      const matchingNode = currentNodeNodes.find(node => {
        const nodeName = node.data.name;
        // Match by alias or by name (same logic as stripUnwantedSelections)
        return nodeName === aliasName || nodeName === fieldName;
      });

      if (!matchingNode) {
        return null;
      }

      // Build the path using the node's data.name (which is what node keys use)
      // This ensures we use the exact same format as the node key
      const nodeKeySegment = matchingNode.data.name;
      const newPath = currentPath ? `${currentPath}.${nodeKeySegment}` : nodeKeySegment;

      // Check if this field has nested selections (not a leaf node)
      if (fieldSelection.selectionSet && fieldSelection.selectionSet.selections && fieldSelection.selectionSet.selections.length > 0) {
        // If the matching node has children, continue recursively
        if (matchingNode.children && matchingNode.children.length > 0) {
          // stripUnwantedSelections creates queries with only one selection at each level
          // So we process the first (and only) child selection
          const childSelection = fieldSelection.selectionSet.selections[0];
          if (childSelection.kind === 'Field') {
            const childPath = findMatchingNode(childSelection, matchingNode.children, newPath);
            if (childPath) {
              return childPath;
            }
          }
          // If child matching failed, fall through to return newPath
        }
        // If node has no children but query has selections, something is wrong - return null
        return null;
      }

      // Leaf node - no selectionSet, so this is the end of the path
      return newPath;
    };

    return findMatchingNode(selection, nodes);
  } catch (error) {
    console.error('Error parsing index query:', error);
    return null;
  }
};

