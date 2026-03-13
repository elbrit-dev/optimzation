/**
 * Config read-only view utility.
 * Produces ordered config entries for human-readable display,
 * with dataSource and selectedQueryKey first.
 */

/** Display order: most important first. Keys not in this list appear at end. */
const DISPLAY_ORDER = [
  'dataSource',
  'selectedQueryKey',
  'allowedColumns',
  'textFilterColumns',
  'groupFields',
  'enableSort',
  'enableFilter',
  'enableSummation',
  'enableCellEdit',
  'enableDivideBy1Lakh',
  'useOrchestrationLayer',
  'rowsPerPageOptions',
  'defaultRows',
  'tableHeight',
  'editableColumns',
  'percentageColumns',
  'derivedColumns',
  'nonEditableColumns',
  'redFields',
  'greenFields',
  'rowColumnStyles',
  'outerGroupField',
  'innerGroupField',
  'drawerTabs',
  'enableReport',
  'dateColumn',
  'showChart',
  'breakdownType',
  'columnGroupBy',
  'columnsExemptFromBreakdown',
  'chartColumns',
  'chartHeight',
  'isAdminMode',
  'salesTeamColumn',
  'salesTeamValues',
  'hqColumn',
  'hqValues',
  'columnTypesOverride',
  'formInputOverride',
];

/** Human-readable labels for config keys */
const KEY_LABELS = {
  dataSource: 'Data Source',
  selectedQueryKey: 'Selected Query Key',
  allowedColumns: 'Allowed Columns',
  textFilterColumns: 'Text Filter Columns',
  groupFields: 'Group Fields',
  enableSort: 'Enable Sort',
  enableFilter: 'Enable Filter',
  enableSummation: 'Enable Summation',
  enableCellEdit: 'Enable Cell Edit',
  enableDivideBy1Lakh: 'Enable Divide by 1 Lakh',
  useOrchestrationLayer: 'Use Orchestration Layer',
  rowsPerPageOptions: 'Rows Per Page Options',
  defaultRows: 'Default Rows',
  tableHeight: 'Table Height',
  editableColumns: 'Editable Columns',
  percentageColumns: 'Percentage Columns',
  derivedColumns: 'Derived Columns',
  nonEditableColumns: 'Non-Editable Columns',
  redFields: 'Red Fields',
  greenFields: 'Green Fields',
  rowColumnStyles: 'Row/Column Styles',
  outerGroupField: 'Outer Group Field',
  innerGroupField: 'Inner Group Field',
  drawerTabs: 'Drawer Tabs',
  enableReport: 'Enable Report',
  dateColumn: 'Date Column',
  showChart: 'Show Chart',
  breakdownType: 'Breakdown Type',
  columnGroupBy: 'Column Group By',
  columnsExemptFromBreakdown: 'Columns Exempt From Breakdown',
  chartColumns: 'Chart Columns',
  chartHeight: 'Chart Height',
  isAdminMode: 'Admin Mode',
  salesTeamColumn: 'Sales Team Column',
  salesTeamValues: 'Sales Team Values',
  hqColumn: 'HQ Column',
  hqValues: 'HQ Values',
  columnTypesOverride: 'Column Type Overrides',
  formInputOverride: 'Form Input Override',
};

function formatKey(key) {
  return KEY_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

/**
 * Get ordered config entries for readable display.
 * @param {Object} config - Config object (from deserializeJsToConfig)
 * @returns {Array<{ key: string, label: string, value: * }>}
 */
export function getOrderedConfigEntries(config) {
  if (!config || typeof config !== 'object') return [];

  const ordered = new Set(DISPLAY_ORDER);
  const keys = Object.keys(config);
  const orderedKeys = [
    ...DISPLAY_ORDER.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !ordered.has(k)).sort(),
  ];

  return orderedKeys.map((key) => ({
    key,
    label: formatKey(key),
    value: config[key],
  }));
}

/**
 * Check if value is empty for display (skip or show placeholder).
 */
export function isEmptyValue(val) {
  if (val === null || val === undefined) return true;
  if (Array.isArray(val) && val.length === 0) return true;
  if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) return true;
  return false;
}
