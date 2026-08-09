'use client';

import { useState } from 'react';

const DEFAULT_VIEWS = [
  { id: 'cards', label: 'Cards', icon: 'pi pi-th-large' },
  { id: 'table', label: 'Table', icon: 'pi pi-bars' },
];

/** Accepts ['Cards', 'Table'] or [{ id, label, icon }] and returns a normalized, de-duped list. */
function normalizeViews(views) {
  const list = Array.isArray(views) ? views : [];
  const seen = new Set();
  const out = [];
  list.forEach((entry, index) => {
    if (entry == null) return;
    const raw = typeof entry === 'string' ? { id: entry, label: entry } : entry;
    const id = String(raw.id ?? raw.viewId ?? raw.label ?? `view-${index}`).trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, label: String(raw.label ?? id), icon: raw.icon ?? null });
  });
  return out.length > 0 ? out : DEFAULT_VIEWS;
}

/**
 * ViewSwitcher — standalone segmented control (e.g. Cards / Table), for
 * dropping into SmartDataProvider's `toolbarExtra` slot or anywhere else.
 *
 * Uncontrolled by default (owns its own selection internally) or controlled
 * via `value` + `onChange` — bind `value` to a Plasmic variable/state and
 * wire visibility on your Cards/Table blocks to that same variable to switch
 * layouts. Sized to 1.75rem to line up with SmartDataProvider's other
 * toolbar controls (Pivot, Display in Lakhs, Filter & Sort).
 */
export function ViewSwitcher({ views, value, defaultValue, onChange, className }) {
  const normalized = normalizeViews(views);
  const [internal, setInternal] = useState(defaultValue ?? normalized[0]?.id);

  const isControlled = value != null && value !== '';
  const active = isControlled ? value : internal;

  if (normalized.length < 2) return null;

  function select(id) {
    if (!isControlled) setInternal(id);
    onChange?.(id);
  }

  return (
    <div
      role="tablist"
      aria-label="View"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 p-0.5 ${className ?? ''}`}
      style={{ height: '1.75rem' }}
    >
      {normalized.map((view) => {
        const isActive = view.id === active;
        return (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(view.id)}
            className={`inline-flex h-full items-center gap-1 whitespace-nowrap rounded px-1.5 text-[11px] font-medium transition-colors sm:gap-1.5 sm:px-2 sm:text-xs ${
              isActive
                ? 'bg-white text-slate-800 shadow-sm ring-1 ring-gray-200'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {view.icon ? <i className={`${view.icon} text-xs`} aria-hidden="true" /> : null}
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
