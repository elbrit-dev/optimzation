'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { InputText } from 'primereact/inputtext';

export const NumericFilter = memo(function NumericFilter({ field, value, onFilter, debounceMs = 400 }) {
  const committedStr = value?.value != null ? String(value.value) : '';
  const [draft, setDraft] = useState(committedStr);

  useEffect(() => {
    setDraft(committedStr);
  }, [committedStr]);

  const onFilterRef = useRef(onFilter);
  onFilterRef.current = onFilter;

  const debouncedCommit = useMemo(
    () =>
      debounce((raw) => {
        onFilterRef.current(field, raw === '' ? null : { type: 'numeric', value: raw });
      }, debounceMs),
    [field, debounceMs]
  );

  useEffect(() => () => debouncedCommit.cancel?.(), [debouncedCommit]);

  function commit(raw) {
    debouncedCommit.cancel?.();
    onFilterRef.current(field, raw === '' ? null : { type: 'numeric', value: raw });
  }

  return (
    <InputText
      value={draft}
      inputMode="decimal"
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        debouncedCommit(raw);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(e.currentTarget.value);
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
      placeholder="<, >, <=, >=, =, <>"
      title="Numeric filters: <10, >10, <=10, >=10, =10, 10<>20 (range)"
      className="p-column-filter"
      style={{ width: '100%' }}
    />
  );
});
