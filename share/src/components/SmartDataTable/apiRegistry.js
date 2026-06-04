import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';

/**
 * Resolves the final { endpoint, token } for a Frappe API call.
 *
 * If urlKey is provided (e.g. "DEV"), looks up the Firebase token registry:
 *   - Derives baseUrl from the stored GraphQL endpoint (URL.origin)
 *   - Builds full endpoint: baseUrl + relative path
 *   - Falls back to the registry token when none given in config
 *
 * If no urlKey, passes endpoint and token through unchanged.
 */
export async function resolveApiConfig({ urlKey, endpoint, token, ...rest }) {
  if (!urlKey) {
    return { endpoint, token: token ?? '', ...rest };
  }

  const { endpointUrl, authToken } = await getEndpointConfigFromUrlKeyAsync(urlKey);

  const baseUrl = endpointUrl ? new URL(endpointUrl).origin : '';

  const resolvedEndpoint = baseUrl && endpoint?.startsWith('/')
    ? baseUrl + endpoint
    : (endpoint ?? endpointUrl ?? '');

  // Strip "token " prefix if the registry stored it that way
  const rawToken = token || authToken || '';
  const resolvedToken = rawToken.startsWith('token ') ? rawToken.slice(6) : rawToken;

  return { endpoint: resolvedEndpoint, token: resolvedToken, ...rest };
}
