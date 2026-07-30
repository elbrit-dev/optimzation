/**
 * Simple in-memory cache
 * Keyed by normalized date range
 */
const eventRangeCache = new Map();

// Bumped on every invalidation. A fetch that was already in flight when the
// cache was dropped must not write its (now stale) result back afterwards —
// otherwise hitting "Sync" while the initial hydration is still running
// re-caches the pre-sync snapshot and the button looks like it did nothing.
let cacheGeneration = 0;

export function getEventCacheGeneration() {
  return cacheGeneration;
}

export function getCachedEvents(cacheKey) {
  return eventRangeCache.get(cacheKey);
}

export function setCachedEvents(cacheKey, events, generation) {
  // Callers that captured a generation before fetching are ignored once that
  // generation has been superseded.
  if (generation !== undefined && generation !== cacheGeneration) {
    return;
  }

  eventRangeCache.set(cacheKey, events);
}

export function clearEventCache() {
  cacheGeneration += 1;
  eventRangeCache.clear();
}
