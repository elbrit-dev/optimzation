'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Toast } from 'primereact/toast';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { Dropdown } from 'primereact/dropdown';
import DataTableNew from './components/DataTableNew';
import DataTableControls from './components/DataTableControls';
import DataProvider from './components/DataProvider';
import data from '@/resource/data';
import testData from '@/resource/test';
import { uniq, flatMap, isEmpty, startCase, filter as lodashFilter, get, isNil, debounce } from 'lodash';
import { getDataKeys, getDataValue } from './utils/dataAccessUtils';
import ProtectedRoute from '@/components/ProtectedRoute';
import { defaultDataTableConfig } from './config/defaultConfig';


function DataTablePage() {
  const toast = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tableData, setTableData] = useState(data); // Filtered data for DataTable
  const [rawTableData, setRawTableData] = useState(data); // Full/original data for Auth Control in DataTableControls
  const [currentDataSource, setCurrentDataSource] = useState(null);
  // State for Data Source and Query Key selectors (controlled by page)
  const [dataSource, setDataSource] = useState(defaultDataTableConfig.dataSource);
  const [selectedQueryKey, setSelectedQueryKey] = useState(defaultDataTableConfig.selectedQueryKey);
  // State exposed from DataProvider for selectors
  const [savedQueries, setSavedQueries] = useState([]);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [executingQuery, setExecutingQuery] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [availableQueryKeys, setAvailableQueryKeys] = useState([]);
  const [enableSort, setEnableSort] = useState(defaultDataTableConfig.enableSort);
  const [enableFilter, setEnableFilter] = useState(defaultDataTableConfig.enableFilter);
  const [enableSummation, setEnableSummation] = useState(defaultDataTableConfig.enableSummation);
  const [enableCellEdit, setEnableCellEdit] = useState(defaultDataTableConfig.enableCellEdit);
  const [enableDivideBy1Lakh, setEnableDivideBy1Lakh] = useState(defaultDataTableConfig.enableDivideBy1Lakh);
  const [rowsPerPageOptionsRaw, setRowsPerPageOptionsRaw] = useState(defaultDataTableConfig.rowsPerPageOptions);
  const [defaultRowsRaw, setDefaultRowsRaw] = useState(defaultDataTableConfig.defaultRows);
  const [tableHeight, setTableHeight] = useState(defaultDataTableConfig.tableHeight);
  const [textFilterColumnsRaw, setTextFilterColumnsRaw] = useState(defaultDataTableConfig.textFilterColumns);
  const [visibleColumnsRaw, setVisibleColumnsRaw] = useState(defaultDataTableConfig.visibleColumns);
  const [redFieldsRaw, setRedFieldsRaw] = useState(defaultDataTableConfig.redFields);
  const [greenFieldsRaw, setGreenFieldsRaw] = useState(defaultDataTableConfig.greenFields);
  const [outerGroupFieldRaw, setOuterGroupFieldRaw] = useState(defaultDataTableConfig.outerGroupField);
  const [innerGroupFieldRaw, setInnerGroupFieldRaw] = useState(defaultDataTableConfig.innerGroupField);
  const [nonEditableColumnsRaw, setNonEditableColumnsRaw] = useState(defaultDataTableConfig.nonEditableColumns);
  const [percentageColumns, setPercentageColumns] = useState(defaultDataTableConfig.percentageColumns);
  const [queryVariables, setQueryVariables] = useState({});
  const [variableOverrides, setVariableOverrides] = useState({});
  const [columnTypesOverride, setColumnTypesOverride] = useState(defaultDataTableConfig.columnTypesOverride);
  // Auth Control settings
  const [isAdminMode, setIsAdminMode] = useState(defaultDataTableConfig.isAdminMode);
  const [salesTeamColumn, setSalesTeamColumn] = useState(defaultDataTableConfig.salesTeamColumn);
  const [salesTeamValues, setSalesTeamValues] = useState(defaultDataTableConfig.salesTeamValues);
  const [hqColumn, setHqColumn] = useState(defaultDataTableConfig.hqColumn);
  const [hqValues, setHqValues] = useState(defaultDataTableConfig.hqValues);
  // Report settings state
  const [enableReport, setEnableReport] = useState(defaultDataTableConfig.enableReport);
  const [dateColumn, setDateColumn] = useState(defaultDataTableConfig.dateColumn);
  const [breakdownType, setBreakdownType] = useState(defaultDataTableConfig.breakdownType);
  const [enableBreakdown, setEnableBreakdown] = useState(false);

  // Drawer tabs state (still managed here for DataTableControls, but drawer rendering moved to DataProvider)
  const [drawerTabs, setDrawerTabs] = useState(defaultDataTableConfig.drawerTabs.length > 0 ? defaultDataTableConfig.drawerTabs : [{ id: `tab-${Date.now()}`, name: '', outerGroup: null, innerGroup: null }]);

  // Ensure at least one tab exists
  useEffect(() => {
    if (!drawerTabs || drawerTabs.length === 0) {
      setDrawerTabs([{ id: `tab-${Date.now()}`, name: '', outerGroup: null, innerGroup: null }]);
    }
  }, [drawerTabs, setDrawerTabs]);

  // Turn off enableBreakdown when enableReport is turned off
  useEffect(() => {
    if (!enableReport) {
      setEnableBreakdown(false);
    }
  }, [enableReport]);

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

  // Handle data source changes
  const handleDataSourceChange = useCallback((newDataSource) => {
    setCurrentDataSource(newDataSource);
    setDataSource(newDataSource);
  }, []);

  // Handle variables change from DataProvider
  const handleVariablesChange = useCallback((variables) => {
    setQueryVariables(variables);
    // Reset overrides when variables change
    setVariableOverrides({});
  }, []);


  // Select the appropriate offline data based on dataSource
  const offlineData = useMemo(() => {
    if (dataSource === 'test') {
      return testData;
    }
    return data;
  }, [dataSource]);

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
            useOrchestrationLayer={true}
            offlineData={offlineData}
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
            enableSort={enableSort}
            enableFilter={enableFilter}
            enableSummation={enableSummation}
            textFilterColumns={textFilterColumns}
            visibleColumns={visibleColumns}
            onVisibleColumnsChange={setVisibleColumns}
            percentageColumns={percentageColumns}
            outerGroupField={outerGroupField}
            innerGroupField={innerGroupField}
            redFields={redFields}
            greenFields={greenFields}
            enableDivideBy1Lakh={enableDivideBy1Lakh}
            columnTypesOverride={columnTypesOverride}
            drawerTabs={drawerTabs}
            onDrawerTabsChange={setDrawerTabs}
            enableReport={enableReport}
            dateColumn={dateColumn}
            breakdownType={breakdownType}
            onBreakdownTypeChange={setBreakdownType}
            enableBreakdown={enableBreakdown}
            onEnableBreakdownChange={setEnableBreakdown}
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
                      <DataTableNew
                        scrollHeight={tableHeight}
                        rowsPerPageOptions={rowsPerPageOptions}
                        defaultRows={defaultRows}
                        scrollable={false}
                        enableCellEdit={enableCellEdit}
                        nonEditableColumns={nonEditableColumns}
                        onCellEditComplete={handleCellEditComplete}
                        onOuterGroupClick={handleOuterGroupClick}
                        onInnerGroupClick={handleInnerGroupClick}
                        tableName="main"
                        useOrchestrationLayer={true}
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
                    tableHeight={tableHeight}
                    onTableHeightChange={setTableHeight}
                    onTextFilterColumnsChange={setTextFilterColumns}
                    onVisibleColumnsChange={setVisibleColumns}
                    onRedFieldsChange={setRedFields}
                    onGreenFieldsChange={setGreenFields}
                    onOuterGroupFieldChange={setOuterGroupField}
                    onInnerGroupFieldChange={setInnerGroupField}
                    onNonEditableColumnsChange={setNonEditableColumns}
                    onPercentageColumnsChange={setPercentageColumns}
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
                    columnTypesOverride={columnTypesOverride}
                    onColumnTypesOverrideChange={handleColumnTypesOverrideChange}
                    enableReport={enableReport}
                    dateColumn={dateColumn}
                    breakdownType={breakdownType}
                    onEnableReportChange={setEnableReport}
                    onDateColumnChange={setDateColumn}
                    onBreakdownTypeChange={setBreakdownType}
                    dataSource={dataSource}
                    selectedQueryKey={selectedQueryKey}
                    availableQueryKeys={availableQueryKeys}
                    savedQueries={savedQueries}
                    loadingQueries={loadingQueries}
                    executingQuery={executingQuery}
                    onDataSourceChange={setDataSource}
                    onSelectedQueryKeyChange={setSelectedQueryKey}
                  />
                </SplitterPanel>
              </Splitter>
            </div>
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
