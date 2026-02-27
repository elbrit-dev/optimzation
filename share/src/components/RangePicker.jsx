'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { OverlayPanel } from 'primereact/overlaypanel';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Divider } from 'primereact/divider';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Helper function to get ISO week number using dayjs
function getISOWeek(date) {
  return dayjs(date).isoWeek();
}

// Helper function to get start of ISO week (Monday) using dayjs - date level only
function getStartOfISOWeek(date) {
  // Use format to ensure date-level only, then parse back
  const d = dayjs(date);
  return dayjs(d.format('YYYY-MM-DD')).startOf('isoWeek').hour(0).minute(0).second(0).millisecond(0).toDate();
}

// Helper function to get end of ISO week (Sunday) using dayjs - date level only
function getEndOfISOWeek(date) {
  const d = dayjs(date);
  return dayjs(d.format('YYYY-MM-DD')).endOf('isoWeek').hour(0).minute(0).second(0).millisecond(0).toDate();
}

// Helper to get all weeks in a month using dayjs - date level only
function getWeeksInMonth(year, month) {
  const weeks = [];
  // Use date strings to avoid timezone issues
  const firstDayStr = dayjs().year(year).month(month).startOf('month').format('YYYY-MM-DD');
  const lastDayStr = dayjs().year(year).month(month).endOf('month').format('YYYY-MM-DD');
  const firstDay = dayjs(firstDayStr).hour(0).minute(0).second(0).millisecond(0).toDate();
  const lastDay = dayjs(lastDayStr).hour(0).minute(0).second(0).millisecond(0).toDate();
  
  let currentDate = dayjs(firstDayStr);
  const startOfFirstWeek = dayjs(getStartOfISOWeek(firstDay));
  
  while ((currentDate.isSame(dayjs(lastDayStr), 'day') || currentDate.isBefore(dayjs(lastDayStr), 'day')) || 
         (startOfFirstWeek.isSame(currentDate, 'day') || startOfFirstWeek.isBefore(currentDate, 'day'))) {
    const weekStart = getStartOfISOWeek(currentDate.toDate());
    const weekEnd = getEndOfISOWeek(currentDate.toDate());
    const weekStartDayjs = dayjs(weekStart);
    const weekEndDayjs = dayjs(weekEnd);
    
    // Check if this week overlaps with the month - compare at date level
    const weekStartStr = weekStartDayjs.format('YYYY-MM-DD');
    const weekEndStr = weekEndDayjs.format('YYYY-MM-DD');
    if ((weekStartStr <= lastDayStr) && (weekEndStr >= firstDayStr)) {
      const weekNum = getISOWeek(weekStart);
      weeks.push({
        weekNum,
        start: weekStart,
        end: weekEnd,
        year: weekStartDayjs.year()
      });
    }
    
    // Move to next week
    currentDate = weekEndDayjs.add(1, 'day');
    
    if (weekEndStr > lastDayStr) break;
  }
  
  return weeks;
}

// Helper to get days in month using dayjs
function getDaysInMonth(year, month) {
  return dayjs().year(year).month(month).daysInMonth();
}

// Helper to get first day of month (0 = Monday, 1 = Tuesday, etc.) using dayjs
function getFirstDayOfMonth(year, month) {
  const date = dayjs().year(year).month(month).date(1);
  const day = date.day(); // dayjs: 0=Sunday, 1=Monday, ..., 6=Saturday
  // Convert to Monday=0, Tuesday=1, ..., Sunday=6
  return day === 0 ? 6 : day - 1;
}

export default function RangePicker({
  value = null,
  onChange,
  placeholder = ['Start month', 'End month'],
  format = 'MM/YY',
  disabled = false,
  className = '',
  style = {},
  mode = 'month' // 'month' | 'week' | 'date' | 'quarter' | 'year'
}) {
  // Use Unix timestamp (Date object) for atomic updates - store first day of the month, date-level only
  const [currentViewDate, setCurrentViewDate] = useState(() => {
    if (value && value[0]) {
      // Parse date at date level only (YYYY-MM-DD), no time components
      const dateStr = dayjs(value[0]).format('YYYY-MM-DD');
      return dayjs(dateStr).startOf('month').hour(0).minute(0).second(0).millisecond(0).toDate();
    }
    const todayStr = dayjs().format('YYYY-MM-DD');
    return dayjs(todayStr).startOf('month').hour(0).minute(0).second(0).millisecond(0).toDate();
  });
  
  // Derived values from the timestamp using dayjs (date-level only, no timezone)
  const currentYear = dayjs(currentViewDate).year();
  const currentMonth = dayjs(currentViewDate).month();
  const [currentDecade, setCurrentDecade] = useState(() => {
    if (value && value[0]) {
      const year = dayjs(value[0]).year();
      return Math.floor(year / 10) * 10;
    }
    return Math.floor(dayjs().year() / 10) * 10;
  });
  const [isOpen, setIsOpen] = useState(false);
  const [startSelection, setStartSelection] = useState(null);
  const [endSelection, setEndSelection] = useState(null);
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'month' | 'year'
  const overlayRef = useRef(null);
  const inputRef = useRef(null);

  // Initialize from value prop based on mode
  useEffect(() => {
    if (value && Array.isArray(value) && value.length === 2) {
      if (value[0] && value[1]) {
        const start = dayjs(value[0]);
        const end = dayjs(value[1]);
        
        if (mode === 'month') {
          setStartSelection({ year: start.year(), month: start.month() });
          setEndSelection({ year: end.year(), month: end.month() });
          const startDateStr = start.format('YYYY-MM-DD');
          setCurrentViewDate(dayjs(startDateStr).startOf('month').hour(0).minute(0).second(0).millisecond(0).toDate());
        } else if (mode === 'week') {
          // Use date-level only parsing
          const startDateStr = start.format('YYYY-MM-DD');
          const endDateStr = end.format('YYYY-MM-DD');
          const startWeek = getStartOfISOWeek(dayjs(startDateStr).toDate());
          const endWeek = getStartOfISOWeek(dayjs(endDateStr).toDate());
          const startWeekDayjs = dayjs(startWeek);
          const endWeekDayjs = dayjs(endWeek);
          setStartSelection({ 
            year: startWeekDayjs.year(), 
            month: startWeekDayjs.month(),
            week: getISOWeek(startWeek),
            date: startWeek
          });
          setEndSelection({ 
            year: endWeekDayjs.year(), 
            month: endWeekDayjs.month(),
            week: getISOWeek(endWeek),
            date: endWeek
          });
          const viewDateStr = startWeekDayjs.format('YYYY-MM-DD');
          setCurrentViewDate(dayjs(viewDateStr).startOf('month').hour(0).minute(0).second(0).millisecond(0).toDate());
        } else if (mode === 'date') {
          setStartSelection({ year: start.year(), month: start.month(), day: start.date() });
          setEndSelection({ year: end.year(), month: end.month(), day: end.date() });
          const startDateStr = start.format('YYYY-MM-DD');
          setCurrentViewDate(dayjs(startDateStr).startOf('month').hour(0).minute(0).second(0).millisecond(0).toDate());
        } else if (mode === 'quarter') {
          const startQuarter = Math.floor(start.month() / 3);
          const endQuarter = Math.floor(end.month() / 3);
          setStartSelection({ year: start.year(), quarter: startQuarter });
          setEndSelection({ year: end.year(), quarter: endQuarter });
          const startDateStr = start.format('YYYY-MM-DD');
          setCurrentViewDate(dayjs(startDateStr).startOf('month').hour(0).minute(0).second(0).millisecond(0).toDate());
        } else if (mode === 'year') {
          setStartSelection({ year: start.year() });
          setEndSelection({ year: end.year() });
          setCurrentDecade(Math.floor(start.year() / 10) * 10);
        }
      }
    } else {
      setStartSelection(null);
      setEndSelection(null);
    }
  }, [value, mode]);

  const formatDisplayValue = () => {
    if (!startSelection) return '';
    
    if (mode === 'month') {
      if (startSelection && endSelection) {
        const startStr = `${MONTHS[startSelection.month]} ${String(startSelection.year).slice(-2)}`;
        const endStr = `${MONTHS[endSelection.month]} ${String(endSelection.year).slice(-2)}`;
        if (startSelection.year === endSelection.year && startSelection.month === endSelection.month) {
          return startStr;
        }
        return `${startStr} - ${endStr}`;
      } else if (startSelection) {
        return `${MONTHS[startSelection.month]} ${String(startSelection.year).slice(-2)} - ${placeholder[1] || 'End month'}`;
      }
    } else if (mode === 'week') {
      if (startSelection && endSelection) {
        // Use the stored date if available, otherwise calculate from week number using dayjs
        let startDate;
        let endDate;
        
        let startDateDayjs;
        let endDateDayjs;
        
        if (startSelection.date) {
          startDateDayjs = dayjs(startSelection.date);
        } else {
          // Calculate week start using dayjs - find the Monday of the ISO week
          const year = startSelection.year;
          const week = startSelection.week;
          const weekDate = dayjs().year(year).isoWeek(week);
          startDateDayjs = weekDate.startOf('isoWeek');
        }
        
        if (endSelection.date) {
          endDateDayjs = dayjs(endSelection.date);
        } else {
          const year = endSelection.year;
          const week = endSelection.week;
          const weekDate = dayjs().year(year).isoWeek(week);
          endDateDayjs = weekDate.startOf('isoWeek');
        }
        
        // Use actual date's year and month for display, not the stored year
        const startStr = `W${startSelection.week} ${MONTHS[startDateDayjs.month()]} ${startDateDayjs.date()}, ${startDateDayjs.year()}`;
        const endStr = `W${endSelection.week} ${MONTHS[endDateDayjs.month()]} ${endDateDayjs.date()}, ${endDateDayjs.year()}`;
        const result = `${startStr} - ${endStr}`;
        return result;
      } else if (startSelection) {
        return `W${startSelection.week} - ${placeholder[1] || 'End week'}`;
      }
    } else if (mode === 'date') {
      if (startSelection && endSelection) {
        const startStr = `${MONTHS[startSelection.month]} ${startSelection.day}, ${startSelection.year}`;
        const endStr = `${MONTHS[endSelection.month]} ${endSelection.day}, ${endSelection.year}`;
        if (startSelection.year === endSelection.year && startSelection.month === endSelection.month && startSelection.day === endSelection.day) {
          return startStr;
        }
        const result = `${startStr} - ${endStr}`;
        return result;
      } else if (startSelection) {
        return `${MONTHS[startSelection.month]} ${startSelection.day}, ${startSelection.year} - ${placeholder[1] || 'End date'}`;
      }
    } else if (mode === 'quarter') {
      if (startSelection && endSelection) {
        const startStr = `Q${startSelection.quarter + 1} ${startSelection.year}`;
        const endStr = `Q${endSelection.quarter + 1} ${endSelection.year}`;
        if (startSelection.year === endSelection.year && startSelection.quarter === endSelection.quarter) {
          return startStr;
        }
        return `${startStr} - ${endStr}`;
      } else if (startSelection) {
        return `Q${startSelection.quarter + 1} ${startSelection.year} - ${placeholder[1] || 'End quarter'}`;
      }
    } else if (mode === 'year') {
      if (startSelection && endSelection) {
        if (startSelection.year === endSelection.year) {
          return String(startSelection.year);
        }
        return `${startSelection.year} - ${endSelection.year}`;
      } else if (startSelection) {
        return `${startSelection.year} - ${placeholder[1] || 'End year'}`;
      }
    }
    
    return '';
  };

  const handleSelection = (selection) => {
    if (disabled) return;

    if (!startSelection || (startSelection && endSelection)) {
      // Start new selection
      setStartSelection(selection);
      setEndSelection(null);
    } else if (startSelection && !endSelection) {
      // Complete the range
      let finalStart = startSelection;
      let finalEnd = selection;

      // Determine if we need to swap based on mode using dayjs
      let shouldSwap = false;
      if (mode === 'month') {
        const startDate = dayjs().year(startSelection.year).month(startSelection.month);
        const endDate = dayjs().year(selection.year).month(selection.month);
        shouldSwap = endDate.isBefore(startDate);
      } else if (mode === 'week') {
        let startDate, endDate;
        if (startSelection.date) {
          startDate = dayjs(startSelection.date);
        } else {
          const weekDate = dayjs().year(startSelection.year).isoWeek(startSelection.week);
          startDate = weekDate.startOf('isoWeek');
        }
        if (selection.date) {
          endDate = dayjs(selection.date);
        } else {
          const weekDate = dayjs().year(selection.year).isoWeek(selection.week);
          endDate = weekDate.startOf('isoWeek');
        }
        shouldSwap = endDate.isBefore(startDate);
      } else if (mode === 'date') {
        const startDate = dayjs().year(startSelection.year).month(startSelection.month).date(startSelection.day);
        const endDate = dayjs().year(selection.year).month(selection.month).date(selection.day);
        shouldSwap = endDate.isBefore(startDate);
      } else if (mode === 'quarter') {
        const startDate = dayjs().year(startSelection.year).month(startSelection.quarter * 3);
        const endDate = dayjs().year(selection.year).month(selection.quarter * 3);
        shouldSwap = endDate.isBefore(startDate);
      } else if (mode === 'year') {
        shouldSwap = selection.year < startSelection.year;
      }

      if (shouldSwap) {
        finalEnd = startSelection;
        finalStart = selection;
      }

      setStartSelection(finalStart);
      setEndSelection(finalEnd);

      // Convert to date range and call onChange - use native Date constructor for local timezone dates
      let startDate, endDate;
      
      if (mode === 'month') {
        // Use native Date constructor (year, month, day) - creates dates in local timezone
        startDate = new Date(finalStart.year, finalStart.month, 1);
        const lastDay = dayjs().year(finalEnd.year).month(finalEnd.month).daysInMonth();
        endDate = new Date(finalEnd.year, finalEnd.month, lastDay);
      } else if (mode === 'week') {
        // Use stored date if available, otherwise calculate using dayjs - date level only
        let startWeekDate;
        let endWeekDate;
        
        if (finalStart.date) {
          const dateStr = dayjs(finalStart.date).format('YYYY-MM-DD');
          startWeekDate = dayjs(dateStr);
        } else {
          const weekDate = dayjs().year(finalStart.year).isoWeek(finalStart.week);
          startWeekDate = weekDate.startOf('isoWeek');
        }
        
        if (finalEnd.date) {
          const dateStr = dayjs(finalEnd.date).format('YYYY-MM-DD');
          endWeekDate = dayjs(dateStr);
        } else {
          const weekDate = dayjs().year(finalEnd.year).isoWeek(finalEnd.week);
          endWeekDate = weekDate.startOf('isoWeek');
        }
        
        // Create dates using native constructor from date strings to preserve local timezone
        const startStr = startWeekDate.format('YYYY-MM-DD');
        const endStr = endWeekDate.endOf('isoWeek').format('YYYY-MM-DD');
        const [startY, startM, startD] = startStr.split('-').map(Number);
        const [endY, endM, endD] = endStr.split('-').map(Number);
        startDate = new Date(startY, startM - 1, startD);
        endDate = new Date(endY, endM - 1, endD);
      } else if (mode === 'date') {
        // Use native Date constructor - creates dates in local timezone
        startDate = new Date(finalStart.year, finalStart.month, finalStart.day);
        endDate = new Date(finalEnd.year, finalEnd.month, finalEnd.day);
      } else if (mode === 'quarter') {
        const startMonth = finalStart.quarter * 3;
        const endMonth = finalEnd.quarter * 3 + 2;
        const lastDay = dayjs().year(finalEnd.year).month(endMonth).daysInMonth();
        startDate = new Date(finalStart.year, startMonth, 1);
        endDate = new Date(finalEnd.year, endMonth, lastDay);
      } else if (mode === 'year') {
        startDate = new Date(finalStart.year, 0, 1);
        endDate = new Date(finalEnd.year, 11, 31);
      }

      if (onChange) {
        onChange([startDate, endDate]);
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
      setViewMode('calendar');
    } else {
      overlayRef.current?.show(e, inputRef.current);
      setIsOpen(true);
      setViewMode('calendar');
    }
  };

  const navigateYear = (direction) => {
    setCurrentViewDate(prev => {
      const prevDateStr = dayjs(prev).format('YYYY-MM-DD');
      return dayjs(prevDateStr).add(direction, 'year').startOf('month').hour(0).minute(0).second(0).millisecond(0).toDate();
    });
    if (viewMode === 'year') {
      setViewMode('calendar');
    }
  };

  const navigateMonth = (direction) => {
    // Use dayjs to add/subtract months atomically - date level only, no timezone
    setCurrentViewDate(prev => {
      const prevDateStr = dayjs(prev).format('YYYY-MM-DD');
      const newDate = dayjs(prevDateStr).add(direction, 'month').startOf('month').hour(0).minute(0).second(0).millisecond(0).toDate();
      return newDate;
    });
  };

  const navigateDecade = (direction) => {
    setCurrentDecade(prev => prev + (direction * 10));
  };

  // Render inline month picker
  const renderInlineMonthPicker = () => {
    const handleMonthClick = (monthIndex) => {
      setCurrentViewDate(prev => {
        const prevDateStr = dayjs(prev).format('YYYY-MM-DD');
        return dayjs(prevDateStr).month(monthIndex).startOf('month').hour(0).minute(0).second(0).millisecond(0).toDate();
      });
      setViewMode('calendar');
    };

    return (
      <>
        <div className="flex items-center gap-2 mb-3">
          <Button
            icon="pi pi-arrow-left"
            className="p-button-text p-button-sm"
            onClick={() => setViewMode('calendar')}
            aria-label="Back to calendar"
          />
          <span className="text-base font-semibold text-gray-700">Select Month</span>
        </div>
        <Divider />
        <div className="grid grid-cols-3 gap-2 mt-2">
          {MONTHS.map((month, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleMonthClick(index)}
              disabled={disabled}
              className={`
                px-3 py-2 text-sm font-medium rounded-md transition-all min-h-[44px]
                ${currentMonth === index
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              style={{ minWidth: '60px' }}
            >
              {month}
            </button>
          ))}
        </div>
      </>
    );
  };

  // Render inline year picker
  const renderInlineYearPicker = () => {
    const currentDecadeStart = Math.floor(currentYear / 10) * 10;
    const currentDecadeEnd = currentDecadeStart + 11; // Show 12 years (0-11) in 3x4 grid
    
    // Generate years for the current decade (12 years in 3x4 grid)
    const yearPickerYears = [];
    for (let i = currentDecadeStart; i <= currentDecadeEnd; i++) {
      yearPickerYears.push(i);
    }

    const handleYearClick = (year) => {
      setCurrentViewDate(prev => {
        const prevDateStr = dayjs(prev).format('YYYY-MM-DD');
        return dayjs(prevDateStr).year(year).startOf('month').hour(0).minute(0).second(0).millisecond(0).toDate();
      });
      setViewMode('calendar');
    };

    const handleDecadeNavigation = (direction) => {
      const newDecadeStart = currentDecadeStart + (direction * 12);
      setCurrentViewDate(prev => {
        const prevDateStr = dayjs(prev).format('YYYY-MM-DD');
        return dayjs(prevDateStr).year(newDecadeStart).startOf('month').hour(0).minute(0).second(0).millisecond(0).toDate();
      });
    };

    return (
      <>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button
              icon="pi pi-arrow-left"
              className="p-button-text p-button-sm"
              onClick={() => setViewMode('calendar')}
              aria-label="Back to calendar"
            />
            <span className="text-base font-semibold text-gray-700">Select Year</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              icon="pi pi-chevron-left"
              className="p-button-text p-button-sm"
              onClick={() => handleDecadeNavigation(-1)}
              aria-label="Previous decade"
            />
            <span className="text-xs text-gray-500 px-2">
              {currentDecadeStart} - {currentDecadeEnd}
            </span>
            <Button
              icon="pi pi-chevron-right"
              className="p-button-text p-button-sm"
              onClick={() => handleDecadeNavigation(1)}
              aria-label="Next decade"
            />
          </div>
        </div>
        <Divider />
        <div className="grid grid-cols-3 gap-2 mt-2">
          {yearPickerYears.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => handleYearClick(year)}
              disabled={disabled}
              className={`
                px-4 py-3 text-sm font-medium rounded-md transition-all min-h-[44px]
                ${currentYear === year
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {year}
            </button>
          ))}
        </div>
      </>
    );
  };

  // Render month mode
  const renderMonthMode = () => {
    const isMonthInRange = (monthIndex) => {
      if (!startSelection) return false;
      const monthDate = dayjs().year(currentYear).month(monthIndex);
      const startDate = dayjs().year(startSelection.year).month(startSelection.month);
      if (endSelection) {
        const endDate = dayjs().year(endSelection.year).month(endSelection.month);
        return (monthDate.isSame(startDate) || monthDate.isAfter(startDate)) && 
               (monthDate.isSame(endDate) || monthDate.isBefore(endDate));
      }
      return false;
    };

    const isMonthSelected = (monthIndex) => {
      if (startSelection && startSelection.year === currentYear && startSelection.month === monthIndex) {
        return true;
      }
      if (endSelection && endSelection.year === currentYear && endSelection.month === monthIndex) {
        return true;
      }
      return false;
    };

    const handleYearButtonClick = (e) => {
      e.stopPropagation();
      setViewMode(viewMode === 'year' ? 'calendar' : 'year');
    };

    return (
      <>
        <div className="flex items-center justify-between mb-2">
          <Button
            icon="pi pi-chevron-left"
            className="p-button-text p-button-sm"
            onClick={() => navigateYear(-1)}
            aria-label="Previous year"
          />
          <button
            onClick={handleYearButtonClick}
            className={`text-base font-semibold text-gray-700 min-w-[80px] text-center px-2 py-1 hover:bg-gray-100 rounded min-h-[44px] transition-colors ${
              viewMode === 'year' 
                ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                : ''
            }`}
          >
            {currentYear}
          </button>
          <Button
            icon="pi pi-chevron-right"
            className="p-button-text p-button-sm"
            onClick={() => navigateYear(1)}
            aria-label="Next year"
          />
        </div>
        <Divider />
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
          {MONTHS.map((month, index) => {
            const inRange = isMonthInRange(index);
            const isSelected = isMonthSelected(index);
            const isStart = startSelection && startSelection.year === currentYear && startSelection.month === index;
            const isEnd = endSelection && endSelection.year === currentYear && endSelection.month === index;
            const isInMiddle = inRange && !isStart && !isEnd;

            return (
              <button
                key={index}
                type="button"
                onClick={() => handleSelection({ year: currentYear, month: index })}
                disabled={disabled}
                className={`
                  px-3 py-2 text-sm font-medium rounded-md transition-all min-h-[44px]
                  ${isSelected
                    ? 'bg-blue-600 text-white font-semibold'
                    : inRange
                      ? isInMiddle
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-blue-100 text-blue-700'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }
                  ${isStart && endSelection ? 'rounded-l-md' : ''}
                  ${isEnd && startSelection ? 'rounded-r-md' : ''}
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
                style={{ minWidth: '60px' }}
              >
                {month}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  // Render week mode
  const renderWeekMode = () => {
    const weeks = getWeeksInMonth(currentYear, currentMonth);
    
    const isWeekInRange = (week) => {
      if (!startSelection) return false;
      if (endSelection) {
        let startWeekDate, endWeekDate;
        if (startSelection.date) {
          startWeekDate = dayjs(startSelection.date);
        } else {
          const weekDate = dayjs().year(startSelection.year).isoWeek(startSelection.week);
          startWeekDate = weekDate.startOf('isoWeek');
        }
        if (endSelection.date) {
          endWeekDate = dayjs(endSelection.date);
        } else {
          const weekDate = dayjs().year(endSelection.year).isoWeek(endSelection.week);
          endWeekDate = weekDate.startOf('isoWeek');
        }
        const weekStart = dayjs(week.start);
        return (weekStart.isSame(startWeekDate) || weekStart.isAfter(startWeekDate)) && 
               (weekStart.isSame(endWeekDate) || weekStart.isBefore(endWeekDate));
      }
      return false;
    };

    const isWeekSelected = (week) => {
      if (startSelection && startSelection.week === week.weekNum && startSelection.year === week.year) {
        return true;
      }
      if (endSelection && endSelection.week === week.weekNum && endSelection.year === week.year) {
        return true;
      }
      return false;
    };

    // Get calendar days for the month
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    const days = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    const handleMonthButtonClick = (e) => {
      e.stopPropagation();
      setViewMode(viewMode === 'month' ? 'calendar' : 'month');
    };

    const handleYearButtonClick = (e) => {
      e.stopPropagation();
      setViewMode(viewMode === 'year' ? 'calendar' : 'year');
    };

    return (
      <>
        <div className="flex items-center justify-between mb-2">
          <Button
            icon="pi pi-chevron-left"
            className="p-button-text p-button-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigateMonth(-1);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            aria-label="Previous month"
          />
          <div className="flex items-center gap-2 relative">
            <button
              onClick={handleMonthButtonClick}
              className={`text-base font-semibold px-2 py-1 hover:bg-gray-100 rounded min-h-[44px] transition-colors ${
                viewMode === 'month' 
                  ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                  : 'text-gray-700'
              }`}
            >
              {MONTHS_FULL[currentMonth]}
            </button>
            <button
              onClick={handleYearButtonClick}
              className={`text-base font-semibold px-2 py-1 hover:bg-gray-100 rounded min-h-[44px] transition-colors ${
                viewMode === 'year' 
                  ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                  : 'text-gray-700'
              }`}
            >
              {currentYear}
            </button>
          </div>
          <Button
            icon="pi pi-chevron-right"
            className="p-button-text p-button-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigateMonth(1);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            aria-label="Next month"
          />
        </div>
        <Divider />
        <div className="mt-2">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS_OF_WEEK.map(day => (
              <div key={day} className="text-xs font-medium text-gray-600 text-center py-1">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} className="h-8" />;
              }
              const date = dayjs().year(currentYear).month(currentMonth).date(day).toDate();
              const weekStart = getStartOfISOWeek(date);
              const weekEnd = getEndOfISOWeek(date);
              const weekNum = getISOWeek(weekStart);
              const weekStartDayjs = dayjs(weekStart);
              const week = weeks.find(w => w.weekNum === weekNum && w.year === weekStartDayjs.year());
              
              if (!week) return <div key={day} className="h-8" />;
              
              const inRange = isWeekInRange(week);
              const isSelected = isWeekSelected(week);
              const isStart = startSelection && startSelection.week === week.weekNum && startSelection.year === week.year;
              const isEnd = endSelection && endSelection.week === week.weekNum && endSelection.year === week.year;
              const isInMiddle = inRange && !isStart && !isEnd;
              const isToday = dayjs(date).isSame(dayjs(), 'day');

              return (
                <div
                  key={day}
                  className={`
                    h-8 flex items-center justify-center text-sm rounded
                    ${isSelected
                      ? 'bg-blue-600 text-white font-semibold'
                      : inRange
                        ? isInMiddle
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }
                    ${isToday && !isSelected ? 'border border-blue-400' : ''}
                    cursor-pointer
                  `}
                  onClick={() => {
                    handleSelection({
                      year: week.year,
                      month: dayjs(week.start).month(),
                      week: week.weekNum,
                      date: week.start
                    });
                  }}
                  title={`Week ${week.weekNum}: ${week.start.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`}
                >
                  {day}
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Click on any day to select its week
          </div>
        </div>
      </>
    );
  };

  // Render date mode
  const renderDateMode = () => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    const days = [];
    
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    const isDateInRange = (day) => {
      if (!startSelection || !day) return false;
      if (endSelection) {
        // Use dayjs for timezone-independent date comparison
        const startDate = dayjs().year(startSelection.year).month(startSelection.month).date(startSelection.day);
        const endDate = dayjs().year(endSelection.year).month(endSelection.month).date(endSelection.day);
        const currentDate = dayjs().year(currentYear).month(currentMonth).date(day);
        return (currentDate.isSame(startDate) || currentDate.isAfter(startDate)) && 
               (currentDate.isSame(endDate) || currentDate.isBefore(endDate));
      }
      return false;
    };

    const isDateSelected = (day) => {
      if (!day) return false;
      if (startSelection && startSelection.year === currentYear && startSelection.month === currentMonth && startSelection.day === day) {
        return true;
      }
      if (endSelection && endSelection.year === currentYear && endSelection.month === currentMonth && endSelection.day === day) {
        return true;
      }
      return false;
    };

    const handleMonthButtonClick = (e) => {
      e.stopPropagation();
      setViewMode(viewMode === 'month' ? 'calendar' : 'month');
    };

    const handleYearButtonClick = (e) => {
      e.stopPropagation();
      setViewMode(viewMode === 'year' ? 'calendar' : 'year');
    };

    return (
      <>
        <div className="flex items-center justify-between mb-2">
          <Button
            icon="pi pi-chevron-left"
            className="p-button-text p-button-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigateMonth(-1);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            aria-label="Previous month"
          />
          <div className="flex items-center gap-2 relative">
            <button
              onClick={handleMonthButtonClick}
              className={`text-base font-semibold px-2 py-1 hover:bg-gray-100 rounded min-h-[44px] transition-colors ${
                viewMode === 'month' 
                  ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                  : 'text-gray-700'
              }`}
            >
              {MONTHS_FULL[currentMonth]}
            </button>
            <button
              onClick={handleYearButtonClick}
              className={`text-base font-semibold px-2 py-1 hover:bg-gray-100 rounded min-h-[44px] transition-colors ${
                viewMode === 'year' 
                  ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                  : 'text-gray-700'
              }`}
            >
              {currentYear}
            </button>
          </div>
          <Button
            icon="pi pi-chevron-right"
            className="p-button-text p-button-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigateMonth(1);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            aria-label="Next month"
          />
        </div>
        <Divider />
        <div className="mt-2">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS_OF_WEEK.map(day => (
              <div key={day} className="text-xs font-medium text-gray-600 text-center py-1">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} className="h-10" />;
              }
              
              const inRange = isDateInRange(day);
              const isSelected = isDateSelected(day);
              const isStart = startSelection && startSelection.year === currentYear && startSelection.month === currentMonth && startSelection.day === day;
              const isEnd = endSelection && endSelection.year === currentYear && endSelection.month === currentMonth && endSelection.day === day;
              const isInMiddle = inRange && !isStart && !isEnd;
              const date = dayjs().year(currentYear).month(currentMonth).date(day).toDate();
              const isToday = dayjs(date).isSame(dayjs(), 'day');

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelection({ year: currentYear, month: currentMonth, day })}
                  disabled={disabled}
                  className={`
                    h-10 flex items-center justify-center text-sm rounded transition-all min-h-[44px]
                    ${isSelected
                      ? 'bg-blue-600 text-white font-semibold'
                      : inRange
                        ? isInMiddle
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-blue-100 text-blue-700'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }
                    ${isToday && !isSelected ? 'border-2 border-blue-400' : ''}
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  // Render quarter mode
  const renderQuarterMode = () => {
    const quarters = [
      { label: 'Q1', months: 'Jan-Mar', quarter: 0 },
      { label: 'Q2', months: 'Apr-Jun', quarter: 1 },
      { label: 'Q3', months: 'Jul-Sep', quarter: 2 },
      { label: 'Q4', months: 'Oct-Dec', quarter: 3 }
    ];

    const isQuarterInRange = (quarter) => {
      if (!startSelection) return false;
      if (endSelection) {
        const startDate = dayjs().year(startSelection.year).month(startSelection.quarter * 3);
        const endDate = dayjs().year(endSelection.year).month(endSelection.quarter * 3);
        const currentDate = dayjs().year(currentYear).month(quarter * 3);
        return (currentDate.isSame(startDate) || currentDate.isAfter(startDate)) && 
               (currentDate.isSame(endDate) || currentDate.isBefore(endDate));
      }
      return false;
    };

    const isQuarterSelected = (quarter) => {
      if (startSelection && startSelection.year === currentYear && startSelection.quarter === quarter) {
        return true;
      }
      if (endSelection && endSelection.year === currentYear && endSelection.quarter === quarter) {
        return true;
      }
      return false;
    };

    const handleYearButtonClick = (e) => {
      e.stopPropagation();
      setViewMode(viewMode === 'year' ? 'calendar' : 'year');
    };

    return (
      <>
        <div className="flex items-center justify-between mb-2">
          <Button
            icon="pi pi-chevron-left"
            className="p-button-text p-button-sm"
            onClick={() => navigateYear(-1)}
            aria-label="Previous year"
          />
          <button
            onClick={handleYearButtonClick}
            className={`text-base font-semibold text-gray-700 min-w-[80px] text-center px-2 py-1 hover:bg-gray-100 rounded min-h-[44px] transition-colors ${
              viewMode === 'year' 
                ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                : ''
            }`}
          >
            {currentYear}
          </button>
          <Button
            icon="pi pi-chevron-right"
            className="p-button-text p-button-sm"
            onClick={() => navigateYear(1)}
            aria-label="Next year"
          />
        </div>
        <Divider />
        <div className="grid grid-cols-2 gap-3 mt-2">
          {quarters.map((q) => {
            const inRange = isQuarterInRange(q.quarter);
            const isSelected = isQuarterSelected(q.quarter);
            const isStart = startSelection && startSelection.year === currentYear && startSelection.quarter === q.quarter;
            const isEnd = endSelection && endSelection.year === currentYear && endSelection.quarter === q.quarter;
            const isInMiddle = inRange && !isStart && !isEnd;

            return (
              <button
                key={q.quarter}
                type="button"
                onClick={() => handleSelection({ year: currentYear, quarter: q.quarter })}
                disabled={disabled}
                className={`
                  px-4 py-6 text-sm font-medium rounded-md transition-all min-h-[80px]
                  ${isSelected
                    ? 'bg-blue-600 text-white font-semibold'
                    : inRange
                      ? isInMiddle
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-blue-100 text-blue-700'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="font-bold text-lg">{q.label}</div>
                <div className="text-xs mt-1">{q.months}</div>
              </button>
            );
          })}
        </div>
      </>
    );
  };

  // Render year mode
  const renderYearMode = () => {
    const years = [];
    for (let i = 0; i < 12; i++) {
      years.push(currentDecade + i);
    }

    const isYearInRange = (year) => {
      if (!startSelection) return false;
      if (endSelection) {
        return year >= startSelection.year && year <= endSelection.year;
      }
      return false;
    };

    const isYearSelected = (year) => {
      if (startSelection && startSelection.year === year) {
        return true;
      }
      if (endSelection && endSelection.year === year) {
        return true;
      }
      return false;
    };

    return (
      <>
        <div className="flex items-center justify-between mb-2">
          <Button
            icon="pi pi-chevron-left"
            className="p-button-text p-button-sm"
            onClick={() => navigateDecade(-1)}
            aria-label="Previous decade"
          />
          <span className="text-base font-semibold text-gray-700 min-w-[120px] text-center">
            {currentDecade} - {currentDecade + 11}
          </span>
          <Button
            icon="pi pi-chevron-right"
            className="p-button-text p-button-sm"
            onClick={() => navigateDecade(1)}
            aria-label="Next decade"
          />
        </div>
        <Divider />
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
          {years.map((year) => {
            const inRange = isYearInRange(year);
            const isSelected = isYearSelected(year);
            const isStart = startSelection && startSelection.year === year;
            const isEnd = endSelection && endSelection.year === year;
            const isInMiddle = inRange && !isStart && !isEnd;

            return (
              <button
                key={year}
                type="button"
                onClick={() => handleSelection({ year })}
                disabled={disabled}
                className={`
                  px-4 py-3 text-sm font-medium rounded-md transition-all min-h-[44px]
                  ${isSelected
                    ? 'bg-blue-600 text-white font-semibold'
                    : inRange
                      ? isInMiddle
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-blue-100 text-blue-700'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }
                  ${isStart && endSelection ? 'rounded-l-md' : ''}
                  ${isEnd && startSelection ? 'rounded-r-md' : ''}
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {year}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  const displayValue = formatDisplayValue();
  
  const defaultPlaceholder = mode === 'month' ? 'Select month range' :
                            mode === 'week' ? 'Select week range' :
                            mode === 'date' ? 'Select date range' :
                            mode === 'quarter' ? 'Select quarter range' :
                            'Select year range';

  return (
    <div className={`month-range-picker ${className}`} style={style}>
      <div className="relative">
        <InputText
          ref={inputRef}
          value={displayValue}
          placeholder={placeholder[0] && placeholder[1] ? `${placeholder[0]} - ${placeholder[1]}` : placeholder[0] || defaultPlaceholder}
          readOnly
          disabled={disabled}
          onClick={handleToggle}
          className="w-full cursor-pointer"
          style={{
            fontSize: '0.875rem',
            height: '2rem',
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
        onHide={() => {
          setIsOpen(false);
          setViewMode('calendar');
        }}
      >
        <div className="month-range-picker-content" style={{ minWidth: '280px', maxWidth: '400px' }}>
          {viewMode === 'month' && renderInlineMonthPicker()}
          {viewMode === 'year' && renderInlineYearPicker()}
          {viewMode === 'calendar' && (
            <>
              {mode === 'month' && renderMonthMode()}
              {mode === 'week' && renderWeekMode()}
              {mode === 'date' && renderDateMode()}
              {mode === 'quarter' && renderQuarterMode()}
              {mode === 'year' && renderYearMode()}
            </>
          )}
        </div>
      </OverlayPanel>
    </div>
  );
}
