'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { InputText } from 'primereact/inputtext';

export const TextFilter = memo(function TextFilter({ field, value, onFilter, debounceMs = 300 }) {
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
        onFilterRef.current(field, raw === '' ? null : { type: 'text', value: raw });
      }, debounceMs),
    [field, debounceMs]
  );

  useEffect(() => () => debouncedCommit.cancel?.(), [debouncedCommit]);

  function commit(raw) {
    debouncedCommit.cancel?.();
    onFilterRef.current(field, raw === '' ? null : { type: 'text', value: raw });
  }

  return (
    <InputText
      value={draft}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        debouncedCommit(raw);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(e.currentTarget.value);
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
      placeholder="Search..."
      className="p-column-filter"
      style={{ width: '100%' }}
    />
  );
});
