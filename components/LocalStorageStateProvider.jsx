import React, { useState } from 'react';
import { useLocalStorage } from 'primereact/hooks';
import { DataProvider } from '@plasmicapp/loader-nextjs';

// interface LocalStorageStateProvider {
//   storageKey: string;
//   initialValue?: any;
//   children: ReactNode;
// }

export function LocalStorageStateProvider({ storageKey, initialValue, children }) {
  const [value, setValue] = useState( localStorage.getItem(storageKey) ?? initialValue);

  const setMyval = (val) => { localStorage.setItem(storageKey, val); setValue(val); };
  return (
    <DataProvider name="localData" data={{ value, setMyval }}>
      {children}
    </DataProvider>
  );
}

  