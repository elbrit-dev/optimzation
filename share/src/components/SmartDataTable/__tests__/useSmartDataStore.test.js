import { describe, it, expect, beforeEach } from 'vitest';
import { useSmartDataStore } from '../useSmartDataStore.js';
import { storeActionCases }  from '@/test/scenarios/store.scenarios.js';
import { createFreshStore, storeWithView, getView } from '@/test/helpers/storeFactory.js';

describe('useSmartDataStore', () => {
  beforeEach(() => {
    createFreshStore();
  });

  storeActionCases.forEach(tc => {
    it(tc.name, () => {
      const store = useSmartDataStore;
      tc.setup?.(store);
      tc.action(store);
      tc.assert(store.getState());
    });
  });
});

// ─── drill-down node lifecycle ─────────────────────────────────────────────────
//
// These two actions are what stops a branch getting stuck. The table skips any
// node already present in the drillDown map, so a node left at 'loading' after
// an aborted or discarded fetch is a branch that spins forever with no retry.

describe('drill-down node lifecycle', () => {
  function seeded({ signature = 'sig', nodes } = {}) {
    const store = storeWithView('v');
    store.setState(s => ({
      views: {
        ...s.views,
        v: {
          ...s.views.v,
          drillDown: nodes ?? { a: { status: 'loading' }, b: { status: 'ready', rows: [] } },
          drillDownSignature: signature,
        },
      },
    }));
    return store;
  }

  describe('_dropDrillDown', () => {
    it('forgets one node so the next expand re-fetches it', () => {
      const store = seeded();
      store.getState()._dropDrillDown('v', 'a');
      const after = getView(store, 'v').drillDown;
      expect(after).not.toHaveProperty('a');
      expect(after).toHaveProperty('b');
    });

    it('leaves the view untouched when the node is not there', () => {
      const store = seeded();
      const before = getView(store, 'v');
      store.getState()._dropDrillDown('v', 'missing');
      expect(getView(store, 'v')).toBe(before);
    });

    it('is a no-op for an unregistered view', () => {
      const store = createFreshStore();
      expect(() => store.getState()._dropDrillDown('nope', 'a')).not.toThrow();
    });
  });

  describe('_syncDrillDownSignature', () => {
    it('keeps children when the request is unchanged', () => {
      // Navigating away and back restores the parent from cache; re-fetching
      // every expanded branch for an identical request would be pure waste.
      const store = seeded();
      store.getState()._syncDrillDownSignature('v', 'sig');
      expect(getView(store, 'v').drillDown).toHaveProperty('a');
    });

    it('drops children when the request changed', () => {
      const store = seeded();
      store.getState()._syncDrillDownSignature('v', 'other');
      expect(getView(store, 'v').drillDown).toEqual({});
      expect(getView(store, 'v').drillDownSignature).toBe('other');
    });

    it('drops children when reset to null, which is how refresh forces a re-fetch', () => {
      // refresh() re-runs the same request, so the cache key does not move and
      // signature comparison alone would keep the stale children.
      const store = seeded();
      store.getState()._syncDrillDownSignature('v', null);
      expect(getView(store, 'v').drillDown).toEqual({});
    });
  });
});
