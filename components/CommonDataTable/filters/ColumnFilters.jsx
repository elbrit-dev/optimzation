'use client';

/**
 * Header-row filter inputs, one per column type.
 *
 * Text and number inputs keep their own draft state and commit on a debounce, so
 * typing stays responsive on large datasets and survives PrimeReact remounting the
 * filter cell (which it does whenever the column set changes).
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { InputText } from 'primereact/inputtext';
import { Calendar } from 'primereact/calendar';
import { MultiSelect } from 'primereact/multiselect';
import { TriStateCheckbox } from 'primereact/tristatecheckbox';

export const FILTER_DEBOUNCE_MS = 400;

export const NUMERIC_FILTER_HINT = 'Operators: >100  >=100  <100  <=100  =100  10<>50 (range)';

/** Debounced text/number filter cell. `committedValue` flows back down from pipeline state. */
const DebouncedFilterInput = memo(function DebouncedFilterInput({
  column,
  committedValue,
  onCommit,
  placeholder,
  title,
  debounceMs = FILTER_DEBOUNCE_MS,
}) {
  const committed = committedValue == null || committedValue === '' ? '' : String(committedValue);
  const [draft, setDraft] = useState(committed);

  useEffect(() => {
    setDraft(committed);
  }, [committed]);

  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const commitDebounced = useMemo(
    () => debounce((raw) => onCommitRef.current(column, raw === '' ? null : raw), debounceMs),
    [column, debounceMs],
  );

  useEffect(() => () => commitDebounced.cancel?.(), [commitDebounced]);

  const commitNow = (raw) => {
    commitDebounced.cancel?.();
    onCommitRef.current(column, raw === '' ? null : raw);
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
      placeholder={placeholder}
      title={title}
      className="p-column-filter p-inputtext-sm"
      style={{ width: '100%', minWidth: '5rem' }}
    />
  );
});

export const ColumnFilterText = memo(function ColumnFilterText(props) {
  return <DebouncedFilterInput {...props} placeholder={props.placeholder ?? 'Search'} />;
});

export const ColumnFilterNumber = memo(function ColumnFilterNumber(props) {
  return (
    <DebouncedFilterInput
      {...props}
      placeholder={props.placeholder ?? '> < ='}
      title={props.title ?? NUMERIC_FILTER_HINT}
    />
  );
});

export const ColumnFilterDate = memo(function ColumnFilterDate({ column, committedValue, onCommit }) {
  const value = Array.isArray(committedValue) ? committedValue : null;
  return (
    <Calendar
      value={value}
      onChange={(event) => {
        const range = event.value;
        const hasAny = Array.isArray(range) && (range[0] || range[1]);
        onCommit(column, hasAny ? range : null);
      }}
      selectionMode="range"
      readOnlyInput
      showButtonBar
      hideOnRangeSelection
      dateFormat="d M yy"
      placeholder="Date range"
      className="p-column-filter"
      inputClassName="p-inputtext-sm"
      style={{ width: '100%', minWidth: '8rem' }}
      appendTo={typeof document === 'undefined' ? undefined : document.body}
    />
  );
});

export const ColumnFilterBoolean = memo(function ColumnFilterBoolean({ column, committedValue, onCommit }) {
  const value = committedValue === true || committedValue === false ? committedValue : null;
  return (
    <div className="flex justify-center" title="Click to cycle: any → true → false">
      <TriStateCheckbox value={value} onChange={(event) => onCommit(column, event.value ?? null)} />
    </div>
  );
});

export const ColumnFilterMultiselect = memo(function ColumnFilterMultiselect({
  column,
  committedValue,
  onCommit,
  options = [],
  label,
}) {
  const value = Array.isArray(committedValue) ? committedValue : [];
  return (
    <MultiSelect
      value={value}
      options={options}
      onChange={(event) => onCommit(column, event.value?.length ? event.value : null)}
      placeholder="All"
      maxSelectedLabels={1}
      selectedItemsLabel={`${value.length} selected`}
      filter={options.length > 8}
      showClear={value.length > 0}
      className="p-column-filter w-full text-xs"
      panelClassName="text-sm"
      style={{ minWidth: '6.5rem' }}
      appendTo={typeof document === 'undefined' ? undefined : document.body}
      aria-label={`Filter ${label || column}`}
    />
  );
});

/** Which filter UI a column gets. Typed columns win over multiselect. */
export function resolveFilterKind(col, { columnTypes, multiselectColumns }) {
  const type = columnTypes?.[col] || 'string';
  if (type === 'boolean' || type === 'date' || type === 'number') return type;
  if (Array.isArray(multiselectColumns) && multiselectColumns.includes(col)) return 'multiselect';
  return 'text';
}
