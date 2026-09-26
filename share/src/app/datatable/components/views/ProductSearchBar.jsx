'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTableOperations } from '../../contexts/TableOperationsContext';

const DEFAULT_STORAGE_KEY = 'elbrit:dataprovider:recentSearches';

/** localStorage is unavailable during SSR/prerender, so every access is guarded. */
function readRecents(key, limit) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => typeof s === 'string' && s.trim()).slice(0, limit);
  } catch {
    return [];
  }
}

function writeRecents(key, list) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* quota / private mode — recents are a convenience, not critical */
  }
}

/**
 * Search input that drives the provider's own multi-field search (setSearchTerm),
 * so cards and table filter together. Shows a recent-searches panel on focus.
 *
 * The underlying search only matches when the query doc has `clientSave: true`
 * and a `searchFields` map — see useDataPipeline's searchFilteredData.
 *
 * Server-side mode: pass `term` + `onTermChange` and the input drives the
 * CALLER's state instead of the engine's. DataProviderViews uses that to turn
 * the term into query variables, so the ERP searches every row rather than the
 * page in memory — and deliberately leaves the engine's own searchTerm empty,
 * because a client-side pass over server-matched rows can only drop rows that
 * matched on a field the client search doesn't cover.
 */
export default function ProductSearchBar({
  placeholder = 'Search product or brand…',
  recentLimit = 5,
  storageKey = DEFAULT_STORAGE_KEY,
  showRecents = true,
  debounceMs = 250,
  // --- optional controlled mode (server-side search) ---
  term: termProp,
  onTermChange,
  busy = false,
  unavailable,
  unavailableHint,
}) {
  const ops = useTableOperations();
  const { clientSave, searchFields } = ops;

  // Controlled the moment the caller supplies a setter; the engine's own term
  // is then left alone.
  const isControlled = typeof onTermChange === 'function';
  const searchTerm = isControlled ? (termProp ?? '') : (ops.searchTerm ?? '');
  const setSearchTerm = isControlled ? onTermChange : ops.setSearchTerm;

  const [text, setText] = useState(searchTerm ?? '');
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState([]);
  // Anchor rect for the recents panel. The provider header sets overflow-x-auto,
  // which clips the cross axis too, so an absolutely positioned panel gets cut
  // off — rendering it fixed at the input's rect escapes the clip.
  const [anchor, setAnchor] = useState(null);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);
  const setSearchTermRef = useRef(setSearchTerm);
  setSearchTermRef.current = setSearchTerm;

  useEffect(() => {
    if (showRecents) setRecents(readRecents(storageKey, recentLimit));
  }, [showRecents, storageKey, recentLimit]);

  // Keep in step if something else resets the term (e.g. clearAllFilters).
  useEffect(() => {
    const incoming = searchTerm ?? '';
    setText((current) => (current === incoming ? current : incoming));
  }, [searchTerm]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const pushTerm = useCallback((value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTermRef.current?.(value);
    }, debounceMs);
  }, [debounceMs]);

  const commitRecent = useCallback((value) => {
    const trimmed = String(value ?? '').trim();
    if (!showRecents || !trimmed) return;
    setRecents((prev) => {
      const next = [trimmed, ...prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())]
        .slice(0, recentLimit);
      writeRecents(storageKey, next);
      return next;
    });
  }, [showRecents, recentLimit, storageKey]);

  const applyNow = useCallback((value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setText(value);
    setSearchTermRef.current?.(value);
    commitRecent(value);
    setOpen(false);
  }, [commitRecent]);

  // Close the recents panel on any outside click, and keep its fixed position
  // in step with the input (recompute on scroll/resize).
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const reposition = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    reposition();
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('scroll', reposition, { capture: true, passive: true });
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('scroll', reposition, { capture: true });
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const searchUnavailable = useMemo(() => {
    // In server-side mode the caller knows whether search can run (it depends on
    // the query body, not on clientSave), so its answer wins.
    if (typeof unavailable === 'boolean') return unavailable;
    return clientSave !== true || !searchFields || Object.keys(searchFields).length === 0;
  }, [unavailable, clientSave, searchFields]);

  const panelOpen = open && showRecents && recents.length > 0;

  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
      <div className="relative">
        <i
          className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ds-muted"
          aria-hidden="true"
        />
        <input
          type="text"
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          title={searchUnavailable
            ? (unavailableHint || 'This data source has no searchFields configured')
            : undefined}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            pushTerm(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyNow(text);
            else if (e.key === 'Escape') setOpen(false);
          }}
          className="w-full rounded-xl border border-transparent bg-sunken py-2.5 pl-10 pr-10 text-sm text-body placeholder:text-ds-muted focus:border-line focus:bg-surface focus-visible:ring-2 focus-visible:ring-focus sm:py-3"
        />
        {/* A server-side search is a network round trip, so it gets a spinner in
            place of the clear button while it resolves. */}
        {busy ? (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            role="status"
            aria-label="Searching"
          >
            <i className="pi pi-spinner pi-spin text-xs" aria-hidden="true" />
          </span>
        ) : text ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => applyNow('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ds-muted hover:bg-brand-tint hover:text-ds-secondary"
          >
            <i className="pi pi-times text-xs" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {panelOpen && anchor ? (
        <div
          style={{ position: 'fixed', top: anchor.top, left: anchor.left, width: anchor.width, zIndex: 2000 }}
          className="overflow-hidden rounded-xl border border-line-subtle bg-surface shadow-pop"
        >
          <div className="px-4 pt-3 pb-1 text-11 font-semibold uppercase tracking-wide text-ds-muted">
            Recent searches
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {recents.map((entry) => (
              <li key={entry}>
                <button
                  type="button"
                  onClick={() => applyNow(entry)}
                  className="flex w-full items-center gap-3 border-t border-line-subtle px-4 py-3 text-left first:border-t-0 hover:bg-brand-tint-weak"
                >
                  <i className="pi pi-search text-xs text-ds-muted" aria-hidden="true" />
                  <span className="flex-1 truncate text-sm font-medium text-body">{entry}</span>
                  <span className="shrink-0 text-xs text-ds-muted">Recent</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
