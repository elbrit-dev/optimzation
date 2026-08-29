import { resolveApiConfig } from './apiRegistry.js';

const _dimMapCache = new Map(); // baseUrl → Promise<{ [key]: displayName }>

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
  const dimensionName = dimensionMap[key];
  if (!dimensionName) return { items: [], hasMore: false };

  const params = new URLSearchParams({ dimensions: dimensionName, limit: page * pageLength });
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
