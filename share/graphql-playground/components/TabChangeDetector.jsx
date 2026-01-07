'use client';

import { useEffect, useRef } from 'react';
import { useGraphiQL } from '@graphiql/react';

/**
 * Component that detects tab changes in GraphiQL
 * @param {Function} onTabChange - Callback function called when tab changes
 */
export function TabChangeDetector({ onTabChange }) {
  const activeTabIndex = useGraphiQL((state) => state.activeTabIndex);
  const queryEditor = useGraphiQL((state) => state.queryEditor);
  const variableEditor = useGraphiQL((state) => state.variableEditor);
  
  // Track previous active tab index
  const previousTabIndexRef = useRef(null);
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    if (activeTabIndex === undefined || activeTabIndex === null) return;

    const previousIndex = previousTabIndexRef.current;

    if (isInitialMountRef.current) {
      previousTabIndexRef.current = activeTabIndex;
      isInitialMountRef.current = false;
      return;
    }

    if (previousIndex !== null && previousIndex !== activeTabIndex) {
      // Tab changed!
      const currentQuery = queryEditor?.getValue() || '';
      const currentVariables = variableEditor?.getValue() || '';
      
      if (onTabChange) {
        onTabChange({
          tabIndex: activeTabIndex,
          previousTabIndex: previousIndex,
          query: currentQuery,
          variables: currentVariables,
          timestamp: new Date().toISOString(),
        });
      }
      
      previousTabIndexRef.current = activeTabIndex;
    }
  }, [activeTabIndex, queryEditor, variableEditor, onTabChange]);

  return null; // This component doesn't render anything
}

