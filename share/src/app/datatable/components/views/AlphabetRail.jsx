'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTableOperations } from '../../contexts/TableOperationsContext';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Read a field whether the row is flattened ("brand__name") or nested
 * ({ brand: { name } }), tolerating a scalar Link value at the parent.
 */
function readField(row, key) {
  if (!row || !key) return undefined;
  if (row[key] != null) return row[key];
  const parts = String(key).includes('__') ? String(key).split('__') : String(key).split('.');
  let cursor = row;
  for (const part of parts) {
    if (cursor == null) return undefined;
    if (typeof cursor !== 'object') return cursor;
    cursor = cursor[part];
  }
  return cursor;
}

/**
 * The A–Z jump rail, owned by the provider (toggled via DataProviderViews'
 * showLetterRail prop) rather than any one card component.
 *
 * Present letters come from the provider's own pipeline data (`field` names the
 * column, e.g. "brand__name") so search/filter dim letters live. With no field,
 * it falls back to scanning rendered [data-letter] sections.
 *
 * Jumping is decoupled from the slot content by a DOM contract: clicking "A"
 * scrolls to the closest element with data-letter="A" inside the provider's
 * content area. ProductCatalogCards renders those targets; any custom Studio
 * layout can too — give each section a data-letter attribute and the rail works.
 */
export default function AlphabetRail({ field, className }) {
  const { sortedData, rawData } = useTableOperations();
  const rows = useMemo(() => {
    if (Array.isArray(sortedData) && sortedData.length > 0) return sortedData;
    return Array.isArray(rawData) ? rawData : [];
  }, [sortedData, rawData]);

  const railRef = useRef(null);
  const [domLetters, setDomLetters] = useState(null);
  const [activeLetter, setActiveLetter] = useState(null);

  // The rail's parent is the provider's content row — sections live in its sibling.
  const getContainer = useCallback(() => railRef.current?.parentElement ?? null, []);

  const dataLetters = useMemo(() => {
    if (!field) return null;
    const present = new Set();
    rows.forEach((row) => {
      const first = String(readField(row, field) ?? '').trim().charAt(0).toUpperCase();
      if (/[A-Z]/.test(first)) present.add(first);
    });
    return present;
  }, [rows, field]);

  // Fallback when no field is configured: learn the letters from whatever
  // [data-letter] sections the slot content actually rendered.
  useEffect(() => {
    if (field) return undefined;
    const container = getContainer();
    if (!container) return undefined;
    const collect = () => {
      const present = new Set();
      container.querySelectorAll('[data-letter]').forEach((el) => {
        if (el.dataset.letter) present.add(el.dataset.letter);
      });
      setDomLetters((prev) => {
        if (prev && prev.size === present.size && [...present].every((l) => prev.has(l))) return prev;
        return present;
      });
    };
    collect();
    const observer = new MutationObserver(collect);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [field, getContainer]);

  const presentLetters = useMemo(() => dataLetters ?? domLetters ?? new Set(), [dataLetters, domLetters]);
  const presentKey = useMemo(() => [...presentLetters].sort().join(''), [presentLetters]);

  // Track which section sits under the probe line (20% down the viewport) so the
  // active bubble follows the scroll. A rAF-throttled scroll listener that
  // re-queries [data-letter] sections each frame is deterministic where
  // IntersectionObserver is not: it keeps working with very tall sections,
  // several sections per letter, and sections that mount after the rail.
  useEffect(() => {
    let frame = null;
    const updateActive = () => {
      frame = null;
      const container = getContainer();
      if (!container) return;
      const sections = container.querySelectorAll('[data-letter]');
      if (sections.length === 0) return;
      const probeY = window.innerHeight * 0.2;
      // The section spanning the probe line owns it…
      let current = null;
      for (const el of sections) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= probeY && rect.bottom > probeY) {
          current = el.dataset.letter;
          break;
        }
      }
      // …otherwise the nearest section top above it (or the first section).
      if (current == null) {
        let bestTop = -Infinity;
        for (const el of sections) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= probeY && rect.top > bestTop) {
            bestTop = rect.top;
            current = el.dataset.letter;
          }
        }
        if (current == null) current = sections[0].dataset.letter;
      }
      if (current) setActiveLetter((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (frame == null) frame = window.requestAnimationFrame(updateActive);
    };
    updateActive();
    // Capture phase catches scrolls of nested containers, not just the window.
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
      if (frame != null) window.cancelAnimationFrame(frame);
    };
    // presentKey / rows re-run the initial compute when the data set changes.
  }, [getContainer, presentKey, rows.length]);

  const jumpTo = useCallback((letter, behavior = 'smooth') => {
    const el = getContainer()?.querySelector(`[data-letter="${letter}"]`);
    if (el) {
      setActiveLetter(letter);
      el.scrollIntoView({ behavior, block: 'start' });
    }
  }, [getContainer]);

  // --- Scrubbing: drag along the rail (touch or mouse) and the list follows, ---
  // --- iOS-contacts style. Taps keep working through the buttons' onClick.   ---
  const [scrub, setScrub] = useState(null); // { letter, top } while a drag is active
  const scrubbingRef = useRef(false);
  const lastScrubLetterRef = useRef(null);

  const moveScrub = useCallback((e) => {
    if (!scrubbingRef.current) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const letter = hit?.closest?.('[data-rail-letter]')?.dataset?.railLetter ?? null;
    if (!letter) return;
    const railBox = railRef.current?.getBoundingClientRect();
    setScrub({ letter, top: railBox ? e.clientY - railBox.top : 0 });
    if (!presentLetters.has(letter)) return;
    if (lastScrubLetterRef.current === letter) return;
    lastScrubLetterRef.current = letter;
    // Instant jumps while dragging — smooth scrolling can't keep up with the finger.
    jumpTo(letter, 'auto');
  }, [presentLetters, jumpTo]);

  const startScrub = useCallback((e) => {
    scrubbingRef.current = true;
    try { railRef.current?.setPointerCapture?.(e.pointerId); } catch { /* older browsers */ }
    moveScrub(e);
  }, [moveScrub]);

  const endScrub = useCallback(() => {
    scrubbingRef.current = false;
    lastScrubLetterRef.current = null;
    setScrub(null);
  }, []);

  return (
    <nav
      ref={railRef}
      aria-label="Jump to letter"
      onPointerDown={startScrub}
      onPointerMove={moveScrub}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
      // touch-action none stops the page from panning while the finger rides the rail.
      style={{ touchAction: 'none' }}
      className={`relative sticky top-2 flex h-fit shrink-0 select-none flex-col items-center gap-0.5 self-start py-1 ${className ?? ''}`}
    >
      {scrub ? (
        <div
          className="pointer-events-none absolute right-full mr-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-800/90 text-base font-bold text-white shadow-lg"
          style={{ top: scrub.top }}
          aria-hidden="true"
        >
          {scrub.letter}
        </div>
      ) : null}
      {ALPHABET.map((letter) => {
        const present = presentLetters.has(letter);
        const isActive = activeLetter === letter;
        return (
          <button
            key={letter}
            type="button"
            data-rail-letter={letter}
            disabled={!present}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => jumpTo(letter)}
            className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none transition-colors ${
              isActive
                ? 'bg-red-600 text-white'
                : present
                  ? 'text-slate-500 hover:text-slate-800'
                  : 'cursor-default text-gray-200'
            }`}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}
