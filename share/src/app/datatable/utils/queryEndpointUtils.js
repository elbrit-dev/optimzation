import { getEndpointConfigFromUrlKeyAsync, getInitialEndpointAsync } from '@/app/graphql-playground/constants';

export async function getEndpointAndAuth(queryDocument) {
  let endpointUrl;
  let authToken;

  if (queryDocument?.urlKey) {
    const config = await getEndpointConfigFromUrlKeyAsync(queryDocument.urlKey);
    endpointUrl = config.endpointUrl;
    authToken = config.authToken;
  }
  if (!endpointUrl) {
    const defaultEndpoint = await getInitialEndpointAsync();
    if (defaultEndpoint) {
      const config = await getEndpointConfigFromUrlKeyAsync(defaultEndpoint.name);
      endpointUrl = config.endpointUrl || defaultEndpoint.code;
      authToken = config.authToken ?? null;
    }
  }
  return { endpointUrl, authToken };
}

/**
 * Same as getEndpointAndAuth, but when graphqlToken is a non-empty string (after trim),
 * use it as Authorization instead of env/urlKey-derived token.
 * @param {object|null|undefined} queryDocument
 * @param {string|null|undefined} graphqlToken
 * @returns {{ endpointUrl: string|null|undefined, authToken: string|null|undefined }}
 */
export async function getEndpointAndAuthWithTokenOverride(queryDocument, graphqlToken) {
  const base = await getEndpointAndAuth(queryDocument);
  const trimmed = graphqlToken != null && typeof graphqlToken === 'string' ? graphqlToken.trim() : '';
  if (trimmed) {
    return { ...base, authToken: trimmed };
  }
  return base;
}
