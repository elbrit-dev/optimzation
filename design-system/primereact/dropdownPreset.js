/* PrimeReact Dropdown — design-system PassThrough preset.
 *
 * Covers BOTH the nine standalone Dropdowns and the rows-per-page control a
 * Paginator renders, which is a Dropdown too — so per structural rule A in
 * docs/PRIMEREACT_SWEEP.md its styling lives here rather than being duplicated
 * in paginatorPreset.js. The paginator keeps only the size override that makes
 * its instance smaller than a standalone one.
 *
 * The panel is portalled to <body>, so it is outside the table/page containers
 * and can only be styled from here — there is no ancestor to hang a CSS rule
 * on, which is part of why the old override sheet needed a global
 * `.p-dropdown-panel` rule with a z-index.
 */
const cx = (...parts) => parts.filter(Boolean).join(' ');

/* `option` is the section PrimeReact actually calls (`ptm('option')`); `item`
   is only its class key. Both are declared so the preset keeps working
   whichever one a given PrimeReact patch resolves — they carry identical
   classes, and a section that is never called is inert rather than harmful. */
const OPTION = cx(
  'cursor-pointer px-4 py-2.5 text-14 text-body',
  'transition-colors',
  /* Hover and keyboard focus were `--elbrit-surface-mute`, a raw grey whose
     only semantic alias is `--surface-disabled` — a hover painted with the
     DISABLED surface. Uses the system's 4% blue wash instead, the same one the
     table rows and the nav use. */
  'hover:bg-brand-tint-weak',
  '[&[data-p-focused=true]]:bg-brand-tint-weak',
  // Selected: info wash + brand text, unchanged from the override sheet.
  '[&[data-p-highlight=true]]:bg-info-wash [&[data-p-highlight=true]]:text-brand-text',
  '[&[data-p-highlight=true][data-p-focused=true]]:bg-brand-tint',
  '[&[data-p-disabled=true]]:text-disabled [&[data-p-disabled=true]]:cursor-default',
);

export const dropdownPt = {
  root: {
    className: cx(
      /* NO `w-full`. lara's `.p-dropdown` sets no width either — it is a
         call-site decision, and the caller usually supplies one. Adding it here
         stretched the Paginator's rows-per-page control across the whole bar
         and wrapped the page links onto a second line. */
      'inline-flex items-center justify-between gap-2',
      'h-control rounded-md border border-line-subtle bg-surface px-3',
      'text-14 text-body transition-colors',
      'hover:border-brand-hover',
      '[&[data-p-disabled=true]]:bg-surface-disabled [&[data-p-disabled=true]]:text-disabled',
    ),
  },

  input: { className: 'flex-1 truncate text-left text-14 text-body' },
  trigger: { className: 'flex shrink-0 items-center text-muted' },
  dropdownIcon: { className: 'text-12' },
  clearIcon: { className: 'shrink-0 text-12 text-muted hover:text-body' },
  loadingIcon: { className: 'text-12 text-muted' },

  /* The hidden native <select> and the focus sentinels. lara hid these with
     `p-hidden-accessible`, which `unstyled` removes — landmine 1. Without a
     replacement they render as stray 1px artefacts, or worse a visible native
     select next to the styled control. */
  select: { className: 'sr-only' },
  hiddenSelectedMessage: { className: 'sr-only' },
  hiddenFirstFocusableEl: { className: 'sr-only' },
  hiddenLastFocusableEl: { className: 'sr-only' },

  /* Portalled to <body>. `z-1000` matches the override sheet's stacking, which
     was there so the panel clears the sticky app header. */
  panel: {
    className: 'z-1000 rounded-md border border-line-subtle bg-surface shadow-pop',
  },
  wrapper: { className: 'max-h-[500px] overflow-auto py-1' },
  list: { className: 'm-0 list-none p-0' },

  item: { className: OPTION },
  option: { className: OPTION },
  itemLabel: { className: 'block w-full min-w-0 truncate' },

  itemGroup: { className: 'px-4 py-2 text-12 font-semibold text-secondary' },
  itemGroupLabel: { className: 'block' },

  header: { className: 'border-b border-line-subtle p-2' },
  footer: { className: 'border-t border-line-subtle p-2' },
  emptyMessage: { className: 'px-4 py-2.5 text-14 text-secondary' },

  filterContainer: { className: 'relative' },
  filterInput: {
    className:
      'h-control w-full rounded-md border border-line-subtle bg-surface px-2 text-12 text-body hover:border-brand-hover',
  },
  filterIcon: { className: 'absolute right-2 top-1/2 -translate-y-1/2 text-12 text-muted' },
  filterClearIcon: { className: 'text-12 text-muted hover:text-body' },
};

export default dropdownPt;
