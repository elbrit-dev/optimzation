'use client';

import { isArray } from 'lodash';
import { useEffect, useMemo, useRef, useState } from 'react';
import { applyDerivedRows, applyDerivedRowsAsync } from '../utils/derivedRowsUtils';

/**
 * Hook to merge rawTableData with derived rows (sync or async).
 * Applied once between raw data and auth filter.
 * @param {Array} rawTableData - Data from processedData/offline
 * @param {Object|null} derivedRows - { compute: (ctx) => Row[] | Promise<Row[]> }
 * @param {Function} queryFunction - runQuery/query function for ctx.query
 * @param {Object} context - { selectedQueryKey, currentQueryDoc }
 * @returns {{ data: Array, isLoading: boolean }}
 */
export function useDerivedRowsData(rawTableData, derivedRows, queryFunction, context = {}) {
  const { selectedQueryKey = null, currentQueryDoc = null } = context;

  const hasDerivedRows = derivedRows && typeof derivedRows.compute === 'function';

  const syncResult = useMemo(() => {
    if (!hasDerivedRows) return null;
    if (!isArray(rawTableData)) return null;
    return applyDerivedRows(rawTableData, derivedRows, {
      query: queryFunction,
      selectedQueryKey,
      currentQueryDoc,
    });
  }, [rawTableData, derivedRows, queryFunction, selectedQueryKey, currentQueryDoc, hasDerivedRows]);

  const [asyncResult, setAsyncResult] = useState(null);
  const [asyncError, setAsyncError] = useState(null);
  const mergeGenerationRef = useRef(0);

  useEffect(() => {
    if (!hasDerivedRows) {
      setAsyncResult(null);
      setAsyncError(null);
      return;
    }
    if (!isArray(rawTableData) || rawTableData.length === 0) {
      setAsyncResult(null);
      setAsyncError(null);
      return;
    }

    const generation = ++mergeGenerationRef.current;
    setAsyncResult(null);
    setAsyncError(null);

    let cancelled = false;
    applyDerivedRowsAsync(rawTableData, derivedRows, {
      query: queryFunction,
      selectedQueryKey,
      currentQueryDoc,
    })
      .then((merged) => {
        if (cancelled || generation !== mergeGenerationRef.current) return;
        setAsyncResult(merged);
      })
      .catch((err) => {
        if (cancelled || generation !== mergeGenerationRef.current) return;
        console.warn('[useDerivedRowsData] Error:', err);
        setAsyncError(err);
        setAsyncResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rawTableData, derivedRows, queryFunction, selectedQueryKey, currentQueryDoc, hasDerivedRows]);

  return useMemo(() => {
    if (!hasDerivedRows) {
      return { data: rawTableData ?? [], isLoading: false };
    }
    if (!isArray(rawTableData) || rawTableData.length === 0) {
      return { data: rawTableData ?? [], isLoading: false };
    }

    if (asyncResult != null) {
      return { data: asyncResult, isLoading: false };
    }

    if (asyncError) {
      return { data: rawTableData, isLoading: false };
    }

    const syncMerged = syncResult ?? rawTableData;
    const syncOnlyReady =
      syncMerged !== rawTableData ||
      (isArray(syncMerged) && syncMerged.length !== rawTableData.length);
    if (syncOnlyReady) {
      return { data: syncMerged, isLoading: false };
    }

    // Async merge in flight — never pass primary-only rows to pipeline.
    return { data: [], isLoading: true };
  }, [hasDerivedRows, rawTableData, asyncResult, asyncError, syncResult]);
}
