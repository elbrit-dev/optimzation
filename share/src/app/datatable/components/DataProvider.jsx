'use client';

import { useEffect, useMemo, useState } from 'react';
import DataProviderNew from './DataProviderNew';
import { mergeConfig, resolveFirebaseConfig } from '../config/configService';

function applyOverridesConfig(base, overrides) {
  const patch = overrides?.config;
  if (patch == null || typeof patch !== 'object') return base;
  return mergeConfig(patch, base);
}

export default function DataProvider({
  presetDataSource,
  presetName,
  offlineData,
  onDataChange,
  onError,
  children,
  overrides,
  __internal = {},
}) {
  const configProp = __internal?.config;
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

  const baseConfigFromProp = useMemo(
    () => ((typeof configProp === 'object' && configProp !== null) ? configProp : {}),
    [configProp],
  );

  const effectiveConfigPreset = useMemo(
    () => applyOverridesConfig(presetConfig ?? {}, overrides),
    [presetConfig, overrides],
  );

  const effectiveConfigDirect = useMemo(
    () => applyOverridesConfig(baseConfigFromProp, overrides),
    [baseConfigFromProp, overrides],
  );

  const overridesForNew = useMemo(() => {
    if (overrides == null || typeof overrides !== 'object') return overrides;
    const { config: _omit, ...rest } = overrides;
    return rest;
  }, [overrides]);

  const __internalForNew = useMemo(() => {
    if (__internal == null || typeof __internal !== 'object') return __internal ?? {};
    const { config: _omit, ...rest } = __internal;
    return rest;
  }, [__internal]);

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
        config={effectiveConfigPreset}
        offlineData={offlineData}
        onDataChange={onDataChange}
        onError={onError}
        overrides={overridesForNew}
        __internal={__internalForNew}
      >
        {children}
      </DataProviderNew>
    );
  }

  return (
    <DataProviderNew
      config={effectiveConfigDirect}
      offlineData={offlineData}
      onDataChange={onDataChange}
      onError={onError}
      overrides={overridesForNew}
      __internal={__internalForNew}
    >
      {children}
    </DataProviderNew>
  );
}
