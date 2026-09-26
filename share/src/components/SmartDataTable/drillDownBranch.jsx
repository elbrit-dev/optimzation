'use client';

/**
 * Drill-down rendering: what goes under an expanded row, and which rows may be
 * expanded at all.
 *
 * Split out of SmartDataTable.jsx because both the outer table and every level of
 * the recursive InnerDataTable need exactly this logic, and because it is the part
 * with branching worth testing directly.
 */

import { drillDownKey } from './reportSource.jsx';

/**
 * What to render under an expanded row.
 *
 * Two sources of children, in priority order. `_children` means the subtree
 * arrived with the response, which is how every non-drill-down view works and
 * how a drill-down view's initial levels work. Otherwise the children were
 * fetched lazily and live in the view's `drillDown` map, keyed by the row's own
 * ancestor chain.
 *
 * `drill` is null for v1 views and for v2 views that did not opt in, which is
 * what keeps this whole path inert for them.
 */
export function DrillDownBranch({ rowData, drill, renderChildren }) {
  if (rowData._children?.length) return renderChildren(rowData._children);
  if (!drill || !rowData._path?.length) return null;

  const node = drill.nodes[drillDownKey(rowData._path)];

  if (!node || node.status === 'loading') {
    return (
      <div className="px-6 py-3 text-sm text-gray-500 flex items-center gap-2">
        <span className="pi pi-spin pi-spinner" aria-hidden="true" />
        Loading{'\u2026'}
      </div>
    );
  }

  if (node.status === 'error') {
    // The trace id is the one thing that makes a server-side failure findable,
    // so it is surfaced rather than swallowed into a generic message.
    const traceId = node.error?.extensions?.trace_id ?? node.error?.trace_id;
    return (
      <div className="px-6 py-3 text-sm text-red-600 flex items-center gap-3">
        <span>{node.error?.message ?? 'Could not load rows'}</span>
        {traceId && <span className="text-xs text-gray-400 font-mono">{traceId}</span>}
        <button
          type="button"
          className="text-xs underline"
          onClick={() => drill.onExpand(rowData)}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!node.rows?.length) {
    return <div className="px-6 py-3 text-sm text-gray-500">No rows</div>;
  }

  // `limit` pages the fetched level, so a node with more children than one page
  // needs a way to ask for the rest. Appending rather than replacing is what
  // makes this additive -- see the provider's fetchDrillDown.
  return (
    <>
      {renderChildren(node.rows)}
      {node.status === 'loadingMore' && (
        <div className="px-6 py-2 text-sm text-gray-500 flex items-center gap-2">
          <span className="pi pi-spin pi-spinner" aria-hidden="true" />
          Loading more{'\u2026'}
        </div>
      )}
      {node.status === 'ready' && node.hasNextPage && (
        <div className="px-6 py-2">
          <button type="button" className="text-xs underline" onClick={() => drill.onLoadMore(rowData)}>
            Load more
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Whether a row should show an expand affordance.
 *
 * Without drill-down this is just "did children arrive". With it, a row can have
 * children that have not been fetched, so the question becomes whether any exist:
 * `has_children` when the server computed it, and otherwise whether the row is
 * shallower than the full group_by.
 */
export function makeCanExpand(drill) {
  return (rowData) => {
    if (rowData._children?.length) return true;
    if (!drill) return false;
    if (rowData.has_children === 0) return false;
    // A row with no path cannot be expanded even if the tree goes deeper --
    // there is nothing to send as parent_path, so the branch would render empty.
    const depth = rowData._path?.length ?? 0;
    return depth > 0 && depth < drill.fullGroupBy.length;
  };
}
