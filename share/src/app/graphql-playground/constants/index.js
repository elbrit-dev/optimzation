import { firestoreService } from '../services/firestoreService';

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

let globalTokenRowsCache = null;
let globalTokenRowsPromise = null;

function sanitizeTokenRows(rows) {
  if (!Array.isArray(rows)) return [];
  const cleaned = rows
    .map((row) => ({
      name: String(row?.name || '').trim().toUpperCase(),
      endpoint: String(row?.endpoint || '').trim(),
      token: String(row?.token || '').trim(),
      isDefault: Boolean(row?.isDefault),
    }))
    .filter((row) => row.name && row.endpoint);

  if (cleaned.length === 0) return [];
  let hasDefault = false;
  const normalized = cleaned.map((row) => {
    if (row.isDefault && !hasDefault) {
      hasDefault = true;
      return row;
    }
    return { ...row, isDefault: false };
  });
  if (!hasDefault) {
    normalized[0] = { ...normalized[0], isDefault: true };
  }
  return normalized;
}

function getEffectiveRows() {
  return globalTokenRowsCache || [];
}

function ensureRows(rows) {
  if (!rows || rows.length === 0) {
    throw new Error('No global tokens configured. Please add tokens in /tokens.');
  }
  return rows;
}

export function getCachedGlobalTokenRows() {
  return globalTokenRowsCache || [];
}

export async function refreshGlobalTokenRows(force = false) {
  if (!force && globalTokenRowsCache) return globalTokenRowsCache;
  if (!force && globalTokenRowsPromise) return globalTokenRowsPromise;
  globalTokenRowsPromise = (async () => {
    try {
      const rows = await firestoreService.loadGlobalTokens();
      globalTokenRowsCache = sanitizeTokenRows(rows);
      return globalTokenRowsCache;
    } catch {
      globalTokenRowsCache = [];
      return globalTokenRowsCache;
    } finally {
      globalTokenRowsPromise = null;
    }
  })();
  return globalTokenRowsPromise;
}

export async function saveGlobalTokenRows(rows) {
  const saved = await firestoreService.saveGlobalTokens(rows);
  globalTokenRowsCache = sanitizeTokenRows(saved);
  return globalTokenRowsCache;
}

export function clearGlobalTokenRowsCache() {
  globalTokenRowsCache = null;
}

function getDefaultRow(rows) {
  if (!rows || rows.length === 0) return null;
  return rows.find((row) => row.isDefault) || rows[0];
}

// Get initial endpoint configuration
export const getInitialEndpoint = () => {
  const defaultRow = getDefaultRow(getEffectiveRows());
  if (defaultRow?.endpoint) {
    return { name: defaultRow.name, code: defaultRow.endpoint };
  }
  return null;
};

export const getInitialEndpointAsync = async () => {
  const rows = ensureRows(await refreshGlobalTokenRows());
  const defaultRow = getDefaultRow(rows);
  if (defaultRow?.endpoint) {
    return { name: defaultRow.name, code: defaultRow.endpoint };
  }
  throw new Error('No default global token endpoint configured.');
};

// Get endpoint options
export const getEndpointOptions = () => {
  return getEffectiveRows().map((row) => ({ name: row.name, code: row.endpoint }));
};

export const getEndpointOptionsAsync = async () => {
  const rows = ensureRows(await refreshGlobalTokenRows());
  return rows.map((row) => ({ name: row.name, code: row.endpoint }));
};

// Get endpoint configuration from urlKey
export const getEndpointFromUrlKey = (urlKey) => {
  const rows = getEffectiveRows();
  if (!urlKey) {
    const fallback = getDefaultRow(rows);
    return fallback ? { name: fallback.name, code: fallback.endpoint } : null;
  }
  const upperKey = String(urlKey).toUpperCase();
  const match = rows.find((row) => row.name === upperKey);
  if (match) return { name: match.name, code: match.endpoint };
  const fallback = getDefaultRow(rows);
  if (fallback) return { name: fallback.name, code: fallback.endpoint };
  return null;
};

export const getEndpointFromUrlKeyAsync = async (urlKey) => {
  const effectiveRows = ensureRows(await refreshGlobalTokenRows());
  if (!urlKey) {
    const fallback = getDefaultRow(effectiveRows);
    return fallback ? { name: fallback.name, code: fallback.endpoint } : null;
  }
  const upperKey = String(urlKey).toUpperCase();
  const match = effectiveRows.find((row) => row.name === upperKey);
  if (match) return { name: match.name, code: match.endpoint };
  const fallback = getDefaultRow(effectiveRows);
  return fallback ? { name: fallback.name, code: fallback.endpoint } : null;
};

// Get endpoint URL and token from urlKey
export const getEndpointConfigFromUrlKey = (urlKey) => {
  const endpoint = getEndpointFromUrlKey(urlKey);
  if (!endpoint) return { endpointUrl: null, authToken: null, name: null };
  const row = getEffectiveRows().find((item) => item.name === endpoint.name);
  return { endpointUrl: endpoint.code, authToken: row?.token || '', name: endpoint.name };
};

export const getEndpointConfigFromUrlKeyAsync = async (urlKey) => {
  const endpoint = await getEndpointFromUrlKeyAsync(urlKey);
  if (!endpoint) return { endpointUrl: null, authToken: null, name: null };
  const effectiveRows = ensureRows(await refreshGlobalTokenRows());
  const row = effectiveRows.find((item) => item.name === endpoint.name);
  return { endpointUrl: endpoint.code, authToken: row?.token || '', name: endpoint.name };
};
