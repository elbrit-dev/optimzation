'use client';

import React, { useState } from 'react';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Chip } from 'primereact/chip';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { isEmpty, includes, filter, startCase, toLower, isArray } from 'lodash';

function SingleFieldSelector({ columns, selectedField, onSelectionChange, formatFieldName, placeholder, label }) {
  const containerRef = React.useRef(null);
  const dropdownRef = React.useRef(null);

  // Convert columns to objects with value, label, and searchText for filtering
  const columnOptions = React.useMemo(() => {
    return columns.map(col => ({
      value: col,
      label: formatFieldName(col),
      searchText: `${col} ${formatFieldName(col)}`.toLowerCase() // Combined search text
    }));
  }, [columns, formatFieldName]);

  // With optionValue, we can pass the string value directly
  // PrimeReact will find the matching option object internally

  // Value template - what shows in the dropdown button
  const valueTemplate = (option, props) => {
    if (option) {
      return (
        <div className="flex items-center gap-2">
          <i className="pi pi-sitemap text-gray-500"></i>
          <span>{option.label}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <i className="pi pi-sitemap text-gray-500"></i>
        <span className="text-gray-500">{placeholder}</span>
      </div>
    );
  };

  // Item template - what shows in the dropdown list
  const itemTemplate = (option) => {
    const isSelected = selectedField === option.value;
    return (
      <div className="flex items-center justify-between w-full gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <i className={`pi ${isSelected ? 'pi-check-circle text-purple-600' : 'pi-circle text-gray-400'} text-xs flex-shrink-0`}></i>
          <span className={`text-sm flex-1 ${isSelected ? 'text-purple-900 font-medium' : 'text-gray-700'} truncate`}>
            {option.label}
          </span>
        </div>
        <span className="text-xs text-gray-400 font-mono flex-shrink-0 ml-2">
          {option.value}
        </span>
      </div>
    );
  };

  // Panel footer template
  const panelFooterTemplate = () => {
    return (
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
        {columns.length} field{columns.length !== 1 ? 's' : ''} available
      </div>
    );
  };

  const handleChange = (e) => {
    // With optionValue="value", e.value will be the string value (not the object)
    // If clicking the same field, clear it
    if (e.value === selectedField) {
      onSelectionChange(null);
    } else {
      onSelectionChange(e.value);
    }
  };

  const clearField = () => {
    onSelectionChange(null);
  };

  return (
    <div ref={containerRef} className="relative">
      <Dropdown
        ref={dropdownRef}
        value={selectedField}
        onChange={handleChange}
        options={columnOptions}
        optionLabel="label"
        optionValue="value"
        filter
        filterBy="searchText"
        filterPlaceholder="Search fields..."
        filterDelay={300}
        placeholder={placeholder}
        valueTemplate={valueTemplate}
        itemTemplate={itemTemplate}
        panelFooterTemplate={panelFooterTemplate}
        className="w-full"
        panelClassName="custom-dropdown-panel"
        showClear
        resetFilterOnHide
        emptyFilterMessage="No fields match your search"
        emptyMessage="No fields available"
      />

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
    </div>
  );
}

// Component for editing array variables as chips
function ArrayVariableInput({ varName, defaultValue, currentValue, onVariableChange, formatFieldName }) {
  const arrayValue = isArray(currentValue) ? currentValue : (isArray(defaultValue) ? defaultValue : []);
  const [editingIndex, setEditingIndex] = React.useState(null);
  const [isAdding, setIsAdding] = React.useState(false);
  const chipRefs = React.useRef({});
  const addChipRef = React.useRef(null);

  React.useEffect(() => {
    if (editingIndex !== null && chipRefs.current[editingIndex]) {
      const chip = chipRefs.current[editingIndex];
      chip.focus();
      const range = document.createRange();
      range.selectNodeContents(chip);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [editingIndex]);

  React.useEffect(() => {
    if (isAdding && addChipRef.current) {
      addChipRef.current.focus();
    }
  }, [isAdding]);

  const handleRemoveItem = (index, e) => {
    e.stopPropagation();
    const newArray = arrayValue.filter((_, i) => i !== index);
    // Use empty array instead of null to properly override default
    onVariableChange(varName, newArray);
  };

  const handleChipClick = (index, e) => {
    // Don't start editing if clicking the remove button
    if (e.target.closest('.p-chip-remove-icon') || e.target.closest('button')) {
      return;
    }
    setEditingIndex(index);
  };

  const handleChipKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.textContent = String(arrayValue[index]);
      e.currentTarget.blur();
    }
  };

  const handleChipBlur = (index, e) => {
    const newValue = e.currentTarget.textContent.trim();
    if (newValue && newValue !== String(arrayValue[index])) {
      const newArray = [...arrayValue];
      newArray[index] = newValue;
      onVariableChange(varName, newArray);
    } else if (!newValue) {
      // Restore original value if empty
      e.currentTarget.textContent = String(arrayValue[index]);
    }
    setEditingIndex(null);
  };

  const handleChipPaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, text);
  };

  const handleAddChipClick = () => {
    setIsAdding(true);
  };

  const handleAddChipKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newValue = e.currentTarget.textContent.trim();
      if (newValue) {
        const newArray = [...arrayValue, newValue];
        onVariableChange(varName, newArray);
        e.currentTarget.textContent = '';
        setIsAdding(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.textContent = '';
      setIsAdding(false);
    }
  };

  const handleAddChipBlur = (e) => {
    const newValue = e.currentTarget.textContent.trim();
    if (newValue) {
      const newArray = [...arrayValue, newValue];
      onVariableChange(varName, newArray);
    }
    e.currentTarget.textContent = '';
    setIsAdding(false);
  };

  const handleAddChipPaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, text);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {formatFieldName(varName)}
      </label>
      <div className="flex flex-wrap gap-2 items-center">
        {arrayValue.map((item, index) => (
          <div key={index} className="inline-flex items-center gap-1">
            <div
              ref={(el) => { chipRefs.current[index] = el; }}
              contentEditable={editingIndex === index}
              suppressContentEditableWarning
              onClick={(e) => handleChipClick(index, e)}
              onKeyDown={(e) => handleChipKeyDown(e, index)}
              onBlur={(e) => handleChipBlur(index, e)}
              onPaste={handleChipPaste}
              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full cursor-pointer transition-colors ${
                editingIndex === index
                  ? 'bg-white border-2 border-blue-500 outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1'
                  : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
              }`}
              style={editingIndex === index ? { minWidth: '60px', outline: 'none' } : {}}
            >
              {String(item)}
            </div>
            {editingIndex !== index && (
              <button
                type="button"
                onClick={(e) => handleRemoveItem(index, e)}
                className="p-0.5 text-blue-800 hover:text-red-600 transition-colors rounded-full hover:bg-red-100"
                title="Remove"
              >
                <i className="pi pi-times text-xs"></i>
              </button>
            )}
          </div>
        ))}
        {isAdding ? (
          <div
            ref={addChipRef}
            contentEditable
            suppressContentEditableWarning
            onKeyDown={handleAddChipKeyDown}
            onBlur={handleAddChipBlur}
            onPaste={handleAddChipPaste}
            className="inline-flex items-center px-2 py-1 text-xs bg-white border-2 border-blue-500 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            style={{ minWidth: '250px', outline: 'none' }}
            data-placeholder="Type and press Enter"
          />
        ) : (
          <div
            onClick={handleAddChipClick}
            className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full cursor-pointer transition-colors border-dashed border-2 border-gray-300 bg-transparent hover:bg-gray-100 text-gray-600"
          >
            + Add
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{
        __html: `
          [contenteditable][data-placeholder]:empty:before {
            content: attr(data-placeholder);
            color: #9ca3af;
            pointer-events: none;
          }
        `
      }} />
    </div>
  );
}

function FieldPicker({ columns, selectedFields, onSelectionChange, formatFieldName }) {
  const containerRef = React.useRef(null);
  const multiselectRef = React.useRef(null);

  // Convert columns to objects with value, label, and searchText for filtering
  const columnOptions = React.useMemo(() => {
    return columns.map(col => ({
      value: col,
      label: formatFieldName(col),
      searchText: `${col} ${formatFieldName(col)}`.toLowerCase() // Combined search text
    }));
  }, [columns, formatFieldName]);

  // With optionValue, we can pass the string values directly
  // PrimeReact will find the matching option objects internally

  // Selected items label - what shows in the multiselect button
  const selectedItemsLabel = (selectedItems) => {
    if (!selectedItems || selectedItems.length === 0) {
      return 'Select fields...';
    }
    return `${selectedItems.length} field${selectedItems.length !== 1 ? 's' : ''} selected`;
  };

  // Item template - what shows in the dropdown list
  const itemTemplate = (option) => {
    const isSelected = includes(selectedFields, option.value);
    return (
      <div className="flex items-center justify-between w-full gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`text-sm flex-1 ${isSelected ? 'text-blue-900 font-medium' : 'text-gray-700'} truncate`}>
            {option.label}
          </span>
        </div>
        <span className="text-xs text-gray-400 font-mono flex-shrink-0 ml-2">
          {option.value}
        </span>
      </div>
    );
  };

  // Panel header template with select all/clear all
  const panelHeaderTemplate = () => {
    return (
      <div className="px-2 py-1.5 border-b border-gray-100 flex gap-2">
        <button
          type="button"
          onClick={() => onSelectionChange([...columns])}
          className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
        >
          Select all
        </button>
        <span className="text-gray-300">|</span>
        <button
          type="button"
          onClick={() => onSelectionChange([])}
          className="text-xs text-gray-500 hover:text-red-600 transition-colors"
        >
          Clear all
        </button>
      </div>
    );
  };

  // Panel footer template
  const panelFooterTemplate = () => {
    return (
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
        {columns.length} field{columns.length !== 1 ? 's' : ''} available
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <MultiSelect
        ref={multiselectRef}
        value={selectedFields}
        onChange={(e) => {
          // With optionValue="value", e.value will be an array of string values
          onSelectionChange(e.value || []);
        }}
        options={columnOptions}
        optionLabel="label"
        optionValue="value"
        filter
        filterBy="searchText"
        filterPlaceholder="Search fields..."
        filterDelay={300}
        selectedItemsLabel={selectedItemsLabel}
        itemTemplate={itemTemplate}
        panelHeaderTemplate={panelHeaderTemplate}
        panelFooterTemplate={panelFooterTemplate}
        className="w-full"
        panelClassName="custom-multiselect-panel"
        display="chip"
        showClear
        resetFilterOnHide
        emptyFilterMessage="No fields match your search"
        emptyMessage="No fields available"
        placeholder="Select fields..."
      />

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
                onClick={() => {
                  const newSelection = filter(selectedFields, f => f !== field);
                  onSelectionChange(newSelection);
                }}
                className="hover:text-blue-600 transition-colors"
              >
                <i className="pi pi-times text-[10px]"></i>
              </button>
            </span>
          ))}
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
  textFilterColumns = [],
  visibleColumns = [],
  redFields = [],
  greenFields = [],
  outerGroupField = null,
  innerGroupField = null,
  nonEditableColumns = [],
  enableTargetData = false,
  targetColumns = [],
  targetOuterGroupField = null,
  targetInnerGroupField = null,
  targetValueField = null,
  actualValueField = null,
  dataSource = null,
  queryVariables = {},
  variableOverrides = {},
  onVariableOverrideChange,
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
  onSaveSettings,
  drawerTabs = [],
  onDrawerTabsChange,
  onAddDrawerTab,
  onRemoveDrawerTab,
  onUpdateDrawerTab,
}) {
  const [customOptions, setCustomOptions] = useState(
    Array.isArray(rowsPerPageOptions) ? rowsPerPageOptions.join(', ') : ''
  );
  const isInternalUpdateRef = React.useRef(false);
  const [pendingVariableOverrides, setPendingVariableOverrides] = React.useState({});

  React.useEffect(() => {
    if (!isInternalUpdateRef.current && Array.isArray(rowsPerPageOptions)) {
      const propsValue = rowsPerPageOptions.join(', ');
      if (propsValue !== customOptions) {
        setCustomOptions(propsValue);
      }
    }
    isInternalUpdateRef.current = false;
  }, [rowsPerPageOptions]);

  const handleOptionsChange = (value) => {
    setCustomOptions(value);
    isInternalUpdateRef.current = true;

    const rawValues = value.split(',').map(v => v.trim());
    const seen = new Set();
    const validOptions = [];

    rawValues.forEach(v => {
      const parsed = parseInt(v, 10);
      if (!isNaN(parsed) && parsed > 0) {
        if (!seen.has(parsed)) {
          seen.add(parsed);
          validOptions.push(parsed);
        }
      }
    });

    const options = validOptions.sort((a, b) => a - b);

    if (options.length > 0) {
      onRowsPerPageOptionsChange(options);

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

  // Get variable type helper
  const getVariableType = React.useCallback((value) => {
    if (value === null || value === undefined) return 'string';
    if (isArray(value)) return 'array';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') {
      // Check if it's a date string
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
      return 'string';
    }
    return 'string';
  }, []);

  // Handle variable override change - store locally, don't apply yet
  const handleVariableChange = React.useCallback((varName, value) => {
    setPendingVariableOverrides(prev => {
      const newPending = { ...prev };
      if (value === null || value === undefined || value === '') {
        delete newPending[varName];
      } else {
        newPending[varName] = value;
      }
      return newPending;
    });
  }, []);

  // Apply pending variable overrides
  const handleApplyVariables = React.useCallback(() => {
    if (onVariableOverrideChange) {
      // Merge with existing overrides
      const newOverrides = { ...variableOverrides, ...pendingVariableOverrides };
      // Remove any keys that are set to null/undefined in pending (but keep empty arrays)
      Object.keys(pendingVariableOverrides).forEach(key => {
        const value = pendingVariableOverrides[key];
        // Only delete if null/undefined/empty string, but keep empty arrays
        if (value === null || value === undefined || (typeof value === 'string' && value === '')) {
          delete newOverrides[key];
        }
      });
      onVariableOverrideChange(newOverrides);
      setPendingVariableOverrides({});
    }
  }, [pendingVariableOverrides, variableOverrides, onVariableOverrideChange]);

  // Reset pending changes when variableOverrides prop changes externally
  React.useEffect(() => {
    setPendingVariableOverrides({});
  }, [variableOverrides]);

  // Get filtered variables (excluding startDate and endDate)
  const filteredVariables = React.useMemo(() => {
    const { startDate, endDate, ...rest } = queryVariables;
    return rest;
  }, [queryVariables]);

  // Render variable input based on type
  const renderVariableInput = React.useCallback((varName, defaultValue) => {
    // Use pending override if exists, otherwise use applied override, otherwise use default
    const pendingValue = pendingVariableOverrides[varName];
    const appliedValue = variableOverrides[varName];
    const currentValue = pendingValue !== undefined ? pendingValue : (appliedValue !== undefined ? appliedValue : defaultValue);
    const varType = getVariableType(defaultValue);

    switch (varType) {
      case 'array':
        return (
          <ArrayVariableInput
            varName={varName}
            defaultValue={defaultValue}
            currentValue={currentValue}
            onVariableChange={handleVariableChange}
            formatFieldName={formatFieldName}
          />
        );
      case 'boolean':
        return (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">{formatFieldName(varName)}</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={currentValue === true}
                onChange={(e) => handleVariableChange(varName, e.target.checked)}
                className="sr-only"
              />
              <div
                className={`w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${currentValue === true ? 'bg-blue-600' : 'bg-gray-300'}`}
                onClick={() => handleVariableChange(varName, !currentValue)}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${currentValue === true ? 'translate-x-5' : 'translate-x-0.5'}`}
                  style={{ marginTop: '2px' }}
                ></div>
              </div>
            </div>
          </div>
        );
      case 'number':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formatFieldName(varName)}
            </label>
            <input
              type="number"
              value={currentValue !== null && currentValue !== undefined ? currentValue : ''}
              onChange={(e) => {
                const val = e.target.value === '' ? null : parseFloat(e.target.value);
                handleVariableChange(varName, isNaN(val) ? null : val);
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={defaultValue !== null && defaultValue !== undefined ? String(defaultValue) : ''}
            />
          </div>
        );
      case 'date':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formatFieldName(varName)}
            </label>
            <input
              type="date"
              value={currentValue !== null && currentValue !== undefined ? currentValue : ''}
              onChange={(e) => handleVariableChange(varName, e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        );
      default: // string
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formatFieldName(varName)}
            </label>
            <input
              type="text"
              value={currentValue !== null && currentValue !== undefined ? String(currentValue) : ''}
              onChange={(e) => handleVariableChange(varName, e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={defaultValue !== null && defaultValue !== undefined ? String(defaultValue) : ''}
            />
          </div>
        );
    }
  }, [pendingVariableOverrides, variableOverrides, getVariableType, formatFieldName, handleVariableChange]);

  const ToggleSwitch = ({ checked, onChange, label, icon, isLast = false }) => (
    <div className={`flex items-center justify-between p-3 ${!isLast ? 'border-bottom-1 surface-border' : ''}`}>
      <div className="flex align-items-center gap-2">
        <i className={`${icon} ${checked ? 'text-blue-600' : 'text-gray-600'}`}></i>
        <span className="font-medium">{label}</span>
      </div>
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
          onClick={() => onChange(!checked)}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
            style={{ marginTop: '2px' }}
          ></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="@container h-full flex flex-col bg-white border-l border-gray-200">
      {/* Variables Section */}
      {Object.keys(filteredVariables).length > 0 && (
        <div className="border-b border-gray-200 bg-white hidden @3xs:block">
          <div className="px-2 @3xs:px-4 py-2 @3xs:py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <i className="pi pi-code text-base @3xs:text-lg text-primary"></i>
                <span className="font-semibold text-sm @3xs:text-base text-primary">Variables</span>
                {Object.keys(pendingVariableOverrides).length > 0 && (
                  <span className="text-xs text-orange-600 font-medium">(Pending)</span>
                )}
              </div>
              <button
                onClick={handleApplyVariables}
                disabled={Object.keys(pendingVariableOverrides).length === 0}
                className="flex items-center gap-1 @3xs:gap-2 px-2 @3xs:px-3 py-1.5 text-xs @3xs:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md transition-colors shrink-0"
                title="Apply variable changes"
              >
                <i className="pi pi-check text-xs @3xs:text-sm"></i>
                <span className="hidden @[150px]:inline">Apply</span>
              </button>
            </div>
          </div>
          <div className="p-2 @3xs:p-4">
            <div className="space-y-2 @3xs:space-y-4">
              {Object.entries(filteredVariables).map(([varName, defaultValue]) => (
                <div key={varName}>
                  {renderVariableInput(varName, defaultValue)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Icon-only mode when very small - show icons only */}
      <div className="@3xs:hidden flex flex-col items-center py-2 gap-2">
        {Object.keys(filteredVariables).length > 0 && (
          <div className="p-2 text-center" title="Variables">
            <i className="pi pi-code text-xl text-primary"></i>
          </div>
        )}
        <div className="p-2 text-center" title="Table Settings">
          <i className="pi pi-table text-xl text-primary"></i>
        </div>
      </div>

      {/* Table Settings Section */}
      <>
          <div className="px-2 @3xs:px-4 py-2 @3xs:py-3 bg-gray-50 border-b border-gray-200 hidden @3xs:block">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <i className="pi pi-table text-base @3xs:text-lg text-primary"></i>
                <span className="font-semibold text-sm @3xs:text-base text-primary">Table Settings</span>
              </div>
              {dataSource && onSaveSettings && (
                <button
                  onClick={onSaveSettings}
                  className="flex items-center gap-1 @3xs:gap-2 px-2 @3xs:px-3 py-1.5 text-xs @3xs:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shrink-0"
                  title="Save current settings for this data source"
                >
                  <i className="pi pi-save text-xs @3xs:text-sm"></i>
                  <span className="hidden @[150px]:inline">Save</span>
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 p-2 @3xs:p-4 hidden @3xs:block">
        <Accordion multiple activeIndex={[0]}>
              {/* TABLE FEATURES */}
              <AccordionTab header={
                <div className="flex align-items-center gap-2">
                  <i className="pi pi-cog"></i>
                  <span>Table Features</span>
                </div>
              }>
                <div className="m-0">
                  <ToggleSwitch
                    checked={enableSort}
                    onChange={onSortChange}
                    label="Sorting"
                    icon="pi pi-sort"
                  />
                  <ToggleSwitch
                    checked={enableFilter}
                    onChange={onFilterChange}
                    label="Filtering"
                    icon="pi pi-filter"
                  />
                  <ToggleSwitch
                    checked={enableSummation}
                    onChange={onSummationChange}
                    label="Summation"
                    icon="pi pi-calculator"
                  />
                  {onCellEditChange && (
                    <ToggleSwitch
                      checked={enableCellEdit}
                      onChange={onCellEditChange}
                      label="Cell Editing"
                      icon="pi pi-pencil"
                      isLast={true}
                    />
                  )}
                </div>
              </AccordionTab>

              {/* COLUMN CONFIGURATION */}
              {!isEmpty(columns) && (
                <AccordionTab header={
                  <div className="flex align-items-center gap-2">
                    <i className="pi pi-list"></i>
                    <span>Column Configuration</span>
                  </div>
                }>
                  <div className="m-0">
                    {enableFilter && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <i className="pi pi-search mr-2"></i>
                          Text Search Fields
                        </label>
                        <p className="text-xs text-gray-500 mb-2">
                          Fields that use text search instead of multiselect
                        </p>
                        <FieldPicker
                          columns={columns}
                          selectedFields={textFilterColumns}
                          onSelectionChange={onTextFilterColumnsChange}
                          formatFieldName={formatFieldName}
                        />
                      </div>
                    )}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <i className="pi pi-eye mr-2"></i>
                        Visible Columns
                      </label>
                      <p className="text-xs text-gray-500 mb-2">
                        Select fields to display (empty = show all)
                      </p>
                      <FieldPicker
                        columns={columns}
                        selectedFields={visibleColumns}
                        onSelectionChange={onVisibleColumnsChange}
                        formatFieldName={formatFieldName}
                      />
                    </div>
                    {enableCellEdit && onNonEditableColumnsChange && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <i className="pi pi-lock mr-2"></i>
                          Non-Editable Columns
                        </label>
                        <p className="text-xs text-gray-500 mb-2">
                          Fields that cannot be edited
                        </p>
                        <FieldPicker
                          columns={columns}
                          selectedFields={nonEditableColumns}
                          onSelectionChange={onNonEditableColumnsChange}
                          formatFieldName={formatFieldName}
                        />
                      </div>
                    )}
                  </div>
                </AccordionTab>
              )}

              {/* GROUPING */}
              {!isEmpty(columns) && (
                <AccordionTab header={
                  <div className="flex align-items-center gap-2">
                    <i className="pi pi-sitemap"></i>
                    <span>Grouping</span>
                  </div>
                }>
                  <div className="m-0">
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Outer Group (Expandable Header)
                      </label>
                      <p className="text-xs text-gray-500 mb-2">
                        Creates expandable row groups
                      </p>
                      <SingleFieldSelector
                        columns={columns}
                        selectedField={outerGroupField}
                        onSelectionChange={onOuterGroupFieldChange}
                        formatFieldName={formatFieldName}
                        placeholder="Select outer group field..."
                      />
                    </div>
                    {outerGroupField && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Inner Group (Aggregation Anchor)
                        </label>
                        <p className="text-xs text-gray-500 mb-2">
                          Aggregates data within each outer group
                        </p>
                        <SingleFieldSelector
                          columns={columns}
                          selectedField={innerGroupField}
                          onSelectionChange={onInnerGroupFieldChange}
                          formatFieldName={formatFieldName}
                          placeholder="Select inner group field..."
                        />
                      </div>
                    )}
                  </div>
                </AccordionTab>
              )}

              {/* DRAWER CONTROLS */}
              {outerGroupField && (
                <AccordionTab header={
                  <div className="flex align-items-center gap-2">
                    <i className="pi pi-window-maximize"></i>
                    <span>Drawer Controls</span>
                  </div>
                }>
                  <div className="m-0">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Drawer Tabs
                        </label>
                        <p className="text-xs text-gray-500">
                          Configure multiple tabs for the drawer
                        </p>
                      </div>
                      {onAddDrawerTab && (
                        <button
                          type="button"
                          onClick={onAddDrawerTab}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                          title="Add new drawer tab"
                        >
                          <i className="pi pi-plus text-xs"></i>
                          <span>Add Tab</span>
                        </button>
                      )}
                    </div>
                    
                    {drawerTabs && drawerTabs.length > 0 ? (
                      <div className="space-y-4">
                        {drawerTabs.map((tab, index) => (
                          <div key={tab.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-semibold text-gray-800">
                                Tab {index + 1}
                              </h4>
                              {onRemoveDrawerTab && drawerTabs.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveDrawerTab(tab.id)}
                                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                  title="Remove this tab"
                                >
                                  <i className="pi pi-trash text-xs"></i>
                                  <span>Remove</span>
                                </button>
                              )}
                            </div>
                            
                            <div className="space-y-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Tab Name
                                </label>
                                <p className="text-xs text-gray-500 mb-2">
                                  Name displayed in drawer tab header
                                </p>
                                <InputText
                                  value={tab.name || ''}
                                  onChange={(e) => onUpdateDrawerTab && onUpdateDrawerTab(tab.id, { name: e.target.value })}
                                  placeholder="Enter tab name..."
                                  className="w-full"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Tab Outer Group
                                </label>
                                <p className="text-xs text-gray-500 mb-2">
                                  Column to group by in drawer
                                </p>
                                <SingleFieldSelector
                                  columns={columns}
                                  selectedField={tab.outerGroup}
                                  onSelectionChange={(value) => {
                                    if (onUpdateDrawerTab) {
                                      onUpdateDrawerTab(tab.id, { 
                                        outerGroup: value,
                                        // Clear inner group when outer group is cleared
                                        innerGroup: value ? tab.innerGroup : null
                                      });
                                    }
                                  }}
                                  formatFieldName={formatFieldName}
                                  placeholder="Select outer group field..."
                                />
                              </div>
                              {tab.outerGroup && (
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Tab Inner Group
                                  </label>
                                  <p className="text-xs text-gray-500 mb-2">
                                    Column to aggregate by within each outer group in drawer
                                  </p>
                                  <SingleFieldSelector
                                    columns={columns}
                                    selectedField={tab.innerGroup}
                                    onSelectionChange={(value) => onUpdateDrawerTab && onUpdateDrawerTab(tab.id, { innerGroup: value })}
                                    formatFieldName={formatFieldName}
                                    placeholder="Select inner group field..."
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <i className="pi pi-inbox text-2xl mb-2"></i>
                        <p className="text-sm">No tabs configured</p>
                        <p className="text-xs mt-1">Click "Add Tab" to create your first drawer tab</p>
                      </div>
                    )}
                  </div>
                </AccordionTab>
              )}

              {/* TARGET DATA */}
              {outerGroupField && innerGroupField && !isEmpty(targetColumns) && (
                <AccordionTab header={
                  <div className="flex align-items-center gap-2">
                    <i className="pi pi-bullseye"></i>
                    <span>Target Data</span>
                  </div>
                }>
                  <div className="m-0">
                    <div className="flex align-items-center justify-content-between p-3 border-bottom-1 surface-border mb-3">
                      <div className="flex align-items-center gap-2">
                        <i className={`pi pi-bullseye ${enableTargetData ? 'text-blue-600' : 'text-gray-600'}`}></i>
                        <span className="font-medium">Enable Target Data</span>
                      </div>
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={enableTargetData}
                          onChange={(e) => onEnableTargetDataChange && onEnableTargetDataChange(e.target.checked)}
                          className="sr-only"
                        />
                        <div
                          className={`w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${enableTargetData ? 'bg-blue-600' : 'bg-gray-300'}`}
                          onClick={() => onEnableTargetDataChange && onEnableTargetDataChange(!enableTargetData)}
                        >
                          <div
                            className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${enableTargetData ? 'translate-x-5' : 'translate-x-0.5'}`}
                            style={{ marginTop: '2px' }}
                          ></div>
                        </div>
                      </div>
                    </div>
                    {enableTargetData && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Target Outer Group Field
                          </label>
                          <SingleFieldSelector
                            columns={targetColumns}
                            selectedField={targetOuterGroupField}
                            onSelectionChange={onTargetOuterGroupFieldChange}
                            formatFieldName={formatFieldName}
                            placeholder="Map to Outer Group..."
                          />
                        </div>
                        {targetOuterGroupField && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Target Inner Group Field
                            </label>
                            <SingleFieldSelector
                              columns={targetColumns}
                              selectedField={targetInnerGroupField}
                              onSelectionChange={onTargetInnerGroupFieldChange}
                              formatFieldName={formatFieldName}
                              placeholder="Map to Inner Group..."
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Target Value Field
                          </label>
                          <SingleFieldSelector
                            columns={targetColumns}
                            selectedField={targetValueField}
                            onSelectionChange={onTargetValueFieldChange}
                            formatFieldName={formatFieldName}
                            placeholder="Select target value field..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Actual Value Field
                          </label>
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
                </AccordionTab>
              )}

              {/* STYLING */}
              {enableSummation && !isEmpty(columns) && (
                <AccordionTab header={
                  <div className="flex align-items-center gap-2">
                    <i className="pi pi-palette"></i>
                    <span>Styling</span>
                  </div>
                }>
                  <div className="m-0">
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-red-700 mb-2">
                        Red Fields
                      </label>
                      <p className="text-xs text-gray-500 mb-2">
                        Summation totals in red
                      </p>
                      <FieldPicker
                        columns={columns}
                        selectedFields={redFields}
                        onSelectionChange={onRedFieldsChange}
                        formatFieldName={formatFieldName}
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-green-700 mb-2">
                        Green Fields
                      </label>
                      <p className="text-xs text-gray-500 mb-2">
                        Summation totals in green
                      </p>
                      <FieldPicker
                        columns={columns}
                        selectedFields={greenFields}
                        onSelectionChange={onGreenFieldsChange}
                        formatFieldName={formatFieldName}
                      />
                    </div>
                  </div>
                </AccordionTab>
              )}

              {/* PAGINATION */}
              <AccordionTab header={
                <div className="flex align-items-center gap-2">
                  <i className="pi pi-list"></i>
                  <span>Pagination</span>
                </div>
              }>
                <div className="m-0">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      Enter numbers separated by commas
                    </p>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      Default number of rows per page
                    </p>
                  </div>
                </div>
              </AccordionTab>
        </Accordion>
          </div>
        </>
    </div>
  );
}
