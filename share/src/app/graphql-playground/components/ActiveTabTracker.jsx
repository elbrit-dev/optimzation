'use client';

import { useEffect } from 'react';
import { useGraphiQL } from '@graphiql/react';

/**
 * Component that tracks the active tab index and updates a ref
 * Must be used inside GraphiQLProvider
 */
export function ActiveTabTracker({ onTabIndexChange }) {
  const activeTabIndex = useGraphiQL((state) => state.activeTabIndex) ?? 0;

  useEffect(() => {
    if (onTabIndexChange) {
      onTabIndexChange(activeTabIndex);
    }
  }, [activeTabIndex, onTabIndexChange]);

  return null; // This component doesn't render anything
}

