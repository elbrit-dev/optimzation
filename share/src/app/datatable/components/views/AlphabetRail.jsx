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

  // Track which section is in view so the active bubble follows the scroll.
  useEffect(() => {
    const container = getContainer();
    if (!container) return undefined;
    const sections = Array.from(container.querySelectorAll('[data-letter]'));
    if (sections.length === 0) return undefined;
    setActiveLetter((current) =>
      current && presentLetters.has(current) ? current : (sections[0]?.dataset?.letter ?? null),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.dataset?.letter) setActiveLetter(visible[0].target.dataset.letter);
      },
      { rootMargin: '-8% 0px -80% 0px', threshold: 0 },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // presentKey re-arms the observer when sections appear/disappear (filtering).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentKey, rows.length, getContainer]);

  const jumpTo = useCallback((letter) => {
    const el = getContainer()?.querySelector(`[data-letter="${letter}"]`);
    if (el) {
      setActiveLetter(letter);
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [getContainer]);

  return (
    <nav
      ref={railRef}
      aria-label="Jump to letter"
      className={`sticky top-2 flex h-fit shrink-0 flex-col items-center gap-0.5 self-start py-1 ${className ?? ''}`}
    >
      {ALPHABET.map((letter) => {
        const present = presentLetters.has(letter);
        const isActive = activeLetter === letter;
        return (
          <button
            key={letter}
            type="button"
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
