'use client';

import DataTableComponent from '@/app/datatable/components/DataTableOld';
import Editor from '@monaco-editor/react';
import { Button } from 'primereact/button';
import { TabPanel, TabView } from 'primereact/tabview';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { useTableDialogStore } from '../stores/useTableDialogStore';
import { createExecutionContext, executePipeline, executeTransformer } from '../utils/query-pipeline';

/**
 * Utility functions to work with both Object and Map for processedData
 * These functions provide a unified interface for accessing data regardless of structure
 */

/**
 * Get keys from either Object or Map
 * @param {Object|Map} data - Data structure (Object or Map)
 * @returns {Array<string>} Array of keys
 */
function getDataKeys(data) {
  if (!data) {
    return [];
  }
  let result;
  if (data instanceof Map) {
    result = Array.from(data.keys());
  } else {
    result = Object.keys(data);
  }
  return result;
}

/**
 * Get value from either Object or Map
 * @param {Object|Map} data - Data structure (Object or Map)
 * @param {string} key - Key to retrieve
 * @returns {*} Value associated with the key, or undefined if not found
 */
function getDataValue(data, key) {
  if (!data || !key) return undefined;
  if (data instanceof Map) {
    return data.get(key);
  }
  return data[key];
}

/**
 * Memoized DataTable wrapper component that only re-renders when data changes
 * This prevents expensive re-renders when parent re-renders for unrelated reasons
 */
const MemoizedDataTable = memo(({ data, enableFullscreenDialog }) => {
  return (
    <>
      <DataTableComponent
        data={data}
        enableFullscreenDialog={enableFullscreenDialog}
      />
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function: only re-render if data reference changed
  // Since we're using useMemo for data extraction, references will be stable
  // unless the actual data changed
  return prevProps.data === nextProps.data && prevProps.enableFullscreenDialog === nextProps.enableFullscreenDialog;
});

MemoizedDataTable.displayName = 'MemoizedDataTable';

export function DataTransformerTab({ responseData, activeTabIndex = 0 }) {
  const { activeTab, setActiveTab } = useTableDialogStore();
  const { endpointUrl, authToken, tabData, setTabData, graphiQLState, getTabData } = useAppStore();
  const activeGraphiQLTabIndex = activeTabIndex;
  const [isRunning, setIsRunning] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [rawResponseData, setRawResponseData] = useState(null); // Store raw data before transformation
  const isExecuting = graphiQLState?.isExecuting || false;

  // Get transformer code and processedData from current GraphiQL tab's data
  const currentTabInfo = useMemo(() => {
    return getTabData(activeGraphiQLTabIndex);
  }, [tabData, activeGraphiQLTabIndex, getTabData]);

  const transformerCode = currentTabInfo.transformerCode || '';
  const hasSuccessfulQuery = currentTabInfo.hasSuccessfulQuery;
  const processedData = currentTabInfo.processedData || null;

  // Set transformer code for current GraphiQL tab
  const setTransformerCode = useCallback((code) => {
    setTabData(activeGraphiQLTabIndex, { transformerCode: code || '' });
  }, [activeGraphiQLTabIndex, setTabData]);

  // Helper function to check if a value should be included (only arrays with length > 0)
  const isValidDataValue = useCallback((value) => {
    if (!value) return false;
    if (Array.isArray(value)) return value.length > 0;
    return false; // Only arrays are supported
  }, []);

  // Store raw data when responseData prop changes (from GraphiQL)
  // Note: processedData is now set per-tab in page.jsx when query executes
  // This effect only needs to store rawResponseData for transformer use
  useEffect(() => {
    if (responseData) {
      setRawResponseData(responseData);
    } else {
      setRawResponseData(null);
    }
  }, [responseData]);

  // Compute queryKeys from processedData
  const queryKeys = useMemo(() => {
    if (!processedData) {
      return [];
    }
    const allKeys = getDataKeys(processedData);
    const validKeys = allKeys.filter(key => {
      const value = getDataValue(processedData, key);
      return isValidDataValue(value);
    });

    // Warn about ignored non-array keys
    const ignoredKeys = allKeys.filter(key => {
      const value = getDataValue(processedData, key);
      return value && typeof value === 'object' && !Array.isArray(value);
    });
    if (ignoredKeys.length > 0) {
      console.warn(`The following keys are being ignored (only arrays are supported): ${ignoredKeys.join(', ')}`);
    }

    return validKeys;
  }, [processedData, isValidDataValue]);

  // Memoize data extraction for each queryKey to prevent unnecessary re-renders
  // This ensures stable references that won't trigger re-renders unless data actually changes
  const memoizedDataByKey = useMemo(() => {
    if (!processedData && !rawResponseData) return {};
    if (queryKeys.length === 0) return {};

    const dataMap = {};
    queryKeys.forEach((queryKey) => {
      const data = processedData ? getDataValue(processedData, queryKey) : rawResponseData[queryKey];
      dataMap[queryKey] = data;
    });
    return dataMap;
  }, [processedData, rawResponseData, queryKeys]); // queryKeys is already memoized, so this is safe

  // Note: No longer resetting processedData on unmount - it persists globally across tabs

  // Apply transformer code explicitly
  const applyTransformer = useCallback(async () => {
    if (isRunning) {
      return;
    }

    if (!transformerCode || transformerCode.trim() === '') {
      return;
    }

    if (!rawResponseData) {
      return;
    }

    setIsRunning(true);
    setHasError(false);

    try {
      // Create execution context for transformer-initiated queries
      const context = createExecutionContext();

      // Create query function that uses the pipeline
      const queryFunction = async (queryId) => {
        if (!queryId || !queryId.trim()) {
          throw new Error('Query key is required');
        }
        return executePipeline(queryId, context, {
          endpointUrl,
          authToken,
        });
      };

      // Execute transformer with raw data
      const transformedData = await executeTransformer(
        transformerCode,
        rawResponseData,
        queryFunction
      );
      console.debug("Output: ", transformedData);
      // Update processed data per-tab
      setTabData(activeGraphiQLTabIndex, { processedData: transformedData });
    } catch (error) {
      setHasError(true);
    } finally {
      setIsRunning(false);
    }
  }, [transformerCode, isRunning, rawResponseData, endpointUrl, authToken, activeGraphiQLTabIndex, setTabData]);

  // Auto-apply transformer once when conditions are first met (same as button enabled check)
  const hasAutoAppliedRef = useRef(false);
  useEffect(() => {
    // Only try once when conditions are first met
    if (hasAutoAppliedRef.current) {
      return;
    }

    // Same conditions as button enabled check (inverse of disabled)
    const canApply = transformerCode &&
      transformerCode.trim() !== '' &&
      rawResponseData &&
      hasSuccessfulQuery &&
      !isRunning;

    if (canApply) {
      hasAutoAppliedRef.current = true;
      applyTransformer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transformerCode, rawResponseData, hasSuccessfulQuery, isRunning]); // Watch conditions and apply once when first met (applyTransformer excluded - ref guard prevents re-execution)

  // Handle apply button click - always apply when button is clicked
  const handlePlayClick = useCallback(() => {
    applyTransformer();
  }, [applyTransformer]);

  // Always show splitter layout, conditionally render table or message
  return (
    <div className="h-full overflow-hidden">
      <Splitter style={{ height: '100%' }} layout="horizontal">
        {/* Left side: Table/TabView or Message*/}
        <SplitterPanel className="flex flex-col min-w-0" size={70} minSize={30}>
          <div className="h-full flex flex-col overflow-hidden min-h-0">
            {isExecuting ? (
              <div className="flex items-center justify-center h-full bg-gray-50">
                <div className="text-center p-8">
                  <i className="pi pi-spin pi-spinner text-4xl text-gray-400 mb-4"></i>
                  <p className="text-gray-600 font-medium">Executing query...</p>
                </div>
              </div>
            ) : !rawResponseData || queryKeys.length === 0 ? (
              <div className="flex items-center justify-center h-full bg-gray-50">
                <div className="text-center p-8">
                  <i className="pi pi-info-circle text-4xl text-gray-400 mb-4"></i>
                  <p className="text-gray-600 font-medium">Run query to unlock Data Transformer</p>
                </div>
              </div>
            ) : queryKeys.length > 1 ? (
              <TabView
                activeIndex={activeTab}
                onTabChange={(e) => {
                  setActiveTab(e.index);
                }}
                className="data-transformer-tabview"
                style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}
              >
                {queryKeys.map((queryKey) => {
                  const tableData = memoizedDataByKey[queryKey] ?? (processedData ? getDataValue(processedData, queryKey) : rawResponseData?.[queryKey]);
                  return (
                    <TabPanel key={queryKey} header={queryKey}>
                      <div className="h-full overflow-auto" style={{ height: '100%', overflow: 'auto', flex: 1, minHeight: 0, padding: '0.5rem' }}>
                        <MemoizedDataTable
                          data={tableData}
                          enableFullscreenDialog={false}
                        />
                      </div>
                    </TabPanel>
                  );
                })}
              </TabView>
            ) : (
              <div className="h-full overflow-auto" style={{ height: '100%', overflow: 'auto', flex: 1, minHeight: 0, padding: '0.5rem' }}>
                <MemoizedDataTable
                  data={memoizedDataByKey[queryKeys[0]] ?? (processedData ? getDataValue(processedData, queryKeys[0]) : rawResponseData?.[queryKeys[0]])}
                  enableFullscreenDialog={false}
                />
              </div>
            )}
          </div>
        </SplitterPanel>

        {/* Right side: Controls */}
        <SplitterPanel className="flex flex-col min-w-0 border-l border-gray-200" size={30} minSize={20}>
          <div className="h-full flex flex-col overflow-hidden p-4 bg-gray-50">
            {/* Monaco Editor */}
            <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700">
                  Transformer Function:
                </label>
                <Button
                  icon={isRunning ? "pi pi-spin pi-spinner" : "pi pi-play"}
                  label={isRunning ? "Applying..." : "Apply"}
                  className={
                    isRunning
                      ? "p-button-danger"
                      : hasError
                        ? "p-button-danger"
                        : "p-button-primary"
                  }
                  onClick={handlePlayClick}
                  title={
                    isRunning
                      ? "Click to interrupt execution"
                      : hasError
                        ? "Previous execution had an error - Click to apply again"
                        : "Apply transformer function"
                  }
                  loading={isRunning}
                  disabled={!transformerCode || transformerCode.trim() === '' || !rawResponseData || !currentTabInfo.hasSuccessfulQuery}
                  style={{
                    minWidth: '100px',
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                />
              </div>
              <div className="flex-1 border border-gray-300 rounded-lg overflow-hidden" style={{ minHeight: 0, height: '100%' }}>
                <Editor
                  height="100%"
                  language="javascript"
                  value={transformerCode}
                  onChange={(value) => {
                    setTransformerCode(value || '');
                  }}
                  theme="vs-light"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 12,
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                  }}
                />
              </div>
            </div>
          </div>
        </SplitterPanel>
      </Splitter>
    </div>
  );
}

