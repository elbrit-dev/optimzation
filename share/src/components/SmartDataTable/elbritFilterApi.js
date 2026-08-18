import { resolveApiConfig } from './apiRegistry.js';

const _dimMapCache = new Map(); // baseUrl → Promise<{ [key]: displayName }>

// A report's filter key is not always this API's dimension slug. Stock Coverage Summary
// keys its Item dimension `item_code` (matching its own filter_map), while the API calls
// that dimension "Item" → `item`, so the raw lookup misses and the tab renders empty.
// Scope: this bridge is for elbrit_sales_filter_api only — the keys sent back to the
// report itself must stay exactly as the report emitted them.
const DIMENSION_KEY_ALIASES = { item_code: 'item' };

/**
 * Maps a report filter key onto a key present in the dimension map.
 * Exact match first, then an explicit alias, then ERPNext's `_code`/`_name` suffix
 * stripped off (so `item_code` and `item_name` both reach "Item"). Every branch is
 * guarded on the dimension existing, so this can only turn a guaranteed miss into a
 * hit — a key that already resolves is never redirected.
 */
function resolveDimensionKey(dimensionMap, key) {
  if (dimensionMap[key]) return key;

  const alias = DIMENSION_KEY_ALIASES[key];
  if (alias && dimensionMap[alias]) return alias;

  const stripped = key.replace(/_(code|name)$/, '');
  if (stripped !== key && dimensionMap[stripped]) return stripped;

  return key;
}

/** Scan _controls outputs for the first { start, end } date-range control. */
export function resolveControlDateRange(controls = {}) {
  for (const output of Object.values(controls)) {
    if (output && (output.start != null || output.end != null)) {
      return { from_date: output.start ?? undefined, to_date: output.end ?? undefined };
    }
  }
  return {};
}

async function getDimensionMap(baseUrl, headers) {
  if (!_dimMapCache.has(baseUrl)) {
    _dimMapCache.set(baseUrl, (async () => {
      const res = await fetch(`${baseUrl}/api/method/elbrit_sales_filter_api`, {
        credentials: 'include',
        headers,
      });
      if (!res.ok) throw new Error(`elbrit_sales_filter_api config failed: HTTP ${res.status}`);
      const json = await res.json();
      const dims = json.message?.available_dimensions ?? [];
      return Object.fromEntries(
        dims.map(name => [name.toLowerCase().replace(/\s+/g, '_'), name])
      );
    })());
  }
  return _dimMapCache.get(baseUrl);
}

/**
 * Fetches filter values for a sidebar dimension via the elbrit_sales_filter_api REST endpoint.
 * Supports cascade: currentFilters from other dimensions are passed as query params,
 * so selecting a department will narrow the available HQs, customers, etc.
 *
 * @param {object} rawApiConfig  — same shape as graphqlQueryReportDataSource (urlKey / endpoint / token)
 * @param {string} key           — dimension key (e.g. "hq", "department", "item_group")
 * @param {{ page?, pageLength?, search?, currentFilters?, dateRange?: { from_date?, to_date? } }} opts
 */
export async function fetchElbritFilterValues(rawApiConfig, key, { page = 1, pageLength = 20, search = '', currentFilters = {}, dateRange = {} } = {}) {
  const { endpoint, token } = await resolveApiConfig(rawApiConfig);
  const baseUrl = endpoint ? new URL(endpoint).origin : '';
  const headers = token ? { Authorization: `token ${token}` } : {};

  const dimensionMap = await getDimensionMap(baseUrl, headers);
  const dimensionName = dimensionMap[resolveDimensionKey(dimensionMap, key)];
  if (!dimensionName) return { items: [], hasMore: false };

  const params = new URLSearchParams({ dimensions: dimensionName, limit: page * pageLength });
  if (search) params.set('search', search);

  // Cascade params are named by dimension too, so they need the same bridging — otherwise
  // an `item_code` selection is sent under a name the API ignores and the other tabs
  // silently fail to narrow.
  for (const [k, v] of Object.entries(currentFilters)) {
    if (k !== key && v?.length) params.set(resolveDimensionKey(dimensionMap, k), v.join(','));
  }

  if (dateRange.from_date) params.set('from_date', dateRange.from_date);
  if (dateRange.to_date)   params.set('to_date', dateRange.to_date);

  const res = await fetch(`${baseUrl}/api/method/elbrit_sales_filter_api?${params}`, {
    credentials: 'include',
    headers,
  });
  if (!res.ok) throw new Error(`elbrit_sales_filter_api failed: HTTP ${res.status}`);
  const json = await res.json();

  const dimData = json.message?.dimensions?.[dimensionName];
  if (!dimData) return { items: [], hasMore: false };

  const allValues = dimData.values;
  const start = (page - 1) * pageLength;
  return {
    items: allValues.slice(start, start + pageLength)
      .map(v => ({ value: v.value, label: v.value, count: v.line_count })),
    hasMore: allValues.length >= page * pageLength,
  };
}
