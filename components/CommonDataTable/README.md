# CommonDataTable

A simple table that needs no provider above it. Bind an array to `data` and it works
anywhere.

Deliberately small — **grouping, sorting, totals and export**. Nothing else. If you need
filtering, cell editing, selection or report pivots, use the provider-backed
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
| Filtering, editing, selection, pivots | yes | no |
| Usable in any tree | no | yes |

**Nothing in this folder imports from `share/`.** Copy the folder into another app and it still
runs; its only dependencies are React, PrimeReact, lodash and `xlsx`.

## Quick start

```jsx
import CommonDataTable from '../components/CommonDataTable/CommonDataTable'

<CommonDataTable data={rows} title="Doctor performance" />
```

```jsx
// grouped, with totals
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

## What grouping looks like

Set `groupFields` and each group gets a header row carrying its name, its row count and the
total of every numeric column — with that group's rows listed directly beneath it. It reads
as one continuous table: no expand arrows, no nested tables.

```
Region    Doctor         Code       HQ        Visits     Target      Sales
South (22)                                       223  3,629,219  3,408,242   ← group header
South     Dr. Chitra 43  DOC-1042   Madurai        1    110,910     55,611
South     Dr. Farhan 54  DOC-1053   Madurai       20    106,620     89,149
West (30)                                        306  3,644,484  3,463,212   ← group header
West      Dr. Elena 5    DOC-1004   Mumbai        18    241,000    265,400
…
Total                                          1,339 17,800,733 17,433,073   ← enableSummation
```

Pass more than one field — `['region', 'hq']` — and you get a second tier of header rows,
indented under the first. Still one flat table.

Groups **close and open**: every header carries a chevron, clicking anywhere on the header
row toggles it, and a **Close all / Open all** button sits in the header bar. Closing an
outer group takes its inner headers with it. Set `initiallyCollapsed` to open on group
totals alone, or `collapsibleGroups={false}` for a table that stays fully expanded.

Collapsing only hides rows — **totals and export always cover every row**, whatever is open.

A group header row only claims what a group actually has:

| Column | Group header shows |
| --- | --- |
| number | the sum |
| text that is ≥80% numeric | the sum — a numeric column detection read as text still totals |
| any other text or date | **blank** |
| the group's own field | the group value, with its row count beside it |
| an outer group field | that value plainly — it's constant inside the group |
| a deeper group field | blank — not decided yet at this level |

## Data that arrives already grouped

`groupFields` groups a flat array. When the grouping is already in the data — each row
carrying its own rows in an array field — name that field with `childField` instead:

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

```
Warehouse   Total qty  Batches  Item           Batch    Qty     Mfg
Chennai (3)     7,219        3                         7,219            ← the parent object
Chennai                              ROZULA CV 10  RZ2401  2,362  2025-03
Chennai                              BRITVIT       BV2312  3,916  2025-01
Kolkata (2)     4,180        2                         4,180            ← the parent object
Kolkata                              ROZULA ASP 10 RA2409  1,265  2024-09
Total          11,399        5                        11,399
```

- **Columns** are the parent's fields followed by the children's.
- **The parent keeps its own aggregates** (`total_qty`, `batch_count`), and any numeric column
  it doesn't define is summed from its children — that's the `7,219` under Qty.
- **`warehouse` is copied onto each child row** so every row says where it belongs and the
  export is self-contained. `total_qty` and `batch_count` are not, since repeating an
  aggregate on every row reads as a per-row value. The rule is *non-numeric parent fields
  carry down*; override it with `parentFields={['warehouse']}`.
- **Sorting works on the computed totals** — sorting by Qty reorders the warehouses.
- **Groups close and open** here too, same as with `groupFields`.
- **Nests to any depth**: a child holding its own `childField` array becomes a header in turn.
- `childField` and `groupFields` are alternatives. Set `childField` and `groupFields` is
  ignored.

## Props

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `data` | `Object[]` | — | The rows. Required. Keys become columns. |
| `title` | `string` | — | Shown in the header bar; also the export sheet name. |
| `loading` | `boolean` | `false` | Shows the loading overlay. |
| `emptyMessage` | `string` | `No records found.` | Shown when there are no rows. |
| `columns` | `string[]` | every key found | Which columns, in what order. |
| `hiddenColumns` | `string[]` | `[]` | Columns dropped entirely. |
| `columnLabels` | `Object` | — | `{ field: 'Label' }`. Unlisted fields are title-cased. |
| `columnTypes` | `Object` | detected | Force a type: `'number' \| 'date' \| 'boolean' \| 'string'`. |
| `columnWidths` | `Object` | from content | `{ field: '220px' }`. All columns stay drag-resizable. |
| `groupFields` | `string[]` | `[]` | Group a flat array by these, outermost first. Empty = flat table. |
| `childField` | `string` | — | For already-nested data: the field holding each row's child rows. Overrides `groupFields`. |
| `parentFields` | `string[]` | non-numeric | Which parent fields copy onto child rows. |
| `collapsibleGroups` | `boolean` | `true` | Group headers close and open. |
| `initiallyCollapsed` | `boolean` | `false` | Start with every group closed. |
| `enableSort` | `boolean` | `true` | Click a header: ascending → descending → off. |
| `initialSort` | `Object` | — | `{ field: 'sales', order: -1 }` — order `1` asc, `-1` desc. |
| `enableSummation` | `boolean` | `false` | Footer row totalling the numeric columns. |
| `enableExport` | `boolean` | `true` | The Export button. |
| `exportFileName` | `string` | `table-export` | Without the extension. |
| `scrollable` | `boolean` | `true` | Fixed header, scrolling body. |
| `tableHeight` | `string` | `520px` | Body height when scrollable. |
| `size` | `small \| normal \| large` | `small` | Row density. |
| `showGridlines` | `boolean` | `true` | Cell borders. |
| `stripedRows` | `boolean` | `true` | Alternating row background. |
| `className` / `style` | `string` / `Object` | — | On the outer container. |

## Watch out

- **No pagination.** Every row renders. That is fine for hundreds of rows; for tens of
  thousands, page or narrow the data before handing it over.
- **Export is the real rows.** Group header rows are totals, not records, so they are dropped
  from the file. Booleans go out as Yes/No, dates as displayed, numbers as numbers.
- **Type detection is a sample** — 100 rows, with 70% thresholds for boolean and date and 80%
  for number. A column of nothing but 0 and 1 reads as a flag; mix in any other number and it
  reads as numeric. When it guesses wrong, `columnTypes` is the fix.
- **Sorting is one column at a time,** and blank cells always sink to the bottom in both
  directions.

## Plasmic

Registered as **"Common DataTable"** in the root `plasmic-init.js`, alongside ApprovalCard and
the summary cards — deliberately not in `share/src/plasmic-init.js`, which registers the
provider-backed pair. It ships with sample rows, so it renders in Studio before you bind
anything.

## Files

```
components/CommonDataTable/
├─ CommonDataTable.jsx          the component (header bar included)
├─ index.js                     barrel: component, hook, and the utils
├─ hooks/useCommonTablePipeline.js   columns/types → sort → group → flatten
└─ utils/
   ├─ valueUtils.js             cell access, number formatting
   ├─ typeUtils.js              type detection, date display
   ├─ sortUtils.js              typed comparator, sort cycle
   ├─ groupUtils.js             grouping, per-group totals, nested-data expansion
   └─ exportUtils.js            XLSX / CSV
```

The pipeline hook is exported on its own, for when you want the same sort/group semantics
behind your own markup:

```js
import { useCommonTablePipeline, groupRows, exportRows } from '../components/CommonDataTable'
```
