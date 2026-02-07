import { getInitialEndpoint } from '@/app/graphql-playground/constants';
import { create } from 'zustand';

/**
 * Store for GraphQL Playground v2
 * Manages query, variables, response state, schema, and environment
 */
export const usePlaygroundStore = create((set) => {
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
  });

  return {
    // Workspace data
    ...getWorkspaceDefaults(),
    isTransforming: false,
    setQuery: (query) => set({ query }),
    setVariables: (variables) => set({ variables }),
    setResponse: (response) => set({ response }),
    setTransformerFunction: (transformerFunction) => set({ transformerFunction }),
    setRawTableData: (rawTableData) => set({ rawTableData }),
    setTransformedTableData: (transformedTableData) => set({ transformedTableData }),
    setIsTransforming: (isTransforming) => set({ isTransforming }),

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
