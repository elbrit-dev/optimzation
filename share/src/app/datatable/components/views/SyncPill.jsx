'use client';

import dayjs from 'dayjs';
import { useTableOperations } from '../../contexts/TableOperationsContext';

/**
 * Compact refresh control for the Views variant's header: "⟳ 5 Aug, 11:25".
 * Replaces the engine's SplitButton in compact mode — same handleSync under the
 * hood, just smaller and with a short date. Spins while a query (or a
 * stale-while-revalidate background refresh) is running.
 */
export default function SyncPill({ className }) {
  const { handleSync, lastUpdatedAt, executingQuery, isRevalidating, dataSource } = useTableOperations();

  // No query data source (offline data) — nothing to sync.
  if (!dataSource || typeof handleSync !== 'function') return null;

  const busy = executingQuery === true || isRevalidating === true;
  const parsed = lastUpdatedAt ? dayjs(lastUpdatedAt) : null;
  const label = parsed && parsed.isValid() ? parsed.format('D MMM, HH:mm') : 'Sync';

  return (
    <button
      type="button"
      onClick={() => handleSync()}
      disabled={busy}
      title="Refresh data"
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-slate-800 hover:bg-gray-50 disabled:opacity-60 sm:px-3 sm:text-sm ${className ?? ''}`}
      style={{ height: '2rem' }}
    >
      <i
        className={`${busy ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'} text-xs text-gray-500`}
        aria-hidden="true"
      />
      {label}
    </button>
  );
}
