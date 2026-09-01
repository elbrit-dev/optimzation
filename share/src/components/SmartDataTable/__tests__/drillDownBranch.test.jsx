import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DrillDownBranch, makeCanExpand } from '../drillDownBranch.jsx';
import { drillDownKey } from '../reportSource.jsx';

/**
 * The drill-down rendering decisions.
 *
 * These two functions are what stands between "the tree renders" and "the tree
 * silently shows the wrong thing": whether a row offers an expand arrow at all,
 * and which of four states goes underneath when it is expanded. Both branch on a
 * `drill` object that is null for v1 views and for v2 views that did not opt in,
 * so the null cases below are the regression guard for every existing report.
 */

const PATH = [{ dimension: 'DEPARTMENT', value: 'D1' }];

const drillWith = (nodes = {}, overrides = {}) => ({
  fullGroupBy: ['DEPARTMENT', 'HQ', 'CUSTOMER'],
  nodes,
  onExpand: vi.fn(),
  onToggle: vi.fn(),
  ...overrides,
});

// ─── expandability ─────────────────────────────────────────────────────────────

describe('makeCanExpand', () => {
  describe('without drill-down', () => {
    const canExpand = makeCanExpand(null);

    it('offers an expander only when children actually arrived', () => {
      expect(canExpand({ _children: [{}] })).toBe(true);
      expect(canExpand({ _children: [] })).toBe(false);
      expect(canExpand({})).toBe(false);
    });

    it('ignores drill-down row fields entirely', () => {
      // A v1 view must not start expanding on fields it never asked for.
      expect(canExpand({ _path: PATH, has_children: 1 })).toBe(false);
    });
  });

  describe('with drill-down', () => {
    const canExpand = makeCanExpand(drillWith());

    it('offers an expander for a row shallower than the full group_by', () => {
      // This is the case the whole feature turns on: no children fetched yet,
      // but the tree goes deeper.
      expect(canExpand({ _path: PATH })).toBe(true);
    });

    it('does not offer one at the deepest level', () => {
      const deepest = [
        { dimension: 'DEPARTMENT', value: 'D' },
        { dimension: 'HQ', value: 'H' },
        { dimension: 'CUSTOMER', value: 'C' },
      ];
      expect(canExpand({ _path: deepest })).toBe(false);
    });

    it('trusts the server when it says a row is a leaf', () => {
      // Without has_children every leaf shows an arrow and costs a round trip
      // to disprove.
      expect(canExpand({ _path: PATH, has_children: 0 })).toBe(false);
    });

    it('falls back to depth when the server did not compute counts', () => {
      // include_child_counts: false leaves has_children undefined.
      expect(canExpand({ _path: PATH, has_children: undefined })).toBe(true);
    });

    it('still expands a row whose children already arrived, leaf flag or not', () => {
      expect(canExpand({ _children: [{}], has_children: 0 })).toBe(true);
    });

    it('does not offer one for a row with no path', () => {
      // The total row, and anything else not stamped by _nestRows.
      expect(canExpand({})).toBe(false);
    });
  });
});

// ─── branch contents ───────────────────────────────────────────────────────────

describe('DrillDownBranch', () => {
  const renderChildren = rows => <div data-testid="children">{rows.length} rows</div>;

  it('renders already-fetched children without consulting the drill map', () => {
    const drill = drillWith();
    render(
      <DrillDownBranch
        rowData={{ _children: [{}, {}], _path: PATH }}
        drill={drill}
        renderChildren={renderChildren}
      />,
    );
    expect(screen.getByTestId('children')).toHaveTextContent('2 rows');
  });

  it('renders nothing for a view without drill-down and without children', () => {
    // The v1 path: rowExpansionTemplate used to return null here.
    const { container } = render(
      <DrillDownBranch rowData={{ _path: PATH }} drill={null} renderChildren={renderChildren} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a row with no path', () => {
    const { container } = render(
      <DrillDownBranch rowData={{}} drill={drillWith()} renderChildren={renderChildren} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a spinner before the fetch has been recorded', () => {
    // The gap between the toggle and the provider writing 'loading'.
    render(
      <DrillDownBranch rowData={{ _path: PATH }} drill={drillWith()} renderChildren={renderChildren} />,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows a spinner while loading', () => {
    const drill = drillWith({ [drillDownKey(PATH)]: { status: 'loading' } });
    render(
      <DrillDownBranch rowData={{ _path: PATH }} drill={drill} renderChildren={renderChildren} />,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();
  });

  it('renders the fetched rows once ready', () => {
    const drill = drillWith({
      [drillDownKey(PATH)]: { status: 'ready', rows: [{}, {}, {}] },
    });
    render(
      <DrillDownBranch rowData={{ _path: PATH }} drill={drill} renderChildren={renderChildren} />,
    );
    expect(screen.getByTestId('children')).toHaveTextContent('3 rows');
  });

  it('distinguishes a genuinely empty branch from a pending one', () => {
    // Both would otherwise render as a spinner forever.
    const drill = drillWith({ [drillDownKey(PATH)]: { status: 'ready', rows: [] } });
    render(
      <DrillDownBranch rowData={{ _path: PATH }} drill={drill} renderChildren={renderChildren} />,
    );
    expect(screen.getByText('No rows')).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it('shows the error message and the trace id, which is what makes a failure findable', () => {
    const drill = drillWith({
      [drillDownKey(PATH)]: {
        status: 'error',
        error: { message: 'Drill-down execution failed', extensions: { trace_id: 'abc123' } },
      },
    });
    render(
      <DrillDownBranch rowData={{ _path: PATH }} drill={drill} renderChildren={renderChildren} />,
    );
    expect(screen.getByText('Drill-down execution failed')).toBeInTheDocument();
    expect(screen.getByText('abc123')).toBeInTheDocument();
  });

  it('retries the same node on demand', async () => {
    const drill = drillWith({
      [drillDownKey(PATH)]: { status: 'error', error: { message: 'boom' } },
    });
    const rowData = { _path: PATH };
    render(<DrillDownBranch rowData={rowData} drill={drill} renderChildren={renderChildren} />);

    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(drill.onExpand).toHaveBeenCalledWith(rowData);
  });

  it('falls back to a generic message when the error carries none', () => {
    const drill = drillWith({ [drillDownKey(PATH)]: { status: 'error', error: {} } });
    render(
      <DrillDownBranch rowData={{ _path: PATH }} drill={drill} renderChildren={renderChildren} />,
    );
    expect(screen.getByText('Could not load rows')).toBeInTheDocument();
  });

  it('keys nodes by the whole ancestor chain, not just the leaf value', () => {
    // Two different departments can both have an HQ called "Chennai"; keying on
    // the leaf alone would splice one node's children under the other.
    const a = [{ dimension: 'DEPARTMENT', value: 'D1' }, { dimension: 'HQ', value: 'Chennai' }];
    const b = [{ dimension: 'DEPARTMENT', value: 'D2' }, { dimension: 'HQ', value: 'Chennai' }];
    const drill = drillWith({ [drillDownKey(a)]: { status: 'ready', rows: [{}] } });

    const { container } = render(
      <DrillDownBranch rowData={{ _path: b }} drill={drill} renderChildren={renderChildren} />,
    );
    expect(container.querySelector('[data-testid="children"]')).toBeNull();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('keys nodes safely when a value contains a separator character', () => {
    const path = [{ dimension: 'CUSTOMER', value: 'A/B|C' }];
    const drill = drillWith({ [drillDownKey(path)]: { status: 'ready', rows: [{}] } });
    render(
      <DrillDownBranch rowData={{ _path: path }} drill={drill} renderChildren={renderChildren} />,
    );
    expect(screen.getByTestId('children')).toHaveTextContent('1 rows');
  });
});

// ─── paging within a node ──────────────────────────────────────────────────────

describe('DrillDownBranch — load more', () => {
  const renderChildren = rows => <div data-testid="children">{rows.length} rows</div>;
  const PATH2 = [{ dimension: 'DEPARTMENT', value: 'D1' }];
  const withNode = node => ({
    fullGroupBy: ['DEPARTMENT', 'HQ'],
    nodes: { [drillDownKey(PATH2)]: node },
    onExpand: vi.fn(),
    onLoadMore: vi.fn(),
    onToggle: vi.fn(),
  });

  it('offers Load more only when the server said there is a next page', () => {
    const drill = withNode({ status: 'ready', rows: [{}], hasNextPage: true });
    render(<DrillDownBranch rowData={{ _path: PATH2 }} drill={drill} renderChildren={renderChildren} />);
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });

  it('does not offer it on the last page', () => {
    const drill = withNode({ status: 'ready', rows: [{}], hasNextPage: false });
    render(<DrillDownBranch rowData={{ _path: PATH2 }} drill={drill} renderChildren={renderChildren} />);
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('asks for the next page of the node it was rendered for', async () => {
    const drill = withNode({ status: 'ready', rows: [{}], hasNextPage: true });
    const rowData = { _path: PATH2 };
    render(<DrillDownBranch rowData={rowData} drill={drill} renderChildren={renderChildren} />);
    await userEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(drill.onLoadMore).toHaveBeenCalledWith(rowData);
  });

  it('keeps the rows on screen while the next page loads', () => {
    // A page-2 fetch must not blank the branch back to a spinner -- that reads
    // as losing the rows the user was already looking at.
    const drill = withNode({ status: 'loadingMore', rows: [{}, {}], hasNextPage: true });
    render(<DrillDownBranch rowData={{ _path: PATH2 }} drill={drill} renderChildren={renderChildren} />);
    expect(screen.getByTestId('children')).toHaveTextContent('2 rows');
    expect(screen.getByText(/loading more/i)).toBeInTheDocument();
  });

  it('hides Load more while a page is in flight, so it cannot be double-fired', () => {
    const drill = withNode({ status: 'loadingMore', rows: [{}], hasNextPage: true });
    render(<DrillDownBranch rowData={{ _path: PATH2 }} drill={drill} renderChildren={renderChildren} />);
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });
});
