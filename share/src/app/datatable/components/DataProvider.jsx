'use client';

import { useEffect, useMemo, useState } from 'react';
import { queryRegistry } from '@/app/graphql-playground/services/queryRegistry';
import DataProviderNew from './DataProviderNew';
import { mergeConfig, resolveFirebaseConfig } from '../config/configService';

function applyOverridesConfig(base, overrides) {
  const patch = overrides?.config;
  if (patch == null || typeof patch !== 'object') return base;
  return mergeConfig(patch, base);
}

/** Ensure query id is set when preset JS omits dataSource (common in Plasmic Firebase presets). */
function applyPresetIdentityDefaults(base, presetDataSource) {
  const out = { ...(base && typeof base === 'object' ? base : {}) };
  if (presetDataSource && !out.dataSource) {
    out.dataSource = presetDataSource;
  }
  return out;
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
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    let cancelled = false;
    resolveFirebaseConfig(presetDataSource, presetName)
      .then(async (resolved) => {
        if (cancelled) return;
        if (!resolved) {
          const msg = `Preset "${presetName}" not found or could not be parsed for query "${presetDataSource}".`;
          setError(new Error(msg));
          setPresetConfig(null);
          if (onError) onError({ error: new Error(msg) });
          return;
        }
        let config = applyPresetIdentityDefaults(resolved, presetDataSource);
        if (!config.selectedQueryKey) {
          try {
            const queryDoc = await queryRegistry.loadQuery(presetDataSource);
            const keys = queryDoc?.queryKeys;
            if (Array.isArray(keys) && keys.length > 0) {
              const preferred = keys.includes('secondary') ? 'secondary' : keys[0];
              config = { ...config, selectedQueryKey: preferred };
            }
          } catch {
            /* query doc optional for key fallback */
          }
        }
        setPresetConfig(config);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setPresetConfig(null);
          if (onError) onError({ error: err });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [presetDataSource, presetName, onError]);

  const baseConfigFromProp = useMemo(
    () => ((typeof configProp === 'object' && configProp !== null) ? configProp : {}),
    [configProp],
  );

  const effectiveConfigPreset = useMemo(() => {
    if (presetConfig == null) return null;
    return applyOverridesConfig(applyPresetIdentityDefaults(presetConfig, presetDataSource), overrides);
  }, [presetConfig, presetDataSource, overrides]);

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
    if (loading || presetConfig == null) {
      if (error) {
        return (
          <div className="flex items-center justify-center min-h-[200px] p-4 text-sm text-red-700">
            {error.message || 'Failed to load preset'}
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-600" />
        </div>
      );
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
