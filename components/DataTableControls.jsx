'use client';

import React from 'react';
import { chain, isEmpty, includes, filter, startCase, toLower } from 'lodash';
import { createPortal } from 'react-dom';

function SingleSelectField({ columns, selectedField, onSelectionChange, formatFieldName, placeholder = "Select field..." }) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef(null);
  const dropdownRef = React.useRef(null);
  const [dropdownPosition, setDropdownPosition] = React.useState({ top: 0, left: 0, width: 0 });

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update dropdown position when opening
  React.useEffect(() => {
    if (isOpen && containerRef.current) {
      const updatePosition = () => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setDropdownPosition({
            top: rect.bottom + 4, // Use getBoundingClientRect directly for fixed positioning
            left: rect.left,
            width: rect.width,
          });
        }
      };

      updatePosition();
      // Update on scroll/resize
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen]);

  const filteredColumns = React.useMemo(() => {
    if (!searchTerm) return columns;
    const term = toLower(searchTerm);
    return filter(columns, col =>
      includes(toLower(col), term) ||
      includes(toLower(formatFieldName(col)), term)
    );
  }, [columns, searchTerm, formatFieldName]);

  const selectField = (field) => {
    onSelectionChange(field === selectedField ? null : field);
    setIsOpen(false);
    setSearchTerm('');
  };

  const clearSelection = () => {
    onSelectionChange(null);
    setIsOpen(false);
    setSearchTerm('');
  };

  const selectedFieldName = selectedField ? formatFieldName(selectedField) : null;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${selectedField ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-700'
          }`}
      >
        <span className="flex items-center gap-2 truncate">
          <i className="pi pi-sitemap text-gray-500"></i>
          {selectedFieldName || <span className="text-gray-500">{placeholder}</span>}
        </span>
        <i className={`pi ${isOpen ? 'pi-chevron-up' : 'pi-chevron-down'} text-gray-500 text-xs flex-shrink-0`}></i>
      </button>

      {/* Dropdown - using portal for proper positioning */}
      {isOpen && typeof window !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxHeight: '300px',
            zIndex: 99999,
          }}
        >
          {/* Search Input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <i className="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search fields..."
                className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSearchTerm(''); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <i className="pi pi-times text-xs"></i>
                </button>
              )}
            </div>
          </div>

          {/* Clear Selection */}
          {selectedField && (
            <div className="px-2 py-1.5 border-b border-gray-100">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); clearSelection(); }}
                className="text-xs text-red-600 hover:text-red-800 transition-colors w-full text-left"
              >
                <i className="pi pi-times mr-1"></i>
                Clear Selection
              </button>
            </div>
          )}

          {/* Field List */}
          <div className="max-h-48 overflow-y-auto">
            {isEmpty(filteredColumns) ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                <i className="pi pi-search text-gray-400 mb-1"></i>
                <p>No fields match "{searchTerm}"</p>
              </div>
            ) : (
              filteredColumns.map(col => {
                const isSelected = col === selectedField;
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); selectField(col); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors text-left ${isSelected
                        ? 'bg-blue-50 hover:bg-blue-100 text-blue-900 font-medium'
                        : 'hover:bg-gray-50 text-gray-700'
                      }`}
                  >
                    {isSelected && <i className="pi pi-check text-blue-600 text-xs"></i>}
                    <span className="flex-1">{formatFieldName(col)}</span>
                    <span className="text-xs text-gray-400 font-mono">{col}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
            {filteredColumns.length} of {columns.length} fields shown
          </div>
        </div>,
        document.body
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
        <div className="absolute w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden" style={{ zIndex: 99999 }}>
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
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${isSelected
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
  rowsPerPageOptions,
  columns = [],
  textFilterColumns = [], // Fields that should use text search box instead of multiselect
  redFields = [],
  greenFields = [],
  groupByField = null,
  innerGroupByField = null,
  enableInnerGroupFooter = true,
  onSortChange,
  onFilterChange,
  onSummationChange,
  onRowsPerPageOptionsChange,
  onTextFilterColumnsChange,
  onRedFieldsChange,
  onGreenFieldsChange,
  onGroupByFieldChange,
  onInnerGroupByFieldChange,
  onInnerGroupFooterChange,
}) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [customOptions, setCustomOptions] = React.useState(rowsPerPageOptions.join(', '));

  React.useEffect(() => {
    setCustomOptions(rowsPerPageOptions.join(', '));
  }, [rowsPerPageOptions]);

  const handleOptionsChange = (value) => {
    setCustomOptions(value);

    const options = chain(value)
      .split(',')
      .map(v => parseInt(v.trim(), 10))
      .filter(v => !isNaN(v) && v > 0)
      .uniq()
      .sortBy()
      .value();

    if (!isEmpty(options)) {
      onRowsPerPageOptionsChange(options);
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            </div>
          </div>

          {/* Grouping */}
          {!isEmpty(columns) && (
            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <i className="pi pi-sitemap text-gray-500"></i>
                  Grouping
                </h4>
                <p className="text-xs text-gray-500 mb-3">
                  Select a field to group rows by. Rows will be organized into expandable groups based on the selected field value. The selected field will become the first frozen column.
                </p>
                <SingleSelectField
                  columns={columns}
                  selectedField={groupByField}
                  onSelectionChange={onGroupByFieldChange}
                  formatFieldName={formatFieldName}
                  placeholder="No Grouping - Select field to group by..."
                />
              </div>

              {groupByField && (
                <div>
                  <h4 className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <i className="pi pi-indent text-gray-500"></i>
                    Inner Grouping
                  </h4>
                  <p className="text-xs text-gray-500 mb-3">
                    Select a field to group inner items by. This field will become the second frozen column, and inner grouped items will be indented.
                  </p>
                  <SingleSelectField
                    columns={columns.filter(col => col !== groupByField)}
                    selectedField={innerGroupByField}
                    onSelectionChange={onInnerGroupByFieldChange}
                    formatFieldName={formatFieldName}
                    placeholder="No Inner Grouping - Select field for inner grouping..."
                  />

                  {innerGroupByField && (
                    <div className="mt-3">
                      <label className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${enableInnerGroupFooter
                        ? 'bg-blue-50 border-blue-200 hover:border-blue-300'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}>
                        <div className="flex items-center gap-2">
                          <i className={`pi pi-list ${enableInnerGroupFooter ? 'text-blue-600' : 'text-gray-600'}`}></i>
                          <span className={`text-sm font-medium ${enableInnerGroupFooter ? 'text-blue-900' : 'text-gray-700'}`}>
                            Inner Group Footer
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={enableInnerGroupFooter}
                            onChange={(e) => onInnerGroupFooterChange && onInnerGroupFooterChange(e.target.checked)}
                            className="sr-only"
                          />
                          <div
                            className={`w-11 h-6 rounded-full transition-colors duration-200 ${enableInnerGroupFooter ? 'bg-blue-600' : 'bg-gray-300'
                              }`}
                          >
                            <div
                              className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${enableInnerGroupFooter ? 'translate-x-5' : 'translate-x-0.5'
                                }`}
                              style={{ marginTop: '2px' }}
                            ></div>
                          </div>
                        </div>
                      </label>
                      <p className="text-xs text-gray-500 mt-1.5">
                        When enabled, shows a footer row with aggregated totals after inner groups. When disabled, the footer row is removed.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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
          </div>
        </div>
      )}
    </div>
  );
}
