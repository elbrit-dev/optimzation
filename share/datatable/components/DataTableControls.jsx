'use client';

import { filter, includes, isArray, isEmpty, startCase, take, toLower, uniq } from 'lodash';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Chip } from 'primereact/chip';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { MultiSelect } from 'primereact/multiselect';
import React, { useContext, useState } from 'react';
import { TableOperationsContext } from '../contexts/TableOperationsContext';
import { defaultDataTableConfig } from '../config/defaultConfig';
import { getMainOverrides, getNestedOverridesAtPath, setOverrideAtPath } from '../utils/columnTypesOverrideUtils';
import { getDataValue } from '../utils/dataAccessUtils';
import { isJsonArrayOfObjectsString } from '../utils/jsonArrayParser';

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
              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full cursor-pointer transition-colors ${editingIndex === index
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

function ChartColumnsPicker({ columns, selectedColumns, onSelectionChange, formatFieldName }) {
  if (isEmpty(columns)) {
    return (
      <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
        No columns available.
      </div>
    );
  }

  return (
    <FieldPicker
      columns={columns}
      selectedFields={selectedColumns}
      onSelectionChange={onSelectionChange}
      formatFieldName={formatFieldName}
    />
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

function ColumnTypeOverridesTree({ columnTree, columnTypesOverride, onColumnTypesOverrideChange, formatFieldName }) {
  const levelOverrides = (path) => (path.length === 0 ? getMainOverrides(columnTypesOverride) : getNestedOverridesAtPath(columnTypesOverride, path));
  const handleChange = (path, col, selectedValue) => {
    const isAuto = selectedValue.endsWith(' (auto)');
    const value = isAuto ? null : selectedValue;
    const next = setOverrideAtPath(columnTypesOverride, path, col, value);
    if (onColumnTypesOverrideChange) onColumnTypesOverrideChange(next);
  };

  function renderLevel(tree, path, sectionLabel) {
    const overrides = levelOverrides(path);
    const rows = (tree?.mainColumns || []).map(({ name: col, detectedType }) => {
      const overrideType = overrides[col];
      const isOverridden = !!overrideType;
      const dropdownOptions = ['string', 'number', 'date', 'boolean'].map((type) => {
        const isAutoDetected = type === detectedType && !isOverridden;
        return {
          label: isAutoDetected ? `${type} (auto)` : type,
          value: isAutoDetected ? `${type} (auto)` : type,
          isAuto: isAutoDetected
        };
      });
      const currentValue = isOverridden ? overrideType : `${detectedType} (auto)`;
      const valueTemplate = (option) => {
        if (!option) return null;
        return (
          <div className="flex items-center gap-1.5">
            <span>{option.label || option}</span>
            {option.isAuto && <i className="pi pi-microchip-ai text-xs text-gray-400"></i>}
          </div>
        );
      };
      const itemTemplate = (option) => (
        <div className="flex items-center gap-1.5">
          <span>{option.label}</span>
          {option.isAuto && <i className="pi pi-microchip-ai text-xs text-gray-400"></i>}
        </div>
      );
      return (
        <tr key={col} className="border-b border-gray-100 hover:bg-gray-50">
          <td className="py-2 px-3 text-sm text-gray-800">{formatFieldName(col)}</td>
          <td className="py-2 px-3">
            <Dropdown
              value={currentValue}
              onChange={(e) => handleChange(path, col, e.value)}
              options={dropdownOptions}
              optionLabel="label"
              optionValue="value"
              valueTemplate={valueTemplate}
              itemTemplate={itemTemplate}
              className="flex-1 text-sm"
              style={{ minWidth: '120px' }}
            />
          </td>
        </tr>
      );
    });

    // Only show nested sections when not at root (path.length > 0). Root-level nested is rendered by the caller in the "mt-4 space-y-4" block to avoid duplication.
    const nestedSections = path.length > 0 && tree?.nested && Object.keys(tree.nested).length > 0 ? (
      <div className="mt-3 space-y-3">
        {Object.entries(tree.nested).map(([fieldName, childTree]) => (
          <div key={fieldName} className="pl-4 mt-2 border-l-2 border-gray-200">
            <p className="text-xs font-medium text-gray-600 mb-2">{formatFieldName(fieldName)} (array)</p>
            {renderLevel(childTree, [...path, fieldName], fieldName)}
          </div>
        ))}
      </div>
    ) : null;

    return (
      <>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">Column Name</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">Column Type</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
        {nestedSections}
      </>
    );
  }

  if (!columnTree?.mainColumns?.length && (!columnTree?.nested || Object.keys(columnTree.nested).length === 0)) {
    return (
      <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
        No columns to override.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto space-y-4">
      {columnTree.mainColumns?.length > 0 && renderLevel(columnTree, [], null)}
      {columnTree.nested && Object.keys(columnTree.nested).length > 0 && (
        <div className="mt-4 space-y-4">
          {Object.entries(columnTree.nested).map(([fieldName, childTree]) => (
            <div key={fieldName} className="pl-4 border-l-2 border-gray-200">
              <p className="text-xs font-medium text-gray-700 mb-2">{formatFieldName(fieldName)} (array)</p>
              {renderLevel(childTree, [fieldName], fieldName)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DataTableControls({
  enableSort = defaultDataTableConfig.enableSort,
  enableFilter = defaultDataTableConfig.enableFilter,
  enableSummation = defaultDataTableConfig.enableSummation,
  enableCellEdit = defaultDataTableConfig.enableCellEdit,
  enableDivideBy1Lakh = defaultDataTableConfig.enableDivideBy1Lakh,
  rowsPerPageOptions = defaultDataTableConfig.rowsPerPageOptions,
  defaultRows = defaultDataTableConfig.defaultRows,
  tableHeight = defaultDataTableConfig.tableHeight,
  columns = [],
  textFilterColumns = defaultDataTableConfig.textFilterColumns,
  allowedColumns = defaultDataTableConfig.allowedColumns,
  redFields = defaultDataTableConfig.redFields,
  greenFields = defaultDataTableConfig.greenFields,
  outerGroupField = defaultDataTableConfig.outerGroupField,
  innerGroupField = defaultDataTableConfig.innerGroupField,
  groupFields = null, // Array for infinite nesting
  onGroupFieldsChange,
  editableColumns = defaultDataTableConfig.editableColumns,
  percentageColumns = defaultDataTableConfig.percentageColumns,
  dataSource = null,
  queryVariables = {},
  variableOverrides = {},
  onVariableOverrideChange,
  onSortChange,
  onFilterChange,
  onSummationChange,
  onCellEditChange,
  onDivideBy1LakhChange,
  onRowsPerPageOptionsChange,
  onDefaultRowsChange,
  onTableHeightChange,
  onTextFilterColumnsChange,
  onAllowedColumnsChange,
  onRedFieldsChange,
  onGreenFieldsChange,
  onOuterGroupFieldChange,
  onInnerGroupFieldChange,
  onEditableColumnsChange,
  onPercentageColumnsChange,
  onSaveSettings,
  drawerTabs = defaultDataTableConfig.drawerTabs,
  onDrawerTabsChange,
  onAddDrawerTab,
  onRemoveDrawerTab,
  onUpdateDrawerTab,
  // Auth Control props
  isAdminMode = defaultDataTableConfig.isAdminMode,
  salesTeamColumn = defaultDataTableConfig.salesTeamColumn,
  salesTeamValues = defaultDataTableConfig.salesTeamValues,
  hqColumn = defaultDataTableConfig.hqColumn,
  hqValues = defaultDataTableConfig.hqValues,
  tableData = [],
  onAdminModeChange,
  onSalesTeamColumnChange,
  onSalesTeamValuesChange,
  onHqColumnChange,
  onHqValuesChange,
  columnTypesOverride = defaultDataTableConfig.columnTypesOverride,
  onColumnTypesOverrideChange,
  // Report settings
  enableReport = defaultDataTableConfig.enableReport,
  dateColumn = defaultDataTableConfig.dateColumn,
  showChart = true,
  chartColumns = [],
  chartHeight = 400,
  onEnableReportChange,
  onDateColumnChange,
  onShowChartChange,
  onChartColumnsChange,
  onChartHeightChange,
  // Data Source and Query Key props
  selectedQueryKey = null,
  savedQueries = [],
  loadingQueries = false,
  onDataSourceChange,
  onSelectedQueryKeyChange,
}) {
  const tableOps = useContext(TableOperationsContext);
  const availableQueryKeys = tableOps?.availableQueryKeys ?? [];
  const executingQuery = tableOps?.executingQuery ?? false;

  const [customOptions, setCustomOptions] = useState(
    Array.isArray(rowsPerPageOptions) ? rowsPerPageOptions.join(', ') : ''
  );
  const isInternalUpdateRef = React.useRef(false);
  const [pendingVariableOverrides, setPendingVariableOverrides] = React.useState({});

  // Detect JSON table columns - columns that have nested tables
  const jsonTableColumns = React.useMemo(() => {
    if (!tableData || !Array.isArray(tableData) || tableData.length === 0) {
      return {};
    }

    const jsonTableMap = {};
    
    // Check ALL rows, not just first 10, to find rows with __nestedTables__
    // Also check if columns contain JSON arrays directly (for columns that haven't been processed yet)
    const rowsWithNestedTables = tableData.filter(row => row && row.__nestedTables__ && Array.isArray(row.__nestedTables__) && row.__nestedTables__.length > 0);
    
    // First, extract from rows that already have __nestedTables__
    rowsWithNestedTables.forEach(row => {
      if (row && row.__nestedTables__ && Array.isArray(row.__nestedTables__)) {
        row.__nestedTables__.forEach(nestedTable => {
          const columnName = nestedTable.fieldName;
          if (columnName && !columnName.startsWith('__')) {
            if (!jsonTableMap[columnName]) {
              jsonTableMap[columnName] = {
                fieldName: columnName,
                nestedTables: []
              };
            }
            
            // Check if this nested table is already recorded
            const existingNested = jsonTableMap[columnName].nestedTables.find(
              nt => nt.fieldName === nestedTable.fieldName
            );
            
            if (!existingNested) {
              // Extract columns from nested table data
              let nestedColumns = [];
              if (nestedTable.data && Array.isArray(nestedTable.data) && nestedTable.data.length > 0) {
                const sampleNestedRow = nestedTable.data[0];
                if (sampleNestedRow && typeof sampleNestedRow === 'object') {
                  nestedColumns = Object.keys(sampleNestedRow).filter(key => !key.startsWith('__'));
                }
              }
              
              jsonTableMap[columnName].nestedTables.push({
                fieldName: nestedTable.fieldName,
                title: nestedTable.title || nestedTable.fieldName,
                columns: nestedColumns
              });
            }
          }
        });
      }
    });
    
    // If no rows have __nestedTables__, check columns directly for JSON arrays
    // This handles the case where extraction hasn't happened yet or data structure is different
    if (rowsWithNestedTables.length === 0 && columns.length > 0) {
      // Sample a few rows to check for JSON array columns
      const sampleRows = tableData.slice(0, Math.min(50, tableData.length));
      sampleRows.forEach(row => {
        if (!row || typeof row !== 'object') return;
        columns.forEach(columnName => {
          if (columnName.startsWith('__')) return;
          const columnValue = row[columnName];
          // Check if column contains JSON array or is already an array
          if (isArray(columnValue) && columnValue.length > 0) {
            const firstItem = columnValue[0];
            if (firstItem && typeof firstItem === 'object' && !isArray(firstItem)) {
              // This is a JSON array column
              if (!jsonTableMap[columnName]) {
                jsonTableMap[columnName] = {
                  fieldName: columnName,
                  nestedTables: []
                };
              }
              // Extract columns from the array items
              const nestedColumns = Object.keys(firstItem).filter(key => !key.startsWith('__'));
              // Check if we already have this nested table
              const existingNested = jsonTableMap[columnName].nestedTables.find(
                nt => nt.fieldName === columnName
              );
              if (!existingNested) {
                jsonTableMap[columnName].nestedTables.push({
                  fieldName: columnName,
                  title: columnName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                  columns: nestedColumns
                });
              }
            }
          }
        });
      });
    }
    
    return jsonTableMap;
  }, [tableData, columns]);

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

  // Detect column types from tableData (simplified version)
  const detectedColumnTypes = React.useMemo(() => {
    if (!Array.isArray(tableData) || isEmpty(tableData) || isEmpty(columns)) {
      return {};
    }

    const types = {};
    const sampleData = tableData.slice(0, 100);

    columns.forEach((col) => {
      let numericCount = 0;
      let dateCount = 0;
      let booleanCount = 0;
      let nonNullCount = 0;

      sampleData.forEach((row) => {
        const value = getDataValue(row, col);
        if (value !== null && value !== undefined) {
          nonNullCount++;
          if (typeof value === 'boolean') {
            booleanCount++;
          } else if (value === 0 || value === 1 || value === '0' || value === '1') {
            // Could be boolean or number
            if (typeof value === 'number' || !isNaN(Number(value))) {
              numericCount++;
            }
          } else if (typeof value === 'number' || (!isNaN(Number(value)) && value !== '')) {
            numericCount++;
          } else if (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) {
            dateCount++;
          }
        }
      });

      if (nonNullCount > 0) {
        if (booleanCount > nonNullCount * 0.7) {
          types[col] = 'boolean';
        } else if (dateCount > nonNullCount * 0.7) {
          types[col] = 'date';
        } else if (numericCount > nonNullCount * 0.8) {
          types[col] = 'number';
        } else {
          types[col] = 'string';
        }
      } else {
        types[col] = 'string';
      }
    });

    return types;
  }, [tableData, columns]);

  // Detect types for a subset of columns in a data array (for nested levels)
  const detectTypesForData = React.useCallback((data, columnList) => {
    if (!data || !data.length || !columnList?.length) return {};
    const types = {};
    const sample = take(data, 100);
    columnList.forEach((col) => {
      let numericCount = 0;
      let dateCount = 0;
      let booleanCount = 0;
      let nonNullCount = 0;
      sample.forEach((row) => {
        const value = getDataValue(row, col);
        if (value !== null && value !== undefined) {
          nonNullCount++;
          if (typeof value === 'boolean') booleanCount++;
          else if (value === 0 || value === 1 || value === '0' || value === '1') {
            if (typeof value === 'number' || !isNaN(Number(value))) numericCount++;
          } else if (typeof value === 'number' || (!isNaN(Number(value)) && value !== '')) numericCount++;
          else if (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) dateCount++;
        }
      });
      if (nonNullCount > 0) {
        if (booleanCount > nonNullCount * 0.7) types[col] = 'boolean';
        else if (dateCount > nonNullCount * 0.7) types[col] = 'date';
        else if (numericCount > nonNullCount * 0.8) types[col] = 'number';
        else types[col] = 'string';
      } else types[col] = 'string';
    });
    return types;
  }, []);

  // Recursive column tree: main columns + nested array sections with sub-columns and detected types
  const columnTree = React.useMemo(() => {
    const mainColumns = (columns || []).filter((c) => !jsonTableColumns[c]).map((col) => ({
      name: col,
      detectedType: detectedColumnTypes[col] || 'string'
    }));

    function buildLevelFromData(data) {
      if (!data || !isArray(data) || data.length === 0) return { mainColumns: [], nested: {} };
      const sample = take(data, 20);
      const allKeys = new Set();
      sample.forEach((row) => {
        if (row && typeof row === 'object') Object.keys(row).forEach((k) => { if (!k.startsWith('__')) allKeys.add(k); });
      });
      const arrayFields = new Set();
      sample.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        allKeys.forEach((k) => {
          if (isJsonArrayOfObjectsString(getDataValue(row, k))) arrayFields.add(k);
        });
      });
      const scalarKeys = [...allKeys].filter((k) => !arrayFields.has(k));
      const detected = detectTypesForData(data, scalarKeys);
      const mainCols = scalarKeys.map((name) => ({ name, detectedType: detected[name] || 'string' }));
      const nestedMap = {};
      sample.forEach((row) => {
        if (!row?.__nestedTables__) return;
        row.__nestedTables__.forEach((nt) => {
          if (nt?.fieldName && !nestedMap[nt.fieldName]) {
            nestedMap[nt.fieldName] = buildLevelFromData(nt.data || []);
          }
        });
      });
      return { mainColumns: mainCols, nested: nestedMap };
    }

    const nestedMap = {};
    if (tableData && isArray(tableData)) {
      const rowsWithNested = tableData.filter((row) => row?.__nestedTables__?.length > 0);
      rowsWithNested.forEach((row) => {
        row.__nestedTables__.forEach((nt) => {
          if (nt?.fieldName && !nestedMap[nt.fieldName]) {
            nestedMap[nt.fieldName] = buildLevelFromData(nt.data || []);
          }
        });
      });
    }
    return { mainColumns, nested: nestedMap };
  }, [tableData, columns, detectedColumnTypes, jsonTableColumns, detectTypesForData]);

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

  // Extract unique values from a column in tableData
  const getUniqueValuesFromColumn = React.useCallback((columnName, dataToFilter = null) => {
    if (!columnName || !Array.isArray(tableData) || isEmpty(tableData)) {
      return [];
    }

    // Use provided data or tableData
    const dataSource = dataToFilter || tableData;

    const values = dataSource
      .map(row => {
        if (!row || typeof row !== 'object') return null;
        return getDataValue(row, columnName);
      })
      .filter(val => val !== null && val !== undefined && val !== '');

    // Get unique values and sort them
    const uniqueValues = uniq(values.map(val => String(val)));
    return uniqueValues.sort();
  }, [tableData]);

  // Get unique salesTeam values
  const salesTeamUniqueValues = React.useMemo(() => {
    return getUniqueValuesFromColumn(salesTeamColumn);
  }, [salesTeamColumn, tableData, getUniqueValuesFromColumn]);

  // Get unique hq values (from data filtered by salesTeam first)
  const hqUniqueValues = React.useMemo(() => {
    if (!salesTeamColumn || !hqColumn || !Array.isArray(tableData) || isEmpty(tableData)) {
      return [];
    }

    // First filter by salesTeam if salesTeamValues has exactly 1 value
    let filteredData = tableData;
    if (salesTeamValues && salesTeamValues.length === 1) {
      const selectedSalesTeamValue = salesTeamValues[0];
      filteredData = tableData.filter(row => {
        if (!row || typeof row !== 'object') return false;
        const rowValue = getDataValue(row, salesTeamColumn);
        return String(rowValue) === String(selectedSalesTeamValue);
      });
    }

    return getUniqueValuesFromColumn(hqColumn, filteredData);
  }, [salesTeamColumn, hqColumn, salesTeamValues, tableData, getUniqueValuesFromColumn]);

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
      {/* Data Source and Query Key Section */}
      {(onDataSourceChange || onSelectedQueryKeyChange) && (
        <div className="border-b border-gray-200 bg-white hidden @3xs:block">
          <div className="px-2 @3xs:px-4 py-2 @3xs:py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <i className="pi pi-database text-base @3xs:text-lg text-primary"></i>
              <span className="font-semibold text-sm @3xs:text-base text-primary">Data Source</span>
            </div>
          </div>
          <div className="p-2 @3xs:p-4">
            <div className="space-y-2 @3xs:space-y-4">
              {/* Data Source Selector */}
              {onDataSourceChange && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Source
                  </label>
                  <Dropdown
                    value={dataSource}
                    onChange={(e) => {
                      onDataSourceChange(e.value);
                    }}
                    options={[
                      { label: 'Offline', value: 'offline' },
                      { label: 'Test Data', value: 'test' },
                      { label: 'Nested Data', value: 'nested' },
                      ...savedQueries.map(q => ({ label: q.name, value: q.id }))
                    ]}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select a data source"
                    className="w-full"
                    loading={loadingQueries}
                    disabled={executingQuery}
                    style={{
                      height: '2.5rem',
                    }}
                  />
                </div>
              )}

              {/* Query Key Selector */}
              {onSelectedQueryKeyChange && dataSource && availableQueryKeys.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Query Key
                  </label>
                  <Dropdown
                    value={selectedQueryKey}
                    onChange={(e) => onSelectedQueryKeyChange(e.value)}
                    options={availableQueryKeys.map(key => ({
                      label: startCase(key.split('__').join(' ').split('_').join(' ')),
                      value: key
                    }))}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select Query Key"
                    className="w-full"
                    disabled={executingQuery}
                    style={{
                      height: '2.5rem',
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* Auth Control Section */}
      <div className="border-b border-gray-200 bg-white hidden @3xs:block">
        <div className="px-2 @3xs:px-4 py-2 @3xs:py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <i className="pi pi-lock text-base @3xs:text-lg text-primary"></i>
              <span className="font-semibold text-sm @3xs:text-base text-primary">Auth Control</span>
            </div>
          </div>
        </div>
        <div className="p-2 @3xs:p-4">
          <div className="space-y-2 @3xs:space-y-4">
            {/* Admin Mode Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Admin Mode</span>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={isAdminMode === true}
                  onChange={(e) => onAdminModeChange && onAdminModeChange(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${isAdminMode ? 'bg-blue-600' : 'bg-gray-300'}`}
                  onClick={() => onAdminModeChange && onAdminModeChange(!isAdminMode)}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${isAdminMode ? 'translate-x-5' : 'translate-x-0.5'}`}
                    style={{ marginTop: '2px' }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Sales Team Column - Always visible */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sales Team Column
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Select the column that contains sales team data
              </p>
              <SingleFieldSelector
                columns={columns}
                selectedField={salesTeamColumn}
                onSelectionChange={onSalesTeamColumnChange}
                formatFieldName={formatFieldName}
                placeholder="Select sales team column..."
              />
            </div>

            {/* Sales Team Values - Only show when Admin mode is OFF */}
            {!isAdminMode && salesTeamColumn && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sales Team Values
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Select one or more sales team values to filter by
                </p>
                <MultiSelect
                  value={salesTeamValues}
                  onChange={(e) => onSalesTeamValuesChange && onSalesTeamValuesChange(e.value || [])}
                  options={salesTeamUniqueValues.map(val => ({ label: String(val), value: String(val) }))}
                  optionLabel="label"
                  optionValue="value"
                  filter
                  filterPlaceholder="Search values..."
                  filterDelay={300}
                  className="w-full auth-control-multiselect"
                  panelClassName="custom-multiselect-panel"
                  display="chip"
                  showClear
                  resetFilterOnHide
                  emptyFilterMessage="No values match your search"
                  emptyMessage="No values available"
                  placeholder="Select sales team values..."
                />
              </div>
            )}

            {/* HQ Column - Always visible when salesTeamColumn is selected */}
            {salesTeamColumn && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  HQ Column
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Select the column that contains HQ data
                </p>
                <SingleFieldSelector
                  columns={columns}
                  selectedField={hqColumn}
                  onSelectionChange={onHqColumnChange}
                  formatFieldName={formatFieldName}
                  placeholder="Select HQ column..."
                />
              </div>
            )}

            {/* HQ Values - Only show when Admin mode is OFF and hqColumn is selected */}
            {!isAdminMode && hqColumn && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  HQ Values
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Select one or more HQ values to filter by
                </p>
                <MultiSelect
                  value={hqValues}
                  onChange={(e) => onHqValuesChange && onHqValuesChange(e.value || [])}
                  options={hqUniqueValues.map(val => ({ label: String(val), value: String(val) }))}
                  optionLabel="label"
                  optionValue="value"
                  filter
                  filterPlaceholder="Search values..."
                  filterDelay={300}
                  className="w-full auth-control-multiselect"
                  panelClassName="custom-multiselect-panel"
                  display="chip"
                  showClear
                  resetFilterOnHide
                  emptyFilterMessage="No values match your search"
                  emptyMessage="No values available"
                  placeholder="Select HQ values..."
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Icon-only mode when very small - show icons only */}
      <div className="@3xs:hidden flex flex-col items-center py-2 gap-2">
        {Object.keys(filteredVariables).length > 0 && (
          <div className="p-2 text-center" title="Variables">
            <i className="pi pi-code text-xl text-primary"></i>
          </div>
        )}
        <div className="p-2 text-center" title="Auth Control">
          <i className="pi pi-lock text-xl text-primary"></i>
        </div>
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
                <ToggleSwitch
                  checked={enableDivideBy1Lakh}
                  onChange={onDivideBy1LakhChange}
                  label="Divide by 1Lakh"
                  icon="pi pi-calculator"
                />
                {onEnableReportChange && (
                  <ToggleSwitch
                    checked={enableReport}
                    onChange={onEnableReportChange}
                    label="Enable Report"
                    icon="pi pi-chart-bar"
                  />
                )}
                {onCellEditChange && (
                  <ToggleSwitch
                    checked={enableCellEdit}
                    onChange={onCellEditChange}
                    label="Cell Editing"
                    icon="pi pi-pencil"
                  />
                )}
                <div className="mb-4 mt-4 pt-4 border-t border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Table Height
                  </label>
                  <input
                    type="text"
                    value={tableHeight || ''}
                    onChange={(e) => {
                      if (onTableHeightChange) {
                        onTableHeightChange(e.target.value);
                      }
                    }}
                    placeholder="60dvh"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Table height (e.g., "60dvh", "500px", "flex")
                  </p>
                </div>
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
                      Allowed Columns
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Select columns that users can choose to display (empty = allow all)
                    </p>
                    <FieldPicker
                      columns={columns}
                      selectedFields={allowedColumns}
                      onSelectionChange={onAllowedColumnsChange}
                      formatFieldName={formatFieldName}
                    />
                  </div>
                  {enableCellEdit && onEditableColumnsChange && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <i className="pi pi-pencil mr-2"></i>
                        Editable Columns
                      </label>
                      <p className="text-xs text-gray-500 mb-2">
                        Fields that can be edited (leave empty to allow all)
                      </p>
                      
                      {/* Main columns selector */}
                      <div className="mb-3">
                        <FieldPicker
                          columns={columns}
                          selectedFields={Array.isArray(editableColumns) ? editableColumns : (editableColumns?.main || [])}
                          onSelectionChange={(selected) => {
                            const currentNested = editableColumns?.nested || {};
                            // Remove nested config for columns that are no longer selected
                            const newNested = {};
                            selected.forEach(col => {
                              if (currentNested[col]) {
                                newNested[col] = currentNested[col];
                              }
                            });
                            const newEditableColumns = {
                              main: selected || [],
                              nested: newNested
                            };
                            onEditableColumnsChange(newEditableColumns);
                          }}
                          formatFieldName={formatFieldName}
                        />
                      </div>

                      {/* Nested table columns for JSON table columns */}
                      {Object.keys(jsonTableColumns).length > 0 && (() => {
                        const selectedMain = Array.isArray(editableColumns) ? editableColumns : (editableColumns?.main || []);
                        const selectedJsonColumns = selectedMain.filter(col => jsonTableColumns[col]);
                        const currentNested = editableColumns?.nested || {};
                        
                        if (selectedJsonColumns.length === 0) {
                          return null;
                        }
                        
                        return (
                          <div className="mt-4 space-y-3 pl-4 border-l-2 border-gray-200">
                            <p className="text-xs font-medium text-gray-600 mb-2">JSON Table Columns:</p>
                            {selectedJsonColumns.map(jsonCol => {
                              const jsonTableInfo = jsonTableColumns[jsonCol];
                              if (!jsonTableInfo || !jsonTableInfo.nestedTables || jsonTableInfo.nestedTables.length === 0) {
                                return null;
                              }
                              
                              // Collect all columns from all nested tables in this JSON table column
                              const allNestedColumns = [];
                              jsonTableInfo.nestedTables.forEach(nestedTable => {
                                if (nestedTable.columns && nestedTable.columns.length > 0) {
                                  nestedTable.columns.forEach(col => {
                                    if (!allNestedColumns.includes(col)) {
                                      allNestedColumns.push(col);
                                    }
                                  });
                                }
                              });
                              
                              // Get currently selected columns for this JSON table (flat: nested[column] = array)
                              const currentSelected = Array.isArray(currentNested[jsonCol]) ? [...currentNested[jsonCol]] : [];
                              
                              return (
                                <div key={jsonCol} className="space-y-2 mb-3">
                                  <label className="block text-xs font-medium text-gray-700">
                                    {formatFieldName(jsonCol)} - Select Columns:
                                  </label>
                                  <FieldPicker
                                    columns={allNestedColumns}
                                    selectedFields={currentSelected}
                                    onSelectionChange={(selected) => {
                                      const newNested = {
                                        ...currentNested,
                                        [jsonCol]: selected
                                      };
                                      onEditableColumnsChange({
                                        main: selectedMain,
                                        nested: newNested
                                      });
                                    }}
                                    formatFieldName={formatFieldName}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
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
                  {/* Use groupFields if available, otherwise fall back to outerGroupField/innerGroupField */}
                  {(() => {
                    const effectiveGroupFields = (groupFields && Array.isArray(groupFields) && groupFields.length > 0)
                      ? groupFields
                      : (outerGroupField ? [outerGroupField, ...(innerGroupField ? [innerGroupField] : [])] : []);

                    const handleLevelChange = (levelIndex, value) => {
                      if (!onGroupFieldsChange) {
                        // Fallback to old API if onGroupFieldsChange not provided
                        if (levelIndex === 0) {
                          onOuterGroupFieldChange?.(value);
                        } else if (levelIndex === 1) {
                          onInnerGroupFieldChange?.(value);
                        }
                        return;
                      }

                      const newGroupFields = [...effectiveGroupFields];
                      if (value === null) {
                        // Remove this level and all subsequent levels
                        newGroupFields.splice(levelIndex);
                      } else {
                        // Update or add level
                        if (levelIndex < newGroupFields.length) {
                          newGroupFields[levelIndex] = value;
                          // Remove subsequent levels if this level changed
                          newGroupFields.splice(levelIndex + 1);
                        } else {
                          newGroupFields.push(value);
                        }
                      }
                      onGroupFieldsChange(newGroupFields);
                    };

                    const handleRemoveLevel = (levelIndex) => {
                      if (!onGroupFieldsChange) {
                        // Fallback to old API
                        if (levelIndex === 0) {
                          onOuterGroupFieldChange?.(null);
                        } else if (levelIndex === 1) {
                          onInnerGroupFieldChange?.(null);
                        }
                        return;
                      }

                      const newGroupFields = [...effectiveGroupFields];
                      newGroupFields.splice(levelIndex);
                      onGroupFieldsChange(newGroupFields);
                    };

                    // Get available columns (exclude already selected fields)
                    const getAvailableColumns = (levelIndex) => {
                      return columns.filter(col => {
                        // Don't show columns that are already selected at other levels
                        return !effectiveGroupFields.slice(0, levelIndex).includes(col);
                      });
                    };

                    return (
                      <>
                        {effectiveGroupFields.map((field, index) => (
                          <div key={index} className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <label className="block text-sm font-medium text-gray-700">
                                  Level {index + 1} {index === 0 ? '(Outer Group)' : index === 1 ? '(Inner Group)' : ''}
                                </label>
                                <p className="text-xs text-gray-500 mt-1">
                                  {index === 0
                                    ? 'Creates expandable row groups'
                                    : `Aggregates data within Level ${index} groups`}
                                </p>
                              </div>
                              {index > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLevel(index)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Remove this level"
                                >
                                  <i className="pi pi-times text-sm"></i>
                                </button>
                              )}
                            </div>
                            <SingleFieldSelector
                              columns={getAvailableColumns(index)}
                              selectedField={field}
                              onSelectionChange={(value) => handleLevelChange(index, value)}
                              formatFieldName={formatFieldName}
                              placeholder={`Select Level ${index + 1} field...`}
                            />
                          </div>
                        ))}

                        {/* Always show next level dropdown directly (no add button needed) */}
                        {effectiveGroupFields.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <label className="block text-sm font-medium text-gray-700">
                                  Level {effectiveGroupFields.length + 1} {effectiveGroupFields.length === 1 ? '(Inner Group)' : ''}
                                </label>
                                <p className="text-xs text-gray-500 mt-1">
                                  Aggregates data within Level {effectiveGroupFields.length} groups
                                </p>
                              </div>
                            </div>
                            <SingleFieldSelector
                              columns={getAvailableColumns(effectiveGroupFields.length)}
                              selectedField={null}
                              onSelectionChange={(value) => handleLevelChange(effectiveGroupFields.length, value)}
                              formatFieldName={formatFieldName}
                              placeholder={`Select Level ${effectiveGroupFields.length + 1} field...`}
                            />
                          </div>
                        )}

                        {/* Initial level selector if no levels selected */}
                        {effectiveGroupFields.length === 0 && (
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Level 1 (Outer Group)
                            </label>
                            <p className="text-xs text-gray-500 mb-2">
                              Creates expandable row groups
                            </p>
                            <SingleFieldSelector
                              columns={columns}
                              selectedField={null}
                              onSelectionChange={(value) => handleLevelChange(0, value)}
                              formatFieldName={formatFieldName}
                              placeholder="Select Level 1 field..."
                            />
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </AccordionTab>
            )}

            {/* REPORT SETTINGS */}
            {enableReport && !isEmpty(columns) && (
              <AccordionTab header={
                <div className="flex align-items-center gap-2">
                  <i className="pi pi-chart-bar"></i>
                  <span>Report Settings</span>
                </div>
              }>
                <div className="m-0">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date Column
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Select the column containing date values for time-based breakdown
                    </p>
                    <SingleFieldSelector
                      columns={columns}
                      selectedField={dateColumn}
                      onSelectionChange={onDateColumnChange}
                      formatFieldName={formatFieldName}
                      placeholder="Select date column..."
                    />
                  </div>
                  {onShowChartChange && (
                    <div className="mb-4">
                      <ToggleSwitch
                        checked={showChart}
                        onChange={onShowChartChange}
                        label="Show Chart"
                        icon="pi pi-chart-line"
                        isLast={false}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Display line chart above the data table in report mode
                      </p>
                    </div>
                  )}
                  {showChart && onChartColumnsChange && !isEmpty(columns) && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <i className="pi pi-chart-line mr-2"></i>
                        Chart Columns
                      </label>
                      <p className="text-xs text-gray-500 mb-2">
                        Select columns to display in the chart (empty = show all)
                      </p>
                      <ChartColumnsPicker
                        columns={columns}
                        selectedColumns={chartColumns}
                        onSelectionChange={onChartColumnsChange}
                        formatFieldName={formatFieldName}
                      />
                    </div>
                  )}
                  {showChart && onChartHeightChange && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Chart Height
                      </label>
                      <p className="text-xs text-gray-500 mb-2">
                        Set the height of the chart in pixels
                      </p>
                      <input
                        type="number"
                        value={chartHeight || 400}
                        onChange={(e) => {
                          const value = parseInt(e.target.value, 10);
                          if (!isNaN(value) && value > 0) {
                            onChartHeightChange(value);
                          }
                        }}
                        min="100"
                        max="1000"
                        step="50"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

            {/* PERCENTAGE COLUMNS */}
            {!isEmpty(columns) && (
              <AccordionTab header={
                <div className="flex align-items-center gap-2">
                  <i className="pi pi-percentage"></i>
                  <span>Percentage Columns</span>
                </div>
              }>
                <div className="m-0">
                  <div className="space-y-4">
                    {Array.isArray(percentageColumns) && percentageColumns.map((pc, index) => (
                      <div key={index} className="p-3 border border-gray-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Percentage Column {index + 1}
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const newColumns = percentageColumns.filter((_, i) => i !== index);
                              onPercentageColumnsChange && onPercentageColumnsChange(newColumns);
                            }}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            <i className="pi pi-times"></i> Remove
                          </button>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Column Name
                          </label>
                          <InputText
                            value={pc.columnName || ''}
                            onChange={(e) => {
                              const newColumns = [...percentageColumns];
                              newColumns[index] = { ...pc, columnName: e.target.value };
                              onPercentageColumnsChange && onPercentageColumnsChange(newColumns);
                            }}
                            placeholder="Enter column name..."
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Target Field
                          </label>
                          <SingleFieldSelector
                            columns={columns}
                            selectedField={pc.targetField}
                            onSelectionChange={(value) => {
                              const newColumns = [...percentageColumns];
                              newColumns[index] = { ...pc, targetField: value };
                              onPercentageColumnsChange && onPercentageColumnsChange(newColumns);
                            }}
                            formatFieldName={formatFieldName}
                            placeholder="Select target field..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Value Field
                          </label>
                          <SingleFieldSelector
                            columns={columns}
                            selectedField={pc.valueField}
                            onSelectionChange={(value) => {
                              const newColumns = [...percentageColumns];
                              newColumns[index] = { ...pc, valueField: value };
                              onPercentageColumnsChange && onPercentageColumnsChange(newColumns);
                            }}
                            formatFieldName={formatFieldName}
                            placeholder="Select value field..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Position Before Column
                          </label>
                          <p className="text-xs text-gray-500 mb-2">
                            Select a column before which this percentage column should appear. If not specified, default positioning is used.
                          </p>
                          <SingleFieldSelector
                            columns={columns.filter(col => col !== pc.columnName)}
                            selectedField={pc.beforeColumn}
                            onSelectionChange={(value) => {
                              const newColumns = [...percentageColumns];
                              newColumns[index] = { ...pc, beforeColumn: value };
                              onPercentageColumnsChange && onPercentageColumnsChange(newColumns);
                            }}
                            formatFieldName={formatFieldName}
                            placeholder="Select column to position before (optional)..."
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const newColumns = [...(percentageColumns || []), { columnName: '', targetField: null, valueField: null, beforeColumn: null }];
                        onPercentageColumnsChange && onPercentageColumnsChange(newColumns);
                      }}
                      className="w-full py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                    >
                      <i className="pi pi-plus"></i>
                      Add Percentage Column
                    </button>
                  </div>
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

            {/* COLUMN TYPE OVERRIDES */}
            {!isEmpty(columns) && (
              <AccordionTab header={
                <div className="flex align-items-center gap-2">
                  <i className="pi pi-tags"></i>
                  <span>Column Type Overrides</span>
                </div>
              }>
                <div className="m-0">
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-3">
                      Override auto-detected column types. Select "Auto" to use detected type.
                    </p>
                    <ColumnTypeOverridesTree
                      columnTree={columnTree}
                      columnTypesOverride={columnTypesOverride}
                      onColumnTypesOverrideChange={onColumnTypesOverrideChange}
                      formatFieldName={formatFieldName}
                    />
                  </div>
                </div>
              </AccordionTab>
            )}
          </Accordion>
        </div>
      </>
    </div>
  );
}
