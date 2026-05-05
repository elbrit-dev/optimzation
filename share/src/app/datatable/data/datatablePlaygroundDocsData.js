/**
 * Playground Docs tab: consumer-facing config + useTableOperations reference.
 * Config key order follows CONFIG_DISPLAY_ORDER with `slots` after selectedQueryKey.
 */

import { CONFIG_DISPLAY_ORDER, CONFIG_KEY_LABELS } from '../config/configReadableView';

/** @type {Record<string, { body: string, example?: string }>} */
export const CONFIG_DOCS_BY_KEY = {
  dataSource: {
    body: 'Saved GraphQL query id (from query registry) that supplies table data. Omit or use offline-only flows with offlineData.',
    example: `dataSource: 'my-query-id'`,
  },
  selectedQueryKey: {
    body: 'Which named operation/variant to run when the query document exposes multiple keys.',
    example: `selectedQueryKey: 'default'`,
  },
  slots: {
    body: 'Multi-slot mode: map of slotId → partial config (same shape as single-slot fields: groupFields, drawerTabs, filters, etc.). Each slot gets its own pipeline; use DataTableNew slotId and useTableOperations(slotId).',
    example: `slots: {
  sales: {
    name: 'By sales team',
    groupFields: ['sales_team', 'region'],
    drawerTabs: [{ id: 't1', name: 'Detail', outerGroup: 'sales_team', innerGroup: null, allowedColumns: ['qty', 'amount'] }],
    writeForm: { layout: {}, fields: {} },
  },
}`,
  },
  allowedColumns: {
    body: 'Restrict visible columns: flat string[], or scoped object { main, report, group, reportGroup, nested }.',
    example: `allowedColumns: ['item', 'qty', 'amount']
// or
allowedColumns: {
  main: ['item', 'qty'],
  group: { warehouse: ['warehouse', 'qty'] },
}`,
  },
  textFilterColumns: {
    body: 'Columns that use free-text filter UI instead of multiselect.',
    example: `textFilterColumns: ['item_name', 'notes']`,
  },
  groupFields: {
    body: 'Ordered list of fields for hierarchical grouping (replaces legacy outer/inner when set).',
    example: `groupFields: ['region', 'product_line']`,
  },
  enableSort: {
    body: 'Allow column sort in the grid.',
    example: `enableSort: true`,
  },
  enableFilter: {
    body: 'Allow column filters / filter sidebar.',
    example: `enableFilter: true`,
  },
  enableSummation: {
    body: 'Show footer summaries where configured.',
    example: `enableSummation: true`,
  },
  enableCellEdit: {
    body: 'Allow inline cell editing when the query enables write and column is editable.',
    example: `enableCellEdit: true`,
  },
  writeForm: {
    body: 'Drawer write UI: layout (grid areas) + fields (doc column → editor metadata). Often paired with query enableWrite.',
    example: `writeForm: {
  layout: { areas: [['name', 'name'], ['qty', 'price']] },
  fields: {
    name: { columnName: 'name', label: 'Name' },
    qty: { columnName: 'qty', columnType: 'number' },
  },
}`,
  },
  writePermissions: {
    body: 'Fine-grained create/update/delete flags for write flows.',
    example: `writePermissions: { create: true, update: true, delete: false }`,
  },
  enableDivideBy1Lakh: {
    body: 'Display large numbers divided by 100,000.',
    example: `enableDivideBy1Lakh: true`,
  },
  useOrchestrationLayer: {
    body: 'Use DataProviderNew pipeline when using the compatibility DataProvider wrapper.',
    example: `useOrchestrationLayer: true`,
  },
  rowsPerPageOptions: {
    body: 'Paginator size choices.',
    example: `rowsPerPageOptions: [10, 25, 50, 100]`,
  },
  defaultRows: {
    body: 'Initial page size.',
    example: `defaultRows: 25`,
  },
  tableHeight: {
    body: 'Fixed/scrolling viewport height for the table (CSS value or number as needed by DataTableNew).',
    example: `tableHeight: '60vh'`,
  },
  percentageColumns: {
    body: 'Computed % columns: targetField, valueField, optional columnName.',
    example: `percentageColumns: [
  { columnName: 'margin_pct', targetField: 'profit', valueField: 'revenue' },
]`,
  },
  derivedColumns: {
    body: 'Virtual columns from compute(row, ctx); optional scope, columnType, aggregate.',
    example: `derivedColumns: [
  {
    columnName: 'line_total',
    columnType: 'number',
    save: false,
    compute: (row) => (Number(row.qty) || 0) * (Number(row.price) || 0),
    scope: { main: true },
  },
]`,
  },
  nonEditableColumns: {
    body: 'Column names blocked from inline edit even when enableCellEdit is true.',
    example: `nonEditableColumns: ['id', 'created_at']`,
  },
  redFields: {
    body: 'Numeric columns styled as negative/highlight red when applicable.',
    example: `redFields: ['loss', 'variance']`,
  },
  greenFields: {
    body: 'Numeric columns styled positive/highlight green when applicable.',
    example: `greenFields: ['profit', 'growth']`,
  },
  rowColumnStyles: {
    body: 'Conditional row/cell classes or styles by field values (structure matches rowColumnStylesUtils expectations).',
    example: `rowColumnStyles: [
  { field: 'status', value: 'HOLD', className: 'bg-amber-50' },
]`,
  },
  outerGroupField: {
    body: 'Legacy single outer group field (prefer groupFields for multiple levels).',
    example: `outerGroupField: 'region'`,
  },
  innerGroupField: {
    body: 'Legacy inner group field under outerGroupField.',
    example: `innerGroupField: 'sku'`,
  },
  drawerTabs: {
    body: 'Tabs in the group drawer: outerGroup/innerGroup keys, allowedColumns per tab, optional isJsonTable for nested JSON tables.',
    example: `drawerTabs: [
  { id: 'tab-1', name: 'By SKU', outerGroup: 'region', innerGroup: 'sku', allowedColumns: ['sku', 'qty'] },
]`,
  },
  enableReport: {
    body: 'Enable report/breakdown pipeline and related UI.',
    example: `enableReport: true`,
  },
  dateColumn: {
    body: 'Column used as the time axis for breakdowns/charts.',
    example: `dateColumn: 'month__start'`,
  },
  showChart: {
    body: 'Show chart wrapper above the table when report data supports it.',
    example: `showChart: true`,
  },
  breakdownType: {
    body: 'Granularity when breakdown is on: month | week | day | quarter | annual.',
    example: `breakdownType: 'month'`,
  },
  columnGroupBy: {
    body: 'Report grouping mode: values | date column name | period-over-period.',
    example: `columnGroupBy: 'values'`,
  },
  columnsExemptFromBreakdown: {
    body: 'Column names kept as single columns in breakdown views.',
    example: `columnsExemptFromBreakdown: ['item', 'sku']`,
  },
  chartColumns: {
    body: 'Which series/columns feed the line chart.',
    example: `chartColumns: ['qty', 'revenue']`,
  },
  chartHeight: {
    body: 'Chart height (px or CSS).',
    example: `chartHeight: 240`,
  },
  isAdminMode: {
    body: 'Enables admin-only behaviors in the provider/table when true.',
    example: `isAdminMode: false`,
  },
  salesTeamColumn: {
    body: 'Column name for sales-team scoped filtering (legacy/report helpers).',
    example: `salesTeamColumn: 'sales_team'`,
  },
  salesTeamValues: {
    body: 'Allowed sales team values when restricting rows.',
    example: `salesTeamValues: ['East', 'West']`,
  },
  hqColumn: {
    body: 'HQ column for scoped filtering helpers.',
    example: `hqColumn: 'hq'`,
  },
  hqValues: {
    body: 'Allowed HQ values when restricting rows.',
    example: `hqValues: ['HQ1']`,
  },
  columnTypesOverride: {
    body: 'Force column types and nested JSON shapes for grid/editors (grid typing, object keys, nested tables).',
    example: `columnTypesOverride: {
  'meta__json': { type: 'object', keys: { note: 'string', score: 'number' } },
}`,
  },
};

const DOCS_CONFIG_PRIMARY_ORDER = [
  'dataSource',
  'selectedQueryKey',
  'slots',
  ...CONFIG_DISPLAY_ORDER.filter((k) => k !== 'dataSource' && k !== 'selectedQueryKey'),
];
const _seenPrimary = new Set(DOCS_CONFIG_PRIMARY_ORDER);
const DOCS_CONFIG_EXTRA_KEYS = Object.keys(CONFIG_DOCS_BY_KEY).filter((k) => !_seenPrimary.has(k)).sort();
/** Config keys in Docs order; appends documented keys not listed in CONFIG_DISPLAY_ORDER (e.g. some presets). */
export const DOCS_CONFIG_KEY_ORDER = [...DOCS_CONFIG_PRIMARY_ORDER, ...DOCS_CONFIG_EXTRA_KEYS];

/** useTableOperations / table context — grouped, importance within group. */
export const CONTEXT_DOC_SECTIONS = [
  {
    id: 'setup',
    title: 'Setup and data pipeline',
    order: 1,
    blocks: [
      {
        title: 'Hook and multi-slot',
        body: 'Call useTableOperations() inside DataProvider. Pass slotId when using slots: useTableOperations(\'mySlot\'). Context value is { main: {...} } or { slotA: {...}, slotB: {...} }.',
        example: `import { useTableOperations } from '@/app/datatable/contexts/TableOperationsContext';

const ops = useTableOperations('main');
// const ops = useTableOperations(); // default slot from DataSlot context`,
      },
      {
        title: 'Row arrays',
        body: 'filteredData → sortedData → rawData (editing buffer) / paginatedData. rawData reflects the main table editing state when applicable.',
        example: `const { filteredData, sortedData, paginatedData, rawData } = useTableOperations();`,
      },
      {
        title: 'Columns and types',
        body: 'columns, columnTypes, filterOptions, multiselectColumns, jsonObjectColumns, columnTypesOverride.',
        example: `const { columns, columnTypes, filterOptions } = useTableOperations();`,
      },
      {
        title: 'Loading',
        body: 'isLoading aggregates report compute, filter/sort apply, and offline group compute. loadingText describes the phase.',
        example: `const { isLoading, loadingText } = useTableOperations();`,
      },
      {
        title: 'Grouping and report',
        body: 'effectiveGroupFields, groupedData, enableReport, enableBreakdown, reportData, isComputingReport, columnGroupBy, chartColumns, chartHeight.',
        example: `const { groupedData, enableReport, reportData } = useTableOperations();`,
      },
      {
        title: 'Flags from config',
        body: 'enableSort, enableFilter, enableSummation, enableGrouping, textFilterColumns, redFields, greenFields, rowColumnStyles, enableDivideBy1Lakh, percentageColumns, derivedColumns, allowedColumns.',
        example: `const { enableFilter, enableSort, derivedColumns } = useTableOperations();`,
      },
    ],
  },
  {
    id: 'filters',
    title: 'Filters, sort, pagination, visibility',
    order: 2,
    blocks: [
      {
        title: 'Filter state and updates',
        body: 'filters object per column; updateFilter, clearFilter, clearAllFilters.',
        example: `const { filters, updateFilter, clearAllFilters } = useTableOperations();
updateFilter('region', { value: ['East'], matchMode: 'in' });`,
      },
      {
        title: 'Sort',
        body: 'sortMeta for PrimeReact-style multi-sort; updateSort. sortConfig / setSortConfig for client-save / server-style config.',
        example: `const { sortMeta, updateSort, sortConfig, setSortConfig } = useTableOperations();`,
      },
      {
        title: 'Pagination and expansion',
        body: 'pagination { first, rows }; updatePagination. expandedRows and updateExpandedRows for grouped rows.',
        example: `const { pagination, updatePagination, expandedRows } = useTableOperations();`,
      },
      {
        title: 'Visible columns',
        body: 'visibleColumns and updateVisibleColumns for column picker state.',
        example: `const { visibleColumns, updateVisibleColumns } = useTableOperations();`,
      },
      {
        title: 'Search (client-save queries)',
        body: 'searchTerm, setSearchTerm, searchFields, sortFields, clientSave when the query document enables client save.',
        example: `const { searchTerm, setSearchTerm, clientSave } = useTableOperations();`,
      },
      {
        title: 'Sums',
        body: 'sums (computed object) and getSums(data?, filters?) for custom aggregates.',
        example: `const { sums, getSums } = useTableOperations();`,
      },
      {
        title: 'Percentage helpers',
        body: 'hasPercentageColumns, isPercentageColumn, getPercentageColumnValue, getPercentageColumnSortFunction, percentageColumnNames.',
        example: `const { isPercentageColumn, getPercentageColumnValue } = useTableOperations();`,
      },
      {
        title: 'Numeric/date filter helpers',
        body: 'parseNumericFilter, applyNumericFilter, applyDateFilter, isNumericValue for custom filter UIs.',
        example: `const { applyNumericFilter, isNumericValue } = useTableOperations();`,
      },
    ],
  },
  {
    id: 'drawer',
    title: 'Drawer (group / detail sidebar)',
    order: 3,
    blocks: [
      {
        title: 'State',
        body: 'drawerVisible, drawerData, drawerTabs, activeDrawerTabIndex, clickedDrawerValues.',
        example: `const { drawerVisible, drawerData, drawerTabs } = useTableOperations();`,
      },
      {
        title: 'openDrawer (unified)',
        body: 'Two variants. (1) Pass a row array as the first argument: openDrawer(data, filters, title?, tableOptions?) — filters are applied to that data (object: field name → array of values, Prime-style). (2) Pass filters as the first argument: openDrawer(filters, title?, tableOptions?) — uses current filteredData as the base. Sets drawer header title from title or from clicked group values. Optional tableOptions override drawer table config.',
        example: `const { openDrawer } = useTableOperations();

// Drill from current table data using group filters
openDrawer({ region: ['West'], sku: ['A1'] });

// Show specific rows, optionally filtered
openDrawer(rows, { region: ['West'] }, 'My title');`,
      },
      {
        title: 'openDrawerWithData',
        body: 'Legacy helper: openDrawerWithData(data, outerValue?, innerValue?, title?). Passes data into openDrawer with no filters; title defaults from outer/inner values or a custom title.',
        example: `const { openDrawerWithData } = useTableOperations();
openDrawerWithData(matchingRows, 'West', null, 'West region rows');`,
      },
      {
        title: 'openDrawerForOuterGroup / openDrawerForInnerGroup',
        body: 'Group-cell shortcuts using effectiveGroupFields. openDrawerForOuterGroup(value) filters the first group field to value. openDrawerForInnerGroup(outerValue, innerValue) sets the first two group fields. No-op if not enough group fields.',
        example: `const {
  openDrawerForOuterGroup,
  openDrawerForInnerGroup,
} = useTableOperations();

openDrawerForOuterGroup('North');
openDrawerForInnerGroup('North', 'SKU-12');`,
      },
      {
        title: 'openDrawerWithJsonTables',
        body: 'Opens the drawer for nested JSON tables: openDrawerWithJsonTables(nestedTables, rowData, tableOptions?). nestedTables is an array of { fieldName, title?, data } (from row.__nestedTables__). Builds dynamic JSON tabs (isJsonTable), initializes nested editing buffers, then opens with the first table’s rows. Requires update permission when enableWrite is on.',
        example: `const { openDrawerWithJsonTables } = useTableOperations();

openDrawerWithJsonTables(
  row.__nestedTables__,
  row,
  { /* optional tableOptions */ },
);`,
      },
      {
        title: 'openDrawerForRow',
        body: 'Opens the drawer for one main row in write flows: openDrawerForRow(rowData, tableOptions?). If the row has __nestedTables__, delegates to openDrawerWithJsonTables. Otherwise opens scalar writeForm with that row (drawerTabsOverride []). No-op if neither nested nor scalar form is configured. Blocked when update is not allowed.',
        example: `const { openDrawerForRow } = useTableOperations();

// e.g. row action / double-click
openDrawerForRow(row);`,
      },
      {
        title: 'openDrawerForNewRow',
        body: 'Opens an empty “New Row” drawer: openDrawerForNewRow(). Builds empty scalar fields, optional nested table shells from jsonTableColumns, and requires create permission. Warns if there is no writeForm / nested schema to edit.',
        example: `const { openDrawerForNewRow } = useTableOperations();

<button type="button" onClick={() => openDrawerForNewRow()}>Add row</button>`,
      },
      {
        title: 'Close and tabs',
        body: 'closeDrawer; addDrawerTab, removeDrawerTab, updateDrawerTab, setActiveDrawerTabIndex for dynamic tabs.',
        example: `const { closeDrawer, setActiveDrawerTabIndex } = useTableOperations();`,
      },
      {
        title: 'Selection',
        body: 'selectedRowData and setSelectedRowData (syncs with form when applicable).',
        example: `const { selectedRowData, setSelectedRowData } = useTableOperations();`,
      },
    ],
  },
  {
    id: 'write',
    title: 'Write, nested tables, save',
    order: 4,
    blocks: [
      {
        title: 'Flags and permissions',
        body: 'enableWrite (from query or force in nested drawer), writePermissions, enableCellEdit.',
        example: `const { enableWrite, writePermissions, handleMainSave } = useTableOperations();`,
      },
      {
        title: 'Main table buffer',
        body: 'updateMainTableEditingData; hasMainTableChanges; handleMainSave, handleMainCancel.',
        example: `const { updateMainTableEditingData, hasMainTableChanges, handleMainCancel } = useTableOperations();`,
      },
      {
        title: 'Drawer save',
        body: 'handleDrawerSave, handleDrawerCancel, hasDrawerChanges.',
        example: `const { handleDrawerSave, hasDrawerChanges } = useTableOperations();`,
      },
      {
        title: 'Nested JSON tables',
        body: 'handleAddNestedRowAtZero (or parent override); updateCurrentNestedTableData; getChangedRowsForTab, getAllChangedNestedTableRows. parentColumnName, nestedTableFieldName, nestedTableTabId in nested context.',
        example: `const { getAllChangedNestedTableRows, handleAddNestedRowAtZero } = useTableOperations();`,
      },
    ],
  },
  {
    id: 'export',
    title: 'Export and display helpers',
    order: 5,
    blocks: [
      {
        title: 'Excel export',
        body: 'exportToXLSX() uses current report/main data and grouping settings.',
        example: `const { exportToXLSX } = useTableOperations();
exportToXLSX();`,
      },
      {
        title: 'formatDateValue, formatHeaderName, isTruthyBoolean',
        body: 'Shared formatters used by table and custom cells.',
        example: `const { formatDateValue, formatHeaderName } = useTableOperations();`,
      },
    ],
  },
  {
    id: 'provider',
    title: 'Provider and query meta',
    order: 6,
    blocks: [
      {
        title: 'Query execution',
        body: 'dataSource, selectedQueryKey, executingQuery, availableQueryKeys, resolvedConfig (merged config in use).',
        example: `const { dataSource, resolvedConfig, executingQuery } = useTableOperations();`,
      },
      {
        title: 'Table chrome',
        body: 'rowsPerPageOptions, defaultRows, tableHeight, scrollable, enableFullscreenDialog.',
        example: `const { rowsPerPageOptions, defaultRows, tableHeight } = useTableOperations();`,
      },
    ],
  },
];

export function getConfigDocTitle(key) {
  return CONFIG_KEY_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}
