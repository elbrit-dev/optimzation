import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';

/**
 * Resolves the final { endpoint, token } for a Frappe API call.
 *
 * If urlKey is provided (e.g. "DEV"), looks up the Firebase registry to derive
 * the base URL for the endpoint. Token is NOT pulled from the registry —
 * it must be supplied explicitly (via reportConfig.api.token or page-level overrides).
 *
 * If no urlKey, passes endpoint and token through unchanged.
 */
export async function resolveApiConfig({ urlKey, endpoint, token, ...rest }) {
  if (!urlKey) {
    return { endpoint, token: token ?? '', ...rest };
  }

  const { endpointUrl } = await getEndpointConfigFromUrlKeyAsync(urlKey);

  const baseUrl = endpointUrl ? new URL(endpointUrl).origin : '';

  const resolvedEndpoint = baseUrl && endpoint?.startsWith('/')
    ? baseUrl + endpoint
    : (endpoint ?? endpointUrl ?? '');

  const rawToken = token ?? '';
  const resolvedToken = rawToken.startsWith('token ') ? rawToken.slice(6) : rawToken;

  return { endpoint: resolvedEndpoint, token: resolvedToken, ...rest };
}
