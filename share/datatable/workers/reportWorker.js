/**
 * Web Worker for report computation
 * Uses Comlink to expose API to main thread
 */

import * as Comlink from 'comlink';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { isEmpty, isNil, isNumber, toNumber, isNaN as _isNaN } from 'lodash';

// Extend dayjs with plugins
dayjs.extend(isoWeek);
dayjs.extend(quarterOfYear);

/**
 * Get time period key based on breakdown type
 */
function getTimePeriodKey(date, breakdownType) {
    const d = dayjs(date);

    switch (breakdownType) {
        case "month":
            return d.format("YYYY-MM");
        case "week":
            const year = d.isoWeekYear();
            const week = d.isoWeek();
            return `${year}-W${String(week).padStart(2, "0")}`;
        case "day":
            return d.format("YYYY-MM-DD");
        case "quarter":
            return `${d.year()}-Q${d.quarter()}`;
        case "annual":
            return d.format("YYYY");
        default:
            return d.format("YYYY-MM");
    }
}

/**
 * Get all time periods in a range
 */
function getTimePeriods(startDate, endDate, breakdownType) {
    const periods = new Set();
    let current = dayjs(startDate);
    const end = dayjs(endDate);

    while (
        current.isBefore(end) ||
        current.isSame(
            end,
            breakdownType === "day"
                ? "day"
                : breakdownType === "month"
                  ? "month"
                  : breakdownType === "quarter"
                    ? "quarter"
                    : "year",
        )
    ) {
        const periodKey = getTimePeriodKey(current, breakdownType);
        periods.add(periodKey);

        // Increment based on breakdown type
        switch (breakdownType) {
            case "month":
                current = current.add(1, "month");
                break;
            case "week":
                current = current.add(1, "week");
                break;
            case "day":
                current = current.add(1, "day");
                break;
            case "quarter":
                current = current.add(1, "quarter");
                break;
            case "annual":
                current = current.add(1, "year");
                break;
            default:
                current = current.add(1, "month");
        }
    }

    return Array.from(periods).sort();
}

/**
 * Get data value from object (handles nested paths)
 */
function getDataValue(data, key) {
    if (!data || !key) return undefined;
    if (data instanceof Map) {
        return data.get(key);
    }
    // Handle nested paths like "user.profile.name"
    if (key.includes('.')) {
        const parts = key.split('.');
        let current = data;
        for (const part of parts) {
            if (current == null) return undefined;
            current = current[part];
        }
        return current;
    }
    return data[key];
}

/**
 * Get nested value from row using top-level key and nested path
 */
function getNestedValue(row, topLevelKey, nestedPath) {
    if (!row || !topLevelKey) return undefined;
    const topLevelValue = getDataValue(row, topLevelKey);
    
    // If top-level key exists and has a value, try nested access
    if (topLevelValue != null && nestedPath) {
        // Split nested path and traverse
        const parts = nestedPath.split('.');
        let current = topLevelValue;
        for (const part of parts) {
            if (current == null) {
                break;
            }
            current = getDataValue(current, part);
        }
        // If we got a value, return it
        if (current != null) {
            return current;
        }
    }
    
    // Fallback: if top-level key doesn't exist or nested access failed,
    // try accessing nestedPath directly on the row (for flat data structures)
    if (nestedPath) {
        const directValue = getDataValue(row, nestedPath);
        if (directValue != null) {
            return directValue;
        }
    }
    
    // If no nestedPath, return top-level value (or undefined if it doesn't exist)
    return topLevelValue;
}

/**
 * Parse a value to a Date object
 */
function parseToDate(value) {
    if (value == null) return null;
    if (value === '' || value === 0 || value === '0') return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') {
        if (value <= 0) return null;
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return null;
        const parsed = new Date(trimmed);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

/**
 * Create a sort comparator function based on sortConfig and fieldType
 */
function createSortComparator(sortConfig, fieldType, topLevelKey, nestedPath) {
    if (!sortConfig || !fieldType) return null;
    
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
}

/**
 * Group data by time period (optimized with Map)
 */
function groupDataByTimePeriod(data, dateField, breakdownType, metrics = []) {
    const grouped = new Map();
    const dateCache = new Map(); // Cache parsed dates

    data.forEach((item) => {
        const dateValue = getDataValue(item, dateField);
        if (!dateValue) return;

        // Use cached parsed date if available
        let parsedDate = dateCache.get(dateValue);
        if (!parsedDate) {
            parsedDate = dayjs(dateValue);
            if (!parsedDate.isValid()) return;
            dateCache.set(dateValue, parsedDate);
        }

        const periodKey = getTimePeriodKey(parsedDate, breakdownType);

        if (!grouped.has(periodKey)) {
            const periodData = {
                period: periodKey,
                data: [],
            };
            // Initialize metrics
            metrics.forEach((metric) => {
                periodData[metric] = 0;
            });
            grouped.set(periodKey, periodData);
        }

        const periodData = grouped.get(periodKey);
        periodData.data.push(item);

        // Aggregate metrics
        metrics.forEach((metric) => {
            const value = getDataValue(item, metric);
            if (value !== undefined && value !== null) {
                if (typeof value === "number") {
                    periodData[metric] += value;
                } else {
                    const numVal = toNumber(value);
                    if (!_isNaN(numVal) && isFinite(numVal)) {
                        periodData[metric] += numVal;
                    }
                }
            }
        });
    });

    // Convert Map to object for compatibility
    const result = {};
    grouped.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}

/**
 * Transform grouped data into table format (optimized)
 */
function transformToTableData(groupedData, productField, breakdownType, includeDetails = false, metrics = []) {
    const products = new Map();

    Object.values(groupedData).forEach((periodData) => {
        periodData.data.forEach((item) => {
            const product = getDataValue(item, productField) || "Unknown";

            if (!products.has(product)) {
                products.set(product, {
                    product,
                    periods: new Map(),
                    details: includeDetails ? [] : undefined,
                });
            }

            const productEntry = products.get(product);
            const periodKey = periodData.period;

            if (!productEntry.periods.has(periodKey)) {
                const periodMetrics = {};
                metrics.forEach(metric => {
                    periodMetrics[metric] = 0;
                });
                productEntry.periods.set(periodKey, periodMetrics);
            }

            const periodMetrics = productEntry.periods.get(periodKey);

            // Aggregate all metrics dynamically
            metrics.forEach(metric => {
                const value = getDataValue(item, metric);
                if (value !== undefined && value !== null) {
                    if (typeof value === "number") {
                        periodMetrics[metric] += value;
                    } else {
                        const numVal = toNumber(value);
                        if (!_isNaN(numVal) && isFinite(numVal)) {
                            periodMetrics[metric] += numVal;
                        }
                    }
                }
            });

            // Store detailed record for nested table
            if (includeDetails) {
                productEntry.details.push({
                    ...item,
                    period: periodKey,
                });
            }
        });
    });

    // Get all unique periods
    const allPeriods = Object.keys(groupedData).sort();

    // Transform to flat structure
    const result = [];
    let index = 0;
    products.forEach((productEntry) => {
        const row = {
            id: ++index,
            product: productEntry.product,
        };

        allPeriods.forEach((period) => {
            const periodMetrics = productEntry.periods.get(period) || {};
            metrics.forEach(metric => {
                row[`${period}_${metric}`] = periodMetrics[metric] || 0;
            });
        });

        // Include details for nested table
        if (includeDetails) {
            row.details = productEntry.details;
        }

        result.push(row);
    });

    return result;
}

/**
 * Transform grouped data into nested table format (optimized)
 */
function transformToNestedTableData(groupedData, productField, categoryField, breakdownType, allPeriods, metrics = []) {
    const nestedData = new Map(); // product -> categories Map

    Object.values(groupedData).forEach((periodData) => {
        periodData.data.forEach((item) => {
            const product = getDataValue(item, productField) || "Unknown";
            const category = getDataValue(item, categoryField) || "Unknown";
            const periodKey = periodData.period;

            // Find or create product entry
            if (!nestedData.has(product)) {
                nestedData.set(product, new Map());
            }
            const productCategories = nestedData.get(product);

            // Find or create category entry for this product
            if (!productCategories.has(category)) {
                const categoryEntry = {
                    category,
                    periods: new Map(),
                };
                productCategories.set(category, categoryEntry);
            }

            const categoryEntry = productCategories.get(category);

            // Initialize period if not exists
            if (!categoryEntry.periods.has(periodKey)) {
                const periodMetrics = {};
                metrics.forEach(metric => {
                    periodMetrics[metric] = 0;
                });
                categoryEntry.periods.set(periodKey, periodMetrics);
            }

            const periodMetrics = categoryEntry.periods.get(periodKey);

            // Aggregate all metrics dynamically
            metrics.forEach(metric => {
                const value = getDataValue(item, metric);
                if (value !== undefined && value !== null) {
                    if (typeof value === "number") {
                        periodMetrics[metric] += value;
                    } else {
                        const numVal = toNumber(value);
                        if (!_isNaN(numVal) && isFinite(numVal)) {
                            periodMetrics[metric] += numVal;
                        }
                    }
                }
            });
        });
    });

    // Transform to flat structure for nested table
    const result = [];
    let productIndex = 0;
    nestedData.forEach((productCategories, product) => {
        let categoryIndex = 0;
        productCategories.forEach((categoryEntry, category) => {
            const row = {
                id: `${productIndex + 1}-${categoryIndex + 1}`,
                product,
                category,
                isNestedRow: true,
            };

            // Add period columns for all metrics
            allPeriods.forEach((period) => {
                const periodMetrics = categoryEntry.periods.get(period) || {};
                metrics.forEach(metric => {
                    row[`${period}_${metric}`] = periodMetrics[metric] || 0;
                });
            });

            result.push(row);
            categoryIndex++;
        });
        productIndex++;
    });

    return result;
}

/**
 * Compute report data (main function exposed to main thread)
 */
async function computeReportData(data, effectiveGroupFields, dateColumn, breakdownType, columnTypes = {}, sortConfig = null, sortFieldType = null) {
    // Ensure effectiveGroupFields is an array
    const groupFields = Array.isArray(effectiveGroupFields) ? effectiveGroupFields : [];
    
    if (!data || isEmpty(data) || groupFields.length === 0 || !dateColumn) {
        return {
            tableData: [],
            nestedTableData: {},
            timePeriods: [],
            metrics: [],
            dateRange: { start: null, end: null },
            breakdownType
        };
    }

    // Detect numeric columns (metrics to aggregate) - optimized single pass
    const metrics = [];
    const allColumnsSet = new Set();
    const columnNumericCount = new Map();
    const columnCheckedCount = new Map();
    const sampleSize = Math.min(data.length, 100);

    // Single pass to collect columns and detect metrics
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || typeof row !== 'object') continue;

        Object.keys(row).forEach(col => {
            allColumnsSet.add(col);
            
            // Skip grouping fields and date column
            if (groupFields.includes(col) || col === dateColumn) {
                return;
            }

            // Check column type
            const colType = columnTypes[col];
            if (colType === 'number') {
                if (!metrics.includes(col)) {
                    metrics.push(col);
                }
            } else if (i < sampleSize) {
                // Sample rows for numeric detection
                const value = getDataValue(row, col);
                if (value !== null && value !== undefined && value !== '') {
                    columnCheckedCount.set(col, (columnCheckedCount.get(col) || 0) + 1);
                    if (typeof value === 'number') {
                        columnNumericCount.set(col, (columnNumericCount.get(col) || 0) + 1);
                    } else {
                        const numVal = toNumber(value);
                        if (!_isNaN(numVal) && isFinite(numVal)) {
                            columnNumericCount.set(col, (columnNumericCount.get(col) || 0) + 1);
                        }
                    }
                }
            }
        });
    }

    // Process sampled columns
    columnCheckedCount.forEach((checkedCount, col) => {
        if (!metrics.includes(col)) {
            const numericCount = columnNumericCount.get(col) || 0;
            if (checkedCount > 0 && numericCount / checkedCount > 0.5) {
                metrics.push(col);
            }
        }
    });

    // Get date range from data - optimized with single pass
    const dates = [];
    const dateCache = new Map();
    
    for (let i = 0; i < data.length; i++) {
        const dateValue = getDataValue(data[i], dateColumn);
        if (!dateValue) continue;
        
        let parsed = dateCache.get(dateValue);
        if (!parsed) {
            parsed = dayjs(dateValue);
            if (parsed.isValid()) {
                dateCache.set(dateValue, parsed);
                dates.push(parsed);
            }
        } else {
            dates.push(parsed);
        }
    }

    if (dates.length === 0) {
        return {
            tableData: [],
            nestedTableData: {},
            timePeriods: [],
            metrics: [],
            dateRange: { start: null, end: null },
            breakdownType
        };
    }

    // Sort dates
    dates.sort((a, b) => a.valueOf() - b.valueOf());

    const dateRange = {
        start: dates[0].format('YYYY-MM-DD'),
        end: dates[dates.length - 1].format('YYYY-MM-DD')
    };

    // Get all time periods
    const timePeriods = getTimePeriods(dateRange.start, dateRange.end, breakdownType);

    // Group data by time period
    const groupedData = groupDataByTimePeriod(data, dateColumn, breakdownType, metrics);

    // Transform to table data (outer group rows)
    const outerGroupField = groupFields[0];
    const transformedTableData = transformToTableData(groupedData, outerGroupField, breakdownType, true, metrics);
    
    // Map 'product' field to the actual outerGroupField
    let tableData = transformedTableData.map(row => {
        const { product, ...rest } = row;
        return {
            ...rest,
            [outerGroupField]: product === 'Unknown' ? null : product
        };
    });

    // Apply sorting to tableData if sortConfig is provided
    if (sortConfig && sortFieldType) {
        const sortComparator = createSortComparator(
            sortConfig,
            sortFieldType.fieldType,
            sortFieldType.topLevelKey,
            sortFieldType.nestedPath
        );
        if (sortComparator && tableData.length > 0) {
            tableData.sort(sortComparator);
        }
    }

    // Generate nested table data for multi-level nesting using composite keys
    // Structure: nestedTableData['level0|level1|level2'] = [rows]
    const nestedTableData = {};
    
    if (groupFields.length > 1) {
        // Helper function to transform raw data rows to nested table format with time breakdown
        const transformRowsToNestedTable = (rawRows, currentField, nextField, parentPath = [], currentLevel = 0) => {
            // First, group by time period (rawRows are individual data rows, not grouped by time)
            const timeGroupedData = groupDataByTimePeriod(rawRows, dateColumn, breakdownType, metrics);
            
            // Then use transformToNestedTableData which expects time-grouped data
            const transformedNested = transformToNestedTableData(
                timeGroupedData,
                currentField,
                nextField,
                breakdownType,
                timePeriods,
                metrics
            );
            
            // Build a map of (currentField, nextField) -> deeper level field values from original rows
            // This preserves deeper level field values for hasNestedGroups detection
            const deeperFieldsMap = new Map();
            if (currentLevel + 2 < groupFields.length) {
                rawRows.forEach(originalRow => {
                    const currentValue = getDataValue(originalRow, currentField);
                    const nextValue = getDataValue(originalRow, nextField);
                    const mapKey = `${isNil(currentValue) ? '__null__' : String(currentValue)}|${isNil(nextValue) ? '__null__' : String(nextValue)}`;
                    
                    if (!deeperFieldsMap.has(mapKey)) {
                        deeperFieldsMap.set(mapKey, {});
                    }
                    
                    // Collect deeper level field values
                    for (let i = currentLevel + 2; i < groupFields.length; i++) {
                        const deeperField = groupFields[i];
                        const deeperValue = getDataValue(originalRow, deeperField);
                        if (!isNil(deeperValue) && deeperValue !== '') {
                            deeperFieldsMap.get(mapKey)[deeperField] = deeperValue;
                        }
                    }
                });
            }
            
            // Map 'product' and 'category' fields to actual field names and preserve parent path
            return transformedNested.map(row => {
                const { product, category, ...rest } = row;
                const currentValue = product === 'Unknown' ? null : product;
                const nextValue = category === 'Unknown' ? null : category;
                const result = {
                    ...rest,
                    [currentField]: currentValue,
                    [nextField]: nextValue
                };
                // Preserve all parent path values
                parentPath.forEach((pathValue, idx) => {
                    if (idx < groupFields.length) {
                        result[groupFields[idx]] = pathValue;
                    }
                });
                
                // Preserve deeper level field values if they exist
                const mapKey = `${isNil(currentValue) ? '__null__' : String(currentValue)}|${isNil(nextValue) ? '__null__' : String(nextValue)}`;
                if (deeperFieldsMap.has(mapKey)) {
                    Object.assign(result, deeperFieldsMap.get(mapKey));
                }
                
                return result;
            });
        };

        // Recursive function to generate nested table data for all levels
        const generateNestedDataRecursive = (data, currentLevel, pathKeys = []) => {
            if (currentLevel >= groupFields.length) {
                return; // Base case: no more levels
            }

            const currentField = groupFields[currentLevel];
            const nextField = currentLevel + 1 < groupFields.length ? groupFields[currentLevel + 1] : null;
            
            if (!nextField) {
                // Final level - no nested data needed
                return;
            }

            // Check if data is already grouped by time period (level 0) or raw rows (deeper levels)
            const isTimeGrouped = currentLevel === 0 && typeof data === 'object' && !Array.isArray(data);
            
            // Extract raw rows from time-grouped data or use data directly if it's already raw rows
            let rawRows = [];
            if (isTimeGrouped) {
                // Level 0: data is time-grouped, extract all rows from all periods
                Object.values(data).forEach(periodData => {
                    if (periodData && periodData.data && Array.isArray(periodData.data)) {
                        rawRows.push(...periodData.data);
                    }
                });
            } else {
                // Deeper levels: data is already raw rows
                rawRows = Array.isArray(data) ? data : [];
            }

            // Group raw rows by current field
            const groups = {};
            rawRows.forEach(row => {
                const groupKey = getDataValue(row, currentField);
                const key = isNil(groupKey) ? '__null__' : String(groupKey);
                if (!groups[key]) {
                    groups[key] = [];
                }
                groups[key].push(row);
            });

            // Process each group
            Object.entries(groups).forEach(([groupKey, rows]) => {
                const currentPath = [...pathKeys, groupKey === '__null__' ? null : groupKey];
                const compositeKey = currentPath.join('|');
                
                // Transform rows to nested table format with time breakdown
                const transformedNested = transformRowsToNestedTable(
                    rows,
                    currentField,
                    nextField,
                    pathKeys, // Pass parent path to preserve values
                    currentLevel // Pass current level to preserve deeper fields
                );
                
                // Store with composite key
                if (!nestedTableData[compositeKey]) {
                    nestedTableData[compositeKey] = [];
                }
                nestedTableData[compositeKey].push(...transformedNested);
                
                // Recursively process next level with raw rows (not time-grouped)
                if (currentLevel + 1 < groupFields.length) {
                    generateNestedDataRecursive(rows, currentLevel + 1, currentPath);
                }
            });
        };

        // Start recursive generation from level 0 (groupedData is time-grouped)
        generateNestedDataRecursive(groupedData, 0);

        // Apply sorting to nested table data if sortConfig is provided
        if (sortConfig && sortFieldType) {
            const sortComparator = createSortComparator(
                sortConfig,
                sortFieldType.fieldType,
                sortFieldType.topLevelKey,
                sortFieldType.nestedPath
            );
            if (sortComparator) {
                // Sort each nested table array
                Object.keys(nestedTableData).forEach(key => {
                    if (nestedTableData[key] && nestedTableData[key].length > 0) {
                        nestedTableData[key].sort(sortComparator);
                    }
                });
            }
        }
    }

    return {
        tableData,
        nestedTableData,
        timePeriods,
        metrics,
        dateRange,
        breakdownType
    };
}

// Expose API using Comlink
Comlink.expose({
    computeReportData
});
