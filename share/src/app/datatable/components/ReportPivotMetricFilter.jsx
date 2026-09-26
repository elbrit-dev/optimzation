'use client';

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { InputText } from 'primereact/inputtext';

/**
 * Pivot metric leaf filter — same Prime `{ value }` shape and numeric syntax as column row filters.
 * Uses `parseNumericFilter` downstream (same as `numericFilterElement` / `ColumnFilterTextInput`).
 */
export const ReportPivotMetricFilter = memo(function ReportPivotMetricFilter({
  columnField,
  committedValue,
  debounceMs,
  onCommit,
}) {
  const committedStr =
    committedValue == null || committedValue === '' ? '' : String(committedValue);
  const [draft, setDraft] = useState(committedStr);

  useEffect(() => {
    setDraft(committedStr);
  }, [committedStr]);

  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const debouncedCommit = useMemo(
    () =>
      debounce((raw) => {
        onCommitRef.current(columnField, raw === '' ? null : raw);
      }, debounceMs),
    [columnField, debounceMs]
  );

  useEffect(() => () => debouncedCommit.cancel?.(), [debouncedCommit]);

  return (
    <div className="multiselect-filter-container w-full min-w-0">
      <InputText
        value={draft}
        inputMode="decimal"
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          debouncedCommit(raw);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            debouncedCommit.cancel?.();
            onCommitRef.current(
              columnField,
              e.currentTarget.value === '' ? null : e.currentTarget.value
            );
          }
        }}
        onBlur={(e) => {
          debouncedCommit.cancel?.();
          onCommitRef.current(columnField, e.currentTarget.value === '' ? null : e.currentTarget.value);
        }}
        placeholder="<, >, <=, >=, =, <>"
        title="Numeric filters: <10, >10, <=10, >=10, =10, 10<>20 (range)"
        className="p-column-filter"
        style={{ width: '100%' }}
      />
    </div>
  );
});
