'use client';

import { useEffect } from 'react';
import { useGraphiQL, useGraphiQLActions } from '@graphiql/react';
import { confirmDialog } from 'primereact/confirmdialog';
import { Tooltip } from 'primereact/tooltip';
import { useQueryHistoryStore } from '../stores/useQueryHistoryStore';
import { useAppStore } from '../stores/useAppStore';
import { getEndpointFromUrlKey } from '../constants';

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
        <div>
          <span style={{ color: '#9ca3af' }}>Transformer:</span>
          <span style={{ color: '#ffffff', marginLeft: '0.25rem' }}>{formatRelativeTime(query.transformerCodeUpdatedAt)}</span>
        </div>
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

// QueryHistoryItem component with tooltip
function QueryHistoryItem({ query, isSelected, onQueryClick, onDelete, formatRelativeTime }) {
  // Check if query has any timestamp data to show
  const hasTimestampData = query.bodyUpdatedAt || query.variablesUpdatedAt || query.transformerCodeUpdatedAt || query.lastUpdatedBy;

  // Create unique ID for this tooltip target
  const tooltipTargetId = `query-info-${query.id}`;

  const handleInfoIconClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <>
      {hasTimestampData && (
        <Tooltip target={`.${tooltipTargetId}`}>
          <TooltipContent query={query} formatRelativeTime={formatRelativeTime} />
        </Tooltip>
      )}
      <div
        className={`graphiql-history-item px-3 py-2.5 mx-1 rounded transition-all duration-150 text-xs border border-transparent bg-white relative flex flex-col justify-center gap-1 min-h-[48px] cursor-pointer ${isSelected ? 'selected' : ''}`}
        onClick={(e) => onQueryClick(query, e)}
      >
        <div className="flex items-center justify-between gap-2 min-h-[20px] leading-snug">
          <div className="graphiql-history-item-name font-medium text-gray-800 leading-snug break-words flex-1 text-xs overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-1.5">
            <span>{query.name}</span>
            {hasTimestampData && (
              <span
                className={`${tooltipTargetId} inline-flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors`}
                onClick={handleInfoIconClick}
                style={{ fontSize: '0.75rem', cursor: 'help', flexShrink: 0 }}
              >
                <i className="pi pi-info-circle"></i>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap leading-snug">
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-medium ${query.clientSave ? 'text-green-700' : 'text-yellow-700'}`}>
                {query.clientSave ? 'Client' : 'Live'}
              </span>
              <div
                className={`w-2 h-2 rounded-full ${query.clientSave ? 'bg-green-500' : 'bg-yellow-500'}`}
                title={query.clientSave ? 'Client' : 'Live'}
              ></div>
            </div>
            <button
              className="graphiql-history-delete-btn"
              onClick={(e) => onDelete(query.id, query.name, e)}
              title="Delete query"
              aria-label="Delete query"
            >
              <i className="pi pi-trash" style={{ fontSize: '0.75rem' }}></i>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function HistoryPluginContent() {
  const { queries, loading, selectedQueryId, setSelectedQueryId, loadQueries, deleteQuery } = useQueryHistoryStore();
  const { addTab, updateActiveTabValues } = useGraphiQLActions();
  const { setSelectedEndpoint } = useAppStore();
  const queryEditor = useGraphiQL((state) => state.queryEditor);
  const variableEditor = useGraphiQL((state) => state.variableEditor);
  const currentQuery = useGraphiQL((state) => state.queryEditor?.getValue() || '');

  useEffect(() => {
    loadQueries();
  }, [loadQueries]);

  // Update selected query when current query changes
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

  const handleQueryClick = (query, event) => {
    if (!query.body || !query.body.trim()) return;

    // Restore endpoint from urlKey if available
    if (query.urlKey) {
      const endpoint = getEndpointFromUrlKey(query.urlKey);
      if (endpoint) {
        setSelectedEndpoint(endpoint);
      }
    }

    // Format variables string before loading
    const formattedVariables = formatVariablesString(query.variables || '');

    // Always open in new tab
    addTab();
    // The new tab will be created and become active
    // Use updateActiveTabValues to set the query and variables in the new tab
    setTimeout(() => {
      updateActiveTabValues({ 
        query: query.body,
        variables: formattedVariables
      });
      // Also update the editors if they exist
      if (queryEditor) {
        queryEditor.setValue(query.body);
      }
      if (variableEditor && formattedVariables) {
        variableEditor.setValue(formattedVariables);
      }
    }, 10);
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
    <div className="graphiql-history-plugin h-full flex flex-col bg-white">
      <div className="graphiql-history-plugin-header flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 font-semibold text-[13px] text-gray-800 bg-white">
        <span>Saved Queries</span>
        {queries.length > 0 && (
          <span className="graphiql-history-plugin-header-count font-normal text-[11px] text-gray-500 ml-2">({queries.length})</span>
        )}
      </div>
      <div className="graphiql-history-plugin-content flex-1 overflow-y-auto overflow-x-hidden p-1">
        {loading ? (
          <div className="flex flex-col items-center gap-2.5 py-6 px-4 text-gray-500 text-xs">
            <div className="graphiql-history-loading-spinner"></div>
            <div>Loading queries...</div>
          </div>
        ) : queries.length === 0 ? (
          <div className="py-6 px-4 text-center text-gray-500 text-xs leading-relaxed">
            <div>No saved queries found</div>
            <div className="text-[10px] mt-1.5 opacity-70">
              Save queries using the Save button
            </div>
          </div>
        ) : (
          queries.map((query) => {
            const isSelected = selectedQueryId === query.id;
            return (
              <QueryHistoryItem
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

