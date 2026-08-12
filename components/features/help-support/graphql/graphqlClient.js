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

function getGraphQLConfig() {
  const endpointUrl =
    process.env.NEXT_PUBLIC_HELP_SUPPORT_GRAPHQL_ENDPOINT ||
    process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT_UAT;
  const authToken =
    process.env.NEXT_PUBLIC_HELP_SUPPORT_GRAPHQL_AUTH_TOKEN ||
    process.env.NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_UAT;

  if (!endpointUrl || !authToken) {
    throw new Error("Help Support GraphQL endpoint or token is not configured.");
  }

  return { endpointUrl, authToken };
}

function cacheKey(query, variables) {
  return JSON.stringify({ query, variables });
}

export function clearHelpDeskGraphQLCache() {
  responseCache.clear();
}

export async function executeHelpDeskGraphQL(query, variables = {}, options = {}) {
  const { cache = false, ttl = CACHE_TTL_MS } = options;
  const key = cache ? cacheKey(query, variables) : null;
  const now = Date.now();

  if (key) {
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > now) return cached.data;
    responseCache.delete(key);
  }

  const { endpointUrl, authToken } = getGraphQLConfig();
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authToken,
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
