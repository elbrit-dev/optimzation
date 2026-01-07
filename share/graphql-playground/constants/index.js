// GraphQL Endpoint Configuration
export const GRAPHQL_ENDPOINTS = {
  UAT: process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT_UAT,
  ERP: process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT_ERP,
};

// Firestore Collections
export const FIRESTORE_COLLECTIONS = {
  GQL: 'gql',
};

// Query Types
export const QUERY_TYPES = {
  QUERY: 'Query',
  MUTATION: 'Mutation',
  SUBSCRIPTION: 'Subscription',
};

// Default Auth Token
export const DEFAULT_AUTH_TOKEN = '';

// Endpoint-specific Auth Tokens
export const ENDPOINT_TOKENS = {
  UAT: process.env.NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_UAT || '',
  ERP: process.env.NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_ERP || '',
};

// Get initial endpoint configuration
export const getInitialEndpoint = () => {
  const uatUrl = GRAPHQL_ENDPOINTS.UAT;
  const erpUrl = GRAPHQL_ENDPOINTS.ERP;

  // Prefer UAT if available, otherwise use ERP
  if (uatUrl) {
    return { name: 'UAT', code: uatUrl };
  }
  if (erpUrl) {
    return { name: 'ERP', code: erpUrl };
  }
  return null;
};

// Get endpoint options
export const getEndpointOptions = () => {
  const options = [];
  if (GRAPHQL_ENDPOINTS.UAT) {
    options.push({ name: 'UAT', code: GRAPHQL_ENDPOINTS.UAT });
  }
  if (GRAPHQL_ENDPOINTS.ERP) {
    options.push({ name: 'ERP', code: GRAPHQL_ENDPOINTS.ERP });
  }
  return options;
};

// Get endpoint configuration from urlKey
export const getEndpointFromUrlKey = (urlKey) => {
  if (!urlKey) return null;
  
  const upperKey = urlKey.toUpperCase();
  if (upperKey === 'UAT' && GRAPHQL_ENDPOINTS.UAT) {
    return { name: 'UAT', code: GRAPHQL_ENDPOINTS.UAT };
  }
  if (upperKey === 'ERP' && GRAPHQL_ENDPOINTS.ERP) {
    return { name: 'ERP', code: GRAPHQL_ENDPOINTS.ERP };
  }
  return null;
};

// Get endpoint URL and token from urlKey
export const getEndpointConfigFromUrlKey = (urlKey) => {
  const endpoint = getEndpointFromUrlKey(urlKey);
  if (!endpoint) return { endpointUrl: null, authToken: null };
  
  return {
    endpointUrl: endpoint.code,
    authToken: ENDPOINT_TOKENS[endpoint.name] || '',
  };
};

