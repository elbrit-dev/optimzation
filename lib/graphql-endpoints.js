/**
 * Dynamic GraphQL endpoint configuration from environment variables.
 * Discovers endpoints from NEXT_PUBLIC_GRAPHQL_ENDPOINT_* and tokens from NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_*.
 * Add new environments by adding env vars—no code changes required.
 *
 * Env convention:
 *   NEXT_PUBLIC_GRAPHQL_ENDPOINT_{KEY}=https://...
 *   NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_{KEY}=token
 *   NEXT_PUBLIC_GRAPHQL_DEFAULT_ENDPOINT=UAT  (optional, otherwise first available)
 */

const PREFIX = 'NEXT_PUBLIC_GRAPHQL_ENDPOINT_';
const TOKEN_PREFIX = 'NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_';

/**
 * Discover endpoints from process.env
 * @returns {{ [key: string]: string }}
 */
function discoverEndpoints() {
  const endpoints = {};
  if (typeof process === 'undefined' || !process.env) return endpoints;
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(PREFIX) && value && typeof value === 'string') {
      const suffix = key.slice(PREFIX.length);
      endpoints[suffix] = value;
    }
  }
  return endpoints;
}

/**
 * Discover tokens from process.env (keys must match endpoint keys)
 * @returns {{ [key: string]: string }}
 */
function discoverTokens() {
  const tokens = {};
  if (typeof process === 'undefined' || !process.env) return tokens;
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(TOKEN_PREFIX)) {
      const suffix = key.slice(TOKEN_PREFIX.length);
      tokens[suffix] = value && typeof value === 'string' ? value : '';
    }
  }
  return tokens;
}

/**
 * Get all discovered endpoints
 * @returns {{ [key: string]: string }}
 */
function getEndpoints() {
  return discoverEndpoints();
}

/**
 * Get all discovered tokens
 * @returns {{ [key: string]: string }}
 */
function getTokens() {
  return discoverTokens();
}

/**
 * Get endpoint list for dropdowns: [{ name, code }, ...]
 * @returns {Array<{ name: string, code: string }>}
 */
function getEndpointList() {
  const endpoints = discoverEndpoints();
  return Object.entries(endpoints)
    .filter(([, url]) => url)
    .map(([name, code]) => ({ name, code }));
}

/**
 * Get default endpoint. Uses NEXT_PUBLIC_GRAPHQL_DEFAULT_ENDPOINT if set, else first available.
 * @returns {{ name: string, code: string } | null}
 */
function getDefaultEndpoint() {
  const endpoints = discoverEndpoints();
  const keys = Object.keys(endpoints).filter((k) => endpoints[k]);
  if (keys.length === 0) return null;

  const defaultKey = process.env?.NEXT_PUBLIC_GRAPHQL_DEFAULT_ENDPOINT;
  const key = defaultKey && endpoints[defaultKey] ? defaultKey : keys[0];
  return { name: key, code: endpoints[key] };
}

/**
 * Get endpoint by urlKey (case-insensitive)
 * @param {string} urlKey
 * @returns {{ name: string, code: string } | null}
 */
function getEndpointByKey(urlKey) {
  if (!urlKey || typeof urlKey !== 'string') return null;
  const upperKey = urlKey.toUpperCase();
  const endpoints = discoverEndpoints();
  if (endpoints[upperKey]) {
    return { name: upperKey, code: endpoints[upperKey] };
  }
  return null;
}

/**
 * Get endpoint URL and auth token for a urlKey
 * @param {string} urlKey
 * @returns {{ endpointUrl: string | null, authToken: string }}
 */
function getEndpointConfig(urlKey) {
  const endpoint = getEndpointByKey(urlKey);
  if (!endpoint) return { endpointUrl: null, authToken: '' };

  const tokens = discoverTokens();
  return {
    endpointUrl: endpoint.code,
    authToken: tokens[endpoint.name] || '',
  };
}

module.exports = {
  getEndpoints,
  getTokens,
  getEndpointList,
  getDefaultEndpoint,
  getEndpointByKey,
  getEndpointConfig,
};