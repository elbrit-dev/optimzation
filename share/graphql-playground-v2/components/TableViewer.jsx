'use client';

import DataProviderNew from '@/app/datatable/components/DataProviderNew';
import DataTableComponent from '@/app/datatable/components/DataTableNew';
import { getEndpointConfigFromUrlKey, getInitialEndpoint } from '@/app/graphql-playground/constants';
import { extractDataFromResponse } from '@/app/graphql-playground/utils/data-extractor';
import {
  createExecutionContext,
  executePipeline,
  executeTransformer,
} from '@/app/graphql-playground/utils/query-pipeline';
import { TabPanel, TabView } from 'primereact/tabview';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlaygroundStore } from '../stores/usePlaygroundStore';

/**
 * Get keys from either Object or Map
 */
function getDataKeys(data) {
  if (!data) return [];
  if (data instanceof Map) return Array.from(data.keys());
  return Object.keys(data);
}

/**
 * Get value from either Object or Map
 */
function getDataValue(data, key) {
  if (!data) return null;
  if (data instanceof Map) return data.get(key);
  return data[key];
}

function normalizeDataForTable(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data instanceof Map) return Array.from(data.values());
  if (typeof data === 'object') return [data];
  return [];
}

export function TableViewer() {
  const {
    query,
    response,
    selectedEnvironment,
    transformerFunction: transformerCode,
    setRawTableData,
    setTransformedTableData,
    setIsTransforming,
  } = usePlaygroundStore();
  const [rawResponseData, setRawResponseData] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const latestTransformRef = useRef(null);
  const transformerCodeRef = useRef(transformerCode);

  // Keep transformer code ref in sync (but don't trigger re-processing)
  useEffect(() => {
    transformerCodeRef.current = transformerCode;
  }, [transformerCode]);

  // Process response from store when it changes (for persistence across tab switches)
  // Only processes when response/query changes, NOT when transformer code changes
  useEffect(() => {
    const processResponse = async () => {
      if (!response || !query) {
        setRawResponseData(null);
        setProcessedData(null);
        latestTransformRef.current = null;
        setRawTableData(null);
        setTransformedTableData(null);
        setIsTransforming(false);
        return;
      }

      try {
        // Parse response JSON
        const jsonData = typeof response === 'string' ? JSON.parse(response) : response;

        // Extract raw data from response
        const rawData = extractDataFromResponse(jsonData, query);
        setRawResponseData(rawData);
        setRawTableData(rawData || null);

        // Apply transformer if available (use ref to get latest value without triggering effect)
        const currentTransformerCode = transformerCodeRef.current;
        if (currentTransformerCode && currentTransformerCode.trim()) {
          const runToken = Symbol('transform');
          latestTransformRef.current = runToken;
          setIsTransforming(true);
          const executionContext = createExecutionContext();

          try {

            // Query helper mirrors v1 behavior: always use pipeline lookups
            const queryFunction = async (queryId, queryVariables = {}) => {
              const trimmedId = queryId ? queryId.trim() : '';
              if (!trimmedId) {
                throw new Error('Query key is required');
              }

              const endpointConfig = getEndpointConfigFromUrlKey(selectedEnvironment);
              const endpointUrl = endpointConfig?.endpointUrl || getInitialEndpoint()?.code;
              const authToken = endpointConfig?.authToken || null;

              if (!endpointUrl) {
                throw new Error('No endpoint available');
              }

              console.log('[PlaygroundV2] Transformer pipeline query:', {
                id: trimmedId,
                hasVariables: Object.keys(queryVariables || {}).length > 0,
              });

              return executePipeline(trimmedId, executionContext, {
                endpointUrl,
                authToken,
                variableOverrides: queryVariables,
              });
            };

            console.log('[PlaygroundV2] Transformer length:', currentTransformerCode.length);
            const transformedData = await executeTransformer(currentTransformerCode, rawData, queryFunction);
            setProcessedData(transformedData);
            setTransformedTableData(transformedData || null);
          } catch (error) {
            console.error('Error applying transformer:', error);
            setProcessedData(null);
            setTransformedTableData(null);
          } finally {
            if (latestTransformRef.current === runToken) {
              setIsTransforming(false);
              latestTransformRef.current = null;
            }
          }
        } else {
          setProcessedData(null);
          latestTransformRef.current = null;
          setTransformedTableData(null);
          setIsTransforming(false);
        }
      } catch (error) {
        console.error('Error processing response:', error);
        setRawResponseData(null);
        setProcessedData(null);
        latestTransformRef.current = null;
        setRawTableData(null);
        setTransformedTableData(null);
        setIsTransforming(false);
      }
    };

    processResponse();
  }, [response, query, selectedEnvironment]);

  // Get query keys from processed data or raw response
  const queryKeys = useMemo(() => {
    if (processedData) {
      return getDataKeys(processedData);
    }
    if (rawResponseData) {
      return getDataKeys(rawResponseData);
    }
    return [];
  }, [processedData, rawResponseData]);


  // Memoize data by key for stable references
  const memoizedDataByKey = useMemo(() => {
    const dataMap = {};
    queryKeys.forEach(key => {
      const data = processedData ? getDataValue(processedData, key) : getDataValue(rawResponseData, key);
      dataMap[key] = normalizeDataForTable(data);
    });
    return dataMap;
  }, [queryKeys, processedData, rawResponseData]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden">
        {!rawResponseData || queryKeys.length === 0 ? (
          <div className="flex items-center justify-center h-full bg-gray-50">
            <div className="text-center p-4">
              <i className="pi pi-info-circle text-3xl text-gray-400 mb-2"></i>
              <p className="text-sm text-gray-600 font-medium">Run query to see table data</p>
            </div>
          </div>
        ) : queryKeys.length > 1 ? (
          <TabView
            activeIndex={activeTab}
            onTabChange={(e) => setActiveTab(e.index)}
            className="h-full"
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
          >
            {queryKeys.map((queryKey) => {
              const tableData = memoizedDataByKey[queryKey];
              return (
                <TabPanel key={queryKey} header={queryKey}>
                  <div className="h-full overflow-auto p-2">
                    <DataProviderNew dataSource={null} offlineData={tableData} drawerTabs={[]}>
                      <DataTableComponent
                        useOrchestrationLayer={true}
                        enableFullscreenDialog={true}
                      />
                    </DataProviderNew>
                  </div>
                </TabPanel>
              );
            })}
          </TabView>
        ) : (
          <div className="h-full overflow-auto p-2">
            <DataProviderNew dataSource={null} offlineData={memoizedDataByKey[queryKeys[0]]} drawerTabs={[]}>
              <DataTableComponent
                useOrchestrationLayer={true}
                enableFullscreenDialog={true}
              />
            </DataProviderNew>
          </div>
        )}
      </div>
    </div>
  );
}
