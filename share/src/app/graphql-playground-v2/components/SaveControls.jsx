'use client';

import { getEndpointConfigFromUrlKey, getInitialEndpoint } from '@/app/graphql-playground/constants';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { buildTreeFromProcessedData } from '@/app/graphql-playground/utils/data-tree-builder';
import { extractOperationName, parseQueryToTreeNodes } from '@/app/graphql-playground/utils/graphql-parser';
import { findNodeByKey, findNodeKeyFromIndexQuery } from '@/app/graphql-playground/utils/query-matcher';
import { fetchGraphQLRequest } from '@/app/graphql-playground/utils/query-pipeline';
import { useAuth } from '@/contexts/AuthContext';
import { Timestamp } from 'firebase/firestore';
import { parse, print } from 'graphql';
import { parse as parseJsonc, stripComments } from 'jsonc-parser';
import { Button } from 'primereact/button';
import { Calendar } from 'primereact/calendar';
import { confirmDialog } from 'primereact/confirmdialog';
import { OverlayPanel } from 'primereact/overlaypanel';
import { Tree } from 'primereact/tree';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePlaygroundStore } from '../stores/usePlaygroundStore';
import { useSavedQueriesStore } from '../stores/useSavedQueriesStore';
import { buildSchemaTreeNodes, extractRootFieldsFromQuery, fetchGraphQLSchema } from '../utils/schema-fetcher';

export function SaveControls() {
  // Get state from v2 store
  const {
    query,
    variables,
    response,
    transformerFunction: transformerCode,
    selectedEnvironment,
    rawTableData,
    transformedTableData,
    schema,
    schemaLoading,
    setSchema,
    setSchemaLoading,
    setVariables,
    markDirty,
    clearDirty
  } = usePlaygroundStore();

  // Local state for SaveControls-specific fields
  const [clientSave, setClientSave] = React.useState(false);
  const [selectedKeys, setSelectedKeys] = React.useState(null);
  const [expandedKeys, setExpandedKeys] = React.useState({});
  const [month, setMonth] = React.useState(null);
  const [monthIndexKeys, setMonthIndexKeys] = React.useState(null);
  const [monthIndexExpandedKeys, setMonthIndexExpandedKeys] = React.useState({});
  const [searchFields, setSearchFields] = React.useState({});
  const [sortFields, setSortFields] = React.useState({});
  const [searchFieldsExpandedKeys, setSearchFieldsExpandedKeys] = React.useState({});
  const [sortFieldsExpandedKeys, setSortFieldsExpandedKeys] = React.useState({});
  const [treeNodes, setTreeNodes] = React.useState([]);
  const [processedData, setProcessedData] = React.useState(null);
  const [enableWrite, setEnableWrite] = React.useState(false);
  const [writeSchemaSelectionKeys, setWriteSchemaSelectionKeys] = React.useState({});
  const [writeSchemaTreeNodes, setWriteSchemaTreeNodes] = React.useState([]);
  const [writeSchemaExpandedKeys, setWriteSchemaExpandedKeys] = React.useState({});
  const loadSavedQueries = useSavedQueriesStore((state) => state.loadQueries);

  const { user } = useAuth();
  const indexFieldOp = useRef(null);
  const monthIndexFieldOp = useRef(null);
  const searchFieldsTreeOp = useRef(null);
  const sortFieldsTreeOp = useRef(null);
  const writeSchemaOp = useRef(null);
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

  const hydrationRef = React.useRef(true);
  
  // Ref to store saved writeSchema for delayed restoration when schema is ready
  const savedWriteSchemaRef = React.useRef(null);

  // Extract root field names from query (only when enableWrite is on)
  const rootFieldNames = useMemo(() => {
    if (!enableWrite || !query) {
      return [];
    }
    return extractRootFieldsFromQuery(query);
  }, [enableWrite, query]);

  // Build schema tree nodes from GraphQL schema, only for root fields in the query
  // Only build when enableWrite is true
  const schemaTreeNodes = useMemo(() => {
    if (!enableWrite) {
      return [];
    }
    
    if (schemaLoading) {
      return [];
    }
    
    if (!schema) {
      return [];
    }
    
    if (!rootFieldNames || rootFieldNames.length === 0) {
      return [];
    }
    
    return buildSchemaTreeNodes(schema, rootFieldNames);
  }, [enableWrite, schema, schemaLoading, selectedEnvironment, rootFieldNames]);

  // Update writeSchemaTreeNodes when schema tree nodes change
  useEffect(() => {
    setWriteSchemaTreeNodes(schemaTreeNodes);
  }, [schemaTreeNodes]);

  // Fetch schema when Controls tab is opened if schema is null
  useEffect(() => {
    if (!selectedEnvironment || schema || schemaLoading) {
      return;
    }

    const loadSchema = async () => {
      setSchemaLoading(true);
      try {
        const fetchedSchema = await fetchGraphQLSchema(selectedEnvironment);
        setSchema(fetchedSchema);
      } catch (err) {
        console.error('Failed to fetch schema in SaveControls:', err);
        setSchema(null);
      } finally {
        setSchemaLoading(false);
      }
    };

    loadSchema();
  }, [selectedEnvironment, schema, schemaLoading, setSchema, setSchemaLoading]);

  // Keep ref updated with current state
  React.useEffect(() => {
    validationStateRef.current = {
      isValidating,
      validationResults,
      indexQueryError,
      monthIndexQueryError
    };
  }, [isValidating, validationResults, indexQueryError, monthIndexQueryError]);

  React.useEffect(() => {
    if (hydrationRef.current) {
      return;
    }
    markDirty();
  }, [clientSave, selectedKeys, month, monthIndexKeys, searchFields, sortFields, enableWrite, writeSchemaSelectionKeys, markDirty]);

  // Parse query to build treeNodes
  useEffect(() => {
    if (query) {
      const nodes = parseQueryToTreeNodes(query);
      setTreeNodes(nodes);
    } else {
      setTreeNodes([]);
    }
  }, [query]);

  // Mirror table viewer data instead of re-running transformer
  useEffect(() => {
    if (transformedTableData) {
      setProcessedData(transformedTableData);
      return;
    }

    if (rawTableData) {
      setProcessedData(rawTableData);
      return;
    }

    setProcessedData(null);
  }, [transformedTableData, rawTableData]);

  // Load existing document data when query changes
  useEffect(() => {
    let canceled = false;

    const scheduleHydrationComplete = () => {
      setTimeout(() => {
        hydrationRef.current = false;
      }, 0);
    };

    const loadQueryData = async () => {
      hydrationRef.current = true;

      if (!query) {
        if (!canceled) {
          setClientSave(false);
          setSelectedKeys(null);
          setExpandedKeys({});
          setMonth(null);
          setMonthIndexKeys(null);
          setMonthIndexExpandedKeys({});
          setEnableWrite(false);
          setWriteSchemaSelectionKeys({});
          setWriteSchemaExpandedKeys({});
          setSearchFields({});
          setSortFields({});
          setSearchFieldsExpandedKeys({});
          setSortFieldsExpandedKeys({});
        }
        scheduleHydrationComplete();
        return;
      }

      const operationName = extractOperationName(query);
      if (!operationName) {
        scheduleHydrationComplete();
        return;
      }

      try {
        const existingData = await firestoreService.loadQuery(operationName);
        if (existingData && !canceled) {
          const nodesForMatching = query ? parseQueryToTreeNodes(query) : [];

          const buildExpandedKeys = (path) => {
            if (!path) return {};
            const parts = path.split('.');
            const expanded = {};
            for (let i = 1; i < parts.length; i++) {
              const keyToExpand = parts.slice(0, i).join('.');
              expanded[keyToExpand] = true;
            }
            return expanded;
          };

          setClientSave(existingData.clientSave || false);

          if (existingData.index && existingData.index.trim()) {
            const matchingKey = findNodeKeyFromIndexQuery(existingData.index, nodesForMatching);
            if (matchingKey) {
              setSelectedKeys(matchingKey);
              setExpandedKeys(buildExpandedKeys(matchingKey));
            } else {
              setSelectedKeys(existingData.index);
              setExpandedKeys({});
            }
          } else {
            setSelectedKeys(null);
            setExpandedKeys({});
          }

          setMonth(existingData.month && existingData.monthDate ? new Date(existingData.monthDate) : null);

          if (existingData.monthIndex && existingData.monthIndex.trim()) {
            const matchingMonthIndexKey = findNodeKeyFromIndexQuery(existingData.monthIndex, nodesForMatching);
            if (matchingMonthIndexKey) {
              setMonthIndexKeys(matchingMonthIndexKey);
              setMonthIndexExpandedKeys(buildExpandedKeys(matchingMonthIndexKey));
            } else {
              setMonthIndexKeys(existingData.monthIndex);
              setMonthIndexExpandedKeys({});
            }
          } else {
            setMonthIndexKeys(null);
            setMonthIndexExpandedKeys({});
          }
          const storedEnableWrite = !!existingData.enableWrite;
          setEnableWrite(storedEnableWrite);
          if (storedEnableWrite && existingData.writeSchema) {
            // Store writeSchema in ref for delayed restoration when schema is ready
            const savedSchema = existingData.writeSchema;
            savedWriteSchemaRef.current = savedSchema;
            // Restoration will happen via useEffect when schema and tree nodes are ready
          } else {
            savedWriteSchemaRef.current = null;
          }
          
          setSearchFields(existingData.searchFields || {});
          setSortFields(existingData.sortFields || {});
        }
        if (!existingData && !canceled) {
          setClientSave(false);
          setSelectedKeys(null);
          setExpandedKeys({});
          setMonth(null);
          setMonthIndexKeys(null);
          setMonthIndexExpandedKeys({});
          setEnableWrite(false);
          setWriteSchemaSelectionKeys({});
          setWriteSchemaExpandedKeys({});
          setSearchFields({});
          setSortFields({});
          setSearchFieldsExpandedKeys({});
          setSortFieldsExpandedKeys({});
        }
      } catch (error) {
        if (!canceled) {
          console.log('No existing query data found');
          setClientSave(false);
          setSelectedKeys(null);
          setExpandedKeys({});
          setMonth(null);
          setMonthIndexKeys(null);
          setMonthIndexExpandedKeys({});
          setEnableWrite(false);
          setWriteSchemaSelectionKeys({});
          setWriteSchemaExpandedKeys({});
          setSearchFields({});
          setSortFields({});
          setSearchFieldsExpandedKeys({});
          setSortFieldsExpandedKeys({});
        }
      } finally {
        scheduleHydrationComplete();
      }
    };

    loadQueryData();

    return () => {
      canceled = true;
    };
  }, [query]);

  // Clear monthIndexKeys when month is cleared
  useEffect(() => {
    if (!month) {
      setMonthIndexKeys(null);
      setMonthIndexExpandedKeys({});
    }
  }, [month]);

  // Cleanup: Reset monthIndexKeys if it's a function (from previous bug with function updater)
  useEffect(() => {
    if (typeof monthIndexKeys === 'function') {
      setMonthIndexKeys(null);
      setMonthIndexExpandedKeys({});
    }
  }, [monthIndexKeys]);

  // Update variables with startDate and endDate when month changes
  useEffect(() => {
    if (!month) return;

    // Compute startDate (first day of month) and endDate (last day of month)
    const year = month.getFullYear();
    const monthIndex = month.getMonth(); // 0-11

    // Start date: first day of the month
    const startDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;

    // End date: last day of the month
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const endDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Get current variables
    let currentVariables = {};
    try {
      if (variables && variables.trim()) {
        currentVariables = parseJsonc(variables);
      }
    } catch (e) {
      try {
        const stripped = stripComments(variables);
        currentVariables = JSON.parse(stripped);
      } catch {
        // Use empty object if parsing fails
      }
    }

    // Only update if dates actually changed
    if (currentVariables.startDate === startDate && currentVariables.endDate === endDate) {
      return;
    }

    // Update variables
    currentVariables.startDate = startDate;
    currentVariables.endDate = endDate;
    const updatedVariablesString = JSON.stringify(currentVariables, null, 2);
    setVariables(updatedVariablesString);
  }, [month, variables, setVariables]);

  // Clear monthIndexKeys when selectedKeys changes (parent may have changed)
  useEffect(() => {
    if (!selectedKeys) {
      // Clear monthIndexKeys if selectedKeys is cleared
      setMonthIndexKeys(null);
      setMonthIndexExpandedKeys({});
      return;
    }

    // Only validate if monthIndexKeys is already set
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
  }, [selectedKeys, monthIndexKeys]);

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

  const handleWriteToggle = () => {
    setEnableWrite((prev) => {
      const next = !prev;

      if (!next) {
        setWriteSchemaSelectionKeys({});
        setWriteSchemaExpandedKeys({});
        if (writeSchemaOp.current) {
          writeSchemaOp.current.hide();
        }
      }

      return next;
    });
  };

  // Helper function to flatten nested writeSchema structure to selection keys format
  const flattenWriteSchemaToSelectionKeys = useCallback((nestedSchema, prefix = '') => {
    const selectionKeys = {};
    const expandedKeys = {};
    
    const traverse = (obj, currentPath = '') => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return;
      }
      
      for (const key in obj) {
        const fullPath = currentPath ? `${currentPath}.${key}` : key;
        const value = obj[key];
        
        // Check if this is a leaf node (has type property)
        if (value && typeof value === 'object' && !Array.isArray(value) && value.type) {
          // This is a leaf node with type info - mark it and all parent paths as checked
          const parts = fullPath.split('.');
          
          // Mark all nodes in the path as checked
          for (let i = 0; i < parts.length; i++) {
            const pathToMark = parts.slice(0, i + 1).join('.');
            selectionKeys[pathToMark] = { checked: true };
            
            // Add expanded keys for all parent paths (except the root)
            if (i > 0) {
              expandedKeys[parts.slice(0, i).join('.')] = true;
            }
          }
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          // This is an intermediate node - continue traversing
          // First, mark this node as checked (we'll unmark it later if it doesn't lead to a leaf)
          const parts = fullPath.split('.');
          selectionKeys[fullPath] = { checked: true };
          
          // Add expanded keys for all parent paths
          for (let i = 1; i < parts.length; i++) {
            expandedKeys[parts.slice(0, i).join('.')] = true;
          }
          
          // Continue traversing to find leaf nodes
          traverse(value, fullPath);
        }
      }
    };
    
    traverse(nestedSchema, prefix);
    
    // Clean up: remove intermediate nodes that don't actually lead to leaf nodes
    // (This handles the case where we marked a node but it doesn't have type info)
    const cleanedSelectionKeys = {};
    for (const key in selectionKeys) {
      // Keep all keys - they're all part of valid paths to leaf nodes
      cleanedSelectionKeys[key] = selectionKeys[key];
    }
    
    return { selectionKeys: cleanedSelectionKeys, expandedKeys };
  }, []);

  // Function to restore writeSchema from ref when schema and tree nodes are ready
  const restoreWriteSchemaFromRef = useCallback(() => {
    if (!savedWriteSchemaRef.current || !schema || writeSchemaTreeNodes.length === 0) {
      return;
    }
    
    const savedSchema = savedWriteSchemaRef.current;
    
    if (savedSchema && typeof savedSchema === 'string' && savedSchema.trim()) {
      // Old string format
      setWriteSchemaSelectionKeys({ [savedSchema.trim()]: { checked: true } });
      setWriteSchemaExpandedKeys({ [savedSchema.trim()]: true });
    } else if (savedSchema && typeof savedSchema === 'object' && Object.keys(savedSchema).length > 0) {
      // Helper to recursively check if object has type info
      const hasTypeInfoRecursive = (obj) => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
          return false;
        }
        if (obj.type) {
          return true;
        }
        return Object.values(obj).some(v => hasTypeInfoRecursive(v));
      };
      
      const hasTypeInfo = hasTypeInfoRecursive(savedSchema);
      
      if (hasTypeInfo) {
        // New nested format with type info - flatten it to selection keys
        const { selectionKeys, expandedKeys } = flattenWriteSchemaToSelectionKeys(savedSchema);
        setWriteSchemaSelectionKeys(selectionKeys);
        setWriteSchemaExpandedKeys(expandedKeys);
      } else {
        // Old selectionKeys format
        setWriteSchemaSelectionKeys(savedSchema);
        const expanded = {};
        for (const key in savedSchema) {
          if (savedSchema[key]?.checked) {
            const parts = key.split('.');
            for (let i = 1; i < parts.length; i++) {
              expanded[parts.slice(0, i).join('.')] = true;
            }
          }
        }
        setWriteSchemaExpandedKeys(expanded);
      }
      
      // Clear the ref after restoration
      savedWriteSchemaRef.current = null;
    }
  }, [schema, writeSchemaTreeNodes, flattenWriteSchemaToSelectionKeys]);

  // Restore writeSchema when schema and tree nodes become ready
  useEffect(() => {
    if (enableWrite && savedWriteSchemaRef.current && schema && writeSchemaTreeNodes.length > 0) {
      restoreWriteSchemaFromRef();
    }
  }, [enableWrite, schema, writeSchemaTreeNodes, restoreWriteSchemaFromRef]);

  // Get root field keys (top-level nodes)
  const getRootFieldKeys = useCallback(() => {
    return writeSchemaTreeNodes.map(node => node.key);
  }, [writeSchemaTreeNodes]);

  // Check if a key is a root field
  const isRootField = useCallback((key) => {
    return getRootFieldKeys().includes(key);
  }, [getRootFieldKeys]);

  // Get the root field for a given key
  const getRootFieldForKey = useCallback((key) => {
    if (!key) return null;
    const rootKeys = getRootFieldKeys();
    for (const rootKey of rootKeys) {
      if (key === rootKey || key.startsWith(rootKey + '.')) {
        return rootKey;
      }
    }
    return null;
  }, [getRootFieldKeys]);

  // Handle write schema tree selection with restriction: only 1 root field selected
  const handleWriteSchemaSelect = useCallback((e) => {
    const newSelectionKeys = e.value;
    
    if (!newSelectionKeys || typeof newSelectionKeys !== 'object') {
      setWriteSchemaSelectionKeys({});
      return;
    }

    // Find which root fields are selected
    const selectedRootFields = [];
    for (const key in newSelectionKeys) {
      if (newSelectionKeys[key]?.checked && isRootField(key)) {
        selectedRootFields.push(key);
      }
    }

    // If more than one root field is selected, keep only the last one
    if (selectedRootFields.length > 1) {
      // Find the most recently selected root field (the one that was just checked)
      const lastSelectedRoot = selectedRootFields[selectedRootFields.length - 1];
      
      // Clear all selections from other root fields
      const filteredSelectionKeys = {};
      for (const key in newSelectionKeys) {
        const rootField = getRootFieldForKey(key);
        if (rootField === lastSelectedRoot) {
          filteredSelectionKeys[key] = newSelectionKeys[key];
        }
      }
      
      setWriteSchemaSelectionKeys(filteredSelectionKeys);
    } else {
      // Normal case: 0 or 1 root field selected
      setWriteSchemaSelectionKeys(newSelectionKeys);
    }
  }, [isRootField, getRootFieldForKey]);

  // Handle write schema tree expansion
  const handleWriteSchemaToggle = useCallback((e) => {
    setWriteSchemaExpandedKeys(e.value);
  }, []);

  const sanitizedMonthIndexKey = typeof monthIndexKeys === 'string' ? monthIndexKeys : null;
  const monthIndexLabel = sanitizedMonthIndexKey
    ? (formatFieldName ? formatFieldName(sanitizedMonthIndexKey) : String(sanitizedMonthIndexKey))
    : 'Select month index field';

  const monthIndexTreeNodes = useMemo(() => {
    if (!selectedKeys) return [];
    // Get the top-level parent node (first part of the key path)
    const topLevelKey = selectedKeys.split('.')[0];
    const topLevelNode = findNodeByKey(treeNodes, topLevelKey);
    if (!topLevelNode) return [];
    return [topLevelNode];
  }, [selectedKeys, treeNodes]);

  // Build tree nodes from processedData
  const processedDataTreeNodesMemo = useMemo(() => {
    if (!processedData) return [];
    return buildTreeFromProcessedData(processedData);
  }, [processedData]);

  // Helper to filter tree nodes to only 1 depth level (direct children only)
  const filterTreeToSingleDepth = useCallback((nodes) => {
    if (!Array.isArray(nodes)) return [];

    return nodes.map(node => {
      // Create a copy of the node, keeping only direct children (1 depth)
      // Remove nested children but keep the direct children structure
      const filteredNode = {
        ...node,
        children: node.children ? node.children.map(child => {
          // For each direct child, remove its children (nested grandchildren)
          const filteredChild = { ...child };
          // Remove nested children but keep the node structure
          if (filteredChild.children) {
            delete filteredChild.children;
            filteredChild.leaf = true; // Mark as leaf since we removed its children
          }
          return filteredChild;
        }) : undefined,
        leaf: false // Top-level nodes are not leaves (they have direct children)
      };

      return filteredNode;
    });
  }, []);

  // Create filtered tree nodes for search/sort fields (only 1 depth level)
  const searchFieldsTreeNodes = useMemo(() => {
    return filterTreeToSingleDepth(processedDataTreeNodesMemo);
  }, [processedDataTreeNodesMemo, filterTreeToSingleDepth]);

  const sortFieldsTreeNodes = useMemo(() => {
    return filterTreeToSingleDepth(processedDataTreeNodesMemo);
  }, [processedDataTreeNodesMemo, filterTreeToSingleDepth]);

  // Helper to collect only direct children (1 depth) of a node - treating them as leaves
  const collectDirectChildren = useCallback((node, parentPath = '') => {
    if (!node || !node.children || node.children.length === 0) {
      return [];
    }
    // Only collect direct children, not nested children
    const paths = [];
    node.children.forEach(child => {
      const nodeName = child.data?.name || child.key?.split('.').pop() || '';
      const childPath = parentPath ? `${parentPath}.${nodeName}` : nodeName;
      paths.push(childPath);
    });

    return paths;
  }, []);

  // Helper to convert object of field groups to checkbox selection object
  // Input: {user: ["profile.name"], postingDetails: ["id"]}
  // Output: Includes both selected leaf nodes AND parent nodes with partialChecked states
  const fieldGroupsToSelectionKeys = useCallback((fieldGroups, treeNodesToUse = null) => {
    if (!fieldGroups || typeof fieldGroups !== 'object') {
      return {};
    }
    // Use provided tree nodes, or fall back to processedDataTreeNodesMemo
    const treeNodes = treeNodesToUse || processedDataTreeNodesMemo;
    const selectionKeys = {};

    Object.keys(fieldGroups).forEach(topLevelKey => {
      const nestedPaths = fieldGroups[topLevelKey];
      if (Array.isArray(nestedPaths)) {
        // Find top-level node to get all possible paths
        const topLevelNode = findNodeByKey(treeNodes, topLevelKey);
        if (topLevelNode) {
          // Collect only direct children (1 depth) - treating them as leaves
          const allPossiblePaths = collectDirectChildren(topLevelNode, topLevelKey);
          const allPossibleNested = allPossiblePaths.map(path => {
            const parts = path.split('.');
            return parts.slice(1).join('.'); // Remove top-level key prefix
          }).filter(p => p); // Remove empty strings

          // Set state for top-level key based on selection
          const selectedCount = nestedPaths.length;
          const totalCount = allPossibleNested.length;

          // Check if all selected paths exist in allPossibleNested
          const allSelectedExist = nestedPaths.every(path => allPossibleNested.includes(path));
          const allPossibleSelected = allPossibleNested.every(path => nestedPaths.includes(path));

          if (selectedCount === totalCount && totalCount > 0 && allSelectedExist && allPossibleSelected) {
            // All children selected
            selectionKeys[topLevelKey] = {
              checked: true,
              partialChecked: false
            };
          } else if (selectedCount > 0) {
            // Some (but not all) children selected
            selectionKeys[topLevelKey] = {
              checked: false,
              partialChecked: true
            };
          }
          // If selectedCount === 0, don't add to selectionKeys

          // Set state for selected leaf nodes
          nestedPaths.forEach(nestedPath => {
            const fullPath = nestedPath
              ? `${topLevelKey}.${nestedPath}`
              : topLevelKey;
            selectionKeys[fullPath] = {
              checked: true,
              partialChecked: false
            };
          });
        }
      }
    });

    return selectionKeys;
  }, [processedDataTreeNodesMemo, collectDirectChildren]);

  // Use in Tree components - pass filtered tree nodes for consistent comparison
  const searchFieldsSelectionKeys = useMemo(() => fieldGroupsToSelectionKeys(searchFields, searchFieldsTreeNodes), [searchFields, fieldGroupsToSelectionKeys, searchFieldsTreeNodes]);
  const sortFieldsSelectionKeys = useMemo(() => fieldGroupsToSelectionKeys(sortFields, sortFieldsTreeNodes), [sortFields, fieldGroupsToSelectionKeys, sortFieldsTreeNodes]);

  // Handlers for searchFields
  const handleSearchFieldsSelect = useCallback((e) => {
    // e.value contains all selected keys in format: {key: {checked: true, partialChecked: false}}
    // Convert to object: {topLevelKey: ["nested.path", ...], ...}
    const selected = e.value || {};
    const fieldGroups = {};

    // First pass: process all checked items
    Object.keys(selected).forEach(fullPath => {
      // Check if this key is checked (PrimeReact checkbox format)
      const selectionState = selected[fullPath];
      const isChecked = selectionState && typeof selectionState === 'object' && selectionState.checked === true;

      // Use full tree nodes to collect direct children (filtered tree has no children)
      const node = findNodeByKey(processedDataTreeNodesMemo, fullPath);
      if (!node) return;

      // Split full path into top-level key and nested path
      const parts = fullPath.split('.');
      const topLevelKey = parts[0];
      const nestedPath = parts.slice(1).join('.');

      // Group by top-level key
      if (!fieldGroups[topLevelKey]) {
        fieldGroups[topLevelKey] = [];
      }

      if (isChecked) {
        // If this is a top-level key (no nested path), collect all direct children (1 depth)
        if (!nestedPath) {
          // Top-level selection - get all direct children from this node (treat as leaves)
          const nestedPaths = collectDirectChildren(node, topLevelKey);
          nestedPaths.forEach(path => {
            // Extract nested part (remove top-level key prefix)
            const pathParts = path.split('.');
            const nestedPart = pathParts.slice(1).join('.');
            if (nestedPart && !fieldGroups[topLevelKey].includes(nestedPart)) {
              fieldGroups[topLevelKey].push(nestedPart);
            }
          });
        } else {
          // Check if this is a direct child (only 1 level deep from top-level)
          const pathDepth = nestedPath.split('.').length;
          if (pathDepth === 1) {
            // Direct child (1 depth) - treat as leaf and add it
            if (!fieldGroups[topLevelKey].includes(nestedPath)) {
              fieldGroups[topLevelKey].push(nestedPath);
            }
          }
          // If pathDepth > 1, it's a nested child (deeper than 1 level) - ignore it
        }
      }
      // Skip unchecked items in first pass - will handle in second pass
    });

    // Second pass: process unchecked items (only clear if no checked children exist)
    Object.keys(selected).forEach(fullPath => {
      const selectionState = selected[fullPath];
      const isChecked = selectionState && typeof selectionState === 'object' && selectionState.checked === true;

      if (!isChecked) {
        const node = findNodeByKey(processedDataTreeNodesMemo, fullPath);
        if (!node) return;

        const parts = fullPath.split('.');
        const topLevelKey = parts[0];
        const nestedPath = parts.slice(1).join('.');

        // Group by top-level key if not exists
        if (!fieldGroups[topLevelKey]) {
          fieldGroups[topLevelKey] = [];
        }

        if (!nestedPath) {
          // Top-level key unchecked - check if any checked children exist in this event
          const hasCheckedChildren = Object.keys(selected).some(otherPath => {
            if (otherPath === fullPath) return false;
            const otherState = selected[otherPath];
            const otherIsChecked = otherState && typeof otherState === 'object' && otherState.checked === true;
            if (!otherIsChecked) return false;
            // Check if otherPath is a child of this top-level key
            return otherPath.startsWith(topLevelKey + '.') && otherPath.split('.').length === 2;
          });

          // Only clear if no checked children are being processed in this event
          if (!hasCheckedChildren) {
            fieldGroups[topLevelKey] = [];
          }
        } else {
          // Remove this specific nested path from the top-level key
          if (fieldGroups[topLevelKey]) {
            fieldGroups[topLevelKey] = fieldGroups[topLevelKey].filter(path => path !== nestedPath);
            // If no nested paths left, remove the top-level key entry
            if (fieldGroups[topLevelKey].length === 0) {
              delete fieldGroups[topLevelKey];
            }
          }
        }
      }
    });

    setSearchFields(fieldGroups);
    // Don't hide overlay - let user continue selecting
  }, [processedDataTreeNodesMemo, setSearchFields, collectDirectChildren]);

  const handleSearchFieldsToggle = useCallback((event) => {
    setSearchFieldsExpandedKeys(event.value);
  }, [setSearchFieldsExpandedKeys]);

  // Handlers for sortFields
  const handleSortFieldsSelect = useCallback((e) => {
    // Same logic as handleSearchFieldsSelect
    const selected = e.value || {};
    const fieldGroups = {};

    // First pass: process all checked items
    Object.keys(selected).forEach(fullPath => {
      // Check if this key is checked (PrimeReact checkbox format)
      const selectionState = selected[fullPath];
      const isChecked = selectionState && typeof selectionState === 'object' && selectionState.checked === true;

      // Use full tree nodes to collect direct children (filtered tree has no children)
      const node = findNodeByKey(processedDataTreeNodesMemo, fullPath);
      if (!node) return;

      // Split full path into top-level key and nested path
      const parts = fullPath.split('.');
      const topLevelKey = parts[0];
      const nestedPath = parts.slice(1).join('.');

      // Group by top-level key
      if (!fieldGroups[topLevelKey]) {
        fieldGroups[topLevelKey] = [];
      }

      if (isChecked) {
        // If this is a top-level key (no nested path), collect all direct children (1 depth)
        if (!nestedPath) {
          // Top-level selection - get all direct children from this node (treat as leaves)
          const nestedPaths = collectDirectChildren(node, topLevelKey);
          nestedPaths.forEach(path => {
            // Extract nested part (remove top-level key prefix)
            const pathParts = path.split('.');
            const nestedPart = pathParts.slice(1).join('.');
            if (nestedPart && !fieldGroups[topLevelKey].includes(nestedPart)) {
              fieldGroups[topLevelKey].push(nestedPart);
            }
          });
        } else {
          // Check if this is a direct child (only 1 level deep from top-level)
          const pathDepth = nestedPath.split('.').length;
          if (pathDepth === 1) {
            // Direct child (1 depth) - treat as leaf and add it
            if (!fieldGroups[topLevelKey].includes(nestedPath)) {
              fieldGroups[topLevelKey].push(nestedPath);
            }
          }
          // If pathDepth > 1, it's a nested child (deeper than 1 level) - ignore it
        }
      }
      // Skip unchecked items in first pass - will handle in second pass
    });

    // Second pass: process unchecked items (only clear if no checked children exist)
    Object.keys(selected).forEach(fullPath => {
      const selectionState = selected[fullPath];
      const isChecked = selectionState && typeof selectionState === 'object' && selectionState.checked === true;

      if (!isChecked) {
        const node = findNodeByKey(processedDataTreeNodesMemo, fullPath);
        if (!node) return;

        const parts = fullPath.split('.');
        const topLevelKey = parts[0];
        const nestedPath = parts.slice(1).join('.');

        // Group by top-level key if not exists
        if (!fieldGroups[topLevelKey]) {
          fieldGroups[topLevelKey] = [];
        }

        if (!nestedPath) {
          // Top-level key unchecked - check if any checked children exist in this event
          const hasCheckedChildren = Object.keys(selected).some(otherPath => {
            if (otherPath === fullPath) return false;
            const otherState = selected[otherPath];
            const otherIsChecked = otherState && typeof otherState === 'object' && otherState.checked === true;
            if (!otherIsChecked) return false;
            // Check if otherPath is a child of this top-level key
            return otherPath.startsWith(topLevelKey + '.') && otherPath.split('.').length === 2;
          });

          // Only clear if no checked children are being processed in this event
          if (!hasCheckedChildren) {
            fieldGroups[topLevelKey] = [];
          }
        } else {
          // Remove this specific nested path from the top-level key
          if (fieldGroups[topLevelKey]) {
            fieldGroups[topLevelKey] = fieldGroups[topLevelKey].filter(path => path !== nestedPath);
            // If no nested paths left, remove the top-level key entry
            if (fieldGroups[topLevelKey].length === 0) {
              delete fieldGroups[topLevelKey];
            }
          }
        }
      }
    });

    setSortFields(fieldGroups);
    // Don't hide overlay - let user continue selecting
  }, [processedDataTreeNodesMemo, setSortFields, collectDirectChildren]);

  const handleSortFieldsToggle = useCallback((event) => {
    setSortFieldsExpandedKeys(event.value);
  }, [setSortFieldsExpandedKeys]);

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

  // Helper function to unwrap GraphQL type to get the underlying named type
  const unwrapGraphQLType = useCallback((type) => {
    if (!type) return null;
    if (type.ofType) {
      return unwrapGraphQLType(type.ofType);
    }
    return type;
  }, []);

  // Helper function to get the type name for a field path from the schema
  const getFieldType = useCallback((fieldPath, schemaObj) => {
    if (!schemaObj || !fieldPath) return null;

    try {
      const parts = fieldPath.split('.');
      if (parts.length === 0) return null;

      // Start from the query type
      const queryType = schemaObj.getQueryType();
      if (!queryType) return null;

      let currentType = queryType;
      
      // Traverse the path
      for (let i = 0; i < parts.length; i++) {
        const fieldName = parts[i];
        const fields = currentType.getFields();
        
        if (!fields || !fields[fieldName]) {
          return null;
        }

        const field = fields[fieldName];
        const fieldType = field.type;
        
        // Unwrap NON_NULL and LIST wrappers to get the underlying type
        const unwrappedType = unwrapGraphQLType(fieldType);
        
        if (!unwrappedType) {
          return null;
        }

        // Get the type name
        const typeName = unwrappedType.name;
        if (!typeName) {
          return null;
        }

        // If this is the last part, return the type
        if (i === parts.length - 1) {
          return typeName;
        }
        
        // Otherwise, continue traversing - get the type from the schema's type map
        const typeMap = schemaObj.getTypeMap();
        currentType = typeMap[typeName];
        if (!currentType || !currentType.getFields) {
          return null;
        }
      }
    } catch (error) {
      console.error('Error getting field type for path:', fieldPath, error);
      return null;
    }

    return null;
  }, [unwrapGraphQLType]);

  // Enhanced helper function to get detailed type information (kind, enum values, etc.)
  const getFieldTypeInfo = useCallback((fieldPath, schemaObj) => {
    if (!schemaObj || !fieldPath) return null;

    try {
      const parts = fieldPath.split('.');
      if (parts.length === 0) return null;

      const queryType = schemaObj.getQueryType();
      if (!queryType) return null;

      let currentType = queryType;
      
      for (let i = 0; i < parts.length; i++) {
        const fieldName = parts[i];
        const fields = currentType.getFields();
        
        if (!fields || !fields[fieldName]) {
          return null;
        }

        const field = fields[fieldName];
        const fieldType = field.type;
        const unwrappedType = unwrapGraphQLType(fieldType);
        
        if (!unwrappedType) {
          return null;
        }

        const typeName = unwrappedType.name;
        if (!typeName) {
          return null;
        }

        // If this is the last part, return detailed type info
        if (i === parts.length - 1) {
          const typeInfo = {
            name: typeName,
            kind: null,
          };

          // Determine the kind of type
          // Check if it's an ENUM (has getValues method)
          if (unwrappedType.getValues && typeof unwrappedType.getValues === 'function') {
            typeInfo.kind = 'ENUM';
            try {
              const enumValues = unwrappedType.getValues();
              typeInfo.values = enumValues.map(v => v.name || v.value);
            } catch (e) {
              console.warn('Error getting enum values:', e);
            }
          } 
          // Check if it's an OBJECT (has getFields method)
          else if (unwrappedType.getFields && typeof unwrappedType.getFields === 'function') {
            typeInfo.kind = 'OBJECT';
          }
          // Check if it's a SCALAR (check constructor name or astNode)
          else if (unwrappedType.constructor && unwrappedType.constructor.name === 'GraphQLScalarType') {
            typeInfo.kind = 'SCALAR';
          }
          // Check if it's an INPUT_OBJECT
          else if (unwrappedType.getFields && typeof unwrappedType.getFields === 'function' && unwrappedType.astNode?.kind === 'InputObjectTypeDefinition') {
            typeInfo.kind = 'INPUT_OBJECT';
          }
          // Check if it's an INTERFACE
          else if (unwrappedType.resolveType || unwrappedType.astNode?.kind === 'InterfaceTypeDefinition') {
            typeInfo.kind = 'INTERFACE';
          }
          // Check if it's a UNION
          else if (unwrappedType.getPossibleTypes || unwrappedType.astNode?.kind === 'UnionTypeDefinition') {
            typeInfo.kind = 'UNION';
          }
          // Fallback: try to get from astNode
          else if (unwrappedType.astNode) {
            const astKind = unwrappedType.astNode.kind;
            if (astKind === 'ScalarTypeDefinition') {
              typeInfo.kind = 'SCALAR';
            } else if (astKind === 'EnumTypeDefinition') {
              typeInfo.kind = 'ENUM';
            } else if (astKind === 'ObjectTypeDefinition') {
              typeInfo.kind = 'OBJECT';
            } else if (astKind === 'InputObjectTypeDefinition') {
              typeInfo.kind = 'INPUT_OBJECT';
            } else if (astKind === 'InterfaceTypeDefinition') {
              typeInfo.kind = 'INTERFACE';
            } else if (astKind === 'UnionTypeDefinition') {
              typeInfo.kind = 'UNION';
            }
          }
          
          // If we still don't have a kind, try to infer from constructor name
          if (!typeInfo.kind && unwrappedType.constructor) {
            const constructorName = unwrappedType.constructor.name;
            if (constructorName.includes('Enum')) {
              typeInfo.kind = 'ENUM';
            } else if (constructorName.includes('Scalar')) {
              typeInfo.kind = 'SCALAR';
            } else if (constructorName.includes('Object')) {
              typeInfo.kind = 'OBJECT';
            }
          }

          // Default to UNKNOWN if we still can't determine
          if (!typeInfo.kind) {
            typeInfo.kind = 'UNKNOWN';
          }

          return typeInfo;
        }
        
        // Continue traversing
        const typeMap = schemaObj.getTypeMap();
        currentType = typeMap[typeName];
        if (!currentType || !currentType.getFields) {
          return null;
        }
      }
    } catch (error) {
      console.error('Error getting field type info for path:', fieldPath, error);
      return null;
    }

    return null;
  }, [unwrapGraphQLType]);

  const handleSave = useCallback(async () => {
    if (!query) return;

    // Build and log writeSchema JSON immediately on save click (before any validation or dialog)
    if (enableWrite && writeSchemaSelectionKeys && schema) {
      const selectedFieldPaths = [];
      for (const key in writeSchemaSelectionKeys) {
        if (writeSchemaSelectionKeys[key]?.checked) {
          selectedFieldPaths.push(key);
        }
      }

      if (selectedFieldPaths.length > 0) {
        // Build writeSchema as nested JSON object with detailed type info
        let writeSchemaJson = {};
        for (const fieldPath of selectedFieldPaths) {
          const typeInfo = getFieldTypeInfo(fieldPath, schema);
          const parts = fieldPath.split('.');
          
          // Build nested structure
          let current = writeSchemaJson;
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;
            
            if (isLast) {
              // Last part gets detailed type info
              if (typeInfo) {
                current[part] = {
                  type: typeInfo.name,
                  kind: typeInfo.kind,
                  ...(typeInfo.values && { values: typeInfo.values }) // Include enum values if it's an enum
                };
              } else {
                current[part] = { type: 'Unknown', kind: 'UNKNOWN' };
              }
            } else {
              // Intermediate parts get nested objects
              if (!current[part] || typeof current[part] !== 'object' || current[part].type) {
                current[part] = {};
              }
              current = current[part];
            }
          }
        }
        
        // Console log the writeSchema JSON
        console.log('Write Schema (JSON):', JSON.stringify(writeSchemaJson, null, 2));
      }
    }

    const operationName = extractOperationName(query);

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

    // Check if at least one field is selected
    const hasSelection = Object.keys(writeSchemaSelectionKeys).some(
      key => writeSchemaSelectionKeys[key]?.checked
    );
    
    if (enableWrite && !hasSelection) {
      confirmDialog({
        message: 'Please select at least one write schema field before saving.',
        header: 'Write Schema Required',
        acceptLabel: 'OK',
        accept: () => { },
      });
      return;
    }

    // Build selected query by stripping unwanted selections from original query
    const buildSelectedQuery = () => {
      // Only build query if clientSave is enabled and selectedKeys exists
      if (!clientSave || !selectedKeys || !query) return '';

      // Use the simpler approach: strip unwanted selections from the original query
      return stripUnwantedSelections(query, selectedKeys);
    };

    const selectedQuery = buildSelectedQuery();

    // Build month index query by stripping unwanted selections from original query
    const buildMonthIndexQuery = () => {
      // Only build query if clientSave is enabled and monthIndexKeys exists
      if (!clientSave || !monthIndexKeys || !query) return '';

      // Use the simpler approach: strip unwanted selections from the original query
      return stripUnwantedSelections(query, monthIndexKeys);
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

    const urlKey = selectedEnvironment || '';

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
          if (selectedEnvironment) {
            const config = getEndpointConfigFromUrlKey(selectedEnvironment);
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

          // Parse variables from variables
          let parsedVariables = {};
          if (variables && variables.trim()) {
            try {
              parsedVariables = parseJsonc(variables);
            } catch (e) {
              try {
                const stripped = stripComments(variables);
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
                if (selectedEnvironment) {
                  const config = getEndpointConfigFromUrlKey(selectedEnvironment);
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
                  if (variables && variables.trim()) {
                    try {
                      parsedVariables = parseJsonc(variables);
                    } catch (e) {
                      try {
                        const stripped = stripComments(variables);
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

    // Start validation asynchronously after dialog opens
    const performValidation = async () => {
      try {
        let indexValidation, monthIndexValidation;

        // Validate index query if it exists
        if (selectedQuery) {
          indexValidation = await validateAndRectifyQuery(
            selectedQuery,
            'Index',
            query,
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
            query,
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
                  if (!variables || !variables.trim()) {
                    return <p className="text-sm text-gray-500 font-mono">No variables</p>;
                  }
                  // Try to parse and format the variables
                  let parsedVariables = {};
                  try {
                    parsedVariables = parseJsonc(variables);
                  } catch (e) {
                    try {
                      const stripped = stripComments(variables);
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
          <div>
            <p className="font-semibold text-sm mb-1">Search Fields:</p>
            <div style={{
              padding: '0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              backgroundColor: '#f9fafb',
              maxHeight: '200px',
              overflow: 'auto'
            }}>
              {Object.keys(searchFields).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(searchFields).map(([topLevelKey, nestedPaths]) => {
                    if (!Array.isArray(nestedPaths) || nestedPaths.length === 0) return null;
                    return (
                      <div key={topLevelKey} className="mb-2">
                        <p className="text-xs font-semibold text-gray-600 mb-1">{topLevelKey}:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          {nestedPaths.map((path, idx) => (
                            <li key={idx} className="text-xs text-gray-700 font-mono">
                              {path || '<all fields>'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">No search fields selected</p>
              )}
            </div>
          </div>
          <div>
            <p className="font-semibold text-sm mb-1">Sort Fields:</p>
            <div style={{
              padding: '0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              backgroundColor: '#f9fafb',
              maxHeight: '200px',
              overflow: 'auto'
            }}>
              {Object.keys(sortFields).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(sortFields).map(([topLevelKey, nestedPaths]) => {
                    if (!Array.isArray(nestedPaths) || nestedPaths.length === 0) return null;
                    return (
                      <div key={topLevelKey} className="mb-2">
                        <p className="text-xs font-semibold text-gray-600 mb-1">{topLevelKey}:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          {nestedPaths.map((path, idx) => (
                            <li key={idx} className="text-xs text-gray-700 font-mono">
                              {path || '<all fields>'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">No sort fields selected</p>
              )}
            </div>
          </div>
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
                query,
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
                query,
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
          const queryToSave = query;

          // Ensure variables are saved as valid JSON string
          // Use jsonc-parser (same as GraphiQL) to handle JSON with comments and lenient syntax
          let validVariablesString = '';
          if (variables && variables.trim()) {
            try {
              // Use jsonc-parser to parse (handles comments, trailing commas, etc. like GraphiQL)
              const parsedVariables = parseJsonc(variables);
              // Re-stringify as clean JSON (no comments, proper formatting)
              validVariablesString = JSON.stringify(parsedVariables);
            } catch (parseError) {
              // If jsonc-parser fails, try to strip comments and parse again
              try {
                const stripped = stripComments(variables);
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

          // Extract selected field paths from writeSchemaSelectionKeys
          const selectedFieldPaths = [];
          if (enableWrite && writeSchemaSelectionKeys) {
            for (const key in writeSchemaSelectionKeys) {
              if (writeSchemaSelectionKeys[key]?.checked) {
                selectedFieldPaths.push(key);
              }
            }
          }

          // Build writeSchema as nested JSON object with detailed type info
          // Example: "user.profile.name" becomes { user: { profile: { name: { type: "String", kind: "SCALAR" } } } }
          let writeSchemaJson = {};
          if (enableWrite && selectedFieldPaths.length > 0 && schema) {
            for (const fieldPath of selectedFieldPaths) {
              const typeInfo = getFieldTypeInfo(fieldPath, schema);
              const parts = fieldPath.split('.');
              
              // Build nested structure
              let current = writeSchemaJson;
              for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isLast = i === parts.length - 1;
                
                if (isLast) {
                  // Last part gets detailed type info
                  if (typeInfo) {
                    current[part] = {
                      type: typeInfo.name,
                      kind: typeInfo.kind,
                      ...(typeInfo.values && { values: typeInfo.values }) // Include enum values if it's an enum
                    };
                  } else {
                    current[part] = { type: 'Unknown', kind: 'UNKNOWN' };
                  }
                } else {
                  // Intermediate parts get nested objects
                  if (!current[part] || typeof current[part] !== 'object' || current[part].type) {
                    current[part] = {};
                  }
                  current = current[part];
                }
              }
            }
          }

          // Get the root field name for backward compatibility (first selected root field)
          const selectedRootField = selectedFieldPaths.find(path => isRootField(path)) || 
            (selectedFieldPaths.length > 0 ? getRootFieldForKey(selectedFieldPaths[0]) : null);

          // Use same source as table viewer tab names: top-level keys from processedData tree nodes
          const queryKeys = processedDataTreeNodesMemo.map((node) => node.key).filter(Boolean);

          const saveData = {
            body: queryToSave || '',
            urlKey: urlKey || '',
            clientSave: clientSave,
            enableWrite: enableWrite,
            writeSchema: enableWrite && Object.keys(writeSchemaJson).length > 0 ? writeSchemaJson : null,
            index: validatedIndexQuery,
            variables: validVariablesString,
            month: month !== null,
            ...(month && {
              monthDate: month.toISOString(),
              monthIndex: validatedMonthIndexQuery,
            }),
            ...(currentTransformerCode && {
              transformerCode: currentTransformerCode,
            }),
            searchFields: searchFields,  // Object: {user: ["profile.name"], ...}
            sortFields: sortFields,      // Object: {user: ["profile.name"], ...}
            queryKeys,
            // Timestamp tracking - only update if field changed, otherwise preserve existing timestamp
            bodyUpdatedAt: bodyChanged ? now : (existingData?.bodyUpdatedAt || null),
            variablesUpdatedAt: variablesChanged ? now : (existingData?.variablesUpdatedAt || null),
            transformerCodeUpdatedAt: transformerCodeChanged ? now : (existingData?.transformerCodeUpdatedAt || null),
            lastUpdatedBy: lastUpdatedBy,
          };
          await firestoreService.saveQuery(operationName, saveData);
          await loadSavedQueries();
          clearDirty();
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
  }, [clientSave, selectedKeys, month, monthIndexKeys, treeNodes, processedDataTreeNodesMemo, formatFieldName, transformerCode, query, variables, selectedEnvironment, user, searchFields, sortFields, enableWrite, writeSchemaSelectionKeys, isRootField, getRootFieldForKey, setVariables, loadSavedQueries, getFieldTypeInfo, schema]);

  return (
    <>
      <style jsx>{`
        .graphiql-save-controls {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem;
          height: 100%;
          overflow-y: auto;
        }

        .graphiql-save-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .graphiql-save-toggle-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: #6b7280;
          white-space: nowrap;
        }

        .graphiql-save-toggle-switch {
          position: relative;
          width: 2.75rem;
          height: 1.5rem;
          border-radius: 9999px;
          transition: background-color 0.2s ease;
          cursor: pointer;
        }

        .graphiql-save-toggle-switch.live {
          background-color: #fbbf24;
        }

        .graphiql-save-toggle-switch.client {
          background-color: #10b981;
        }

        .graphiql-save-toggle-switch-handle {
          position: absolute;
          top: 0.125rem;
          left: 0.125rem;
          width: 1.25rem;
          height: 1.25rem;
          background-color: white;
          border-radius: 50%;
          transition: transform 0.2s ease;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        .graphiql-save-toggle-switch.client .graphiql-save-toggle-switch-handle {
          transform: translateX(1.25rem);
        }

        .graphiql-index-selector {
          width: 100%;
          position: relative;
        }

        .graphiql-month-picker {
          width: 100%;
          position: relative;
        }

        .graphiql-index-selector.has-selection .p-button {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .graphiql-index-selector.has-selection .p-button:hover {
          background: #dbeafe;
          border-color: #2563eb;
        }

        .graphiql-index-selector .p-button {
          width: 100%;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          border: 1px solid #d1d5db;
          background: white;
          color: #374151;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
        }

        .graphiql-index-selector .p-button:not(.p-disabled):hover {
          background: #f9fafb;
          border-color: #9ca3af;
          color: #111827;
        }

        .graphiql-index-selector .p-button:not(.p-disabled):focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
          outline: none;
        }

        .graphiql-index-selector .p-button.p-disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background: #f3f4f6;
        }

        .graphiql-index-selector .p-button.p-disabled:hover {
          background: #f3f4f6;
          border-color: #d1d5db;
        }

        .graphiql-index-overlay {
          padding: 0;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }

        .graphiql-index-overlay .p-overlaypanel-content {
          padding: 0;
          overflow: hidden;
        }

        .graphiql-overlay-scroll {
          max-height: 320px;
          overflow-y: auto;
          overscroll-behavior: contain;
        }

        /* Single scroll: disable Tree's inner scroll so only graphiql-overlay-scroll scrolls */
        .graphiql-index-overlay .p-tree-container {
          overflow: visible;
        }

        .graphiql-write-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
        }

        .graphiql-write-toggle-switch {
          position: relative;
          width: 2.75rem;
          height: 1.5rem;
          border-radius: 9999px;
          cursor: pointer;
          transition: background-color 0.2s ease;
          background-color: #d1d5db;
        }

        .graphiql-write-toggle-switch.enabled {
          background-color: #3b82f6;
        }

        .graphiql-write-toggle-switch-handle {
          position: absolute;
          top: 0.125rem;
          left: 0.125rem;
          width: 1.25rem;
          height: 1.25rem;
          background-color: #ffffff;
          border-radius: 50%;
          transition: transform 0.2s ease;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        .graphiql-write-toggle-switch.enabled .graphiql-write-toggle-switch-handle {
          transform: translateX(1.25rem);
        }

        .graphiql-write-schema-list {
          list-style: none;
          margin: 0;
          padding: 0.5rem 0;
        }

        .graphiql-write-schema-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 1rem;
          background: transparent;
          border: none;
          text-align: left;
          font-size: 0.875rem;
          color: #374151;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .graphiql-write-schema-item:hover {
          background-color: #f3f4f6;
        }

        .graphiql-write-schema-item.active {
          background-color: #e0f2fe;
          color: #0369a1;
        }
      `}</style>
      <div className="graphiql-save-controls flex flex-col gap-2 p-2 h-full overflow-y-auto">
        {/* Live/Client Toggle */}
        <div className="flex flex-col gap-1.5" style={{ width: '100%', minWidth: '280px', maxWidth: '280px' }}>
          <h3 className="text-sm font-semibold text-gray-700">Strategy</h3>
          <div className="graphiql-save-toggle flex items-center justify-center gap-3">
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
        </div>

        {/* Enable Write Toggle */}
        <div className="flex flex-col gap-1.5" style={{ width: '100%', minWidth: '280px', maxWidth: '280px' }}>
          <h3 className="text-sm font-semibold text-gray-700">Write</h3>
          <div className="graphiql-write-toggle">
            <span className={`graphiql-save-toggle-label ${!enableWrite ? 'text-gray-700 font-semibold' : 'text-gray-500'}`}>
              Disable
            </span>
            <div className="graphiql-save-toggle flex items-center justify-center">
              <div
                className={`graphiql-write-toggle-switch ${enableWrite ? 'enabled' : ''}`}
                onClick={handleWriteToggle}
                role="switch"
                aria-checked={enableWrite}
                aria-label="Enable Write"
              >
                <div className="graphiql-write-toggle-switch-handle"></div>
              </div>
            </div>
            <span className={`graphiql-save-toggle-label ${enableWrite ? 'text-blue-700 font-semibold' : 'text-gray-500'}`}>
              Enable
            </span>
          </div>
        </div>

        {/* Write Schema Selector */}
        {enableWrite && (
          <div className="flex flex-col gap-1.5" style={{ width: '100%', minWidth: '280px', maxWidth: '280px' }}>
            <h3 className="text-sm font-semibold text-gray-700">Write Schema</h3>
            <div className={`graphiql-index-selector ${Object.keys(writeSchemaSelectionKeys).some(key => writeSchemaSelectionKeys[key]?.checked) ? 'has-selection' : ''}`}>
              <Button
                type="button"
                onClick={(e) => {
                  if (writeSchemaOp.current) {
                    writeSchemaOp.current.toggle(e);
                  }
                }}
                disabled={!schema || writeSchemaTreeNodes.length === 0}
                className="p-button-sm p-button-outlined w-full"
                title={Object.keys(writeSchemaSelectionKeys).some(key => writeSchemaSelectionKeys[key]?.checked) 
                  ? `Selected fields: ${Object.keys(writeSchemaSelectionKeys).filter(key => writeSchemaSelectionKeys[key]?.checked).length}` 
                  : 'Select write schema fields'}
                style={{
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  padding: '0.5rem 0.75rem'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                  <i className="pi pi-database" style={{ fontSize: '0.875rem', color: '#6b7280', flexShrink: 0 }}></i>
                  <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: Object.keys(writeSchemaSelectionKeys).some(key => writeSchemaSelectionKeys[key]?.checked) ? '#374151' : '#9ca3af',
                    fontWeight: Object.keys(writeSchemaSelectionKeys).some(key => writeSchemaSelectionKeys[key]?.checked) ? '500' : '400'
                  }}>
                    {(() => {
                      const selectedCount = Object.keys(writeSchemaSelectionKeys).filter(key => writeSchemaSelectionKeys[key]?.checked).length;
                      if (selectedCount > 0) {
                        // Find the root field - either directly selected or from a nested selection
                        const rootField = Object.keys(writeSchemaSelectionKeys).find(key => writeSchemaSelectionKeys[key]?.checked && isRootField(key)) ||
                          (() => {
                            const firstSelected = Object.keys(writeSchemaSelectionKeys).find(key => writeSchemaSelectionKeys[key]?.checked);
                            return firstSelected ? getRootFieldForKey(firstSelected) : null;
                          })();
                        if (rootField) {
                          return `${rootField} (${selectedCount} field${selectedCount > 1 ? 's' : ''})`;
                        }
                        return `${selectedCount} field${selectedCount > 1 ? 's' : ''} selected`;
                      }
                      return 'Select write schema fields';
                    })()}
                  </span>
                </span>
                <i className="pi pi-chevron-down" style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem', flexShrink: 0 }}></i>
              </Button>
              <OverlayPanel
                ref={writeSchemaOp}
                dismissable
                className="graphiql-index-overlay"
                style={{ width: '420px', maxHeight: '400px' }}
              >
                <div className="graphiql-overlay-scroll">
                  {writeSchemaTreeNodes.length > 0 ? (
                    <Tree
                      value={writeSchemaTreeNodes}
                      selectionMode="checkbox"
                      selectionKeys={writeSchemaSelectionKeys}
                      onSelectionChange={handleWriteSchemaSelect}
                      expandedKeys={writeSchemaExpandedKeys}
                      onToggle={handleWriteSchemaToggle}
                      filter
                      filterMode="lenient"
                      filterBy="data.name"
                      filterPlaceholder="Search fields..."
                      className="w-full"
                    />
                  ) : (
                    <div className="px-4 py-6 text-sm text-gray-500 text-center bg-gray-50 rounded-lg">
                      <i className="pi pi-info-circle text-gray-400 mb-2" style={{ fontSize: '1.25rem' }}></i>
                      <p className="font-medium text-gray-600 mb-1">No schema available</p>
                      <p className="text-xs text-gray-500">
                        {!schema ? 'Please select an environment to load the schema.' : 'Schema loaded but no query root fields found.'}
                      </p>
                    </div>
                  )}
                </div>
              </OverlayPanel>
            </div>
          </div>
        )}

        {/* Index Field Selector - Only show when clientSave is enabled */}
        {clientSave && (
          <div className="flex flex-col gap-1.5" style={{ width: '100%', minWidth: '280px', maxWidth: '280px' }}>
            <h3 className="text-sm font-semibold text-gray-700">Index Field</h3>
            <div className={`graphiql-index-selector ${selectedKeys ? 'has-selection' : ''}`}>
              <Button
                type="button"
                onClick={(e) => {
                  if (treeNodes.length > 0 && indexFieldOp.current) {
                    indexFieldOp.current.toggle(e);
                  }
                }}
                disabled={treeNodes.length === 0}
                className="p-button-sm p-button-outlined w-full"
                title={selectedKeys && formatFieldName ? String(formatFieldName(selectedKeys)) : 'Select index field'}
                style={{
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
                  <div className="graphiql-overlay-scroll">
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
                  </div>
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
          </div>
        )}

        {/* Month Picker */}
        <div className="flex flex-col gap-1.5" style={{ width: '100%', minWidth: '280px', maxWidth: '280px' }}>
          <h3 className="text-sm font-semibold text-gray-700">Month</h3>
          <div className="graphiql-month-picker relative">
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
        </div>

        {/* Month Index Field Selector - Only show when clientSave is enabled and month is selected */}
        {clientSave && month && (
          <div className="flex flex-col gap-1.5" style={{ width: '100%', minWidth: '280px', maxWidth: '280px' }}>
            <h3 className="text-sm font-semibold text-gray-700">Month Index Field</h3>
            <div className={`graphiql-index-selector ${sanitizedMonthIndexKey ? 'has-selection' : ''}`}>
              <Button
                type="button"
                onClick={(e) => {
                  if (monthIndexTreeNodes.length > 0 && monthIndexFieldOp.current) {
                    monthIndexFieldOp.current.toggle(e);
                  }
                }}
                disabled={!selectedKeys || monthIndexTreeNodes.length === 0}
                className="p-button-sm p-button-outlined w-full"
                title={sanitizedMonthIndexKey && formatFieldName ? String(formatFieldName(sanitizedMonthIndexKey)) : 'Select month index field'}
                style={{
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
                    color: sanitizedMonthIndexKey ? '#374151' : '#9ca3af',
                    fontWeight: sanitizedMonthIndexKey ? '500' : '400'
                  }}>
                    {monthIndexLabel}
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
                  <div className="graphiql-overlay-scroll">
                    <Tree
                      value={monthIndexTreeNodes}
                      selectionMode="single"
                      selectionKeys={sanitizedMonthIndexKey}
                      onSelectionChange={handleMonthIndexNodeSelect}
                      expandedKeys={monthIndexExpandedKeys}
                      onToggle={handleMonthIndexToggle}
                      filter
                      filterMode="lenient"
                      filterBy="data.labelText,data.name"
                      filterPlaceholder="Search fields..."
                      className="w-full"
                    />
                  </div>
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
          </div>
        )}

        {/* Search Fields Selector - Always show regardless of clientSave */}
        <div className="flex flex-col gap-1.5" style={{ width: '100%', minWidth: '280px', maxWidth: '280px' }}>
          <h3 className="text-sm font-semibold text-gray-700">Search Fields</h3>
          <div className={`graphiql-index-selector ${Object.keys(searchFields).length > 0 ? 'has-selection' : ''}`}>
            <Button
              type="button"
              onClick={(e) => {
                if (searchFieldsTreeOp.current) {
                  searchFieldsTreeOp.current.toggle(e);
                }
              }}
              disabled={processedDataTreeNodesMemo.length === 0}
              className="p-button-sm p-button-outlined w-full"
              title="Select search fields"
              style={{
                justifyContent: 'space-between',
                textAlign: 'left',
                padding: '0.5rem 0.75rem'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                <i className="pi pi-search" style={{ fontSize: '0.875rem', color: '#6b7280', flexShrink: 0 }}></i>
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: Object.keys(searchFields).length > 0 ? '#374151' : '#9ca3af',
                  fontWeight: Object.keys(searchFields).length > 0 ? '500' : '400'
                }}>
                  {Object.keys(searchFields).length > 0
                    ? `${Object.values(searchFields).flat().length} search field(s) selected`
                    : 'Select search fields'}
                </span>
              </span>
              <i className="pi pi-chevron-down" style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem', flexShrink: 0 }}></i>
            </Button>
            <OverlayPanel
              ref={searchFieldsTreeOp}
              dismissable
              className="graphiql-index-overlay"
              style={{ width: '420px' }}
            >
              {searchFieldsTreeNodes.length > 0 ? (
                <div className="graphiql-overlay-scroll">
                  <Tree
                    value={searchFieldsTreeNodes}
                    selectionMode="checkbox"
                    selectionKeys={searchFieldsSelectionKeys}
                    onSelectionChange={handleSearchFieldsSelect}
                    expandedKeys={searchFieldsExpandedKeys}
                    onToggle={handleSearchFieldsToggle}
                    filter
                    filterMode="lenient"
                    filterBy="data.name"
                    filterPlaceholder="Search fields..."
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="px-4 py-6 text-sm text-gray-500 text-center bg-gray-50 rounded-lg">
                  <i className="pi pi-info-circle text-gray-400 mb-2" style={{ fontSize: '1.25rem' }}></i>
                  <p className="font-medium text-gray-600 mb-1">No processed data available</p>
                  <p className="text-xs text-gray-500">
                    Execute a query and apply transformer to see available fields.
                  </p>
                </div>
              )}
            </OverlayPanel>
          </div>
        </div>

        {/* Sort Fields Selector - Always show regardless of clientSave */}
        <div className="flex flex-col gap-1.5" style={{ width: '100%', minWidth: '280px', maxWidth: '280px' }}>
          <h3 className="text-sm font-semibold text-gray-700">Sort Fields</h3>
          <div className={`graphiql-index-selector ${Object.keys(sortFields).length > 0 ? 'has-selection' : ''}`}>
            <Button
              type="button"
              onClick={(e) => {
                if (sortFieldsTreeOp.current) {
                  sortFieldsTreeOp.current.toggle(e);
                }
              }}
              disabled={processedDataTreeNodesMemo.length === 0}
              className="p-button-sm p-button-outlined w-full"
              title="Select sort fields"
              style={{
                justifyContent: 'space-between',
                textAlign: 'left',
                padding: '0.5rem 0.75rem'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                <i className="pi pi-sort" style={{ fontSize: '0.875rem', color: '#6b7280', flexShrink: 0 }}></i>
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: Object.keys(sortFields).length > 0 ? '#374151' : '#9ca3af',
                  fontWeight: Object.keys(sortFields).length > 0 ? '500' : '400'
                }}>
                  {Object.keys(sortFields).length > 0
                    ? `${Object.values(sortFields).flat().length} sort field(s) selected`
                    : 'Select sort fields'}
                </span>
              </span>
              <i className="pi pi-chevron-down" style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem', flexShrink: 0 }}></i>
            </Button>
            <OverlayPanel
              ref={sortFieldsTreeOp}
              dismissable
              className="graphiql-index-overlay"
              style={{ width: '420px' }}
            >
              {sortFieldsTreeNodes.length > 0 ? (
                <div className="graphiql-overlay-scroll">
                  <Tree
                    value={sortFieldsTreeNodes}
                    selectionMode="checkbox"
                    selectionKeys={sortFieldsSelectionKeys}
                    onSelectionChange={handleSortFieldsSelect}
                    expandedKeys={sortFieldsExpandedKeys}
                    onToggle={handleSortFieldsToggle}
                    filter
                    filterMode="lenient"
                    filterBy="data.name"
                    filterPlaceholder="Search fields..."
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="px-4 py-6 text-sm text-gray-500 text-center bg-gray-50 rounded-lg">
                  <i className="pi pi-info-circle text-gray-400 mb-2" style={{ fontSize: '1.25rem' }}></i>
                  <p className="font-medium text-gray-600 mb-1">No processed data available</p>
                  <p className="text-xs text-gray-500">
                    Execute a query and apply transformer to see available fields.
                  </p>
                </div>
              )}
            </OverlayPanel>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex flex-col gap-1.5" style={{ width: '100%', minWidth: '280px', maxWidth: '280px' }}>
          <Button
            type="button"
            onClick={handleSave}
            icon="pi pi-save"
            label="Save"
            className="p-button-sm w-full"
            style={{
              whiteSpace: 'nowrap'
            }}
          />
        </div>
      </div>
    </>
  );
}
