'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sidebar } from 'primereact/sidebar';
import { Button, Field, Icon } from '@/design-system';
import { LoadingOverlay } from './TableSkeleton';
import { logSmartDataEvent } from './smartDataLogger.js';

// ─── Mobile hook ─────────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

// ─── Sort label helper ────────────────────────────────────────────────────────

function getSortLabels(filterDef) {
  const ft = filterDef.fieldtype ?? '';
  if (ft === 'Date' || ft === 'Datetime') {
    return { asc: 'Oldest to Latest', desc: 'Latest to Oldest' };
  }
  if (ft === 'Int' || ft === 'Float' || ft === 'Currency' || ft === 'Percent') {
    return { asc: 'Low to High', desc: 'High to Low' };
  }
  return { asc: 'A to Z', desc: 'Z to A' };
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ValueSkeleton() {
  return (
    <div className="absolute inset-0 space-y-2 p-2 animate-pulse overflow-hidden">
      {Array.from({ length: 100 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-4 h-4 bg-surface-disabled rounded flex-shrink-0" />
          <div className="h-3 bg-surface-disabled rounded" style={{ width: `${60 + (i % 3) * 15}%` }} />
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * FilterSortSidebar
 *
 * Props:
 *   visible              boolean
 *   onHide               () => void
 *   filterDefs           Array<{ key, label, fieldtype, options, value_field?, sortOnly? }>
 *                        — from Report API message.data.filters.
 *                          `sortOnly: true` keeps a field in the sort pane and
 *                          out of the tab rail, for fields worth ordering by
 *                          whose value list nobody would pick from.
 *   fetchFilterValues    async (key, { page, pageLength, search }) => Array<{ value, label }>
 *                        — from SmartDataProvider via context
 *   currentSortConfig    { field, direction } | null
 *   currentFilterValues  { [key]: string[] }
 *   dateRange            { start?, end? } — from date-range control; clears cache on change
 *   onApply              (sortConfig, filterValues) => void
 *   onClear              () => void
 */
export default function FilterSortSidebar({
  visible,
  onHide,
  filterDefs = [],
  fetchFilterValues,
  currentSortBy = {},
  currentFilterValues = {},
  dateRange,
  onApply,
  onClear,
}) {
  // ── Sidebar-level state ───────────────────────────────────────────────────
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [selectedSorts, setSelectedSorts] = useState(currentSortBy ?? {});
  const [selectedFilterValues, setSelectedFilterValues] = useState(currentFilterValues || {});
  const selectedFilterValuesRef = useRef(selectedFilterValues);
  selectedFilterValuesRef.current = selectedFilterValues;

  // ── Per-tab async value state ─────────────────────────────────────────────
  // { [key]: { items: [{value,label}], page: number, hasMore: boolean, loading: boolean } }
  const [tabValues, setTabValues] = useState({});
  // Raw search term per filter key (pre-debounce)
  const [tabSearch, setTabSearch] = useState({});

  // Sentinel div at end of each filter list for IntersectionObserver infinite scroll
  const sentinelRef = useRef(null);
  // Track in-flight requests to avoid double-fetches
  const fetchingRef = useRef({});
  // Per-tab previous search term — detect user clearing search vs tab switch
  const lastSearchRef = useRef({});
  const skipFilterInvalidationRef = useRef(true);

  // ── Sync when sidebar opens ───────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setSelectedSorts(currentSortBy ?? {});
      setSelectedFilterValues(currentFilterValues || {});
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear cached values when the report date range changes
  useEffect(() => {
    setTabValues({});
  }, [dateRange?.start, dateRange?.end]);

  // ── Current filter key (for the active tab) ───────────────────────────────
  /* THE TABS ARE THE FILTERABLE DEFS ONLY. A def marked `sortOnly` still
     appears in the sort pane but gets no tab: some fields are worth ordering
     by and pointless to pick values from -- a visit-date tab lists every date
     in the range, a visit-time tab lists clock hours, and neither is a
     question a reader asks. The sort pane keeps reading the full list. */
  const tabDefs = useMemo(() => filterDefs.filter((d) => !d.sortOnly), [filterDefs]);
  const currentFilterDef = activeTabIndex > 0 ? tabDefs[activeTabIndex - 1] : null;
  const currentKey = currentFilterDef?.key ?? null;

  // Invalidate non-active filter tabs when cascade selections change
  useEffect(() => {
    if (skipFilterInvalidationRef.current) {
      skipFilterInvalidationRef.current = false;
      return;
    }
    if (!currentKey) return;
    setTabValues(prev => {
      const updated = {};
      if (prev[currentKey]) updated[currentKey] = prev[currentKey];
      return updated;
    });
  }, [selectedFilterValues]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load values helper ────────────────────────────────────────────────────
  const loadValues = useCallback(async (key, page, search, reset) => {
    if (!fetchFilterValues) return;
    // Prevent concurrent fetches for the same key
    if (fetchingRef.current[key]) return;
    fetchingRef.current[key] = true;

    setTabValues(prev => ({
      ...prev,
      [key]: reset
        ? { items: [], page: 1, hasMore: true, loading: true }
        : { ...prev[key], loading: true },
    }));

    try {
      const { items, hasMore } = await fetchFilterValues(key, { page, pageLength: 20, search, currentFilters: selectedFilterValuesRef.current });
      setTabValues(prev => {
        const existing = reset ? [] : (prev[key]?.items ?? []);
        return {
          ...prev,
          [key]: {
            items: [...existing, ...items],
            page,
            hasMore,
            loading: false,
          },
        };
      });
    } catch (err) {
      // Never swallow this: a throw before the fetch (bad api config, failed dimension
      // discovery) otherwise looks identical to "the server returned nothing".
      logSmartDataEvent('error', 'filter-search', 'filter-search:error', {
        key, page, search, error: err?.message,
      });
      console.error(`[FilterSortSidebar] fetchFilterValues("${key}") failed:`, err);
      setTabValues(prev => ({
        ...prev,
        [key]: { ...(prev[key] ?? {}), loading: false, hasMore: false },
      }));
    } finally {
      fetchingRef.current[key] = false;
    }
  }, [fetchFilterValues]);

  // ── Load page 1 when switching to a filter tab (if not already loaded) ────
  useEffect(() => {
    if (!currentKey) return;
    if (tabValues[currentKey]) return; // already loaded
    loadValues(currentKey, 1, tabSearch[currentKey] ?? '', true);
  }, [currentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchTerm = tabSearch[currentKey] ?? '';
  const debounceRef = useRef(null);

  // Auto-search: debounced when typing; refetch full list only when user clears an active search.
  // Tab switches with empty search are handled by the effect above (respects cache).
  useEffect(() => {
    if (!currentKey) return;
    clearTimeout(debounceRef.current);

    const prev = lastSearchRef.current[currentKey] ?? '';

    if (searchTerm.length >= 2) {
      debounceRef.current = setTimeout(() => {
        loadValues(currentKey, 1, searchTerm, true);
      }, 650);
    } else if (searchTerm.length === 0 && prev.length >= 2) {
      loadValues(currentKey, 1, '', true);
    }

    lastSearchRef.current[currentKey] = searchTerm;
    return () => clearTimeout(debounceRef.current);
  }, [searchTerm, currentKey]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Infinite scroll via IntersectionObserver ──────────────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !currentKey) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting) return;
        const tv = tabValues[currentKey];
        if (!tv || !tv.hasMore || tv.loading || fetchingRef.current[currentKey]) return;
        loadValues(currentKey, (tv.page ?? 1) + 1, tabSearch[currentKey] ?? '', false);
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [currentKey, tabValues, tabSearch, loadValues]);

  // ── Apply / Clear ─────────────────────────────────────────────────────────
  const handleApply = () => {
    onHide?.();
    onApply?.(selectedSorts, selectedFilterValues);
  };

  const handleClear = () => {
    setSelectedSorts({});
    setSelectedFilterValues({});
    onClear?.();
  };

  const hasActiveFilters = useMemo(() => {
    const hasSort = Object.keys(selectedSorts).length > 0;
    const hasFilters = Object.values(selectedFilterValues).some(vals => Array.isArray(vals) && vals.length > 0);
    return hasSort || hasFilters;
  }, [selectedSorts, selectedFilterValues]);

  const isMobile = useIsMobile();

  // ── Sort options from filterDefs ──────────────────────────────────────────
  const sortOptions = useMemo(() => {
    return filterDefs.flatMap(def => {
      const { asc, desc } = getSortLabels(def);
      return [
        { label: `${def.label} — ${asc}`,  value: def.key, direction: 'asc' },
        { label: `${def.label} — ${desc}`, value: def.key, direction: 'desc' },
      ];
    });
  }, [filterDefs]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Sidebar
unstyled
      /* Selector contract for e2e/pages/SmartTablePage.js. `.p-sidebar` and
         `.p-sidebar-close` used to stand in for these, and both vanish under
         `unstyled`; these attributes do not. */
      pt={{
        root: { 'data-testid': 'filter-sidebar' },
        closeButton: { 'data-testid': 'filter-sidebar-close' },
      }}
      visible={visible}
      onHide={onHide}
      position={isMobile ? 'bottom' : 'left'}
      blockScroll
      className={isMobile ? 'w-full' : ''}
      style={isMobile ? { height: '80vh' } : { width: '600px', maxWidth: '90vw' }}
      header={<h2 className="text-lg font-semibold text-body m-0">Filter and Sort</h2>}
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-hidden flex min-h-0">

          {/* ── Left tab navigation ─────────────────────────────────────── */}
          <div className="w-28 border-r border-line-subtle bg-sunken overflow-y-auto flex-shrink-0">
            <div className="p-2">
              {/* Sort tab */}
              <button
                data-testid="filter-sidebar-tab"
                onClick={() => setActiveTabIndex(0)}
                className={`w-full text-left px-2 py-2 rounded-md mb-1 transition-colors text-sm ${
                  activeTabIndex === 0 ? 'bg-brand-tint text-brand font-medium' : 'text-body hover:bg-brand-tint-weak'
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className="text-xs">Sort by</span>
                  {Object.keys(selectedSorts).length > 0 && <span className="w-2 h-2 bg-brand rounded-full flex-shrink-0" />}
                </span>
              </button>

              {/* One tab per filterDef */}
              {tabDefs.map((def, idx) => {
                const tabIndex = idx + 1;
                const selectedCount = (selectedFilterValues[def.key] ?? []).length;
                const isActive = activeTabIndex === tabIndex;

                return (
                  <button
                    key={def.key}
                    data-testid="filter-sidebar-tab"
                    onClick={() => setActiveTabIndex(tabIndex)}
                    className={`w-full text-left px-2 py-2 rounded-md mb-1 transition-colors text-sm ${
                      isActive ? 'bg-brand-tint text-brand font-medium' : 'text-body hover:bg-brand-tint-weak'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span className="text-xs truncate">{def.label}</span>
                      {selectedCount > 0 && (
                        <span className="px-1.5 py-0.5 text-xs font-medium bg-brand text-on-brand rounded-full min-w-[1.25rem] text-center flex-shrink-0">
                          {selectedCount}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Right content area ──────────────────────────────────────── */}
          <div className="flex-1 overflow-hidden bg-surface min-h-0 flex flex-col">

            {/* Sort tab */}
            {activeTabIndex === 0 && (
              <div className="pl-4 flex-1 overflow-y-auto min-h-0">
                <div className="space-y-1">
                  {sortOptions.length === 0 ? (
                    <p className="text-sm text-ds-secondary p-2">No sort fields available</p>
                  ) : (
                    sortOptions.map((opt, idx) => {
                      const isChecked = selectedSorts[opt.value] === opt.direction;
                      return (
                        <label key={idx} data-testid="sort-option" className="flex items-center cursor-pointer p-2 rounded hover:bg-brand-tint-weak">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => setSelectedSorts(prev => {
                              if (isChecked) {
                                const { [opt.value]: _, ...rest } = prev;
                                return rest;
                              }
                              return { ...prev, [opt.value]: opt.direction };
                            })}
                            className="mr-3 w-4 h-4 text-brand"
                          />
                          <span className="text-sm text-body flex-1">{opt.label}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Filter tab content */}
            {activeTabIndex > 0 && currentFilterDef && (() => {
              const key = currentFilterDef.key;
              const tv = tabValues[key];
              const items = tv?.items ?? [];
              const loading = tv?.loading ?? false;
              const hasMore = tv?.hasMore ?? true;
              const search = tabSearch[key] ?? '';
              const selectedValues = selectedFilterValues[key] ?? [];

              const toggleValue = (value) => {
                setSelectedFilterValues(prev => {
                  const current = prev[key] ?? [];
                  const isSelected = current.includes(value);
                  return {
                    ...prev,
                    [key]: isSelected ? current.filter(v => v !== value) : [...current, value],
                  };
                });
                // Cascade: clear other tabs' caches so they reload with the updated filter applied
                setTabValues(prev => {
                  const updated = {};
                  if (prev[key]) updated[key] = prev[key];
                  return updated;
                });
              };


              return (
                <div className="pl-4 flex-1 overflow-hidden flex flex-col min-h-0">

                  {/* Search row */}
                  <div className="mb-3 flex items-center gap-2 flex-shrink-0 pr-3">
                    {/* A DS Field with the clear button as its suffix. This was a
                        lara `p-inputgroup`, whose CSS `unstyled` drops — the ×
                        addon lost its frame and sat loose beside the input. */}
                    <Field
                      value={search}
                      onChange={v => setTabSearch(prev => ({ ...prev, [key]: v }))}
                      onKeyDown={e => { if (e.key === 'Enter') { clearTimeout(debounceRef.current); loadValues(key, 1, searchTerm, true); } }}
                      placeholder="Search…"
                      aria-label="Search values"
                      className="min-w-0 flex-1"
                      suffix={search ? (
                        <button
                          type="button"
                          onClick={() => setTabSearch(prev => ({ ...prev, [key]: '' }))}
                          aria-label="Clear search"
                          className="flex items-center text-ds-secondary hover:text-body"
                        >
                          <Icon name="times" size="sm" />
                        </button>
                      ) : null}
                    />
                    <span className="text-xs text-ds-secondary whitespace-nowrap">
                      {selectedValues.length} selected
                    </span>
                  </div>

                  {/* Value list with infinite scroll */}
                  <div className="relative space-y-1 flex-1 overflow-y-auto min-h-0 pr-1">

                    {/* Initial load or search-reset loading state */}
                    {(!tv || (loading && items.length === 0)) && <ValueSkeleton />}
                    {(!tv || (loading && items.length === 0)) && <LoadingOverlay message="Fetching values…" />}

                    {/* Values */}
                    {items.map((item, idx) => {
                      const isSelected = selectedValues.includes(item.value);
                      return (
                        <label key={`${item.value}-${idx}`} data-testid="filter-option" className="flex items-center cursor-pointer p-2 rounded hover:bg-brand-tint-weak">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleValue(item.value)}
                            className="mr-3 w-4 h-4 text-brand border-line rounded focus:ring-focus"
                          />
                          <span className="text-sm text-body flex-1 truncate" title={item.label}>
                            {item.label}
                          </span>
                          {item.count != null && (
                            <span className="ml-2 px-1.5 py-0.5 text-xs text-ds-secondary bg-sunken rounded-full flex-shrink-0">
                              {item.count.toLocaleString()}
                            </span>
                          )}
                        </label>
                      );
                    })}

                    {/* Empty state (after load) */}
                    {tv && !loading && items.length === 0 && (
                      <p className="text-sm text-ds-secondary p-2">
                        {search ? 'No values match your search' : 'No values available'}
                      </p>
                    )}

                    {/* Infinite scroll sentinel */}
                    {hasMore && <div ref={sentinelRef} className="h-4" />}

                    {/* Loading spinner for subsequent pages */}
                    {loading && items.length > 0 && (
                      <div className="flex items-center justify-center py-3">
                        <i className="pi pi-spin pi-spinner text-brand text-lg" />
                      </div>
                    )}

                    {/* End of list indicator */}
                    {!hasMore && items.length > 0 && !loading && (
                      <p className="text-xs text-ds-muted text-center py-2">All values loaded</p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-line-subtle p-4 bg-sunken">
          <div className="flex gap-2">
            <Button type="default" data-testid="filter-clear" icon={<i className="pi pi-times" />} onClick={handleClear} className="flex-1" disabled={!hasActiveFilters}>Clear</Button>
            <Button data-testid="filter-apply" icon={<i className="pi pi-check" />} onClick={handleApply} className="flex-1" disabled={!hasActiveFilters}>Apply</Button>
          </div>
        </div>
      </div>
    </Sidebar>
  );
}
