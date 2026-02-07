'use client';

import { getEndpointFromUrlKey } from '@/app/graphql-playground/constants';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { confirmDialog } from 'primereact/confirmdialog';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { InputText } from 'primereact/inputtext';
import { Skeleton } from 'primereact/skeleton';
import { Tag } from 'primereact/tag';
import { Tooltip } from 'primereact/tooltip';
import { useEffect, useMemo, useState } from 'react';
import { usePlaygroundStore } from '../stores/usePlaygroundStore';
import { useSavedQueriesStore } from '../stores/useSavedQueriesStore';

// Utility function to format timestamps as relative time
const formatRelativeTime = (timestamp) => {
  if (!timestamp) return 'Never';

  // Handle Firestore Timestamp
  let date;
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    return 'Unknown';
  }

  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  // If older than a week, show absolute date
  if (diffDays >= 7) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
};

// Utility function to format variables JSON string
const formatVariablesString = (variablesString) => {
  if (!variablesString || typeof variablesString !== 'string') {
    return variablesString || '';
  }

  const trimmed = variablesString.trim();
  if (!trimmed) {
    return '';
  }

  try {
    // Attempt to parse as JSON
    const parsed = JSON.parse(trimmed);
    // Format with 2-space indentation
    return JSON.stringify(parsed, null, 2);
  } catch (e) {
    // If parsing fails, return original string
    return variablesString;
  }
};

// TooltipContent component for rendering tooltip content
function TooltipContent({ query, formatRelativeTime }) {
  const transformerUpdatedAt =
    query.transformerCodeUpdatedAt ||
    query.readTransformerCodeUpdatedAt ||
    query.writeTransformerCodeUpdatedAt;

  return (
    <div style={{ padding: '0.5rem', lineHeight: '1.6', maxWidth: '250px' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
        Query Details
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', fontSize: '0.75rem' }}>
        <div>
          <span style={{ color: '#9ca3af' }}>Body updated:</span>
          <span style={{ color: '#ffffff', marginLeft: '0.25rem' }}>{formatRelativeTime(query.bodyUpdatedAt)}</span>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}>Variables:</span>
          <span style={{ color: '#ffffff', marginLeft: '0.25rem' }}>{formatRelativeTime(query.variablesUpdatedAt)}</span>
        </div>
        {transformerUpdatedAt && (
          <div>
            <span style={{ color: '#9ca3af' }}>Transformer:</span>
            <span style={{ color: '#ffffff', marginLeft: '0.25rem' }}>{formatRelativeTime(transformerUpdatedAt)}</span>
          </div>
        )}
        {query.lastUpdatedBy && (
          <div>
            <span style={{ color: '#9ca3af' }}>Last updated by:</span>
            <span style={{ color: '#ffffff', marginLeft: '0.25rem', wordBreak: 'break-word', display: 'block', marginTop: '0.25rem' }}>
              {query.lastUpdatedBy}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// QueryItem component with tooltip
function QueryItem({ query, isSelected, onQueryClick, onDelete, formatRelativeTime }) {
  // Check if query has any timestamp data to show
  const hasTimestampData = query.bodyUpdatedAt || query.variablesUpdatedAt || query.transformerCodeUpdatedAt || query.readTransformerCodeUpdatedAt || query.writeTransformerCodeUpdatedAt || query.lastUpdatedBy;

  // Create unique ID for this tooltip target
  const tooltipTargetId = `query-info-${query.id}`;

  const handleInfoIconClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // Get the most recent update time
  const getMostRecentUpdate = () => {
    const updates = [
      query.bodyUpdatedAt,
      query.variablesUpdatedAt,
      query.transformerCodeUpdatedAt,
      query.readTransformerCodeUpdatedAt,
      query.writeTransformerCodeUpdatedAt,
    ].filter(Boolean);

    if (updates.length === 0) return null;

    // Convert to dates and find the most recent
    const dates = updates.map(ts => {
      if (ts.toDate && typeof ts.toDate === 'function') {
        return ts.toDate();
      } else if (ts.seconds) {
        return new Date(ts.seconds * 1000);
      } else if (ts instanceof Date) {
        return ts;
      }
      return null;
    }).filter(Boolean);

    if (dates.length === 0) return null;
    return dates.reduce((latest, current) => current > latest ? current : latest);
  };

  const mostRecentUpdate = getMostRecentUpdate();

  return (
    <>
      {hasTimestampData && (
        <Tooltip target={`.${tooltipTargetId}`}>
          <TooltipContent query={query} formatRelativeTime={formatRelativeTime} />
        </Tooltip>
      )}
      <Card
        data-query-id={query.id}
        className={`saved-query-card group mb-2 mx-2 cursor-pointer transition-all duration-200 ${isSelected
            ? 'border-blue-200 shadow-sm'
            : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
          }`}
        style={{
          backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
        }}
        onClick={(e) => onQueryClick(query, e)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'
                }`}>
                {query.name}
              </h3>
            </div>
            {mostRecentUpdate && (
              <p className="text-xs text-gray-500">
                Updated {formatRelativeTime(mostRecentUpdate)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <Tag
                value={query.clientSave ? 'Client' : 'Live'}
                severity={query.clientSave ? 'success' : 'warning'}
                style={{ fontSize: '10px', padding: '2px 6px', minWidth: '3rem', textAlign: 'center' }}
              />
            </div>
            {hasTimestampData && (
              <span
                className={`${tooltipTargetId} inline-flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-help flex-shrink-0`}
                onClick={handleInfoIconClick}
              >
                <i className="pi pi-info-circle text-xs"></i>
              </span>
            )}
            <Button
              icon="pi pi-trash"
              className="p-button-text p-button-sm p-button-danger"
              onClick={(e) => onDelete(query.id, query.name, e)}
              tooltip="Delete query"
              tooltipOptions={{ position: 'top' }}
            />
          </div>
        </div>
      </Card>
    </>
  );
}

export function SavedQueries() {
  const { queries, loading, selectedQueryId, setSelectedQueryId, loadQueries, deleteQuery } = useSavedQueriesStore();
  const currentQuery = usePlaygroundStore((state) => state.query);
  const { setQuery, setVariables, setTransformerFunction, setSelectedEnvironment } = usePlaygroundStore();
  const [searchTerm, setSearchTerm] = useState('');

  // Load queries on mount
  useEffect(() => {
    loadQueries();
  }, [loadQueries]);

  // Filter queries based on search term
  const filteredQueries = useMemo(() => {
    if (!searchTerm.trim()) {
      return queries;
    }
    const lowerSearch = searchTerm.toLowerCase();
    return queries.filter(query =>
      query.name.toLowerCase().includes(lowerSearch)
    );
  }, [queries, searchTerm]);

  // Auto-select query if it matches current editor content
  useEffect(() => {
    if (currentQuery && queries.length > 0) {
      const normalizedCurrent = currentQuery.trim().replace(/\s+/g, ' ');
      const matchingQuery = queries.find(q => {
        if (!q.body || !q.body.trim()) return false;
        const normalizedSaved = q.body.trim().replace(/\s+/g, ' ');
        return normalizedCurrent === normalizedSaved || normalizedCurrent.includes(normalizedSaved.substring(0, 50));
      });
      if (matchingQuery) {
        setSelectedQueryId(matchingQuery.id);
      } else {
        setSelectedQueryId(null);
      }
    } else {
      setSelectedQueryId(null);
    }
  }, [currentQuery, queries, setSelectedQueryId]);

  const handleQueryClick = (query) => {
    if (!query.body || !query.body.trim()) return;

    // Restore endpoint from urlKey if available
    if (query.urlKey) {
      const endpoint = getEndpointFromUrlKey(query.urlKey);
      if (endpoint) {
        setSelectedEnvironment(endpoint.name);
      }
    }

    // Format variables string before loading
    const formattedVariables = formatVariablesString(query.variables || '');

    // Load query into editors
    setQuery(query.body);
    setVariables(formattedVariables || '{}');

    const transformerCode =
      query.transformerCode ??
      query.readTransformerCode ??
      '';

    setTransformerFunction(transformerCode || '');

    // Update selected query
    setSelectedQueryId(query.id);
  };

  const handleDeleteQuery = async (queryId, queryName, event) => {
    // Stop event propagation and prevent default to prevent triggering query click
    event.stopPropagation();
    event.preventDefault();

    confirmDialog({
      message: (
        <div>
          <p style={{ marginBottom: '0.5rem' }}>
            Are you sure you want to delete this query?
          </p>
          <p style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            fontStyle: 'italic',
            wordBreak: 'break-word'
          }}>
            "{queryName}"
          </p>
          <p style={{
            marginTop: '0.75rem',
            fontSize: '0.8125rem',
            color: '#9ca3af'
          }}>
            This action cannot be undone.
          </p>
        </div>
      ),
      header: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <i className="pi pi-exclamation-triangle" style={{ color: '#ef4444', fontSize: '1.25rem' }}></i>
          <span>Delete Query</span>
        </div>
      ),
      acceptClassName: 'p-confirm-dialog-accept',
      rejectClassName: 'p-confirm-dialog-reject',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      accept: async () => {
        try {
          await deleteQuery(queryId);
        } catch (error) {
          console.error('Error deleting query:', error);
        }
      },
    });
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 border-r border-gray-200">
      <style dangerouslySetInnerHTML={{
        __html: `
        .saved-query-card .p-card-body {
          padding: 0.5rem 1rem !important;
        }
        .saved-query-card .p-card-content {
          padding: 0.5rem 1rem !important;
        }
        .saved-query-card .p-button-text {
          padding: 0.125rem 0.25rem !important;
          width: fit-content !important;
          min-width: auto !important;
        }
        .saved-query-card .p-button-text.p-button-icon-only {
          width: fit-content !important;
          min-width: auto !important;
        }
        .saved-query-card .p-button-text .p-button-icon {
          margin: 0 !important;
        }
      `}} />
      {/* Search Bar */}
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
        <IconField iconPosition="right" className="w-full">
          <InputIcon className="pi pi-search text-gray-400" />
          <InputText
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search queries..."
            className="w-full text-sm"
          />
        </IconField>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        {loading ? (
          <div className="flex flex-col items-center gap-2 py-8 px-2">
            <Skeleton shape="circle" size="2rem" />
            <Skeleton width="10rem" height="1rem" />
            <div className="mt-2 w-full px-2 space-y-1.5">
              <Skeleton width="100%" height="4rem" />
              <Skeleton width="100%" height="4rem" />
              <Skeleton width="100%" height="4rem" />
            </div>
          </div>
        ) : filteredQueries.length === 0 ? (
          <div className="py-8 px-2 text-center">
            {searchTerm ? (
              <>
                <i className="pi pi-search text-2xl text-gray-300 mb-2"></i>
                <div className="text-sm text-gray-500 mb-1">No queries found</div>
                <div className="text-xs text-gray-400">
                  Try a different search term
                </div>
              </>
            ) : (
              <>
                <i className="pi pi-inbox text-2xl text-gray-300 mb-2"></i>
                <div className="text-sm text-gray-500 mb-1">No saved queries found</div>
                <div className="text-xs text-gray-400 mt-1">
                  Save queries using the Save button in Controls tab
                </div>
              </>
            )}
          </div>
        ) : (
          filteredQueries.map((query) => {
            const isSelected = selectedQueryId === query.id;
            return (
              <QueryItem
                key={query.id}
                query={query}
                isSelected={isSelected}
                onQueryClick={handleQueryClick}
                onDelete={handleDeleteQuery}
                formatRelativeTime={formatRelativeTime}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
