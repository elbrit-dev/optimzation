'use client';

import RangePicker from '@/components/RangePicker';
import FilterSortSidebar from '@/components/SmartDataTable/FilterSortSidebar';
import { resolveControlDateRange } from '@/components/SmartDataTable/elbritFilterApi.js';
import {
  useSmartDataContext,
  useSmartDataSelector,
  useSmartDataStoreApi,
} from '@/components/SmartDataTable/SmartDataContext';
import { Switch } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

/**
 * Emit a control's output into viewParams._controls[key] for every view.
 * reportSource.jsx reads _controls and applies api.variablesMap to build GQL variables.
 *
 * `store` is the provider-scoped store, so a control only ever writes to views owned by
 * its own SmartDataProvider — two report tabs sharing control keys (`dateRange`, `lakhs`)
 * and view ids (`main`) no longer overwrite each other.
 */
function emitControlOutput(store, viewIds, key, output) {
  const state = store.getState();
  viewIds.forEach(id => state.setControlOutput(id, key, output));
}

function formatDateForApi(date) {
  if (!date) return null;
  return dayjs(date).format('YYYY-MM-DD');
}

// Priority for a dateRange control's initial value:
//   P1. `def.value`        — explicit prop override passed in by the caller
//   P2. `apiFilters`       — the API's current from_date/to_date (e.g. current period)
//   P3. `def.defaultValue` — static default from the report config
//   P4. current month      — final fallback so the picker never opens empty
function parseDateRangeDefault(def, apiFilters) {
  if (Array.isArray(def.value)) return def.value.map((d) => new Date(d));
  if (apiFilters?.from_date && apiFilters?.to_date) {
    return [new Date(apiFilters.from_date), new Date(apiFilters.to_date)];
  }
  if (Array.isArray(def.defaultValue)) return def.defaultValue.map((d) => new Date(d));
  return [dayjs().startOf('month').toDate(), dayjs().endOf('month').toDate()];
}

function parseDefault(def, apiFilters) {
  if (def.type === 'dateRange') return parseDateRangeDefault(def, apiFilters);
  if (def.value !== undefined) return def.value;
  return def.defaultValue ?? (def.type === 'toggle' ? false : null);
}

function ToggleControl({ def, viewIds }) {
  const [value, setValue] = useState(parseDefault(def));
  const [hovered, setHovered] = useState(false);
  const store = useSmartDataStoreApi();

  function handleChange(checked) {
    setValue(checked);
    emitControlOutput(store, viewIds, def.key, { value: checked });
  }

  return (
    <div
      className="flex items-center gap-2 px-3 h-9 sm:h-8 border rounded-md cursor-default"
      style={{
        borderColor: (value || hovered) ? '#06b6d4' : '#d1d5db',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <label className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap select-none">
        {def.label ?? def.key}
      </label>
      <Switch checked={value} onChange={handleChange} size="small" />
    </div>
  );
}

function FilterSortControl({ def, viewIds }) {
  const [visible, setVisible] = useState(false);
  const { fetchFilterValues } = useSmartDataContext();
  const store = useSmartDataStoreApi();

  const allViews = useSmartDataSelector(s => s.views);
  const filterDefs = useMemo(() => {
    for (const id of viewIds) {
      const defs = allViews[id]?.filterDefs;
      if (defs?.length) return defs;
    }
    return [];
  }, [allViews, viewIds]);

  // Active control output lives under _controls[def.key]
  const controlOutput = allViews[viewIds[0]]?.viewParams?._controls?.[def.key] ?? {};
  const sortBy        = allViews[viewIds[0]]?.sortBy ?? {};

  const activeCount = useMemo(() => {
    const filterCount = Object.values(controlOutput.filters ?? {}).filter(v => v?.length).length;
    return filterCount + Object.keys(sortBy).length;
  }, [controlOutput, sortBy]);

  const dateRange = useMemo(() => {
    const controls = allViews[viewIds[0]]?.viewParams?._controls ?? {};
    const { from_date, to_date } = resolveControlDateRange(controls);
    return { start: from_date ?? null, end: to_date ?? null };
  }, [allViews, viewIds]);

  const isActive = activeCount > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="flex items-center gap-2 px-3 h-9 sm:h-8 border rounded-md bg-white transition-colors"
        style={{ borderColor: isActive ? '#6366f1' : '#d1d5db' }}
      >
        <i className="pi pi-filter" style={{ fontSize: '0.75rem', color: isActive ? '#6366f1' : '#6b7280' }} />
        <span className="text-xs font-medium whitespace-nowrap" style={{ color: isActive ? '#6366f1' : '#374151' }}>
          {def.label ?? 'Filter & Sort'}
        </span>
        {isActive && (
          <span className="flex items-center justify-center w-4 h-4 rounded-full text-white text-xs font-bold"
            style={{ backgroundColor: '#6366f1', fontSize: '0.6rem' }}>
            {activeCount}
          </span>
        )}
      </button>

      <FilterSortSidebar
        visible={visible}
        onHide={() => setVisible(false)}
        filterDefs={filterDefs}
        fetchFilterValues={fetchFilterValues}
        dateRange={dateRange}
        currentFilterValues={controlOutput.filters ?? {}}
        currentSortBy={sortBy}
        onApply={(sorts, filters) => {
          store.getState().setSortBy(viewIds[0], sorts);
          emitControlOutput(store, viewIds, def.key, { ...controlOutput, filters, sort: sorts });
        }}
        onClear={() => {
          store.getState().setSortBy(viewIds[0], {});
          emitControlOutput(store, viewIds, def.key, {});
        }}
      />
    </>
  );
}

function DateRangeControl({ def, viewIds, apiFilters }) {
  const [value, setValue] = useState(() => parseDefault(def, apiFilters));
  const store = useSmartDataStoreApi();

  function handleChange(range) {
    setValue(range);
    emitControlOutput(store, viewIds, def.key, {
      start: formatDateForApi(range?.[0]),
      end:   formatDateForApi(range?.[1]),
    });
  }

  return (
    <div className="w-full sm:w-44 sm:flex-none">
      <RangePicker
        value={value}
        onChange={handleChange}
        mode={def.mode ?? 'month'}
        placeholder={['From', 'To']}
      />
    </div>
  );
}

function RefreshControl({ def }) {
  const { refresh, lastFetchedAt } = useSmartDataContext();
  // Scoped to this provider's views, so the other report tab's fetches don't spin this button.
  const loadingPhase = useSmartDataSelector(state => {
    for (const v of Object.values(state.views)) {
      if (v.loading) return v.loadingPhase ?? 'data';
    }
    return null;
  });
  const isLoading = loadingPhase != null;
  const [hovered, setHovered] = useState(false);
  const label = loadingPhase === 'index'
    ? 'Checking…'
    : isLoading
      ? 'Refreshing'
      : lastFetchedAt
        ? dayjs(lastFetchedAt).format('D MMM YY HH:mm')
        : (def.label ?? '');
  return (
    <button
      type="button"
      onClick={refresh}
      disabled={isLoading}
      className="flex items-center gap-1.5 px-3 h-9 sm:h-8 border rounded-md bg-white text-gray-600"
      style={{
        borderColor: hovered && !isLoading ? '#06b6d4' : '#d1d5db',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <i className={isLoading ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'} style={{ fontSize: '0.75rem' }} />
      {label && <span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{label}</span>}
    </button>
  );
}

export function FilterChips({ viewIds }) {
  const store    = useSmartDataStoreApi();
  const allViews = useSmartDataSelector(s => s.views);

  const filterDefs = useMemo(() => {
    for (const id of viewIds) {
      const defs = allViews[id]?.filterDefs;
      if (defs?.length) return defs;
    }
    return [];
  }, [allViews, viewIds]);

  // Find the filterSort control's output from the first view
  const filterSortOutput = useMemo(() => {
    const controls = allViews[viewIds[0]]?.viewParams?._controls ?? {};
    for (const [, output] of Object.entries(controls)) {
      if (output?.filters) return output;
    }
    return {};
  }, [allViews, viewIds]);

  const activeFilters = useMemo(() =>
    filterDefs.filter(def => filterSortOutput.filters?.[def.key]?.length),
    [filterDefs, filterSortOutput.filters]
  );

  if (!activeFilters.length) return null;

  // Find the filterSort control key to emit the clear
  function getFilterSortKey() {
    const controls = allViews[viewIds[0]]?.viewParams?._controls ?? {};
    for (const [key, output] of Object.entries(controls)) {
      if (output?.filters !== undefined) return key;
    }
    return null;
  }

  function clearOne(key) {
    const fsKey = getFilterSortKey();
    if (!fsKey) return;
    const filters = { ...(filterSortOutput.filters ?? {}), [key]: [] };
    emitControlOutput(store, viewIds, fsKey, { ...filterSortOutput, filters });
  }

  function clearAll() {
    const fsKey = getFilterSortKey();
    if (!fsKey) return;
    emitControlOutput(store, viewIds, fsKey, { ...filterSortOutput, filters: {} });
  }

  return (
    <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-600 mr-1">Active Filters:</span>
        {activeFilters.map(def => (
          <div
            key={def.key}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
          >
            <span>{def.label}: {filterSortOutput.filters[def.key].join(', ')}</span>
            <button
              type="button"
              onClick={() => clearOne(def.key)}
              className="ml-1 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
              title="Remove filter"
            >
              <i className="pi pi-times text-[10px]" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-xs font-medium hover:bg-red-200 transition-colors"
          title="Clear all filters"
        >
          <i className="pi pi-times-circle text-xs" />
          <span>Clear All</span>
        </button>
      </div>
    </div>
  );
}

export function ReportControls({ controls, viewIds, apiFilters }) {
  const store = useSmartDataStoreApi();

  // SmartDataTable initializes views in its own useEffect, which fires after ours.
  // Wait until all views exist before pushing defaultValues into the store.
  useEffect(() => {
    const defaults = controls.filter((def) => {
      if (!def.key) return false;
      // dateRange always resolves to a value (P1-P4), other types only push when explicitly set.
      return def.type === 'dateRange' || def.value !== undefined || def.defaultValue !== undefined;
    });
    if (!defaults.length) return;

    let unsub;
    const trySet = () => {
      const s = store.getState();
      if (!viewIds.every((id) => s.views[id])) return;
      unsub?.();
      defaults.forEach(def => {
        let output;
        if (def.type === 'dateRange') {
          const parsed = parseDefault(def, apiFilters);
          output = {
            start: formatDateForApi(parsed?.[0]),
            end:   formatDateForApi(parsed?.[1]),
          };
        } else {
          output = { value: parseDefault(def) };
        }
        viewIds.forEach(id => s.setControlOutput(id, def.key, output));
      });
    };

    unsub = store.subscribe(trySet);
    trySet();
    return () => unsub?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasFilterSort = controls.some((def) => def.type === 'filterSort');

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        {controls.map((def, i) => {
          if (def.type === 'toggle')     return <ToggleControl key={i} def={def} viewIds={viewIds} />;
          if (def.type === 'dateRange')  return <DateRangeControl key={i} def={def} viewIds={viewIds} apiFilters={apiFilters} />;
          if (def.type === 'filterSort') return <FilterSortControl key={i} def={def} viewIds={viewIds} />;
          if (def.type === 'refresh')    return <RefreshControl key={i} def={def} />;
          return null;
        })}
      </div>
      {hasFilterSort && <FilterChips viewIds={viewIds} />}
    </>
  );
}
