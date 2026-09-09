import { resolveApiConfig } from './apiRegistry.js';
import { logSmartDataEvent } from './smartDataLogger.js';

const _dimMapCache = new Map(); // `${baseUrl}|${config}` → Promise<{ [key]: dimensionName }>

/** Scan _controls outputs for the first { start, end } date-range control. */
export function resolveControlDateRange(controls = {}) {
  for (const output of Object.values(controls)) {
    if (output && (output.start != null || output.end != null)) {
      return { from_date: output.start ?? undefined, to_date: output.end ?? undefined };
    }
  }
  return {};
}

const slug = s => String(s).trim().toLowerCase().replace(/\s+/g, '_');

/**
 * Sidebar filter keys come from _meta.meta_filter_values (e.g. "item_code"), but the API
 * addresses dimensions by display name (e.g. "Item"). Generate every key a dimension name
 * could plausibly be looked up under so both spellings resolve.
 */
function keysForDimension(name) {
  const base = slug(name);
  const bare = base.replace(/_(code|name|id)$/, '');
  return [base, bare, `${bare}_code`, `${bare}_name`, `${bare}_id`];
}

/** Normalise available_dimensions — entries may be plain strings or objects. */
function indexDimensions(raw) {
  const map = {};
  const entries = Array.isArray(raw) ? raw : Object.keys(raw ?? {});
  for (const entry of entries) {
    const name = typeof entry === 'string'
      ? entry
      : (entry?.dimension ?? entry?.name ?? entry?.label);
    if (!name) continue;
    const keys = [
      ...(typeof entry === 'object' ? [entry.filter_key, entry.fieldname].filter(Boolean).map(slug) : []),
      ...keysForDimension(name),
    ];
    for (const k of keys) if (!(k in map)) map[k] = name;
  }
  return map;
}

async function getDimensionMap(baseUrl, headers, config) {
  const cacheKey = `${baseUrl}|${config ?? ''}`;
  if (!_dimMapCache.has(cacheKey)) {
    _dimMapCache.set(cacheKey, (async () => {
      const qs = config ? `?config=${encodeURIComponent(config)}` : '';
      const res = await fetch(`${baseUrl}/api/method/elbrit_sales_filter_api${qs}`, {
        credentials: 'include',
        headers,
      });
      if (!res.ok) throw new Error(`elbrit_sales_filter_api config failed: HTTP ${res.status}`);
      const json = await res.json();
      const msg = json.message ?? {};
      return indexDimensions(msg.available_dimensions ?? msg.dimensions ?? []);
    })().catch(err => { _dimMapCache.delete(cacheKey); throw err; }));
  }
  return _dimMapCache.get(cacheKey);
}

/** Pull the value list out of either the single-dimension or the multi-dimension response shape. */
function extractValues(message, dimensionName) {
  if (Array.isArray(message?.values)) return message.values;
  const byDim = message?.dimensions?.[dimensionName];
  if (Array.isArray(byDim)) return byDim;
  if (Array.isArray(byDim?.values)) return byDim.values;
  return null;
}

/**
 * Fetches filter values for a sidebar dimension via the elbrit_sales_filter_api REST endpoint.
 * Supports cascade: currentFilters from other dimensions are passed as query params,
 * so selecting a department will narrow the available HQs, customers, etc.
 *
 * The endpoint is config-scoped (`config=Elbrit Stock Config`); set `filterConfig` on the
 * report's api block to target one. Without it the endpoint answers from its default config,
 * whose dimensions may not cover this report.
 *
 * @param {object} rawApiConfig  — same shape as graphqlQueryReportDataSource (urlKey / endpoint / token / filterConfig)
 * @param {string} key           — sidebar filter key (e.g. "item_code", "hq", "department")
 * @param {{ page?, pageLength?, search?, currentFilters?, dateRange?: { from_date?, to_date? } }} opts
 */
export async function fetchElbritFilterValues(rawApiConfig, key, { page = 1, pageLength = 20, search = '', currentFilters = {}, dateRange = {} } = {}) {
  if (!rawApiConfig) {
    throw new Error('fetchElbritFilterValues: no api config — the provider has not activated a non-drawer view yet');
  }
  const { endpoint, token, filterConfig } = await resolveApiConfig(rawApiConfig);
  const baseUrl = endpoint ? new URL(endpoint).origin : '';
  const headers = token ? { Authorization: `token ${token}` } : {};

  // Discovery is a convenience, not a dependency: if it fails we still issue the real
  // request with the raw key. Previously a failed discovery threw on every later click
  // (its rejected promise was cached), so no request was ever sent again.
  let dimensionMap = {};
  try {
    dimensionMap = await getDimensionMap(baseUrl, headers, filterConfig);
  } catch (err) {
    logSmartDataEvent('warn', 'filter-search', 'filter-search:dimension-discovery-failed', {
      key, config: filterConfig ?? null, error: err?.message,
    });
  }
  const lookup = slug(key);
  // Fall back to the raw key: the endpoint also accepts a dimension's own filter_key.
  const dimensionName = dimensionMap[lookup]
    ?? dimensionMap[lookup.replace(/_(code|name|id)$/, '')]
    ?? key;

  const params = new URLSearchParams({ dimension: dimensionName, limit: page * pageLength });
  if (filterConfig) params.set('config', filterConfig);
  if (search) params.set('search', search);

  for (const [k, v] of Object.entries(currentFilters)) {
    if (k !== key && v?.length) params.set(k, v.join(','));
  }

  if (dateRange.from_date) params.set('from_date', dateRange.from_date);
  if (dateRange.to_date)   params.set('to_date', dateRange.to_date);

  const res = await fetch(`${baseUrl}/api/method/elbrit_sales_filter_api?${params}`, {
    credentials: 'include',
    headers,
  });
  if (!res.ok) throw new Error(`elbrit_sales_filter_api failed: HTTP ${res.status}`);
  const json = await res.json();

  const allValues = extractValues(json.message, dimensionName);
  if (!allValues) return { items: [], hasMore: false };

  const start = (page - 1) * pageLength;
  return {
    items: allValues.slice(start, start + pageLength)
      .map(v => ({ value: v.value, label: v.value, count: v.line_count })),
    hasMore: allValues.length >= page * pageLength,
  };
}
