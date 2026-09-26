'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { toLower, includes, filter, isEmpty } from 'lodash';

export function SingleFieldSelector({ columns, selectedField, onSelectionChange, formatFieldName, placeholder, label, showTag = true }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredColumns = useMemo(() => {
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

      {/* Selected Tag - Only show if showTag prop is true */}
      {showTag && selectedField && (
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
                    className={`w-full flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-left ${isSelected
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

