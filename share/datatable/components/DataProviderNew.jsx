'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { OverlayPanel } from 'primereact/overlaypanel';
import { filter as lodashFilter } from 'lodash';
import dayjs from 'dayjs';
import * as Comlink from 'comlink';
import MonthRangePicker from '@/components/MonthRangePicker';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { getInitialEndpoint, getEndpointConfigFromUrlKey } from '@/app/graphql-playground/constants';
import { createExecutionContext, executePipeline, fetchGraphQLRequest } from '@/app/graphql-playground/utils/query-pipeline';
import { extractDataFromResponse } from '@/app/graphql-playground/utils/data-extractor';
import { indexedDBService } from '@/app/datatable/utils/indexedDBService';
import { parseGraphQLVariables } from '@/app/graphql-playground/utils/variableParser';
import { extractValueFromGraphQLResponse } from '@/app/graphql-playground/utils/queryExtractor';
import { extractYearMonthFromDate, generateMonthRangeArray } from '@/app/datatable/utils/dateUtils';
import { getDataKeys, getDataValue, getNestedValue } from '../utils/dataAccessUtils';
import { TableOperationsContext } from '../contexts/TableOperationsContext';
import { transformToReportData } from '../utils/reportUtils';
import { Sidebar } from 'primereact/sidebar';
import { TabView, TabPanel } from 'primereact/tabview';
import DataTableComponent from './DataTableOld';
import MultiselectFilter from './MultiselectFilter';
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
  toLower,
  includes,
  isBoolean,
  isString,
  isDate,
  head,
  toNumber,
  isNaN as _isNaN,
  trim,
  some,
  isArray,
  every,
} from 'lodash';

/**
 * Utility function to extract full date/timestamp from index query response
 * Uses the unified extractValueFromGraphQLResponse utility
 * @param {string} indexQuery - The index GraphQL query string
 * @param {Object} jsonResponse - The JSON response from the index query
 * @returns {string|null} The extracted full date/timestamp string or null if not found
 */
function extractFullDateFromIndexResponse(indexQuery, jsonResponse) {
  return extractValueFromGraphQLResponse(indexQuery, jsonResponse);
}

/**
 * Utility function to execute monthIndex query and extract YYYY-MM from the single date field
 * @param {string} monthIndexQuery - The monthIndex GraphQL query string
 * @param {Object} queryDoc - The query document containing urlKey and variables
 * @returns {Promise<string|null>} The extracted YYYY-MM string or null if not found
 */
async function executeMonthIndexQueryAndExtractYearMonth(monthIndexQuery, queryDoc) {
  if (!monthIndexQuery || !monthIndexQuery.trim()) {
    return null;
  }

  try {
    // Get endpoint/auth from query's urlKey, fallback to default
    const { endpointUrl, authToken } = getEndpointAndAuth(queryDoc);

    if (!endpointUrl) {
      console.warn('No endpoint available for monthIndex query execution');
      return null;
    }

    // Parse variables if provided
    const parsedVariables = parseGraphQLVariables(queryDoc.variables || '');

    // Execute the monthIndex query
    const response = await fetchGraphQLRequest(monthIndexQuery, parsedVariables, {
      endpointUrl,
      authToken
    });

    // Parse JSON response
    const jsonResponse = await response.json();

    if (jsonResponse.errors) {
      console.error('GraphQL errors for monthIndex query:', jsonResponse.errors);
      return null;
    }

    // Extract the date value using the unified utility
    const dateValue = extractValueFromGraphQLResponse(monthIndexQuery, jsonResponse);

    if (!dateValue) {
      return null;
    }

    // Extract YYYY-MM from the date value using dayjs utility
    return extractYearMonthFromDate(dateValue);
  } catch (error) {
    console.error('Error executing monthIndex query:', error);
    return null;
  }
}


/**
 * Helper function to get endpoint URL and auth token from query document
 * @param {Object} queryDoc - Query document with optional urlKey
 * @returns {Object} Object with endpointUrl and authToken, or null values if not available
 */
function getEndpointAndAuth(queryDoc) {
  let endpointUrl, authToken;

  if (queryDoc?.urlKey) {
    const config = getEndpointConfigFromUrlKey(queryDoc.urlKey);
    endpointUrl = config.endpointUrl;
    authToken = config.authToken;
  }

  // Fallback to default endpoint if urlKey didn't provide one
  if (!endpointUrl) {
    const defaultEndpoint = getInitialEndpoint();
    endpointUrl = defaultEndpoint?.code;
    authToken = null; // Will use DEFAULT_AUTH_TOKEN
  }

  return { endpointUrl, authToken };
}


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
 * Rejects ambiguous strings like "ARNIBLOC 100" that might parse as dates but aren't date patterns
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

    // Reject pure numbers without date separators
    if (/^-?\d+$/.test(trimmed)) return false;

    // Reject strings with mixed letters/numbers that don't match date patterns
    // e.g., "ARNIBLOC 100" should be rejected
    // Check if it contains letters (not just numbers and date separators)
    const hasLetters = /[a-zA-Z]/.test(trimmed);
    if (hasLetters) {
      // Only accept if it matches a known date pattern (e.g., "Jan 15, 2024")
      if (!DATE_PATTERNS.some(pattern => pattern.test(trimmed))) {
        return false;
      }
    }

    // Check against known date patterns first
    if (DATE_PATTERNS.some(pattern => pattern.test(trimmed))) {
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        // Validate date is in reasonable range (1900-2100)
        const year = parsed.getFullYear();
        if (year >= 1900 && year <= 2100) {
          return true;
        }
      }
    }

    // For strings without letters, try parsing but be more strict
    // Reject if it's just a number (already checked above)
    // Only accept if it has date separators and parses correctly
    if (!hasLetters) {
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        // Must have date separators (/, -, .) or be ISO format
        const hasSeparators = /[\/\-\.]/.test(trimmed) || /^\d{4}-\d{2}-\d{2}/.test(trimmed);
        if (hasSeparators) {
          const year = parsed.getFullYear();
          if (year >= 1900 && year <= 2100) {
            return !/^-?\d+\.?\d*$/.test(trimmed);
          }
        }
      }
    }
  }
  return false;
}

/**
 * Check if a value is a boolean (strict check)
 * Accepts: true, false, 'true', 'false', 'yes', 'no', 'y', 'n', '1', '0' (case-insensitive)
 */
function isBooleanValue(value) {
  if (isBoolean(value)) return true;
  if (isString(value)) {
    const lower = trim(value).toLowerCase();
    return lower === 'true' || lower === 'false' ||
      lower === 'yes' || lower === 'no' ||
      lower === 'y' || lower === 'n' ||
      lower === '1' || lower === '0';
  }
  if (isNumber(value)) {
    return value === 0 || value === 1;
  }
  return false;
}

/**
 * Check if a value is numeric (strict check)
 * Accepts: numbers, numeric strings (with optional thousands separators, decimals, signs)
 * Rejects: strings with letters (except scientific notation)
 */
function isNumericValue(value) {
  if (isNumber(value)) return true;
  if (isString(value)) {
    const trimmed = trim(value);
    if (trimmed === '') return false;

    // Remove thousands separators (commas) for checking
    const withoutCommas = trimmed.replace(/,/g, '');

    // Check if it's a valid number pattern
    // Allow: optional sign, digits, optional decimal point, optional exponent
    // Reject if contains letters (except 'e' or 'E' for scientific notation)
    const numericPattern = /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/;
    if (numericPattern.test(withoutCommas)) {
      // Verify it actually parses to a number
      const parsed = toNumber(withoutCommas);
      return !_isNaN(parsed);
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
 * Get distributed samples from data: half the data from top, middle, and bottom thirds
 * Only includes non-null values
 * @param {Array} data - Array of row objects
 * @param {string} topLevelKey - Top-level key (e.g., "user")
 * @param {string} nestedPath - Nested path (e.g., "profile.name")
 * @returns {Array} Array of non-null sample values
 */
function getDistributedSamples(data, topLevelKey, nestedPath) {
  if (!data || data.length === 0) return [];

  const targetSampleSize = Math.floor(data.length / 2);
  if (targetSampleSize === 0) return [];

  const samples = [];
  const dataLength = data.length;

  // Divide data into thirds
  const thirdSize = Math.floor(dataLength / 3);
  const topEnd = thirdSize;
  const middleStart = thirdSize;
  const middleEnd = thirdSize * 2;
  const bottomStart = thirdSize * 2;

  // Calculate samples per third (distribute evenly)
  const samplesPerThird = Math.ceil(targetSampleSize / 3);

  // Sample from top third
  const topStep = Math.max(1, Math.floor(topEnd / samplesPerThird));
  for (let i = 0; i < topEnd && samples.length < targetSampleSize; i += topStep) {
    const value = getNestedValue(data[i], topLevelKey, nestedPath);
    if (value != null) {
      samples.push(value);
      if (samples.length >= targetSampleSize) break;
    }
  }

  // Sample from middle third
  const middleStep = Math.max(1, Math.floor((middleEnd - middleStart) / samplesPerThird));
  for (let i = middleStart; i < middleEnd && samples.length < targetSampleSize; i += middleStep) {
    const value = getNestedValue(data[i], topLevelKey, nestedPath);
    if (value != null) {
      samples.push(value);
      if (samples.length >= targetSampleSize) break;
    }
  }

  // Sample from bottom third
  const bottomStep = Math.max(1, Math.floor((dataLength - bottomStart) / samplesPerThird));
  for (let i = bottomStart; i < dataLength && samples.length < targetSampleSize; i += bottomStep) {
    const value = getNestedValue(data[i], topLevelKey, nestedPath);
    if (value != null) {
      samples.push(value);
      if (samples.length >= targetSampleSize) break;
    }
  }

  // If we still need more samples (due to many nulls), fill from remaining data
  // Use a Set to track seen values for efficiency (though duplicates are okay for type detection)
  if (samples.length < targetSampleSize) {
    const seen = new Set();
    for (let i = 0; i < dataLength && samples.length < targetSampleSize; i++) {
      const value = getNestedValue(data[i], topLevelKey, nestedPath);
      if (value != null) {
        // Use a simple string representation for Set comparison
        const key = typeof value === 'object' ? String(value) : value;
        if (!seen.has(key)) {
          seen.add(key);
          samples.push(value);
        }
      }
    }
  }

  return samples;
}

/**
 * Infer column type from data samples
 * Uses smart sampling (half data from top/middle/bottom) and single-pass detection
 * @param {Array} data - Array of row objects
 * @param {string} field - Full field path (e.g., "user.profile.name")
 * @param {string} topLevelKey - Top-level key (e.g., "user")
 * @param {string} nestedPath - Nested path (e.g., "profile.name")
 * @returns {string} Type: "number" | "date" | "boolean" | "string"
 */
function inferColumnType(data, field, topLevelKey, nestedPath) {
  if (!data || data.length === 0) return 'string';

  // Get distributed samples (half the data from top, middle, bottom thirds)
  const samples = getDistributedSamples(data, topLevelKey, nestedPath);

  if (samples.length === 0) return 'string';

  // Single-pass algorithm: check all types in one pass
  let booleanCount = 0;
  let numberCount = 0;
  let dateCount = 0;

  for (const value of samples) {
    if (isBooleanValue(value)) {
      booleanCount++;
    } else if (isNumericValue(value)) {
      numberCount++;
    } else if (isDateLike(value)) {
      dateCount++;
    }
  }

  // Strict checks: boolean and number require ALL samples to match
  if (booleanCount === samples.length) return 'boolean';
  if (numberCount === samples.length) return 'number';

  // Majority rule for dates: ≥50% must be date-like
  if (dateCount > samples.length / 2) return 'date';

  // Default to string
  return 'string';
}

/**
 * Format a date for display
 */
function formatDateValue(value) {
  if (isNil(value) || value === '' || value === 0 || value === '0') return '';
  const date = parseToDate(value);
  if (!date) return String(value ?? '');

  let hasTime = false;
  let hasSeconds = false;
  let hasMilliseconds = false;

  if (isString(value)) {
    const trimmed = trim(value);
    hasMilliseconds = /\.\d{1,3}Z?$/.test(trimmed) || /\.\d{1,3}[+-]/.test(trimmed);
    hasSeconds = /:\d{2}(\.|Z|[+-]|$)/.test(trimmed) || /:\d{2}:\d{2}/.test(trimmed);
    hasTime = /T\d{2}:\d{2}/.test(trimmed) || /\d{1,2}:\d{2}/.test(trimmed);
  } else {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const milliseconds = date.getMilliseconds();
    hasTime = hours !== 0 || minutes !== 0 || seconds !== 0 || milliseconds !== 0;
    hasSeconds = seconds !== 0 || milliseconds !== 0;
    hasMilliseconds = milliseconds !== 0;
  }

  if (!hasTime) {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

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

  let formatted = date.toLocaleString('en-US', formatOptions);

  if (hasMilliseconds) {
    const ms = date.getMilliseconds();
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

export default function DataProviderNew({
  offlineData,
  onDataChange,
  onError,
  onTableDataChange,
  onRawDataChange, // New callback to pass raw/original data for Auth Control
  renderHeaderControls,
  onDataSourceChange,
  variableOverrides = {},
  onVariablesChange,
  // Callbacks to expose state for selectors in parent
  onSavedQueriesChange,
  onLoadingQueriesChange,
  onExecutingQueryChange,
  onAvailableQueryKeysChange,
  onSelectedQueryKeyChange,
  onLoadingDataChange,
  // Auth control props
  isAdminMode = false,
  salesTeamColumn = null,
  salesTeamValues = [],
  hqColumn = null,
  hqValues = [],
  // Data source and query key props
  dataSource: dataSourceProp = 'offline',
  selectedQueryKey: selectedQueryKeyProp = null,
  // Table operation props (for orchestration layer)
  enableSort = true,
  enableFilter = true,
  enableSummation = true,
  enableGrouping = true,
  textFilterColumns = [],
  visibleColumns = [],
  onVisibleColumnsChange,
  percentageColumns = [],
  outerGroupField = null,
  innerGroupField = null,
  redFields = [],
  greenFields = [],
  enableDivideBy1Lakh = false,
  columnTypesOverride = {}, // Object with column names as keys and type strings as values: {columnName: "date" | "number" | "boolean" | "string"}
  // Drawer props
  drawerTabs = [],
  onDrawerTabsChange,
  // Report props
  enableReport = false,
  dateColumn = null,
  breakdownType = 'month',
  onBreakdownTypeChange,
  useOrchestrationLayer = false,
  children
}) {
  const [dataSource, setDataSource] = useState(dataSourceProp);
  const [selectedQueryKey, setSelectedQueryKey] = useState(selectedQueryKeyProp);

  // Sync props with state when props change (for controlled component)
  useEffect(() => {
    setDataSource(dataSourceProp);
  }, [dataSourceProp]);

  useEffect(() => {
    setSelectedQueryKey(selectedQueryKeyProp);
  }, [selectedQueryKeyProp]);

  const [savedQueries, setSavedQueries] = useState([]);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [executingQuery, setExecutingQuery] = useState(false);
  const [loadingFromCache, setLoadingFromCache] = useState(false);
  const [processedData, setProcessedData] = useState(null);
  const [monthRange, setMonthRange] = useState(null); // Array of [startMonth, endMonth] or null
  const [hasMonthSupport, setHasMonthSupport] = useState(false); // Whether the current query supports month filtering
  const [queryVariables, setQueryVariables] = useState({}); // Variables from the saved query
  const [currentQueryDoc, setCurrentQueryDoc] = useState(null); // Current query document
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null); // Last updated timestamp string from IndexedDB
  const [selectedSalesTeams, setSelectedSalesTeams] = useState([]); // Selected Sales Teams for filter
  const [selectedHqTeams, setSelectedHqTeams] = useState([]); // Selected HQ Teams for filter
  const [searchTerm, setSearchTerm] = useState(''); // Global search input value (applied)
  const [searchInputValue, setSearchInputValue] = useState(''); // Local input value (not applied until Enter/button)
  const [sortConfig, setSortConfig] = useState(null); // {field: "topLevelKey.nestedPath", direction: "asc" | "desc"}
  const queryVariablesRef = useRef({}); // Ref to track variables immediately (for synchronous access)
  const executingQueryIdRef = useRef(null); // Track which query is currently executing to prevent duplicates
  const executingQueriesRef = useRef(new Set()); // Track executing queries with queryId + variables key to prevent duplicates
  const executionContextRef = useRef(null); // Persist execution context across runs for caching
  const pipelineExecutionInFlightRef = useRef(new Map()); // Track pipeline executions in flight to prevent concurrent execution: queryId -> { endpointUrl }
  const isInitialLoadRef = useRef(false); // Track if we're in initial load phase to prevent monthRange effect from triggering
  const workerRef = useRef(null); // Ref to store worker proxy
  const allQueryDocsRef = useRef({}); // Cache of all query documents for worker
  const indexQueriesExecutedRef = useRef(false); // Track if index queries have been executed
  const cacheLoadInProgressRef = useRef(null); // Track if cache load is in progress to prevent duplicate calls
  const previousDataSourceRef = useRef(dataSource); // Track previous dataSource to detect changes
  const queryKeySetForDataSourceRef = useRef(null); // Track which dataSource we've set queryKey for
  const lastSetQueryKeyRef = useRef(null); // Track the last queryKey we set to prevent unnecessary updates

  // Store onError in ref to avoid dependency issues (only runs once on mount)
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Initialize worker on mount
  useEffect(() => {
    const initializeWorker = async () => {
      try {
        // Create worker - Next.js handles worker imports differently
        // Use dynamic import or direct worker path
        let worker;
        try {
          // Try to create worker using new URL pattern (works in modern environments)
          worker = new Worker(
            new URL('../workers/queryWorker.js', import.meta.url),
            { type: 'module' }
          );
        } catch (error) {
          // Fallback: try absolute path pattern
          console.warn('Failed to create worker with import.meta.url, trying alternative:', error);
          // Worker may not be available in this environment, continue without worker
          return;
        }

        // Wrap with Comlink
        const workerAPI = Comlink.wrap(worker);

        // Set up nested query callback
        const nestedQueryCallback = Comlink.proxy(async (queryId) => {
          // Load query from Firestore
          const queryDoc = await firestoreService.loadQuery(queryId);
          if (queryDoc) {
            // Cache it
            allQueryDocsRef.current[queryId] = queryDoc;
            // Ensure transformerCode is explicitly included (Comlink may strip it during serialization)
            // Return a new object with all fields explicitly set to ensure proper serialization
            return {
              ...queryDoc,
              transformerCode: queryDoc.transformerCode || null, // Explicitly include, even if null
            };
          }
          return queryDoc;
        });
        await workerAPI.setNestedQueryCallback(nestedQueryCallback);

        // Set up endpoint config getter
        const endpointConfigGetter = Comlink.proxy((urlKey) => {
          if (urlKey) {
            return getEndpointConfigFromUrlKey(urlKey);
          } else {
            return { endpointUrl: getInitialEndpoint()?.code || null, authToken: null };
          }
        });
        await workerAPI.setEndpointConfigGetter(endpointConfigGetter);

        // Set up global functions getter
        const globalFunctionsGetter = Comlink.proxy(async () => {
          try {
            return await firestoreService.loadGlobalFunctions();
          } catch (error) {
            console.error('Failed to load global functions:', error);
            return '';
          }
        });
        await workerAPI.setGlobalFunctionsGetter(globalFunctionsGetter);

        workerRef.current = workerAPI;
        console.log('Worker initialized successfully');
      } catch (error) {
        console.error('Error initializing worker:', error);
        // Continue without worker - will fallback to main thread execution
      }
    };

    // Only initialize worker in browser environment
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      initializeWorker();
    }

    // Cleanup worker on unmount
    return () => {
      if (workerRef.current) {
        // Cleanup will be handled by Comlink
        workerRef.current = null;
      }
    };
  }, []);

  // Load saved queries on mount - only run once, use ref for onError
  useEffect(() => {
    const loadSavedQueries = async () => {
      setLoadingQueries(true);
      try {
        const queries = await firestoreService.getAllQueries();
        setSavedQueries(queries);
        // Don't execute index queries here - they will be executed when saved queries are loaded
      } catch (error) {
        console.error('Error loading saved queries:', error);
        if (onErrorRef.current) {
          onErrorRef.current({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load saved queries',
            life: 3000
          });
        }
      } finally {
        setLoadingQueries(false);
      }
    };
    loadSavedQueries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Execute index queries when saved queries are loaded
  useEffect(() => {
    if (!indexQueriesExecutedRef.current && savedQueries.length > 0) {
      indexQueriesExecutedRef.current = true;
      executeAndStoreIndexQueries(savedQueries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedQueries]);

  // Execute index queries and store results in IndexedDB (using worker)
  const executeAndStoreIndexQueries = async (queries) => {
    if (!queries || queries.length === 0) {
      return;
    }

    // Wait for worker to be initialized
    if (!workerRef.current) {
      console.warn('Worker not initialized, falling back to main thread execution');
      // Fallback to main thread execution (original code) if worker not ready
      return;
    }

    // Store all query docs in cache for worker
    queries.forEach(query => {
      if (query.id) {
        allQueryDocsRef.current[query.id] = query;
      }
    });

    // Create a map of queryId -> query object for quick lookup
    const queryMap = new Map();
    queries.forEach(query => {
      if (query.id) {
        queryMap.set(query.id, query);
      }
    });

    // Register callback for all queries with clientSave === true (still needed for pipeline execution)
    queries.forEach(query => {
      if (query.id && query.index && query.index.trim() && query.clientSave === true) {
        // Store the query object in closure for use in callback
        const queryDoc = query;

        // Create the callback function - all index saves happen in worker, so register in worker's indexedDBService
        const onChangeCallback = async (queryId, oldResult, newResult, updatedAt, queryDocFromSave) => {
          // Use queryDocFromSave if provided, otherwise fallback to stored queryDoc
          const queryDocToUse = queryDocFromSave || queryMap.get(queryId) || queryDoc;

          // Only proceed if clientSave is true
          if (!queryDocToUse || queryDocToUse.clientSave !== true) {
            console.log(`Skipping pipeline execution for ${queryId}: clientSave is not true`);
            return;
          }

          console.log('Query index result changed:', {
            queryId,
            oldResult,
            newResult,
            updatedAt: new Date(updatedAt).toISOString(),
            queryDoc: queryDocToUse
          });

          // Execute pipeline in background for both month == false and month == true queries (using worker)
          if (queryDocToUse && (queryDocToUse.month === false || (queryDocToUse.month === true && queryDocToUse.monthIndex && queryDocToUse.monthIndex.trim()))) {
            // Get endpoint/auth from query's urlKey, fallback to default (before checking in-flight)
            const { endpointUrl, authToken } = getEndpointAndAuth(queryDocToUse);

            if (!endpointUrl) {
              console.warn(`No endpoint available for pipeline execution for ${queryId}`);
              return;
            }

            // Guard: Check if pipeline execution is already in flight for this queryId (before scheduling)
            if (pipelineExecutionInFlightRef.current.has(queryId)) {
              const inFlightInfo = pipelineExecutionInFlightRef.current.get(queryId);
              console.log(`Pipeline execution already in flight for ${queryId}${inFlightInfo ? ` (endpoint: ${inFlightInfo.endpointUrl})` : ''}, skipping callback`);
              return;
            }

            // Mark as in flight immediately (before scheduling) with endpoint URL
            pipelineExecutionInFlightRef.current.set(queryId, { endpointUrl });

            // Execute pipeline in background using worker
            const executePipelineAsync = async () => {
              try {

                // Always use worker for pipeline execution
                if (!workerRef.current) {
                  console.warn('Worker not available, skipping pipeline execution');
                  if (pipelineExecutionInFlightRef.current.has(queryId)) {
                    pipelineExecutionInFlightRef.current.delete(queryId);
                  }
                  return;
                }
                await workerRef.current.executePipeline(
                  queryId,
                  queryDocToUse,
                  endpointUrl,
                  authToken,
                  null, // monthRange will be calculated in worker
                  {}, // variableOverrides
                  allQueryDocsRef.current // allQueryDocs cache
                );
                console.log(`Pipeline executed for ${queryId} using worker`);
              } catch (error) {
                console.error(`Error executing pipeline for ${queryId}:`, error);
                // Don't throw - this is background execution
              } finally {
                // Remove from in flight map
                if (pipelineExecutionInFlightRef.current.has(queryId)) {
                  pipelineExecutionInFlightRef.current.delete(queryId);
                }
              }
            };

            // Use requestIdleCallback if available, otherwise fallback to setTimeout
            if (typeof requestIdleCallback !== 'undefined') {
              requestIdleCallback(executePipelineAsync, { timeout: 5000 });
            } else {
              setTimeout(executePipelineAsync, 0);
            }
          }
        };

        // Register callback in worker's indexedDBService (all index saves happen in worker)
        if (workerRef.current && workerRef.current.indexedDBService) {
          const proxiedCallback = Comlink.proxy(onChangeCallback);
          workerRef.current.indexedDBService.setOnChangeCallback(query.id, proxiedCallback).catch((error) => {
            console.error(`Failed to register callback in worker for ${query.id}:`, error);
          });
        }
      }
    });

    // Execute index queries using worker (endpoint config getter already set during initialization)
    try {
      await workerRef.current.executeAndCacheIndexQueries(queries);
    } catch (error) {
      console.error('Error executing index queries in worker:', error);
      // Fallback to main thread execution if worker fails
    }
  };

  // Initialize execution context on mount
  useEffect(() => {
    if (!executionContextRef.current) {
      executionContextRef.current = createExecutionContext();
    }
  }, []);

  // Keep ref in sync with queryVariables state (for cases where state is updated elsewhere)
  useEffect(() => {
    queryVariablesRef.current = queryVariables;
  }, [queryVariables]);

  // Notify parent when data source changes
  useEffect(() => {
    if (onDataSourceChange) {
      onDataSourceChange(dataSource);
    }
  }, [dataSource, onDataSourceChange]);

  // Expose state values to parent for selectors
  useEffect(() => {
    if (onSavedQueriesChange) {
      onSavedQueriesChange(savedQueries);
    }
  }, [savedQueries, onSavedQueriesChange]);

  useEffect(() => {
    if (onLoadingQueriesChange) {
      onLoadingQueriesChange(loadingQueries);
    }
  }, [loadingQueries, onLoadingQueriesChange]);

  useEffect(() => {
    if (onExecutingQueryChange) {
      onExecutingQueryChange(executingQuery);
    }
  }, [executingQuery, onExecutingQueryChange]);

  // Combine executingQuery and loadingFromCache to track overall data loading
  const isLoadingData = executingQuery || loadingFromCache;
  useEffect(() => {
    if (onLoadingDataChange) {
      onLoadingDataChange(isLoadingData);
    }
  }, [isLoadingData, onLoadingDataChange]);

  useEffect(() => {
    if (onSelectedQueryKeyChange) {
      onSelectedQueryKeyChange(selectedQueryKey);
    }
  }, [selectedQueryKey, onSelectedQueryKeyChange]);

  // Handle data source changes - auto-execute when user changes data source or on initial load
  useEffect(() => {
    if (dataSource === 'offline') {
      // Switching to offline - reset query-related state
      setProcessedData(null);
      setSelectedQueryKey(null);
      setMonthRange(null);
      setHasMonthSupport(false);
      setQueryVariables({});
      setCurrentQueryDoc(null);
      setOfflineDataExecuted(false); // Reset offline execution state
      setSelectedSalesTeams([]); // Reset Sales Teams selection
      setSelectedHqTeams([]); // Reset HQ Teams selection
      // Reset execution context when switching to offline
      executionContextRef.current = createExecutionContext();
      // Notify parent that variables changed
      if (onVariablesChange) {
        onVariablesChange({});
      }
      // Auto-execute offline data
      setOfflineDataExecuted(true);
      if (onDataChange) {
        onDataChange({
          severity: 'success',
          summary: 'Success',
          detail: 'Offline data loaded',
          life: 3000
        });
      }
    } else if (dataSource && dataSource !== 'offline') {
      // Reset Search Teams selection when switching data sources
      setSelectedSalesTeams([]);
      setSelectedHqTeams([]);
      // Mark initial load as in progress
      isInitialLoadRef.current = true;
      // Load query metadata and auto-execute
      const loadQueryMetadata = async () => {
        try {
          const queryDoc = await firestoreService.loadQuery(dataSource);
          if (queryDoc) {
            setCurrentQueryDoc(queryDoc);
            const { month, variables: rawVariables } = queryDoc;
            setHasMonthSupport(month === true);

            // Parse query variables
            const parsedVariables = parseGraphQLVariables(rawVariables || '');

            // Load initial month range from variables (startDate and endDate)
            let initialMonthRange = null;
            if (month === true && parsedVariables.startDate && parsedVariables.endDate) {
              try {
                const startDate = new Date(parsedVariables.startDate);
                const endDate = new Date(parsedVariables.endDate);
                if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                  initialMonthRange = [startDate, endDate];
                }
              } catch (error) {
                console.error('Error parsing startDate/endDate from variables:', error);
              }
            }

            // Remove startDate and endDate from variables (they're handled by monthRange state)
            const { startDate, endDate, ...filteredVariables } = parsedVariables;
            // Update both state and ref immediately
            setQueryVariables(filteredVariables);
            queryVariablesRef.current = filteredVariables;
            // Notify parent that variables changed
            if (onVariablesChange) {
              onVariablesChange(filteredVariables);
            }

            // Auto-execute query after loading metadata (including initial load)
            // Set monthRange first, then load data (combined to avoid duplicate calls)
            // For month-supported queries, only execute if monthRange is set
            // Variables are already set in queryVariablesRef.current, so we can execute immediately
            // Update monthRange to reflect the new data source's query variables
            if (month === true) {
              setMonthRange(initialMonthRange);
            } else {
              setMonthRange(null);
            }

            // Fetch last updated timestamp immediately after query doc is loaded
            // This will show it as soon as possible if it exists in cache
            // Pass queryDoc and initialMonthRange directly to avoid race condition with state updates
            await fetchLastUpdatedAt(queryDoc, initialMonthRange);

            if (month !== true || initialMonthRange) {
              // Use shared helper function to check IndexedDB first, then API if not found
              await checkIndexedDBAndLoadData(dataSource, queryDoc, initialMonthRange);
            }

            // Clear initial load flag after processing completes
            isInitialLoadRef.current = false;
          }
        } catch (error) {
          console.error('Error loading query metadata:', error);
          setCurrentQueryDoc(null);
          // Clear initial load flag on error
          isInitialLoadRef.current = false;
        }
      };
      loadQueryMetadata();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource]); // Only depend on dataSource, not onVariablesChange to avoid infinite loops

  // Auto-execute when variableOverrides change (user applied variables)
  useEffect(() => {
    if (!dataSource || dataSource === 'offline') return; // Skip for offline

    // Only execute if there are actual variable overrides
    const hasOverrides = Object.keys(variableOverrides).length > 0;

    if (hasOverrides) {
      // For month-supported queries, require monthRange
      if (hasMonthSupport && (!monthRange || !Array.isArray(monthRange) || monthRange.length !== 2)) {
        return; // Don't execute if month range is required but not set
      }
      runQuery(dataSource, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variableOverrides]); // Only depend on variableOverrides

  // Re-execute query when search/sort changes for clientSave === false queries
  // Runs regardless of whether searchFields or sortFields are defined
  useEffect(() => {
    // Only run for clientSave === false queries
    if (!currentQueryDoc || currentQueryDoc.clientSave !== false || !dataSource || dataSource === 'offline') {
      return;
    }

    // Re-execute query with updated search/sort variables
    // Variables will be included in mergedVariables if searchTerm or sortConfig have values
    runQuery(dataSource, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, sortConfig, currentQueryDoc, dataSource]); // Watch searchTerm, sortConfig, currentQueryDoc, and dataSource

  // Helper function to check IndexedDB and load data if available, otherwise call runQuery
  // Use a ref to store runQuery to avoid dependency order issues
  const runQueryRef = useRef(null);

  // Helper function to fetch last updated timestamp from IndexedDB
  // @param {Object} queryDocOverride - Optional query document to use instead of currentQueryDoc (to avoid race conditions)
  // @param {Array} monthRangeOverride - Optional month range to use instead of monthRange state (to avoid race conditions)
  const fetchLastUpdatedAt = useCallback(async (queryDocOverride = null, monthRangeOverride = null) => {
    // Use queryDocOverride if provided, otherwise fall back to currentQueryDoc
    const queryDocToUse = queryDocOverride || currentQueryDoc;
    // Use monthRangeOverride if provided, otherwise fall back to monthRange state
    const monthRangeToUse = monthRangeOverride !== null ? monthRangeOverride : monthRange;

    // If offline mode or no dataSource, clear the last updated field
    if (!dataSource || dataSource === 'offline') {
      setLastUpdatedAt(null);
      return;
    }

    try {
      // Get the index result from IndexedDB
      const indexResult = await indexedDBService.getQueryIndexResult(dataSource);

      if (!indexResult || !indexResult.result) {
        setLastUpdatedAt(null);
        return;
      }

      const result = indexResult.result;

      // Check if the query has month support (use queryDocToUse instead of currentQueryDoc)
      if (queryDocToUse && queryDocToUse.month === true) {
        // For month == true, result is an object like {"2025-11": "13:14:03.540037"}
        // Extract YYYY-MM from monthRangeToUse (which may be from override or state)
        if (monthRangeToUse && Array.isArray(monthRangeToUse) && monthRangeToUse.length > 0 && monthRangeToUse[0]) {
          const yearMonthKey = dayjs(monthRangeToUse[0]).format('YYYY-MM');
          // Look up the value for this month key
          if (result && typeof result === 'object' && !Array.isArray(result)) {
            const monthValue = result[yearMonthKey];
            setLastUpdatedAt(monthValue || null);
          } else {
            setLastUpdatedAt(null);
          }
        } else {
          // No month range selected, show null
          setLastUpdatedAt(null);
        }
      } else {
        // For month == false, result is a string directly
        if (typeof result === 'string') {
          setLastUpdatedAt(result);
        } else {
          setLastUpdatedAt(null);
        }
      }
    } catch (error) {
      console.error('Error fetching last updated timestamp:', error);
      setLastUpdatedAt(null);
    }
  }, [dataSource, monthRange, currentQueryDoc]);

  // Helper function to fetch and cache all months in a range in background (using worker)
  const fetchAndCacheMonthsInRange = useCallback(async (queryId, queryDoc, monthRangeValue) => {
    if (!queryId || !queryDoc || !monthRangeValue || !Array.isArray(monthRangeValue) || monthRangeValue.length !== 2) {
      return;
    }

    const [startDate, endDate] = monthRangeValue;

    // Generate array of month prefixes for the range
    const monthPrefixes = generateMonthRangeArray(startDate, endDate);

    if (monthPrefixes.length === 0) {
      return;
    }

    // Execute in background without blocking UI
    const fetchAndCacheAllMonthsAsync = async () => {
      try {
        const { endpointUrl, authToken } = getEndpointAndAuth(queryDoc);

        if (!endpointUrl) {
          console.warn(`No endpoint available for fetching months in range for ${queryId}`);
          return;
        }

        // Fetch and cache each month in the range using worker
        for (const prefix of monthPrefixes) {
          try {
            // Parse YYYY-MM to create month range (first day to last day of month)
            const [year, month] = prefix.split('-').map(Number);
            const monthStartDate = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0).getDate();
            const monthEndDate = new Date(year, month - 1, lastDay);
            // Convert Date objects to serializable format for Comlink
            const monthRangeSerialized = [
              { year: monthStartDate.getFullYear(), month: monthStartDate.getMonth(), day: monthStartDate.getDate() },
              { year: monthEndDate.getFullYear(), month: monthEndDate.getMonth(), day: monthEndDate.getDate() }
            ];

            // Always use worker for pipeline execution
            if (!workerRef.current) {
              console.warn('Worker not available for background caching');
              continue;
            }
            await workerRef.current.executePipeline(
              queryId,
              queryDoc,
              endpointUrl,
              authToken,
              monthRangeSerialized,
              {},
              allQueryDocsRef.current
            );
            console.log(`Cached month ${prefix} for ${queryId} using worker`);
          } catch (error) {
            console.error(`Error fetching and caching month ${prefix} for ${queryId}:`, error);
            // Continue with other months even if one fails
          }
        }
      } catch (error) {
        console.error(`Error in background fetch for months in range for ${queryId}:`, error);
      }
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(fetchAndCacheAllMonthsAsync, { timeout: 5000 });
    } else {
      setTimeout(fetchAndCacheAllMonthsAsync, 0);
    }
  }, []);

  const checkIndexedDBAndLoadData = useCallback(async (queryId, queryDoc, monthRangeValue) => {
    // Prevent duplicate concurrent calls
    const cacheLoadKey = `${queryId}_${monthRangeValue?.[0]?.getTime()}_${monthRangeValue?.[1]?.getTime()}`;
    if (cacheLoadInProgressRef.current === cacheLoadKey) {
      // Already loading this exact query/monthRange, skip duplicate call
      return;
    }
    cacheLoadInProgressRef.current = cacheLoadKey;
    setLoadingFromCache(true);

    if (!queryDoc || queryDoc.clientSave !== true) {
      // No IndexedDB support, go directly to API
      cacheLoadInProgressRef.current = null;
      setLoadingFromCache(false);
      if (runQueryRef.current) {
        await runQueryRef.current(queryId, true);
      }
      return;
    }

    // Step 1: Check index query result to validate cache freshness
    if (queryDoc.index && queryDoc.index.trim() && workerRef.current) {
      try {
        const { endpointUrl, authToken } = getEndpointAndAuth(queryDoc);
        const finalEndpointUrl = endpointUrl || getInitialEndpoint()?.code || null;
        const finalAuthToken = authToken || null;

        if (finalEndpointUrl) {
          // Get cached index result
          const cachedIndexResult = await indexedDBService.getQueryIndexResult(queryId);
          const cachedIndex = cachedIndexResult?.result || null;

          // Execute index query to get current index
          let currentIndex = null;
          if (queryDoc.month === true && monthRangeValue && Array.isArray(monthRangeValue) && monthRangeValue.length === 2) {
            // For month queries, execute index query for month range
            const monthRangeSerialized = [
              { year: monthRangeValue[0].getFullYear(), month: monthRangeValue[0].getMonth(), day: monthRangeValue[0].getDate() },
              { year: monthRangeValue[1].getFullYear(), month: monthRangeValue[1].getMonth(), day: monthRangeValue[1].getDate() }
            ];
            await workerRef.current.executeIndexQueryForMonthRange(
              queryId,
              queryDoc,
              finalEndpointUrl,
              finalAuthToken,
              monthRangeSerialized
            );
            // Get the updated index result after execution
            const updatedIndexResult = await indexedDBService.getQueryIndexResult(queryId);
            currentIndex = updatedIndexResult?.result || null;
          } else {
            // For non-month queries, extract startDate/endDate from variables if they exist
            const parsedVariables = parseGraphQLVariables(queryDoc.variables || '');
            const monthRangeVariables = (parsedVariables.startDate && parsedVariables.endDate)
              ? { startDate: parsedVariables.startDate, endDate: parsedVariables.endDate }
              : null;
            
            await workerRef.current.executeIndexQuery(
              queryId,
              queryDoc,
              finalEndpointUrl,
              finalAuthToken,
              monthRangeVariables
            );
            // Get the updated index result after execution
            const updatedIndexResult = await indexedDBService.getQueryIndexResult(queryId);
            currentIndex = updatedIndexResult?.result || null;
          }

          // Compare cached index with current index
          if (cachedIndex !== null && currentIndex !== null) {
            const cachedIndexString = JSON.stringify(cachedIndex);
            const currentIndexString = JSON.stringify(currentIndex);
            
            if (cachedIndexString !== currentIndexString) {
              // Index has changed - cache is stale, skip cache and fetch live
              console.log(`Index changed for ${queryId}, skipping cache and fetching live data`);
              cacheLoadInProgressRef.current = null;
              setLoadingFromCache(false);
              if (runQueryRef.current) {
                await runQueryRef.current(queryId, true);
              }
              return;
            }
            // Index is same - proceed to load from cache (continue below)
          } else if (cachedIndex === null && currentIndex !== null) {
            // No cached index but got current index - cache might be stale, fetch live to be safe
            console.log(`No cached index for ${queryId}, fetching live data`);
            cacheLoadInProgressRef.current = null;
            setLoadingFromCache(false);
            if (runQueryRef.current) {
              await runQueryRef.current(queryId, true);
            }
            return;
          }
          // If both are null or comparison passed, proceed to load from cache
        }
      } catch (indexError) {
        // If index check fails, log but continue to cache check (fallback behavior)
        console.error(`Error checking index for ${queryId}:`, indexError);
      }
    }

    try {
      // For month == true queries, handle multi-month range
      if (queryDoc.month === true && monthRangeValue && Array.isArray(monthRangeValue) && monthRangeValue.length === 2) {
        const [startDate, endDate] = monthRangeValue;

        // Generate array of month prefixes for the range
        const monthPrefixes = generateMonthRangeArray(startDate, endDate);

        if (monthPrefixes.length > 0) {
          // Check which months are cached
          const cachedPrefixes = await indexedDBService.getCachedMonthPrefixes(queryId, monthPrefixes);

          if (cachedPrefixes.length === monthPrefixes.length) {
            // All months cached: reconstruct from all
            const reconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, monthPrefixes);

            if (reconstructed && typeof reconstructed === 'object' && Object.keys(reconstructed).length > 0) {
              setProcessedData(reconstructed);

              // Update last updated timestamp after loading from cache
              await fetchLastUpdatedAt(queryDoc, monthRangeValue);

              if (onDataChange) {
                onDataChange({
                  severity: 'success',
                  summary: 'Success',
                  detail: 'Data loaded from cache',
                  life: 3000
                });
              }
              cacheLoadInProgressRef.current = null;
              setLoadingFromCache(false);
              return; // Successfully loaded from IndexedDB
            }
          } else if (cachedPrefixes.length > 0) {
            // Some months cached: reconstruct from cached months immediately
            const reconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, cachedPrefixes);

            if (reconstructed && typeof reconstructed === 'object' && Object.keys(reconstructed).length > 0) {
              setProcessedData(reconstructed);

              // Update last updated timestamp after loading from cache
              await fetchLastUpdatedAt(queryDoc, monthRangeValue);

              if (onDataChange) {
                onDataChange({
                  severity: 'success',
                  summary: 'Success',
                  detail: `Data loaded from cache (${cachedPrefixes.length}/${monthPrefixes.length} months)`,
                  life: 3000
                });
              }

              // Cache all months in range in background (even if some already cached)
              fetchAndCacheMonthsInRange(queryId, queryDoc, monthRangeValue);

              cacheLoadInProgressRef.current = null;
              setLoadingFromCache(false);
              return; // Successfully loaded from cache, don't call API
            }
          }

          // If not all months cached and no cached data available, fall through to API fetch
        }
      } else {
        // Single month or month == false: use original logic
        const yearMonthPrefix = (queryDoc.month === true && monthRangeValue && monthRangeValue[0])
          ? dayjs(monthRangeValue[0]).format('YYYY-MM')
          : null;

        // Try to reconstruct from IndexedDB
        const reconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, yearMonthPrefix);

        // Check if we got data (reconstructed format matches processedData format)
        if (reconstructed && typeof reconstructed === 'object' && Object.keys(reconstructed).length > 0) {
          // Load from IndexedDB - format is already correct, no transformation needed
          setProcessedData(reconstructed);

          // Update last updated timestamp after loading from cache
          await fetchLastUpdatedAt(queryDoc, monthRangeValue);

          if (onDataChange) {
            onDataChange({
              severity: 'success',
              summary: 'Success',
              detail: 'Data loaded from cache',
              life: 3000
            });
          }
          cacheLoadInProgressRef.current = null;
          setLoadingFromCache(false);
          return; // Successfully loaded from IndexedDB, don't call API
        }
      }
    } catch (error) {
      // If IndexedDB loading fails, fall through to normal query execution
      console.error('Error loading from IndexedDB:', error);
      cacheLoadInProgressRef.current = null;
      setLoadingFromCache(false);
    }

    // IndexedDB check failed or no data found, call API
    cacheLoadInProgressRef.current = null;
    setLoadingFromCache(false);
    if (runQueryRef.current) {
      await runQueryRef.current(queryId, true);
    }
  }, [onDataChange, fetchAndCacheMonthsInRange, fetchLastUpdatedAt]);

  // Auto-execute when monthRange changes (user changed month range)
  useEffect(() => {
    if (!dataSource || dataSource === 'offline') return; // Skip for offline
    if (!hasMonthSupport) return; // Only for month-supported queries

    // Skip if this is during initial load (prevent race condition with IndexedDB check)
    if (isInitialLoadRef.current) {
      return;
    }

    // Only execute if monthRange is set
    if (monthRange && Array.isArray(monthRange) && monthRange.length === 2 && currentQueryDoc) {
      // Check IndexedDB first, then API if not found
      checkIndexedDBAndLoadData(dataSource, currentQueryDoc, monthRange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthRange, checkIndexedDBAndLoadData]); // Include checkIndexedDBAndLoadData in deps


  // Format date to "10 Jan 26 11:05 AM" format
  const formatLastUpdatedDate = (dateString) => {
    if (!dateString) return null;

    try {
      // Try to parse the date string with dayjs
      const parsedDate = dayjs(dateString);

      // Check if the date is valid
      if (!parsedDate.isValid()) {
        return dateString; // Return original if can't parse
      }

      // Format to "10 Jan 26 11:05 AM" (MMM already returns capitalized month by default)
      return parsedDate.format('D MMM YY h:mm A');
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString; // Return original on error
    }
  };

  // Fetch and display last updated timestamp from IndexedDB when monthRange changes
  // Only call if currentQueryDoc is available and matches current dataSource to avoid race conditions
  // Note: We also call fetchLastUpdatedAt explicitly after loading query doc and after data loads,
  // so this useEffect mainly handles monthRange changes
  useEffect(() => {
    if (currentQueryDoc && dataSource && dataSource !== 'offline' && currentQueryDoc.id === dataSource && monthRange) {
      fetchLastUpdatedAt();
    }
  }, [monthRange, currentQueryDoc, dataSource, fetchLastUpdatedAt]);

  // Get available query keys from processedData
  const availableQueryKeys = useMemo(() => {
    if (!processedData || !dataSource) return [];
    return getDataKeys(processedData).filter(key => {
      const value = getDataValue(processedData, key);
      return value && value.length > 0;
    });
  }, [processedData, dataSource]);

  // Reset selectedQueryKey immediately when dataSource changes (separate effect to avoid loop)
  useEffect(() => {
    const dataSourceChanged = previousDataSourceRef.current !== dataSource;
    if (dataSourceChanged) {
      previousDataSourceRef.current = dataSource;
      // Reset the flags tracking which dataSource we've set queryKey for
      queryKeySetForDataSourceRef.current = null;
      lastSetQueryKeyRef.current = null;
      // When dataSource changes to a new query, reset selectedQueryKey immediately
      // But don't reset if we have a valid default from props that might still be valid
      if (dataSource && dataSource !== 'offline') {
        // Only reset if we don't have a valid default selectedQueryKeyProp
        // (We'll check if it's valid in the next effect when availableQueryKeys are known)
        setSelectedQueryKey(null);
      }
    }
  }, [dataSource]);

  // Set selectedQueryKey when processedData/availableQueryKeys become available (only once per dataSource)
  useEffect(() => {
    if (!dataSource || dataSource === 'offline' || !processedData) {
      return;
    }

    const firstAvailableKey = availableQueryKeys.length > 0 ? availableQueryKeys[0] : null;

    // Check if the default/prop selectedQueryKey is valid and available
    const defaultKeyIsValid = selectedQueryKeyProp && availableQueryKeys.includes(selectedQueryKeyProp);

    // First time for this dataSource - prefer default key if valid, otherwise use first available key
    if (queryKeySetForDataSourceRef.current !== dataSource) {
      const keyToUse = defaultKeyIsValid ? selectedQueryKeyProp : firstAvailableKey;
      
      if (keyToUse) {
        // Only update if the value would actually change
        if (lastSetQueryKeyRef.current !== keyToUse) {
          queryKeySetForDataSourceRef.current = dataSource;
          lastSetQueryKeyRef.current = keyToUse;
          setSelectedQueryKey(keyToUse);
        }
      }
      return;
    }

    // Already set for this dataSource - only update if current key is invalid
    if (queryKeySetForDataSourceRef.current === dataSource) {
      setSelectedQueryKey(currentSelectedKey => {
        // If current key is invalid, prefer default key if valid, otherwise use first available
        if (currentSelectedKey && !availableQueryKeys.includes(currentSelectedKey)) {
          const keyToUse = defaultKeyIsValid ? selectedQueryKeyProp : firstAvailableKey;
          if (keyToUse && lastSetQueryKeyRef.current !== keyToUse) {
            lastSetQueryKeyRef.current = keyToUse;
            return keyToUse;
          }
        }
        // If current key is null/empty and we have a valid default, use it
        if (!currentSelectedKey && defaultKeyIsValid) {
          if (lastSetQueryKeyRef.current !== selectedQueryKeyProp) {
            lastSetQueryKeyRef.current = selectedQueryKeyProp;
            return selectedQueryKeyProp;
          }
        }
        // No change needed
        return currentSelectedKey;
      });
    }
  }, [processedData, availableQueryKeys, dataSource, selectedQueryKeyProp]);

  // Expose availableQueryKeys to parent (after it's defined)
  useEffect(() => {
    if (onAvailableQueryKeysChange) {
      onAvailableQueryKeysChange(availableQueryKeys);
    }
  }, [availableQueryKeys, onAvailableQueryKeysChange]);

  // Helper function to create execution key from queryId, variables, and monthRange
  const createExecutionKey = (queryId, variables, monthRange) => {
    // Create a stable string representation of variables (sorted keys for consistency)
    const variablesStr = variables && typeof variables === 'object'
      ? JSON.stringify(variables, Object.keys(variables).sort())
      : '';

    // Create a stable string representation of monthRange
    const monthRangeStr = monthRange && Array.isArray(monthRange) && monthRange.length === 2
      ? `${monthRange[0].getTime()}_${monthRange[1].getTime()}`
      : '';

    // Combine queryId, variables, and monthRange into a unique key
    return `${queryId}__${variablesStr}__${monthRangeStr}`;
  };

  // Helper function to execute and cache month range per month (latest first)
  const executeAndCacheMonthRange = useCallback(async (queryId, queryDoc, monthRangeValue, endpointUrl, authToken, mergedVariables) => {
    if (!queryId || !queryDoc || !monthRangeValue || !Array.isArray(monthRangeValue) || monthRangeValue.length !== 2) {
      throw new Error('Invalid parameters for executeAndCacheMonthRange');
    }

    const [startDate, endDate] = monthRangeValue;

    // Generate array of month prefixes for the range
    const monthPrefixes = generateMonthRangeArray(startDate, endDate);

    if (monthPrefixes.length === 0) {
      throw new Error('No months in range');
    }

    // Reverse order to start with latest month first
    const reversedMonthPrefixes = [...monthPrefixes].reverse();

    // Execute index queries for monthRange BEFORE executing pipelines
    if (queryDoc.index && queryDoc.index.trim() && queryDoc.clientSave === true) {
      try {
        const monthRangeSerialized = [
          { year: startDate.getFullYear(), month: startDate.getMonth(), day: startDate.getDate() },
          { year: endDate.getFullYear(), month: endDate.getMonth(), day: endDate.getDate() }
        ];
        await workerRef.current.executeIndexQueryForMonthRange(
          queryId,
          queryDoc,
          endpointUrl,
          authToken,
          monthRangeSerialized
        );
      } catch (indexError) {
        console.error(`Error executing index queries for monthRange for ${queryId}:`, indexError);
        // Continue with pipeline execution even if index queries fail
      }
    }

    // Execute pipeline for each month in parallel (but start with latest first)
    const pipelinePromises = reversedMonthPrefixes.map(async (prefix) => {
      try {
        // Parse YYYY-MM to create month range (first day to last day of month)
        const [year, month] = prefix.split('-').map(Number);
        const monthStartDate = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0).getDate();
        const monthEndDate = new Date(year, month - 1, lastDay);

        // Convert Date objects to serializable format for Comlink
        const monthRangeSerialized = [
          { year: monthStartDate.getFullYear(), month: monthStartDate.getMonth(), day: monthStartDate.getDate() },
          { year: monthEndDate.getFullYear(), month: monthEndDate.getMonth(), day: monthEndDate.getDate() }
        ];

        // Execute pipeline for this month (worker will save to cache with month prefix automatically)
        await workerRef.current.executePipeline(
          queryId,
          queryDoc,
          endpointUrl,
          authToken,
          monthRangeSerialized,
          mergedVariables,
          allQueryDocsRef.current
        );

        console.log(`Executed and cached month ${prefix} for ${queryId}`);
      } catch (error) {
        console.error(`Error executing pipeline for month ${prefix} for ${queryId}:`, error);
        // Continue with other months even if one fails
        throw error; // Re-throw to be caught by Promise.allSettled
      }
    });

    // Execute all months in parallel (using allSettled to continue even if some fail)
    const results = await Promise.allSettled(pipelinePromises);

    // Check execution results
    const successfulExecutions = results.filter(r => r.status === 'fulfilled').length;
    const failedExecutions = results.filter(r => r.status === 'rejected');

    console.log(`Pipeline execution results for ${queryId}: ${successfulExecutions}/${monthPrefixes.length} succeeded`);

    if (successfulExecutions === 0) {
      // All executions failed
      const errors = failedExecutions.map(r => r.reason?.message || r.reason || 'Unknown error').filter(Boolean);
      throw new Error(`All pipeline executions failed: ${errors.join('; ')}`);
    }

    if (failedExecutions.length > 0) {
      console.warn(`Some pipeline executions failed for ${queryId}:`, failedExecutions.map(r => r.reason?.message || r.reason));
    }

    // Wait for IndexedDB writes to be committed and database version updates to propagate
    // The worker may have closed and reopened the database with a new version, so we need to wait
    // for the version change to be visible to the main thread
    await new Promise(resolve => setTimeout(resolve, 100));

    // Clear the cached database instance to force a fresh connection that sees new stores
    // The worker may have created new stores by upgrading the database version
    await indexedDBService.clearQueryDatabaseCache(queryId);

    // Verify that data was actually cached before trying to reconstruct
    // With cache cleared, we should see new stores immediately, but add one retry for transaction commit timing
    let cachedPrefixes = await indexedDBService.getCachedMonthPrefixes(queryId, monthPrefixes);
    console.log(`Cached prefixes for ${queryId}:`, cachedPrefixes, 'Expected:', monthPrefixes);

    if (cachedPrefixes.length === 0) {
      // Wait a bit more for transaction commits, then retry once
      await new Promise(resolve => setTimeout(resolve, 100));
      cachedPrefixes = await indexedDBService.getCachedMonthPrefixes(queryId, monthPrefixes);
      console.log(`Cached prefixes (retry) for ${queryId}:`, cachedPrefixes, 'Expected:', monthPrefixes);
    }

    if (cachedPrefixes.length === 0) {
      // Final check: inspect database directly for diagnostic purposes
      try {
        const queryDb = await indexedDBService.getQueryDatabase(queryId);
        const existingStores = queryDb.tables.map((table) => table.name);
        const matchingStores = existingStores.filter(storeName =>
          monthPrefixes.some(prefix => storeName.startsWith(`${prefix}_`))
        );

        if (matchingStores.length === 0) {
          throw new Error(`No data was cached for any month in range. Expected ${monthPrefixes.length} months (${monthPrefixes.join(', ')}), but none were found in cache after ${successfulExecutions} successful executions. Database has ${existingStores.length} stores total.`);
        } else {
          // Stores exist but getCachedMonthPrefixes didn't find them - use all prefixes
          console.warn(`Stores exist (${matchingStores.length}) but getCachedMonthPrefixes didn't find them. Using all expected prefixes.`);
          cachedPrefixes = monthPrefixes;
        }
      } catch (dbError) {
        console.error(`Error checking database directly:`, dbError);
        throw new Error(`No data was cached for any month in range. Expected ${monthPrefixes.length} months (${monthPrefixes.join(', ')}), but none were found in cache after ${successfulExecutions} successful executions. Error: ${dbError.message}`);
      }
    }

    // Load from cache per month and combine
    const reconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, cachedPrefixes);

    if (!reconstructed || typeof reconstructed !== 'object' || Object.keys(reconstructed).length === 0) {
      // Try reconstructing with all prefixes one more time after a short delay
      console.warn(`First reconstruction attempt failed for ${queryId}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 200));
      const retryReconstructed = await indexedDBService.reconstructPipelineResult(queryId, null, monthPrefixes);
      if (!retryReconstructed || typeof retryReconstructed !== 'object' || Object.keys(retryReconstructed).length === 0) {
        throw new Error(`Failed to reconstruct data from cache after execution. Cached prefixes: ${cachedPrefixes.join(', ')}, Expected: ${monthPrefixes.join(', ')}. Successful executions: ${successfulExecutions}/${monthPrefixes.length}`);
      }
      return retryReconstructed;
    }

    return reconstructed;
  }, []);

  // Execute query using the unified pipeline (using worker)
  const runQuery = useCallback(async (queryId, skipMonthDateLoad = false) => {
    // Update ref so checkIndexedDBAndLoadData can use it
    runQueryRef.current = runQuery;
    // Hard guard: prevent execution if already executing any query
    if (executingQuery) {
      return;
    }

    // Use ref for immediate access (avoids stale closure issues)
    // Merge queryVariables with variableOverrides (variableOverrides take precedence for user overrides)
    let mergedVariables = { ...queryVariablesRef.current, ...variableOverrides };

    // When custom monthRange is set, remove startDate/endDate from variables
    // so that only the monthRange is used for API calls
    if (monthRange && Array.isArray(monthRange) && monthRange.length === 2) {
      const { startDate, endDate, ...variablesWithoutDates } = mergedVariables;
      mergedVariables = variablesWithoutDates;
    }

    // Include search/sort variables for clientSave === false queries
    // Note: We check currentQueryDoc here; queryDocToUse will be loaded later and verified
    if (currentQueryDoc && currentQueryDoc.clientSave === false) {
      // Add searchText if searchTerm has a value
      if (searchTerm && searchTerm.trim()) {
        mergedVariables.searchText = searchTerm.trim();
      }

      // Add sortField and sortDirection if sortConfig exists
      // Validate against sortFields if it exists
      if (sortConfig && sortConfig.field) {
        let shouldAddSortField = true;
        const { field } = sortConfig;

        // Parse field path: "topLevelKey.nestedPath" or just "topLevelKey"
        const [topLevelKey, ...nestedParts] = field.split('.');
        const nestedPath = nestedParts.join('.');

        // If sortFields exists, validate that sortConfig.field is in sortFields
        if (currentQueryDoc.sortFields && typeof currentQueryDoc.sortFields === 'object' && !Array.isArray(currentQueryDoc.sortFields)) {
          const sortFieldsObj = currentQueryDoc.sortFields;

          // Check if topLevelKey exists in sortFields
          if (sortFieldsObj[topLevelKey] && Array.isArray(sortFieldsObj[topLevelKey])) {
            // If nestedPath exists, check if it's in the array
            if (nestedPath) {
              shouldAddSortField = sortFieldsObj[topLevelKey].includes(nestedPath);
            } else {
              // Empty nestedPath means top-level key is valid
              shouldAddSortField = true;
            }
          } else {
            // topLevelKey not found in sortFields
            shouldAddSortField = false;
            console.warn(`Sort field "${field}" is not in sortFields configuration. Available sortFields:`, sortFieldsObj);
          }
        }

        // Add sortField/sortDirection if validation passed or sortFields doesn't exist
        if (shouldAddSortField) {
          // Use only nestedPath (without topLevelKey prefix) for sortField variable
          const sortFieldValue = nestedPath || topLevelKey;
          mergedVariables.sortField = sortFieldValue;
          mergedVariables.sortDirection = sortConfig.direction || 'asc';
        }
      }
    }

    // Create execution key from queryId, variables, and monthRange
    const executionKey = createExecutionKey(queryId, mergedVariables, monthRange);

    // Prevent concurrent execution of the same query with same variables and monthRange
    if (executingQueriesRef.current.has(executionKey)) {
      return;
    }

    // Ensure execution context exists
    if (!executionContextRef.current) {
      executionContextRef.current = createExecutionContext();
    }

    executingQueryIdRef.current = queryId; // Keep for backward compatibility
    executingQueriesRef.current.add(executionKey);
    setExecutingQuery(true);

    try {
      // Load query doc if not already loaded
      let queryDocToUse = currentQueryDoc;
      if (!queryDocToUse) {
        queryDocToUse = await firestoreService.loadQuery(queryId);
        if (queryDocToUse) {
          allQueryDocsRef.current[queryId] = queryDocToUse;
        }
      }

      if (!queryDocToUse) {
        throw new Error(`Query "${queryId}" not found`);
      }

      // Get endpoint URL and auth token
      const { endpointUrl, authToken } = getEndpointAndAuth(queryDocToUse);
      const finalEndpointUrl = endpointUrl || getInitialEndpoint()?.code || null;
      const finalAuthToken = authToken || null;

      if (!finalEndpointUrl) {
        throw new Error('GraphQL endpoint URL is not set');
      }

      // Always use worker for pipeline execution
      if (!workerRef.current) {
        throw new Error('Worker is not available. Please ensure worker is initialized.');
      }
      // For month == true queries with monthRange, always execute per month
      if (queryDocToUse.month === true && monthRange && Array.isArray(monthRange) && monthRange.length === 2) {
        // Execute per month: execute → save to cache → load from cache → combine
        const finalData = await executeAndCacheMonthRange(
          queryId,
          queryDocToUse,
          monthRange,
          finalEndpointUrl,
          finalAuthToken,
          mergedVariables
        );

        // Store final processed data
        setProcessedData(finalData);

        // Update last updated timestamp after successful execution
        await fetchLastUpdatedAt(queryDocToUse, monthRange);
      } else {
        // For month == false queries or no monthRange, use original single execution
        // Convert Date objects to serializable format for Comlink (Date objects get corrupted in transfer)
        const monthRangeToPass = monthRange && Array.isArray(monthRange) && monthRange.length === 2
          ? [
            { year: monthRange[0].getFullYear(), month: monthRange[0].getMonth(), day: monthRange[0].getDate() },
            { year: monthRange[1].getFullYear(), month: monthRange[1].getMonth(), day: monthRange[1].getDate() }
          ]
          : undefined;

        // Execute index queries BEFORE executing the pipeline
        if (queryDocToUse.index && queryDocToUse.index.trim() && queryDocToUse.clientSave === true) {
          try {
            if (monthRangeToPass) {
              // For monthRange, use executeIndexQueryForMonthRange
              await workerRef.current.executeIndexQueryForMonthRange(
                queryId,
                queryDocToUse,
                finalEndpointUrl,
                finalAuthToken,
                monthRangeToPass
              );
            } else {
              // For non-month queries, extract startDate/endDate from variables if they exist
              const monthRangeVariables = (mergedVariables.startDate && mergedVariables.endDate)
                ? { startDate: mergedVariables.startDate, endDate: mergedVariables.endDate }
                : null;
              
              await workerRef.current.executeIndexQuery(
                queryId,
                queryDocToUse,
                finalEndpointUrl,
                finalAuthToken,
                monthRangeVariables
              );
            }
          } catch (indexError) {
            // Log error but don't block pipeline execution
            console.error(`Error executing index queries for ${queryId}:`, indexError);
          }
        }

        const finalData = await workerRef.current.executePipeline(
          queryId,
          queryDocToUse,
          finalEndpointUrl,
          finalAuthToken,
          monthRangeToPass,
          mergedVariables,
          allQueryDocsRef.current
        );

        // Store final processed data
        setProcessedData(finalData);
      }

      // Update last updated timestamp after successful execution
      await fetchLastUpdatedAt(queryDocToUse, monthRange);

      if (onDataChange) {
        onDataChange({
          severity: 'success',
          summary: 'Success',
          detail: 'Query executed successfully',
          life: 3000
        });
      }
    } catch (error) {
      console.error(`Query execution failed: ${queryId}`, error);
      if (onError) {
        onError({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to execute query',
          life: 5000
        });
      }
      setProcessedData(null);
    } finally {
      // Remove from executing queries set
      const executionKey = createExecutionKey(queryId, mergedVariables, monthRange);
      executingQueriesRef.current.delete(executionKey);

      // Only clear executingQueryIdRef if no other executions are in flight for this queryId
      if (executingQueryIdRef.current === queryId) {
        const hasOtherExecutions = Array.from(executingQueriesRef.current).some(key => key.startsWith(`${queryId}__`));
        if (!hasOtherExecutions) {
          executingQueryIdRef.current = null;
        }
      }
      setExecutingQuery(false);
    }
  }, [onDataChange, onError, monthRange, executingQuery, variableOverrides, queryVariables, currentQueryDoc, searchTerm, sortConfig]);

  // Update runQuery ref whenever runQuery changes
  useEffect(() => {
    runQueryRef.current = runQuery;
  }, [runQuery]);

  // Track if offline data has been "executed" (shown)
  const [offlineDataExecuted, setOfflineDataExecuted] = useState(false);

  // Determine which data to use (from executed queries or executed offline)
  const rawTableData = useMemo(() => {
    // If offline mode and executed, show offline data
    if (dataSource === 'offline' && offlineDataExecuted) {
      return offlineData || [];
    }
    // If query mode and executed, show processed data
    if (dataSource && dataSource !== 'offline' && processedData && selectedQueryKey) {
      return getDataValue(processedData, selectedQueryKey) || [];
    }
    // Return null to indicate no data available (will show placeholder)
    return null;
  }, [dataSource, processedData, selectedQueryKey, offlineData, offlineDataExecuted]);

  // Apply auth filtering to raw data
  const authFilteredData = useMemo(() => {
    if (!rawTableData || !Array.isArray(rawTableData) || isEmpty(rawTableData)) {
      return rawTableData;
    }

    // If Admin mode is ON, return data as-is
    if (isAdminMode) {
      return rawTableData;
    }

    let filteredData = [...rawTableData];

    // Step 1: Filter by salesTeam
    if (salesTeamColumn && salesTeamValues && salesTeamValues.length > 0) {
      filteredData = filteredData.filter(row => {
        if (!row || typeof row !== 'object') return false;
        const rowValue = getDataValue(row, salesTeamColumn);
        // Handle null/undefined comparison - convert to string for comparison
        if (isNil(rowValue)) {
          return salesTeamValues.some(val => val === null || val === undefined || val === '');
        }
        return salesTeamValues.some(val => String(val) === String(rowValue));
      });
    }

    // Step 2: Filter by hq (only if salesTeamValues count == 1)
    if (salesTeamValues && salesTeamValues.length === 1 && hqColumn && hqValues && hqValues.length > 0) {
      filteredData = filteredData.filter(row => {
        if (!row || typeof row !== 'object') return false;
        const rowValue = getDataValue(row, hqColumn);
        // Handle null/undefined comparison - convert to string for comparison
        if (isNil(rowValue)) {
          return hqValues.some(val => val === null || val === undefined || val === '');
        }
        return hqValues.some(val => String(val) === String(rowValue));
      });
    }

    return filteredData;
  }, [rawTableData, isAdminMode, salesTeamColumn, salesTeamValues, hqColumn, hqValues]);

  // Extract available Sales Team values from auth-filtered data
  const availableSalesTeamValues = useMemo(() => {
    if (!authFilteredData || !Array.isArray(authFilteredData) || isEmpty(authFilteredData)) {
      return [];
    }

    if (!salesTeamColumn) {
      return [];
    }

    const salesTeamValuesSet = new Set();
    authFilteredData.forEach(row => {
      if (row && typeof row === 'object') {
        const value = getDataValue(row, salesTeamColumn);
        if (!isNil(value) && value !== '') {
          salesTeamValuesSet.add(String(value));
        }
      }
    });

    return Array.from(salesTeamValuesSet).sort();
  }, [authFilteredData, salesTeamColumn]);

  // Extract available HQ values from auth-filtered data
  const availableHqValues = useMemo(() => {
    if (!authFilteredData || !Array.isArray(authFilteredData) || isEmpty(authFilteredData)) {
      return [];
    }

    if (!hqColumn) {
      return [];
    }

    const hqValuesSet = new Set();
    authFilteredData.forEach(row => {
      if (row && typeof row === 'object') {
        const value = getDataValue(row, hqColumn);
        if (!isNil(value) && value !== '') {
          hqValuesSet.add(String(value));
        }
      }
    });

    return Array.from(hqValuesSet).sort();
  }, [authFilteredData, hqColumn]);

  // Reset selectedSalesTeams when auth filters change significantly (to avoid stale selections)
  useEffect(() => {
    if (selectedSalesTeams && selectedSalesTeams.length > 0 && availableSalesTeamValues.length > 0) {
      const availableValues = new Set(availableSalesTeamValues);
      const hasInvalidSelection = selectedSalesTeams.some(team => !availableValues.has(team));
      if (hasInvalidSelection) {
        const validTeams = selectedSalesTeams.filter(team => availableValues.has(team));
        setSelectedSalesTeams(validTeams);
      }
    } else if (selectedSalesTeams && selectedSalesTeams.length > 0 && availableSalesTeamValues.length === 0) {
      setSelectedSalesTeams([]);
    }
  }, [availableSalesTeamValues, salesTeamColumn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset selectedHqTeams when auth filters change significantly (to avoid stale selections)
  useEffect(() => {
    if (selectedHqTeams && selectedHqTeams.length > 0 && availableHqValues.length > 0) {
      const availableValues = new Set(availableHqValues);
      const hasInvalidSelection = selectedHqTeams.some(team => !availableValues.has(team));
      if (hasInvalidSelection) {
        const validTeams = selectedHqTeams.filter(team => availableValues.has(team));
        setSelectedHqTeams(validTeams);
      }
    } else if (selectedHqTeams && selectedHqTeams.length > 0 && availableHqValues.length === 0) {
      setSelectedHqTeams([]);
    }
  }, [availableHqValues, hqColumn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply Sales Team and HQ filters to auth-filtered data
  const tableData = useMemo(() => {
    if (!authFilteredData || !Array.isArray(authFilteredData) || isEmpty(authFilteredData)) {
      return authFilteredData;
    }

    let filteredData = [...authFilteredData];

    // Filter by selected Sales Teams
    if (selectedSalesTeams && selectedSalesTeams.length > 0 && salesTeamColumn) {
      filteredData = filteredData.filter(row => {
        if (!row || typeof row !== 'object') return false;
        const salesTeamValue = getDataValue(row, salesTeamColumn);
        if (isNil(salesTeamValue)) {
          return selectedSalesTeams.some(team => team === null || team === undefined || team === '');
        }
        return selectedSalesTeams.some(team => String(team) === String(salesTeamValue));
      });
    }

    // Filter by selected HQ Teams
    if (selectedHqTeams && selectedHqTeams.length > 0 && hqColumn) {
      filteredData = filteredData.filter(row => {
        if (!row || typeof row !== 'object') return false;
        const hqValue = getDataValue(row, hqColumn);
        if (isNil(hqValue)) {
          return selectedHqTeams.some(team => team === null || team === undefined || team === '');
        }
        return selectedHqTeams.some(team => String(team) === String(hqValue));
      });
    }

    return filteredData;
  }, [authFilteredData, selectedSalesTeams, selectedHqTeams, salesTeamColumn, hqColumn]);

  // Debug: Print searchFields and sortFields for selected queryId
  useEffect(() => {
    if (dataSource && dataSource !== 'offline' && currentQueryDoc) {
      console.log(`[DataProvider] searchFields and sortFields for queryId: ${dataSource}`, {
        queryId: dataSource,
        clientSave: currentQueryDoc.clientSave,
        searchFields: currentQueryDoc.searchFields || {},
        sortFields: currentQueryDoc.sortFields || {},
        searchFieldsKeys: currentQueryDoc.searchFields ? Object.keys(currentQueryDoc.searchFields) : [],
        sortFieldsKeys: currentQueryDoc.sortFields ? Object.keys(currentQueryDoc.sortFields) : [],
        currentQueryDoc: currentQueryDoc,
      });
    }
  }, [dataSource, currentQueryDoc]);

  // Sync searchInputValue with searchTerm when searchTerm is cleared externally
  useEffect(() => {
    if (!searchTerm) {
      setSearchInputValue('');
    }
  }, [searchTerm]);

  // Reset search and sort when query changes
  useEffect(() => {
    setSearchTerm('');
    setSearchInputValue('');
    setSortConfig(null);
  }, [dataSource]);

  // Pre-compute search index: Map<rowIndex, Set<lowercasedSearchableValues>>
  // This allows O(1) lookup instead of O(m*k) per row during search
  const searchIndex = useMemo(() => {
    if (!tableData || !Array.isArray(tableData) || isEmpty(tableData)) {
      return null;
    }

    const queryDoc = currentQueryDoc;
    if (!queryDoc || queryDoc.clientSave !== true || !queryDoc.searchFields) {
      return null;
    }

    const searchFieldsObj = queryDoc.searchFields;
    const index = new Map();

    // Pre-extract all searchable values for each row
    tableData.forEach((row, rowIndex) => {
      const searchableValues = new Set();

      // Extract values from all search fields
      Object.keys(searchFieldsObj).forEach(topLevelKey => {
        const nestedPaths = searchFieldsObj[topLevelKey];
        if (!Array.isArray(nestedPaths) || nestedPaths.length === 0) return;

        nestedPaths.forEach(nestedPath => {
          const value = getNestedValue(row, topLevelKey, nestedPath);
          if (value != null) {
            // Convert to lowercase string once and store
            const valueLower = String(value).toLowerCase();
            searchableValues.add(valueLower);
          }
        });
      });

      if (searchableValues.size > 0) {
        index.set(rowIndex, searchableValues);
      }
    });

    return index;
  }, [tableData, currentQueryDoc?.searchFields, currentQueryDoc?.clientSave]);

  // Apply search filter after auth filters (only when clientSave is true)
  // Optimized to use pre-computed searchIndex for O(n) instead of O(n*m*k)
  const searchedData = useMemo(() => {
    if (!tableData || !Array.isArray(tableData) || isEmpty(tableData)) {
      return tableData;
    }

    // Only apply search if clientSave is true and searchFields exist
    const queryDoc = currentQueryDoc;
    if (!queryDoc || queryDoc.clientSave !== true || !queryDoc.searchFields || !searchTerm || !searchTerm.trim()) {
      return tableData;
    }

    // Use pre-computed search index if available
    if (searchIndex) {
      const searchLower = searchTerm.toLowerCase().trim();
      const filtered = tableData.filter((row, rowIndex) => {
        const searchableValues = searchIndex.get(rowIndex);
        if (!searchableValues) return false;

        // Check if any searchable value contains the search term
        // Using Array.from and some for Set iteration
        return Array.from(searchableValues).some(value => value.includes(searchLower));
      });
      return filtered;
    }

    // Fallback to original algorithm if searchIndex not available
    const searchFieldsObj = queryDoc.searchFields;
    const searchLower = searchTerm.toLowerCase().trim();

    const filtered = tableData.filter((row, rowIndex) => {
      return Object.keys(searchFieldsObj).some(topLevelKey => {
        const nestedPaths = searchFieldsObj[topLevelKey];
        if (!Array.isArray(nestedPaths) || nestedPaths.length === 0) return false;

        return nestedPaths.some(nestedPath => {
          const value = getNestedValue(row, topLevelKey, nestedPath);
          if (value == null) return false;
          const valueLower = String(value).toLowerCase();
          return valueLower.includes(searchLower);
        });
      });
    });
    return filtered;
  }, [tableData, currentQueryDoc, searchTerm, searchIndex]);

  // Pre-compute sort value cache: Array<{rowIndex, sortValue, originalRow}>
  // This allows O(1) value access instead of O(d) per comparison during sort
  const sortValueCache = useMemo(() => {
    if (!searchedData || !Array.isArray(searchedData) || isEmpty(searchedData)) {
      return null;
    }

    const queryDoc = currentQueryDoc;
    if (!queryDoc || queryDoc.clientSave !== true || !queryDoc.sortFields || !sortConfig) {
      return null;
    }

    const sortFieldsObj = queryDoc.sortFields;
    const { field } = sortConfig;
    const [topLevelKey, ...nestedParts] = field.split('.');
    const nestedPath = nestedParts.join('.');

    if (!sortFieldsObj[topLevelKey] || !sortFieldsObj[topLevelKey].includes(nestedPath)) {
      return null;
    }

    // Infer column type once (cached)
    const fieldType = columnTypesOverride[field] || inferColumnType(searchedData, field, topLevelKey, nestedPath);

    // Pre-extract all sort values
    const cache = searchedData.map((row, rowIndex) => {
      const sortValue = getNestedValue(row, topLevelKey, nestedPath);
      return {
        rowIndex,
        sortValue,
        originalRow: row,
        fieldType
      };
    });

    return cache;
  }, [searchedData, currentQueryDoc?.sortFields, currentQueryDoc?.clientSave, sortConfig, columnTypesOverride]);

  // Apply sort after search (only when clientSave is true)
  // Optimized to use pre-computed sortValueCache for O(n log n) instead of O(n log n * d)
  const searchSortSortedData = useMemo(() => {
    if (!searchedData || !Array.isArray(searchedData) || isEmpty(searchedData)) {
      return searchedData;
    }

    const queryDoc = currentQueryDoc;
    if (!queryDoc || queryDoc.clientSave !== true || !queryDoc.sortFields || !sortConfig) {
      return searchedData;
    }

    const { field, direction } = sortConfig;
    const [topLevelKey, ...nestedParts] = field.split('.');
    const nestedPath = nestedParts.join('.');

    const sortFieldsObj = queryDoc.sortFields;
    if (!sortFieldsObj[topLevelKey] || !sortFieldsObj[topLevelKey].includes(nestedPath)) {
      return searchedData;
    }

    // Use pre-computed cache if available
    if (sortValueCache && sortValueCache.length > 0) {
      const fieldType = sortValueCache[0].fieldType;

      // Create typed comparator functions
      let compareFn;
      switch (fieldType) {
        case 'number':
          compareFn = (a, b) => {
            const aNum = toNumber(a.sortValue) || 0;
            const bNum = toNumber(b.sortValue) || 0;
            return aNum - bNum;
          };
          break;
        case 'date':
          compareFn = (a, b) => {
            const aDate = parseToDate(a.sortValue);
            const bDate = parseToDate(b.sortValue);
            return (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
          };
          break;
        case 'boolean':
          compareFn = (a, b) => {
            const aBool = a.sortValue ? 1 : 0;
            const bBool = b.sortValue ? 1 : 0;
            return aBool - bBool;
          };
          break;
        default: // string
          compareFn = (a, b) => {
            return String(a.sortValue || '').localeCompare(String(b.sortValue || ''));
          };
      }

      // Sort the cache array with direction applied
      const sortedCache = [...sortValueCache].sort((a, b) => {
        const comparison = compareFn(a, b);
        return direction === 'asc' ? comparison : -comparison;
      });

      // Extract original rows in sorted order
      return sortedCache.map(item => item.originalRow);
    }

    // Fallback to original algorithm if cache not available
    const fieldType = columnTypesOverride[field] || inferColumnType(searchedData, field, topLevelKey, nestedPath);

    const sorted = [...searchedData].sort((a, b) => {
      const aValue = getNestedValue(a, topLevelKey, nestedPath);
      const bValue = getNestedValue(b, topLevelKey, nestedPath);

      let comparison = 0;
      switch (fieldType) {
        case 'number':
          comparison = (toNumber(aValue) || 0) - (toNumber(bValue) || 0);
          break;
        case 'date':
          const aDate = parseToDate(aValue);
          const bDate = parseToDate(bValue);
          comparison = (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
          break;
        case 'boolean':
          comparison = (aValue ? 1 : 0) - (bValue ? 1 : 0);
          break;
        default: // string
          comparison = String(aValue || '').localeCompare(String(bValue || ''));
      }

      return direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [searchedData, currentQueryDoc, sortConfig, columnTypesOverride, sortValueCache]);

  // Table operation state (for orchestration layer)
  const [tableFilters, setTableFilters] = useState({});
  const [tableSortMeta, setTableSortMeta] = useState([]);
  const [tablePagination, setTablePagination] = useState({ first: 0, rows: 10 }); // Default rows will be updated from props
  const [tableExpandedRows, setTableExpandedRows] = useState(null);
  const [tableVisibleColumns, setTableVisibleColumns] = useState(visibleColumns || []);

  // Drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerData, setDrawerData] = useState([]);
  const [activeDrawerTabIndex, setActiveDrawerTabIndex] = useState(0);
  const [clickedDrawerValues, setClickedDrawerValues] = useState({ outerValue: null, innerValue: null });

  // Ensure at least one tab exists
  useEffect(() => {
    if (!drawerTabs || drawerTabs.length === 0) {
      if (onDrawerTabsChange) {
        onDrawerTabsChange([{ id: `tab-${Date.now()}`, name: '', outerGroup: null, innerGroup: null }]);
      }
    }
  }, [drawerTabs, onDrawerTabsChange]);

  // Notify parent when raw data changes (for Auth Control in DataTableControls)
  useEffect(() => {
    if (onRawDataChange) {
      onRawDataChange(rawTableData);
    }
  }, [rawTableData, onRawDataChange]);

  // Note: onTableDataChange is called later with final sortedData (line 2904)
  // which includes both searchFields/sortFields sorting and tableSortMeta sorting

  // Sync function that retriggers query execution
  const handleSync = useCallback(async () => {
    if (!dataSource || dataSource === 'offline') return;

    // For month-supported queries, require monthRange
    if (hasMonthSupport && (!monthRange || !Array.isArray(monthRange) || monthRange.length !== 2)) {
      return; // Don't execute if month range is required but not set
    }

    // Check IndexedDB first, then API if needed (same logic as initial load)
    if (currentQueryDoc) {
      await checkIndexedDBAndLoadData(dataSource, currentQueryDoc, monthRange);
    } else {
      // Fallback to direct API call if no queryDoc available
      await runQuery(dataSource, true);
    }
  }, [dataSource, hasMonthSupport, monthRange, currentQueryDoc, checkIndexedDBAndLoadData, runQuery]);

  // Column detection and type analysis (moved from DataTable)
  const columns = useMemo(() => {
    if (!tableData || !Array.isArray(tableData) || isEmpty(tableData)) {
      return [];
    }
    return uniq(flatMap(tableData, (item) =>
      item && typeof item === 'object' ? getDataKeys(item) : []
    ));
  }, [tableData]);

  const isNumericValue = useCallback((value) => {
    if (isNil(value)) return false;
    return isNumber(value) || (!_isNaN(parseFloat(value)) && _isFinite(value));
  }, []);

  // Column types computation (NEW FORMAT: { field_name: "boolean" | "number" | "date" | "string" })
  const columnTypes = useMemo(() => {
    const detectedTypes = {};
    if (isEmpty(tableData)) {
      return detectedTypes;
    }

    const sampleData = take(tableData, 100);

    columns.forEach((col) => {
      let numericCount = 0;
      let dateCount = 0;
      let booleanCount = 0;
      let binaryCount = 0;
      let nonNullCount = 0;

      sampleData.forEach((row) => {
        const value = getDataValue(row, col);
        if (!isNil(value)) {
          nonNullCount++;
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

      const isTrueBooleanColumn = nonNullCount > 0 && booleanCount > nonNullCount * 0.7;
      const isBinaryBooleanColumn = nonNullCount > 0 && binaryCount === nonNullCount && binaryCount >= 1;
      const isBooleanColumn = isTrueBooleanColumn || isBinaryBooleanColumn;

      let dateCountWithBinary = dateCount;
      if (!isBooleanColumn && binaryCount > 0) {
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

      let numericCountWithBinary = numericCount;
      if (!isBooleanColumn && !isDateColumn && binaryCount > 0) {
        numericCountWithBinary += binaryCount;
      }
      const isNumericColumn = !isBooleanColumn && !isDateColumn && nonNullCount > 0 && numericCountWithBinary > nonNullCount * 0.8;

      let detectedTypeString = "string";
      if (isBooleanColumn) {
        detectedTypeString = "boolean";
      } else if (isDateColumn) {
        detectedTypeString = "date";
      } else if (isNumericColumn) {
        detectedTypeString = "number";
      }

      detectedTypes[col] = detectedTypeString;
    });

    // Merge detected types with overrides (overrides take precedence)
    const mergedTypes = { ...detectedTypes, ...columnTypesOverride };
    return mergedTypes;
  }, [tableData, columns, isNumericValue, columnTypesOverride]);

  // Multiselect columns computation
  const multiselectColumns = useMemo(() => {
    if (!enableFilter) return [];
    // Get all string columns (non-numeric, non-boolean, non-date)
    const stringColumns = columns.filter(col => {
      const colType = columnTypes[col] || 'string';
      return colType === 'string';
    });
    // Remove textFilterColumns from string columns to get multiselect columns
    const textFilterSet = new Set(textFilterColumns);
    return stringColumns.filter(col => !textFilterSet.has(col));
  }, [columns, columnTypes, textFilterColumns, enableFilter]);

  // Percentage column helpers
  const hasPercentageColumns = useMemo(() => {
    if (isEmpty(percentageColumns) || !isArray(percentageColumns)) {
      return false;
    }
    return percentageColumns.some(pc => pc.columnName && pc.columnName.trim() !== '');
  }, [percentageColumns]);

  const percentageColumnNames = useMemo(() => {
    return hasPercentageColumns ? percentageColumns.map(pc => pc.columnName).filter(Boolean) : [];
  }, [hasPercentageColumns, percentageColumns]);

  const isPercentageColumn = useCallback((columnName) => {
    return hasPercentageColumns && percentageColumns.some(pc => pc.columnName === columnName);
  }, [hasPercentageColumns, percentageColumns]);

  const getPercentageColumnValue = useCallback((rowData, columnName) => {
    const config = percentageColumns.find(pc => pc.columnName === columnName);
    if (!config || !config.targetField || !config.valueField) return null;
    const targetValue = getDataValue(rowData, config.targetField);
    const actualValue = getDataValue(rowData, config.valueField);
    const targetNum = isNumber(targetValue) ? targetValue : (isNil(targetValue) ? null : toNumber(targetValue));
    const actualNum = isNumber(actualValue) ? actualValue : (isNil(actualValue) ? null : toNumber(actualValue));
    if (!isNil(targetNum) && !isNil(actualNum) && !_isNaN(targetNum) && !_isNaN(actualNum) && _isFinite(targetNum) && _isFinite(actualNum) && targetNum !== 0) {
      return (actualNum / targetNum) * 100;
    }
    return null;
  }, [percentageColumns]);

  const getPercentageColumnSortFunction = useCallback((col) => {
    return (rowData1, rowData2) => {
      const val1 = getPercentageColumnValue(rowData1, col);
      const val2 = getPercentageColumnValue(rowData2, col);
      if (isNil(val1) && isNil(val2)) return 0;
      if (isNil(val1)) return 1;
      if (isNil(val2)) return -1;
      const num1 = isNumber(val1) ? val1 : toNumber(val1);
      const num2 = isNumber(val2) ? val2 : toNumber(val2);
      if (_isNaN(num1) && _isNaN(num2)) return 0;
      if (_isNaN(num1)) return 1;
      if (_isNaN(num2)) return -1;
      return num1 - num2;
    };
  }, [getPercentageColumnValue]);

  // Filter options computation
  const optionColumnValues = useMemo(() => {
    if (!enableFilter || isEmpty(tableData)) return {};
    const values = {};
    columns.forEach((col) => {
      const filteredForColumn = filter(tableData, (row) => {
        if (!row || typeof row !== 'object') return false;
        return every(columns, (otherCol) => {
          if (otherCol === col) return true;
          const filterObj = get(tableFilters, otherCol);
          if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;
          if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;
          const cellValue = getDataValue(row, otherCol);
          const filterValue = filterObj.value;
          const colType = columnTypes[otherCol] || 'string';
          const isMultiselectColumn = includes(multiselectColumns, otherCol);
          if (isMultiselectColumn && isArray(filterValue)) {
            return some(filterValue, (v) => {
              if (isNil(v) && isNil(cellValue)) return true;
              if (isNil(v) || isNil(cellValue)) return false;
              return v === cellValue || String(v) === String(cellValue);
            });
          }
          if (colType === 'boolean') {
            const cellIsTruthy = cellValue === true || cellValue === 1 || cellValue === '1';
            const cellIsFalsy = cellValue === false || cellValue === 0 || cellValue === '0';
            if (filterValue === true) {
              return cellIsTruthy;
            } else if (filterValue === false) {
              return cellIsFalsy;
            }
            return true;
          }
          if (colType === 'date') {
            return applyDateFilter(cellValue, filterValue);
          }
          if (colType === 'number') {
            const parsedFilter = parseNumericFilter(filterValue);
            return applyNumericFilter(cellValue, parsedFilter);
          }
          const strCell = toLower(String(cellValue ?? ''));
          const strFilter = toLower(String(filterValue));
          return includes(strCell, strFilter);
        });
      });
      const uniqueVals = uniq(filteredForColumn.map((row) => getDataValue(row, col)));
      const hasNull = some(uniqueVals, val => isNil(val));
      const nonNullVals = filter(uniqueVals, val => !isNil(val));
      const sortedNonNull = orderBy(nonNullVals);
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
  }, [tableData, searchSortSortedData, multiselectColumns, tableFilters, columns, columnTypes, hasPercentageColumns, percentageColumnNames, isPercentageColumn, getPercentageColumnValue, enableFilter]);

  // Filtered data computation
  const filteredData = useMemo(() => {
    // Use searchSortSortedData if available (it contains both search filtering and sort)
    // If searchSortSortedData exists, it means either:
    // 1. Search is active (searchedData was filtered) - use searchSortSortedData
    // 2. Sort is active but no search (searchedData = tableData, but sorted) - use searchSortSortedData
    // 3. Neither search nor sort - searchSortSortedData = searchedData = tableData - use it anyway
    // Only use tableData directly if searchSortSortedData is null/undefined (shouldn't happen normally)
    let dataSource;
    if (searchSortSortedData != null) {
      // searchSortSortedData exists - use it (handles both search and sort)
      dataSource = searchSortSortedData;
    } else {
      // Fallback: use tableData if searchSortSortedData is somehow null
      dataSource = tableData;
    }
    if (isEmpty(dataSource)) {
      return [];
    }
    if (!enableFilter) {
      return dataSource;
    }
    return filter(dataSource, (row) => {
      if (!row || typeof row !== 'object') return false;
      const regularColumnsPass = every(columns, (col) => {
        const filterObj = get(tableFilters, col);
        if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;
        if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;
        const cellValue = getDataValue(row, col);
        const filterValue = filterObj.value;
        const colType = columnTypes[col] || 'string';
        const isMultiselectColumn = includes(multiselectColumns, col);
        if (isMultiselectColumn && isArray(filterValue)) {
          return some(filterValue, (v) => {
            if (isNil(v) && isNil(cellValue)) return true;
            if (isNil(v) || isNil(cellValue)) return false;
            return v === cellValue || String(v) === String(cellValue);
          });
        }
        if (colType === 'boolean') {
          const cellIsTruthy = cellValue === true || cellValue === 1 || cellValue === '1';
          const cellIsFalsy = cellValue === false || cellValue === 0 || cellValue === '0';
          if (filterValue === true) {
            return cellIsTruthy;
          } else if (filterValue === false) {
            return cellIsFalsy;
          }
          return true;
        }
        if (colType === 'date') {
          return applyDateFilter(cellValue, filterValue);
        }
        if (colType === 'number') {
          const parsedFilter = parseNumericFilter(filterValue);
          return applyNumericFilter(cellValue, parsedFilter);
        }
        const strCell = toLower(String(cellValue ?? ''));
        const strFilter = toLower(String(filterValue));
        return includes(strCell, strFilter);
      });
      if (!regularColumnsPass) return false;
      if (hasPercentageColumns) {
        return every(percentageColumnNames, (col) => {
          const filterObj = get(tableFilters, col);
          if (!filterObj || isNil(filterObj.value) || filterObj.value === '') return true;
          if (isArray(filterObj.value) && isEmpty(filterObj.value)) return true;
          const cellValue = getPercentageColumnValue(row, col);
          const filterValue = filterObj.value;
          const parsedFilter = parseNumericFilter(filterValue);
          return applyNumericFilter(cellValue, parsedFilter);
        });
      }
      return true;
    });
  }, [searchSortSortedData, searchTerm, tableData, tableFilters, columns, columnTypes, multiselectColumns, hasPercentageColumns, percentageColumnNames, getPercentageColumnValue, enableFilter]);

  // Report data computation (when enableReport is true)
  const reportData = useMemo(() => {
    if (!enableReport || !dateColumn || isEmpty(filteredData) || !outerGroupField) {
      return null;
    }
    
    return transformToReportData(
      filteredData,
      outerGroupField,
      innerGroupField,
      dateColumn,
      breakdownType,
      columnTypes
    );
  }, [enableReport, dateColumn, breakdownType, filteredData, outerGroupField, innerGroupField, columnTypes]);

  // Grouped data computation
  const groupedData = useMemo(() => {
    // If report is enabled, use report data instead
    if (enableReport && reportData && reportData.tableData) {
      return reportData.tableData;
    }
    
    // Otherwise use existing grouping logic
    if (!outerGroupField || isEmpty(filteredData)) {
      if (!outerGroupField && isArray(filteredData)) {
        return filteredData.filter(row => !row?.__isGroupRow__).map(row => {
          if (row instanceof Map) {
            const plainObj = {};
            row.forEach((value, key) => {
              plainObj[key] = value;
            });
            return plainObj;
          }
          return row;
        });
      }
      return isArray(filteredData) ? filteredData.map(row => {
        if (row instanceof Map) {
          const plainObj = {};
          row.forEach((value, key) => {
            plainObj[key] = value;
          });
          return plainObj;
        }
        return row;
      }) : [];
    }
    const groups = {};
    filteredData.forEach((row) => {
      if (row.__isGroupRow__) return;
      const groupKey = getDataValue(row, outerGroupField);
      const key = isNil(groupKey) ? '__null__' : String(groupKey);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(row);
    });
    const groupedResult = Object.entries(groups).map(([groupKey, rows]) => {
      let innerData = rows;
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
        innerData = Object.entries(innerGroups).map(([innerKey, innerRows]) => {
          const aggregated = {};
          const firstRow = innerRows[0];
          if (!firstRow) return null;
          columns.forEach((col) => {
            const colType = columnTypes[col] || {};
            if (col === innerGroupField) {
              aggregated[col] = innerKey === '__null__' ? null : innerKey;
            } else if (col === outerGroupField) {
              aggregated[col] = groupKey === '__null__' ? null : groupKey;
            } else if (colType === 'number') {
              const sum = sumBy(innerRows, (row) => {
                const val = getDataValue(row, col);
                if (isNil(val)) return 0;
                const numVal = isNumber(val) ? val : toNumber(val);
                return _isNaN(numVal) ? 0 : numVal;
              });
              aggregated[col] = sum;
            } else {
              const firstNonNull = innerRows.find(row => !isNil(getDataValue(row, col)));
              aggregated[col] = firstNonNull ? getDataValue(firstNonNull, col) : getDataValue(firstRow, col);
            }
          });
          if (hasPercentageColumns) {
            percentageColumns.forEach(pc => {
              if (pc.columnName && pc.targetField && pc.valueField) {
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
                aggregated[pc.columnName] = sumTarget !== 0 ? (sumValue / sumTarget) * 100 : null;
              }
            });
          }
          return aggregated;
        }).filter(Boolean);
      }
      const summaryRow = {};
      const firstItem = innerData[0];
      if (!firstItem) return null;
      columns.forEach((col) => {
        const colType = columnTypes[col] || {};
        if (col === outerGroupField) {
          summaryRow[col] = groupKey === '__null__' ? null : groupKey;
        } else if (col === innerGroupField) {
          summaryRow[col] = null;
        } else if (colType === 'number') {
          const sum = sumBy(innerData, (row) => {
            const val = getDataValue(row, col);
            if (isNil(val)) return 0;
            const numVal = isNumber(val) ? val : toNumber(val);
            return _isNaN(numVal) ? 0 : numVal;
          });
          summaryRow[col] = sum;
        } else {
          const firstNonNull = innerData.find(row => !isNil(getDataValue(row, col)));
          summaryRow[col] = firstNonNull ? getDataValue(firstNonNull, col) : getDataValue(firstItem, col);
        }
      });
      if (hasPercentageColumns) {
        percentageColumns.forEach(pc => {
          if (pc.columnName && pc.targetField && pc.valueField) {
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
            summaryRow[pc.columnName] = sumTarget !== 0 ? (sumValue / sumTarget) * 100 : null;
          }
        });
      }
      summaryRow.__groupKey__ = groupKey;
      summaryRow.__groupRows__ = innerData;
      summaryRow.__isGroupRow__ = true;
      return summaryRow;
    }).filter(Boolean);
    return groupedResult;
  }, [enableReport, reportData, filteredData, outerGroupField, innerGroupField, columns, columnTypes, hasPercentageColumns, percentageColumns]);

  // Sorted data computation
  const dataForSorting = useMemo(() => {
    const data = outerGroupField ? groupedData : filteredData;
    return isArray(data) ? data : [];
  }, [outerGroupField, groupedData, filteredData]);

  const sortedData = useMemo(() => {
    if (!isArray(dataForSorting)) {
      return [];
    }
    if (isEmpty(dataForSorting) || isEmpty(tableSortMeta)) {
      return dataForSorting;
    }
    if (!enableSort) {
      return dataForSorting;
    }
    const fields = tableSortMeta.map(s => {
      const field = s.field;
      if (isPercentageColumn(field)) {
        return (rowData) => getPercentageColumnValue(rowData, field);
      }
      return field;
    });
    const orders = tableSortMeta.map(s => s.order === 1 ? 'asc' : 'desc');
    return orderBy(dataForSorting, fields, orders);
  }, [dataForSorting, tableSortMeta, isPercentageColumn, getPercentageColumnValue, enableSort]);

  // Summation computation
  const calculateSums = useMemo(() => {
    const sums = {};
    const dataForSums = filteredData;
    if (isEmpty(dataForSums)) return sums;
    columns.forEach((col) => {
      const colType = columnTypes[col] || 'string';
      if (colType === 'date') return;
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

  // Paginated data computation
  const paginatedData = useMemo(() => {
    const result = !isArray(sortedData) ? [] : sortedData.slice(tablePagination.first, tablePagination.first + tablePagination.rows);
    return result;
  }, [sortedData, tablePagination]);

  // Initialize filters effect
  useEffect(() => {
    if (!enableFilter) {
      if (!isEmpty(tableFilters)) {
        setTableFilters({});
      }
      return;
    }
    if (isEmpty(columns)) return;
    const newFilters = { ...tableFilters };
    let changed = false;
    columns.forEach((col) => {
      const colType = columnTypes[col] || 'string';
      const isMultiselectColumn = includes(multiselectColumns, col);
      const desiredMatchMode =
        isMultiselectColumn ? 'in'
          : colType === 'boolean' ? 'equals'
            : colType === 'date' ? 'dateRange'
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
      setTableFilters(newFilters);
    }
  }, [columns, enableFilter, columnTypes, multiselectColumns, hasPercentageColumns, percentageColumnNames, tableFilters]);

  // Action handlers
  const updateFilter = useCallback((column, value) => {
    setTableFilters(prev => ({
      ...prev,
      [column]: { ...get(prev, column, {}), value }
    }));
    setTablePagination(prev => ({ ...prev, first: 0 }));
  }, []);

  const clearFilter = useCallback((column) => {
    updateFilter(column, null);
  }, [updateFilter]);

  const clearAllFilters = useCallback(() => {
    const clearedFilters = {};
    columns.forEach((col) => {
      const colType = columnTypes[col] || 'string';
      const isMultiselectColumn = includes(multiselectColumns, col);
      if (isMultiselectColumn) {
        clearedFilters[col] = { value: null, matchMode: 'in' };
      } else if (colType === 'boolean') {
        clearedFilters[col] = { value: null, matchMode: 'equals' };
      } else if (colType === 'date') {
        clearedFilters[col] = { value: null, matchMode: 'dateRange' };
      } else {
        clearedFilters[col] = { value: null, matchMode: 'contains' };
      }
    });
    if (hasPercentageColumns) {
      percentageColumnNames.forEach((col) => {
        clearedFilters[col] = { value: null, matchMode: 'contains' };
      });
    }
    setTableFilters(clearedFilters);
    setTablePagination(prev => ({ ...prev, first: 0 }));
  }, [columns, columnTypes, multiselectColumns, hasPercentageColumns, percentageColumnNames]);

  const updateSort = useCallback((sortMeta) => {
    setTableSortMeta(sortMeta || []);
    setTablePagination(prev => ({ ...prev, first: 0 }));
  }, []);

  const updatePagination = useCallback((first, rows) => {
    setTablePagination({ first, rows });
  }, []);

  const updateExpandedRows = useCallback((rows) => {
    setTableExpandedRows(rows);
  }, []);

  const updateVisibleColumns = useCallback((columns) => {
    setTableVisibleColumns(columns);
    if (onVisibleColumnsChange) {
      onVisibleColumnsChange(columns);
    }
  }, [onVisibleColumnsChange]);

  // Drawer action handlers
  const openDrawerWithData = useCallback((data, outerValue = null, innerValue = null) => {
    setDrawerData(data || []);
    setClickedDrawerValues({ outerValue, innerValue });
    setActiveDrawerTabIndex(0);
    setDrawerVisible(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false);
  }, []);

  const addDrawerTab = useCallback(() => {
    const newTab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: '',
      outerGroup: null,
      innerGroup: null
    };
    if (onDrawerTabsChange) {
      onDrawerTabsChange([...(drawerTabs || []), newTab]);
    }
    setActiveDrawerTabIndex((drawerTabs || []).length);
  }, [drawerTabs, onDrawerTabsChange]);

  const removeDrawerTab = useCallback((tabId) => {
    if (!drawerTabs || drawerTabs.length <= 1) return;
    const newTabs = drawerTabs.filter(tab => tab.id !== tabId);
    if (onDrawerTabsChange) {
      onDrawerTabsChange(newTabs);
    }
    if (activeDrawerTabIndex >= newTabs.length) {
      setActiveDrawerTabIndex(newTabs.length - 1);
    }
  }, [drawerTabs, activeDrawerTabIndex, onDrawerTabsChange]);

  const updateDrawerTab = useCallback((tabId, updates) => {
    if (onDrawerTabsChange) {
      onDrawerTabsChange(drawerTabs.map(tab =>
        tab.id === tabId ? { ...tab, ...updates } : tab
      ));
    }
  }, [drawerTabs, onDrawerTabsChange]);

  // Drawer filtering functions for group cells
  const openDrawerForOuterGroup = useCallback((value) => {
    if (!outerGroupField) return;

    // Filter data based on outer group value
    const filtered = filteredData.filter(row => {
      const rowValue = getDataValue(row, outerGroupField);
      if (isNil(value) && isNil(rowValue)) return true;
      if (isNil(value) || isNil(rowValue)) return false;
      return String(rowValue) === String(value);
    });

    openDrawerWithData(filtered, value, null);
  }, [filteredData, outerGroupField, openDrawerWithData]);

  const openDrawerForInnerGroup = useCallback((outerValue, innerValue) => {
    if (!outerGroupField || !innerGroupField) return;

    // Filter data based on both outer and inner group values
    const filtered = filteredData.filter(row => {
      const rowOuterValue = getDataValue(row, outerGroupField);
      const rowInnerValue = getDataValue(row, innerGroupField);

      // Check outer match
      let outerMatch = false;
      if (isNil(outerValue) && isNil(rowOuterValue)) {
        outerMatch = true;
      } else if (!isNil(outerValue) && !isNil(rowOuterValue)) {
        outerMatch = String(rowOuterValue) === String(outerValue);
      }
      if (!outerMatch) return false;

      // Check inner match
      if (isNil(innerValue) && isNil(rowInnerValue)) return true;
      if (isNil(innerValue) || isNil(rowInnerValue)) return false;
      return String(rowInnerValue) === String(innerValue);
    });

    openDrawerWithData(filtered, outerValue, innerValue);
  }, [filteredData, outerGroupField, innerGroupField, openDrawerWithData]);

  // Export helper functions
  const formatHeaderName = useCallback((key) => {
    // Check if it's a percentage column
    const percentageConfig = percentageColumns.find(pc => pc.columnName === key);
    if (percentageConfig) {
      return percentageConfig.columnName;
    }
    return startCase(key.split('__').join(' ').split('_').join(' '));
  }, [percentageColumns]);

  const isTruthyBoolean = useCallback((value) => {
    return value === true || value === 1 || value === '1';
  }, []);

  // Helper to convert columnTypes string format to flag format for export
  const getColumnTypeFlags = useCallback((col) => {
    const typeString = columnTypes[col] || 'string';
    return {
      isBoolean: typeString === 'boolean',
      isNumeric: typeString === 'number',
      isDate: typeString === 'date',
      isText: typeString === 'string'
    };
  }, [columnTypes]);

  // Export to XLSX function
  const exportToXLSX = useCallback(() => {
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
        const colTypeFlags = getColumnTypeFlags(col);
        return colTypeFlags.isNumeric;
      });
    } else {
      // Normal mode: use sortedData (full dataset) and compute percentage columns
      dataToExport = sortedData.map((row) => {
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

        const colTypeFlags = getColumnTypeFlags(col);

        // Format the value for export
        if (isNil(value)) {
          exportRow[formatHeaderName(col)] = '';
        } else if (colTypeFlags.isBoolean) {
          exportRow[formatHeaderName(col)] = isTruthyBoolean(value) ? 'Yes' : 'No';
        } else if (colTypeFlags.isDate) {
          exportRow[formatHeaderName(col)] = formatDateValue(value);
        } else {
          // Check if it's a percentage column or numeric value
          const isPctCol = isPercentageColumn(col);
          const isNumeric = isPctCol || colTypeFlags.isNumeric || (typeof value === 'number' && Number.isFinite(value));

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
  }, [sortedData, groupedData, outerGroupField, innerGroupField, hasPercentageColumns, percentageColumns, isPercentageColumn, getPercentageColumnValue, formatHeaderName, isTruthyBoolean, formatDateValue, getColumnTypeFlags]);

  // Create context value
  const contextValue = useMemo(() => ({
    rawData: sortedData, // Use sortedData as rawData for context (after all filters)
    columns,
    columnTypes,
    filteredData,
    groupedData,
    sortedData,
    paginatedData,
    sums: calculateSums,
    filterOptions: optionColumnValues,
    multiselectColumns,
    hasPercentageColumns,
    percentageColumns,
    percentageColumnNames,
    isPercentageColumn,
    getPercentageColumnValue,
    getPercentageColumnSortFunction,
    filters: tableFilters,
    sortMeta: tableSortMeta,
    pagination: tablePagination,
    expandedRows: tableExpandedRows,
    visibleColumns: tableVisibleColumns,
    enableSort,
    enableFilter,
    enableSummation,
    enableGrouping,
    textFilterColumns,
    outerGroupField,
    innerGroupField,
    redFields,
    greenFields,
    enableDivideBy1Lakh,
    enableReport,
    reportData,
    updateFilter,
    clearFilter,
    clearAllFilters,
    updateSort,
    updatePagination,
    updateExpandedRows,
    updateVisibleColumns,
    drawerVisible,
    drawerData,
    drawerTabs,
    activeDrawerTabIndex,
    clickedDrawerValues,
    openDrawerWithData,
    openDrawerForOuterGroup,
    openDrawerForInnerGroup,
    closeDrawer,
    addDrawerTab,
    removeDrawerTab,
    updateDrawerTab,
    setActiveDrawerTabIndex,
    formatDateValue,
    formatHeaderName,
    isTruthyBoolean,
    exportToXLSX,
    parseNumericFilter,
    applyNumericFilter,
    applyDateFilter,
    isNumericValue,
    // Search and sort props
    clientSave: currentQueryDoc?.clientSave || false,
    searchFields: currentQueryDoc?.searchFields || null,
    sortFields: currentQueryDoc?.sortFields || null,
    searchTerm,
    setSearchTerm,
    sortConfig,
    setSortConfig,
  }), [
    sortedData, columns, columnTypes, filteredData, groupedData, paginatedData,
    calculateSums, optionColumnValues, multiselectColumns, hasPercentageColumns, percentageColumns, percentageColumnNames,
    isPercentageColumn, getPercentageColumnValue, getPercentageColumnSortFunction, tableFilters, tableSortMeta, tablePagination,
    tableExpandedRows, tableVisibleColumns, enableSort, enableFilter, enableSummation, enableGrouping,
    textFilterColumns, outerGroupField, innerGroupField, redFields, greenFields, enableDivideBy1Lakh,
    updateFilter, clearFilter, clearAllFilters, updateSort, updatePagination, updateExpandedRows,
    updateVisibleColumns, drawerVisible, drawerData, drawerTabs, activeDrawerTabIndex, clickedDrawerValues,
    openDrawerWithData, openDrawerForOuterGroup, openDrawerForInnerGroup, closeDrawer, addDrawerTab, removeDrawerTab, updateDrawerTab,
    formatHeaderName, isTruthyBoolean, exportToXLSX, isNumericValue, currentQueryDoc, searchTerm, sortConfig, enableReport, reportData
  ]);

  // Render selectors JSX
  const selectorsJSX = (
    <>
      <div className="flex flex-col gap-3 w-full min-w-0">
        <div className="flex items-center justify-between w-full gap-3 flex-wrap">
          <div className="flex items-end gap-3 flex-wrap min-w-0 flex-1">
            {/* Month Range Picker - Only show when using saved query that supports month filtering */}
            {dataSource && hasMonthSupport && (
              <div className="w-full sm:w-64 min-w-0 flex-shrink-0">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Month Range
                </label>
                <MonthRangePicker
                  key={dataSource} // Force re-render when data source changes
                  value={monthRange}
                  onChange={(dates) => {
                    if (dates && dates[0] && dates[1]) {
                      setMonthRange([dates[0], dates[1]]);
                    } else {
                      setMonthRange(null);
                    }
                  }}
                  placeholder={['Start month', 'End month']}
                  format="MM/YY"
                  disabled={executingQuery}
                  className="w-full"
                  style={{
                    width: '100%',
                    fontSize: '0.875rem',
                    height: '3rem',
                  }}
                />
              </div>
            )}

            {/* Breakdown By - Only show when report is enabled and date column is set */}
            {enableReport && dateColumn && onBreakdownTypeChange && (
              <div className="w-full sm:w-48 min-w-0 flex-shrink-0">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Breakdown By
                </label>
                <Dropdown
                  value={breakdownType}
                  onChange={(e) => onBreakdownTypeChange(e.value)}
                  options={[
                    { label: 'Month-wise', value: 'month' },
                    { label: 'Week-wise', value: 'week' },
                    { label: 'Day-wise', value: 'day' },
                    { label: 'Quarter-wise', value: 'quarter' },
                    { label: 'Year-wise', value: 'annual' }
                  ]}
                  optionLabel="label"
                  optionValue="value"
                  className="w-full"
                  disabled={executingQuery}
                  style={{
                    fontSize: '0.875rem',
                    height: '3rem',
                  }}
                />
              </div>
            )}

            {/* Sales Team Multi-Selector */}
            {salesTeamColumn && availableSalesTeamValues.length > 0 && (
              <div className="w-full sm:w-48 min-w-0 flex-shrink-0">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Sales Team
                </label>
                <MultiselectFilter
                  value={selectedSalesTeams}
                  options={availableSalesTeamValues.map(val => ({
                    label: String(val),
                    value: val
                  }))}
                  onChange={(values) => setSelectedSalesTeams(values || [])}
                  placeholder="Select sales teams..."
                  fieldName="sales teams"
                  itemLabel="Sales Team"
                  style={{
                    fontSize: '0.875rem',
                    height: '3rem',
                  }}
                />
              </div>
            )}

            {/* HQ Multi-Selector */}
            {hqColumn && availableHqValues.length > 0 && (
              <div className="w-full sm:w-48 min-w-0 flex-shrink-0">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  HQ
                </label>
                <MultiselectFilter
                  value={selectedHqTeams}
                  options={availableHqValues.map(val => ({
                    label: String(val),
                    value: val
                  }))}
                  onChange={(values) => setSelectedHqTeams(values || [])}
                  placeholder="Select HQ..."
                  fieldName="HQ"
                  itemLabel="HQ"
                  style={{
                    fontSize: '0.875rem',
                    height: '3rem',
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Last Updated at with Sync button - Show when using saved query, in a new row below Data Source */}
        {dataSource && dataSource !== 'offline' && (
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleSync}
              disabled={executingQuery || (hasMonthSupport && (!monthRange || !Array.isArray(monthRange) || monthRange.length !== 2))}
              className="flex items-center gap-2 px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <i className={`${executingQuery ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'} text-blue-600`}></i>
              <div className="flex flex-col items-start">
                <span className="text-xs text-gray-500">
                  {lastUpdatedAt ? formatLastUpdatedDate(lastUpdatedAt) : 'N/A'}
                </span>
              </div>
            </button>
          </div>
        )}
      </div>
    </>
  );

  // Keep existing callback for backward compatibility
  useEffect(() => {
    if (onTableDataChange) {
      onTableDataChange(sortedData);
    }
  }, [sortedData, onTableDataChange]);

  // Ref for sort overlay panel
  const sortOverlayRef = useRef(null);

  // Combined Search and Sort Controls component - memoized to prevent focus loss
  // Conditionally show search and sort UI based on searchFields/sortFields existence
  const SearchAndSortControls = useMemo(() => {
    // Check if searchFields exist
    const hasSearchFields = currentQueryDoc?.searchFields &&
      typeof currentQueryDoc.searchFields === 'object' &&
      !Array.isArray(currentQueryDoc.searchFields) &&
      Object.keys(currentQueryDoc.searchFields).length > 0;

    // Check if sortFields exist
    const hasSortFields = currentQueryDoc?.sortFields &&
      typeof currentQueryDoc.sortFields === 'object' &&
      !Array.isArray(currentQueryDoc.sortFields) &&
      Object.keys(currentQueryDoc.sortFields).length > 0;

    // If neither searchFields nor sortFields exist, return null
    if (!hasSearchFields && !hasSortFields) {
      return null;
    }

    // Search handlers
    const handleSearch = () => {
      const newSearchTerm = searchInputValue.trim();
      setSearchTerm(newSearchTerm);
    };

    // Sort handlers and options
    let sortableFields = [];
    let combinedSortOptions = [];

    if (hasSortFields && currentQueryDoc.sortFields) {
      // Get all sortable fields from sortFields
      Object.keys(currentQueryDoc.sortFields).forEach(topLevelKey => {
        const nestedPaths = currentQueryDoc.sortFields[topLevelKey];
        if (Array.isArray(nestedPaths)) {
          nestedPaths.forEach(nestedPath => {
            const fullPath = nestedPath ? `${topLevelKey}.${nestedPath}` : topLevelKey;
            // Format displayName using same logic as formatHeaderName
            const displayName = nestedPath
              ? startCase(nestedPath.split('__').join(' ').split('_').join(' '))
              : startCase(topLevelKey.split('__').join(' ').split('_').join(' '));
            sortableFields.push({ path: fullPath, displayName });

            // Create combined options: field + direction
            combinedSortOptions.push({
              label: `${displayName} (Asc)`,
              value: { field: fullPath, direction: 'asc' },
              icon: 'pi-sort-up'
            });
            combinedSortOptions.push({
              label: `${displayName} (Desc)`,
              value: { field: fullPath, direction: 'desc' },
              icon: 'pi-sort-down'
            });
          });
        }
      });
    }

    // Current sort value for dropdown
    const selectedSortValue = sortConfig ? {
      field: sortConfig.field,
      direction: sortConfig.direction
    } : null;

    const handleClearSort = () => {
      setSortConfig(null);
    };

    // Determine sort icon based on column type and direction
    const getSortIcon = () => {
      if (!sortConfig || !sortConfig.field) {
        return 'pi-sort-alt'; // Default icon when no sort
      }

      // Extract column name from field path (e.g., "data.item_name" -> "item_name")
      const fieldParts = sortConfig.field.split('.');
      const columnName = fieldParts.length > 1 ? fieldParts[fieldParts.length - 1] : sortConfig.field;

      // Determine column type - check columnTypes first, then default to string
      const colType = columnTypes[columnName] || 'string';
      const isNumeric = colType === 'number';
      const isAsc = sortConfig.direction === 'asc';

      if (isNumeric) {
        return isAsc ? 'pi-sort-numeric-down' : 'pi-sort-numeric-down-alt';
      } else {
        return isAsc ? 'pi-sort-alpha-down' : 'pi-sort-alpha-down-alt';
      }
    };

    const handleSortButtonClick = (event) => {
      if (sortOverlayRef.current) {
        sortOverlayRef.current.toggle(event);
      }
    };

    const handleSortOptionClick = (option) => {
      // Apply any pending search text when sort changes
      if (searchInputValue.trim() !== searchTerm) {
        handleSearch();
      }

      if (option.value && option.value !== null) {
        setSortConfig(option.value);
      } else {
        setSortConfig(null);
      }
      if (sortOverlayRef.current) {
        sortOverlayRef.current.hide();
      }
    };

    return (
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search Section - Only show if searchFields exist */}
          {hasSearchFields && (
            <>
              <InputText
                value={searchInputValue}
                onChange={(e) => setSearchInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                placeholder="Search across all search fields..."
                className="flex-1 min-w-50"
                style={{ fontSize: '0.875rem' }}
              />
              <Button
                icon="pi pi-search"
                onClick={handleSearch}
                className="p-button-sm p-button-outlined"
                title="Search"
              />
            </>
          )}

          {/* Sort Section - Only show if sortFields exist */}
          {hasSortFields && (
            <>
              <Button
                icon={`pi ${getSortIcon()}`}
                rounded
                outlined
                onClick={handleSortButtonClick}
                aria-label="Sort"
                className="p-button-sm"
                style={{ fontSize: '0.875rem' }}
              />
              <OverlayPanel ref={sortOverlayRef} className="w-64">
                <div className="flex flex-col gap-2">
                  <div
                    className="p-2 cursor-pointer hover:bg-gray-100 rounded"
                    onClick={() => handleSortOptionClick({ value: null })}
                  >
                    <span>-- No Sort --</span>
                  </div>
                  {combinedSortOptions.map((option, index) => (
                    <div
                      key={index}
                      className="p-2 cursor-pointer hover:bg-gray-100 rounded flex items-center gap-2"
                      onClick={() => handleSortOptionClick(option)}
                    >
                      <i className={`pi ${option.icon || ''}`}></i>
                      <span>{option.label}</span>
                    </div>
                  ))}
                </div>
              </OverlayPanel>
            </>
          )}
        </div>
      </div>
    );
  }, [currentQueryDoc, searchInputValue, searchTerm, sortConfig, columnTypes, setSearchInputValue, setSearchTerm, setSortConfig]);

  return (
    <>
      <TableOperationsContext.Provider value={contextValue}>
        {/* Render header controls if render prop provided */}
        {renderHeaderControls && renderHeaderControls(selectorsJSX)}

        {/* Search and Sort Controls */}
        {SearchAndSortControls}

        {/* Render children */}
        {children}
      </TableOperationsContext.Provider>

      {/* Drawer Sidebar */}
      <Sidebar
        position="bottom"
        blockScroll
        visible={drawerVisible}
        onHide={closeDrawer}
        style={{ height: '100vh' }}
        className="p-sidebar-sm"
        header={
          <h2 className="text-lg font-semibold text-gray-800 m-0">
            {clickedDrawerValues.innerValue
              ? `${clickedDrawerValues.outerValue} : ${clickedDrawerValues.innerValue}`
              : clickedDrawerValues.outerValue || 'Drawer'}
          </h2>
        }
      >
        <div className="flex flex-col h-full">
          <div className="flex-1">
            {drawerTabs && drawerTabs.length > 0 ? (
              <TabView
                activeIndex={Math.min(activeDrawerTabIndex, Math.max(0, drawerTabs.length - 1))}
                onTabChange={(e) => setActiveDrawerTabIndex(e.index)}
                className="h-full flex flex-col"
              >
                {drawerTabs.map((tab) => (
                  <TabPanel
                    key={tab.id}
                    header={tab.name || `Tab ${drawerTabs.indexOf(tab) + 1}`}
                    className="h-full flex flex-col"
                  >
                    <div className="flex-1 overflow-auto">
                      {drawerData && drawerData.length > 0 ? (
                        <DataTableComponent
                          data={drawerData}
                          rowsPerPageOptions={[5, 10, 25, 50, 100, 200]}
                          defaultRows={10}
                          scrollable={false}
                          enableSort={enableSort}
                          enableFilter={enableFilter}
                          enableSummation={enableSummation}
                          enableDivideBy1Lakh={enableDivideBy1Lakh}
                          textFilterColumns={textFilterColumns}
                          visibleColumns={visibleColumns}
                          onVisibleColumnsChange={onVisibleColumnsChange}
                          redFields={redFields}
                          greenFields={greenFields}
                          outerGroupField={tab.outerGroup}
                          innerGroupField={tab.innerGroup}
                          enableCellEdit={false}
                          nonEditableColumns={[]}
                          percentageColumns={percentageColumns}
                          tableName="sidebar"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                          <i className="pi pi-inbox text-4xl text-gray-400 mb-4"></i>
                          <p className="text-gray-600 font-medium">No data available</p>
                          <p className="text-sm text-gray-500 mt-1">No matching rows found</p>
                        </div>
                      )}
                    </div>
                  </TabPanel>
                ))}
              </TabView>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <i className="pi pi-inbox text-4xl text-gray-400 mb-4"></i>
                <p className="text-gray-600 font-medium">No tabs configured</p>
                <p className="text-sm text-gray-500 mt-1">Please configure drawer tabs in settings</p>
              </div>
            )}
          </div>
        </div>
      </Sidebar>
    </>
  );
}

