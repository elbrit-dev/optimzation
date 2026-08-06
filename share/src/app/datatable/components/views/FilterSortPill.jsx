'use client';

import { useTableOperations } from '../../contexts/TableOperationsContext';

/**
 * Compact trigger for the ORIGINAL Filter/Sort sidebar: "⛭ A → Z".
 *
 * This is only a restyled button — the control it opens is the provider's own
 * FilterSortSidebar (sortFields from the query doc), exactly as on the original
 * provider. By default it opens the sidebar in SORT-ONLY mode (the search bar
 * owns filtering); pass sortOnly={false} to open the full Filter and Sort. The
 * label reflects the applied sidebar sort, typed like the engine's own chip:
 * text "A → Z", numbers "Low → High", dates "Oldest → Latest".
 */
export default function FilterSortPill({ defaultLabel = 'Sort', sortOnly = true, className }) {
  const {
    setFilterSortSidebarVisible,
    openFilterSortSidebar,
    sortConfig,
    columnTypes,
    clientSave,
    searchFields,
    sortFields,
  } = useTableOperations();

  const open = () => {
    if (typeof openFilterSortSidebar === 'function') openFilterSortSidebar({ sortOnly });
    else setFilterSortSidebarVisible?.(true);
  };

  // Mirror the native button's availability: the sidebar only exists for
  // clientSave queries that define search or sort fields.
  const available =
    (typeof openFilterSortSidebar === 'function' || typeof setFilterSortSidebarVisible === 'function') &&
    clientSave === true &&
    (Object.keys(searchFields || {}).length > 0 || !!sortFields);
  if (!available) return null;

  let label = defaultLabel;
  if (sortConfig?.field) {
    const fieldName = String(sortConfig.field).split('.').pop();
    const fieldType = columnTypes?.[fieldName] || 'string';
    const asc = sortConfig.direction === 'asc';
    if (fieldType === 'date') label = asc ? 'Oldest → Latest' : 'Latest → Oldest';
    else if (fieldType === 'number') label = asc ? 'Low → High' : 'High → Low';
    else label = asc ? 'A → Z' : 'Z → A';
  }

  return (
    <button
      type="button"
      onClick={open}
      title={sortOnly ? 'Sort' : 'Filter / Sort'}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-slate-800 hover:bg-gray-50 sm:px-3 sm:text-sm ${className ?? ''}`}
      style={{ height: '2rem' }}
    >
      <i className="pi pi-sliders-h text-xs text-gray-500" aria-hidden="true" />
      {label}
    </button>
  );
}
