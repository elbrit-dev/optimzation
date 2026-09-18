'use client';

import { useEffect, useRef } from 'react';
import { useTableOperations } from '../../contexts/TableOperationsContext';

/**
 * Lifts the engine's sort selection up to DataProviderViews.
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
 */
export default function ServerOpsBridge({ onSortConfigChange }) {
  const { sortConfig } = useTableOperations();
  const field = sortConfig?.field ?? null;
  const direction = sortConfig?.direction ?? null;
  const callbackRef = useRef(onSortConfigChange);
  callbackRef.current = onSortConfigChange;

  useEffect(() => {
    callbackRef.current?.(field ? { field, direction } : null);
  }, [field, direction]);

  return null;
}
