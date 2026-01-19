'use client';

import { useState, useRef, useEffect } from 'react';
import { OverlayPanel } from 'primereact/overlaypanel';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Divider } from 'primereact/divider';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export default function MonthRangePicker({
  value = null,
  onChange,
  placeholder = ['Start month', 'End month'],
  format = 'MM/YY',
  disabled = false,
  className = '',
  style = {}
}) {
  const [currentYear, setCurrentYear] = useState(() => {
    if (value && value[0]) {
      return new Date(value[0]).getFullYear();
    }
    return new Date().getFullYear();
  });
  const [isOpen, setIsOpen] = useState(false);
  const [startMonth, setStartMonth] = useState(null);
  const [endMonth, setEndMonth] = useState(null);
  const [tempStartMonth, setTempStartMonth] = useState(null);
  const overlayRef = useRef(null);
  const inputRef = useRef(null);

  // Initialize from value prop
  useEffect(() => {
    if (value && Array.isArray(value) && value.length === 2) {
      if (value[0]) {
        const start = new Date(value[0]);
        setStartMonth({ year: start.getFullYear(), month: start.getMonth() });
        setCurrentYear(start.getFullYear());
      }
      if (value[1]) {
        const end = new Date(value[1]);
        setEndMonth({ year: end.getFullYear(), month: end.getMonth() });
      }
    } else {
      setStartMonth(null);
      setEndMonth(null);
    }
  }, [value]);

  const formatMonthValue = (monthObj) => {
    if (!monthObj) return '';
    const monthName = MONTHS[monthObj.month];
    const year = monthObj.year;
    return `${monthName} ${year}`;
  };

  const getDisplayValue = () => {
    if (startMonth && endMonth) {
      return `${formatMonthValue(startMonth)} - ${formatMonthValue(endMonth)}`;
    } else if (startMonth) {
      return `${formatMonthValue(startMonth)} - ${placeholder[1] || 'End month'}`;
    }
    return '';
  };

  const handleMonthClick = (monthIndex) => {
    if (disabled) return;

    const clickedMonth = { year: currentYear, month: monthIndex };

    if (!startMonth || (startMonth && endMonth)) {
      // Start new selection
      setStartMonth(clickedMonth);
      setEndMonth(null);
      setTempStartMonth(null);
    } else if (startMonth && !endMonth) {
      // Complete the range and auto-apply
      const startDate = new Date(startMonth.year, startMonth.month);
      const endDate = new Date(currentYear, monthIndex);

      let finalStart = startMonth;
      let finalEnd = clickedMonth;

      if (endDate < startDate) {
        // If end is before start, swap them
        finalEnd = startMonth;
        finalStart = clickedMonth;
      }

      setStartMonth(finalStart);
      setEndMonth(finalEnd);
      setTempStartMonth(null);

      // Auto-apply when end is selected
      const start = new Date(finalStart.year, finalStart.month, 1);
      const end = new Date(finalEnd.year, finalEnd.month + 1, 0); // Last day of end month
      if (onChange) {
        onChange([start, end]);
      }

      // Close the panel after applying
      setIsOpen(false);
      overlayRef.current?.hide();
    }
  };

  const handleToggle = (e) => {
    if (disabled) return;

    if (isOpen) {
      overlayRef.current?.hide();
      setIsOpen(false);
    } else {
      overlayRef.current?.show(e, inputRef.current);
      setIsOpen(true);
    }
  };

  const isMonthInRange = (monthIndex) => {
    if (!startMonth) return false;

    const monthDate = new Date(currentYear, monthIndex);
    const startDate = new Date(startMonth.year, startMonth.month);

    if (endMonth) {
      const endDate = new Date(endMonth.year, endMonth.month);
      return monthDate >= startDate && monthDate <= endDate;
    } else if (tempStartMonth) {
      // When only start is selected, highlight it only
      return false;
    }

    return false;
  };

  const isMonthSelected = (monthIndex) => {
    if (startMonth && startMonth.year === currentYear && startMonth.month === monthIndex) {
      return true;
    }
    if (endMonth && endMonth.year === currentYear && endMonth.month === monthIndex) {
      return true;
    }
    return false;
  };

  const navigateYear = (direction) => {
    setCurrentYear(prev => prev + direction);
  };

  const displayValue = getDisplayValue();

  return (
    <div className={`month-range-picker ${className}`} style={style}>
      <div className="relative">
        <InputText
          ref={inputRef}
          value={displayValue}
          placeholder={placeholder[0] && placeholder[1] ? `${placeholder[0]} - ${placeholder[1]}` : placeholder[0] || 'Select month range'}
          readOnly
          disabled={disabled}
          onClick={handleToggle}
          className="w-full cursor-pointer"
          style={{
            fontSize: '0.875rem',
            height: '3rem',
            paddingRight: '2.5rem'
          }}
        />
        <i
          className="pi pi-calendar absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          style={{ fontSize: '0.875rem' }}
        />
      </div>

      <OverlayPanel
        ref={overlayRef}
        dismissable
        className="month-range-picker-overlay"
        onHide={() => setIsOpen(false)}
      >
        <div className="month-range-picker-content">
          {/* Year Navigation */}
          <div className="flex items-center justify-between">
            <Button
              icon="pi pi-chevron-left"
              className="p-button-text p-button-sm"
              onClick={() => navigateYear(-1)}
              aria-label="Previous year"
            />
            <span className="text-base font-semibold text-gray-700 min-w-[80px] text-center">
              {currentYear}
            </span>
            <Button
              icon="pi pi-chevron-right"
              className="p-button-text p-button-sm"
              onClick={() => navigateYear(1)}
              aria-label="Next year"
            />
          </div>

          <Divider />

          {/* Month Grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {MONTHS.map((month, index) => {
              const inRange = isMonthInRange(index);
              const isSelected = isMonthSelected(index);
              const isStart = startMonth && startMonth.year === currentYear && startMonth.month === index;
              const isEnd = endMonth && endMonth.year === currentYear && endMonth.month === index;

              // Determine if this month is in the middle of a range (not start or end)
              const isInMiddle = inRange && !isStart && !isEnd;

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleMonthClick(index)}
                  disabled={disabled}
                  className={`
                    month-button
                    px-3 py-2 text-sm font-medium rounded-md transition-all
                    ${isSelected
                      ? 'bg-blue-600 text-white font-semibold'
                      : inRange
                        ? isInMiddle
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-blue-100 text-blue-700'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }
                    ${isStart && endMonth ? 'rounded-l-md' : ''}
                    ${isEnd && startMonth ? 'rounded-r-md' : ''}
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                  style={{
                    minWidth: '60px'
                  }}
                >
                  {month}
                </button>
              );
            })}
          </div>
        </div>
      </OverlayPanel>
    </div>
  );
}
