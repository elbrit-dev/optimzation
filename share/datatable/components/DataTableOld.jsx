'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';
import { Paginator } from 'primereact/paginator';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import * as XLSX from 'xlsx';
import {
  isNil,
  isNumber,
  isFinite as _isFinite,
  isEmpty,
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
  values,
} from 'lodash';
import { getDataKeys, getDataValue } from '../utils/dataAccessUtils';
import { computeReportColumnsStructure, generateReportHeaderGroup, getMetricLabel, getReportColumns } from '../utils/reportRenderingUtils';
import { exportReportToXLSX } from '../utils/reportExportUtils';

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
  // Explicitly reject 0, empty strings, and small numbers
  if (value === 0 || value === '0' || value === '') return false;
  if (isDate(value)) return true;
  if (isNumber(value)) {
    // Check if it's a reasonable timestamp (must be > 1 year in milliseconds to avoid small numbers)
    // Minimum: Jan 1, 1980 (315532800000) to avoid false positives with small numbers
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
    // Reject pure numbers (could be IDs, quantities, etc.)
    if (/^-?\d+$/.test(trimmed)) return false;
    // Check against known patterns
    if (DATE_PATTERNS.some(pattern => pattern.test(trimmed))) {
      const parsed = new Date(trimmed);
      return !isNaN(parsed.getTime());
    }
    // Try parsing as date string (but be strict)
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      // Make sure it's not just a number or simple numeric string
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
  if (value === '' || value === 0 || value === '0') return null; // Empty or zero values
  if (isDate(value)) return value;
  if (isNumber(value)) {
    // Reject timestamps that would result in epoch (1970) or invalid dates
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
 * Format a date for display (includes time, seconds, and milliseconds if present)
 */
function formatDateValue(value) {
  if (isNil(value) || value === '' || value === 0 || value === '0') return '';
  const date = parseToDate(value);
  if (!date) return String(value ?? '');
  
  // Check what time components are present in the original value
  let hasTime = false;
  let hasSeconds = false;
  let hasMilliseconds = false;
  
  if (isString(value)) {
    const trimmed = trim(value);
    // Check for milliseconds (ISO format with milliseconds: .123 or .123Z)
    hasMilliseconds = /\.\d{1,3}Z?$/.test(trimmed) || /\.\d{1,3}[+-]/.test(trimmed);
    // Check for seconds
    hasSeconds = /:\d{2}(\.|Z|[+-]|$)/.test(trimmed) || /:\d{2}:\d{2}/.test(trimmed);
    // Check for time (hours:minutes)
    hasTime = /T\d{2}:\d{2}/.test(trimmed) || /\d{1,2}:\d{2}/.test(trimmed);
  } else {
    // For numbers and Date objects, check actual time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const milliseconds = date.getMilliseconds();
    
    hasTime = hours !== 0 || minutes !== 0 || seconds !== 0 || milliseconds !== 0;
    hasSeconds = seconds !== 0 || milliseconds !== 0;
    hasMilliseconds = milliseconds !== 0;
  }
  
  if (!hasTime) {
    // Format with date only
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
  
  // Build format options based on what's present
  const formatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  
  if (hasSeconds) {
    formatOptions.second = '2-digit';
  }
  
  // Format with date and time (seconds included if present)
  let formatted = date.toLocaleString('en-US', formatOptions);
  
  // Add milliseconds if present (toLocaleString doesn't support milliseconds directly)
  if (hasMilliseconds) {
    const ms = date.getMilliseconds();
    // Insert milliseconds after seconds
    if (hasSeconds) {
      formatted = formatted.replace(/(:\d{2})/, `$1.${String(ms).padStart(3, '0')}`);
    } else {
      formatted += `.${String(ms).padStart(3, '0')}`;
    }
  }
  
  return formatted;
}

/**
 * Parse numeric filter expression
 * Supports: <10, >10, <=10, >=10, =10, 10 <> 20 (range)
 * Also handles spaces: < 10, > 10, <= 10, >= 10, = 10, 10 <> 20
 * Supports +/- signs: < -10, < - 10, < +10, < + 10
 */
function parseNumericFilter(filterValue) {
  if (isNil(filterValue) || filterValue === '') return null;

  const str = trim(String(filterValue));

  // Number pattern that allows optional +/- with space: -10, - 10, +10, + 10, 10
  const numPattern = '([+-]?\\s*\\d+\\.?\\d*)';

  // Helper to parse number with potential space after +/-
  const parseNum = (numStr) => {
    const cleaned = numStr.replace(/\s+/g, '');
    return toNumber(cleaned);
  };

  // Range: "10 <> 20" or "10<>20" or "-10 <> 20" or "- 10 <> - 20"
  const rangeRegex = new RegExp(`^${numPattern}\\s*<>\\s*${numPattern}$`);
  const rangeMatch = str.match(rangeRegex);
  if (rangeMatch) {
    const min = parseNum(rangeMatch[1]);
    const max = parseNum(rangeMatch[2]);
    if (!_isNaN(min) && !_isNaN(max)) {
      return { type: 'range', min: Math.min(min, max), max: Math.max(min, max) };
    }
  }

  // Less than or equal: "<=10" or "<= 10" or "<= -10" or "<= - 10"
  const lteRegex = new RegExp(`^<=\\s*${numPattern}$`);
  const lteMatch = str.match(lteRegex);
  if (lteMatch) {
    const num = parseNum(lteMatch[1]);
    if (!_isNaN(num)) return { type: 'lte', value: num };
  }

  // Greater than or equal: ">=10" or ">= 10" or ">= -10"
  const gteRegex = new RegExp(`^>=\\s*${numPattern}$`);
  const gteMatch = str.match(gteRegex);
  if (gteMatch) {
    const num = parseNum(gteMatch[1]);
    if (!_isNaN(num)) return { type: 'gte', value: num };
  }

  // Less than: "<10" or "< 10" or "< -10" or "< - 10"
  const ltRegex = new RegExp(`^<\\s*${numPattern}$`);
  const ltMatch = str.match(ltRegex);
  if (ltMatch) {
    const num = parseNum(ltMatch[1]);
    if (!_isNaN(num)) return { type: 'lt', value: num };
  }

  // Greater than: ">10" or "> 10" or "> -10"
  const gtRegex = new RegExp(`^>\\s*${numPattern}$`);
  const gtMatch = str.match(gtRegex);
  if (gtMatch) {
    const num = parseNum(gtMatch[1]);
    if (!_isNaN(num)) return { type: 'gt', value: num };
  }

  // Equals: "=10" or "= 10" or "= -10" or "= - 10"
  const eqRegex = new RegExp(`^=\\s*${numPattern}$`);
  const eqMatch = str.match(eqRegex);
  if (eqMatch) {
    const num = parseNum(eqMatch[1]);
    if (!_isNaN(num)) return { type: 'eq', value: num };
  }

  // Plain number (treat as contains/text search for partial match)
  const plainNumRegex = new RegExp(`^${numPattern}$`);
  const plainMatch = str.match(plainNumRegex);
  if (plainMatch) {
    const num = parseNum(plainMatch[1]);
    if (!_isNaN(num)) {
      return { type: 'contains', value: str.replace(/\s+/g, '') };
    }
  }

  // Not a valid numeric filter, treat as text
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
      // For plain numbers, do a string contains search
      return includes(String(cellValue ?? ''), parsedFilter.value);
    case 'text':
    default:
      // Fallback to text search
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

  // Normalize to start/end of day for comparison
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

function CustomTriStateCheckbox({ value, onChange }) {
  const handleClick = () => {
    if (value === null) {
      onChange(true);
    } else if (value === true) {
      onChange(false);
    } else {
      onChange(null);
    }
  };

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
}

function IconOnlyMultiselectFilter({ value, options, onChange, placeholder = "Select...", fieldName, itemLabel = "Filter", icon = "pi-list" }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  // Use local state for selected values - only apply to parent on blur
  const [localSelectedValues, setLocalSelectedValues] = useState(value || []);
  const [mounted, setMounted] = useState(false);
  
  // Sync local state when value prop changes (from outside)
  useEffect(() => {
    setLocalSelectedValues(value || []);
  }, [value]);

  // Ensure portal target exists
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position before rendering to avoid flash
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const calculatePosition = () => {
      if (!triggerRef.current) return;

      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const dropdownWidth = 224; // w-56 = 14rem = 224px
      const dropdownHeight = 300; // Approximate max height
      const gap = 4; // mt-1 = 4px

      let left = rect.left;
      let top = rect.bottom + gap;

      // Adjust horizontal position if dropdown would overflow right
      if (left + dropdownWidth > viewportWidth) {
        left = Math.max(8, viewportWidth - dropdownWidth - 8);
      }

      // Adjust horizontal position if dropdown would overflow left
      if (left < 8) {
        left = 8;
      }

      // Adjust vertical position if dropdown would overflow bottom
      if (top + dropdownHeight > viewportHeight) {
        // Try to show above the trigger
        const spaceAbove = rect.top;
        if (spaceAbove > dropdownHeight) {
          top = rect.top - dropdownHeight - gap;
        } else {
          // Not enough space above, position at bottom of viewport
          top = viewportHeight - dropdownHeight - 8;
        }
      }

      setPosition({
        top,
        left,
        width: Math.max(rect.width, dropdownWidth)
      });
    };

    calculatePosition();

    // Update position on scroll and resize
    const updatePosition = debounce(calculatePosition, 10);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  // Close dropdown when clicking outside and apply filters
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        // Apply filters when closing
        onChange(localSelectedValues);
        setIsOpen(false);
      }
    };

    // Use capture phase to catch clicks before they bubble
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [isOpen, localSelectedValues, onChange]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const term = toLower(searchTerm);
    return filter(options, opt => includes(toLower(String(opt.label)), term));
  }, [options, searchTerm]);

  const toggleValue = (val) => {
    // Update local state only, don't apply filter yet
    if (includes(localSelectedValues, val)) {
      setLocalSelectedValues(filter(localSelectedValues, v => v !== val));
    } else {
      setLocalSelectedValues([...localSelectedValues, val]);
    }
  };

  const clearAll = () => {
    // Update local state only
    setLocalSelectedValues([]);
    setSearchTerm('');
  };

  const selectAll = () => {
    // Update local state only
    setLocalSelectedValues(options.map(o => o.value));
  };

  const selectedCount = localSelectedValues.length;
  const hasSelection = !isEmpty(localSelectedValues);

  const dropdownContent = isOpen && mounted ? (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        minWidth: '200px',
        maxWidth: '400px'
      }}
    >
      {/* Search Input */}
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

      {/* Quick Actions */}
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
        {!isEmpty(localSelectedValues) && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">{localSelectedValues.length} selected</span>
          </>
        )}
      </div>

      {/* Options List */}
      <div className="max-h-40 overflow-y-auto">
        {isEmpty(filteredOptions) ? (
          <div className="px-3 py-3 text-center text-xs text-gray-500">
            No matches
          </div>
        ) : (
          filteredOptions.map(opt => {
            const isSelected = includes(localSelectedValues, opt.value);
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

      {/* Footer */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
        Total {fieldName || 'fields'}: {options.length}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="icon-only-multiselect-container relative">
        {/* Icon-only Trigger Button with Badge */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`relative p-2 rounded-lg transition-colors flex items-center justify-center ${hasSelection
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          title={hasSelection ? `${selectedCount} ${itemLabel}${selectedCount !== 1 ? 's' : ''} selected` : placeholder}
        >
          <i className={`pi ${icon} text-base`}></i>
          {hasSelection && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
              {selectedCount > 99 ? '99+' : selectedCount}
            </span>
          )}
        </button>
      </div>

      {/* Portal dropdown */}
      {mounted && createPortal(dropdownContent, document.body)}
    </>
  );
}

function MultiselectFilter({ value, options, onChange, placeholder = "Select...", fieldName, itemLabel = "Filter" }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  // Use local state for selected values - only apply to parent on blur
  const [localSelectedValues, setLocalSelectedValues] = useState(value || []);
  const [mounted, setMounted] = useState(false);
  
  // Sync local state when value prop changes (from outside)
  useEffect(() => {
    setLocalSelectedValues(value || []);
  }, [value]);

  // Ensure portal target exists
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position before rendering to avoid flash
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const calculatePosition = () => {
      if (!triggerRef.current) return;

      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const dropdownWidth = 224; // w-56 = 14rem = 224px
      const dropdownHeight = 300; // Approximate max height
      const gap = 4; // mt-1 = 4px

      let left = rect.left;
      let top = rect.bottom + gap;

      // Adjust horizontal position if dropdown would overflow right
      if (left + dropdownWidth > viewportWidth) {
        left = Math.max(8, viewportWidth - dropdownWidth - 8);
      }

      // Adjust horizontal position if dropdown would overflow left
      if (left < 8) {
        left = 8;
      }

      // Adjust vertical position if dropdown would overflow bottom
      if (top + dropdownHeight > viewportHeight) {
        // Try to show above the trigger
        const spaceAbove = rect.top;
        if (spaceAbove > dropdownHeight) {
          top = rect.top - dropdownHeight - gap;
        } else {
          // Not enough space above, position at bottom of viewport
          top = viewportHeight - dropdownHeight - 8;
        }
      }

      setPosition({
        top,
        left,
        width: Math.max(rect.width, dropdownWidth)
      });
    };

    calculatePosition();

    // Update position on scroll and resize
    const updatePosition = debounce(calculatePosition, 10);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  // Close dropdown when clicking outside and apply filters
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        // Apply filters when closing
        onChange(localSelectedValues);
        setIsOpen(false);
      }
    };

    // Use capture phase to catch clicks before they bubble
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [isOpen, localSelectedValues, onChange]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const term = toLower(searchTerm);
    return filter(options, opt => includes(toLower(String(opt.label)), term));
  }, [options, searchTerm]);

  const toggleValue = (val) => {
    // Update local state only, don't apply filter yet
    if (includes(localSelectedValues, val)) {
      setLocalSelectedValues(filter(localSelectedValues, v => v !== val));
    } else {
      setLocalSelectedValues([...localSelectedValues, val]);
    }
  };

  const clearAll = () => {
    // Update local state only
    setLocalSelectedValues([]);
    setSearchTerm('');
  };

  const selectAll = () => {
    // Update local state only
    setLocalSelectedValues(options.map(o => o.value));
  };

  const dropdownContent = isOpen && mounted ? (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        minWidth: '200px',
        maxWidth: '400px'
      }}
    >
      {/* Search Input */}
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

      {/* Quick Actions */}
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
        {!isEmpty(localSelectedValues) && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">{localSelectedValues.length} selected</span>
          </>
        )}
      </div>

      {/* Options List */}
      <div className="max-h-40 overflow-y-auto">
        {isEmpty(filteredOptions) ? (
          <div className="px-3 py-3 text-center text-xs text-gray-500">
            No matches
          </div>
        ) : (
          filteredOptions.map(opt => {
            const isSelected = includes(localSelectedValues, opt.value);
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

      {/* Footer */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
        Total {fieldName || 'fields'}: {options.length}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="multiselect-filter-container">
        {/* Trigger Button */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between px-2 py-1.5 text-xs border rounded bg-white hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${isEmpty(localSelectedValues) ? 'border-gray-300 text-gray-500' : 'border-blue-400 text-blue-700 bg-blue-50'
            }`}
        >
          <span className="truncate">
            {isEmpty(localSelectedValues) ? placeholder : `${localSelectedValues.length} ${itemLabel}${localSelectedValues.length !== 1 ? 's' : ''}`}
          </span>
          <i className={`pi ${isOpen ? 'pi-chevron-up' : 'pi-chevron-down'} text-[10px] ml-1 shrink-0`}></i>
        </button>
      </div>

      {/* Portal dropdown */}
      {mounted && createPortal(dropdownContent, document.body)}
    </>
  );
}

function DateRangeFilter({ value, onChange }) {
  const handleChange = (e) => {
    onChange(e.value);
  };

  const handleClear = () => {
    onChange(null);
  };

  const hasValue = value && (value[0] || value[1]);

  return (
    <div className="date-range-filter flex items-center gap-1">
      <Calendar
        value={value}
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

export default function DataTableComponent({
  data,
  rowsPerPageOptions = [10, 25, 50, 100],
  defaultRows = 10,
  scrollable = true,
  scrollHeight,
  enableSort = true,
  enableFilter = true,
  enableSummation = true,
  enableDivideBy1Lakh = false, // Divide all numeric values by 100,000 (1 Lakh)
  textFilterColumns = [], // Fields that should use text search box instead of multiselect
  visibleColumns = [], // Fields that should be visible (empty array means show all)
  onVisibleColumnsChange, // Callback for when visible columns change
  redFields = [],
  greenFields = [],
  outerGroupField = null, // Field to group by for row expansion
  innerGroupField = null, // Field to aggregate by within each outer group
  onOuterGroupClick, // Callback when outer group cell is clicked: (rowData, column, value) => void
  onInnerGroupClick, // Callback when inner group cell is clicked: (rowData, column, value) => void
  enableCellEdit = false, // Enable cell editing
  onCellEditComplete, // Callback when cell edit is complete: (e) => void, where e = { rowData, newValue, field, originalEvent, oldValue }
  isCellEditable, // Function to determine if a cell is editable: (rowData, field) => boolean
  nonEditableColumns = [], // Array of column names that should not be editable
  percentageColumns = [], // Array of { columnName: string, targetField: string, valueField: string, beforeColumn?: string | null }
  enableFullscreenDialog = true, // Enable/disable fullscreen dialog feature
      tableName = 'table', // Table name for identification (e.g., 'main', 'dialog', 'sidebar')
  columnTypes: columnTypesOverride = {}, // Object with column names as keys and type strings as values: {columnName: "date" | "number" | "boolean" | "string"}
  // Report mode props
  enableBreakdown = false,
  reportData = null,
  columnGroupBy = 'values',
  dateColumn = null,
  breakdownType = 'month',
  isComputingReport = false,
}) {
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(defaultRows);
  const [filters, setFilters] = useState({});
  const [scrollHeightValue, setScrollHeightValue] = useState('600px');
  const [multiSortMeta, setMultiSortMeta] = useState([]);
  const [expandedRows, setExpandedRows] = useState(null);
  const [freezeFirstColumn, setFreezeFirstColumn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const dialogRef = useRef(null);
  const scrollPositionRef = useRef(0);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  useEffect(() => {
    setRows(defaultRows);
    setFirst(0);
  }, [defaultRows]);

  useEffect(() => {
    // Only calculate scrollHeight if scrollable is true
    if (!scrollable) {
      setScrollHeightValue(undefined);
      return;
    }

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
  }, [scrollHeight, scrollable]);

  const safeData = useMemo(() => {
    if (!Array.isArray(data) || isEmpty(data)) return [];
    return data;
  }, [data]);

  const columns = useMemo(() => {
    if (isEmpty(safeData)) return [];
    const allKeys = uniq(flatMap(safeData, (item) =>
      item && typeof item === 'object' ? getDataKeys(item) : []
    ));
    return allKeys;
  }, [safeData]);

  const isNumericValue = useCallback((value) => {
    if (isNil(value)) return false;
    return isNumber(value) || (!_isNaN(parseFloat(value)) && _isFinite(value));
  }, []);

  // Helper function to convert string type to boolean flag format
  const stringTypeToFlags = useCallback((typeString) => {
    switch(typeString) {
      case "boolean": 
        return {isBoolean: true, isNumeric: false, isDate: false, isText: false, isBinaryBoolean: false};
      case "date": 
        return {isBoolean: false, isNumeric: false, isDate: true, isText: false};
      case "number": 
        return {isBoolean: false, isNumeric: true, isDate: false, isText: false};
      case "string": 
      default: 
        return {isBoolean: false, isNumeric: false, isDate: false, isText: true};
    }
  }, []);

  const columnTypes = useMemo(() => {
    const detectedTypes = {}; // String-based types from detection
    const diagnostics = {}; // Store diagnostics for each column
    
    // In report mode, ensure report columns are treated as numeric
    // Compute report column names directly to avoid dependency on reportColumnsStructure
    if (enableBreakdown && reportData && reportData.timePeriods && reportData.metrics) {
      const { timePeriods, metrics } = reportData;
      // Generate all possible report column names (period_metric format)
      timePeriods.forEach(period => {
        metrics.forEach(metric => {
          const columnName = `${period}_${metric}`;
          detectedTypes[columnName] = 'number';
        });
      });
    }
    
    if (isEmpty(safeData)) {
      // Merge with overrides and convert to boolean flags
      const mergedTypes = { ...detectedTypes, ...columnTypesOverride };
      const result = {};
      Object.keys(mergedTypes).forEach(col => {
        result[col] = stringTypeToFlags(mergedTypes[col]);
      });
      return result;
    }

    const sampleData = take(safeData, 100);

    columns.forEach((col) => {
      let numericCount = 0;
      let dateCount = 0;
      let booleanCount = 0;
      let binaryCount = 0; // Count of 0/1 values
      let nonNullCount = 0;
      let totalCount = 0;
      const sampleValues = []; // Store sample values for debugging

      // First pass: collect raw counts
      sampleData.forEach((row) => {
        const value = getDataValue(row, col);
        totalCount++;
        if (!isNil(value)) {
          nonNullCount++;
          // Store first few non-null values for debugging
          if (sampleValues.length < 5) {
            sampleValues.push({ value, type: typeof value, stringified: String(value) });
          }
          
          if (isBoolean(value)) {
            booleanCount++;
          } else if (value === 0 || value === 1 || value === '0' || value === '1') {
            binaryCount++;
          } else if (isDateLike(value)) {
            dateCount++;
          } else if (isNumericValue(value)) {
            numericCount++;
          }
        }
      });

      // Boolean detection (strict - only true boolean values)
      const isTrueBooleanColumn = nonNullCount > 0 && booleanCount > nonNullCount * 0.7;
      const isBinaryBooleanColumn = nonNullCount > 0 && binaryCount === nonNullCount && binaryCount >= 1;
      const isBooleanColumn = isTrueBooleanColumn || isBinaryBooleanColumn;
      
      const booleanReasons = [];
      if (nonNullCount === 0) {
        booleanReasons.push('NO_NON_NULL_VALUES');
      } else {
        booleanReasons.push(`booleanCount: ${booleanCount}/${nonNullCount} (${((booleanCount / nonNullCount) * 100).toFixed(1)}%)`);
        booleanReasons.push(`binaryCount: ${binaryCount}/${nonNullCount} (${((binaryCount / nonNullCount) * 100).toFixed(1)}%)`);
        if (!isTrueBooleanColumn) {
          booleanReasons.push(`FAILED: booleanCount ${booleanCount} <= ${(nonNullCount * 0.7).toFixed(1)} (70% threshold)`);
        }
        if (!isBinaryBooleanColumn && binaryCount > 0) {
          booleanReasons.push(`FAILED: binaryCount ${binaryCount} !== nonNullCount ${nonNullCount} (not all binary)`);
        }
      }

      // Date detection (cascade: if boolean failed, check binary values as potential dates)
      let dateCountWithBinary = dateCount;
      if (!isBooleanColumn && binaryCount > 0) {
        // Check if binary values could be dates (though 0/1 are unlikely to be dates)
        sampleData.forEach((row) => {
          const value = getDataValue(row, col);
          if (!isNil(value) && (value === 0 || value === 1 || value === '0' || value === '1')) {
            if (isDateLike(value)) {
              dateCountWithBinary++;
            }
          }
        });
      }
      const isDateColumn = !isBooleanColumn && nonNullCount > 0 && dateCountWithBinary > nonNullCount * 0.7;
      
      const dateReasons = [];
      if (isBooleanColumn) {
        dateReasons.push('SKIPPED: column is boolean');
      } else if (nonNullCount === 0) {
        dateReasons.push('NO_NON_NULL_VALUES');
      } else {
        dateReasons.push(`dateCount (raw): ${dateCount}/${nonNullCount} (${((dateCount / nonNullCount) * 100).toFixed(1)}%)`);
        if (!isBooleanColumn && binaryCount > 0) {
          dateReasons.push(`dateCount (with binary): ${dateCountWithBinary}/${nonNullCount} (${((dateCountWithBinary / nonNullCount) * 100).toFixed(1)}%)`);
          dateReasons.push(`CASCADE: boolean failed, checking ${binaryCount} binary values as potential dates`);
        }
        if (!isDateColumn) {
          dateReasons.push(`FAILED: dateCount ${dateCountWithBinary} <= ${(nonNullCount * 0.7).toFixed(1)} (70% threshold)`);
        }
      }

      // Numeric detection (cascade: if boolean and date failed, include binary values as numeric)
      let numericCountWithBinary = numericCount;
      if (!isBooleanColumn && !isDateColumn && binaryCount > 0) {
        // Binary 0/1 values are numeric when boolean and date both failed
        numericCountWithBinary += binaryCount;
      }
      const isNumericColumn = !isBooleanColumn && !isDateColumn && nonNullCount > 0 && numericCountWithBinary > nonNullCount * 0.8;
      
      const numericReasons = [];
      if (isBooleanColumn) {
        numericReasons.push('SKIPPED: column is boolean');
      } else if (isDateColumn) {
        numericReasons.push('SKIPPED: column is date');
      } else if (nonNullCount === 0) {
        numericReasons.push('NO_NON_NULL_VALUES');
      } else {
        numericReasons.push(`numericCount (raw): ${numericCount}/${nonNullCount} (${((numericCount / nonNullCount) * 100).toFixed(1)}%)`);
        if (!isBooleanColumn && !isDateColumn && binaryCount > 0) {
          numericReasons.push(`numericCount (with binary): ${numericCountWithBinary}/${nonNullCount} (${((numericCountWithBinary / nonNullCount) * 100).toFixed(1)}%)`);
          numericReasons.push(`CASCADE: boolean and date failed, treating ${binaryCount} binary values as numeric`);
        }
        if (!isNumericColumn) {
          numericReasons.push(`FAILED: numericCount ${numericCountWithBinary} <= ${(nonNullCount * 0.8).toFixed(1)} (80% threshold)`);
        }
      }

      // Text/Unknown detection with reasons
      const isTextColumn = !isBooleanColumn && !isDateColumn && !isNumericColumn && nonNullCount > 0;
      const textReasons = [];
      if (isBooleanColumn) {
        textReasons.push('SKIPPED: column is boolean');
      } else if (isDateColumn) {
        textReasons.push('SKIPPED: column is date');
      } else if (isNumericColumn) {
        textReasons.push('SKIPPED: column is numeric');
      } else if (nonNullCount === 0) {
        textReasons.push('NO_NON_NULL_VALUES');
      } else {
        textReasons.push('MATCHED: none of the specific types matched');
      }

      // Store detected type as string
      let detectedTypeString = "string"; // default
      if (isBooleanColumn) {
        detectedTypeString = "boolean";
      } else if (isDateColumn) {
        detectedTypeString = "date";
      } else if (isNumericColumn) {
        detectedTypeString = "number";
      }

      detectedTypes[col] = detectedTypeString;

      // Store diagnostics
      diagnostics[col] = {
        totalCount,
        nonNullCount,
        sampleValues,
        counts: {
          boolean: booleanCount,
          binary: binaryCount,
          date: dateCount,
          dateWithBinary: dateCountWithBinary,
          numeric: numericCount,
          numericWithBinary: numericCountWithBinary
        },
        percentages: {
          boolean: nonNullCount > 0 ? (booleanCount / nonNullCount) * 100 : 0,
          binary: nonNullCount > 0 ? (binaryCount / nonNullCount) * 100 : 0,
          date: nonNullCount > 0 ? (dateCount / nonNullCount) * 100 : 0,
          dateWithBinary: nonNullCount > 0 ? (dateCountWithBinary / nonNullCount) * 100 : 0,
          numeric: nonNullCount > 0 ? (numericCount / nonNullCount) * 100 : 0,
          numericWithBinary: nonNullCount > 0 ? (numericCountWithBinary / nonNullCount) * 100 : 0
        },
        reasons: {
          boolean: booleanReasons,
          date: dateReasons,
          numeric: numericReasons,
          text: textReasons
        },
        isBinaryBoolean: isBinaryBooleanColumn
      };
    });

    // Merge detected types with prop overrides (overrides take precedence)
    const mergedTypes = { ...detectedTypes, ...columnTypesOverride };

    // Convert merged types to boolean flag format
    const result = {};
    Object.keys(mergedTypes).forEach(col => {
      const typeString = mergedTypes[col];
      const flags = stringTypeToFlags(typeString);
      
      // Preserve diagnostics and isBinaryBoolean for columns that weren't overridden
      if (diagnostics[col] && !columnTypesOverride[col]) {
        const colDiagnostics = diagnostics[col];
        result[col] = {
          ...flags,
          isBinaryBoolean: colDiagnostics.isBinaryBoolean || false,
          _diagnostics: {
            totalCount: colDiagnostics.totalCount,
            nonNullCount: colDiagnostics.nonNullCount,
            sampleValues: colDiagnostics.sampleValues,
            counts: colDiagnostics.counts,
            percentages: colDiagnostics.percentages,
            reasons: colDiagnostics.reasons
          }
        };
      } else {
        result[col] = flags;
      }
    });

    return result;
  }, [safeData, columns, isNumericValue, columnTypesOverride, stringTypeToFlags, enableBreakdown, reportData]);

  // Helper function to get percentage value for a percentage column
  const getPercentageColumnValue = useCallback((rowData, columnName) => {
    // Find the percentage column configuration
    const config = percentageColumns.find(pc => pc.columnName === columnName);
    if (!config || !config.targetField || !config.valueField) return null;

    // Get target and value from row data
    const targetValue = getDataValue(rowData, config.targetField);
    const actualValue = getDataValue(rowData, config.valueField);
    
    // Convert to numbers
    const targetNum = isNumber(targetValue) ? targetValue : (isNil(targetValue) ? null : toNumber(targetValue));
    const actualNum = isNumber(actualValue) ? actualValue : (isNil(actualValue) ? null : toNumber(actualValue));

    // Calculate percentage
    if (!isNil(targetNum) && !isNil(actualNum) && !_isNaN(targetNum) && !_isNaN(actualNum) && _isFinite(targetNum) && _isFinite(actualNum) && targetNum !== 0) {
      return (actualNum / targetNum) * 100;
    }
    
    return null;
  }, [percentageColumns]);

  // Check if any percentage columns are configured (only count columns with valid names)
  const hasPercentageColumns = useMemo(() => {
    if (isEmpty(percentageColumns) || !isArray(percentageColumns)) {
      return false;
    }
    // Only consider it active if at least one percentage column has a valid columnName
    const hasValidColumnName = percentageColumns.some(pc => pc.columnName && pc.columnName.trim() !== '');
    return hasValidColumnName;
  }, [percentageColumns]);

  // Helper function to check if a column is a percentage column
  const isPercentageColumn = useCallback((columnName) => {
    return hasPercentageColumns && percentageColumns.some(pc => pc.columnName === columnName);
  }, [hasPercentageColumns, percentageColumns]);

  // Get all percentage column names
  const percentageColumnNames = useMemo(() => {
    const result = hasPercentageColumns ? percentageColumns.map(pc => pc.columnName).filter(Boolean) : [];
    return result;
  }, [hasPercentageColumns, percentageColumns]);

  /**
   * Computes the ordered array of columns to display in the table.
   * Handles percentage column positioning based on the beforeColumn field:
   * - If beforeColumn is specified and exists, inserts the percentage column before that column
   * - If beforeColumn is outerGroupField, inserts the percentage column right after outerGroupField (outerGroupField must stay first)
   * - If beforeColumn is not specified or invalid, uses default positioning (after outerGroupField if exists, otherwise at beginning)
   * - Percentage columns are excluded from filteredColumns and inserted at their specified positions
   */
  const orderedColumns = useMemo(() => {
    if (isEmpty(columns)) return [];

    let filteredColumns = columns;

    // When grouping is active, show only numeric columns, but always include outer group field
    // Inner group field is hidden in main table (only shown in nested table)
    if (outerGroupField) {
      filteredColumns = columns.filter(col => {
        // Always include outer group field (but NOT inner group field in main table)
        if (col === outerGroupField) {
          return true;
        }
        // Exclude inner group field from main table
        if (col === innerGroupField) {
          return false;
        }
        // Otherwise, only show numeric columns
        const colType = get(columnTypes, col, {});
        return get(colType, 'isNumeric', false);
      });
    }

    // Apply visibleColumns filter if provided (and not empty)
    if (!isEmpty(visibleColumns) && isArray(visibleColumns)) {
      const visibleSet = new Set(visibleColumns);
      // Always include outer group field even if not in visibleColumns
      // Exclude inner group field from main table
      filteredColumns = filteredColumns.filter(col => {
        if (col === outerGroupField) {
          return true;
        }
        if (col === innerGroupField) {
          return false;
        }
        return visibleSet.has(col);
      });
    }

    // Get percentage column names and configurations
    const percentageColumnNamesLocal = hasPercentageColumns 
      ? percentageColumns.map(pc => pc.columnName).filter(Boolean)
      : [];

    // Start with filtered columns, excluding percentage columns themselves (they'll be inserted later)
    const nonPercentageColumns = filteredColumns.filter(
      col => !includes(percentageColumnNamesLocal, col)
    );

    // Build ordered array step by step
    const ordered = [];
    
    // Step 1: Add outerGroupField first if it exists (outerGroupField must always be first)
    if (outerGroupField && includes(filteredColumns, outerGroupField)) {
      ordered.push(outerGroupField);
    }

    // Step 2: Create a working array starting with non-percentage columns (excluding outerGroupField)
    const nonPercentageExcludingOuter = nonPercentageColumns.filter(col => col !== outerGroupField);
    let workingArray = [...nonPercentageExcludingOuter];
    
    // Step 3: Process percentage columns with beforeColumn specified
    // Insert them at the specified positions in the order they appear in percentageColumns array
    const percentageColumnsWithBeforeColumn = hasPercentageColumns
      ? percentageColumns.filter(pc => pc.columnName && pc.beforeColumn && pc.beforeColumn !== pc.columnName)
      : [];
    
    // Track which percentage columns have been inserted via beforeColumn
    const insertedPercentageColumns = new Set();
    
    // Process each percentage column with beforeColumn
    percentageColumnsWithBeforeColumn.forEach(pc => {
      const beforeCol = pc.beforeColumn;
      const pctColName = pc.columnName;
      
      // Special case: if beforeColumn is outerGroupField, we'll insert right after outerGroupField
      // Skip here, handle separately
      if (beforeCol === outerGroupField) {
        return;
      }
      
      // Skip if beforeColumn doesn't exist in filteredColumns
      if (!includes(filteredColumns, beforeCol)) {
        return;
      }
      
      // Find the index of beforeColumn in workingArray
      const beforeIndex = workingArray.indexOf(beforeCol);
      
      if (beforeIndex !== -1) {
        // Insert the percentage column before the specified column
        workingArray.splice(beforeIndex, 0, pctColName);
        insertedPercentageColumns.add(pctColName);
      }
    });

    // Step 4: Handle percentage columns that want to be before outerGroupField
    // These should go right after outerGroupField (since outerGroupField must stay first)
    const percentageColumnsBeforeOuterGroup = percentageColumnsWithBeforeColumn.filter(
      pc => pc.beforeColumn === outerGroupField && outerGroupField && includes(filteredColumns, outerGroupField)
    );
    
    const pctColsAfterOuter = percentageColumnsBeforeOuterGroup
      .map(pc => pc.columnName)
      .filter(name => name && !insertedPercentageColumns.has(name));
    
    // Insert percentage columns that should be after outerGroupField (before outerGroupField case)
    // Do this before adding workingArray so they appear right after outerGroupField
    if (pctColsAfterOuter.length > 0 && outerGroupField && includes(filteredColumns, outerGroupField)) {
      // Insert right after outerGroupField (index 0, so at index 1)
      ordered.push(...pctColsAfterOuter);
      pctColsAfterOuter.forEach(col => insertedPercentageColumns.add(col));
    }
    
    // Step 4b: Add working array to ordered (includes percentage columns with beforeColumn at their positions)
    ordered.push(...workingArray);

    // Step 5: Process remaining percentage columns (without beforeColumn or with invalid beforeColumn)
    // These go after outerGroupField if it exists, otherwise at the beginning
    if (hasPercentageColumns) {
      const remainingPercentageColumns = percentageColumns
        .filter(pc => pc.columnName && !insertedPercentageColumns.has(pc.columnName))
        .map(pc => pc.columnName);
      
      if (remainingPercentageColumns.length > 0) {
        if (outerGroupField && includes(filteredColumns, outerGroupField)) {
          // Find position after outerGroupField and any percentage columns already inserted after it
          // Count how many percentage columns are already right after outerGroupField
          let insertIndex = 1 + pctColsAfterOuter.length;
          ordered.splice(insertIndex, 0, ...remainingPercentageColumns);
        } else {
          // No outerGroupField, add remaining percentage columns at the beginning
          ordered.unshift(...remainingPercentageColumns);
        }
      }
    }

    // Remove any duplicates that might have been introduced (shouldn't happen, but safety check)
    const finalResult = [];
    const seen = new Set();
    ordered.forEach(col => {
      if (!seen.has(col)) {
        seen.add(col);
        finalResult.push(col);
      }
    });

    return finalResult;
  }, [columns, visibleColumns, outerGroupField, innerGroupField, columnTypes, hasPercentageColumns, percentageColumns]);

  const formatHeaderName = useCallback((key) => {
    // Check if it's a percentage column
    const percentageConfig = percentageColumns.find(pc => pc.columnName === key);
    if (percentageConfig) {
      return percentageConfig.columnName;
    }
    return startCase(key.split('__').join(' ').split('_').join(' '));
  }, [percentageColumns]);

  // Report mode: Pre-compute column structure (shared by header and columns)
  const reportColumnsStructure = useMemo(() => {
    if (!enableBreakdown || !reportData) {
      return null;
    }
    return computeReportColumnsStructure(reportData, columnGroupBy);
  }, [enableBreakdown, reportData, columnGroupBy]);

  // Report mode: Generate header groups and columns
  const reportHeaderGroup = useMemo(() => {
    if (!reportColumnsStructure || !reportData) {
      return null;
    }
    return generateReportHeaderGroup(reportColumnsStructure, reportData, outerGroupField, formatHeaderName);
  }, [reportColumnsStructure, reportData, outerGroupField, formatHeaderName]);

  // Report mode: Generate report columns
  const reportColumns = useMemo(() => {
    if (!reportColumnsStructure) {
      return [];
    }
    return getReportColumns(reportColumnsStructure, outerGroupField);
  }, [reportColumnsStructure, outerGroupField]);

  // Use report columns when in report mode, otherwise use orderedColumns
  const displayColumns = useMemo(() => {
    if (enableBreakdown && reportColumns.length > 0) {
      return reportColumns;
    }
    return orderedColumns;
  }, [enableBreakdown, reportColumns, orderedColumns]);

  const frozenCols = useMemo(
    () => {
      const result = isEmpty(displayColumns) ? [] : [head(displayColumns)];
      return result;
    },
    [displayColumns]
  );

  const regularCols = useMemo(
    () => {
      const result = tail(displayColumns);
      return result;
    },
    [displayColumns]
  );

  // Compute available columns for visibility selector based on mode
  const availableColumnsForVisibility = useMemo(() => {
    if (isEmpty(columns)) return [];

    // When both outerGroupField and innerGroupField are set, show only numeric columns (plus group fields)
    if (outerGroupField && innerGroupField) {
      return columns.filter(col => {
        // Always include group fields
        if (col === outerGroupField || col === innerGroupField) {
          return true;
        }
        // Include only numeric columns
        const colType = get(columnTypes, col, {});
        return get(colType, 'isNumeric', false);
      });
    }

    // Default: show all columns
    return columns;
  }, [columns, outerGroupField, innerGroupField, columnTypes]);

  const formatCellValue = useCallback((value, colType) => {
    if (isNil(value)) return '';

    // Format dates
    if (colType?.isDate) {
      return formatDateValue(value);
    }

    // Format arrays - use JSON.stringify for readable output
    if (isArray(value)) {
      return JSON.stringify(value);
    }

    if (isNumber(value)) {
      // Apply division by 1 Lakh if enabled
      const displayValue = enableDivideBy1Lakh ? value / 100000 : value;
      return displayValue % 1 === 0
        ? displayValue.toLocaleString('en-US')
        : displayValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(value);
  }, [enableDivideBy1Lakh]);

  // Compute which columns should use multiselect (all string columns by default, minus textFilterColumns)
  const multiselectColumns = useMemo(() => {
    if (isEmpty(columns) || isEmpty(columnTypes)) return [];

    // Get all string columns (non-numeric, non-boolean, non-date)
    const stringColumns = columns.filter((col) => {
      const colType = get(columnTypes, col);
      return !get(colType, 'isBoolean') &&
        !get(colType, 'isDate') &&
        !get(colType, 'isNumeric');
    });

    // Remove textFilterColumns from string columns to get multiselect columns
    const textFilterSet = new Set(textFilterColumns);
    const multiselectCols = stringColumns.filter(col => !textFilterSet.has(col));

    return multiselectCols;
  }, [columns, columnTypes, textFilterColumns]);

  // Compute unique values for multiselect columns based on filtered data
  // (excluding the current column's filter to show available options)
  const optionColumnValues = useMemo(() => {
    const values = {};
    if (isEmpty(safeData) || isEmpty(multiselectColumns)) return values;

    multiselectColumns.forEach((col) => {
      // Filter data excluding the current column's filter
      const filteredForColumn = filter(safeData, (row) => {
        if (!row || typeof row !== 'object') return false;

        // Apply all filters except the current column
        const regularColumnsPass = every(columns, (filterCol) => {
          // Skip the current column - we want all its values
          if (filterCol === col) return true;

          const filterObj = get(filters, filterCol);
          if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;

          // Handle empty arrays for multiselect
          if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;

          const cellValue = getDataValue(row, filterCol);
          const filterValue = filterObj.value;
          const colType = get(columnTypes, filterCol);
          const isMultiselectColumn = includes(multiselectColumns, filterCol);

          // Multiselect filter (multiselect columns)
          if (isMultiselectColumn && isArray(filterValue)) {
            return some(filterValue, (v) => {
              // Handle null/undefined values explicitly
              if (isNil(v) && isNil(cellValue)) return true;
              if (isNil(v) || isNil(cellValue)) return false;
              return v === cellValue || String(v) === String(cellValue);
            });
          }

          // Boolean filter (handles true/false and 1/0)
          if (get(colType, 'isBoolean')) {
            const cellIsTruthy = cellValue === true || cellValue === 1 || cellValue === '1';
            const cellIsFalsy = cellValue === false || cellValue === 0 || cellValue === '0';

            if (filterValue === true) {
              return cellIsTruthy;
            } else if (filterValue === false) {
              return cellIsFalsy;
            }
            return true;
          }

          // Date range filter
          if (get(colType, 'isDate')) {
            return applyDateFilter(cellValue, filterValue);
          }

          // Numeric filter with operators
          if (get(colType, 'isNumeric')) {
            const parsedFilter = parseNumericFilter(filterValue);
            return applyNumericFilter(cellValue, parsedFilter);
          }

          // Text filter (default)
          const strCell = toLower(String(cellValue ?? ''));
          const strFilter = toLower(String(filterValue));
          return includes(strCell, strFilter);
        });

        if (!regularColumnsPass) return false;

        // Check percentage columns if active (excluding current column)
        if (hasPercentageColumns && !isPercentageColumn(col)) {
          return every(percentageColumnNames, (targetCol) => {
            const filterObj = get(filters, targetCol);
            if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;

            // Handle empty arrays for multiselect
            if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;

            const cellValue = getPercentageColumnValue(row, targetCol);
            const filterValue = filterObj.value;

            // Use numeric filter for percentage columns
            const parsedFilter = parseNumericFilter(filterValue);
            return applyNumericFilter(cellValue, parsedFilter);
          });
        }

        return true;
      });

      // Get unique values from the filtered data for this column
      const uniqueVals = uniq(filteredForColumn.map((row) => getDataValue(row, col)));
      // Include null values explicitly - don't use compact
      const hasNull = some(uniqueVals, val => isNil(val));
      const nonNullVals = filter(uniqueVals, val => !isNil(val));
      const sortedNonNull = orderBy(nonNullVals);
      
      // Build options array with null first if it exists
      const options = [];
      if (hasNull) {
        options.push({ label: '(null)', value: null });
      }
      options.push(...sortedNonNull.map((val) => ({
        label: String(val),
        value: val,
      })));
      values[col] = options;
    });

    return values;
  }, [safeData, multiselectColumns, filters, columns, columnTypes, hasPercentageColumns, percentageColumnNames, isPercentageColumn, getPercentageColumnValue]);

  useEffect(() => {
    if (!enableFilter) {
      if (!isEmpty(filters)) {
        setFilters({});
      }
      return;
    }

    if (isEmpty(columns)) return;

    const newFilters = { ...filters };
    let changed = false;

    columns.forEach((col) => {
      const colType = get(columnTypes, col);
      const isMultiselectColumn = includes(multiselectColumns, col);

      const desiredMatchMode =
        isMultiselectColumn ? 'in'
          : get(colType, 'isBoolean') ? 'equals'
            : get(colType, 'isDate') ? 'dateRange'
              : 'contains';

      if (!newFilters[col]) {
        newFilters[col] = { value: null, matchMode: desiredMatchMode };
        changed = true;
      } else if (newFilters[col].matchMode !== desiredMatchMode) {
        newFilters[col] = { ...newFilters[col], matchMode: desiredMatchMode };
        changed = true;
      }
    });

    if (hasPercentageColumns) {
      percentageColumnNames.forEach((col) => {
        if (!newFilters[col]) {
          newFilters[col] = { value: null, matchMode: 'contains' };
          changed = true;
        }
      });
    }

    if (changed) {
      setFilters(newFilters);
    }
  }, [
    columns,
    enableFilter,
    columnTypes,
    multiselectColumns,
    hasPercentageColumns,
    percentageColumnNames
  ]);

  const calculateColumnWidths = useMemo(() => {
    const widths = {};
    if (isEmpty(safeData)) return widths;

    const sampleData = take(safeData, 100);

    columns.forEach((col) => {
      const headerLength = formatHeaderName(col).length;
      const cellLengths = [];
      const colType = get(columnTypes, col, { isBoolean: false, isNumeric: false, isDate: false });

      sampleData.forEach((row) => {
        const value = getDataValue(row, col);
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

      widths[col] = finalWidth;
    });

    return widths;
  }, [safeData, columns, enableSort, formatHeaderName, formatCellValue, columnTypes]);

  // Custom sort function for percentage columns
  const getPercentageColumnSortFunction = useCallback((col) => {
    return (rowData1, rowData2) => {
      const val1 = getPercentageColumnValue(rowData1, col);
      const val2 = getPercentageColumnValue(rowData2, col);

      // Handle null/undefined values
      if (isNil(val1) && isNil(val2)) return 0;
      if (isNil(val1)) return 1; // null values go to end
      if (isNil(val2)) return -1;

      // Compare numeric values
      const num1 = isNumber(val1) ? val1 : toNumber(val1);
      const num2 = isNumber(val2) ? val2 : toNumber(val2);

      if (_isNaN(num1) && _isNaN(num2)) return 0;
      if (_isNaN(num1)) return 1;
      if (_isNaN(num2)) return -1;

      return num1 - num2;
    };
  }, [getPercentageColumnValue]);

  const filteredData = useMemo(() => {
    if (isEmpty(safeData)) return [];

    const filtered = filter(safeData, (row) => {
      if (!row || typeof row !== 'object') return false;

      // Check regular columns
      const regularColumnsPass = every(columns, (col) => {
        const filterObj = get(filters, col);
        if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;

        // Handle empty arrays for multiselect
        if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;

        const cellValue = getDataValue(row, col);
        const filterValue = filterObj.value;
        const colType = get(columnTypes, col);
        const isMultiselectColumn = includes(multiselectColumns, col);

        // Multiselect filter (multiselect columns)
        if (isMultiselectColumn && isArray(filterValue)) {
          return some(filterValue, (v) => {
            // Handle null/undefined values explicitly
            if (isNil(v) && isNil(cellValue)) return true;
            if (isNil(v) || isNil(cellValue)) return false;
            return v === cellValue || String(v) === String(cellValue);
          });
        }

        // Boolean filter (handles true/false and 1/0)
        if (get(colType, 'isBoolean')) {
          const cellIsTruthy = cellValue === true || cellValue === 1 || cellValue === '1';
          const cellIsFalsy = cellValue === false || cellValue === 0 || cellValue === '0';

          if (filterValue === true) {
            return cellIsTruthy;
          } else if (filterValue === false) {
            return cellIsFalsy;
          }
          return true;
        }

        // Date range filter
        if (get(colType, 'isDate')) {
          return applyDateFilter(cellValue, filterValue);
        }

        // Numeric filter with operators
        if (get(colType, 'isNumeric')) {
          const parsedFilter = parseNumericFilter(filterValue);
          return applyNumericFilter(cellValue, parsedFilter);
        }

        // Text filter (default)
        const strCell = toLower(String(cellValue ?? ''));
        const strFilter = toLower(String(filterValue));
        return includes(strCell, strFilter);
      });

      if (!regularColumnsPass) return false;

      // Check percentage columns if active
      if (hasPercentageColumns) {
        return every(percentageColumnNames, (col) => {
          const filterObj = get(filters, col);
          if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;

          // Handle empty arrays for multiselect
          if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;

          const cellValue = getPercentageColumnValue(row, col);
          const filterValue = filterObj.value;

          // Use numeric filter for percentage columns
          const parsedFilter = parseNumericFilter(filterValue);
          return applyNumericFilter(cellValue, parsedFilter);
        });
      }

      return true;
    });
    return filtered;
  }, [safeData, filters, columns, columnTypes, multiselectColumns, hasPercentageColumns, percentageColumnNames, getPercentageColumnValue]);

  // Restore horizontal scroll position after filters change
  useEffect(() => {
    if (scrollPositionRef.current === 0) return;
    
    // Use a small delay to ensure the table has re-rendered
    const timeoutId = setTimeout(() => {
      let scrollableContainer = null;
      
      // Check if dialog is open and get its container
      if (isFullscreen && dialogRef.current) {
        const dialogElement = dialogRef.current.getElement();
        if (dialogElement) {
          scrollableContainer = dialogElement.querySelector('.p-datatable-wrapper') || 
                               dialogElement.querySelector('.p-datatable-scrollable-body');
        }
      }
      
      // Fallback to document if not found in dialog
      if (!scrollableContainer) {
        scrollableContainer = document.querySelector('.p-datatable-wrapper') || 
                             document.querySelector('.p-datatable-scrollable-body');
      }
      
      if (scrollableContainer && scrollPositionRef.current > 0) {
        scrollableContainer.scrollLeft = scrollPositionRef.current;
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [filters, isFullscreen]);

  // Group filtered data by outerGroupField if set
  const groupedData = useMemo(() => {
    // In report mode, report data is already grouped, so return empty (dataForSorting will use reportData.tableData)
    if (enableBreakdown && reportData && reportData.tableData) {
      return [];
    }
    
    if (!outerGroupField || isEmpty(filteredData)) {
      // When outerGroupField is removed, ensure we return a clean array without group rows
      // Also convert Map instances to plain objects for PrimeReact compatibility
      if (!outerGroupField && isArray(filteredData)) {
        const filtered = filteredData
          .filter(row => !row?.__isGroupRow__)
          .map(row => {
            // Convert Map instances to plain objects for PrimeReact compatibility
            if (row instanceof Map) {
              const plainObj = {};
              row.forEach((value, key) => {
                plainObj[key] = value;
              });
              return plainObj;
            }
            return row;
          });
        return filtered;
      }
      const result = isArray(filteredData) ? filteredData.map(row => {
        // Convert Map instances to plain objects for PrimeReact compatibility
        if (row instanceof Map) {
          const plainObj = {};
          row.forEach((value, key) => {
            plainObj[key] = value;
          });
          return plainObj;
        }
        return row;
      }) : [];
      return result;
    }

    // Group by outerGroupField
    const groups = {};
    filteredData.forEach((row) => {
      // Skip group rows
      if (row.__isGroupRow__) return;

      const groupKey = getDataValue(row, outerGroupField);
      const key = isNil(groupKey) ? '__null__' : String(groupKey);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(row);
    });

    // Transform groups into expandable rows
    const groupedResult = Object.entries(groups).map(([groupKey, rows]) => {
      let innerData = rows;

      // If innerGroupField is set, aggregate within each group
      if (innerGroupField && !isEmpty(rows)) {
        const innerGroups = {};
        rows.forEach((row) => {
          const innerKey = getDataValue(row, innerGroupField);
          const key = isNil(innerKey) ? '__null__' : String(innerKey);
          if (!innerGroups[key]) {
            innerGroups[key] = [];
          }
          innerGroups[key].push(row);
        });

        // Aggregate each inner group
        innerData = Object.entries(innerGroups).map(([innerKey, innerRows]) => {
          const aggregated = {};

          // Get all columns from the first row
          const firstRow = innerRows[0];
          if (!firstRow) return null;

          columns.forEach((col) => {
            const colType = get(columnTypes, col, {});

            // For the inner group field, use the group value
            if (col === innerGroupField) {
              aggregated[col] = innerKey === '__null__' ? null : innerKey;
            }
            // For the outer group field, use the group value
            else if (col === outerGroupField) {
              aggregated[col] = groupKey === '__null__' ? null : groupKey;
            }
            // For numeric columns, sum them
            else if (get(colType, 'isNumeric')) {
              const sum = sumBy(innerRows, (row) => {
                const val = getDataValue(row, col);
                if (isNil(val)) return 0;
                const numVal = isNumber(val) ? val : toNumber(val);
                return _isNaN(numVal) ? 0 : numVal;
              });
              aggregated[col] = sum;
            }
            // For other columns, take the first non-null value or first value
            else {
              const firstNonNull = innerRows.find(row => !isNil(getDataValue(row, col)));
              aggregated[col] = firstNonNull ? getDataValue(firstNonNull, col) : getDataValue(firstRow, col);
            }
          });

          // Add percentage column values to aggregated row
          if (hasPercentageColumns) {
            percentageColumns.forEach(pc => {
              if (pc.columnName && pc.targetField && pc.valueField) {
                // Normalize percentage calculation: sum target and value, then recalculate
                const sumTarget = sumBy(innerRows, (row) => {
                  const val = getDataValue(row, pc.targetField);
                  if (isNil(val)) return 0;
                  const numVal = isNumber(val) ? val : toNumber(val);
                  return _isNaN(numVal) ? 0 : numVal;
                });
                const sumValue = sumBy(innerRows, (row) => {
                  const val = getDataValue(row, pc.valueField);
                  if (isNil(val)) return 0;
                  const numVal = isNumber(val) ? val : toNumber(val);
                  return _isNaN(numVal) ? 0 : numVal;
                });
                // Recalculate percentage from aggregated values
                aggregated[pc.columnName] = sumTarget !== 0 ? (sumValue / sumTarget) * 100 : null;
              }
            });
          }

          return aggregated;
        }).filter(Boolean);
      }

      // Create a summary row for the outer group by aggregating innerData
      const summaryRow = {};
      
      // Get the first row/item from innerData for structure
      const firstItem = innerData[0];
      if (!firstItem) return null;

      // Aggregate data from innerData
      columns.forEach((col) => {
        const colType = get(columnTypes, col, {});

        // For the outer group field, use the group value
        if (col === outerGroupField) {
          summaryRow[col] = groupKey === '__null__' ? null : groupKey;
        }
        // For the inner group field, set to null (summary represents all inner groups)
        else if (col === innerGroupField) {
          summaryRow[col] = null;
        }
        // For numeric columns, sum them across all inner data
        else if (get(colType, 'isNumeric')) {
          const sum = sumBy(innerData, (row) => {
            const val = getDataValue(row, col);
            if (isNil(val)) return 0;
            const numVal = isNumber(val) ? val : toNumber(val);
            return _isNaN(numVal) ? 0 : numVal;
          });
          summaryRow[col] = sum;
        }
        // For other columns, take the first non-null value or first value
        else {
          const firstNonNull = innerData.find(row => !isNil(getDataValue(row, col)));
          summaryRow[col] = firstNonNull ? getDataValue(firstNonNull, col) : getDataValue(firstItem, col);
        }
      });

      // Add percentage column values to summary row
      if (hasPercentageColumns) {
        percentageColumns.forEach(pc => {
          if (pc.columnName && pc.targetField && pc.valueField) {
            // Normalize percentage calculation: sum target and value from original rows, then recalculate
            // Use the original rows, not innerData (which may already be aggregated)
            const sumTarget = sumBy(rows, (row) => {
              const val = getDataValue(row, pc.targetField);
              if (isNil(val)) return 0;
              const numVal = isNumber(val) ? val : toNumber(val);
              return _isNaN(numVal) ? 0 : numVal;
            });
            const sumValue = sumBy(rows, (row) => {
              const val = getDataValue(row, pc.valueField);
              if (isNil(val)) return 0;
              const numVal = isNumber(val) ? val : toNumber(val);
              return _isNaN(numVal) ? 0 : numVal;
            });
            // Recalculate percentage from aggregated values
            summaryRow[pc.columnName] = sumTarget !== 0 ? (sumValue / sumTarget) * 100 : null;
          }
        });
      }

      // Use groupKey as the unique identifier (it's already a string from the grouping)
      summaryRow.__groupKey__ = groupKey;
      summaryRow.__groupRows__ = innerData;
      summaryRow.__isGroupRow__ = true;

      return summaryRow;
    }).filter(Boolean); // Filter out any null values
    return groupedResult;
  }, [filteredData, outerGroupField, innerGroupField, columns, columnTypes, hasPercentageColumns, percentageColumns]);

  // Use grouped data if outerGroupField is set, otherwise use filteredData
  const dataForSorting = useMemo(() => {
    // In report mode, use report data tableData
    if (enableBreakdown && reportData && reportData.tableData) {
      return isArray(reportData.tableData) ? reportData.tableData : [];
    }
    
    const data = outerGroupField ? groupedData : filteredData;
    // Ensure we always return an array
    return isArray(data) ? data : [];
  }, [enableBreakdown, reportData, outerGroupField, groupedData, filteredData]);

  const sortedData = useMemo(() => {
    // Ensure dataForSorting is an array
    if (!isArray(dataForSorting)) {
      return [];
    }
    if (isEmpty(dataForSorting) || isEmpty(multiSortMeta)) {
      return dataForSorting;
    }

    // Map sort fields to either field names or custom sort functions for percentage columns
    const fields = multiSortMeta.map(s => {
      const field = s.field;
      // If it's a percentage column, use a custom sort function
      if (isPercentageColumn(field)) {
        return (rowData) => getPercentageColumnValue(rowData, field);
      }
      return field;
    });
    const orders = multiSortMeta.map(s => s.order === 1 ? 'asc' : 'desc');

    return orderBy(dataForSorting, fields, orders);
  }, [dataForSorting, multiSortMeta, isPercentageColumn, getPercentageColumnValue]);


  const calculateSums = useMemo(() => {
    const sums = {};
    const dataForSums = filteredData;
    if (isEmpty(dataForSums)) return sums;

    columns.forEach((col) => {
      const colType = get(columnTypes, col);
      // Skip date columns for summation
      if (get(colType, 'isDate')) return;

      const values = filter(
        dataForSums.map((row) => getDataValue(row, col)),
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

  const paginatedData = useMemo(() => {
    const result = !isArray(sortedData) ? [] : sortedData.slice(first, first + rows);
    return result;
  }, [sortedData, first, rows]);

  const footerTemplate = (column, isFirstColumn = false) => {
    if (!enableSummation) return null;

    // Percentage columns don't show summation
    if (isPercentageColumn(column)) {
      return isFirstColumn ? (
        <div className="text-left">
          <strong>Total</strong>
        </div>
      ) : null;
    }

    const colType = get(columnTypes, column);

    // No summation for date columns
    if (get(colType, 'isDate')) {
      return isFirstColumn ? (
        <div className="text-left">
          <strong>Total</strong>
        </div>
      ) : null;
    }

    const sum = get(calculateSums, column);
    const hasSum = !isNil(sum) && !get(colType, 'isBoolean');

    // Determine color based on field lists
    const isRedField = includes(redFields, column);
    const isGreenField = includes(greenFields, column);
    const colorClass = isRedField ? 'text-red-600' : isGreenField ? 'text-green-600' : '';

    if (isFirstColumn) {
      if (hasSum) {
        // Apply division by 1 Lakh if enabled
        const displaySum = enableDivideBy1Lakh ? sum / 100000 : sum;
        const formattedSum = displaySum % 1 === 0
          ? displaySum.toLocaleString('en-US')
          : displaySum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

    // Apply division by 1 Lakh if enabled
    const displaySum = enableDivideBy1Lakh ? sum / 100000 : sum;
    const formattedSum = displaySum % 1 === 0
      ? displaySum.toLocaleString('en-US')
      : displaySum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (
      <div className="text-right">
        <strong className={colorClass}>{formattedSum}</strong>
      </div>
    );
  };

  // Helper to normalize boolean values (handles true/false and 1/0)
  const isTruthyBoolean = useCallback((value) => {
    return value === true || value === 1 || value === '1';
  }, []);

  // Helper to get color class for a column
  const getColumnColorClass = useCallback((column) => {
    const isRedField = includes(redFields, column);
    const isGreenField = includes(greenFields, column);
    return isRedField ? 'text-red-600' : isGreenField ? 'text-green-600' : '';
  }, [redFields, greenFields]);

  const booleanBodyTemplate = useCallback((rowData, column, colorClass = '') => {
    const value = getDataValue(rowData, column);
    const isTruthy = isTruthyBoolean(value);

    return (
      <div className={`flex items-center justify-center ${colorClass}`}>
        {isTruthy ? (
          <i className="pi pi-check-circle text-green-600 text-lg" title="Yes" />
        ) : (
          <i className="pi pi-times-circle text-red-500 text-lg" title="No" />
        )}
      </div>
    );
  }, [isTruthyBoolean]);

  const dateBodyTemplate = useCallback((rowData, column, colorClass = '') => {
    const value = getDataValue(rowData, column);
    const formatted = formatDateValue(value);

    return (
      <div className={`text-xs sm:text-sm truncate text-left ${colorClass}`} title={formatted}>
        {formatted}
      </div>
    );
  }, []);

  const updateFilter = useCallback((col, value) => {
    // Save current scroll position before updating filters
    // Try to find the scrollable container - check dialog first, then document
    let container = null;
    
    // Check if dialog is open and get its container
    if (isFullscreen && dialogRef.current) {
      const dialogElement = dialogRef.current.getElement();
      if (dialogElement) {
        container = dialogElement.querySelector('.p-datatable-wrapper') || 
                   dialogElement.querySelector('.p-datatable-scrollable-body');
      }
    }
    
    // Fallback to document if not found in dialog
    if (!container) {
      container = document.querySelector('.p-datatable-wrapper') || 
                 document.querySelector('.p-datatable-scrollable-body');
    }
    
    if (container) {
      scrollPositionRef.current = container.scrollLeft || 0;
    }
    
    setFilters(prev => ({
      ...prev,
      [col]: { ...get(prev, col), value }
    }));
    setFirst(0);
  }, [isFullscreen]);

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

    // Also clear percentage columns if active
    if (hasPercentageColumns) {
      percentageColumnNames.forEach((col) => {
        clearedFilters[col] = { value: null, matchMode: 'contains' };
      });
    }

    setFilters(clearedFilters);
    setFirst(0);
  }, [columns, columnTypes, multiselectColumns, hasPercentageColumns, percentageColumnNames]);

  // Format filter value for display in chip
  const formatFilterValue = useCallback((col, filterValue, colType) => {
    if (isNil(filterValue) || filterValue === '') return null;

    const isMultiselectColumn = includes(multiselectColumns, col);

    // Multiselect filter - show comma-separated values
    if (isMultiselectColumn && isArray(filterValue) && !isEmpty(filterValue)) {
      return filterValue.map(v => String(v)).join(', ');
    }

    // Boolean filter
    if (get(colType, 'isBoolean')) {
      if (filterValue === true) return 'Yes';
      if (filterValue === false) return 'No';
      return null;
    }

    // Date range filter
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

    // Numeric and text filters - show as is
    if (isString(filterValue) || isNumber(filterValue)) {
      return String(filterValue);
    }

    return null;
  }, [multiselectColumns]);

  // Get active filters for display
  const activeFilters = useMemo(() => {
    if (!enableFilter || isEmpty(filters)) return [];

    const active = [];
    columns.forEach((col) => {
      const filterObj = get(filters, col);
      if (filterObj && !isNil(filterObj.value) && filterObj.value !== '') {
        // Handle empty arrays for multiselect
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

    // Also check percentage columns if active
    if (hasPercentageColumns) {
      percentageColumnNames.forEach((col) => {
        const filterObj = get(filters, col);
        if (filterObj && !isNil(filterObj.value) && filterObj.value !== '') {
          // Handle empty arrays for multiselect
          if (isArray(filterObj.value) && isEmpty(filterObj.value)) {
            return;
          }
          // Percentage columns are numeric, so format as string
          const formattedValue = formatFilterValue(col, filterObj.value, { isNumeric: true });
          if (formattedValue !== null) {
            active.push({
              column: col,
              value: filterObj.value,
              formattedValue,
              colType: { isNumeric: true }
            });
          }
        }
      });
    }

    return active;
  }, [filters, columns, enableFilter, columnTypes, formatFilterValue, multiselectColumns, hasPercentageColumns, percentageColumnNames]);

  // Debounce for typing-based filters (text/numeric)
  const DEBOUNCE_MS = 3000;
  const debouncedMapRef = useRef(new Map());

  const cancelDebounced = useCallback((col) => {
    const fn = debouncedMapRef.current.get(col);
    if (fn && fn.cancel) fn.cancel();
  }, []);

  const debouncedUpdateFilter = useCallback(
    (col, value) => {
      let fn = debouncedMapRef.current.get(col);
      if (!fn) {
        fn = debounce((val) => {
          updateFilter(col, val);
        }, DEBOUNCE_MS);
        debouncedMapRef.current.set(col, fn);
      }
      fn(value);
    },
    [updateFilter]
  );

  useEffect(() => {
    return () => {
      debouncedMapRef.current.forEach((fn) => fn?.cancel?.());
      debouncedMapRef.current.clear();
    };
  }, []);

  const textFilterElement = useCallback((col) => (options) => {
    const filterState = get(filters, col);
    const value = isNil(get(filterState, 'value')) ? '' : filterState.value;
    return (
      <InputText
        defaultValue={value}
        onChange={(e) => debouncedUpdateFilter(col, e.target.value === '' ? null : e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            cancelDebounced(col);
            updateFilter(col, e.currentTarget.value === '' ? null : e.currentTarget.value);
          }
        }}
        onBlur={(e) => {
          cancelDebounced(col);
          updateFilter(col, e.currentTarget.value === '' ? null : e.currentTarget.value);
        }}
        placeholder="Search..."
        className="p-column-filter"
        style={{ width: '100%' }}
      />
    );
  }, [filters, updateFilter, debouncedUpdateFilter, cancelDebounced]);

  const numericFilterElement = useCallback((col) => (options) => {
    const filterState = get(filters, col);
    const value = isNil(get(filterState, 'value')) ? '' : filterState.value;
    return (
      <InputText
        defaultValue={value}
        onChange={(e) => debouncedUpdateFilter(col, e.target.value === '' ? null : e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            cancelDebounced(col);
            updateFilter(col, e.currentTarget.value === '' ? null : e.currentTarget.value);
          }
        }}
        onBlur={(e) => {
          cancelDebounced(col);
          updateFilter(col, e.currentTarget.value === '' ? null : e.currentTarget.value);
        }}
        placeholder="<, >, <=, >=, =, <>"
        className="p-column-filter"
        style={{ width: '100%' }}
        title="Numeric filters: <10, >10, <=10, >=10, =10, 10<>20 (range)"
      />
    );
  }, [filters, updateFilter, debouncedUpdateFilter, cancelDebounced]);

  const dateFilterElement = useCallback((col) => (options) => {
    const filterState = get(filters, col);
    const value = get(filterState, 'value', null);
    return (
      <DateRangeFilter
        value={value}
        onChange={(newValue) => updateFilter(col, newValue)}
      />
    );
  }, [filters, updateFilter]);

  const booleanFilterElement = useCallback((col) => () => {
    const filterState = get(filters, col);
    const value = get(filterState, 'value', null);
    return (
      <div className="flex items-center justify-center p-column-filter-checkbox-wrapper">
        <CustomTriStateCheckbox
          value={value}
          onChange={(newValue) => updateFilter(col, newValue)}
        />
      </div>
    );
  }, [filters, updateFilter]);

  const multiselectFilterElement = useCallback((col) => (options) => {
    const filterState = get(filters, col);
    const value = get(filterState, 'value', null);
    const columnOptions = get(optionColumnValues, col, []);

    return (
      <MultiselectFilter
        value={value}
        options={columnOptions}
        onChange={(newValue) => updateFilter(col, newValue)}
        placeholder="Select..."
        fieldName={formatHeaderName(col)}
      />
    );
  }, [filters, updateFilter, optionColumnValues, formatHeaderName]);

  const getFilterElement = useCallback((col) => {
    // Percentage columns always use numeric filter
    if (isPercentageColumn(col)) {
      return numericFilterElement(col);
    }

    const colType = get(columnTypes, col);
    const isMultiselectColumn = includes(multiselectColumns, col);

    // Multiselect columns get multiselect filter (takes priority)
    if (isMultiselectColumn) {
      return multiselectFilterElement(col);
    }
    if (get(colType, 'isBoolean')) {
      return booleanFilterElement(col);
    }
    if (get(colType, 'isDate')) {
      return dateFilterElement(col);
    }
    if (get(colType, 'isNumeric')) {
      return numericFilterElement(col);
    }
    return textFilterElement(col);
  }, [columnTypes, multiselectColumns, booleanFilterElement, dateFilterElement, numericFilterElement, textFilterElement, multiselectFilterElement, isPercentageColumn]);

  const getBodyTemplate = useCallback((col) => {
    // Handle percentage columns
    if (isPercentageColumn(col)) {
      const colorClass = getColumnColorClass(col);
      return (rowData) => {
        // Get percentage value using the helper function
        const percentage = getPercentageColumnValue(rowData, col);

        const formatPercentage = (pct) => {
          if (isNil(pct) || _isNaN(pct) || !_isFinite(pct)) return '-';
          return `${pct.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
        };

        return (
          <div className={`text-xs sm:text-sm text-right ${colorClass}`}>
            <div className={`font-semibold ${colorClass || 'text-blue-700'}`}>{formatPercentage(percentage)}</div>
          </div>
        );
      };
    }

    const colType = get(columnTypes, col);
    const isBooleanCol = get(colType, 'isBoolean', false);
    const isDateCol = get(colType, 'isDate', false);
    const isNumericCol = get(colType, 'isNumeric', false);
    const isOuterGroupCol = col === outerGroupField;
    const isInnerGroupCol = col === innerGroupField;
    const colorClass = getColumnColorClass(col);

    // Handle clickable group columns
    if (isOuterGroupCol && onOuterGroupClick) {
      return (rowData) => {
        const value = getDataValue(rowData, col);
        const cellValue = formatCellValue(value, colType);
        return (
          <div
            className={`text-xs sm:text-sm truncate cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded transition-colors ${isNumericCol ? 'text-right' : 'text-left'} ${colorClass}`}
            title={cellValue}
            onClick={(e) => {
              e.stopPropagation();
              onOuterGroupClick(rowData, col, value);
            }}
          >
            {cellValue}
          </div>
        );
      };
    }

    if (isInnerGroupCol && onInnerGroupClick) {
      return (rowData) => {
        const value = getDataValue(rowData, col);
        const cellValue = formatCellValue(value, colType);
        return (
          <div
            className={`text-xs sm:text-sm truncate cursor-pointer hover:bg-green-50 px-1 py-0.5 rounded transition-colors ${isNumericCol ? 'text-right' : 'text-left'} ${colorClass}`}
            title={cellValue}
            onClick={(e) => {
              e.stopPropagation();
              onInnerGroupClick(rowData, col, value);
            }}
          >
            {cellValue}
          </div>
        );
      };
    }

    if (isBooleanCol) {
      return (rowData) => booleanBodyTemplate(rowData, col, colorClass);
    }
    if (isDateCol) {
      return (rowData) => dateBodyTemplate(rowData, col, colorClass);
    }
    return (rowData) => (
      <div
        className={`text-xs sm:text-sm truncate ${isNumericCol ? 'text-right' : 'text-left'} ${colorClass}`}
        title={formatCellValue(getDataValue(rowData, col), colType)}
      >
        {formatCellValue(getDataValue(rowData, col), colType)}
      </div>
    );
  }, [columnTypes, outerGroupField, innerGroupField, onOuterGroupClick, onInnerGroupClick, booleanBodyTemplate, dateBodyTemplate, formatCellValue, isPercentageColumn, getPercentageColumnValue, getColumnColorClass]);

  // Header template function to apply column colors
  const getHeaderTemplate = useCallback((col) => {
    const colorClass = getColumnColorClass(col);
    if (!colorClass) return undefined;
    
    return () => (
      <span className={colorClass}>
        {formatHeaderName(col)}
      </span>
    );
  }, [getColumnColorClass, formatHeaderName]);

  // Cell editor functions
  const getCellEditor = useCallback((col) => {
    if (!enableCellEdit) return undefined;

    // Disable editing entirely if Outer Group or Inner Group is present
    if (outerGroupField || innerGroupField) {
      return undefined;
    }

    const colType = get(columnTypes, col);
    const isBooleanCol = get(colType, 'isBoolean', false);
    const isDateCol = get(colType, 'isDate', false);
    const isNumericCol = get(colType, 'isNumeric', false);

    // Don't allow editing of group fields, boolean, or date columns
    if (col === outerGroupField || col === innerGroupField || isBooleanCol || isDateCol) {
      return undefined;
    }

    // Check if column is in nonEditableColumns
    if (includes(nonEditableColumns, col)) {
      return undefined;
    }

    // Return editor function that also checks isCellEditable if provided
    return (options) => {
      const { rowData } = options;

      // Check if row is a group row
      if (rowData && rowData.__isGroupRow__) {
        return null;
      }

      // Check isCellEditable function if provided
      if (isCellEditable && typeof isCellEditable === 'function') {
        if (!isCellEditable(rowData, col)) {
          return null;
        }
      }

      if (isNumericCol) {
        return (
          <InputNumber
            value={options.value}
            onValueChange={(e) => options.editorCallback(e.value)}
            onKeyDown={(e) => e.stopPropagation()}
            style={{ width: '100%' }}
          />
        );
      }

      return (
        <InputText
          type="text"
          value={options.value || ''}
          onChange={(e) => options.editorCallback(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          style={{ width: '100%' }}
        />
      );
    };
  }, [enableCellEdit, columnTypes, outerGroupField, innerGroupField, nonEditableColumns, isCellEditable]);

  // Handle cell edit complete
  const handleCellEditComplete = useCallback((e) => {
    const { rowData, newValue, field, originalEvent: event } = e;
    const oldValue = getDataValue(rowData, field);

    // Store old value before update
    const colType = get(columnTypes, field);
    const isNumericCol = get(colType, 'isNumeric', false);

    // Validate and update
    if (isNumericCol) {
      const numValue = isNumber(newValue) ? newValue : toNumber(newValue);
      if (!_isNaN(numValue) && _isFinite(numValue)) {
        rowData[field] = numValue;
      } else {
        event.preventDefault();
        return;
      }
    } else {
      if (newValue !== null && newValue !== undefined && String(newValue).trim().length > 0) {
        rowData[field] = newValue;
      } else {
        event.preventDefault();
        return;
      }
    }

    // Call the callback with old and new values
    if (onCellEditComplete) {
      onCellEditComplete({
        ...e,
        oldValue,
        rowData: { ...rowData }
      });
    }
  }, [columnTypes, onCellEditComplete, toNumber]);

  // Check if a row can be expanded
  const allowExpansion = useCallback((rowData) => {
    // In report mode with innerGroupField, check nestedTableData
    if (enableBreakdown && reportData && innerGroupField) {
      const outerValue = getDataValue(rowData, outerGroupField);
      const nestedRows = reportData.nestedTableData?.[outerValue];
      return nestedRows && nestedRows.length > 0;
    }
    
    // Regular mode: check for group rows
    return outerGroupField && rowData.__isGroupRow__ && rowData.__groupRows__ && rowData.__groupRows__.length > 0;
  }, [outerGroupField, enableBreakdown, reportData, innerGroupField]);

  // Nested (expanded) tables: keep independent filter state and debounce timers per group
  const [nestedFiltersMap, setNestedFiltersMap] = useState({});
  const nestedDebouncedMapRef = useRef(new Map());

  const updateNestedFilter = useCallback((groupKey, col, value) => {
    setNestedFiltersMap(prev => {
      const current = get(prev, groupKey) || {};
      return {
        ...prev,
        [groupKey]: {
          ...current,
          [col]: { ...get(current, col), value }
        }
      };
    });
  }, []);

  const nestedCancelDebounced = useCallback((groupKey, col) => {
    const key = `${groupKey}::${col}`;
    const fn = nestedDebouncedMapRef.current.get(key);
    if (fn && fn.cancel) fn.cancel();
  }, []);

  const nestedDebouncedUpdateFilter = useCallback((groupKey, col, value) => {
    const key = `${groupKey}::${col}`;
    let fn = nestedDebouncedMapRef.current.get(key);
    if (!fn) {
      fn = debounce((val) => {
        updateNestedFilter(groupKey, col, val);
      }, DEBOUNCE_MS);
      nestedDebouncedMapRef.current.set(key, fn);
    }
    fn(value);
  }, [updateNestedFilter]);

  // Report mode row expansion template - shows nested table with report structure
  const reportRowExpansionTemplate = useCallback((rowData) => {
    if (!enableBreakdown || !reportData || !innerGroupField) {
      return null;
    }

    const outerValue = getDataValue(rowData, outerGroupField);
    const nestedRows = reportData.nestedTableData?.[outerValue];
    
    if (!nestedRows || nestedRows.length === 0) {
      return <div className="p-3">No inner group data available</div>;
    }

    // For report mode, use a simplified nested table showing the nested rows
    // The nested rows already have the report structure (period_metric columns)
    const nestedColumns = [innerGroupField, ...(reportColumnsStructure?.columnNames || [])];
    
    return (
      <div className="p-3 bg-gray-50">
        <div className="text-xs font-semibold text-gray-700 mb-2">
          Aggregated by {formatHeaderName(innerGroupField)}
        </div>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <DataTable
            value={nestedRows}
            className="p-datatable-sm"
            style={{ minWidth: '100%' }}
          >
            {nestedColumns.map((col) => {
              const colType = get(columnTypes, col);
              const isNumericCol = get(colType, 'isNumeric', false);
              return (
                <Column
                  key={col}
                  field={col}
                  header={formatHeaderName(col)}
                  body={(rowData) => formatCellValue(getDataValue(rowData, col), colType)}
                  align={isNumericCol ? 'right' : 'left'}
                />
              );
            })}
          </DataTable>
        </div>
      </div>
    );
  }, [enableBreakdown, reportData, innerGroupField, outerGroupField, reportColumnsStructure, columnTypes, formatHeaderName, formatCellValue]);

  // Row expansion template - shows nested table with same headers
  const rowExpansionTemplate = useCallback((rowData) => {
    if (!rowData.__groupRows__ || isEmpty(rowData.__groupRows__)) {
      return null;
    }

    const nestedData = rowData.__groupRows__;
    // Remove outerGroupField from nested table, add innerGroupField first (if set)
    let nestedColumns = orderedColumns.filter(col => col !== outerGroupField);
    if (innerGroupField) {
      // Add innerGroupField to nested table (it's excluded from main table)
      // Ensure it appears first
      if (includes(nestedColumns, innerGroupField)) {
        nestedColumns = [
          innerGroupField,
          ...nestedColumns.filter(col => col !== innerGroupField)
        ];
      } else {
        // Add innerGroupField if it's not already in the columns
        nestedColumns = [innerGroupField, ...nestedColumns];
      }
    }

    const groupKey = rowData.__groupKey__;
    const nestedFilters = get(nestedFiltersMap, groupKey) || {};

    // Build multiselect options for nested data per column
    const getNestedColumnOptions = (col) => {
      const rawVals = nestedData.map(r => get(r, col));
      const uniqueVals = uniq(rawVals);
      const hasNull = some(uniqueVals, v => isNil(v));
      const nonNull = uniqueVals.filter(v => !isNil(v));
      const sortedNonNull = orderBy(nonNull);
      const options = [];
      if (hasNull) options.push({ label: '(null)', value: null });
      options.push(...sortedNonNull.map(v => ({ label: String(v), value: v })));
      return options;
    };

    // Apply nested filters (independent) using same logic as main table
    const nestedFilteredData = filter(nestedData, (row) => {
      if (!row || typeof row !== 'object') return false;

      const regularColumnsPass = every(nestedColumns, (col) => {
        const filterObj = get(nestedFilters, col);
        if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;
        if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;

        const isPctCol = isPercentageColumn(col);
        const cellValue = isPctCol ? getPercentageColumnValue(row, col) : getDataValue(row, col);
        const filterValue = filterObj.value;
        const colType = get(columnTypes, col);
        const isMultiselectColumn = includes(multiselectColumns, col);

        if (isMultiselectColumn && isArray(filterValue)) {
          return some(filterValue, (v) => {
            if (isNil(v) && isNil(cellValue)) return true;
            if (isNil(v) || isNil(cellValue)) return false;
            return v === cellValue || String(v) === String(cellValue);
          });
        }

        if (!isPctCol && get(colType, 'isBoolean')) {
          const cellIsTruthy = cellValue === true || cellValue === 1 || cellValue === '1';
          const cellIsFalsy = cellValue === false || cellValue === 0 || cellValue === '0';
          if (filterValue === true) return cellIsTruthy;
          if (filterValue === false) return cellIsFalsy;
          return true;
        }

        if (!isPctCol && get(colType, 'isDate')) {
          return applyDateFilter(cellValue, filterValue);
        }

        // Treat percentage columns as numeric filters, same as main
        if (isPctCol || get(colType, 'isNumeric')) {
          const parsedFilter = parseNumericFilter(filterValue);
          return applyNumericFilter(cellValue, parsedFilter);
        }

        const strCell = toLower(String(cellValue ?? ''));
        const strFilter = toLower(String(filterValue));
        return includes(strCell, strFilter);
      });

      if (!regularColumnsPass) return false;
      return true;
    });

    // Nested filter elements with same UX (debounce, inputs) but independent state
    const getNestedFilterElement = (col) => {
      const colType = get(columnTypes, col);
      const isMultiselectColumn = includes(multiselectColumns, col);
      const isPctCol = isPercentageColumn(col);

      if (isMultiselectColumn) {
        const filterState = get(nestedFilters, col);
        const value = get(filterState, 'value', null);
        const columnOptions = getNestedColumnOptions(col);
        return () => (
          <MultiselectFilter
            value={value}
            options={columnOptions}
            onChange={(newValue) => updateNestedFilter(groupKey, col, newValue)}
            placeholder="Select..."
            fieldName={formatHeaderName(col)}
          />
        );
      }

      if (get(colType, 'isBoolean')) {
        const filterState = get(nestedFilters, col);
        const value = get(filterState, 'value', null);
        return () => (
          <div className="flex items-center justify-center p-column-filter-checkbox-wrapper">
            <CustomTriStateCheckbox
              value={value}
              onChange={(newValue) => updateNestedFilter(groupKey, col, newValue)}
            />
          </div>
        );
      }

      if (get(colType, 'isDate')) {
        const filterState = get(nestedFilters, col);
        const value = get(filterState, 'value', null);
        return () => (
          <DateRangeFilter
            value={value}
            onChange={(newValue) => updateNestedFilter(groupKey, col, newValue)}
          />
        );
      }

      if (isPctCol || get(colType, 'isNumeric')) {
        const filterState = get(nestedFilters, col);
        const value = isNil(get(filterState, 'value')) ? '' : filterState.value;
        return () => (
          <InputText
            defaultValue={value}
            onChange={(e) => nestedDebouncedUpdateFilter(groupKey, col, e.target.value === '' ? null : e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                nestedCancelDebounced(groupKey, col);
                updateNestedFilter(groupKey, col, e.currentTarget.value === '' ? null : e.currentTarget.value);
              }
            }}
            onBlur={(e) => {
              nestedCancelDebounced(groupKey, col);
              updateNestedFilter(groupKey, col, e.currentTarget.value === '' ? null : e.currentTarget.value);
            }}
            placeholder="<, >, <=, >=, =, <>"
            className="p-column-filter"
            style={{ width: '100%' }}
            title="Numeric filters: <10, >10, <=10, >=10, =10, 10<>20 (range)"
          />
        );
      }

      // Default text
      const filterState = get(nestedFilters, col);
      const value = isNil(get(filterState, 'value')) ? '' : filterState.value;
      return () => (
        <InputText
          defaultValue={value}
          onChange={(e) => nestedDebouncedUpdateFilter(groupKey, col, e.target.value === '' ? null : e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              nestedCancelDebounced(groupKey, col);
              updateNestedFilter(groupKey, col, e.currentTarget.value === '' ? null : e.currentTarget.value);
            }
          }}
          onBlur={(e) => {
            nestedCancelDebounced(groupKey, col);
            updateNestedFilter(groupKey, col, e.currentTarget.value === '' ? null : e.currentTarget.value);
          }}
          placeholder="Search..."
          className="p-column-filter"
          style={{ width: '100%' }}
        />
      );
    };

    return (
      <div className="p-3 bg-gray-50">
        <div className="text-xs font-semibold text-gray-700 mb-2">
          {innerGroupField
            ? `Aggregated by ${formatHeaderName(innerGroupField)}`
            : `${nestedData.length} row${nestedData.length !== 1 ? 's' : ''}`}
        </div>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <DataTable
            resizableColumns
            columnResizeMode="expand"
            value={nestedFilteredData}
            sortMode={enableSort ? 'multiple' : undefined}
            removableSort={enableSort}
            filterDisplay={enableFilter ? 'row' : undefined}
            showGridlines
            stripedRows
            className="p-datatable-sm"
            style={{ minWidth: '100%' }}
          >
            {nestedColumns.map((col) => {
              const colType = get(columnTypes, col);
              const isNumericCol = get(colType, 'isNumeric', false);
              return (
                <Column
                  key={col}
                  field={col}
                  header={getHeaderTemplate(col) || formatHeaderName(col)}
                  sortable={enableSort}
                  filter={enableFilter}
                  filterElement={enableFilter ? getNestedFilterElement(col) : undefined}
                  showFilterMenu={false}
                  showClearButton={false}
                  body={getBodyTemplate(col)}
                  align={isNumericCol ? 'right' : 'left'}
                  style={{
                    width: `${get(calculateColumnWidths, col, 120)}px`,
                  }}
                />
              );
            })}
          </DataTable>
        </div>
      </div>
    );
  }, [outerGroupField, innerGroupField, orderedColumns, columnTypes, formatHeaderName, getBodyTemplate, calculateColumnWidths, getHeaderTemplate, multiselectColumns, nestedFiltersMap, updateNestedFilter, nestedDebouncedUpdateFilter, nestedCancelDebounced]);

  const onPageChange = (event) => {
    setFirst(event.first);
    setRows(event.rows);
  };

  // Reusable Table Controls Component
  const TableControls = ({
    showFullscreenButton = true,
    controlsRowClassName = "",
    onClose,
    onMaximizeToggle,
    isMaximized: maximized = false,
    enableFullscreenDialog = true
  }) => (
    <div className={`mb-4 flex items-center justify-between gap-4 flex-wrap ${controlsRowClassName}`}>
      {/* Left side: Visibility Control and Lock button */}
      <div className="shrink-0 flex items-center gap-2">
        {onVisibleColumnsChange && !isEmpty(availableColumnsForVisibility) && (
          <IconOnlyMultiselectFilter
            value={visibleColumns}
            options={availableColumnsForVisibility.map(col => ({
              label: formatHeaderName(col),
              value: col,
            }))}
            onChange={onVisibleColumnsChange}
            placeholder="Visible Columns"
            fieldName="columns"
            itemLabel="Visible Column"
            icon="pi-eye"
          />
        )}
        <button
          onClick={() => setFreezeFirstColumn(!freezeFirstColumn)}
          className={`p-2 rounded-lg transition-colors flex items-center justify-center ${freezeFirstColumn
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          title={freezeFirstColumn ? 'Unlock first column' : 'Lock first column'}
        >
          <i className={`pi ${freezeFirstColumn ? 'pi-lock' : 'pi-unlock'}`}></i>
        </button>
      </div>

      {/* Right side: Fullscreen, Maximize/Minimize, Close, and Export buttons */}
      <div className="shrink-0 flex items-center gap-2">
        <button
          onClick={exportToXLSX}
          disabled={isEmpty(sortedData)}
          className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          title="Export to Excel"
        >
          <i className="pi pi-file-excel"></i>
        </button>
        {showFullscreenButton && enableFullscreenDialog && (
          <button
            onClick={() => {
              setIsFullscreen(true);
              setIsMaximized(true);
            }}
            className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center"
            title="View table in fullscreen"
          >
            <i className="pi pi-window-maximize"></i>
          </button>
        )}
        {onMaximizeToggle && (
          <button
            onClick={onMaximizeToggle}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center"
            title={maximized ? 'Minimize' : 'Maximize'}
          >
            <i className={`pi ${maximized ? 'pi-window-minimize' : 'pi-window-maximize'}`}></i>
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
            title="Close"
          >
            <i className="pi pi-times"></i>
          </button>
        )}
      </div>
    </div>
  );

  // Reusable Filter Chips Component
  const FilterChips = ({ className = "" }) => {
    if (!enableFilter || isEmpty(activeFilters)) return null;

    return (
      <div className={`mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg ${className}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-600 mr-1">Active Filters:</span>
          {activeFilters.map(({ column, formattedValue }) => (
            <div
              key={column}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
            >
              <span>
                {formatHeaderName(column)}: {formattedValue}
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
    );
  };

  // Reusable Table View Component with Scrollable Support
  const TableView = ({ scrollHeight, containerClassName = "", containerStyle = {}, tableName: viewTableName = tableName }) => {
    const tableContainerRef = useRef(null);
    const tableRef = useRef(null);
    const [calculatedScrollHeight, setCalculatedScrollHeight] = useState(scrollHeight === "flex" ? undefined : scrollHeight);

    // Calculate scrollHeight dynamically when "flex" is used
    useEffect(() => {
      if (scrollHeight === "flex" && tableContainerRef.current) {
        const calculateHeight = () => {
          if (tableContainerRef.current) {
            const rect = tableContainerRef.current.getBoundingClientRect();
            if (rect.height > 0) {
              setCalculatedScrollHeight(`${rect.height}px`);
            }
          }
        };
        
        // Calculate immediately and on resize
        calculateHeight();
        const resizeObserver = new ResizeObserver(calculateHeight);
        if (tableContainerRef.current) {
          resizeObserver.observe(tableContainerRef.current);
        }
        
        return () => {
          resizeObserver.disconnect();
        };
      } else {
        setCalculatedScrollHeight(scrollHeight);
      }
    }, [scrollHeight]);

    return (
      <div 
        ref={tableContainerRef}
        className={`border border-gray-200 rounded-lg w-full responsive-table-container ${containerClassName}`} 
        style={{ position: 'relative', ...containerStyle }}
      >
        {/* Loading overlay when computing report */}
        {isComputingReport && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-lg">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-600 mb-3"></div>
              <p className="text-sm text-gray-500">Computing report...</p>
            </div>
          </div>
        )}
        <div ref={tableRef}>
      <DataTable
        resizableColumns
        columnResizeMode="expand"
        value={isArray(paginatedData) ? paginatedData : []}
        scrollable={scrollHeight ? true : scrollable}
        scrollHeight={calculatedScrollHeight || scrollHeight}
        sortMode={enableSort ? "multiple" : undefined}
        removableSort={enableSort}
        multiSortMeta={multiSortMeta}
        onSort={(e) => {
          setMultiSortMeta(e.multiSortMeta || []);
          setFirst(0);
        }}
        showGridlines
        stripedRows
        className="p-datatable-sm w-full"
        style={{ minWidth: '100%' }}
        filterDisplay={enableFilter ? "row" : undefined}
        expandedRows={expandedRows}
        onRowToggle={(e) => setExpandedRows(e.data)}
        rowExpansionTemplate={enableBreakdown && innerGroupField ? reportRowExpansionTemplate : (outerGroupField ? rowExpansionTemplate : undefined)}
        dataKey={enableBreakdown && reportData ? "id" : (outerGroupField ? "__groupKey__" : undefined)}
        editMode={enableCellEdit ? "cell" : undefined}
        headerColumnGroup={enableBreakdown && reportData ? reportHeaderGroup : undefined}
      >
        {(outerGroupField || (enableBreakdown && innerGroupField)) && (
          <Column
            expander={allowExpansion}
            style={{ width: '3rem' }}
          />
        )}
        {frozenCols.map((col, index) => {
          const isPctCol = isPercentageColumn(col);
          const colType = get(columnTypes, col);
          const isNumericCol = isPctCol || get(colType, 'isNumeric', false);
          const isFirstColumn = index === 0;
          return (
            <Column
              key={`frozen-${col}`}
              field={col}
              header={getHeaderTemplate(col) || formatHeaderName(col)}
              sortable={enableSort}
              sortFunction={isPctCol ? getPercentageColumnSortFunction(col) : undefined}
              frozen={freezeFirstColumn}
              style={{
                width: isPctCol ? '130px' : `${get(calculateColumnWidths, col, 120)}px`,
              }}
              filter={enableFilter}
              filterElement={enableFilter ? getFilterElement(col) : undefined}
              showFilterMenu={false}
              showClearButton={false}
              footer={footerTemplate(col, isFirstColumn)}
              body={getBodyTemplate(col)}
              editor={getCellEditor(col)}
              onCellEditComplete={enableCellEdit && getCellEditor(col) ? handleCellEditComplete : undefined}
              align={isNumericCol ? 'right' : 'left'}
            />
          );
        })}

        {regularCols.map((col, index) => {
          const isPctCol = isPercentageColumn(col);
          const colType = get(columnTypes, col);
          const isNumericCol = isPctCol || get(colType, 'isNumeric', false);
          return (
            <Column
              key={col}
              field={col}
              header={getHeaderTemplate(col) || formatHeaderName(col)}
              sortable={enableSort}
              sortFunction={isPctCol ? getPercentageColumnSortFunction(col) : undefined}
              style={{
                width: isPctCol ? '130px' : `${get(calculateColumnWidths, col, 120)}px`,
              }}
              filter={enableFilter}
              filterElement={enableFilter ? getFilterElement(col) : undefined}
              showFilterMenu={false}
              showClearButton={false}
              footer={footerTemplate(col)}
              body={getBodyTemplate(col)}
              editor={getCellEditor(col)}
              onCellEditComplete={enableCellEdit && getCellEditor(col) ? handleCellEditComplete : undefined}
              align={isNumericCol ? 'right' : 'left'}
            />
          );
        })}
      </DataTable>
        </div>
    </div>
  );
  };

  // Reusable Paginator Wrapper Component
  const PaginatorWrapper = useCallback(({ className = "" }) => {
    // Use sortedData.length which reflects filtered and sorted data
    const totalRecords = sortedData.length;
    return (
      <div className={`mt-4 flex items-center justify-center gap-4 flex-wrap ${className}`}>
        <Paginator
          first={first}
          rows={rows}
          totalRecords={totalRecords}
          rowsPerPageOptions={rowsPerPageOptions}
          onPageChange={onPageChange}
          template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
        />
        <div className="text-sm text-gray-600 font-medium">
          out of {totalRecords.toLocaleString('en-US')}
        </div>
      </div>
    );
  }, [sortedData, first, rows, rowsPerPageOptions, onPageChange]);

  // Reusable Feature Status Indicators Component
  const FeatureStatusIndicators = ({ className = "" }) => {
    if (enableSort && enableFilter && enableSummation) return null;

    return (
      <div className={`mb-3 flex flex-wrap gap-2 text-xs ${className}`}>
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
    );
  };

  const exportToXLSX = useCallback(() => {
    // Check if we're in report mode
    if (enableBreakdown && reportData) {
      // Use report export with merged headers
      const wb = exportReportToXLSX(
        reportData,
        columnGroupBy,
        outerGroupField,
        innerGroupField,
        formatHeaderName
      );
      
      // Generate filename with current date
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `export_${dateStr}.xlsx`;
      
      // Write file
      XLSX.writeFile(wb, filename);
      return;
    }

    // Regular export logic (non-report mode)
    let dataToExport;
    let allColumns;

    if (outerGroupField && !isEmpty(groupedData)) {
      // Grouped mode: extract inner rows from each group
      const flattenedInnerRows = [];
      
      groupedData.forEach((groupRow) => {
        if (groupRow.__isGroupRow__ && groupRow.__groupRows__) {
          const groupKey = groupRow.__groupKey__ || getDataValue(groupRow, outerGroupField);
          
          groupRow.__groupRows__.forEach((innerRow) => {
            // Ensure outerGroupField value is set (should already be in aggregated rows, but ensure it)
            const rowWithGroup = { ...innerRow };
            if (!rowWithGroup.hasOwnProperty(outerGroupField)) {
              rowWithGroup[outerGroupField] = groupKey === '__null__' ? null : groupKey;
            }
            flattenedInnerRows.push(rowWithGroup);
          });
        }
      });
      
      dataToExport = flattenedInnerRows;
      
      // Collect all columns from flattened data
      const allDataColumns = isEmpty(dataToExport) ? [] : uniq(flatMap(dataToExport, (item) =>
        item && typeof item === 'object' ? getDataKeys(item) : []
      ));
      
      // In grouped mode, filter to only include numeric columns (plus group fields and percentage columns)
      allColumns = allDataColumns.filter((col) => {
        // Always include outerGroupField
        if (col === outerGroupField) return true;
        
        // Always include innerGroupField if set
        if (innerGroupField && col === innerGroupField) return true;
        
        // Always include percentage columns (they're numeric)
        if (isPercentageColumn(col)) return true;
        
        // Include numeric columns
        const colType = get(columnTypes, col);
        return get(colType, 'isNumeric', false);
      });
    } else {
      // Normal mode: use safeData and compute percentage columns
      dataToExport = safeData.map((row) => {
        const rowWithPercentages = { ...row };
        
        // Compute percentage columns if configured
        if (hasPercentageColumns && percentageColumns) {
          percentageColumns.forEach(pc => {
            if (pc.columnName && pc.targetField && pc.valueField) {
              // Compute percentage value for this row
              const percentageValue = getPercentageColumnValue(row, pc.columnName);
              rowWithPercentages[pc.columnName] = percentageValue;
            }
          });
        }
        
        return rowWithPercentages;
      });
      
      // Collect columns from data plus percentage columns
      const dataColumns = isEmpty(dataToExport) ? [] : uniq(flatMap(dataToExport, (item) =>
        item && typeof item === 'object' ? getDataKeys(item) : []
      ));
      
      // Add percentage columns explicitly (in case they're null/undefined and don't appear as keys)
      const percentageColNames = hasPercentageColumns && percentageColumns 
        ? percentageColumns.map(pc => pc.columnName).filter(Boolean)
        : [];
      
      allColumns = uniq([...dataColumns, ...percentageColNames]);
    }

    // Format and export data (same logic for both modes)
    const exportData = dataToExport.map((row) => {
      const exportRow = {};
      allColumns.forEach((col) => {
        // For percentage columns, the value might already be computed (grouped mode) or we need to compute it (normal mode)
        // But since we computed it in normal mode above, we can just get it from the row
        let value = getDataValue(row, col);
        
        // If value is still null/undefined and it's a percentage column, try computing it
        if (isNil(value) && isPercentageColumn(col)) {
          value = getPercentageColumnValue(row, col);
        }
        
        const colType = get(columnTypes, col);

        // Format the value for export
        if (isNil(value)) {
          exportRow[formatHeaderName(col)] = '';
        } else if (get(colType, 'isBoolean')) {
          exportRow[formatHeaderName(col)] = isTruthyBoolean(value) ? 'Yes' : 'No';
        } else if (get(colType, 'isDate')) {
          exportRow[formatHeaderName(col)] = formatDateValue(value);
        } else {
          // Check if it's a percentage column or numeric value
          const isPctCol = isPercentageColumn(col);
          const isNumeric = isPctCol || get(colType, 'isNumeric') || (typeof value === 'number' && Number.isFinite(value));
          
          if (isNumeric) {
            // For numeric columns (including percentage columns), ensure we write real numbers
            const numeric = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
            exportRow[formatHeaderName(col)] = Number.isFinite(numeric) ? numeric : String(value);
          } else {
            // Non-numeric columns: keep as plain string
            exportRow[formatHeaderName(col)] = String(value);
          }
        }
      });
      return exportRow;
    });

    // Create workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    // Generate filename with current date
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `export_${dateStr}.xlsx`;

    // Write file
    XLSX.writeFile(wb, filename);
  }, [enableBreakdown, reportData, columnGroupBy, safeData, columnTypes, formatHeaderName, isTruthyBoolean, outerGroupField, innerGroupField, groupedData, isPercentageColumn, hasPercentageColumns, percentageColumns, getPercentageColumnValue]);

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
      <FeatureStatusIndicators />
      <TableControls showFullscreenButton={true} enableFullscreenDialog={enableFullscreenDialog} />
      <FilterChips />
      <TableView 
        scrollHeight={scrollHeight || (scrollable ? scrollHeightValue : undefined)}
        tableName={tableName}
      />
      <PaginatorWrapper />

      {/* Fullscreen Dialog */}
      {enableFullscreenDialog && (
      <Dialog
        ref={dialogRef}
        visible={isFullscreen}
        showHeader={false}
        maximizable
        maximized={isMaximized}
        modal
        style={{ width: '70vw', height: '90vh' }}
        contentStyle={{ padding: '1rem', paddingBottom: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100%' }}
        onHide={(e) => {
          if (!isFullscreen) return;
          setIsFullscreen(false);
          setIsMaximized(false);
        }}
        onMaximize={(e) => {
          // onMaximize callback receives { originalEvent, maximized }
          setIsMaximized(e.maximized);
        }}
      >
        <div className="w-full h-full flex flex-col" style={{ height: '100%', maxHeight: '100%', minHeight: 0, overflow: 'hidden' }}>
          <FeatureStatusIndicators className="shrink-0" />
          <TableControls
            showFullscreenButton={false}
            controlsRowClassName="shrink-0"
            enableFullscreenDialog={enableFullscreenDialog}
            onClose={() => {
              setIsFullscreen(false);
              setIsMaximized(false);
            }}
            onMaximizeToggle={() => {
              // Toggle maximize state directly
              setIsMaximized(!isMaximized);
            }}
            isMaximized={isMaximized}
          />
          <FilterChips className="shrink-0" />
          <TableView
            scrollHeight="flex"
            containerClassName="flex-1"
            containerStyle={{ minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            tableName={`${tableName}-dialog`}
          />
          <PaginatorWrapper className="shrink-0" />
        </div>
      </Dialog>
      )}
    </div>
  );
}
