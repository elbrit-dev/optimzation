import { create } from 'zustand';
import { firestoreService } from '../services/firestoreService';
import { findNodeKeyFromIndexQuery } from '../utils/query-matcher';
import { parseQueryToTreeNodes, extractOperationName } from '../utils/graphql-parser';
import { useTableDialogStore } from './useTableDialogStore';
import { useAppStore } from './useAppStore';
import { getEndpointFromUrlKey } from '../constants';

/**
 * Save controls store
 * Manages: client save mode, tree nodes, selected keys, month selection
 */
export const useSaveControlsStore = create((set, get) => ({
  // Client save toggle
  clientSave: false,
  setClientSave: (value) => set({ clientSave: value }),
  toggleClientSave: () => set((state) => ({ clientSave: !state.clientSave })),

  // Tree nodes
  treeNodes: [],
  setTreeNodes: (nodes) => set({ treeNodes: nodes }),

  // Selected keys
  selectedKeys: null,
  setSelectedKeys: (keys) => set({ selectedKeys: keys }),

  // Expanded keys
  expandedKeys: {},
  setExpandedKeys: (keys) => set({ expandedKeys: keys }),

  // Month selection
  month: null,
  setMonth: (month) => set({ month }),

  // Month index keys
  monthIndexKeys: null,
  setMonthIndexKeys: (keys) => set({ monthIndexKeys: keys }),

  // Month index expanded keys
  monthIndexExpandedKeys: {},
  setMonthIndexExpandedKeys: (keys) => set({ monthIndexExpandedKeys: keys }),

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

          // Restore transformerCode if it exists
          if (data.transformerCode !== undefined) {
            useAppStore.getState().setTabData(activeTabIndex, { transformerCode: data.transformerCode || '' });
          } else {
            useAppStore.getState().setTabData(activeTabIndex, { transformerCode: '' });
          }

          set(updates);
        } else {
          // Reset if no data found
          useAppStore.getState().setTabData(activeTabIndex, { transformerCode: '' });
          set({
            clientSave: false,
            selectedKeys: null,
            expandedKeys: {},
            month: null,
            monthIndexKeys: null,
            monthIndexExpandedKeys: {},
          });
        }
      } catch (error) {
        console.error('Error loading existing document:', error);
      }
      } else {
        // Reset if no operation name
        useAppStore.getState().setTabData(activeTabIndex, { transformerCode: '' });
      set({
        clientSave: false,
        selectedKeys: null,
        expandedKeys: {},
        month: null,
        monthIndexKeys: null,
        monthIndexExpandedKeys: {},
      });
    }
  },

  reset: () => {
    set({
      clientSave: false,
      selectedKeys: null,
      expandedKeys: {},
      month: null,
      monthIndexKeys: null,
      monthIndexExpandedKeys: {},
      treeNodes: [],
    });
  },
}));

