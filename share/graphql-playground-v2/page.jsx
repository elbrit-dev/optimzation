'use client';

import { getEndpointConfigFromUrlKey, getInitialEndpoint } from '@/app/graphql-playground/constants';
import { fetchGraphQLRequest } from '@/app/graphql-playground/utils/query-pipeline';
import ProtectedRoute from '@/components/ProtectedRoute';
import { parse as parseJsonc, stripComments } from 'jsonc-parser';
import { Button } from 'primereact/button';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { TabMenu } from 'primereact/tabmenu';
import { useCallback, useMemo, useState } from 'react';
import { GlobalFunctions } from './components/GlobalFunctions';
import { GraphQLExplorer } from './components/GraphQLExplorer';
import { QueryTabContent } from './components/QueryTabContent';
import { ResponseViewer } from './components/ResponseViewer';
import { SaveControls } from './components/SaveControls';
import { SavedQueries } from './components/SavedQueries';
import { TableViewer } from './components/TableViewer';
import { TransformerConsoleViewer } from './components/TransformerConsoleViewer';
import { TransformerFunction } from './components/TransformerFunction';
import { usePlaygroundStore } from './stores/usePlaygroundStore';

function GraphQLPlaygroundV2() {
  const query = usePlaygroundStore((state) => state.query);
  const variables = usePlaygroundStore((state) => state.variables);
  const selectedEnvironment = usePlaygroundStore((state) => state.selectedEnvironment);
  const setResponse = usePlaygroundStore((state) => state.setResponse);
  const clearTransformerLogs = usePlaygroundStore((state) => state.clearTransformerLogs);
  const resetWorkspace = usePlaygroundStore((state) => state.resetWorkspace);
  const isDirty = usePlaygroundStore((state) => state.isDirty);
  const workspaceRevision = usePlaygroundStore((state) => state.workspaceRevision);
  const isTransforming = usePlaygroundStore((state) => state.isTransforming);
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [activeMiddleTab, setActiveMiddleTab] = useState(0);
  const [activeLeftTab, setActiveLeftTab] = useState(0);

  // TabMenu items for JSON/Table tabs
  const tabMenuItems = useMemo(() => [
    { label: 'JSON' },
    { label: 'Table' }
  ], []);

  const middleTabMenuItems = useMemo(() => [
    { label: 'GraphQL' },
    { label: 'Transformer' },
    { label: 'Controls' }
  ], []);

  const leftTabMenuItems = useMemo(() => [
    { label: 'Explorer' },
    { label: 'Saved' },
    { label: 'Globals' }
  ], []);

  const handleNewSession = useCallback(() => {
    const performReset = () => {
      resetWorkspace();
      setActiveTab(0);
      setActiveMiddleTab(0);
    };

    if (!isDirty) {
      performReset();
      return;
    }

    confirmDialog({
      header: 'Start New Session',
      message: 'You have unsaved changes. Do you want to start a new session and reset the workspace?',
      acceptLabel: 'Reset',
      rejectLabel: 'Cancel',
      acceptClassName: 'p-button-danger',
      accept: performReset,
    });
  }, [isDirty, resetWorkspace, setActiveTab, setActiveMiddleTab]);

  // Shared execute handler
  const handleExecute = useCallback(async () => {
    if (!query || !query.trim()) {
      return;
    }

    clearTransformerLogs();
    setIsExecuting(true);
    try {
      // Get endpoint configuration
      const endpointConfig = getEndpointConfigFromUrlKey(selectedEnvironment);
      const endpointUrl = endpointConfig?.endpointUrl || getInitialEndpoint()?.code;
      const authToken = endpointConfig?.authToken || null;

      if (!endpointUrl) {
        throw new Error('GraphQL endpoint URL is not set');
      }

      // Parse variables
      let parsedVariables = {};
      if (variables && variables.trim()) {
        try {
          parsedVariables = parseJsonc(variables);
        } catch (e) {
          try {
            const stripped = stripComments(variables);
            parsedVariables = JSON.parse(stripped);
          } catch {
            // Use empty object if parsing fails
          }
        }
      }

      // Execute query
      const response = await fetchGraphQLRequest(query, parsedVariables, {
        endpointUrl,
        authToken
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();
      setResponse(JSON.stringify(responseData, null, 2));
    } catch (error) {
      console.error('Error executing query:', error);
      setResponse(JSON.stringify({ errors: [{ message: error.message || 'Failed to execute query' }] }, null, 2));
    } finally {
      setIsExecuting(false);
    }
  }, [query, variables, selectedEnvironment, setResponse, clearTransformerLogs]);

  return (
    <div className="flex flex-col bg-gray-50 graphql-playground-v2" style={{ height: 'calc(100vh - 65px)' }}>
      <ConfirmDialog />
      <Splitter
        style={{ height: '100%' }}
      >
        {/* Left Panel: Tab View with GraphQL Explorer, Saved Queries, and Global Functions */}
        <SplitterPanel size={20} className="flex flex-col min-w-0">
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center border-b border-gray-200 bg-gray-50 px-3" style={{ flexShrink: 0 }}>
              <TabMenu
                model={leftTabMenuItems}
                activeIndex={activeLeftTab}
                onTabChange={(e) => setActiveLeftTab(e.index)}
              />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <div
                className="h-full overflow-hidden"
                style={{ display: activeLeftTab === 0 ? 'block' : 'none', height: '100%' }}
              >
                <GraphQLExplorer />
              </div>
              <div
                className="h-full overflow-hidden"
                style={{ display: activeLeftTab === 1 ? 'block' : 'none', height: '100%' }}
              >
                <SavedQueries />
              </div>
              <div
                className="h-full overflow-hidden"
                style={{ display: activeLeftTab === 2 ? 'block' : 'none', height: '100%' }}
              >
                <GlobalFunctions />
              </div>
            </div>
          </div>
        </SplitterPanel>

        {/* Middle Panel: Tab View with Query, Transformer Function, and Save Controls */}
        <SplitterPanel size={30} className="flex flex-col min-w-0">
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3">
              <TabMenu
                model={middleTabMenuItems}
                activeIndex={activeMiddleTab}
                onTabChange={(e) => setActiveMiddleTab(e.index)}
              />
              <Button
                label="New"
                icon="pi pi-plus"
                className="p-button-sm p-button-text"
                onClick={handleNewSession}
              />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <div
                className="flex-1 overflow-hidden"
                style={{
                  height: '100%',
                  display: activeMiddleTab === 0 ? 'flex' : 'none',
                  flexDirection: 'column',
                }}
              >
                <QueryTabContent key={`query-${workspaceRevision}`} />
              </div>
              <div
                className="h-full overflow-hidden"
                style={{ display: activeMiddleTab === 1 ? 'block' : 'none', height: '100%' }}
              >
                <TransformerFunction key={`transformer-${workspaceRevision}`} />
              </div>
              <div
                className="h-full overflow-hidden"
                style={{ display: activeMiddleTab === 2 ? 'block' : 'none', height: '100%' }}
              >
                <SaveControls key={`controls-${workspaceRevision}`} />
              </div>
            </div>
          </div>
        </SplitterPanel>

        {/* Right Panel: Tab View with JSON Viewer, Table Viewer, and Transformer Console */}
        <SplitterPanel size={50} className="flex flex-col min-w-0">
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header with Execute button and tabs - above the splitter like middle panel TabMenu */}
            <div className="flex items-center border-b border-gray-200 bg-gray-50 px-3" style={{ flexShrink: 0 }}>
              <div className="px-0 py-1.5">
                <Button
                  icon={isExecuting || isTransforming ? "pi pi-spin pi-spinner" : "pi pi-play"}
                  label={isExecuting ? "Executing..." : isTransforming ? "Applying..." : "Execute"}
                  onClick={handleExecute}
                  disabled={!query || !query.trim() || isExecuting || isTransforming}
                  className="p-button-sm"
                />
              </div>
              <div className="flex-1"></div>
              <div className="flex items-center">
                <TabMenu
                  model={tabMenuItems}
                  activeIndex={activeTab}
                  onTabChange={(e) => setActiveTab(e.index)}
                />
              </div>
            </div>
            {/* Splitter for JSON/Table | Transformer Console - same pattern as QueryTabContent */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <Splitter style={{ height: 'calc(100dvh - 164px)' }} layout="vertical" className="flex-1">
                <SplitterPanel size={70} className="flex flex-col h-full min-h-0">
                  <div className="h-full flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-hidden min-h-0">
                      <div
                        className="h-full overflow-hidden"
                        style={{ display: activeTab === 0 ? 'block' : 'none', height: '100%' }}
                      >
                        <ResponseViewer key={`response-${workspaceRevision}`} />
                      </div>
                      <div
                        className="h-full overflow-hidden"
                        style={{ display: activeTab === 1 ? 'block' : 'none', height: '100%' }}
                      >
                        <TableViewer key={`table-${workspaceRevision}`} />
                      </div>
                    </div>
                  </div>
                </SplitterPanel>
                <SplitterPanel size={1} className="flex flex-col h-full min-h-0">
                  <TransformerConsoleViewer />
                </SplitterPanel>
              </Splitter>
            </div>
          </div>
        </SplitterPanel>
      </Splitter>
    </div>
  );
}

export default function GraphQLPlaygroundV2Page() {
  return (
    <ProtectedRoute>
      <GraphQLPlaygroundV2 />
    </ProtectedRoute>
  );
}
