'use client';

import { DataProvider as PlasmicDataProvider } from '@plasmicapp/loader-nextjs';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TableOperationsContext } from '../../contexts/TableOperationsContext';

/**
 * StaleDataBridge — variant-only stale-while-revalidate.
 *
 * DataProviderNew's loading flow is deliberately NOT modified. This bridge sits
 * between the provider and the slot content, and works purely on the published
 * context: after each successful load it snapshots the data fields to its own
 * IndexedDB store; on the next visit, while the provider is still loading, it
 * re-provides the context with last session's snapshot patched in (isLoading
 * forced false, isRevalidating true) so the views paint instantly. The moment
 * live data lands, it passes the real context through untouched and re-snapshots.
 *
 * Behavior at the edges:
 * - First ever visit (no snapshot): passthrough — the normal spinner shows.
 * - Interactions during the stale window (sort/filter clicks) update the live
 *   provider's state and take effect when the fresh data lands; the stale view
 *   itself is a static picture of the previous session.
 */

const DB_NAME = 'elbrit-view-snapshots';
const STORE = 'snapshots';
// Data fields the views bind to. Functions on the context are never snapshotted —
// the live provider's callbacks are kept so interactions still work.
const SNAPSHOT_FIELDS = [
  'rawData', 'columns', 'columnTypes', 'jsonObjectColumns', 'filteredData',
  'groupedData', 'sortedData', 'paginatedData', 'filterOptions',
  'multiselectColumns', 'effectiveGroupFields', 'reportData',
];
// Don't persist huge datasets — the point is a fast paint, not a full mirror.
const MAX_SNAPSHOT_ROWS = 20000;

function idbAvailable() {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  if (!idbAvailable()) return null;
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      rq.onsuccess = () => resolve(rq.result ?? null);
      rq.onerror = () => reject(rq.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet(key, value) {
  if (!idbAvailable()) return;
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Legacy flat context ({ rawData, ... }) vs slot map ({ main: {...} }). */
function normalizeSlots(context) {
  if (!context || typeof context !== 'object') return null;
  if (context.rawData !== undefined) return { __flat__: context };
  return context;
}

function pickSnapshotFields(slot) {
  const out = {};
  for (const field of SNAPSHOT_FIELDS) {
    if (slot[field] !== undefined) out[field] = slot[field];
  }
  return out;
}

/** Cheap change signal so identical data isn't rewritten on every render. */
function snapshotSignature(slots) {
  return Object.entries(slots)
    .map(([sid, s]) => `${sid}:${s?.rawData?.length ?? 0}:${s?.sortedData?.length ?? 0}:${s?.columns?.length ?? 0}`)
    .join('|');
}

export default function StaleDataBridge({ cacheKey, children }) {
  const live = useContext(TableOperationsContext);
  const [snapshot, setSnapshot] = useState(null);
  const loadedKeyRef = useRef(null);
  const lastSavedSigRef = useRef('');

  const key = cacheKey || 'dataprovider-views:default';

  // Load last session's snapshot once per key.
  useEffect(() => {
    if (loadedKeyRef.current === key) return undefined;
    loadedKeyRef.current = key;
    let cancelled = false;
    idbGet(key)
      .then((snap) => {
        if (!cancelled && snap && typeof snap === 'object' && snap.slots) setSnapshot(snap);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [key]);

  const slots = useMemo(() => normalizeSlots(live), [live]);

  const hasLiveData = useMemo(() => {
    if (!slots) return false;
    return Object.values(slots).some((s) => Array.isArray(s?.rawData) && s.rawData.length > 0);
  }, [slots]);

  const anyLoading = useMemo(() => {
    if (!slots) return false;
    return Object.values(slots).some((s) => s?.isLoading === true);
  }, [slots]);

  // Snapshot fresh data once it has settled.
  useEffect(() => {
    if (!slots || !hasLiveData || anyLoading) return;
    const sig = `${key}|${snapshotSignature(slots)}`;
    if (lastSavedSigRef.current === sig) return;
    const snapSlots = {};
    let totalRows = 0;
    for (const [sid, s] of Object.entries(slots)) {
      if (!s || typeof s !== 'object') continue;
      snapSlots[sid] = pickSnapshotFields(s);
      totalRows += Array.isArray(s.rawData) ? s.rawData.length : 0;
    }
    if (totalRows === 0 || totalRows > MAX_SNAPSHOT_ROWS) return;
    lastSavedSigRef.current = sig;
    const payload = { slots: snapSlots, savedAt: Date.now() };
    idbSet(key, payload).catch(() => {
      // reportData can hold non-cloneable values — retry without it.
      const slim = {};
      for (const [sid, s] of Object.entries(snapSlots)) {
        const { reportData: _omit, ...rest } = s;
        slim[sid] = rest;
      }
      idbSet(key, { slots: slim, savedAt: Date.now() }).catch(() => {});
    });
  }, [slots, hasLiveData, anyLoading, key]);

  // Patch only while the provider is loading with nothing on screen yet.
  const shouldPatch = anyLoading && !hasLiveData && snapshot != null;

  const provided = useMemo(() => {
    if (!shouldPatch || !slots) return live;
    const patchSlot = (liveSlot, snapSlot) =>
      snapSlot
        ? { ...liveSlot, ...snapSlot, isLoading: false, loadingText: '', isRevalidating: true }
        : liveSlot;
    if (slots.__flat__) {
      return patchSlot(slots.__flat__, snapshot.slots.__flat__ ?? snapshot.slots.main);
    }
    const out = {};
    for (const [sid, s] of Object.entries(slots)) {
      out[sid] = patchSlot(s, snapshot.slots[sid] ?? (sid === 'main' ? snapshot.slots.__flat__ : undefined));
    }
    return out;
  }, [shouldPatch, slots, snapshot, live]);

  // Providers always render so the child tree never remounts when patching toggles.
  return (
    <TableOperationsContext.Provider value={provided}>
      <PlasmicDataProvider name="data" data={provided}>
        {children}
      </PlasmicDataProvider>
    </TableOperationsContext.Provider>
  );
}
