'use client';

import { useEffect, useState } from 'react';
import DataProviderNew from './DataProviderNew';
import { resolveFirebaseConfig } from '../config/configService';

export default function DataProvider({
  config: configProp,
  presetDataSource,
  presetName,
  offlineData,
  onDataChange,
  onError,
  children,
  overrides,
  __internal = {},
}) {
  const [presetConfig, setPresetConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!presetDataSource || !presetName) {
      setPresetConfig(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let cancelled = false;
    resolveFirebaseConfig(presetDataSource, presetName)
      .then((resolved) => {
        if (!cancelled) setPresetConfig(resolved ?? {});
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setPresetConfig({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [presetDataSource, presetName]);

  if (presetDataSource && presetName) {
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-600" />
        </div>
      );
    }
    if (error && onError) {
      onError({ error });
    }
    return (
      <DataProviderNew
        config={presetConfig ?? {}}
        offlineData={offlineData}
        onDataChange={onDataChange}
        onError={onError}
        overrides={overrides}
        __internal={__internal}
      >
        {children}
      </DataProviderNew>
    );
  }

  return (
    <DataProviderNew
      config={configProp}
      offlineData={offlineData}
      onDataChange={onDataChange}
      onError={onError}
      overrides={overrides}
      __internal={__internal}
    >
      {children}
    </DataProviderNew>
  );
}
