'use client';

import { useEffect } from 'react';
import { useGraphiQL, useGraphiQLActions } from '@graphiql/react';
import { useAppStore } from '../stores/useAppStore';

/**
 * Component that syncs GraphiQL state to Zustand store
 * This allows SaveControls to access GraphiQL state even when not inside GraphiQL context
 */
export function GraphiQLStateSync() {
  const queryEditor = useGraphiQL((state) => state.queryEditor);
  const variableEditor = useGraphiQL((state) => state.variableEditor);
  const activeTabIndex = useGraphiQL((state) => state.activeTabIndex) ?? 0;
  const actions = useGraphiQLActions();
  const setGraphiQLState = useAppStore((state) => state.setGraphiQLState);

  // Sync editor refs and actions immediately
  useEffect(() => {
    setGraphiQLState({
      queryEditor,
      variableEditor,
      activeTabIndex,
      actions, // Store actions so they can be accessed from outside GraphiQL context
    });
  }, [queryEditor, variableEditor, activeTabIndex, actions, setGraphiQLState]);

  // Sync query string when it changes
  useEffect(() => {
    if (!queryEditor) return;

    const updateQuery = () => {
      try {
        const queryString = queryEditor.getValue() || '';
        setGraphiQLState({ queryString });
      } catch (error) {
        console.error('Error syncing query:', error);
      }
    };

    // Initial sync
    updateQuery();

    // Try to listen for changes (Monaco editor API)
    let disposable = null;
    if (typeof queryEditor.onDidChangeModelContent === 'function') {
      disposable = queryEditor.onDidChangeModelContent(updateQuery);
    } else {
      // Fallback: poll for changes if onDidChangeModelContent is not available
      const interval = setInterval(updateQuery, 500);
      return () => clearInterval(interval);
    }
    
    return () => {
      if (disposable && typeof disposable.dispose === 'function') {
        disposable.dispose();
      }
    };
  }, [queryEditor, setGraphiQLState]);

  // Sync variables string when it changes
  useEffect(() => {
    if (!variableEditor) return;

    const updateVariables = () => {
      try {
        const variablesString = variableEditor.getValue() || '';
        setGraphiQLState({ variablesString });
      } catch (error) {
        console.error('Error syncing variables:', error);
      }
    };

    // Initial sync
    updateVariables();

    // Try to listen for changes (Monaco editor API)
    let disposable = null;
    if (typeof variableEditor.onDidChangeModelContent === 'function') {
      disposable = variableEditor.onDidChangeModelContent(updateVariables);
    } else {
      // Fallback: poll for changes if onDidChangeModelContent is not available
      const interval = setInterval(updateVariables, 500);
      return () => clearInterval(interval);
    }
    
    return () => {
      if (disposable && typeof disposable.dispose === 'function') {
        disposable.dispose();
      }
    };
  }, [variableEditor, setGraphiQLState]);

  // Sync activeTabIndex when it changes
  useEffect(() => {
    setGraphiQLState({ activeTabIndex });
  }, [activeTabIndex, setGraphiQLState]);

  return null; // This component doesn't render anything
}

