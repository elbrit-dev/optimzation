'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Toast } from 'primereact/toast';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { Sidebar } from 'primereact/sidebar';
import { TabView, TabPanel } from 'primereact/tabview';
import DataTableComponent from '../share/datatable/components/DataTable';
import DataTableControls from '../share/datatable/components/DataTableControls';
import data from '../resource/data';

import { uniq, flatMap, keys, isEmpty, startCase, filter as lodashFilter, get, isNil, debounce } from 'lodash';
import { saveSettingsForDataSource, loadSettingsForDataSource } from '../share/datatable/utils/settingsService';

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

const DataTableWrapper = (props) => {
  const {
    className,
    showControls = true,
    dataSource: propDataSource,
    queryKey: propQueryKey,
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
    isAdminMode: propIsAdminMode,
    salesTeamColumn: propSalesTeamColumn,
    salesTeamValues: propSalesTeamValues,
    hqColumn: propHqColumn,
    hqValues: propHqValues,
    enableFullscreenDialog: propEnableFullscreenDialog,
    scrollable: propScrollable,
    scrollHeight: propScrollHeight,
    drawerTabs: propDrawerTabs,
    controlsPanelSize: propControlsPanelSize = 20,
    onSave,
    queryVariables: propQueryVariables,
    onVariableOverridesChange,
    // Sticky header/footer props
    stickyHeaderOffset: propStickyHeaderOffset = 0,
    stickyHeaderZIndex: propStickyHeaderZIndex = 1000,
    appHeaderOffset: propAppHeaderOffset,
    appFooterOffset: propAppFooterOffset,
    tableName: propTableName = 'main',
  } = props;

  // Sync all settings props to localStorage in a useEffect to avoid render-phase side effects
  // We exclude dataSource and queryKey here as they are managed by TableDataProvider
  const settingsString = JSON.stringify({
    propEnableSort, propEnableFilter, propEnableSummation, propEnableCellEdit,
    propRowsPerPageOptions, propDefaultRows, propTextFilterColumns, propVisibleColumns,
    propRedFields, propGreenFields, propOuterGroupField, propInnerGroupField,
    propNonEditableColumns,
    propEnableDivideBy1Lakh, propPercentageColumns, propIsAdminMode, propSalesTeamColumn,
    propSalesTeamValues, propHqColumn, propHqValues
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
    syncToStore('datatable-percentageColumns', propPercentageColumns);
    syncToStore('datatable-isAdminMode', propIsAdminMode);
    syncToStore('datatable-salesTeamColumn', propSalesTeamColumn);
    syncToStore('datatable-salesTeamValues', propSalesTeamValues);
    syncToStore('datatable-hqColumn', propHqColumn);
    syncToStore('datatable-hqValues', propHqValues);
    syncToStore('datatable-drawerTabs', propDrawerTabs);
  }, [settingsString]);

  const toast = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tableData, setTableData] = useState(props.data || data);

  // Sync tableData with props.data using stringified check to prevent loops
  const stringifiedData = JSON.stringify(props.data);
  useEffect(() => {
    if (props.data !== undefined) {
      setTableData(props.data);
      if (props.data && Array.isArray(props.data)) {
        originalTableDataRef.current = props.data;
      }
    }
  }, [stringifiedData]);

  const [currentDataSource, setCurrentDataSource] = useState(props.dataSource || null);

  // Sync currentDataSource with props.dataSource
  useEffect(() => {
    if (props.dataSource !== undefined) {
      setCurrentDataSource(props.dataSource);
    }
  }, [props.dataSource]);

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
  const [outerGroupFieldRawState, setOuterGroupFieldRaw] = useLocalStorageString('datatable-outerGroupField', null);
  const [innerGroupFieldRawState, setInnerGroupFieldRaw] = useLocalStorageString('datatable-innerGroupField', null);
  const [nonEditableColumnsRawState, setNonEditableColumnsRaw] = useLocalStorageArray('datatable-nonEditableColumns', []);
  const [enableDivideBy1LakhState, setEnableDivideBy1Lakh] = useLocalStorageBoolean('datatable-enableDivideBy1Lakh', false);
  const [percentageColumnsRawState, setPercentageColumnsRaw] = useLocalStorageArray('datatable-percentageColumns', []);
  const [isAdminModeState, setIsAdminMode] = useLocalStorageBoolean('datatable-isAdminMode', false);
  const [salesTeamColumnRawState, setSalesTeamColumnRaw] = useLocalStorageString('datatable-salesTeamColumn', null);
  const [salesTeamValuesRawState, setSalesTeamValuesRaw] = useLocalStorageArray('datatable-salesTeamValues', []);
  const [hqColumnRawState, setHqColumnRaw] = useLocalStorageString('datatable-hqColumn', null);
  const [hqValuesRawState, setHqValuesRaw] = useLocalStorageArray('datatable-hqValues', []);
  
  const [queryVariables, setQueryVariables] = useState(propQueryVariables || {});

  // Sync queryVariables with props.queryVariables using stringified check
  const stringifiedVariables = JSON.stringify(propQueryVariables);
  useEffect(() => {
    if (propQueryVariables !== undefined) {
      setQueryVariables(propQueryVariables);
    }
  }, [stringifiedVariables]);

  const [variableOverrides, setVariableOverrides] = useState({});

  const handleVariableOverridesChangeInternal = (newOverrides) => {
    setVariableOverrides(newOverrides);
    if (onVariableOverridesChange) {
      onVariableOverridesChange(newOverrides);
    }
  };


  // Drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerData, setDrawerData] = useState([]);
  const [drawerTabsRawState, setDrawerTabs] = useLocalStorageArray('datatable-drawerTabs', [{ id: `tab-${Date.now()}`, name: '', outerGroup: null, innerGroup: null }]);
  const [activeDrawerTabIndex, setActiveDrawerTabIndex] = useState(0);
  const [clickedDrawerValues, setClickedDrawerValues] = useState({ outerValue: null, innerValue: null });

  // Header offset and z-index for sticky headers
  const [appHeaderOffset, setAppHeaderOffset] = useState(0);
  const [appHeaderZIndex, setAppHeaderZIndex] = useState(1000);
  const [sidebarHeaderOffset, setSidebarHeaderOffset] = useState(0);
  const [sidebarZIndex, setSidebarZIndex] = useState(1000);

  // Derived values that prefer props over localStorage state
  const enableSort = propEnableSort !== undefined ? propEnableSort : enableSortState;
  const enableFilter = propEnableFilter !== undefined ? propEnableFilter : enableFilterState;
  const enableSummation = propEnableSummation !== undefined ? propEnableSummation : enableSummationState;
  const enableCellEdit = propEnableCellEdit !== undefined ? propEnableCellEdit : enableCellEditState;
  const rowsPerPageOptions = propRowsPerPageOptions !== undefined ? propRowsPerPageOptions : rowsPerPageOptionsRawState;
  const defaultRows = propDefaultRows !== undefined ? propDefaultRows : defaultRowsRawState;
  const textFilterColumns = propTextFilterColumns !== undefined ? propTextFilterColumns : textFilterColumnsRawState;
  const visibleColumns = propVisibleColumns !== undefined ? propVisibleColumns : visibleColumnsRawState;
  const redFields = propRedFields !== undefined ? propRedFields : redFieldsRawState;
  const greenFields = propGreenFields !== undefined ? propGreenFields : greenFieldsRawState;
  const outerGroupField = propOuterGroupField !== undefined ? propOuterGroupField : outerGroupFieldRawState;
  const innerGroupField = propInnerGroupField !== undefined ? propInnerGroupField : innerGroupFieldRawState;
  const nonEditableColumns = propNonEditableColumns !== undefined ? propNonEditableColumns : nonEditableColumnsRawState;
  const enableDivideBy1Lakh = propEnableDivideBy1Lakh !== undefined ? propEnableDivideBy1Lakh : enableDivideBy1LakhState;
  const percentageColumns = propPercentageColumns !== undefined ? propPercentageColumns : percentageColumnsRawState;
  const isAdminMode = propIsAdminMode !== undefined ? propIsAdminMode : isAdminModeState;
  const salesTeamColumn = propSalesTeamColumn !== undefined ? propSalesTeamColumn : salesTeamColumnRawState;
  const salesTeamValues = propSalesTeamValues !== undefined ? propSalesTeamValues : salesTeamValuesRawState;
  const hqColumn = propHqColumn !== undefined ? propHqColumn : hqColumnRawState;
  const hqValues = propHqValues !== undefined ? propHqValues : hqValuesRawState;
  const drawerTabs = (propDrawerTabs !== undefined && propDrawerTabs !== null && propDrawerTabs.length > 0) ? propDrawerTabs : drawerTabsRawState;
  
  const originalTableDataRef = useRef(null);

  // Calculate app header offset
  useEffect(() => {
    const calculateAppHeaderHeight = () => {
      const headerElement = document.querySelector('.app-header-container');
      if (headerElement) {
        const height = headerElement.getBoundingClientRect().height;
        setAppHeaderOffset(height);
        const computedStyle = window.getComputedStyle(headerElement);
        setAppHeaderZIndex(parseInt(computedStyle.zIndex) || 1000);
      }
    };

    calculateAppHeaderHeight();
    const handleResize = debounce(calculateAppHeaderHeight, 100);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      handleResize.cancel();
    };
  }, []);

  // Calculate sidebar header offset
  useEffect(() => {
    if (!drawerVisible) return;
    const calculateSidebarHeaderOffset = () => {
      const sidebarHeaderElement = document.querySelector('.p-sidebar-header');
      const sidebarElement = document.querySelector('.p-sidebar');
      if (sidebarHeaderElement && sidebarElement) {
        setSidebarHeaderOffset(sidebarHeaderElement.getBoundingClientRect().height);
        const computedStyle = window.getComputedStyle(sidebarElement);
        setSidebarZIndex(parseInt(computedStyle.zIndex) || 1000);
      }
    };

    const timeoutId = setTimeout(calculateSidebarHeaderOffset, 100);
    const handleResize = debounce(calculateSidebarHeaderOffset, 100);
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
      handleResize.cancel();
    };
  }, [drawerVisible]);

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
    }
  }, []);

  const handleSaveSettings = () => {
    if (!currentDataSource) {
      toast.current?.show({ severity: 'warn', summary: 'Warning', detail: 'Select a data source first', life: 3000 });
      return;
    }

    const settings = {
      enableSort, enableFilter, enableSummation, enableCellEdit,
      rowsPerPageOptions, defaultRows, textFilterColumns, visibleColumns,
      redFields, greenFields, outerGroupField, innerGroupField,
      nonEditableColumns, drawerTabs,
      enableDivideBy1Lakh, percentageColumns, isAdminMode, salesTeamColumn,
      salesTeamValues, hqColumn, hqValues
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

    const filteredData = lodashFilter(originalData, (row) => {
      const rowValue = get(row, outerGroupField);
      return isNil(value) ? isNil(rowValue) : String(rowValue) === String(value);
    });

    setDrawerData(filteredData);
    setDrawerVisible(true);
  };

  const handleInnerGroupClick = (rowData, column, value) => {
    const originalData = originalTableDataRef.current || tableData;
    if (!Array.isArray(originalData)) return;

    const outerValue = get(rowData, outerGroupField);
    setClickedDrawerValues({ outerValue, innerValue: value });
    setActiveDrawerTabIndex(0);

    const filteredData = lodashFilter(originalData, (row) => {
      const rowOuterValue = get(row, outerGroupField);
      const rowInnerValue = get(row, innerGroupField);

      let outerMatch = isNil(outerValue) ? isNil(rowOuterValue) : String(rowOuterValue) === String(outerValue);
      if (!outerMatch) return false;

      return isNil(value) ? isNil(rowInnerValue) : String(rowInnerValue) === String(value);
    });

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
                    rowsPerPageOptions={rowsPerPageOptions}
                    defaultRows={defaultRows}
                    scrollable={false}
                    enableSort={enableSort}
                    enableFilter={enableFilter}
                    enableSummation={enableSummation}
                    textFilterColumns={textFilterColumns}
                    visibleColumns={visibleColumns}
                    onVisibleColumnsChange={setVisibleColumnsRaw}
                    redFields={redFields}
                    greenFields={greenFields}
                    outerGroupField={outerGroupField}
                    innerGroupField={innerGroupField}
                    enableCellEdit={enableCellEdit}
                    nonEditableColumns={nonEditableColumns}
                    percentageColumns={percentageColumns}
                    enableDivideBy1Lakh={enableDivideBy1Lakh}
                    onCellEditComplete={handleCellEditComplete}
                    onOuterGroupClick={handleOuterGroupClick}
                    onInnerGroupClick={handleInnerGroupClick}
                    appHeaderOffset={propAppHeaderOffset !== undefined ? propAppHeaderOffset : appHeaderOffset}
                    appFooterOffset={propAppFooterOffset}
                    stickyHeaderOffset={propStickyHeaderOffset}
                    stickyHeaderZIndex={propStickyHeaderZIndex}
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
                onVisibleColumnsChange={setVisibleColumnsRaw}
                onRedFieldsChange={setRedFieldsRaw}
                onGreenFieldsChange={setGreenFieldsRaw}
                onOuterGroupFieldChange={setOuterGroupFieldRaw}
                onInnerGroupFieldChange={setInnerGroupFieldRaw}
                onNonEditableColumnsChange={setNonEditableColumnsRaw}
                onPercentageColumnsChange={setPercentageColumnsRaw}
                onSaveSettings={handleSaveSettings}
                drawerTabs={drawerTabs}
                onDrawerTabsChange={setDrawerTabs}
                onAddDrawerTab={handleAddDrawerTab}
                onRemoveDrawerTab={handleRemoveDrawerTab}
                onUpdateDrawerTab={handleUpdateDrawerTab}
                isAdminMode={isAdminMode}
                salesTeamColumn={salesTeamColumn}
                salesTeamValues={salesTeamValues}
                hqColumn={hqColumn}
                hqValues={hqValues}
                tableData={tableData}
                onAdminModeChange={setIsAdminMode}
                onSalesTeamColumnChange={setSalesTeamColumnRaw}
                onSalesTeamValuesChange={setSalesTeamValuesRaw}
                onHqColumnChange={setHqColumnRaw}
                onHqValuesChange={setHqValuesRaw}
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
                rowsPerPageOptions={rowsPerPageOptions}
                defaultRows={defaultRows}
                scrollable={false}
                enableSort={enableSort}
                enableFilter={enableFilter}
                enableSummation={enableSummation}
                textFilterColumns={textFilterColumns}
                visibleColumns={visibleColumns}
                onVisibleColumnsChange={setVisibleColumnsRaw}
                redFields={redFields}
                greenFields={greenFields}
                outerGroupField={outerGroupField}
                innerGroupField={innerGroupField}
                enableCellEdit={enableCellEdit}
                nonEditableColumns={nonEditableColumns}
                percentageColumns={percentageColumns}
                enableDivideBy1Lakh={enableDivideBy1Lakh}
                onCellEditComplete={handleCellEditComplete}
                onOuterGroupClick={handleOuterGroupClick}
                onInnerGroupClick={handleInnerGroupClick}
                appHeaderOffset={propAppHeaderOffset !== undefined ? propAppHeaderOffset : appHeaderOffset}
                appFooterOffset={propAppFooterOffset}
                stickyHeaderOffset={propStickyHeaderOffset}
                stickyHeaderZIndex={propStickyHeaderZIndex}
                tableName={propTableName}
              />
            )}
          </div>
        )}
      </div>

      <Sidebar
        position="bottom"
        blockScroll
        visible={drawerVisible}
        onHide={() => setDrawerVisible(false)}
        style={{ height: '100vh' }}
        header={
          <h2 className="text-lg font-semibold m-0">
            {clickedDrawerValues.innerValue 
              ? `${clickedDrawerValues.outerValue} : ${clickedDrawerValues.innerValue}`
              : clickedDrawerValues.outerValue || 'Details'}
          </h2>
        }
      >
        <div className="flex flex-col h-full">
          <TabView activeIndex={activeDrawerTabIndex} onTabChange={(e) => setActiveDrawerTabIndex(e.index)}>
            {drawerTabs.map((tab) => (
              <TabPanel key={tab.id} header={tab.name || `Tab ${drawerTabs.indexOf(tab) + 1}`}>
                <div className="overflow-auto py-4">
                  {drawerData.length > 0 ? (
                    <DataTableComponent
                      data={drawerData}
                      rowsPerPageOptions={rowsPerPageOptions}
                      defaultRows={defaultRows}
                      scrollable={false}
                      enableSort={enableSort}
                      enableFilter={enableFilter}
                      enableSummation={enableSummation}
                      textFilterColumns={textFilterColumns}
                      visibleColumns={visibleColumns}
                      onVisibleColumnsChange={setVisibleColumnsRaw}
                      redFields={redFields}
                      greenFields={greenFields}
                      outerGroupField={tab.outerGroup}
                      innerGroupField={tab.innerGroup}
                      percentageColumns={percentageColumns}
                      enableDivideBy1Lakh={enableDivideBy1Lakh}
                      enableCellEdit={false}
                      appHeaderOffset={sidebarHeaderOffset}
                      stickyHeaderZIndex={sidebarZIndex + 1}
                      tableName="sidebar"
                    />
                  ) : (
                    <p className="text-center text-gray-500">No data available</p>
                  )}
                </div>
              </TabPanel>
            ))}
          </TabView>
        </div>
      </Sidebar>
    </div>
  );
};

export default DataTableWrapper;
