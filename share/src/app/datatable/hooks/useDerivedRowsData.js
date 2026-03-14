'use client';

import { isArray } from 'lodash';
import { useEffect, useMemo, useState } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!hasDerivedRows) {
      setAsyncResult(null);
      setIsLoading(false);
      return;
    }
    if (!isArray(rawTableData)) {
      setAsyncResult(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    applyDerivedRowsAsync(rawTableData, derivedRows, {
      query: queryFunction,
      selectedQueryKey,
      currentQueryDoc,
    })
      .then((merged) => {
        if (!cancelled) {
          setAsyncResult(merged);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[useDerivedRowsData] Error:', err);
          setAsyncResult(rawTableData);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rawTableData, derivedRows, queryFunction, selectedQueryKey, currentQueryDoc, hasDerivedRows]);

  return useMemo(() => {
    if (!hasDerivedRows) {
      return { data: rawTableData ?? [], isLoading: false };
    }
    if (!isArray(rawTableData)) {
      return { data: rawTableData ?? [], isLoading: false };
    }
    if (isLoading && asyncResult == null) {
      return { data: syncResult ?? rawTableData, isLoading: true };
    }
    return { data: asyncResult ?? syncResult ?? rawTableData, isLoading: false };
  }, [hasDerivedRows, rawTableData, isLoading, asyncResult, syncResult]);
}
