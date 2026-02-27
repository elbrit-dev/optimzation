import React from "react";

/**
 * Get keys from either Object or Map
 * @param {Object|Map} data - Data structure (Object or Map)
 * @returns {Array<string>} Array of keys
 */
function getDataKeys(data) {
    if (!data) {
        return [];
    }
    let result;
    if (data instanceof Map) {
        result = Array.from(data.keys());
    } else {
        result = Object.keys(data);
    }
    return result;
}

/**
 * Get value from either Object or Map
 * @param {Object|Map} data - Data structure (Object or Map)
 * @param {string} key - Key to retrieve
 * @returns {*} Value associated with the key, or undefined if not found
 */
function getDataValue(data, key) {
    if (!data || !key) return undefined;
    if (data instanceof Map) {
        return data.get(key);
    }
    return data[key];
}

/**
 * Merge all objects in an array to create a complete structure with all keys
 * This ensures we capture all fields even if some items omit certain fields
 * @param {Array} array - Array of objects to merge
 * @returns {Object} Merged object containing all keys from all items
 */
function mergeArrayObjects(array) {
    if (!Array.isArray(array) || array.length === 0) {
        return {};
    }

    // Check if all items are objects
    const objectItems = array.filter((item) => item && typeof item === "object" && !Array.isArray(item));
    if (objectItems.length === 0) {
        return {};
    }

    // Collect all unique keys
    const allKeysSet = new Set();
    objectItems.forEach((item) => {
        Object.keys(item).forEach((key) => allKeysSet.add(key));
    });

    const merged = {};
    const allKeys = Array.from(allKeysSet);

    // For each key, collect the first non-null value or merge nested objects/arrays
    allKeys.forEach((key) => {
        // Find first non-null value to determine type
        let sampleValue = null;
        for (const item of objectItems) {
            if (item[key] !== null && item[key] !== undefined) {
                sampleValue = item[key];
                break;
            }
        }

        if (sampleValue === null || sampleValue === undefined) {
            // All values are null/undefined - use null as placeholder
            merged[key] = null;
        } else if (typeof sampleValue === "object" && !Array.isArray(sampleValue)) {
            // Nested object - merge all nested objects for this key
            const nestedObjects = objectItems
                .map((item) => item[key])
                .filter((val) => val && typeof val === "object" && !Array.isArray(val));
            if (nestedObjects.length > 0) {
                merged[key] = mergeArrayObjects(nestedObjects);
            } else {
                merged[key] = sampleValue;
            }
        } else if (Array.isArray(sampleValue)) {
            // Array - if it contains objects, merge them
            if (
                sampleValue.length > 0 &&
                sampleValue[0] &&
                typeof sampleValue[0] === "object" &&
                !Array.isArray(sampleValue[0])
            ) {
                // Array of objects - merge all first objects from all arrays
                const arrayOfObjects = objectItems
                    .map((item) => item[key])
                    .filter((val) => Array.isArray(val) && val.length > 0 && val[0] && typeof val[0] === "object");
                if (arrayOfObjects.length > 0) {
                    const firstObjects = arrayOfObjects.map((arr) => arr[0]).filter(Boolean);
                    merged[key] = [mergeArrayObjects(firstObjects)];
                } else {
                    merged[key] = sampleValue;
                }
            } else {
                merged[key] = sampleValue;
            }
        } else {
            // Primitive value - use sample
            merged[key] = sampleValue;
        }
    });

    return merged;
}

/**
 * Builds tree nodes from processedData by traversing nested object structure
 * @param {Object|Map} processedData - The transformed data from transformer
 * @param {string} parentPath - Parent path for nested keys (e.g., "postingDetails.customer")
 * @returns {Array} Array of tree node objects compatible with PrimeReact Tree
 */
export function buildTreeFromProcessedData(processedData, parentPath = "") {
    if (!processedData) {
        return [];
    }

    try {
        const treeNodes = [];

        // Get all top-level keys
        const topLevelKeys = getDataKeys(processedData);

        for (const topLevelKey of topLevelKeys) {
            const value = getDataValue(processedData, topLevelKey);

            // Only process arrays (as per processedData structure)
            if (!Array.isArray(value) || value.length === 0) {
                continue;
            }

            // Check if array contains objects
            const firstItem = value[0];
            if (!firstItem || typeof firstItem !== "object") {
                // Primitive value in array - create leaf node
                const currentPath = parentPath ? `${parentPath}.${topLevelKey}` : topLevelKey;
                treeNodes.push({
                    key: currentPath,
                    label: React.createElement("span", { className: "font-medium" }, topLevelKey),
                    data: {
                        name: topLevelKey,
                        path: currentPath,
                    },
                    leaf: true,
                });
                continue;
            }

            // Merge all items in array to get complete structure with all keys
            // This ensures we capture all fields even if some items omit certain fields
            const mergedStructure = mergeArrayObjects(value);

            // Recursively build tree from merged structure (includes all keys from all items)
            const currentPath = parentPath ? `${parentPath}.${topLevelKey}` : topLevelKey;
            const children = buildTreeNodesFromObject(mergedStructure, currentPath);

            treeNodes.push({
                key: currentPath,
                label: React.createElement("span", { className: "font-medium" }, topLevelKey),
                data: {
                    name: topLevelKey,
                    path: currentPath,
                },
                children: children && children.length > 0 ? children : null,
                leaf: !children || children.length === 0,
            });
        }

        return treeNodes;
    } catch (error) {
        console.error("Error building tree from processedData:", error);
        return [];
    }
}

/**
 * Recursively build tree nodes from an object structure
 * @param {Object} obj - The object to traverse
 * @param {string} parentPath - Parent path for nested keys
 * @returns {Array} Array of tree node objects
 */
function buildTreeNodesFromObject(obj, parentPath = "") {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        return [];
    }

    const nodes = [];
    const keys = Object.keys(obj);

    for (const key of keys) {
        const value = obj[key];
        const currentPath = parentPath ? `${parentPath}.${key}` : key;

        // Check if value is a primitive
        if (value === null || value === undefined) {
            nodes.push({
                key: currentPath,
                label: React.createElement("span", { className: "font-medium" }, key),
                data: {
                    name: key,
                    path: currentPath,
                },
                leaf: true,
            });
        } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            // Primitive value - leaf node
            nodes.push({
                key: currentPath,
                label: React.createElement("span", { className: "font-medium" }, key),
                data: {
                    name: key,
                    path: currentPath,
                },
                leaf: true,
            });
        } else if (Array.isArray(value)) {
            // Array - if empty or contains primitives, it's a leaf
            // If contains objects, recurse into first item
            if (value.length === 0) {
                nodes.push({
                    key: currentPath,
                    label: React.createElement("span", { className: "font-medium" }, key),
                    data: {
                        name: key,
                        path: currentPath,
                    },
                    leaf: true,
                });
            } else if (value[0] && typeof value[0] === "object" && !Array.isArray(value[0])) {
                // Array of objects - merge all objects to get complete structure with all keys
                const mergedStructure = mergeArrayObjects(value);
                const children = buildTreeNodesFromObject(mergedStructure, currentPath);
                nodes.push({
                    key: currentPath,
                    label: React.createElement("span", { className: "font-medium" }, key),
                    data: {
                        name: key,
                        path: currentPath,
                    },
                    children: children && children.length > 0 ? children : null,
                    leaf: !children || children.length === 0,
                });
            } else {
                // Array of primitives - leaf node
                nodes.push({
                    key: currentPath,
                    label: React.createElement("span", { className: "font-medium" }, key),
                    data: {
                        name: key,
                        path: currentPath,
                    },
                    leaf: true,
                });
            }
        } else if (typeof value === "object") {
            // Nested object - recurse
            const children = buildTreeNodesFromObject(value, currentPath);
            nodes.push({
                key: currentPath,
                label: React.createElement("span", { className: "font-medium" }, key),
                data: {
                    name: key,
                    path: currentPath,
                },
                children: children && children.length > 0 ? children : null,
                leaf: !children || children.length === 0,
            });
        }
    }

    return nodes;
}
