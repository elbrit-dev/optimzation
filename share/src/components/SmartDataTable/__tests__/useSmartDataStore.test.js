import { describe, it, expect, beforeEach } from 'vitest';
import { useSmartDataStore } from '../useSmartDataStore.js';
import { storeActionCases }  from '@/test/scenarios/store.scenarios.js';
import { createFreshStore }  from '@/test/helpers/storeFactory.js';

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
