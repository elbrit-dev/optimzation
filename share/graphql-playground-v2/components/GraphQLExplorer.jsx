'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { usePlaygroundStore } from '../stores/usePlaygroundStore';
import { getEndpointOptions } from '@/app/graphql-playground/constants';
import { fetchGraphQLSchema } from '../utils/schema-fetcher';
import Explorer from 'graphiql-explorer';
import { useDebounce } from '@/hooks/useDebounce';

export function GraphQLExplorer() {
  const {
    selectedEnvironment,
    setSelectedEnvironment,
    schema,
    setSchema,
    schemaLoading,
    setSchemaLoading,
    query,
    setQuery,
  } = usePlaygroundStore();

  const [error, setError] = useState(null);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Debounce query updates to reduce Explorer re-renders
  const debouncedSetQuery = useDebounce((value) => {
    setDebouncedQuery(value);
  }, 300);

  // Update debounced query when store query changes
  useEffect(() => {
    debouncedSetQuery(query);
  }, [query, debouncedSetQuery]);

  // Get endpoint options for dropdown
  const endpointOptions = useMemo(() => getEndpointOptions(), []);

  // Fetch schema when environment changes
  useEffect(() => {
    if (!selectedEnvironment) return;

    const loadSchema = async () => {
      setSchemaLoading(true);
      setError(null);
      try {
        const fetchedSchema = await fetchGraphQLSchema(selectedEnvironment);
        setSchema(fetchedSchema);
      } catch (err) {
        console.error('Failed to fetch schema:', err);
        setError(err.message || 'Failed to fetch GraphQL schema');
        setSchema(null);
      } finally {
        setSchemaLoading(false);
      }
    };

    loadSchema();
  }, [selectedEnvironment, setSchema, setSchemaLoading]);

  // Handle environment change
  const handleEnvironmentChange = useCallback((e) => {
    setSelectedEnvironment(e.value);
  }, [setSelectedEnvironment]);

  // Handle query edit from explorer
  const handleQueryEdit = useCallback((newQuery) => {
    setQuery(newQuery || '');
  }, [setQuery]);

  // Prepare dropdown options
  const dropdownOptions = useMemo(() => 
    endpointOptions.map((opt) => ({
      label: opt.name,
      value: opt.name,
    })),
    [endpointOptions]
  );

  // Memoize Explorer component props
  const explorerProps = useMemo(() => ({
    schema,
    query: debouncedQuery,
    onEdit: handleQueryEdit,
    explorerIsOpen: true,
  }), [schema, debouncedQuery, handleQueryEdit]);

  return (
    <div className="h-full w-full flex flex-col bg-gray-50 border-r border-gray-200 overflow-hidden">
      {/* Environment Selector */}
      <div className="px-3 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Environment:
        </label>
        <Dropdown
          value={selectedEnvironment}
          options={dropdownOptions}
          onChange={handleEnvironmentChange}
          optionLabel="label"
          optionValue="value"
          placeholder="Select Environment"
          className="w-full"
        />
      </div>

      {/* Schema Explorer Content */}
      <div 
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        <div 
          className="flex-1 min-h-0 overflow-y-auto relative"
        >
          {schemaLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 bg-opacity-75 z-10">
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1.5">Loading schema...</div>
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto"></div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-2 m-2 bg-red-50 border border-red-200 rounded text-red-700">
              <div className="text-sm font-semibold mb-1">Error loading schema</div>
              <div className="text-xs">{error}</div>
            </div>
          )}

          {!schemaLoading && !error && !schema && (
            <div className="h-full flex items-center justify-center min-h-[400px]">
              <div className="text-center p-4">
                <h2 className="text-lg font-semibold text-gray-700 mb-1.5">GraphQL Explorer</h2>
                <p className="text-sm text-gray-500">Select an environment to load the schema</p>
              </div>
            </div>
          )}

          {!schemaLoading && !error && schema && (
            <Explorer {...explorerProps} />
          )}
        </div>
      </div>
    </div>
  );
}
