import { parse, getOperationAST } from 'graphql';
import React from 'react';

/**
 * Extracts the operation name from a GraphQL query string
 * @param {string} queryString - The GraphQL query string
 * @returns {string} Operation name or empty string
 */
export const extractOperationName = (queryString) => {
  if (!queryString || !queryString.trim()) return '';
  try {
    const ast = parse(queryString);
    const operation = getOperationAST(ast);
    return operation?.name?.value || '';
  } catch (error) {
    return '';
  }
};

/**
 * Parses a GraphQL query string into a tree structure for UI display
 * @param {string} queryString - The GraphQL query string
 * @param {string} parentPath - Optional parent path for nested parsing
 * @returns {Array} Array of tree node objects
 */
export const parseQueryToTreeNodes = (queryString, parentPath = '') => {
  if (!queryString || !queryString.trim()) {
    return [];
  }

  try {
    const ast = parse(queryString);
    const treeNodes = [];

    const operation = ast.definitions.find(
      def => def.kind === 'OperationDefinition'
    );

    if (!operation || !operation.selectionSet) {
      return [];
    }

    // Helper to serialize GraphQL values recursively
    const serializeValue = (value) => {
      if (value.kind === 'StringValue') return `"${value.value}"`;
      if (value.kind === 'IntValue') return value.value;
      if (value.kind === 'BooleanValue') return value.value;
      if (value.kind === 'FloatValue') return value.value;
      if (value.kind === 'NullValue') return 'null';
      if (value.kind === 'EnumValue') return value.value;
      if (value.kind === 'ListValue') {
        return `[${value.values.map(v => serializeValue(v)).join(', ')}]`;
      }
      if (value.kind === 'ObjectValue') {
        return `{${value.fields.map(f => `${f.name.value}: ${serializeValue(f.value)}`).join(', ')}}`;
      }
      if (value.kind === 'Variable') {
        return `$${value.name.value}`;
      }
      return value.value || '';
    };

    // Helper to serialize arguments
    const serializeArguments = (args) => {
      if (!args || args.length === 0) return '';

      const argStrings = args.map(arg => {
        const name = arg.name.value;
        const value = serializeValue(arg.value);
        return `${name}: ${value}`;
      });

      return `(${argStrings.join(', ')})`;
    };

    const processSelections = (selections, currentPath = '', originalPath = '') => {
      const result = [];

      for (const selection of selections) {
        if (selection.kind !== 'Field') continue;

        const fieldName = selection.alias?.value || selection.name.value;
        const originalFieldName = selection.name.value;
        const hasAlias = !!selection.alias;
        const hasChildren = selection.selectionSet &&
          selection.selectionSet.selections &&
          selection.selectionSet.selections.length > 0;

        // Serialize arguments
        const argsString = serializeArguments(selection.arguments);

        const actualPath = originalPath ? `${originalPath}.${fieldName}` : fieldName;
        const displayPath = currentPath ? `${currentPath}.${fieldName}` : fieldName;

        // Process children normally - no flattening of structural wrappers
        let children = null;

        if (hasChildren) {
          children = processSelections(
            selection.selectionSet.selections,
            displayPath,
            actualPath
          );
        }

        // Create searchable label text for filtering
        const labelText = hasAlias
          ? `${fieldName} (alias: ${originalFieldName})${argsString ? ' ' + argsString : ''}`
          : `${fieldName}${argsString ? ' ' + argsString : ''}`;

        const node = {
          key: displayPath,
          label: React.createElement('div', { className: 'flex items-center gap-2' },
            React.createElement('span', { className: 'font-medium' }, fieldName),
            hasAlias && React.createElement('span', { className: 'text-xs text-gray-400' }, `(alias: ${originalFieldName})`)
          ),
          data: {
            name: fieldName,
            originalName: originalFieldName,
            alias: hasAlias ? originalFieldName : null,
            arguments: argsString,
            selection: selection, // Store original selection for query building
            index: result.length,
            path: displayPath,
            actualPath: actualPath,
            labelText: labelText, // Add searchable text for filtering
          },
          leaf: !children || children.length === 0,
        };

        if (children && children.length > 0) {
          node.children = children;
        }

        result.push(node);
      }

      return result;
    };

    return processSelections(operation.selectionSet.selections, parentPath);
  } catch (error) {
    return [];
  }
};

