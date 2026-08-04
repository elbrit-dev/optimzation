'use client';

/**
 * The one input that sits under a column header.
 *
 * Keeps its own draft text and commits on a debounce, so typing stays responsive on a
 * large table and survives PrimeReact remounting the filter cell.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { InputText } from 'primereact/inputtext';

export const FILTER_DEBOUNCE_MS = 350;

export const NUMERIC_FILTER_HINT =
  'Operators: >100   >=100   <100   <=100   =100   10<>50 (range)';

const ColumnFilterInput = memo(function ColumnFilterInput({
  column,
  value,
  onCommit,
  isNumeric,
  debounceMs = FILTER_DEBOUNCE_MS,
}) {
  const committed = value == null ? '' : String(value);
  const [draft, setDraft] = useState(committed);

  useEffect(() => {
    setDraft(committed);
  }, [committed]);

  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const commitDebounced = useMemo(
    () => debounce((raw) => onCommitRef.current(column, raw), debounceMs),
    [column, debounceMs],
  );

  useEffect(() => () => commitDebounced.cancel?.(), [commitDebounced]);

  const commitNow = (raw) => {
    commitDebounced.cancel?.();
    onCommitRef.current(column, raw);
  };

  return (
    <InputText
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        commitDebounced(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commitNow(event.currentTarget.value);
        if (event.key === 'Escape') {
          setDraft('');
          commitNow('');
        }
      }}
      onBlur={(event) => commitNow(event.currentTarget.value)}
      placeholder={isNumeric ? '<, >, =' : 'Search…'}
      title={isNumeric ? NUMERIC_FILTER_HINT : `Search ${column}`}
      className="p-column-filter p-inputtext-sm w-full"
      style={{ minWidth: '4.5rem' }}
      aria-label={`Filter ${column}`}
    />
  );
});

export default ColumnFilterInput;
