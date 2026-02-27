'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from 'primereact/sidebar';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Checkbox } from 'primereact/checkbox';
import { startCase, uniq, filter as lodashFilter, toLower, isNil } from 'lodash';
import { getNestedValue, getDataValue } from '../utils/dataAccessUtils';

// Hook to detect mobile viewport
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

export default function FilterSortSidebar({
  visible,
  onHide,
  searchFields = {},
  sortFields = {},
  tableData = [],
  columnTypes = {},
  currentSortConfig = null,
  currentFilterValues = {},
  onApply,
  onClear,
}) {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [selectedSortField, setSelectedSortField] = useState(currentSortConfig?.field || null);
  const [selectedSortDirection, setSelectedSortDirection] = useState(currentSortConfig?.direction || 'asc');
  const [selectedFilterValues, setSelectedFilterValues] = useState(currentFilterValues || {});
  const [fieldSearchTerms, setFieldSearchTerms] = useState({}); // Search terms per field: { fieldKey: searchTerm }

  // Sync with props when sidebar opens
  useEffect(() => {
    if (visible) {
      // Sync sort config
      if (currentSortConfig) {
        setSelectedSortField(currentSortConfig.field);
        setSelectedSortDirection(currentSortConfig.direction);
      } else {
        setSelectedSortField(null);
        setSelectedSortDirection('asc');
      }

      // Sync filter values
      setSelectedFilterValues(currentFilterValues || {});
    }
  }, [visible]); // Only sync when sidebar opens/closes

  // Helper function to filter data by selectedFilterValues, excluding a specific field
  const filterDataExcludingField = (data, filterValues, excludeFieldKey) => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return data;
    }

    // Build filter sets for all fields except the excluded one
    const filterSets = {};
    Object.keys(filterValues).forEach(fieldKey => {
      if (fieldKey !== excludeFieldKey) {
        const values = filterValues[fieldKey];
        if (Array.isArray(values) && values.length > 0) {
          filterSets[fieldKey] = new Set(values.map(v => String(v)));
        }
      }
    });

    // If no filters to apply (excluding the current field), return all data
    if (Object.keys(filterSets).length === 0) {
      return data;
    }

    // Filter data by applying all filters except the excluded field
    return lodashFilter(data, (row) => {
      // Fast null check
      if (!row || typeof row !== 'object') return false;

      // Check all filters with early exit
      for (const fieldKey of Object.keys(filterSets)) {
        const filterSet = filterSets[fieldKey];
        if (!filterSet || filterSet.size === 0) continue;

        // Extract cell value
        const cellValue = getDataValue(row, fieldKey);

        // Convert to string for comparison
        const cellStr = isNil(cellValue) ? null : String(cellValue);

        // Check null/undefined handling
        if (cellStr === null) {
          if (!filterSet.has('null') && !filterSet.has('') && !filterSet.has('undefined')) {
            return false; // Early exit if null not in filter
          }
          continue; // Null matches, check next filter
        }

        // O(1) Set lookup
        if (!filterSet.has(cellStr)) {
          return false; // Early exit on first mismatch
        }
      }

      // All filters passed
      return true;
    });
  };

  // Extract unique values and their counts for each searchField from tableData
  // Filtered by selectedFilterValues (excluding the current field) for real-time preview
  const fieldUniqueValues = useMemo(() => {
    const values = {};
    const valueCounts = {};

    if (!tableData || !Array.isArray(tableData) || tableData.length === 0) {
      return { values, counts: valueCounts };
    }

    Object.keys(searchFields).forEach(topLevelKey => {
      const nestedPaths = searchFields[topLevelKey];
      if (!Array.isArray(nestedPaths)) return;

      nestedPaths.forEach(nestedPath => {
        const fieldKey = nestedPath || topLevelKey;
        
        // Filter data by selectedFilterValues, excluding the current field
        // This ensures we see all available values for the current field
        // while respecting filters on other fields
        const filteredData = filterDataExcludingField(tableData, selectedFilterValues, fieldKey);
        
        const allValues = filteredData
          .map(row => {
            if (!row || typeof row !== 'object') return null;
            // Use getNestedValue which handles both nested and flat structures
            const value = getNestedValue(row, topLevelKey, nestedPath);
            return value;
          })
          .filter(val => val !== null && val !== undefined && val !== '')
          .map(val => String(val));

        // Get unique values
        const uniqueVals = uniq(allValues).sort();

        // Count occurrences of each value
        const counts = {};
        allValues.forEach(val => {
          counts[val] = (counts[val] || 0) + 1;
        });

        values[fieldKey] = uniqueVals;
        valueCounts[fieldKey] = counts;
      });
    });

    return { values, counts: valueCounts };
  }, [searchFields, tableData, selectedFilterValues]);

  // Pre-compute filtered values for all fields (hooks must be called unconditionally)
  const fieldFilteredValues = useMemo(() => {
    const filtered = {};
    Object.keys(fieldUniqueValues.values).forEach(fieldKey => {
      const uniqueValues = fieldUniqueValues.values[fieldKey] || [];
      const searchTerm = fieldSearchTerms[fieldKey] || '';

      if (!searchTerm || !searchTerm.trim()) {
        filtered[fieldKey] = uniqueValues;
      } else {
        const searchLower = toLower(searchTerm.trim());
        filtered[fieldKey] = lodashFilter(uniqueValues, value =>
          toLower(String(value)).includes(searchLower)
        );
      }
    });
    return filtered;
  }, [fieldUniqueValues.values, fieldSearchTerms]);

  // Build sort field options from sortFields
  const sortFieldOptions = useMemo(() => {
    const options = [];

    Object.keys(sortFields).forEach(topLevelKey => {
      const nestedPaths = sortFields[topLevelKey];
      if (!Array.isArray(nestedPaths)) return;

      nestedPaths.forEach(nestedPath => {
        const fullPath = nestedPath ? `${topLevelKey}.${nestedPath}` : topLevelKey;
        const displayName = nestedPath
          ? startCase(nestedPath.split('__').join(' ').split('_').join(' '))
          : startCase(topLevelKey.split('__').join(' ').split('_').join(' '));

        options.push({
          label: displayName,
          value: fullPath,
        });
      });
    });

    return options;
  }, [sortFields]);

  // Initialize filter values state - only when sidebar opens or searchFields change
  useEffect(() => {
    if (visible) {
      const initialFilters = {};
      Object.keys(searchFields).forEach(topLevelKey => {
        const nestedPaths = searchFields[topLevelKey];
        if (Array.isArray(nestedPaths)) {
          nestedPaths.forEach(nestedPath => {
            const fieldKey = nestedPath || topLevelKey;
            // Only initialize if not already set
            if (!selectedFilterValues.hasOwnProperty(fieldKey)) {
              initialFilters[fieldKey] = [];
            }
          });
        }
      });

      // Only update if there are new fields to initialize
      if (Object.keys(initialFilters).length > 0) {
        setSelectedFilterValues(prev => ({ ...prev, ...initialFilters }));
      }
    }
  }, [visible, searchFields]); // Removed selectedFilterValues from dependencies

  const handleApply = () => {
    const sortConfig = selectedSortField
      ? { field: selectedSortField, direction: selectedSortDirection }
      : null;

    // Close sidebar first for immediate UI feedback
    onHide?.();

    // Then apply the changes
    onApply?.(sortConfig, selectedFilterValues);
  };

  const handleClear = () => {
    setSelectedSortField(null);
    setSelectedSortDirection('asc');
    setSelectedFilterValues({});
    onClear?.();
  };

  const hasActiveFilters = useMemo(() => {
    const hasSort = selectedSortField !== null;
    const hasFilters = Object.values(selectedFilterValues).some(
      vals => Array.isArray(vals) && vals.length > 0
    );
    return hasSort || hasFilters;
  }, [selectedSortField, selectedFilterValues]);

  // Determine if mobile (for responsive positioning)
  const isMobile = useIsMobile();

  return (
    <Sidebar
      visible={visible}
      onHide={onHide}
      position={isMobile ? 'bottom' : 'left'}
      blockScroll
      className={isMobile ? 'w-full' : ''}
      style={isMobile ? { height: '80vh' } : { width: '600px', maxWidth: '90vw' }}
      header={
        <h2 className="text-lg font-semibold text-gray-800 m-0">Filter and Sort</h2>
      }
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-hidden flex min-h-0">
          {/* Left Sidebar - Tab Navigation */}
          <div className="w-24 border-r border-gray-200 bg-gray-50 overflow-y-auto flex-shrink-0">
            <div className="p-2">
              <button
                onClick={() => setActiveTabIndex(0)}
                className={`w-full text-left px-2 py-2 rounded-md mb-1 transition-colors relative text-sm ${activeTabIndex === 0
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <span className="flex items-center justify-between">
                  <span className='text-xs'>Sort by</span>
                  {selectedSortField && (
                    <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                  )}
                </span>
              </button>

              {(() => {
                let tabCounter = 1;
                return Object.keys(searchFields).map((topLevelKey) => {
                  const nestedPaths = searchFields[topLevelKey];
                  if (!Array.isArray(nestedPaths) || nestedPaths.length === 0) return null;

                  return nestedPaths.map((nestedPath) => {
                    const fieldKey = nestedPath || topLevelKey;
                    const uniqueValues = fieldUniqueValues.values[fieldKey] || [];

                    // Only show tabs with >1 unique value
                    if (uniqueValues.length <= 1) return null;

                    const displayName = nestedPath
                      ? startCase(nestedPath.split('__').join(' ').split('_').join(' '))
                      : startCase(topLevelKey.split('__').join(' ').split('_').join(' '));
                    const currentTabIndex = tabCounter++;
                    const tabKey = `${topLevelKey}-${nestedPath}`;
                    const selectedCount = Array.isArray(selectedFilterValues[fieldKey]) 
                      ? selectedFilterValues[fieldKey].length 
                      : 0;

                    return (
                      <button
                        key={tabKey}
                        onClick={() => setActiveTabIndex(currentTabIndex)}
                        className={`w-full text-left px-2 py-2 rounded-md mb-1 transition-colors relative text-sm ${activeTabIndex === currentTabIndex
                            ? 'bg-blue-100 text-blue-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-100'
                          }`}
                      >
                        <span className="flex items-center justify-between">
                          <span className='text-xs'>{displayName}</span>
                          {selectedCount > 0 && (
                            <span className="ml-2 px-1.5 py-0.5 text-xs font-medium bg-blue-600 text-white rounded-full min-w-[1.25rem] text-center">
                              {selectedCount}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  });
                });
              })()}
            </div>
          </div>

          {/* Right Content Area - Full Height */}
          <div className="flex-1 overflow-hidden bg-white min-h-0 flex flex-col">
            {activeTabIndex === 0 && (
              <div className="pl-4 flex-1 overflow-y-auto min-h-0">
                <div className="space-y-1">
                  {sortFieldOptions.flatMap((option) => {
                    // Determine field type from columnTypes or field name
                    const fieldName = option.value.split('.').pop(); // Get last part of path
                    const fieldType = columnTypes[fieldName] || 'string';
                    const isDateField = fieldType === 'date' ||
                      option.label.toLowerCase().includes('date') ||
                      option.label.toLowerCase().includes('time');
                    const isNumericField = fieldType === 'number';

                    // Create labels based on field type
                    let ascLabel, descLabel;
                    if (isDateField) {
                      ascLabel = `${option.label} - Oldest to Latest`;
                      descLabel = `${option.label} - Latest to Oldest`;
                    } else if (isNumericField) {
                      ascLabel = `${option.label} - Low to High`;
                      descLabel = `${option.label} - High to Low`;
                    } else {
                      // String fields
                      ascLabel = `${option.label} - A to Z`;
                      descLabel = `${option.label} - Z to A`;
                    }

                    return [
                      {
                        label: ascLabel,
                        value: option.value,
                        direction: 'asc',
                        fullValue: { field: option.value, direction: 'asc' }
                      },
                      {
                        label: descLabel,
                        value: option.value,
                        direction: 'desc',
                        fullValue: { field: option.value, direction: 'desc' }
                      }
                    ];
                  }).map((sortOption, idx) => {
                    const isSelected = selectedSortField === sortOption.value &&
                      selectedSortDirection === sortOption.direction;
                    return (
                      <label
                        key={idx}
                        className="flex items-center cursor-pointer p-2 rounded hover:bg-gray-50"
                      >
                        <input
                          type="radio"
                          name="sortOption"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedSortField(sortOption.value);
                            setSelectedSortDirection(sortOption.direction);
                          }}
                          className="mr-3 w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm text-gray-700 flex-1">{sortOption.label}</span>
                      </label>
                    );
                  })}
                  {sortFieldOptions.length === 0 && (
                    <p className="text-sm text-gray-500">No sort fields available</p>
                  )}
                </div>
              </div>
            )}

            {activeTabIndex > 0 && (() => {
              // Find the corresponding field for this tab index
              let currentFieldKey = null;
              let tabCounter = 1;

              for (const topLevelKey of Object.keys(searchFields)) {
                const nestedPaths = searchFields[topLevelKey];
                if (!Array.isArray(nestedPaths)) continue;

                for (const nestedPath of nestedPaths) {
                  if (tabCounter === activeTabIndex) {
                    currentFieldKey = nestedPath || topLevelKey;
                    break;
                  }
                  tabCounter++;
                }
                if (currentFieldKey) break;
              }

              if (!currentFieldKey) return null;

              const uniqueValues = fieldUniqueValues.values[currentFieldKey] || [];
              const valueCounts = fieldUniqueValues.counts[currentFieldKey] || {};
              const selectedValues = selectedFilterValues[currentFieldKey] || [];
              const filteredValues = fieldFilteredValues[currentFieldKey] || [];
              const searchTerm = fieldSearchTerms[currentFieldKey] || '';

              const toggleValue = (value) => {
                setSelectedFilterValues(prev => {
                  const current = prev[currentFieldKey] || [];
                  const isSelected = current.includes(value);
                  return {
                    ...prev,
                    [currentFieldKey]: isSelected
                      ? current.filter(v => v !== value)
                      : [...current, value]
                  };
                });
              };

              const selectAll = () => {
                setSelectedFilterValues(prev => ({
                  ...prev,
                  [currentFieldKey]: [...filteredValues]
                }));
              };

              const clearAll = () => {
                setSelectedFilterValues(prev => ({
                  ...prev,
                  [currentFieldKey]: []
                }));
              };

              const handleSearchChange = (value) => {
                setFieldSearchTerms(prev => ({
                  ...prev,
                  [currentFieldKey]: value
                }));
              };

              return (
                <div className="pl-4 flex-1 overflow-hidden flex flex-col min-h-0">
                  {uniqueValues.length > 0 && (
                    <>
                      <div className="mb-3 flex items-center gap-2 flex-shrink-0">
                        <div className="p-inputgroup flex-1">
                          <span style={{ height: '2rem' }} className="p-inputgroup-addon">
                            <input
                              type="checkbox"
                              checked={filteredValues.length > 0 && filteredValues.every(val => selectedValues.includes(val))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  selectAll();
                                } else {
                                  clearAll();
                                }
                              }}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                          </span>
                          <InputText
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search"
                            style={{ height: '2rem' }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 ml-auto whitespace-nowrap">
                          {selectedValues.length}/{filteredValues.length}
                        </span>
                      </div>
                      <div className="space-y-1 flex-1 overflow-y-auto min-h-0">
                        {filteredValues.length > 0 ? (
                          filteredValues.map((value, idx) => {
                            const isSelected = selectedValues.includes(value);
                            const count = valueCounts[value] || 0;
                            return (
                              <label
                                key={idx}
                                className="flex items-center cursor-pointer p-2 rounded hover:bg-gray-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleValue(value)}
                                  className="mr-3 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700 flex-1">{value}</span>
                                <span className="text-xs text-gray-500 ml-2 text-right min-w-[2rem]">{count}</span>
                              </label>
                            );
                          })
                        ) : (
                          <p className="text-sm text-gray-500">No values match your search</p>
                        )}
                      </div>
                    </>
                  )}
                  {uniqueValues.length === 0 && (
                    <p className="text-sm text-gray-500">No values available</p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Footer with Apply and Clear buttons */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex gap-2">
            <Button
              label="Clear"
              icon="pi pi-times"
              onClick={handleClear}
              className="p-button-outlined flex-1"
              disabled={!hasActiveFilters}
            />
            <Button
              label="Apply"
              icon="pi pi-check"
              onClick={handleApply}
              className="flex-1"
              disabled={!hasActiveFilters}
            />
          </div>
        </div>
      </div>
    </Sidebar>
  );
}
