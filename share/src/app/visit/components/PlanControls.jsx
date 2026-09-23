'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button, Field } from '@/design-system';
import FilterSortSidebar from '@/components/SmartDataTable/FilterSortSidebar';
import { PLAN_FILTER_DEFS, planChips, planFilterValues } from '../data/selectors';

/* The plan sheet's toolbar: a search box, a count and one sliders icon, over
 * a row of chips for whatever is applied.
 *
 * SEARCH IS OUT HERE, not in the panel. Finding one doctor is the commonest
 * question this sheet is asked, and behind a panel it costs four taps — open,
 * find the Doctor tab, type, tick, Apply — to do what a text box does while
 * you type. It runs over name AND code (see filterPlan), because the reader
 * remembers one and the ERP printout gives the other.
 *
 * SORT AND FILTER ARE ONE ICON. They are tabs of one panel — the app's own
 * FilterSortSidebar, reused rather than rebuilt even though this screen is
 * otherwise design-system and the sidebar is PrimeReact: a reader who has
 * filtered a report table already knows that panel, and a second filter UI
 * with the same job and different mechanics is a thing to learn for nothing.
 * One trigger rather than two, because two doors onto the same room is a
 * choice the reader has to make before finding out it did not matter.
 *
 * WHAT THE SIDEBAR ASKED OF THIS SCREEN, in exchange: every sortable field is
 * also a filter tab, since its sort pane is built from the same `filterDefs`.
 * That is why the visit-time tab lists HOURS rather than timestamps (see
 * PLAN_FIELD) — a filter nobody wants is worse than one merely unexpected.
 *
 * THE VALUES COME FROM MEMORY. `fetchFilterValues` is an async contract built
 * for a server that pages and searches remotely; the calls are already in
 * hand here, so it is answered synchronously and wrapped in a promise. The
 * contract is kept exactly — page, search, and `{ items, hasMore }` — because
 * the sidebar's infinite scroll reads `hasMore` to decide whether to ask
 * again, and a bare array would leave it asking forever. */

export function PlanControls({ calls, value, onChange, resultCount, totalCount }) {
  const [open, setOpen] = useState(false);

  /* Only the fields this plan can actually distinguish. A tab offering one
     HQ is a tab whose every state is the same list, and on a single rep's
     plan that is most of them. */
  const defs = useMemo(
    () => PLAN_FILTER_DEFS.filter(
      /* A sort-only def has no tab to be empty, and an order is worth
         offering even when every call shares a value — "earliest first" over
         one day is still a different list. */
      (d) => d.sortOnly || planFilterValues(calls, d.key, { pageLength: 2 }).length > 1,
    ),
    [calls],
  );

  const fetchFilterValues = useCallback(
    async (key, opts = {}) => {
      const items = planFilterValues(calls, key, opts);
      /* A full page means there may be another; a short one is the end. The
         sidebar stops asking on `hasMore: false`, so getting this wrong is an
         infinite scroll that never settles. */
      return { items, hasMore: items.length === (opts.pageLength ?? 50) };
    },
    [calls],
  );

  const sortCount = Object.keys(value.sorts ?? {}).length;
  const filterCount = Object.values(value.values ?? {}).filter((v) => v?.length).length;

  /* What is applied, spelled out. The trigger's badge says how many; only
     these say which, and only these can be undone without opening the panel
     again. */
  const chips = useMemo(() => planChips(calls, value), [calls, value]);

  const dropChip = (chip) => {
    if (chip.kind === 'sort') {
      const { [chip.key]: _, ...sorts } = value.sorts ?? {};
      onChange({ ...value, sorts });
      return;
    }
    const left = (value.values?.[chip.key] ?? []).filter((v) => v !== chip.value);
    onChange({ ...value, values: { ...value.values, [chip.key]: left } });
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Field
          size="sm"
          value={value.query ?? ''}
          onChange={(query) => onChange({ ...value, query })}
          placeholder="Search doctor or code…"
          aria-label="Search by doctor name or code"
          prefix={<i className="pi pi-search" />}
          /* Takes whatever the icon leaves. The icon is fixed width: a search
             box that grows a pixel when a badge appears is a toolbar that
             twitches. */
          className="min-w-0 flex-1"
        />

        {/* THE RECEIPT. Out here beside the controls rather than inside the
            panel: the reader is looking at the list, not at the control, when
            they want to know whether it did anything. Gone when nothing is
            filtered, so a toolbar over an untouched plan says nothing. */}
        {resultCount !== totalCount ? (
          <span className="shrink-0 text-10 text-ds-muted">
            {resultCount}/{totalCount}
          </span>
        ) : null}
        {/* ONE ICON FOR BOTH, because they are one panel: sort and filter are
            tabs of the same sidebar, and two triggers onto the same surface ask
            the reader to guess which door leads where. Sliders rather than a
            funnel — the funnel promises filtering alone.

            THE COUNT LIVES ON IT, because nothing else survives the panel
            closing: a filtered list otherwise reads as a short plan. */}
        <IconControl
          icon="pi-sliders-h"
          label="Sort & filter"
          count={sortCount + filterCount}
          onClick={() => setOpen(true)}
        />

        <FilterSortSidebar
          visible={open}
          onHide={() => setOpen(false)}
          filterDefs={defs}
          fetchFilterValues={fetchFilterValues}
          currentSortBy={value.sorts}
          currentFilterValues={value.values}
          onApply={(sorts, values) => {
            onChange({ ...value, sorts, values });
            setOpen(false);
          }}
          onClear={() => onChange({ ...value, sorts: {}, values: {} })}
        />
      </div>

      {/* BELOW THE ROW, not in it: the chips are as many as the reader has
          applied, and a row that grows sideways would squeeze the search box
          it sits beside. Scrolls rather than wraps, so a sheet with six
          filters on it does not push the list off the screen. */}
      {chips.length > 0 ? (
        <div className="ds-scroll-x flex items-center gap-1">
          {chips.map((chip) => (
            <button
              key={`${chip.kind}:${chip.key}:${chip.value ?? ''}`}
              type="button"
              onClick={() => dropChip(chip)}
              /* THE WHOLE CHIP IS THE DISMISS, not a 10px × inside it. There
                 is nothing else a chip could do here — it reports a filter it
                 cannot edit — and a tap target the width of the label is the
                 one that works with a thumb. */
              aria-label={`Remove ${chip.label}`}
              className="inline-flex max-w-[12rem] shrink-0 items-center gap-1 rounded-chip border border-line-subtle bg-sunken px-2 py-1 text-10 leading-none text-ds-secondary"
            >
              <span className="truncate">{chip.label}</span>
              <i className="pi pi-times" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

/* An icon button that can carry a count. The badge is absolutely positioned
   so it cannot change the button's size — see the note on the search box. */
function IconControl({ icon, label, count, onClick }) {
  return (
    <span className="relative shrink-0">
      <Button
        type="default"
        size="sm"
        aria-label={count > 0 ? `${label} · ${count} applied` : label}
        icon={<i className={`pi ${icon}`} />}
        onClick={onClick}
      />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-10 leading-none text-on-brand"
        >
          {count}
        </span>
      ) : null}
    </span>
  );
}
