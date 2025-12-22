'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import {
  isNil,
  isNumber,
  isFinite as _isFinite,
  isEmpty,
  keys,
  uniq,
  flatMap,
  startCase,
  take,
  sumBy,
  orderBy,
  filter,
  get,
  clamp,
  debounce,
  every,
  toLower,
  includes,
  isBoolean,
  isString,
  isDate,
  head,
  tail,
  toNumber,
  isNaN as _isNaN,
  trim,
  compact,
  some,
  isArray,
} from 'lodash';

// Date format patterns for detection
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,                          // ISO: 2024-01-15
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,         // ISO with time: 2024-01-15T10:30:00
  /^\d{4}\/\d{2}\/\d{2}$/,                        // 2024/01/15
  /^\d{1,2}\/\d{1,2}\/\d{4}$/,                    // US: 01/15/2024 or 1/15/2024
  /^\d{1,2}-\d{1,2}-\d{4}$/,                      // 01-15-2024
  /^\d{1,2}\.\d{1,2}\.\d{4}$/,                    // EU: 15.01.2024
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}$/i, // Jan 15, 2024
  /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i,   // 15 Jan 2024
];

/**
 * Check if a value looks like a date
 */
function isDateLike(value) {
  if (isNil(value)) return false;
  if (value === 0 || value === '0' || value === '') return false;
  if (isDate(value)) return true;
  if (isNumber(value)) {
    const minTimestamp = 315532800000; // 1980-01-01
    const maxTimestamp = 4102444800000; // 2100-01-01
    if (value >= minTimestamp && value <= maxTimestamp) {
      const date = new Date(value);
      return !isNaN(date.getTime());
    }
    return false;
  }
  if (isString(value)) {
    const trimmed = trim(value);
    if (trimmed === '') return false;
    if (/^-?\d+$/.test(trimmed)) return false;
    if (DATE_PATTERNS.some(pattern => pattern.test(trimmed))) {
      const parsed = new Date(trimmed);
      return !isNaN(parsed.getTime());
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return !/^-?\d+\.?\d*$/.test(trimmed);
    }
  }
  return false;
}

/**
 * Parse a value to a Date object
 */
function parseToDate(value) {
  if (isNil(value)) return null;
  if (value === '' || value === 0 || value === '0') return null;
  if (isDate(value)) return value;
  if (isNumber(value)) {
    if (value <= 0) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  if (isString(value)) {
    const trimmed = trim(value);
    if (trimmed === '') return null;
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Format a date for display
 */
function formatDateValue(value) {
  if (isNil(value) || value === '' || value === 0 || value === '0') return '';
  const date = parseToDate(value);
  if (!date) return String(value ?? '');
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Parse numeric filter expression
 */
function parseNumericFilter(filterValue) {
  if (isNil(filterValue) || filterValue === '') return null;

  const str = trim(String(filterValue));
  const numPattern = '([+-]?\\s*\\d+\\.?\\d*)';

  const parseNum = (numStr) => {
    const cleaned = numStr.replace(/\s+/g, '');
    return toNumber(cleaned);
  };

  const rangeRegex = new RegExp(`^${numPattern}\\s*<>\\s*${numPattern}$`);
  const rangeMatch = str.match(rangeRegex);
  if (rangeMatch) {
    const min = parseNum(rangeMatch[1]);
    const max = parseNum(rangeMatch[2]);
    if (!_isNaN(min) && !_isNaN(max)) {
      return { type: 'range', min: Math.min(min, max), max: Math.max(min, max) };
    }
  }

  const lteRegex = new RegExp(`^<=\\s*${numPattern}$`);
  const lteMatch = str.match(lteRegex);
  if (lteMatch) {
    const num = parseNum(lteMatch[1]);
    if (!_isNaN(num)) return { type: 'lte', value: num };
  }

  const gteRegex = new RegExp(`^>=\\s*${numPattern}$`);
  const gteMatch = str.match(gteRegex);
  if (gteMatch) {
    const num = parseNum(gteMatch[1]);
    if (!_isNaN(num)) return { type: 'gte', value: num };
  }

  const ltRegex = new RegExp(`^<\\s*${numPattern}$`);
  const ltMatch = str.match(ltRegex);
  if (ltMatch) {
    const num = parseNum(ltMatch[1]);
    if (!_isNaN(num)) return { type: 'lt', value: num };
  }

  const gtRegex = new RegExp(`^>\\s*${numPattern}$`);
  const gtMatch = str.match(gtRegex);
  if (gtMatch) {
    const num = parseNum(gtMatch[1]);
    if (!_isNaN(num)) return { type: 'gt', value: num };
  }

  const eqRegex = new RegExp(`^=\\s*${numPattern}$`);
  const eqMatch = str.match(eqRegex);
  if (eqMatch) {
    const num = parseNum(eqMatch[1]);
    if (!_isNaN(num)) return { type: 'eq', value: num };
  }

  const plainNumRegex = new RegExp(`^${numPattern}$`);
  const plainMatch = str.match(plainNumRegex);
  if (plainMatch) {
    const num = parseNum(plainMatch[1]);
    if (!_isNaN(num)) {
      return { type: 'contains', value: str.replace(/\s+/g, '') };
    }
  }

  return { type: 'text', value: str };
}

/**
 * Apply numeric filter to a cell value
 */
function applyNumericFilter(cellValue, parsedFilter) {
  if (!parsedFilter) return true;

  const numCell = isNumber(cellValue) ? cellValue : toNumber(cellValue);

  switch (parsedFilter.type) {
    case 'lt':
      return !_isNaN(numCell) && numCell < parsedFilter.value;
    case 'gt':
      return !_isNaN(numCell) && numCell > parsedFilter.value;
    case 'lte':
      return !_isNaN(numCell) && numCell <= parsedFilter.value;
    case 'gte':
      return !_isNaN(numCell) && numCell >= parsedFilter.value;
    case 'eq':
      return !_isNaN(numCell) && numCell === parsedFilter.value;
    case 'range':
      return !_isNaN(numCell) && numCell >= parsedFilter.min && numCell <= parsedFilter.max;
    case 'contains':
      return includes(String(cellValue ?? ''), parsedFilter.value);
    case 'text':
    default:
      return includes(toLower(String(cellValue ?? '')), toLower(parsedFilter.value));
  }
}

/**
 * Apply date range filter to a cell value
 */
function applyDateFilter(cellValue, dateRange) {
  if (!dateRange || (!dateRange[0] && !dateRange[1])) return true;

  const cellDate = parseToDate(cellValue);
  if (!cellDate) return false;

  const [startDate, endDate] = dateRange;
  const cellTime = cellDate.getTime();

  if (startDate && endDate) {
    const startTime = new Date(startDate).setHours(0, 0, 0, 0);
    const endTime = new Date(endDate).setHours(23, 59, 59, 999);
    return cellTime >= startTime && cellTime <= endTime;
  } else if (startDate) {
    const startTime = new Date(startDate).setHours(0, 0, 0, 0);
    return cellTime >= startTime;
  } else if (endDate) {
    const endTime = new Date(endDate).setHours(23, 59, 59, 999);
    return cellTime <= endTime;
  }

  return true;
}

const CustomTriStateCheckbox = React.memo(({ value, onChange }) => {
  const handleClick = React.useCallback(() => {
    if (value === null) {
      onChange(true);
    } else if (value === true) {
      onChange(false);
    } else {
      onChange(null);
    }
  }, [value, onChange]);

  return (
    <div
      onClick={handleClick}
      className="w-5 h-5 border-2 rounded cursor-pointer flex items-center justify-center transition-colors"
      style={{
        borderColor: value === null ? '#9ca3af' : value ? '#22c55e' : '#ef4444',
        backgroundColor: value === null ? 'transparent' : value ? '#22c55e' : '#ef4444',
      }}
      title={value === null ? 'All' : value ? 'Yes only' : 'No only'}
    >
      {value === true && (
        <i className="pi pi-check text-white text-xs" />
      )}
      {value === false && (
        <i className="pi pi-times text-white text-xs" />
      )}
      {value === null && (
        <i className="pi pi-minus text-gray-400 text-xs" />
      )}
    </div>
  );
});
CustomTriStateCheckbox.displayName = 'CustomTriStateCheckbox';

const MultiselectFilter = React.memo(({ value, options, onChange, placeholder = "Select...", fieldName }) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const [dropdownPosition, setDropdownPosition] = React.useState(null);
  const containerRef = React.useRef(null);
  const buttonRef = React.useRef(null);
  const dropdownRef = React.useRef(null);
  const selectedValues = value || [];
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const calculatePosition = React.useCallback(() => {
    if (!buttonRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 250; // Approximate dropdown height
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    const openAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    return {
      top: openAbove ? buttonRect.top - dropdownHeight - 4 : buttonRect.bottom + 4,
      left: buttonRect.left,
      openAbove
    };
  }, []);

  const handleToggle = React.useCallback(() => {
    if (!isOpen && buttonRef.current) {
      // Calculate position before opening
      const position = calculatePosition();
      if (position) {
        setDropdownPosition(position);
      }
    }
    setIsOpen(!isOpen);
    if (isOpen) {
      // Clear position when closing
      setDropdownPosition(null);
    }
  }, [isOpen, calculatePosition]);

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Update position on scroll/resize when open
  React.useEffect(() => {
    if (isOpen && buttonRef.current && mounted) {
      const updatePosition = () => {
        const position = calculatePosition();
        if (position) {
          setDropdownPosition(position);
        }
      };

      const handleScroll = () => {
        updatePosition();
      };

      const handleResize = () => {
        updatePosition();
      };

      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isOpen, mounted, calculatePosition]);

  // Optimize filter with early return and memoization
  const filteredOptions = React.useMemo(() => {
    if (!searchTerm) return options;
    const term = toLower(searchTerm);
    // Use for loop for better performance on large lists
    const result = [];
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      if (includes(toLower(String(opt.label)), term)) {
        result.push(opt);
      }
    }
    return result;
  }, [options, searchTerm]);

  const toggleValue = React.useCallback((val) => {
    if (includes(selectedValues, val)) {
      onChange(filter(selectedValues, v => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  }, [selectedValues, onChange]);

  const clearAll = React.useCallback(() => {
    onChange([]);
    setSearchTerm('');
  }, [onChange]);

  const selectAll = React.useCallback(() => {
    onChange(options.map(o => o.value));
  }, [options, onChange]);

  const dropdownContent = isOpen && mounted && dropdownPosition ? (
    <div
      ref={dropdownRef}
      className="fixed w-56 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
      style={{
        minWidth: '200px',
        zIndex: 99999,
        top: `${dropdownPosition.top}px`,
        left: `${dropdownPosition.left}px`
      }}
    >
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <i className="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]"></i>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="w-full pl-7 pr-7 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSearchTerm(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <i className="pi pi-times text-[10px]"></i>
            </button>
          )}
        </div>
      </div>

      <div className="px-2 py-1 border-b border-gray-100 flex gap-2 text-[10px]">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); selectAll(); }}
          className="text-blue-600 hover:text-blue-800 transition-colors"
        >
          All
        </button>
        <span className="text-gray-300">|</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); clearAll(); }}
          className="text-gray-500 hover:text-red-600 transition-colors"
        >
          Clear
        </button>
        {!isEmpty(selectedValues) && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">{selectedValues.length} selected</span>
          </>
        )}
      </div>

      <div className="max-h-40 overflow-y-auto">
        {isEmpty(filteredOptions) ? (
          <div className="px-3 py-3 text-center text-xs text-gray-500">
            No matches
          </div>
        ) : (
          filteredOptions.map(opt => {
            const isSelected = includes(selectedValues, opt.value);
            return (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-xs ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'
                  }`}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleValue(opt.value)}
                  className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className={`truncate ${isSelected ? 'text-blue-900 font-medium' : 'text-gray-700'}`}>
                  {opt.label}
                </span>
              </label>
            );
          })
        )}
      </div>

      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
        Total {fieldName || 'fields'}: {options.length}
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative multiselect-filter-container">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={`w-full flex items-center justify-between px-2 py-1.5 text-xs border rounded bg-white hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${isEmpty(selectedValues) ? 'border-gray-300 text-gray-500' : 'border-blue-400 text-blue-700 bg-blue-50'
          }`}
      >
        <span className="truncate">
          {isEmpty(selectedValues) ? placeholder : `${selectedValues.length} Filter${selectedValues.length !== 1 ? 's' : ''}`}
        </span>
        <i className={`pi ${isOpen ? 'pi-chevron-up' : 'pi-chevron-down'} text-[10px] ml-1 flex-shrink-0`}></i>
      </button>

      {mounted && createPortal(dropdownContent, document.body)}
    </div>
  );
});
MultiselectFilter.displayName = 'MultiselectFilter';

const DateRangeFilter = React.memo(({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState(null);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const [startDate, setStartDate] = useState(value?.[0] || '');
  const [endDate, setEndDate] = useState(value?.[1] || '');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (value) {
      setStartDate(value[0] || '');
      setEndDate(value[1] || '');
    }
  }, [value]);

  const calculatePosition = React.useCallback(() => {
    if (!buttonRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 220; // Approximate dropdown height
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    const openAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    return {
      top: openAbove ? buttonRect.top - dropdownHeight - 4 : buttonRect.bottom + 4,
      left: buttonRect.left,
      openAbove
    };
  }, []);

  const handleToggle = React.useCallback(() => {
    if (!isOpen && buttonRef.current) {
      // Calculate position before opening
      const position = calculatePosition();
      if (position) {
        setDropdownPosition(position);
      }
    }
    setIsOpen(!isOpen);
    if (isOpen) {
      // Clear position when closing
      setDropdownPosition(null);
    }
  }, [isOpen, calculatePosition]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Update position on scroll/resize when open
  useEffect(() => {
    if (isOpen && buttonRef.current && mounted) {
      const updatePosition = () => {
        const position = calculatePosition();
        if (position) {
          setDropdownPosition(position);
        }
      };

      const handleScroll = () => {
        updatePosition();
      };

      const handleResize = () => {
        updatePosition();
      };

      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isOpen, mounted, calculatePosition]);

  const handleApply = React.useCallback(() => {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    onChange(start && end ? [start, end] : start ? [start, null] : end ? [null, end] : null);
    setIsOpen(false);
  }, [startDate, endDate, onChange]);

  const handleClear = React.useCallback(() => {
    setStartDate('');
    setEndDate('');
    onChange(null);
    setIsOpen(false);
  }, [onChange]);

  const hasValue = value && (value[0] || value[1]);

  const dropdownContent = isOpen && mounted && dropdownPosition ? (
    <div
      ref={dropdownRef}
      className="fixed w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3"
      style={{
        zIndex: 99999,
        top: `${dropdownPosition.top}px`,
        left: `${dropdownPosition.left}px`
      }}
    >
      <div className="space-y-2">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate ? new Date(startDate).toISOString().split('T')[0] : ''}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
          <input
            type="date"
            value={endDate ? new Date(endDate).toISOString().split('T')[0] : ''}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative date-range-filter">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={`w-full flex items-center justify-between px-2 py-1.5 text-xs border rounded bg-white hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${hasValue ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-500'
          }`}
      >
        <span className="truncate">
          {hasValue
            ? (value[0] && value[1]
              ? `${formatDateValue(value[0])} - ${formatDateValue(value[1])}`
              : value[0]
                ? `From ${formatDateValue(value[0])}`
                : `Until ${formatDateValue(value[1])}`)
            : 'Date range'}
        </span>
        <i className={`pi ${isOpen ? 'pi-chevron-up' : 'pi-chevron-down'} text-[10px] ml-1 flex-shrink-0`}></i>
      </button>

      {mounted && createPortal(dropdownContent, document.body)}
    </div>
  );
});
DateRangeFilter.displayName = 'DateRangeFilter';

// Custom Pagination Component
const CustomPaginator = React.memo(({ first, rows, totalRecords, rowsPerPageOptions, onPageChange, isGrouped = false }) => {
  const totalPages = Math.ceil(totalRecords / rows);
  const currentPage = Math.floor(first / rows) + 1;
  const startRecord = totalRecords === 0 ? 0 : first + 1;
  const endRecord = Math.min(first + rows, totalRecords);
  const recordLabel = isGrouped ? 'group' : 'row';
  const recordLabelPlural = isGrouped ? 'groups' : 'rows';

  const goToFirstPage = () => {
    if (currentPage > 1) {
      onPageChange({ first: 0, rows });
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      onPageChange({ first: first - rows, rows });
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      onPageChange({ first: first + rows, rows });
    }
  };

  const goToLastPage = () => {
    if (currentPage < totalPages) {
      onPageChange({ first: (totalPages - 1) * rows, rows });
    }
  };

  const changeRowsPerPage = (e) => {
    const newRows = parseInt(e.target.value, 10);
    onPageChange({ first: 0, rows: newRows });
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      onPageChange({ first: (page - 1) * rows, rows });
    }
  };

  // Calculate page numbers to show
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-white border-t border-gray-200">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span>{isGrouped ? 'Groups' : 'Rows'} per page:</span>
        <select
          value={rows}
          onChange={changeRowsPerPage}
          className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        >
          {rowsPerPageOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <span className="text-gray-500">
          {startRecord}-{endRecord} of {totalRecords} {totalRecords === 1 ? recordLabel : recordLabelPlural}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={goToFirstPage}
          disabled={currentPage === 1}
          className="p-2 text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
          title="First Page"
        >
          <i className="pi pi-angle-double-left text-sm"></i>
        </button>
        <button
          type="button"
          onClick={goToPreviousPage}
          disabled={currentPage === 1}
          className="p-2 text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
          title="Previous Page"
        >
          <i className="pi pi-angle-left text-sm"></i>
        </button>

        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) => (
            page === '...' ? (
              <span key={`ellipsis-${index}`} className="px-2 text-gray-400">...</span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => goToPage(page)}
                className={`px-3 py-1 text-sm rounded transition-colors ${currentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                {page}
              </button>
            )
          ))}
        </div>

        <button
          type="button"
          onClick={goToNextPage}
          disabled={currentPage === totalPages || totalPages === 0}
          className="p-2 text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
          title="Next Page"
        >
          <i className="pi pi-angle-right text-sm"></i>
        </button>
        <button
          type="button"
          onClick={goToLastPage}
          disabled={currentPage === totalPages || totalPages === 0}
          className="p-2 text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
          title="Last Page"
        >
          <i className="pi pi-angle-double-right text-sm"></i>
        </button>
      </div>
    </div>
  );
});
CustomPaginator.displayName = 'CustomPaginator';

// Memoized table row component to prevent unnecessary re-renders
const TableRow = React.memo(({
  item,
  rowIndex,
  frozenCols,
  regularCols,
  columnTypes,
  calculateColumnWidths,
  renderCell,
  renderFooterCell,
  isFooter = false,
  isMobile = false,
  groupByField = null,
  innerGroupByField = null
}) => {
  const { row, index, isGroupHeader, isGroupRow, isGroupFooter, isInnerGroupHeader, isInnerGroupRow, groupValue, groupRows, innerGroupValue, innerGroupRows, outerGroupValue, isInnerExpanded, isExpanded } = item;
  const isEven = rowIndex % 2 === 0;

  // Helper function to check if a column should be hidden when grouped
  const shouldHideColumn = (col) => {
    if (!isGroupHeader && !isInnerGroupHeader && !isGroupFooter) {
      return false; // Don't hide for regular rows
    }

    const colType = get(columnTypes, col);
    const isBoolean = get(colType, 'isBoolean', false);
    const isDate = get(colType, 'isDate', false);
    const isString = !get(colType, 'isNumeric', false) && !isDate && !isBoolean;

    // Hide string, boolean, and date columns except grouping columns
    if ((isBoolean || isString || isDate) && col !== groupByField && col !== innerGroupByField) {
      return true;
    }

    return false;
  };

  // Helper function to check if a column should be hidden in footer when grouped
  const shouldHideFooterColumn = (col) => {
    if (!groupByField && !innerGroupByField) {
      return false; // Don't hide if not grouped
    }

    const colType = get(columnTypes, col);
    const isBoolean = get(colType, 'isBoolean', false);
    const isDate = get(colType, 'isDate', false);
    const isString = !get(colType, 'isNumeric', false) && !isDate && !isBoolean;

    // Hide string, boolean, and date columns except grouping columns
    if ((isBoolean || isString || isDate) && col !== groupByField && col !== innerGroupByField) {
      return true;
    }

    return false;
  };

  if (isFooter) {
    const visibleFrozenCols = frozenCols.filter(col => !shouldHideFooterColumn(col));
    const visibleRegularCols = regularCols.filter(col => !shouldHideFooterColumn(col));

    return (
      <tr className="bg-gray-100 font-semibold">
        {visibleFrozenCols.map((col, colIndex) => {
          const colWidth = get(calculateColumnWidths, col, 120);
          const minColWidth = Math.max(colWidth, 150);
          const isFirstColumn = colIndex === 0;

          // Calculate cumulative left position based on previous visible frozen columns' widths
          let leftPosition = 0;
          for (let i = 0; i < colIndex; i++) {
            const prevCol = visibleFrozenCols[i];
            const prevColWidth = get(calculateColumnWidths, prevCol, 120);
            const prevMinColWidth = Math.max(prevColWidth, 150);
            leftPosition += prevMinColWidth;
          }

          // Remove right border for frozen columns except the last one to prevent gaps (only on desktop)
          const isLastFrozen = colIndex === visibleFrozenCols.length - 1;
          const borderClass = isMobile
            ? 'border border-gray-200'
            : (isLastFrozen
              ? 'border border-gray-200'
              : 'border-t border-b border-l border-gray-200');

          return (
            <td
              key={`footer-frozen-${col}`}
              className={`${borderClass} px-3 py-2 text-xs sm:text-sm bg-gray-100`}
              style={{
                minWidth: `${minColWidth}px`,
                width: `${minColWidth}px`,
                maxWidth: `${minColWidth}px`,
                ...(isMobile ? {} : {
                  position: 'sticky',
                  left: `${leftPosition}px`,
                  zIndex: 20,
                }),
                backgroundColor: '#f3f4f6'
              }}
            >
              {renderFooterCell(col, isFirstColumn)}
            </td>
          );
        })}
        {visibleRegularCols.map((col) => {
          const colWidth = get(calculateColumnWidths, col, 120);

          return (
            <td
              key={`footer-${col}`}
              className="border border-gray-200 px-3 py-2 text-xs sm:text-sm bg-gray-100"
              style={{
                minWidth: `${colWidth}px`,
                width: `${colWidth}px`,
                maxWidth: `${get(calculateColumnWidths, col, 400)}px`
              }}
            >
              {renderFooterCell(col)}
            </td>
          );
        })}
      </tr>
    );
  }

  return (
    <tr
      key={`row-${index}-${isGroupFooter ? 'footer' : ''}`}
      className={`${isEven ? 'bg-white' : 'bg-gray-50'} ${isGroupHeader ? 'bg-gray-100' : ''} ${isInnerGroupHeader ? 'bg-gray-75' : ''} ${isGroupFooter ? 'bg-gray-50 font-medium' : ''} hover:bg-blue-50 transition-colors`}
    >
      {frozenCols.filter(col => !shouldHideColumn(col)).map((col, colIndex) => {
        const colType = get(columnTypes, col);
        const colWidth = get(calculateColumnWidths, col, 120);
        const minColWidth = Math.max(colWidth, 150);

        // Calculate cumulative left position based on previous visible frozen columns' widths
        let leftPosition = 0;
        const visibleFrozenCols = frozenCols.filter(c => !shouldHideColumn(c));
        for (let i = 0; i < colIndex; i++) {
          const prevCol = visibleFrozenCols[i];
          const prevColWidth = get(calculateColumnWidths, prevCol, 120);
          const prevMinColWidth = Math.max(prevColWidth, 150);
          leftPosition += prevMinColWidth;
        }

        // Remove right border for frozen columns except the last one to prevent gaps (only on desktop)
        const isLastFrozen = colIndex === visibleFrozenCols.length - 1;
        const borderClass = isMobile
          ? 'border border-gray-200'
          : (isLastFrozen
            ? 'border border-gray-200'
            : 'border-t border-b border-l border-gray-200');

        return (
          <td
            key={`frozen-${col}`}
            className={`${borderClass} px-3 py-2 text-xs sm:text-sm`}
            style={{
              minWidth: `${minColWidth}px`,
              width: `${minColWidth}px`,
              maxWidth: `${minColWidth}px`,
              ...(isMobile ? {} : {
                position: 'sticky',
                left: `${leftPosition}px`,
                zIndex: 15,
              }),
              backgroundColor: isGroupHeader ? '#f3f4f6' : isInnerGroupHeader ? '#f7f8f9' : isGroupFooter ? '#f9fafb' : (isEven ? '#ffffff' : '#f9fafb')
            }}
          >
            {renderCell(row, col, isGroupHeader, isGroupFooter, groupValue, groupRows, isInnerGroupHeader, innerGroupValue, innerGroupRows, outerGroupValue, isInnerExpanded, isExpanded)}
          </td>
        );
      })}
      {regularCols.filter(col => !shouldHideColumn(col)).map((col) => {
        const colType = get(columnTypes, col);
        const colWidth = get(calculateColumnWidths, col, 120);

        return (
          <td
            key={col}
            className="border border-gray-200 px-3 py-2 text-xs sm:text-sm"
            style={{
              minWidth: `${colWidth}px`,
              width: `${colWidth}px`,
              maxWidth: `${get(calculateColumnWidths, col, 400)}px`
            }}
          >
            {renderCell(row, col, isGroupHeader, isGroupFooter, groupValue, groupRows, isInnerGroupHeader, innerGroupValue, innerGroupRows, outerGroupValue, isInnerExpanded, isExpanded)}
          </td>
        );
      })}
    </tr>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for better memoization
  if (prevProps.item.index !== nextProps.item.index) return false;
  if (prevProps.item.isGroupHeader !== nextProps.item.isGroupHeader) return false;
  if (prevProps.item.isGroupFooter !== nextProps.item.isGroupFooter) return false;
  if (prevProps.item.isExpanded !== nextProps.item.isExpanded) return false;
  if (prevProps.rowIndex !== nextProps.rowIndex) return false;
  if (prevProps.isFooter !== nextProps.isFooter) return false;
  if (prevProps.isMobile !== nextProps.isMobile) return false;
  // Compare row data shallowly
  if (prevProps.item.row !== nextProps.item.row) {
    // Only re-render if row reference changed (should be stable)
    return false;
  }
  return true;
});
TableRow.displayName = 'TableRow';

export default function DataTableComponent({
  data,
  rowsPerPageOptions = [10, 25, 50, 100],
  defaultRows = 10,
  scrollable = true,
  scrollHeight,
  enableSort = true,
  enableFilter = true,
  enableSummation = true,
  textFilterColumns = [],
  redFields = [],
  greenFields = [],
  groupByField = null,
  innerGroupByField = null,
  enableInnerGroupFooter = true,
}) {
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(defaultRows);
  const [filters, setFilters] = useState({});
  const [scrollHeightValue, setScrollHeightValue] = useState('600px');
  const [multiSortMeta, setMultiSortMeta] = useState([]);
  const [expandedGroupValues, setExpandedGroupValues] = useState(new Set());
  const tableRef = useRef(null);
  const [tableScrollLeft, setTableScrollLeft] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // Mobile breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    setRows(defaultRows);
    setFirst(0);
  }, [defaultRows]);

  useEffect(() => {
    const updateScrollHeight = debounce(() => {
      if (scrollHeight) {
        setScrollHeightValue(scrollHeight);
        return;
      }
      const width = window.innerWidth;
      if (width < 640) {
        setScrollHeightValue('400px');
      } else if (width < 1024) {
        setScrollHeightValue('500px');
      } else {
        setScrollHeightValue('600px');
      }
    }, 100);

    updateScrollHeight();
    window.addEventListener('resize', updateScrollHeight);
    return () => {
      updateScrollHeight.cancel();
      window.removeEventListener('resize', updateScrollHeight);
    };
  }, [scrollHeight]);

  const safeData = useMemo(() => {
    if (!Array.isArray(data) || isEmpty(data)) return [];
    return data;
  }, [data]);

  const columns = useMemo(() => {
    if (isEmpty(safeData)) return [];
    const allKeys = uniq(flatMap(safeData, (item) =>
      item && typeof item === 'object' ? keys(item) : []
    ));
    return allKeys;
  }, [safeData]);

  const orderedColumns = useMemo(() => {
    if (isEmpty(columns)) return [];

    const ordered = [];
    const remaining = [...columns];

    if (groupByField && includes(remaining, groupByField)) {
      ordered.push(groupByField);
      remaining.splice(remaining.indexOf(groupByField), 1);
    }

    if (innerGroupByField && includes(remaining, innerGroupByField)) {
      ordered.push(innerGroupByField);
      remaining.splice(remaining.indexOf(innerGroupByField), 1);
    }

    ordered.push(...remaining);

    return ordered;
  }, [columns, groupByField, innerGroupByField]);

  const frozenCols = useMemo(() => {
    const frozen = [];
    if (groupByField && includes(orderedColumns, groupByField)) {
      frozen.push(groupByField);
    }
    if (innerGroupByField && includes(orderedColumns, innerGroupByField)) {
      frozen.push(innerGroupByField);
    }
    return frozen;
  }, [orderedColumns, groupByField, innerGroupByField]);

  const regularCols = useMemo(() => {
    return orderedColumns.filter(col => !includes(frozenCols, col));
  }, [orderedColumns, frozenCols]);

  const isNumericValue = useCallback((value) => {
    if (isNil(value)) return false;
    return isNumber(value) || (!_isNaN(parseFloat(value)) && _isFinite(value));
  }, []);

  // Memoize header names to prevent recalculation
  const headerNames = useMemo(() => {
    const names = {};
    columns.forEach((col) => {
      names[col] = startCase(col.split('__').join(' ').split('_').join(' '));
    });
    return names;
  }, [columns]);

  const formatHeaderName = useCallback((key) => {
    return headerNames[key] || startCase(key.split('__').join(' ').split('_').join(' '));
  }, [headerNames]);

  const formatCellValue = useCallback((value, colType) => {
    if (isNil(value)) return '';

    if (colType?.isDate) {
      return formatDateValue(value);
    }

    if (isNumber(value)) {
      return value % 1 === 0
        ? value.toLocaleString('en-US')
        : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(value);
  }, []);

  const columnTypes = useMemo(() => {
    const types = {};
    if (isEmpty(safeData)) return types;

    const sampleData = take(safeData, 100);

    columns.forEach((col) => {
      let numericCount = 0;
      let dateCount = 0;
      let booleanCount = 0;
      let binaryCount = 0;
      let nonNullCount = 0;

      sampleData.forEach((row) => {
        const value = get(row, col);
        if (!isNil(value)) {
          nonNullCount++;
          if (isBoolean(value)) booleanCount++;
          else if (value === 0 || value === 1 || value === '0' || value === '1') {
            binaryCount++;
          }
          else if (isDateLike(value)) {
            dateCount++;
          }
          else if (isNumericValue(value)) {
            numericCount++;
          }
        }
      });

      const isTrueBooleanColumn = nonNullCount > 0 && booleanCount > nonNullCount * 0.7;
      const isBinaryBooleanColumn = nonNullCount > 0 && binaryCount === nonNullCount && binaryCount >= 1;
      const isBooleanColumn = isTrueBooleanColumn || isBinaryBooleanColumn;

      const isDateColumn = !isBooleanColumn && nonNullCount > 0 && dateCount > nonNullCount * 0.7;
      const isNumericColumn = !isBooleanColumn && !isDateColumn && nonNullCount > 0 && numericCount > nonNullCount * 0.8;

      types[col] = {
        isBoolean: isBooleanColumn,
        isBinaryBoolean: isBinaryBooleanColumn,
        isNumeric: isNumericColumn,
        isDate: isDateColumn
      };
    });

    return types;
  }, [safeData, columns, isNumericValue]);

  const multiselectColumns = useMemo(() => {
    if (isEmpty(columns) || isEmpty(columnTypes)) return [];

    const stringColumns = columns.filter((col) => {
      const colType = get(columnTypes, col);
      return !get(colType, 'isBoolean') &&
        !get(colType, 'isDate') &&
        !get(colType, 'isNumeric');
    });

    const textFilterSet = new Set(textFilterColumns);
    const multiselectCols = stringColumns.filter(col => !textFilterSet.has(col));

    return multiselectCols;
  }, [columns, columnTypes, textFilterColumns]);

  // Optimize optionColumnValues with Set for uniqueness and direct array building
  const optionColumnValues = useMemo(() => {
    const values = {};
    if (isEmpty(safeData) || isEmpty(multiselectColumns)) return values;

    multiselectColumns.forEach((col) => {
      const uniqueSet = new Set();
      // Use for loop for better performance
      for (let i = 0; i < safeData.length; i++) {
        const val = get(safeData[i], col);
        if (!isNil(val)) {
          uniqueSet.add(val);
        }
      }
      const uniqueVals = Array.from(uniqueSet);
      values[col] = orderBy(uniqueVals).map((val) => ({
        label: String(val),
        value: val,
      }));
    });

    return values;
  }, [safeData, multiselectColumns]);

  useEffect(() => {
    if (enableFilter && !isEmpty(columns)) {
      const newFilters = { ...filters };

      columns.forEach((col) => {
        if (!newFilters[col]) {
          const colType = get(columnTypes, col);
          const isMultiselectColumn = includes(multiselectColumns, col);

          if (isMultiselectColumn) {
            newFilters[col] = { value: null, matchMode: 'in' };
          } else if (get(colType, 'isBoolean')) {
            newFilters[col] = { value: null, matchMode: 'equals' };
          } else if (get(colType, 'isDate')) {
            newFilters[col] = { value: null, matchMode: 'dateRange' };
          } else {
            newFilters[col] = { value: null, matchMode: 'contains' };
          }
        } else {
          const colType = get(columnTypes, col);
          const isMultiselectColumn = includes(multiselectColumns, col);
          const currentFilter = newFilters[col];

          if (isMultiselectColumn && currentFilter.matchMode !== 'in') {
            newFilters[col] = { ...currentFilter, matchMode: 'in' };
          } else if (get(colType, 'isBoolean') && currentFilter.matchMode !== 'equals') {
            newFilters[col] = { ...currentFilter, matchMode: 'equals' };
          } else if (get(colType, 'isDate') && currentFilter.matchMode !== 'dateRange') {
            newFilters[col] = { ...currentFilter, matchMode: 'dateRange' };
          } else if (!isMultiselectColumn && !get(colType, 'isBoolean') && !get(colType, 'isDate') && currentFilter.matchMode !== 'contains') {
            newFilters[col] = { ...currentFilter, matchMode: 'contains' };
          }
        }
      });

      setFilters(newFilters);
    } else if (!enableFilter) {
      setFilters({});
    }
  }, [columns, enableFilter, columnTypes, multiselectColumns, textFilterColumns]);

  const calculateColumnWidths = useMemo(() => {
    const widths = {};
    if (isEmpty(safeData)) return widths;

    const sampleData = take(safeData, 100);

    columns.forEach((col) => {
      const headerLength = (headerNames[col] || formatHeaderName(col)).length;
      const cellLengths = [];
      const colType = get(columnTypes, col, { isBoolean: false, isNumeric: false, isDate: false });

      sampleData.forEach((row) => {
        const value = get(row, col);
        if (!isNil(value)) {
          cellLengths.push(formatCellValue(value, colType).length);
        }
      });

      const { isBoolean: isBooleanColumn, isNumeric: isNumericColumn, isDate: isDateColumn } = colType;

      let contentWidth = headerLength;

      if (!isEmpty(cellLengths)) {
        const sortedLengths = orderBy(cellLengths);
        const medianLength = sortedLengths[Math.floor(sortedLengths.length / 2)];
        const percentile75 = sortedLengths[Math.floor(sortedLengths.length * 0.75)];
        const percentile95 = sortedLengths[Math.floor(sortedLengths.length * 0.95)];
        contentWidth = Math.min(Math.max(medianLength, percentile75), percentile95);
      }

      const headerWidth = headerLength * 9;
      let baseWidth;

      if (isBooleanColumn) {
        baseWidth = Math.max(headerWidth, 50);
      } else if (isDateColumn) {
        baseWidth = Math.max(headerWidth, 120);
      } else if (isNumericColumn) {
        baseWidth = Math.max(headerWidth, 70);
      } else {
        baseWidth = Math.max(contentWidth * 9, headerWidth);
      }

      const sortPadding = enableSort ? 30 : 0;
      const finalWidth = baseWidth + sortPadding;

      // Frozen columns (groupByField and innerGroupByField) need minimum width of 150
      const isFrozen = (col === groupByField || col === innerGroupByField);
      const minWidth = isFrozen ? 150 : (isBooleanColumn ? 100 : isDateColumn ? 180 : isNumericColumn ? 130 : 140);
      const maxWidth = isBooleanColumn ? 180 : isDateColumn ? 280 : isNumericColumn ? 250 : 400;

      widths[col] = clamp(finalWidth, minWidth, maxWidth);
    });

    return widths;
  }, [safeData, columns, enableSort, formatHeaderName, formatCellValue, columnTypes, groupByField, innerGroupByField, headerNames]);

  // Optimize filteredData with early returns and cached lookups
  const filteredData = useMemo(() => {
    if (!Array.isArray(safeData) || isEmpty(safeData)) return [];
    if (isEmpty(filters) || !enableFilter) return safeData;

    // Pre-compute active filters for performance
    const activeFilters = [];
    for (const col of columns) {
      const filterObj = get(filters, col);
      if (filterObj && !isNil(filterObj.value) && filterObj.value !== '') {
        if (isArray(filterObj.value) && isEmpty(filterObj.value)) continue;
        activeFilters.push({ col, filterObj, colType: get(columnTypes, col), isMultiselect: includes(multiselectColumns, col) });
      }
    }

    // Early return if no active filters
    if (activeFilters.length === 0) return safeData;

    console.log('[DEBUG filteredData] Starting filter:', {
      safeDataLength: safeData.length,
      activeFiltersCount: activeFilters.length,
      activeFilters: activeFilters.map(f => ({ col: f.col, matchMode: f.filterObj.matchMode }))
    });

    // Use for loop for better performance
    const filtered = [];
    for (let i = 0; i < safeData.length; i++) {
      const row = safeData[i];
      if (!row || typeof row !== 'object') continue;

      let matches = true;
      // Check each filter with early exit
      for (let j = 0; j < activeFilters.length; j++) {
        const { col, filterObj, colType, isMultiselect } = activeFilters[j];
        const cellValue = get(row, col);
        const filterValue = filterObj.value;

        if (isMultiselect && isArray(filterValue)) {
          if (!some(filterValue, (v) => v === cellValue || String(v) === String(cellValue))) {
            matches = false;
            break;
          }
        } else if (get(colType, 'isBoolean')) {
          const cellIsTruthy = cellValue === true || cellValue === 1 || cellValue === '1';
          const cellIsFalsy = cellValue === false || cellValue === 0 || cellValue === '0';

          if (filterValue === true && !cellIsTruthy) {
            matches = false;
            break;
          } else if (filterValue === false && !cellIsFalsy) {
            matches = false;
            break;
          }
        } else if (get(colType, 'isDate')) {
          if (!applyDateFilter(cellValue, filterValue)) {
            matches = false;
            break;
          }
        } else if (get(colType, 'isNumeric')) {
          const parsedFilter = parseNumericFilter(filterValue);
          if (!applyNumericFilter(cellValue, parsedFilter)) {
            matches = false;
            break;
          }
        } else {
          const strCell = toLower(String(cellValue ?? ''));
          const strFilter = toLower(String(filterValue));
          if (!includes(strCell, strFilter)) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        filtered.push(row);
      }
    }

    console.log('[DEBUG filteredData] Filter complete:', {
      inputRows: safeData.length,
      filteredRows: filtered.length,
      removedRows: safeData.length - filtered.length
    });

    return filtered;
  }, [safeData, filters, columns, columnTypes, multiselectColumns, enableFilter]);

  const sortedData = useMemo(() => {
    if (!Array.isArray(filteredData) || isEmpty(filteredData)) {
      return [];
    }

    let dataToSort = [...filteredData];
    let sortFields = [];
    let sortOrders = [];

    if (groupByField && includes(columns, groupByField)) {
      sortFields.push(groupByField);
      sortOrders.push('asc');
    }

    if (innerGroupByField && includes(columns, innerGroupByField)) {
      sortFields.push(innerGroupByField);
      sortOrders.push('asc');
    }

    if (!isEmpty(multiSortMeta)) {
      const userFields = multiSortMeta.map(s => s.field);
      const userOrders = multiSortMeta.map(s => s.order === 1 ? 'asc' : 'desc');

      userFields.forEach((field, index) => {
        if (field !== groupByField && field !== innerGroupByField) {
          sortFields.push(field);
          sortOrders.push(userOrders[index]);
        }
      });
    }

    if (!isEmpty(sortFields)) {
      const sorted = orderBy(dataToSort, sortFields, sortOrders);
      const result = Array.isArray(sorted) ? sorted : [];
      console.log('[DEBUG sortedData] Sorting complete:', {
        inputRows: filteredData.length,
        sortedRows: result.length,
        sortFields,
        sortOrders
      });
      return result;
    }

    const result = Array.isArray(dataToSort) ? dataToSort : [];
    console.log('[DEBUG sortedData] No sorting applied:', {
      inputRows: filteredData.length,
      outputRows: result.length
    });
    return result;
  }, [filteredData, multiSortMeta, groupByField, innerGroupByField, columns]);

  const calculateSums = useMemo(() => {
    const sums = {};
    if (isEmpty(filteredData)) return sums;

    columns.forEach((col) => {
      const colType = get(columnTypes, col);
      if (get(colType, 'isDate')) return;

      const values = filter(
        filteredData.map((row) => get(row, col)),
        (val) => !isNil(val)
      );

      if (!isEmpty(values) && isNumericValue(head(values))) {
        sums[col] = sumBy(values, (val) => {
          const numVal = isNumber(val) ? val : toNumber(val);
          return _isNaN(numVal) ? 0 : numVal;
        });
      }
    });
    return sums;
  }, [filteredData, columns, isNumericValue, columnTypes]);

  const emptyGroupByFieldRows = useMemo(() => {
    const emptyRows = new Set();
    if (!groupByField || isEmpty(sortedData)) {
      return emptyRows;
    }

    if (sortedData.length > 0) {
      const firstRowGroupValue = String(get(sortedData[0], groupByField) ?? '');
      if (firstRowGroupValue !== '') {
        emptyRows.add(0);
      }
    }

    for (let i = 1; i < sortedData.length; i++) {
      const currentRow = sortedData[i];
      const prevRow = sortedData[i - 1];
      const currentGroupValue = String(get(currentRow, groupByField) ?? '');
      const prevGroupValue = String(get(prevRow, groupByField) ?? '');

      if (currentGroupValue !== '') {
        if (currentGroupValue === prevGroupValue) {
          emptyRows.add(i);
        } else {
          emptyRows.add(i);
        }
      }
    }
    return emptyRows;
  }, [sortedData, groupByField]);

  const indentedRows = useMemo(() => {
    const indented = new Set();
    if (!innerGroupByField || !groupByField || isEmpty(sortedData)) {
      return indented;
    }

    for (let i = 1; i < sortedData.length; i++) {
      const currentRow = sortedData[i];
      const prevRow = sortedData[i - 1];
      const currentGroupValue = String(get(currentRow, groupByField) ?? '');
      const prevGroupValue = String(get(prevRow, groupByField) ?? '');

      if (currentGroupValue === prevGroupValue && currentGroupValue !== '') {
        indented.add(i);
      }
    }
    return indented;
  }, [sortedData, innerGroupByField, groupByField]);

  const paginatedData = useMemo(() => {
    if (!Array.isArray(sortedData)) {
      return [];
    }
    return sortedData.slice(first, first + rows);
  }, [sortedData, first, rows]);

  const isGroupExpanded = useCallback((groupValue) => {
    if (!groupByField || expandedGroupValues.size === 0) return false;
    return expandedGroupValues.has(String(groupValue));
  }, [groupByField, expandedGroupValues]);

  const toggleGroup = useCallback((rowData) => {
    if (!groupByField) return;

    const groupValue = get(rowData, groupByField);
    const groupValueStr = String(groupValue);

    setExpandedGroupValues(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupValueStr)) {
        // Collapse: remove from set
        newSet.delete(groupValueStr);
      } else {
        // Expand: add to set
        newSet.add(groupValueStr);
      }
      return newSet;
    });
  }, [groupByField]);


  const getGroupRows = useCallback((groupValue) => {
    if (!groupByField) return [];
    const groupValueStr = String(groupValue);
    const rows = sortedData.filter(row => String(get(row, groupByField)) === groupValueStr);
    console.log('[DEBUG getGroupRows]', {
      groupValue,
      groupValueStr,
      sortedDataLength: sortedData.length,
      filteredRowsCount: rows.length,
      rows: rows.map((r, idx) => ({ index: sortedData.indexOf(r), rowData: r }))
    });
    return rows;
  }, [sortedData, groupByField]);

  // Get inner group rows (rows grouped by innerGroupByField within an outer group)
  const getInnerGroupRows = useCallback((outerGroupValue, innerGroupValue) => {
    if (!innerGroupByField || !groupByField) return [];
    const outerGroupValueStr = String(outerGroupValue);
    const innerGroupValueStr = String(innerGroupValue);
    const rows = sortedData.filter(row =>
      String(get(row, groupByField)) === outerGroupValueStr &&
      String(get(row, innerGroupByField)) === innerGroupValueStr
    );
    return rows;
  }, [sortedData, groupByField, innerGroupByField]);

  // Get all inner groups within an outer group
  const getInnerGroups = useCallback((outerGroupValue) => {
    if (!innerGroupByField || !groupByField) return [];
    const outerGroupValueStr = String(outerGroupValue);
    const outerGroupRows = sortedData.filter(row => String(get(row, groupByField)) === outerGroupValueStr);

    const innerGroupsMap = new Map();
    outerGroupRows.forEach((row) => {
      const innerGroupValue = get(row, innerGroupByField);
      const innerGroupValueStr = String(innerGroupValue ?? '');

      if (!innerGroupsMap.has(innerGroupValueStr)) {
        innerGroupsMap.set(innerGroupValueStr, {
          innerGroupValue,
          innerGroupValueStr,
          rows: []
        });
      }
      innerGroupsMap.get(innerGroupValueStr).rows.push(row);
    });

    return Array.from(innerGroupsMap.values());
  }, [sortedData, groupByField, innerGroupByField]);

  // Get list of unique groups for pagination
  const groupList = useMemo(() => {
    if (!groupByField || isEmpty(sortedData)) {
      return [];
    }

    const groups = [];
    const processedGroups = new Set();

    console.log('[DEBUG groupList] Building group list from sortedData:', {
      sortedDataLength: sortedData.length,
      groupByField
    });

    for (let i = 0; i < sortedData.length; i++) {
      const row = sortedData[i];
      const groupValue = get(row, groupByField);
      const groupValueStr = String(groupValue);

      if (groupValueStr !== '' && !processedGroups.has(groupValueStr)) {
        processedGroups.add(groupValueStr);
        const groupRows = getGroupRows(groupValue);
        const firstRow = row;

        console.log('[DEBUG groupList] Adding group:', {
          groupValue,
          groupValueStr,
          firstRowIndex: i,
          groupRowsCount: groupRows.length,
          firstRowInGroupRows: groupRows.includes(firstRow)
        });

        groups.push({
          groupValue,
          groupValueStr,
          firstRow,
          groupRows,
          firstRowIndex: i
        });
      }
    }

    console.log('[DEBUG groupList] Final groups:', {
      totalGroups: groups.length,
      groupsSummary: groups.map(g => ({
        groupValue: g.groupValueStr,
        rowsCount: g.groupRows.length
      }))
    });

    return groups;
  }, [sortedData, groupByField, getGroupRows]);

  // Flatten grouped data for display (only for groups on current page)
  const groupedData = useMemo(() => {
    if (!groupByField || isEmpty(sortedData)) {
      return sortedData.map((row, index) => ({ row, index, isGroupHeader: false }));
    }

    const result = [];

    // Get groups for current page
    const startGroupIndex = first;
    const endGroupIndex = Math.min(first + rows, groupList.length);
    const currentPageGroups = groupList.slice(startGroupIndex, endGroupIndex);

    currentPageGroups.forEach((group) => {
      const { firstRow, groupRows, groupValue, firstRowIndex } = group;
      const isExpanded = isGroupExpanded(groupValue);

      // Add group header
      result.push({
        row: firstRow,
        index: firstRowIndex,
        isGroupHeader: true,
        groupValue,
        groupRows,
        isExpanded
      });

      // If expanded, add rows in the group
      if (isExpanded) {
        console.log('[DEBUG groupedData] Group expanded:', {
          groupValue,
          groupRowsCount: groupRows.length,
          firstRowIndex,
          groupRows: groupRows.map((r, idx) => ({
            index: sortedData.indexOf(r),
            isFirstRow: r === firstRow
          }))
        });

        // If inner grouping is enabled, group by inner field and show as aggregated line items
        if (innerGroupByField) {
          const innerGroups = getInnerGroups(groupValue);

          innerGroups.forEach((innerGroup) => {
            const { innerGroupValue, rows: innerGroupRows } = innerGroup;

            // Add inner group as a single aggregated line item
            const firstInnerRow = innerGroupRows[0];
            const firstInnerRowIndex = sortedData.indexOf(firstInnerRow);
            if (firstInnerRowIndex !== -1) {
              result.push({
                row: firstInnerRow,
                index: firstInnerRowIndex,
                isGroupHeader: false,
                isInnerGroupHeader: true,
                innerGroupValue,
                innerGroupRows,
                outerGroupValue: groupValue,
                isInnerExpanded: false // Always show as aggregated, not expandable
              });
            }
          });
        } else {
          // No inner grouping - add all rows directly
          groupRows.forEach((groupRow) => {
            const rowIndex = sortedData.indexOf(groupRow);
            if (rowIndex !== -1) {
              result.push({
                row: groupRow,
                index: rowIndex,
                isGroupHeader: false,
                isGroupRow: true
              });
            } else {
              console.warn('[DEBUG groupedData] Row not found in sortedData:', groupRow);
            }
          });
        }

        // Add group footer row only if inner group footer is enabled or there's no inner grouping
        if (!innerGroupByField || enableInnerGroupFooter) {
          result.push({
            row: firstRow,
            index: firstRowIndex,
            isGroupHeader: false,
            isGroupFooter: true,
            groupValue,
            groupRows
          });
        }
      }
    });

    // Add ungrouped rows (rows with empty group value) - show on first page only
    if (first === 0) {
      sortedData.forEach((row, index) => {
        const groupValue = get(row, groupByField);
        const groupValueStr = String(groupValue);
        if (groupValueStr === '') {
          result.push({
            row,
            index,
            isGroupHeader: false
          });
        }
      });
    }

    return result;
  }, [sortedData, groupByField, innerGroupByField, isGroupExpanded, getGroupRows, getInnerGroups, groupList, first, rows, enableInnerGroupFooter]);

  const displayData = useMemo(() => {
    if (groupByField) {
      // groupedData already contains only groups for current page
      return groupedData;
    }
    return paginatedData.map((row, index) => ({ row, index: first + index, isGroupHeader: false }));
  }, [groupByField, groupedData, paginatedData, first, rows]);

  // Debounced filter update for text/numeric inputs
  const debouncedFilterUpdate = useMemo(
    () => debounce((col, value) => {
      setFilters(prev => ({
        ...prev,
        [col]: { ...get(prev, col), value }
      }));
      setFirst(0);
    }, 300),
    []
  );

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedFilterUpdate.cancel();
    };
  }, [debouncedFilterUpdate]);

  const updateFilter = useCallback((col, value, immediate = false) => {
    if (immediate) {
      debouncedFilterUpdate.cancel();
      setFilters(prev => ({
        ...prev,
        [col]: { ...get(prev, col), value }
      }));
      setFirst(0);
    } else {
      debouncedFilterUpdate(col, value);
    }
  }, [debouncedFilterUpdate]);

  const clearFilter = useCallback((col) => {
    updateFilter(col, null);
  }, [updateFilter]);

  const clearAllFilters = useCallback(() => {
    const clearedFilters = {};
    columns.forEach((col) => {
      const colType = get(columnTypes, col);
      const isMultiselectColumn = includes(multiselectColumns, col);
      if (isMultiselectColumn) {
        clearedFilters[col] = { value: null, matchMode: 'in' };
      } else if (get(colType, 'isBoolean')) {
        clearedFilters[col] = { value: null, matchMode: 'equals' };
      } else if (get(colType, 'isDate')) {
        clearedFilters[col] = { value: null, matchMode: 'dateRange' };
      } else {
        clearedFilters[col] = { value: null, matchMode: 'contains' };
      }
    });
    setFilters(clearedFilters);
    setFirst(0);
  }, [columns, columnTypes, multiselectColumns]);

  const formatFilterValue = useCallback((col, filterValue, colType) => {
    if (isNil(filterValue) || filterValue === '') return null;

    const isMultiselectColumn = includes(multiselectColumns, col);

    if (isMultiselectColumn && isArray(filterValue) && !isEmpty(filterValue)) {
      return filterValue.map(v => String(v)).join(', ');
    }

    if (get(colType, 'isBoolean')) {
      if (filterValue === true) return 'Yes';
      if (filterValue === false) return 'No';
      return null;
    }

    if (get(colType, 'isDate') && isArray(filterValue)) {
      const [startDate, endDate] = filterValue;
      if (startDate && endDate) {
        const startStr = formatDateValue(startDate);
        const endStr = formatDateValue(endDate);
        return `${startStr} - ${endStr}`;
      } else if (startDate) {
        return `From ${formatDateValue(startDate)}`;
      } else if (endDate) {
        return `Until ${formatDateValue(endDate)}`;
      }
      return null;
    }

    if (isString(filterValue) || isNumber(filterValue)) {
      return String(filterValue);
    }

    return null;
  }, [multiselectColumns]);

  const activeFilters = useMemo(() => {
    if (!enableFilter || isEmpty(filters)) return [];

    const active = [];
    columns.forEach((col) => {
      const filterObj = get(filters, col);
      if (filterObj && !isNil(filterObj.value) && filterObj.value !== '') {
        if (isArray(filterObj.value) && isEmpty(filterObj.value)) {
          return;
        }
        const colType = get(columnTypes, col);
        const formattedValue = formatFilterValue(col, filterObj.value, colType);
        if (formattedValue !== null) {
          active.push({
            column: col,
            value: filterObj.value,
            formattedValue,
            colType
          });
        }
      }
    });
    return active;
  }, [filters, columns, enableFilter, columnTypes, formatFilterValue, multiselectColumns]);

  const handleSort = useCallback((column) => {
    if (!enableSort) return;

    setMultiSortMeta(prev => {
      const existing = prev.find(s => s.field === column);
      if (existing) {
        if (existing.order === 1) {
          // Change to descending
          return prev.map(s => s.field === column ? { ...s, order: -1 } : s);
        } else {
          // Remove sort
          return prev.filter(s => s.field !== column);
        }
      } else {
        // Add ascending sort
        return [...prev, { field: column, order: 1 }];
      }
    });
    setFirst(0);
  }, [enableSort]);

  // Memoize sort icons to prevent recreation on every render
  const sortIcons = useMemo(() => {
    const icons = {};
    columns.forEach((col) => {
      const sortMeta = multiSortMeta.find(s => s.field === col);
      if (!sortMeta) {
        icons[col] = <i className="pi pi-sort text-gray-400 text-xs"></i>;
      } else if (sortMeta.order === 1) {
        icons[col] = <i className="pi pi-sort-up text-blue-600 text-xs"></i>;
      } else {
        icons[col] = <i className="pi pi-sort-down text-blue-600 text-xs"></i>;
      }
    });
    return icons;
  }, [multiSortMeta, columns]);

  const getSortIcon = useCallback((column) => {
    return sortIcons[column] || <i className="pi pi-sort text-gray-400 text-xs"></i>;
  }, [sortIcons]);

  // Memoize filter elements to prevent recreation
  const filterElements = useMemo(() => {
    const elements = {};
    if (!enableFilter) return elements;

    columns.forEach((col) => {
      const colType = get(columnTypes, col);
      const isMultiselectColumn = includes(multiselectColumns, col);
      const filterState = get(filters, col);
      const filterValue = get(filterState, 'value', null);

      if (isMultiselectColumn) {
        elements[col] = (
          <MultiselectFilter
            key={`filter-${col}`}
            value={filterValue}
            options={get(optionColumnValues, col, [])}
            onChange={(newValue) => updateFilter(col, newValue, true)}
            placeholder="Select..."
            fieldName={headerNames[col] || formatHeaderName(col)}
          />
        );
      } else if (get(colType, 'isBoolean')) {
        elements[col] = (
          <div key={`filter-${col}`} className="flex items-center justify-center">
            <CustomTriStateCheckbox
              value={filterValue}
              onChange={(newValue) => updateFilter(col, newValue, true)}
            />
          </div>
        );
      } else if (get(colType, 'isDate')) {
        elements[col] = (
          <DateRangeFilter
            key={`filter-${col}`}
            value={filterValue}
            onChange={(newValue) => updateFilter(col, newValue, true)}
          />
        );
      } else if (get(colType, 'isNumeric')) {
        elements[col] = (
          <input
            key={`filter-${col}`}
            type="text"
            value={filterValue || ''}
            onChange={(e) => updateFilter(col, e.target.value || null, false)}
            onBlur={(e) => {
              debouncedFilterUpdate.cancel();
              updateFilter(col, e.target.value || null, true);
            }}
            placeholder="<, >, <=, >=, =, <>"
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            title="Numeric filters: <10, >10, <=10, >=10, =10, 10<>20 (range)"
          />
        );
      } else {
        elements[col] = (
          <input
            key={`filter-${col}`}
            type="text"
            value={filterValue || ''}
            onChange={(e) => updateFilter(col, e.target.value || null, false)}
            onBlur={(e) => {
              debouncedFilterUpdate.cancel();
              updateFilter(col, e.target.value || null, true);
            }}
            placeholder="Search..."
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        );
      }
    });
    return elements;
  }, [enableFilter, columns, columnTypes, multiselectColumns, filters, optionColumnValues, formatHeaderName, updateFilter, debouncedFilterUpdate]);

  const getFilterElement = useCallback((col) => {
    return filterElements[col] || null;
  }, [filterElements]);

  const isTruthyBoolean = useCallback((value) => {
    return value === true || value === 1 || value === '1';
  }, []);

  const renderCell = useCallback((rowData, col, isGroupHeader = false, isGroupFooter = false, groupValue = null, groupRows = null, isInnerGroupHeader = false, innerGroupValue = null, innerGroupRows = null, outerGroupValue = null, isInnerExpanded = false, itemIsExpanded = null) => {
    const colType = get(columnTypes, col);
    const isBooleanCol = get(colType, 'isBoolean', false);
    const isDateCol = get(colType, 'isDate', false);
    const isNumericCol = get(colType, 'isNumeric', false);
    const isRed = includes(redFields, col);
    const isGreen = includes(greenFields, col);
    const colorClass = isRed ? 'text-red-600' : isGreen ? 'text-green-600' : '';

    // Optimize lookup - try to find index more efficiently
    let originalIndex = -1;
    // For grouped data, index is passed, for regular data use findIndex as fallback
    if (isGroupHeader || isGroupFooter) {
      // Index should be passed from parent, but fallback to findIndex
      originalIndex = sortedData.findIndex((r) => r === rowData);
    } else {
      originalIndex = sortedData.findIndex((r) => r === rowData);
    }
    const shouldEmptyGroupByField = originalIndex !== -1 && emptyGroupByFieldRows.has(originalIndex);
    const isIndented = originalIndex !== -1 && indentedRows.has(originalIndex);

    // Handle group footer rows
    if (isGroupFooter) {
      if (col === groupByField || col === innerGroupByField) {
        return <div></div>;
      }

      if (groupRows && !isEmpty(groupRows)) {
        const values = filter(
          groupRows.map((row) => get(row, col)),
          (val) => !isNil(val)
        );

        if (!isEmpty(values) && get(colType, 'isNumeric') && !get(colType, 'isDate')) {
          const sum = sumBy(values, (val) => {
            const numVal = isNumber(val) ? val : toNumber(val);
            return _isNaN(numVal) ? 0 : numVal;
          });
          return (
            <div className={`font-medium ${isNumericCol ? 'text-right' : 'text-left'} ${colorClass}`}>
              {formatCellValue(sum, colType)}
            </div>
          );
        }
      }

      return <div></div>;
    }

    if (col === groupByField && shouldEmptyGroupByField && !isGroupHeader) {
      return <div></div>;
    }

    if (isGroupHeader) {
      if (col === groupByField) {
        const groupValue = get(rowData, groupByField);
        const groupValueFormatted = formatCellValue(groupValue, colType);
        // Use the stored isExpanded value if available, otherwise calculate it
        const expanded = itemIsExpanded !== null ? itemIsExpanded : isGroupExpanded(groupValue);

        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleGroup(rowData)}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
            >
              <i className={`pi ${expanded ? 'pi-chevron-down' : 'pi-chevron-right'} text-xs`}></i>
            </button>
            <span className="font-semibold text-gray-900">
              {groupValueFormatted}
            </span>
          </div>
        );
      }

      if (col === innerGroupByField) {
        const groupValue = get(rowData, groupByField);
        const groupRows = getGroupRows(groupValue);
        const groupCount = groupRows.length;

        return (
          <div className="text-gray-600">
            ({groupCount} {groupCount === 1 ? 'row' : 'rows'})
          </div>
        );
      }

      // Hide string and boolean columns (except grouping columns) when grouped
      if (get(colType, 'isBoolean') || (!get(colType, 'isNumeric') && !get(colType, 'isDate'))) {
        // Only show if it's the grouping column
        if (col !== groupByField && col !== innerGroupByField) {
          return <div></div>;
        }
      }

      // Calculate aggregated values for collapsed groups
      const groupValue = get(rowData, groupByField);
      const groupRows = getGroupRows(groupValue);
      const isExpanded = isGroupExpanded(groupValue);

      if (!isExpanded) {
        const values = filter(
          groupRows.map((row) => get(row, col)),
          (val) => !isNil(val)
        );

        if (!isEmpty(values) && get(colType, 'isNumeric') && !get(colType, 'isDate')) {
          const sum = sumBy(values, (val) => {
            const numVal = isNumber(val) ? val : toNumber(val);
            return _isNaN(numVal) ? 0 : numVal;
          });
          return (
            <div className={`font-medium ${isNumericCol ? 'text-right' : 'text-left'} ${colorClass}`}>
              {formatCellValue(sum, colType)}
            </div>
          );
        }
      }

      return <div></div>;
    }

    // Handle inner group headers - show as aggregated line items
    if (isInnerGroupHeader) {
      if (col === innerGroupByField) {
        const innerGroupValueFormatted = formatCellValue(innerGroupValue, colType);
        const innerGroupCount = innerGroupRows ? innerGroupRows.length : 0;

        return (
          <div>
            <div className="font-medium text-gray-800">
              {innerGroupValueFormatted}
            </div>
            <div className="text-gray-600 text-sm">
              ({innerGroupCount} {innerGroupCount === 1 ? 'row' : 'rows'})
            </div>
          </div>
        );
      }

      if (col === groupByField) {
        return <div></div>;
      }

      // Hide string and boolean columns (except grouping columns) when grouped
      if (get(colType, 'isBoolean') || (!get(colType, 'isNumeric') && !get(colType, 'isDate'))) {
        // Only show if it's the grouping column
        if (col !== groupByField && col !== innerGroupByField) {
          return <div></div>;
        }
      }

      // Calculate and show aggregated values for inner groups
      if (innerGroupRows && !isEmpty(innerGroupRows)) {
        const values = filter(
          innerGroupRows.map((row) => get(row, col)),
          (val) => !isNil(val)
        );

        if (!isEmpty(values) && get(colType, 'isNumeric') && !get(colType, 'isDate')) {
          const sum = sumBy(values, (val) => {
            const numVal = isNumber(val) ? val : toNumber(val);
            return _isNaN(numVal) ? 0 : numVal;
          });
          return (
            <div className={`font-medium ${isNumericCol ? 'text-right' : 'text-left'} ${colorClass}`}>
              {formatCellValue(sum, colType)}
            </div>
          );
        }
      }

      return <div></div>;
    }

    const value = get(rowData, col);

    if (isBooleanCol) {
      const isTruthy = isTruthyBoolean(value);
      return (
        <div className="flex items-center justify-center">
          {isTruthy ? (
            <i className="pi pi-check-circle text-green-600 text-lg" title="Yes" />
          ) : (
            <i className="pi pi-times-circle text-red-500 text-lg" title="No" />
          )}
        </div>
      );
    }

    if (isDateCol) {
      const formatted = formatDateValue(value);
      return (
        <div className={`text-xs sm:text-sm truncate text-left ${colorClass}`} title={formatted}>
          {formatted}
        </div>
      );
    }

    return (
      <div
        className={`text-xs sm:text-sm truncate ${isNumericCol ? 'text-right' : 'text-left'} ${colorClass}`}
        title={formatCellValue(value, colType)}
      >
        {formatCellValue(value, colType)}
      </div>
    );
  }, [columnTypes, formatCellValue, groupByField, innerGroupByField, sortedData, emptyGroupByFieldRows, indentedRows, redFields, greenFields, isTruthyBoolean, isGroupExpanded, getGroupRows, toggleGroup]);

  const renderFooterCell = useCallback((col, isFirstColumn = false) => {
    if (!enableSummation) return null;

    const colType = get(columnTypes, col);

    if (get(colType, 'isDate')) {
      return isFirstColumn ? (
        <div className="text-left">
          <strong>Total</strong>
        </div>
      ) : null;
    }

    const sum = get(calculateSums, col);
    const hasSum = !isNil(sum) && !get(colType, 'isBoolean');

    const isRedField = includes(redFields, col);
    const isGreenField = includes(greenFields, col);
    const colorClass = isRedField ? 'text-red-600' : isGreenField ? 'text-green-600' : '';

    if (isFirstColumn) {
      if (hasSum) {
        const formattedSum = sum % 1 === 0
          ? sum.toLocaleString('en-US')
          : sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (
          <div className="text-left">
            <strong className={colorClass}>Total: {formattedSum}</strong>
          </div>
        );
      }
      return (
        <div className="text-left">
          <strong>Total</strong>
        </div>
      );
    }

    if (get(colType, 'isBoolean')) return null;
    if (isNil(sum)) return null;

    const formattedSum = sum % 1 === 0
      ? sum.toLocaleString('en-US')
      : sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (
      <div className="text-right">
        <strong className={colorClass}>{formattedSum}</strong>
      </div>
    );
  }, [enableSummation, columnTypes, calculateSums, redFields, greenFields]);

  const onPageChange = (event) => {
    setFirst(event.first);
    setRows(event.rows);
  };

  const exportToXLSX = useCallback(() => {
    const exportData = sortedData.map((row) => {
      const exportRow = {};
      columns.forEach((col) => {
        const value = get(row, col);
        const colType = get(columnTypes, col);

        const headerName = headerNames[col] || formatHeaderName(col);
        if (isNil(value)) {
          exportRow[headerName] = '';
        } else if (get(colType, 'isBoolean')) {
          exportRow[headerName] = isTruthyBoolean(value) ? 'Yes' : 'No';
        } else if (get(colType, 'isDate')) {
          exportRow[headerName] = formatDateValue(value);
        } else {
          exportRow[headerName] = formatCellValue(value, colType);
        }
      });
      return exportRow;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `export_${dateStr}.xlsx`;

    XLSX.writeFile(wb, filename);
  }, [sortedData, columns, columnTypes, headerNames, formatHeaderName, formatCellValue, isTruthyBoolean]);

  const handleTableScroll = useCallback((e) => {
    if (tableRef.current) {
      setTableScrollLeft(e.target.scrollLeft);
    }
  }, []);

  if (isEmpty(safeData)) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <i className="pi pi-inbox text-4xl text-gray-400 mb-4"></i>
        <p className="text-gray-600 font-medium">No data available</p>
        <p className="text-sm text-gray-500 mt-1">Please check your data source</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {(!enableSort || !enableFilter || !enableSummation) && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {!enableSort && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md">
              <i className="pi pi-info-circle mr-1"></i>
              Sorting disabled
            </span>
          )}
          {!enableFilter && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md">
              <i className="pi pi-info-circle mr-1"></i>
              Filtering disabled
            </span>
          )}
          {!enableSummation && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md">
              <i className="pi pi-info-circle mr-1"></i>
              Summation disabled
            </span>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center justify-end">
        <button
          onClick={exportToXLSX}
          disabled={isEmpty(sortedData)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          title="Export to Excel"
        >
          <i className="pi pi-file-excel"></i>
          <span>Export XLSX</span>
        </button>
      </div>

      {enableFilter && !isEmpty(activeFilters) && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-600 mr-1">Active Filters:</span>
            {activeFilters.map(({ column, formattedValue }) => (
              <div
                key={column}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
              >
                <span>
                  {headerNames[column] || formatHeaderName(column)}: {formattedValue}
                </span>
                <button
                  onClick={() => clearFilter(column)}
                  className="ml-1 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                  title="Remove filter"
                  type="button"
                >
                  <i className="pi pi-times text-[10px]"></i>
                </button>
              </div>
            ))}
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-xs font-medium hover:bg-red-200 transition-colors"
              title="Clear all filters"
              type="button"
            >
              <i className="pi pi-times-circle text-xs"></i>
              <span>Clear All</span>
            </button>
          </div>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden w-full">
        <div
          className="overflow-auto"
          style={{ maxHeight: scrollable ? scrollHeightValue : 'none' }}
          onScroll={handleTableScroll}
          ref={tableRef}
        >
          <table
            key={`table-${groupByField || 'none'}-${innerGroupByField || 'none'}`}
            className="w-full border-collapse"
          >
            <thead className="bg-gray-50" style={{ position: 'sticky', top: '0px', zIndex: 25 }}>
              <tr>
                {frozenCols.filter(col => {
                  // Hide string, boolean, and date columns when grouped, except grouping columns
                  if (groupByField || innerGroupByField) {
                    const colType = get(columnTypes, col);
                    const isBoolean = get(colType, 'isBoolean', false);
                    const isDate = get(colType, 'isDate', false);
                    const isString = !get(colType, 'isNumeric', false) && !isDate && !isBoolean;
                    if ((isBoolean || isString || isDate) && col !== groupByField && col !== innerGroupByField) {
                      return false;
                    }
                  }
                  return true;
                }).map((col, index) => {
                  const colType = get(columnTypes, col);
                  const isNumericCol = get(colType, 'isNumeric', false);
                  const isFirstColumn = index === 0;
                  const colWidth = get(calculateColumnWidths, col, 120);
                  const minColWidth = Math.max(colWidth, 150);

                  // Calculate cumulative left position based on previous visible frozen columns' widths
                  const visibleFrozenCols = frozenCols.filter(c => {
                    if (groupByField || innerGroupByField) {
                      const cType = get(columnTypes, c);
                      const isBoolean = get(cType, 'isBoolean', false);
                      const isDate = get(cType, 'isDate', false);
                      const isString = !get(cType, 'isNumeric', false) && !isDate && !isBoolean;
                      if ((isBoolean || isString || isDate) && c !== groupByField && c !== innerGroupByField) {
                        return false;
                      }
                    }
                    return true;
                  });
                  let leftPosition = 0;
                  for (let i = 0; i < index; i++) {
                    const prevCol = visibleFrozenCols[i];
                    const prevColWidth = get(calculateColumnWidths, prevCol, 120);
                    const prevMinColWidth = Math.max(prevColWidth, 150);
                    leftPosition += prevMinColWidth;
                  }

                  // Remove right border for frozen columns except the last one to prevent gaps
                  const isLastFrozen = index === visibleFrozenCols.length - 1;
                  const borderClass = isLastFrozen
                    ? 'border border-gray-200'
                    : 'border-t border-b border-l border-gray-200';

                  return (
                    <th
                      key={`frozen-${col}`}
                      className={`${isMobile ? 'border border-gray-200' : borderClass} px-3 py-2 text-left font-semibold text-xs sm:text-sm text-gray-700 bg-gray-50`}
                      style={{
                        minWidth: `${minColWidth}px`,
                        width: `${minColWidth}px`,
                        maxWidth: `${minColWidth}px`,
                        ...(isMobile ? {} : {
                          position: 'sticky',
                          top: '0px',
                          left: `${leftPosition}px`,
                          zIndex: 30,
                        }),
                        backgroundColor: '#f9fafb'
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{headerNames[col]}</span>
                        {enableSort && (
                          <button
                            type="button"
                            onClick={() => handleSort(col)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            title="Sort"
                          >
                            {getSortIcon(col)}
                          </button>
                        )}
                      </div>
                      {enableFilter && (
                        <div className="mt-2">
                          {getFilterElement(col)}
                        </div>
                      )}
                    </th>
                  );
                })}
                {regularCols.filter(col => {
                  // Hide string, boolean, and date columns when grouped, except grouping columns
                  if (groupByField || innerGroupByField) {
                    const colType = get(columnTypes, col);
                    const isBoolean = get(colType, 'isBoolean', false);
                    const isDate = get(colType, 'isDate', false);
                    const isString = !get(colType, 'isNumeric', false) && !isDate && !isBoolean;
                    if ((isBoolean || isString || isDate) && col !== groupByField && col !== innerGroupByField) {
                      return false;
                    }
                  }
                  return true;
                }).map((col) => {
                  const colType = get(columnTypes, col);
                  const isNumericCol = get(colType, 'isNumeric', false);
                  const colWidth = get(calculateColumnWidths, col, 120);

                  return (
                    <th
                      key={col}
                      className="border border-gray-200 px-3 py-2 text-left font-semibold text-xs sm:text-sm text-gray-700 bg-gray-50"
                      style={{
                        minWidth: `${colWidth}px`,
                        width: `${colWidth}px`,
                        maxWidth: `${get(calculateColumnWidths, col, 400)}px`
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{headerNames[col]}</span>
                        {enableSort && (
                          <button
                            type="button"
                            onClick={() => handleSort(col)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            title="Sort"
                          >
                            {getSortIcon(col)}
                          </button>
                        )}
                      </div>
                      {enableFilter && (
                        <div className="mt-2">
                          {getFilterElement(col)}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayData.map((item, rowIndex) => {
                // Generate unique key based on row type and index
                let keySuffix = '';
                if (item.isGroupHeader) {
                  keySuffix = 'header';
                } else if (item.isGroupFooter) {
                  keySuffix = 'footer';
                } else if (item.isGroupRow) {
                  keySuffix = 'grouprow';
                } else {
                  keySuffix = 'regular';
                }
                const uniqueKey = `row-${item.index}-${keySuffix}-${rowIndex}`;

                return (
                  <TableRow
                    key={uniqueKey}
                    item={item}
                    rowIndex={rowIndex}
                    frozenCols={frozenCols}
                    regularCols={regularCols}
                    columnTypes={columnTypes}
                    calculateColumnWidths={calculateColumnWidths}
                    renderCell={renderCell}
                    renderFooterCell={renderFooterCell}
                    isMobile={isMobile}
                    groupByField={groupByField}
                    innerGroupByField={innerGroupByField}
                  />
                );
              })}
              {enableSummation && (
                <TableRow
                  key="footer-row"
                  item={{ index: -1 }}
                  rowIndex={-1}
                  frozenCols={frozenCols}
                  regularCols={regularCols}
                  columnTypes={columnTypes}
                  calculateColumnWidths={calculateColumnWidths}
                  renderCell={renderCell}
                  renderFooterCell={renderFooterCell}
                  isFooter={true}
                  isMobile={isMobile}
                  groupByField={groupByField}
                  innerGroupByField={innerGroupByField}
                />
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <CustomPaginator
          first={first}
          rows={rows}
          totalRecords={groupByField ? groupList.length : sortedData.length}
          isGrouped={!!groupByField}
          rowsPerPageOptions={rowsPerPageOptions}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}
