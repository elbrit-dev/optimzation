/* PrimeReact DataTable — design-system PassThrough preset.
 *
 * This is step one of replacing the CSS override sheet with owned styling.
 * `unstyled` stops PrimeReact emitting its own classes, so lara-light-cyan has
 * nothing to hook onto and cannot leak its cyan primary, its #f8f8fa zebra or
 * its gray-300 borders. Everything below is a design-system utility.
 *
 * WHY per-component rather than a global `unstyled: true`:
 *   `unstyled` is a prop on each PrimeReact component in v10, not only a
 *   provider flag. Flipping it globally would strip all 35 components netstar
 *   uses at once, with 8 visual baselines as the only cover. Per-component
 *   lets each one be migrated and diffed on its own.
 *
 * WHY not the shipped `primereact/passthrough/tailwind` preset:
 *   it covers 94 components, but its class strings are stock Tailwind
 *   (`bg-slate-50 text-slate-700 border-gray-300`) and `tailwind-strict.css`
 *   removes that palette — they would not compile. The section NAMES below
 *   were taken from it; the values are ours.
 *
 * SCOPE: every section the two DataTable call sites in this repo exercise.
 * SmartDataTable uses filterDisplay="row", a paginator, scrollable,
 * stripedRows, showGridlines, resizable/reorderable columns, row expansion and
 * headerColumnGroup. The legacy /datatable tree (DataTableNew.jsx, also used by
 * both graphql-playground TableViewers) adds `selectionMode` and
 * `editMode="cell"`, which is why the checkbox/radio and cell-editing sections
 * below exist.
 *
 * Still absent, because nothing renders them: the row-editor sections
 * (`rowEditorInitButton` and friends — no call site uses `rowEditor`) and the
 * filter-MENU sections (both call sites use `showFilterMenu={false}`).
 */

import { paginatorPt } from './paginatorPreset';
import { radioBoxClassName, selectInputClassName } from './checkboxPreset';

/* A pt section can be a string, an object, or a fn of { props, state, context }.
   Returning objects keeps room for `style` alongside `className`. */
const cx = (...parts) => parts.filter(Boolean).join(' ');

/* A NOTE ON `text-brand-text` vs `text-brand`, which recurs in every preset:
   `--brand-primary` (#0f87f9) is 3.2-3.6:1 as TEXT on any light surface in this
   system — below the 4.5:1 AA floor. `--brand-text` (#0958d9, 6.16:1) exists
   for exactly that and was going unused. `bg-brand` / `border-brand` /
   `ring-brand` keep the lighter value; only text takes the darker one. */

/* Table cell geometry comes from the SURFACE, not from a per-call-site prop.
   `px-cell` / `py-cell` read --table-cell-px/py, which [data-surface] resolves
   (field app 12px inline, console 16px; 8px block on both). `type-body-default`
   is the surface's body role, so cells are 12/20 in the app and 14/20 in the
   console without anyone choosing.

   WHY THIS REPLACED A `size` VARIANT. Padding used to be `px-4 py-2` for
   normal and `px-2 py-2` for small, selected by a `size` prop that PrimeReact
   does not pass down to nested column.* sections and so had to be threaded by
   hand at every call site. Two consequences, both observed:
     - the two table trees drifted to 8px and 16px against each other, each
       looking correct in isolation;
     - `size="large"` had no entry and fell back to normal SILENTLY, so a
       caller asking for large simply did not get it.
   A surface cannot drift from itself, and there is no fallback to be silent
   about. `size` is still accepted on the DataTable for PrimeReact's own
   internals; it no longer decides padding. */
const CELL = 'px-cell py-cell type-cell';

/* `type-cell`, not `type-body-default`: the latter is a `font:` shorthand and
   resets font-variant-numeric, silently un-aligning every figure in every
   table. base.css sets tabular-nums on :where(td, th) but is out-ranked by the
   utilities layer. See the note on @utility type-cell in tailwind.css — the
   obvious fix of adding `tabular-nums` alongside does NOT work. */

/* A frozen cell's `position: sticky` came from lara's `.p-frozen-column`, so
   unstyled mode silently broke the Lock-first-column toolbar toggle — the
   column scrolled away with the rest of the table. Verified by computed style:
   styled gave `position: sticky; left: 0; background: white; z-index: 1`,
   unstyled gave `position: static`.

   PrimeReact still sets `left` inline, so only the sticky/paint/stacking part
   is needed here. The background must be OPAQUE or the scrolled-under rows
   show through — lara used plain white for both header and body, and matching
   that keeps the frozen column's zebra behaviour identical. */
const FROZEN = 'sticky z-10 bg-surface';

/* Still a factory, though it currently takes nothing: the pt tree is built once
   per size-independent config and callers already spread the result. Keeping the
   function boundary means adding a future option does not change every call
   site back from a constant. */
export function makeDataTablePt() {
  return {
  root: { className: 'relative w-full rounded-lg' },

  // The scroll container. Overflow lives here so the sticky header works.
  wrapper: { className: 'relative overflow-auto' },

  /* NOT `table-fixed`. lara leaves table-layout at `auto`, so column widths
     are content-driven; forcing `fixed` made every column exactly equal and
     shifted the whole grid, which showed up as an 8-10% pixel diff against the
     styled baselines even though every colour and font was already correct. */
  table: { className: 'w-full border-collapse' },

  /* The filter row is the SECOND row of thead, and `headerCell` cannot tell
     the two apart — PrimeReact renders both through that one section. So the
     filter row's own geometry is applied from here with a child variant. The
     styled sheet had a dedicated `thead > tr:nth-child(2) > th` rule at
     12px 16px with a 1px bottom border; without it the filter row came out
     8px short and shifted every body row up. */
  thead: {
    className: cx(
      'sticky top-0 z-10',
      '[&>tr:nth-child(2)>th]:py-3',
      '[&>tr:nth-child(2)>th]:border-b',
      '[&>tr:nth-child(2)>th]:bg-surface-disabled',
    ),
  },

  headerRow: { className: 'bg-table-head' },

  tbody: { className: 'bg-surface' },

  tfoot: { className: 'bg-table-head' },

  footerRow: { className: 'bg-table-head' },

  /* Zebra is --surface-row-alt, the only tinted surface in the system. lara
     shipped #f8f8fa here, a neutral grey, which read as correct by eye and
     wrong under a computed-style check. */
  bodyRow: ({ context }) => ({
    className: cx(
      context?.stripedRows && context?.index % 2 !== 0 ? 'bg-row-alt' : 'bg-surface',
      /* Hover is a 4% blue wash, not a grey step. */
      'hover:bg-brand-tint-weak',
      /* Selected rows take the brand tint AND the brand TEXT colour. The
         styled sheet set `color: var(--brand-primary-active)` alongside the
         background and only the background had been reproduced, so a selected
         row lost its text treatment. `text-brand-text` is the AA-passing alias
         for that same value (6.16:1), not a second opinion on the colour.

         Driven off `data-p-highlight` rather than `context.selected`, which is
         not populated for this section — the first version rendered no
         selection at all while rows really were selected. Data attributes
         survive `unstyled` where classes do not, so this is the same signal
         the selection checkbox and the editing cell use.

         Marked important so selection beats the hover rule above, reproducing
         the styled sheet's `tr:not(.p-highlight):hover`. Without it, hovering a
         selected row washed the tint back out to the weaker hover tint and the
         selection appeared to flicker off. A `not-*` variant on the hover would
         express it more directly but would stop applying on tables that have no
         selection at all, where PrimeReact omits the attribute entirely. */
      'data-[p-highlight=true]:bg-brand-tint! data-[p-highlight=true]:text-brand-text',
    ),
  }),

  emptyMessage: { className: 'bg-surface' },

  /* A flat translucent scrim — the system has no glass surfaces, and blur over
     a virtualised table is expensive. */
  loadingOverlay: {
    className: 'absolute inset-0 z-50 flex items-center justify-center bg-surface/70',
  },
  loadingIcon: { className: 'text-20 text-brand-text' },

  /* The paginator is its own component, so its sections nest here. Geometry
     matches the control scale; the active page is a brand-filled circle,
     which is the one place the paginator carries the accent. */
  /* The paginator is its own component. Its sections live in
     paginatorPreset.js because there is also a STANDALONE <Paginator> in the
     legacy tree that needs the identical treatment — keeping two copies is how
     the two drift. `unstyled` propagates from the DataTable to the Paginator it
     renders, so nothing else is needed here. */
  paginator: paginatorPt,

  rowExpansion: { className: 'bg-sunken' },

  rowGroupHeader: { className: 'bg-table-head type-table-head text-body' },
  rowGroupHeaderName: { className: 'px-4 py-2' },
  rowGroupFooter: { className: 'bg-table-head type-table-head text-body' },
  rowGroupToggler: {
    className:
      'inline-flex h-control-sm aspect-square items-center justify-center rounded-sm text-ds-secondary hover:bg-brand-tint-weak hover:text-brand-text',
  },
  rowGroupTogglerIcon: { className: 'text-12' },

  /* Column resize affordances. Brand blue because they are interactive. */
  resizeHelper: { className: 'absolute hidden w-px bg-brand z-10' },
  reorderIndicatorUp: { className: 'absolute hidden text-brand-text' },
  reorderIndicatorDown: { className: 'absolute hidden text-brand-text' },

  column: {
    /* Header cells carry the role shorthand, which sets family, size, weight
       and line-height in one declaration. That is what stops GraphiQL's
       app-wide `"Inter var"` rule winning on table headers. */
    headerCell: ({ props, context }) => ({
      className: cx(
        CELL,
        // `relative` is required: the columnResizer below is absolutely
        // positioned, and without a positioned ancestor it resolved against
        // the table instead — measured at 94.5px tall, an invisible 8px-wide
        // handle covering the entire header and swallowing header clicks.
        'relative type-table-head text-body text-left align-middle whitespace-nowrap',
        /* Ant Design table geometry: a single 1px rule under the header, and
           NO vertical gridlines. Ant separates header cells with a short
           centred hairline instead of a full-height border — 1.6em so it
           tracks the surface's font size rather than pinning to one density.
           `last:before:hidden` keeps it off the trailing edge. */
        'border-b border-line-subtle bg-table-head',
        'before:absolute before:right-0 before:top-1/2 before:-translate-y-1/2',
        'before:h-[1.6em] before:w-px before:bg-line-subtle last:before:hidden',
        context?.sorted && 'text-brand-text',
        context?.sortable && 'cursor-pointer select-none hover:bg-brand-tint-weak',
        (props?.frozen || context?.frozen) && FROZEN,
      ),
    }),

    headerContent: { className: 'flex items-center justify-between gap-2 w-full' },

    bodyCell: ({ props, context }) => ({
      className: cx(
        CELL,
        'text-body align-middle',
        /* Horizontal dividers only, which is Ant's default. Vertical rules are
           opt-IN via showGridlines (Ant calls it `bordered`) — previously they
           were opt-OUT (`!== false`), so every table that simply omitted the
           prop rendered a full grid. */
        'border-b border-line-subtle',
        props?.showGridlines === true && 'border-r border-line-subtle last:border-r-0',
        (props?.frozen || context?.frozen) && FROZEN,
        /* `editMode="cell"` — used by the legacy /datatable tree, not by
           SmartDataTable. lara dropped the cell's padding to 0 while editing so
           the editor input could fill it; without that the input sat inside the
           cell's 8/16 padding and the row jumped taller the moment a cell was
           focused. The ring marks which cell is live.

           Driven off `data-p-cell-editing`, not a pt context key: `context`
           does carry an `editing` flag elsewhere in the DataTable, but not on
           this section — `context.editing` read as undefined here and the
           branch never fired. The attribute is on the cell in both styled and
           unstyled mode (PrimeReact strips its CLASSES when unstyled, not its
           data attributes), which makes it the more reliable signal. */
        'data-[p-cell-editing=true]:p-0',
        'data-[p-cell-editing=true]:ring-1 data-[p-cell-editing=true]:ring-inset',
        'data-[p-cell-editing=true]:ring-brand',
      ),
    }),

    footerCell: {
      className: cx(CELL, 'type-table-head text-body border-t border-line-subtle'),
    },

    /* `text-body` (0.88). Went 0.45 -> 0.65 -> 0.88 across two reports: the
       glyph is a pair of thin 16px arrows, and stroke weight matters as much
       as alpha here — at 0.65 a hairline arrow still reads as absent next to
       a solid 12px label, even though 0.65 is legible for TEXT.

       Do not "restore the hierarchy" by lowering this again. Ant can keep its
       sorter at 0.29 because it draws two filled carets that read as a control
       at any alpha; this is a stroked outline icon and does not. */
    sortIcon: { className: 'ml-2 shrink-0 text-12 text-body' },

    /* Multi-sort order badge. A brand tint with brand text, matching the
       count badges in SmartTableToolbar. */
    sortBadge: {
      className:
        'ml-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-10 font-bold text-brand-text leading-none',
    },

    /* filterDisplay="row" — the filter row sits under the header. */
    /* `[&_input]` sizes the filter field from here because the styled sheet
       did it with `.p-datatable .p-column-filter-row .p-inputtext`, and
       unstyled mode removes the `.p-column-filter-row` wrapper that selector
       depends on. Measured: the input was rendering at 42px against the 32px
       control height. */
    columnFilter: {
      className: 'flex w-full items-center gap-1 [&_input]:h-control [&_input]:w-full [&_input]:text-12',
    },

    /* The override sheet hid these two entirely
       (`.p-column-filter-clear-button.p-hidden-space { display: none }` and the
       menu button), so unstyled mode surfaced funnel icons that had never been
       visible. Kept hidden to preserve the current design; style them instead
       if the affordance is wanted. */
    filterMenuButton: { className: 'hidden' },
    headerFilterClearButton: { className: 'hidden' },

    /* `editMode="cell"` renders a 1x1 input for keyboard focus management.
       PrimeReact hides it with its own base CSS; `sr-only` means our sheet
       hides it too, so it cannot become a visible artefact if that base CSS is
       ever dropped. */
    editorKeyHelper: { className: 'sr-only' },
    editorKeyHelperLabel: { className: 'sr-only' },

    /* Row selection. Used by the legacy tree, which passes
       `selectionMode="checkbox"` on its nested tables and `"single"` on the
       main one. `single` needs no control at all — it is the selected-row
       treatment in `bodyRow` above — so only the checkbox/radio controls are
       here. The box geometry is `--control-h-sm` (24px), matching what the
       styled sheet gave the boolean filter's tri-state box, so a selection
       column and a filter column line up. */
    /* headerCheckbox and rowCheckbox are NOT styled here.
       They are Checkbox components (`data-pc-name="checkbox"`), so the global
       registry entry already reaches them; a copy here would apply the same
       classes a second time to the same element. Their test hooks still live
       in dataTableHooks.js, because those name TABLE parts (`row-checkbox`),
       not checkbox parts.

       rowRadioButton stays, because it is not a Checkbox — it is the same
       control with a round corner and a dot, and nothing else in the app
       renders one, so it has no registry entry of its own. */
    rowRadioButton: {
      input: { className: selectInputClassName },
      box: { className: radioBoxClassName },
      icon: { className: 'h-1.5 w-1.5 rounded-full bg-on-brand' },
    },

    /* Row-expansion toggler.
       This section was missing, and it was the single largest visual
       regression in the unstyled render: lara sized this button at 2rem, and
       because it is the tallest thing in the first cell it SET THE ROW HEIGHT.
       Without it every row collapsed from 49px to 37px — 8-10% of pixels
       across all six baselines, which is how it was caught.

       32px (`h-control`) reproduces lara exactly, so the migration stays a
       re-platforming with no visual change. Note the design system's own scale
       for this would be `h-control-sm` (24px — space.css names "row actions"
       as its use case), giving a 41px row. That is a deliberate restyling
       decision, not a migration one, so it is deliberately NOT taken here. */
    /* ALWAYS VISIBLE AT REST. This used to be a `text-ds-secondary` (0.65) chevron
       that only gained colour and a tinted background on hover, so it read as
       "the expander appears on hover" — which is how it was reported.

       The fix is CONTRAST, not a box. An Ant-style bordered button was tried
       first and rejected: a 1px box in every row of a dense grid is visual
       noise the table does not need, and Frappe's own expander is a bare
       chevron. `text-body` (0.88) is dark enough to read at rest on its own;
       the hover tint then reads as feedback rather than as the control
       arriving.

       `h-control-default` rather than a fixed `h-control`: it follows
       [data-surface] like every other control (22px field app, 32px console).
       At a fixed 32px it was taller than the row's 20px text line and drove
       the row height on the app surface. */
    rowToggler: {
      className:
        'inline-flex h-control-default aspect-square items-center justify-center rounded-sm ' +
        'text-body transition-colors hover:bg-brand-tint-weak hover:text-brand-text',
    },
    rowTogglerIcon: { className: 'text-12' },

    columnResizer: {
      className: 'absolute right-0 top-0 h-full w-2 cursor-col-resize',
      },
    },
  };
}

/* The normal-size preset, kept as a named export because it is what the
   design-system specimen page and the preset's own unit tests read. */
export const dataTablePt = makeDataTablePt();

export default dataTablePt;
