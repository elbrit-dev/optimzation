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
 * Because `after` + `filter` throws on this ERP (see ViewPaginator), a step
 * re-fetches rows 1..N rather than appending a page. Rows already on screen
 * stay there while it runs (the engine only replaces processedData on success),
 * so the list does not blank — but each step costs more than the last, which is
 * what `pageStep` is for.
 *
 * ## Why this listens for scrolls instead of watching a sentinel
 *
 * The obvious build is a 1px probe after the list plus an IntersectionObserver.
 * It does not work here, because there is no single element whose visibility
 * means "the reader is at the end":
 *
 * - the cards view scrolls the PAGE (or an ancestor), so a probe after the list
 *   works;
 * - `DataTableNew` renders `scrollable` with its own `scrollHeight`, so its rows
 *   scroll INSIDE `.p-datatable-wrapper`. A probe after the table never moves —
 *   it is either permanently visible (loads everything at once) or permanently
 *   off screen (loads nothing), and which one you get depends on layout.
 *
 * So instead: one capture-phase `scroll` listener, and whatever element reports
 * the scroll is measured. Scroll events do not bubble, but capture still sees
 * them, which is how the letter rail tracks nested scrolling too. That covers
 * the page, any scrolling ancestor, and the table's own box without having to
 * know which one is in play.
 */

/** '400px' | '400' | 400 -> 400. Anything unparseable falls back to 400. */
function toPixels(value, fallback = 400) {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** How far the element still has to scroll before its content ends. */
function distanceToBottom(element) {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

/** Ignore horizontal-only scrollers: their distance-to-bottom is always 0. */
function scrollsVertically(element) {
  return element.scrollHeight > element.clientHeight + 1;
}

/** Treat this as "pinned to the very bottom", where no further scroll is possible. */
const AT_BOTTOM_PX = 8;

/**
 * Calls `onReachEnd` when a scroll brings the end of the list within
 * `rootMargin` — at most once per `progressKey`, and at most once per scroll.
 *
 * `progressKey` is the row count in hand: it is what makes a batch a batch.
 *
 * A batch also costs distance: `scrollDistancePerBatch` pixels of DOWNWARD
 * scrolling since the last one, defaulting to half the visible height of
 * whatever is doing the scrolling. Scrolling back up to re-read something does
 * not count towards it.
 *
 * That rate limit is not decoration. "The end is in view, so load" on its own
 * over-fires badly whenever the container does not grow with the rows —
 * measured in a headless browser at 19 batches off a single scroll, and 2
 * before the reader had scrolled at all.
 *
 * Distance rather than a count of scroll events or gestures, for two reasons.
 * One flick emits events for as long as its momentum runs, so "one event" is
 * satisfied within a frame and means nothing; and grouping events into gestures
 * only moves the problem, because a gesture is not a fixed amount of reading.
 * Pixels are, and they are what the caller can reason about: "let them get
 * through about a screen before fetching again".
 *
 * `loadTrigger` decides what the distance means:
 *
 * - `'near-end'` (default) fetches as the END of the list comes within
 *   `rootMargin`, and the distance is only a floor between batches. Measured, it
 *   rarely binds there — reaching the end means reaching the bottom, where it is
 *   waived — because the list paces itself: a batch pushes the end away by
 *   whatever it added.
 * - `'distance'` drops the proximity test, so the distance IS the trigger:
 *   every N pixels of reading, fetch the next batch. Steady prefetch, and it
 *   will outrun a reader if N is smaller than the height a batch adds
 *   (`pageStep` x row height). Measured over 12 one-screen flicks with 20-row
 *   batches of 80px rows: 500px loaded 14 batches for 12 screens of reading,
 *   1500px loaded 4.
 */
export function EndOfListDetector({
  enabled = true,
  hasMore = false,
  busy = false,
  progressKey = 0,
  rootMargin = '400px',
  loadTrigger = 'near-end',
  scrollDistancePerBatch = 0,
  onReachEnd,
}) {
  const anchorRef = useRef(null);
  const onReachEndRef = useRef(onReachEnd);
  onReachEndRef.current = onReachEnd;
  const askedForRef = useRef(null);
  // Pixels scrolled DOWN since the last batch, and the position each measured
  // scroller was last seen at (a page and an inner box can both report).
  const travelledRef = useRef(0);
  const lastTopRef = useRef(new WeakMap());

  useEffect(() => {
    if (!enabled || !hasMore || busy) return undefined;
    const anchor = anchorRef.current;
    if (!anchor || typeof document === 'undefined') return undefined;

    // The box holding the list: children + this anchor. A scroll counts when it
    // comes from inside that box (the table's own wrapper) or from something
    // containing it (the page, a scrolling ancestor) — never from an unrelated
    // scroller elsewhere on the page.
    const container = anchor.parentElement ?? anchor;
    const margin = toPixels(rootMargin);
    let frame = 0;

    const ask = () => {
      if (askedForRef.current === progressKey) return;
      askedForRef.current = progressKey;
      travelledRef.current = 0;
      onReachEndRef.current?.();
    };

    // Minimum distance between batches. Unset means half the visible height of
    // whatever is scrolling, which is the same rule on a phone and a desktop
    // without anyone having to pick a number per screen size.
    const requiredTravel = (element) => {
      const explicit = Math.max(0, Math.floor(Number(scrollDistancePerBatch) || 0));
      return explicit > 0 ? explicit : Math.round(element.clientHeight / 2);
    };

    const measure = (element) => {
      if (!element || !scrollsVertically(element)) return;
      const remaining = distanceToBottom(element);
      // 'near-end' waits until the end of the list is within rootMargin.
      // 'distance' drops that and fetches purely on how far has been scrolled,
      // which is a steady prefetch rather than a top-up at the end.
      if (loadTrigger !== 'distance' && remaining > margin) return;
      // Both modes waive the distance at the very bottom: no more can be
      // travelled there, and holding out for it would strand the reader on the
      // last row with more data available.
      if (travelledRef.current < requiredTravel(element) && remaining > AT_BOTTOM_PX) return;
      ask();
    };

    const onScroll = (event) => {
      const node = event.target;
      const element = (node === document || node === window || node === document.documentElement)
        ? document.scrollingElement
        : node;
      if (!(element instanceof Element)) return;
      if (!container.contains(element) && !element.contains(container)) return;

      // Downward travel only: scrolling back up to re-read something should not
      // count towards the next batch.
      const top = element.scrollTop;
      const previous = lastTopRef.current.get(element);
      if (typeof previous === 'number' && top > previous) {
        travelledRef.current += top - previous;
      }
      lastTopRef.current.set(element, top);

      // Measured on the next frame, so a flick costs one measurement per frame
      // rather than one per event.
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; measure(element); });
    };

    // Checked on mount and after each batch lands, because a list that does not
    // fill its container has nothing to scroll and would otherwise never start.
    const initial = container.querySelector('[data-pc-section="wrapper"], .p-datatable-wrapper')
      ?? container;
    const initialScroller = scrollsVertically(initial)
      ? initial
      : (document.scrollingElement ?? initial);
    if (!scrollsVertically(initialScroller)) {
      // Nothing on the page can scroll yet: the rows do not fill the screen.
      // Fill it — capped by maxAutoBatches, and self-limiting once it scrolls.
      ask();
    } else {
      measure(initialScroller);
    }

    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled, hasMore, busy, progressKey, rootMargin, loadTrigger, scrollDistancePerBatch]);

  // Always rendered, even when there is nothing left to load: it is how the
  // effect finds the list's container, and removing it would tear down and
  // rebuild that lookup every time the list reaches its end.
  return <span ref={anchorRef} aria-hidden="true" />;
}

const SKELETON_SHELL = 'animate-pulse rounded-xl bg-gray-100';

/**
 * Placeholder rows shown while a scroll-triggered batch is in flight.
 *
 * The point is the reader who got to the bottom faster than the network: they
 * should see that something is coming, rather than an apparently finished list.
 * `aria-hidden` behind one live status, so a screen reader hears "Loading more"
 * once instead of reading out empty boxes.
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
 * Detector + skeletons, rendered as the last thing inside the list's container.
 */
export function InfiniteScrollLoader({
  paging: pagingProp,
  serverOps,
  rootMargin = '400px',
  loadTrigger = 'near-end',
  // Minimum downward scrolling between batches, in pixels. 0 = half the visible
  // height of whatever is scrolling.
  scrollDistancePerBatch = 0,
  skeletonCount = 3,
  skeletonVariant = 'card',
  // Ceiling on batches loaded by scrolling alone, after which the reader asks
  // once to continue. A list that never ends is worth a pause, and this is the
  // backstop if the one-per-scroll rule is ever defeated by a layout.
  maxAutoBatches = 20,
  // Changing this starts the budget over — the search term, so a new search is
  // not left with a spent budget from the previous one.
  resetKey,
  className,
}) {
  const {
    paging, enabled, busy, inHand, mayHaveMore, pagination, updatePagination,
  } = usePagingProgress(pagingProp, serverOps);
  const [autoBatches, setAutoBatches] = useState(0);

  useEffect(() => { setAutoBatches(0); }, [resetKey]);

  // Keep the visible window equal to everything fetched.
  //
  // DataTableNew renders `paginatedData` — sortedData.slice(first, first + rows)
  // — and `rows` defaults to 10. Without this, scroll-loading would fetch more
  // rows and show none of them: they would pile up as extra pages behind the
  // table's own paginator instead of extending the list being scrolled. Only
  // scroll modes run this (the loader is not rendered for 'button'), because
  // that is where the list is meant to read as one continuous run.
  const windowRows = pagination?.rows;
  const windowFirst = pagination?.first;
  useEffect(() => {
    if (!enabled || typeof updatePagination !== 'function') return;
    const want = Math.max(inHand, Number(paging?.fetchSize) || 0);
    if (want <= 0) return;
    if (windowFirst === 0 && windowRows >= want) return;
    updatePagination(0, want);
  }, [enabled, updatePagination, inHand, paging?.fetchSize, windowFirst, windowRows]);

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

      <EndOfListDetector
        enabled={!autoExhausted}
        hasMore={mayHaveMore}
        busy={busy}
        progressKey={inHand}
        rootMargin={rootMargin}
        loadTrigger={loadTrigger}
        scrollDistancePerBatch={scrollDistancePerBatch}
        onReachEnd={onReachEnd}
      />
    </div>
  );
}
