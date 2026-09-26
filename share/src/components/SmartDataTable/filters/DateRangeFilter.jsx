'use client';

import { useState } from 'react';
import { Calendar } from 'primereact/calendar';

export function DateRangeFilter({ field, value, onFilter }) {
  const [dates, setDates] = useState(null);

  function handleChange(e) {
    const val = e.value;
    setDates(val);
    if (!val || (!val[0] && !val[1])) {
      onFilter(field, null);
      return;
    }
    onFilter(field, { type: 'date', value: { start: val[0] ?? null, end: val[1] ?? null } });
  }

  function handleClear() {
    setDates(null);
    onFilter(field, null);
  }

  const hasValue = dates && (dates[0] || dates[1]);

  return (
    <div className="date-range-filter relative flex items-center gap-1">
      {/* Icon sits inside the field: Calendar's showIcon button is styled for the
          right edge, so on the left it rendered as a blank box and squeezed the input. */}
      <i className="pi pi-calendar pointer-events-none absolute left-2 top-1/2 z-1 -translate-y-1/2 text-10 text-ds-muted" aria-hidden="true" />
      <Calendar
unstyled
        value={dates}
        onChange={handleChange}
        selectionMode="range"
        readOnlyInput
        placeholder="Date range"
        dateFormat="M d, yy"
        className="date-range-calendar min-w-0 flex-1"
        inputClassName="text-xs"
        inputStyle={{ paddingLeft: '1.625rem' }}
        showButtonBar
        numberOfMonths={1}
        style={{ width: '100%' }}
      />
      {hasValue && (
        <button
          type="button"
          onClick={handleClear}
          className="p-1 text-ds-muted hover:text-ds-secondary transition-colors"
          title="Clear filter"
        >
          <i className="pi pi-times text-xs" />
        </button>
      )}
    </div>
  );
}
