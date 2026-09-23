'use client';

import { useEffect, useRef } from 'react';
import { useTableOperations } from '../../contexts/TableOperationsContext';

/**
 * Lifts the engine's sort and filter selections up to DataProviderViews.
 *
 * DataProviderViews sits ABOVE the engine, so it cannot read
 * TableOperationsContext — which is where the Filter/Sort sidebar puts its
 * choice. Rather than give the variant a second sort control (the mistake
 * SortSheet made and was deleted for), this renders nothing from inside the
 * context and reports the one value the variant needs, so the existing sidebar
 * stays the only place sorting is chosen.
 *
 * Only `field` and `direction` are lifted, and only when they actually change,
 * so the parent re-renders on a real sort change and not on every engine tick.
 *
 * The sidebar's filter selections ride along for the same reason and are keyed
 * the same way -- by CONTENTS, not identity. Apply hands back a fresh object
 * every time, so comparing identity would report a change on every render and
 * re-run the query in a loop.
 */
export default function ServerOpsBridge({ onSortConfigChange, onFilterValuesChange }) {
  const { sortConfig, preFilterValues } = useTableOperations();
  const field = sortConfig?.field ?? null;
  const direction = sortConfig?.direction ?? null;
  const callbackRef = useRef(onSortConfigChange);
  callbackRef.current = onSortConfigChange;

  useEffect(() => {
    callbackRef.current?.(field ? { field, direction } : null);
  }, [field, direction]);

  // Only fields with at least one selected value: an empty array is the
  // sidebar's "cleared", and sending it as a clause would filter to nothing.
  const filterSignature = JSON.stringify(
    Object.entries(preFilterValues ?? {})
      .filter(([, values]) => Array.isArray(values) ? values.length > 0 : values != null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const filterCallbackRef = useRef(onFilterValuesChange);
  filterCallbackRef.current = onFilterValuesChange;

  useEffect(() => {
    filterCallbackRef.current?.(Object.fromEntries(JSON.parse(filterSignature)));
  }, [filterSignature]);

  return null;
}
