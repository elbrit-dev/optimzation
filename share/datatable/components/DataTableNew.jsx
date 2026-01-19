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
import { useTableOperations } from '../contexts/TableOperationsContext';
import MultiselectFilter from './MultiselectFilter';

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

export default function DataTableNew({
  rowsPerPageOptions = [10, 25, 50, 100],
  defaultRows = 10,
  scrollable = true,
  scrollHeight,
  onOuterGroupClick, // Keep for backward compatibility
  onInnerGroupClick, // Keep for backward compatibility
  enableCellEdit = false,
  onCellEditComplete,
  isCellEditable,
  nonEditableColumns = [],
  enableFullscreenDialog = true,
  tableName = 'table',
  useOrchestrationLayer = false,
}) {
  // Get data and operations from context
  const {
    rawData,
    paginatedData, // Final data for display
    sortedData, // For totalRecords calculation
    groupedData,
    columns,
    columnTypes, // Format: { field_name: "boolean" | "number" | "date" | "string" }
    sums: calculateSums,
    filterOptions,
    filters,
    sortMeta: multiSortMeta,
    pagination,
    expandedRows,
    visibleColumns,
    updateFilter: contextUpdateFilter,
    clearFilter,
    clearAllFilters,
    updateSort,
    updatePagination,
    updateExpandedRows,
    updateVisibleColumns,
    enableSort,
    enableFilter,
    enableSummation,
    enableGrouping,
    enableDivideBy1Lakh,
    textFilterColumns,
    redFields,
    greenFields,
    outerGroupField,
    innerGroupField,
    multiselectColumns,
    hasPercentageColumns,
    percentageColumns,
    percentageColumnNames,
    isPercentageColumn,
    getPercentageColumnValue,
    getPercentageColumnSortFunction,
    formatDateValue,
    formatHeaderName,
    isTruthyBoolean,
    exportToXLSX,
    parseNumericFilter: parseNumericFilterFromContext,
    applyNumericFilter: applyNumericFilterFromContext,
    applyDateFilter: applyDateFilterFromContext,
    isNumericValue,
    openDrawerWithData,
    openDrawerForOuterGroup,
    openDrawerForInnerGroup,
    drawerVisible,
    drawerData,
    drawerTabs,
    activeDrawerTabIndex,
    clickedDrawerValues,
    closeDrawer,
    addDrawerTab,
    removeDrawerTab,
    updateDrawerTab,
    setActiveDrawerTabIndex,
  } = useTableOperations();

  const [first, setFirst] = useState(pagination.first);
  const [rows, setRows] = useState(pagination.rows);
  const [scrollHeightValue, setScrollHeightValue] = useState('600px');
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
    updatePagination(0, defaultRows);
  }, [defaultRows, updatePagination]);

  // Sync local state with context pagination
  useEffect(() => {
    setFirst(pagination.first);
    setRows(pagination.rows);
  }, [pagination]);

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

  // Use data from context - no need for safeData or columns computation
  const safeData = useMemo(() => {
    if (!Array.isArray(paginatedData) || isEmpty(paginatedData)) return [];
    return paginatedData;
  }, [paginatedData]);

  // isNumericValue comes from context - no need to duplicate

  // Helper function to convert string type to boolean flag format (for compatibility with existing code)
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

  // Convert columnTypes from context (string format) to boolean flag format for compatibility
  const columnTypesFlags = useMemo(() => {
    const result = {};
    Object.keys(columnTypes).forEach(col => {
      const typeString = columnTypes[col];
      result[col] = stringTypeToFlags(typeString);
    });
    return result;
  }, [columnTypes, stringTypeToFlags]);

  // Column detection removed - columnTypes comes from context

  // Percentage column helpers come from context - no need to duplicate

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
        const colType = get(columnTypesFlags, col, {});
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
    // Use percentageColumnNames from context
    const percentageColumnNamesLocal = percentageColumnNames || [];

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
  }, [columns, visibleColumns, outerGroupField, innerGroupField, columnTypesFlags, hasPercentageColumns, percentageColumns]);

  const frozenCols = useMemo(
    () => {
      const result = isEmpty(orderedColumns) ? [] : [head(orderedColumns)];
      return result;
    },
    [orderedColumns]
  );

  const regularCols = useMemo(
    () => {
      const result = tail(orderedColumns);
      return result;
    },
    [orderedColumns]
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
        const colType = get(columnTypesFlags, col, {});
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
  // multiselectColumns and optionColumnValues come from context - no need to compute here

  // Filter initialization is handled in DataProviderNew - no need to duplicate here

  const calculateColumnWidths = useMemo(() => {
    const widths = {};
    if (isEmpty(safeData)) return widths;

    const sampleData = take(safeData, 100);

    columns.forEach((col) => {
      const headerLength = formatHeaderName(col).length;
      const cellLengths = [];
      const colType = get(columnTypesFlags, col, { isBoolean: false, isNumeric: false, isDate: false });

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

  // getPercentageColumnSortFunction comes from context - no need to duplicate

  // All data processing removed - using context values instead
  // filteredData, groupedData, sortedData, paginatedData, calculateSums come from context
  // No need to compute them here

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

  // All data processing (groupedData, sortedData, calculateSums, paginatedData) comes from context
  // Use context values directly

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

      const colType = get(columnTypesFlags, column);

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
    
    contextUpdateFilter(col, value);
    updatePagination(0, rows);
  }, [isFullscreen, contextUpdateFilter, updatePagination, rows]);

  // clearFilter comes from context - no need to duplicate

  // clearAllFilters comes from context - use it directly
  // No need to duplicate the logic

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
        const colType = get(columnTypesFlags, col);
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
    const columnOptions = get(filterOptions, col, []);

    return (
      <MultiselectFilter
        value={value}
        options={columnOptions}
        onChange={(newValue) => updateFilter(col, newValue)}
        placeholder="Select..."
        fieldName={formatHeaderName(col)}
      />
    );
  }, [filters, updateFilter, filterOptions, formatHeaderName]);

  const getFilterElement = useCallback((col) => {
    // Percentage columns always use numeric filter
    if (isPercentageColumn(col)) {
      return numericFilterElement(col);
    }

    const colType = get(columnTypesFlags, col);
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

    const colType = get(columnTypesFlags, col);
    const isBooleanCol = get(colType, 'isBoolean', false);
    const isDateCol = get(colType, 'isDate', false);
    const isNumericCol = get(colType, 'isNumeric', false);
    const isOuterGroupCol = col === outerGroupField;
    const isInnerGroupCol = col === innerGroupField;
    const colorClass = getColumnColorClass(col);

    // Handle clickable group columns - use context drawer actions
    if (isOuterGroupCol) {
      return (rowData) => {
        const value = getDataValue(rowData, col);
        const cellValue = formatCellValue(value, colType);
        return (
          <div
            className={`text-xs sm:text-sm truncate cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded transition-colors ${isNumericCol ? 'text-right' : 'text-left'} ${colorClass}`}
            title={cellValue}
            onClick={(e) => {
              e.stopPropagation();
              // Use context function to filter and open drawer
              openDrawerForOuterGroup(value);
              // Still call parent callback if provided (for backward compatibility)
              if (onOuterGroupClick) {
                onOuterGroupClick(rowData, col, value);
              }
            }}
          >
            {cellValue}
          </div>
        );
      };
    }

    if (isInnerGroupCol) {
      return (rowData) => {
        const value = getDataValue(rowData, col);
        const cellValue = formatCellValue(value, colType);
        const outerValue = getDataValue(rowData, outerGroupField);
        return (
          <div
            className={`text-xs sm:text-sm truncate cursor-pointer hover:bg-green-50 px-1 py-0.5 rounded transition-colors ${isNumericCol ? 'text-right' : 'text-left'} ${colorClass}`}
            title={cellValue}
            onClick={(e) => {
              e.stopPropagation();
              // Use context function to filter and open drawer
              openDrawerForInnerGroup(outerValue, value);
              // Still call parent callback if provided (for backward compatibility)
              if (onInnerGroupClick) {
                onInnerGroupClick(rowData, col, value);
              }
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
  }, [columnTypesFlags, outerGroupField, innerGroupField, onOuterGroupClick, onInnerGroupClick, booleanBodyTemplate, dateBodyTemplate, formatCellValue, isPercentageColumn, getPercentageColumnValue, getColumnColorClass, openDrawerForOuterGroup, openDrawerForInnerGroup]);

  // Helper to check if a column (top-level key) is in sortFields

  // Header template function to apply column colors (sort buttons moved to DataProvider)
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

    const colType = get(columnTypesFlags, col);
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
  }, [enableCellEdit, columnTypesFlags, outerGroupField, innerGroupField, nonEditableColumns, isCellEditable]);

  // Handle cell edit complete
  const handleCellEditComplete = useCallback((e) => {
    const { rowData, newValue, field, originalEvent: event } = e;
    const oldValue = getDataValue(rowData, field);

    // Store old value before update
    const colType = get(columnTypesFlags, field);
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
    return outerGroupField && rowData.__isGroupRow__ && rowData.__groupRows__ && rowData.__groupRows__.length > 0;
  }, [outerGroupField]);

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
        const colType = get(columnTypesFlags, col);
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
          return applyDateFilterFromContext(cellValue, filterValue);
        }

        // Treat percentage columns as numeric filters, same as main
        if (isPctCol || get(colType, 'isNumeric')) {
          const parsedFilter = parseNumericFilterFromContext(filterValue);
          return applyNumericFilterFromContext(cellValue, parsedFilter);
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
      const colType = get(columnTypesFlags, col);
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
              const colType = get(columnTypesFlags, col);
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
    updatePagination(event.first, event.rows);
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
        {updateVisibleColumns && !isEmpty(availableColumnsForVisibility) && (
          <IconOnlyMultiselectFilter
            value={visibleColumns}
            options={availableColumnsForVisibility.map(col => ({
              label: formatHeaderName(col),
              value: col,
            }))}
            onChange={updateVisibleColumns}
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
          updateSort(e.multiSortMeta || []);
          updatePagination(0, rows);
        }}
        showGridlines
        stripedRows
        className="p-datatable-sm w-full"
        style={{ minWidth: '100%' }}
        filterDisplay={enableFilter ? "row" : undefined}
        expandedRows={expandedRows}
        onRowToggle={(e) => updateExpandedRows(e.data)}
        rowExpansionTemplate={outerGroupField ? rowExpansionTemplate : undefined}
        dataKey={outerGroupField ? "__groupKey__" : undefined}
        editMode={enableCellEdit ? "cell" : undefined}
      >
        {outerGroupField && (
          <Column
            expander={allowExpansion}
            style={{ width: '3rem' }}
          />
        )}
        {frozenCols.map((col, index) => {
          const isPctCol = isPercentageColumn(col);
          const colType = get(columnTypesFlags, col);
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
          const colType = get(columnTypesFlags, col);
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
