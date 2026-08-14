const CACHE_TTL_MS = 60_000;
const responseCache = new Map();

function parseGraphQLError(payload, status) {
  if (payload?._server_messages) {
    try {
      const messages = JSON.parse(payload._server_messages);
      if (messages?.[0]) {
        const parsed = JSON.parse(messages[0]);
        if (parsed?.message) return parsed.message.replace(/<[^>]*>/g, "");
      }
    } catch {
      // Fall through to GraphQL messages.
    }
  }

  if (payload?.errors?.length) {
    return payload.errors.map((error) => error.message).filter(Boolean).join("; ");
  }

  return payload?.message || `GraphQL request failed with HTTP ${status}`;
}

function getGraphQLConfig(config = {}) {
  const endpointUrl = config.endpointUrl || config.url || "";
  const authToken = config.authToken || config.token || "";

  if (!endpointUrl || !authToken) {
    throw new Error("Help Support GraphQL endpoint and token must be passed as props.");
  }

  return { endpointUrl, authToken };
}

function cacheKey(query, variables, config) {
  // The token is part of the key so a response fetched with one user's token is
  // never replayed to another — ERP permissions differ per token.
  return JSON.stringify({ endpointUrl: config.endpointUrl, authToken: config.authToken, query, variables });
}

export function clearHelpDeskGraphQLCache() {
  responseCache.clear();
}

export async function executeHelpDeskGraphQL(query, variables = {}, options = {}) {
  const { cache = false, ttl = CACHE_TTL_MS } = options;
  const graphQLConfig = getGraphQLConfig(options.config);
  const key = cache ? cacheKey(query, variables, graphQLConfig) : null;
  const now = Date.now();

  if (key) {
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > now) return cached.data;
    responseCache.delete(key);
  }

  const response = await fetch(graphQLConfig.endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: graphQLConfig.authToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.errors?.length) {
    throw new Error(parseGraphQLError(payload, response.status));
  }

  if (key) responseCache.set(key, { data: payload.data, expiresAt: now + ttl });
  return payload.data;
}

export async function executeHelpDeskMethod(methodName, body = {}, options = {}) {
  const graphQLConfig = getGraphQLConfig(options.config);
  const baseUrl = graphQLConfig.endpointUrl.replace(/\/api\/method\/graphql$/, "");
  const response = await fetch(`${baseUrl}/api/method/${methodName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: graphQLConfig.authToken,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.exc || payload.exception) {
    throw new Error(parseGraphQLError(payload, response.status));
  }

  return payload.message ?? payload;
}
