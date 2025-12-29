'use client';

import React from 'react';
import { chain, isEmpty, includes, filter, startCase, toLower } from 'lodash';

function SingleFieldSelector({ columns, selectedField, onSelectionChange, formatFieldName, placeholder, label }) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef(null);

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

  const filteredColumns = React.useMemo(() => {
    if (!searchTerm) return columns;
    const term = toLower(searchTerm);
    return filter(columns, col => 
      includes(toLower(col), term) || 
      includes(toLower(formatFieldName(col)), term)
    );
  }, [columns, searchTerm, formatFieldName]);

  const selectField = (field) => {
    if (selectedField === field) {
      onSelectionChange(null); // Clear if same field clicked
    } else {
      onSelectionChange(field);
    }
    setIsOpen(false);
  };

  const clearField = () => {
    onSelectionChange(null);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
      >
        <span className="flex items-center gap-2 text-gray-700">
          <i className="pi pi-sitemap text-gray-500"></i>
          {selectedField ? (
            <span>{formatFieldName(selectedField)}</span>
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
        </span>
        <i className={`pi ${isOpen ? 'pi-chevron-up' : 'pi-chevron-down'} text-gray-500 text-xs`}></i>
      </button>

      {/* Selected Tag */}
      {selectedField && (
        <div className="flex items-center gap-1.5 mt-2">
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-md">
            {formatFieldName(selectedField)}
            <button
              type="button"
              onClick={clearField}
              className="hover:text-purple-600 transition-colors"
            >
              <i className="pi pi-times text-[10px]"></i>
            </button>
          </span>
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <i className="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search fields..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <i className="pi pi-times text-xs"></i>
                </button>
              )}
            </div>
          </div>

          {/* Field List */}
          <div className="max-h-48 overflow-y-auto">
            {isEmpty(filteredColumns) ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                <i className="pi pi-search text-gray-400 mb-1"></i>
                <p>No fields match "{searchTerm}"</p>
              </div>
            ) : (
              filteredColumns.map(col => {
                const isSelected = selectedField === col;
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => selectField(col)}
                    className={`w-full flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-left ${
                      isSelected 
                        ? 'bg-purple-50 hover:bg-purple-100' 
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <i className={`pi ${isSelected ? 'pi-check-circle text-purple-600' : 'pi-circle text-gray-400'} text-xs`}></i>
                    <span className={`text-sm flex-1 ${isSelected ? 'text-purple-900 font-medium' : 'text-gray-700'}`}>
                      {formatFieldName(col)}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      {col}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
            {filteredColumns.length} of {columns.length} fields shown
          </div>
        </div>
      )}
    </div>
  );
}

function FieldPicker({ columns, selectedFields, onSelectionChange, formatFieldName }) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef(null);

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

  const filteredColumns = React.useMemo(() => {
    if (!searchTerm) return columns;
    const term = toLower(searchTerm);
    return filter(columns, col => 
      includes(toLower(col), term) || 
      includes(toLower(formatFieldName(col)), term)
    );
  }, [columns, searchTerm, formatFieldName]);

  const toggleField = (field) => {
    if (includes(selectedFields, field)) {
      onSelectionChange(filter(selectedFields, f => f !== field));
    } else {
      onSelectionChange([...selectedFields, field]);
    }
  };

  const selectAll = () => {
    onSelectionChange([...columns]);
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
      >
        <span className="flex items-center gap-2 text-gray-700">
          <i className="pi pi-list text-gray-500"></i>
          {isEmpty(selectedFields) ? (
            <span className="text-gray-500">Select fields for multiselect filter...</span>
          ) : (
            <span>{selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''} selected</span>
          )}
        </span>
        <i className={`pi ${isOpen ? 'pi-chevron-up' : 'pi-chevron-down'} text-gray-500 text-xs`}></i>
      </button>

      {/* Selected Tags */}
      {!isEmpty(selectedFields) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedFields.map(field => (
            <span
              key={field}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-md"
            >
              {formatFieldName(field)}
              <button
                type="button"
                onClick={() => toggleField(field)}
                className="hover:text-blue-600 transition-colors"
              >
                <i className="pi pi-times text-[10px]"></i>
              </button>
            </span>
          ))}
          {selectedFields.length > 1 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-gray-500 hover:text-red-600 transition-colors px-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <i className="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search fields..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <i className="pi pi-times text-xs"></i>
                </button>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="px-2 py-1.5 border-b border-gray-100 flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              Select all
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-gray-500 hover:text-red-600 transition-colors"
            >
              Clear all
            </button>
          </div>

          {/* Field List */}
          <div className="max-h-48 overflow-y-auto">
            {isEmpty(filteredColumns) ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                <i className="pi pi-search text-gray-400 mb-1"></i>
                <p>No fields match "{searchTerm}"</p>
              </div>
            ) : (
              filteredColumns.map(col => {
                const isSelected = includes(selectedFields, col);
                return (
                  <label
                    key={col}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-blue-50 hover:bg-blue-100' 
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleField(col)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className={`text-sm ${isSelected ? 'text-blue-900 font-medium' : 'text-gray-700'}`}>
                      {formatFieldName(col)}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto font-mono">
                      {col}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
            {filteredColumns.length} of {columns.length} fields shown
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataTableControls({
  enableSort,
  enableFilter,
  enableSummation,
  enableCellEdit = false,
  rowsPerPageOptions,
  defaultRows,
  columns = [],
  textFilterColumns = [], // Fields that should use text search box instead of multiselect
  visibleColumns = [], // Fields that should be visible (empty means show all)
  redFields = [],
  greenFields = [],
  outerGroupField = null,
  innerGroupField = null,
  nonEditableColumns = [], // Fields that should not be editable
  enableTargetData = false,
  targetColumns = [], // Fields from target data
  targetOuterGroupField = null,
  targetInnerGroupField = null,
  targetValueField = null, // Field in target data containing target value
  actualValueField = null, // Field in data containing actual value to compare
  onSortChange,
  onFilterChange,
  onSummationChange,
  onCellEditChange,
  onRowsPerPageOptionsChange,
  onDefaultRowsChange,
  onTextFilterColumnsChange,
  onVisibleColumnsChange,
  onRedFieldsChange,
  onGreenFieldsChange,
  onOuterGroupFieldChange,
  onInnerGroupFieldChange,
  onNonEditableColumnsChange,
  onEnableTargetDataChange,
  onTargetOuterGroupFieldChange,
  onTargetInnerGroupFieldChange,
  onTargetValueFieldChange,
  onActualValueFieldChange,
}) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [customOptions, setCustomOptions] = React.useState(
    Array.isArray(rowsPerPageOptions) ? rowsPerPageOptions.join(', ') : ''
  );
  const isInternalUpdateRef = React.useRef(false);

  React.useEffect(() => {
    // Only sync from props if the change came from outside (not from our handleOptionsChange)
    // This prevents the input from being reset while the user is typing
    if (!isInternalUpdateRef.current && Array.isArray(rowsPerPageOptions)) {
      const propsValue = rowsPerPageOptions.join(', ');
      // Only update if the props value is different from current input
      // This allows users to type freely without interruption
      if (propsValue !== customOptions) {
        setCustomOptions(propsValue);
      }
    }
    // Reset the flag after checking
    isInternalUpdateRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsPerPageOptions]);

  const handleOptionsChange = (value) => {
    setCustomOptions(value);
    
    // Mark that this is an internal update to prevent useEffect from resetting the input
    isInternalUpdateRef.current = true;
    
    // Parse the comma-separated values
    // Split by comma, trim each value, and parse to integer
    const rawValues = value.split(',').map(v => v.trim());
    
    // Track seen values to identify duplicates
    const seen = new Set();
    const validOptions = [];
    
    rawValues.forEach(v => {
      const parsed = parseInt(v, 10);
      // Only process valid values (not NaN, > 0)
      if (!isNaN(parsed) && parsed > 0) {
        // If it's a duplicate, ignore it (don't add to validOptions)
        // This allows users to type "10, 10" freely without interference
        if (!seen.has(parsed)) {
          seen.add(parsed);
          validOptions.push(parsed);
        }
        // Duplicates are silently ignored - they don't affect the options
      }
      // Invalid values are also ignored
    });
    
    // Sort the unique valid options
    const options = validOptions.sort((a, b) => a - b);
    
    // Update options with only valid, unique values
    // Invalid values and duplicates are ignored, allowing free typing
    if (options.length > 0) {
      onRowsPerPageOptionsChange(options);
      
      // If current defaultRows is not in the new options, update it to the first option
      if (defaultRows && !options.includes(defaultRows) && onDefaultRowsChange) {
        const newDefault = options[0];
        if (typeof newDefault === 'number' && !isNaN(newDefault) && newDefault > 0) {
          onDefaultRowsChange(newDefault);
        }
      }
    }
  };

  const formatFieldName = React.useCallback((key) => {
    return startCase(key.split('__').join(' ').split('_').join(' '));
  }, []);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Table Controls</h3>
          <p className="text-xs text-gray-600 mt-0.5">Configure table features and settings</p>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-2 rounded-md hover:bg-gray-200 transition-colors"
          aria-label={isExpanded ? 'Collapse controls' : 'Expand controls'}
        >
          <i className={`pi ${isExpanded ? 'pi-chevron-up' : 'pi-chevron-down'} text-gray-600`}></i>
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-4 pt-4 border-t border-gray-200">
          <div>
            <h4 className="text-xs font-medium text-gray-700 mb-3">Features</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${enableSort
                ? 'bg-blue-50 border-blue-200 hover:border-blue-300'
                : 'bg-white border-gray-200 hover:border-gray-300'
                }`}>
                <div className="flex items-center gap-2">
                  <i className={`pi pi-sort ${enableSort ? 'text-blue-600' : 'text-gray-600'}`}></i>
                  <span className={`text-sm font-medium ${enableSort ? 'text-blue-900' : 'text-gray-700'}`}>
                    Sorting
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={enableSort}
                    onChange={(e) => onSortChange(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={`w-11 h-6 rounded-full transition-colors duration-200 ${enableSort ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${enableSort ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      style={{ marginTop: '2px' }}
                    ></div>
                  </div>
                </div>
              </label>

              <label className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${enableFilter
                ? 'bg-blue-50 border-blue-200 hover:border-blue-300'
                : 'bg-white border-gray-200 hover:border-gray-300'
                }`}>
                <div className="flex items-center gap-2">
                  <i className={`pi pi-filter ${enableFilter ? 'text-blue-600' : 'text-gray-600'}`}></i>
                  <span className={`text-sm font-medium ${enableFilter ? 'text-blue-900' : 'text-gray-700'}`}>
                    Filtering
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={enableFilter}
                    onChange={(e) => onFilterChange(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={`w-11 h-6 rounded-full transition-colors duration-200 ${enableFilter ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${enableFilter ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      style={{ marginTop: '2px' }}
                    ></div>
                  </div>
                </div>
              </label>

              <label className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${enableSummation
                ? 'bg-blue-50 border-blue-200 hover:border-blue-300'
                : 'bg-white border-gray-200 hover:border-gray-300'
                }`}>
                <div className="flex items-center gap-2">
                  <i className={`pi pi-calculator ${enableSummation ? 'text-blue-600' : 'text-gray-600'}`}></i>
                  <span className={`text-sm font-medium ${enableSummation ? 'text-blue-900' : 'text-gray-700'}`}>
                    Summation
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={enableSummation}
                    onChange={(e) => onSummationChange(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={`w-11 h-6 rounded-full transition-colors duration-200 ${enableSummation ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${enableSummation ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      style={{ marginTop: '2px' }}
                    ></div>
                  </div>
                </div>
              </label>

              {onCellEditChange && (
                <label className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${enableCellEdit
                  ? 'bg-blue-50 border-blue-200 hover:border-blue-300'
                  : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}>
                  <div className="flex items-center gap-2">
                    <i className={`pi pi-pencil ${enableCellEdit ? 'text-blue-600' : 'text-gray-600'}`}></i>
                    <span className={`text-sm font-medium ${enableCellEdit ? 'text-blue-900' : 'text-gray-700'}`}>
                      Cell Editing
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={enableCellEdit}
                      onChange={(e) => onCellEditChange(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={`w-11 h-6 rounded-full transition-colors duration-200 ${enableCellEdit ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                    >
                      <div
                        className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${enableCellEdit ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        style={{ marginTop: '2px' }}
                      ></div>
                    </div>
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Text Search Fields */}
          {enableFilter && !isEmpty(columns) && (
            <div>
              <h4 className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-2">
                <i className="pi pi-search text-gray-500"></i>
                Text Search Fields
              </h4>
              <p className="text-xs text-gray-500 mb-3">
                Select fields that should use a text search box instead of multiselect dropdown. By default, all string fields use multiselect filters.
              </p>
              <FieldPicker
                columns={columns}
                selectedFields={textFilterColumns}
                onSelectionChange={onTextFilterColumnsChange}
                formatFieldName={formatFieldName}
              />
            </div>
          )}

          {/* Visible Columns */}
          {!isEmpty(columns) && (
            <div>
              <h4 className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-2">
                <i className="pi pi-eye text-gray-500"></i>
                Visible Columns
              </h4>
              <p className="text-xs text-gray-500 mb-3">
                Select fields that should be visible in the table. Leave empty to show all columns. Note: When Inner Group is selected, this is overridden and only numeric columns are shown.
              </p>
              <FieldPicker
                columns={columns}
                selectedFields={visibleColumns}
                onSelectionChange={onVisibleColumnsChange}
                formatFieldName={formatFieldName}
              />
            </div>
          )}

          {/* Grouping */}
          {!isEmpty(columns) && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-2">
                <i className="pi pi-sitemap text-gray-500"></i>
                Grouping
              </h4>
              <p className="text-xs text-gray-500 mb-3">
                Outer Group creates expandable headers. Inner Group aggregates data within each outer group. When Inner Group is selected, data will be aggregated and shown as single line items.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Outer Group (Expandable Header)
                  </label>
                  <SingleFieldSelector
                    columns={columns}
                    selectedField={outerGroupField}
                    onSelectionChange={onOuterGroupFieldChange}
                    formatFieldName={formatFieldName}
                    placeholder="Select outer group field..."
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Inner Group (Aggregation Anchor)
                  </label>
                  <SingleFieldSelector
                    columns={columns}
                    selectedField={innerGroupField}
                    onSelectionChange={onInnerGroupFieldChange}
                    formatFieldName={formatFieldName}
                    placeholder="Select inner group field..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Target Data Configuration */}
          {outerGroupField && innerGroupField && !isEmpty(targetColumns) && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-2">
                <i className="pi pi-bullseye text-gray-500"></i>
                Target Data
              </h4>
              <p className="text-xs text-gray-500 mb-3">
                Enable target data to compare actual values with targets and compute percentages. Only available when both Outer Group and Inner Group are configured.
              </p>
              
              <div className="space-y-3">
                <label className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${enableTargetData
                  ? 'bg-blue-50 border-blue-200 hover:border-blue-300'
                  : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}>
                  <div className="flex items-center gap-2">
                    <i className={`pi pi-bullseye ${enableTargetData ? 'text-blue-600' : 'text-gray-600'}`}></i>
                    <span className={`text-sm font-medium ${enableTargetData ? 'text-blue-900' : 'text-gray-700'}`}>
                      Enable Target Data
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={enableTargetData}
                      onChange={(e) => onEnableTargetDataChange && onEnableTargetDataChange(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={`w-11 h-6 rounded-full transition-colors duration-200 ${enableTargetData ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                    >
                      <div
                        className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${enableTargetData ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        style={{ marginTop: '2px' }}
                      ></div>
                    </div>
                  </div>
                </label>

                {enableTargetData && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-gray-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">
                        Target Outer Group Field
                      </label>
                      <p className="text-xs text-gray-500 mb-1">(from Target Data)</p>
                      <SingleFieldSelector
                        columns={targetColumns}
                        selectedField={targetOuterGroupField}
                        onSelectionChange={onTargetOuterGroupFieldChange}
                        formatFieldName={formatFieldName}
                        placeholder="Map to Outer Group..."
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">
                        Target Inner Group Field
                      </label>
                      <p className="text-xs text-gray-500 mb-1">(from Target Data)</p>
                      <SingleFieldSelector
                        columns={targetColumns}
                        selectedField={targetInnerGroupField}
                        onSelectionChange={onTargetInnerGroupFieldChange}
                        formatFieldName={formatFieldName}
                        placeholder="Map to Inner Group..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">
                        Target Value Field
                      </label>
                      <p className="text-xs text-gray-500 mb-1">(from Target Data)</p>
                      <SingleFieldSelector
                        columns={targetColumns}
                        selectedField={targetValueField}
                        onSelectionChange={onTargetValueFieldChange}
                        formatFieldName={formatFieldName}
                        placeholder="Select target value field..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">
                        Actual Value Field
                      </label>
                      <p className="text-xs text-gray-500 mb-1">(from Data)</p>
                      <SingleFieldSelector
                        columns={columns}
                        selectedField={actualValueField}
                        onSelectionChange={onActualValueFieldChange}
                        formatFieldName={formatFieldName}
                        placeholder="Select actual value field..."
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Non-Editable Columns */}
          {enableCellEdit && !isEmpty(columns) && onNonEditableColumnsChange && (
            <div>
              <h4 className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-2">
                <i className="pi pi-lock text-gray-500"></i>
                Non-Editable Columns
              </h4>
              <p className="text-xs text-gray-500 mb-3">
                Select fields that should not be editable. Note: Editing is automatically disabled when Outer Group or Inner Group is active.
              </p>
              <FieldPicker
                columns={columns}
                selectedFields={nonEditableColumns}
                onSelectionChange={onNonEditableColumnsChange}
                formatFieldName={formatFieldName}
              />
            </div>
          )}

          {/* Summation Color Fields */}
          {enableSummation && !isEmpty(columns) && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-2">
                <i className="pi pi-palette text-gray-500"></i>
                Summation Colors
              </h4>
              <p className="text-xs text-gray-500 mb-3">
                Select fields that should display summation totals in red or green color.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-red-700 mb-1.5">
                    Red Fields
                  </label>
                  <FieldPicker
                    columns={columns}
                    selectedFields={redFields}
                    onSelectionChange={onRedFieldsChange}
                    formatFieldName={formatFieldName}
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-green-700 mb-1.5">
                    Green Fields
                  </label>
                  <FieldPicker
                    columns={columns}
                    selectedFields={greenFields}
                    onSelectionChange={onGreenFieldsChange}
                    formatFieldName={formatFieldName}
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-medium text-gray-700 mb-3">Pagination</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Available Options (comma-separated)
                </label>
                <input
                  type="text"
                  value={customOptions}
                  onChange={(e) => handleOptionsChange(e.target.value)}
                  placeholder="5, 10, 25, 50, 100"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter numbers separated by commas. These options will be available in the paginator dropdown.
                </p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Default Rows Per Page
                </label>
                <select
                  key={`default-rows-${rowsPerPageOptions?.join('-') || ''}`}
                  value={defaultRows || ''}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!isNaN(value) && value > 0 && onDefaultRowsChange) {
                      onDefaultRowsChange(value);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select default...</option>
                  {rowsPerPageOptions && Array.isArray(rowsPerPageOptions) && rowsPerPageOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select the default number of rows to display per page. This value will be saved and used on page load.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
