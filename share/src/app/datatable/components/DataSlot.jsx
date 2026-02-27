'use client';

import { createContext, useContext } from 'react';

export const SlotContext = createContext('main');

export function useSlotId() {
  return useContext(SlotContext);
}
