import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useEffect } from 'react';
import { SmartDataCache } from '../smartDataCache.js';
import { SmartDataProviderImpl } from '../SmartDataProvider.jsx';
import { useSmartDataContext } from '../SmartDataContext.js';

// Each SmartDataProvider owns its own store instance, so tests reach it through the
// context captured at render time rather than importing a module-level store.
let activeStore = null;
const providerStore = () => activeStore;

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@plasmicapp/loader-nextjs', () => ({
  DataProvider: ({ children }) => children,
}));
vi.mock('primereact/sidebar', () => ({ Sidebar: () => null }));
vi.mock('../DrawerTabBar',    () => ({ DrawerTabBar: () => null }));
vi.mock('../SmartDataTable',  () => ({ SmartDataTable: () => null }));
vi.mock('@/app/report-table/components/ReportControls', () => ({
  ReportControls: () => null,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RESULT_A = { rows: [{ id: 1, name: 'Alpha' }], totalRecords: 1 };
const RESULT_B = { rows: [{ id: 2, name: 'Beta' }],  totalRecords: 1 };

// =============================================================================
// Section 1 — SmartDataCache unit tests (pure JS, no React)
// =============================================================================

describe('SmartDataCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── get() ──────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns null on a cache miss', () => {
      const cache = new SmartDataCache();
      expect(cache.get('no-such-key')).toBeNull();
    });

    it('returns the stored result on a valid cache hit', () => {
      const cache = new SmartDataCache({ ttlMs: 5000, maxSize: 10 });
      cache.set('k', RESULT_A);
      expect(cache.get('k')).toBe(RESULT_A);
    });

    it('returns the result 1 ms before TTL expires', () => {
      const cache = new SmartDataCache({ ttlMs: 1000, maxSize: 10 });
      cache.set('k', 'data');
      vi.setSystemTime(999);
      expect(cache.get('k')).toBe('data');
    });

    it('returns the result at exactly ttlMs (condition is strictly >)', () => {
      // Date.now() - ts > ttlMs  →  at exact ttlMs elapsed it is NOT yet stale
      const cache = new SmartDataCache({ ttlMs: 1000, maxSize: 10 });
      cache.set('k', 'data');
      vi.setSystemTime(1000);
      expect(cache.get('k')).toBe('data');
    });

    it('returns null when 1 ms past TTL', () => {
      const cache = new SmartDataCache({ ttlMs: 1000, maxSize: 10 });
      cache.set('k', 'data');
      vi.setSystemTime(1001);
      expect(cache.get('k')).toBeNull();
    });

    it('removes the expired entry so subsequent sets do not count it toward capacity', () => {
      // maxSize=1; set k0, let it expire, then set k1 — no eviction should be needed
      const cache = new SmartDataCache({ ttlMs: 500, maxSize: 1 });
      cache.set('k0', 'v0');
      vi.setSystemTime(501); // k0 expired
      cache.get('k0');        // triggers deletion of the expired entry
      cache.set('k1', 'v1'); // slot is free — no eviction of a live entry
      expect(cache.get('k1')).toBe('v1');
    });

    it('promotes a hit entry to MRU, protecting it from the next eviction', () => {
      const cache = new SmartDataCache({ ttlMs: 60_000, maxSize: 3 });
      cache.set('k0', 'r0');
      cache.set('k1', 'r1');
      cache.set('k2', 'r2');
      // LRU → MRU order: [k0, k1, k2]

      cache.get('k0'); // promotes k0 → new order: [k1, k2, k0]

      cache.set('k3', 'r3'); // evicts k1 (now LRU), not k0
      expect(cache.get('k0')).toBe('r0'); // survived — MRU after promotion
      expect(cache.get('k1')).toBeNull(); // evicted — became LRU after k0 was promoted
      expect(cache.get('k2')).toBe('r2');
      expect(cache.get('k3')).toBe('r3');
    });
  });

  // ── set() ──────────────────────────────────────────────────────────────────

  describe('set()', () => {
    it('stores a result that can be retrieved via get()', () => {
      const cache = new SmartDataCache({ ttlMs: 5000, maxSize: 10 });
      cache.set('k', RESULT_B);
      expect(cache.get('k')).toBe(RESULT_B);
    });

    it('does not evict any entry while below capacity', () => {
      const cache = new SmartDataCache({ ttlMs: 60_000, maxSize: 3 });
      cache.set('k0', 'r0');
      cache.set('k1', 'r1'); // 2 entries, capacity is 3
      expect(cache.get('k0')).toBe('r0');
    });

    it('evicts the LRU entry exactly when capacity is exceeded', () => {
      const cache = new SmartDataCache({ ttlMs: 60_000, maxSize: 2 });
      cache.set('k0', 'r0');
      cache.set('k1', 'r1'); // full: [k0(LRU), k1(MRU)]
      cache.set('k2', 'r2'); // should evict k0
      expect(cache.get('k0')).toBeNull(); // evicted
      expect(cache.get('k1')).toBe('r1');
      expect(cache.get('k2')).toBe('r2');
    });

    it('evicts the correct LRU entry after a get() has promoted an older entry', () => {
      const cache = new SmartDataCache({ ttlMs: 60_000, maxSize: 2 });
      cache.set('k0', 'r0');
      cache.set('k1', 'r1'); // [k0(LRU), k1(MRU)]

      cache.get('k0'); // promotes k0 → [k1(LRU), k0(MRU)]

      cache.set('k2', 'r2'); // evicts k1 (now LRU)
      expect(cache.get('k0')).toBe('r0');  // survived — was MRU
      expect(cache.get('k1')).toBeNull();  // evicted — became LRU
      expect(cache.get('k2')).toBe('r2');
    });

    it('refreshes the MRU position when an existing key is re-set', () => {
      const cache = new SmartDataCache({ ttlMs: 60_000, maxSize: 2 });
      cache.set('k0', 'r0');
      cache.set('k1', 'r1'); // [k0(LRU), k1(MRU)]

      cache.set('k0', 'r0-updated'); // re-set k0 → [k1(LRU), k0(MRU)]

      cache.set('k2', 'r2'); // evicts k1
      expect(cache.get('k0')).toBe('r0-updated');
      expect(cache.get('k1')).toBeNull();
      expect(cache.get('k2')).toBe('r2');
    });

    it('resets the TTL clock when an existing key is re-set', () => {
      const cache = new SmartDataCache({ ttlMs: 1000, maxSize: 10 });
      vi.setSystemTime(0);
      cache.set('k', 'original');

      vi.setSystemTime(600); // halfway through TTL — still valid
      cache.set('k', 'updated'); // re-set restarts TTL from t=600

      vi.setSystemTime(1200); // 1200ms total, 600ms since re-set → NOT expired
      expect(cache.get('k')).toBe('updated');

      vi.setSystemTime(1602); // 1002ms since re-set → expired
      expect(cache.get('k')).toBeNull();
    });
  });

  // ── clear() ────────────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('removes all cached entries', () => {
      const cache = new SmartDataCache({ ttlMs: 60_000, maxSize: 10 });
      cache.set('k0', 'r0');
      cache.set('k1', 'r1');
      cache.clear();
      expect(cache.get('k0')).toBeNull();
      expect(cache.get('k1')).toBeNull();
    });

    it('is safe to call on an empty cache', () => {
      const cache = new SmartDataCache();
      expect(() => {
        cache.clear();
        cache.clear();
      }).not.toThrow();
    });

    it('new entries set after clear() are accessible', () => {
      const cache = new SmartDataCache({ ttlMs: 60_000, maxSize: 10 });
      cache.set('old', 'stale');
      cache.clear();
      cache.set('new', 'fresh');
      expect(cache.get('new')).toBe('fresh');
      expect(cache.get('old')).toBeNull();
    });

    it('resets capacity so the full maxSize is usable again after clearing', () => {
      const cache = new SmartDataCache({ ttlMs: 60_000, maxSize: 2 });
      cache.set('k0', 'r0');
      cache.set('k1', 'r1'); // full
      cache.clear();
      cache.set('a', 'x');
      cache.set('b', 'y'); // should NOT evict 'a' — we start fresh
      expect(cache.get('a')).toBe('x');
      expect(cache.get('b')).toBe('y');
    });
  });

  // ── buildKey() ─────────────────────────────────────────────────────────────

  describe('buildKey()', () => {
    const BASE_VIEW = {
      filters:    {},
      sortBy:     {},
      pagination: { first: 0, rows: 25 },
      viewParams: {},
    };

    it('returns a non-empty string', () => {
      const key = SmartDataCache.buildKey('v1', {}, BASE_VIEW);
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('is deterministic — same inputs always produce the same key', () => {
      const k1 = SmartDataCache.buildKey('v1', { report: 'sales' }, BASE_VIEW);
      const k2 = SmartDataCache.buildKey('v1', { report: 'sales' }, BASE_VIEW);
      expect(k1).toBe(k2);
    });

    it('differs when apiVars differ', () => {
      const k1 = SmartDataCache.buildKey('v1', { report: 'A' }, BASE_VIEW);
      const k2 = SmartDataCache.buildKey('v1', { report: 'B' }, BASE_VIEW);
      expect(k1).not.toBe(k2);
    });

    it('differs when viewId differs, even with identical apiVars/view', () => {
      const k1 = SmartDataCache.buildKey('view-a', {}, BASE_VIEW);
      const k2 = SmartDataCache.buildKey('view-b', {}, BASE_VIEW);
      expect(k1).not.toBe(k2);
    });

    it('differs when filters differ', () => {
      const k1 = SmartDataCache.buildKey('v1', {}, { ...BASE_VIEW, filters: {} });
      const k2 = SmartDataCache.buildKey('v1', {}, { ...BASE_VIEW, filters: { name: { type: 'text', value: 'x' } } });
      expect(k1).not.toBe(k2);
    });

    it('differs when pagination page offset differs', () => {
      const k1 = SmartDataCache.buildKey('v1', {}, { ...BASE_VIEW, pagination: { first: 0,  rows: 25 } });
      const k2 = SmartDataCache.buildKey('v1', {}, { ...BASE_VIEW, pagination: { first: 25, rows: 25 } });
      expect(k1).not.toBe(k2);
    });

    it('differs when sortBy differs', () => {
      const k1 = SmartDataCache.buildKey('v1', {}, { ...BASE_VIEW, sortBy: {} });
      const k2 = SmartDataCache.buildKey('v1', {}, { ...BASE_VIEW, sortBy: { name: 'asc' } });
      expect(k1).not.toBe(k2);
    });

    it('differs when viewParams differ', () => {
      const k1 = SmartDataCache.buildKey('v1', {}, { ...BASE_VIEW, viewParams: {} });
      const k2 = SmartDataCache.buildKey('v1', {}, { ...BASE_VIEW, viewParams: { _controls: { date: '2024-01' } } });
      expect(k1).not.toBe(k2);
    });

    it('handles empty objects without throwing', () => {
      expect(() => SmartDataCache.buildKey('v1', {}, {})).not.toThrow();
    });
  });
});

// =============================================================================
// Section 2 — SmartDataProvider cache integration
// =============================================================================

describe('SmartDataProvider cache integration', () => {
  const VIEW_ID = 'test-view';

  beforeEach(() => {
    activeStore = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * Renders SmartDataProviderImpl with a child that registers one view.
   * The view uses `defaultPageSize` to give it a distinct cache key if needed.
   * Returns:
   *   ctx()  — live SmartDataContext (call after render, not before)
   *   view() — live Zustand state slice for the view
   */
  function mountProvider(ds, viewId = VIEW_ID, defaultPageSize = 25) {
    let capturedCtx = null;

    function ViewRegistrar() {
      const ctx = useSmartDataContext();
      capturedCtx = ctx;
      activeStore = ctx.store;
      useEffect(() => {
        ctx.registerView(viewId, null, 'Test View', defaultPageSize);
        return () => ctx.unregisterView(viewId);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }

    render(
      <SmartDataProviderImpl dataSource={ds}>
        <ViewRegistrar />
      </SmartDataProviderImpl>
    );

    return {
      ctx:  () => capturedCtx,
      view: () => providerStore().getState().views[viewId],
    };
  }

  /** Flush React effects, debounce timers, and async dataSource promises. */
  async function flush() {
    await act(async () => { await vi.runAllTimersAsync(); });
  }

  // ── Initial load ────────────────────────────────────────────────────────────

  describe('initial load', () => {
    it('calls dataSource exactly once on mount', async () => {
      const ds = vi.fn().mockResolvedValue(RESULT_A);
      mountProvider(ds);
      await flush();
      expect(ds).toHaveBeenCalledTimes(1);
    });

    it('writes result rows to the store after the first fetch', async () => {
      const ds = vi.fn().mockResolvedValue(RESULT_A);
      const { view } = mountProvider(ds);
      await flush();
      expect(view().rows).toEqual(RESULT_A.rows);
    });

    it('clears the loading flag after a successful fetch', async () => {
      const ds = vi.fn().mockResolvedValue(RESULT_A);
      const { view } = mountProvider(ds);
      await flush();
      expect(view().loading).toBe(false);
    });
  });

  // ── Cache hit ───────────────────────────────────────────────────────────────

  describe('cache hit', () => {
    it('does NOT call dataSource again for the same request fingerprint', async () => {
      const ds = vi.fn().mockResolvedValue(RESULT_A);
      mountProvider(ds);
      await flush(); // page 1 fetched and cached

      // Navigate to page 2 (cache miss) then back to page 1 (cache hit)
      providerStore().getState().setPage(VIEW_ID, 25, 25);
      await flush();
      expect(ds).toHaveBeenCalledTimes(2);

      providerStore().getState().setPage(VIEW_ID, 0, 25); // back to page 1
      await flush();
      expect(ds).toHaveBeenCalledTimes(2); // no 3rd call — served from cache
    });

    it('does NOT set loading=true on a cache hit (no loading flash)', async () => {
      const ds = vi.fn().mockResolvedValue(RESULT_A);
      mountProvider(ds);
      await flush(); // page 1 cached

      providerStore().getState().setPage(VIEW_ID, 25, 25);
      await flush(); // page 2 cached

      const loadingHistory = [];
      const unsub = providerStore().subscribe(
        state => state.views[VIEW_ID]?.loading,
        v => loadingHistory.push(v),
      );

      providerStore().getState().setPage(VIEW_ID, 0, 25); // revisit page 1 → cache hit
      await flush();
      unsub();

      expect(loadingHistory).not.toContain(true);
    });

    it('serves the correct rows from cache on a revisit', async () => {
      const ds = vi.fn().mockResolvedValue(RESULT_A);
      const { view } = mountProvider(ds);
      await flush(); // page 1 → RESULT_A cached

      providerStore().getState().setPage(VIEW_ID, 25, 25);
      await flush();

      providerStore().getState().setPage(VIEW_ID, 0, 25); // revisit page 1
      await flush();

      expect(view().rows).toEqual(RESULT_A.rows);
    });
  });

  // ── Cache miss triggers ─────────────────────────────────────────────────────

  describe('cache miss', () => {
    it('triggers a new fetch when pagination changes', async () => {
      const ds = vi.fn().mockResolvedValue(RESULT_A);
      mountProvider(ds);
      await flush();

      providerStore().getState().setPage(VIEW_ID, 25, 25);
      await flush();
      expect(ds).toHaveBeenCalledTimes(2);
    });

    it('triggers a new fetch when a filter is applied', async () => {
      const ds = vi.fn().mockResolvedValue(RESULT_A);
      mountProvider(ds);
      await flush();

      providerStore().getState().setFilter(VIEW_ID, 'name', { type: 'text', value: 'alpha' });
      await flush();
      expect(ds).toHaveBeenCalledTimes(2);
    });

    it('triggers a new fetch when sort changes', async () => {
      const ds = vi.fn().mockResolvedValue(RESULT_A);
      mountProvider(ds);
      await flush();

      providerStore().getState().setSortBy(VIEW_ID, { name: 'asc' });
      await flush();
      expect(ds).toHaveBeenCalledTimes(2);
    });

    it('triggers a new fetch when viewParams change', async () => {
      const ds = vi.fn().mockResolvedValue(RESULT_A);
      mountProvider(ds);
      await flush();

      providerStore().getState().setViewParam(VIEW_ID, 'group_by', 'category');
      await flush();
      expect(ds).toHaveBeenCalledTimes(2);
    });
  });

  // ── TTL expiry ──────────────────────────────────────────────────────────────

  describe('TTL expiry', () => {
    it('re-fetches after the default 5-minute TTL has expired', async () => {
      const ds = vi.fn().mockResolvedValue(RESULT_A);
      mountProvider(ds);
      await flush(); // page-1 entry cached

      // Navigate to page 2 and back with a time jump in between
      providerStore().getState().setPage(VIEW_ID, 25, 25);
      await flush(); // page-2 fetched (different key — no expiry concern)

      // Advance time past the default TTL while on page 2
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Return to page 1 — cache entry from the original page-1 fetch is now expired
      providerStore().getState().setPage(VIEW_ID, 0, 25);
      await flush();

      expect(ds).toHaveBeenCalledTimes(3); // 3rd fetch: TTL expired on the page-1 entry
    });
  });

  // ── refresh() ───────────────────────────────────────────────────────────────

  describe('refresh()', () => {
    it('clears the cache so previously-cached keys are re-fetched on next access', async () => {
      const ds = vi.fn().mockResolvedValue(RESULT_A);
      const { ctx } = mountProvider(ds);
      await flush(); // page 1 cached

      // Navigate to page 2 and back to prove cache hit is working before refresh
      providerStore().getState().setPage(VIEW_ID, 25, 25);
      await flush(); // page 2 cached
      providerStore().getState().setPage(VIEW_ID, 0, 25);
      await flush(); // page 1 → cache hit (still 2 calls total)
      expect(ds).toHaveBeenCalledTimes(2);

      // Refresh clears the cache
      await act(() => ctx().refresh());

      // Navigate to page 2 — its cache entry was cleared, must re-fetch
      providerStore().getState().setPage(VIEW_ID, 25, 25);
      await flush();
      expect(ds).toHaveBeenCalledTimes(3); // 3rd call because cache was cleared
    });

    it('allows the next fetch to return updated data after cache is cleared', async () => {
      const ds = vi.fn()
        .mockResolvedValueOnce(RESULT_A)
        .mockResolvedValue(RESULT_B);
      const { ctx, view } = mountProvider(ds);
      await flush();
      expect(view().rows).toEqual(RESULT_A.rows); // original data

      // Navigate away so we can return with a cache miss after refresh
      providerStore().getState().setPage(VIEW_ID, 25, 25);
      await flush(); // page-2 fetched → RESULT_B

      // Clear the cache
      await act(() => ctx().refresh());

      // Return to page 1 — stale entry cleared, fresh RESULT_B returned
      providerStore().getState().setPage(VIEW_ID, 0, 25);
      await flush();
      expect(view().rows).toEqual(RESULT_B.rows);
    });
  });

  // ── Stale response guard ────────────────────────────────────────────────────

  describe('stale response guard', () => {
    it('discards the response from a superseded (slow) fetch', async () => {
      let resolveSlowFetch;
      const slowPromise = new Promise(res => { resolveSlowFetch = res; });

      const ds = vi.fn()
        .mockReturnValueOnce(slowPromise) // first call: hangs until manually resolved
        .mockResolvedValue(RESULT_B);    // subsequent calls: resolve immediately

      const { view } = mountProvider(ds);
      await flush(); // triggers first (slow) fetch — still pending
      expect(ds).toHaveBeenCalledTimes(1);

      // Trigger second fetch while first is still in-flight
      providerStore().getState().setFilter(VIEW_ID, 'name', { type: 'text', value: 'x' });
      await flush(); // second fetch completes with RESULT_B
      expect(ds).toHaveBeenCalledTimes(2);
      expect(view().rows).toEqual(RESULT_B.rows);

      // Now resolve the slow first fetch — it should be silently discarded
      await act(async () => {
        resolveSlowFetch(RESULT_A);
        await vi.runAllTimersAsync();
      });

      // Store must still have RESULT_B from the newer fetch
      expect(view().rows).toEqual(RESULT_B.rows);
    });

    it('does not overwrite a valid result with a stale error', async () => {
      let rejectSlowFetch;
      const slowReject = new Promise((_, rej) => { rejectSlowFetch = rej; });

      const ds = vi.fn()
        .mockReturnValueOnce(slowReject) // first call: hangs then rejects
        .mockResolvedValue(RESULT_B);   // second call: succeeds immediately

      const { view } = mountProvider(ds);
      await flush(); // first fetch pending

      // Second fetch resolves before the first rejects
      providerStore().getState().setFilter(VIEW_ID, 'name', { type: 'text', value: 'x' });
      await flush();
      expect(view().rows).toEqual(RESULT_B.rows);

      // First fetch now rejects — must be discarded as stale
      await act(async () => {
        rejectSlowFetch(new Error('stale network error'));
        await vi.runAllTimersAsync();
      });

      expect(view().error).toBeNull();           // stale error not applied
      expect(view().rows).toEqual(RESULT_B.rows); // result from newer fetch intact
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('sets error state in the store when dataSource throws', async () => {
      const ds = vi.fn().mockRejectedValue(new Error('Network failure'));
      const { view } = mountProvider(ds);
      await flush();
      expect(view().error).toBe('Network failure');
      expect(view().loading).toBe(false);
    });

    it('clears the error on a subsequent successful fetch', async () => {
      const ds = vi.fn()
        .mockRejectedValueOnce(new Error('oops'))
        .mockResolvedValue(RESULT_A);
      const { view } = mountProvider(ds);
      await flush(); // first fetch fails
      expect(view().error).toBeTruthy();

      providerStore().getState().setPage(VIEW_ID, 25, 25); // trigger new fetch
      await flush(); // second fetch succeeds
      expect(view().error).toBeNull();
      expect(view().rows).toEqual(RESULT_A.rows);
    });

    it('does not cache a failed result (re-fetches on next trigger)', async () => {
      const ds = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue(RESULT_A);
      const { view } = mountProvider(ds);
      await flush(); // first fetch fails → not cached

      // Trigger the same key again via page reset
      providerStore().getState().setPage(VIEW_ID, 25, 25);
      await flush();
      providerStore().getState().setPage(VIEW_ID, 0, 25); // back to original key
      await flush(); // should re-fetch (error was never cached)
      expect(ds).toHaveBeenCalledTimes(3);
      expect(view().rows).toEqual(RESULT_A.rows);
    });
  });

  // ── Multi-view cache isolation ──────────────────────────────────────────────

  describe('multi-view', () => {
    const VIEW_B = 'view-b';

    function mountTwoViews(ds) {
      let capturedCtx = null;

      function TwoViewRegistrar() {
        const ctx = useSmartDataContext();
        capturedCtx = ctx;
        activeStore = ctx.store;
        useEffect(() => {
          // Different defaultPageSize → different pagination in state → different cache keys
          ctx.registerView(VIEW_ID, null, 'View A', 25);
          ctx.registerView(VIEW_B,  null, 'View B', 50);
          return () => {
            ctx.unregisterView(VIEW_ID);
            ctx.unregisterView(VIEW_B);
          };
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
        return null;
      }

      render(
        <SmartDataProviderImpl dataSource={ds}>
          <TwoViewRegistrar />
        </SmartDataProviderImpl>
      );

      return {
        ctx:   () => capturedCtx,
        viewA: () => providerStore().getState().views[VIEW_ID],
        viewB: () => providerStore().getState().views[VIEW_B],
      };
    }

    it('each view writes its result to its own store slot', async () => {
      const ds = vi.fn().mockImplementation(({ viewId }) =>
        Promise.resolve(viewId === VIEW_ID ? RESULT_A : RESULT_B),
      );
      const { viewA, viewB } = mountTwoViews(ds);
      await flush();
      expect(viewA().rows).toEqual(RESULT_A.rows);
      expect(viewB().rows).toEqual(RESULT_B.rows);
    });

    it('a pagination change in view A does not trigger a re-fetch for view B', async () => {
      const ds = vi.fn().mockResolvedValue(RESULT_A);
      mountTwoViews(ds);
      await flush();
      const callsAfterMount = ds.mock.calls.length; // both views fetched

      providerStore().getState().setPage(VIEW_ID, 25, 25); // only view A changes
      await flush();

      // Exactly one more call (for view A only)
      expect(ds).toHaveBeenCalledTimes(callsAfterMount + 1);
      expect(ds.mock.calls.at(-1)[0].viewId).toBe(VIEW_ID);
    });

    it('view B can serve from its own cached result independently of view A', async () => {
      const ds = vi.fn().mockImplementation(({ viewId }) =>
        Promise.resolve(viewId === VIEW_ID ? RESULT_A : RESULT_B),
      );
      const { viewB } = mountTwoViews(ds);
      await flush();
      const totalCalls = ds.mock.calls.length;

      // Navigate view A back and forth — view B untouched
      providerStore().getState().setPage(VIEW_ID, 25, 25);
      await flush();
      providerStore().getState().setPage(VIEW_ID, 0, 25);
      await flush();

      // View B should NOT have been re-fetched
      const viewBCalls = ds.mock.calls.filter(([{ viewId }]) => viewId === VIEW_B);
      expect(viewBCalls.length).toBe(1); // only the initial fetch
      expect(viewB().rows).toEqual(RESULT_B.rows); // still has its original data
    });
  });

  // ── Provider isolation ──────────────────────────────────────────────────────
  //
  // View ids are only unique *within* a report config. Two reports rendered side by
  // side (e.g. Primary/Secondary tabs) routinely declare the same ids — `main`,
  // `drawer1`. Each provider must own its view state or the second provider's
  // registerView() no-ops onto the first's slot and both fetch pipelines write it.

  describe('provider isolation', () => {
    const SHARED_ID = 'main';

    /** Mounts two sibling providers that each register the same viewId. */
    function mountTwoProviders(dsA, dsB) {
      const stores = {};

      function Registrar({ name }) {
        const ctx = useSmartDataContext();
        stores[name] = ctx.store;
        useEffect(() => {
          ctx.registerView(SHARED_ID, null, 'Shared View', 25);
          return () => ctx.unregisterView(SHARED_ID);
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
        return null;
      }

      render(
        <>
          <SmartDataProviderImpl dataSource={dsA}>
            <Registrar name="a" />
          </SmartDataProviderImpl>
          <SmartDataProviderImpl dataSource={dsB}>
            <Registrar name="b" />
          </SmartDataProviderImpl>
        </>
      );

      return {
        storeA: () => stores.a,
        storeB: () => stores.b,
        viewA:  () => stores.a.getState().views[SHARED_ID],
        viewB:  () => stores.b.getState().views[SHARED_ID],
      };
    }

    it('gives each provider its own store instance', () => {
      const { storeA, storeB } = mountTwoProviders(
        vi.fn().mockResolvedValue(RESULT_A),
        vi.fn().mockResolvedValue(RESULT_B),
      );
      expect(storeA()).not.toBe(storeB());
    });

    it('both providers fetch, even though they share a viewId', async () => {
      const dsA = vi.fn().mockResolvedValue(RESULT_A);
      const dsB = vi.fn().mockResolvedValue(RESULT_B);
      mountTwoProviders(dsA, dsB);
      await flush();
      expect(dsA).toHaveBeenCalledTimes(1);
      expect(dsB).toHaveBeenCalledTimes(1);
    });

    it('each provider keeps its own rows for the shared viewId', async () => {
      const { viewA, viewB } = mountTwoProviders(
        vi.fn().mockResolvedValue(RESULT_A),
        vi.fn().mockResolvedValue(RESULT_B),
      );
      await flush();
      expect(viewA().rows).toEqual(RESULT_A.rows);
      expect(viewB().rows).toEqual(RESULT_B.rows);
    });

    it('a control write in one provider does not leak into the other', async () => {
      const { storeA, storeB, viewA, viewB } = mountTwoProviders(
        vi.fn().mockResolvedValue(RESULT_A),
        vi.fn().mockResolvedValue(RESULT_B),
      );
      await flush();

      // Mirrors two date pickers sharing the `dateRange` control key.
      storeA().getState().setControlOutput(SHARED_ID, 'dateRange', { start: '2026-08-01' });
      storeB().getState().setControlOutput(SHARED_ID, 'dateRange', { start: '2026-06-01' });

      expect(viewA().viewParams._controls.dateRange.start).toBe('2026-08-01');
      expect(viewB().viewParams._controls.dateRange.start).toBe('2026-06-01');
    });

    it('a pagination change in one provider does not re-fetch the other', async () => {
      const dsA = vi.fn().mockResolvedValue(RESULT_A);
      const dsB = vi.fn().mockResolvedValue(RESULT_B);
      const { storeA } = mountTwoProviders(dsA, dsB);
      await flush();

      storeA().getState().setPage(SHARED_ID, 25, 25);
      await flush();

      expect(dsA).toHaveBeenCalledTimes(2);
      expect(dsB).toHaveBeenCalledTimes(1);
    });

    it('unmounting one provider leaves the other provider’s view intact', async () => {
      const dsA = vi.fn().mockResolvedValue(RESULT_A);
      const dsB = vi.fn().mockResolvedValue(RESULT_B);
      let unmountB;

      function Registrar({ capture }) {
        const ctx = useSmartDataContext();
        capture(ctx.store);
        useEffect(() => {
          ctx.registerView(SHARED_ID, null, 'Shared View', 25);
          return () => ctx.unregisterView(SHARED_ID);
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
        return null;
      }

      let storeA = null, storeB = null;
      render(
        <SmartDataProviderImpl dataSource={dsA}>
          <Registrar capture={s => { storeA = s; }} />
        </SmartDataProviderImpl>
      );
      const b = render(
        <SmartDataProviderImpl dataSource={dsB}>
          <Registrar capture={s => { storeB = s; }} />
        </SmartDataProviderImpl>
      );
      unmountB = b.unmount;
      await flush();

      unmountB();
      await flush();

      expect(storeA.getState().views[SHARED_ID].rows).toEqual(RESULT_A.rows);
      expect(storeB).not.toBe(storeA);
    });
  });
});
