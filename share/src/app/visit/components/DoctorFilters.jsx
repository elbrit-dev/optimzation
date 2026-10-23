'use client';

import { useEffect, useRef, useState } from 'react';
import { Drawer, Popover } from '@/design-system';

/* "Filter & sort" for the doctor-wise list — the Support report's doctor
 * filter, so the reader meets the same panel on both reports: a rail of
 * groups on the left, the active group's options as ticks with their counts
 * on the right, a search once a group runs past ten options, and Clear all /
 * Show N across the top. A Popover under the button on a desktop, a bottom
 * sheet on a phone.
 *
 * Controlled for the picks: `groups` carries every option with whether it is
 * on, and the caller owns the state, so the chips under the search box and
 * this panel can never disagree. Only which group is showing and its search
 * live here.
 *
 * groups: [{ id, title, single?, opts: [{ key, label, n, on }] }] */

const PANEL_W = 540;
const PANEL_H = 480;

/* A phone gets the bottom sheet. By the window rather than the report's
   container: the choice is about the overlay, which covers the window. */
function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}

/* GROUP BY, as one button beside Filters: it names the grouping that is on
   ("By: City") and opens a short menu of the three. Not inside Filters — it
   does not narrow the list, it changes what the list is made of — and not a
   segmented control across the card, which spent a whole row on a choice
   made once. A popover on every screen size: three options do not need a
   bottom sheet.

   options: [{ id, label }] */
export function GroupByMenu({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <Popover.Root open={open} onOpenChange={setOpen} backName="visit-doctor-group">
      <Popover.Trigger
        className={`flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-12 font-semibold transition-colors ${
          value !== options[0]?.id ? 'border-brand bg-brand-tint-weak text-brand-text' : 'border-line bg-surface text-heading hover:bg-brand-tint-weak'
        }`}
        aria-label={`Group doctors by ${current?.label}`}
      >
        <i className="pi pi-objects-column text-11" aria-hidden="true" />
        <span className="font-medium text-ds-secondary">By:</span>
        {current?.label}
        <i className="pi pi-chevron-down text-10" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6}>
          <Popover.Popup className="min-w-[180px] rounded-xl border border-line-subtle bg-surface p-1.5" style={{ boxShadow: '0 12px 32px rgba(16,24,40,.16)' }}>
            <div className="px-2.5 pb-1 pt-1.5 text-11 font-semibold uppercase tracking-wide text-ds-muted">Group by</div>
            <div role="radiogroup" aria-label="Group doctors by">
              {options.map((o) => {
                const on = o.id === value;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => { onChange(o.id); setOpen(false); }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-13 hover:bg-sunken ${
                      on ? 'font-semibold text-brand-text' : 'text-heading'
                    }`}
                  >
                    {o.label}
                    {on ? <i className="pi pi-check text-11" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function DoctorFilters({ groups, count, result, onToggle, onClearGroup, onClearAll }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(groups[0]?.id);
  const [q, setQ] = useState('');
  const phone = usePhone();
  const anchorRef = useRef(null);

  const active = groups.find((g) => g.id === tab) ?? groups[0];
  const picked = active ? active.opts.filter((o) => o.on).length : 0;
  const needle = q.trim().toLowerCase();
  const opts = active ? active.opts.filter((o) => !needle || o.label.toLowerCase().includes(needle)) : [];

  const panel = (
    <>
      <div className="flex flex-none items-center justify-between gap-2 border-b border-line-subtle py-3 pl-4 pr-3.5">
        <span className="text-14 font-semibold text-heading">Filter &amp; sort</span>
        <div className="flex gap-1.5">
          <button type="button" onClick={onClearAll} className="h-8 px-2.5 text-12 font-semibold text-danger">
            Clear all
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-8 whitespace-nowrap rounded-lg bg-heading px-3 text-12 font-semibold text-white"
          >
            Show {result}
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* The group rail */}
        <div className="flex w-[116px] flex-none flex-col gap-0.5 overflow-y-auto border-r border-line-subtle bg-sunken p-2 sm:w-[148px]">
          {groups.map((g) => {
            const on = g.id === active?.id;
            const badge = g.single ? '' : g.opts.filter((o) => o.on).length || '';
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => { setTab(g.id); setQ(''); }}
                className={`flex h-9 items-center justify-between gap-1.5 rounded-lg px-2.5 text-left text-13 ${
                  on ? 'bg-brand-tint-weak font-semibold text-brand-text' : 'font-medium text-body hover:bg-surface'
                }`}
              >
                <span className="truncate">{g.title}</span>
                {badge ? (
                  <span className="grid h-[18px] min-w-[18px] flex-none place-items-center rounded-full bg-brand px-1 text-10 font-bold text-white">
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {/* The active group's options */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-none items-center justify-between gap-2 px-3.5 pb-1.5 pt-2.5">
            <span className="text-11 font-semibold uppercase tracking-wide text-ds-muted">
              {active?.title}{active && !active.single ? ` · ${picked ? `${picked} selected` : 'any'}` : ''}
            </span>
            {active && !active.single && picked ? (
              <button type="button" onClick={() => onClearGroup(active.id)} className="h-6 px-1.5 text-12 font-semibold text-danger">
                Clear
              </button>
            ) : null}
          </div>
          {active && active.opts.length > 10 ? (
            <div className="flex-none px-3.5 pb-1.5">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${active.opts.length} ${active.title.toLowerCase()} options`}
                aria-label={`Search ${active.title}`}
                className="h-[34px] w-full rounded-lg border border-line px-2.5 text-13 text-heading outline-none focus:border-brand"
              />
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2.5 pt-0.5">
            {opts.map((o) => (
              <div
                key={o.key}
                role={active.single ? 'radio' : 'checkbox'}
                aria-checked={o.on}
                tabIndex={0}
                onClick={() => onToggle(active.id, o.key)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    onToggle(active.id, o.key);
                  }
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-sunken"
              >
                <span
                  className={`grid h-[18px] w-[18px] flex-none place-items-center border-[1.5px] text-11 leading-none text-white ${
                    active.single ? 'rounded-full' : 'rounded-[5px]'
                  } ${o.on ? 'border-brand bg-brand' : 'border-line bg-surface'}`}
                >
                  {o.on ? (active.single ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : '✓') : null}
                </span>
                <span className={`min-w-0 flex-1 truncate text-13 text-heading ${o.on ? 'font-semibold' : ''}`}>{o.label}</span>
                {o.n ? <span className="flex-none text-11 tabular-nums text-ds-muted">{o.n}</span> : null}
              </div>
            ))}
            {!opts.length ? <div className="px-2 py-4 text-13 text-ds-secondary">No matches.</div> : null}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="relative flex-none">
      <span ref={anchorRef} hidden />
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-12 font-semibold transition-colors ${
          count ? 'border-brand bg-brand-tint-weak text-brand-text' : 'border-line bg-surface text-heading hover:bg-brand-tint-weak'
        }`}
      >
        <i className="pi pi-filter text-11" aria-hidden="true" />
        Filters
        {count ? (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-10 font-bold text-white">{count}</span>
        ) : null}
      </button>

      {open && phone ? (
        <Drawer.Root open side="bottom" onOpenChange={(next) => { if (!next) setOpen(false); }} backName="visit-doctor-filters">
          <Drawer.Portal>
            <Drawer.Backdrop />
            <Drawer.Viewport>
              <Drawer.Popup className="flex flex-col overflow-hidden rounded-t-2xl bg-surface" style={{ height: '78vh', maxInlineSize: 'none' }}>
                {panel}
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
      ) : null}

      {open && !phone ? (
        <Popover.Root
          open
          backName="visit-doctor-filters"
          onOpenChange={(next, details) => {
            if (next) return;
            /* A press on the Filters button is its own toggle, not an
               outside press that should close and then reopen the panel. */
            const anchor = anchorRef.current?.parentElement;
            if (details?.reason === 'outside-press' && anchor?.contains(details.event?.target)) {
              details.cancel?.();
              return;
            }
            setOpen(false);
          }}
        >
          <Popover.Portal>
            <Popover.Positioner anchor={() => anchorRef.current?.parentElement ?? null} side="bottom" align="end" sideOffset={8}>
              <Popover.Popup
                className="flex flex-col overflow-hidden rounded-2xl border border-line-subtle bg-surface p-0"
                style={{
                  width: PANEL_W,
                  height: PANEL_H,
                  maxWidth: 'calc(100vw - 32px)',
                  maxHeight: 'min(70vh, var(--available-height))',
                  boxShadow: '0 16px 40px rgba(16,24,40,.18)',
                }}
              >
                {panel}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      ) : null}
    </div>
  );
}
