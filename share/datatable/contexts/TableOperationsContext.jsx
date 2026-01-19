'use client';
import { createContext, useContext } from 'react';

export const TableOperationsContext = createContext(null);

export function useTableOperations() {
  const context = useContext(TableOperationsContext);
  if (!context) {
    throw new Error('useTableOperations must be used within DataProviderNew');
  }
  return context;
}
