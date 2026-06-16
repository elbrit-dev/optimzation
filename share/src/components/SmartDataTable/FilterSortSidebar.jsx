'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sidebar } from 'primereact/sidebar';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { LoadingOverlay } from './TableSkeleton';

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
          <div className="w-4 h-4 bg-gray-200 rounded flex-shrink-0" />
          <div className="h-3 bg-gray-200 rounded" style={{ width: `${60 + (i % 3) * 15}%` }} />
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
 *   filterDefs           Array<{ key, label, fieldtype, options, value_field? }>
 *                        — from Report API message.data.filters
 *   fetchFilterValues    async (key, { page, pageLength, search }) => Array<{ value, label }>
 *                        — from SmartDataProvider via context
 *   currentSortConfig    { field, direction } | null
 *   currentFilterValues  { [key]: string[] }
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
  onApply,
  onClear,
}) {
  // ── Sidebar-level state ───────────────────────────────────────────────────
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [selectedSorts, setSelectedSorts] = useState(currentSortBy ?? {});
  const [selectedFilterValues, setSelectedFilterValues] = useState(currentFilterValues || {});

  // ── Per-tab async value state ─────────────────────────────────────────────
  // { [key]: { items: [{value,label}], page: number, hasMore: boolean, loading: boolean } }
  const [tabValues, setTabValues] = useState({});
  // Raw search term per filter key (pre-debounce)
  const [tabSearch, setTabSearch] = useState({});

  // Sentinel div at end of each filter list for IntersectionObserver infinite scroll
  const sentinelRef = useRef(null);
  // Track in-flight requests to avoid double-fetches
  const fetchingRef = useRef({});

  // ── Sync when sidebar opens ───────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setSelectedSorts(currentSortBy ?? {});
      setSelectedFilterValues(currentFilterValues || {});
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Current filter key (for the active tab) ───────────────────────────────
  const currentFilterDef = activeTabIndex > 0 ? filterDefs[activeTabIndex - 1] : null;
  const currentKey = currentFilterDef?.key ?? null;

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
      const { items, hasMore } = await fetchFilterValues(key, { page, pageLength: 20, search, currentFilters: selectedFilterValues });
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
    } catch {
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
    loadValues(currentKey, 1, '', true);
  }, [currentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchTerm = tabSearch[currentKey] ?? '';
  const debounceRef = useRef(null);

  // Auto-search: fires 650ms after keystroke when search term is >= 2 chars.
  // Clears back to full list immediately when term drops to 0.
  useEffect(() => {
    if (!currentKey) return;
    clearTimeout(debounceRef.current);
    if (searchTerm.length === 0) {
      loadValues(currentKey, 1, '', true);
    } else if (searchTerm.length >= 2) {
      debounceRef.current = setTimeout(() => {
        loadValues(currentKey, 1, searchTerm, true);
      }, 650);
    }
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
      visible={visible}
      onHide={onHide}
      position={isMobile ? 'bottom' : 'left'}
      blockScroll
      className={isMobile ? 'w-full' : ''}
      style={isMobile ? { height: '80vh' } : { width: '600px', maxWidth: '90vw' }}
      header={<h2 className="text-lg font-semibold text-gray-800 m-0">Filter and Sort</h2>}
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-hidden flex min-h-0">

          {/* ── Left tab navigation ─────────────────────────────────────── */}
          <div className="w-28 border-r border-gray-200 bg-gray-50 overflow-y-auto flex-shrink-0">
            <div className="p-2">
              {/* Sort tab */}
              <button
                onClick={() => setActiveTabIndex(0)}
                className={`w-full text-left px-2 py-2 rounded-md mb-1 transition-colors text-sm ${
                  activeTabIndex === 0 ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className="text-xs">Sort by</span>
                  {Object.keys(selectedSorts).length > 0 && <span className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0" />}
                </span>
              </button>

              {/* One tab per filterDef */}
              {filterDefs.map((def, idx) => {
                const tabIndex = idx + 1;
                const selectedCount = (selectedFilterValues[def.key] ?? []).length;
                const isActive = activeTabIndex === tabIndex;

                return (
                  <button
                    key={def.key}
                    onClick={() => setActiveTabIndex(tabIndex)}
                    className={`w-full text-left px-2 py-2 rounded-md mb-1 transition-colors text-sm ${
                      isActive ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span className="text-xs truncate">{def.label}</span>
                      {selectedCount > 0 && (
                        <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-600 text-white rounded-full min-w-[1.25rem] text-center flex-shrink-0">
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
          <div className="flex-1 overflow-hidden bg-white min-h-0 flex flex-col">

            {/* Sort tab */}
            {activeTabIndex === 0 && (
              <div className="pl-4 flex-1 overflow-y-auto min-h-0">
                <div className="space-y-1">
                  {sortOptions.length === 0 ? (
                    <p className="text-sm text-gray-500 p-2">No sort fields available</p>
                  ) : (
                    sortOptions.map((opt, idx) => {
                      const isChecked = selectedSorts[opt.value] === opt.direction;
                      return (
                        <label key={idx} className="flex items-center cursor-pointer p-2 rounded hover:bg-gray-50">
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
                            className="mr-3 w-4 h-4 text-blue-600"
                          />
                          <span className="text-sm text-gray-700 flex-1">{opt.label}</span>
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
                    <div className="p-inputgroup flex-1">
                      <InputText
                        value={search}
                        onChange={e => setTabSearch(prev => ({ ...prev, [key]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { clearTimeout(debounceRef.current); loadValues(key, 1, searchTerm, true); } }}
                        placeholder="Search…"
                        style={{ height: '2rem' }}
                      />
                      {search && (
                        <span
                          className="p-inputgroup-addon cursor-pointer hover:bg-gray-100"
                          style={{ height: '2rem' }}
                          onClick={() => setTabSearch(prev => ({ ...prev, [key]: '' }))}
                        >
                          <i className="pi pi-times text-xs text-gray-500" />
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
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
                        <label key={`${item.value}-${idx}`} className="flex items-center cursor-pointer p-2 rounded hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleValue(item.value)}
                            className="mr-3 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 flex-1 truncate" title={item.label}>
                            {item.label}
                          </span>
                          {item.count != null && (
                            <span className="ml-2 px-1.5 py-0.5 text-xs text-gray-500 bg-gray-100 rounded-full flex-shrink-0">
                              {item.count.toLocaleString()}
                            </span>
                          )}
                        </label>
                      );
                    })}

                    {/* Empty state (after load) */}
                    {tv && !loading && items.length === 0 && (
                      <p className="text-sm text-gray-500 p-2">
                        {search ? 'No values match your search' : 'No values available'}
                      </p>
                    )}

                    {/* Infinite scroll sentinel */}
                    {hasMore && <div ref={sentinelRef} className="h-4" />}

                    {/* Loading spinner for subsequent pages */}
                    {loading && items.length > 0 && (
                      <div className="flex items-center justify-center py-3">
                        <i className="pi pi-spin pi-spinner text-blue-500 text-lg" />
                      </div>
                    )}

                    {/* End of list indicator */}
                    {!hasMore && items.length > 0 && !loading && (
                      <p className="text-xs text-gray-400 text-center py-2">All values loaded</p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex gap-2">
            <Button
              label="Clear"
              icon="pi pi-times"
              onClick={handleClear}
              className="p-button-outlined flex-1"
              disabled={!hasActiveFilters}
            />
            <Button
              label="Apply"
              icon="pi pi-check"
              onClick={handleApply}
              className="flex-1"
              disabled={!hasActiveFilters}
            />
          </div>
        </div>
      </div>
    </Sidebar>
  );
}
