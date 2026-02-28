'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Toast } from 'primereact/toast';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { Sidebar } from 'primereact/sidebar';
import { TabView, TabPanel } from 'primereact/tabview';
import DataTableComponent from '../share/datatable/components/DataTable';
import DataTableControls from '../share/datatable/components/DataTableControls';
import data from '../resource/data';

import { uniq, flatMap, keys, isEmpty, startCase, filter as lodashFilter, get, isNil } from 'lodash';
import { saveSettingsForDataSource, loadSettingsForDataSource } from '../lib/settingsService';
import { useTableContext } from './TableContext';
import { TableOperationsContext } from '../share/datatable/contexts/TableOperationsContext';
import { useContext } from 'react';

// Custom hook for localStorage with proper JSON serialization for booleans
function useLocalStorageBoolean(key, defaultValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = window.localStorage.getItem(key);
      if (item === null || item === undefined) return defaultValue;
      const parsed = JSON.parse(item);
      return typeof parsed === 'boolean' ? parsed : defaultValue;
    } catch (error) {
      try {
        window.localStorage.removeItem(key);
      } catch { }
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null && item !== undefined) {
        const parsed = JSON.parse(item);
        if (typeof parsed === 'boolean') {
          setValue(parsed);
        }
      }
    } catch (error) { }
  }, [key]);

  const setStoredValue = (newValue) => {
    try {
      if (typeof newValue === 'boolean') {
        const serialized = JSON.stringify(newValue);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, serialized);
        }
        setValue(newValue);
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [value, setStoredValue];
}

// Custom hook for localStorage with proper JSON serialization for arrays
function useLocalStorageArray(key, defaultValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = window.localStorage.getItem(key);
      if (item === null || item === undefined) return defaultValue;
      const parsed = JSON.parse(item);
      return Array.isArray(parsed) ? parsed : defaultValue;
    } catch (error) {
      try {
        window.localStorage.removeItem(key);
      } catch { }
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null && item !== undefined) {
        const parsed = JSON.parse(item);
        if (Array.isArray(parsed)) {
          setValue(parsed);
        }
      }
    } catch (error) { }
  }, [key]);

  const setStoredValue = (newValue) => {
    try {
      if (typeof newValue === 'function') {
        setValue(prev => {
          const updated = newValue(prev);
          if (Array.isArray(updated)) {
            const serialized = JSON.stringify(updated);
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(key, serialized);
            }
            return updated;
          }
          return prev;
        });
      } else if (Array.isArray(newValue)) {
        const serialized = JSON.stringify(newValue);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, serialized);
        }
        setValue(newValue);
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [value, setStoredValue];
}

// Custom hook for localStorage with proper JSON serialization for string/null values
function useLocalStorageString(key, defaultValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = window.localStorage.getItem(key);
      if (item === null || item === undefined) return defaultValue;
      const parsed = JSON.parse(item);
      return (typeof parsed === 'string' || parsed === null) ? parsed : defaultValue;
    } catch (error) {
      try {
        window.localStorage.removeItem(key);
      } catch { }
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null && item !== undefined) {
        const parsed = JSON.parse(item);
        if (typeof parsed === 'string' || parsed === null) {
          setValue(parsed);
        }
      }
    } catch (error) { }
  }, [key]);

  const setStoredValue = (newValue) => {
    try {
      if (typeof newValue === 'string' || newValue === null) {
        const serialized = JSON.stringify(newValue);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, serialized);
        }
        setValue(newValue);
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [value, setStoredValue];
}

// Custom hook for localStorage with proper JSON serialization for numbers
function useLocalStorageNumber(key, defaultValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = window.localStorage.getItem(key);
      if (item === null || item === undefined) return defaultValue;
      const parsed = JSON.parse(item);
      return (typeof parsed === 'number' && !isNaN(parsed) && parsed > 0) ? parsed : defaultValue;
    } catch (error) {
      try {
        window.localStorage.removeItem(key);
      } catch { }
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null && item !== undefined) {
        const parsed = JSON.parse(item);
        if (typeof parsed === 'number' && !isNaN(parsed) && parsed > 0) {
          setValue(parsed);
        }
      }
    } catch (error) { }
  }, [key]);

  const setStoredValue = (newValue) => {
    try {
      if (typeof newValue === 'number' && !isNaN(newValue) && newValue > 0) {
        const serialized = JSON.stringify(newValue);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, serialized);
        }
        setValue(newValue);
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [value, setStoredValue];
}

// Custom hook for localStorage with proper JSON serialization for objects
function useLocalStorageObject(key, defaultValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = window.localStorage.getItem(key);
      if (item === null || item === undefined) return defaultValue;
      const parsed = JSON.parse(item);
      return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? parsed : defaultValue;
    } catch (error) {
      try {
        window.localStorage.removeItem(key);
      } catch { }
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null && item !== undefined) {
        const parsed = JSON.parse(item);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          setValue(parsed);
        }
      }
    } catch (error) { }
  }, [key]);

  const setStoredValue = (newValue) => {
    try {
      if (typeof newValue === 'object' && newValue !== null && !Array.isArray(newValue)) {
        const serialized = JSON.stringify(newValue);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, serialized);
        }
        setValue(newValue);
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [value, setStoredValue];
}

const DataTableWrapper = (props) => {
  const context = useTableContext();
  const orchestrationContext = useContext(TableOperationsContext);
  
  const {
    className,
    showControls = true,
    enableSort: propEnableSort,
    enableFilter: propEnableFilter,
    enableSummation: propEnableSummation,
    enableCellEdit: propEnableCellEdit,
    rowsPerPageOptions: propRowsPerPageOptions,
    defaultRows: propDefaultRows,
    textFilterColumns: propTextFilterColumns,
    visibleColumns: propVisibleColumns,
    redFields: propRedFields,
    greenFields: propGreenFields,
    outerGroupField: propOuterGroupField,
    innerGroupField: propInnerGroupField,
    nonEditableColumns: propNonEditableColumns,
    enableDivideBy1Lakh: propEnableDivideBy1Lakh,
    percentageColumns: propPercentageColumns,
    enableFullscreenDialog: propEnableFullscreenDialog,
    columnTypes: propColumnTypes,
    scrollable: propScrollable = true,
    scrollHeight: propScrollHeight,
    drawerTabs: propDrawerTabs,
    enableReport: propEnableReport,
    dateColumn: propDateColumn,
    breakdownType: propBreakdownType,
    controlsPanelSize: propControlsPanelSize = 20,
    useOrchestrationLayer: propUseOrchestrationLayer,
    enableGrouping: propEnableGrouping,
    onVisibleColumnsChange: propOnVisibleColumnsChange,
    onDrawerTabsChange: propOnDrawerTabsChange,
    onColumnTypesChange,
    onAdminModeChange: propOnAdminModeChange,
    onEnableReportChange: propOnEnableReportChange,
    onDateColumnChange: propOnDateColumnChange,
    onBreakdownTypeChange: propOnBreakdownTypeChange,
    onOuterGroupFieldChange: propOnOuterGroupFieldChange,
    onInnerGroupFieldChange: propOnInnerGroupFieldChange,
    onSave,
    onVariableOverridesChange,
    tableName: propTableName = 'main',
  } = props;

  const propOnColumnTypesChange = onColumnTypesChange;

  // 1. Hooks (State & LocalStorage)
  const [enableSortState, setEnableSort] = useLocalStorageBoolean('datatable-enableSort', true);
  const [enableFilterState, setEnableFilter] = useLocalStorageBoolean('datatable-enableFilter', true);
  const [enableSummationState, setEnableSummation] = useLocalStorageBoolean('datatable-enableSummation', true);
  const [enableCellEditState, setEnableCellEdit] = useLocalStorageBoolean('datatable-enableCellEdit', false);
  const [rowsPerPageOptionsRawState, setRowsPerPageOptionsRaw] = useLocalStorageArray('datatable-rowsPerPageOptions', [5, 10, 25, 50, 100, 200]);
  const [defaultRowsRawState, setDefaultRowsRaw] = useLocalStorageNumber('datatable-defaultRows', 10);
  const [textFilterColumnsRawState, setTextFilterColumnsRaw] = useLocalStorageArray('datatable-textFilterColumns', []);
  const [visibleColumnsRawState, setVisibleColumnsRaw] = useLocalStorageArray('datatable-visibleColumns', []);
  const [redFieldsRawState, setRedFieldsRaw] = useLocalStorageArray('datatable-redFields', []);
  const [greenFieldsRawState, setGreenFieldsRaw] = useLocalStorageArray('datatable-greenFields', []);
  const [nonEditableColumnsRawState, setNonEditableColumnsRaw] = useLocalStorageArray('datatable-nonEditableColumns', []);
  const [enableDivideBy1LakhState, setEnableDivideBy1Lakh] = useLocalStorageBoolean('datatable-enableDivideBy1Lakh', false);
  const [enableFullscreenDialogState, setEnableFullscreenDialog] = useLocalStorageBoolean('datatable-enableFullscreenDialog', true);
  const [percentageColumnsRawState, setPercentageColumnsRaw] = useLocalStorageArray('datatable-percentageColumns', []);
  const [isAdminModeState, setIsAdminMode] = useLocalStorageBoolean('datatable-isAdminMode', false);
  const [salesTeamColumnRawState, setSalesTeamColumnRaw] = useLocalStorageString('datatable-salesTeamColumn', null);
  const [salesTeamValuesRawState, setSalesTeamValuesRaw] = useLocalStorageArray('datatable-salesTeamValues', []);
  const [hqColumnRawState, setHqColumnRaw] = useLocalStorageString('datatable-hqColumn', null);
  const [hqValuesRawState, setHqValuesRaw] = useLocalStorageArray('datatable-hqValues', []);
  const [columnTypesRawState, setColumnTypesRaw] = useLocalStorageObject('datatable-columnTypes', {});
  const [enableGroupingState, setEnableGrouping] = useLocalStorageBoolean('datatable-enableGrouping', true);

  // 2. Base data/variables from props or context
  const propData = (props.data && Array.isArray(props.data) && props.data.length > 0) ? props.data : context?.tableData;
  const propRawData = (props.rawTableData && Array.isArray(props.rawTableData) && props.rawTableData.length > 0) ? props.rawTableData : context?.rawTableData;
  const propDataSource = (props.dataSource && props.dataSource !== 'offline') ? props.dataSource : context?.dataSource;
  const propQueryVariables = (props.queryVariables && Object.keys(props.queryVariables).length > 0) ? props.queryVariables : context?.queryVariables;
  
  const propIsAdminMode = props.isAdminMode !== undefined ? props.isAdminMode : context?.isAdminMode;
  const propSalesTeamColumn = props.salesTeamColumn !== undefined ? props.salesTeamColumn : context?.salesTeamColumn;
  const propSalesTeamValues = (props.salesTeamValues && props.salesTeamValues.length > 0) ? props.salesTeamValues : context?.salesTeamValues;
  const propHqColumn = props.hqColumn !== undefined ? props.hqColumn : context?.hqColumn;
  const propHqValues = (props.hqValues && props.hqValues.length > 0) ? props.hqValues : context?.hqValues;

  // 3. Derived values (moved up to avoid ReferenceError in useEffect)
  const useOrchestrationLayer = propUseOrchestrationLayer !== undefined ? propUseOrchestrationLayer : (context?.useOrchestrationLayer || false);
  const enableGrouping = propEnableGrouping !== undefined ? propEnableGrouping : (context?.enableGrouping || true);
  const isAdminMode = propIsAdminMode !== undefined ? propIsAdminMode : isAdminModeState;

  const enableSort = propEnableSort !== undefined && propEnableSort !== null ? propEnableSort : (context?.enableSort !== undefined && context.enableSort !== null ? context.enableSort : enableSortState);
  const enableFilter = propEnableFilter !== undefined && propEnableFilter !== null ? propEnableFilter : (context?.enableFilter !== undefined && context.enableFilter !== null ? context.enableFilter : enableFilterState);
  const enableSummation = propEnableSummation !== undefined && propEnableSummation !== null ? propEnableSummation : (context?.enableSummation !== undefined && context.enableSummation !== null ? context.enableSummation : enableSummationState);
  const enableCellEdit = propEnableCellEdit !== undefined && propEnableCellEdit !== null ? propEnableCellEdit : enableCellEditState;
  const rowsPerPageOptions = propRowsPerPageOptions !== undefined && propRowsPerPageOptions !== null ? propRowsPerPageOptions : rowsPerPageOptionsRawState;
  const defaultRows = propDefaultRows !== undefined && propDefaultRows !== null ? propDefaultRows : defaultRowsRawState;
  const textFilterColumns = propTextFilterColumns !== undefined && propTextFilterColumns !== null ? propTextFilterColumns : (context?.textFilterColumns !== undefined && context.textFilterColumns !== null ? context.textFilterColumns : textFilterColumnsRawState);
  const visibleColumns = propVisibleColumns !== undefined && propVisibleColumns !== null ? propVisibleColumns : (context?.visibleColumns !== undefined && context.visibleColumns !== null ? context.visibleColumns : visibleColumnsRawState);
  const redFields = propRedFields !== undefined && propRedFields !== null ? propRedFields : (context?.redFields !== undefined && context.redFields !== null ? context.redFields : redFieldsRawState);
  const greenFields = propGreenFields !== undefined && propGreenFields !== null ? propGreenFields : (context?.greenFields !== undefined && context.greenFields !== null ? context.greenFields : greenFieldsRawState);
  const nonEditableColumns = propNonEditableColumns !== undefined && propNonEditableColumns !== null ? propNonEditableColumns : nonEditableColumnsRawState;
  const enableDivideBy1Lakh = propEnableDivideBy1Lakh !== undefined && propEnableDivideBy1Lakh !== null ? propEnableDivideBy1Lakh : (context?.enableDivideBy1Lakh !== undefined && context.enableDivideBy1Lakh !== null ? context.enableDivideBy1Lakh : enableDivideBy1LakhState);
  const enableFullscreenDialog = propEnableFullscreenDialog !== undefined && propEnableFullscreenDialog !== null ? propEnableFullscreenDialog : enableFullscreenDialogState;
  const percentageColumns = propPercentageColumns !== undefined && propPercentageColumns !== null ? propPercentageColumns : (context?.percentageColumns !== undefined && context.percentageColumns !== null ? context.percentageColumns : percentageColumnsRawState);
  const salesTeamColumn = propSalesTeamColumn !== undefined ? propSalesTeamColumn : salesTeamColumnRawState;
  const salesTeamValues = propSalesTeamValues !== undefined ? propSalesTeamValues : salesTeamValuesRawState;
  const hqColumn = propHqColumn !== undefined ? propHqColumn : hqColumnRawState;
  const hqValues = propHqValues !== undefined ? propHqValues : hqValuesRawState;
  
  // New derived values from context
  const outerGroupField = propOuterGroupField !== undefined ? propOuterGroupField : context?.outerGroupField;
  const innerGroupField = propInnerGroupField !== undefined ? propInnerGroupField : context?.innerGroupField;
  const drawerTabs = (propDrawerTabs && propDrawerTabs.length > 0) ? propDrawerTabs : context?.drawerTabs;
  const enableReport = propEnableReport !== undefined ? propEnableReport : context?.enableReport;
  const dateColumn = propDateColumn !== null ? propDateColumn : context?.dateColumn;
  const breakdownType = propBreakdownType !== undefined ? propBreakdownType : context?.breakdownType;

  const columnTypes = useMemo(() => {
    const contextTypes = context?.columnTypes || {};
    const storedTypes = columnTypesRawState || {};
    const manualTypes = propColumnTypes || {};
    return { ...contextTypes, ...storedTypes, ...manualTypes };
  }, [propColumnTypes, context?.columnTypes, columnTypesRawState]);
  
  // 4. Sync settings to localStorage
  const settingsString = JSON.stringify({
    propEnableSort, propEnableFilter, propEnableSummation, propEnableCellEdit,
    propRowsPerPageOptions, propDefaultRows, propTextFilterColumns, propVisibleColumns,
    propRedFields, propGreenFields,
    propNonEditableColumns,
    propEnableDivideBy1Lakh, propEnableFullscreenDialog, propPercentageColumns, propIsAdminMode, propSalesTeamColumn,
    propSalesTeamValues, propHqColumn, propHqValues, propColumnTypes, useOrchestrationLayer, enableGrouping
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const syncToStore = (key, value) => {
      if (value !== undefined && value !== null) {
        const stringified = JSON.stringify(value);
        if (window.localStorage.getItem(key) !== stringified) {
          window.localStorage.setItem(key, stringified);
        }
      }
    };

    syncToStore('datatable-enableSort', propEnableSort);
    syncToStore('datatable-enableFilter', propEnableFilter);
    syncToStore('datatable-enableSummation', propEnableSummation);
    syncToStore('datatable-enableCellEdit', propEnableCellEdit);
    syncToStore('datatable-rowsPerPageOptions', propRowsPerPageOptions);
    syncToStore('datatable-defaultRows', propDefaultRows);
    syncToStore('datatable-textFilterColumns', propTextFilterColumns);
    syncToStore('datatable-visibleColumns', propVisibleColumns);
    syncToStore('datatable-redFields', propRedFields);
    syncToStore('datatable-greenFields', propGreenFields);
    syncToStore('datatable-outerGroupField', propOuterGroupField);
    syncToStore('datatable-innerGroupField', propInnerGroupField);
    syncToStore('datatable-nonEditableColumns', propNonEditableColumns);
    syncToStore('datatable-enableDivideBy1Lakh', propEnableDivideBy1Lakh);
    syncToStore('datatable-enableFullscreenDialog', propEnableFullscreenDialog);
    syncToStore('datatable-percentageColumns', propPercentageColumns);
    syncToStore('datatable-isAdminMode', propIsAdminMode);
    syncToStore('datatable-salesTeamColumn', propSalesTeamColumn);
    syncToStore('datatable-salesTeamValues', propSalesTeamValues);
    syncToStore('datatable-hqColumn', propHqColumn);
    syncToStore('datatable-hqValues', propHqValues);
    syncToStore('datatable-drawerTabs', propDrawerTabs);
    syncToStore('datatable-columnTypes', propColumnTypes);
    syncToStore('datatable-useOrchestrationLayer', useOrchestrationLayer);
    syncToStore('datatable-enableGrouping', enableGrouping);
  }, [settingsString, useOrchestrationLayer, enableGrouping]);

  const toast = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tableData, setTableData] = useState(propData || data);

  // Sync tableData with propData using stringified check to prevent loops
  const stringifiedData = JSON.stringify(propData);
  useEffect(() => {
    if (propData !== undefined) {
      setTableData(propData);
      if (propData && Array.isArray(propData)) {
        originalTableDataRef.current = propData;
      }
    }
  }, [stringifiedData]);

  const [currentDataSource, setCurrentDataSource] = useState(propDataSource || null);

  // Sync currentDataSource with propDataSource
  useEffect(() => {
    if (propDataSource !== undefined) {
      setCurrentDataSource(propDataSource);
    }
  }, [propDataSource]);

  const [queryVariables, setQueryVariables] = useState(propQueryVariables || {});

  // Sync queryVariables with propQueryVariables using stringified check
  const stringifiedVariables = JSON.stringify(propQueryVariables);
  useEffect(() => {
    if (propQueryVariables !== undefined) {
      setQueryVariables(propQueryVariables);
    }
  }, [stringifiedVariables]);

  const [variableOverrides, setVariableOverrides] = useState({});

  const handleVisibleColumnsChange = (newColumns) => {
    setVisibleColumnsRaw(newColumns);
    if (propOnVisibleColumnsChange) propOnVisibleColumnsChange(newColumns);
    if (orchestrationContext?.updateVisibleColumns) orchestrationContext.updateVisibleColumns(newColumns);
  };

  const handleDrawerTabsChange = (newTabs) => {
    setDrawerTabs(newTabs);
    if (propOnDrawerTabsChange) propOnDrawerTabsChange(newTabs);
  };

  const handleColumnTypesChange = (newTypes) => {
    setColumnTypesRaw(newTypes);
    if (propOnColumnTypesChange) propOnColumnTypesChange(newTypes);
  };

  const handleAdminModeChange = (isAdmin) => {
    setIsAdminMode(isAdmin);
    if (propOnAdminModeChange) propOnAdminModeChange(isAdmin);
  };

  const handleVariableOverridesChangeInternal = (newOverrides) => {
    setVariableOverrides(newOverrides);
    if (onVariableOverridesChange) {
      onVariableOverridesChange(newOverrides);
    }
  };


  // Drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerData, setDrawerData] = useState([]);
  const [activeDrawerTabIndex, setActiveDrawerTabIndex] = useState(0);
  const [clickedDrawerValues, setClickedDrawerValues] = useState({ outerValue: null, innerValue: null });

  const originalTableDataRef = useRef(null);

  // Set loading false on mount
  useEffect(() => {
    setIsLoading(false);
  }, []);

  const handleTableDataChange = (newTableData) => {
    setTableData(newTableData);
    if (newTableData && Array.isArray(newTableData)) {
      originalTableDataRef.current = newTableData;
    }
  };

  const handleDataSourceChange = useCallback((dataSource) => {
    setCurrentDataSource(dataSource);
    if (!dataSource) return;

    const savedSettings = loadSettingsForDataSource(dataSource);
    if (savedSettings) {
      if (savedSettings.enableSort !== undefined) setEnableSort(savedSettings.enableSort);
      if (savedSettings.enableFilter !== undefined) setEnableFilter(savedSettings.enableFilter);
      if (savedSettings.enableSummation !== undefined) setEnableSummation(savedSettings.enableSummation);
      if (savedSettings.enableCellEdit !== undefined) setEnableCellEdit(savedSettings.enableCellEdit);
      if (savedSettings.rowsPerPageOptions) setRowsPerPageOptionsRaw(savedSettings.rowsPerPageOptions);
      if (savedSettings.defaultRows !== undefined) setDefaultRowsRaw(savedSettings.defaultRows);
      if (savedSettings.textFilterColumns) setTextFilterColumnsRaw(savedSettings.textFilterColumns);
      if (savedSettings.visibleColumns) setVisibleColumnsRaw(savedSettings.visibleColumns);
      if (savedSettings.redFields) setRedFieldsRaw(savedSettings.redFields);
      if (savedSettings.greenFields) setGreenFieldsRaw(savedSettings.greenFields);
      if (savedSettings.outerGroupField !== undefined) setOuterGroupFieldRaw(savedSettings.outerGroupField);
      if (savedSettings.innerGroupField !== undefined) setInnerGroupFieldRaw(savedSettings.innerGroupField);
      if (savedSettings.nonEditableColumns) setNonEditableColumnsRaw(savedSettings.nonEditableColumns);
      if (savedSettings.enableDivideBy1Lakh !== undefined) setEnableDivideBy1Lakh(savedSettings.enableDivideBy1Lakh);
      if (savedSettings.percentageColumns !== undefined) setPercentageColumnsRaw(savedSettings.percentageColumns);
      if (savedSettings.isAdminMode !== undefined) setIsAdminMode(savedSettings.isAdminMode);
      if (savedSettings.salesTeamColumn !== undefined) setSalesTeamColumnRaw(savedSettings.salesTeamColumn);
      if (savedSettings.salesTeamValues !== undefined) setSalesTeamValuesRaw(savedSettings.salesTeamValues);
      if (savedSettings.hqColumn !== undefined) setHqColumnRaw(savedSettings.hqColumn);
      if (savedSettings.hqValues !== undefined) setHqValuesRaw(savedSettings.hqValues);
      if (savedSettings.drawerTabs !== undefined) setDrawerTabs(savedSettings.drawerTabs);
      if (savedSettings.columnTypes !== undefined) setColumnTypesRaw(savedSettings.columnTypes);
    }
  }, []);

  const handleSaveSettings = () => {
    if (!currentDataSource) {
      toast.current?.show({ severity: 'warn', summary: 'Warning', detail: 'Select a data source first', life: 3000 });
      return;
    }

    const settings = {
      enableSort, enableFilter, enableSummation, enableCellEdit, enableGrouping,
      rowsPerPageOptions, defaultRows, textFilterColumns, visibleColumns,
      redFields, greenFields, outerGroupField, innerGroupField,
      nonEditableColumns, drawerTabs,
      enableDivideBy1Lakh, enableFullscreenDialog, percentageColumns, isAdminMode, salesTeamColumn,
      salesTeamValues, hqColumn, hqValues, columnTypes, useOrchestrationLayer
    };

    try {
      saveSettingsForDataSource(currentDataSource, settings);
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Settings saved', life: 3000 });
      if (onSave) onSave();
    } catch (error) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to save settings', life: 3000 });
    }
  };

  const columns = useMemo(() => {
    if (!Array.isArray(tableData) || isEmpty(tableData)) return [];
    return uniq(flatMap(tableData, (item) => item && typeof item === 'object' ? keys(item) : []));
  }, [tableData]);

  const handleCellEditComplete = (e) => {
    const { newValue, field, oldValue } = e;
    const columnName = startCase(field.split('__').join(' ').split('_').join(' '));
    toast.current?.show({
      severity: 'success',
      summary: 'Cell Updated',
      detail: `Column: ${columnName} | Previous: ${oldValue} → Current: ${newValue}`,
      life: 5000
    });
  };

  const handleOuterGroupClick = (rowData, column, value) => {
    const originalData = originalTableDataRef.current || tableData;
    if (!Array.isArray(originalData)) return;

    setClickedDrawerValues({ outerValue: value, innerValue: null });
    setActiveDrawerTabIndex(0);

    let filteredData = lodashFilter(originalData, (row) => {
      const rowValue = get(row, outerGroupField);
      return isNil(value) ? isNil(rowValue) : String(rowValue) === String(value);
    });

    // Apply auth filters for drawer if not admin
    if (!isAdminMode) {
      if (salesTeamColumn && salesTeamValues && salesTeamValues.length > 0) {
        const allowedTeams = lodashFilter(flatMap([salesTeamValues], v => v), v => !isNil(v)).map(v => String(v).trim().toLowerCase());
        filteredData = lodashFilter(filteredData, (row) => {
          const rowValue = get(row, salesTeamColumn);
          if (Array.isArray(rowValue)) {
            return rowValue.some(rv => allowedTeams.includes(String(rv).trim().toLowerCase()));
          }
          return !isNil(rowValue) && allowedTeams.includes(String(rowValue).trim().toLowerCase());
        });
      }
      if (hqColumn && hqValues && hqValues.length > 0) {
        const allowedHqs = lodashFilter(flatMap([hqValues], v => v), v => !isNil(v)).map(v => String(v).trim().toLowerCase());
        filteredData = lodashFilter(filteredData, (row) => {
          const rowValue = get(row, hqColumn);
          if (Array.isArray(rowValue)) {
            return rowValue.some(rv => allowedHqs.includes(String(rv).trim().toLowerCase()));
          }
          return !isNil(rowValue) && allowedHqs.includes(String(rowValue).trim().toLowerCase());
        });
      }
    }

    setDrawerData(filteredData);
    setDrawerVisible(true);
  };

  const handleInnerGroupClick = (rowData, column, value) => {
    const originalData = originalTableDataRef.current || tableData;
    if (!Array.isArray(originalData)) return;

    const outerValue = get(rowData, outerGroupField);
    setClickedDrawerValues({ outerValue, innerValue: value });
    setActiveDrawerTabIndex(0);

    let filteredData = lodashFilter(originalData, (row) => {
      const rowOuterValue = get(row, outerGroupField);
      const rowInnerValue = get(row, innerGroupField);

      let outerMatch = isNil(outerValue) ? isNil(rowOuterValue) : String(rowOuterValue) === String(outerValue);
      if (!outerMatch) return false;

      return isNil(value) ? isNil(rowInnerValue) : String(rowInnerValue) === String(value);
    });

    // Apply auth filters for drawer if not admin
    if (!isAdminMode) {
      if (salesTeamColumn && salesTeamValues && salesTeamValues.length > 0) {
        const allowedTeams = lodashFilter(flatMap([salesTeamValues], v => v), v => !isNil(v)).map(v => String(v).trim().toLowerCase());
        filteredData = lodashFilter(filteredData, (row) => {
          const rowValue = get(row, salesTeamColumn);
          if (Array.isArray(rowValue)) {
            return rowValue.some(rv => allowedTeams.includes(String(rv).trim().toLowerCase()));
          }
          return !isNil(rowValue) && allowedTeams.includes(String(rowValue).trim().toLowerCase());
        });
      }
      if (hqColumn && hqValues && hqValues.length > 0) {
        const allowedHqs = lodashFilter(flatMap([hqValues], v => v), v => !isNil(v)).map(v => String(v).trim().toLowerCase());
        filteredData = lodashFilter(filteredData, (row) => {
          const rowValue = get(row, hqColumn);
          if (Array.isArray(rowValue)) {
            return rowValue.some(rv => allowedHqs.includes(String(rv).trim().toLowerCase()));
          }
          return !isNil(rowValue) && allowedHqs.includes(String(rowValue).trim().toLowerCase());
        });
      }
    }

    setDrawerData(filteredData);
    setDrawerVisible(true);
  };

  const handleAddDrawerTab = useCallback(() => {
    const newTab = { id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, name: '', outerGroup: null, innerGroup: null };
    setDrawerTabs(prev => [...prev, newTab]);
    setActiveDrawerTabIndex(drawerTabs.length);
  }, [drawerTabs]);

  const handleRemoveDrawerTab = useCallback((tabId) => {
    if (drawerTabs.length <= 1) return;
    const newTabs = drawerTabs.filter(tab => tab.id !== tabId);
    setDrawerTabs(newTabs);
    if (activeDrawerTabIndex >= newTabs.length) setActiveDrawerTabIndex(newTabs.length - 1);
  }, [drawerTabs, activeDrawerTabIndex]);

  const handleUpdateDrawerTab = useCallback((tabId, updates) => {
    setDrawerTabs(prev => prev.map(tab => tab.id === tabId ? { ...tab, ...updates } : tab));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-600 mb-4"></div>
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <Toast ref={toast} />
      
      <div className="flex-1 min-h-0">
        {showControls ? (
          <Splitter style={{ height: '100%' }} layout="horizontal">
            <SplitterPanel className="flex flex-col min-w-0" size={100 - propControlsPanelSize}>
              <div className="flex-1 p-4 overflow-auto">
                {tableData === null ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <i className="pi pi-table text-6xl text-gray-200 mb-4"></i>
                    <h3 className="text-lg font-medium text-gray-700">No Data</h3>
                    <p className="text-sm text-gray-500">Select a source to begin</p>
                  </div>
                ) : (
                  <DataTableComponent
                    data={tableData}
                    useOrchestrationLayer={useOrchestrationLayer}
                    rowsPerPageOptions={rowsPerPageOptions}
                    defaultRows={defaultRows}
                    scrollable={propScrollable}
                    scrollHeight={propScrollHeight}
                    enableSort={enableSort}
                    enableFilter={enableFilter}
                    enableSummation={enableSummation}
                    textFilterColumns={textFilterColumns}
                    visibleColumns={visibleColumns}
                    onVisibleColumnsChange={handleVisibleColumnsChange}
                    redFields={redFields}
                    greenFields={greenFields}
                    outerGroupField={outerGroupField}
                    innerGroupField={innerGroupField}
                    enableCellEdit={enableCellEdit}
                    nonEditableColumns={nonEditableColumns}
                    percentageColumns={percentageColumns}
                    enableDivideBy1Lakh={enableDivideBy1Lakh}
                    enableFullscreenDialog={enableFullscreenDialog}
                    onCellEditComplete={handleCellEditComplete}
                    onOuterGroupClick={handleOuterGroupClick}
                    onInnerGroupClick={handleInnerGroupClick}
                    columnTypes={columnTypes}
                    tableName={propTableName}
                  />
                )}
              </div>
            </SplitterPanel>

            <SplitterPanel className="flex flex-col min-w-0 border-l border-gray-200" size={propControlsPanelSize}>
              <DataTableControls
                enableSort={enableSort}
                enableFilter={enableFilter}
                enableSummation={enableSummation}
                enableCellEdit={enableCellEdit}
                enableDivideBy1Lakh={enableDivideBy1Lakh}
                rowsPerPageOptions={rowsPerPageOptions}
                defaultRows={defaultRows}
                columns={columns}
                textFilterColumns={textFilterColumns}
                visibleColumns={visibleColumns}
                redFields={redFields}
                greenFields={greenFields}
                outerGroupField={outerGroupField}
                innerGroupField={innerGroupField}
                nonEditableColumns={nonEditableColumns}
                percentageColumns={percentageColumns}
                dataSource={currentDataSource}
                queryVariables={queryVariables}
                variableOverrides={variableOverrides}
                onVariableOverrideChange={handleVariableOverridesChangeInternal}
                onSortChange={setEnableSort}
                onFilterChange={setEnableFilter}
                onSummationChange={setEnableSummation}
                onCellEditChange={setEnableCellEdit}
                onDivideBy1LakhChange={setEnableDivideBy1Lakh}
                onRowsPerPageOptionsChange={setRowsPerPageOptionsRaw}
                onDefaultRowsChange={setDefaultRowsRaw}
                onTextFilterColumnsChange={setTextFilterColumnsRaw}
                onVisibleColumnsChange={handleVisibleColumnsChange}
                onRedFieldsChange={setRedFieldsRaw}
                onGreenFieldsChange={setGreenFieldsRaw}
                onOuterGroupFieldChange={(field) => {
                  if (propOnOuterGroupFieldChange) propOnOuterGroupFieldChange(field);
                  if (context?.onOuterGroupFieldChange) context.onOuterGroupFieldChange(field);
                }}
                onInnerGroupFieldChange={(field) => {
                  if (propOnInnerGroupFieldChange) propOnInnerGroupFieldChange(field);
                  if (context?.onInnerGroupFieldChange) context.onInnerGroupFieldChange(field);
                }}
                onNonEditableColumnsChange={setNonEditableColumnsRaw}
                onPercentageColumnsChange={setPercentageColumnsRaw}
                onSaveSettings={handleSaveSettings}
                drawerTabs={drawerTabs}
                onDrawerTabsChange={handleDrawerTabsChange}
                onAddDrawerTab={handleAddDrawerTab}
                onRemoveDrawerTab={handleRemoveDrawerTab}
                onUpdateDrawerTab={handleUpdateDrawerTab}
                isAdminMode={isAdminMode}
                salesTeamColumn={salesTeamColumn}
                salesTeamValues={salesTeamValues}
                hqColumn={hqColumn}
                hqValues={hqValues}
                tableData={propRawData || tableData}
                onAdminModeChange={handleAdminModeChange}
                onSalesTeamColumnChange={setSalesTeamColumnRaw}
                onSalesTeamValuesChange={setSalesTeamValuesRaw}
                onHqColumnChange={setHqColumnRaw}
                onHqValuesChange={setHqValuesRaw}
                columnTypesOverride={columnTypes}
                onColumnTypesOverrideChange={handleColumnTypesChange}
                enableReport={enableReport}
                dateColumn={dateColumn}
                breakdownType={breakdownType}
                onEnableReportChange={(val) => {
                  if (propOnEnableReportChange) propOnEnableReportChange(val);
                  if (context?.onEnableReportChange) context.onEnableReportChange(val);
                }}
                onDateColumnChange={(val) => {
                  if (propOnDateColumnChange) propOnDateColumnChange(val);
                  if (context?.onDateColumnChange) context.onDateColumnChange(val);
                }}
                onBreakdownTypeChange={(val) => {
                  if (propOnBreakdownTypeChange) propOnBreakdownTypeChange(val);
                  if (context?.onBreakdownTypeChange) context.onBreakdownTypeChange(val);
                }}
              />
            </SplitterPanel>
          </Splitter>
        ) : (
          <div className="flex-1 p-4 overflow-auto h-full">
            {tableData === null ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <i className="pi pi-table text-6xl text-gray-200 mb-4"></i>
                <h3 className="text-lg font-medium text-gray-700">No Data</h3>
              </div>
            ) : (
              <DataTableComponent
                data={tableData}
                useOrchestrationLayer={useOrchestrationLayer}
                rowsPerPageOptions={rowsPerPageOptions}
                defaultRows={defaultRows}
                scrollable={propScrollable}
                scrollHeight={propScrollHeight}
                enableSort={enableSort}
                enableFilter={enableFilter}
                enableSummation={enableSummation}
                textFilterColumns={textFilterColumns}
                visibleColumns={visibleColumns}
                onVisibleColumnsChange={handleVisibleColumnsChange}
                redFields={redFields}
                greenFields={greenFields}
                outerGroupField={outerGroupField}
                innerGroupField={innerGroupField}
                enableCellEdit={enableCellEdit}
                nonEditableColumns={nonEditableColumns}
                percentageColumns={percentageColumns}
                enableDivideBy1Lakh={enableDivideBy1Lakh}
                enableFullscreenDialog={enableFullscreenDialog}
                onCellEditComplete={handleCellEditComplete}
                onOuterGroupClick={handleOuterGroupClick}
                onInnerGroupClick={handleInnerGroupClick}
                columnTypes={columnTypes}
                tableName={propTableName}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataTableWrapper;
