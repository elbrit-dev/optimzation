'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { queryRegistry } from '@/app/graphql-playground/services/queryRegistry';
import { debounce, flatMap, get, isEmpty, isNil, filter as lodashFilter, startCase, uniq } from 'lodash';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { TabPanel, TabView } from 'primereact/tabview';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { confirmDialog } from 'primereact/confirmdialog';
import { Toast } from 'primereact/toast';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataProvider from './components/DataProvider';
import DataTableControls from './components/DataTableControls';
import DataTableNew from './components/DataTableNew';
import DebugDataContext from './components/DebugDataContext';
import ReportLineChartWrapper from './components/ReportLineChartWrapper';
import { extractStateFromConfig, isConfigDirty as checkConfigDirty } from './config/configService';
import { listConfigs, getConfig, getDefaultConfig, getDefaultConfigId, getConfigList } from './config/configService';
import { getLocalConfig } from './config/providers/localConfigProvider';
import { configSerialized } from './config/configSerialized';
import { serializeConfigToJs, deserializeJsToConfig } from './config/configSerializer';
import { firestoreService } from '@/app/graphql-playground/services/firestoreService';
import { getDataKeys, getDataValue } from './utils/dataAccessUtils';

const defaultConfig = getDefaultConfig() ?? {};
const isDebugTableContext = process.env.NEXT_PUBLIC_DEBUG_TABLE_CONTEXT === '1';
const showLegacyProviderToggle = process.env.NEXT_PUBLIC_SHOW_LEGACY_PROVIDER_TOGGLE === '1';

/** Build single main slot from flat state values (used when config has no slots) */
function buildSingleSlotFromFlat(values) {
  return {
    main: {
      enableSort: values.enableSort,
      enableFilter: values.enableFilter,
      enableSummation: values.enableSummation,
      textFilterColumns: values.textFilterColumns ?? [],
      percentageColumns: values.percentageColumns ?? [],
      derivedColumns: values.derivedColumns ?? [],
      groupFields: values.groupFields ?? [],
      redFields: values.redFields ?? [],
      greenFields: values.greenFields ?? [],
      rowColumnStyles: values.rowColumnStyles ?? [],
      enableCellEdit: values.enableCellEdit,
      editableColumns: values.editableColumns ?? { main: [], nested: {}, object: {} },
      formInputOverride: values.formInputOverride ?? {},
      drawerTabs: values.drawerTabs?.length > 0 ? values.drawerTabs : [{ id: `tab-${Date.now()}`, name: '', outerGroup: null, innerGroup: null }],
      enableReport: values.enableReport,
      dateColumn: values.dateColumn,
      chartColumns: values.chartColumns ?? [],
      chartHeight: values.chartHeight ?? 400,
    },
  };
}

function DataTablePage() {
  const toast = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hideTableInDebug, setHideTableInDebug] = useState(false);
  
  // Initialize dataSource first
  const [dataSource, setDataSource] = useState(defaultConfig.dataSource);
  
  const [tableData, setTableData] = useState([]); // Filtered data for DataTable
  const [rawTableData, setRawTableData] = useState([]); // Full/original data for Auth Control in DataTableControls
  const [selectedQueryKey, setSelectedQueryKey] = useState(defaultConfig.selectedQueryKey);
  const [availableQueryKeys, setAvailableQueryKeys] = useState([]);
  // Controller fetches savedQueries for Data Source dropdown
  const [savedQueries, setSavedQueries] = useState([]);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [executingQuery, setExecutingQuery] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [enableSort, setEnableSort] = useState(defaultConfig.enableSort);
  const [enableFilter, setEnableFilter] = useState(defaultConfig.enableFilter);
  const [enableSummation, setEnableSummation] = useState(defaultConfig.enableSummation);
  const [enableCellEdit, setEnableCellEdit] = useState(defaultConfig.enableCellEdit);
  const [enableDivideBy1Lakh, setEnableDivideBy1Lakh] = useState(defaultConfig.enableDivideBy1Lakh);
  const [rowsPerPageOptionsRaw, setRowsPerPageOptionsRaw] = useState(defaultConfig.rowsPerPageOptions);
  const [defaultRowsRaw, setDefaultRowsRaw] = useState(defaultConfig.defaultRows);
  const [tableHeight, setTableHeight] = useState(defaultConfig.tableHeight);
  const [textFilterColumnsRaw, setTextFilterColumnsRaw] = useState(defaultConfig.textFilterColumns);
  const [allowedColumnsRaw, setAllowedColumnsRaw] = useState(defaultConfig.allowedColumns);
  const [redFieldsRaw, setRedFieldsRaw] = useState(defaultConfig.redFields);
  const [greenFieldsRaw, setGreenFieldsRaw] = useState(defaultConfig.greenFields);
  const [rowColumnStyles, setRowColumnStyles] = useState(defaultConfig.rowColumnStyles || []);
  const [outerGroupFieldRaw, setOuterGroupFieldRaw] = useState(defaultConfig.outerGroupField);
  const [innerGroupFieldRaw, setInnerGroupFieldRaw] = useState(defaultConfig.innerGroupField);
  // Group fields array for infinite nesting support
  const [groupFieldsRaw, setGroupFieldsRaw] = useState(defaultConfig.groupFields || []);
  const [editableColumnsRaw, setEditableColumnsRaw] = useState(defaultConfig.editableColumns);
  const [percentageColumns, setPercentageColumns] = useState(defaultConfig.percentageColumns);
  const [derivedColumns, setDerivedColumns] = useState(defaultConfig.derivedColumns);
  const [queryVariables, setQueryVariables] = useState({});
  const [variableOverrides, setVariableOverrides] = useState({});
  const [columnTypesOverride, setColumnTypesOverride] = useState(defaultConfig.columnTypesOverride);
  const [formInputOverride, setFormInputOverride] = useState(defaultConfig.formInputOverride);
  // Auth Control settings
  const [isAdminMode, setIsAdminMode] = useState(defaultConfig.isAdminMode);
  const [salesTeamColumn, setSalesTeamColumn] = useState(defaultConfig.salesTeamColumn);
  const [salesTeamValues, setSalesTeamValues] = useState(defaultConfig.salesTeamValues ?? []);
  const [hqColumn, setHqColumn] = useState(defaultConfig.hqColumn);
  const [hqValues, setHqValues] = useState(defaultConfig.hqValues ?? []);
  // Report settings state
  const [enableReport, setEnableReport] = useState(defaultConfig.enableReport);
  const [dateColumn, setDateColumn] = useState(defaultConfig.dateColumn);
  const [columnsExemptFromBreakdown, setColumnsExemptFromBreakdown] = useState(defaultConfig.columnsExemptFromBreakdown || []);
  const [showChart, setShowChart] = useState(defaultConfig.showChart);
  const [chartColumns, setChartColumns] = useState([]);
  const [chartHeight, setChartHeight] = useState(400);
  const [useLegacyProvider, setUseLegacyProvider] = useState(false);

  // Drawer tabs state (still managed here for DataTableControls, but drawer rendering moved to DataProvider)
  const [drawerTabs, setDrawerTabs] = useState((defaultConfig.drawerTabs?.length ?? 0) > 0 ? defaultConfig.drawerTabs : [{ id: `tab-${Date.now()}`, name: '', outerGroup: null, innerGroup: null }]);

  // Slots config: from config when it has slots, else built from flat state
  const [slotsConfigState, setSlotsConfigState] = useState(() => {
    const slots = defaultConfig.slots;
    if (slots && typeof slots === 'object' && Object.keys(slots).length > 0) {
      return slots;
    }
    return null;
  });

  // Config Presets state
  const [activeConfigId, setActiveConfigId] = useState(() => getDefaultConfigId());
  const [configList, setConfigList] = useState(() => getConfigList());
  const [configLoading, setConfigLoading] = useState(false);

  // Code mode state
  const [codeMode, setCodeMode] = useState(false);
  const [firebasePresets, setFirebasePresets] = useState({});
  const [firebasePresetsLoading, setFirebasePresetsLoading] = useState(false);
  const [selectedPresetKey, setSelectedPresetKey] = useState(() => {
    const id = getDefaultConfigId();
    return id.startsWith('firebase:') ? id : 'local:' + id;
  });
  const [presetJsValue, setPresetJsValue] = useState('');
  const [presetSaving, setPresetSaving] = useState(false);
  const [saveLocalAsFirebaseDialogVisible, setSaveLocalAsFirebaseDialogVisible] = useState(false);
  const [saveLocalAsFirebaseName, setSaveLocalAsFirebaseName] = useState('');
  const saveLocalAsFirebaseContextRef = useRef(null);
  const [configApplyKey, setConfigApplyKey] = useState(0);
  const [appliedConfig, setAppliedConfig] = useState(() => defaultConfig);

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

  // Handle column types override changes
  const handleColumnTypesOverrideChange = useCallback((overrides) => {
    setColumnTypesOverride(overrides);
  }, []);

  // Handle variables change from DataProvider
  const handleVariablesChange = useCallback((variables) => {
    setQueryVariables(variables);
    // Reset overrides when variables change
    setVariableOverrides({});
  }, []);

  // When data source changes, reset query key so provider can select first key for new source
  const handleDataSourceChange = useCallback((value) => {
    setDataSource(value);
    setSelectedQueryKey(null);
  }, []);

  // Offline docs (ExampleOffline, etc.) are now in registry and run through pipeline
  const offlineData = useMemo(() => [], []);

  // All data sources come from registry (Firebase + offline merged)
  const dataSourceForProvider = dataSource;

  // Store original data reference on mount and when tableData changes
  useEffect(() => {
    if (tableData && Array.isArray(tableData)) {
      originalTableDataRef.current = tableData;
    }
  }, [tableData]);

  // Mark as loaded after first render
  useEffect(() => {
    setIsLoading(false);
  }, []);

  // Controller fetches savedQueries for Data Source dropdown
  useEffect(() => {
    const loadSavedQueries = async () => {
      setLoadingQueries(true);
      try {
        const queries = await queryRegistry.getAllQueries();
        setSavedQueries(queries);
      } catch (error) {
        console.error('Error loading saved queries:', error);
      } finally {
        setLoadingQueries(false);
      }
    };
    loadSavedQueries();
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

  // Update defaultRows if it's not in the available options
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
  }, [rowsPerPageOptions, defaultRowsRaw]);

  // Ensure textFilterColumns is always an array
  const textFilterColumns = useMemo(() => {
    if (!Array.isArray(textFilterColumnsRaw)) {
      return [];
    }
    return textFilterColumnsRaw;
  }, [textFilterColumnsRaw]);

  // allowedColumns: array or object { main?, report?, nested?, group? }
  const allowedColumns = useMemo(() => {
    if (allowedColumnsRaw == null) return [];
    if (Array.isArray(allowedColumnsRaw)) return allowedColumnsRaw;
    if (typeof allowedColumnsRaw === 'object') return allowedColumnsRaw;
    return [];
  }, [allowedColumnsRaw]);

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

  // Ensure editableColumns has the correct structure
  const editableColumns = useMemo(() => {
    if (!editableColumnsRaw || typeof editableColumnsRaw !== 'object') {
      return { main: [], nested: {}, object: {} };
    }
    // Handle backward compatibility: if it's an array, convert to new format
    if (Array.isArray(editableColumnsRaw)) {
      return { main: editableColumnsRaw, nested: {}, object: {} };
    }
    // Ensure main, nested and object exist
    return {
      main: Array.isArray(editableColumnsRaw.main) ? editableColumnsRaw.main : [],
      nested: editableColumnsRaw.nested && typeof editableColumnsRaw.nested === 'object' ? editableColumnsRaw.nested : {},
      object: editableColumnsRaw.object && typeof editableColumnsRaw.object === 'object' ? editableColumnsRaw.object : {},
    };
  }, [editableColumnsRaw]);

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

  const setAllowedColumns = (value) => {
    if (Array.isArray(value) || (value && typeof value === 'object' && !Array.isArray(value))) {
      setAllowedColumnsRaw(value);
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

  const setEditableColumns = (value) => {
    if (value && typeof value === 'object') {
      // Handle both new format (object) and old format (array for backward compatibility)
      if (Array.isArray(value)) {
        setEditableColumnsRaw({ main: value, nested: {}, object: {} });
      } else if (value.main !== undefined || value.nested !== undefined || value.object !== undefined) {
        setEditableColumnsRaw({
          main: Array.isArray(value.main) ? value.main : [],
          nested: value.nested && typeof value.nested === 'object' ? value.nested : {},
          object: value.object && typeof value.object === 'object' ? value.object : {},
        });
      }
    }
  };

  // Handle group fields array (for infinite nesting)
  const groupFields = groupFieldsRaw;
  const setGroupFields = (value) => {
    if (Array.isArray(value)) {
      setGroupFieldsRaw(value);
      // Sync with outerGroupField and innerGroupField for backward compatibility
      setOuterGroupFieldRaw(value[0] || null);
      setInnerGroupFieldRaw(value[1] || null);
    }
  };

  // Handle outer group field (single value, not array) - already using localStorage hook
  // Keep for backward compatibility, but sync with groupFields
  const outerGroupField = outerGroupFieldRaw;
  const setOuterGroupField = (value) => {
    setOuterGroupFieldRaw(value);
    // Update groupFields array to maintain sync
    const newGroupFields = [...groupFieldsRaw];
    if (value) {
      newGroupFields[0] = value;
    } else {
      newGroupFields.shift(); // Remove first element if cleared
    }
    setGroupFieldsRaw(newGroupFields);
    // Clear inner group field when outer group field is cleared
    if (!value) {
      setInnerGroupFieldRaw(null);
    }
  };

  // Handle inner group field (single value, not array) - already using localStorage hook
  // Keep for backward compatibility, but sync with groupFields
  const innerGroupField = innerGroupFieldRaw;
  const setInnerGroupField = (value) => {
    setInnerGroupFieldRaw(value);
    // Update groupFields array to maintain sync
    const newGroupFields = [...groupFieldsRaw];
    if (value) {
      if (newGroupFields.length > 1) {
        newGroupFields[1] = value;
      } else if (newGroupFields.length === 1) {
        newGroupFields.push(value);
      } else {
        // If no outer group, add outer group first (maintain order)
        newGroupFields.push(outerGroupFieldRaw || null, value);
      }
    } else {
      // Remove second element if cleared
      if (newGroupFields.length > 1) {
        newGroupFields.splice(1, 1);
      }
    }
    setGroupFieldsRaw(newGroupFields);
  };

  // Slots config for DataProvider: use config slots when present, else build from flat state
  const slotsConfig = useMemo(() => {
    if (slotsConfigState && typeof slotsConfigState === 'object' && Object.keys(slotsConfigState).length > 0) {
      return slotsConfigState;
    }
    return buildSingleSlotFromFlat({
      enableSort,
      enableFilter,
      enableSummation,
      textFilterColumns,
      percentageColumns,
      derivedColumns,
      groupFields,
      redFields,
      greenFields,
      rowColumnStyles,
      enableCellEdit,
      editableColumns,
      formInputOverride,
      drawerTabs,
      enableReport,
      dateColumn,
      chartColumns,
      chartHeight,
    });
  }, [slotsConfigState, enableSort, enableFilter, enableSummation, textFilterColumns, percentageColumns, derivedColumns, groupFields, redFields, greenFields, rowColumnStyles, enableCellEdit, editableColumns, formInputOverride, drawerTabs, enableReport, dateColumn, chartColumns, chartHeight]);

  const slotIds = useMemo(() => Object.keys(slotsConfig), [slotsConfig]);
  const isMultiSlot = slotIds.length > 1;

  const getSlotTabName = useCallback((slotId) => {
    const slot = slotsConfig[slotId];
    return slot?.name || slot?.displayName || startCase(slotId);
  }, [slotsConfig]);

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

  // Drawer handlers removed - now handled in DataProvider via context
  // These are kept for backward compatibility when feature flag is off
  const handleOuterGroupClick = useCallback((rowData, column, value) => {
    // When orchestration layer is off, this will be handled by DataTableComponent
    // When on, it's handled via context in DataTableNew
  }, []);

  const handleInnerGroupClick = useCallback((rowData, column, value) => {
    // When orchestration layer is off, this will be handled by DataTableComponent
    // When on, it's handled via context in DataTableNew
  }, []);

  // Tab management functions (still used by DataTableControls)
  const handleAddDrawerTab = useCallback(() => {
    const newTab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: '',
      outerGroup: null,
      innerGroup: null
    };
    setDrawerTabs(prev => [...(prev || []), newTab]);
  }, []);

  const handleRemoveDrawerTab = useCallback((tabId) => {
    if (!drawerTabs || drawerTabs.length <= 1) return;
    const newTabs = drawerTabs.filter(tab => tab.id !== tabId);
    setDrawerTabs(newTabs);
  }, [drawerTabs]);

  const handleUpdateDrawerTab = useCallback((tabId, updates) => {
    setDrawerTabs(prev => {
      if (!prev) return prev;
      return prev.map(tab =>
        tab.id === tabId ? { ...tab, ...updates } : tab
      );
    });
  }, []);

  // Fetch config list on mount
  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    listConfigs()
      .then((list) => {
        if (!cancelled) {
          setConfigList(list);
          if (list.length > 0 && !list.some((c) => c.id === activeConfigId)) {
            setActiveConfigId(list[0].id);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Apply config to all state - maps config keys to setters
  const applyConfig = useCallback((config) => {
    if (!config) return;
    setAppliedConfig(config);
    const values = extractStateFromConfig(config);
    setDataSource(values.dataSource);
    setSelectedQueryKey(values.selectedQueryKey);
    setEnableSort(values.enableSort);
    setEnableFilter(values.enableFilter);
    setEnableSummation(values.enableSummation);
    setEnableCellEdit(values.enableCellEdit);
    setEnableDivideBy1Lakh(values.enableDivideBy1Lakh);
    setRowsPerPageOptionsRaw(values.rowsPerPageOptions);
    setDefaultRowsRaw(values.defaultRows);
    setTableHeight(values.tableHeight);
    setTextFilterColumnsRaw(values.textFilterColumns);
    setAllowedColumnsRaw(values.allowedColumns);
    setRedFieldsRaw(values.redFields);
    setGreenFieldsRaw(values.greenFields);
    setRowColumnStyles(values.rowColumnStyles || []);
    setGroupFields(values.groupFields || []);
    setEditableColumnsRaw(values.editableColumns);
    setPercentageColumns(values.percentageColumns);
    setDerivedColumns(values.derivedColumns);
    setColumnTypesOverride(values.columnTypesOverride);
    setFormInputOverride(values.formInputOverride);
    setIsAdminMode(values.isAdminMode);
    setSalesTeamColumn(values.salesTeamColumn);
    setSalesTeamValues(values.salesTeamValues || []);
    setHqColumn(values.hqColumn);
    setHqValues(values.hqValues || []);
    setEnableReport(values.enableReport);
    setDateColumn(values.dateColumn);
    setColumnsExemptFromBreakdown(values.columnsExemptFromBreakdown || []);
    setShowChart(values.showChart);
    const tabs = values.drawerTabs?.length > 0 ? values.drawerTabs : [{ id: `tab-${Date.now()}`, name: '', outerGroup: null, innerGroup: null }];
    setDrawerTabs(tabs);
    if (values.slots && typeof values.slots === 'object' && Object.keys(values.slots).length > 0) {
      setSlotsConfigState(values.slots);
    } else {
      setSlotsConfigState(null);
    }
    setConfigApplyKey((k) => k + 1);
  }, []);

  const handleConfigSelect = useCallback(async (id) => {
    setActiveConfigId(id);
    setConfigLoading(true);
    try {
      const config = await getConfig(id);
      applyConfig(config);
    } finally {
      setConfigLoading(false);
    }
  }, [applyConfig]);

  // --- Code mode handlers ---

  const loadFirebasePresets = useCallback(async () => {
    setFirebasePresetsLoading(true);
    try {
      const presets = await firestoreService.loadPresets();
      setFirebasePresets(presets);
    } catch (err) {
      console.error('Failed to load presets:', err);
    } finally {
      setFirebasePresetsLoading(false);
    }
  }, []);

  // Load Firebase presets on mount so the merged dropdown works in both modes
  useEffect(() => {
    loadFirebasePresets();
  }, [loadFirebasePresets]);

  const handleCodeModeToggle = useCallback(() => {
    setCodeMode(prev => {
      const next = !prev;
      if (next) loadFirebasePresets();
      return next;
    });
  }, [loadFirebasePresets]);

  const presetDropdownOptions = useMemo(() => {
    const localItems = configList.map(c => ({
      label: c.displayName,
      value: 'local:' + c.id,
      source: 'local',
    }));
    const fbItems = Object.keys(firebasePresets).map(name => ({
      label: name,
      value: 'firebase:' + name,
      source: 'firebase',
    }));
    return [
      { label: 'Local', items: localItems },
      { label: 'Firebase', items: fbItems },
    ];
  }, [configList, firebasePresets]);

  // Config-level dirty check: in-memory preset differs from applied config
  const isConfigDirty = checkConfigDirty(presetJsValue, appliedConfig);

  const handlePresetSelect = useCallback((key) => {
    setSelectedPresetKey(key);
    if (!key) { setPresetJsValue(''); return; }
    const [source, ...rest] = key.split(':');
    const id = rest.join(':');
    if (source === 'local') {
      const config = getLocalConfig(id);
      if (config) {
        const presetJs = configSerialized[id] ?? serializeConfigToJs(config);
        setPresetJsValue(presetJs);
        applyConfig(config);
      }
    } else if (source === 'firebase') {
      const stored = firebasePresets[id];
      if (stored) {
        setPresetJsValue(stored);
        try {
          const config = deserializeJsToConfig(stored);
          applyConfig(config);
        } catch (err) {
          console.error('Failed to apply Firebase preset:', err);
        }
      }
    }
  }, [firebasePresets, applyConfig]);

  // Load selected preset on mount and when entering code mode (dropdown shows default but presetJsValue was never populated)
  useEffect(() => {
    if (selectedPresetKey && !presetJsValue) {
      handlePresetSelect(selectedPresetKey);
    }
  }, [selectedPresetKey, presetJsValue, handlePresetSelect]);

  const handleCreateNewPreset = useCallback(() => {
    const name = window.prompt('Enter a name for the new preset:');
    if (!name?.trim()) return;
    const defaultId = getDefaultConfigId();
    const presetJs = configSerialized[defaultId] ?? serializeConfigToJs(getDefaultConfig() ?? {});
    setPresetJsValue(presetJs);
    const key = 'firebase:' + name.trim();
    setFirebasePresets(prev => ({ ...prev, [name.trim()]: presetJs }));
    setSelectedPresetKey(key);
  }, []);

  const handleDeletePreset = useCallback((presetName) => {
    confirmDialog({
      message: `Delete Firebase preset "${presetName}"? This cannot be undone.`,
      header: 'Delete Preset',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          await firestoreService.deletePreset(presetName);
          setFirebasePresets(prev => {
            const next = { ...prev };
            delete next[presetName];
            return next;
          });
          if (selectedPresetKey === 'firebase:' + presetName) {
            setSelectedPresetKey('');
            setPresetJsValue('');
          }
          toast.current?.show({ severity: 'success', summary: 'Deleted', detail: `Preset "${presetName}" deleted`, life: 3000 });
        } catch (err) {
          console.error('Failed to delete preset:', err);
          toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to delete preset', life: 3000 });
        }
      },
    });
  }, [selectedPresetKey]);

  const doSavePreset = useCallback(async (saveName, value) => {
    setPresetSaving(true);
    try {
      await firestoreService.savePreset(saveName, value);
      setFirebasePresets(prev => ({ ...prev, [saveName]: value }));
      const newKey = 'firebase:' + saveName;
      setSelectedPresetKey(newKey);
      toast.current?.show({ severity: 'success', summary: 'Saved', detail: `Preset "${saveName}" saved`, life: 3000 });
    } catch (err) {
      console.error('Failed to save preset:', err);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to save preset', life: 3000 });
    } finally {
      setPresetSaving(false);
    }
  }, []);

  const handleSavePreset = useCallback(() => {
    if (!selectedPresetKey || !presetJsValue) return;
    const [source, ...rest] = selectedPresetKey.split(':');
    let saveName = rest.join(':');

    if (source === 'local') {
      const localEntry = configList.find(c => c.id === saveName);
      const defaultName = (localEntry?.displayName || saveName) + ' (copy)';
      saveLocalAsFirebaseContextRef.current = { presetJsValue };
      setSaveLocalAsFirebaseName(defaultName);
      setSaveLocalAsFirebaseDialogVisible(true);
      return;
    }

    doSavePreset(saveName, presetJsValue);
  }, [selectedPresetKey, presetJsValue, configList, doSavePreset]);

  const handleSaveLocalAsFirebaseConfirm = useCallback(async () => {
    const name = saveLocalAsFirebaseName?.trim();
    if (!name) return;
    const ctx = saveLocalAsFirebaseContextRef.current;
    if (!ctx) return;
    setSaveLocalAsFirebaseDialogVisible(false);
    saveLocalAsFirebaseContextRef.current = null;
    await doSavePreset(name, ctx.presetJsValue);
  }, [saveLocalAsFirebaseName, doSavePreset]);

  const handleApplyPreset = useCallback((valueFromEditor) => {
    const toUse = (valueFromEditor && valueFromEditor.trim()) ? valueFromEditor : presetJsValue;
    if (!toUse) return;
    try {
      const config = deserializeJsToConfig(toUse);
      applyConfig(config);
      toast.current?.show({ severity: 'success', summary: 'Applied', detail: 'Preset config applied', life: 2000 });
    } catch (err) {
      console.error('Failed to apply preset:', err);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Invalid config: ' + err.message, life: 4000 });
    }
  }, [presetJsValue, applyConfig]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toast ref={toast} />
      <Dialog
        header="Save preset"
        visible={saveLocalAsFirebaseDialogVisible}
        onHide={() => setSaveLocalAsFirebaseDialogVisible(false)}
        style={{ width: '24rem' }}
        footer={
          <div className="flex gap-2 justify-end">
            <Button label="Cancel" severity="secondary" onClick={() => setSaveLocalAsFirebaseDialogVisible(false)} />
            <Button
              label="Save"
              icon="pi pi-save"
              onClick={handleSaveLocalAsFirebaseConfirm}
              disabled={!saveLocalAsFirebaseName?.trim()}
            />
          </div>
        }
      >
        <p className="text-sm text-gray-600 mb-3">
          Local presets cannot be overwritten. Create a new Firebase preset based on it?
        </p>
        <label className="font-medium text-sm mb-1">Preset name</label>
        <InputText
          value={saveLocalAsFirebaseName}
          onChange={(e) => setSaveLocalAsFirebaseName(e.target.value)}
          placeholder="Enter preset name"
          className="w-full"
        />
      </Dialog>
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
            key={configApplyKey}
            useLegacyProvider={useLegacyProvider}
            useOrchestrationLayer={true}
            offlineData={offlineData}
            onDataChange={handleDataChange}
            onError={handleError}
            onRawDataChange={handleRawDataChange}
            onTableDataChange={handleTableDataChange}
            onVariablesChange={handleVariablesChange}
            variableOverrides={variableOverrides}
            dataSource={dataSourceForProvider}
            selectedQueryKey={selectedQueryKey}
            onExecutingQueryChange={setExecutingQuery}
            onAvailableQueryKeysChange={setAvailableQueryKeys}
            onLoadingDataChange={setIsLoadingData}
            onSelectedQueryKeyChange={setSelectedQueryKey}
            isAdminMode={isAdminMode}
            salesTeamColumn={salesTeamColumn}
            salesTeamValues={salesTeamValues}
            hqColumn={hqColumn}
            hqValues={hqValues}
            slots={slotsConfig}
            enableSort={enableSort}
            enableFilter={enableFilter}
            enableSummation={enableSummation}
            textFilterColumns={textFilterColumns}
            allowedColumns={allowedColumns}
            onAllowedColumnsChange={setAllowedColumns}
            percentageColumns={percentageColumns}
            derivedColumns={derivedColumns}
            outerGroupField={outerGroupField}
            innerGroupField={innerGroupField}
            groupFields={groupFields}
            redFields={redFields}
            greenFields={greenFields}
            rowColumnStyles={rowColumnStyles}
            enableDivideBy1Lakh={enableDivideBy1Lakh}
            columnTypesOverride={columnTypesOverride}
            enableCellEdit={enableCellEdit}
            editableColumns={editableColumns}
            formInputOverride={formInputOverride}
            drawerTabs={drawerTabs}
            onDrawerTabsChange={setDrawerTabs}
            enableReport={enableReport}
            dateColumn={dateColumn}
            columnsExemptFromBreakdown={columnsExemptFromBreakdown}
            chartColumns={chartColumns}
            chartHeight={chartHeight}
          >
            {isDebugTableContext ? (
              <div className="flex-1 min-h-0 flex flex-col overflow-auto">
                {showLegacyProviderToggle && (
                  <div className="shrink-0 flex items-center gap-3 px-3 py-2 bg-amber-50 border-b border-amber-200 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={useLegacyProvider} onChange={(e) => setUseLegacyProvider(e.target.checked)} className="rounded" />
                      <span>Use legacy provider (DataProviderOld)</span>
                    </label>
                    <span className="text-amber-700">{useLegacyProvider ? 'Legacy' : 'New'}</span>
                  </div>
                )}
                <div className="shrink-0 p-3 sm:p-4 md:p-6 pb-0">
                  <DebugDataContext
                    hideTable={hideTableInDebug}
                    onHideTableChange={setHideTableInDebug}
                  />
                </div>
                {!hideTableInDebug && (
                  <div className="flex-1 min-h-0 flex flex-col min-w-0 p-3 sm:p-4 md:p-6">
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
                      <>
                        {showChart && (
                          <div className="w-full mb-4">
                            <ReportLineChartWrapper />
                          </div>
                        )}
                        {isMultiSlot ? (
                          <TabView className="flex-1 flex flex-col min-h-0" renderActiveOnly={false}>
                            {slotIds.map((slotId) => (
                              <TabPanel key={slotId} header={getSlotTabName(slotId)} className="flex-1 flex flex-col min-h-0">
                                <div className="flex-1 min-h-0 flex flex-col">
                                  <DataTableNew
                                    slotId={slotId}
                                    scrollHeight={tableHeight}
                                    rowsPerPageOptions={rowsPerPageOptions}
                                    defaultRows={defaultRows}
                                    scrollable={false}
                                    enableCellEdit={enableCellEdit}
                                    editableColumns={editableColumns}
                                    onCellEditComplete={handleCellEditComplete}
                                    onOuterGroupClick={handleOuterGroupClick}
                                    onInnerGroupClick={handleInnerGroupClick}
                                    tableName={slotId}
                                    useOrchestrationLayer={true}
                                  />
                                </div>
                              </TabPanel>
                            ))}
                          </TabView>
                        ) : (
                          <DataTableNew
                            scrollHeight={tableHeight}
                            rowsPerPageOptions={rowsPerPageOptions}
                            defaultRows={defaultRows}
                            scrollable={false}
                            enableCellEdit={enableCellEdit}
                            editableColumns={editableColumns}
                            onCellEditComplete={handleCellEditComplete}
                            onOuterGroupClick={handleOuterGroupClick}
                            onInnerGroupClick={handleInnerGroupClick}
                            tableName="main"
                            useOrchestrationLayer={true}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              {showLegacyProviderToggle && (
                <div className="shrink-0 flex items-center gap-3 px-3 py-2 bg-amber-50 border-b border-amber-200 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={useLegacyProvider} onChange={(e) => setUseLegacyProvider(e.target.checked)} className="rounded" />
                    <span>Use legacy provider (DataProviderOld)</span>
                  </label>
                  <span className="text-amber-700">{useLegacyProvider ? 'Legacy' : 'New'}</span>
                </div>
              )}
              <Splitter style={{ height: '100%' }} layout="horizontal" className="h-full flex-1 min-h-0">
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
                      <>
                        {/* Report Line Chart - Only render in report mode */}
                        {showChart && (
                          <div className="w-full mb-4">
                            <ReportLineChartWrapper />
                          </div>
                        )}
                        {isMultiSlot ? (
                          <TabView className="flex-1 flex flex-col min-h-0" renderActiveOnly={false}>
                            {slotIds.map((slotId) => (
                              <TabPanel key={slotId} header={getSlotTabName(slotId)} className="flex-1 flex flex-col min-h-0">
                                <div className="flex-1 min-h-0 flex flex-col">
                                  <DataTableNew
                                    slotId={slotId}
                                    scrollHeight={tableHeight}
                                    rowsPerPageOptions={rowsPerPageOptions}
                                    defaultRows={defaultRows}
                                    scrollable={false}
                                    enableCellEdit={enableCellEdit}
                                    editableColumns={editableColumns}
                                    onCellEditComplete={handleCellEditComplete}
                                    onOuterGroupClick={handleOuterGroupClick}
                                    onInnerGroupClick={handleInnerGroupClick}
                                    tableName={slotId}
                                    useOrchestrationLayer={true}
                                  />
                                </div>
                              </TabPanel>
                            ))}
                          </TabView>
                        ) : (
                          <DataTableNew
                            scrollHeight={tableHeight}
                            rowsPerPageOptions={rowsPerPageOptions}
                            defaultRows={defaultRows}
                            scrollable={false}
                            enableCellEdit={enableCellEdit}
                            editableColumns={editableColumns}
                            onCellEditComplete={handleCellEditComplete}
                            onOuterGroupClick={handleOuterGroupClick}
                            onInnerGroupClick={handleInnerGroupClick}
                            tableName="main"
                            useOrchestrationLayer={true}
                          />
                        )}
                      </>
                    )}
                  </div>
                </SplitterPanel>
                <SplitterPanel className="flex flex-col min-w-0 overflow-hidden border-l border-gray-200" size={20} minSize={2}>
                  <DataTableControls
                    codeMode={codeMode}
                    onCodeModeToggle={handleCodeModeToggle}
                    presetDropdownOptions={presetDropdownOptions}
                    selectedPresetKey={selectedPresetKey}
                    onPresetSelect={handlePresetSelect}
                    presetJsValue={presetJsValue}
                    onPresetJsChange={setPresetJsValue}
                    onSavePreset={handleSavePreset}
                    onApplyPreset={handleApplyPreset}
                    onCreateNewPreset={handleCreateNewPreset}
                    onDeletePreset={handleDeletePreset}
                    presetSaving={presetSaving}
                    isConfigDirty={isConfigDirty}
                  />
                </SplitterPanel>
              </Splitter>
            </div>
            )}
          </DataProvider>
        )}
      </main>
      {/* Drawer Sidebar rendered inside DataProvider */}
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
