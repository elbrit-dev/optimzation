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
    <div className="date-range-filter flex items-center gap-1">
      <Calendar
        value={dates}
        onChange={handleChange}
        selectionMode="range"
        readOnlyInput
        placeholder="Date range"
        showIcon
        iconPos="left"
        dateFormat="M d, yy"
        className="p-column-filter date-range-calendar"
        inputClassName="text-xs"
        showButtonBar
        numberOfMonths={1}
        style={{ width: '100%' }}
      />
      {hasValue && (
        <button
          type="button"
          onClick={handleClear}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          title="Clear filter"
        >
          <i className="pi pi-times text-xs" />
        </button>
      )}
    </div>
  );
}
