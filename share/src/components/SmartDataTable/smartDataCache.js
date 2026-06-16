const DEFAULT_TTL_MS  = 5 * 60 * 1000;
const DEFAULT_MAX_SIZE = 100;

export class SmartDataCache {
  constructor({ ttlMs = DEFAULT_TTL_MS, maxSize = DEFAULT_MAX_SIZE } = {}) {
    this._cache   = new Map(); // insertion-order Map acts as LRU queue
    this._ttlMs   = ttlMs;
    this._maxSize = maxSize;
  }

  /** Stable string key from the full request fingerprint. */
  static buildKey(apiVars, { filters, sortBy, pagination, viewParams }) {
    return JSON.stringify({ apiVars, filters, sortBy, pagination, viewParams });
  }

  /** Returns cached result or null (miss or expired). Promotes hit to MRU position. */
  get(key) {
    const entry = this._cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this._ttlMs) {
      this._cache.delete(key);
      return null;
    }
    // Promote to most-recently-used
    this._cache.delete(key);
    this._cache.set(key, entry);
    return entry.result;
  }

  /** Stores result. Evicts LRU entry when at capacity. */
  set(key, result) {
    if (this._cache.has(key)) this._cache.delete(key); // refresh position
    else if (this._cache.size >= this._maxSize) {
      this._cache.delete(this._cache.keys().next().value); // evict LRU
    }
    this._cache.set(key, { result, ts: Date.now() });
  }

  /** Invalidates all entries (used by manual refresh). */
  clear() { this._cache.clear(); }
}
