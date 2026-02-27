import { getInitialEndpoint } from '@/app/graphql-playground/constants';
import { create } from 'zustand';

/**
 * Store for GraphQL Playground v2
 * Manages query, variables, response state, schema, and environment
 */
export const usePlaygroundStore = create((set, get) => {
  // Get initial environment
  const initialEndpoint = getInitialEndpoint();
  const initialEnvironment = initialEndpoint?.name || 'UAT';

  const getWorkspaceDefaults = () => ({
    query: '',
    variables: '{}',
    response: '',
    transformerFunction: '',
    rawTableData: null,
    transformedTableData: null,
    transformerLogs: [],
    executeTrigger: 0,
    flushTransformerRequested: 0,
    flushQueryRequested: 0,
    flushVariablesRequested: 0,
  });

  return {
    // Workspace data
    ...getWorkspaceDefaults(),
    isTransforming: false,
    setQuery: (query) => set({ query }),
    setVariables: (variables) => set({ variables }),
    setResponse: (response) => set({ response }),
    executeTrigger: 0,
    incrementExecuteTrigger: () => set((s) => ({ executeTrigger: (s.executeTrigger ?? 0) + 1 })),
    flushTransformerRequested: 0,
    flushQueryRequested: 0,
    flushVariablesRequested: 0,
    requestTransformerFlush: () => set((s) => ({ flushTransformerRequested: (s.flushTransformerRequested ?? 0) + 1 })),
    requestQueryFlush: () => set((s) => ({ flushQueryRequested: (s.flushQueryRequested ?? 0) + 1 })),
    requestVariablesFlush: () => set((s) => ({ flushVariablesRequested: (s.flushVariablesRequested ?? 0) + 1 })),
    /** Flush all editors to store on demand (Execute, tab switch, etc.) */
    requestAllEditorsFlush: () => set((s) => ({
      flushTransformerRequested: (s.flushTransformerRequested ?? 0) + 1,
      flushQueryRequested: (s.flushQueryRequested ?? 0) + 1,
      flushVariablesRequested: (s.flushVariablesRequested ?? 0) + 1,
    })),
    setTransformerFunction: (transformerFunction) => set({ transformerFunction }),
    setRawTableData: (rawTableData) => set({ rawTableData }),
    setTransformedTableData: (transformedTableData) => set({ transformedTableData }),
    setIsTransforming: (isTransforming) => set({ isTransforming }),
    transformerLogs: [],
    setTransformerLogs: (arg) => set((state) => ({
      transformerLogs: typeof arg === 'function' ? arg(state.transformerLogs) : arg,
    })),
    clearTransformerLogs: () => set({ transformerLogs: [] }),

    // Dirty tracking for workspace edits
    isDirty: false,
    markDirty: () => set({ isDirty: true }),
    clearDirty: () => set({ isDirty: false }),

    // Workspace reset tracking
    workspaceRevision: 0,
    resetWorkspace: () => set((state) => ({
        ...getWorkspaceDefaults(),
        isDirty: false,
        isTransforming: false,
        workspaceRevision: state.workspaceRevision + 1,
      })),

    // Environment selector
    selectedEnvironment: initialEnvironment,
    setSelectedEnvironment: (environment) => set({ 
      selectedEnvironment: environment,
      schema: null, // Clear schema when environment changes
      schemaLoading: false
    }),

    // GraphQL schema (cached per environment)
    schema: null,
    setSchema: (schema) => set({ schema, schemaLoading: false }),

    // Schema loading state
    schemaLoading: false,
    setSchemaLoading: (loading) => set({ schemaLoading: loading }),
  };
});
