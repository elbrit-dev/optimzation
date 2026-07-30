"use client";

import { useEffect, useRef } from "react";
import {
  isSameCalendarSignature,
  probeCalendarSignature,
} from "@calendar/lib/calendar/change-probe";
import { invalidateCalendarData } from "@calendar/lib/calendar/invalidate";
import { subscribeCalendarDataChanged } from "@calendar/lib/calendar/realtime";

const DEFAULT_PROBE_INTERVAL_MS = 20 * 1000;
// A single save can fire several notifications (the write itself, then the
// DocShare sync that follows it). Collapse them into one refetch.
const LOCAL_CHANGE_DEBOUNCE_MS = 400;
// Focus / visibility / reconnect all probe on arrival. Alt-tabbing repeatedly
// would otherwise hammer ERP, so hold a floor between consecutive probes.
const MIN_PROBE_GAP_MS = 5 * 1000;

/**
 * Keeps the calendar in step with ERP without the user having to press Sync.
 *
 * Two triggers:
 *  - writes from this browser (any tab) refetch immediately, so a leave the
 *    manager just approved is reconciled against what ERP actually stored;
 *  - a cheap aggregate probe every `intervalMs` catches writes made by *other*
 *    users, which the browser has no other way of hearing about.
 *
 * Probing pauses while the tab is hidden and resumes — with an immediate
 * check — on focus, visibility change and reconnect, so a phone that was in a
 * pocket is up to date by the time it is looked at.
 *
 * @param {{ refresh: () => Promise<unknown>, enabled?: boolean, intervalMs?: number }} options
 *   refresh must bypass caches (see `reloadEvents` in the calendar context).
 */
export function useCalendarLiveSync({
  refresh,
  enabled = true,
  intervalMs = DEFAULT_PROBE_INTERVAL_MS,
}) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;
    let isRefreshing = false;
    let refreshQueued = false;
    let signature = null;
    let intervalId = null;
    let debounceId = null;
    let lastProbeAt = 0;

    // Resolves to whether the refetch actually landed, so callers can decide
    // whether it is safe to move the baseline forward.
    const pull = async () => {
      if (cancelled) return false;

      if (isRefreshing) {
        // Something changed again mid-refetch — run once more afterwards
        // instead of firing overlapping requests.
        refreshQueued = true;
        return false;
      }

      isRefreshing = true;
      let succeeded = false;

      try {
        invalidateCalendarData({ broadcast: false });
        await refreshRef.current?.();
        succeeded = true;
      } catch (error) {
        console.error("Background calendar refresh failed", error);
      } finally {
        isRefreshing = false;

        if (refreshQueued && !cancelled) {
          refreshQueued = false;
          pull();
        }
      }

      return succeeded;
    };

    const probe = async () => {
      if (cancelled) return;
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastProbeAt < MIN_PROBE_GAP_MS) return;

      lastProbeAt = Date.now();

      let next;
      try {
        next = await probeCalendarSignature(signature);
      } catch (error) {
        // Offline or ERP hiccup — the next tick tries again.
        return;
      }

      // Nothing readable at all (offline / ERP down). Keep the old signature so
      // the first successful probe afterwards still spots what we missed.
      if (cancelled || !next) return;

      // The first probe only establishes a baseline: the provider has already
      // fetched on mount, so there is nothing to catch up on yet.
      const changed =
        signature !== null && !isSameCalendarSignature(signature, next);

      signature = next;

      if (changed) {
        await pull();
      }
    };

    // A write from this browser is authoritative — don't wait for the probe.
    const handleLocalChange = () => {
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(async () => {
        // Read the baseline *before* refetching, so that our own write stops
        // being reported as a change while anything that lands during the
        // refetch is still caught by the next probe. Only move the baseline if
        // the refetch actually succeeded — otherwise the next probe must still
        // see a difference and retry.
        const baseline = await probeCalendarSignature(signature);
        const refreshed = await pull();

        if (refreshed && baseline && !cancelled) {
          signature = baseline;
        }
      }, LOCAL_CHANGE_DEBOUNCE_MS);
    };

    const handleWake = () => {
      if (document.visibilityState === "visible") {
        probe();
      }
    };

    probe();
    intervalId = window.setInterval(probe, intervalMs);

    const unsubscribe = subscribeCalendarDataChanged(handleLocalChange);
    document.addEventListener("visibilitychange", handleWake);
    window.addEventListener("focus", handleWake);
    window.addEventListener("online", handleWake);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(debounceId);
      unsubscribe();
      document.removeEventListener("visibilitychange", handleWake);
      window.removeEventListener("focus", handleWake);
      window.removeEventListener("online", handleWake);
    };
  }, [enabled, intervalMs]);
}
