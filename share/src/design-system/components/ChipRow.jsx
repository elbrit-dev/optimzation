'use client';

import { cx } from '../lib/cx';

/* ChipRow — a horizontal row of mutually-exclusive pills.

   Not SegmentedControl: that one divides a fixed, small, known set (Today /
   Month) and sizes its items equally. This one selects from an OPEN list
   whose length is data-driven — 2 HQs today, 97 when the scope widens — so it
   scrolls horizontally, sizes to content, and never wraps.

   Scrolling comes from `.ds-scroll-x`, shared with the HQ card strip on
   /visit — on a phone both are swipe surfaces and a visible scrollbar under
   them reads as a rendering bug. */

export function ChipRow({
  items = [],
  value,
  onChange,
  ariaLabel = 'Filter',
  className,
  ...rest
}) {
  if (items.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx('ds-chiprow', 'ds-scroll-x', className)}
      {...rest}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={cx('ds-chiprow__chip', active && 'ds-chiprow__chip--active')}
            onClick={() => onChange?.(item.key)}
          >
            {item.label}
            {item.count != null ? (
              <span className="ds-chiprow__count"> · {item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
