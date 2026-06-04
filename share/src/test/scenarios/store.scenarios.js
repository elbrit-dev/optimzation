// ─── Store action test case registry ─────────────────────────────────────────
//
// Each entry drives one it() in useSmartDataStore.test.js.
// setup(store)  — optional pre-action setup
// action(store) — the mutation under test
// assert(state) — assertion on store.getState()

export const storeActionCases = [
  // ── registerView ──────────────────────────────────────────────────────────────
  {
    name: 'registerView: creates view with default state',
    action: (store) => store.getState().registerView('v1'),
    assert: (state) => {
      expect(state.views.v1).toBeDefined();
      expect(state.views.v1.filters).toEqual({});
      expect(state.views.v1.sortMeta).toEqual([]);
      expect(state.views.v1.pagination).toEqual({ first: 0, rows: 50 });
      expect(state.views.v1.rows).toEqual([]);
      expect(state.views.v1.loading).toBe(false);
      expect(state.views.v1.error).toBeNull();
      expect(state.views.v1.hiddenColumns).toEqual([]);
    },
  },
  {
    name: 'registerView: respects custom defaultPageSize',
    action: (store) => store.getState().registerView('v1', 50),
    assert: (state) => {
      expect(state.views.v1.pagination.rows).toBe(50);
    },
  },
  {
    name: 'registerView: idempotent — second call does not reset existing state',
    setup: (store) => {
      store.getState().registerView('v1');
      store.getState().setFilter('v1', 'name', { type: 'text', value: 'x' });
    },
    action: (store) => store.getState().registerView('v1'),
    assert: (state) => {
      expect(state.views.v1.filters.name).toEqual({ type: 'text', value: 'x' });
    },
  },

  // ── setFilter ─────────────────────────────────────────────────────────────────
  {
    name: 'setFilter: stores filter value',
    setup: (store) => store.getState().registerView('v1'),
    action: (store) => store.getState().setFilter('v1', 'name', { type: 'text', value: 'bang' }),
    assert: (state) => {
      expect(state.views.v1.filters.name).toEqual({ type: 'text', value: 'bang' });
    },
  },
  {
    name: 'setFilter: resets pagination to first=0',
    setup: (store) => {
      store.getState().registerView('v1');
      store.getState().setPage('v1', 25, 50);
    },
    action: (store) => store.getState().setFilter('v1', 'name', { type: 'text', value: 'x' }),
    assert: (state) => {
      expect(state.views.v1.pagination.first).toBe(0);
    },
  },

  // ── clearFilter ───────────────────────────────────────────────────────────────
  {
    name: 'clearFilter: removes filter key',
    setup: (store) => {
      store.getState().registerView('v1');
      store.getState().setFilter('v1', 'name', { type: 'text', value: 'x' });
    },
    action: (store) => store.getState().clearFilter('v1', 'name'),
    assert: (state) => {
      expect(state.views.v1.filters.name).toBeUndefined();
    },
  },
  {
    name: 'clearFilter: resets pagination to first=0',
    setup: (store) => {
      store.getState().registerView('v1');
      store.getState().setFilter('v1', 'name', { type: 'text', value: 'x' });
      store.getState().setPage('v1', 25, 25);
    },
    action: (store) => store.getState().clearFilter('v1', 'name'),
    assert: (state) => {
      expect(state.views.v1.pagination.first).toBe(0);
    },
  },

  // ── setSort ───────────────────────────────────────────────────────────────────
  {
    name: 'setSort: replaces sortMeta',
    setup: (store) => store.getState().registerView('v1'),
    action: (store) => store.getState().setSort('v1', [{ field: 'qty', order: 1 }]),
    assert: (state) => {
      expect(state.views.v1.sortMeta).toEqual([{ field: 'qty', order: 1 }]);
    },
  },
  {
    name: 'setSort: clearing with empty array',
    setup: (store) => {
      store.getState().registerView('v1');
      store.getState().setSort('v1', [{ field: 'qty', order: 1 }]);
    },
    action: (store) => store.getState().setSort('v1', []),
    assert: (state) => {
      expect(state.views.v1.sortMeta).toEqual([]);
    },
  },

  // ── setPage ───────────────────────────────────────────────────────────────────
  {
    name: 'setPage: updates first and rows',
    setup: (store) => store.getState().registerView('v1'),
    action: (store) => store.getState().setPage('v1', 25, 50),
    assert: (state) => {
      expect(state.views.v1.pagination).toEqual({ first: 25, rows: 50 });
    },
  },
  {
    name: 'setPage: does not reset filters',
    setup: (store) => {
      store.getState().registerView('v1');
      store.getState().setFilter('v1', 'name', { type: 'text', value: 'x' });
    },
    action: (store) => store.getState().setPage('v1', 25, 25),
    assert: (state) => {
      expect(state.views.v1.filters.name).toEqual({ type: 'text', value: 'x' });
    },
  },

  // ── setHiddenColumns ──────────────────────────────────────────────────────────
  {
    name: 'setHiddenColumns: replaces hidden array',
    setup: (store) => store.getState().registerView('v1'),
    action: (store) => store.getState().setHiddenColumns('v1', ['qty', 'amount']),
    assert: (state) => {
      expect(state.views.v1.hiddenColumns).toEqual(['qty', 'amount']);
    },
  },

  // ── setViewParam ──────────────────────────────────────────────────────────────
  {
    name: 'setViewParam: sets a param key',
    setup: (store) => store.getState().registerView('v1'),
    action: (store) => store.getState().setViewParam('v1', 'dateRange', ['2026-01-01', '2026-03-31']),
    assert: (state) => {
      expect(state.views.v1.viewParams.dateRange).toEqual(['2026-01-01', '2026-03-31']);
    },
  },
  {
    name: 'setViewParam: resets pagination to first=0',
    setup: (store) => {
      store.getState().registerView('v1');
      store.getState().setPage('v1', 50, 25);
    },
    action: (store) => store.getState().setViewParam('v1', 'foo', 'bar'),
    assert: (state) => {
      expect(state.views.v1.pagination.first).toBe(0);
    },
  },

  // ── _setResult ────────────────────────────────────────────────────────────────
  {
    name: '_setResult: updates rows, totalRecords, columns, clears loading and error',
    setup: (store) => {
      store.getState().registerView('v1');
      store.getState()._setLoading('v1', true);
      store.getState()._setError('v1', 'some error');
    },
    action: (store) => store.getState()._setResult('v1', {
      rows: [{ label: { value: 'A', repr: 'A' } }],
      totalRecords: 1,
      columns: [{ field: 'label', header: 'Name' }],
      columnGroups: null,
      expandable: false,
    }),
    assert: (state) => {
      expect(state.views.v1.rows).toHaveLength(1);
      expect(state.views.v1.totalRecords).toBe(1);
      expect(state.views.v1.columns).toHaveLength(1);
      expect(state.views.v1.loading).toBe(false);
      expect(state.views.v1.error).toBeNull();
    },
  },

  // ── _setLoading ───────────────────────────────────────────────────────────────
  {
    name: '_setLoading: sets loading flag true',
    setup: (store) => store.getState().registerView('v1'),
    action: (store) => store.getState()._setLoading('v1', true),
    assert: (state) => {
      expect(state.views.v1.loading).toBe(true);
    },
  },

  // ── _setError ─────────────────────────────────────────────────────────────────
  {
    name: '_setError: sets error and clears loading',
    setup: (store) => {
      store.getState().registerView('v1');
      store.getState()._setLoading('v1', true);
    },
    action: (store) => store.getState()._setError('v1', 'fetch failed'),
    assert: (state) => {
      expect(state.views.v1.error).toBe('fetch failed');
      expect(state.views.v1.loading).toBe(false);
    },
  },

  // ── unregisterView ────────────────────────────────────────────────────────────
  {
    name: 'unregisterView: removes view from store',
    setup: (store) => store.getState().registerView('v1'),
    action: (store) => store.getState().unregisterView('v1'),
    assert: (state) => {
      expect(state.views.v1).toBeUndefined();
    },
  },
  {
    name: 'unregisterView: unknown viewId is a no-op',
    setup: (store) => store.getState().registerView('v1'),
    action: (store) => store.getState().unregisterView('nonexistent'),
    assert: (state) => {
      expect(state.views.v1).toBeDefined();
    },
  },
];
