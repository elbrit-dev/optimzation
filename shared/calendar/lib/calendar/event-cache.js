/**
 * Simple in-memory cache
 * Keyed by normalized date range
 */
const eventRangeCache = new Map();

export function getCachedEvents(cacheKey) {
  return eventRangeCache.get(cacheKey);
}

export function setCachedEvents(cacheKey, events) {
  eventRangeCache.set(cacheKey, events);
}

export function clearEventCache() {
  eventRangeCache.clear();
}
