# CommonDataTable

A simple table that needs no provider above it. Bind an array to `data` and it works
anywhere.

Deliberately small — **grouping, filtering, sorting, totals and export**. Nothing else. If
you need cell editing, selection, pagination or report pivots, use the provider-backed
`DataTableNew` in `share/src/app/datatable` instead.

## Why this exists alongside the other table

`share/src/app/datatable/components/DataTableNew.jsx` is a pure view: it takes four props and
reads ~90 values out of `useTableOperations()`, which throws outright without a
`DataProviderNew` above it.

| | `DataTableNew` (share) | `CommonDataTable` (here) |
| --- | --- | --- |
| Data | from the provider's pipeline | from the `data` prop |
| Needs a provider | yes — throws without one | no |
| Fetching / GraphQL / presets | yes | no, you bring the rows |
| Editing, selection, pivots | yes | no |
| Usable in any tree | no | yes |

**Nothing in this folder imports from `share/`.** Copy the folder into another app and it still
runs; its only dependencies are React, PrimeReact, lodash and `xlsx`.

## Quick start

```jsx
import CommonDataTable from '../components/CommonDataTable/CommonDataTable'

<CommonDataTable data={rows} title="Doctor performance" />
```

```jsx
// drill down: region → HQ → the records
<CommonDataTable
  data={rows}
  title="Secondary sales"
  columnLabels={{ hq: 'Headquarters' }}
  groupFields={['region', 'hq']}
  enableSummation
  initialSort={{ field: 'sales', order: -1 }}
/>
```

A playground is at `/common-datatable-demo`
([pages/common-datatable-demo.jsx](../../pages/common-datatable-demo.jsx)).

## Grouping is a drill-down

Each group is a row with an expander. Opening it reveals **the next level as its own table** —
its own header row, its own filter row, its own sort, its own totals.

```
    Region ↑↓        Visits ↑↓      Target ↑↓       Sales ↑↓
    [Search…   ]     [<, >, =]      [<, >, =]       [<, >, =]
 ⌄  North (35)            372      5,750,777       5,537,127
    ┌──────────────────────────────────────────────────────────┐
    │   Headquarters ↑↓   Visits ↑↓   Target ↑↓     Sales ↑↓   │
    │   [Search…      ]   [<, >, =]   [<, >, =]     [<, >, =]  │
    │ ⌄ Delhi (15)             105   2,675,770    2,291,298    │
    │   ┌────────────────────────────────────────────────────┐ │
    │   │ Doctor        Code       Visits   Target    Sales  │ │
    │   │ Dr. Anand 1   DOC-1000       10  215,082  122,873  │ │
    │   └────────────────────────────────────────────────────┘ │
    └──────────────────────────────────────────────────────────┘
    Total                  1,339     17,800,733    17,433,073
```

**Each level shows only the columns it can fill.** A group level shows its own dimension plus
the numeric totals; the deepest level shows the records with their own columns. `Doctor` and
`Code` never appear on a region row, and `Region` never repeats on a doctor row — so there are
no blank cells anywhere.

**Filtering and sorting are local.** Filter the HQ table inside North and only that table
narrows; its totals follow, and every other region is untouched. `Expand all` in the header
bar opens the outermost level.

## Data that arrives already grouped

`groupFields` groups a flat array. When the grouping is already in the data — each row carrying
its own rows in an array field — name that field with `childField` instead:

```js
[
  { warehouse: 'Chennai', total_qty: 7219, batch_count: 3, batches: [
      { item_name: 'ROZULA CV 10', batch_no: 'RZ2401', qty: 2362, manufacturing_date: '2025-03' },
      { item_name: 'BRITVIT',      batch_no: 'BV2312', qty: 3916, manufacturing_date: '2025-01' },
  ]},
]
```

```jsx
<CommonDataTable
  data={stock}
  childField="batches"
  columnTypes={{ manufacturing_date: 'string', expiry_date: 'string' }}
  enableSummation
/>
```

The top level shows exactly the outer object's own fields — `Warehouse`, `Total qty`,
`Batches`. Expanding one shows exactly the child fields — `Item`, `Batch`, `Qty`, `Mfg`,
`Expiry`. Nothing is copied between levels; set `parentFields={['warehouse']}` if you do want
the parent's identity repeated on every child row and in the export.

Nests to any depth: a child carrying its own `childField` array becomes an expandable row in
turn. `childField` and `groupFields` are alternatives — set `childField` and `groupFields` is
ignored.

## Filter inputs

Under each header:

| Column type | Input | Accepts |
| --- | --- | --- |
| number | operator box | `>100` `>=100` `<100` `<=100` `=100` `10<>50` (range). A bare `21` is a substring match, so it also finds 210 and 1,210. |
| anything else | search box | case-insensitive "contains" |

`Esc` clears a box. Filtering a group level matches against the totals that level displays.

## Props

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `data` | `Object[]` | — | The rows. Required. Keys become columns. |
| `title` | `string` | — | Shown in the header bar; also the export sheet name. |
| `loading` | `boolean` | `false` | Shows the loading overlay. |
| `emptyMessage` | `string` | `No records found.` | Shown when there are no rows. |
| `columns` | `string[]` | every key found | Which columns, in what order — applied at every level. |
| `hiddenColumns` | `string[]` | `[]` | Columns dropped entirely. |
| `columnLabels` | `Object` | — | `{ field: 'Label' }`. Unlisted fields are title-cased. |
| `columnTypes` | `Object` | detected | Force a type: `'number' \| 'date' \| 'boolean' \| 'string'`. |
| `columnWidths` | `Object` | from content | `{ field: '220px' }`. All columns stay drag-resizable. |
| `groupFields` | `string[]` | `[]` | Drill-down levels for a flat array, outermost first. |
| `childField` | `string` | — | For already-nested data: the field holding each row's child rows. Overrides `groupFields`. |
| `parentFields` | `string[]` | `[]` | Parent fields to repeat on child rows. |
| `enableFilter` | `boolean` | `true` | The filter row under the headers, on every level. |
| `enableSort` | `boolean` | `true` | Click a header: ascending → descending → off. |
| `initialSort` | `Object` | — | `{ field: 'sales', order: -1 }` — order `1` asc, `-1` desc. Outermost level only. |
| `enableSummation` | `boolean` | `false` | Footer row totalling the numeric columns, on every level. |
| `enableExport` | `boolean` | `true` | The Export button. |
| `exportFileName` | `string` | `table-export` | Without the extension. |
| `scrollable` | `boolean` | `true` | Fixed header, scrolling body — outermost level only. |
| `tableHeight` | `string` | `520px` | Body height when scrollable. |
| `size` | `small \| normal \| large` | `small` | Row density. |
| `showGridlines` | `boolean` | `true` | Cell borders. |
| `stripedRows` | `boolean` | `true` | Alternating row background. |
| `className` / `style` | `string` / `Object` | — | On the outer container. |

## Watch out

- **No pagination.** Every row renders. Fine for hundreds; for tens of thousands, narrow the
  data before handing it over. Grouping helps — only expanded levels render.
- **Export is the records, always all of them.** Group rows are totals, not records, so they
  are dropped; per-level filters narrow the view, not the file. Booleans go out as Yes/No,
  dates as displayed, numbers as numbers.
- **Type detection is a sample** — 100 rows, with 70% thresholds for boolean and date and 80%
  for number. A column of nothing but 0 and 1 reads as a flag; mix in any other number and it
  reads as numeric. When it guesses wrong, `columnTypes` is the fix.
- **Sorting is one column at a time,** per level, and blank cells always sink to the bottom in
  both directions.
- **A group level shows only numeric columns** besides its own dimension, because those are the
  only ones a group can total. A text column you need at group level belongs in `groupFields`.

## Plasmic

Registered as **"Common DataTable"** in the root `plasmic-init.js`, alongside ApprovalCard and
the summary cards — deliberately not in `share/src/plasmic-init.js`, which registers the
provider-backed pair. It ships with sample rows, so it renders in Studio before you bind
anything.

## Files

```
components/CommonDataTable/
├─ CommonDataTable.jsx               header bar + the outermost level
├─ GroupTable.jsx                    one level, and every level below it
├─ index.js                          barrel: components, hook, and the utils
├─ filters/ColumnFilterInput.jsx     the debounced input under a header
├─ hooks/useCommonTablePipeline.js   columns, types, and the drill-down tree
└─ utils/
   ├─ valueUtils.js                  cell access, number formatting
   ├─ typeUtils.js                   type detection, date display
   ├─ filterUtils.js                 operator parsing, row matching
   ├─ sortUtils.js                   typed comparator, sort cycle
   ├─ groupUtils.js                  the tree, and per-group totals
   └─ exportUtils.js                 XLSX / CSV
```

The pipeline hook is exported on its own, for when you want the same grouping semantics behind
your own markup:

```js
import { useCommonTablePipeline, groupRows, exportRows } from '../components/CommonDataTable'
```
