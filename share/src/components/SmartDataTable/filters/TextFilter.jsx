'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { InputText } from 'primereact/inputtext';
import { inputTextPt } from '@/design-system/primereact/inputTextPreset';

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
unstyled
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
      /* A lara filter class used to be applied here, so our own code was
         reaching for a theme class to get its font size (via an `!important`
         rule in globals.css). Geometry now comes from the design-system
         preset, and the width from the enclosing `columnFilter` pt section. */
      unstyled
      pt={inputTextPt}
    />
  );
});
