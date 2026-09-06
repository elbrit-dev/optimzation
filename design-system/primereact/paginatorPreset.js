/* PrimeReact Paginator — design-system PassThrough preset.
 *
 * Extracted from dataTablePreset.js, where these sections lived because a
 * DataTable renders a Paginator as a child and styles it through its own `pt`.
 * They are here now because there is also a STANDALONE <Paginator> — in
 * DataTableNew.jsx, outside any DataTable — and that one was still lara-themed.
 * It was also the largest remaining block in globals.css at 21 rules.
 *
 * Both cases use this one object:
 *   - nested   — dataTablePreset re-exports it under its `paginator` section,
 *                and `unstyled` propagates from the DataTable to its children.
 *   - standalone — registered globally in registry.js, with `unstyled` set at
 *                the call site.
 *
 * The `context` keys used below (`active`, `selected`) are the two that ARE
 * populated for this component; verified in the DOM, not assumed. See
 * docs/PRIMEREACT_SWEEP.md landmine 2 for why that matters.
 */
const cx = (...parts) => parts.filter(Boolean).join(' ');

/* The four first/prev/next/last buttons. The styled sheet hid first/last below
   640px; that stays a responsive concern for the call site, not the preset, so
   all four are styled here. */
const PAGER_NAV =
  'inline-flex h-control-sm aspect-square items-center justify-center rounded-full text-secondary ' +
  'transition-colors hover:bg-brand-tint-weak hover:text-brand-text disabled:text-disabled disabled:hover:bg-transparent';

export const paginatorPt = {
  root: { className: 'flex items-center justify-center gap-2 py-2 bg-surface' },

  firstPageButton: { className: PAGER_NAV },
  prevPageButton: { className: PAGER_NAV },
  nextPageButton: { className: PAGER_NAV },
  lastPageButton: { className: PAGER_NAV },

  /* The active page is a brand-filled circle — the one place the paginator
     carries the accent. */
  pageButton: ({ context }) => ({
    className: cx(
      'inline-flex h-control-sm min-w-control-sm items-center justify-center rounded-full px-1 text-12',
      'transition-colors',
      context?.active
        ? 'bg-brand-fill text-on-brand'
        : 'text-secondary hover:bg-brand-tint-weak hover:text-brand-text',
    ),
  }),

  /* The "out of N" / current-page report slot. */
  current: { className: 'text-12 text-secondary' },

  /* Rows-per-page select.
     The Dropdown's own styling comes from the global registry — it IS a
     Dropdown, so duplicating it here would apply the same classes twice
     (structural rule A in docs/PRIMEREACT_SWEEP.md). Only the size override
     stays: a paginator's control sits on the small scale, where a standalone
     Dropdown sits on the default one. */
  RPPDropdown: {
    root: { className: 'h-control-sm px-2 text-12' },
    input: { className: 'text-12' },
  },
};

export default paginatorPt;
