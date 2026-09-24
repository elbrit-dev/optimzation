'use client';

import { useEffect, useState } from 'react';
import { cx } from '../lib/cx';

/* SegmentedControl — the Cards / Table switcher, day/week/month, and any
   other small mutually-exclusive choice.

   Deliberately API-compatible with the existing `ViewSwitcher` so that
   component can delegate here: it accepts `['Cards','Table']` or
   `[{ id, label, icon }]`, and is controlled via `value` or uncontrolled via
   `defaultValue`.

   Height comes from --control-h-default (so it follows the surrounding
   [data-surface] scope) rather than the 1.75rem/28px literal ViewSwitcher
   used — 28px is not on the control scale. */

function normalizeItems(items) {
  const list = Array.isArray(items) ? items : [];
  const seen = new Set();
  const out = [];

  list.forEach((entry, index) => {
    if (entry == null) return;
    const raw = typeof entry === 'string' ? { id: entry, label: entry } : entry;
    const id = String(raw.id ?? raw.viewId ?? raw.label ?? `item-${index}`).trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      label: String(raw.label ?? id),
      icon: raw.icon ?? null,
      disabled: Boolean(raw.disabled),
    });
  });

  return out;
}

export function SegmentedControl({
  items,
  views,
  value,
  defaultValue,
  onChange,
  shape = 'default',
  ariaLabel = 'View',
  className,
  style,
  ...rest
}) {
  const normalized = normalizeItems(items ?? views);
  const isControlled = value != null && value !== '';
  const [internal, setInternal] = useState(defaultValue ?? normalized[0]?.id);
  const active = isControlled ? value : internal;

  // onChange otherwise only fires on click, so a Plasmic $state bound to this
  // component stays undefined until the first interaction even with
  // defaultValue set. Emit the initial value once on mount.
  useEffect(() => {
    if (!isControlled) onChange?.(internal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (normalized.length < 2) return null;

  function select(id) {
    if (!isControlled) setInternal(id);
    onChange?.(id);
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx('ds-segmented', shape === 'pill' && 'ds-segmented--pill', className)}
      style={style}
      {...rest}
    >
      {normalized.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === active}
          disabled={item.disabled}
          onClick={() => select(item.id)}
          className="ds-segmented__item"
        >
          {item.icon ? (
            <span className="ds-icon" aria-hidden="true" style={{ fontSize: 'var(--icon-md)' }}>
              {typeof item.icon === 'string' ? <i className={item.icon} /> : item.icon}
            </span>
          ) : null}
          {item.label}
        </button>
      ))}
    </div>
  );
}
