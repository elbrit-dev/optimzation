'use client';
import { generateMonthRangeArray } from '@/app/datatable/utils/dateUtils';
import { indexedDBService } from '@/app/datatable/utils/indexedDBService';
import { fetchGraphQLSchema } from '@/app/graphql-playground-v2/utils/schema-fetcher';
import { getEndpointConfigFromUrlKey, getInitialEndpoint } from '@/app/graphql-playground/constants';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { createExecutionContext } from '@/app/graphql-playground/utils/query-pipeline';
import { parseGraphQLVariables } from '@/app/graphql-playground/utils/variableParser';
import RangePicker from '@/components/RangePicker';
import { DataProvider as PlasmicDataProvider } from "@plasmicapp/loader-nextjs";
import { Switch } from 'antd';
import * as Comlink from 'comlink';
import dayjs from 'dayjs';
import {
  getNamedType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isUnionType,
} from 'graphql';
import {
  isFinite as _isFinite,
  isNaN as _isNaN,
  cloneDeep,
  every,
  filter,
  flatMap,
  get,
  head,
  includes,
  isArray,
  isBoolean,
  isDate,
  isEmpty,
  isNil,
  isNumber,
  isString,
  orderBy,
  some,
  startCase,
  sumBy,
  take,
  toLower,
  toNumber,
  trim,
  uniq,
} from 'lodash';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { Sidebar } from 'primereact/sidebar';
import { SplitButton } from 'primereact/splitbutton';
import { TabPanel, TabView } from 'primereact/tabview';
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useContext } from 'react';
import * as XLSX from 'xlsx';
import { TableOperationsContext } from '../contexts/TableOperationsContext';
import FilterSortSidebar from '../filter-sort/components/FilterSortSidebar';
import { getDataKeys, getDataValue, getNestedValue } from '../utils/dataAccessUtils';
import { isJsonArrayOfObjectsString, extractJsonNestedTablesRecursive } from '../utils/jsonArrayParser';
import { useReportData } from '../utils/providerUtils';
import { exportReportToXLSX } from '../utils/reportExportUtils';
import { transformToReportData } from '../utils/reportUtils';
import DataTableComponent from './DataTableNew';
import ReportLineChart from './ReportLineChart';


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

function getNamedTypeKind(type) {
  if (!type) return null;
  if (isObjectType(type)) return 'OBJECT';
  if (isInterfaceType(type)) return 'INTERFACE';
  if (isUnionType(type)) return 'UNION';
  if (isEnumType(type)) return 'ENUM';
  if (isInputObjectType(type)) return 'INPUT_OBJECT';
  if (isScalarType(type)) return 'SCALAR';
  return null;
}

function createGraphQLSerializationContext(schema) {
  return {
    schema,
    serializedTypes: new Map(),
    inProgress: new Set(),
  };
}

function serializeGraphQLArgument(arg, context) {
  if (!arg) {
    return null;
  }

  return {
    name: arg.name,
    description: arg.description ?? null,
    defaultValue: arg.defaultValue ?? null,
    type: serializeGraphQLTypeRef(arg.type, context),
  };
}

function serializeGraphQLTypeRef(type, context) {
  if (!type) {
    return null;
  }

  if (isNonNullType(type)) {
    return {
      kind: 'NON_NULL',
      ofType: serializeGraphQLTypeRef(type.ofType, context),
    };
  }

  if (isListType(type)) {
    return {
      kind: 'LIST',
      ofType: serializeGraphQLTypeRef(type.ofType, context),
    };
  }

  const namedType = getNamedType(type);
  const typeName = namedType?.name ?? null;
  const kind = getNamedTypeKind(namedType);

  if (namedType && typeName) {
    ensureGraphQLTypeSerialized(namedType, context);
  }

  return {
    kind,
    name: typeName,
  };
}

function ensureGraphQLTypeSerialized(namedType, context) {
  if (!namedType) {
    return;
  }

  const typeName = namedType.name;
  if (!typeName) {
    return;
  }

  if (context.serializedTypes.has(typeName) || context.inProgress.has(typeName)) {
    return;
  }

  context.inProgress.add(typeName);

  const kind = getNamedTypeKind(namedType);
  const typeDef = {
    kind,
    name: typeName,
    description: namedType?.description ?? null,
  };

  context.serializedTypes.set(typeName, typeDef);

  try {
    if (isObjectType(namedType) || isInterfaceType(namedType)) {
      const fields = Object.values(namedType.getFields?.() ?? {});
      typeDef.fields = fields.map((field) => ({
        name: field.name,
        description: field.description ?? null,
        args: Array.isArray(field.args) ? field.args.map((arg) => serializeGraphQLArgument(arg, context)) : [],
        type: serializeGraphQLTypeRef(field.type, context),
      }));

      if (typeof namedType.getInterfaces === 'function') {
        const interfaces = namedType.getInterfaces();
        typeDef.interfaces = interfaces.map((iface) => iface.name);
        interfaces.forEach((iface) => ensureGraphQLTypeSerialized(iface, context));
      }

      if (isInterfaceType(namedType) && context.schema?.getPossibleTypes) {
        try {
          const possible = context.schema.getPossibleTypes(namedType) || [];
          if (possible.length > 0) {
            typeDef.possibleTypes = possible.map((possibleType) => possibleType.name);
            possible.forEach((possibleType) => ensureGraphQLTypeSerialized(possibleType, context));
          }
        } catch (error) {
          console.warn('DataProviderNew: Failed to resolve possible types for', typeName, error);
        }
      }
    } else if (isUnionType(namedType)) {
      const unionTypes = typeof namedType.getTypes === 'function' ? namedType.getTypes() : [];
      typeDef.types = unionTypes.map((unionType) => unionType.name);
      unionTypes.forEach((unionType) => ensureGraphQLTypeSerialized(unionType, context));
    } else if (isEnumType(namedType)) {
      typeDef.values = typeof namedType.getValues === 'function'
        ? namedType.getValues().map((enumValue) => ({
          name: enumValue.name,
          description: enumValue.description ?? null,
          deprecationReason: enumValue.deprecationReason ?? null,
        }))
        : [];
    } else if (isInputObjectType(namedType)) {
      const inputFields = Object.values(namedType.getFields?.() ?? {});
      typeDef.inputFields = inputFields.map((inputField) => ({
        name: inputField.name,
        description: inputField.description ?? null,
        defaultValue: inputField.defaultValue ?? null,
        type: serializeGraphQLTypeRef(inputField.type, context),
      }));
    }
  } finally {
    context.inProgress.delete(typeName);
  }
}

function serializeGraphQLField(field, schema) {
  if (!field) {
    return null;
  }

  const context = createGraphQLSerializationContext(schema);

  const fieldInfo = {
    name: field.name,
    description: field.description ?? null,
    args: Array.isArray(field.args) ? field.args.map((arg) => serializeGraphQLArgument(arg, context)) : [],
    type: serializeGraphQLTypeRef(field.type, context),
  };

  const types = Object.fromEntries(context.serializedTypes);

  return {
    field: fieldInfo,
    types,
  };
}

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
  dataSource: dataSourceProp = null,
  selectedQueryKey: selectedQueryKeyProp = null,
  // Table operation props (for orchestration layer)
  enableSort = true,
  enableFilter = true,
  enableSummation = true,
  enableGrouping = true,
  textFilterColumns = [],
  allowedColumns = [], // Developer-controlled: restricts which columns are available for selection
  onAllowedColumnsChange,
  visibleColumns: visibleColumnsProp = null, // User-controlled: actual visible columns (can be passed from parent)
  onVisibleColumnsChange,
  percentageColumns = [],
  groupFields = null, // Array for infinite nesting - required for grouping (breaking change: outerGroupField/innerGroupField no longer supported)
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
  chartColumns = [],
  chartHeight = 400,
  reportDataOverride = null,
  forceBreakdown = null,
  showProviderHeader = true,
  parentColumnName = undefined,
  nestedTableFieldName = undefined,
  forceEnableWrite = undefined, // Force enableWrite for nested drawer tables
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
  const [preFilterValues, setPreFilterValues] = useState({}); // Unified pre-filter values: { fieldKey: [selectedValues] }
  const [filterSortSidebarVisible, setFilterSortSidebarVisible] = useState(false); // Filter and Sort sidebar visibility
  const [searchTerm, setSearchTerm] = useState(''); // Global search input value (applied)
  const [sortConfig, setSortConfig] = useState(null); // {field: "topLevelKey.nestedPath", direction: "asc" | "desc"}
  const [isApplyingFilterSort, setIsApplyingFilterSort] = useState(false); // Loading state for filter/sort operations
  const [columnGroupBy, setColumnGroupBy] = useState('values'); // Column grouping mode: 'values' or dateColumn
  const [breakdownType, setBreakdownType] = useState('month'); // Breakdown type: 'day', 'week', 'month', 'quarter', 'annual'
  const [enableBreakdown, setEnableBreakdown] = useState(forceBreakdown ?? false); // Whether breakdown/report mode is enabled
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
  const loggedWriteSchemaRef = useRef(new Set()); // Track logged write schema definitions to avoid duplicate logs

  // Mobile detection for responsive Switch sizing
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const checkMobile = () => {
      const windowWidth = window.innerWidth;
      const isMobileNow = windowWidth < 768;
      setIsMobile(isMobileNow);
    };

    // Check immediately
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

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

  useEffect(() => {
    const logWriteSchemaDefinition = async () => {
      const queryDoc = currentQueryDoc;
      if (!queryDoc?.enableWrite || !queryDoc?.writeSchema) {
        return;
      }

      const urlKey = typeof queryDoc.urlKey === 'string' ? queryDoc.urlKey.toUpperCase() : null;
      if (!urlKey) {
        console.warn('DataProviderNew: Skipping write schema logging due to missing urlKey');
        return;
      }

      const fieldName = String(queryDoc.writeSchema).trim();
      if (!fieldName) {
        return;
      }

      const cacheKey = `${queryDoc.id ?? 'unknown'}::${urlKey}::${fieldName}`;
      if (loggedWriteSchemaRef.current.has(cacheKey)) {
        return;
      }

      try {
        const schema = await fetchGraphQLSchema(urlKey);
        const queryType = schema?.getQueryType?.();
        if (!queryType) {
          console.warn('DataProviderNew: GraphQL query type unavailable for environment', urlKey);
          return;
        }

        const fields = queryType.getFields?.();
        const fieldDefinition = fields ? fields[fieldName] : null;

        if (!fieldDefinition) {
          console.warn(`DataProviderNew: Field ${fieldName} not found on query type for ${urlKey}`);
          return;
        }

        const serializedField = serializeGraphQLField(fieldDefinition, schema);

        console.log('Write schema field definition',
          serializedField?.types ?? [],
        );
        loggedWriteSchemaRef.current.add(cacheKey);
      } catch (error) {
        console.error('DataProviderNew: Failed to log write schema definition', error);
      }
    };

    logWriteSchemaDefinition();
  }, [currentQueryDoc]);

  // Handle data source changes - auto-execute when user changes data source or on initial load
  useEffect(() => {
    if (!dataSource) {
      // Switching to offline mode - reset query-related state
      setProcessedData(null);
      setSelectedQueryKey(null);
      setMonthRange(null);
      setHasMonthSupport(false);
      setQueryVariables({});
      setCurrentQueryDoc(null);
      setOfflineDataExecuted(false); // Reset offline execution state
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
          detail: 'Data loaded',
          life: 3000
        });
      }
    } else if (dataSource) {
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
    if (!dataSource) return; // Skip for offline mode

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
    if (!currentQueryDoc || currentQueryDoc.clientSave !== false || !dataSource) {
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
    if (!dataSource) {
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
    if (!dataSource) return; // Skip for offline mode
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


  // Format date to "10 Jan 26 23:05" format (24-hour clock)
  const formatLastUpdatedDate = (dateString) => {
    if (!dateString) return null;

    try {
      // Try to parse the date string with dayjs
      const parsedDate = dayjs(dateString);

      // Check if the date is valid
      if (!parsedDate.isValid()) {
        return dateString; // Return original if can't parse
      }

      // Format to "10 Jan 26 23:05" (24-hour format, no AM/PM)
      return parsedDate.format('D MMM YY HH:mm');
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
    if (currentQueryDoc && dataSource && currentQueryDoc.id === dataSource && monthRange) {
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
      if (dataSource) {
        // Only reset if we don't have a valid default selectedQueryKeyProp
        // (We'll check if it's valid in the next effect when availableQueryKeys are known)
        setSelectedQueryKey(null);
      }
    }
  }, [dataSource]);

  // Set selectedQueryKey when processedData/availableQueryKeys become available (only once per dataSource)
  useEffect(() => {
    if (!dataSource || !processedData) {
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
    if (!dataSource && offlineDataExecuted) {
      return offlineData || [];
    }
    // If query mode and executed, show processed data
    if (dataSource && processedData && selectedQueryKey) {
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

  // Pre-compute filter Sets for O(1) lookups (memoized separately for performance)
  const preFilterSets = useMemo(() => {
    const sets = {};
    Object.keys(preFilterValues).forEach(fieldKey => {
      const values = preFilterValues[fieldKey];
      if (Array.isArray(values) && values.length > 0) {
        // Convert to Set for O(1) lookup, normalize strings for comparison
        sets[fieldKey] = new Set(values.map(v => String(v)));
      }
    });
    return sets;
  }, [preFilterValues]);

  // Optimized pre-filter application - applies all pre-filters from preFilterValues
  const preFilteredData = useMemo(() => {
    // Early returns for performance
    if (!authFilteredData || !Array.isArray(authFilteredData) || isEmpty(authFilteredData)) {
      return authFilteredData;
    }

    if (isEmpty(preFilterValues) || Object.keys(preFilterSets).length === 0) {
      return authFilteredData;
    }

    // Single pass filtering with Set lookups
    const filterKeys = Object.keys(preFilterSets);
    if (filterKeys.length === 0) return authFilteredData;

    return filter(authFilteredData, (row) => {
      // Fast null check
      if (!row || typeof row !== 'object') return false;

      // Check all filters with early exit
      for (let i = 0; i < filterKeys.length; i++) {
        const fieldKey = filterKeys[i];
        const filterSet = preFilterSets[fieldKey];

        // Skip if no filter set (shouldn't happen, but safety check)
        if (!filterSet || filterSet.size === 0) continue;

        // Extract cell value once
        const cellValue = getDataValue(row, fieldKey);

        // For pre-filters, use string comparison (sidebar only supports string multi-select for now)
        // Convert to string for comparison
        const cellStr = isNil(cellValue) ? null : String(cellValue);

        // Check null/undefined handling
        if (cellStr === null) {
          if (!filterSet.has('null') && !filterSet.has('') && !filterSet.has('undefined')) {
            return false; // Early exit if null not in filter
          }
          continue; // Null matches, check next filter
        }

        // O(1) Set lookup instead of O(n) array.includes()
        if (!filterSet.has(cellStr)) {
          return false; // Early exit on first mismatch
        }
      }

      // All filters passed
      return true;
    });
  }, [authFilteredData, preFilterSets]);

  // tableData is now preFilteredData (pre-filters applied)
  const tableData = preFilteredData;

  // Debug: Print searchFields and sortFields for selected queryId
  useEffect(() => {
    if (dataSource && currentQueryDoc) {
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

  // Reset search, sort, and pre-filters when query changes
  useEffect(() => {
    setSearchTerm('');
    setSortConfig(null);
    setPreFilterValues({});
  }, [dataSource]);

  // Pre-compute search index: Map<rowIndex, Set<lowercasedSearchableValues>>
  // This allows O(1) lookup instead of O(m*k) per row during search
  const searchIndex = useMemo(() => {
    if (!preFilteredData || !Array.isArray(preFilteredData) || isEmpty(preFilteredData)) {
      return null;
    }

    const queryDoc = currentQueryDoc;
    if (!queryDoc || queryDoc.clientSave !== true || !queryDoc.searchFields) {
      return null;
    }

    const searchFieldsObj = queryDoc.searchFields;
    const index = new Map();

    // Pre-extract all searchable values for each row
    preFilteredData.forEach((row, rowIndex) => {
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
  }, [preFilteredData, currentQueryDoc?.searchFields, currentQueryDoc?.clientSave]);

  // Apply search filter after pre-filters (only when clientSave is true)
  // Optimized to use pre-computed searchIndex for O(n) instead of O(n*m*k)
  const searchedData = useMemo(() => {
    if (!preFilteredData || !Array.isArray(preFilteredData) || isEmpty(preFilteredData)) {
      return preFilteredData;
    }

    // Only apply search if clientSave is true and searchFields exist
    const queryDoc = currentQueryDoc;
    if (!queryDoc || queryDoc.clientSave !== true || !queryDoc.searchFields || !searchTerm || !searchTerm.trim()) {
      return preFilteredData;
    }

    // Use pre-computed search index if available
    if (searchIndex) {
      const searchLower = searchTerm.toLowerCase().trim();
      const filtered = preFilteredData.filter((row, rowIndex) => {
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

    const filtered = preFilteredData.filter((row) => {
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

  // Helper function to apply sortConfig sorting to any data array
  // Returns a comparator function that can be used with Array.sort()
  const getSortComparator = useCallback((sortConfig, fieldType, topLevelKey, nestedPath) => {
    if (!sortConfig) return null;

    const { field, direction } = sortConfig;
    return (a, b) => {
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
    };
  }, []);

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
  const [tableVisibleColumns, setTableVisibleColumns] = useState(visibleColumnsProp || []); // User-controlled: actual visible columns (independent from allowedColumns)

  // Sync visibleColumns from prop
  useEffect(() => {
    if (visibleColumnsProp !== null && visibleColumnsProp !== undefined) {
      setTableVisibleColumns(visibleColumnsProp);
    }
  }, [visibleColumnsProp]);

  // Access parent context to get handleDrawerSave for nested drawer tables
  const parentContext = useContext(TableOperationsContext);
  const parentHandleDrawerSave = parentContext?.handleDrawerSave;

  // Filter/Sort worker state (declared early for use in useMemo hooks)
  const filterSortWorkerRef = useRef(null);
  const filterSortWorkerInstanceRef = useRef(null);
  const filterSortComputationIdRef = useRef(0);
  const [workerComputedData, setWorkerComputedData] = useState(null);

  // Drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerData, setDrawerData] = useState([]);
  const [activeDrawerTabIndex, setActiveDrawerTabIndex] = useState(0);
  const [clickedDrawerValues, setClickedDrawerValues] = useState({ outerValue: null, innerValue: null });
  const [drawerHeaderTitle, setDrawerHeaderTitle] = useState(null);
  const [drawerTableOptions, setDrawerTableOptions] = useState(null);
  const [drawerJsonTables, setDrawerJsonTables] = useState(null); // Store nested JSON tables for drawer
  
  // Change tracking for nested tables
  // Map structure: tabId -> { originalData: [...], parentRowData: {...}, nestedTableFieldName: string }
  const originalNestedTableDataRef = useRef(new Map());
  const nestedTableDataRefsRef = useRef(new Map()); // Store refs to nested DataProviderNew instances to access current data
  const currentNestedTableDataRef = useRef(new Map()); // Track current data per tab (use ref to avoid infinite loops)

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
    if (!dataSource) return; // Skip for offline mode

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

  // Handle clearing cached data for a specific month range (or all data for non-month queries) and syncing
  const handleClearMonthRangeCache = useCallback(async () => {
    if (!dataSource) return; // Skip for offline mode
    if (!currentQueryDoc || currentQueryDoc.clientSave !== true) return;

    try {
      const queryId = dataSource;
      const isMonthQuery = currentQueryDoc.month === true;

      // Get the query database
      const queryDb = await indexedDBService.getQueryDatabase(queryId, currentQueryDoc);
      const existingStores = queryDb.tables.map((table) => table.name);

      if (isMonthQuery) {
        // For month queries: clear stores for the selected month range
        if (!monthRange || !Array.isArray(monthRange) || monthRange.length !== 2) {
          return;
        }

        const [startDate, endDate] = monthRange;

        // Generate month prefixes for the range
        const monthPrefixes = generateMonthRangeArray(startDate, endDate);

        if (monthPrefixes.length === 0) {
          return;
        }

        // Clear all stores that match the month prefixes
        for (const prefix of monthPrefixes) {
          // Find all stores that start with this prefix
          const matchingStores = existingStores.filter(storeName =>
            storeName.startsWith(`${prefix}_`)
          );

          // Clear each matching store
          for (const storeName of matchingStores) {
            try {
              await queryDb.table(storeName).clear();
            } catch (error) {
              console.error(`Error clearing store "${storeName}" for queryId ${queryId}:`, error);
            }
          }
        }

        // Also clear the index entries for the selected months
        try {
          const indexResult = await indexedDBService.getQueryIndexResult(queryId);
          if (indexResult && indexResult.result) {
            const indexData = indexResult.result;

            // Check if index is an object with month keys (month query structure)
            if (typeof indexData === 'object' && !Array.isArray(indexData) && indexData !== null) {
              // Remove the selected month keys from the index
              const updatedIndex = { ...indexData };
              let hasChanges = false;

              for (const prefix of monthPrefixes) {
                if (prefix in updatedIndex) {
                  delete updatedIndex[prefix];
                  hasChanges = true;
                }
              }

              // If there are remaining months, save the updated index
              // If no months left, clear the entire index entry
              if (hasChanges) {
                const remainingKeys = Object.keys(updatedIndex);
                if (remainingKeys.length > 0) {
                  // Save updated index with remaining months
                  await indexedDBService.saveQueryIndexResult(queryId, updatedIndex, currentQueryDoc);
                } else {
                  // No months left, clear the entire index
                  await indexedDBService.clearQueryIndexResult(queryId);
                }
              }
            }
          }
        } catch (indexError) {
          console.error(`Error clearing index for queryId ${queryId}:`, indexError);
        }
      } else {
        // For non-month queries: clear all stores (no month prefix)
        for (const storeName of existingStores) {
          // Only clear stores that don't have a month prefix (YYYY-MM_ format)
          // Month prefix stores start with YYYY-MM_ (7 chars + underscore = 8 chars minimum)
          const hasMonthPrefix = storeName.length >= 8 && /^\d{4}-\d{2}_/.test(storeName);
          if (!hasMonthPrefix) {
            try {
              await queryDb.table(storeName).clear();
            } catch (error) {
              console.error(`Error clearing store "${storeName}" for queryId ${queryId}:`, error);
            }
          }
        }

        // Also clear the index entry for non-month queries
        try {
          await indexedDBService.clearQueryIndexResult(queryId);
        } catch (indexError) {
          console.error(`Error clearing index for queryId ${queryId}:`, indexError);
        }
      }

      // After clearing, call sync to reload data
      await handleSync();
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }, [dataSource, monthRange, currentQueryDoc, handleSync]);

  // Column detection and type analysis (moved from DataTable)
  const columns = useMemo(() => {
    if (!tableData || !Array.isArray(tableData) || isEmpty(tableData)) {
      return [];
    }
    return uniq(flatMap(tableData, (item) =>
      item && typeof item === 'object' ? getDataKeys(item) : []
    ));
  }, [tableData]);

  // Compute array fields separately (will be used to filter columns)
  const arrayFieldsForColumnFilter = useMemo(() => {
    // Use rawTableData to detect array fields early
    const dataToCheck = rawTableData;
    if (!isEmpty(dataToCheck) && isArray(dataToCheck)) {
      const sampleData = take(dataToCheck, 10);
      const arrayFields = new Set();
      
      sampleData.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        for (const [fieldName, value] of Object.entries(row)) {
          // Skip special fields
          if (fieldName.startsWith('__')) continue;
          
          // Check if value is an array of objects or JSON array string
          if (isJsonArrayOfObjectsString(value)) {
            arrayFields.add(fieldName);
          }
        }
      });
      
      return arrayFields;
    }
    return new Set();
  }, [rawTableData, columns]);

  // Filter columns based on allowedColumns (if provided)
  // This ensures only developer-approved columns are available throughout the app
  // Also exclude array fields (they will be shown as nested tables instead)
  const filteredColumns = useMemo(() => {
    let result = columns;
    
    // Filter by allowedColumns if provided
    if (allowedColumns && Array.isArray(allowedColumns) && allowedColumns.length > 0) {
      const allowedSet = new Set(allowedColumns);
      result = result.filter(col => allowedSet.has(col));
    }
    
    // Exclude array fields (they will be shown as nested tables, not as columns)
    if (arrayFieldsForColumnFilter.size > 0) {
      result = result.filter(col => !arrayFieldsForColumnFilter.has(col));
    }
    
    return result;
  }, [columns, allowedColumns, arrayFieldsForColumnFilter]);

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

    filteredColumns.forEach((col) => {
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
  }, [tableData, filteredColumns, isNumericValue, columnTypesOverride]);

  // JSON array fields detection - identify fields containing JSON string arrays or actual arrays
  const jsonArrayFields = useMemo(() => {
    if (isEmpty(tableData)) {
      return new Set();
    }

    const sampleData = take(tableData, 100);
    const jsonFields = new Set();

    sampleData.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      
      // Check all fields in the row
      for (const [fieldName, value] of Object.entries(row)) {
        // Skip special fields
        if (fieldName.startsWith('__')) continue;
        
        // Check if value is a JSON array string or actual array of objects
        if (isJsonArrayOfObjectsString(value)) {
          jsonFields.add(fieldName);
        }
      }
    });

    return jsonFields;
  }, [tableData]);

  // Multiselect columns computation
  const multiselectColumns = useMemo(() => {
    if (!enableFilter) return [];
    // Get all string columns (non-numeric, non-boolean, non-date)
    const stringColumns = filteredColumns.filter(col => {
      const colType = columnTypes[col] || 'string';
      return colType === 'string';
    });
    // Remove textFilterColumns from string columns to get multiselect columns
    const textFilterSet = new Set(textFilterColumns);
    return stringColumns.filter(col => !textFilterSet.has(col));
  }, [filteredColumns, columnTypes, textFilterColumns, enableFilter]);

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
    filteredColumns.forEach((col) => {
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
  }, [tableData, searchSortSortedData, multiselectColumns, tableFilters, filteredColumns, columnTypes, hasPercentageColumns, percentageColumnNames, isPercentageColumn, getPercentageColumnValue, enableFilter]);

  // Filtered data computation (use worker results if available)
  const filteredData = useMemo(() => {
    // Use worker-computed data if available
    if (workerComputedData?.filteredData) {
      return workerComputedData.filteredData;
    }
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
      const regularColumnsPass = every(filteredColumns, (col) => {
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
  }, [searchSortSortedData, searchTerm, tableData, tableFilters, columns, columnTypes, multiselectColumns, hasPercentageColumns, percentageColumnNames, getPercentageColumnValue, enableFilter, workerComputedData]);

  // Report data computation state (using Web Worker)
  const reportWorkerRef = useRef(null);
  const reportWorkerInstanceRef = useRef(null); // Store actual worker instance for cleanup

  // Sync forced breakdown state if provided
  useEffect(() => {
    if (forceBreakdown === null || forceBreakdown === undefined) {
      return;
    }
    setEnableBreakdown(forceBreakdown);
  }, [forceBreakdown]);

  // Turn off enableBreakdown when enableReport is turned off (unless forced)
  useEffect(() => {
    if (!enableReport && (forceBreakdown === null || forceBreakdown === undefined)) {
      setEnableBreakdown(false);
    }
  }, [enableReport, forceBreakdown]);

  // Initialize filter/sort worker
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    const initializeFilterSortWorker = async () => {
      try {
        const worker = new Worker(new URL('../workers/filterSortWorker.js', import.meta.url), { type: 'module' });
        filterSortWorkerInstanceRef.current = worker;
        filterSortWorkerRef.current = Comlink.wrap(worker);
      } catch (error) {
        console.error('Failed to initialize filter/sort worker:', error);
        filterSortWorkerRef.current = null;
        filterSortWorkerInstanceRef.current = null;
      }
    };

    initializeFilterSortWorker();

    return () => {
      if (filterSortWorkerInstanceRef.current) {
        try {
          filterSortWorkerInstanceRef.current.terminate();
        } catch (error) {
          // Ignore cleanup errors
        }
        filterSortWorkerInstanceRef.current = null;
      }
      filterSortWorkerRef.current = null;
    };
  }, []);

  // Initialize report worker
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    const initializeWorker = async () => {
      try {
        const worker = new Worker(new URL('../workers/reportWorker.js', import.meta.url), { type: 'module' });
        reportWorkerInstanceRef.current = worker; // Store for cleanup
        reportWorkerRef.current = Comlink.wrap(worker);
      } catch (error) {
        console.error('Failed to initialize report worker:', error);
        reportWorkerRef.current = null;
        reportWorkerInstanceRef.current = null;
      }
    };

    initializeWorker();

    return () => {
      // Cleanup worker on unmount
      if (reportWorkerInstanceRef.current) {
        try {
          reportWorkerInstanceRef.current.terminate();
        } catch (error) {
          // Ignore cleanup errors
        }
        reportWorkerInstanceRef.current = null;
      }
      reportWorkerRef.current = null;
    };
  }, []);

  // Memoize sort field type to avoid expensive inferColumnType calls
  const sortFieldType = useMemo(() => {
    if (!sortConfig || !currentQueryDoc?.clientSave || !currentQueryDoc?.sortFields) {
      return null;
    }
    const { field } = sortConfig;
    const [topLevelKey, ...nestedParts] = field.split('.');
    const nestedPath = nestedParts.join('.');
    const sortFieldsObj = currentQueryDoc.sortFields;

    if (!sortFieldsObj[topLevelKey] || !sortFieldsObj[topLevelKey].includes(nestedPath)) {
      return null;
    }

    // Try columnTypesOverride first (fastest)
    if (columnTypesOverride[field]) {
      return { field, topLevelKey, nestedPath, fieldType: columnTypesOverride[field] };
    }

    // Try columnTypes with nestedPath or field (fast)
    const fieldTypeFromColumns = columnTypes[nestedPath] || columnTypes[field];
    if (fieldTypeFromColumns) {
      return { field, topLevelKey, nestedPath, fieldType: fieldTypeFromColumns };
    }

    // Only infer as last resort (slow, but cached per sortConfig change)
    if (!isEmpty(filteredData)) {
      const inferredType = inferColumnType(filteredData, field, topLevelKey, nestedPath);
      return { field, topLevelKey, nestedPath, fieldType: inferredType };
    }

    return { field, topLevelKey, nestedPath, fieldType: 'string' };
  }, [sortConfig, currentQueryDoc?.clientSave, currentQueryDoc?.sortFields, columnTypesOverride, columnTypes, filteredData]);

  // Use groupFields directly - breaking change: no longer supports outerGroupField/innerGroupField
  // effectiveGroupFields is always an array (never null/undefined) for consistent usage
  const effectiveGroupFields = useMemo(() => {
    return Array.isArray(groupFields) ? groupFields : [];
  }, [groupFields]);

  const alwaysAllowedKeys = useMemo(() => new Set(['id', 'period', 'periodLabel', 'isNestedRow']), []);

  const allowedFieldSet = useMemo(() => {
    if (!Array.isArray(allowedColumns) || allowedColumns.length === 0) {
      return null;
    }

    const set = new Set();

    allowedColumns.forEach((col) => {
      if (col) {
        set.add(col);
      }
    });

    filteredColumns.forEach((col) => {
      if (col) {
        set.add(col);
      }
    });

    effectiveGroupFields.forEach((field) => {
      if (field) {
        set.add(field);
      }
    });

    if (dateColumn) {
      set.add(dateColumn);
    }

    percentageColumnNames.forEach((col) => {
      if (col) {
        set.add(col);
      }
    });

    return set;
  }, [allowedColumns, filteredColumns, effectiveGroupFields, dateColumn, percentageColumnNames]);

  const sanitizeRowsByAllowedColumns = useCallback((rows) => {
    if (!allowedFieldSet || !Array.isArray(rows)) {
      return rows;
    }

    const sanitizeRow = (row) => {
      if (!row || typeof row !== 'object') {
        return row;
      }

      const sanitizedRow = {};
      Object.keys(row).forEach((key) => {
        if (
          allowedFieldSet.has(key) ||
          key.startsWith('__') ||
          alwaysAllowedKeys.has(key)
        ) {
          const value = row[key];
          if (key === '__groupRows__' && Array.isArray(value)) {
            sanitizedRow[key] = sanitizeRowsByAllowedColumns(value);
          } else {
            sanitizedRow[key] = value;
          }
        }
      });
      return sanitizedRow;
    };

    return rows.map((row) => sanitizeRow(row));
  }, [allowedFieldSet, alwaysAllowedKeys]);

  const reportInputData = useMemo(() => sanitizeRowsByAllowedColumns(filteredData), [filteredData, sanitizeRowsByAllowedColumns]);

  const drawerReportInputData = useMemo(() => sanitizeRowsByAllowedColumns(drawerData), [drawerData, sanitizeRowsByAllowedColumns]);

  // Main table report data computation using shared hook
  const { reportData: rawReportData, isComputingReport: internalIsComputingReport } = useReportData(
    enableBreakdown,
    reportInputData,
    effectiveGroupFields,
    dateColumn,
    breakdownType,
    columnTypes,
    sortConfig,
    sortFieldType,
    reportWorkerRef
  );

  // Drawer report data computation using shared hook
  // Get active tab's group fields for drawer report computation
  const activeDrawerTab = drawerTabs && drawerTabs.length > 0
    ? drawerTabs[Math.min(activeDrawerTabIndex, Math.max(0, drawerTabs.length - 1))]
    : null;
  // Convert drawer tab's outerGroup/innerGroup to groupFields array format
  const drawerGroupFields = useMemo(() => {
    if (!activeDrawerTab) return [];
    const fields = [];
    if (activeDrawerTab.outerGroup) fields.push(activeDrawerTab.outerGroup);
    if (activeDrawerTab.innerGroup) fields.push(activeDrawerTab.innerGroup);
    // Support groupFields if provided (new format)
    if (activeDrawerTab.groupFields && Array.isArray(activeDrawerTab.groupFields)) {
      return activeDrawerTab.groupFields;
    }
    return fields;
  }, [activeDrawerTab]);

  const { reportData: rawDrawerReportData, isComputingReport: isComputingDrawerReport } = useReportData(
    enableBreakdown,
    drawerReportInputData,
    drawerGroupFields,
    dateColumn,
    breakdownType,
    columnTypes,
    sortConfig,
    sortFieldType,
    reportWorkerRef
  );

  const baseReportData = reportDataOverride || rawReportData;

  const reportData = useMemo(() => {
    if (!baseReportData || !allowedFieldSet) {
      return baseReportData;
    }

    if (!Array.isArray(baseReportData.metrics)) {
      return baseReportData;
    }

    const filteredMetrics = baseReportData.metrics.filter(metric => allowedFieldSet.has(metric));

    if (filteredMetrics.length === baseReportData.metrics.length) {
      return baseReportData;
    }

    return {
      ...baseReportData,
      metrics: filteredMetrics
    };
  }, [baseReportData, allowedFieldSet]);

  const isComputingReport = reportDataOverride ? false : internalIsComputingReport;

  const drawerReportData = useMemo(() => {
    if (!rawDrawerReportData || !allowedFieldSet) {
      return rawDrawerReportData;
    }

    if (!Array.isArray(rawDrawerReportData.metrics)) {
      return rawDrawerReportData;
    }

    const filteredMetrics = rawDrawerReportData.metrics.filter(metric => allowedFieldSet.has(metric));

    if (filteredMetrics.length === rawDrawerReportData.metrics.length) {
      return rawDrawerReportData;
    }

    return {
      ...rawDrawerReportData,
      metrics: filteredMetrics
    };
  }, [rawDrawerReportData, allowedFieldSet]);

  const shouldShowDrawerReport = enableBreakdown && !!drawerReportData;

  // Recursive grouping function for infinite nesting
  const groupDataRecursive = useCallback((data, fields, currentLevel = 0, parentPath = []) => {
    // Base case: no more grouping levels
    if (currentLevel >= fields.length || isEmpty(data)) {
      return data;
    }

    const currentField = fields[currentLevel];
    const groups = {};

    // Group data by current field
    data.forEach((row) => {
      if (row.__isGroupRow__) return;
      const groupKey = getDataValue(row, currentField);
      const key = isNil(groupKey) ? '__null__' : String(groupKey);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(row);
    });

    // Apply sortConfig to rows within groups if sortConfig exists
    let sortComparator = null;
    if (sortFieldType) {
      sortComparator = getSortComparator(sortConfig, sortFieldType.fieldType, sortFieldType.topLevelKey, sortFieldType.nestedPath);
    }

    // Sort rows within each group before processing
    if (sortComparator) {
      Object.keys(groups).forEach(key => {
        groups[key].sort(sortComparator);
      });
    }

    // Process each group
    return Object.entries(groups).map(([groupKey, rows]) => {
      const currentPath = [...parentPath, groupKey === '__null__' ? null : groupKey];

      // Recursively group next level
      const nextLevelData = groupDataRecursive(rows, fields, currentLevel + 1, currentPath);

      // Determine if we need to aggregate (if next level is still grouped)
      const hasNextLevel = currentLevel + 1 < fields.length;
      const innerData = hasNextLevel ? nextLevelData : rows;

      // Create summary row
      const summaryRow = {};
      const firstItem = Array.isArray(innerData) && innerData.length > 0 ? innerData[0] : null;
      if (!firstItem) return null;

      filteredColumns.forEach((col) => {
        const colType = columnTypes[col] || {};
        // Set current field value
        if (col === currentField) {
          summaryRow[col] = groupKey === '__null__' ? null : groupKey;
        }
        // Clear fields from deeper levels (they'll be in nested tables)
        else if (currentLevel < fields.length - 1 && fields.slice(currentLevel + 1).includes(col)) {
          summaryRow[col] = null;
        }
        // Aggregate numeric columns
        else if (colType === 'number') {
          const sum = sumBy(innerData, (row) => {
            const val = getDataValue(row, col);
            if (isNil(val)) return 0;
            const numVal = isNumber(val) ? val : toNumber(val);
            return _isNaN(numVal) ? 0 : numVal;
          });
          summaryRow[col] = sum;
        }
        // For other columns, use first non-null value
        else {
          const firstNonNull = Array.isArray(innerData)
            ? innerData.find(row => !isNil(getDataValue(row, col)))
            : null;
          summaryRow[col] = firstNonNull ? getDataValue(firstNonNull, col) : getDataValue(firstItem, col);
        }
      });

      // Handle percentage columns
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

      // Add metadata
      summaryRow.__groupKey__ = groupKey === '__null__' ? null : groupKey;
      summaryRow.__groupRows__ = innerData;
      summaryRow.__groupLevel__ = currentLevel;
      summaryRow.__groupField__ = currentField;
      summaryRow.__isGroupRow__ = true;
      summaryRow.__groupPath__ = currentPath;

      // Preserve __nestedTables__ from first item if it exists
      if (firstItem && firstItem.__nestedTables__) {
        summaryRow.__nestedTables__ = firstItem.__nestedTables__;
      }

      return summaryRow;
    }).filter(Boolean);
  }, [filteredColumns, columnTypes, hasPercentageColumns, percentageColumns, sortFieldType, sortConfig, getSortComparator]);

  // Extract JSON nested tables from data (recursive)
  const extractJsonNestedTablesFromData = useCallback((data, maxDepth = 10) => {
    if (!isArray(data) || isEmpty(data)) {
      return data;
    }

    // Use recursive extraction function
    return extractJsonNestedTablesRecursive(data, 0, maxDepth);
  }, []);

  // Grouped data computation (use worker results if available)
  const groupedData = useMemo(() => {
    // If report is enabled, use report data instead (prioritize over worker data)
    if (enableBreakdown) {
      // If report data is still computing, return empty array to avoid rendering issues
      if (!reportData || !reportData.tableData) {
        return [];
      }
      // Apply sorting as fallback (in case report generation didn't apply it)
      let sortedReportData = reportData.tableData;
      if (sortFieldType && sortConfig) {
        const sortComparator = getSortComparator(sortConfig, sortFieldType.fieldType, sortFieldType.topLevelKey, sortFieldType.nestedPath);
        if (sortComparator && sortedReportData.length > 0) {
          sortedReportData = [...sortedReportData].sort(sortComparator);
        }
      }
      return sortedReportData;
    }

    // Use worker-computed data if available (fallback when report mode is not enabled)
    if (workerComputedData?.groupedData) {
      return workerComputedData.groupedData;
    }

    // Extract JSON nested tables before grouping
    let dataWithJsonTables = filteredData;
    if (jsonArrayFields.size > 0 && !isEmpty(filteredData)) {
      dataWithJsonTables = extractJsonNestedTablesFromData(filteredData);
    }

    // Use recursive grouping if groupFields is provided
    if (effectiveGroupFields.length > 0 && !isEmpty(dataWithJsonTables)) {
      const result = groupDataRecursive(dataWithJsonTables, effectiveGroupFields);
      // Sort groups by sortConfig if it exists
      if (sortFieldType) {
        const sortComparator = getSortComparator(sortConfig, sortFieldType.fieldType, sortFieldType.topLevelKey, sortFieldType.nestedPath);
        if (sortComparator && result.length > 0) {
          return [...result].sort(sortComparator);
        }
      }
      return result;
    }

    // Removed backward compatibility grouping logic - now only uses groupDataRecursive with effectiveGroupFields
    // If no group fields, return filtered data as-is (with JSON tables extracted)
    if (isEmpty(dataWithJsonTables) || !isArray(dataWithJsonTables)) {
      return dataWithJsonTables || [];
    }
    return dataWithJsonTables.filter(row => !row?.__isGroupRow__).map(row => {
      if (row instanceof Map) {
        const plainObj = {};
        row.forEach((value, key) => {
          plainObj[key] = value;
        });
        return plainObj;
      }
      return row;
    });
  }, [enableBreakdown, reportData, filteredData, effectiveGroupFields, groupDataRecursive, filteredColumns, columnTypes, hasPercentageColumns, percentageColumns, sortFieldType, sortConfig, getSortComparator, jsonArrayFields, extractJsonNestedTablesFromData]);

  // Extract JSON nested tables from filteredData if not already done (for non-grouped mode)
  const filteredDataWithNestedTables = useMemo(() => {
    if (effectiveGroupFields.length > 0) {
      // Grouped data already has nested tables extracted
      return filteredData;
    }
    // For non-grouped mode, extract nested tables from filteredData
    if (jsonArrayFields.size > 0 && !isEmpty(filteredData)) {
      return extractJsonNestedTablesFromData(filteredData);
    }
    return filteredData;
  }, [filteredData, effectiveGroupFields.length, jsonArrayFields.size, extractJsonNestedTablesFromData]);

  // Sorted data computation
  const dataForSorting = useMemo(() => {
    const data = effectiveGroupFields.length > 0 ? groupedData : filteredDataWithNestedTables;
    return isArray(data) ? data : [];
  }, [effectiveGroupFields, groupedData, filteredDataWithNestedTables]);

  const sortedData = useMemo(() => {
    // If report mode is enabled, prioritize report data over worker data
    // groupedData already contains reportData.tableData when enableBreakdown is true
    if (enableBreakdown) {
      // Use dataForSorting which will be groupedData (with report data) when effectiveGroupFields exists
      if (!isArray(dataForSorting) || isEmpty(dataForSorting)) {
        return [];
      }
      // Apply sorting if needed
      let result = [...dataForSorting];
      if (sortFieldType && sortConfig) {
        const sortComparator = getSortComparator(sortConfig, sortFieldType.fieldType, sortFieldType.topLevelKey, sortFieldType.nestedPath);
        if (sortComparator && result.length > 0) {
          result.sort(sortComparator);
        }
      }
      return result;
    }
    // Use worker-computed data if available (when not in report mode)
    // When grouping is enabled, use groupedData instead of sortedData
    if (effectiveGroupFields.length > 0 && workerComputedData?.groupedData) {
      return workerComputedData.groupedData;
    }
    if (workerComputedData?.sortedData) {
      return workerComputedData.sortedData;
    }

    if (!isArray(dataForSorting)) {
      return [];
    }
    if (isEmpty(dataForSorting)) {
      return dataForSorting;
    }

    let result = [...dataForSorting];

    // Apply tableSortMeta if it exists (overrides sortConfig)
    if (!isEmpty(tableSortMeta) && enableSort) {
      const fields = tableSortMeta.map(s => {
        const field = s.field;
        if (isPercentageColumn(field)) {
          return (rowData) => getPercentageColumnValue(rowData, field);
        }
        return field;
      });
      const orders = tableSortMeta.map(s => s.order === 1 ? 'asc' : 'desc');
      result = orderBy(result, fields, orders);
    } else if (sortFieldType) {
      // Apply sortConfig only if tableSortMeta doesn't exist (for both grouped and ungrouped data)
      const sortComparator = getSortComparator(sortConfig, sortFieldType.fieldType, sortFieldType.topLevelKey, sortFieldType.nestedPath);
      if (sortComparator) {
        result.sort(sortComparator);
      }
    }

    return result;
  }, [enableBreakdown, groupedData, dataForSorting, tableSortMeta, isPercentageColumn, getPercentageColumnValue, enableSort, sortFieldType, sortConfig, getSortComparator, workerComputedData]);

  // Compute filter/sort/group using worker when applying
  useEffect(() => {
    if (!isApplyingFilterSort) {
      setWorkerComputedData(null);
      return;
    }

    // Only use worker if it's available and we have data
    if (!filterSortWorkerRef.current || !tableData || isEmpty(tableData)) {
      return;
    }

    const computationId = ++filterSortComputationIdRef.current;

    const computeWithWorker = async () => {
      try {
        if (!filterSortWorkerRef.current) {
          // Fallback to synchronous computation
          return;
        }

        // Convert preFilterValues to tableFilters format
        const filtersForWorker = {};
        Object.keys(preFilterValues || {}).forEach(col => {
          filtersForWorker[col] = { value: preFilterValues[col] };
        });

        const result = await filterSortWorkerRef.current.computeFilterSortGrouped(tableData, {
          tableFilters: filtersForWorker,
          columns,
          columnTypes,
          multiselectColumns,
          hasPercentageColumns,
          percentageColumns,
          percentageColumnNames,
          enableFilter,
          searchTerm,
          searchFields: currentQueryDoc?.searchFields || {},
          sortConfig,
          sortFieldType,
          tableSortMeta,
          enableSort,
          effectiveGroupFields,
          // Note: isPercentageColumnFn removed - worker uses percentageColumns array instead
        });

        // Only update if this is still the latest computation
        if (computationId === filterSortComputationIdRef.current) {
          setWorkerComputedData(result);
          setIsApplyingFilterSort(false);
        }
      } catch (error) {
        console.error('Filter/sort worker computation error:', error);
        if (computationId === filterSortComputationIdRef.current) {
          setIsApplyingFilterSort(false);
        }
      }
    };

    computeWithWorker();
  }, [isApplyingFilterSort, sortConfig, preFilterValues, tableData, columns, columnTypes, multiselectColumns, hasPercentageColumns, percentageColumns, percentageColumnNames, enableFilter, searchTerm, currentQueryDoc, sortFieldType, tableSortMeta, enableSort, effectiveGroupFields, isPercentageColumn]);

  // Track when filter/sort computation is complete - callback-based approach with ref guard
  const hasClearedLoadingRef = useRef(false);

  // Watch sortedData changes and clear loading when ready (fallback for non-worker path)
  useEffect(() => {
    if (isApplyingFilterSort && sortedData && !hasClearedLoadingRef.current && !workerComputedData) {
      // sortedData is ready - clear loading immediately
      hasClearedLoadingRef.current = true;

      // Use requestAnimationFrame for immediate UI update
      requestAnimationFrame(() => {
        setIsApplyingFilterSort(false);
      });
    }

    // Reset guard when not applying
    if (!isApplyingFilterSort) {
      hasClearedLoadingRef.current = false;
    }
  }, [sortedData, isApplyingFilterSort, workerComputedData]);

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

  /**
   * Apply filters to data array
   * @param {Array} data - Data array to filter
   * @param {Object} filters - Filters in format { columnKey: [filterValues] }
   * @param {Object} options - Options for filter application
   * @returns {Array} Filtered data array
   */
  const applyFiltersToData = useCallback((data, filters, options = {}) => {
    if (!isArray(data) || isEmpty(data)) {
      return [];
    }
    if (!filters || isEmpty(filters)) {
      return data;
    }

    // Convert simple filter format { columnKey: [values] } to internal format
    const internalFilters = {};
    Object.keys(filters).forEach((columnKey) => {
      const filterValues = filters[columnKey];
      if (isNil(filterValues) || filterValues === '') {
        return; // Skip empty filters
      }
      if (isArray(filterValues) && isEmpty(filterValues)) {
        return; // Skip empty arrays
      }

      const colType = columnTypes[columnKey] || 'string';
      const isMultiselectColumn = includes(multiselectColumns, columnKey);

      // Determine matchMode based on filter values and column type
      let matchMode = 'contains';
      if (isArray(filterValues)) {
        matchMode = 'in'; // Multiselect
      } else if (colType === 'boolean') {
        matchMode = 'equals';
      } else if (colType === 'date') {
        matchMode = isArray(filterValues) ? 'dateRange' : 'equals';
      } else if (colType === 'number') {
        matchMode = 'contains'; // Numeric filter uses contains for parsing
      }

      internalFilters[columnKey] = {
        value: filterValues,
        matchMode
      };
    });

    if (isEmpty(internalFilters)) {
      return data;
    }

    // Apply filters using the same logic as filteredData computation
    return filter(data, (row) => {
      if (!row || typeof row !== 'object') return false;

      // Check regular columns
      const regularColumnsPass = every(columns, (col) => {
        const filterObj = internalFilters[col];
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

        // String filter (contains)
        const strCell = toLower(String(cellValue ?? ''));
        const strFilter = toLower(String(filterValue));
        return includes(strCell, strFilter);
      });

      if (!regularColumnsPass) return false;

      // Check percentage columns
      if (hasPercentageColumns) {
        return every(percentageColumnNames, (col) => {
          const filterObj = internalFilters[col];
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
  }, [columns, columnTypes, multiselectColumns, hasPercentageColumns, percentageColumnNames, getPercentageColumnValue, applyDateFilter, applyNumericFilter, parseNumericFilter]);

  // Variant 1: getSums(data, filters) - calculates sums on provided data with optional filters
  // Variant 2: getSums(filters) - calculates sums on current filteredData with filters applied
  // Variant 3: getSums() - calculates sums on current filteredData without additional filters
  const getSums = useCallback((dataOrFilters, filters) => {
    let dataToSum;
    let filtersToApply;

    // Detect variant: if no arguments, use current filteredData (Variant 3)
    if (dataOrFilters === undefined && filters === undefined) {
      // Variant 3: getSums()
      dataToSum = filteredData;
      filtersToApply = null;
    } else if (isArray(dataOrFilters)) {
      // Variant 1: getSums(data, filters)
      dataToSum = dataOrFilters;
      filtersToApply = filters || null;
    } else {
      // Variant 2: getSums(filters)
      dataToSum = filteredData; // Use current filteredData
      filtersToApply = dataOrFilters || null;
    }

    // Apply filters if provided
    let dataForSums = dataToSum || [];
    if (filtersToApply && !isEmpty(filtersToApply)) {
      dataForSums = applyFiltersToData(dataToSum, filtersToApply);
    }

    // Calculate sums
    const sums = {};
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
  }, [filteredData, applyFiltersToData, columns, columnTypes, isNumericValue, getDataValue]);

  // Summation computation
  const calculateSums = useMemo(() => {
    return getSums();
  }, [getSums]);

  // Unified drawer function with two variants:
  // Variant 1: openDrawer(data, filters, title, tableOptions) - applies filters on provided data
  // Variant 2: openDrawer(filters, title, tableOptions) - applies filters on current filteredData
  // Optional title parameter can be provided to set custom drawer header title
  // Optional tableOptions parameter can be provided to override default table configuration
  const openDrawer = useCallback((dataOrFilters, filters, title, tableOptions) => {
    let dataToFilter;
    let filtersToApply;
    let customTitle = title;

    // Detect variant: if first arg is an array, it's variant 1 (with data)
    if (isArray(dataOrFilters)) {
      // Variant 1: openDrawer(data, filters, title, tableOptions)
      dataToFilter = dataOrFilters;
      filtersToApply = filters || null;
    } else {
      // Variant 2: openDrawer(filters, title, tableOptions)
      dataToFilter = filteredData; // Use current filteredData
      filtersToApply = dataOrFilters || null;
    }

    // Apply filters if provided
    let filteredResult = dataToFilter || [];
    if (filtersToApply && !isEmpty(filtersToApply)) {
      filteredResult = applyFiltersToData(dataToFilter, filtersToApply);
    }

    // Extract clickedDrawerValues from filters if group fields are present
    // Support all group fields, not just first two
    const clickedValues = {};
    effectiveGroupFields.forEach((field) => {
      if (filtersToApply && field && filtersToApply[field]) {
        const filterValue = filtersToApply[field];
        clickedValues[field] = isArray(filterValue) ? filterValue[0] : filterValue;
      }
    });

    // For backward compatibility, extract first two as outerValue/innerValue
    const outerValue = clickedValues[effectiveGroupFields[0]] || null;
    const innerValue = clickedValues[effectiveGroupFields[1]] || null;

    // Store filtered data
    setDrawerData(filteredResult);
    setClickedDrawerValues({ outerValue, innerValue, ...clickedValues });

    // Compute title: use custom title if provided, otherwise compute from clickedDrawerValues
    const titleParts = effectiveGroupFields.map(field => clickedValues[field]).filter(Boolean);
    const computedTitle = customTitle || (titleParts.length > 0 ? titleParts.join(' : ') : 'Drawer');
    setDrawerHeaderTitle(computedTitle);

    // Store table options if provided
    setDrawerTableOptions(tableOptions || null);

    setActiveDrawerTabIndex(0);
    setDrawerVisible(true);
  }, [filteredData, applyFiltersToData, effectiveGroupFields]);

  // Drawer action handlers (legacy - calls unified openDrawer internally)
  const openDrawerWithData = useCallback((data, outerValue = null, innerValue = null, title = null) => {
    // Compute title: use custom title if provided, otherwise compute from values
    const computedTitle = title || (innerValue
      ? `${outerValue} : ${innerValue}`
      : outerValue || 'Drawer');
    // Use unified API: openDrawer(data, null, computedTitle) - no filters
    openDrawer(data, null, computedTitle);
    // Set clickedDrawerValues for display purposes
    setClickedDrawerValues({ outerValue, innerValue });
  }, [openDrawer]);

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false);
    setDrawerHeaderTitle(null);
    setDrawerTableOptions(null);
    setDrawerJsonTables(null);
    // Clear change tracking data when drawer closes
    originalNestedTableDataRef.current.clear();
    nestedTableDataRefsRef.current.clear();
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

  // Drawer filtering functions for group cells (legacy - calls unified openDrawer internally)
  const openDrawerForOuterGroup = useCallback((value) => {
    if (effectiveGroupFields.length === 0) return;
    const firstGroupField = effectiveGroupFields[0];
    // Use unified API: openDrawer({ [firstGroupField]: [value] })
    const filters = { [firstGroupField]: [value] };
    openDrawer(filters);
  }, [effectiveGroupFields, openDrawer]);

  const openDrawerForInnerGroup = useCallback((outerValue, innerValue) => {
    if (effectiveGroupFields.length < 2) return;
    const firstGroupField = effectiveGroupFields[0];
    const secondGroupField = effectiveGroupFields[1];
    // Use unified API: openDrawer({ [firstGroupField]: [outerValue], [secondGroupField]: [innerValue] })
    const filters = {
      [firstGroupField]: [outerValue],
      [secondGroupField]: [innerValue]
    };
    openDrawer(filters);
  }, [effectiveGroupFields, openDrawer]);

  // Callback to update current nested table data for a specific tab
  const updateCurrentNestedTableData = useCallback((tabId, currentData) => {
    if (tabId && isArray(currentData)) {
      currentNestedTableDataRef.current.set(tabId, cloneDeep(currentData));
    }
  }, []);

  // Helper function to detect changes in nested table data
  // Compares original data with current data and returns array of changed rows
  const detectNestedTableChanges = useCallback((originalData, currentData) => {
    if (!isArray(originalData) || !isArray(currentData)) {
      return [];
    }

    const changes = [];
    const originalMap = new Map();
    
    // Create a map of original rows by a unique identifier
    // Use JSON.stringify of the row as key (or first few fields if available)
    originalData.forEach((row, index) => {
      // Try to find a unique identifier field (id, key, etc.)
      const rowKey = row?.id || row?.key || row?.__id__ || JSON.stringify(row);
      originalMap.set(rowKey, { row: cloneDeep(row), index });
    });

    // Check for modified and new rows
    currentData.forEach((currentRow, currentIndex) => {
      const rowKey = currentRow?.id || currentRow?.key || currentRow?.__id__ || JSON.stringify(currentRow);
      const originalEntry = originalMap.get(rowKey);
      
      if (originalEntry) {
        // Row exists in original - check for changes
        const originalRow = originalEntry.row;
        const changedFields = {};
        let hasChanges = false;

        // Compare all fields
        const allKeys = new Set([...getDataKeys(originalRow), ...getDataKeys(currentRow)]);
        allKeys.forEach(key => {
          const originalValue = getDataValue(originalRow, key);
          const currentValue = getDataValue(currentRow, key);
          
          // Deep comparison (handle objects and arrays)
          if (JSON.stringify(originalValue) !== JSON.stringify(currentValue)) {
            changedFields[key] = {
              oldValue: originalValue,
              newValue: currentValue,
            };
            hasChanges = true;
          }
        });

        if (hasChanges) {
          changes.push({
            type: 'modified',
            rowKey,
            originalRow: cloneDeep(originalRow),
            currentRow: cloneDeep(currentRow),
            changedFields,
            index: currentIndex,
          });
        }
        
        // Remove from map to track which original rows are still present
        originalMap.delete(rowKey);
      } else {
        // New row (not in original)
        changes.push({
          type: 'added',
          rowKey,
          originalRow: null,
          currentRow: cloneDeep(currentRow),
          changedFields: {},
          index: currentIndex,
        });
      }
    });

    // Remaining entries in originalMap are deleted rows
    originalMap.forEach(({ row, index }) => {
      const rowKey = row?.id || row?.key || row?.__id__ || JSON.stringify(row);
      changes.push({
        type: 'deleted',
        rowKey,
        originalRow: cloneDeep(row),
        currentRow: null,
        changedFields: {},
        index: index,
      });
    });

    return changes;
  }, []);

  // Get changed rows for a specific drawer tab
  const getChangedRowsForTab = useCallback((tabId) => {
    const trackingData = originalNestedTableDataRef.current.get(tabId);
    if (!trackingData) {
      return [];
    }

    const currentData = currentNestedTableDataRef.current.get(tabId) || [];
    const changes = detectNestedTableChanges(trackingData.originalData, currentData);
    
    return {
      tabId,
      parentRowData: trackingData.parentRowData,
      nestedTableFieldName: trackingData.nestedTableFieldName,
      parentColumnName: trackingData.parentColumnName,
      changes,
    };
  }, [detectNestedTableChanges]);

  // Get all changed rows across all nested table tabs
  const getAllChangedNestedTableRows = useCallback(() => {
    const allChanges = [];
    
    originalNestedTableDataRef.current.forEach((trackingData, tabId) => {
      const currentData = currentNestedTableDataRef.current.get(tabId) || [];
      const changes = detectNestedTableChanges(trackingData.originalData, currentData);
      
      if (changes.length > 0) {
        allChanges.push({
          tabId,
          parentRowData: trackingData.parentRowData,
          nestedTableFieldName: trackingData.nestedTableFieldName,
          parentColumnName: trackingData.parentColumnName,
          changes,
        });
      }
    });
    
    return allChanges;
  }, [detectNestedTableChanges]);

  // Handle drawer save - saves changes for current active tab
  const handleDrawerSave = useCallback(() => {
    if (!drawerTabs || drawerTabs.length === 0) {
      return;
    }

    const activeTab = drawerTabs[activeDrawerTabIndex];
    if (!activeTab || !activeTab.isJsonTable) {
      return;
    }

    const tabId = activeTab.id;
    const changedRowsData = getChangedRowsForTab(tabId);
    
    if (changedRowsData.changes.length === 0) {
      // Show notification - no changes
      if (onDataChange) {
        onDataChange({
          severity: 'info',
          summary: 'No Changes',
          detail: 'No changes detected in this nested table.',
          life: 3000,
        });
      }
      return;
    }

    // Save changes for current tab (for now, just show notification)
    if (onDataChange) {
      onDataChange({
        severity: 'success',
        summary: 'Changes Saved',
        detail: `Saved ${changedRowsData.changes.length} change(s) in nested table.`,
        life: 3000,
      });
    }

    // TODO: Implement actual save logic here (e.g., API call)
    console.log('Drawer Save - Tab:', tabId, 'Changes:', changedRowsData);
  }, [drawerTabs, activeDrawerTabIndex, getChangedRowsForTab]);

  // Handle main save - prints all changed nested table rows to console
  const handleMainSave = useCallback(() => {
    const allChanges = getAllChangedNestedTableRows();
    
    if (allChanges.length === 0) {
      console.log('No changed nested table rows found.');
      return;
    }

    console.log('=== Changed Nested Tables Rows ===');
    allChanges.forEach((changeData) => {
      console.group(`Tab: ${changeData.tabId} | Field: ${changeData.nestedTableFieldName}`);
      console.log('Parent Row Data:', changeData.parentRowData);
      console.log('Parent Column Name:', changeData.parentColumnName);
      console.log('Nested Table Field Name:', changeData.nestedTableFieldName);
      console.log('Changes:', changeData.changes);
      changeData.changes.forEach((change, index) => {
        console.log(`Change ${index + 1} (${change.type}):`, {
          rowKey: change.rowKey,
          originalRow: change.originalRow,
          currentRow: change.currentRow,
          changedFields: change.changedFields,
        });
      });
      console.groupEnd();
    });
    console.log('=== End Changed Nested Tables Rows ===');
  }, [getAllChangedNestedTableRows]);

  // Open drawer with nested JSON tables
  // Creates tabs dynamically for each nested table
  const openDrawerWithJsonTables = useCallback((nestedTables, rowData, tableOptions = null) => {
    if (!nestedTables || !isArray(nestedTables) || nestedTables.length === 0) {
      return;
    }

    // Store nested tables for drawer rendering
    setDrawerJsonTables(nestedTables);

    // Create drawer tabs dynamically - one per nested table
    // Get the parent column name from the first nested table's fieldName (which is the column name in main table)
    // All nested tables in __nestedTables__ come from the same parent column
    const parentColumnName = nestedTables[0]?.fieldName || null;
    const jsonTableTabs = nestedTables.map((nestedTable, index) => {
      const tabId = `json-table-${Date.now()}-${index}`;
      
      // Store original data for change tracking (deep clone to prevent reference issues)
      const originalData = nestedTable.data && isArray(nestedTable.data) 
        ? cloneDeep(nestedTable.data) 
        : [];
      
      originalNestedTableDataRef.current.set(tabId, {
        originalData,
        parentRowData: cloneDeep(rowData),
        nestedTableFieldName: nestedTable.fieldName,
        parentColumnName: parentColumnName,
      });
      
      // Initialize current data with original data
      currentNestedTableDataRef.current.set(tabId, cloneDeep(originalData));
      
      return {
        id: tabId,
        name: nestedTable.title || nestedTable.fieldName || `Table ${index + 1}`,
        data: nestedTable.data,
        fieldName: nestedTable.fieldName, // This is the nested table's fieldName (same as parentColumnName for first-level nested tables)
        parentColumnName: parentColumnName, // Store parent column name for nested editable columns lookup
        nestedTableFieldName: nestedTable.fieldName, // The nested table's own fieldName for lookup in editableColumns.nested
        isJsonTable: true, // Flag to identify JSON table tabs
      };
    });

    // Use the first nested table's data to open the drawer
    const firstTableData = nestedTables[0]?.data || [];
    
    // Set drawer header title from row data if available
    // Get first column value from rowData keys or use columns array
    let firstColumnValue = null;
    if (rowData && typeof rowData === 'object') {
      // Try to get first column from columns array if available
      if (columns && columns.length > 0) {
        firstColumnValue = getDataValue(rowData, columns[0]);
      } else {
        // Fallback: get first key from rowData (excluding special keys)
        const rowKeys = getDataKeys(rowData).filter(key => !key.startsWith('__'));
        if (rowKeys.length > 0) {
          firstColumnValue = getDataValue(rowData, rowKeys[0]);
        }
      }
    }
    const drawerTitle = firstColumnValue != null ? String(firstColumnValue) : 'Nested Tables';

    // Temporarily set drawer tabs to JSON table tabs
    // We'll need to handle this specially in the drawer rendering
    if (onDrawerTabsChange) {
      onDrawerTabsChange(jsonTableTabs);
    }

    // Open drawer with first table's data
    openDrawer(firstTableData, null, drawerTitle, tableOptions);
  }, [columns, onDrawerTabsChange, openDrawer]);

  // Export helper functions
  const formatHeaderName = useCallback((key) => {
    if (!key || key === null || key === undefined) {
      return '';
    }
    // Check if it's a percentage column
    const percentageConfig = percentageColumns.find(pc => pc.columnName === key);
    if (percentageConfig) {
      return percentageConfig.columnName;
    }
    return startCase(String(key).split('__').join(' ').split('_').join(' '));
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
    // Check if we're in report mode
    if (enableBreakdown && reportData) {
      // Use report export with merged headers
      // Pass effectiveGroupFields - function will extract first two for backward compatibility if needed
      const wb = exportReportToXLSX(
        reportData,
        columnGroupBy,
        effectiveGroupFields,
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

    if (effectiveGroupFields.length > 0 && !isEmpty(groupedData)) {
      // Grouped mode: extract inner rows from each group
      const flattenedInnerRows = [];

      groupedData.forEach((groupRow) => {
        if (groupRow.__isGroupRow__ && groupRow.__groupRows__) {
          // Get group key from first group field or __groupKey__
          const firstGroupField = effectiveGroupFields[0];
          const groupKey = groupRow.__groupKey__ || (firstGroupField ? getDataValue(groupRow, firstGroupField) : null);

          groupRow.__groupRows__.forEach((innerRow) => {
            // Ensure all group field values are set (should already be in aggregated rows, but ensure it)
            const rowWithGroup = { ...innerRow };
            effectiveGroupFields.forEach((field, index) => {
              if (!rowWithGroup.hasOwnProperty(field)) {
                if (index === 0) {
                  rowWithGroup[field] = groupKey === '__null__' ? null : groupKey;
                } else {
                  // For nested levels, get from parent group row
                  const parentValue = getDataValue(groupRow, field);
                  rowWithGroup[field] = parentValue;
                }
              }
            });
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
        // Always include all group fields
        if (effectiveGroupFields.includes(col)) return true;

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
  }, [enableBreakdown, reportData, columnGroupBy, sortedData, groupedData, effectiveGroupFields, hasPercentageColumns, percentageColumns, isPercentageColumn, getPercentageColumnValue, formatHeaderName, isTruthyBoolean, formatDateValue, getColumnTypeFlags]);

  // Create context value
  const contextValue = useMemo(() => {
    try {
      const result = {
        rawData: sortedData, // Use sortedData as rawData for context (after all filters)
        columns: filteredColumns, // Expose filtered columns (respecting allowedColumns)
        columnTypes,
        filteredData,
        groupedData,
        sortedData,
        paginatedData,
        sums: calculateSums,
        getSums,
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
        effectiveGroupFields, // Array of group fields for multi-level nesting
        redFields,
        greenFields,
        enableDivideBy1Lakh,
        enableReport,
        enableBreakdown,
        reportData,
        isComputingReport,
        isApplyingFilterSort,
        chartColumns,
        chartHeight,
        // Unified loading state
        isLoading: (() => {
          return isComputingReport || isApplyingFilterSort;
        })(),
        loadingText: (() => {
          return isComputingReport
            ? 'Computing report...'
            : isApplyingFilterSort
              ? 'Applying Filter and Sort...'
              : '';
        })(),
        columnGroupBy,
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
        openDrawer,
        openDrawerWithData,
        openDrawerForOuterGroup,
        openDrawerForInnerGroup,
        openDrawerWithJsonTables,
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
        // Enable write flag - use forceEnableWrite if provided (for nested drawer tables), otherwise use currentQueryDoc
        enableWrite: forceEnableWrite !== undefined ? forceEnableWrite : (currentQueryDoc?.enableWrite || false),
        // Nested table context for editable columns lookup
        parentColumnName,
        nestedTableFieldName,
        // Change tracking for nested tables
        updateCurrentNestedTableData,
        getChangedRowsForTab,
        getAllChangedNestedTableRows,
        // Use parent's handleDrawerSave if available (for nested drawer tables), otherwise use local one
        handleDrawerSave: parentHandleDrawerSave || handleDrawerSave,
        handleMainSave,
      };
      return result;
    } catch (error) {
      console.error('DataProviderNew: Error creating contextValue', error);
      return {};
    }
  }, [
    sortedData, columns, columnTypes, filteredData, groupedData, paginatedData,
    calculateSums, getSums, optionColumnValues, multiselectColumns, hasPercentageColumns, percentageColumns, percentageColumnNames,
    isPercentageColumn, getPercentageColumnValue, getPercentageColumnSortFunction, tableFilters, tableSortMeta, tablePagination,
    tableExpandedRows, tableVisibleColumns, enableSort, enableFilter, enableSummation, enableGrouping,
    textFilterColumns, effectiveGroupFields, redFields, greenFields, enableDivideBy1Lakh,
    updateFilter, clearFilter, clearAllFilters, updateSort, updatePagination, updateExpandedRows,
    updateVisibleColumns, drawerVisible, drawerData, drawerTabs, activeDrawerTabIndex, clickedDrawerValues,
    openDrawer, openDrawerWithData, openDrawerForOuterGroup, openDrawerForInnerGroup, openDrawerWithJsonTables, closeDrawer, addDrawerTab, removeDrawerTab, updateDrawerTab,
    formatHeaderName, isTruthyBoolean, exportToXLSX, isNumericValue, currentQueryDoc, searchTerm, sortConfig, enableReport, enableBreakdown, reportData, isComputingReport, isApplyingFilterSort, columnGroupBy, filteredColumns, allowedColumns, parentColumnName, nestedTableFieldName,
    updateCurrentNestedTableData, getChangedRowsForTab, getAllChangedNestedTableRows, handleDrawerSave, handleMainSave, forceEnableWrite, parentHandleDrawerSave
  ]);

  // Memoize field display names to avoid recalculating on every render
  const fieldDisplayNames = useMemo(() => {
    const names = {};
    const searchFields = currentQueryDoc?.searchFields || {};
    for (const topLevelKey of Object.keys(searchFields)) {
      const nestedPaths = searchFields[topLevelKey];
      if (Array.isArray(nestedPaths)) {
        for (const nestedPath of nestedPaths) {
          const key = nestedPath || topLevelKey;
          names[key] = startCase(nestedPath || topLevelKey);
        }
      }
    }
    return names;
  }, [currentQueryDoc?.searchFields]);

  // Determine picker mode based on enableBreakdown, breakdownType, and columnGroupBy
  const getPickerMode = () => {
    if (!enableBreakdown) return 'month'; // Keep current behavior when breakdown is off
    if (columnGroupBy === 'period-over-period') return 'year'; // Override for period-over-period
    // Map breakdownType to mode
    switch (breakdownType) {
      case 'month': return 'month';
      case 'week': return 'week';
      case 'day': return 'date';
      case 'quarter': return 'quarter';
      case 'annual': return 'year';
      default: return 'month';
    }
  };

  const pickerMode = getPickerMode();

  // Get placeholder based on mode
  const getPickerPlaceholder = () => {
    switch (pickerMode) {
      case 'month': return ['Start month', 'End month'];
      case 'week': return ['Start week', 'End week'];
      case 'date': return ['Start date', 'End date'];
      case 'quarter': return ['Start quarter', 'End quarter'];
      case 'year': return ['Start year', 'End year'];
      default: return ['Start month', 'End month'];
    }
  };

  // Conditional rendering helpers
  const isValidMonthRange = monthRange && Array.isArray(monthRange) && monthRange.length === 2;
  const headerEnabled = showProviderHeader !== false;
  const showMonthRangePicker = headerEnabled && dataSource && hasMonthSupport;
  const showBreakdownToggle = headerEnabled && enableReport;
  const showBreakdownControls = headerEnabled && enableBreakdown && dateColumn;
  const showSyncButton = headerEnabled && dataSource; // Show sync button for all query data sources (not offline)
  const isSyncDisabled = executingQuery || (hasMonthSupport && !isValidMonthRange);
  const syncIconClass = executingQuery ? 'pi pi-spin pi-spinner' : 'pi pi-refresh';
  const lastUpdatedText = lastUpdatedAt ? formatLastUpdatedDate(lastUpdatedAt) : 'N/A';

  // Check if header should be shown (if any selectors are visible)
  const hasHeaderContent = headerEnabled && (showMonthRangePicker || showBreakdownToggle || showBreakdownControls ||
    showSyncButton);

  // Render selectors JSX with enhanced responsive classes
  const selectorsJSX = (
    <>
      <div className="flex flex-col gap-2 sm:gap-3 md:gap-4 w-full min-w-0">
        {/* Desktop Layout - Keep existing flex-wrap behavior */}
        <div className="hidden sm:flex flex-row items-end justify-between w-full gap-2 sm:gap-3 md:gap-4">
          <div className="flex flex-row items-end gap-2 sm:gap-3 md:gap-4 flex-wrap">
            <div className='flex flex-row gap-2 sm:gap-3 md:gap-4 w-auto'>
              <div className='flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4'>
                {/* Breakdown Toggle - Only show when report is enabled */}
                {showBreakdownToggle && (
                  <div className="flex items-center gap-2">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap">
                      Report
                    </label>
                    <Switch
                      checked={enableBreakdown}
                      onChange={(checked) => {
                        setEnableBreakdown(checked);
                      }}
                      size={isMobile ? 'small' : 'default'}
                      disabled={isComputingReport}
                    />
                  </div>
                )}

                {/* Breakdown By - Only show when report is enabled, breakdown toggle is on, and date column is set */}
                {showBreakdownControls && (
                  <div className="w-auto min-w-[120px]">
                    <Dropdown
                      value={breakdownType}
                      onChange={(e) => setBreakdownType(e.value)}
                      options={[
                        { label: 'Month', value: 'month' },
                        { label: 'Week', value: 'week' },
                        { label: 'Day', value: 'day' },
                        { label: 'Quarter', value: 'quarter' },
                        { label: 'Year', value: 'annual' }
                      ]}
                      optionLabel="label"
                      optionValue="value"
                      className="w-full items-center"
                      disabled={executingQuery}
                      style={{
                        fontSize: '0.875rem',
                        height: '2rem',
                      }}
                    />
                  </div>
                )}

                {/* Column Group By - Only show when report is enabled and date column is set */}
                {showBreakdownControls && (
                  <div className="w-auto min-w-[120px]">
                    <Dropdown
                      value={columnGroupBy}
                      onChange={(e) => setColumnGroupBy(e.value)}
                      options={[
                        { label: 'Values', value: 'values' },
                        { label: startCase(dateColumn.split('__').join(' ').split('_').join(' ')), value: dateColumn },
                        { label: 'Period-over-Period', value: 'period-over-period' }
                      ]}
                      optionLabel="label"
                      optionValue="value"
                      className="w-full items-center"
                      disabled={executingQuery}
                      style={{
                        fontSize: '0.875rem',
                        height: '2rem',
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Range Picker - Only show when using saved query that supports month filtering */}
            {showMonthRangePicker && (
              <div className="w-64 md:w-72 lg:w-80 min-w-0 shrink-0">
                <RangePicker
                  key={`${dataSource}-${pickerMode}`} // Force re-render when data source or mode changes
                  value={monthRange}
                  onChange={(dates) => {
                    if (dates && dates[0] && dates[1]) {
                      setMonthRange([dates[0], dates[1]]);
                    } else {
                      setMonthRange(null);
                    }
                  }}
                  placeholder={getPickerPlaceholder()}
                  format="MM/YY"
                  mode={pickerMode}
                  disabled={executingQuery}
                  className="w-full"
                  style={{
                    width: '100%',
                    fontSize: '0.875rem',
                    height: '2rem',
                  }}
                />
              </div>
            )}
            {/* Last Updated at with Sync button - Show when using saved query, in a new row below Data Source */}
            {showSyncButton && (
              <div className="flex-1 min-w-0">
                <SplitButton
                  outlined
                  severity="secondary"
                  label={<span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{lastUpdatedText}</span>}
                  icon={syncIconClass}
                  onClick={handleSync}
                  model={[
                    {
                      label: 'Hard Refresh',
                      icon: 'pi pi-sync',
                      command: () => {
                        handleClearMonthRangeCache();
                      }
                    }
                  ]}
                  disabled={isSyncDisabled}
                  style={{ height: '2rem', minWidth: 'fit-content' }}
                />
              </div>
            )}
            {/* Filter and Sort Button - Only show when clientSave === true */}
            {currentQueryDoc?.clientSave === true &&
              (Object.keys(currentQueryDoc?.searchFields || {}).length > 0 || currentQueryDoc?.sortFields) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    icon="pi pi-sliders-h"
                    label="Filter / Sort"
                    onClick={() => setFilterSortSidebarVisible(true)}
                    className="p-button-outlined"
                    severity="secondary"
                    style={{ height: '2rem', fontSize: '0.875rem' }}
                  >
                    {(() => {
                      // Calculate active filter count
                      let count = 0;
                      if (sortConfig && sortConfig.field) count += 1;
                      Object.values(preFilterValues).forEach(vals => {
                        if (Array.isArray(vals) && vals.length > 0) {
                          count += vals.length;
                        }
                      });
                      return count > 0 ? <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">{count}</span> : null;
                    })()}
                  </Button>

                  {/* Applied Sort Button */}
                  {sortConfig && sortConfig.field && (() => {
                    const fieldName = sortConfig.field.split('.').pop();
                    const displayName = startCase(fieldName);
                    const fieldType = columnTypes[fieldName] || 'string';
                    let directionLabel = '';
                    if (fieldType === 'date') {
                      directionLabel = sortConfig.direction === 'asc' ? 'Oldest to Latest' : 'Latest to Oldest';
                    } else if (fieldType === 'number') {
                      directionLabel = sortConfig.direction === 'asc' ? 'Low to High' : 'High to Low';
                    } else {
                      directionLabel = sortConfig.direction === 'asc' ? 'A to Z' : 'Z to A';
                    }
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setIsApplyingFilterSort(true);
                          setSortConfig(null);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md hover:opacity-80 transition-opacity border"
                        style={{
                          height: '2rem',
                          backgroundColor: '#db2d27',
                          color: 'white',
                          borderColor: '#db2d27'
                        }}
                        title="Remove sort"
                      >
                        <i className="pi pi-sort text-xs"></i>
                        <span>{displayName} - {directionLabel}</span>
                        <i className="pi pi-times text-xs"></i>
                      </button>
                    );
                  })()}

                  {/* Applied Filter Value Buttons */}
                  {Object.entries(preFilterValues).map(([fieldKey, values]) => {
                    if (!Array.isArray(values) || values.length === 0) return null;

                    // Get display name for field (use memoized map or fallback to startCase)
                    const fieldDisplayName = fieldDisplayNames[fieldKey] || startCase(fieldKey);

                    return values.map((value, idx) => (
                      <button
                        key={`${fieldKey}-${value}-${idx}`}
                        type="button"
                        onClick={() => {
                          setIsApplyingFilterSort(true);
                          setPreFilterValues(prev => {
                            const newValues = { ...prev };
                            if (newValues[fieldKey]) {
                              newValues[fieldKey] = newValues[fieldKey].filter(v => v !== value);
                              if (newValues[fieldKey].length === 0) {
                                delete newValues[fieldKey];
                              }
                            }
                            return newValues;
                          });
                        }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md hover:opacity-80 transition-opacity border"
                        style={{
                          height: '2rem',
                          backgroundColor: '#db2d27',
                          color: 'white',
                          borderColor: '#db2d27'
                        }}
                        title="Remove filter"
                      >
                        <i className="pi pi-filter text-xs"></i>
                        <span>{fieldDisplayName}: {value}</span>
                        <i className="pi pi-times text-xs"></i>
                      </button>
                    ));
                  })}
                </div>
              )}
          </div>
        </div>

        {/* Mobile Layout - 3 distinct rows */}
        <div className="flex sm:hidden flex-col gap-4 w-full">
          {/* Row 1: Report toggle, Breakdown type, Grouping */}
          {(showBreakdownToggle || showBreakdownControls) && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Breakdown Toggle - Only show when report is enabled */}
              {showBreakdownToggle && (
                <div className="flex items-center gap-2">
                  <label className="block text-xs font-medium text-gray-700 whitespace-nowrap">
                    Report
                  </label>
                  <Switch
                    checked={enableBreakdown}
                    onChange={(checked) => {
                      setEnableBreakdown(checked);
                    }}
                    size="small"
                    disabled={isComputingReport}
                  />
                </div>
              )}

              {/* Breakdown By - Only show when report is enabled, breakdown toggle is on, and date column is set */}
              {showBreakdownControls && (
                <div className="flex-1">
                  <Dropdown
                    value={breakdownType}
                    onChange={(e) => setBreakdownType(e.value)}
                    options={[
                      { label: 'Month', value: 'month' },
                      { label: 'Week', value: 'week' },
                      { label: 'Day', value: 'day' },
                      { label: 'Quarter', value: 'quarter' },
                      { label: 'Year', value: 'annual' }
                    ]}
                    optionLabel="label"
                    optionValue="value"
                    className="w-full items-center"
                    disabled={executingQuery}
                    style={{
                      fontSize: '0.875rem',
                      height: '2rem',
                    }}
                  />
                </div>
              )}

              {/* Column Group By - Only show when report is enabled and date column is set */}
              {showBreakdownControls && (
                <div className="flex-1">
                  <Dropdown
                    value={columnGroupBy}
                    onChange={(e) => setColumnGroupBy(e.value)}
                    options={[
                      { label: 'Values', value: 'values' },
                      { label: startCase(dateColumn.split('__').join(' ').split('_').join(' ')), value: dateColumn },
                      { label: 'Period-over-Period', value: 'period-over-period' }
                    ]}
                    optionLabel="label"
                    optionValue="value"
                    className="w-full items-center"
                    disabled={executingQuery}
                    style={{
                      fontSize: '0.875rem',
                      height: '2rem',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Row 2: Range picker, Sync button */}
          {(showMonthRangePicker || showSyncButton) && (
            <div className="flex items-center gap-2">
              {/* Range Picker - Only show when using saved query that supports month filtering */}
              {showMonthRangePicker && (
                <RangePicker
                  key={`${dataSource}-${pickerMode}`} // Force re-render when data source or mode changes
                  value={monthRange}
                  onChange={(dates) => {
                    if (dates && dates[0] && dates[1]) {
                      setMonthRange([dates[0], dates[1]]);
                    } else {
                      setMonthRange(null);
                    }
                  }}
                  placeholder={getPickerPlaceholder()}
                  format="MM/YY"
                  mode={pickerMode}
                  disabled={executingQuery}
                  className="w-full"
                  style={{
                    fontSize: '0.875rem',
                    height: '2rem',
                  }}
                />
              )}
              {/* Last Updated at with Sync button - Show when using saved query */}
              {showSyncButton && (
                <div className="w-full">
                  <SplitButton
                    outlined
                    severity="secondary"
                    label={<span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{lastUpdatedText}</span>}
                    icon={syncIconClass}
                    onClick={handleSync}
                    model={[
                      {
                        label: 'Hard Refresh',
                        icon: 'pi pi-sync',
                        command: () => {
                          handleClearMonthRangeCache();
                        }
                      }
                    ]}
                    disabled={isSyncDisabled}
                    style={{ height: '2rem', minWidth: 'fit-content' }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Row 3: Filter and Sort button + applied filter buttons (with horizontal scroll) */}
          {currentQueryDoc?.clientSave === true &&
            (Object.keys(currentQueryDoc?.searchFields || {}).length > 0 || currentQueryDoc?.sortFields) && (
              <div className="flex items-center gap-2 w-full min-w-0">
                <Button
                  icon="pi pi-sliders-h"
                  label="Filter and Sort"
                  onClick={() => setFilterSortSidebarVisible(true)}
                  className="p-button-outlined shrink-0"
                  severity="secondary"
                  style={{ height: '2rem', fontSize: '0.875rem' }}
                >
                  {(() => {
                    // Calculate active filter count
                    let count = 0;
                    if (sortConfig && sortConfig.field) count += 1;
                    Object.values(preFilterValues).forEach(vals => {
                      if (Array.isArray(vals) && vals.length > 0) {
                        count += vals.length;
                      }
                    });
                    return count > 0 ? <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">{count}</span> : null;
                  })()}
                </Button>

                {/* Scrollable container for applied filters */}
                <div className="flex-1 min-w-0 overflow-x-auto">
                  <div className="flex items-center gap-2 flex-nowrap">
                    {/* Applied Sort Button */}
                    {sortConfig && sortConfig.field && (() => {
                      const fieldName = sortConfig.field.split('.').pop();
                      const displayName = startCase(fieldName);
                      const fieldType = columnTypes[fieldName] || 'string';
                      let directionLabel = '';
                      if (fieldType === 'date') {
                        directionLabel = sortConfig.direction === 'asc' ? 'Oldest to Latest' : 'Latest to Oldest';
                      } else if (fieldType === 'number') {
                        directionLabel = sortConfig.direction === 'asc' ? 'Low to High' : 'High to Low';
                      } else {
                        directionLabel = sortConfig.direction === 'asc' ? 'A to Z' : 'Z to A';
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            setIsApplyingFilterSort(true);
                            setSortConfig(null);
                          }}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md hover:opacity-80 transition-opacity border shrink-0"
                          style={{
                            height: '2rem',
                            backgroundColor: '#db2d27',
                            color: 'white',
                            borderColor: '#db2d27'
                          }}
                          title="Remove sort"
                        >
                          <i className="pi pi-sort text-xs"></i>
                          <span>{displayName} - {directionLabel}</span>
                          <i className="pi pi-times text-xs"></i>
                        </button>
                      );
                    })()}

                    {/* Applied Filter Value Buttons */}
                    {Object.entries(preFilterValues).map(([fieldKey, values]) => {
                      if (!Array.isArray(values) || values.length === 0) return null;

                      // Get display name for field (use memoized map or fallback to startCase)
                      const fieldDisplayName = fieldDisplayNames[fieldKey] || startCase(fieldKey);

                      return values.map((value, idx) => (
                        <button
                          key={`${fieldKey}-${value}-${idx}`}
                          type="button"
                          onClick={() => {
                            setIsApplyingFilterSort(true);
                            setPreFilterValues(prev => {
                              const newValues = { ...prev };
                              if (newValues[fieldKey]) {
                                newValues[fieldKey] = newValues[fieldKey].filter(v => v !== value);
                                if (newValues[fieldKey].length === 0) {
                                  delete newValues[fieldKey];
                                }
                              }
                              return newValues;
                            });
                          }}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md hover:opacity-80 transition-opacity border shrink-0"
                          style={{
                            height: '2rem',
                            backgroundColor: '#db2d27',
                            color: 'white',
                            borderColor: '#db2d27'
                          }}
                          title="Remove filter"
                        >
                          <i className="pi pi-filter text-xs"></i>
                          <span>{fieldDisplayName}: {value}</span>
                          <i className="pi pi-times text-xs"></i>
                        </button>
                      ));
                    })}
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>
    </>
  );

  // Keep existing callback for backward compatibility
  useEffect(() => {
    if (onTableDataChange) {
      onTableDataChange(sortedData);
    }
  }, [sortedData, onTableDataChange]);


  // Drawer sidebar helpers
  const hasDrawerTabs = drawerTabs && drawerTabs.length > 0;
  const hasDrawerData = drawerData && drawerData.length > 0;
  const drawerActiveIndex = hasDrawerTabs
    ? Math.min(activeDrawerTabIndex, Math.max(0, drawerTabs.length - 1))
    : 0;

  // Empty state component for drawer
  const DrawerEmptyState = ({ icon, title, subtitle }) => (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <i className={`pi ${icon} text-4xl text-gray-400 mb-4`}></i>
      <p className="text-gray-600 font-medium">{title}</p>
      <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
    </div>
  );

  // Ensure contextValue is never null/undefined (safeguard)
  if (!contextValue) {
    console.error('DataProviderNew: contextValue is null/undefined');
  }

  return (
    <>
      <TableOperationsContext.Provider value={contextValue || {}}>
        {/* Header Controls - Responsive container */}
        {hasHeaderContent && (
          <div className="px-2 sm:px-3 md:px-4 lg:px-6 xl:px-8 py-2 sm:py-3 md:py-4 border-b border-gray-200 shrink-0 bg-white min-w-0 overflow-x-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3 md:gap-4 min-w-0 w-full">
              <div className="flex-1 min-w-0 w-full">
                {selectorsJSX}
              </div>
            </div>
          </div>
        )}

        {/* Render children */}
        <PlasmicDataProvider name="data" data={contextValue}>
          {children}
        </PlasmicDataProvider>
      </TableOperationsContext.Provider>

      {/* Filter and Sort Sidebar */}
      {currentQueryDoc?.clientSave === true && (
        <FilterSortSidebar
          visible={filterSortSidebarVisible}
          onHide={() => {
            setFilterSortSidebarVisible(false);
          }}
          searchFields={currentQueryDoc?.searchFields || {}}
          sortFields={currentQueryDoc?.sortFields || {}}
          tableData={preFilteredData}
          columnTypes={columnTypes}
          currentSortConfig={sortConfig}
          currentFilterValues={preFilterValues}
          onApply={async (sortConfig, filterValues) => {
            setIsApplyingFilterSort(true);

            // Update state for worker computation (batch these together)
            setSortConfig(sortConfig);
            setPreFilterValues(filterValues || {});

            // Trigger worker computation immediately (don't wait for useEffect)
            // This reduces the delay between state update and worker start
            if (filterSortWorkerRef.current && tableData && !isEmpty(tableData)) {
              const computationId = ++filterSortComputationIdRef.current;

              // Start worker computation immediately
              (async () => {
                try {
                  // Convert preFilterValues to tableFilters format
                  const filtersForWorker = {};
                  Object.keys(filterValues || {}).forEach(col => {
                    filtersForWorker[col] = { value: filterValues[col] };
                  });

                  const result = await filterSortWorkerRef.current.computeFilterSortGrouped(tableData, {
                    tableFilters: filtersForWorker,
                    columns,
                    columnTypes,
                    multiselectColumns,
                    hasPercentageColumns,
                    percentageColumns,
                    percentageColumnNames,
                    enableFilter,
                    searchTerm,
                    searchFields: currentQueryDoc?.searchFields || {},
                    sortConfig,
                    sortFieldType,
                    tableSortMeta,
                    enableSort,
                    effectiveGroupFields,
                  });

                  // Only update if this is still the latest computation
                  if (computationId === filterSortComputationIdRef.current) {
                    setWorkerComputedData(result);
                    setIsApplyingFilterSort(false);
                  }
                } catch (error) {
                  console.error('Filter/sort worker computation error:', error);
                  if (computationId === filterSortComputationIdRef.current) {
                    setIsApplyingFilterSort(false);
                  }
                }
              })();
            }

            // Sidebar is already closed by onHide() in FilterSortSidebar
          }}
          onClear={() => {
            setIsApplyingFilterSort(true);
            setSortConfig(null);
            setPreFilterValues({});
          }}
        />
      )}

      {/* Drawer Sidebar - Only render if drawer tabs are configured */}
      {hasDrawerTabs && (
        <Sidebar
          position="bottom"
          blockScroll
          visible={drawerVisible}
          onHide={closeDrawer}
          style={{ height: '100dvh' }}
          className="p-sidebar-sm"
          header={
            <h2 className="text-lg font-semibold text-gray-800 m-0">
              {drawerHeaderTitle}
            </h2>
          }
        >
          <div className="flex flex-col h-full">
            <div className="flex-1">
              {hasDrawerTabs ? (
                <TabView
                  activeIndex={drawerActiveIndex}
                  onTabChange={(e) => setActiveDrawerTabIndex(e.index)}
                  className="h-full flex flex-col"
                >
                  {drawerTabs.map((tab, index) => {
                    // Ensure tab has a unique id (use index as fallback for stability)
                    const tabId = tab.id || `tab-${index}`;

                    // Base props from main table (inherit from DataProviderNew props)
                    const baseTableProps = {
                      rowsPerPageOptions: [5, 10, 25, 50, 100, 200], // drawer-specific default
                      defaultRows: 10, // drawer-specific default
                      scrollable: false, // drawer-specific default
                      enableSort: enableSort, // from main table
                      enableFilter: enableFilter, // from main table
                      enableSummation: enableSummation, // from main table
                      enableDivideBy1Lakh: enableDivideBy1Lakh, // from main table
                      textFilterColumns: textFilterColumns, // from main table
                      allowedColumns: allowedColumns, // from main table - ensures drawer respects column filtering
                      onAllowedColumnsChange: onAllowedColumnsChange, // from main table
                      visibleColumns: tableVisibleColumns, // from main table - ensures drawer respects column visibility
                      onVisibleColumnsChange: onVisibleColumnsChange, // from main table
                      redFields: redFields, // from main table
                      greenFields: greenFields, // from main table
                      groupFields: (() => {
                        // Convert tab's outerGroup/innerGroup to groupFields array, or use tab.groupFields if provided
                        if (tab.groupFields && Array.isArray(tab.groupFields)) {
                          return tab.groupFields;
                        }
                        const fields = [];
                        if (tab.outerGroup) fields.push(tab.outerGroup);
                        if (tab.innerGroup) fields.push(tab.innerGroup);
                        return fields.length > 0 ? fields : null;
                      })(),
                      enableCellEdit: false, // drawer-specific default
                      editableColumns: { main: [], nested: {} }, // drawer-specific default
                      percentageColumns: percentageColumns, // from main table
                      columnTypes: columnTypes, // from main table
                      tableName: "sidebar",
                      // Report settings - drawer reuses parent report view without local toggle
                      enableReport: false,
                      forceBreakdown: shouldShowDrawerReport,
                      reportDataOverride: shouldShowDrawerReport ? drawerReportData : null,
                      showProviderHeader: false,
                      dateColumn: dateColumn, // from main table
                      breakdownType: breakdownType, // from main table
                      columnGroupBy: columnGroupBy, // from main table
                    };

                    // Extract tab-specific overrides (any prop beyond id, name, outerGroup, innerGroup, isJsonTable, data, fieldName, parentColumnName, nestedTableFieldName)
                    const { id, name, outerGroup, innerGroup, isJsonTable, data: tabData, fieldName, parentColumnName, nestedTableFieldName, ...tabOverrides } = tab;
                    // Merge order: default (baseTableProps) → tableOptions (drawerTableOptions) → tabOverrides
                    const mergedTableProps = { ...baseTableProps, ...(drawerTableOptions || {}), ...tabOverrides };

                    // Determine data source: use tab data if it's a JSON table tab, otherwise use drawerData
                    const tabDataSource = isJsonTable && tabData ? tabData : drawerData;
                    const hasTabData = isJsonTable ? (tabData && isArray(tabData) && tabData.length > 0) : hasDrawerData;

                    return (
                      <TabPanel
                        key={tabId}
                        header={tab.name || `Tab ${index + 1}`}
                        className="h-full flex flex-col"
                      >
                        <div className="flex-1 overflow-auto">
                          {hasTabData ? (
                            <DataProviderNew
                              dataSource={null}
                              offlineData={tabDataSource}
                              drawerTabs={[]} // Disable drawer in nested instance
                              enableSort={mergedTableProps.enableSort}
                              enableFilter={mergedTableProps.enableFilter}
                              enableSummation={mergedTableProps.enableSummation}
                              enableGrouping={mergedTableProps.enableGrouping}
                              textFilterColumns={mergedTableProps.textFilterColumns || []}
                              percentageColumns={mergedTableProps.percentageColumns || []}
                              groupFields={mergedTableProps.groupFields}
                              redFields={mergedTableProps.redFields || []}
                              greenFields={mergedTableProps.greenFields || []}
                              enableDivideBy1Lakh={mergedTableProps.enableDivideBy1Lakh || false}
                              columnTypesOverride={mergedTableProps.columnTypesOverride || {}}
                              allowedColumns={mergedTableProps.allowedColumns || []}
                              editableColumns={mergedTableProps.editableColumns || { main: [], nested: {} }}
                              enableCellEdit={mergedTableProps.enableCellEdit !== undefined ? mergedTableProps.enableCellEdit : false}
                              parentColumnName={isJsonTable ? parentColumnName : undefined}
                              nestedTableFieldName={isJsonTable ? nestedTableFieldName : undefined}
                              onAllowedColumnsChange={mergedTableProps.onAllowedColumnsChange}
                              visibleColumns={mergedTableProps.visibleColumns}
                              onVisibleColumnsChange={mergedTableProps.onVisibleColumnsChange}
                              enableReport={mergedTableProps.enableReport}
                              forceBreakdown={mergedTableProps.forceBreakdown}
                              reportDataOverride={mergedTableProps.reportDataOverride}
                              showProviderHeader={mergedTableProps.showProviderHeader}
                              dateColumn={mergedTableProps.dateColumn}
                              breakdownType={mergedTableProps.breakdownType}
                              columnGroupBy={mergedTableProps.columnGroupBy}
                              chartColumns={mergedTableProps.chartColumns || []}
                              chartHeight={mergedTableProps.chartHeight}
                              // Pass enableWrite from parent for nested drawer tables
                              forceEnableWrite={isJsonTable && currentQueryDoc?.enableWrite ? true : undefined}
                              onTableDataChange={isJsonTable ? (data) => {
                                // Update current nested table data for this tab when data changes
                                updateCurrentNestedTableData(tabId, data);
                              } : undefined}
                            >
                              <DataTableComponent
                                useOrchestrationLayer={true}
                                enableFullscreenDialog={mergedTableProps.enableFullscreenDialog}
                                scrollable={mergedTableProps.scrollable}
                                scrollHeight={mergedTableProps.scrollHeight}
                                rowsPerPageOptions={mergedTableProps.rowsPerPageOptions}
                                defaultRows={mergedTableProps.defaultRows}
                                enableCellEdit={mergedTableProps.enableCellEdit !== undefined ? mergedTableProps.enableCellEdit : false}
                              />
                            </DataProviderNew>
                          ) : (
                            <DrawerEmptyState
                              icon="pi-inbox"
                              title="No data available"
                              subtitle={tab.isJsonTable ? "No nested table data" : "No matching rows found"}
                            />
                          )}
                        </div>
                      </TabPanel>
                    );
                  })}
                </TabView>
              ) : (
                <DrawerEmptyState
                  icon="pi-inbox"
                  title="No tabs configured"
                  subtitle="Please configure drawer tabs in settings"
                />
              )}
            </div>
          </div>
        </Sidebar>
      )}
    </>
  );
}

