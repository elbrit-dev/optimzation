'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePagingProgress } from './ViewPaginator';

/**
 * Scroll-driven loading for the Views variant: reach the end of the list and
 * the next batch is requested, instead of tapping Load more each time.
 *
 * It drives the SAME `paging.loadMore()` the button does — raising the query's
 * `first` — so there is no second paging path. Only the trigger is different.
 *
 * Two things to know about the shape of that:
 *
 * - Because `after` + `filter` throws on this ERP (see ViewPaginator), a step
 *   re-fetches rows 1..N rather than appending a page. Rows already on screen
 *   stay there while it runs (the engine only replaces processedData on
 *   success), so the list does not blank — but each step costs more than the
 *   last. Scroll-loading is for the first few hundred rows, not for walking
 *   45,000.
 * - The sentinel has to be in the list's own scroll flow. In the cards view it
 *   is. A DataTableNew scrolls INSIDE itself, so its rows never move the
 *   sentinel — the table view keeps the button.
 */

/** The element whose scrolling actually moves the sentinel, or null for the viewport. */
function nearestScrollParent(node) {
  let current = node?.parentElement ?? null;
  while (current && current !== document.body && current !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(current);
    if ((overflowY === 'auto' || overflowY === 'scroll')
      && current.scrollHeight > current.clientHeight + 1) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Invisible probe at the end of the list. When it comes into view — `rootMargin`
 * ahead of it, so the fetch starts before the reader arrives — it asks for the
 * next batch.
 *
 * @param {boolean} props.hasMore - false stops observing entirely
 * @param {boolean} props.busy - a fetch is already in flight
 * @param {number|string} props.progressKey - changes when new rows land; see below
 */
export function InfiniteScrollSentinel({
  enabled = true,
  hasMore = false,
  busy = false,
  progressKey = 0,
  rootMargin = '400px',
  onReachEnd,
}) {
  const ref = useRef(null);
  const onReachEndRef = useRef(onReachEnd);
  onReachEndRef.current = onReachEnd;
  // The batch we last asked for, so one intersection cannot fire twice for the
  // same set of rows.
  const askedForRef = useRef(null);
  // One batch per scroll. Starts granted so a list too short to scroll can fill
  // the first screen; spent on each ask, and granted again by scrolling.
  //
  // Without this, "the sentinel is visible" is the only condition, and a list
  // whose container never grows — rows going into an inner scroller, which is
  // what DataTableNew does — keeps it visible and loads batch after batch with
  // no further input. Measured in a browser: 19 batches off a single scroll,
  // stopping only at maxAutoBatches. Tying a batch to a scroll is what makes
  // this scroll-loading rather than load-whenever-possible.
  const ticketRef = useRef(true);

  useEffect(() => {
    if (!enabled || !hasMore || busy) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const element = ref.current;
    if (!element) return undefined;

    const scrollRoot = nearestScrollParent(element);
    const grantTicket = () => { ticketRef.current = true; };
    const scrollTarget = scrollRoot ?? window;
    scrollTarget.addEventListener('scroll', grantTicket, { passive: true });

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      if (askedForRef.current === progressKey) return;
      if (!ticketRef.current) return;
      ticketRef.current = false;
      askedForRef.current = progressKey;
      onReachEndRef.current?.();
    }, { root: scrollRoot, rootMargin, threshold: 0 });

    observer.observe(element);
    return () => {
      observer.disconnect();
      scrollTarget.removeEventListener('scroll', grantTicket);
    };
    // progressKey and busy are deps on purpose: an IntersectionObserver only
    // reports a CHANGE in intersection, so a sentinel that is still on screen
    // after a batch lands would never fire again. Re-observing on each of those
    // re-evaluates it immediately, which is what keeps a short list loading
    // until the sentinel is finally pushed out of view.
  }, [enabled, hasMore, busy, progressKey, rootMargin]);

  if (!enabled || !hasMore) return null;
  return <div ref={ref} aria-hidden="true" style={{ height: 1 }} />;
}

const SKELETON_SHELL = 'animate-pulse rounded-xl bg-gray-100';

/**
 * Placeholder rows shown while a scroll-triggered batch is in flight.
 *
 * The point is for a reader who got to the bottom faster than the network to
 * see that something is coming, rather than an apparently finished list. It is
 * `aria-hidden` with a live status beside it, so a screen reader hears "Loading
 * more" once instead of reading out empty boxes.
 */
export function LoadMoreSkeleton({ count = 3, variant = 'card', className }) {
  const items = Math.max(1, Math.min(12, Math.floor(Number(count) || 0) || 1));
  const height = variant === 'row' ? '2.25rem' : '4.5rem';
  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <span className="sr-only" role="status">Loading more</span>
      <div aria-hidden="true" className="flex flex-col gap-2">
        {Array.from({ length: items }, (_, index) => (
          <div key={index} className={SKELETON_SHELL} style={{ height }} />
        ))}
      </div>
    </div>
  );
}

/**
 * Sentinel + skeletons, positioned at the end of the list.
 *
 * Rendered as a sibling of the children slot in NORMAL FLOW, deliberately not
 * inside the Load-more bar: that bar is `sticky` by default, so it is on screen
 * the whole time a long list is being scrolled — a sentinel inside it would be
 * permanently intersecting and would load every remaining row at once.
 *
 * `progressKey` is the row count in hand. It is what makes a batch a batch: the
 * sentinel asks once per count, and the count only changes when rows land.
 */
export function InfiniteScrollLoader({
  paging: pagingProp,
  serverOps,
  rootMargin = '400px',
  skeletonCount = 3,
  skeletonVariant = 'card',
  // Ceiling on batches loaded by scrolling alone, after which the reader has to
  // ask. Two reasons, and either one is enough on its own:
  //
  //  - if the list's container never grows (rows rendered into an inner
  //    scroller, as DataTableNew does), the sentinel stays on screen and this
  //    is the only thing standing between a scroll and fetching all 45,000
  //    rows, 25 at a time, each request bigger than the last;
  //  - a list that never ends is worth a pause anyway.
  maxAutoBatches = 20,
  // Changing this starts the automatic batches over — the search term, so a new
  // search is not left with a spent budget from the previous one.
  resetKey,
  className,
}) {
  const { paging, enabled, busy, inHand, mayHaveMore } = usePagingProgress(pagingProp, serverOps);
  const [autoBatches, setAutoBatches] = useState(0);

  useEffect(() => { setAutoBatches(0); }, [resetKey]);

  const limit = Math.max(0, Math.floor(Number(maxAutoBatches) || 0));
  const autoExhausted = limit > 0 && autoBatches >= limit;

  const loadMore = paging?.loadMore;
  const onReachEnd = useCallback(() => {
    setAutoBatches((n) => n + 1);
    loadMore?.();
  }, [loadMore]);

  if (!enabled || typeof loadMore !== 'function') return null;

  return (
    <div className={className}>
      {busy && mayHaveMore ? (
        <LoadMoreSkeleton count={skeletonCount} variant={skeletonVariant} className="pt-1" />
      ) : null}

      {/* Out of automatic batches: hand the list back to the reader rather than
          leaving it looking finished when it is not. */}
      {autoExhausted && mayHaveMore && !busy ? (
        <div className="flex justify-center py-3">
          <button
            type="button"
            onClick={() => { setAutoBatches(0); loadMore(); }}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[11px] font-semibold text-slate-800 hover:bg-gray-50 sm:text-xs"
          >
            <i className="pi pi-plus text-[10px] text-gray-500" aria-hidden="true" />
            {`Load ${paging.loadMoreStep} more`}
          </button>
        </div>
      ) : null}

      <InfiniteScrollSentinel
        enabled={!autoExhausted}
        hasMore={mayHaveMore}
        busy={busy}
        progressKey={inHand}
        rootMargin={rootMargin}
        onReachEnd={onReachEnd}
      />
    </div>
  );
}
