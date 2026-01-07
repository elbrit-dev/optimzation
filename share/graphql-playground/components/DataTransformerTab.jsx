'use client';

import DataTableComponent from '@/app/datatable/components/DataTable';
import Editor from '@monaco-editor/react';
import { Button } from 'primereact/button';
import { TabPanel, TabView } from 'primereact/tabview';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { useTableDialogStore } from '../stores/useTableDialogStore';
import { createExecutionContext, executePipeline, executeTransformer } from '../utils/query-pipeline';

export function DataTransformerTab({ responseData, activeTabIndex = 0 }) {
  const { activeTab, setActiveTab, processedData, setProcessedData, reset } = useTableDialogStore();
  const { endpointUrl, authToken, tabData, setTabData } = useAppStore();
  const activeGraphiQLTabIndex = activeTabIndex;
  const [isRunning, setIsRunning] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [rawResponseData, setRawResponseData] = useState(null); // Store raw data before transformation
  const lastAppliedDataRef = useRef(null); // Track last data we applied transformer to

  // Get transformer code from current GraphiQL tab's data
  const currentTabInfo = useMemo(() => {
    return tabData[activeGraphiQLTabIndex] || { hasSuccessfulQuery: false, transformedData: null, transformerCode: '' };
  }, [tabData, activeGraphiQLTabIndex]);

  const transformerCode = currentTabInfo.transformerCode || '';

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
  useEffect(() => {
    if (responseData) {
      setRawResponseData(responseData);
      // Initialize processedData with raw data (transformer will update it if present)
      const allKeys = Object.keys(responseData);
      const queryKeys = allKeys.filter(key => isValidDataValue(responseData[key]));
      
      // Warn about ignored non-array keys
      const ignoredKeys = allKeys.filter(key => {
        const value = responseData[key];
        return value && typeof value === 'object' && !Array.isArray(value);
      });
      if (ignoredKeys.length > 0) {
        console.warn(`The following keys are being ignored (only arrays are supported): ${ignoredKeys.join(', ')}`);
      }
      
      if (queryKeys.length > 0) {
        setProcessedData(responseData);
      } else {
        setProcessedData(null);
      }
    } else {
      setRawResponseData(null);
      setProcessedData(null);
    }
  }, [responseData, setProcessedData, isValidDataValue]);

  // Compute queryKeys from processedData
  const queryKeys = useMemo(() => {
    if (!processedData) return [];
    const allKeys = Object.keys(processedData);
    const validKeys = allKeys.filter(key => isValidDataValue(processedData[key]));
    
    // Warn about ignored non-array keys
    const ignoredKeys = allKeys.filter(key => {
      const value = processedData[key];
      return value && typeof value === 'object' && !Array.isArray(value);
    });
    if (ignoredKeys.length > 0) {
      console.warn(`The following keys are being ignored (only arrays are supported): ${ignoredKeys.join(', ')}`);
    }
    
    return validKeys;
  }, [processedData, isValidDataValue]);

  // Reset when component unmounts or data is cleared
  useEffect(() => {
    return () => {
      reset();
      setRawResponseData(null);
      setIsRunning(false);
      setHasError(false);
    };
  }, [reset]);

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
      // Update processed data
      setProcessedData(transformedData);
    } catch (error) {
      setHasError(true);
    } finally {
      setIsRunning(false);
    }
  }, [transformerCode, isRunning, rawResponseData, endpointUrl, authToken, setProcessedData]);

  // Apply transformer automatically when component first renders with data and transformer code exists
  useEffect(() => {
    if (!transformerCode || transformerCode.trim() === '' || !rawResponseData) {
      return;
    }

    // Only apply once when component first renders with data (not on subsequent data changes)
    if (lastAppliedDataRef.current === rawResponseData) {
      return;
    }

    // Mark as applied and run transformer
    lastAppliedDataRef.current = rawResponseData;
    applyTransformer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Reset tracking when data changes (new query executed)
  useEffect(() => {
    if (rawResponseData && lastAppliedDataRef.current !== rawResponseData) {
      // New data arrived - reset tracking so user can explicitly apply transformer if desired
      lastAppliedDataRef.current = null;
    }
  }, [rawResponseData]);

  // Handle apply button click - always apply when button is clicked
  const handlePlayClick = useCallback(() => {
    // Reset tracking so transformer can re-run
    lastAppliedDataRef.current = null;
    applyTransformer();
  }, [applyTransformer]);

  // Early returns after all hooks
  if (!rawResponseData) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center p-8">
          <i className="pi pi-info-circle text-4xl text-gray-400 mb-4"></i>
          <p className="text-gray-600 font-medium">Run query to unlock Data Transformer</p>
        </div>
      </div>
    );
  }

  if (queryKeys.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center p-8">
          <i className="pi pi-info-circle text-4xl text-gray-400 mb-4"></i>
          <p className="text-gray-600 font-medium">Run query to unlock Data Transformer</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <Splitter style={{ height: '100%' }} layout="horizontal">
        {/* Left side: Table/TabView*/}
        <SplitterPanel className="flex flex-col min-w-0" size={70} minSize={30}>
          <div className="h-full flex flex-col overflow-hidden min-h-0">
            {queryKeys.length > 1 ? (
              <TabView
                activeIndex={activeTab}
                onTabChange={(e) => {
                  setActiveTab(e.index);
                }}
                className="data-transformer-tabview"
                style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}
              >
                {queryKeys.map((queryKey) => (
                  <TabPanel key={queryKey} header={queryKey}>
                    <div className="h-full overflow-auto" style={{ height: '100%', overflow: 'auto', flex: 1, minHeight: 0, padding: '0.5rem' }}>
                      <DataTableComponent
                        data={processedData ? processedData[queryKey] : rawResponseData[queryKey]}
                        enableFullscreenDialog={false}
                      />
                    </div>
                  </TabPanel>
                ))}
              </TabView>
            ) : (
              <div className="h-full overflow-auto" style={{ height: '100%', overflow: 'auto', flex: 1, minHeight: 0, padding: '0.5rem' }}>
                <DataTableComponent
                  data={processedData ? processedData[queryKeys[0]] : rawResponseData[queryKeys[0]]}
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
                  disabled={!transformerCode || transformerCode.trim() === ''}
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
                  onChange={(value) => setTransformerCode(value || '')}
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

