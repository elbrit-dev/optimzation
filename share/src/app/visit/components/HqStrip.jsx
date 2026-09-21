'use client';

import { useMemo, useState } from 'react';
import { Field, Icon } from '@/design-system';
import { HqCard } from './HqCard';
import { hqLabel } from '../data/format';

/* The HQ selector: a scrolling strip of compact cards, with a search box once
   there are enough of them to need one.
 *
 * The search sits on the SAME ROW as the section heading rather than above the
 * cards, which buys back the row it costs. The row wraps rather than switching
 * at a breakpoint: at 320px the heading and a 144px field do not fit, the field
 * drops to its own line, and no container query had to know about it.
 *
 * THE SEARCH IS ALWAYS THERE. It used to appear only past seven HQs, on the
 * reasoning that a search box over three cards is furniture. In practice a
 * manager's scope has three, so the control was never visible to the people
 * reviewing the screen and the long-list path went unseen — and a control that
 * appears and disappears depending on your team's size is harder to learn than
 * one that is simply always in the same place. It costs one 22px row.
 *
 * "All HQs" is pinned outside the filtered list. It is the way back to the
 * overview, and a search for "hyd" that hides the way back is a trap.
 *
 * Horizontal, not a wrapping grid: a grid orphans its last card at every item
 * count that is not a multiple of the column count, and the count here is data
 * — 2 for one manager, 97 for the company. A strip has no such arithmetic, and
 * it costs one row of height instead of four. */

export function HqStrip({ heading, hqRows, totals, activeHq, allKey, onSelect }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hqRows;
    return hqRows.filter((h) => hqLabel(h.hq).toLowerCase().includes(q));
  }, [hqRows, query]);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {heading}
        <div className="w-36 @2xl/report:w-56">
          <Field
            size="app"
            placeholder="Find an HQ..."
            value={query}
            onChange={setQuery}
            prefix={<Icon name="search" />}
            inputProps={{ 'aria-label': 'Find an HQ' }}
          />
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label="Headquarters"
        className="ds-scroll-x flex gap-2"
      >
        <HqCard
          label="All HQs"
          planned={totals.planned}
          happened={totals.happened}
          verified={totals.verified}
          force={totals.force}
          selected={activeHq === allKey}
          onSelect={() => onSelect(allKey)}
        />

        {filtered.map((h) => (
          <HqCard
            key={h.hq}
            label={h.hq}
            planned={h.planned}
            happened={h.happened}
            verified={h.verified}
            force={h.force}
            selected={activeHq === h.hq}
            onSelect={() => onSelect(h.hq)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-10 text-ds-muted">No HQ matches “{query.trim()}”.</p>
      ) : null}
    </div>
  );
}
