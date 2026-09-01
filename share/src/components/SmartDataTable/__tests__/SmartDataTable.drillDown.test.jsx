import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SmartDataTable } from '../SmartDataTable';
import { SmartDataContext, SmartDataConfigContext } from '../SmartDataContext';
import { createSmartDataStore } from '../useSmartDataStore';
import { resolveConfig } from '../smartDataTableConfig';
import { drillDownKey } from '../reportSource.jsx';
import { buildMockContext } from '@/test/helpers/contextWrapper';

/**
 * The recursive PrimeReact wiring, exercised for real.
 *
 * drillDownBranch.test.jsx covers the decisions in isolation; this covers the
 * seam those decisions are wired into -- the per-row `expander` predicate,
 * `onRowToggle`'s payload shape, and the props threaded down each nested
 * InnerDataTable. Every bug found by hand during this feature lived in that
 * seam rather than in the logic, so it is worth driving the real component.
 */

const VIEW_ID = 'main';
const FULL_GROUP_BY = ['DEPARTMENT', 'HQ', 'CUSTOMER', 'INVOICE', 'ITEM'];

const COLUMNS = [
  { field: 'label', header: 'Department', sortable: true, filterable: true, _fieldtype: 'Data', type: 'string', filterType: 'text' },
  { field: 'qty', header: 'Qty', sortable: true, filterable: true, _fieldtype: 'Float', type: 'number', filterType: 'numeric' },
];

const cell = v => ({ value: v, repr: String(v) });

function row(label, path, { hasChildren, children } = {}) {
  return {
    label: cell(label),
    qty: cell(10),
    level: path.length - 1,
    indent: path.length - 1,
    is_group: children ? 1 : 0,
    _path: path,
    ...(hasChildren !== undefined && { has_children: hasChildren }),
    ...(children && { _children: children }),
  };
}

const DEPT = [{ dimension: 'DEPARTMENT', value: 'Aura & Proxima Chennai - ELPL' }];
const HQ = [...DEPT, { dimension: 'HQ', value: 'HQ-Chennai' }];

function renderTable({ rows, drillDownMeta, drillDown = {}, ctx = {} } = {}) {
  const store = createSmartDataStore();
  store.getState().registerView(VIEW_ID, 25);
  store.getState()._setResult(VIEW_ID, {
    rows,
    totalRecords: rows.length,
    columns: COLUMNS,
    expandable: !!drillDownMeta,
    labelColDefs: [{ field: 'label', header: 'Department' }, { field: 'label', header: 'HQ' }],
    drillDownMeta,
  });
  if (Object.keys(drillDown).length) {
    for (const [key, node] of Object.entries(drillDown)) {
      store.getState()._setDrillDown(VIEW_ID, key, node);
    }
  }

  const value = buildMockContext({ store, ...ctx });
  const config = { ...resolveConfig(), enableFilterRow: false };

  render(
    <SmartDataConfigContext.Provider value={config}>
      <SmartDataContext.Provider value={value}>
        <SmartDataTable viewId={VIEW_ID} />
      </SmartDataContext.Provider>
    </SmartDataConfigContext.Provider>,
  );
  return { store, ctx: value };
}

/** PrimeReact renders its expander as a button inside the row. */
function expanderIn(rowEl) {
  return rowEl.querySelector('button.p-row-toggler');
}

function rowByText(text) {
  return screen.getByText(text).closest('tr');
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('SmartDataTable — drill-down wiring', () => {
  const meta = { fullGroupBy: FULL_GROUP_BY, initialDepth: 2, includeChildCounts: true };

  describe('expander visibility', () => {
    it('shows an expander on a row that has deeper levels', () => {
      renderTable({ rows: [row('HQ-Chennai', HQ, { hasChildren: 1 })], drillDownMeta: meta });
      expect(expanderIn(rowByText('HQ-Chennai'))).toBeTruthy();
    });

    it('hides it on a row the server called a leaf', () => {
      // has_children: 0 -- without this every leaf costs a round trip to
      // discover it has nothing under it.
      renderTable({ rows: [row('HQ-Chennai', HQ, { hasChildren: 0 })], drillDownMeta: meta });
      expect(expanderIn(rowByText('HQ-Chennai'))).toBeNull();
    });

    it('hides it at the deepest level even when the server sent no flag', () => {
      // The live API returns has_children: null on the deepest level, so the
      // depth rule has to be what stops it.
      const itemPath = FULL_GROUP_BY.map((dimension, i) => ({ dimension, value: `v${i}` }));
      renderTable({ rows: [row('C FERT', itemPath, { hasChildren: null })], drillDownMeta: meta });
      expect(expanderIn(rowByText('C FERT'))).toBeNull();
    });

    it('shows one when the flag is absent but the tree goes deeper', () => {
      // include_child_counts: false leaves has_children undefined.
      renderTable({ rows: [row('HQ-Chennai', HQ)], drillDownMeta: meta });
      expect(expanderIn(rowByText('HQ-Chennai'))).toBeTruthy();
    });

    it('shows none at all on a view without drill-down', () => {
      renderTable({ rows: [row('HQ-Chennai', HQ, { hasChildren: 1 })], drillDownMeta: null });
      expect(expanderIn(rowByText('HQ-Chennai'))).toBeNull();
    });
  });

  describe('expanding', () => {
    it('fetches the clicked row, by its own ancestor chain', async () => {
      const fetchDrillDown = vi.fn().mockResolvedValue(null);
      renderTable({
        rows: [row('HQ-Chennai', HQ, { hasChildren: 1 })],
        drillDownMeta: meta,
        ctx: { fetchDrillDown },
      });

      await userEvent.click(expanderIn(rowByText('HQ-Chennai')));
      await waitFor(() => expect(fetchDrillDown).toHaveBeenCalledTimes(1));
      expect(fetchDrillDown).toHaveBeenCalledWith(VIEW_ID, HQ);
    });

    it('does not re-fetch a node already in the map', async () => {
      // Covers both a cached branch and one already in flight.
      const fetchDrillDown = vi.fn().mockResolvedValue(null);
      renderTable({
        rows: [row('HQ-Chennai', HQ, { hasChildren: 1 })],
        drillDownMeta: meta,
        drillDown: { [drillDownKey(HQ)]: { status: 'ready', rows: [] } },
        ctx: { fetchDrillDown },
      });

      await userEvent.click(expanderIn(rowByText('HQ-Chennai')));
      expect(fetchDrillDown).not.toHaveBeenCalled();
    });

    it('renders a spinner under the row while it loads', async () => {
      renderTable({
        rows: [row('HQ-Chennai', HQ, { hasChildren: 1 })],
        drillDownMeta: meta,
        drillDown: { [drillDownKey(HQ)]: { status: 'loading' } },
      });

      await userEvent.click(expanderIn(rowByText('HQ-Chennai')));
      expect(await screen.findByText(/loading/i)).toBeInTheDocument();
    });

    it('renders the fetched children in a nested table', async () => {
      const child = [...HQ, { dimension: 'CUSTOMER', value: 'Lifecare Pharma Private Limited' }];
      renderTable({
        rows: [row('HQ-Chennai', HQ, { hasChildren: 1 })],
        drillDownMeta: meta,
        drillDown: {
          [drillDownKey(HQ)]: {
            status: 'ready',
            rows: [row('Lifecare Pharma Private Limited', child, { hasChildren: 1 })],
          },
        },
      });

      await userEvent.click(expanderIn(rowByText('HQ-Chennai')));
      expect(await screen.findByText('Lifecare Pharma Private Limited')).toBeInTheDocument();
    });

    it('surfaces an error with a retry that refetches the same node', async () => {
      const fetchDrillDown = vi.fn().mockResolvedValue(null);
      renderTable({
        rows: [row('HQ-Chennai', HQ, { hasChildren: 1 })],
        drillDownMeta: meta,
        drillDown: {
          [drillDownKey(HQ)]: { status: 'error', error: { message: 'Drill-down execution failed' } },
        },
        ctx: { fetchDrillDown },
      });

      await userEvent.click(expanderIn(rowByText('HQ-Chennai')));
      await userEvent.click(await screen.findByRole('button', { name: /retry/i }));
      expect(fetchDrillDown).toHaveBeenCalledWith(VIEW_ID, HQ);
    });
  });

  describe('collapsing', () => {
    it('aborts the in-flight fetch for the row that was closed', async () => {
      // The path most likely to strand a spinner: collapse mid-load. The
      // provider drops the node on abort so re-expanding retries.
      const cancelDrillDown = vi.fn();
      renderTable({
        rows: [row('HQ-Chennai', HQ, { hasChildren: 1 })],
        drillDownMeta: meta,
        drillDown: { [drillDownKey(HQ)]: { status: 'loading' } },
        ctx: { cancelDrillDown },
      });

      const toggle = expanderIn(rowByText('HQ-Chennai'));
      await userEvent.click(toggle);
      expect(cancelDrillDown).not.toHaveBeenCalled();

      await userEvent.click(toggle);
      await waitFor(() => expect(cancelDrillDown).toHaveBeenCalledWith(VIEW_ID, HQ));
    });

    it('does not cancel a sibling that is still open', async () => {
      const cancelDrillDown = vi.fn();
      const hqB = [...DEPT, { dimension: 'HQ', value: 'HQ-Madurai' }];
      renderTable({
        rows: [
          row('HQ-Chennai', HQ, { hasChildren: 1 }),
          row('HQ-Madurai', hqB, { hasChildren: 1 }),
        ],
        drillDownMeta: meta,
        drillDown: {
          [drillDownKey(HQ)]: { status: 'loading' },
          [drillDownKey(hqB)]: { status: 'loading' },
        },
        ctx: { cancelDrillDown },
      });

      await userEvent.click(expanderIn(rowByText('HQ-Chennai')));
      await userEvent.click(expanderIn(rowByText('HQ-Madurai')));
      await userEvent.click(expanderIn(rowByText('HQ-Chennai')));

      await waitFor(() => expect(cancelDrillDown).toHaveBeenCalledWith(VIEW_ID, HQ));
      expect(cancelDrillDown).not.toHaveBeenCalledWith(VIEW_ID, hqB);
    });



    it('a root toggle does not cancel an open row in a nested table', async () => {
      // The root table and each nested table report only their own expanded set.
      // Sharing one "what is open" map across them means whichever table toggles
      // last overwrites it, so every other table's open rows look collapsed and
      // their in-flight fetches get aborted. Only reachable across two tables --
      // a single table's own expand/collapse behaves correctly either way.
      const child = [...HQ, { dimension: 'CUSTOMER', value: 'Lifecare Pharma Private Limited' }];
      const hqB = [...DEPT, { dimension: 'HQ', value: 'HQ-Madurai' }];
      const cancelDrillDown = vi.fn();

      renderTable({
        rows: [
          row('HQ-Chennai', HQ, { hasChildren: 1 }),
          row('HQ-Madurai', hqB, { hasChildren: 1 }),
        ],
        drillDownMeta: meta,
        drillDown: {
          [drillDownKey(HQ)]: {
            status: 'ready',
            rows: [row('Lifecare Pharma Private Limited', child, { hasChildren: 1 })],
          },
        },
        ctx: { cancelDrillDown },
      });

      // Open a root row, then open a row inside its nested table.
      await userEvent.click(expanderIn(rowByText('HQ-Chennai')));
      const childRow = (await screen.findByText('Lifecare Pharma Private Limited')).closest('tr');
      await userEvent.click(expanderIn(childRow));

      // Now toggle a different row in the ROOT table. The nested table's open
      // row is untouched by this and must not be cancelled.
      await userEvent.click(expanderIn(rowByText('HQ-Madurai')));

      expect(cancelDrillDown).not.toHaveBeenCalledWith(VIEW_ID, child);
    });
  });

  describe('nested levels', () => {
    it('expands a second level from inside the nested table', async () => {
      // The recursion: a drilled row must itself be drillable, threading `drill`
      // down through InnerDataTable.
      const child = [...HQ, { dimension: 'CUSTOMER', value: 'Lifecare Pharma Private Limited' }];
      const fetchDrillDown = vi.fn().mockResolvedValue(null);
      renderTable({
        rows: [row('HQ-Chennai', HQ, { hasChildren: 1 })],
        drillDownMeta: meta,
        drillDown: {
          [drillDownKey(HQ)]: {
            status: 'ready',
            rows: [row('Lifecare Pharma Private Limited', child, { hasChildren: 1 })],
          },
        },
        ctx: { fetchDrillDown },
      });

      await userEvent.click(expanderIn(rowByText('HQ-Chennai')));
      const childRow = (await screen.findByText('Lifecare Pharma Private Limited')).closest('tr');
      const childToggle = expanderIn(childRow);
      expect(childToggle).toBeTruthy();

      await userEvent.click(childToggle);
      await waitFor(() => expect(fetchDrillDown).toHaveBeenCalledWith(VIEW_ID, child));
    });

    it('names each level from the padded label headers', async () => {
      const child = [...HQ, { dimension: 'CUSTOMER', value: 'Lifecare Pharma Private Limited' }];
      renderTable({
        rows: [row('HQ-Chennai', HQ, { hasChildren: 1 })],
        drillDownMeta: meta,
        drillDown: {
          [drillDownKey(HQ)]: {
            status: 'ready',
            rows: [row('Lifecare Pharma Private Limited', child, { hasChildren: 1 })],
          },
        },
      });

      await userEvent.click(expanderIn(rowByText('HQ-Chennai')));
      // labelColDefs[1] is HQ; the nested table must not repeat the root header.
      const nested = (await screen.findByText('Lifecare Pharma Private Limited')).closest('table');
      expect(within(nested).getByText('HQ')).toBeInTheDocument();
    });
  });

  describe('inline filter row', () => {
    it('is hidden on a drill-down view, which can only filter fetched rows', () => {
      renderTable({ rows: [row('HQ-Chennai', HQ, { hasChildren: 1 })], drillDownMeta: meta });
      expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    });
  });
});
