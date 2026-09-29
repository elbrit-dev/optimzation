'use client';

import FyMonthPicker from '@/components/FyMonthPicker';
import RangePicker from '@/components/RangePicker';
import FilterSortSidebar from '@/components/SmartDataTable/FilterSortSidebar';
import { filterIcon, shortFilterValue } from '@/components/SmartDataTable/filterIcons';
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
/* Same design language as FyMonthPicker (the Doctor Support picker): white
   controls on a #D0D5DD border, #101828 for anything on/selected, blue border
   on hover. Hover is gated to real pointers so a tap doesn't leave it stuck. */
const CONTROLS_CSS = `
.rc-root .rc-ctl{background:#fff;border:1px solid #D0D5DD;border-radius:8px;color:#101828;transition:border-color .15s}
.rc-root .rc-ctl.rc-on{border-color:#101828}
.rc-root .rc-sw.ant-switch-checked{background:#101828}
.rc-root .rc-x{color:#D0D5DD}
.rc-root .rc-gx{color:#667085}
.rc-root .rc-clear{color:#C4262B;background:transparent}
.rc-root [data-rc-scroll]{scrollbar-width:none}
.rc-root [data-rc-scroll]::-webkit-scrollbar{display:none}
@media (hover:hover) and (pointer:fine){
.rc-root .rc-hb:hover{border-color:#1F4FD8}
.rc-root .rc-sw.ant-switch-checked:hover:not(.ant-switch-disabled){background:#344054}
.rc-root .rc-x:hover{color:#fff;background:rgba(255,255,255,.18)}
.rc-root .rc-gx:hover{color:#101828;background:#F2F4F7}
.rc-root .rc-clear:hover{background:#FEF3F2}
}`;

function emitControlOutput(store, viewIds, key, output) {
  const state = store.getState();
  viewIds.forEach(id => state.setControlOutput(id, key, output));
}

function formatDateForApi(date) {
  if (!date) return null;
  return dayjs(date).format('YYYY-MM-DD');
}

/**
 * dateLimit (a top-level reportConfig key, so a page can set it through the
 * provider's `overrides` without replacing the whole `controls` array) locks
 * every dateRange control to a window:
 *   'currentFY'           — this Indian financial year (Apr–Mar)
 *   'lastFY'              — the one before it
 *   { from, to }          — explicit 'YYYY-MM-DD' bounds; either may be left out
 * Returns [min, max] as Dates (either may be null), or null for no limit.
 */
export function resolveDateLimit(limit) {
  if (!limit) return null;
  if (limit === 'currentFY' || limit === 'lastFY') {
    const now = dayjs();
    const fy = (now.month() >= 3 ? now.year() : now.year() - 1) - (limit === 'lastFY' ? 1 : 0);
    return [new Date(fy, 3, 1), new Date(fy + 1, 2, 31)];
  }
  if (typeof limit === 'object') {
    const from = limit.from ? dayjs(limit.from).startOf('day').toDate() : null;
    const to   = limit.to   ? dayjs(limit.to).endOf('day').toDate()     : null;
    return from || to ? [from, to] : null;
  }
  return null;
}

// Pull a [start, end] pair inside the limit. A range that misses it entirely
// becomes the limit's latest month (never later than today).
function clampRange(range, limit) {
  if (!limit || !range) return range;
  const [min, max] = limit;
  const latest = dayjs(max && max < new Date() ? max : new Date());
  let [s, e] = range;
  if (min && s < min) s = min;
  if (max && e > max) e = max;
  if (s > e) return [latest.startOf('month').toDate(), latest.endOf('month').toDate()];
  return [s, e];
}

// Priority for a dateRange control's initial value:
//   P1. `def.value`        — explicit prop override passed in by the caller
//   P2. `apiFilters`       — the API's current from_date/to_date (e.g. current period)
//   P3. `def.defaultValue` — static default from the report config
//   P4. current month      — final fallback so the picker never opens empty
// Whichever wins is then clamped into dateLimit.
function parseDateRangeDefault(def, apiFilters) {
  if (Array.isArray(def.value)) return def.value.map((d) => new Date(d));
  if (apiFilters?.from_date && apiFilters?.to_date) {
    return [new Date(apiFilters.from_date), new Date(apiFilters.to_date)];
  }
  if (Array.isArray(def.defaultValue)) return def.defaultValue.map((d) => new Date(d));
  return [dayjs().startOf('month').toDate(), dayjs().endOf('month').toDate()];
}

function parseDefault(def, apiFilters, limit) {
  if (def.type === 'dateRange') return clampRange(parseDateRangeDefault(def, apiFilters), limit);
  if (def.value !== undefined) return def.value;
  return def.defaultValue ?? (def.type === 'toggle' ? false : null);
}

function ToggleControl({ def, viewIds }) {
  const [value, setValue] = useState(parseDefault(def));
  const store = useSmartDataStoreApi();

  function handleChange(checked) {
    setValue(checked);
    emitControlOutput(store, viewIds, def.key, { value: checked });
  }

  return (
    <label className={`rc-ctl rc-hb flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 h-9 sm:h-8 cursor-pointer select-none${value ? ' rc-on' : ''}`}>
      <span className="text-xs sm:text-[13px] font-semibold whitespace-nowrap">{def.label ?? def.key}</span>
      <Switch className="rc-sw" checked={value} onChange={handleChange} size="small" />
    </label>
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
        className={`rc-ctl rc-hb flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 h-9 sm:h-8${isActive ? ' rc-on' : ''}`}
      >
        <i className="pi pi-filter" style={{ fontSize: '0.75rem', color: isActive ? '#101828' : '#667085' }} />
        {/* "Filter" on a phone so the row fits; the full label from sm up. */}
        <span className="text-xs sm:text-[13px] font-semibold whitespace-nowrap">
          <span className="sm:hidden">{def.shortLabel ?? 'Filter'}</span>
          <span className="hidden sm:inline">{def.label ?? 'Filter & Sort'}</span>
        </span>
        {isActive && (
          <span className="flex items-center justify-center h-4 px-1 rounded-full font-bold"
            style={{ minWidth: 16, backgroundColor: '#101828', color: '#fff', fontSize: '0.6rem' }}>
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

function DateRangeControl({ def, viewIds, apiFilters, limit }) {
  const [value, setValue] = useState(() => parseDefault(def, apiFilters, limit));
  const store = useSmartDataStoreApi();

  function handleChange(range) {
    setValue(range);
    emitControlOutput(store, viewIds, def.key, {
      start: formatDateForApi(range?.[0]),
      end:   formatDateForApi(range?.[1]),
    });
  }

  // Month mode (the default) uses the Doctor Support report's FY month picker;
  // week / quarter / year modes keep the generic RangePicker.
  if ((def.mode ?? 'month') === 'month') {
    return (
      <FyMonthPicker
        value={value}
        onChange={handleChange}
        min={limit?.[0] ?? undefined}
        max={limit?.[1] ?? undefined}
        className="w-full h-9 sm:h-8 sm:w-auto sm:flex-none"
      />
    );
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
      className="rc-ctl rc-hb flex items-center gap-1.5 px-3 h-9 sm:h-8"
      style={{ color: '#344054' }}
    >
      <i className={isLoading ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'} style={{ fontSize: '0.75rem' }} />
      {label && <span className="text-xs font-medium whitespace-nowrap">{label}</span>}
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

  function clearValue(key, value) {
    const fsKey = getFilterSortKey();
    if (!fsKey) return;
    const rest = (filterSortOutput.filters?.[key] ?? []).filter(v => v !== value);
    const filters = { ...(filterSortOutput.filters ?? {}), [key]: rest };
    emitControlOutput(store, viewIds, fsKey, { ...filterSortOutput, filters });
  }

  function clearAll() {
    const fsKey = getFilterSortKey();
    if (!fsKey) return;
    emitControlOutput(store, viewIds, fsKey, { ...filterSortOutput, filters: {} });
  }

  // Rendered inline on the controls row, straight after the Filter & Sort button.
  // One white group per field, holding one dark chip per selected value (the
  // date picker's selected-cell look), so each value can be removed on its own.
  return (
    <>
      {activeFilters.map(def => (
        <div
          key={def.key}
          className="rc-ctl inline-flex items-center gap-1 pl-3 pr-1 h-9 sm:h-8 max-w-full min-w-0"
        >
          <i className={`${filterIcon(def)} mr-1 shrink-0`} style={{ fontSize: '0.8rem', color: '#667085' }} title={def.label} aria-label={def.label} />
          <div className="flex items-center gap-1 min-w-0 overflow-x-auto" data-rc-scroll="1">
            {filterSortOutput.filters[def.key].map(value => (
              <span
                key={value}
                className="inline-flex items-center gap-1 pl-2 pr-1 h-6 rounded-md text-xs font-semibold whitespace-nowrap shrink-0"
                style={{ background: '#101828', color: '#fff' }}
                title={`${def.label}: ${value}`}
              >
                <span className="truncate" style={{ maxWidth: '9rem' }}>{shortFilterValue(value)}</span>
                <button
                  type="button"
                  onClick={() => clearValue(def.key, value)}
                  className="rc-x flex items-center justify-center w-4 h-4 rounded"
                  title={`Remove ${value}`}
                  aria-label={`Remove ${def.label}: ${value}`}
                >
                  <i className="pi pi-times" style={{ fontSize: '0.55rem' }} />
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => clearOne(def.key)}
            className="rc-gx flex items-center justify-center w-6 h-6 rounded-md shrink-0"
            title={`Clear ${def.label}`}
            aria-label={`Clear ${def.label}`}
          >
            <i className="pi pi-times" style={{ fontSize: '0.65rem' }} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="rc-clear inline-flex items-center px-2 h-9 sm:h-8 rounded-md text-xs font-semibold whitespace-nowrap"
        title="Clear all filters"
      >
        Clear all
      </button>
    </>
  );
}

export function ReportControls({ controls, viewIds, apiFilters, dateLimit, extra }) {
  const store = useSmartDataStoreApi();
  const limit = useMemo(() => resolveDateLimit(dateLimit), [dateLimit]);

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
          const parsed = parseDefault(def, apiFilters, limit);
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

  // With a toolbarExtra slot (e.g. Cards / Table), the sync button moves down to
  // share a second row with it: sync at the left end, the slot at the right.
  // Without one, sync stays on the main row as before.
  const refreshControls = controls.filter((def) => def.type === 'refresh');
  const mainControls = extra ? controls.filter((def) => def.type !== 'refresh') : controls;

  return (
    // w-full + self-stretch: the host (a Plasmic stack) often centres its
    // children, which shrank this block to its content and floated it mid-page.
    <div className="rc-root flex flex-col gap-2 w-full self-stretch min-w-0">
      <style>{CONTROLS_CSS}</style>
      {/* The date picker takes its own full-width line on a phone; the buttons
          (toggles, Filter & Sort, sync) sit together in one group that never
          wraps -- on a narrow phone it scrolls sideways rather than dropping
          Filter & Sort onto a line of its own. The chips come after the group
          so THEY can still wrap. */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
        {mainControls.filter((def) => def.type === 'dateRange').map((def, i) => (
          <DateRangeControl key={`d${i}`} def={def} viewIds={viewIds} apiFilters={apiFilters} limit={limit} />
        ))}
        <div className="flex flex-nowrap items-center gap-1.5 sm:gap-3 min-w-0 max-w-full overflow-x-auto [&>*]:shrink-0" data-rc-scroll="1">
          {mainControls.map((def, i) => {
            if (def.type === 'toggle')     return <ToggleControl key={i} def={def} viewIds={viewIds} />;
            if (def.type === 'filterSort') return <FilterSortControl key={i} def={def} viewIds={viewIds} />;
            if (def.type === 'refresh')    return <RefreshControl key={i} def={def} />;
            return null;
          })}
        </div>
        {mainControls.some((def) => def.type === 'filterSort') && <FilterChips viewIds={viewIds} />}
      </div>
      {extra && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {refreshControls.map((def, i) => <RefreshControl key={i} def={def} />)}
          </div>
          <div className="ml-auto">{extra}</div>
        </div>
      )}
    </div>
  );
}
