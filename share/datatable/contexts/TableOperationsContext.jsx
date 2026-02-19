'use client';

import { createContext, useContext } from 'react';
import { useSlotId } from '../components/DataSlot';

export const TableOperationsContext = createContext(null);

/**
 * Returns slot-scoped table operations.
 * slotIdOverride: when provided (e.g. from DataTableNew slotId prop), use directly.
 * Otherwise uses useSlotId() from SlotContext.
 * Context shape: { [slotId]: slotData } or legacy flat { rawData, ... }.
 */
export function useTableOperations(slotIdOverride) {
  const slotIdFromContext = useSlotId();
  const slotId = slotIdOverride ?? slotIdFromContext ?? 'main';
  const context = useContext(TableOperationsContext);
  if (!context) {
    throw new Error('useTableOperations must be used within DataProviderNew');
  }
  if (context.rawData !== undefined) {
    return context;
  }
  return context[slotId] ?? context.main ?? {};
}
