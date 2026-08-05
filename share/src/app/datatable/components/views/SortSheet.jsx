'use client';

import { Sidebar } from 'primereact/sidebar';
import { useCallback, useMemo, useState } from 'react';
import { useTableOperations } from '../../contexts/TableOperationsContext';

/**
 * Named sort presets in a bottom sheet, instead of the built-in Filter / Sort sidebar.
 *
 * Drives the provider's table sort (updateSort) with PrimeReact sortMeta —
 * [{ field, order }] where order 1 = ascending, -1 = descending — so cards and
 * table stay in the same order.
 */

/** Accepts { label, field, order|direction } and normalizes order to 1 / -1. */
function normalizeOptions(options) {
  const list = Array.isArray(options) ? options : [];
  const out = [];
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const field = entry.field != null ? String(entry.field) : '';
    if (!field) return;
    let order = entry.order;
    if (order == null && entry.direction != null) {
      order = String(entry.direction).toLowerCase() === 'desc' ? -1 : 1;
    }
    order = Number(order) === -1 ? -1 : 1;
    out.push({
      id: String(entry.id ?? `${field}:${order}`),
      label: String(entry.label ?? `${field} ${order === 1 ? '↑' : '↓'}`),
      field,
      order,
      index,
    });
  });
  return out;
}

export default function SortSheet({
  options,
  title = 'Sort products',
  triggerLabel,
  applyOnSelect = true,
}) {
  const { sortMeta, updateSort } = useTableOperations();
  const [visible, setVisible] = useState(false);

  const normalized = useMemo(() => normalizeOptions(options), [options]);

  const activeOption = useMemo(() => {
    const current = Array.isArray(sortMeta) ? sortMeta[0] : null;
    if (!current?.field) return null;
    const order = Number(current.order) === -1 ? -1 : 1;
    return normalized.find((o) => o.field === current.field && o.order === order) ?? null;
  }, [sortMeta, normalized]);

  const select = useCallback((option) => {
    if (applyOnSelect) updateSort?.([{ field: option.field, order: option.order }]);
    setVisible(false);
  }, [applyOnSelect, updateSort]);

  if (normalized.length === 0) return null;

  // Falls back to the first preset's label so the pill reads like the design
  // ("A → Z") before the user has picked anything.
  const pillLabel = triggerLabel ?? activeOption?.label ?? normalized[0].label;

  return (
    <>
      <button
        type="button"
        onClick={() => setVisible(true)}
        aria-haspopup="dialog"
        aria-expanded={visible}
        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-gray-50"
        style={{ height: '2rem' }}
      >
        <i className="pi pi-sort-alt text-xs text-gray-400" aria-hidden="true" />
        {pillLabel}
      </button>

      <Sidebar
        visible={visible}
        position="bottom"
        onHide={() => setVisible(false)}
        showCloseIcon={false}
        blockScroll
        style={{ height: 'auto', maxHeight: '80vh', borderTopLeftRadius: '1rem', borderTopRightRadius: '1rem' }}
      >
        <div className="mx-auto w-full max-w-md">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300" aria-hidden="true" />
          <h3 className="mb-2 text-base font-bold text-slate-900">{title}</h3>
          <ul role="radiogroup" aria-label={title}>
            {normalized.map((option) => {
              const selected = activeOption ? activeOption.id === option.id : false;
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => select(option)}
                    className="flex w-full items-center gap-3 border-t border-gray-100 py-4 text-left"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        selected ? 'border-red-600' : 'border-gray-300'
                      }`}
                    >
                      {selected ? <span className="h-2.5 w-2.5 rounded-full bg-red-600" /> : null}
                    </span>
                    <span
                      className={`text-sm ${
                        selected ? 'font-bold text-slate-900' : 'font-medium text-slate-600'
                      }`}
                    >
                      {option.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Sidebar>
    </>
  );
}
