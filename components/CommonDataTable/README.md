# CommonDataTable

Every feature of the Elbrit data table, with no provider above it. Hand it an array and it
works anywhere.

## Why this exists alongside the other table

`share/src/app/datatable/components/DataTableNew.jsx` is a pure view: it takes four props and
reads ~90 values out of `useTableOperations()`, which throws outright without a
`DataProviderNew` above it. That's right for the reporting stack and wrong everywhere else.

| | `DataTableNew` (share) | `CommonDataTable` (here) |
| --- | --- | --- |
| Data | from the provider's pipeline | from the `data` prop |
| Needs a provider | yes — throws without one | no |
| Owns fetching / GraphQL / presets | yes | no, you bring the rows |
| Report pivots, write-back | yes | no |
| Usable in any tree | no | yes |

**Nothing in this folder imports from `share/`.** Copy the folder into another app and it still
runs; its only dependencies are React, PrimeReact, lodash and `xlsx`.

## Quick start

```jsx
import CommonDataTable from '../components/CommonDataTable/CommonDataTable'

<CommonDataTable data={rows} title="Doctor performance" />
```

That alone gives typed columns, a filter row, global search, multi-sort, a column picker,
export, fullscreen and paging. Everything below narrows that default rather than building it up.

```jsx
// grouped, with totals and money shown in lakhs
<CommonDataTable
  data={rows}
  title="Secondary sales"
  columnLabels={{ hq: 'Headquarters' }}
  enableGrouping
  groupFields={['region', 'hq']}
  nonAggregatableColumns={['doctor_code']}
  enableSummation
  showUnitToggle
  lakhColumns={['target', 'sales']}
  redFields={['shortfall']}
  initialSortMeta={[{ field: 'sales', order: -1 }]}
/>
```

A live playground is at `/common-datatable-demo` ([pages/common-datatable-demo.jsx](../../pages/common-datatable-demo.jsx))
— grouping, editing, selection, empty and loading states, and a stripped-down table with no
toolbar.

## Pipeline

`useCommonTablePipeline` memoizes each stage separately, so typing in a filter never re-runs
type detection or rebuilds the dropdown options.

```
data → columns + types → filter + search → group → sort → paginate
                              │              │
                              │              └→ export (flattened back to leaf rows)
                              └→ footer totals
```

1. **Columns & types** — keys unioned across the first 50 rows, so a field missing from row 0
   still gets a column. Types from a 100-row sample.
2. **Filter & search** — column filters and the global box applied together, against leaf rows.
3. **Group** — only when `enableGrouping` + `groupFields` are set. After filtering, so
   aggregates reflect what's on screen.
4. **Sort** — applied to whatever the previous stage produced: group rows when grouped, leaf
   rows otherwise.
5. **Paginate** — a plain slice. The pager counts group rows when grouping is on, which is why
   the toolbar reports groups and rows separately.

## Numeric filter operators

Typed straight into the column's header input:

| Type | Means |
| --- | --- |
| `>100` | greater than 100 |
| `>=100` | 100 or more |
| `<100` | less than 100 |
| `<=100` | 100 or less |
| `=100` | exactly 100 |
| `10<>50` | between 10 and 50, inclusive — order doesn't matter |
| `21` | a bare number is a substring match, so it also finds 210 and 1,210 |
| anything else | falls back to a case-insensitive text match |

Text columns pick their own UI: a tick-list when the column has at most
`multiselectMaxOptions` distinct values (50 by default), a search box beyond that. Override
with `multiselectColumns` or `textFilterColumns`.

## How group cells aggregate

| Column | Group cell shows |
| --- | --- |
| number | the sum |
| text, ≥80% numeric | the sum — a numeric column detection read as text still totals |
| text, all distinct | `22 values` — a name column has no meaningful "most common" |
| text, repeating | `Cardiology × 10` plus a `+4 more` link opening the full tally |
| the group's own field | the group value, with its row count beside it |
| an outer group field | that value plainly — it's constant inside the group |
| a deeper group field | blank — not decided yet at this level |
| in `nonAggregatableColumns` | the first row's value, untouched |

## Props

### Data & columns

| Prop | Type | What it does |
| --- | --- | --- |
| `data` | `Object[]` | The rows. Required. Keys become columns. |
| `loading` | `boolean` | Shows the loading overlay. |
| `emptyMessage` | `string` | Default `No records found.` |
| `columns` | `string[]` | Which columns, in what order. Defaults to every key found. |
| `hiddenColumns` | `string[]` | Dropped entirely — not in the table, not in the picker. |
| `columnLabels` | `Object` | `{ field: 'Label' }`. Unlisted fields are title-cased. |
| `columnTypes` | `Object` | Force a type when detection guesses wrong. |
| `columnWidths` | `Object` | `{ field: '220px' }`. Others size from content. |
| `columnBodies` | `Object` | Per-column renderer: `(value, row, ctx) => node`. |
| `dataKey` | `string` | Unique row field. Only needed for selection. |

### Features

| Prop | Default | What it does |
| --- | --- | --- |
| `enableSort` | `true` | Sortable headers; shift-click for multi-sort. |
| `enableFilter` | `true` | The per-column filter row. |
| `enableGlobalSearch` | `true` | The toolbar search box. |
| `enableGrouping` | `false` | Turns `groupFields` on. |
| `groupFields` | `[]` | Fields to group by, outermost first. |
| `nonAggregatableColumns` | `[]` | Carry the first row's value instead of aggregating. |
| `enableSummation` | `false` | Footer totals over all filtered rows. |
| `enablePagination` | `true` | With `defaultRows` and `rowsPerPageOptions`. |
| `enableColumnVisibility` | `true` | The column picker. |
| `enableExport` | `true` | Export button; name the file with `exportFileName`. |
| `enableFreezeFirstColumn` | `true` | The lock button. |
| `enableFullscreen` | `true` | The expand button. |
| `enableCellEdit` | `false` | With `editableColumns`, edit cells in place. |
| `enableDivideBy1Lakh` | `false` | Start in lakhs; `showUnitToggle` adds a Units/Lakhs button. |
| `lakhColumns` | — | Scope the lakh scale to these columns. |
| `multiselectColumns` / `textFilterColumns` | — | Force a filter UI per column. |
| `multiselectMaxOptions` | `50` | Cardinality ceiling for automatic tick-lists. |
| `initialSortMeta` | `[]` | `[{ field, order }]` — order `1` asc, `-1` desc. |
| `selectionMode` | — | `single`, `multiple` or `checkbox`. |

### Styling & chrome

| Prop | Type | What it does |
| --- | --- | --- |
| `redFields` / `greenFields` | `string[]` | Colour those columns' values and totals. |
| `rowColumnStyles` | `Rule[]` | Computed styling — see below. |
| `scrollable` / `tableHeight` | `boolean` / `string` | Fixed header, scrolling body. Height adapts to the viewport when unset. |
| `size` | `small \| normal \| large` | Row density. Default `small`. |
| `showGridlines` / `stripedRows` | `boolean` | Both on by default. |
| `title` | `string` | Toolbar title; also the export sheet name. |
| `showToolbar` | `boolean` | Hide the whole toolbar row. |
| `toolbarActions` | `node` | Your own buttons at the right end of the toolbar. |
| `className` / `style` | `string` / `Object` | On the outer container. |

### Events

| Prop | Fires with |
| --- | --- |
| `onCellEditComplete` | `{ rowData, field, newValue, oldValue, originalEvent }` |
| `isCellEditable` | `(rowData, field) => boolean` — an extra per-cell gate |
| `onSelectionChange` | the selected row, or an array of rows |
| `onRowClick` | the clicked row; group rows are ignored |
| `onRefresh` | nothing — setting it adds a refresh button |

### `rowColumnStyles`

```jsx
rowColumnStyles={[
  { mode: 'cell', columns: ['sales'],
    compute: (value, row) => (value < row.target ? { color: '#dc2626' } : null) },
  { mode: 'row',
    compute: (row) => (row.active === false ? { opacity: 0.6 } : null) },
]}
```

Modes are `row` `(row, ctx)`, `column` `(columnData, ctx)` and `cell` `(value, row, ctx)`. When
two rules set the same property the higher `order` wins. A rule that throws is skipped, never
fatal.

## Watch out

- **Edits don't persist themselves.** The table never mutates `data`. Handle
  `onCellEditComplete`, save the change, and feed the new array back in. With no handler
  attached the edit is reverted rather than silently dropped.
- **Lakhs apply to every numeric column** unless you set `lakhColumns`. On a table mixing money
  with counts, a visit count of 10 becomes 0.0001.
- **Export is leaf rows.** A grouped table exports the underlying rows, not the aggregate
  strings, still narrowed by the active filters and sort. Booleans go out as Yes/No, dates as
  displayed, numbers as numbers.
- **Detection is a sample** — 100 rows, 70% thresholds for boolean and date, 80% for number. A
  column of nothing but 0 and 1 reads as a flag; mix in any other number and it reads as
  numeric. When it guesses wrong, `columnTypes` is the fix.

## Plasmic

Registered as **"Common DataTable"** in the root `plasmic-init.js`, alongside ApprovalCard and
the summary cards — deliberately not in `share/src/plasmic-init.js`, which registers the
provider-backed pair. It ships with sample rows, so it renders in Studio before you bind
anything. Props taking functions (`columnBodies`, `rowColumnStyles`, `isCellEditable`) are
easier to author in code.

## Files

```
components/CommonDataTable/
├─ CommonDataTable.jsx          the component
├─ CommonTableToolbar.jsx       search, columns, export, view toggles
├─ index.js                     barrel: component, hook, and every util
├─ filters/ColumnFilters.jsx    one input per column type
├─ hooks/useCommonTablePipeline.js
└─ utils/
   ├─ valueUtils.js             cell access, number formatting
   ├─ typeUtils.js              type detection, date display
   ├─ filterUtils.js            operators, predicates, options
   ├─ sortUtils.js              typed comparators, multi-sort
   ├─ groupUtils.js             grouping and aggregation
   ├─ exportUtils.js            XLSX / CSV
   └─ styleUtils.js             rowColumnStyles rules
```

The pipeline hook is exported on its own, for when you want the same filter/sort/group
semantics behind your own markup:

```js
import { useCommonTablePipeline, groupRows, exportRows } from '../components/CommonDataTable'
```
