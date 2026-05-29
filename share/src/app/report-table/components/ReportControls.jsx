'use client';

import RangePicker from '@/components/RangePicker';
import FilterSortSidebar from '@/components/SmartDataTable/FilterSortSidebar';
import { useSmartDataStore } from '@/components/SmartDataTable/useSmartDataStore';
import { useSmartDataContext } from '@/components/SmartDataTable/SmartDataContext';
import { Switch } from 'antd';
import { useEffect, useMemo, useState } from 'react';

function broadcast(viewIds, paramKey, value) {
  const store = useSmartDataStore.getState();
  viewIds.forEach((id) => store.setViewParam(id, paramKey, value));
}

function parseDefault(def) {
  if (def.type === 'dateRange' && Array.isArray(def.defaultValue)) {
    return def.defaultValue.map((d) => new Date(d));
  }
  return def.defaultValue ?? (def.type === 'toggle' ? false : null);
}

function ToggleControl({ def, viewIds }) {
  const [value, setValue] = useState(parseDefault(def));
  const [hovered, setHovered] = useState(false);

  function handleChange(checked) {
    setValue(checked);
    broadcast(viewIds, def.paramKey, checked);
  }

  return (
    <div
      className="flex items-center gap-2 px-3 h-8 border rounded-md cursor-default"
      style={{
        borderColor: (value || hovered) ? '#06b6d4' : '#d1d5db',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <label className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap select-none">
        {def.label ?? def.paramKey}
      </label>
      <Switch checked={value} onChange={handleChange} size="small" />
    </div>
  );
}

function FilterSortControl({ def, viewIds }) {
  const [visible, setVisible] = useState(false);
  const { fetchFilterValues } = useSmartDataContext();

  // Read filterDefs from the first view that has them (all views share the same report schema)
  const allViews = useSmartDataStore(s => s.views);
  const filterDefs = useMemo(() => {
    for (const id of viewIds) {
      const defs = allViews[id]?.filterDefs;
      if (defs?.length) return defs;
    }
    return [];
  }, [allViews, viewIds]);

  // Active sidebar state — read from first view (they're kept in sync)
  const sidebar = allViews[viewIds[0]]?.viewParams?._sidebar ?? {};

  const activeCount = useMemo(() => {
    const filterCount = Object.values(sidebar.filters ?? {}).filter(v => v?.length).length;
    return filterCount + (sidebar.sort ? 1 : 0);
  }, [sidebar]);

  const isActive = activeCount > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="flex items-center gap-2 px-3 h-8 border rounded-md bg-white transition-colors"
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
        currentFilterValues={sidebar.filters ?? {}}
        currentSortConfig={sidebar.sort ?? null}
        onApply={(sort, filters) =>
          broadcast(viewIds, '_sidebar', { sort, filters })
        }
        onClear={() =>
          broadcast(viewIds, '_sidebar', {})
        }
      />
    </>
  );
}

function DateRangeControl({ def, viewIds }) {
  const [value, setValue] = useState(parseDefault(def));

  function handleChange(range) {
    setValue(range);
    broadcast(viewIds, def.paramKey, range);
  }

  return (
    <div className="w-44 flex-none">
      <RangePicker
        value={value}
        onChange={handleChange}
        mode={def.mode ?? 'month'}
        placeholder={['From', 'To']}
      />
    </div>
  );
}

export function ReportControls({ controls, viewIds }) {
  // SmartDataTable initializes views in its own useEffect, which fires after ours
  // (sibling order in React's commit phase). Subscribe and wait until all views
  // exist before pushing defaultValues into the store.
  useEffect(() => {
    const defaults = controls.filter((def) => def.defaultValue !== undefined);
    if (!defaults.length) return;

    let unsub;
    const trySet = () => {
      const s = useSmartDataStore.getState();
      if (!viewIds.every((id) => s.views[id])) return;
      unsub?.();
      defaults.forEach((def) => broadcast(viewIds, def.paramKey, parseDefault(def)));
    };

    unsub = useSmartDataStore.subscribe(trySet);
    trySet();
    return () => unsub?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {controls.map((def, i) => {
        if (def.type === 'toggle')     return <ToggleControl key={i} def={def} viewIds={viewIds} />;
        if (def.type === 'dateRange')  return <DateRangeControl key={i} def={def} viewIds={viewIds} />;
        if (def.type === 'filterSort') return <FilterSortControl key={i} def={def} viewIds={viewIds} />;
        return null;
      })}
    </>
  );
}
