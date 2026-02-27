import {
  getEndpoints,
  getTokens,
  getEndpointList,
  getDefaultEndpoint,
  getEndpointByKey,
  getEndpointConfig as getEndpointConfigFromLib,
} from '@/lib/graphql-endpoints';

// GraphQL Endpoint Configuration (dynamic from env)
export const GRAPHQL_ENDPOINTS = getEndpoints();

// Firestore Collection - uses GQL_COLLECTION env (singular)
export const DEFAULT_GQL_COLLECTION = process.env.NEXT_PUBLIC_GQL_COLLECTION || 'gql';
export const GQL_COLLECTIONS = [DEFAULT_GQL_COLLECTION];

export const FIRESTORE_COLLECTIONS = {
  GQL: DEFAULT_GQL_COLLECTION,
};

// Query Types
export const QUERY_TYPES = {
  QUERY: 'Query',
  MUTATION: 'Mutation',
  SUBSCRIPTION: 'Subscription',
};

// Default Auth Token
export const DEFAULT_AUTH_TOKEN = '';

// Endpoint-specific Auth Tokens (dynamic from env)
export const ENDPOINT_TOKENS = getTokens();

// Get initial endpoint configuration
export const getInitialEndpoint = () => getDefaultEndpoint();

// Get endpoint options
export const getEndpointOptions = () => getEndpointList();

// Get endpoint configuration from urlKey
export const getEndpointFromUrlKey = (urlKey) => getEndpointByKey(urlKey);

// Get endpoint URL and token from urlKey
export const getEndpointConfigFromUrlKey = (urlKey) => {
  const config = getEndpointConfigFromLib(urlKey);
  if (!config.endpointUrl) return { endpointUrl: null, authToken: null };
  return {
    endpointUrl: config.endpointUrl,
    authToken: config.authToken || '',
  };
};

