import dayjs from 'dayjs';

/**
 * Check if a string is in YYYY-MM format
 * @param {string} str - String to check
 * @returns {boolean} True if string matches YYYY-MM format
 */
export function isYearMonthFormat(str) {
    if (typeof str !== 'string' || str.length !== 7) {
        return false;
    }
    
    // Use dayjs to validate the format
    const parsed = dayjs(str, 'YYYY-MM', true);
    return parsed.isValid();
}

/**
 * Check if a string starts with YYYY-MM_ prefix
 * @param {string} str - String to check
 * @returns {boolean} True if string starts with YYYY-MM_ prefix
 */
export function hasYearMonthPrefix(str) {
    if (typeof str !== 'string' || str.length < 8) {
        return false;
    }
    
    // Extract the first 7 characters and check if it's a valid YYYY-MM format
    const prefix = str.substring(0, 7);
    const hasUnderscore = str.length > 7 && str[7] === '_';
    
    return hasUnderscore && isYearMonthFormat(prefix);
}

/**
 * Extract YYYY-MM from a date value (string, Date, or dayjs object)
 * @param {string|Date|dayjs.Dayjs} dateValue - Date value to extract year-month from
 * @returns {string|null} YYYY-MM string or null if invalid
 */
export function extractYearMonthFromDate(dateValue) {
    if (!dateValue) {
        return null;
    }
    
    try {
        const date = dayjs(dateValue);
        if (!date.isValid()) {
            return null;
        }
        
        return date.format('YYYY-MM');
    } catch (error) {
        return null;
    }
}

/**
 * Format a date to YYYY-MM string
 * @param {Date|dayjs.Dayjs|string} date - Date to format
 * @returns {string|null} YYYY-MM formatted string or null if invalid
 */
export function formatYearMonth(date) {
    if (!date) {
        return null;
    }
    
    try {
        const formatted = dayjs(date).format('YYYY-MM');
        return dayjs(formatted, 'YYYY-MM', true).isValid() ? formatted : null;
    } catch (error) {
        return null;
    }
}

