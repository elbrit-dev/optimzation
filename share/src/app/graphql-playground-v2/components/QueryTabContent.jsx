'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { QueryEditor } from './QueryEditor';
import { VariablesEditor } from './VariablesEditor';
import { usePlaygroundStore } from '../stores/usePlaygroundStore';
import { extractOperationName } from '@/app/graphql-playground/utils/graphql-parser';

export function QueryTabContent() {
  const [variablesCollapsed, setVariablesCollapsed] = useState(false);
  const [variablesSize, setVariablesSize] = useState(30);
  const query = usePlaygroundStore((state) => state.query);
  const [localQuery, setLocalQuery] = useState(query);

  // Update local query when store query changes (for external updates)
  useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  // Extract operation name from the current query (use localQuery for immediate updates)
  const operationName = useMemo(() => {
    const extracted = extractOperationName(localQuery);
    return extracted || 'Query';
  }, [localQuery]);

  // Handle immediate query changes from editor
  const handleQueryChange = useCallback((newQuery) => {
    setLocalQuery(newQuery);
  }, []);

  const handleVariablesResize = (e) => {
    const newSize = e.sizes[1];
    // Collapse if size is less than 3%
    if (newSize < 3 && !variablesCollapsed) {
      setVariablesCollapsed(true);
    } else if (newSize >= 3 && variablesCollapsed) {
      setVariablesCollapsed(false);
    }
    if (!variablesCollapsed && newSize >= 3) {
      setVariablesSize(newSize);
    }
  };

  const expandVariables = () => {
    setVariablesCollapsed(false);
    setVariablesSize(30);
  };
  return (
    <div className="h-full flex flex-col">
      <Splitter style={{ height: 'calc(100dvh - 164px)' }} layout="vertical" className="flex-1">
        <SplitterPanel size={70} className="flex flex-col h-full min-h-0">
          <div className="px-3 py-1.5 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">{operationName}</h3>
          </div>
          <div className="flex-1 overflow-hidden p-2">
            <QueryEditor onQueryChange={handleQueryChange} />
          </div>
        </SplitterPanel>
        <SplitterPanel size={30} className="flex flex-col h-full min-h-0">
          <div className="px-3 py-1.5 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Variables</h3>
          </div>
          <div className="flex-1 overflow-hidden p-2">
            <VariablesEditor />
          </div>
        </SplitterPanel>
      </Splitter>
    </div>
  )
}
