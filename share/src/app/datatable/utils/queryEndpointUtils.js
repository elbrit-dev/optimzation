import { getEndpointConfigFromUrlKey, getInitialEndpoint } from '@/app/graphql-playground/constants';

export function getEndpointAndAuth(queryDocument) {
  let endpointUrl;
  let authToken;

  if (queryDocument?.urlKey) {
    const config = getEndpointConfigFromUrlKey(queryDocument.urlKey);
    endpointUrl = config.endpointUrl;
    authToken = config.authToken;
  }
  if (!endpointUrl) {
    const defaultEndpoint = getInitialEndpoint();
    if (defaultEndpoint) {
      const config = getEndpointConfigFromUrlKey(defaultEndpoint.name);
      endpointUrl = config.endpointUrl || defaultEndpoint.code;
      authToken = config.authToken ?? null;
    }
  }
  return { endpointUrl, authToken };
}
