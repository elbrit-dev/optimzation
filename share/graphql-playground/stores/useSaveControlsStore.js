import { create } from 'zustand';
import { firestoreService } from '../services/firestoreService';
import { findNodeKeyFromIndexQuery } from '../utils/query-matcher';
import { parseQueryToTreeNodes, extractOperationName } from '../utils/graphql-parser';
import { useTableDialogStore } from './useTableDialogStore';
import { useAppStore } from './useAppStore';
import { getEndpointFromUrlKey } from '../constants';

/**
 * Save controls store
 * Manages: tree nodes (utility/parsed data)
 * Note: Save control fields (clientSave, selectedKeys, etc.) are now stored per-tab in useAppStore.tabData
 */
export const useSaveControlsStore = create((set, get) => ({
  // Tree nodes (parsed from query string) - kept as global utility
  treeNodes: [],
  setTreeNodes: (nodes) => set({ treeNodes: nodes }),

  // Tree nodes from processedData - kept as global utility
  processedDataTreeNodes: [],
  setProcessedDataTreeNodes: (nodes) => set({ processedDataTreeNodes: nodes }),

  // Actions
  loadQueryData: async (queryString, activeTabIndex = 0) => {
    const nodes = parseQueryToTreeNodes(queryString);
    set({ treeNodes: nodes });

    // Extract operation name
    const operationName = extractOperationName(queryString);

    if (operationName) {
      try {
        const data = await firestoreService.loadQuery(operationName);
        if (data) {
          // Restore endpoint from urlKey if available
          if (data.urlKey) {
            const endpoint = getEndpointFromUrlKey(data.urlKey);
            if (endpoint) {
              useAppStore.getState().setSelectedEndpoint(endpoint);
            }
          }

          const updates = {};

          if (data.clientSave !== undefined) {
            updates.clientSave = data.clientSave;
          }

          if (data.index && data.index.trim()) {
            const matchingKey = findNodeKeyFromIndexQuery(data.index, nodes);
            if (matchingKey) {
              updates.selectedKeys = matchingKey;
              const parts = matchingKey.split('.');
              const expanded = {};
              for (let i = 1; i < parts.length; i++) {
                const keyToExpand = parts.slice(0, i).join('.');
                expanded[keyToExpand] = true;
              }
              updates.expandedKeys = expanded;
            }
          }

          if (data.month === true && data.monthDate) {
            updates.month = new Date(data.monthDate);
          } else {
            updates.month = null;
          }

          if (data.monthIndex && data.monthIndex.trim()) {
            const matchingMonthIndexKey = findNodeKeyFromIndexQuery(data.monthIndex, nodes);
            if (matchingMonthIndexKey) {
              updates.monthIndexKeys = matchingMonthIndexKey;
              const parts = matchingMonthIndexKey.split('.');
              const expanded = {};
              for (let i = 1; i < parts.length; i++) {
                const keyToExpand = parts.slice(0, i).join('.');
                expanded[keyToExpand] = true;
              }
              updates.monthIndexExpandedKeys = expanded;
            }
          } else {
            updates.monthIndexKeys = null;
            updates.monthIndexExpandedKeys = {};
          }

          // Restore transformerCode
          if (data.transformerCode !== undefined) {
            updates.transformerCode = data.transformerCode || '';
          }

          // Restore searchFields if it exists
          if (data.searchFields && typeof data.searchFields === 'object' && !Array.isArray(data.searchFields)) {
            updates.searchFields = data.searchFields;
            
            // Compute expandedKeys for searchFields
            const searchExpanded = {};
            Object.keys(data.searchFields).forEach(topLevelKey => {
              const nestedPaths = data.searchFields[topLevelKey];
              if (Array.isArray(nestedPaths)) {
                nestedPaths.forEach(nestedPath => {
                  const fullPath = nestedPath ? `${topLevelKey}.${nestedPath}` : topLevelKey;
                  const parts = fullPath.split('.');
                  // Expand all parent paths
                  for (let i = 1; i < parts.length; i++) {
                    const keyToExpand = parts.slice(0, i).join('.');
                    searchExpanded[keyToExpand] = true;
                  }
                });
              }
            });
            updates.searchFieldsExpandedKeys = searchExpanded;
          }

          // Restore sortFields if it exists
          if (data.sortFields && typeof data.sortFields === 'object' && !Array.isArray(data.sortFields)) {
            updates.sortFields = data.sortFields;
            
            // Compute expandedKeys for sortFields
            const sortExpanded = {};
            Object.keys(data.sortFields).forEach(topLevelKey => {
              const nestedPaths = data.sortFields[topLevelKey];
              if (Array.isArray(nestedPaths)) {
                nestedPaths.forEach(nestedPath => {
                  const fullPath = nestedPath ? `${topLevelKey}.${nestedPath}` : topLevelKey;
                  const parts = fullPath.split('.');
                  // Expand all parent paths
                  for (let i = 1; i < parts.length; i++) {
                    const keyToExpand = parts.slice(0, i).join('.');
                    sortExpanded[keyToExpand] = true;
                  }
                });
              }
            });
            updates.sortFieldsExpandedKeys = sortExpanded;
          }

          // Set all updates for this tab (merge with existing tab data)
          useAppStore.getState().setTabData(activeTabIndex, updates);
        } else {
          // No data found - DON'T reset, just ensure transformerCode is set if not present
          const currentTabData = useAppStore.getState().tabData[activeTabIndex];
          if (!currentTabData?.transformerCode) {
            useAppStore.getState().setTabData(activeTabIndex, { transformerCode: '' });
          }
          // Keep all other existing tab data (clientSave, selectedKeys, etc.) unchanged
        }
      } catch (error) {
        console.error('Error loading existing document:', error);
        // Don't reset on error - preserve existing state
      }
    } else {
      // No operation name - DON'T reset, just ensure transformerCode is set if not present
      const currentTabData = useAppStore.getState().tabData[activeTabIndex];
      if (!currentTabData?.transformerCode) {
        useAppStore.getState().setTabData(activeTabIndex, { transformerCode: '' });
      }
      // Keep all other existing tab data unchanged
    }
  },

  reset: () => {
    // Only reset utility fields - save control fields are now per-tab and persist
    set({
      treeNodes: [],
      processedDataTreeNodes: [],
    });
    // Note: This reset no longer clears save control fields since they're per-tab
    // Tab data persists even when this is called
  },
}));

