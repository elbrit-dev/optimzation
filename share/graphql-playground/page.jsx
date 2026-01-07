'use client';

import { explorerPlugin } from '@graphiql/plugin-explorer';
import '@graphiql/plugin-explorer/style.css';
import '@graphiql/react/style.css';
import 'graphiql/graphiql.css';
import 'graphiql/setup-workers/webpack';
import 'graphiql/style.css';
import { ConfirmDialog } from 'primereact/confirmdialog';
import { Dropdown } from 'primereact/dropdown';
import { SelectButton } from 'primereact/selectbutton';
import { TabPanel, TabView } from 'primereact/tabview';
import React, { useEffect, useMemo, useRef, useCallback, useState } from 'react';
// Import extracted modules
import './styles/graphql-playground.css';
import { getEndpointOptions } from './constants';
import { extractDataFromResponse } from './utils/data-extractor';
import { fetchGraphQLRequest } from './utils/query-pipeline';
import { useAppStore } from './stores';
import {
  ToolbarPlaceholder,
  SaveControlsWrapper,
  createHistoryPlugin,
  GraphiQLWrapper,
  DataTransformerTab,
  TabChangeDetector,
  ActiveTabTracker,
  GraphiQLStateSync
} from './components';
import ProtectedRoute from '@/components/ProtectedRoute';

function GraphQLPlayground() {
  // Zustand stores
  const {
    authToken,
    setAuthToken,
    showPassword,
    toggleShowPassword,
    selectedEndpoint,
    endpointUrl,
    setSelectedEndpoint,
    setTabData,
  } = useAppStore();

  const saveControlsRef = useRef(null);
  const currentTabIndexRef = useRef(0);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [activeMainTab, setActiveMainTab] = useState(0);

  // Get tab data for current tab (reactive to store changes)
  // Subscribe to entire tabData object to avoid selector closure issues
  const tabData = useAppStore((state) => state.tabData);
  const currentTabData = tabData[activeTabIndex] || { hasSuccessfulQuery: false, transformedData: null };
  const hasSuccessfulQuery = currentTabData.hasSuccessfulQuery;
  const transformedData = currentTabData.transformedData;

  const tabOptions = useMemo(() => [
    { name: 'Data Source', value: 0 },
    { name: 'Data Transformer', value: 1, disabled: !hasSuccessfulQuery }
  ], [hasSuccessfulQuery]);

  // Update ref when tab changes
  useEffect(() => {
    currentTabIndexRef.current = activeTabIndex;
  }, [activeTabIndex]);

  // Add tooltip to disabled Data Transformer button
  useEffect(() => {
    const addTooltip = () => {
      const disabledButton = document.querySelector('.graphiql-tab-triggers .p-selectbutton .p-button.p-disabled');
      if (disabledButton && !hasSuccessfulQuery) {
        disabledButton.setAttribute('title', 'Run query to unlock Data Transformer');
      }
    };

    // Try immediately
    addTooltip();

    // Also try after a short delay to ensure DOM is ready
    const timeout = setTimeout(addTooltip, 100);

    return () => clearTimeout(timeout);
  }, [hasSuccessfulQuery, activeMainTab]);

  // Callback to update active tab index from ActiveTabTracker
  const handleTabIndexChange = useCallback((tabIndex) => {
    setActiveTabIndex(tabIndex);
  }, []);


  // Endpoint options - UAT and ERP (using extracted constant)
  const endpointOptions = useMemo(() => getEndpointOptions(), []);

  // Handle endpoint selection change
  const handleEndpointChange = useCallback((e) => {
    setSelectedEndpoint(e.value);
  }, [setSelectedEndpoint]);

  // Handle token change
  const handleTokenChange = useCallback((e) => {
    setAuthToken(e.target.value);
  }, [setAuthToken]);


  const explorer = useMemo(() => explorerPlugin(), []);
  const historyPlugin = useMemo(() => {
    return createHistoryPlugin();
  }, []);

  // Dynamic fetcher that uses the current endpoint URL
  const fetcher = useMemo(() => {
    return async (graphQLParams) => {
      if (!endpointUrl) {
        throw new Error('GraphQL endpoint URL is not set');
      }

      // Get current tab index at execution time from ref
      const currentTabIndex = currentTabIndexRef.current;

      // Check if this is an IntrospectionQuery
      const isIntrospectionQuery =
        graphQLParams.query?.includes('__schema') ||
        graphQLParams.query?.includes('IntrospectionQuery') ||
        graphQLParams.operationName === 'IntrospectionQuery';

      // Use shared GraphQL fetch function
      let data;
      try {
        data = await fetchGraphQLRequest(
          graphQLParams.query || '',
          graphQLParams.variables || {},
          { endpointUrl, authToken }
        );
      } catch (fetchError) {
        // Handle network errors and HTTP errors gracefully
        // Return error response that GraphiQL can display
        const errorResponse = {
          errors: [
            {
              message: fetchError.message || 'Failed to execute GraphQL query',
              ...(fetchError.status && { extensions: { code: fetchError.status } })
            }
          ]
        };
        console.error('GraphQL request failed:', fetchError);
        return errorResponse;
      }

      let response;
      try {
        response = await data.json();
      } catch (parseError) {
        // If JSON parsing fails, try to get text response
        try {
          const textResponse = await data.text();
          return {
            errors: [
              {
                message: `Invalid JSON response: ${textResponse.substring(0, 200)}`
              }
            ]
          };
        } catch (textError) {
          return {
            errors: [
              {
                message: `Failed to parse response: ${parseError.message}`
              }
            ]
          };
        }
      }

      // Process and store data for non-introspection queries and successful responses
      if (!isIntrospectionQuery && data.ok) {
        // Check if response has GraphQL errors
        const hasErrors = response && typeof response === 'object' && response.errors && response.errors.length > 0;

        if (!hasErrors) {
          // Process and transform the response data
          const queryString = graphQLParams.query || '';
          const transformedData = extractDataFromResponse(response, queryString);

          // Store both success state and transformed data for this tab
          setTabData(currentTabIndex, {
            hasSuccessfulQuery: true,
            transformedData: transformedData,
          });

        } else {
          // Query failed - reset tab data
          setTabData(currentTabIndex, {
            hasSuccessfulQuery: false,
            transformedData: null,
          });
        }
      }

      return response;
    };
  }, [endpointUrl, authToken, setTabData]);


  return (
    <div className="flex flex-col bg-gray-50" style={{ height: 'calc(100vh - 65px)' }}>
      <ConfirmDialog />
      {/* Controls Bar */}
      <div className="graphiql-controls-bar">
        <Dropdown
          value={selectedEndpoint}
          onChange={handleEndpointChange}
          options={endpointOptions}
          optionLabel="name"
          placeholder="Select GraphQL Endpoint"
          className="graphiql-url-dropdown"
        />
        <div className="graphiql-token-input">
          <div className="graphiql-token-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              value={authToken}
              onChange={handleTokenChange}
              placeholder="Auth Token"
              className="graphiql-token-input-field"
            />
            <button
              type="button"
              className="graphiql-token-toggle-btn"
              onClick={toggleShowPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={0}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {showPassword ? (
                  // Hide icon (eye with slash)
                  <g>
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M0.0535499 7.25213C0.208567 7.59162 2.40413 12.4 7 12.4C11.5959 12.4 13.7914 7.59162 13.9465 7.25213C13.9487 7.2471 13.9506 7.24304 13.952 7.24001C13.9837 7.16396 14 7.08239 14 7.00001C14 6.91762 13.9837 6.83605 13.952 6.76001C13.9506 6.75697 13.9487 6.75292 13.9465 6.74788C13.7914 6.4084 11.5959 1.60001 7 1.60001C2.40413 1.60001 0.208567 6.40839 0.0535499 6.74788C0.0512519 6.75292 0.0494023 6.75697 0.048 6.76001C0.0163137 6.83605 0 6.91762 0 7.00001C0 7.08239 0.0163137 7.16396 0.048 7.24001C0.0494023 7.24304 0.0512519 7.2471 0.0535499 7.25213ZM7 11.2C3.664 11.2 1.736 7.92001 1.264 7.00001C1.736 6.08001 3.664 2.80001 7 2.80001C10.336 2.80001 12.264 6.08001 12.736 7.00001C12.264 7.92001 10.336 11.2 7 11.2ZM5.55551 9.16182C5.98308 9.44751 6.48576 9.6 7 9.6C7.68891 9.59789 8.349 9.32328 8.83614 8.83614C9.32328 8.349 9.59789 7.68891 9.59999 7C9.59999 6.48576 9.44751 5.98308 9.16182 5.55551C8.87612 5.12794 8.47006 4.7947 7.99497 4.59791C7.51988 4.40112 6.99711 4.34963 6.49276 4.44995C5.98841 4.55027 5.52513 4.7979 5.16152 5.16152C4.7979 5.52513 4.55027 5.98841 4.44995 6.49276C4.34963 6.99711 4.40112 7.51988 4.59791 7.99497C4.7947 8.47006 5.12794 8.87612 5.55551 9.16182ZM6.2222 5.83594C6.45243 5.6821 6.7231 5.6 7 5.6C7.37065 5.6021 7.72553 5.75027 7.98762 6.01237C8.24972 6.27446 8.39789 6.62934 8.4 7C8.4 7.27689 8.31789 7.54756 8.16405 7.77779C8.01022 8.00802 7.79157 8.18746 7.53575 8.29343C7.27994 8.39939 6.99844 8.42711 6.72687 8.37309C6.4553 8.31908 6.20584 8.18574 6.01005 7.98994C5.81425 7.79415 5.68091 7.54469 5.6269 7.27312C5.57288 7.00155 5.6006 6.72006 5.70656 6.46424C5.81253 6.20842 5.99197 5.98977 6.2222 5.83594Z"
                      fill="currentColor"
                    />
                    <line
                      x1="1"
                      y1="1"
                      x2="13"
                      y2="13"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </g>
                ) : (
                  // Show icon (eye)
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M0.0535499 7.25213C0.208567 7.59162 2.40413 12.4 7 12.4C11.5959 12.4 13.7914 7.59162 13.9465 7.25213C13.9487 7.2471 13.9506 7.24304 13.952 7.24001C13.9837 7.16396 14 7.08239 14 7.00001C14 6.91762 13.9837 6.83605 13.952 6.76001C13.9506 6.75697 13.9487 6.75292 13.9465 6.74788C13.7914 6.4084 11.5959 1.60001 7 1.60001C2.40413 1.60001 0.208567 6.40839 0.0535499 6.74788C0.0512519 6.75292 0.0494023 6.75697 0.048 6.76001C0.0163137 6.83605 0 6.91762 0 7.00001C0 7.08239 0.0163137 7.16396 0.048 7.24001C0.0494023 7.24304 0.0512519 7.2471 0.0535499 7.25213ZM7 11.2C3.664 11.2 1.736 7.92001 1.264 7.00001C1.736 6.08001 3.664 2.80001 7 2.80001C10.336 2.80001 12.264 6.08001 12.736 7.00001C12.264 7.92001 10.336 11.2 7 11.2ZM5.55551 9.16182C5.98308 9.44751 6.48576 9.6 7 9.6C7.68891 9.59789 8.349 9.32328 8.83614 8.83614C9.32328 8.349 9.59789 7.68891 9.59999 7C9.59999 6.48576 9.44751 5.98308 9.16182 5.55551C8.87612 5.12794 8.47006 4.7947 7.99497 4.59791C7.51988 4.40112 6.99711 4.34963 6.49276 4.44995C5.98841 4.55027 5.52513 4.7979 5.16152 5.16152C4.7979 5.52513 4.55027 5.98841 4.44995 6.49276C4.34963 6.99711 4.40112 7.51988 4.59791 7.99497C4.7947 8.47006 5.12794 8.87612 5.55551 9.16182ZM6.2222 5.83594C6.45243 5.6821 6.7231 5.6 7 5.6C7.37065 5.6021 7.72553 5.75027 7.98762 6.01237C8.24972 6.27446 8.39789 6.62934 8.4 7C8.4 7.27689 8.31789 7.54756 8.16405 7.77779C8.01022 8.00802 7.79157 8.18746 7.53575 8.29343C7.27994 8.39939 6.99844 8.42711 6.72687 8.37309C6.4553 8.31908 6.20584 8.18574 6.01005 7.98994C5.81425 7.79415 5.68091 7.54469 5.6269 7.27312C5.57288 7.00155 5.6006 6.72006 5.70656 6.46424C5.81253 6.20842 5.99197 5.98977 6.2222 5.83594Z"
                    fill="currentColor"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
        <div className="graphiql-tab-triggers">
          <SelectButton
            value={activeMainTab}
            onChange={(e) => {
              setActiveMainTab(e.value);
            }}
            options={tabOptions}
            optionLabel="name"
            optionValue="value"
            optionDisabled="disabled"
          />
        </div>
        <div id="save-controls-container" style={{ display: 'contents' }}></div>
      </div>

      <div className="flex-1 overflow-hidden">
        {/* SaveControlsWrapper outside GraphiQLWrapper so it's visible in both tabs */}
        <SaveControlsWrapper saveControlsRef={saveControlsRef} />
        
        <TabView
          activeIndex={activeMainTab}
          onTabChange={(e) => setActiveMainTab(e.index)}
          className="graphiql-main-tabview"
          style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
          <TabPanel>
            <div className="h-full overflow-hidden">
              <GraphiQLWrapper
                key={endpointUrl}
                fetcher={fetcher}
                plugins={[explorer, historyPlugin]}
                defaultEditorToolsVisibility={"variables"}
                isHeadersEditorEnabled={false}
                initialVariables={null}
                initialHeaders={null}
                defaultTheme="light"
              >
                <ToolbarPlaceholder>
                  {({ prettify, copy, merge }) => (
                    <>
                      {prettify}
                      {merge}
                      {copy}
                    </>
                  )}
                </ToolbarPlaceholder>
                <ActiveTabTracker onTabIndexChange={handleTabIndexChange} />
                <TabChangeDetector />
                <GraphiQLStateSync />
              </GraphiQLWrapper>
            </div>
          </TabPanel>
          <TabPanel>
            {hasSuccessfulQuery ? (
              <DataTransformerTab responseData={transformedData} activeTabIndex={activeTabIndex} />
            ) : (
              <div className="flex items-center justify-center h-full bg-gray-50">
                <div className="text-center p-8">
                  <i className="pi pi-info-circle text-4xl text-gray-400 mb-4"></i>
                  <p className="text-gray-600 font-medium">Run query to unlock Data Transformer</p>
                </div>
              </div>
            )}
          </TabPanel>
        </TabView>
      </div>
    </div>
  );
}

export default function GraphQLPlaygroundPage() {
  return (
    <ProtectedRoute>
      <GraphQLPlayground />
    </ProtectedRoute>
  );
}

