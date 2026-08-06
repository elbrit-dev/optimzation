'use client';

import dayjs from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTableOperations } from '../../contexts/TableOperationsContext';

/**
 * Compact refresh control for the Views variant's header: "⟳ 5 Aug, 11:25 ⌄".
 * Replaces the engine's SplitButton in compact mode — same handleSync on the
 * pill and the same handleHardRefresh (clear all client caches, then sync) on
 * the chevron menu, just smaller and with a short date. Spins while a query
 * (or a stale-while-revalidate background refresh) is running.
 */
export default function SyncPill({ className }) {
  const {
    handleSync,
    handleHardRefresh,
    lastUpdatedAt,
    executingQuery,
    isRevalidating,
    isLoading,
    dataSource,
  } = useTableOperations();

  const [menuOpen, setMenuOpen] = useState(false);
  // Anchor rect for the menu. The provider header sets overflow-x-auto, which
  // makes the cross axis clip too — so an absolutely positioned menu gets cut
  // off. Rendering it fixed at the button's rect escapes the clip entirely.
  const [anchor, setAnchor] = useState(null);
  const wrapRef = useRef(null);

  // Close the menu on any outside click; also close on scroll/resize so the
  // fixed-position menu can never drift away from its button.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    const close = () => setMenuOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('scroll', close, { capture: true, passive: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, [menuOpen]);

  const toggleMenu = useCallback(() => {
    setMenuOpen((open) => {
      if (open) return false;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
      return true;
    });
  }, []);

  const runHardRefresh = useCallback(() => {
    setMenuOpen(false);
    handleHardRefresh?.();
  }, [handleHardRefresh]);

  // No query data source (offline data) — nothing to sync.
  if (!dataSource || typeof handleSync !== 'function') return null;

  // isLoading covers the cache-read phases of a sync that executingQuery misses.
  const busy = executingQuery === true || isRevalidating === true || isLoading === true;
  const parsed = lastUpdatedAt ? dayjs(lastUpdatedAt) : null;
  const label = parsed && parsed.isValid() ? parsed.format('D MMM, HH:mm') : 'Sync';
  const hasHardRefresh = typeof handleHardRefresh === 'function';

  return (
    <div ref={wrapRef} className={`relative inline-flex shrink-0 ${className ?? ''}`}>
      <div
        className="inline-flex items-stretch overflow-hidden rounded-lg border border-gray-200 bg-white"
        style={{ height: '2rem' }}
      >
        <button
          type="button"
          onClick={() => handleSync()}
          disabled={busy}
          title="Refresh data"
          className="inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 text-xs font-semibold text-slate-800 hover:bg-gray-50 disabled:opacity-60 sm:px-3 sm:text-sm"
        >
          <i
            className={`${busy ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'} text-xs text-gray-500`}
            aria-hidden="true"
          />
          {label}
        </button>
        {hasHardRefresh ? (
          <button
            type="button"
            onClick={toggleMenu}
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More refresh options"
            className="inline-flex items-center border-l border-gray-200 px-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-60"
          >
            <i className="pi pi-chevron-down text-[10px]" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {menuOpen && hasHardRefresh && anchor ? (
        <div
          role="menu"
          style={{ position: 'fixed', top: anchor.top, right: anchor.right, zIndex: 2000 }}
          className="min-w-[11rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={runHardRefresh}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-gray-50"
          >
            <i className="pi pi-sync text-xs text-gray-500" aria-hidden="true" />
            Hard Refresh
          </button>
        </div>
      ) : null}
    </div>
  );
}
