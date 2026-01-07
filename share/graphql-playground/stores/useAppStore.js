import { create } from 'zustand';
import { getInitialEndpoint, ENDPOINT_TOKENS } from '../constants';

/**
 * Global application store for GraphQL Playground
 * Manages: auth token, endpoint selection, table mode, response data
 */
export const useAppStore = create((set, get) => ({
  // Auth token - initialize with token for initial endpoint
  authToken: (() => {
    const initialEndpoint = getInitialEndpoint();
    const endpointName = initialEndpoint?.name || '';
    return ENDPOINT_TOKENS[endpointName] || '';
  })(),
  setAuthToken: (token) => set({ authToken: token }),

  // Password visibility
  showPassword: false,
  setShowPassword: (show) => set({ showPassword: show }),
  toggleShowPassword: () => set((state) => ({ showPassword: !state.showPassword })),

  // Endpoint selection
  selectedEndpoint: getInitialEndpoint(),
  endpointUrl: getInitialEndpoint()?.code || '',
  setSelectedEndpoint: (endpoint) => {
    // Automatically set the token based on the selected endpoint
    const endpointName = endpoint?.name || '';
    const token = ENDPOINT_TOKENS[endpointName] || '';
    
    set({
      selectedEndpoint: endpoint,
      endpointUrl: endpoint?.code || '',
      authToken: token,
      tabData: {}, // Reset all tabs when endpoint changes
    });
  },

  // Query execution state per tab
  // Map of tabIndex -> { hasSuccessfulQuery: boolean, transformedData: object, transformerCode: string }
  tabData: {}, // { [tabIndex]: { hasSuccessfulQuery: boolean, transformedData: object | null, transformerCode: string } }
  setTabData: (tabIndex, data) => 
    set((state) => ({
      tabData: {
        ...state.tabData,
        [tabIndex]: {
          ...state.tabData[tabIndex],
          ...data,
        },
      },
    })),
  getTabData: (tabIndex) => {
    const state = get();
    return state.tabData[tabIndex] || { hasSuccessfulQuery: false, transformedData: null, transformerCode: '' };
  },

  // GraphiQL editor state (synced from GraphiQL context)
  graphiQLState: {
    queryString: '',
    variablesString: '',
    activeTabIndex: 0,
    queryEditor: null,
    variableEditor: null,
  },
  setGraphiQLState: (state) => 
    set((currentState) => ({
      graphiQLState: {
        ...currentState.graphiQLState,
        ...state,
      },
    })),
}));

