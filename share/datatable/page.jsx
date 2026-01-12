'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Toast } from 'primereact/toast';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { Sidebar } from 'primereact/sidebar';
import { TabView, TabPanel } from 'primereact/tabview';
import { Dropdown } from 'primereact/dropdown';
import { SelectButton } from 'primereact/selectbutton';
import DataTableComponent from './components/DataTable';
import DataTableControls from './components/DataTableControls';
import DataProvider from './components/DataProvider';
import data from '@/resource/data';
import { uniq, flatMap, isEmpty, startCase, filter as lodashFilter, get, isNil, debounce } from 'lodash';
import { saveSettingsForDataSource, loadSettingsForDataSource } from './utils/settingsService';
import { getDataKeys, getDataValue } from './utils/dataAccessUtils';
import ProtectedRoute from '@/components/ProtectedRoute';

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

  // Sync with localStorage on mount
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
    } catch (error) {
      // Ignore errors during sync
    }
  }, [key]);

  const setStoredValue = useCallback((newValue) => {
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
  }, [key]);

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
      // If parsing fails, try to clean up invalid data
      try {
        window.localStorage.removeItem(key);
      } catch { }
      return defaultValue;
    }
  });

  // Sync with localStorage on mount
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
    } catch (error) {
      // Ignore errors during sync
    }
  }, [key]);

  const setStoredValue = useCallback((newValue) => {
    try {
      // Handle functional updates (setState(prev => ...))
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
  }, [key]);

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
      // Accept string or null values
      return (typeof parsed === 'string' || parsed === null) ? parsed : defaultValue;
    } catch (error) {
      // If parsing fails, try to clean up invalid data
      try {
        window.localStorage.removeItem(key);
      } catch { }
      return defaultValue;
    }
  });

  // Sync with localStorage on mount
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
    } catch (error) {
      // Ignore errors during sync
    }
  }, [key]);

  const setStoredValue = useCallback((newValue) => {
    try {
      // Accept string or null values
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
  }, [key]);

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
      // Accept number values
      return (typeof parsed === 'number' && !isNaN(parsed) && parsed > 0) ? parsed : defaultValue;
    } catch (error) {
      // If parsing fails, try to clean up invalid data
      try {
        window.localStorage.removeItem(key);
      } catch { }
      return defaultValue;
    }
  });

  // Sync with localStorage on mount
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
    } catch (error) {
      // Ignore errors during sync
    }
  }, [key]);

  const setStoredValue = (newValue) => {
    try {
      // Accept number values
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

function DataTablePage() {
  const toast = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tableData, setTableData] = useState(data); // Filtered data for DataTable
  const [rawTableData, setRawTableData] = useState(data); // Full/original data for Auth Control in DataTableControls
  const [currentDataSource, setCurrentDataSource] = useState(null);
  // State for Data Source and Query Key selectors (controlled by page)
  const [dataSource, setDataSource] = useState('Primary');
  const [selectedQueryKey, setSelectedQueryKey] = useState('primary');
  // State exposed from DataProvider for selectors
  const [savedQueries, setSavedQueries] = useState([]);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [executingQuery, setExecutingQuery] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [availableQueryKeys, setAvailableQueryKeys] = useState([]);
  const [enableSort, setEnableSort] = useLocalStorageBoolean('datatable-enableSort', true);
  const [enableFilter, setEnableFilter] = useLocalStorageBoolean('datatable-enableFilter', true);
  const [enableSummation, setEnableSummation] = useLocalStorageBoolean('datatable-enableSummation', true);
  const [enableCellEdit, setEnableCellEdit] = useLocalStorageBoolean('datatable-enableCellEdit', false);
  const [enableDivideBy1Lakh, setEnableDivideBy1Lakh] = useLocalStorageBoolean('datatable-enableDivideBy1Lakh', false);
  const [rowsPerPageOptionsRaw, setRowsPerPageOptionsRaw] = useLocalStorageArray('datatable-rowsPerPageOptions', [5, 10, 25, 50, 100, 200]);
  const [defaultRowsRaw, setDefaultRowsRaw] = useLocalStorageNumber('datatable-defaultRows', 10);
  const [textFilterColumnsRaw, setTextFilterColumnsRaw] = useLocalStorageArray('datatable-textFilterColumns', []);
  const [visibleColumnsRaw, setVisibleColumnsRaw] = useLocalStorageArray('datatable-visibleColumns', []);
  const [redFieldsRaw, setRedFieldsRaw] = useLocalStorageArray('datatable-redFields', []);
  const [greenFieldsRaw, setGreenFieldsRaw] = useLocalStorageArray('datatable-greenFields', []);
  const [outerGroupFieldRaw, setOuterGroupFieldRaw] = useLocalStorageString('datatable-outerGroupField', null);
  const [innerGroupFieldRaw, setInnerGroupFieldRaw] = useLocalStorageString('datatable-innerGroupField', null);
  const [nonEditableColumnsRaw, setNonEditableColumnsRaw] = useLocalStorageArray('datatable-nonEditableColumns', []);
  const [percentageColumns, setPercentageColumns] = useLocalStorageArray('datatable-percentageColumns', []);
  const [queryVariables, setQueryVariables] = useState({});
  const [variableOverrides, setVariableOverrides] = useState({});
  // Auth Control settings
  const [isAdminMode, setIsAdminMode] = useLocalStorageBoolean('datatable-isAdminMode', false);
  const [salesTeamColumn, setSalesTeamColumn] = useLocalStorageString('datatable-salesTeamColumn', null);
  const [salesTeamValues, setSalesTeamValues] = useLocalStorageArray('datatable-salesTeamValues', []);
  const [hqColumn, setHqColumn] = useLocalStorageString('datatable-hqColumn', null);
  const [hqValues, setHqValues] = useLocalStorageArray('datatable-hqValues', []);

  // Sticky header offset - calculate from app-header-container
  const [appHeaderOffset, setAppHeaderOffset] = useState(0);
  const [appHeaderZIndex, setAppHeaderZIndex] = useState(1000);

  // Calculate app header offset and z-index from app-header-container
  useEffect(() => {
    const calculateAppHeaderHeight = () => {
      const headerElement = document.querySelector('.app-header-container');
      if (headerElement) {
        const height = headerElement.getBoundingClientRect().height;
        setAppHeaderOffset(height);
        // Get computed z-index
        const computedStyle = window.getComputedStyle(headerElement);
        const zIndex = parseInt(computedStyle.zIndex) || 1000;
        setAppHeaderZIndex(zIndex);
      } else {
        setAppHeaderOffset(0);
        setAppHeaderZIndex(1000);
      }
    };

    // Calculate on mount and resize
    calculateAppHeaderHeight();
    const handleResize = debounce(calculateAppHeaderHeight, 100);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      handleResize.cancel();
    };
  }, []);

  // Sticky footer offset - 0 by default, 10vh on mobile
  const [appFooterOffset, setAppFooterOffset] = useState(0);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);

  // Calculate app footer offset: 0 by default, 10vh on mobile
  useEffect(() => {
    const calculateAppFooterHeight = () => {
      const mobile = window.innerWidth < 640; // Common mobile breakpoint
      setIsMobile(mobile);
      setAppFooterOffset(mobile ? window.innerHeight * 0.1 : 0); // 10vh on mobile, 0 otherwise
    };

    // Calculate on mount and resize
    calculateAppFooterHeight();
    const handleResize = debounce(calculateAppFooterHeight, 100);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      handleResize.cancel();
    };
  }, []);

  // Sticky header z-index for main table (app header z-index + 1)
  const mainStickyHeaderZIndex = appHeaderZIndex + 1;

  // Drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);

  // Sidebar header offset - calculate from p-sidebar-header
  const [sidebarHeaderOffset, setSidebarHeaderOffset] = useState(0);
  const [sidebarZIndex, setSidebarZIndex] = useState(1000);

  // Calculate sidebar header offset and z-index from p-sidebar-header (position + height)
  useEffect(() => {
    if (!drawerVisible) {
      setSidebarHeaderOffset(0);
      setSidebarZIndex(1000);
      return;
    }

    const calculateSidebarHeaderOffset = () => {
      const sidebarHeaderElement = document.querySelector('.p-sidebar-header');
      const sidebarElement = document.querySelector('.p-sidebar');
      if (sidebarHeaderElement && sidebarElement) {
        const headerRect = sidebarHeaderElement.getBoundingClientRect();
        // For sidebar, we just need the header height for the custom position function
        // The custom function will calculate position relative to container
        const offset = headerRect.height;
        setSidebarHeaderOffset(offset);
      } else {
        setSidebarHeaderOffset(0);
      }

      // Get sidebar z-index
      if (sidebarElement) {
        const computedStyle = window.getComputedStyle(sidebarElement);
        const zIndex = parseInt(computedStyle.zIndex) || 1000;
        setSidebarZIndex(zIndex);
      } else {
        setSidebarZIndex(1000);
      }
    };

    // Calculate when sidebar becomes visible and on resize
    const timeoutId = setTimeout(calculateSidebarHeaderOffset, 100);
    const handleResize = debounce(calculateSidebarHeaderOffset, 100);
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
      handleResize.cancel();
    };
  }, [drawerVisible]);

  // Sticky header z-index for sidebar table (sidebar z-index + 1)
  const sidebarStickyHeaderZIndex = sidebarZIndex + 1;

  // Custom visibility function for sidebar
  const shouldShowSidebarHeader = ({ headerRect, containerRect, appHeaderOffset }) => {
    // Get the sidebar header element to find sticky header position
    const sidebarHeaderElement = document.querySelector('.p-sidebar-header');
    if (!sidebarHeaderElement) {
      // Fallback to default logic if sidebar header not found
      const viewportTopWithOffset = appHeaderOffset || 0;
      const condition1 = headerRect.bottom < (containerRect.top + viewportTopWithOffset);
      const condition2 = headerRect.top < viewportTopWithOffset;
      return condition1 || condition2;
    }

    const sidebarHeaderRect = sidebarHeaderElement.getBoundingClientRect();
    // Sticky header is positioned at sidebar header bottom
    const stickyHeaderPosition = sidebarHeaderRect.top + sidebarHeaderRect.height;

    // Use the same logic pattern as default, but use stickyHeaderPosition instead of viewportTopWithOffset
    // Default: condition1 = headerRect.bottom < (containerRect.top + viewportTopWithOffset)
    // For sidebar with sticky at absolute position: condition1 = headerRect.bottom < stickyHeaderPosition
    // Default: condition2 = headerRect.top < viewportTopWithOffset
    // For sidebar with sticky at absolute position: condition2 = headerRect.top < stickyHeaderPosition
    const condition1 = headerRect.bottom < stickyHeaderPosition;
    const condition2 = headerRect.top < stickyHeaderPosition;
    return condition1 || condition2;
  };

  // Custom header position calculation for sidebar
  const calculateSidebarHeaderPosition = ({ containerRect, totalHeaderOffset }) => {
    // For sidebar, position sticky header at sidebar header bottom
    // Get the sidebar header element's position
    const sidebarHeaderElement = document.querySelector('.p-sidebar-header');
    if (sidebarHeaderElement) {
      const headerRect = sidebarHeaderElement.getBoundingClientRect();
      // Position at sidebar header bottom (top + height)
      const topPosition = headerRect.top + headerRect.height;
      return {
        width: containerRect.width,
        left: containerRect.left,
        top: topPosition
      };
    }
    // Fallback to default
    return {
      width: containerRect.width,
      left: containerRect.left,
      top: totalHeaderOffset
    };
  };

  const [drawerData, setDrawerData] = useState([]);
  
  // Drawer tabs state
  const [drawerTabs, setDrawerTabs] = useLocalStorageArray('datatable-drawerTabs', [{ id: `tab-${Date.now()}`, name: '', outerGroup: null, innerGroup: null }]);
  const [activeDrawerTabIndex, setActiveDrawerTabIndex] = useState(0);
  const [clickedDrawerValues, setClickedDrawerValues] = useState({ outerValue: null, innerValue: null });
  
  // Ensure at least one tab exists
  useEffect(() => {
    if (!drawerTabs || drawerTabs.length === 0) {
      setDrawerTabs([{ id: `tab-${Date.now()}`, name: '', outerGroup: null, innerGroup: null }]);
    }
  }, [drawerTabs, setDrawerTabs]);

  // Store original unfiltered data reference
  const originalTableDataRef = useRef(null);


  // Handle data changes from DataProvider - memoized to prevent infinite loops
  const handleDataChange = useCallback((notification) => {
    if (toast.current) {
      toast.current.show(notification);
    }
  }, []);

  const handleError = useCallback((notification) => {
    if (toast.current) {
      toast.current.show(notification);
    }
  }, []);

  // Handle raw/original data changes from DataProvider (for Auth Control)
  const handleRawDataChange = useCallback((newRawData) => {
    setRawTableData(newRawData);
  }, []);

  // Handle filtered table data changes from DataProvider (for DataTable)
  const handleTableDataChange = useCallback((newTableData) => {
    setTableData(newTableData);
    // Store filtered data reference for drawer functionality (drawer uses visible filtered data)
    if (newTableData && Array.isArray(newTableData)) {
      originalTableDataRef.current = newTableData;
    }
  }, []);

  // Handle data source changes - load saved settings
  const handleDataSourceChange = useCallback((newDataSource) => {
    setCurrentDataSource(newDataSource);
    setDataSource(newDataSource);

    if (!dataSource) {
      return;
    }

    // Load saved settings for this data source
    const savedSettings = loadSettingsForDataSource(dataSource);
    if (savedSettings) {
      // Apply saved settings
      if (savedSettings.enableSort !== undefined) setEnableSort(savedSettings.enableSort);
      if (savedSettings.enableFilter !== undefined) setEnableFilter(savedSettings.enableFilter);
      if (savedSettings.enableSummation !== undefined) setEnableSummation(savedSettings.enableSummation);
      if (savedSettings.enableCellEdit !== undefined) setEnableCellEdit(savedSettings.enableCellEdit);
      if (savedSettings.enableDivideBy1Lakh !== undefined) setEnableDivideBy1Lakh(savedSettings.enableDivideBy1Lakh);
      if (savedSettings.rowsPerPageOptions) setRowsPerPageOptions(savedSettings.rowsPerPageOptions);
      if (savedSettings.defaultRows !== undefined) setDefaultRows(savedSettings.defaultRows);
      if (savedSettings.textFilterColumns) setTextFilterColumns(savedSettings.textFilterColumns);
      if (savedSettings.visibleColumns) setVisibleColumns(savedSettings.visibleColumns);
      if (savedSettings.redFields) setRedFields(savedSettings.redFields);
      if (savedSettings.greenFields) setGreenFields(savedSettings.greenFields);
      if (savedSettings.outerGroupField !== undefined) setOuterGroupField(savedSettings.outerGroupField);
      if (savedSettings.innerGroupField !== undefined) setInnerGroupField(savedSettings.innerGroupField);
      if (savedSettings.nonEditableColumns) setNonEditableColumns(savedSettings.nonEditableColumns);
      if (savedSettings.percentageColumns) setPercentageColumns(savedSettings.percentageColumns);
      // Migrate old drawer settings if present
      if (savedSettings.drawerTabs !== undefined) {
        setDrawerTabs(savedSettings.drawerTabs);
      }
      // Load Auth Control settings
      if (savedSettings.isAdminMode !== undefined) setIsAdminMode(savedSettings.isAdminMode);
      if (savedSettings.salesTeamColumn !== undefined) setSalesTeamColumn(savedSettings.salesTeamColumn);
      if (savedSettings.salesTeamValues !== undefined) setSalesTeamValues(savedSettings.salesTeamValues);
      if (savedSettings.hqColumn !== undefined) setHqColumn(savedSettings.hqColumn);
      if (savedSettings.hqValues !== undefined) setHqValues(savedSettings.hqValues);
    }
  }, []); // setState functions are stable, no need to include them

  // Handle variables change from DataProvider
  const handleVariablesChange = useCallback((variables) => {
    setQueryVariables(variables);
    // Reset overrides when variables change
    setVariableOverrides({});
  }, []);

  // Save current settings for the current data source
  const handleSaveSettings = () => {
    if (!currentDataSource) {
      if (toast.current) {
        toast.current.show({
          severity: 'warn',
          summary: 'Warning',
          detail: 'Please select a data source first',
          life: 3000
        });
      }
      return;
    }

    const settings = {
      enableSort,
      enableFilter,
      enableSummation,
      enableCellEdit,
      enableDivideBy1Lakh,
      rowsPerPageOptions,
      defaultRows,
      textFilterColumns,
      visibleColumns,
      redFields,
      greenFields,
      outerGroupField,
      innerGroupField,
      nonEditableColumns,
      percentageColumns,
      drawerTabs,
      isAdminMode,
      salesTeamColumn,
      salesTeamValues,
      hqColumn,
      hqValues,
    };

    try {
      saveSettingsForDataSource(currentDataSource, settings);
      if (toast.current) {
        toast.current.show({
          severity: 'success',
          summary: 'Success',
          detail: `Settings saved for ${currentDataSource === 'offline' ? 'Offline' : 'current query'}`,
          life: 3000
        });
      }
    } catch (error) {
      if (toast.current) {
        toast.current.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to save settings',
          life: 3000
        });
      }
    }
  };

  // Store original data reference on mount and when tableData changes
  useEffect(() => {
    if (tableData && Array.isArray(tableData)) {
      originalTableDataRef.current = tableData;
    }
  }, [tableData]);

  // Mark as loaded after first render to allow localStorage values to initialize
  useEffect(() => {
    // Check if we're in the browser and localStorage is available
    if (typeof window !== 'undefined' && window.localStorage) {
      // Clean up any corrupted data
      try {
        // Clean up boolean values that might be stored incorrectly
        const booleanKeys = ['datatable-enableSort', 'datatable-enableFilter', 'datatable-enableSummation', 'datatable-enableCellEdit'];
        booleanKeys.forEach(key => {
          try {
            const item = window.localStorage.getItem(key);
            if (item) {
              const parsed = JSON.parse(item);
              // If it's not a boolean, remove it
              if (typeof parsed !== 'boolean') {
                window.localStorage.removeItem(key);
              }
            }
          } catch (error) {
            // If parsing fails, remove the corrupted item
            window.localStorage.removeItem(key);
          }
        });

        const arrayKeys = {
          'datatable-rowsPerPageOptions': { defaultValue: [5, 10, 25, 50, 100, 200], isColumnList: false },
          'datatable-textFilterColumns': { defaultValue: [], isColumnList: true },
          'datatable-visibleColumns': { defaultValue: [], isColumnList: true },
          'datatable-redFields': { defaultValue: [], isColumnList: true },
          'datatable-greenFields': { defaultValue: [], isColumnList: true },
          'datatable-nonEditableColumns': { defaultValue: [], isColumnList: true }
        };

        // Check each key and validate its content
        Object.entries(arrayKeys).forEach(([key, config]) => {
          try {
            const item = window.localStorage.getItem(key);
            if (item) {
              const parsed = JSON.parse(item);

              // If it's not an array, remove it
              if (!Array.isArray(parsed)) {
                window.localStorage.removeItem(key);
                return;
              }

              // If rowsPerPageOptions contains non-numbers or column-like strings, reset it
              if (key === 'datatable-rowsPerPageOptions') {
                const hasInvalidValues = parsed.some(v =>
                  typeof v !== 'number' ||
                  (typeof v === 'string' && v.includes('__'))
                );
                if (hasInvalidValues) {
                  window.localStorage.removeItem(key);
                }
              }

              // If column lists contain numbers, reset them
              if (config.isColumnList) {
                const hasNumbers = parsed.some(v => typeof v === 'number');
                if (hasNumbers) {
                  window.localStorage.removeItem(key);
                }
              }
            }
          } catch (error) {
            // If parsing fails, remove the corrupted item
            window.localStorage.removeItem(key);
          }
        });

        // Validate string/null keys (group fields)
        const stringKeys = ['datatable-outerGroupField', 'datatable-innerGroupField'];
        stringKeys.forEach(key => {
          try {
            const item = window.localStorage.getItem(key);
            if (item) {
              const parsed = JSON.parse(item);
              // If it's not a string or null, remove it
              if (typeof parsed !== 'string' && parsed !== null) {
                window.localStorage.removeItem(key);
              }
            }
          } catch (error) {
            // If parsing fails, remove the corrupted item
            window.localStorage.removeItem(key);
          }
        });

        // Validate number keys (defaultRows)
        const numberKeys = ['datatable-defaultRows'];
        numberKeys.forEach(key => {
          try {
            const item = window.localStorage.getItem(key);
            if (item) {
              const parsed = JSON.parse(item);
              // If it's not a number or is invalid, remove it
              if (typeof parsed !== 'number' || isNaN(parsed) || parsed <= 0) {
                window.localStorage.removeItem(key);
              }
            }
          } catch (error) {
            // If parsing fails, remove the corrupted item
            window.localStorage.removeItem(key);
          }
        });
      } catch (error) {
        // Ignore cleanup errors
      }

      // Use requestAnimationFrame to ensure localStorage values are read after render      
      requestAnimationFrame(() => {
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  // Ensure rowsPerPageOptions is always an array
  const rowsPerPageOptions = useMemo(() => {
    if (!Array.isArray(rowsPerPageOptionsRaw)) {
      return [5, 10, 25, 50, 100, 200];
    }
    return rowsPerPageOptionsRaw;
  }, [rowsPerPageOptionsRaw]);

  // Ensure defaultRows is always a valid number and is in the available options
  const defaultRows = useMemo(() => {
    if (typeof defaultRowsRaw !== 'number' || isNaN(defaultRowsRaw) || defaultRowsRaw <= 0) {
      // Default to first option in rowsPerPageOptions if available, otherwise 10
      return rowsPerPageOptions[0] || 10;
    }
    // Check if defaultRows is in the available options
    if (!rowsPerPageOptions.includes(defaultRowsRaw)) {
      // If not, return the first option (will be updated via useEffect)
      return rowsPerPageOptions[0] || 10;
    }
    return defaultRowsRaw;
  }, [defaultRowsRaw, rowsPerPageOptions]);

  // Update defaultRows in localStorage if it's not in the available options
  useEffect(() => {
    if (Array.isArray(rowsPerPageOptions) && rowsPerPageOptions.length > 0) {
      const currentDefault = defaultRowsRaw;
      // If current default is not in the options, update it to the first option
      if (typeof currentDefault === 'number' && !isNaN(currentDefault) && currentDefault > 0) {
        if (!rowsPerPageOptions.includes(currentDefault)) {
          const newDefault = rowsPerPageOptions[0];
          if (typeof newDefault === 'number' && !isNaN(newDefault) && newDefault > 0) {
            setDefaultRowsRaw(newDefault);
          }
        }
      }
    }
  }, [rowsPerPageOptions, defaultRowsRaw, setDefaultRowsRaw]);

  // Ensure textFilterColumns is always an array
  const textFilterColumns = useMemo(() => {
    if (!Array.isArray(textFilterColumnsRaw)) {
      return [];
    }
    return textFilterColumnsRaw;
  }, [textFilterColumnsRaw]);

  // Ensure visibleColumns is always an array
  const visibleColumns = useMemo(() => {
    if (!Array.isArray(visibleColumnsRaw)) {
      return [];
    }
    return visibleColumnsRaw;
  }, [visibleColumnsRaw]);

  // Ensure redFields is always an array
  const redFields = useMemo(() => {
    if (!Array.isArray(redFieldsRaw)) {
      return [];
    }
    return redFieldsRaw;
  }, [redFieldsRaw]);

  // Ensure greenFields is always an array
  const greenFields = useMemo(() => {
    if (!Array.isArray(greenFieldsRaw)) {
      return [];
    }
    return greenFieldsRaw;
  }, [greenFieldsRaw]);

  // Ensure nonEditableColumns is always an array
  const nonEditableColumns = useMemo(() => {
    if (!Array.isArray(nonEditableColumnsRaw)) {
      return [];
    }
    return nonEditableColumnsRaw;
  }, [nonEditableColumnsRaw]);

  const setRowsPerPageOptions = (value) => {
    if (Array.isArray(value)) {
      setRowsPerPageOptionsRaw(value);
    }
  };

  const setDefaultRows = (value) => {
    if (typeof value === 'number' && !isNaN(value) && value > 0) {
      setDefaultRowsRaw(value);
    }
  };

  const setTextFilterColumns = (value) => {
    if (Array.isArray(value)) {
      setTextFilterColumnsRaw(value);
    }
  };

  const setVisibleColumns = (value) => {
    if (Array.isArray(value)) {
      setVisibleColumnsRaw(value);
    }
  };

  const setRedFields = (value) => {
    if (Array.isArray(value)) {
      setRedFieldsRaw(value);
    }
  };

  const setGreenFields = (value) => {
    if (Array.isArray(value)) {
      setGreenFieldsRaw(value);
    }
  };

  const setNonEditableColumns = (value) => {
    if (Array.isArray(value)) {
      setNonEditableColumnsRaw(value);
    }
  };

  // Handle outer group field (single value, not array) - already using localStorage hook
  const outerGroupField = outerGroupFieldRaw;
  const setOuterGroupField = (value) => {
    setOuterGroupFieldRaw(value);
    // Clear inner group field when outer group field is cleared
    if (!value) {
      setInnerGroupFieldRaw(null);
    }
  };

  // Handle inner group field (single value, not array) - already using localStorage hook
  const innerGroupField = innerGroupFieldRaw;
  const setInnerGroupField = setInnerGroupFieldRaw;

  // Clear salesTeamValues, hqColumn, and hqValues when salesTeamColumn changes
  // Use refs to avoid including lengths in dependencies (which change when we clear values)
  const salesTeamColumnPrevRef = useRef(salesTeamColumn);
  const hqColumnPrevRef = useRef(hqColumn);
  
  useEffect(() => {
    // Only act when salesTeamColumn actually changes (not just on every render)
    const salesTeamColumnChanged = salesTeamColumnPrevRef.current !== salesTeamColumn;
    salesTeamColumnPrevRef.current = salesTeamColumn;
    
    if (salesTeamColumnChanged && !salesTeamColumn) {
      setSalesTeamValues([]);
      // Clear hq-related values when salesTeamColumn is cleared
      if (hqColumn) {
        setHqColumn(null);
      }
      if (hqValues.length > 0) {
        setHqValues([]);
      }
    }
    
    // Update refs
    hqColumnPrevRef.current = hqColumn;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesTeamColumn, hqColumn]); // Only depend on the actual values, not lengths or setters

  // Clear hqValues when hqColumn changes
  useEffect(() => {
    if (!hqColumn && hqValues.length > 0) {
      setHqValues([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hqColumn]); // Only depend on hqColumn, not setHqValues or hqValues.length

  // Clear hqValues and hqColumn when salesTeamValues count is not 1
  // Use ref to track previous length to avoid loop
  const salesTeamValuesLengthPrevRef = useRef(salesTeamValues.length);
  
  useEffect(() => {
    const lengthChanged = salesTeamValuesLengthPrevRef.current !== salesTeamValues.length;
    salesTeamValuesLengthPrevRef.current = salesTeamValues.length;
    
    // Only act if length changed and is not 1
    if (lengthChanged && salesTeamValues.length !== 1) {
      if (hqValues.length > 0) {
        setHqValues([]);
      }
      // Also clear hqColumn when salesTeamValues count is not 1
      if (hqColumn) {
        setHqColumn(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesTeamValues.length, hqColumn]); // Only depend on actual values, not setters


  // Extract column names from raw data (columns should be based on full data structure)
  const columns = useMemo(() => {
    const dataToUse = rawTableData || tableData; // Use raw data if available, fallback to filtered
    if (!Array.isArray(dataToUse) || isEmpty(dataToUse)) return [];
    return uniq(flatMap(dataToUse, (item) =>
      item && typeof item === 'object' ? getDataKeys(item) : []
    ));
  }, [rawTableData, tableData]);

  // Format field name for display
  const formatFieldName = (key) => {
    return startCase(key.split('__').join(' ').split('_').join(' '));
  };

  // Handle cell edit complete
  const handleCellEditComplete = (e) => {
    const { rowData, newValue, field, oldValue } = e;
    const columnName = formatFieldName(field);

    toast.current.show({
      severity: 'success',
      summary: 'Cell Updated',
      detail: `Column: ${columnName} | Row: ${JSON.stringify(rowData).substring(0, 50)}... | Previous: ${oldValue} → Current: ${newValue}`,
      life: 5000
    });
  };

  // Handle outer group click
  const handleOuterGroupClick = (rowData, column, value) => {
    // Get filtered data that's currently visible (drawer uses visible filtered data)
    const originalData = originalTableDataRef.current || tableData;
    if (!Array.isArray(originalData) || isEmpty(originalData)) {
      return;
    }

    // Store clicked values for header display
    setClickedDrawerValues({ outerValue: value, innerValue: null });
    setActiveDrawerTabIndex(0); // Always use first tab

    // Filter rows where outerGroupField === clickedValue
    const filteredData = lodashFilter(originalData, (row) => {
      if (!row || typeof row !== 'object') return false;
      const rowValue = get(row, outerGroupField);
      // Handle null/undefined comparison
      if (isNil(value) && isNil(rowValue)) return true;
      if (isNil(value) || isNil(rowValue)) return false;
      return String(rowValue) === String(value);
    });

    setDrawerData(filteredData);
    setDrawerVisible(true);
  };

  // Tab management functions
  const handleAddDrawerTab = useCallback(() => {
    const newTab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: '',
      outerGroup: null,
      innerGroup: null
    };
    setDrawerTabs(prev => [...(prev || []), newTab]);
    setActiveDrawerTabIndex((drawerTabs || []).length);
  }, [drawerTabs]);

  const handleRemoveDrawerTab = useCallback((tabId) => {
    if (!drawerTabs || drawerTabs.length <= 1) return; // Must have at least 1 tab
    const newTabs = drawerTabs.filter(tab => tab.id !== tabId);
    setDrawerTabs(newTabs);
    // Adjust active index if needed
    if (activeDrawerTabIndex >= newTabs.length) {
      setActiveDrawerTabIndex(newTabs.length - 1);
    }
  }, [drawerTabs, activeDrawerTabIndex]);

  const handleUpdateDrawerTab = useCallback((tabId, updates) => {
    setDrawerTabs(prev => {
      if (!prev) return prev;
      return prev.map(tab => 
        tab.id === tabId ? { ...tab, ...updates } : tab
      );
    });
  }, []);

  // Handle inner group click
  const handleInnerGroupClick = (rowData, column, value) => {
    // Get filtered data that's currently visible (drawer uses visible filtered data)
    const originalData = originalTableDataRef.current || tableData;
    if (!Array.isArray(originalData) || isEmpty(originalData)) {
      return;
    }

    // Get outer group value from the row data
    const outerValue = get(rowData, outerGroupField);

    // Store clicked values for header display
    setClickedDrawerValues({ outerValue, innerValue: value });
    setActiveDrawerTabIndex(0); // Always use first tab

    // Filter rows where outerGroupField === clickedOuterValue AND innerGroupField === clickedInnerValue
    const filteredData = lodashFilter(originalData, (row) => {
      if (!row || typeof row !== 'object') return false;
      const rowOuterValue = get(row, outerGroupField);
      const rowInnerValue = get(row, innerGroupField);

      // Check outer group match
      let outerMatch = false;
      if (isNil(outerValue) && isNil(rowOuterValue)) {
        outerMatch = true;
      } else if (!isNil(outerValue) && !isNil(rowOuterValue)) {
        outerMatch = String(rowOuterValue) === String(outerValue);
      }

      if (!outerMatch) return false;

      // Check inner group match
      if (isNil(value) && isNil(rowInnerValue)) return true;
      if (isNil(value) || isNil(rowInnerValue)) return false;
      return String(rowInnerValue) === String(value);
    });

    setDrawerData(filteredData);
    setDrawerVisible(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toast ref={toast} />
      <main className="flex-1 flex flex-col min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center min-h-[calc(100vh-180px)]">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-600 mb-3"></div>
              <p className="text-sm text-gray-500">Loading...</p>
            </div>
          </div>
        ) : (
          <DataProvider
            offlineData={data}
            onDataChange={handleDataChange}
            onError={handleError}
            onRawDataChange={handleRawDataChange}
            onTableDataChange={handleTableDataChange}
            onDataSourceChange={handleDataSourceChange}
            onVariablesChange={handleVariablesChange}
            variableOverrides={variableOverrides}
            dataSource={dataSource}
            selectedQueryKey={selectedQueryKey}
            onSavedQueriesChange={setSavedQueries}
            onLoadingQueriesChange={setLoadingQueries}
            onExecutingQueryChange={setExecutingQuery}
            onLoadingDataChange={setIsLoadingData}
            onAvailableQueryKeysChange={setAvailableQueryKeys}
            onSelectedQueryKeyChange={setSelectedQueryKey}
            isAdminMode={isAdminMode}
            salesTeamColumn={salesTeamColumn}
            salesTeamValues={salesTeamValues}
            hqColumn={hqColumn}
            hqValues={hqValues}
            renderHeaderControls={(selectorsJSX) => (
              <div className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-gray-200 shrink-0 bg-white">
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  {/* Left: selectorsJSX from DataProvider */}
                  {selectorsJSX}

                  {/* Right: Data Source and Query Key Selectors */}
                  <div className="flex items-end gap-3">
                    {/* Data Source Selector */}
                    <div className="w-48">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Data Source
                      </label>
                      <Dropdown
                        value={dataSource}
                        onChange={(e) => setDataSource(e.value)}
                        options={[
                          { label: 'Offline', value: 'offline' },
                          ...savedQueries.map(q => ({ label: q.name, value: q.id }))
                        ]}
                        optionLabel="label"
                        optionValue="value"
                        placeholder="Select a data source"
                        className="w-full"
                        loading={loadingQueries}
                        disabled={executingQuery}
                        style={{
                          height: '3rem',
                        }}
                      />
                    </div>

                    {/* Query Key Selector */}
                    {dataSource && dataSource !== 'offline' && availableQueryKeys.length > 0 && (
                      <div className="w-48">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Query Key
                        </label>
                        <Dropdown
                          value={selectedQueryKey}
                          onChange={(e) => setSelectedQueryKey(e.value)}
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
                            height: '3rem',
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          >
            <div className="flex-1 min-h-0">
              <Splitter style={{ height: '100%' }} layout="horizontal" className="h-full">
                <SplitterPanel className="flex flex-col min-w-0 h-full" size={80} minSize={30}>
                <div className="flex flex-col min-w-0 h-full p-3 sm:p-4 md:p-6">
                  {isLoadingData ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                      <div className="mb-4">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-600"></div>
                      </div>
                      <p className="text-sm text-gray-500">Loading data...</p>
                    </div>
                  ) : tableData === null ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                      <div className="mb-4">
                        <i className="pi pi-table text-6xl text-gray-300"></i>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">
                        No Data Available
                      </h3>
                      <p className="text-sm text-gray-500 max-w-md">
                        Please select a query from the dropdown above and click <strong>Execute</strong> to see the table data.
                      </p>
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
                      enableDivideBy1Lakh={enableDivideBy1Lakh}
                      textFilterColumns={textFilterColumns}
                      visibleColumns={visibleColumns}
                      onVisibleColumnsChange={setVisibleColumns}
                      redFields={redFields}
                      greenFields={greenFields}
                      outerGroupField={outerGroupField}
                      innerGroupField={innerGroupField}
                      enableCellEdit={enableCellEdit}
                      nonEditableColumns={nonEditableColumns}
                      onCellEditComplete={handleCellEditComplete}
                      onOuterGroupClick={handleOuterGroupClick}
                      onInnerGroupClick={handleInnerGroupClick}
                      percentageColumns={percentageColumns}
                      appHeaderOffset={appHeaderOffset}
                      appFooterOffset={appFooterOffset}
                      stickyHeaderZIndex={mainStickyHeaderZIndex}
                      tableName="main"
                    />
                  )}
                </div>
              </SplitterPanel>
              <SplitterPanel className="flex flex-col min-w-0 h-full border-l border-gray-200" size={20} minSize={2}>
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
                  onVariableOverrideChange={setVariableOverrides}
                  onSortChange={setEnableSort}
                  onFilterChange={setEnableFilter}
                  onSummationChange={setEnableSummation}
                  onCellEditChange={setEnableCellEdit}
                  onDivideBy1LakhChange={setEnableDivideBy1Lakh}
                  onRowsPerPageOptionsChange={setRowsPerPageOptions}
                  onDefaultRowsChange={setDefaultRows}
                  onTextFilterColumnsChange={setTextFilterColumns}
                  onVisibleColumnsChange={setVisibleColumns}
                  onRedFieldsChange={setRedFields}
                  onGreenFieldsChange={setGreenFields}
                  onOuterGroupFieldChange={setOuterGroupField}
                  onInnerGroupFieldChange={setInnerGroupField}
                  onNonEditableColumnsChange={setNonEditableColumns}
                  onPercentageColumnsChange={setPercentageColumns}
                  onSaveSettings={handleSaveSettings}
                  drawerTabs={drawerTabs || []}
                  onDrawerTabsChange={setDrawerTabs}
                  onAddDrawerTab={handleAddDrawerTab}
                  onRemoveDrawerTab={handleRemoveDrawerTab}
                  onUpdateDrawerTab={handleUpdateDrawerTab}
                  isAdminMode={isAdminMode}
                  salesTeamColumn={salesTeamColumn}
                  salesTeamValues={salesTeamValues}
                  hqColumn={hqColumn}
                  hqValues={hqValues}
                  tableData={rawTableData}
                  onAdminModeChange={setIsAdminMode}
                  onSalesTeamColumnChange={setSalesTeamColumn}
                  onSalesTeamValuesChange={setSalesTeamValues}
                  onHqColumnChange={setHqColumn}
                  onHqValuesChange={setHqValues}
                />
              </SplitterPanel>
              </Splitter>
            </div>
          </DataProvider>
        )}
      </main>

      {/* Drawer Sidebar */}
      <Sidebar
        position="bottom"
        blockScroll
        visible={drawerVisible}
        onHide={() => setDrawerVisible(false)}
        style={{ height: '100vh' }}
        className="p-sidebar-sm"
        header={
          <h2 className="text-lg font-semibold text-gray-800 m-0">
            {clickedDrawerValues.innerValue 
              ? `${clickedDrawerValues.outerValue} : ${clickedDrawerValues.innerValue}`
              : clickedDrawerValues.outerValue || 'Drawer'}
          </h2>
        }
      >
        <div className="flex flex-col h-full">
          {/* Drawer Body - TabView with DataTable */}
          <div className="flex-1">
            {drawerTabs && drawerTabs.length > 0 ? (
              <TabView 
                activeIndex={Math.min(activeDrawerTabIndex, Math.max(0, drawerTabs.length - 1))} 
                onTabChange={(e) => setActiveDrawerTabIndex(e.index)}
                className="h-full flex flex-col"
              >
                {drawerTabs.map((tab) => (
                  <TabPanel 
                    key={tab.id} 
                    header={tab.name || `Tab ${drawerTabs.indexOf(tab) + 1}`}
                    className="h-full flex flex-col"
                  >
                    <div className="flex-1 overflow-auto">
                      {drawerData && drawerData.length > 0 ? (
                        <DataTableComponent
                          data={drawerData}
                          rowsPerPageOptions={rowsPerPageOptions}
                          defaultRows={defaultRows}
                          scrollable={false}
                          enableSort={enableSort}
                          enableFilter={enableFilter}
                          enableSummation={enableSummation}
                          enableDivideBy1Lakh={enableDivideBy1Lakh}
                          textFilterColumns={textFilterColumns}
                          visibleColumns={visibleColumns}
                          onVisibleColumnsChange={setVisibleColumns}
                          redFields={redFields}
                          greenFields={greenFields}
                          outerGroupField={tab.outerGroup}
                          innerGroupField={tab.innerGroup}
                          enableCellEdit={false}
                          nonEditableColumns={nonEditableColumns}
                          percentageColumns={percentageColumns}
                          appHeaderOffset={sidebarHeaderOffset}
                          appFooterOffset={appFooterOffset}
                          stickyHeaderZIndex={sidebarStickyHeaderZIndex}
                          shouldShowHeader={shouldShowSidebarHeader}
                          calculateHeaderPosition={calculateSidebarHeaderPosition}
                          tableName="sidebar"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                          <i className="pi pi-inbox text-4xl text-gray-400 mb-4"></i>
                          <p className="text-gray-600 font-medium">No data available</p>
                          <p className="text-sm text-gray-500 mt-1">No matching rows found</p>
                        </div>
                      )}
                    </div>
                  </TabPanel>
                ))}
              </TabView>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <i className="pi pi-inbox text-4xl text-gray-400 mb-4"></i>
                <p className="text-gray-600 font-medium">No tabs configured</p>
                <p className="text-sm text-gray-500 mt-1">Please configure drawer tabs in settings</p>
              </div>
            )}
          </div>
        </div>
      </Sidebar>
    </div>
  );
}

export default function Home() {
  return (
    <ProtectedRoute>
      <DataTablePage />
    </ProtectedRoute>
  );
}
