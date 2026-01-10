'use client';

import React, { useEffect, useMemo, useRef, useCallback, useImperativeHandle } from 'react';
import { Button } from 'primereact/button';
import { Calendar } from 'primereact/calendar';
import { confirmDialog } from 'primereact/confirmdialog';
import { Tree } from 'primereact/tree';
import { OverlayPanel } from 'primereact/overlaypanel';
import { print, parse } from 'graphql';
import { useSaveControlsStore } from '../stores/useSaveControlsStore';
import { useAppStore } from '../stores/useAppStore';
import { extractOperationName } from '../utils/graphql-parser';
import { findNodeByKey } from '../utils/query-matcher';
import { firestoreService } from '../services/firestoreService';
import { parse as parseJsonc, stripComments } from 'jsonc-parser';
import { fetchGraphQLRequest } from '../utils/query-pipeline';
import { getEndpointConfigFromUrlKey, getInitialEndpoint } from '../constants';
import { useAuth } from '@/contexts/AuthContext';
import { Timestamp } from 'firebase/firestore';

export const SaveControls = React.forwardRef((props, ref) => {
  const {
    clientSave,
    setClientSave,
    treeNodes,
    selectedKeys,
    setSelectedKeys,
    expandedKeys,
    setExpandedKeys,
    month,
    setMonth,
    monthIndexKeys,
    setMonthIndexKeys,
    monthIndexExpandedKeys,
    setMonthIndexExpandedKeys,
    loadQueryData,
    reset: resetSaveControls,
  } = useSaveControlsStore();
  // Read GraphiQL state from Zustand store instead of useGraphiQL hooks
  const { queryString, variablesString, activeTabIndex, queryEditor, variableEditor } = useAppStore((state) => state.graphiQLState);
  const { tabData, setTabData, selectedEndpoint } = useAppStore();
  const currentTabData = tabData[activeTabIndex] || { hasSuccessfulQuery: false, transformedData: null, transformerCode: '' };
  const transformedData = currentTabData.transformedData;
  const transformerCode = currentTabData.transformerCode || '';
  const { user } = useAuth();
  const indexFieldOp = useRef(null);
  const monthIndexFieldOp = useRef(null);
  const [indexQueryError, setIndexQueryError] = React.useState(null);
  const [monthIndexQueryError, setMonthIndexQueryError] = React.useState(null);
  const [isValidating, setIsValidating] = React.useState(false);
  const [validationResults, setValidationResults] = React.useState({ index: null, monthIndex: null });

  // Ref to store latest validation state for DialogMessage component
  const validationStateRef = React.useRef({
    isValidating: false,
    validationResults: { index: null, monthIndex: null },
    indexQueryError: null,
    monthIndexQueryError: null
  });

  // Keep ref updated with current state
  React.useEffect(() => {
    validationStateRef.current = {
      isValidating,
      validationResults,
      indexQueryError,
      monthIndexQueryError
    };
  }, [isValidating, validationResults, indexQueryError, monthIndexQueryError]);

  // Load existing document data when query changes (including tab switches)
  useEffect(() => {
    if (queryString) {
      loadQueryData(queryString, activeTabIndex).catch((error) => {
        console.error('Error loading query data:', error);
        resetSaveControls();
      });
    }
  }, [queryString, loadQueryData, resetSaveControls, activeTabIndex]);

  // Clear monthIndexKeys when month is cleared
  useEffect(() => {
    if (!month) {
      setMonthIndexKeys(null);
      setMonthIndexExpandedKeys({});
    }
  }, [month, setMonthIndexKeys, setMonthIndexExpandedKeys]);

  // Cleanup: Reset monthIndexKeys if it's a function (from previous bug with function updater)
  useEffect(() => {
    if (typeof monthIndexKeys === 'function') {
      setMonthIndexKeys(null);
      setMonthIndexExpandedKeys({});
    }
  }, [monthIndexKeys, setMonthIndexKeys, setMonthIndexExpandedKeys]);

  // Update variables with startDate and endDate when month changes
  useEffect(() => {
    if (!month || !variableEditor) return;

    // Check if editor is focused - don't interrupt user input
    if (variableEditor.hasTextFocus && variableEditor.hasTextFocus()) {
      return;
    }

    // Compute startDate (first day of month) and endDate (last day of month)
    const year = month.getFullYear();
    const monthIndex = month.getMonth(); // 0-11

    // Start date: first day of the month
    const startDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;

    // End date: last day of the month
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const endDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Get current variables from editor directly
    const currentVariablesString = variableEditor.getValue() || '';
    let variables = {};
    let currentStartDate = null;
    let currentEndDate = null;

    // Parse existing variables if they exist
    if (currentVariablesString.trim()) {
      try {
        variables = JSON.parse(currentVariablesString);
        currentStartDate = variables.startDate;
        currentEndDate = variables.endDate;
      } catch (e) {
        // If parsing fails and editor is not focused, it might be invalid JSON
        // Don't update if we can't parse - user might be typing
        return;
      }
    }

    // Only update if dates actually changed
    if (currentStartDate === startDate && currentEndDate === endDate) {
      return;
    }

    // Use executeEdits to update only the date fields without resetting cursor
    try {
      const model = variableEditor.getModel();
      if (!model) {
        // Fallback if model is not available
        variables.startDate = startDate;
        variables.endDate = endDate;
        const updatedVariablesString = JSON.stringify(variables, null, 2);
        variableEditor.setValue(updatedVariablesString);
        return;
      }

      // Get Monaco Range class - try multiple ways to access it
      let Range = null;
      if (typeof window !== 'undefined' && window.monaco) {
        Range = window.monaco.Range;
      } else if (model.constructor && model.constructor.Range) {
        Range = model.constructor.Range;
      } else if (variableEditor._editor && variableEditor._editor.Range) {
        Range = variableEditor._editor.Range;
      }

      // If Range is not available, fallback to setValue with cursor preservation attempt
      if (!Range) {
        // Fallback: preserve cursor position manually
        const position = variableEditor.getPosition?.() || variableEditor.getCursorPosition?.();
        variables.startDate = startDate;
        variables.endDate = endDate;
        const updatedVariablesString = JSON.stringify(variables, null, 2);
        variableEditor.setValue(updatedVariablesString);
        // Try to restore cursor position
        if (position && variableEditor.setPosition) {
          setTimeout(() => {
            variableEditor.setPosition(position);
          }, 0);
        }
        return;
      }

      const edits = [];
      const fullText = model.getValue();
      const lines = fullText.split('\n');

      // Find positions of startDate and endDate using more flexible regex
      let startDateLine = -1;
      let endDateLine = -1;
      let startDateStartCol = -1;
      let startDateEndCol = -1;
      let endDateStartCol = -1;
      let endDateEndCol = -1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // More flexible regex to match startDate with various formatting
        const startDateMatch = line.match(/"startDate"\s*:\s*"([^"]*)"/);
        const endDateMatch = line.match(/"endDate"\s*:\s*"([^"]*)"/);

        if (startDateMatch) {
          startDateLine = i;
          const matchIndex = line.indexOf(startDateMatch[0]);
          const valueStart = line.indexOf('"', matchIndex + startDateMatch[0].indexOf(':')) + 1;
          startDateStartCol = valueStart;
          startDateEndCol = line.indexOf('"', valueStart);
        }
        if (endDateMatch) {
          endDateLine = i;
          const matchIndex = line.indexOf(endDateMatch[0]);
          const valueStart = line.indexOf('"', matchIndex + endDateMatch[0].indexOf(':')) + 1;
          endDateStartCol = valueStart;
          endDateEndCol = line.indexOf('"', valueStart);
        }
      }

      // If we have an empty or minimal JSON, use setValue (safer for empty objects)
      if (!currentVariablesString.trim() || (Object.keys(variables).length === 0 && startDateLine < 0 && endDateLine < 0)) {
        variables.startDate = startDate;
        variables.endDate = endDate;
        const updatedVariablesString = JSON.stringify(variables, null, 2);
        variableEditor.setValue(updatedVariablesString);
        return;
      }

      // Update startDate if found
      if (startDateLine >= 0 && startDateStartCol >= 0 && startDateEndCol >= 0 && Range) {
        edits.push({
          range: new Range(startDateLine + 1, startDateStartCol, startDateLine + 1, startDateEndCol),
          text: startDate
        });
      } else if (startDateLine < 0 && Range) {
        // startDate doesn't exist, need to add it
        // Find a good place to insert (after opening brace or before closing brace)
        let insertLine = 0;
        let insertCol = 1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim() === '{') {
            insertLine = i + 1;
            // Calculate indent based on the line
            const indentMatch = lines[i].match(/^(\s*)/);
            insertCol = (indentMatch ? indentMatch[1].length : 0) + 2;
            break;
          }
        }
        const insertText = endDateLine < 0 ? `  "startDate": "${startDate}",\n` : `  "startDate": "${startDate}",\n`;
        edits.push({
          range: new Range(insertLine, insertCol, insertLine, insertCol),
          text: insertText
        });
      }

      // Update endDate if found
      if (endDateLine >= 0 && endDateStartCol >= 0 && endDateEndCol >= 0 && Range) {
        edits.push({
          range: new Range(endDateLine + 1, endDateStartCol, endDateLine + 1, endDateEndCol),
          text: endDate
        });
      } else if (endDateLine < 0 && Range) {
        // endDate doesn't exist, need to add it
        // Find a good place to insert (after startDate or before closing brace)
        let insertLine = startDateLine >= 0 ? startDateLine + 1 : 0;
        let insertCol = 2;
        if (startDateLine >= 0) {
          // Insert after startDate line
          insertLine = startDateLine + 1;
          const indentMatch = lines[startDateLine].match(/^(\s*)/);
          insertCol = indentMatch ? indentMatch[1].length : 2;
        } else {
          // Find opening brace
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === '{') {
              insertLine = i + 1;
              const indentMatch = lines[i].match(/^(\s*)/);
              insertCol = indentMatch ? indentMatch[1].length + 2 : 2;
              break;
            }
          }
        }
        const insertText = `  "endDate": "${endDate}"\n`;
        edits.push({
          range: new Range(insertLine, insertCol, insertLine, insertCol),
          text: insertText
        });
      }

      // Execute edits using editor's executeEdits API (preserves cursor position)
      if (edits.length > 0) {
        if (variableEditor.executeEdits) {
          variableEditor.executeEdits('update-dates', edits);
        } else {
          // Final fallback if executeEdits is not available
          variables.startDate = startDate;
          variables.endDate = endDate;
          const updatedVariablesString = JSON.stringify(variables, null, 2);
          variableEditor.setValue(updatedVariablesString);
        }
      }
    } catch (error) {
      // Fallback to setValue if executeEdits fails
      console.warn('Failed to use executeEdits, falling back to setValue:', error);
      variables.startDate = startDate;
      variables.endDate = endDate;
      const updatedVariablesString = JSON.stringify(variables, null, 2);
      variableEditor.setValue(updatedVariablesString);
    }
  }, [month, variableEditor]);

  // Clear monthIndexKeys when selectedKeys changes (parent may have changed)
  useEffect(() => {
    if (!selectedKeys) {
      // Clear monthIndexKeys if selectedKeys is cleared
      setMonthIndexKeys(null);
      setMonthIndexExpandedKeys({});
      return;
    }

    // Only validate if monthIndexKeys is already set
    // Get current value from store (Zustand doesn't support function updaters like useState)
    const currentMonthIndexKeys = monthIndexKeys;
    if (currentMonthIndexKeys && typeof currentMonthIndexKeys === 'string') {
      // Get the top-level key (first part of the path)
      const topLevelKey = selectedKeys.split('.')[0];
      // Check if monthIndexKeys is still a valid child of the top-level parent
      if (!currentMonthIndexKeys.startsWith(topLevelKey + '.')) {
        setMonthIndexKeys(null);
        setMonthIndexExpandedKeys({});
      }
    }
  }, [selectedKeys, monthIndexKeys, setMonthIndexKeys, setMonthIndexExpandedKeys]);

  const formatFieldName = useCallback((key) => {
    if (!key || !treeNodes.length) return String(key || '');
    const node = findNodeByKey(treeNodes, key);
    if (!node) return String(key);

    const parts = key.split('.');
    const pathNames = [];
    for (let i = 0; i < parts.length; i++) {
      const currentKey = parts.slice(0, i + 1).join('.');
      const n = findNodeByKey(treeNodes, currentKey);
      if (n?.data?.name) {
        pathNames.push(n.data.name);
      }
    }
    // Filter out "edges", and "node" from the path for display
    const filteredPathNames = pathNames.filter(name => name !== 'edges' && name !== 'node');
    return filteredPathNames.length > 0 ? filteredPathNames.join(' > ') : String(key);
  }, [treeNodes]);


  const handleNodeSelect = (e) => {
    // Only allow selection of leaf nodes (nodes without children)
    // For non-leaf nodes, toggle expand/collapse
    const selectedKey = e.value;
    if (selectedKey) {
      const node = findNodeByKey(treeNodes, selectedKey);
      // Check if node is a leaf (no children or empty children array)
      const isLeaf = !node || !node.children || node.children.length === 0;

      if (isLeaf) {
        setSelectedKeys(selectedKey);
        setIndexQueryError(null); // Clear error when selection changes
        if (indexFieldOp.current) {
          indexFieldOp.current.hide();
        }
      } else {
        // For non-leaf nodes, toggle expand/collapse instead of selecting
        const currentExpandedKeys = expandedKeys || {};
        const isExpanded = !!currentExpandedKeys[selectedKey];

        if (isExpanded) {
          // Collapse: remove the key from expandedKeys
          const { [selectedKey]: _, ...rest } = currentExpandedKeys;
          setExpandedKeys(rest);
        } else {
          // Expand: add the key to expandedKeys
          setExpandedKeys({
            ...currentExpandedKeys,
            [selectedKey]: true,
          });
        }

        // Prevent selection of non-leaf nodes by keeping current selection
        setSelectedKeys(selectedKeys);
      }
    } else {
      setSelectedKeys(null);
    }
  };

  const handleToggle = (event) => {
    setExpandedKeys(event.value);
  };

  const handleMonthIndexNodeSelect = (e) => {
    // Only allow selection of leaf nodes (nodes without children)
    // For non-leaf nodes, toggle expand/collapse
    const selectedKey = e.value;
    if (selectedKey) {
      const node = findNodeByKey(monthIndexTreeNodes, selectedKey);
      // Check if node is a leaf (no children or empty children array)
      const isLeaf = !node || !node.children || node.children.length === 0;

      if (isLeaf) {
        setMonthIndexKeys(selectedKey);
        setMonthIndexQueryError(null); // Clear error when selection changes
        if (monthIndexFieldOp.current) {
          monthIndexFieldOp.current.hide();
        }
      } else {
        // For non-leaf nodes, toggle expand/collapse instead of selecting
        const currentExpandedKeys = monthIndexExpandedKeys || {};
        const isExpanded = !!currentExpandedKeys[selectedKey];

        if (isExpanded) {
          // Collapse: remove the key from expandedKeys
          const { [selectedKey]: _, ...rest } = currentExpandedKeys;
          setMonthIndexExpandedKeys(rest);
        } else {
          // Expand: add the key to expandedKeys
          setMonthIndexExpandedKeys({
            ...currentExpandedKeys,
            [selectedKey]: true,
          });
        }

        // Prevent selection of non-leaf nodes by keeping current selection
        setMonthIndexKeys(monthIndexKeys);
      }
    } else {
      setMonthIndexKeys(null);
    }
  };

  const handleMonthIndexToggle = (event) => {
    setMonthIndexExpandedKeys(event.value);
  };

  const monthIndexTreeNodes = useMemo(() => {
    if (!selectedKeys) return [];
    // Get the top-level parent node (first part of the key path)
    const topLevelKey = selectedKeys.split('.')[0];
    const topLevelNode = findNodeByKey(treeNodes, topLevelKey);
    if (!topLevelNode) return [];
    return [topLevelNode];
  }, [selectedKeys, treeNodes]);

  // Helper function to collect all variables used in a field/selection
  const collectVariablesInField = (field) => {
    const variables = new Set();

    const visitNode = (node) => {
      if (!node) return;

      // Check arguments for variables
      if (node.arguments && Array.isArray(node.arguments)) {
        for (const arg of node.arguments) {
          if (arg.value && arg.value.kind === 'Variable') {
            variables.add(arg.value.name.value);
          } else if (arg.value && arg.value.kind === 'ListValue' && arg.value.values) {
            for (const value of arg.value.values) {
              if (value.kind === 'Variable') {
                variables.add(value.name.value);
              } else if (value.kind === 'ObjectValue' && value.fields) {
                for (const field of value.fields) {
                  if (field.value && field.value.kind === 'Variable') {
                    variables.add(field.value.name.value);
                  }
                }
              }
            }
          } else if (arg.value && arg.value.kind === 'ObjectValue' && arg.value.fields) {
            for (const field of arg.value.fields) {
              if (field.value && field.value.kind === 'Variable') {
                variables.add(field.value.name.value);
              } else if (field.value && field.value.kind === 'ListValue' && field.value.values) {
                for (const value of field.value.values) {
                  if (value.kind === 'Variable') {
                    variables.add(value.name.value);
                  }
                }
              }
            }
          }
        }
      }

      // Recursively visit selection sets
      if (node.selectionSet && node.selectionSet.selections) {
        for (const selection of node.selectionSet.selections) {
          visitNode(selection);
        }
      }
    };

    visitNode(field);
    return Array.from(variables);
  };

  // Helper function to strip unwanted selections from a query based on selected path
  const stripUnwantedSelections = (queryString, selectedPath) => {
    if (!queryString || !queryString.trim() || !selectedPath) return '';

    try {
      const ast = parse(queryString);
      const operation = ast.definitions.find(
        def => def.kind === 'OperationDefinition'
      );

      if (!operation || !operation.selectionSet) {
        return queryString; // Return original if we can't parse
      }

      const pathParts = selectedPath.split('.');
      const topLevelKey = pathParts[0];

      // Find the top-level field that matches the selected path
      // Check both alias and name to handle aliased fields
      const matchingField = operation.selectionSet.selections.find(selection => {
        if (selection.kind !== 'Field') return false;
        const aliasName = selection.alias?.value;
        const fieldName = selection.name.value;
        return aliasName === topLevelKey || fieldName === topLevelKey;
      });

      if (!matchingField || matchingField.kind !== 'Field') {
        return queryString; // Return original if we can't find matching field
      }

      // Recursively strip selections to keep only the selected path
      const stripField = (field, remainingPath) => {
        if (!field || field.kind !== 'Field') return field;

        // If no more path parts, this is the leaf - keep the field but remove selection set
        if (remainingPath.length === 0) {
          // Return field without selectionSet
          const { selectionSet, ...fieldWithoutSelectionSet } = field;
          return fieldWithoutSelectionSet;
        }

        // If field has no selection set, nothing to strip
        if (!field.selectionSet || !field.selectionSet.selections) {
          return field;
        }

        const nextPathPart = remainingPath[0];
        const restPath = remainingPath.slice(1);

        // Find the matching child field (check both alias and name)
        const matchingChild = field.selectionSet.selections.find(selection => {
          if (selection.kind !== 'Field') return false;
          const aliasName = selection.alias?.value;
          const fieldName = selection.name.value;
          return aliasName === nextPathPart || fieldName === nextPathPart;
        });

        if (!matchingChild) {
          // No matching child found, remove all selections
          const { selectionSet, ...fieldWithoutSelectionSet } = field;
          return fieldWithoutSelectionSet;
        }

        // Recursively strip the matching child
        const strippedChild = stripField(matchingChild, restPath);

        // Return field with only the stripped child, preserving all other properties
        return {
          ...field,
          selectionSet: {
            kind: 'SelectionSet',
            selections: [strippedChild]
          }
        };
      };

      // Strip the matching field
      const strippedField = stripField(matchingField, pathParts.slice(1));

      // Collect all variables used in the stripped field
      const usedVariables = collectVariablesInField(strippedField);

      // Filter variable definitions to only include those that are used
      const variableDefinitions = operation.variableDefinitions
        ? operation.variableDefinitions.filter(vdef =>
          usedVariables.includes(vdef.variable.name.value)
        )
        : [];

      // Create new operation, only including variableDefinitions if there are used variables
      const newOperation = {
        kind: operation.kind,
        operation: operation.operation,
        ...(operation.name && { name: operation.name }),
        ...(variableDefinitions.length > 0 && { variableDefinitions }),
        selectionSet: {
          kind: 'SelectionSet',
          selections: [strippedField]
        }
      };

      // Create new document
      const newDocument = {
        kind: 'Document',
        definitions: [newOperation]
      };

      // Print the new query
      return print(newDocument);
    } catch (error) {
      console.error('Error stripping selections:', error);
      return queryString; // Return original on error
    }
  };

  const handleSave = useCallback(async () => {
    if (!queryEditor || !queryString) return;


    const operationName = extractOperationName(queryString);

    if (!operationName) {
      confirmDialog({
        message: 'Please add an operation name to your query before saving.',
        header: 'Cannot Save Query',
        acceptLabel: 'OK',
        accept: () => { },
      });
      return;
    }

    // Index field is only required when clientSave is enabled
    if (clientSave && !selectedKeys) {
      confirmDialog({
        message: 'Please select an index field before saving.',
        header: 'Index Field Required',
        acceptLabel: 'OK',
        accept: () => { },
      });
      return;
    }

    // If month is selected, monthIndex is mandatory (only for client save)
    if (clientSave && month && !monthIndexKeys) {
      confirmDialog({
        message: 'Please select a month index field when a month is selected.',
        header: 'Month Index Field Required',
        acceptLabel: 'OK',
        accept: () => { },
      });
      return;
    }

    // Build selected query by stripping unwanted selections from original query
    const buildSelectedQuery = () => {
      // Only build query if clientSave is enabled and selectedKeys exists
      if (!clientSave || !selectedKeys || !queryString) return '';

      // Use the simpler approach: strip unwanted selections from the original query
      return stripUnwantedSelections(queryString, selectedKeys);
    };

    // Helper function to validate and rectify a GraphQL query by executing it
    const validateAndRectifyQuery = async (query, queryName, originalQueryString, selectedPath) => {
      if (!query || !query.trim()) {
        return { valid: true, query: '', errors: [], errorMessage: null };
      }

      // First, try to parse the query to check if it's valid syntax
      try {
        const ast = parse(query);
        // If parsing succeeds, try to execute it to check if it returns 200
        try {
          // Get endpoint and auth
          let endpointUrl, authToken;
          if (selectedEndpoint?.name) {
            const config = getEndpointConfigFromUrlKey(selectedEndpoint.name);
            endpointUrl = config.endpointUrl;
            authToken = config.authToken;
          }

          if (!endpointUrl) {
            const defaultEndpoint = getInitialEndpoint();
            endpointUrl = defaultEndpoint?.code;
            authToken = null;
          }

          if (!endpointUrl) {
            return {
              valid: false,
              query,
              errors: ['No endpoint available for validation'],
              errorMessage: 'No endpoint available to validate query'
            };
          }

          // Parse variables from variablesString
          let parsedVariables = {};
          if (variablesString && variablesString.trim()) {
            try {
              parsedVariables = parseJsonc(variablesString);
            } catch (e) {
              try {
                const stripped = stripComments(variablesString);
                parsedVariables = JSON.parse(stripped);
              } catch {
                // Use empty variables if parsing fails
              }
            }
          }

          // Execute the query
          const response = await fetchGraphQLRequest(query, parsedVariables, {
            endpointUrl,
            authToken
          });

          // Check if response is 200
          if (response.ok) {
            // Check response body for GraphQL errors (even if HTTP 200)
            try {
              const responseBody = await response.clone().json();
              if (responseBody.errors && Array.isArray(responseBody.errors) && responseBody.errors.length > 0) {
                // GraphQL returned errors even though HTTP status is 200
                const errorMessages = responseBody.errors.map(e => e.message || JSON.stringify(e));
                const errorMessage = errorMessages.join('; ');
                return {
                  valid: false,
                  query,
                  errors: errorMessages,
                  errorMessage: errorMessage
                };
              }
            } catch {
              // If we can't parse JSON, assume it's valid
            }

            // Query executed successfully
            return { valid: true, query, errors: [], errorMessage: null };
          } else {
            // Query failed - get error details
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
              const errorBody = await response.clone().text();
              if (errorBody) {
                try {
                  const errorJson = JSON.parse(errorBody);
                  // Handle standard GraphQL error format
                  if (Array.isArray(errorJson.errors) && errorJson.errors.length > 0) {
                    const errorMessages = errorJson.errors.map(e => e.message || JSON.stringify(e));
                    errorMessage = errorMessages.join('; ');
                    return {
                      valid: false,
                      query,
                      errors: errorMessages,
                      errorMessage: errorMessage
                    };
                  } else if (errorJson.message) {
                    errorMessage = errorJson.message;
                  } else if (errorJson.error) {
                    errorMessage = errorJson.error;
                  } else {
                    errorMessage = errorBody.substring(0, 200);
                  }
                } catch {
                  errorMessage = errorBody.substring(0, 200);
                }
              }
            } catch {
              // Use status text if we can't read body
            }

            return {
              valid: false,
              query,
              errors: [errorMessage],
              errorMessage: errorMessage
            };
          }
        } catch (execError) {
          // Execution failed (network error, etc.)
          return {
            valid: false,
            query,
            errors: [execError.message || 'Failed to execute query'],
            errorMessage: execError.message || 'Failed to execute query'
          };
        }
      } catch (parseError) {
        // Parse error - try to fix
        console.warn(`${queryName} query has parsing errors, attempting to fix:`, parseError);

        // Try to fix by re-generating from the original query
        if (originalQueryString && selectedPath) {
          try {
            const fixedQuery = stripUnwantedSelections(originalQueryString, selectedPath);

            // Validate the fixed query by parsing
            try {
              parse(fixedQuery);
              console.log(`${queryName} query fixed successfully, validating execution...`);

              // Now execute the fixed query to validate
              try {
                let endpointUrl, authToken;
                if (selectedEndpoint?.name) {
                  const config = getEndpointConfigFromUrlKey(selectedEndpoint.name);
                  endpointUrl = config.endpointUrl;
                  authToken = config.authToken;
                }

                if (!endpointUrl) {
                  const defaultEndpoint = getInitialEndpoint();
                  endpointUrl = defaultEndpoint?.code;
                  authToken = null;
                }

                if (endpointUrl) {
                  let parsedVariables = {};
                  if (variablesString && variablesString.trim()) {
                    try {
                      parsedVariables = parseJsonc(variablesString);
                    } catch (e) {
                      try {
                        const stripped = stripComments(variablesString);
                        parsedVariables = JSON.parse(stripped);
                      } catch { }
                    }
                  }

                  const response = await fetchGraphQLRequest(fixedQuery, parsedVariables, {
                    endpointUrl,
                    authToken
                  });

                  // Check for GraphQL errors even if HTTP status is 200
                  if (response.ok) {
                    try {
                      const responseBody = await response.clone().json();
                      if (responseBody.errors && Array.isArray(responseBody.errors) && responseBody.errors.length > 0) {
                        // GraphQL returned errors even though HTTP status is 200
                        const errorMessages = responseBody.errors.map(e => e.message || JSON.stringify(e));
                        const errorMessage = errorMessages.join('; ');
                        return {
                          valid: false,
                          query: fixedQuery,
                          errors: errorMessages,
                          errorMessage: errorMessage,
                          wasFixed: true
                        };
                      }
                    } catch {
                      // If we can't parse JSON, assume it's valid
                    }

                    return { valid: true, query: fixedQuery, errors: [], errorMessage: null, wasFixed: true };
                  } else {
                    // Fixed query still fails execution
                    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                    try {
                      const errorBody = await response.clone().text();
                      if (errorBody) {
                        try {
                          const errorJson = JSON.parse(errorBody);
                          // Handle standard GraphQL error format
                          if (Array.isArray(errorJson.errors) && errorJson.errors.length > 0) {
                            const errorMessages = errorJson.errors.map(e => e.message || JSON.stringify(e));
                            errorMessage = errorMessages.join('; ');
                            return {
                              valid: false,
                              query: fixedQuery,
                              errors: errorMessages,
                              errorMessage: errorMessage,
                              wasFixed: true
                            };
                          } else if (errorJson.message) {
                            errorMessage = errorJson.message;
                          } else if (errorJson.error) {
                            errorMessage = errorJson.error;
                          } else {
                            errorMessage = errorBody.substring(0, 200);
                          }
                        } catch {
                          errorMessage = errorBody.substring(0, 200);
                        }
                      }
                    } catch { }

                    return {
                      valid: false,
                      query: fixedQuery,
                      errors: [errorMessage],
                      errorMessage: errorMessage,
                      wasFixed: true
                    };
                  }
                }
              } catch (execError) {
                return {
                  valid: false,
                  query: fixedQuery,
                  errors: [execError.message || 'Failed to execute fixed query'],
                  errorMessage: execError.message || 'Failed to execute fixed query',
                  wasFixed: true
                };
              }
            } catch (fixedParseError) {
              // Fixed query still has parse errors - can't fix
              return {
                valid: false,
                query: '',
                errors: [parseError.message],
                errorMessage: `Query has syntax errors and could not be fixed: ${parseError.message}`
              };
            }
          } catch (fixError) {
            console.error(`Error attempting to fix ${queryName} query:`, fixError);
            return {
              valid: false,
              query: '',
              errors: [parseError.message, fixError.message],
              errorMessage: `Could not fix query: ${parseError.message}`
            };
          }
        }

        // If we can't fix it, return the error
        return {
          valid: false,
          query: '',
          errors: [parseError.message],
          errorMessage: `Query has syntax errors: ${parseError.message}`
        };
      }
    };

    const selectedQuery = buildSelectedQuery();

    // Build month index query by stripping unwanted selections from original query
    const buildMonthIndexQuery = () => {
      // Only build query if clientSave is enabled and monthIndexKeys exists
      if (!clientSave || !monthIndexKeys || !queryString) return '';

      // Use the simpler approach: strip unwanted selections from the original query
      return stripUnwantedSelections(queryString, monthIndexKeys);
    };

    const monthIndexQuery = (clientSave && month && monthIndexKeys) ? buildMonthIndexQuery() : '';

    // Clear previous errors and validation state
    setIndexQueryError(null);
    setMonthIndexQueryError(null);
    setIsValidating(true);
    setValidationResults({ index: null, monthIndex: null });

    let selectedPath = '';
    if (clientSave && selectedKeys) {
      selectedPath = formatFieldName(selectedKeys);
      if (!selectedPath && selectedKeys) {
        selectedPath = selectedKeys;
      }
    }

    let monthIndexPath = '';
    if (monthIndexKeys) {
      monthIndexPath = formatFieldName(monthIndexKeys);
      if (!monthIndexPath && monthIndexKeys) {
        monthIndexPath = monthIndexKeys;
      }
    }

    const urlKey = selectedEndpoint?.name || '';

    // Start validation asynchronously after dialog opens
    const performValidation = async () => {
      try {
        let indexValidation, monthIndexValidation;

        // Validate index query if it exists
        if (selectedQuery) {
          indexValidation = await validateAndRectifyQuery(
            selectedQuery,
            'Index',
            queryString,
            selectedKeys
          );

          if (!indexValidation.valid) {
            const errorMsg = indexValidation.errorMessage || (indexValidation.errors && indexValidation.errors.length > 0 ? indexValidation.errors.join('; ') : 'Validation failed');
            console.error('Index query validation failed:', errorMsg, indexValidation);
            setIndexQueryError(errorMsg);
          } else {
            setIndexQueryError(null); // Clear error if valid
            if (indexValidation.wasFixed) {
              console.warn('Index query was automatically fixed');
            }
          }
        } else {
          indexValidation = { valid: true, query: '', errors: [], errorMessage: null };
          setIndexQueryError(null); // Clear error if no query needed
        }

        // Validate month index query if it exists
        if (monthIndexQuery) {
          monthIndexValidation = await validateAndRectifyQuery(
            monthIndexQuery,
            'Month Index',
            queryString,
            monthIndexKeys
          );

          if (!monthIndexValidation.valid) {
            const errorMsg = monthIndexValidation.errorMessage || (monthIndexValidation.errors && monthIndexValidation.errors.length > 0 ? monthIndexValidation.errors.join('; ') : 'Validation failed');
            console.error('Month index query validation failed:', errorMsg, monthIndexValidation);
            setMonthIndexQueryError(errorMsg);
          } else {
            setMonthIndexQueryError(null); // Clear error if valid
            if (monthIndexValidation.wasFixed) {
              console.warn('Month index query was automatically fixed');
            }
          }
        } else {
          monthIndexValidation = { valid: true, query: '', errors: [], errorMessage: null };
          setMonthIndexQueryError(null); // Clear error if no query needed
        }

        // Store validation results
        setValidationResults({ index: indexValidation, monthIndex: monthIndexValidation });

        // Show warnings if queries were fixed
        if (indexValidation.wasFixed || monthIndexValidation.wasFixed) {
          const warnings = [];
          if (indexValidation.wasFixed) {
            warnings.push('Index query was automatically fixed');
          }
          if (monthIndexValidation.wasFixed) {
            warnings.push('Month index query was automatically fixed');
          }

          if (warnings.length > 0) {
            console.warn('Query validation warnings:', warnings.join('; '));
          }
        }
      } catch (validationError) {
        console.error('Error during validation:', validationError);
        setValidationResults({
          index: { valid: false, errorMessage: 'Validation error occurred' },
          monthIndex: { valid: false, errorMessage: 'Validation error occurred' }
        });
      } finally {
        setIsValidating(false);
      }
    };

    // Start validation in background
    performValidation();

    // Create a reactive message component that updates with state
    const DialogMessage = () => {
      // Use state from parent component directly - force re-render on changes
      const [, forceUpdate] = React.useReducer(x => x + 1, 0);

      React.useEffect(() => {
        // Force re-render when validation state changes
        const interval = setInterval(() => {
          forceUpdate();
        }, 100);
        return () => clearInterval(interval);
      }, []);

      // Read current state values from ref (always up-to-date)
      const currentValidating = validationStateRef.current.isValidating;
      const currentResults = validationStateRef.current.validationResults;
      const currentIndexError = validationStateRef.current.indexQueryError;
      const currentMonthIndexError = validationStateRef.current.monthIndexQueryError;

      return (
        <div className="space-y-3">
          {currentValidating && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-2">
              <div className="flex items-center gap-2">
                <i className="pi pi-spin pi-spinner text-blue-600"></i>
                <p className="text-sm text-blue-800">Validating queries...</p>
              </div>
            </div>
          )}
          {!currentValidating && (currentResults.index || currentResults.monthIndex) &&
            ((currentResults.index && currentResults.index.valid === false) ||
              (currentResults.monthIndex && currentResults.monthIndex.valid === false)) && (
              <div className="bg-red-50 border border-red-200 rounded p-3 mb-2">
                <p className="text-sm font-semibold text-red-800 mb-1">Validation Failed</p>
                <p className="text-xs text-red-700">
                  Please fix the errors below before saving.
                </p>
              </div>
            )}
          <div>
            <p className="font-semibold text-sm mb-1">Query Name:</p>
            <p className="text-sm text-gray-700 font-mono">{operationName}</p>
          </div>
          <div>
            <p className="font-semibold text-sm mb-1">URL Key:</p>
            <p className="text-sm text-gray-700 font-mono">{urlKey || 'Not selected'}</p>
          </div>
          <div>
            <p className="font-semibold text-sm mb-1">Type:</p>
            <p className="text-sm text-gray-700">{clientSave ? 'Client' : 'Live'}</p>
          </div>
          <div>
            <p className="font-semibold text-sm mb-1">Variables:</p>
            <div style={{
              padding: '0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              backgroundColor: '#f9fafb',
              maxHeight: '200px',
              overflow: 'auto'
            }}>
              {(() => {
                try {
                  if (!variablesString || !variablesString.trim()) {
                    return <p className="text-sm text-gray-500 font-mono">No variables</p>;
                  }
                  // Try to parse and format the variables
                  let parsedVariables = {};
                  try {
                    parsedVariables = parseJsonc(variablesString);
                  } catch (e) {
                    try {
                      const stripped = stripComments(variablesString);
                      parsedVariables = JSON.parse(stripped);
                    } catch {
                      return <p className="text-sm text-red-600 font-mono">Invalid JSON</p>;
                    }
                  }
                  const formattedJson = JSON.stringify(parsedVariables, null, 2);
                  return (
                    <pre className="text-xs text-gray-700 font-mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {formattedJson}
                    </pre>
                  );
                } catch (error) {
                  return <p className="text-sm text-red-600 font-mono">Error parsing variables</p>;
                }
              })()}
            </div>
          </div>
          {clientSave && (
            <div>
              <p className="font-semibold text-sm mb-1">Index Field:</p>
              <div style={{
                padding: '0.75rem',
                borderRadius: '0.375rem',
                border: currentIndexError ? '2px solid #dc2626' : '1px solid #d1d5db',
                backgroundColor: currentIndexError ? '#fef2f2' : '#f9fafb'
              }}>
                <p className="text-sm text-gray-700 font-mono">{selectedPath || 'Not selected'}</p>
                {currentIndexError && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: '#fee2e2',
                    border: '1px solid #dc2626',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    color: '#dc2626'
                  }}>
                    <strong>Error:</strong> {currentIndexError}
                  </div>
                )}
              </div>
            </div>
          )}
          {month && (
            <>
              <div>
                <p className="font-semibold text-sm mb-1">Month:</p>
                <p className="text-sm text-gray-700 font-mono">{month ? month.toLocaleDateString('en-US', { month: '2-digit', year: 'numeric' }) : 'Not selected'}</p>
              </div>
              {clientSave && (
                <div>
                  <p className="font-semibold text-sm mb-1">Month Index Field:</p>
                  <div style={{
                    padding: '0.75rem',
                    borderRadius: '0.375rem',
                    border: currentMonthIndexError ? '2px solid #dc2626' : '1px solid #d1d5db',
                    backgroundColor: currentMonthIndexError ? '#fef2f2' : '#f9fafb'
                  }}>
                    <p className="text-sm text-gray-700 font-mono">{monthIndexPath || 'Not selected'}</p>
                    {currentMonthIndexError && (
                      <div style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem',
                        backgroundColor: '#fee2e2',
                        border: '1px solid #dc2626',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        color: '#dc2626'
                      }}>
                        <strong>Error:</strong> {currentMonthIndexError}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      );
    };

    // Compute if save should be enabled - read from ref to get latest state
    const getCanSave = () => {
      const currentState = validationStateRef.current;
      if (currentState.isValidating) return false;
      if (currentState.validationResults.index === null && currentState.validationResults.monthIndex === null) return false; // Validation not started

      // If query exists, it must be valid. If it doesn't exist, it's valid (not required)
      const indexValid = !selectedQuery || (currentState.validationResults.index && currentState.validationResults.index.valid !== false);
      const monthIndexValid = !monthIndexQuery || (currentState.validationResults.monthIndex && currentState.validationResults.monthIndex.valid !== false);

      return indexValid && monthIndexValid;
    };

    // Create a wrapper component that updates button state reactively
    const DialogWrapper = () => {
      const [, forceUpdate] = React.useReducer(x => x + 1, 0);

      React.useEffect(() => {
        const interval = setInterval(() => {
          forceUpdate();
        }, 100);
        return () => clearInterval(interval);
      }, []);

      const currentState = validationStateRef.current;
      const canSave = (() => {
        if (currentState.isValidating) return false;
        if (currentState.validationResults.index === null && currentState.validationResults.monthIndex === null) return false;
        const indexValid = !selectedQuery || (currentState.validationResults.index && currentState.validationResults.index.valid !== false);
        const monthIndexValid = !monthIndexQuery || (currentState.validationResults.monthIndex && currentState.validationResults.monthIndex.valid !== false);
        return indexValid && monthIndexValid;
      })();

      // Update the dialog button state by manipulating DOM directly
      React.useEffect(() => {
        const acceptButton = document.querySelector('.p-confirm-dialog-accept');
        if (acceptButton) {
          if (currentState.isValidating) {
            acceptButton.textContent = 'Validating...';
            acceptButton.disabled = true;
            acceptButton.classList.add('p-disabled');
          } else if (canSave) {
            acceptButton.textContent = 'Save';
            acceptButton.disabled = false;
            acceptButton.classList.remove('p-disabled');
          } else {
            acceptButton.textContent = 'Save (Disabled)';
            acceptButton.disabled = true;
            acceptButton.classList.add('p-disabled');
          }
        }
      }, [canSave, currentState.isValidating]);

      return <DialogMessage />;
    };

    confirmDialog({
      message: <DialogWrapper />,
      header: 'Confirm Save Query',
      acceptLabel: validationStateRef.current.isValidating ? 'Validating...' : (getCanSave() ? 'Save' : 'Save (Disabled)'),
      rejectLabel: 'Cancel',
      acceptClassName: getCanSave() && !validationStateRef.current.isValidating ? 'p-confirm-dialog-save' : 'p-confirm-dialog-save p-disabled',
      rejectClassName: 'p-confirm-dialog-reject',
      accept: async () => {
        // Read latest state from ref
        const currentState = validationStateRef.current;

        // Prevent saving if validation is still running
        if (currentState.isValidating) {
          return;
        }

        // Check validation results - need to check both index and monthIndex
        // If query exists, it must be valid. If it doesn't exist, it's valid (not required)
        const indexValid = !selectedQuery || (currentState.validationResults.index && currentState.validationResults.index.valid !== false);
        const monthIndexValid = !monthIndexQuery || (currentState.validationResults.monthIndex && currentState.validationResults.monthIndex.valid !== false);

        // Variables to hold validation results (either from state or re-validation)
        let finalIndexValidation = currentState.validationResults.index;
        let finalMonthIndexValidation = currentState.validationResults.monthIndex;

        if (!indexValid || !monthIndexValid) {
          // Re-run validation in case user fixed the query
          setIsValidating(true);
          setIndexQueryError(null);
          setMonthIndexQueryError(null);

          try {
            let indexValidation, monthIndexValidation;

            // Re-validate index query if it exists
            if (selectedQuery) {
              indexValidation = await validateAndRectifyQuery(
                selectedQuery,
                'Index',
                queryString,
                selectedKeys
              );

              if (!indexValidation.valid) {
                const errorMsg = indexValidation.errorMessage || indexValidation.errors.join('; ');
                setIndexQueryError(errorMsg);
              } else {
                setIndexQueryError(null);
              }
            } else {
              indexValidation = { valid: true, query: '', errors: [], errorMessage: null };
              setIndexQueryError(null);
            }

            // Re-validate month index query if it exists
            if (monthIndexQuery) {
              monthIndexValidation = await validateAndRectifyQuery(
                monthIndexQuery,
                'Month Index',
                queryString,
                monthIndexKeys
              );

              if (!monthIndexValidation.valid) {
                const errorMsg = monthIndexValidation.errorMessage || monthIndexValidation.errors.join('; ');
                setMonthIndexQueryError(errorMsg);
              } else {
                setMonthIndexQueryError(null);
              }
            } else {
              monthIndexValidation = { valid: true, query: '', errors: [], errorMessage: null };
              setMonthIndexQueryError(null);
            }

            setValidationResults({ index: indexValidation, monthIndex: monthIndexValidation });

            // Store re-validation results for use in save
            finalIndexValidation = indexValidation;
            finalMonthIndexValidation = monthIndexValidation;

            // Check again after re-validation
            const newIndexValid = !selectedQuery || (indexValidation && indexValidation.valid !== false);
            const newMonthIndexValid = !monthIndexQuery || (monthIndexValidation && monthIndexValidation.valid !== false);

            if (!newIndexValid || !newMonthIndexValid) {
              // Still invalid, don't save
              setIsValidating(false);
              return;
            }
          } catch (revalidationError) {
            console.error('Error during re-validation:', revalidationError);
            setIsValidating(false);
            return;
          } finally {
            setIsValidating(false);
          }

          // If we get here, validation passed on re-run, continue with save
        }

        try {
          const queryToSave = queryString;

          // Ensure variables are saved as valid JSON string
          // Use jsonc-parser (same as GraphiQL) to handle JSON with comments and lenient syntax
          let validVariablesString = '';
          if (variablesString && variablesString.trim()) {
            try {
              // Use jsonc-parser to parse (handles comments, trailing commas, etc. like GraphiQL)
              const parsedVariables = parseJsonc(variablesString);
              // Re-stringify as clean JSON (no comments, proper formatting)
              validVariablesString = JSON.stringify(parsedVariables);
            } catch (parseError) {
              // If jsonc-parser fails, try to strip comments and parse again
              try {
                const stripped = stripComments(variablesString);
                const parsedVariables = JSON.parse(stripped);
                validVariablesString = JSON.stringify(parsedVariables);
              } catch (fallbackError) {
                // If both fail, use empty string (GraphiQL would use empty object)
                console.warn('Could not parse variables, saving as empty string:', fallbackError.message);
                validVariablesString = '';
              }
            }
          }

          // Use validated and rectified queries
          // If query exists, use validated version. If it doesn't exist, use empty string
          // Use finalIndexValidation and finalMonthIndexValidation which contain either state values or re-validation results
          const validatedIndexQuery = selectedQuery
            ? (finalIndexValidation?.valid ? finalIndexValidation.query : '')
            : '';
          const validatedMonthIndexQuery = monthIndexQuery
            ? (finalMonthIndexValidation?.valid ? finalMonthIndexValidation.query : '')
            : '';

          // Show user-friendly message if queries had to be fixed
          if (finalIndexValidation?.wasFixed || finalMonthIndexValidation?.wasFixed) {
            const fixedMessages = [];
            if (finalIndexValidation?.wasFixed) {
              fixedMessages.push('Index query was automatically fixed');
            }
            if (finalMonthIndexValidation?.wasFixed) {
              fixedMessages.push('Month index query was automatically fixed');
            }

            console.log('Queries fixed before saving:', fixedMessages.join(', '));
          }

          // Load existing document to compare values for timestamp tracking
          let existingData = null;
          try {
            existingData = await firestoreService.loadQuery(operationName);
          } catch (loadError) {
            // If document doesn't exist, that's fine - we'll create new timestamps
            console.log('No existing document found, creating new one');
          }

          // Compare values to determine what changed
          const bodyChanged = !existingData || (existingData.body || '') !== (queryToSave || '');
          const variablesChanged = !existingData || (existingData.variables || '') !== validVariablesString;
          const currentTransformerCode = transformerCode && transformerCode.trim() ? transformerCode : '';
          const existingTransformerCode = existingData?.transformerCode || '';
          const transformerCodeChanged = !existingData || existingTransformerCode !== currentTransformerCode;

          // Get current timestamp
          const now = Timestamp.now();

          // Get appropriate user identifier based on auth method
          const getUserIdentifier = (authUser) => {
            if (!authUser) return null;

            // Check provider data to determine auth method
            const providerData = authUser.providerData || [];

            // Check if Microsoft/OAuth provider
            const oauthProvider = providerData.find(provider =>
              provider.providerId === 'microsoft.com' ||
              provider.providerId.includes('microsoft')
            );
            if (oauthProvider && authUser.email) {
              return authUser.email; // Microsoft email
            }

            // Check if phone provider
            const phoneProvider = providerData.find(provider =>
              provider.providerId === 'phone'
            );
            if (phoneProvider && authUser.phoneNumber) {
              return authUser.phoneNumber; // Phone number
            }

            // Email/Password auth - use email
            if (authUser.email) {
              return authUser.email;
            }

            // Fallback to UID if nothing else is available
            return authUser.uid;
          };

          const lastUpdatedBy = getUserIdentifier(user);

          const saveData = {
            body: queryToSave || '',
            urlKey: urlKey || '',
            clientSave: clientSave,
            index: validatedIndexQuery,
            variables: validVariablesString,
            month: month !== null,
            ...(month && {
              monthDate: month.toISOString(),
              monthIndex: validatedMonthIndexQuery,
            }),
            ...(transformerCode && transformerCode.trim() && {
              transformerCode: transformerCode,
            }),
            // Timestamp tracking - only update if field changed, otherwise preserve existing timestamp
            bodyUpdatedAt: bodyChanged ? now : (existingData?.bodyUpdatedAt || null),
            variablesUpdatedAt: variablesChanged ? now : (existingData?.variablesUpdatedAt || null),
            transformerCodeUpdatedAt: transformerCodeChanged ? now : (existingData?.transformerCodeUpdatedAt || null),
            lastUpdatedBy: lastUpdatedBy,
          };
          await firestoreService.saveQuery(operationName, saveData);
        } catch (error) {
          console.error('Error saving query:', error);
          confirmDialog({
            message: 'Failed to save query. Please try again.',
            header: 'Error',
            acceptLabel: 'OK',
            accept: () => { },
          });
        }
      },
    });
  }, [clientSave, selectedKeys, month, monthIndexKeys, treeNodes, queryEditor, variableEditor, formatFieldName, transformerCode, activeTabIndex, setTabData, queryString, variablesString, selectedEndpoint, user]);

  // Expose handleSave via ref
  useImperativeHandle(ref, () => ({
    handleSave,
  }));

  return (
    <div className="graphiql-save-controls">
      {/* Live/Client Toggle */}
      <div className="graphiql-save-toggle">
        <span className={`graphiql-save-toggle-label ${!clientSave ? 'text-yellow-700 font-semibold' : 'text-gray-600'}`}>
          Live
        </span>
        <div
          className={`graphiql-save-toggle-switch ${clientSave ? 'client' : 'live'}`}
          onClick={() => setClientSave(!clientSave)}
        >
          <div className="graphiql-save-toggle-switch-handle"></div>
        </div>
        <span className={`graphiql-save-toggle-label ${clientSave ? 'text-green-700 font-semibold' : 'text-gray-600'}`}>
          Client
        </span>
      </div>

      {/* Index Field Selector - Only show when clientSave is enabled */}
      {clientSave && (
        <div className={`graphiql-index-selector ${selectedKeys ? 'has-selection' : ''}`}>
          <Button
            type="button"
            onClick={(e) => {
              if (treeNodes.length > 0 && indexFieldOp.current) {
                indexFieldOp.current.toggle(e);
              }
            }}
            disabled={treeNodes.length === 0}
            className="p-button-sm p-button-outlined"
            title={selectedKeys && formatFieldName ? String(formatFieldName(selectedKeys)) : 'Select index field'}
            style={{
              width: '100%',
              justifyContent: 'space-between',
              textAlign: 'left',
              padding: '0.5rem 0.75rem'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
              <i className="pi pi-sitemap" style={{ fontSize: '0.875rem', color: '#6b7280', flexShrink: 0 }}></i>
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: selectedKeys ? '#374151' : '#9ca3af',
                fontWeight: selectedKeys ? '500' : '400'
              }}>
                {selectedKeys ? (formatFieldName ? formatFieldName(selectedKeys) : String(selectedKeys)) : 'Select index field'}
              </span>
            </span>
            <i className="pi pi-chevron-down" style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem', flexShrink: 0 }}></i>
          </Button>
          <OverlayPanel
            ref={indexFieldOp}
            dismissable
            className="graphiql-index-overlay"
            style={{ width: '420px' }}
          >
            {treeNodes.length > 0 ? (
              <Tree
                value={treeNodes}
                selectionMode="single"
                selectionKeys={selectedKeys}
                onSelectionChange={handleNodeSelect}
                expandedKeys={expandedKeys}
                onToggle={handleToggle}
                filter
                filterMode="lenient"
                filterBy="data.labelText,data.name"
                filterPlaceholder="Search fields..."
                className="w-full"
              />
            ) : (
              <div className="px-4 py-6 text-sm text-gray-500 text-center bg-gray-50 rounded-lg">
                <i className="pi pi-info-circle text-gray-400 mb-2" style={{ fontSize: '1.25rem' }}></i>
                <p className="font-medium text-gray-600 mb-1">No query fields available</p>
                <p className="text-xs text-gray-500">
                  Please write a GraphQL query in the editor.
                </p>
              </div>
            )}
          </OverlayPanel>
        </div>
      )}

      {/* Month Picker */}
      <div className="graphiql-month-picker">
        <Calendar
          value={month}
          onChange={(e) => setMonth(e.value)}
          view="month"
          dateFormat="mm/yy"
          placeholder="Select month"
          showIcon
          iconPos="left"
          className="w-full"
          inputStyle={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            paddingRight: month ? '2.5rem' : '0.75rem',
            fontSize: '0.875rem'
          }}
        />
        {month && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMonth(null);
            }}
            style={{
              position: 'absolute',
              right: '0.5rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280',
              borderRadius: '4px',
              transition: 'all 0.2s ease',
              zIndex: 10
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#fee2e2';
              e.currentTarget.style.color = '#dc2626';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#6b7280';
            }}
            title="Clear month"
          >
            <i className="pi pi-times" style={{ fontSize: '0.875rem' }}></i>
          </button>
        )}
      </div>

      {/* Month Index Field Selector - Only show when clientSave is enabled and month is selected */}
      {clientSave && month && (
        <div className={`graphiql-index-selector ${monthIndexKeys ? 'has-selection' : ''}`}>
          <Button
            type="button"
            onClick={(e) => {
              if (monthIndexTreeNodes.length > 0 && monthIndexFieldOp.current) {
                monthIndexFieldOp.current.toggle(e);
              }
            }}
            disabled={!selectedKeys || monthIndexTreeNodes.length === 0}
            className="p-button-sm p-button-outlined"
            title={monthIndexKeys && formatFieldName ? String(formatFieldName(monthIndexKeys)) : 'Select month index field'}
            style={{
              width: '100%',
              justifyContent: 'space-between',
              textAlign: 'left',
              padding: '0.5rem 0.75rem'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
              <i className="pi pi-sitemap" style={{ fontSize: '0.875rem', color: '#6b7280', flexShrink: 0 }}></i>
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: monthIndexKeys ? '#374151' : '#9ca3af',
                fontWeight: monthIndexKeys ? '500' : '400'
              }}>
                {(() => {
                  // Safeguard: if monthIndexKeys is a function (from previous bug), reset it
                  if (typeof monthIndexKeys === 'function') {
                    setMonthIndexKeys(null);
                    return 'Select month index field';
                  }
                  return monthIndexKeys ? (formatFieldName ? formatFieldName(monthIndexKeys) : String(monthIndexKeys)) : 'Select month index field';
                })()}
              </span>
            </span>
            <i className="pi pi-chevron-down" style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem', flexShrink: 0 }}></i>
          </Button>
          <OverlayPanel
            ref={monthIndexFieldOp}
            dismissable
            className="graphiql-index-overlay"
            style={{ width: '420px' }}
          >
            {monthIndexTreeNodes.length > 0 ? (
              <Tree
                value={monthIndexTreeNodes}
                selectionMode="single"
                selectionKeys={monthIndexKeys}
                onSelectionChange={handleMonthIndexNodeSelect}
                expandedKeys={monthIndexExpandedKeys}
                onToggle={handleMonthIndexToggle}
                filter
                filterMode="lenient"
                filterBy="data.labelText,data.name"
                filterPlaceholder="Search fields..."
                className="w-full"
              />
            ) : (
              <div className="px-4 py-6 text-sm text-gray-500 text-center bg-gray-50 rounded-lg">
                <i className="pi pi-info-circle text-gray-400 mb-2" style={{ fontSize: '1.25rem' }}></i>
                <p className="font-medium text-gray-600 mb-1">No month index fields available</p>
                <p className="text-xs text-gray-500">
                  Please select an index field first.
                </p>
              </div>
            )}
          </OverlayPanel>
        </div>
      )}

      {/* Save Button */}
      <Button
        type="button"
        onClick={handleSave}
        icon="pi pi-save"
        label="Save"
        className="p-button-sm"
        style={{
          whiteSpace: 'nowrap'
        }}
      />
    </div>
  );
});

SaveControls.displayName = 'SaveControls';

