'use client';

import { useState, useRef, useEffect } from 'react';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

// Extend dayjs with the required plugins
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export default function CustomMonthRangePanel({
  value = null,
  onChange,
  onClose
}) {
  const [currentYear, setCurrentYear] = useState(() => {
    if (value && value[0]) {
      return dayjs(value[0]).year();
    }
    return dayjs().year();
  });
  const [startMonth, setStartMonth] = useState(null);
  const [endMonth, setEndMonth] = useState(null);

  // Initialize from value prop
  useEffect(() => {
    if (value && Array.isArray(value) && value.length === 2) {
      if (value[0]) {
        const start = dayjs(value[0]);
        setStartMonth(start);
        setCurrentYear(start.year());
      }
      if (value[1]) {
        const end = dayjs(value[1]);
        setEndMonth(end);
      }
    } else {
      setStartMonth(null);
      setEndMonth(null);
    }
  }, [value]);

  const handleMonthClick = (monthIndex) => {
    const clickedMonth = dayjs().year(currentYear).month(monthIndex).startOf('month');

    if (!startMonth || (startMonth && endMonth)) {
      // Start new selection
      setStartMonth(clickedMonth);
      setEndMonth(null);
    } else if (startMonth && !endMonth) {
      // Complete the range and auto-apply
      let finalStart = startMonth;
      let finalEnd = clickedMonth;
      
      if (clickedMonth.isBefore(startMonth, 'month')) {
        // If end is before start, swap them
        finalEnd = startMonth;
        finalStart = clickedMonth;
      }
      
      setStartMonth(finalStart);
      setEndMonth(finalEnd);
      
      // Auto-apply when end is selected
      const start = finalStart.toDate();
      const end = finalEnd.endOf('month').toDate();
      
      if (onChange) {
        onChange([start, end]);
      }
      
      // Close the panel after applying
      if (onClose) {
        onClose();
      }
    }
  };

  const isMonthInRange = (monthIndex) => {
    if (!startMonth || !endMonth) return false;
    
    const monthDate = dayjs().year(currentYear).month(monthIndex).startOf('month');
    return monthDate.isSameOrAfter(startMonth, 'month') && monthDate.isSameOrBefore(endMonth, 'month');
  };

  const isMonthStart = (monthIndex) => {
    if (!startMonth) return false;
    return startMonth.year() === currentYear && startMonth.month() === monthIndex;
  };

  const isMonthEnd = (monthIndex) => {
    if (!endMonth) return false;
    return endMonth.year() === currentYear && endMonth.month() === monthIndex;
  };

  const isMonthSelected = (monthIndex) => {
    return isMonthStart(monthIndex) || isMonthEnd(monthIndex);
  };

  const navigateYear = (direction) => {
    setCurrentYear(prev => prev + direction);
  };

  return (
    <div className="month-range-picker-content p-4">
      {/* Year Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigateYear(-1)}
          className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="Previous year"
        >
          <i className="pi pi-chevron-left text-gray-600"></i>
        </button>
        <span className="text-base font-semibold text-gray-700 min-w-[80px] text-center">
          {currentYear}
        </span>
        <button
          type="button"
          onClick={() => navigateYear(1)}
          className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="Next year"
        >
          <i className="pi pi-chevron-right text-gray-600"></i>
        </button>
      </div>

      {/* Month Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {MONTHS.map((month, index) => {
          const inRange = isMonthInRange(index);
          const isSelected = isMonthSelected(index);
          const isStart = isMonthStart(index);
          const isEnd = isMonthEnd(index);
          const isInMiddle = inRange && !isStart && !isEnd;

          return (
            <button
              key={index}
              type="button"
              onClick={() => handleMonthClick(index)}
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
                cursor-pointer
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
  );
}
