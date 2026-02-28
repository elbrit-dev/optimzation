import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import quarterOfYear from "dayjs/plugin/quarterOfYear";

dayjs.extend(isoWeek);
dayjs.extend(quarterOfYear);

/**
 * Get time period key based on breakdown type
 */
export function getTimePeriodKey(date, breakdownType) {
    const d = dayjs(date);

    switch (breakdownType) {
        case "month":
            return d.format("YYYY-MM");
        case "week":
            // Use ISO week format: YYYY-Www (e.g., 2026-W01)
            // dayjs format 'YYYY-[W]WW' doesn't work correctly, so use isoWeek methods directly
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
 * Get display label for time period
 */
export function getTimePeriodLabel(periodKey, breakdownType) {
    switch (breakdownType) {
        case "month":
            return dayjs(periodKey + "-01").format("MMM");
        case "week":
            // periodKey format is YYYY-W01, YYYY-W02, etc.
            // Extract the week number and format as "Week 01", "Week 02", etc.
            let weekMatch = periodKey.match(/W(\d+)$/);
            if (!weekMatch) {
                weekMatch = periodKey.match(/W(\d+)/);
            }
            if (weekMatch && weekMatch[1]) {
                return `Week ${weekMatch[1]}`;
            }
            // Fallback - try to parse as ISO week format YYYY-Www
            try {
                const isoWeekMatch = periodKey.match(/(\d{4})-W(\d{1,2})/);
                if (isoWeekMatch) {
                    const weekNum = parseInt(isoWeekMatch[2], 10);
                    return `Week ${String(weekNum).padStart(2, "0")}`;
                }
            } catch (e) {
                // Ignore
            }
            return periodKey.replace(/^.*?-W/, "Week ");
        case "day":
            return dayjs(periodKey).format("MMM DD");
        case "quarter":
            return periodKey.replace("YYYY-", "");
        case "annual":
            return periodKey;
        default:
            return periodKey;
    }
}

/**
 * Get display label for time period with short year format (2-digit year)
 * Used for Period-over-Period view
 */
export function getTimePeriodLabelShort(periodKey, breakdownType) {
    switch (breakdownType) {
        case "month":
            // periodKey format: "2023-01" -> "Jan 23"
            const monthDate = dayjs(periodKey + "-01");
            const monthShort = monthDate.format("MMM");
            const monthYear = monthDate.format("YY");
            return `${monthShort} ${monthYear}`;
        case "week":
            // periodKey format: "2023-W01" -> "W1 23" (concise, no leading zero)
            const weekMatch = periodKey.match(/(\d{4})-W(\d{1,2})/);
            if (weekMatch) {
                const year = weekMatch[1];
                const weekNum = parseInt(weekMatch[2], 10); // Remove leading zero
                const yearShort = year.slice(-2);
                return `W${weekNum} ${yearShort}`;
            }
            // Fallback
            return periodKey.replace(/(\d{4})-W(\d{1,2})/, (match, year, week) => {
                return `W${parseInt(week, 10)} ${year.slice(-2)}`;
            });
        case "day":
            // periodKey format: "2023-01-01" -> "2 Jan 25" (day first, then month and year)
            const dayDate = dayjs(periodKey);
            const dayDay = dayDate.format("D"); // No leading zero
            const dayMonth = dayDate.format("MMM");
            const dayYear = dayDate.format("YY");
            return `${dayDay} ${dayMonth} ${dayYear}`;
        case "quarter":
            // periodKey format: "2023-Q1" -> "Q1 23"
            const quarterMatch = periodKey.match(/(\d{4})-Q(\d)/);
            if (quarterMatch) {
                const year = quarterMatch[1];
                const quarter = quarterMatch[2];
                const yearShort = year.slice(-2);
                return `Q${quarter} ${yearShort}`;
            }
            return periodKey.replace(/(\d{4})-Q/, "Q").replace(/(\d{4})/, (match) => match.slice(-2));
        case "annual":
            // Keep full year for annual: "2023" -> "2023"
            return periodKey;
        default:
            // Default to month format
            const defaultDate = dayjs(periodKey + "-01");
            const defaultMonth = defaultDate.format("MMM");
            const defaultYear = defaultDate.format("YY");
            return `${defaultMonth} ${defaultYear}`;
    }
}

/**
 * Get all time periods in a range (optimized with Set)
 */
export function getTimePeriods(startDate, endDate, breakdownType) {
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
 * Reorganize time periods for Period-over-Period view
 * Groups periods by month/quarter/etc (ignoring year) and sorts by year within each group
 * Example: ["2024-01", "2024-02", "2025-01", "2025-02"] -> ["2024-01", "2025-01", "2024-02", "2025-02"]
 */
export function reorganizePeriodsForPeriodOverPeriod(periods, breakdownType) {
    if (!periods || periods.length === 0) return periods;

    // For annual periods, just sort them (each year is its own period, no grouping needed)
    if (breakdownType === "annual") {
        return periods.sort((a, b) => {
            const yearA = parseInt(a);
            const yearB = parseInt(b);
            return yearA - yearB;
        });
    }

    // Group periods by their period identifier (without year)
    const periodGroups = {};
    
    periods.forEach(periodKey => {
        let groupKey;
        
        switch (breakdownType) {
            case "month":
                // Extract month from "2024-01" -> "01"
                groupKey = periodKey.split("-")[1];
                break;
            case "quarter":
                // Extract quarter from "2024-Q1" -> "Q1"
                groupKey = periodKey.split("-")[1];
                break;
            case "week":
                // Extract week from "2024-W01" -> "W01"
                groupKey = periodKey.split("-")[1];
                break;
            case "day":
                // Extract month-day from "2024-01-15" -> "01-15"
                const parts = periodKey.split("-");
                groupKey = `${parts[1]}-${parts[2]}`;
                break;
            default:
                // Default to month format
                groupKey = periodKey.split("-")[1];
        }
        
        if (!periodGroups[groupKey]) {
            periodGroups[groupKey] = [];
        }
        periodGroups[groupKey].push(periodKey);
    });
    
    // Sort each group by year (ascending)
    Object.keys(periodGroups).forEach(groupKey => {
        periodGroups[groupKey].sort((a, b) => {
            // Extract year from period key
            const yearA = parseInt(a.split("-")[0]);
            const yearB = parseInt(b.split("-")[0]);
            return yearA - yearB;
        });
    });
    
    // Sort group keys to maintain order (month: 01-12, quarter: Q1-Q4, etc.)
    const sortedGroupKeys = Object.keys(periodGroups).sort((a, b) => {
        if (breakdownType === "month") {
            return parseInt(a) - parseInt(b);
        } else if (breakdownType === "quarter") {
            return parseInt(a.replace("Q", "")) - parseInt(b.replace("Q", ""));
        } else if (breakdownType === "week") {
            return parseInt(a.replace("W", "")) - parseInt(b.replace("W", ""));
        } else if (breakdownType === "day") {
            // Sort by month first, then day
            const [monthA, dayA] = a.split("-").map(Number);
            const [monthB, dayB] = b.split("-").map(Number);
            if (monthA !== monthB) return monthA - monthB;
            return dayA - dayB;
        }
        return a.localeCompare(b);
    });
    
    // Flatten groups into final array
    const reorganized = [];
    sortedGroupKeys.forEach(groupKey => {
        reorganized.push(...periodGroups[groupKey]);
    });
    
    return reorganized;
}

/**
 * Group data by time period (optimized with Map and date caching)
 */
export function groupDataByTimePeriod(data, dateField, breakdownType, metrics = ["sales", "profits", "count"]) {
    const grouped = new Map();
    const dateCache = new Map(); // Cache parsed dates to avoid redundant parsing

    data.forEach((item) => {
        const dateValue = item[dateField];
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
            const value = item[metric];
            if (value !== undefined && value !== null) {
                if (typeof value === "number") {
                    periodData[metric] += value;
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
 * Check if a value is numeric for exempt column aggregation
 */
function isNumericValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "number" && !Number.isNaN(value)) return true;
    const n = Number(value);
    return !Number.isNaN(n) && isFinite(n);
}

/**
 * Transform grouped data into table format (optimized with Map)
 * @param {Object} groupedData - Time-grouped data
 * @param {string} productField - Field name for product/group
 * @param {string} breakdownType - Breakdown type
 * @param {boolean} includeDetails - Include details for nested table
 * @param {string[]} metrics - Metric column names for period breakdown
 * @param {string[]} exemptColumns - Column names exempt from breakdown (shown as single column, aggregated per product)
 * @param {Object} columnTypes - Column type overrides { colName: 'number'|'string'|'date'|'boolean' }
 */
export function transformToTableData(groupedData, productField, breakdownType, includeDetails = false, metrics = ['sales', 'profits', 'count'], exemptColumns = [], columnTypes = {}) {
    const products = new Map();

    Object.values(groupedData).forEach((periodData) => {
        periodData.data.forEach((item) => {
            const product = item[productField] || "Unknown";

            if (!products.has(product)) {
                products.set(product, {
                    product,
                    periods: new Map(),
                    details: includeDetails ? [] : undefined,
                    exemptValues: {},
                    exemptFirst: {},
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
                const value = item[metric];
                if (value !== undefined && value !== null) {
                    periodMetrics[metric] += value || 0;
                }
            });

            // Aggregate exempt columns: numeric = sum, non-numeric = first
            exemptColumns.forEach((col) => {
                const value = item[col];
                const isNumeric = columnTypes[col] === "number" || isNumericValue(value);
                if (isNumeric) {
                    const numVal = typeof value === "number" ? value : Number(value);
                    if (!Number.isNaN(numVal) && isFinite(numVal)) {
                        productEntry.exemptValues[col] = (productEntry.exemptValues[col] ?? 0) + numVal;
                    }
                } else if (productEntry.exemptFirst[col] === undefined && value !== null && value !== undefined && value !== "") {
                    productEntry.exemptFirst[col] = value;
                }
            });

            // Store detailed record for nested table
            if (includeDetails) {
                productEntry.details.push({
                    ...item,
                    period: periodKey,
                    periodLabel: getTimePeriodLabel(periodKey, breakdownType),
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

        // Add exempt column values
        exemptColumns.forEach((col) => {
            if (productEntry.exemptValues[col] !== undefined) {
                row[col] = productEntry.exemptValues[col];
            } else if (productEntry.exemptFirst[col] !== undefined) {
                row[col] = productEntry.exemptFirst[col];
            }
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
 * Generate mock time-series data with secondary dimension (category/region)
 */
export function generateMockTimeSeriesData(productCount = 10, daysBack = 90) {
    const products = [
        "Bamboo Watch",
        "Black Watch",
        "Blue Band",
        "Blue T-Shirt",
        "Brown Purse",
        "Chakra Bracelet",
        "Galaxy Earrings",
        "Game Controller",
        "Gaming Set",
        "Gold Phone Case",
        "Green T-Shirt",
        "Grey T-Shirt",
        "Headphones",
        "Laptop",
        "Mobile Phone",
    ];

    // Secondary dimension (e.g., category, region, channel)
    const categories = ["X", "Y", "Z"];

    const data = [];
    const startDate = dayjs().subtract(daysBack, "day");

    for (let i = 0; i < productCount; i++) {
        const product = products[i % products.length];

        // Generate data for each day
        for (let day = 0; day < daysBack; day++) {
            const date = startDate.add(day, "day");

            // Assign random category
            const category = categories[Math.floor(Math.random() * categories.length)];

            // Random sales between 10-100
            const sales = Math.floor(Math.random() * 90) + 10;
            // Random profits between 1000-10000
            const profits = Math.floor(Math.random() * 9000) + 1000;
            // Random count between 1-50
            const count = Math.floor(Math.random() * 49) + 1;

            data.push({
                product,
                category, // Secondary dimension for nested grouping
                date: date.format("YYYY-MM-DD"),
                sales,
                profits,
                count,
            });
        }
    }

    return data;
}

/**
 * Transform grouped data into nested table format (optimized with Map)
 * @param {Object} groupedData - Time-grouped data
 * @param {string} productField - Field name for product
 * @param {string} categoryField - Field name for category
 * @param {string} breakdownType - Breakdown type
 * @param {string[]} allPeriods - All time periods
 * @param {string[]} metrics - Metric column names
 * @param {string[]} exemptColumns - Column names exempt from breakdown
 * @param {Object} columnTypes - Column type overrides
 */
export function transformToNestedTableData(groupedData, productField, categoryField, breakdownType, allPeriods, metrics = ['sales', 'profits', 'count'], exemptColumns = [], columnTypes = {}) {
    const nestedData = new Map(); // product -> categories Map

    Object.values(groupedData).forEach((periodData) => {
        periodData.data.forEach((item) => {
            const product = item[productField] || "Unknown";
            const category = item[categoryField] || "Unknown";
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
                    exemptValues: {},
                    exemptFirst: {},
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
                const value = item[metric];
                if (value !== undefined && value !== null) {
                    periodMetrics[metric] += value || 0;
                }
            });

            // Aggregate exempt columns
            exemptColumns.forEach((col) => {
                const value = item[col];
                const isNumeric = columnTypes[col] === "number" || isNumericValue(value);
                if (isNumeric) {
                    const numVal = typeof value === "number" ? value : Number(value);
                    if (!Number.isNaN(numVal) && isFinite(numVal)) {
                        categoryEntry.exemptValues[col] = (categoryEntry.exemptValues[col] ?? 0) + numVal;
                    }
                } else if (categoryEntry.exemptFirst[col] === undefined && value !== null && value !== undefined && value !== "") {
                    categoryEntry.exemptFirst[col] = value;
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

            // Add exempt column values
            exemptColumns.forEach((col) => {
                if (categoryEntry.exemptValues?.[col] !== undefined) {
                    row[col] = categoryEntry.exemptValues[col];
                } else if (categoryEntry.exemptFirst?.[col] !== undefined) {
                    row[col] = categoryEntry.exemptFirst[col];
                }
            });

            result.push(row);
            categoryIndex++;
        });
        productIndex++;
    });

    return result;
}
