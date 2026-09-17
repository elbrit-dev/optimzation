/* PrimeReact DataTable — stable test hooks.
 *
 * WHY THIS FILE EXISTS, SEPARATELY FROM dataTablePreset.js:
 *   The e2e suite used to select on PrimeReact's own class names
 *   (`.p-datatable-tbody`, `.p-frozen-column`, `.p-column-title`, ...). Those
 *   classes are exactly what `unstyled` deletes, so the suite and the styling
 *   migration were deadlocked: turning `unstyled` on broke 75 e2e tests, and
 *   the tests could not be fixed without something stable to select on.
 *
 *   PassThrough is the way out, because `pt` is INDEPENDENT of `unstyled`:
 *   `unstyled` removes PrimeReact's classes, `pt` adds our attributes. So a
 *   `pt` that emits nothing but `data-table-part` attributes can be applied
 *   ALWAYS — styled and unstyled alike — and one selector then works in both
 *   modes. That is what let the two halves be migrated independently.
 *
 * These are a CONTRACT with e2e/pages/SmartTablePage.js. Renaming a value here
 * breaks the suite; grep `data-table-part` before touching one.
 *
 * Styling belongs in dataTablePreset.js. Keep this file attributes-only — a
 * className here would silently apply in styled mode too and fight lara.
 */

const part = (name) => ({ 'data-table-part': name });

export const dataTableHooks = {
  root: part('root'),
  wrapper: part('wrapper'),
  table: part('table'),
  thead: part('head'),
  tbody: part('body'),
  tfoot: part('foot'),

  /* `row` marks REAL data rows only. PrimeReact renders the empty-message row
     and the row-expansion row through their own sections, so neither picks this
     up — which is what replaces the old
     `tr:not(.p-datatable-row-expansion):not(.p-datatable-emptymessage)`
     with a plain `tr[data-table-part="row"]`. */
  bodyRow: part('row'),
  emptyMessage: part('empty'),
  rowExpansion: part('row-expansion'),
  loadingOverlay: part('loading'),

  rowGroupHeader: part('row-group-header'),
  rowGroupToggler: part('row-group-toggler'),

  paginator: {
    root: part('paginator'),
    current: part('paginator-current'),
    firstPageButton: part('paginator-first'),
    prevPageButton: part('paginator-prev'),
    nextPageButton: part('paginator-next'),
    lastPageButton: part('paginator-last'),
    pageButton: part('paginator-page'),
    RPPDropdown: { root: part('paginator-rpp') },
  },

  column: {
    /* `headerTitle` is the span PrimeReact used to class `.p-column-title`.
       Group header cells render a title span too, which is why the header-grid
       walk in SmartTablePage keys off cell position rather than title presence
       alone. */
    headerTitle: part('column-title'),
    headerContent: part('header-content'),
    columnFilter: part('column-filter'),
    sortIcon: part('sort-icon'),
    sortBadge: part('sort-badge'),

    /* `data-frozen` replaces `.p-frozen-column`. It is emitted as a real
       boolean-ish attribute rather than only when true, so a selector can
       assert either state instead of only presence. */
    headerCell: ({ props, context }) => ({
      'data-table-part': 'header-cell',
      'data-frozen': String(Boolean(props?.frozen || context?.frozen)),
    }),
    bodyCell: ({ props, context }) => ({
      'data-table-part': 'body-cell',
      'data-frozen': String(Boolean(props?.frozen || context?.frozen)),
    }),
    footerCell: part('footer-cell'),

    rowToggler: part('row-toggler'),

    /* Selection controls. PrimeReact renders BOTH the header and the row
       checkbox box under `data-pc-section="box"`, so that internal attribute
       cannot tell them apart — hence our own. */
    headerCheckbox: { box: part('header-checkbox') },
    rowCheckbox: { box: part('row-checkbox') },
    rowRadioButton: { box: part('row-radio') },
  },
};

export default dataTableHooks;
