'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Calendar } from 'primereact/calendar';
import { Paginator } from 'primereact/paginator';
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

function MultiselectFilter({ value, options, onChange, placeholder = "Select...", fieldName }) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef(null);
  const selectedValues = value || [];

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = React.useMemo(() => {
    if (!searchTerm) return options;
    const term = toLower(searchTerm);
    return filter(options, opt => includes(toLower(String(opt.label)), term));
  }, [options, searchTerm]);

  const toggleValue = (val) => {
    if (includes(selectedValues, val)) {
      onChange(filter(selectedValues, v => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const clearAll = () => {
    onChange([]);
    setSearchTerm('');
  };

  const selectAll = () => {
    onChange(options.map(o => o.value));
  };

  return (
    <div ref={containerRef} className="relative multiselect-filter-container">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-2 py-1.5 text-xs border rounded bg-white hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${
          isEmpty(selectedValues) ? 'border-gray-300 text-gray-500' : 'border-blue-400 text-blue-700 bg-blue-50'
        }`}
      >
        <span className="truncate">
          {isEmpty(selectedValues) ? placeholder : `${selectedValues.length} Filter${selectedValues.length !== 1 ? 's' : ''}`}
        </span>
        <i className={`pi ${isOpen ? 'pi-chevron-up' : 'pi-chevron-down'} text-[10px] ml-1 flex-shrink-0`}></i>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-[9999] w-56 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden" style={{ minWidth: '200px' }}>
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
            {!isEmpty(selectedValues) && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">{selectedValues.length} selected</span>
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
                const isSelected = includes(selectedValues, opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-xs ${
                      isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'
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
      )}
    </div>
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
  textFilterColumns = [], // Fields that should use text search box instead of multiselect
  redFields = [],
  greenFields = [],
}) {
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(defaultRows);
  const [filters, setFilters] = useState({});
  const [scrollHeightValue, setScrollHeightValue] = useState('600px');
  const [multiSortMeta, setMultiSortMeta] = useState([]);

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

  const frozenCols = useMemo(
    () => isEmpty(columns) ? [] : [head(columns)],
    [columns]
  );
  
  const regularCols = useMemo(
    () => tail(columns),
    [columns]
  );

  const isNumericValue = useCallback((value) => {
    if (isNil(value)) return false;
    return isNumber(value) || (!_isNaN(parseFloat(value)) && _isFinite(value));
  }, []);

  const formatHeaderName = useCallback((key) => {
    return startCase(key.split('__').join(' ').split('_').join(' '));
  }, []);

  const formatCellValue = useCallback((value, colType) => {
    if (isNil(value)) return '';
    
    // Format dates
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
      let binaryCount = 0; // Count of 0/1 values
      let nonNullCount = 0;

      sampleData.forEach((row) => {
        const value = get(row, col);
        if (!isNil(value)) {
          nonNullCount++;
          if (isBoolean(value)) booleanCount++;
          // Check for binary 0/1 values (number or string)
          else if (value === 0 || value === 1 || value === '0' || value === '1') {
            binaryCount++;
          }
          // Check for date (before numeric to avoid timestamp confusion)
          else if (isDateLike(value)) {
            dateCount++;
          }
          // Check for numeric
          else if (isNumericValue(value)) {
            numericCount++;
          }
        }
      });

      const isTrueBooleanColumn = nonNullCount > 0 && booleanCount > nonNullCount * 0.7;
      // Infer boolean from 0/1 if all non-null values are binary
      const isBinaryBooleanColumn = nonNullCount > 0 && binaryCount === nonNullCount && binaryCount >= 1;
      const isBooleanColumn = isTrueBooleanColumn || isBinaryBooleanColumn;
      
      // Date detection: at least 70% should be date-like
      const isDateColumn = !isBooleanColumn && nonNullCount > 0 && dateCount > nonNullCount * 0.7;
      
      // Numeric detection: at least 80% should be numeric (excluding dates and booleans)
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

  // Compute unique values for multiselect columns
  const optionColumnValues = useMemo(() => {
    const values = {};
    if (isEmpty(safeData) || isEmpty(multiselectColumns)) return values;

    multiselectColumns.forEach((col) => {
      const uniqueVals = compact(uniq(safeData.map((row) => get(row, col))));
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
          // Update matchMode if column type changed
          const colType = get(columnTypes, col);
          const isMultiselectColumn = includes(multiselectColumns, col);
          const currentFilter = newFilters[col];

          // Update matchMode if needed, but preserve the value
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
      const headerLength = formatHeaderName(col).length;
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

      const minWidth = isBooleanColumn ? 100 : isDateColumn ? 180 : isNumericColumn ? 130 : 140;
      const maxWidth = isBooleanColumn ? 180 : isDateColumn ? 280 : isNumericColumn ? 250 : 400;

      widths[col] = clamp(finalWidth, minWidth, maxWidth);
    });

    return widths;
  }, [safeData, columns, enableSort, formatHeaderName, formatCellValue, columnTypes]);

  const filteredData = useMemo(() => {
    if (isEmpty(safeData)) return [];

    return filter(safeData, (row) => {
      if (!row || typeof row !== 'object') return false;

      return every(columns, (col) => {
        const filterObj = get(filters, col);
        if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;
        
        // Handle empty arrays for multiselect
        if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;

        const cellValue = get(row, col);
        const filterValue = filterObj.value;
        const colType = get(columnTypes, col);
        const isMultiselectColumn = includes(multiselectColumns, col);

        // Multiselect filter (multiselect columns)
        if (isMultiselectColumn && isArray(filterValue)) {
          return some(filterValue, (v) => v === cellValue || String(v) === String(cellValue));
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
    });
  }, [safeData, filters, columns, columnTypes, multiselectColumns]);

  const sortedData = useMemo(() => {
    if (isEmpty(filteredData) || isEmpty(multiSortMeta)) {
      return filteredData;
    }

    const fields = multiSortMeta.map(s => s.field);
    const orders = multiSortMeta.map(s => s.order === 1 ? 'asc' : 'desc');
    
    return orderBy(filteredData, fields, orders);
  }, [filteredData, multiSortMeta]);

  const calculateSums = useMemo(() => {
    const sums = {};
    if (isEmpty(filteredData)) return sums;

    columns.forEach((col) => {
      const colType = get(columnTypes, col);
      // Skip date columns for summation
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

  const paginatedData = useMemo(() => {
    return sortedData.slice(first, first + rows);
  }, [sortedData, first, rows]);

  const footerTemplate = (column, isFirstColumn = false) => {
    if (!enableSummation) return null;
    
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
  };

  // Helper to normalize boolean values (handles true/false and 1/0)
  const isTruthyBoolean = useCallback((value) => {
    return value === true || value === 1 || value === '1';
  }, []);

  const booleanBodyTemplate = useCallback((rowData, column) => {
    const value = get(rowData, column);
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
  }, [isTruthyBoolean]);

  const dateBodyTemplate = useCallback((rowData, column) => {
    const value = get(rowData, column);
    const formatted = formatDateValue(value);

    return (
      <div className="text-xs sm:text-sm truncate text-left" title={formatted}>
        {formatted}
      </div>
    );
  }, []);

  const updateFilter = useCallback((col, value) => {
    setFilters(prev => ({
      ...prev,
      [col]: { ...get(prev, col), value }
    }));
    setFirst(0);
  }, []);

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
    return active;
  }, [filters, columns, enableFilter, columnTypes, formatFilterValue, multiselectColumns]);

  const textFilterElement = useCallback((col) => {
    const TextFilter = (options) => {
      const filterState = get(filters, col);
      const value = isNil(get(filterState, 'value')) ? '' : filterState.value;
      return (
        <InputText
          value={value}
          onChange={(e) => updateFilter(col, e.target.value || null)}
          placeholder="Search..."
          className="p-column-filter"
          style={{ width: '100%' }}
        />
      );
    };
    TextFilter.displayName = 'TextFilter';
    return TextFilter;
  }, [filters, updateFilter]);

  const numericFilterElement = useCallback((col) => {
    const NumericFilter = (options) => {
      const filterState = get(filters, col);
      const value = isNil(get(filterState, 'value')) ? '' : filterState.value;
      return (
        <InputText
          value={value}
          onChange={(e) => updateFilter(col, e.target.value || null)}
          placeholder="<, >, <=, >=, =, <>"
          className="p-column-filter"
          style={{ width: '100%' }}
          title="Numeric filters: <10, >10, <=10, >=10, =10, 10<>20 (range)"
        />
      );
    };
    NumericFilter.displayName = 'NumericFilter';
    return NumericFilter;
  }, [filters, updateFilter]);

  const dateFilterElement = useCallback((col) => {
    const DateFilter = (options) => {
      const filterState = get(filters, col);
      const value = get(filterState, 'value', null);
      return (
        <DateRangeFilter
          value={value}
          onChange={(newValue) => updateFilter(col, newValue)}
        />
      );
    };
    DateFilter.displayName = 'DateFilter';
    return DateFilter;
  }, [filters, updateFilter]);

  const booleanFilterElement = useCallback((col) => {
    const BooleanFilter = () => {
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
    };
    BooleanFilter.displayName = 'BooleanFilter';
    return BooleanFilter;
  }, [filters, updateFilter]);

  const multiselectFilterElement = useCallback((col) => {
    const MultiselectFilterElement = (options) => {
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
    };
    MultiselectFilterElement.displayName = 'MultiselectFilterElement';
    return MultiselectFilterElement;
  }, [filters, updateFilter, optionColumnValues, formatHeaderName]);

  const getFilterElement = useCallback((col) => {
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
  }, [columnTypes, multiselectColumns, booleanFilterElement, dateFilterElement, numericFilterElement, textFilterElement, multiselectFilterElement]);

  const getBodyTemplate = useCallback((col) => {
    const colType = get(columnTypes, col);
    const isBooleanCol = get(colType, 'isBoolean', false);
    const isDateCol = get(colType, 'isDate', false);
    const isNumericCol = get(colType, 'isNumeric', false);

    if (isBooleanCol) {
      return (rowData) => booleanBodyTemplate(rowData, col);
    }
    if (isDateCol) {
      return (rowData) => dateBodyTemplate(rowData, col);
    }
    const DefaultBodyTemplate = (rowData) => (
      <div
        className={`text-xs sm:text-sm truncate ${isNumericCol ? 'text-right' : 'text-left'}`}
        title={formatCellValue(get(rowData, col), colType)}
      >
        {formatCellValue(get(rowData, col), colType)}
      </div>
    );
    DefaultBodyTemplate.displayName = 'DefaultBodyTemplate';
    return DefaultBodyTemplate;
  }, [columnTypes, booleanBodyTemplate, dateBodyTemplate, formatCellValue]);

  const onPageChange = (event) => {
    setFirst(event.first);
    setRows(event.rows);
  };

  const exportToXLSX = useCallback(() => {
    // Prepare data for export - use sortedData (filtered and sorted)
    const exportData = sortedData.map((row) => {
      const exportRow = {};
      columns.forEach((col) => {
        const value = get(row, col);
        const colType = get(columnTypes, col);

        // Format the value for export
        if (isNil(value)) {
          exportRow[formatHeaderName(col)] = '';
        } else if (get(colType, 'isBoolean')) {
          exportRow[formatHeaderName(col)] = isTruthyBoolean(value) ? 'Yes' : 'No';
        } else if (get(colType, 'isDate')) {
          exportRow[formatHeaderName(col)] = formatDateValue(value);
        } else {
          exportRow[formatHeaderName(col)] = formatCellValue(value, colType);
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
  }, [sortedData, columns, columnTypes, formatHeaderName, formatCellValue, isTruthyBoolean]);

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

      {/* Export button */}
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

      {/* Filter Chips */}
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
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden w-full responsive-table-container">
        <DataTable
          value={paginatedData}
          scrollable={scrollable}
          scrollHeight={scrollHeightValue}
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
        >
          {frozenCols.map((col, index) => {
            const colType = get(columnTypes, col);
            const isNumericCol = get(colType, 'isNumeric', false);
            const isFirstColumn = index === 0;
            return (
              <Column
                key={`frozen-${col}`}
                field={col}
                header={formatHeaderName(col)}
                sortable={enableSort}
                frozen
                style={{
                  minWidth: `${get(calculateColumnWidths, col, 120)}px`,
                  width: `${get(calculateColumnWidths, col, 120)}px`,
                  maxWidth: `${get(calculateColumnWidths, col, 200)}px`
                }}
                filter={enableFilter}
                filterElement={enableFilter ? getFilterElement(col) : undefined}
                showFilterMenu={false}
                showClearButton={false}
                footer={footerTemplate(col, isFirstColumn)}
                body={getBodyTemplate(col)}
                align={isNumericCol ? 'right' : 'left'}
              />
            );
          })}

          {regularCols.map((col) => {
            const colType = get(columnTypes, col);
            const isNumericCol = get(colType, 'isNumeric', false);
            return (
              <Column
                key={col}
                field={col}
                header={formatHeaderName(col)}
                sortable={enableSort}
                style={{
                  minWidth: `${get(calculateColumnWidths, col, 120)}px`,
                  width: `${get(calculateColumnWidths, col, 120)}px`,
                  maxWidth: `${get(calculateColumnWidths, col, 400)}px`
                }}
                filter={enableFilter}
                filterElement={enableFilter ? getFilterElement(col) : undefined}
                showFilterMenu={false}
                showClearButton={false}
                footer={footerTemplate(col)}
                body={getBodyTemplate(col)}
                align={isNumericCol ? 'right' : 'left'}
              />
            );
          })}
        </DataTable>
      </div>

      <div className="mt-4">
        <Paginator
          first={first}
          rows={rows}
          totalRecords={sortedData.length}
          rowsPerPageOptions={rowsPerPageOptions}
          onPageChange={onPageChange}
          template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
        />
      </div>
    </div>
  );
}