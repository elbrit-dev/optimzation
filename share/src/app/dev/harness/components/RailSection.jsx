'use client';

import { useState } from 'react';
import { Icon } from '@/design-system';

/* One collapsible block of the harness rail. */
export function RailSection({ title, aside, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="flex flex-col gap-3 border-b border-line-subtle pb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between gap-2 text-left"
      >
        <span className="text-10 font-semibold uppercase tracking-wide text-ds-muted">{title}</span>
        <span className="flex items-center gap-2 text-10 text-ds-muted">
          {aside}
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size="sm" />
        </span>
      </button>
      {open ? children : null}
    </section>
  );
}

/* PrimeReact's unstyled Dropdown in the rail's field frame, as the old
   harnesses drew it (a native select cannot carry a filter box). */
export const DROPDOWN_STYLE = { height: 'var(--control-h)' };

export function FieldLabel({ htmlFor, children }) {
  return (
    <label className="ds-field-label" htmlFor={htmlFor}>
      {children}
    </label>
  );
}
